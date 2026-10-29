# Skill Routing

> Which skill to use for which job? Load the skill with the Skill tool and apply its instructions.
> This project defines the plugins below in `.claude/settings.json`; Claude Code suggests installing them when it opens the project. Those outside the core come switched off as packages (see "Context packages" below).
> If a skill is not installed, do the job without it, write "skill missing: X" in the status block and give the user the install command:
> `/plugin install <plugin>@<marketplace>` (e.g. `/plugin install impeccable@impeccable`).

| Plugin | Marketplace | Skill prefixes |
|---|---|---|
| caveman | caveman | `caveman:` |
| impeccable | impeccable | `impeccable:` |
| taste-skill | taste-skill | `taste-skill:` |
| ui-ux-pro-max | ui-ux-pro-max-skill | `ui-ux-pro-max:` |
| humanizer | humanizer | `humanizer:` |
| ponytail | ponytail | `ponytail:` |
| mattpocock-skills | mattpocock | `mattpocock-skills:` |
| gsap-skills (GreenSock, official) | gsap-skills | `gsap-skills:` (`design` package) |
| understand-anything | understand-anything | `/understand --language en`, `/understand-dashboard`, `/understand-onboard` (`release` package; `--auto-update` is not used). While on, the session-start hook updates the graph without asking when it is stale and spends tokens: switch the package off with `/tools` when the job is done |
| security-guidance, claude-security, hookify, claude-md-management, session-report | claude-plugins-official (Anthropic) | automatic hook / `/claude-security`, `/hookify`, `/revise-claude-md`, `/session-report` |
| typescript-lsp (web, mobile) · pyright-lsp (backend) | claude-plugins-official | Language server: type errors and go to definition. Needs `npm i -g typescript-language-server typescript` or `npm i -g pyright` |
| supabase, postgres-best-practices | supabase-agent-skills | `supabase:`, `postgres-best-practices:` (web, mobile; only postgres in backend) |
| web-quality-skills | addy-web-quality-skills | Core Web Vitals, accessibility, SEO (web) |
| expo | expo-plugins | Expo build, upgrade, distribution + Expo MCP (mobile) |

**Vercel skills** (`react-best-practices`, `composition-patterns` for web; `react-native-guidelines` for mobile) are not plugins. After the stack decision `/start` copies them into the project:
`npx -y skills@1.7.2 add vercel-labs/agent-skills --skill react-best-practices --skill composition-patterns -a claude-code -y --copy`

**three.js skills** (`threejs-fundamentals`, `threejs-performance`, and `threejs-react-three-fiber` for React; `CloudAI-X/threejs-skills`, MIT) are not plugins. Only if 3D is chosen, `/start` 3c copies them from a pinned commit. Each is ~6k tokens, loaded when called.

## The kit's own skills (`.claude/skills/`)

| Skill | When |
|---|---|
| `source-research` | Any information that can change (version, price, quota, regulation, competitor); technology choice; business and legal reports |
| `logo-design` | Logo, icon, favicon, brand pack (SVG, needs no API) |
| `ui-motion` | In-app animation and transitions |
| `motion-video` | Promo video, landing page loop (renderAt(t) + Playwright + ffmpeg) |

## Tools (MCP)

| Tool | What for | Note |
|---|---|---|
| **Context7** | Current, version-specific docs of libraries | On for every project type, free |
| **Playwright CLI** | Interface evidence, console, network, screenshots (`npx -y @playwright/cli@0.1.22`) | In web; fewer tokens than the MCP. Acceptance tests still run with `npx playwright test` |
| **Chrome DevTools**, **Playwright** MCP | Performance trace; long exploratory browser flows | Off by default; the command asks and adds it (catalog) |
| **Vercel CLI** | Preview and prod deploy (`npx -y vercel@63.1.1`) | `/release`; `--prod`, `promote`, `rollback` are asked |
| **Sentry**, **Supabase** | Error logs, database warnings (read-only) | `/maintain` |
| **Firecrawl** | Site crawling | Optional, needs an API key; `source-research` §5 |
| **Maestro**, **Expo** | Mobile E2E tests, EAS build, crash logs | In mobile |
| GitHub, Stripe, Vercel, PostHog, Figma… | When the service is chosen | Catalog: `docs/workflow/mcp-catalog.md` |

## Context packages

