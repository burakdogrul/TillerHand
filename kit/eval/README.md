# Kit evaluation

Runs the same task with and without the kit and scores the result with hidden tests. It exists to measure the kit's claim of "fewer open points, more tests". Perception and measurement are different things: this table must show that the kit works.

```bash
node kit/eval/run.mjs                      # 6 tasks × 2 conditions, Sonnet
node kit/eval/run.mjs --repeat 3           # 3 runs per cell: mean and range
node kit/eval/run.mjs --task bug-sort --cond kit --model haiku
node kit/eval/run.mjs --dry                # preparation and scoring without running Claude
```

The result goes to `kit/eval/results/<date>-<time>-v<version>-<model>.md` and `.json`: first a task × condition summary, then a run-by-run table. After each task, the partial result is saved to `.partial.json` in the temp folder (the path is printed at the start of the run). The report header lists the Claude Code and Node versions and the loaded plugins. `--keep` leaves the run folder in place; the transcript is in the `eval-stream.jsonl` file in that folder.

A run spends from the Claude subscription. In the first measurement, 6 Sonnet runs used about 14% of the Pro plan's 5-hour window (2026-10-24). The cap per run is 2 dollars (`--max-budget-usd`).

## How it works

- **Fixture** (`fixture/`): a small notes API with no dependencies (`node:http`, `node:test`), in the web-saas folder layout. It reads the identity from the `x-user` header.
- **Tasks** (`tasks/<id>/`): `prompt.md` is the task text, `hidden.test.mjs` is the hidden test, `task.json` says which command to use in the kit condition. `solution/` is the reference solution: copied over the fixture, it turns the hidden tests green. `mutants/<name>/` are copies of the reference solution with one bug planted: the hidden tests catch them, the fixture's own tests do not (`kit/tests/eval.test.mjs` checks all of them).
  - `bug-sort`: a sorting bug (the comparator returns a boolean). Command: `/fix-bug`.
  - `feature-tags`: a tag feature across 3+ files. It includes the Turkish lowercase rule, validation, a filter and a count. Command: `/build`.
  - `security-owner`: a hole that lets users read, change and delete other people's notes (IDOR). The tests are written from the attacker's point of view. Command: `/build`.
  - `trash` (implicit requirement): a trash bin with 30-day restore. The text only says "it must be restorable"; the tests check that a deleted note is absent from the live list, from reads and from edits, and that the 30 days are counted from deletion (the test moves time with `mock.timers`). The fixture already passes one of these tests: the agent must not break it. Command: `/build`.
  - `paging` (multi-step contract): `limit`/`cursor` paging. First the sorting bug in the fixture must be fixed. Then there must be no repeats or gaps with equal dates, or when a new note is added between two requests. The response must stay an array for old clients. Command: `/build`.
  - `tr-sort` (trap): alphabetical sort by title and case-insensitive search; in Turkish, `localeCompare` and `toLowerCase` give wrong results without a locale (`I`/`ı`, `İ`/`i`, `ç`, `ş`). Command: `/build`.
- **Conditions:** Every run starts in a fresh temp folder.
  - `kit`: runs `init` + `install --type web-saas`, then writes the state `/start` would leave: stack, `AGENTS.md` → Commands, question mode closed, gate approval for the command.
  - `plain`: the fixture alone.
  - Both conditions run as `claude -p` with the same model and the same `--allowedTools` list, with project settings only (`--setting-sources project,local`).
  - Permissions are narrow. Reading and writing stay inside the run folder. In Bash, only `npm test`/`npm start`, `node --test`, `node src/…`, `node tests/…`, `node .claude/hooks/…` and read-only git work. Easy ways out of the folder are forbidden: `node -e`, `..`, `git --output`/`--no-index`, `npm --prefix`/`--script-shell`. In both conditions `.git/` and `.claude/` cannot be edited.
  - **This is not a security boundary.** Code the agent writes (`npm test`, `package.json` scripts) runs with your user rights and your environment variables. The rules only make an accidental write outside the folder harder.
  - Each condition gets a free `PORT` from its own port range (3100-3109 and 3110-3119). When the run ends, the process listening on that port is stopped and the gate approval record is deleted.
- **Score:**
  - hidden tests (if no test runs, 0/0, the row counts as an error)
  - the fixture's original visible tests (the copy the agent changed does not count)
  - the agent's own test suite
  - number of tests added (`test(` blocks)
  - killed mutants: the agent's tests run on the reference solution and on each mutant; a test that passes on the solution and turns red on a mutant kills it. This measures test quality: not "a test exists" but "the test catches the bug".
  - bug-catching test: a test that passes on the agent's own code and does not pass on the unchanged fixture. Tests that cannot load on the fixture because they import a new module also count. A broken test that is red on both does not count.
  - test first: in the transcript, did the first test file write (`*.test.*` or `__tests__/`) come before the first code write under `src/`? This rests on the transcript, not on the agent's own statement.
  - gate: did the agent run `gate.mjs --run` (kit condition only)
  - changed code files and lines
  - cost (API equivalent), time, turns and tokens

## Limits

- By default each cell is a single run (n=1); `--repeat 3` shows the range. If the ranges overlap, do not read the difference as real.
- The `paging` score includes the sorting bug in the fixture: an agent that does not fix the sorting fails 2 of the 4 tests. This measures the same skill as `bug-sort` once more; read the two tasks together in the summary table.
- To keep the time measurement fair, scoring is done one by one after the agents in all conditions of a task have finished.
- The mutant measurement counts only tests written against the reference solution's interface (over HTTP, or with the same functions of `createStore`). A test that depends on a module or parameter the agent added itself (for example `createStore(clock)`) does not load on the reference solution or stays red, and is not counted. This may explain part of a low mutant count.
- There is no user in a headless run. The kit's value in asking questions and getting approval is not measured; question mode is closed.
- In the kit condition, the plugins that are enabled in the kit's `settings.json` and installed at user scope are loaded. Plugins installed at project scope (security-guidance, hookify) are not loaded. The loaded ones are listed at the top of the report.
- The board is not set up: the end-of-task board meeting is not measured.
- The temp folder is treated as untrusted: the kit's `allow` rules do not apply, the `ask` and `deny` rules do (in a headless run `ask` means refusal), and hooks run.
- If the agent starts the server on a fixed port instead of `PORT`, that process may stay open after the run. A run cut off with Ctrl+C does no cleanup: the temp folder, the approval record (`~/.vibe-kit/gate-approval/`) and an open process may remain.
- Narrow permissions occasionally trip the agent: commands like `cd <absolute path> && ls` and `git -C <path> log` stay unapproved, and the agent falls back to plain commands. This is equal in both conditions but may raise the turn count a little.
- The score reads tests from under `tests/`. If the agent writes a test under `src/**/__tests__/`, "test first" sees it; the own-tests, added-tests and catching-tests columns do not.
- Result files go into the repo. In error and summary texts, the temp folder is masked as `<tmp>` and the user folder as `~`.
