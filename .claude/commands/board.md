---
description: Sets up, changes, convenes or shows the status of the expert board.
argument-hint: [empty | setup | convene <plan|task|phase-end|release|konu> | council <soru>]
---

Request: $ARGUMENTS

First read `.claude/board/rules.md` and `docs/workflow/board.md`.

- **Empty:** Show the board's status: members, the review role's model (`node .claude/hooks/models.mjs --show`), the last 5 meetings and their results, open critical findings, commit review on/off. If the board is not set up, propose `/board setup`.
- **`setup`:** Apply rules.md §5. If the board already exists, ask what to do: add a member / remove a member / refresh the "Bu proje" (this project) sections for the current stack. The model does not change here: members work with the review role (`docs/workflow/models.md`).
- **`convene <tür>`:** Apply rules.md §4.
  - `plan`: the last unapproved plan
  - `task`: the active task's changes (`git diff`)
  - `phase-end`: all changes of the active phase (`git log` and diff summary since the phase start)
  - `release`: the whole codebase
  - Other texts: a topic given by the user (e.g. "payment flow")

- **`council <soru>`:** Decision council (`.claude/board/council.md`). Clarify the question and the options; if options are missing, first have the user confirm them. When done, ask for the decision with AskUserQuestion, using the chair's recommendation.

Before a meeting, check the limit (`node .claude/hooks/usage.mjs`). A full board meeting is expensive. If the level is yellow or red, say the estimated cost in one line (`docs/workflow/usage-limits.md` §3). If the full board is an optional meeting, propose reducing the member count; do not stop the meeting because of the limit.

When done: board synthesis, decisions asked of the user, the line added to the log, status block.
