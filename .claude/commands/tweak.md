---
description: Makes a small, low-risk change without a plan, subagents or a board meeting. Up to 2 files and 30 lines, away from risky paths.
argument-hint: [what to change, one sentence]
---

To change: $ARGUMENTS

For text, style, a small fix in place, a log line. No plan, no spec, no subagent, no new test.

1. Say in one sentence what will change. **If it changes what the product does,** stop: a new behavior goes to `/build`, a bug to `/fix-bug`. Sign-in, payment, personal data, API routes, migrations, packages and build or test config never come here.
2. Make the change in this session. Only the lines the sentence needs.
3. Run `node .claude/hooks/flow.mjs --tweak`. If it exits 1, tell the user the reason and suggest `/build`; the change stays in the working tree.
4. Run `node .claude/hooks/gate.mjs --run`. Fix anything red. A later change needs a new run.
5. Commit: `type: description`. The commit gate checks the same limits and the green gate. After 3 fast commits in a row it asks for the board: follow its message.
6. Say in two lines what changed and what the user should look at.
