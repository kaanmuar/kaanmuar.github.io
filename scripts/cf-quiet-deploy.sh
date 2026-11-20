#!/bin/bash
# cf deploy without printing PEM/PKCS8 from secret_text bindings (#3336).
# Usage: from a worker dir, or: scripts/cf-quiet-deploy.sh -q
set -euo pipefail
cf deploy "$@" 2>&1 | python3 -c 'import sys,re; sys.stdout.write(re.sub(r"-----BEGIN [^-]+-----.*?-----END [^-]+-----","[REDACTED_PEM]",sys.stdin.read(),flags=re.S))'
exit "${PIPESTATUS[0]}"
