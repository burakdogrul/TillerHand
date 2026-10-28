---
name: init
description: Installs the TillerHand kit into the open folder (npx tillerhand init). Use when the user says "install TillerHand" ("TillerHand'i kur"), "install the kit in this project" ("kiti bu projeye kur") or types /tillerhand:init.
---

# TillerHand installation

This plugin only installs. The kit's rules, commands and protections are copied into the project as files; the plugin itself carries no hooks or permissions.

1. If the open folder has `.kit.json`, the kit is already installed: do not install, suggest `/kit-update` for updating, and stop.
2. Check the requirements: `node --version` is 18 or higher and `git --version` works. If one is missing, tell the user what to install (nodejs.org LTS, git-scm.com) and stop.
3. If the folder is not empty and has code in it, say so: the kit does not overwrite existing files, it puts `.kit-new` next to conflicting ones; after the install, use `/adopt` instead of `/start`.
4. Show the full path of the folder (warn if it is a place like the home folder or the desktop) and get approval: "`.claude/`, `CLAUDE.md`, `AGENTS.md` and `docs/` will be copied into <path>, a line will be added to `.gitignore`, and a git repository will be created if there is none."
5. If approved, run: `npx --yes tillerhand@latest init`. Which tool (Claude Code, Codex, Antigravity) will be used is asked during `/start`.
6. Summarize the output and give the last step: the kit's commands and protections load in a new session. Open a new session in the same folder, then type `/start <your idea>` in an empty project or `/adopt` in a project with code.

After the install, this plugin is no longer needed; it can be turned off from the `/plugin` menu if you like.
