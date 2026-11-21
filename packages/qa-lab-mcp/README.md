# qa-lab-mcp (#3480 / #3626)

Cursor stdio MCP for QA-lab URL Review: soft preview, full crawl (account API token), and report read. No npm publish — install deps in this folder and point Cursor at `src/server.js`.

## Tools

| Tool | Calls | Notes |
|------|--------|--------|
| `preview_url` | `POST {reviewRun}/review/preview` | Soft scores + top finding; same soft quota as the web gate. Does not run attack/exploit source checks (KEV, OSV, EPSS, DROP, Feodo, Tor, GDELT, CertSpotter). CertSpotter and the site news match run only in the paid Deep check. |
| `crawl_url` | `POST {reviewRun}/review` | Full crawl; needs `QA_LAB_API_TOKEN` (account credits / pass) |
| `get_report` | `POST {reviewUrl}/review/open` | Frosted without auth (attack-source findings stripped). Full report, with paid “Was it targeted?”, when `QA_LAB_API_TOKEN` or `QA_LAB_SESSION` owns it. |

## Install (Cursor)

```bash
cd packages/qa-lab-mcp && npm install
```

Add to Cursor MCP settings (`.cursor/mcp.json` or Cursor Settings → MCP):

```json
{
  "mcpServers": {
    "qa-lab": {
      "command": "node",
      "args": ["packages/qa-lab-mcp/src/server.js"],
      "cwd": "/absolute/path/to/kaanmuar.github.io",
      "env": {
        "QA_LAB_RUN_URL": "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewRun",
        "QA_LAB_REVIEW_URL": "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl",
        "QA_LAB_API_TOKEN": "qlat_…"
      }
    }
  }
}
```

Local soft-preview (no Turnstile): start `node scripts/url-review-server.js`, then set both bases to `http://127.0.0.1:8768`. The server needs `FIREBASE_WEB_KEY` (the Identity Toolkit-only server key from Secret Manager / `functions/.secret.local`, not the browser key) in the environment; it exits at startup without it.

## Account API token (#3626)

Mint while signed in (session + device key from the web app), accepting the current terms:

```bash
curl -sS -X POST "$QA_LAB_REVIEW_URL/account/api-token" \
  -H 'content-type: application/json' \
  -d '{"session":"…","deviceKey":"…","termsAccepted":true,"termsVersion":"2026-11-04b"}'
```

Put the returned `apiToken.token` (`qlat_<id>_<secret>`) in `QA_LAB_API_TOKEN`. Rotating mints a new secret and revokes the old one.

This is **not** `QA_LAB_MCP_KEY`. The shared MCP key only skips Turnstile on soft-preview; the account token authenticates full crawl and owned report open.

## Env

| Variable | Purpose |
|----------|---------|
| `QA_LAB_RUN_URL` | Soft-preview / crawl base (default production `reviewRun`) |
| `QA_LAB_REVIEW_URL` | Report-open / account base (default production `reviewUrl`; local `8768` covers both) |
| `QA_LAB_API_TOKEN` | Account API token (`qlat_…`) for `crawl_url` and full `get_report` |
| `QA_LAB_SESSION` | Signed-in session (v1 fallback for `get_report`) |
| `QA_LAB_DEVICE_KEY` | Device key paired with the session (or derived from the API token for crawl stop) |
| `QA_LAB_DEVICE_ID` | Hex device id (random if unset) |
| `QA_LAB_NAME` | Asker name on crawl (default `QA-lab MCP`) |
| `QA_LAB_TURNSTILE` | Optional; not needed when `QA_LAB_MCP_KEY` matches the server secret |
| `QA_LAB_MCP_KEY` | Shared secret (≥24 chars). Sent as `x-qa-lab-mcp-key`; skips Turnstile, still counts soft quota (#3480 A) |

**Prod note:** Firebase still needs `QA_LAB_MCP_KEY` for v1 soft-preview Turnstile skip. The v2 account token is separate (`firebase functions:secrets:set QA_LAB_MCP_KEY` then redeploy `reviewUrl` / `reviewRun`).
