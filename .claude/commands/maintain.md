---
description: Runs the regular maintenance check and adds it to the maintenance log.
argument-hint: [weekly | monthly | quarterly]
---

Maintenance type: $ARGUMENTS (`weekly` if empty).

Source: the relevant section of `docs/operations/maintenance.md` + `docs/architecture/stack.md` → "Bakım" (maintenance). `monthly` includes the weekly items, `quarterly` includes all.

1. **Do what you can automatically:**
   - List outdated dependencies (`npm outdated` / `uv tree --outdated` etc.)
   - Dependency security scan
   - Do tests and build still pass?
   - Scan for dead code, unused environment variables, unused dependencies
   - Do `docs/workflow/progress.md` and `docs/architecture/overview.md` match the code?
   - Open Dependabot PRs (`gh pr list --author app/dependabot`, if gh is installed): propose merging the ones with green CI
   - If MCP is connected, look yourself: new or rising errors of the period in Sentry, security and performance warnings in Supabase (read-only)
   - `monthly`: clean install test (`/release` → "Temiz kurulum testi" (clean install test) item); list deferred shortcuts with `ponytail:ponytail-debt`; duplicate code ratio with `npx --yes jscpd@4 --silent .`; period row in `docs/quality/metrics.md` (definitions are in the file); `docs/product/unit-economics.md` with real invoices; expired feature flags; unprocessed feedback (`/user-feedback`); context budget (`node .claude/hooks/tools.mjs --measure`, suggest `/context` and `/skill-doctor` to the user; suggest closing a package that stayed open all month but went unused); learned rules: list the lines of `AGENTS.md` → "Öğrenilen kurallar" and the `.claude/hookify.*.local.md` files dated older than 90 days (undated ones included), and ask for each: Keep (set the date to today: the date is the last review) / Update / Delete. If "Öğrenilen kurallar" passed 10 lines, propose merging similar ones (every line loads in every session). Wrong or no-longer-valid rules must not pile up; never delete without approval
   - In every type: dates in `docs/operations/accounts.md` that expire within 30 days
   - `quarterly`: full scan with `/findings-all` (or at least tech + security); compare health scores with the previous quarter
2. **Ask about items you cannot reach** (uptime, cost dashboards, backups, certificate/card expiry dates) with AskUserQuestion (No problem / Problem / Could not check); wait for my answers.
3. Give proposals for updates: safe ones (patch/minor version) and risky ones (major) separately. Ask which to apply with **multi-select**. Do not update without approval.
4. Add the findings to the "Bakım kaydı" (maintenance log) table in `docs/operations/maintenance.md` with today's date.
5. Propose the items that need action as tasks in `docs/product/roadmap.md`.

Summary: 🔴 urgent / 🟡 this month / 🟢 no problem.
