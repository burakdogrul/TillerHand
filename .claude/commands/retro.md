---
description: Looks back at the end of a phase or project; proposes writing lasting lessons back into the kit.
argument-hint: [phase name | project] (empty = last phase)
---

Retro scope: $ARGUMENTS

Goal: Keep what you learned in this project and improve the kit (the template for all future projects).

1. **Collect data** (for the scope period):
   - `git log --oneline` and `CHANGELOG.md`: what was done
   - Open issues in `docs/workflow/progress.md`, new decisions in `docs/decisions/log.md`
   - `fix:` commits and bugs solved with `/fix-bug`: which kinds of bugs repeated?
   - `docs/product/roadmap.md`: planned vs. completed tasks; tasks that had to be split
2. **Ask me** (AskUserQuestion, with options drawn from the collected data, multi-select + free answer):
   - What did we do well and should continue?
   - Where did the AI waste the most time or get things wrong?
   - Too many questions, too few, or right? On which topic should question mode be closed or opened?
   - Which checklist item was unnecessary, which one was missing?
   - What would you do differently from the start next project?
3. **Add an entry to `docs/quality/retros.md`** with today's date (the template is in the file). Add a period row to `docs/quality/metrics.md` and compare it with the previous period: are task duration, fix rate and duplicate code rising? If the data contradicts the user's feeling, say so openly.
4. **Classify the lessons:**
   - **Specific to this project** → add as a rule to `AGENTS.md` (to `CLAUDE.md` only if specific to Claude Code), `docs/architecture/stack.md` or the relevant doc. First check that CLAUDE.md is current with `claude-md-improver`. A mechanically checkable rule ("do not write Y in file X") becomes a hook rule with `/hookify` instead of text. The rule goes to the "Öğrenilen kurallar" (learned rules) section of `AGENTS.md`; write source and date in the format of `/fix-bug` step 8. If the dashboard shows an "Aynı hata sınıfı" (same bug class) warning, propose a rule for that class too; write the answer (added or not needed) into the specs as a `**Kural:**` line so the warning closes and is not asked again.
   - **General to all projects** → propose to the kit.
5. **Kit proposals:** For each proposal:
   - Which kit file: shared files are in the kit repo root (`AGENTS.md`, `CLAUDE.md`, `docs/...`, `.claude/...`), project-type-specific ones in `kit/templates/<tip>/...`, add-ons in `kit/templates/addons/<ek>/...`.
   - The text to add/change (as a diff) and why (which event it came from).
   - Prefer in this order: add a rule > change a rule > delete a rule; do not bloat the kit. If a rule with the same purpose exists, strengthen it. Write the text by the principles of `mattpocock-skills:writing-for-agents`.
   - Get the proposals approved with **multi-select**.
6. Apply the approved ones to the kit:
   1. Clone the `source` repo from `.kit.json` into a temp folder.
   2. Open a `retro/<proje>-<tarih>` branch.
   3. Make the changes, add them to `kit/CHANGELOG.md` → "[Yayınlanmamış]" (unreleased) section.
   4. Run `node --test "kit/tests/*.test.mjs"`, commit.
   5. Then ask: "Push the branch and open a PR / push and merge to main / leave local only". Pushing needs explicit approval.
   6. Delete the temp folder.

When done: "Rules added to the project: N · Proposed to the kit: M (approved: K)".
