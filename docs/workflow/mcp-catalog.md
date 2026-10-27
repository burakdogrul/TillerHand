# MCP and plugin catalog

> Connections that do not come ready in the template and are opened if the project picks that service. `/start` Step 5 (external services) checks this table and suggests the setup for a matching service.
> All are the vendor's own official servers (verified: 2026-10-12). Authentication happens in the browser (OAuth) or with your own environment variable; a key is never written to the chat or to a file.

## Ready in the project

| What | Type | Note |
|---|---|---|
| Context7 | all | Current library docs |
| Supabase (read-only), Sentry | web, mobile · Sentry for backend | `DEV_REF` is filled in at /start: the **development** project, read-only. The prod ref is not written to the AI environment (.mcp.json, .env.local); if prod needs a look, the user opens the dashboard |
| Maestro | mobile | Mobile E2E (`.maestro/*.yaml`). The Maestro CLI must be installed: `curl -fsSL "https://get.maestro.mobile.dev" \| bash` (Windows: WSL or docs.maestro.dev) |
| Expo | mobile | Comes with the `expo@expo-plugins` plugin: EAS build, workflows, TestFlight crash logs. To connect: `/mcp` → sign in with the Expo account. For simulator and screenshots: SDK 54+ and `npx expo install expo-mcp --dev` |

## Added when needed (off by default)

These servers do not come in `.mcp.json`; the command that needs one asks the user and adds it to this machine (`--scope local`, does not enter git). It can be turned off with `/mcp` when the work is done. On Windows write `cmd /c npx` instead of `npx`.

| What | Who asks for it | Setup (verified: 2026-10-23) | Note |
|---|---|---|---|
| Playwright MCP | Exploratory browser testing, long interactive flow | `claude mcp add --scope local playwright -- npx -y @playwright/mcp@0.0.83` | For screenshots, `node .claude/hooks/preview.mjs`. For interactive trials, use the Playwright CLI first (every command is asked; in the project folder it reads the config file in the repo): `npx -y @playwright/cli@0.1.22 open <url>`, `snapshot`, `console`, `requests`, `screenshot`. The CLI does not force page data into the context, so it spends fewer tokens |
| Chrome DevTools MCP | `/findings-perf`, `/findings-ux` | `claude mcp add --scope local chrome-devtools -- npx -y chrome-devtools-mcp@1.10.1` | Performance trace (LCP, CLS, INP), network waterfall, console |
| Figma | `/design` (if the design is in Figma) | `claude mcp add --scope local --transport http figma-remote-mcp https://mcp.figma.com/mcp` | OAuth (`/mcp`). Figma's official plugin (~17 skills) is not used because of the context budget |
| rea (CLI, not MCP) | `/research` (how a competitor feature works), `/adopt` (a part with no source) | No setup: `npx -y rea-agents@6.2.0 <alt komut>`; subcommands: `npx -y rea-agents@6.2.0 --help`. Needs Node `^22.19` or `>=24.11` | Only software the user owns or is authorized to inspect. The license agreement (EULA) may forbid reverse engineering; commercial tools (IDA, Hopper, JEB) follow their own license. `setup` is not run (it changes agent settings). The analysis is local; inspecting a site sends real requests to that site |
| Supabase dev (write) | `/build` (trying things in dev) | `claude mcp add --scope local --transport http supabase-dev "https://mcp.supabase.com/mcp?project_ref=DEV_REF&features=database,docs"` | Only the **development** project or branch (`DEV_REF`). The prod ref is never written to this definition. Schema changes are still made with a migration file |

## Opened when a service is chosen

| Service | Setup | Credentials | Caution |
|---|---|---|---|
| GitHub | `/plugin install github@claude-plugins-official` | `GITHUB_PERSONAL_ACCESS_TOKEN` environment variable (fine-grained, only this repo) | Do not give a broad-scope token |
| Stripe | `claude mcp add --transport http stripe https://mcp.stripe.com --scope project` | OAuth (`/mcp`) | Connect with a test-mode account first |
| Vercel | CLI: `npx -y vercel@63.1.1` (`/release` uses it). Optional MCP for logs and build status: `claude mcp add --transport http vercel https://mcp.vercel.com --scope project` | `vercel login` / OAuth (`/mcp`) | It can deploy and purchase; `--prod`, `promote`, `rollback` are always asked (shield). The official plugin (30+ skills) is not used because of the context budget |
| PostHog | `claude mcp add --transport http posthog https://mcp.posthog.com/mcp --scope project` | OAuth (`/mcp`), region automatic | Product analytics and feature flags (`docs/operations/feature-flags.md`) |
| Firebase | `/plugin install firebase@claude-plugins-official` | Firebase CLI login | If Firebase was chosen instead of Supabase |
| Linear | `/plugin install linear@claude-plugins-official` | OAuth | If the roadmap will be kept in Linear |

## Rule

- Every action an MCP tool takes runs with your account's permissions. For tools with write access (Stripe, Vercel, GitHub), no permanent or money-spending action is taken without user approval.
- Adding a new MCP is a `teknik` decision; if a server not on the list is suggested, first verify its source and maintenance status with `source-research`, and add it to `.mcp.json` with a pinned version.
- Turn off an MCP you do not use: every tool definition adds load to the context in every session.
