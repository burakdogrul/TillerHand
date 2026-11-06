# Roadmap

> Each task must be small enough to **finish in one session** (about 1-3 hours, 1-5 files).
> Split a task that looks big. Always give the AI a single task.
> Format: `- [ ] G-NNN: [what] — done when: [how do I know it is done?]`
> The dashboard reads the "## Phase N" headings; keep that form.

## Phase 0 — Setup (skeleton)

- [ ] G-001: Repo, git, `.gitignore`, `.env.example` ready — done when: first commit made
- [ ] G-002: Project skeleton set up, runs locally — done when: the `dev` command starts without errors
- [ ] G-003: Lint, format, type check, test setup — done when: all 4 commands work
- [ ] G-004: Pre-commit + CI (`docs/architecture/stack.md` → "Automatic checks") — done when: a trial commit with a secret is rejected; CI is green on GitHub
- [ ] G-007: Design system moved into code (if there is an interface): `DESIGN.md` tokens in theme/CSS variables — done when: a sample screen uses only tokens

## Phase 1 — Core (the must-haves of the MVP)

- [ ] G-010: [First slice: the main flow, `/try` then `/lock`] — done when: [criteria in the PRD]
- [ ] G-011: [Real sign-in and data, if not locked with the first slice: `/build`] — done when: [...]
- [ ] G-012: [Next slice AC-01, `/try` then `/lock`] — done when: [criteria in the PRD]
- [ ] G-019: Refactor round (end of phase) — done when: `node .claude/hooks/budget.mjs --check` is clean across the whole repo; duplicate and unused code cleaned up; tests green

## Phase 2 — Finishing the MVP

- [ ] G-020: [AC-02] — done when: [...]
- [ ] G-021: Empty / error / loading states on all screens — done when: [...]
- [ ] G-029: Refactor round (end of phase) — done when: `node .claude/hooks/budget.mjs --check` is clean across the whole repo; duplicate and unused code cleaned up; tests green

## Phase 3 — Preparing for launch

> The product opens to other people here, when the MVP is done. Until then only you try it, on your own computer.

- [ ] G-005: **First deploy** — done when: the prod URL opens
- [ ] G-006: Error tracking (Sentry etc.) connected — done when: a test error shows up in the dashboard
- [ ] G-030: `docs/security/checklist.md` checklist complete
- [ ] G-031: `docs/legal/privacy-kvkk.md` texts published
- [ ] G-032: `docs/operations/release-checklist.md` checklist complete (`/release`)
- [ ] G-033: Backup + monitoring + alerts set up

## Phase 4 — After launch

- [ ] [Work that comes from the first user feedback]

## Idea pool (not planned)

- [Things that are "out of scope" in the PRD but could be done later]
