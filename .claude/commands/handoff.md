---
description: Hands the project over to another person or account (writes a handoff note) or takes it over (`/handoff take`). For a teammate, a company account, or continuing from the same place after an account closes.
argument-hint: [empty = hand over | take]
---

Mode: $ARGUMENTS (empty = hand over, `take` = take over; the pre-3.48 `devral` still means take over). Any other argument: do nothing, show these two modes.

The project's state lives in files and git, not in the chat. A handoff means leaving these files complete and current, and rebuilding the environment on the receiving side. **Never write secret values into the note, code or chat**; write only their names and where to get them.

## Hand over (no argument)

1. Apply the `/wrap-up` steps (progress, roadmap, decisions, CHANGELOG). If there is unfinished work, fill in "Where we left off" (where we left off).
2. Write `docs/workflow/handoff.md` (overwrite if it exists):

```markdown
# Handoff note

**Status:** waiting
**Date:** YYYY-MM-DD
**Handed over by:** [name or role]

## Where we left off
- Active phase and task, last finished tasks, unfinished work (file and step)

## Pending decisions
- ...

## What the receiver needs
- Accounts and access: the services in `docs/operations/accounts.md`; who needs to invite
- Environment variables: the names in `.env.example` and where to get each one (no values)
- System dependencies and setup: `README.md` → Requirements / Installation
- Local settings (not in git): narrator mode, code map, MCP connections

## Watch out
- Known issues, risky areas, things not to do
```

2b. **Optional, if the receiver will see the code for the first time:** an onboarding guide with Understand-Anything (`release` package: `node .claude/hooks/tools.mjs --required release`). `/understand --language en` reads all the code on the first run and is expensive on a large project: state the cost and ask. Then `/understand-onboard`; write the output path into the "What the receiver needs" section of the handoff note.
3. If there are uncommitted changes, suggest a commit: `docs: handoff note`. If a remote repo exists, suggest a push (get approval). If there is no push, tell the receiver how to get the project (repo invite or folder copy; the `.env` file is not copied).
4. Give the user the single line to pass to the receiver: "Clone the repo, open it in Claude Code, type `/handoff take`."

## Take over (`/handoff take`)

1. Read `docs/workflow/handoff.md` and summarize: where things stand, pending decisions, things to watch. If the note has an Understand-Anything onboarding guide, give its path; for a visual map use `/understand-dashboard` (`release` package).
2. Set up the environment, reporting each step in one line:
   - `node --version`, `git --version`; do they match the runtime version in the README (`.nvmrc` / `.python-version`)?
   - Plugins: list the missing ones with `node .claude/hooks/plugins-sync.mjs`, install with approval via `--install`, then `/reload-plugins`. Package preferences are personal and do not come with the handoff: show the ones needed with `/tools`.
   - Dependencies: the install command in README → "Installation" (from the lock file).
   - Environment variables: list the names in `.env.example`. Do not create or read the `.env` file yourself; the user enters the values (where to get them is in the handoff note).
   - Accounts: show the accesses in the handoff note as a list; mark those waiting for an invite.
   - Personal settings: narrator mode (`/start` Step 0b) and the code map (Step 5) are asked separately for this user.
3. Run the tests and show the result. If red, compare with "Watch out" in the handoff note.
4. If there are pending decisions, ask them now.
5. In `docs/workflow/handoff.md`, set `**Status:** taken over` (a pre-3.48 note: `**Durum:** devralındı`) and add a `**Received by:**` line. Suggest a commit: `docs: handoff received`.
6. Last line: the next command (`/build G-NNN`, or continue from "Where we left off" if it is filled in).
