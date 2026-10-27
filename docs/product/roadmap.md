# Roadmap

> Each task must be small enough to **finish in one session** (about 1-3 hours, 1-5 files).
> Split a task that looks big. Always give the AI a single task.
> Format: `- [ ] G-NNN: [ne] — kabul: [nasıl anlarım bitti?]` ("kabul" means acceptance.)
> Phase headings keep the word "Faz" (phase): the dashboard reads it.

## Faz 0 — Setup (skeleton)

- [ ] G-001: Repo, git, `.gitignore`, `.env.example` ready — kabul: first commit made
- [ ] G-002: Project skeleton set up, runs locally — kabul: the `dev` command starts without errors
- [ ] G-003: Lint, format, type check, test setup — kabul: all 4 commands work
- [ ] G-004: Pre-commit + CI (`docs/architecture/stack.md` → "Otomatik kontroller" (automatic checks)) — kabul: a trial commit with a secret is rejected; CI is green on GitHub
- [ ] G-005: **"Hello world" live** — kabul: the prod URL opens (set up the deploy pipeline on day one)
- [ ] G-006: Error tracking (Sentry etc.) connected — kabul: a test error shows up in the dashboard
- [ ] G-007: Design system moved into code (if there is an interface): `DESIGN.md` tokens in theme/CSS variables — kabul: a sample screen uses only tokens

## Faz 1 — Core (the must-haves of the MVP)

- [ ] G-010: [Auth: sign up / sign in / sign out] — kabul: [...]
- [ ] G-011: [Main data model + migration] — kabul: [...]
- [ ] G-012: [Main feature Ö-01] — kabul: [criteria in the PRD]
- [ ] G-019: Refactor round (end of phase) — kabul: `node .claude/hooks/budget.mjs --check` is clean across the whole repo; duplicate and unused code cleaned up; tests green

## Faz 2 — Finishing the MVP

- [ ] G-020: [Ö-02] — kabul: [...]
- [ ] G-021: Empty / error / loading states on all screens — kabul: [...]
- [ ] G-029: Refactor round (end of phase) — kabul: `node .claude/hooks/budget.mjs --check` is clean across the whole repo; duplicate and unused code cleaned up; tests green

## Faz 3 — Preparing for launch

- [ ] G-030: `docs/security/checklist.md` checklist complete
- [ ] G-031: `docs/legal/privacy-kvkk.md` texts published
- [ ] G-032: `docs/operations/release-checklist.md` checklist complete (`/release`)
- [ ] G-033: Backup + monitoring + alerts set up

## Faz 4 — After launch

- [ ] [Work that comes from the first user feedback]

## Idea pool (not planned)

- [Things that are "out of scope" in the PRD but could be done later]
