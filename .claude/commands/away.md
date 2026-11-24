---
description: Away mode for when the user leaves the computer: no step waits on an approval prompt; questions and blocked steps are queued for /back.
argument-hint: [empty]
---

Claude Code only. In Codex and Antigravity, say that away mode is not available there.

1. Run `node .claude/hooks/away.mjs --on`. It asks for approval once: only the user turns away mode on.
2. Tell the user, in the conversation language, in this order:
   - Switch to bypass mode so nothing else asks: press Shift+Tab until it shows "bypass permissions", or start a new session with `claude --dangerously-skip-permissions`. The kit's guards keep running in bypass mode.
   - While away: two-way decisions take the recommended option and are recorded as `automatic (away)` in `docs/decisions/log.md`; one-way decisions (database, auth, payment, data model) are parked and the next independent task goes on. Data deletion, deploys, spending money, `.env`, rule and hook files are not done: they are queued. Push still works through `node .claude/hooks/away.mjs --push` (plain push, no force); the commit gate and CI rules still apply.
   - When back: `/back`.
3. Go on with the current work. When a step is refused with "Away mode:", follow the reason and do not try another route around it.
