---
description: Brings an existing project (in progress, disliked or needing improvement) into the kit. Scans the code, derives the docs from the code, verifies by asking questions, and produces an alignment roadmap that brings tests and structure to the kit's layout.
argument-hint: [empty | short note about the project]
---

Note: $ARGUMENTS

This is a **9-step alignment wizard** (0-9). It is the counterpart of `/start` for existing code. It starts from the code, not from an idea, but the user still makes the decisions: Ask every decision per `docs/workflow/decision-protocol.md` and write it to `docs/decisions/log.md` the moment it is made. Application code changes only on a `try/*` branch: never on `main` in this wizard, except a `/fix-bug` for checks that Step 1 found already red. Files are moved only by the roadmap tasks in Phase 1.

**Two passes.** The user sees one improvement in their own code before the planning is finished.
- **First pass (this command, in one go):** language, narrator mode (0b), tool (0c), the Step 0 checks that need no question, Step 1, Step 2, Step 3 first pass, Step 4, Steps 4b-4c. That is at most 7 question rounds: (1) language; (2) narrator mode and tool; (3) type and the temporary structure allowance; (4) the `.kit-new` files; (5) purpose and what the user dislikes; (6) the old rules for `AGENTS.md`; (7) what to try first. Ask the questions of one round in one AskUserQuestion call.
- **Second pass (`/lock` runs it):** the other Step 0 items, the rest of Step 3, then Steps 5-9. They use what the trial showed. Until then: Light profile on the Pro plan, Standard on Max; quick scan; the recommended model setup. Say so in one line.

**Prerequisite:** The kit must be installed in this folder with `init` (`.kit.json` exists, `type` empty). If not installed, give the user the install command: `node <kit folder>/kit/kit.mjs init`. A new session must be opened after installation.

**Resuming:** If `docs/workflow/progress.md` → `**Active phase:** Setup (adopt)` and `**Setup step:**` is greater than 0, resume from that step. When a step ends, update this line (`N/9`) and the `**Last updated:**` line, then write the status block. At `4/9`: if the `chore: kit install (adopt)` commit is missing, resume at Step 4b; if no `try/*` branch exists, at Step 4c; with a `try/*` branch open, the first pass is over: continue the trial, and `/lock` runs the second pass.

**Respect existing code:** Installation does not overwrite the project's files; the kit's version is placed next to it as `<file>.kit-new`. Handle them one by one in Step 2.

---

## Step 0: Preparation

0. **Language (before anything else):** Apply the language question at the start of `/start` Step 0 exactly (question in English, Turkish / English / Other, `node .claude/hooks/lang.mjs --set <code>`, translation if needed). If a language is already chosen, do not ask again.
1. `docs/workflow/progress.md` → `**Active phase:** Setup (adopt)`, `**Setup step:** 0/9`.
2. **First pass:** apply these items from `/start` Step 0 exactly: narrator mode (0b), tool (0c), environment check (1, without its "application code found, suggest `/adopt`" stop), caveman (3). Read the limit (`/start` item 4) and report it in one line.
3. **Second pass:** apply these items from `/start` Step 0 exactly: Profile (0), auto memory (0d), model and effort (0e, the one question: the recommended setup, your saved default, or the panel; `docs/workflow/models.md`), plugins (2), code map (5), notifications (6), dashboard (6b). The code map is even more useful in an existing project; make "Install" the recommended option.
4. `/start` 0a (planning depth) is not asked here: the **Scan depth** question below takes its place. The limit read in item 2 feeds it.
5. **Scan depth** (second pass; the first pass always runs the quick scan): Read the limit again and ask. Show the estimated costs:
   - **Quick scan (Recommended, on Pro):** Structure, stack, tests, git history, docs. About 10-20% of the 5-hour limit. Already done in the first pass.
   - **Deep scan:** In addition to the quick scan, the selected findings reports (`/findings-tech`, `-security`, `-ux` etc.). About 8-15% more per report. Ask which reports to run with multi-select.
   Append the choice to the `**Profile:**` line (e.g. `Light · scan: Quick`).

## Step 1: Scan (read-only)

