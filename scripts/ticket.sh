#!/bin/bash
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
	*) echo "unknown column: $1" >&2; exit 1 ;;
	esac
}

board() { # <n> <column>
	local item
	item=$(scripts/gh-budget.sh api graphql -f query='mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}' \
		-f p=$P -f c="$(gh api $R/issues/"$1" -q .node_id)" -q .data.addProjectV2ItemById.item.id 2>/dev/null) || item=$(scripts/gh-budget.sh --item "$1")
	scripts/gh-budget.sh project item-edit --id "$item" --project-id $P --field-id $F --single-select-option-id "$(column "$2")" >/dev/null
}

child() { gh api $R/issues/"$1"/sub_issues -F sub_issue_id="$(gh api $R/issues/"$2" -q .id)" >/dev/null; }

close() { # <n> <pr>
	gh api $R/issues/"$1"/comments -f body="Fixed in #$2." >/dev/null
	gh api -X PATCH $R/issues/"$1" -f state=closed -f state_reason=completed >/dev/null
	board "$1" done
}

area_name() { case "$1" in be) echo BE ;; fe) echo FE ;; ui) echo UI ;; qa) echo QA ;; ci) echo CI ;; *) echo "$(tr '[:lower:]' '[:upper:]' <<<"${1:0:1}")${1:1}" ;; esac; }

cmd=${1:?usage: scripts/ticket.sh new|bug|design|move|child|done|log ...}
shift
case "$cmd" in
new)
	title=${1:?title}; area=${2:?area}; col=${3:-dev}
	body=${4:-"**Kind:** Request
**Area:** $(area_name "$area")"}
	n=$(gh api $R/issues -f title="$title" -f body="$body" -f 'labels[]=kind:request' -f "labels[]=area:$area" -q .number)
	board "$n" "$col"
	echo "$n"
	;;
bug)
	parent=${1:?parent}; title=${2:?title}; area=${3:?area}; what=${4:?what happened}; fix=${5:?fix}; pr=${6:-}
	stands=$([ -n "$pr" ] && echo "Fixed in #$pr." || echo "Open, not fixed yet.")
	body="**Kind:** Bug
**Area:** $(area_name "$area")
**Found while:** #$parent
**Where it stands:** $stands

## What happened
$what

## Fix
$fix"
	n=$(gh api $R/issues -f title="$title" -f body="$body" -f 'labels[]=bug' -f "labels[]=area:$area" -q .number)
	child "$parent" "$n"
	if [ -n "$pr" ]; then close "$n" "$pr"; else board "$n" backlog; fi
	echo "$n"
	;;
design)
	parent=${1:?parent}; title=${2:?title}; body=${3:?body}
	n=$(gh api $R/issues -f title="$title" -f body="$body" -f 'labels[]=area:design' -q .number)
	child "$parent" "$n"
	board "$n" design
	echo "$n"
	;;
move) board "${1:?n}" "${2:?column}" ;;
child) child "${1:?parent}" "${2:?child}" ;;
done) close "${1:?n}" "${2:?pr}" ;;
log)
	now=$(date -u +%FT%TZ)
	case "${1:?start|end}" in
	start) echo "$now,,${2:?n},${3:-},${CURSOR_CONVERSATION_ID:-chat}," >>"$LOG" ;;
	end) python3 - "$LOG" "${2:?n}" "$now" <<'PY'
import csv, sys
path, ticket, now = sys.argv[1:]
rows = list(csv.reader(open(path)))
for row in reversed(rows):
    if len(row) > 2 and row[2] == ticket and not row[1]:
        row[1] = now
        break
csv.writer(open(path, "w", newline="")).writerows(rows)
PY
	;;
	esac
	;;
*) echo "unknown command: $cmd" >&2; exit 1 ;;
esac
