---
description: Locks editing to a single folder (prevents work from spreading while debugging or on a risky feature).
argument-hint: <folder> | off | (empty = status)
---

Lock: $ARGUMENTS

- **If a folder is given:** Run `node .claude/hooks/freeze-guard.mjs --set <folder>`. From then on, writing outside that folder with a file tool is blocked by the hook (except `docs/workflow/progress.md`); changing an existing file with a shell command (`sed -i`, `mv`, `>`) asks the user.
- **If `off`:** `node .claude/hooks/freeze-guard.mjs --off`.
- **If empty:** `node .claude/hooks/freeze-guard.mjs --status` and report the result in one line.

If you really must touch a file outside the folder while the lock is on, do not remove the lock yourself: say which file and why it is needed, and ask the user.
`/fix-bug` suggests a lock for the relevant feature folder after the bug's root cause is found.
