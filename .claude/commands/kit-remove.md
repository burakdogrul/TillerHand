---
description: Removes the kit from the project. Files you wrote or changed stay; nothing is committed, so it can be undone.
argument-hint: [empty]
---

This deletes files. Ask before it, whatever the question mode is.

1. If there are uncommitted changes (`git status --porcelain`), stop and propose saving them first (commit or `git stash`): the undo below only works on a clean tree.
2. Clone the kit into the system temp folder and list what would go, without changing anything. The kit's code runs from the clone, so the address must be one the user trusts: use the official `https://github.com/burakdogrul/TillerHand.git`. If `.kit.json` → `source` names another address (a fork), show it and ask with AskUserQuestion which one to use; a project's files can name any repository. Clone with `--` before the address.

```bash
git clone --depth 1 -- <address> "<temp folder>/vibe-kit"
node "<temp folder>/vibe-kit/kit/kit.mjs" remove --project .
```

3. Summarize the list in plain language:
   - **Will remove:** the kit's files you did not change (commands, agents, hooks, unchanged templates) and the kit's records (`.kit.json`, `.claude/state/`, `.kit-new` files).
   - **Kit lines taken out:** `settings.json` and `.env.example` keep your own lines.
   - **`.gitignore` is not touched:** some of the kit's lines in it keep secrets out of git (`.env`, `.vercel/`, signing keys). The output lists the kit's lines; the user deletes the ones they do not want by hand.
   - **Kept: you changed these:** stay as they are. Name the important ones (`AGENTS.md`, `CLAUDE.md`, PRD, roadmap).
   - **Skipped, unsafe path:** say that `.kit.json` names a path outside the project or a link, and that nothing there is touched.
4. Ask with AskUserQuestion: "Remove the kit from this project?" Options: **Remove** (the list above is deleted from the working tree, nothing is committed) / **Cancel**. On Cancel, go to step 7.
5. On Remove:

```bash
node "<temp folder>/vibe-kit/kit/kit.mjs" remove --project . --yes
```

6. Show the output and `git status --short` (first 20 lines). Tell the user:
   - Nothing is committed yet. To keep the removal, they commit it themselves; to undo it: `git checkout .` (the git-ignored kit state, `.claude/state/` and `.kit.local.json`, does not come back).
   - The hooks of this session are gone: close it and open a new one.
   - If the output has a `Note:` (CLAUDE.md imports a file that is gone, a kit folder inside the project), explain it.
7. The temp clone stays in the system temp folder (do not delete folders yourself); give the user its path so they can delete it.