Do not read files in bulk: if the code map is connected, use it first; otherwise start from the package files, the folder tree and the entry points. Extract:
1. **Stack:** Language, framework, database, auth, hosting, package manager. Is there a lock file? Is the runtime version pinned (`.nvmrc`, `.python-version`, `engines`)?
2. **Structure:** Folder tree (2-3 levels), entry points, layers. How far is it from the kit's feature-based structure (`features/<feature>/`)?
3. **Features:** The user-visible feature list from routes, screens, API endpoints and models.
4. **Tests:** Is there a test setup? Run the tests and show the result: how many tests, how many red, which areas are covered. Also flag tests that have no verification line or that pass everything with mocks.
5. **Installability:** Setup steps in the README, `.env.example`, system dependencies.
6. **Git history:** Summary of the last 30 commits, active branches, most changed files (risky zones). Uncommitted changes of the project itself?
7. **Existing docs:** README, the old `CLAUDE.md` and `AGENTS.md` (they stay in place; the kit's versions have the `.kit-new` extension), the docs folder if any.
8. **Parts without source:** A compiled package, minified JS, an Electron ASAR or a dependency with lost source that entered the repo. List them if present. If their inside needs to be understood, suggest the rea CLI (`docs/workflow/mcp-catalog.md` → rea): only for parts the project owner owns or is authorized to inspect, checking the license. If the model refuses or falls back, ask the user with AskUserQuestion which part must be understood and why, then continue according to the answer.

Show the findings as a short table. In a quick scan do not dive into the code: only structure and summary.

## Step 2: Type and installation

1. Propose the type based on the scan and get it approved (web-saas / mobile / backend; is there an AI feature; if there are sales in Turkey or Turkish users, the Turkey add-on `tr`, details in `/start` Step 2).
2. **Temporary structure allowance** (same round as the type): The structure guard asks about every write outside `.claude/structure.json`, and the old folders are outside it until Phase 1 moves them. Ask: add the old folders to the `allow` list until the move ends (Recommended) / keep asking per write. This is a structure decision. The last task of Phase 1 deletes these lines.
3. Install: `node <kit folder>/kit/kit.mjs install --type <type> [--addons ai,tr] --project .` (the kit folder is in the `.kit.json` → `kit` field; if the field is `local`, the folder is in the git-ignored `.kit.local.json` → `kit`, and if that file is missing, the project was opened on another machine: ask the user for the kit folder or use `npx -y tillerhand@<.kit.json → version>`; if the field is `npx:tillerhand@<version>`, `npx -y tillerhand@<version> install ...`; if the version is not exactly in the form `1.2.3` and the same as `.kit.json` → `version`, stop and ask). If the tool was not chosen at `init`, add the choice from Step 0 as `--tool <list>`.
4. **`.kit-new` files:** For each one (except `CLAUDE.md` and `AGENTS.md`, which are in Step 4), summarize the difference and ask as a decision: take the kit's / keep the project's / merge. Examples: `.env.example` is usually merged; for `ci.yml`, compare what the existing CI does with the kit's. Then delete the `.kit-new` file.

## Step 3: Derive the docs from the code

Write what the code says as a draft, ask what cannot be understood from the code (AskUserQuestion, in rounds).

**First pass:** items 1 and 2. **Second pass:** items 3, 3b and 4.
1. **`docs/product/prd.md`:** Problem, target user, current features (from the code), draft acceptance criteria. Ask: Were the project's purpose and audience understood correctly? **What do you dislike, what do you want to improve?** (multi-select + free text). Which features are missing or unfinished?
2. **`docs/architecture/stack.md`:** Fill the "Chosen technologies" (chosen technologies) table with the current stack, from the code; no question. Choices different from the kit's catalog are not errors; proposing a change is a separate decision and is asked only if there is a serious reason (security, an end-of-life version, cost).
3. **`docs/architecture/overview.md`, `docs/product/glossary.md`:** Data model, services, main concepts.
3b. **Research (expensive step, optional):** Suggest `/research` for comparison with similar projects and competitors (quick: about 10-15% of the limit). Do it / Leave for later. Selected features go into Phase 3 in Step 8.
4. **README:** The "Requirements" and "Installation" sections (`/start` Step 4 item 3a). A missing lock file or version file becomes one of the first tasks in Step 8.

## Step 4: Rewrite AGENTS.md and CLAUDE.md

The shared rules are in `AGENTS.md` (read by Claude Code, Codex, Antigravity); `CLAUDE.md` imports it with `@AGENTS.md` and keeps only Claude Code-specific additions.

1. Take the kit's `AGENTS.md` (or `AGENTS.md.kit-new`) as the base; fill the project name, the one-sentence description and the "Commands" (commands) section. The gate and the trial read `dev`, `test`, `lint` and `type check` from there. `CLAUDE.md` becomes the kit's `CLAUDE.md.kit-new` version. If `init` wrote `@AGENTS.md.kit-new` into `CLAUDE.md` because of the project's `AGENTS.md`, change this line to `@AGENTS.md`.
2. Read the old `CLAUDE.md` (and the old `AGENTS.md` if any) and list the project-specific rules in them (code style, forbidden commands, package manager, environment notes, places to be careful). Filter out those that are the same as the kit's rules.
3. Ask the rest with **multi-select**: "Which of the old rules should go into the new AGENTS.md?" If any conflicts with a kit rule, point it out separately.
4. Add the selected ones to `AGENTS.md` as a `## Project rules` section (after "Core rules"; only the Claude Code-specific ones go to `CLAUDE.md`). Keep the old ones as `docs/archive/claude-md-old.md` (and `agents-md-old.md`), delete the `.kit-new` files.

## Step 4b: Kit install commit

1. If Step 1 found uncommitted changes of the project itself, ask first: commit them as they are / stash them. Never mix them into the kit commit.
2. Run `node .claude/hooks/gate.mjs --run`, then commit on `main`: `chore: kit install (adopt)`. The commit holds kit files and docs only, no application code.
3. The board members come in Step 7, so at this point the commit gate does not check the gate result: you do. Green: commit. Red only because of checks that Step 1 found already red (tests or lint): say so, record them as a Phase 0 finding and commit only after the user agrees. Red for any other reason: fix it first. If board members already exist, the hook stops a red gate; then offer `node .claude/hooks/commit-gate.mjs --skip "adopt: kit install, checks already red"`: the user is asked by the hook every time.

## Step 4c: First try

Set `**Setup step:**` to `4/9`. Before the trial, `git status --porcelain` must print nothing and the `chore: kit install (adopt)` commit must exist; otherwise go back to Step 4b.

Ask (round 7): which of the things the user dislikes should be tried first?
- If Step 1 found red checks (tests or lint), the recommended option is `/fix-bug` for them first, on `main`: `/lock` merges only when the gate is green.
- An item that touches sign-in, payment, personal data or data deletion, or fixes a bug, is not a trial: offer `/build` or `/fix-bug` for it (`try.md`).
- The existing `dev` command may reach a real database or service through `.env`. Ask in the same round, before starting it: use a local or test setup (Recommended) / the current one as it is.

Then run `.claude/commands/try.md` for the chosen item, on a `try/<topic>` branch; the old folders are the real folders here. Tell the user: "Try it and tell me what to change. When you like it, say `/lock`: it finishes the plan and hardens the code." The first pass ends here.

## Step 5: Tests and critical flows

1. Recall the test result from Step 1. Red tests and tests that verify nothing are recorded as findings.
2. Propose the critical flows (such as sign-in, payment, data save and delete; 3-7 flows) and get them approved with multi-select. Write them to `docs/quality/test-plan.md`.
3. **Ask the user the correct behavior of every critical flow** (concrete questions such as "What should happen if the password is wrong?"). The code's current behavior is not the source for tests: the code may be wrong. If the code and the answer conflict, write it as a finding and add the fix task to Step 8.
4. Rule: Before the structure is moved, end-to-end tests are written for these flows. After that, each task writes the test of the code it touches. Tests are not written in bulk for the whole project.

## Step 6: Deep scan (if chosen)

Run the findings reports chosen in Step 0 (`/findings-all <types>` or one by one). Take the critical and high findings as candidates for the roadmap in Step 8.

**Code map for humans (optional):** If the user wants to explore the code visually themselves, suggest Understand-Anything (`release` package: `node .claude/hooks/tools.mjs --required release`). `/understand` reads all the code on the first run and is expensive in a big project: state the cost and ask. There is no Turkish output; use `--language en`. Then `/understand-dashboard`. The code map (codebase-memory-mcp) is for the agent, this one is for humans; neither replaces the other.

## Step 7: Board and design (optional)

Expensive steps: state the cost first (`docs/workflow/usage-limits.md`), then ask: Do it / Do it light / Leave for later.
1. **Board:** `/start` Step 6.
2. **Design** (if there is a UI): First extract `DESIGN.md` from the existing UI (`impeccable:impeccable` → extract); then ask: keep the current design / improve / new direction (`/design general`).

## Step 8: Alignment roadmap → `docs/product/roadmap.md`

Rewrite the kit's "Phase 0" template for this project. Order matters, and each task names its command:
1. **Phase 0: Safe ground.** Lock file and version file, README setup steps, CI and pre-commit, the state of the red tests. A task that fits `/tweak` (up to 2 files and 30 lines, away from risky paths) is marked `/tweak`; the rest `/build`, red tests `/fix-bug`. Then a separate `/build` task for each critical flow: "AC-xx end-to-end test (by the correct behavior)".
2. **Phase 1: Move the structure.** The project is moved to the kit's folder structure (`docs/architecture/structure.md`). Each feature is a separate `/build` task (single session). Rules below.
3. **Phase 2: Findings.** Things the user dislikes, conflicts between the code and the correct behavior, and the critical items of the findings reports, in order of importance (`/build` or `/fix-bug`). The item tried in Step 4c is already locked: mark it done here.
4. **Phase 3 and after:** New features (gaps in the PRD), as user-visible slices: each goes `/try`, then `/lock` (AGENTS.md rule 6).

### Moving the structure (Phase 1)

- The move is done on its own branch, `adopt/structure`, opened from `main`. It is not a `try/*` branch: every commit on it goes through the gate and the board as usual.
- No new `/try` is opened while the move is in progress. One task at a time.
- At the end of each task the tests and the app must work. If the tests are green, the working point is saved (`checkpoint.mjs --save`). If it breaks, return with `/rollback`.
- The last task deletes the temporary `allow` lines from Step 2.
- **Merge into `main`:** ask the user first. Then, one command each:
  1. `git status --porcelain` must print nothing.
  2. On the branch, `node .claude/hooks/gate.mjs --run` must be green.
  3. `git switch main`, then `git merge --no-ff adopt/structure --no-commit`. The commit gate asks the user for the merge. A merge without squash keeps the reviewed commit of each feature, so `git blame` and a revert per feature still work.
  4. With the merge staged, `node .claude/hooks/gate.mjs --run` must be green, so `main` never holds a red merge. The board reviews it lightly (every commit in it was already reviewed), then `git commit`. If it is red: `git merge --abort`, fix on the branch, start again.
  5. `git merge-base --is-ancestor adopt/structure main` must exit 0. Only then: `git branch -d adopt/structure`.
- **Undo:** the whole move with `git revert -m 1 <merge commit>`, one feature with a revert of its own commit. Ask first.

Ask: "Which finding should Phase 2 start with?" Summarize the roadmap and get approval.

## Step 9: Closing

1. `docs/workflow/progress.md`: Active phase `Phase 0`, active task `G-001`, start step `9/9`, next step, pending decisions.
2. Run `node .claude/hooks/dashboard.mjs`.
3. Give a summary: type and stack, current test state, critical flows, rules moved to AGENTS.md, structure gap, the 3 most important findings, first task, remaining limit.
4. Suggest a commit: `docs: kit alignment (adopt)`.
5. Last line: "Continue:" and the command of the first task (`/tweak`, `/build`, `/fix-bug` or `/try`, as the roadmap says).
6. If a `try/*` branch is open (this pass runs inside `/lock`), skip 4 and 5 and go back to `/lock`.
