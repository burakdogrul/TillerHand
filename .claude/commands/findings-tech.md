---
description: Technical findings report. Scans the project through the eyes of a senior architect: bugs, duplicate and unused code, structure violations, type safety, test gaps. Scores the 20 most important findings out of 100.
argument-hint: [empty = whole project | folder/feature | --since <commit|date>]
---

Type: **tech** · Scope: $ARGUMENTS

1. Read `.claude/findings/protocol.md` and apply its steps in order.
2. Use `.claude/findings/lenses/tech.md` for the perspective, checklist and tools.
3. Write the report in the `.claude/findings/report-template.md` format under `docs/findings/tech/`.
4. Do not change code. Only write the report, then ask which findings go into the roadmap.
