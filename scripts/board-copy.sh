#!/usr/bin/env bash
# Adds every issue and PR on one Projects board to another with the same Status. A board can't be transferred,
# so copyProjectV2 makes the new board (fields, views, drafts) and this fills it. Items already on the target with
# the same Status are skipped and the rest are corrected, so it can be stopped, run again, and run once more at
# switch-over to catch moves made on the old board meanwhile. Open work goes first. Writes use the qa-lab-agents
# app token when scripts/gh-app-token.js works (its own budget). GitHub allows about 500 content-creating requests
# an hour, and each item is two, so it waits PAUSE seconds (default 7) after each one.
#
#   scripts/board-copy.sh <source project id> <target project id> <target Status field id>
#   scripts/board-copy.sh PVT_kwHOALfwis4BmsxO PVT_kwDOFLbZIM4BokiS PVTSSF_lADOFLbZIM4BokiSzhnEBTE
set -euo pipefail

SRC=$1 DST=$2 FIELD=$3
PAUSE="${PAUSE:-7}"
DONE_OPTION="bebf6b88"

items() {
	local cursor="" page
	while :; do
		page=$(gh api graphql -f query='query($p:ID!,$c:String){node(id:$p){... on ProjectV2{items(first:100,after:$c){
      pageInfo{hasNextPage endCursor}
      nodes{id content{... on Issue{id number} ... on PullRequest{id number}}
        fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{optionId}}}}}}}' \
			-f p="$1" ${cursor:+-f c="$cursor"})
		jq -r '.data.node.items.nodes[] | select(.content.id) | "\(.content.id) \(.fieldValueByName.optionId // "-") \(.content.number) \(.id)"' <<<"$page"
		[ "$(jq -r .data.node.items.pageInfo.hasNextPage <<<"$page")" = true ] || break
		cursor=$(jq -r .data.node.items.pageInfo.endCursor <<<"$page")
	done
}

mutate() {
	local out token
	token=$("$(dirname "$0")/gh-app-token.js" 2>/dev/null || true)
	until out=$(GH_TOKEN="${token:-$(gh auth token)}" gh api graphql "$@" 2>&1); do
		if grep -qi "rate limit" <<<"$out"; then
			echo "rate limited; waiting 60 s" >&2
			sleep 60
		else
			echo "$out" >&2
			return 1
		fi
	done
	echo "$out"
}

have=$(items "$DST")
all=$(items "$SRC")
todo=$({
	grep -v " $DONE_OPTION " <<<"$all" || true
	grep " $DONE_OPTION " <<<"$all" || true
})
total=$(grep -c . <<<"$todo" || true)
echo "$total on the source board, $(grep -c . <<<"$have" || true) already on the target"

n=0
while read -r content option number _; do
	[ -n "$content" ] || continue
	read -r _ current _ item <<<"$(grep "^$content " <<<"$have" || true)"
	[ -n "$item" ] && [ "$current" = "$option" ] && continue
	if [ -z "$item" ]; then
		item=$(mutate -f query='mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}' \
			-f p="$DST" -f c="$content" | jq -r .data.addProjectV2ItemById.item.id)
		sleep "$PAUSE"
	fi
	if [ "$option" != "-" ]; then
		mutate -f query='mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}' \
			-f p="$DST" -f i="$item" -f f="$FIELD" -f o="$option" >/dev/null
		sleep "$PAUSE"
	fi
	n=$((n + 1))
	echo "$n/$total #$number"
done <<<"$todo"
echo "done: $n added"
