---
description: Runs the go-live checklist; does the automatic checks, asks about the rest.
argument-hint: [first] (empty = every-release check)
---

Mode: $ARGUMENTS (empty = section A only, every release; `first` = sections A + B, first launch)

Source lists: `docs/operations/release-checklist.md`, `docs/architecture/stack.md` → "Go live (extra)", `docs/security/checklist.md` (all of it on first launch), and if present `docs/ai/guide.md` → "Go live (add-on)" and `docs/product/launch.md`.

0. **Model and effort** (`docs/workflow/models.md`): ask the two screens from `/build` step 0b and record them. Audit agents (board, `security-auditor`) run with the review role.
1. **Run what can be checked automatically:**
   - In `first` mode, read the limit first; a full audit is expensive (`docs/workflow/usage-limits.md`). If `node .claude/hooks/tools.mjs --required security` reports it is off, ask to switch it on. If the board is set up, hold a **go-live board meeting** (the full board, `.claude/board/rules.md`).
   - In `first` mode, first suggest `/findings-all security,legal,perf` (with its estimated cost); Critical findings in the reports block the release.
   - In `first` mode, optional: an architecture map for humans via Understand-Anything, for the person who will take over maintenance after release (`release` package; `/understand --language en`, then `/understand-onboard`). The first run reads all the code: state the cost and ask.
   - In `first` mode, start in parallel: the `security-auditor` subagent (whole codebase; do not run it again if it already joins the board meeting), the `security-review` skill, `ponytail:ponytail-audit` (quality, places that break under load); if there is an interface, `impeccable:impeccable` → `audit` (accessibility, performance, responsive)
   - Status of the last CI run (`gh run list --branch main --limit 1`, if gh is installed)
   - Lint, type check, tests, build (`AGENTS.md` → Commands)
   - Dependency vulnerability scan and Semgrep (`docs/security/checklist.md` §9)
   - Acceptance tests: are all MVP criteria green (JUnit report)? Do adversarial tests exist?
   - **RLS adversarial test (blocking):** If Supabase is used (`supabase/config.toml` exists), is `tests/security/rls.mjs` present and is the `rls` job in the last CI green? ❌ if the test is missing, red, or if a public table exists while the `TABLES` list is empty.
   - **Dev/prod separation (blocking):** Does the prod ref in `docs/operations/accounts.md` → "Environments (dev / prod)" appear in `.mcp.json`, `.claude/`, `.codex/`, `.agents/` or the code (`git grep -n "<prod ref>" -- . ":!docs/operations/accounts.md"`)? ❌ if it does; 👤 if the prod row is empty. Ask the user to confirm that the local `.env.local` points at the dev project (👤; the AI does not read `.env` files).
   - Is `docs/operations/accounts.md` complete, and is any date due within 30 days? Are risky features behind flags in `docs/operations/feature-flags.md`?
   - `docs/product/unit-economics.md`: is the contribution margin positive?
   - Secret scan (`docs/security/checklist.md` §9)
   - Leftover `console.log` / `print` / `debugger` / `TODO` / test data in the code
   - Do `.env.example` and the environment variable uses in the code match?
   - **Clean install test:** `git clone . "<temp folder>/clean"` (committed files only). There, run in order the dependency install from `README.md` → "Installation", the build and the tests (do not create `.env`; count steps that need environment variables as 👤). ❌ if the lock file, the version file (`.nvmrc` / `.python-version`) or a README step is missing. Delete the temp folder.
   - Are there uncommitted changes?
   - Is `CHANGELOG.md` current?
   - Is there a pending DB migration?
2. **Ask about what you cannot check** (panel settings, backup, domain, legal texts, store settings) with AskUserQuestion: Done / Not done / Not applicable to this project. For each, write in one line how I would check it. For multi-step setups I must do by hand (DNS, SPF/DKIM, store account, prod environment variables), prepare a step-by-step guide with `mattpocock-skills:wizard`.
   - **Deploy setup (`first`, if hosting or domain is not set up; before the report):** `docs/operations/deploy-setup.md` → only the section for the providers in `docs/architecture/stack.md`.
     1. Reopen the section's source pages with `source-research`. If a panel path, record value or plan limit changed, go by the current source; do not edit the file (the kit updates it), write the difference in the report.
     2. With `mattpocock-skills:wizard`, prepare the steps the user will do, in order: hosting project, environment variables, domain and DNS, backup and PITR, rollback drill. Follow "Rules" in the file: do not ask for a secret value, do not write it in chat or in a file; give only the variable name, the user enters the value in the panel. The user takes the prod database backup in their own terminal.
     3. Ask about each step with AskUserQuestion: Done / Later / Not applicable to this project. Record the result in `docs/operations/accounts.md` and in the report table.
     4. The rollback drill and restore from backup touch prod: do not start them without approval.
   - Did the texts going live (landing page, store description, emails) pass through `humanizer:humanizer`?
3. Give the report as a table:

| Item | Status | Note |
|---|---|---|
| ... | ✅ / ❌ / 👤 (you need to check) / ➖ | ... |

4. Last line: **Ready to release** or **Blockers: [❌ items]**.

**Deploy to Vercel (web, if there are no ❌):** If Vercel's git integration is on, merging to main already deploys; do not also deploy with the CLI. Otherwise:
1. Preview: `npx -y vercel@63.1.1 deploy` (version pinned; `docs/workflow/mcp-catalog.md`). Produce evidence on the preview URL: the main flow with Playwright CLI, `console` (no errors), desktop and mobile screenshots.
2. Ask the user: "The preview is ready, promote it to prod?" If approved, `npx -y vercel@63.1.1 promote <preview-url>` or `deploy --prod` (the shield asks again). Rollback path: `vercel rollback`.

Do not start a prod deploy without approval. Ask with **multi-select** which of the ❌ items to fix now. Update `docs/workflow/progress.md` and write the status block.
