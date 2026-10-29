# Stack: Web App / SaaS

> This file is loaded into the AI every session. If you made a different choice in the project, update it here
> and write the reason in `docs/decisions/log.md`.

## Decision points

`/start` asks these decisions in order (`docs/workflow/decision-protocol.md`). For each decision, offer the 2-4 options that best fit this project. The **recommended** label is the default, but if another option fits the PRD better, recommend that one and say why. If a claim that can change (price, free tier, limit) carries a `(source: <url>, YYYY-MM-DD)` note newer than 90 days, do not research it again.

| # | Decision | Options (when each is better) |
|---|---|---|
| 1 | Framework | **Next.js** (recommended: SEO + dashboard + API in one project, the ecosystem the AI knows best) · Astro (content/landing-page heavy, fastest pages) · SvelteKit (less code, fast; smaller ecosystem) · React + Vite SPA (app only behind login, no SEO need, simplest hosting) |
| 2 | Language | **TypeScript** (recommended: catches AI mistakes at compile time) · JavaScript (only for a very small prototype) |
| 3 | Database + identity | **Supabase** (recommended: Postgres + Auth + Storage + RLS in one place; free tier has 2 active projects, 500 MB database per project, a project idle for 1 week is paused (source: https://supabase.com/pricing, 2026-10-26)) · Neon + Better Auth (more control, less provider lock-in) · Firebase (realtime, NoSQL, shared backend with mobile) · Clerk + Postgres (ready-made, polished identity UI; first 50,000 monthly returning users free, then per-user fee (source: https://clerk.com/billing, 2026-10-26)) |
| 4 | Data access | **Supabase client + RLS** (if Supabase is chosen) · Drizzle ORM (type-safe SQL, provider-independent) · Prisma (mature, schema-driven; heavier) |
| 5 | UI components | **shadcn/ui + Tailwind** (recommended: code lives in the project, fully customizable, works with the design skills) · Tailwind + own components (fully original design) · Mantine (rich ready-made components, dashboard heavy) |
| 6 | Payment | None (free in the first release) · **iyzico** (Turkish cards, installments, TRY) · Stripe (customers abroad; may be restricted for a Turkish company: Turkey does not appear in the supported-country list (source: https://stripe.com/global, 2026-10-26)) · Paddle / Lemon Squeezy (merchant of record: they handle tax and invoicing; subscriptions sold abroad) |
| 7 | Hosting | **Vercel** (recommended for Next.js: zero config, preview environments; the free Hobby plan is for personal, non-commercial use only, a product that takes payments or shows ads needs Pro (source: https://vercel.com/docs/limits/fair-use-guidelines, 2026-10-26)) · Cloudflare (cheap and fast; free Workers are limited to 100,000 requests per day and 10 ms CPU per request (source: https://developers.cloudflare.com/workers/platform/limits/, 2026-10-26)) · Netlify · Your own server + Coolify (fixed cost, maintenance is yours) |
| 8 | Email | **Resend** (recommended: developer friendly, React email templates; free plan gives 3,000 emails per month, 100 per day (source: https://resend.com/pricing, 2026-10-26)) · Postmark (very high deliverability) · Amazon SES (cheapest, hard to set up) |
| 9 | Analytics | **Plausible** (cookieless, KVKK friendly; no free plan, starts at 9 dollars per month, 30-day trial (source: https://plausible.io/docs/billing, 2026-10-26)) · PostHog (product analytics, funnels, feature flags) · Umami (self-host, free) · None |
| 10 | Error tracking | **Sentry** (recommended) · Highlight / Better Stack |
| 11 | Language support | **One language: the users' language** (recommended for the MVP) · Two or more languages (next-intl; setting it up from the start is cheaper than adding it later) |
| 12 | Test | **Vitest + Playwright** (recommended) · Playwright only (little logic, mostly UI) |

## Chosen technologies

> `/start` fills this in at Step 4 from the decision points. The table below is the **recommended** stack and counts as a proposal until approved.
> If the choice differs, rewrite the commands, folder, rules, verification and checks sections of this file to match the choice.

| Layer | Choice | Note |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) | |
| UI | Tailwind CSS + shadcn/ui | Before writing a new component, check whether shadcn has it |
| DB + Auth + Storage | Supabase (Postgres) | Alternative: Neon + Auth.js |
| ORM / query | Supabase client or Drizzle | Use only the one the project already has |
| Validation | Zod | For both forms and the server |
| Payment | Stripe / iyzico / Paddle | Stripe may be restricted for a Turkish company, check |
| Email | Resend | Domain verification is required |
| Hosting | Vercel | |
| Error tracking | Sentry | |
| Analytics | Plausible / PostHog | Watch cookie consent |
| Test | Vitest (unit), Playwright (e2e) | |

## Commands

```bash
npm run dev            # development
npm run build          # production build (always before deploy)
npm run lint
npx tsc --noEmit       # type check
npm run test           # vitest
npx playwright test    # e2e
npx supabase migration new [ad]   # new migration
```

## Folder structure

Feature-based structure and rules: `docs/architecture/structure.md`. Map: `.claude/structure.json` (writing outside it is asked about, CI checks it).
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
├── e2e/                        # Playwright acceptance tests (AC-01.1 ...)
└── live/                       # live monitoring tests (that delete no data)
supabase/migrations/            # database changes ONLY here
```

## Coding rules

- Default to **Server Component**. `"use client"` only when interaction is needed, and in the lowest component.
- Writing data: Server Action or route handler. In each: Zod validation → session check → permission check → operation.
- Variables with the `NEXT_PUBLIC_` prefix go to the browser. A secret is never `NEXT_PUBLIC_`.
- The Supabase secret key (`SUPABASE_SECRET_KEY`, `sb_secret_…`; old name `service_role`) only on the server and only when really needed (it bypasses RLS).
- DB schema changes only through a migration file (`npx supabase migration new [ad]`). No manual DDL from the dashboard or MCP; the `supabase-dev` MCP is for trying data in dev.
- Every new table has RLS on, a written policy, and an entry in the `tests/security/rls.mjs` → `TABLES` list (the `rls` job in CI turns red on an unregistered table).
- On every page, think about `loading.tsx` / empty state / `error.tsx`.
- Images with `next/image`, links with `next/link`.
- Texts are in the UI language (`docs/product/glossary.md`); format date/money with `Intl` and that locale.
- Before UI work, read `DESIGN.md` and `docs/design/design-guide.md`; do not go outside the tokens and rules. If a new design decision is needed, use `/design`.

## Verification (evidence before a task is done)

- UI: `node .claude/hooks/preview.mjs <task id>` takes a desktop (1440) and mobile (390) screenshot (the `dev:` and `preview:` lines in `AGENTS.md`). To try scenarios, with `npm run dev` running, open the page with the Playwright CLI (`npx -y @playwright/cli@0.1.22 open http://localhost:3000`, then `snapshot`, `console`, `screenshot`) or with Claude's browser, and try the main scenario and one error scenario.
- Proving acceptance criteria in the browser: `/qa` (one Playwright test per criterion, report in `docs/quality/qa/`).
- Authorization: with a second test user, try to reach the first user's record; it must fail.
- No errors/warnings in the console.

## Automatic checks

| Layer | What it does | Setup |
|---|---|---|
| Claude hooks | Block writing secrets; format the edited file with Prettier | Ready (`.claude/settings.json`). Prettier must be installed in the project |
| Pre-commit | lint-staged (ESLint + Prettier) + secret scan | `npm i -D husky lint-staged prettier` → `npm pkg set scripts.prepare="husky"` → `npx husky` |
| CI (+ Semgrep, duplicate code, complexity budget) | Lint, types, test, build, vulnerability scan, gitleaks, complexity budget on changed files (function complexity 15, function 80, file 400 lines; `node .claude/hooks/budget.mjs --check`) | `.github/workflows/ci.yml` is ready. Add the `NEXT_PUBLIC_*` values to GitHub > Settings > Variables |
| Dependabot | Weekly small updates in a single PR | `.github/dependabot.yml` is ready |
| MCP | Supabase (read-only), Sentry, Context7 · when needed: Playwright, Chrome DevTools, Supabase dev (`docs/workflow/mcp-catalog.md`) | `.mcp.json`: fill in `DEV_REF` (read-only, the **development** project; the prod ref is not written into the AI environment). The write-enabled Supabase MCP only for the **development** project (`supabase-dev`) |

## Acceptance tests and feature flags

**Acceptance tests** (`docs/quality/test-plan.md` §1a): The test name carries the criterion id (`test('AC-01.1 ...')`). The dashboard reads the JUnit report:

```bash
PLAYWRIGHT_JUNIT_OUTPUT_NAME=test-results/junit.xml npx playwright test --reporter=list,junit
npx vitest run --reporter=default --reporter=junit --outputFile.junit=test-results/junit-unit.xml
```

**Feature flags** (`docs/operations/feature-flags.md`): Emergency shutdown must not need a deploy. So use a source read at runtime, not an environment variable:
- PostHog feature flags if PostHog is chosen; otherwise
- A `feature_flags` table in Supabase (`name`, `enabled`, `percent`) + a 60 s cache on the server. Reading goes through one helper: `lib/flags.ts` → `isEnabled('name', user)`.
- The flag check runs on the server; the client only sees the result.

## Common AI mistakes (watch for these)

- Writing an absolute path specific to this machine into code, a test or a setting (`C:\Users\<ad>\…`, `/home/<ad>/…`, the full path of the project folder): it does not work on another machine. Derive the path with `import.meta.url` / `__dirname`, `path.join(process.cwd(), …)` or `os.tmpdir()`. The deterministic gate catches this.
- Using the Supabase admin client or a secret inside a client component.
- Protecting the page with middleware but leaving the server action unprotected.
- Turning RLS off because it "does not work".
- Mixing old Pages Router patterns (`getServerSideProps`) into the App Router.
- Not verifying the signature on a webhook; processing a webhook twice when it arrives twice (idempotency).

## Security (extra)

- [ ] RLS is on in all tables and every table is in the adversarial test: `tests/security/rls.mjs` (CI `rls` job green). Locally: `npx -y supabase@2.120.0 start`, then the commands at the top of the file.
- [ ] Another user and an anonymous user cannot read, change or delete the user's row (same test).
- [ ] Security headers (CSP, X-Frame-Options etc.) in `next.config` or middleware.
- [ ] Rate limit on auth endpoints (Supabase settings + Upstash if needed).

## Go live (extra)

- [ ] Vercel prod environment variables entered (Preview and Production separate)
- [ ] Supabase prod project is separate; prod domain and redirect URLs in Auth → URL Configuration
- [ ] Supabase email templates in the UI language and a custom SMTP (the default SMTP limit is very low)
- [ ] Payment: live keys, live webhook endpoint and signing secret
- [ ] SEO: `metadata` (title, description), Open Graph image, `sitemap.ts`, `robots.ts`, favicon
- [ ] Lighthouse (mobile): Performance ≥ 90, Accessibility ≥ 90, SEO ≥ 90
- [ ] Core Web Vitals: LCP < 2.5s, CLS < 0.1, INP < 200ms
- [ ] `not-found.tsx` and `error.tsx` customized
- [ ] Domain + `www` redirect + SSL (Vercel automatic)
- [ ] Sentry source maps are uploaded

## Maintenance (extra)

- Weekly: Vercel usage (bandwidth, function duration), Supabase usage (DB size, MAU).
- Monthly: `npm outdated`, `npm audit`, rerun Lighthouse.
- Quarterly: Next.js / Supabase major version notes; Supabase backups (no PITR on the free tier, take your own backup: `supabase db dump`).
- A free Supabase project can be paused when idle; on a live project move to a paid plan or watch this.
