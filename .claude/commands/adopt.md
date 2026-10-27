---
description: Brings an existing project (in progress, disliked or needing improvement) into the kit. Scans the code, derives the docs from the code, verifies by asking questions, and produces an alignment roadmap that brings tests and structure to the kit's layout.
argument-hint: [empty | short note about the project]
---

Note: $ARGUMENTS

This is a **9-step alignment wizard** (0-9). It is the counterpart of `/start` for existing code. It starts from the code, not from an idea, but the user still makes the decisions: Ask every decision per `docs/workflow/decision-protocol.md` and write it to `docs/decisions/log.md` the moment it is made. Do not change application code or move files in this session. Moves and fixes are done with the roadmap tasks, through `/build`.

**Prerequisite:** The kit must be installed in this folder with `init` (`.kit.json` exists, `type` empty). If not installed, give the user the install command: `node <kit folder>/kit/kit.mjs init`. A new session must be opened after installation.

**Resuming:** If `docs/workflow/progress.md` → `**Aktif faz:** Başlangıç (uyum)` and `**Başlangıç adımı:**` is greater than 0, resume from that step. When a step ends, update this line (`N/9`) and the `**Son güncelleme:**` line, then write the status block.

**Respect existing code:** Installation does not overwrite the project's files; the kit's version is placed next to it as `<file>.kit-new`. Handle them one by one in Step 2.

---

## Step 0: Preparation

0. **Language (before anything else):** Apply the language question at the start of `/start` Step 0 exactly (question in English, Turkish / English / Other, `node .claude/hooks/lang.mjs --set <code>`, translation if needed). If a language is already chosen, do not ask again.
1. `docs/workflow/progress.md` → `**Aktif faz:** Başlangıç (uyum)`, `**Başlangıç adımı:** 0/9`.
2. Apply these items from `/start` Step 0 exactly: Profile (0), narrator mode (0b), tool (0c), auto memory (0d), model and effort (0e, `docs/workflow/models.md`), environment check (1), plugins (2), caveman (3), code map (5), notifications (6), dashboard (6b). The code map is even more useful in an existing project; make "Install" the recommended option.
3. **Scan depth:** Read the limit and ask. Show the estimated costs:
   - **Quick scan (Recommended, on Pro):** Structure, stack, tests, git history, docs. About 10-20% of the 5-hour limit.
   - **Deep scan:** In addition to the quick scan, the selected findings reports (`/findings-tech`, `-security`, `-ux` etc.). About 8-15% more per report. Ask which reports to run with multi-select.
   Append the choice to the `**Profil:**` line (e.g. `Hafif · tarama: Hızlı`).

## Step 1: Scan (read-only)

