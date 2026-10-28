---
description: Gives the project's detailed status report and refreshes the dashboard.html dashboard.
---

1. Run `node .claude/hooks/cost.mjs` (tokens and cost of the last 30 days, ccusage) and `node .claude/hooks/dashboard.mjs`. This command produces the `dashboard.html` control panel (the Stop hook also produces it automatically after every Claude answer; while the page is open it refreshes every 30 s). Tabs: Overview, Roadmap, Decisions, Board, Findings, Quality, Activity, Product and tech, Operations, Limit and cost. For token details (most expensive requests, cache) use `/session-report`.
2. Read the limit (`docs/workflow/usage-limits.md` §1). Read `docs/workflow/progress.md`, `docs/product/roadmap.md`, `docs/decisions/log.md` and `docs/workflow/board.md`, and give this report:

```
## Status: [project] · [date]
**Phase:** [active phase] · **Task:** [active task] · **Progress:** [done/total tasks]
**Question mode:** [...] · **Limit:** [5h % (reset) · weekly %] · **Board:** [state, member count]

**Done in this phase:** [...]
**Remaining tasks (this phase):** [...]
**Pending decisions:** [...]  ← put first if any
**Open issues / risks:** [...]
**Latest decisions:** [last 5: question → chosen (user/automatic)]
**Latest board meetings:** [last 3: type → result, open criticals]
**Where we left off:** [if any]
**Checklists:** Security x/y · Go live x/y · KVKK x/y
**Suggested next step:** [one concrete command]
```

3. If you have a browser tool, open `dashboard.html`. Otherwise give the file path.
4. If a decision is pending, ask it right away at the end of the report.
