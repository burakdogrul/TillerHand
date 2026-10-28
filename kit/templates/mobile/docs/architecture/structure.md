# Project structure: Mobile (Expo Router)

> This file is the human-readable description of the `.claude/structure.json` map; update both together.
> Following the structure is mandatory: the hook checks at write time, CI on every PR, the board Architect and `/findings-tech` also check.

## Code

```
src/
├── app/                        # ONLY screens and navigation (Expo Router). No business logic.
│   ├── (auth)/
│   ├── (tabs)/
│   └── _layout.tsx
├── features/
│   └── <feature>/              # e.g. invoice/
│       ├── components/
│       ├── hooks/
│       ├── api/                # server calls (TanStack Query queries and mutations)
│       ├── store/              # local state (Zustand slice)
│       ├── __tests__/
│       ├── schemas.ts
│       ├── types.ts
│       └── index.ts
├── components/                 # shared components: Button, TextField, Screen, EmptyState...
├── hooks/                      # shared hooks (useBayrak etc.)
├── lib/                        # supabase, sentry, secure storage, analytics clients
├── theme/                      # design tokens (from DESIGN.md)
├── config/                     # environment variables, constants
└── types/
assets/                         # icon, splash, font, images
.maestro/                       # end-to-end flows (acceptance tests)
tests/                          # shared test helpers
app.config.ts  eas.json
```

## Common to every project

```
.
├── .claude/               # Claude Code: commands, agents, hooks, board, findings, structure.json
├── .github/               # CI, Dependabot, cloud agents
├── docs/
│   ├── product/           # prd, roadmap, glossary, launch, feedback, unit-economics
│   ├── architecture/      # overview, stack, structure (this file)
│   ├── design/            # design-guide (if there is an interface)
│   ├── decisions/         # log.md (decision log) + adr-NNNN-*.md (detailed decisions)
│   ├── quality/           # test-plan, metrics, retros
│   ├── security/          # checklist
│   ├── legal/             # privacy-kvkk
│   ├── operations/        # release-checklist, maintenance, accounts, feature-flags
│   ├── workflow/          # progress, decision-protocol, skills, board, usage-limits, cost-log
│   ├── findings/          # /findings-* reports (type/date.md, latest.md)
│   └── archive/           # documents that are no longer valid but kept
├── sandbox/               # trials, exploration code, temporary scripts (not committed to git)
├── AGENTS.md  CLAUDE.md  README.md  CHANGELOG.md
└── .env.example
```

## Rules

1. **A new file goes to its place in the map.** Writing outside the `.claude/structure.json` map is asked about; clutter patterns (`*.bak`, `*-old.*`, `* copy*`, `temp/`, `deneme*`) are blocked. CI checks the whole repo on every PR.
2. **By feature.** Everything that belongs to a feature (component, logic, test) lives under `features/<feature>/`. When two features start using the same code, it moves to the shared layer (`components/`, `lib/`, `shared/`).
3. **Features do not reach into each other.** `features/a` does not import another feature's internal files; it uses only what that feature exposes through its `index` file.
4. **Naming:** Folders and files use `kebab-case`. React component files may be `PascalCase.tsx`; Python modules use `snake_case.py`. A feature folder name is singular and in English (`invoice`, `customer`).
5. **Temporary and unrelated work** goes under `sandbox/`. If something useful comes out of it, it moves to the right place; `sandbox/` is cleaned regularly.
6. **Old documents** are not deleted; they move under `docs/archive/`, with a line at the top saying why they were archived.
7. **Changing the map** (a new top-level folder, a new layer) is a `tech` decision: ask the user, record it under `docs/decisions/`, then update `.claude/structure.json` and this file.
