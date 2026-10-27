---
description: Closes the session: updates progress, CHANGELOG and the decision log, proposes a commit.
---

We are closing this session. The next session (or the one after `/clear`) starts with zero context; everything it needs must be in files.

1. See this session's changes with `git status` and `git diff --stat`.
2. Update `docs/workflow/progress.md` (max 40 lines):
   - Date, active task and next step are written by script (the format stays intact): `node .claude/hooks/progress.mjs --task "<aktif görev veya ->" --next "<tek, net, hemen başlanabilir adım>"`. If work was done outside `/build`, add `--did "<tek satır>"` to the same call (`/build` already wrote its own line).
   - By hand: delete the earlier sessions' lines from "Son oturumda yapılanlar" (done last session); update the active phase, current state (what works, what is half done), pending decisions (asked but unanswered), open issues and "AI için notlar" (notes for the AI)
   - At the end run `node .claude/hooks/progress.mjs --check`: it reports if the bold-labeled lines were broken (the status line and the dashboard read them)
3. `docs/product/roadmap.md`: are finished tasks checked off? If not, `node .claude/hooks/progress.mjs --done G-NNN`. If the task is finished and the scope shield stayed open (`node .claude/hooks/freeze-guard.mjs --status`), close it: `--plan-end`. If the task continues, leave it open.
4. `CHANGELOG.md` → add the user-visible changes to the "Yayınlanmamış" (unreleased) section.
5. Are all of this session's decisions in the `docs/decisions/log.md` decision log? Add the missing ones.
6. If the structure changed (new table, service, folder), update `docs/architecture/overview.md`.
7. Refresh `dashboard.html` with `node .claude/hooks/cost.mjs` and `node .claude/hooks/dashboard.mjs`.
7b. If this session revealed project knowledge that the AI got wrong for not knowing it, propose adding it to `AGENTS.md` (get approval; to `CLAUDE.md` with `/revise-claude-md` only if specific to Claude Code). If the user made the same correction twice, propose a lasting rule with `/hookify <kural>`. The rule goes to the "Öğrenilen kurallar" (learned rules) section of `AGENTS.md`; format and source/date line as in `/fix-bug` step 8 (source: an event in this session).
8. If there is uncommitted work, propose a commit message. Make the commit with my approval. If tests are green, save a working point: `node .claude/hooks/checkpoint.mjs --save "oturum sonu: <kısa özet>"`.
8b. **Personal preferences** (AGENTS.md → rule 9, if present): If the user corrected a behavior or stated a preference this session, ask about the notes with AskUserQuestion as multi-select and write the selected ones with `node .claude/hooks/prefs.mjs --add`. If there are no notes, skip this step and ask nothing.
9. If the phase is finished, propose in order: `/findings-tech` (technical debt scan), `/board convene phase-end` (full board, with estimated cost), then `/retro`.
10. Read the limit and context. Say the remaining 5-hour share and the reset time. If context passed 50%, say the `/clear` suggestion together with the next step.

When done: status block and one line with the full command: "Sonraki oturum: `/clear`, sonra `/build G-NNN` ([görev adı])" (next session: `/clear`, then `/build G-NNN` ([task name])). This line stays visible after `/clear` too (session-start hook); if `/build` is typed empty it takes the next task itself.
