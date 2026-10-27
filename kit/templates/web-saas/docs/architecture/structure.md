# Project structure: Web / SaaS (Next.js App Router)

> This file is the human explanation of the `.claude/structure.json` map; the two are updated together.
> Following the structure is mandatory: the hook checks at write time, CI on every PR, the board Architect and `/findings-tech` review it.

## Code

```
src/
├── app/                        # ONLY routes: page, layout, loading, error, route handler. No business logic.
│   ├── (marketing)/            # landing, pricing, blog
│   ├── (auth)/                 # sign in, sign up, password reset
│   ├── (app)/                  # the app that needs login
│   └── api/                    # webhook and external API endpoints
├── features/
│   └── <feature>/              # e.g. invoice/
│       ├── components/         # components of this feature only
│       ├── hooks/              # client hooks
│       ├── server/             # server actions, queries, services (run on the server)
│       ├── lib/                # feature-specific helpers
│       ├── __tests__/          # unit and integration tests
│       ├── schemas.ts          # Zod schemas
│       ├── types.ts
│       └── index.ts            # the only gate the feature exposes
├── components/
│   └── ui/                     # shadcn/ui and shared presentational components
├── hooks/                      # hooks used by more than one feature
├── lib/                        # infrastructure clients: supabase/, stripe/, email/, sentry
├── config/                     # environment variable validation (env.ts), constants
├── styles/                     # global styles, design tokens (from DESIGN.md)
├── types/                      # global types
└── middleware.ts
public/                         # static files
tests/
├── e2e/                        # Playwright acceptance tests (Ö-01.1 ...)
└── live/                       # live monitoring tests (that delete no data)
supabase/migrations/            # database changes ONLY here
```

## Common to every project

```
.
├── .claude/               # Claude Code: commands, agents, hooks, board, findings, structure.json
├── .github/               # CI, Dependabot, cloud agents
├── docs/
│   ├── product/           # prd, roadmap, glossary, launch, feedback, unit-economics
│   ├── architecture/      # overview, stack, structure (this file)
│   ├── design/            # design-guide (if there is a UI)
│   ├── decisions/         # log.md (decision log) + adr-NNNN-*.md (detailed decisions)
│   ├── quality/           # test-plan, metrics, retros
│   ├── security/          # checklist
│   ├── legal/             # privacy-kvkk
│   ├── operations/        # release-checklist, maintenance, accounts, feature-flags
│   ├── workflow/          # progress, decision-protocol, skills, board, usage-limits, cost-log
│   ├── findings/          # /findings-* reports (type/date.md, latest.md)
│   └── archive/           # documents that are no longer valid but are kept
├── sandbox/               # trials, exploration code, temporary scripts (not committed to git)
├── AGENTS.md  CLAUDE.md  README.md  CHANGELOG.md
└── .env.example
```

## Rules

1. **A new file goes to its place in the map.** Writing outside the `.claude/structure.json` map is asked about; clutter patterns (`*.bak`, `*-old.*`, `* copy*`, `temp/`, `deneme*`) are blocked. CI checks the whole repo on every PR.
2. **By feature.** Everything that belongs to a feature (component, logic, test) stays under `features/<feature>/`. When a piece of code starts to be used by two features, it moves to the shared layer (`components/`, `lib/`, `shared/`).
3. **Features do not reach into each other.** `features/a` does not import the internal files of another feature; it uses only what that feature exposes from its `index` file.
4. **Naming:** Folders and files use `kebab-case`. React component files may use `PascalCase.tsx`; Python modules use `snake_case.py`. A feature folder name is singular and English (`invoice`, `customer`).
5. **Temporary and unrelated work** goes under `sandbox/`. If something useful comes out, it moves to the right place; `sandbox/` is cleaned regularly.
6. **Old documents** are not deleted; they move under `docs/archive/` with a line at the top saying why they were archived.
7. **Changing the map** (a new top-level folder, a new layer) is a `teknik` decision: ask the user, record it under `docs/decisions/`, then update `.claude/structure.json` and this file.
