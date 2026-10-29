---
description: Manages context packages: shows which plugins are on, turns packages on/off, measures skill and agent load.
argument-hint: [empty = status | on <package> | off <package> | measure | commands light|full]
---

Request: $ARGUMENTS

Any other argument: change nothing, show the argument list above and the package names.

Why it exists: The skill list is limited to 1% of context. When it overflows, descriptions of rarely used skills drop and Claude does not know them. So plugins outside the core come off by default and are turned on as packages when needed. Packages and their contents: `docs/workflow/skills.md` → "Context packages".

- **Empty:** Run `node .claude/hooks/tools.mjs` and show the output as a short table (package, status, approximate tokens, which command turns it on).
- **`on <package>`:** First tell the user the package's approximate token cost and this note: "Turning on mid-session breaks the prompt cache; the cheapest is at a phase boundary together with `/clear`." If approved, run `node .claude/hooks/tools.mjs --enable <package>`. If the script reports a plugin that is not installed, ask separately about installing it (`node .claude/hooks/plugins-sync.mjs --install`). Then ask the user to run `/reload-plugins`.
- **`off <package>`:** `node .claude/hooks/tools.mjs --disable <package>`, then `/reload-plugins`.
- **`measure`:** Run `node .claude/hooks/tools.mjs --measure`. Show the 5 largest plugins and the total. For the exact value suggest `/context` (Skills row) and `/doctor` to the user; suggest `/skill-doctor` to find unused skills.

- **`commands light` / `commands full`:** `node .claude/hooks/tools.mjs --commands light` or `--commands full`. Light: the 20 non-core commands stay in the list with only their name (~1,100 fewer tokens per session) and remain in the `/` menu. Full: all descriptions in the list. This setting is written to `.claude/settings.json` and affects the whole team; do it together with a profile change (`docs/workflow/progress.md` → `**Profile:**`). It takes effect in a new session.

Turning on and off affects only this machine (`.claude/settings.local.json`, not in git). Changing the default for everyone means editing `.claude/settings.json` → `enabledPlugins` and is a `tech` decision.

Codex and Antigravity have no plugin packages: there this command only lists the optional tools in `docs/workflow/mcp-catalog.md`.
