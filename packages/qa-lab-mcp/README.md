# qa-lab-mcp (#3480)

Cursor stdio MCP for QA-lab URL Review: soft preview + report read. No npm publish in v1 — install deps in this folder and point Cursor at `src/server.js`.

## Tools

| Tool | Calls | Notes |
|------|--------|--------|
| `preview_url` | `POST {reviewRun}/review/preview` | Soft scores + top finding; same soft quota as the web gate. Does not run attack/exploit source checks (KEV, OSV, EPSS, DROP, Feodo, Tor, GDELT, CertSpotter). |
| `get_report` | `POST {reviewUrl}/review/open` | Frosted without session (attack-source findings stripped). Full report with paid “Was it targeted?” when `QA_LAB_SESSION` owns it. |

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
        "QA_LAB_REVIEW_URL": "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl"
      }
    }
  }
}
```

Local soft-preview (no Turnstile): start `node scripts/url-review-server.js`, then set both bases to `http://127.0.0.1:8768`.

## Env

| Variable | Purpose |
|----------|---------|
| `QA_LAB_RUN_URL` | Soft-preview base (default production `reviewRun`) |
| `QA_LAB_REVIEW_URL` | Report-open base (default production `reviewUrl`; local `8768` covers both) |
| `QA_LAB_SESSION` | Signed-in session for full `get_report` |
| `QA_LAB_DEVICE_KEY` | Device key paired with the session |
| `QA_LAB_DEVICE_ID` | Hex device id for soft-preview (random if unset) |
| `QA_LAB_TURNSTILE` | Optional; not needed when `QA_LAB_MCP_KEY` matches the server secret |
| `QA_LAB_MCP_KEY` | Shared secret (≥24 chars). Sent as `x-qa-lab-mcp-key`; skips Turnstile, still counts soft quota (#3480 A) |

Set the same value in Firebase Secret Manager (`firebase functions:secrets:set QA_LAB_MCP_KEY`) so `reviewUrl` / `reviewRun` accept MCP soft-previews without Turnstile.
