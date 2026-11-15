---
name: plan-composer-handoff
description: >-
  Two-chat plan-then-execute workflow that preserves prompt-cache integrity.
  Use when preflight classifies a task as large/architecture, when Plan Mode
  produces an implementation spec, when switching from a frontier model to
  Composer, or when the user asks for plan-then-Composer / two-session handoff.
---

# Plan → Composer handoff

Never change the model dropdown mid-thread. Mid-chat switches bust the KV cache and undo the repo’s ~93% cache-read savings.

## When to use

- Preflight / user marks the work as **large** or architecture-heavy.
- A frontier model (Sonnet/Opus/GPT) should design; Composer should execute.

Stay on one model for ordinary small/medium tickets (follow the #1970 pack).

## Session A — plan (frontier, 1–2 turns)

1. Stay on the frontier model from turn 1.
2. Read the preflight pack; do not wide-search the whole repo.
3. Write a short implementation spec into the ticket worktree, e.g. `.cursor/handoffs/<ticket>-spec.md` (or the path Carlos names).
4. Spec contents: goal, files to touch, non-goals, verification commands (targeted/quiet only).
5. End with a handoff: ticket number, spec path, branch/worktree, what Session B should run.

## Session B — execute (Composer from turn 1)

1. Open a **new** chat; set Composer (or the execute model Carlos names) **before** the first message.
2. Point at the spec (`@` the file). Do not paste the whole Session A transcript.
3. Implement only what the spec lists; keep terminal output quiet and scoped.
4. When done: PR, `ticket.sh log end`, half-context handoff if the chat is still long.

## Do not

- Switch Sonnet → Composer (or reverse) inside one conversation.
- Re-litigate the plan in Session B unless the spec is wrong.
- Run full test suites; use the single-file / quiet commands from the spec and repo rules.
