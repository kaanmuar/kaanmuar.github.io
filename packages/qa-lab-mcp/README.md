# qa-lab-mcp (#3480)

Cursor stdio MCP for QA-lab URL Review: soft preview + report read. No npm publish in v1 — run from this folder.

## Tools

| Tool | Calls | Notes |
|------|--------|--------|
| `preview_url` | `POST /review/preview` | Soft scores + top finding; same soft quota as the web gate |
| `get_report` | `POST /review/open` | Frosted without session; full report when `QA_LAB_SESSION` owns it |

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
        "QA_LAB_REVIEW_URL": "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl"
      }
    }
  }
}
```

Local soft-preview (no Turnstile): point `QA_LAB_REVIEW_URL` at `scripts/url-review-server.js` (default `http://127.0.0.1:8787` when that script is listening).

## Env

| Variable | Purpose |
|----------|---------|
| `QA_LAB_REVIEW_URL` | API base (default production `reviewUrl`) |
| `QA_LAB_SESSION` | Signed-in session for full `get_report` |
| `QA_LAB_DEVICE_KEY` | Device key paired with the session |
| `QA_LAB_TURNSTILE` | Turnstile token if calling production soft-preview |
| `QA_LAB_MCP_KEY` | Reserved for a product-approved Turnstile exemption |

Production soft-preview currently requires Turnstile when Siteverify is bound — see the open product Q on #3480.