Do not read files in bulk: if the code map is connected, use it first; otherwise start from the package files, the folder tree and the entry points. Extract:
1. **Stack:** Language, framework, database, auth, hosting, package manager. Is there a lock file? Is the runtime version pinned (`.nvmrc`, `.python-version`, `engines`)?
2. **Structure:** Folder tree (2-3 levels), entry points, layers. How far is it from the kit's feature-based structure (`features/<özellik>/`)?
3. **Features:** The user-visible feature list from routes, screens, API endpoints and models.
4. **Tests:** Is there a test setup? Run the tests and show the result: how many tests, how many red, which areas are covered. Also flag tests that have no verification line or that pass everything with mocks.
5. **Installability:** Setup steps in the README, `.env.example`, system dependencies.
6. **Git history:** Summary of the last 30 commits, active branches, most changed files (risky zones).
7. **Existing docs:** README, the old `CLAUDE.md` and `AGENTS.md` (they stay in place; the kit's versions have the `.kit-new` extension), the docs folder if any.
8. **Parts without source:** A compiled package, minified JS, an Electron ASAR or a dependency with lost source that entered the repo. List them if present. If their inside needs to be understood, suggest the rea CLI (`docs/workflow/mcp-catalog.md` → rea): only for parts the project owner owns or is authorized to inspect, checking the license.

Show the findings as a short table. In a quick scan do not dive into the code: only structure and summary.

## Step 2: Type and installation

1. Propose the type based on the scan and get it approved (web-saas / mobile / backend; is there an AI feature; if there are sales in Turkey or Turkish users, the Turkey add-on `tr`, details in `/start` Step 2).
2. Install: `node <kit folder>/kit/kit.mjs install --type <type> [--addons ai,tr] --project .` (the kit folder is in the `.kit.json` → `kit` field; if the field is `local`, the folder is in the git-ignored `.kit.local.json` → `kit`, and if that file is missing, the project was opened on another machine: ask the user for the kit folder or use `npx -y tillerhand@<.kit.json → version>`; if the field is `npx:tillerhand@<version>`, `npx -y tillerhand@<version> install ...`; if the version is not exactly in the form `1.2.3` and the same as `.kit.json` → `version`, stop and ask). If the tool was not chosen at `init`, add the choice from Step 0 as `--tool <list>`.
3. **`.kit-new` files:** For each one (except `CLAUDE.md` and `AGENTS.md`, which are in Step 4), summarize the difference and ask as a decision: take the kit's / keep the project's / merge. Examples: `.env.example` is usually merged; for `ci.yml`, compare what the existing CI does with the kit's. Then delete the `.kit-new` file.

## Step 3: Derive the docs from the code

Write what the code says as a draft, ask what cannot be understood from the code (AskUserQuestion, in rounds):
1. **`docs/product/prd.md`:** Problem, target user, current features (from the code), draft acceptance criteria. Ask: Were the project's purpose and audience understood correctly? **What do you dislike, what do you want to improve?** (multi-select + free text). Which features are missing or unfinished?
2. **`docs/architecture/stack.md`:** Fill the "Seçilen teknolojiler" (chosen technologies) table with the current stack. Choices different from the kit's catalog are not errors; proposing a change is a separate decision and is asked only if there is a serious reason (security, an end-of-life version, cost).
3. **`docs/architecture/overview.md`, `docs/product/glossary.md`:** Data model, services, main concepts.
3b. **Research (expensive step, optional):** Suggest `/research` for comparison with similar projects and competitors (quick: about 10-15% of the limit). Do it / Leave for later. Selected features go into Phase 3 in Step 8.
4. **README:** The "Gereksinimler" (requirements) and "Kurulum" (installation) sections (`/start` Step 4 item 3a). A missing lock file or version file becomes one of the first tasks in Step 8.

## Step 4: Rewrite AGENTS.md and CLAUDE.md

The shared rules are in `AGENTS.md` (read by Claude Code, Codex, Antigravity); `CLAUDE.md` imports it with `@AGENTS.md` and keeps only Claude Code-specific additions.

1. Take the kit's `AGENTS.md` (or `AGENTS.md.kit-new`) as the base; fill the project name, the one-sentence description and the "Komutlar" (commands) section. `CLAUDE.md` becomes the kit's `CLAUDE.md.kit-new` version. If `init` wrote `@AGENTS.md.kit-new` into `CLAUDE.md` because of the project's `AGENTS.md`, change this line to `@AGENTS.md`.
2. Read the old `CLAUDE.md` (and the old `AGENTS.md` if any) and list the project-specific rules in them (code style, forbidden commands, package manager, environment notes, places to be careful). Filter out those that are the same as the kit's rules.
3. Ask the rest with **multi-select**: "Which of the old rules should go into the new AGENTS.md?" If any conflicts with a kit rule, point it out separately.
4. Add the selected ones to `AGENTS.md` as a `## Proje kuralları` section (after "Core rules"; only the Claude Code-specific ones go to `CLAUDE.md`). Keep the old ones as `docs/archive/claude-md-eski.md` (and `agents-md-eski.md`), delete the `.kit-new` files.

## Step 5: Tests and critical flows

1. Recall the test result from Step 1. Red tests and tests that verify nothing are recorded as findings.
2. Propose the critical flows (such as sign-in, payment, data save and delete; 3-7 flows) and get them approved with multi-select. Write them to `docs/quality/test-plan.md`.
3. **Ask the user the correct behavior of every critical flow** (concrete questions such as "What should happen if the password is wrong?"). The code's current behavior is not the source for tests: the code may be wrong. If the code and the answer conflict, write it as a finding and add the fix task to Step 8.
4. Rule: Before the structure is moved, end-to-end tests are written for these flows. After that, each task writes the test of the code it touches. Tests are not written in bulk for the whole project.

## Step 6: Deep scan (if chosen)

Run the findings reports chosen in Step 0 (`/findings-all <types>` or one by one). Take the critical and high findings as candidates for the roadmap in Step 8.

**Code map for humans (optional):** If the user wants to explore the code visually themselves, suggest Understand-Anything (`yayin` package: `node .claude/hooks/tools.mjs --required yayin`). `/understand` reads all the code on the first run and is expensive in a big project: state the cost and ask. There is no Turkish output; use `--language en`. Then `/understand-dashboard`. The code map (codebase-memory-mcp) is for the agent, this one is for humans; neither replaces the other.

## Step 7: Board and design (optional)

Expensive steps: state the cost first (`docs/workflow/usage-limits.md`), then ask: Do it / Do it light / Leave for later.
1. **Board:** `/start` Step 6.
2. **Design** (if there is a UI): First extract `DESIGN.md` from the existing UI (`impeccable:impeccable` → extract); then ask: keep the current design / improve / new direction (`/design genel`).

## Step 8: Alignment roadmap → `docs/product/roadmap.md`

Rewrite the kit's "Faz 0" template (Phase 0) for this project. Order matters:
1. **Phase 0: Safe ground.** Lock file and version file, README setup steps, CI and pre-commit, the state of the red tests. Then a separate task for each critical flow: "Ö-xx end-to-end test (by the correct behavior)".
2. **Phase 1: Move the structure.** The project is moved to the kit's folder structure (`docs/architecture/structure.md`). Each feature is a separate task (single session). Rules:
   - The move is done on a separate branch (`uyum/yapi`).
   - At the end of each task the tests and the app must work. If the tests are green, the working point is saved (`checkpoint.mjs --save`). If it breaks, return with `/rollback`.
   - Until the move ends, the old folders are temporarily added to the `.claude/structure.json` → `allow` list (so the CI structure check does not stay red). This is a structure decision: ask the user. The last task of Phase 1 is deleting these temporary lines.
3. **Phase 2: Findings.** Things the user dislikes, conflicts between the code and the correct behavior, and the critical items of the findings reports, in order of importance.
4. **Phase 3 and after:** New features (gaps in the PRD).

Ask: "Which one should we start with in Phase 2?" Summarize the roadmap and get approval.

## Step 9: Closing

1. `docs/workflow/progress.md`: Active phase `Faz 0`, active task `G-001`, start step `9/9`, next step, pending decisions.
2. Run `node .claude/hooks/dashboard.mjs`.
3. Give a summary: type and stack, current test state, critical flows, rules moved to AGENTS.md, structure gap, the 3 most important findings, first task, remaining limit.
4. Suggest a commit: `docs: kit uyumu (adopt)`.
5. Last line: "Continue: `/build G-001`".
