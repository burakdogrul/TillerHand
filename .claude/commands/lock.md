---
description: Reviews the code of a tried slice, hardens it on top with tests and real parts, and merges it into main.
argument-hint: [topic, empty = current try branch]
---

Topic: $ARGUMENTS (empty: the current `try/*` branch)

The tried code is not thrown away. It is checked first, then hardened on top. Run the steps below in this order; none is skipped. Read `docs/product/try/<topic>.md` first. Read the limit and state the estimated cost (`docs/workflow/usage-limits.md`).

## Setup

If `docs/workflow/progress.md` → `**Active phase:**` is Setup, finish the steps the setup command left for later before anything else, on this branch: `.claude/commands/adopt.md` if the phase is `Setup (adopt)`, otherwise `.claude/commands/start.md`. They now use what the trial showed.

## Criteria

From the behavior the user approved in the trial, write acceptance criteria (`AC-NN.N`) into `docs/product/prd.md`. Show them and get approval with AskUserQuestion. A changed criterion is a user decision.

## Review

1. Run `code-reviewer` on the whole slice: `git diff main...try/<topic>`. Add `security-auditor` if the slice touches sign-in, personal data, an external service, a webhook or an upload. Models: `docs/workflow/models.md`.
2. Show the user one line per file: **keep**, **fix** or **rewrite**, with the reason.
3. List every fake part: `Fake parts` in the note, `try:fake` markers and `*.fake.*` files. Read the deleted lines in the same diff: a removed `try:fake` marker must lead to real code.
4. Ask each decision the real parts need. Database, auth and payment are one-way doors: get the board's opinion first (AGENTS.md rule 1).
5. If the work does not fit one session, split it into `docs/product/roadmap.md` tasks, one per session, and run them in order on this branch.

## Tests

Follow `.claude/commands/build.md` step 2b. `test-writer` writes acceptance and adversarial tests from the criteria and does not read the implementation.

A test that is **green on first run** proves nothing yet: the code came first. Break the behavior in a temporary copy and show the test go red. Only then does it count; if it stays green, `test-writer` strengthens it.

## Harden

Follow `.claude/commands/build.md` steps 2c-7. Fix the review findings, turn the red tests green, replace every fake part with the real one, and add error, empty and loading states. If there is a UI, run the `/design` brief here if it was not done. Delete `docs/product/try/<topic>.md`: what matters now lives in the PRD. The gate lets trial code pass on a `try/*` branch, so confirm yourself that no `try:fake` marker and no `*.fake.*` file is left. Commit the result on the branch (`node .claude/hooks/commit-gate.mjs --skip "try round"`, then `git commit`); a gate result from a `try/*` branch never opens the commit gate.

## Merge

Ask the user first. Then, one command each:

1. `git status --porcelain` must print nothing: a dirty tree would travel to `main`. Then `git switch main`.
2. `git merge --squash try/<topic>`
3. `node .claude/hooks/gate.mjs --run`: it reads the whole repo for trial code and must be green. In an adopted project, if it is red only because of checks that were already red on `main` before the trial, do not commit: `git reset --merge` drops the staged squash and the branch keeps everything. Ask: fix them with `/fix-bug` on `main` first (Recommended), then merge again / commit anyway with `node .claude/hooks/commit-gate.mjs --skip "<reason>"`, which the hook asks every time.
4. The board reviews the staged change (`.claude/board/rules.md`), then `git commit`. The commit gate requires both and reads who wrote the tests.
5. Check that nothing was lost: `git diff --quiet try/<topic> main` must exit 0. Only then ask, and delete the branch with `git branch -D try/<topic>` (a squash leaves it looking unmerged).

Then finish with `.claude/commands/build.md` steps 8-9. Tell the user what is now safe in `main` and what to `/try` next.
