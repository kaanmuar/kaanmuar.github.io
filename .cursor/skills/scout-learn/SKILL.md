---
name: scout-learn
description: >-
  Shared scout learning loop (#4237). Use when running or changing tool-scout,
  engagement/meta scout, field-sweep, trending drafts, or GitHub scoutPart; when
  Carlos answers a scout question; or when teaching Jarvis about scout knowledge.
---

# Scout learn

`functions/scout-learn.js` — every scout reflects after a run: lessons, odds, exceptions, in-scope knowledge, and (on a cadence) questions for Carlos. Nothing here edits `.cursor/rules/tool-arsenal.mdc`.

## Scouts

| Scout | Entrypoint | Persist |
|---|---|---|
| `tool` | `scripts/tool-scout.js` | `scripts/scout-learn/tool.json` (+ `tool-scout-data`) |
| `engagement` | `functions/meta-scout.js` | Firestore `jarvis_settings/scout-learn-engagement` |
| `field-sweep` | `scripts/field-sweep.js` | `scripts/scout-learn/field-sweep.json` |
| `trending` | `scripts/scout-trending-drafts.js` | `scripts/scout-learn/trending.json` |

Cadence (`ASK_EVERY_MS`): tool 7d, engagement 2d, field-sweep/trending 3d.

## After a run

```js
const Learn = require('../functions/scout-learn');
const learned = Learn.learnFile('tool', { drift, candidates, traps, flags, corners }, Date.now()); // CLI
// or: await Learn.learnDb(db, 'engagement', stats, now); // cloud
await Learn.publishAiProposals(db, learned.slice, now); // optional Jarvis proposals
```

Use that scout’s local + foreign resources. Check the arsenal before adopting anything new.

## When Carlos answers

```js
await Learn.answer(db, { id: 'tool:ticket-candidates', status: 'answered', note: '…' }, 'carlos', Date.now());
```

## Teach Jarvis

Sync Ask `VOICE` (`functions/jarvis.js`), hub notes (`js/admin-jarvis.js` + Android), worker `PREAMBLE`. Jarvis reads `github-work.scout.learn` and engagement meta `learn`. See `qa-lab-growth.mdc`.
