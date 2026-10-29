---
description: Safely returns the project to its last working state (or a chosen point). History is not deleted, unfinished work is saved, and the rollback can be undone too.
argument-hint: [empty = show options | tag or commit]
---

Target: $ARGUMENTS

The user may not know git. Explain everything in plain language; if you use a git term, say what it means in one sentence.

1. Run `node .claude/hooks/checkpoint.mjs --list`.
2. **If no target was given, ask** (AskUserQuestion), at most 4 options:
   - The newest **working point** (Recommended). Those with a `checkpoint/...` tag are saved by `/build` and `/wrap-up` when tests are green. Write its note and date in the description.
   - The previous working point.
   - The last 1-2 commits; explain in one sentence what each one changed, from the commit message.

   If there is no working point, show the last commits and say so.
3. **Say beforehand what will happen:**
   - Changes made after the chosen point disappear from the files, but stay in history.
   - If there is unsaved work, it is stashed first (`git stash`); it can be brought back later.
   - Files that do not go into git, such as `.env`, are not touched.
   - This rollback can also be undone with `/rollback`.
4. If the user explicitly approves, run `node .claude/hooks/checkpoint.mjs --restore <target> --yes`.
5. Run the project's test command (`AGENTS.md` → Commands). Show the result: did it really return to a working state?
6. Write the rollback to `docs/workflow/progress.md` → "Done last session" (done last session) and "Watch out" sections: which point it returned to, why, the stashed work.
7. When done, give a short report:
   - which state it returned to,
   - the test result,
   - if there is stashed work, how to bring it back (`git stash pop`),
   - what to do to undo this.

Never: `git reset --hard`, `git push --force`, deleting the stash (`git stash drop/clear`). Pushing the rollback to the remote repo (push) needs a separate approval.