The skill descriptions of every plugin that is on are loaded into the context in each session. The skill list is limited to 1% of the context; when it overflows, the descriptions of rarely used skills drop and Claude does not recognize them. Skills inside a plugin cannot be switched off one by one. So plugins are split into **core** and **packages**. Packages come switched off in `.claude/settings.json`; in its first step the related command checks with `node .claude/hooks/tools.mjs --required <package>` and, if the package is off, asks to switch it on together with its cost. Switching on affects only this machine (`.claude/settings.local.json`). Management: `/tools`. Definitions: `.claude/hooks/tools.mjs` → `PACKAGES`.

| Package | Plugins | Command that switches it on |
|---|---|---|
| Core (always on) | caveman, ponytail, mattpocock-skills, impeccable, humanizer, security-guidance, hookify, claude-md-management + stack plugins | - |
| `design` | taste-skill, ui-ux-pro-max, gsap-skills | `/design` |
| `security` | Trail of Bits (7), claude-security | `/findings-security`, `/findings-all`, `/release first` |
| `release` | understand-anything, session-report | `/release`, `/handoff`, `/adopt` |
| `video` | remotion | `motion-video` |

- Switching a package on in the middle of a session breaks the prompt cache and the whole context is read again. The cheapest time is at a phase boundary, together with `/clear`.
- Exact measurement: `/context` (Skills line), `/doctor`; unused skills: `/skill-doctor`. Rough measurement: `/tools measure`. `/maintain monthly` checks this.
- Moving a plugin into the core or out of a package is a `tech` decision.

**Command list (Light/Full):** The kit's command descriptions go into the same list (~1,600 tokens). In the Light and Standard profile, the 20 commands outside the core are listed by name only with `skillOverrides` → `name-only`: they stay in the `/` menu, Claude can call them by name, their description does not enter the context. The core that keeps its description: start, adopt, build, fix-bug, plan-task, design, tools, review-changes, wrap-up, release. Full profile: `node .claude/hooks/tools.mjs --commands full`; to go back: `--commands light`. The setting is in `.claude/settings.json` (team-wide); your own `skillOverrides` values are kept. It has no effect in Codex and Antigravity. List: `.claude/hooks/tools.mjs` → `CORE_COMMANDS`, `LIGHT_COMMANDS`.

## Skill budget

- In backend projects the interface design plugins (including impeccable) come switched off (`kit/templates/backend/.claude/settings.merge.json`).
- Stack-specific skills (Supabase, Expo, web quality, LSP) are switched on only in the related project type.
- The end-of-turn review of security-guidance comes switched off (`ENABLE_STOP_REVIEW=0`, quota). The pattern scan at edit time (free) and the commit review are on. If the quota is comfortable, it can be switched on from `.claude/settings.json` → `env`.
- Adding a new plugin is a `tech` decision: is there already a skill that does the same job, is the source trustworthy, what is the context cost? Third-party skills are an attack surface: read the SKILL.md content before installing.

## Communication

| Situation | Skill |
|---|---|
| Status block, progress notes, code explanations | `caveman:caveman` (load at session start). Questions, option descriptions and documents are exempt; write full sentences |

## Idea, product and architecture

| Situation | Skill |
|---|---|
| Questioning the idea and the plan (`/start` Step 1, big feature plan) | `mattpocock-skills:grilling` (ask the questions with AskUserQuestion) |
| Concepts, glossary, decision record (`docs/product/glossary.md`, `docs/decisions/`) | `mattpocock-skills:domain-modeling` |
| Module boundaries, interface design, testable structure (`docs/architecture/`) | `mattpocock-skills:codebase-design` |
| Technology comparison, research on current version/price/docs | `mattpocock-skills:research` |
| Trying out a state model or flow (throwaway prototype) | `mattpocock-skills:prototype` |
| Setup the user must do by hand (panel, DNS, key, store account) | `mattpocock-skills:wizard` |

## Design (web and mobile UI)

First the style direction is chosen (`/design`). Each direction maps to a skill; previews and implementation are done with that skill. Product context and the design system are always kept in Impeccable (`PRODUCT.md`, `DESIGN.md`).

| Style direction (option shown to the user) | When it is good | Main skill |
|---|---|---|
| **Premium / Apple style:** lots of white space, large and thin typography, soft transitions, expensive feel | Consumer product, brand perception matters, high-priced product | `taste-skill:high-end-visual-design` |
| **Minimal editorial:** warm monochrome, typography-led, flat surfaces | Content, portfolio, calm SaaS, trust-building service | `taste-skill:minimalist-ui` |
| **Bold and animated:** giant typography, scroll-linked animations (GSAP), bento grids | Launch page, young audience, product that must grab attention | `taste-skill:gpt-taste` |
| **Industrial / brutalist:** raw grid, terminal aesthetic, sharp contrast | Developer tool, data-heavy dashboard, unconventional brand | `taste-skill:industrial-brutalist-ui` |
| **Functional product UI:** plain, dense information, fast to use | Panel, admin, B2B tool, forms | `impeccable:impeccable` + `ui-ux-pro-max:ui-styling` (shadcn/ui) |
| **Find your own direction (anti-generic):** derives a direction from the brief | If none fits exactly | `taste-skill:design-taste-frontend` |

