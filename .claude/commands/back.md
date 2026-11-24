---
description: Ends away mode and goes through what was queued while the user was away.
argument-hint: [empty]
---

1. Run `node .claude/hooks/away.mjs --off`. It turns away mode off and prints the queue, then empties it.
2. Tell the user they can leave bypass mode now (Shift+Tab).
3. Go through the queue with the user, in this order:
   - `question`: ask each with AskUserQuestion, options as in the decision protocol, recommended first.
   - Decisions recorded as `automatic (away)` in `docs/decisions/log.md` since away mode started: list them in one line each and ask which to undo (multi-select).
   - `command`, `edit`, `ask`: say in one line each what was blocked and ask whether to do it now. Run only what they approve; it asks for approval as usual.
4. If nothing was queued, say so in one line and go on.
