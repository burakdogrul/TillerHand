@AGENTS.md

@docs/workflow/progress.md

## Claude Code-specific rules

The shared rules are in `AGENTS.md` (imported above). These are additions to them:

- **Use the right skill.** Code: `ponytail:ponytail`. Critical flow: `mattpocock-skills:tdd`. Interface: the chosen style skill + `impeccable:impeccable`; motion: `ui-motion`. Logo: `logo-design`. Promo video: `motion-video`. Text: `humanizer:humanizer`. Report language: `caveman:caveman`. Full table (read on first need): `docs/workflow/skills.md`. Non-core plugins come switched off as packages; when a command needs one, ask to switch it on (`/tools`).
- **Watch the limit and the context** (`docs/workflow/usage-limits.md`). Read the limit before starting work: the `get_usage` tool on desktop, `node .claude/hooks/usage.mjs` in the terminal. At yellow/red level, state the estimated cost in one line. The limit is only a reason to warn, not to stop work: remind at 90%, warn at 95% and update "Kaldığı yer" (where we left off), say "may be left unfinished" at 99%; keep going unless the user says "stop". When the context passes 50%, suggest `/wrap-up` + `/clear` at a suitable point.
- **The status block** is written in caveman style.
