# Workers ops: GeoIP R2 + HEARTBEAT (#3838)

Short enablement note for production. **Names only — never commit secret values.** Put real URLs and tokens in the host / Cloudflare Worker secrets (or GitHub Actions vars/secrets), not in git.

Config stubs and name lists live in `workers/.env.example`, `workers/shared/ops-bindings.js`, and the Worker `cloudflare.config.ts` files (PR #4193). Unset vars soft-fail: features stay off until you enable them.

## Env vars (prod)

| Name | Where | Purpose |
|---|---|---|
| `GEOIP_BUCKET` | Shell / CI when deploying `preflight`; GitHub repo **variable** for `.github/workflows/geoip-refresh.yml` | R2 bucket name. When set at deploy, adds binding `GEOIP` (`workers/shared/geoip.js`). |
| `HEARTBEAT_OUTREACH_URL` | Worker secret on `outreach-cron` | Dead-man success ping (healthchecks-style URL). |
| `HEARTBEAT_OUTREACH_FAIL_URL` | Worker secret on `outreach-cron` (optional) | Failure ping; default is success URL + `/fail`. |
| `HEARTBEAT_UPTIME_URL` | Worker secret on `uptime-check` | Dead-man success ping for the scheduled uptime job. |
| `HEARTBEAT_UPTIME_FAIL_URL` | Worker secret on `uptime-check` (optional) | Failure ping; default is success URL + `/fail`. |
| `UPTIME_ENDPOINTS` | Worker secret / plain binding on `uptime-check` (optional) | JSON array of URL strings or `{ url, expected?, timeoutMs? }`; unset uses defaults in `workers/uptime-check`. |
| `PREFLIGHT_TOKEN` | Deploy env → uploaded as secret `TOKEN` | Bearer for preflight admin routes (already required for that Worker). |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub **secrets** (geoip refresh only) | R2 upload for the daily `.mmdb` refresh; not Worker bindings. |

Related code: `workers/shared/heartbeat.js`, `workers/shared/geoip.js`, `scripts/geoip-fetch.js`, `scripts/check-heartbeat-geoip-config.js`.

## Checklist

1. Create the R2 bucket in Cloudflare (empty is fine). Do **not** commit `.mmdb` files.
2. Upload PDDL DBs once: `node scripts/geoip-fetch.js --bucket <name>` (or set `GEOIP_BUCKET` and run without `--bucket`).
3. Set GitHub repo variable `GEOIP_BUCKET` and secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` so `geoip-refresh.yml` can run daily.
4. Redeploy `preflight` with `GEOIP_BUCKET=<name>` in the deploy environment so the `GEOIP` R2 binding is attached.
5. Create healthchecks (or equivalent) checks for outreach-cron and uptime-check; copy only the ping URLs into Worker secrets as `HEARTBEAT_OUTREACH_URL` / `HEARTBEAT_UPTIME_URL` (optional `*_FAIL_URL`).
6. Confirm unset still means off: local/dev without these vars must keep deploying.
7. Shape-only check (no secrets): `node scripts/check-heartbeat-geoip-config.js` with `GEOIP_BUCKET` set or unset as appropriate.

Period and grace live in the alerting service, not in this repo.
