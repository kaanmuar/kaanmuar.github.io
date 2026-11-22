# Lighthouse CI budgets (#3832)

Opt-in PR / agency template around [`treosh/lighthouse-ci-action`](https://github.com/treosh/lighthouse-ci-action) (MIT, pinned in `.github/workflows/lighthouse-budget.yml`). It does **not** run on every pull request and does **not** deploy Pages.

## Run it here

```bash
# Live URLs (default; cheap — no Pages build)
gh workflow run lighthouse-budget.yml -f target=live

# Local Pages artifact (_site via scripts/build-pages.js), then LHCI
gh workflow run lighthouse-budget.yml -f target=local

# Optional: override URLs (live target only)
gh workflow run lighthouse-budget.yml -f target=live -f urls='https://example.com/'
```

Artifacts land as `lighthouse-results`. A private LHCI server is optional: set repo secrets `LHCI_SERVER_URL` and `LHCI_SERVER_TOKEN`. Leave them unset to skip server upload (no paid LHCI required).

## Agency copy

1. Copy `.github/workflows/lighthouse-budget.yml` and this `lighthouse/` folder into the customer repo.
2. Widen `on.pull_request.paths` if you want budgets on CSS/JS/HTML changes; keep it narrow to avoid burning CI minutes.
3. Tighten `budget.json` and the assert scores in `lighthouserc*.json` to the customer’s SLOs.
   Defaults are loose enough for live `qa-lab` / `qa-review` (many third-party scripts); agencies should cut them.
4. Pin stays on the SHA comment in the workflow (`# 12.6.2`); bump when treosh releases.

Daily PageSpeed (#1978) stays separate; this workflow is a lightweight budget gate for webhooks and selective PRs.
