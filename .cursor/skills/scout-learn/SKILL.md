---
name: scout-learn
description: >-
  Shared scout learning loop (#4237). Use when running or changing tool-scout,
  engagement/meta scout, field-sweep, trending drafts, or GitHub scoutPart; when
  Carlos answers a scout question; or when teaching Jarvis about scout knowledge.
---

# Scout learn

`functions/scout-learn.js` — private to Carlos and the scouts. Reflect after each run: lessons, odds, exceptions, in-scope knowledge, and (on a cadence) questions with decision options. Authoritative store is **Firestore**. Never public hub/PR copy. Nothing here edits `.cursor/rules/tool-arsenal.mdc`.

Jarvis **Learn** tab (web + Android) shows all scouts live and lets Carlos decide.

## Scouts

| Scout | Entrypoint | Persist |
|---|---|---|
| `tool` | `scripts/tool-scout.js` | Firestore (+ private `tool-scout-data` / local cache) |
| `engagement` | `functions/meta-scout.js` | Firestore `jarvis_settings/scout-learn-engagement` |
| `field-sweep` | `scripts/field-sweep.js` | Firestore (local cache ok) |
| `trending` | `scripts/scout-trending-drafts.js` | Firestore (local cache ok) |

Cadence (`ASK_EVERY_MS`): tool 7d, engagement 2d, field-sweep/trending 3d.

## After a run

```js
const Learn = require('../functions/scout-learn');
const learned = Learn.learnFile('tool', { drift, candidates, traps, flags, corners }, Date.now()); // CLI cache
await Learn.syncFile('tool'); // best-effort Firestore so Jarvis Learn stays live
// or: await Learn.learnDb(db, 'engagement', stats, now); // cloud path
await Learn.publishAiProposals(db, learned.slice, now); // optional Jarvis proposals
```

Use that scout’s local + foreign resources. Check the arsenal before adopting anything new.

## When Carlos answers

```js
await Learn.answer(db, { id: 'tool:ticket-candidates', status: 'answered', note: '…' }, 'carlos', Date.now());
```

## Teach Jarvis

Sync Ask `VOICE` (`functions/jarvis.js`), hub notes (`js/admin-jarvis.js` + Android), worker `PREAMBLE`. Jarvis reads `github-work.scout.learn` and engagement meta `learn`. See `qa-lab-growth.mdc`.