| Design job | Skill |
|---|---|
| Write the product context (`PRODUCT.md`), fed from the PRD | `impeccable:impeccable` → `init` |
| Record the visual world (`DESIGN.md`), from the chosen preview | `impeccable:impeccable` → new workflow |
| Color palette and typeface pair candidates, by product type | `ui-ux-pro-max:ui-ux-pro-max` |
| Design tokens and component rules | `ui-ux-pro-max:design-system` |
| Produce a screen/section | Chosen direction skill + `impeccable:impeccable` |
| Evaluate and fix a finished screen | `impeccable:impeccable` → `critique`, `audit`, `polish` (if needed `bolder`/`quieter`/`distill`/`harden`/`adapt`/`animate`) |
| Redo an existing interface | `taste-skill:redesign-existing-projects` + `impeccable:impeccable` |
| Logo, brand identity | `ui-ux-pro-max:design`, `ui-ux-pro-max:brand` |
| Social media/ad visuals | `ui-ux-pro-max:banner-design` |
| Mobile screens | Chosen direction skill + `impeccable:impeccable` (iOS/Android platform guidelines) + `ui-ux-pro-max:ui-ux-pro-max` (React Native) |

## Content

| Situation | Skill |
|---|---|
| Every text the user sees: landing page, screen texts, emails, store description, announcements | Write first, then pass it through `humanizer:humanizer` (removes AI-sounding patterns) |

## Findings reports

| Situation | Skill / file |
|---|---|
| `/findings-<type>` (tech, business, security, ux, perf, legal, all) | Method `.claude/findings/protocol.md`, lens `.claude/findings/lenses/<type>.md` |
| Deep security scan (`/findings-security`) | `/claude-security` (Anthropic, multi-agent, findings verified) |
| Security depth | Trail of Bits: `differential-review`, `insecure-defaults`, `sharp-edges`, `static-analysis`, `supply-chain-risk-auditor`, `agentic-actions-auditor`, `fp-check` |
| Business and legal research | `source-research` + web search |
| Technical and performance scan | `ponytail:ponytail-audit` |
| UX scan | `impeccable:impeccable` → `audit`, `critique` |

## Code

| Situation | Skill |
|---|---|
| Every code change (smallest complete solution, no needless abstraction) | `ponytail:ponytail` |
| Critical flow (auth, payment, data writes; `docs/quality/test-plan.md` K1-K5) | `mattpocock-skills:tdd` (the `test-writer` agent writes the red test, the code side turns it green) |
| Return a broken project to the last working state | `/rollback` (`checkpoint.mjs`) |
| Explain every step to a new user | Narrator mode: `.claude/output-styles/narrator.md` (`outputStyle: narrator`) |
| Debugging (`/fix-bug`) | `mattpocock-skills:diagnosing-bugs` + `/freeze <folder>` |
| Change review (`/review-changes`) | `ponytail:ponytail-review` + `code-reviewer` agent (+ `security-auditor`) |
| Conformance review against task/spec (branch or PR) | `mattpocock-skills:code-review` |
| Quality audit of the whole codebase (`/release first`, `/maintain quarterly`) | `ponytail:ponytail-audit` |
| List of deferred shortcuts (`/maintain monthly`) | `ponytail:ponytail-debt` |
| PR description | `mattpocock-skills:pr` |
| Edit CLAUDE.md, a command or a skill (`/retro`) | `mattpocock-skills:writing-for-agents` |
| CLAUDE.md audit, session lessons (`/retro`, `/wrap-up`) | `claude-md-management`: `claude-md-improver`, `/revise-claude-md` |
| "Don't do this again" → permanent rule | `/hookify <rule>` (`.claude/hookify.*.local.md`) |
| React/Next performance (web) · React Native (mobile) | `react-best-practices`, `composition-patterns` · `react-native-guidelines` (Vercel) |
| Database schema, query, index | `postgres-best-practices:*`, `supabase:*` |
| Token and cost detail | `/session-report` (HTML), `node .claude/hooks/cost.mjs` for the dashboard |
