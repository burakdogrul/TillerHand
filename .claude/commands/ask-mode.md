---
description: Shows or changes the question mode (on which topics decisions are asked).
argument-hint: [empty | off <topic|all> | on <topic|all>]
---

Request: $ARGUMENTS

Topics: `product`, `tech`, `design`, `content`, `data`, `security`, `cost` (`docs/workflow/decision-protocol.md` §1).

- **Empty:** Show the current question mode, the closed topics and the automatic decisions made while closed (`docs/decisions/log.md` → deciding party `automatic`).
- **`off <topic|all>`:** Update the question mode line in `docs/workflow/progress.md`. Example: `**Question mode:** on · closed topics: design, content`. If all are closed: `off · closed topics: all`.
- **`on <topic|all>`:** Remove the topic from the list. If the list becomes empty: `on · closed topics: none`.
- If the topic name is not in the list, propose the closest topic and ask.
- **Unknown argument** (not empty, `on` or `off`): change nothing; show the usage line above and the topic list.

Confirm the change in one line. Also remind: Deleting data, prod deploys and actions that spend money always ask for approval, regardless of question mode.
