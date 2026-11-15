#!/bin/bash
# shellcheck disable=SC2016 # GraphQL $variables stay literal
# Board and ticket chores in one call each (#1970), so agents run them instead of composing gh calls.
#   scripts/ticket.sh new <title> <area> [column] [body]        request ticket on the board; prints its number
#   scripts/ticket.sh bug <parent> <title> <area> <what happened> <fix> [fixed-pr]
#                                                               bug found while working on <parent>, linked as its sub-issue;
#                                                               with fixed-pr it is closed and set Done, else left in Backlog
#   scripts/ticket.sh design <parent> <title> <body>            Design: deliverable, linked, set to Design
#   scripts/ticket.sh move <n> <column>                         backlog next design dev qa stg prod done
#   scripts/ticket.sh child <parent> <child>
#   scripts/ticket.sh done <n> <pr>                             "Fixed in #pr.", close, Done
#   scripts/ticket.sh log start|end <n> [title]                 Cursor usage log row
# new and bug first list open issues that may be the same ticket (scripts/open-work.js dups, #2969), on stderr.
# In a terminal they ask before filing; without one (agents) they file anyway and name the candidates in the body.
#   --dry-run        (new, bug, design) print the duplicate check and the issue it would file; writes nothing
#   --no-dup-check   (new, bug) skip the check, once you have read the candidates and none is the same
# Issues go through REST; only board moves use GraphQL, via scripts/gh-budget.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
R=repos/kaanmuar/kaanmuar.github.io
P=PVT_kwDOFLbZIM4BokiS
F=PVTSSF_lADOFLbZIM4BokiSzhnEBTE
LOG="$HOME/Library/Application Support/Cursor/AgentStores/cursor_agent_stores/u452212433/files/cursor-usage/work-log.csv"

column() {
	case "$1" in
	backlog) echo 3f4ac4fe ;; next) echo dc8fb26d ;; design) echo a8250664 ;; dev) echo 698df321 ;;
	qa) echo 71ce1b86 ;; stg) echo 727e0727 ;; prod) echo 060490af ;; done) echo bebf6b88 ;;
	*)
		echo "unknown column: $1" >&2
		exit 1
		;;
	esac
}

board() { # <n> <column>
	local item="" node try
	node=$(gh api $R/issues/"$1" -q .node_id)
	for try in 1 2 3; do
		item=$(scripts/gh-budget.sh api graphql -f query='mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}' \
			-f p=$P -f c="$node" -q .data.addProjectV2ItemById.item.id 2>/dev/null || true)
		# An error response, such as "Content already exists" for an auto-added issue, also lands on stdout (#2032).
		[[ $item == PVTI_* ]] || item=$(scripts/gh-budget.sh --item "$1" 2>/dev/null || true)
		[[ $item == PVTI_* ]] && break
		item=""
		sleep $((try * 3))
	done
	[ -z "$item" ] && {
		echo "#$1: could not add it to the board" >&2
		return 1
	}
	scripts/gh-budget.sh project item-edit --id "$item" --project-id $P --field-id $F --single-select-option-id "$(column "$2")" >/dev/null
}

child() { gh api $R/issues/"$1"/sub_issues -F sub_issue_id="$(gh api $R/issues/"$2" -q .id)" >/dev/null; }

close() { # <n> <pr>
	gh api $R/issues/"$1"/comments -f body="Fixed in #$2." >/dev/null
	gh api -X PATCH $R/issues/"$1" -f state=closed -f state_reason=completed >/dev/null
	board "$1" "done"
}

area_name() { case "$1" in be) echo BE ;; fe) echo FE ;; ui) echo UI ;; qa) echo QA ;; ci) echo CI ;; *) echo "$(tr '[:lower:]' '[:upper:]' <<<"${1:0:1}")${1:1}" ;; esac }

dups=""
dup_check() { # <title> [text]: open issues that may be the same ticket
	[ -z "$nodup" ] || return 0
	local found ans
	found=$(node scripts/open-work.js dups "$@" </dev/null 2>/dev/null || true)
	[ -n "$found" ] || return 0
	{
		echo "Open issues that may be the same ticket (#2969). If one is, comment there instead; if none is, pass --no-dup-check:"
		echo "  ${found//$'\n'/$'\n'  }"
	} >&2
	dups=$(grep -o '^#[0-9]*' <<<"$found" | paste -sd ' ' -)
	if [ -z "$dry" ] && [ -t 0 ]; then
		read -r -p "File a new issue anyway? [y/N] " ans || ans=""
		[[ $ans == [yY]* ]] || {
			echo "Not filed." >&2
			exit 3
		}
	fi
}

