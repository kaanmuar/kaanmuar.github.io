#!/bin/bash
# Stores the CertSpotter API key the paid Deep check needs (#3946), without the key appearing on screen,
# in chat, or in shell history. Run it yourself in a terminal:   scripts/set-certspotter-key.sh
#   1. asks for the key (typing is hidden),
#   2. proves it with one real request to the CertSpotter API,
#   3. saves it as the Secret Manager secret CERTSPOTTER_KEY in the production project,
#   4. keeps a copy in functions/.secret.local (gitignored) for local runs.
# Until the secret exists, the report hides the Deep offer and checkout answers "not open yet".
set -euo pipefail

project=carlosm-interactive-cv
cd "$(dirname "$0")/.."

printf 'Paste the CertSpotter API key (nothing shows while you type), then press Return: '
IFS= read -rs key
echo
key=$(printf '%s' "$key" | tr -d '[:space:]')
[ -n "$key" ] || {
	echo "No key entered. Nothing changed." >&2
	exit 1
}

# The key goes to curl through a config stream, so it never shows in the process list.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
	--config <(printf 'header = "Authorization: Bearer %s"\n' "$key") \
	'https://api.certspotter.com/v1/issuances?domain=example.com' || true)
case "$code" in
200) echo "CertSpotter accepted the key." ;;
401 | 403) echo "CertSpotter refused that key (HTTP $code). Check you copied the whole key. Nothing changed." >&2; exit 1 ;;
429) echo "CertSpotter is rate-limiting right now (HTTP 429), so the key could not be proven. Wait a minute and run this again. Nothing changed." >&2; exit 1 ;;
*) echo "Could not reach CertSpotter (HTTP ${code:-none}). Nothing changed." >&2; exit 1 ;;
esac

printf '%s' "$key" | firebase functions:secrets:set CERTSPOTTER_KEY --project "$project" --data-file - --non-interactive

if [ -f functions/.secret.local ] && ! grep -q '^CERTSPOTTER_KEY=' functions/.secret.local; then
	printf 'CERTSPOTTER_KEY=%s\n' "$key" >>functions/.secret.local
fi

echo
echo "Done: CERTSPOTTER_KEY is stored. Tell Claude the key is set; it binds the secret to the review function, deploys, and checks the offer appears."
