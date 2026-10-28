---
description: Runs all finding types (technical, business, security, UX, performance, legal) at once and produces a combined summary.
argument-hint: [empty = all | type list, e.g. tech,security]
---

Types: $ARGUMENTS (if empty: tech, business, security, ux, perf, legal)

1. **Limit:** The full set is very expensive (most of the 5-hour limit on the Pro plan). Read the limit. Show the estimated cost per type and ask with AskUserQuestion, **multi-select**: which types should run? If the level is yellow or red, recommend the 2 most critical types (tech + security).
1b. **Package:** If `security` is selected, run `node .claude/hooks/tools.mjs --required security`. If it is off, ask once before starting the subagents (subagents use the session's plugins).
2. **Preliminary info:** For business and legal, if `docs/findings/config.md` is empty, ask the sector and expert role once now; the subagents must not ask again.
3. **Run in parallel:** Start a separate subagent for each selected type (Agent tool, in a single message, in the background; the review role's `model` and `effort`, `docs/workflow/models.md`). Give each agent this instruction: "Apply the steps of `.claude/findings/protocol.md` with `.claude/findings/lenses/<type>.md`; write the report; do NOT ask the roadmap question, leave the tasks you propose in the report's fix plan."
4. **Combined summary:** When all reports are done, write `docs/findings/summary-YYYY-MM-DD.md`:
   - Health score per type and the difference from the previous one
   - The 10 highest-scoring findings across all types (single list, by score)
   - Topics that cross types (e.g. the same issue is both a security and a legal finding)
   - Combined fix plan: quick wins and big jobs
5. **Transfer:** Ask which findings go into the roadmap with **a single multi-select** (protocol §8).
6. Run `node .claude/hooks/dashboard.mjs`. Summary and status block.
