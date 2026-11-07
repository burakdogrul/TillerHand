---
description: Runs independent roadmap tasks at the same time, each in its own worktree session, and merges each finished one into main (a PR when GitHub is set up, a local merge otherwise).
argument-hint: [empty: pick tasks | merge <branch>]
---

Argument: $ARGUMENTS

Each task gets its own Claude Code session in its own git worktree (`.claude/worktrees/<id>/`, branch `worktree-<id>`). The kit picks the tasks and gives the start command; the user opens the sessions. The agent never runs `git worktree add` itself (the guard asks). Rules, gate and board work in a worktree as in the main checkout; a write from a worktree session into the main checkout is judged by the main checkout's rules.

## Empty argument: pick tasks (in the main checkout)

1. **Limit.** Read the limit. Say in one line that every session spends the same plan limit: on Pro at most 2 sessions at once, on Max 3. At yellow/red level suggest one task instead.
2. **Pick.** From `docs/product/roadmap.md`, offer the open tasks that are independent (AskUserQuestion, multi-select): each in a different feature folder, no shared file, no migration, schema, package, sign-in or payment change, not a `try/*` trial. Tasks that fail one of these are listed with the reason and are not offered.
3. **Task note.** For each chosen task write `docs/product/tasks/<id>.md`: the task, the acceptance criteria, the folders it may touch, an empty "Status", "Decisions" and "Changed files" section. Commit the notes on main (`docs: task notes for parallel work`) before any session starts, so every worktree has them.
4. **Start command.** For each task give both ways:
   - Desktop: a new session in this project with the Worktree switch on, first message `/build <id>`.
   - Terminal: `claude -w <id>`, then `/build <id>`.
   Each worktree approves the gate commands once on its own: the first `gate.mjs --run` there asks for it (`node .claude/hooks/gate.mjs --approve`, the user approves). In the new session, check that `docs/product/tasks/<id>.md` exists; if the worktree started from the remote's default branch and lacks it, run `git merge main` in the worktree. If `.worktreeinclude` does not exist, suggest one with `.env` in it (it copies ignored files into a new worktree). Do not read or copy `.env` yourself.
5. **Tool scan.** Test, lint and type-check tools that do not read `.gitignore` would also scan `.claude/worktrees/` from the main checkout (another task's half-done tests in the main gate). Before the first worktree, add `.claude/worktrees/**` to their exclude list (Vitest `exclude`, Jest `modulePathIgnorePatterns`, ESLint `ignores`, tsconfig `exclude`, pytest `norecursedirs`) and commit it with the task notes.
6. **Dev server.** Each worktree runs `dev` on its own `localhost` port (`docs/architecture/stack.md` → Commands; the stack's port flag or `PORT`). Write the port into the task note.

## In a worktree session (`/build <id>`)

The session start note says it is a worktree. Status, decisions, changed files, open issues, the PRD criteria met and the cost line (size S/M/L, start and end limit) go into the task note only; `progress.md`, `roadmap.md`, the PRD, the decision log, `docs/workflow/cost-log.md` and `CHANGELOG.md` are updated on main at merge (the structure guard asks before a write to them). Gate and board run at every commit as usual. When the task is done, tell the user to run `/parallel merge worktree-<id>` in the main checkout.

## `merge <branch>`: bring a finished task into main (in the main checkout)

1. **Branch and path.** The branch must match `^worktree-[\w-]+$`; refuse anything else, a `try/*` branch above all. Find its worktree path in `git worktree list --porcelain` (the `branch refs/heads/<branch>` entry); do not assume `.claude/worktrees/<id>`.
2. **Protected files.** List `git diff --name-only main...<branch>`. If it touches `.claude/`, `AGENTS.md`, `CLAUDE.md`, `.github/`, `.mcp.json` or `docs/workflow/board.md`, show those files with their diff and ask the user before going on: the branch's gate and board files run from here on.
3. **Clean.** `git status --porcelain` is empty in the main checkout and in the worktree. If main moved since the branch started, merge main into the branch in the worktree first and run `node .claude/hooks/gate.mjs --run` there again. Red: stop, the task goes back to its session.
4. **Choose the way.** A PR when `git remote get-url origin` is a GitHub address and `gh auth status` passes; otherwise local.
5. **PR way** (ask before pushing: it leaves the machine):
   - `git push -u origin <branch>`
   - `gh pr create --base main --head <branch>`, body from the task note (task, criteria, changed files, board result).
   - `gh pr checks --watch`. Red: the fix goes back to the worktree session.
   - Green: ask, then `gh pr merge --merge`, then on main `git pull --ff-only`.
6. **Local way:**
   - `git merge --no-ff <branch> --no-commit`
   - `node .claude/hooks/gate.mjs --run` on the prepared merge; the board meets light (`docs/workflow/board.md`).
   - Red or REJECT: `git merge --abort`, the task goes back to its session. Otherwise go on to step 7 and commit both in one merge commit.
7. **Shared docs.** From the task note: mark the task in `docs/product/roadmap.md` and its criteria in the PRD, update `docs/workflow/progress.md`, add the decisions to `docs/decisions/log.md`, the cost line to `docs/workflow/cost-log.md` and a line to `CHANGELOG.md`. Delete the task note. PR way: one `docs:` commit on main. Local way: in the same merge commit.
8. **Clean up.** Only when `git merge-base --is-ancestor <branch> main` exits 0: ask, then `git worktree remove <path from step 1>` and `git branch -d <branch>`. If either refuses (unsaved changes, unmerged branch), stop and tell the user why; do not use a stronger flag.

A `try/*` branch is never pushed and never gets a PR, in a worktree or not: only `/lock` merges it into main, locally.