create() { # <title> <body> <label>...: files the issue and prints its number, or with --dry-run prints what it would file
	local title=$1 body=$2 labels=() l
	shift 2
	[ -z "$dups" ] || body="$body

**Possible duplicates, listed when filed:** $dups"
	if [ -n "$dry" ]; then
		printf 'Dry run, nothing filed.\nTitle: %s\nLabels: %s\n\n%s\n' "$title" "$*" "$body"
		return
	fi
	for l; do labels+=(-f "labels[]=$l"); done
	gh api $R/issues -f title="$title" -f body="$body" "${labels[@]}" -q .number
}

cmd=${1:?usage: scripts/ticket.sh new|bug|design|move|child|done|log ...}
shift
dry="" nodup="" args=()
for a; do
	case $a in
	--dry-run) dry=1 ;;
	--no-dup-check) nodup=1 ;;
	*) args+=("$a") ;;
	esac
done
set -- ${args[@]+"${args[@]}"}
case "$cmd" in new | bug | design) ;; *) [ -z "$dry" ] || {
	echo "--dry-run is for new, bug and design" >&2
	exit 1
} ;; esac
case "$cmd" in
new)
	title=${1:?title}
	area=${2:?area}
	area=${area#area:}
	col=${3:-dev}
	body=${4:-"**Kind:** Request
**Area:** $(area_name "$area")"}
	dup_check "$title" "${4:-}"
	n=$(create "$title" "$body" kind:request "area:$area")
	[ -z "$dry" ] || {
		echo "$n"
		exit 0
	}
	board "$n" "$col"
	echo "$n"
	;;
bug)
	parent=${1:?parent}
	title=${2:?title}
	area=${3:?area}
	area=${area#area:}
	what=${4:?what happened}
	fix=${5:?fix}
	pr=${6:-}
	stands=$([ -n "$pr" ] && echo "Fixed in #$pr." || echo "Open, not fixed yet.")
	body="**Kind:** Bug
**Area:** $(area_name "$area")
**Found while:** #$parent
**Where it stands:** $stands

## What happened
$what

## Fix
$fix"
	dup_check "$title" "$what"
	n=$(create "$title" "$body" bug "area:$area")
	[ -z "$dry" ] || {
		echo "$n"
		exit 0
	}
	child "$parent" "$n"
	if [ -n "$pr" ]; then close "$n" "$pr"; else board "$n" backlog; fi
	echo "$n"
	;;
design)
	parent=${1:?parent}
	title=${2:?title}
	body=${3:?body}
	n=$(create "$title" "$body" area:design)
	[ -z "$dry" ] || {
		echo "$n"
		exit 0
	}
	child "$parent" "$n"
	board "$n" design
	echo "$n"
	;;
move) board "${1:?n}" "${2:?column}" ;;
child) child "${1:?parent}" "${2:?child}" ;;
"done") close "${1:?n}" "${2:?pr}" ;;
log)
	now=$(date -u +%FT%TZ)
	case "${1:?start|end}" in
	start) echo "$now,,${2:?n},${3:-},${CURSOR_CONVERSATION_ID:-chat}," >>"$LOG" ;;
	end)
		python3 - "$LOG" "${2:?n}" "$now" "${CURSOR_CONVERSATION_ID:-chat}" <<'PY'
import csv, sys
path, ticket, now, chat = sys.argv[1:]
rows = list(csv.reader(open(path)))
open_rows = [r for r in reversed(rows) if len(r) > 2 and r[2] == ticket and not r[1]]
mine = [r for r in open_rows if len(r) > 4 and r[4] == chat]
if mine or open_rows:
    (mine or open_rows)[0][1] = now
csv.writer(open(path, "w", newline="")).writerows(rows)
PY
		;;
	esac
	;;
*)
	echo "unknown command: $cmd" >&2
	exit 1
	;;
esac
