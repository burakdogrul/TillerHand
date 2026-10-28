# Stack: Mobile App

> This file is loaded into the AI every session. If you made a different choice in the project, update this file
> and write the reason in `docs/decisions/log.md`.

## Decision points

`/start` asks these decisions in order (`docs/workflow/decision-protocol.md`). For each decision, offer the 2-4 options that fit this project best; the **recommended** label is the default, but if another option fits the PRD better, recommend it and say why. If a claim that can change (price, free tier, limit) has a `(kaynak: <adres>, YYYY-AA-GG)` note next to it and the note is newer than 90 days, it is not researched again.

| # | Decision | Options (when each is better) |
|---|---|---|
| 1 | Approach | **Expo / React Native** (recommended: one codebase for two platforms, TypeScript, OTA updates, an ecosystem the AI knows well) · Flutter (pixel-precise custom interface, high animation performance; Dart) · Native Swift + Kotlin (best platform experience; two separate codebases) · PWA (no store, cheapest; limited device features) |
| 2 | Platforms | **iOS + Android** · iOS first (paying audience, fewer device variants) · Android first (high market share in Turkey, faster release process) |
| 3 | Backend | **Supabase** (recommended: auth + Postgres + storage + RLS) · Firebase (real-time, strong offline sync) · Your own API (complex business logic; separate backend project) · None (entirely on the device) |
| 4 | Local data | **SecureStore + MMKV** (recommended: settings and tokens) · SQLite / expo-sqlite (lots of offline data) · WatermelonDB (offline-first, sync) |
| 5 | Data and state management | **TanStack Query + Zustand** (recommended) · Redux Toolkit (large team, strict structure) |
| 6 | In-app purchases | None · **RevenueCat** (recommended: two stores through one API, subscription analytics; free up to 2,500 dollars of monthly tracked revenue, 1% of revenue above that (kaynak: https://www.revenuecat.com/pricing, 2026-10-26)) · Direct StoreKit + Play Billing (no RevenueCat fee, the store commission is still charged; a lot of work) |
| 7 | Notifications | **expo-notifications** (recommended) · OneSignal (marketing campaigns, segmentation) · None |
| 8 | UI components | **Your own components + a theme file** (recommended: full match with DESIGN.md) · Tamagui (shared web + mobile) · React Native Paper (ready-made Material components) |
| 9 | Analytics and errors | **Sentry + PostHog** (recommended) · Firebase Analytics + Crashlytics (if Firebase was chosen) |
| 10 | Test | **Jest + RNTL + Maestro** (recommended) · Detox (deeper e2e, hard to set up) |

## Seçilen teknolojiler

> `/start` fills this in at Step 4 from the decision points. The table below is the **recommended** stack and counts only as a suggestion until approved.
> If the choice differs, the commands, folders, rules, verification and checks sections of this file are rewritten to match the choice.

| Layer | Choice | Note |
|---|---|---|
| Framework | Expo (React Native) + TypeScript (strict) | Alternative: Flutter |
| Navigation | Expo Router | File-based |
| Backend | Supabase or Firebase | If a separate API is needed, the `backend` template |
| Secure storage | `expo-secure-store` | Tokens go here, not in AsyncStorage |
| In-app purchases | RevenueCat | Digital content = store payment is required |
| Build / release | EAS Build, EAS Submit, EAS Update | |
| Error tracking | Sentry (`@sentry/react-native`) | |
| Test | Jest + React Native Testing Library, Maestro (e2e) | |

## Komutlar (commands)

```bash
npx expo start                          # development
npx expo lint
npx tsc --noEmit
npm run test                            # jest
npx expo install [paket]                # add a package (picks the SDK-compatible version, not npm install)
npx expo-doctor                         # dependency compatibility check
eas build --profile preview --platform all     # test build
eas build --profile production --platform all  # store build
eas submit --platform ios|android
eas update --branch production          # OTA update (JS changes only)
maestro test .maestro/                  # e2e
```

## Folder structure

Structure by feature and its rules: `docs/architecture/structure.md`. Map: `.claude/structure.json` (writing outside it is asked about, CI checks it).
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

## Coding rules

- **Everything in the app bundle is public.** Do not put a secret, service key or admin key into the app; secret operations run on the server.
- Variables with the `EXPO_PUBLIC_` prefix are embedded in the bundle; only public values.
- Use `npx expo install` when adding a package.
- If Supabase is chosen, DB schema changes go only through a migration file: `npx -y supabase@2.120.0 migration new [ad]` (`supabase/migrations/`). No manual DDL from the dashboard or MCP.
- If Supabase is chosen, every new table has RLS on, a written policy, and an entry in the `TABLES` list of `tests/security/rls.mjs` (the `rls` job in CI attacks as anonymous and as a second user; an unregistered table turns it red).
- Every screen has: loading, empty, error and **offline** states.
- Before asking for a permission, show the user why it is needed; permission texts (`infoPlist`) are in the app's main language and explanatory.
- The keyboard must not cover the screen (`KeyboardAvoidingView`); use the safe area (`SafeAreaView`).
- Touch targets are at least 44x44 pt; accessibility labels (`accessibilityLabel`).
- Try every feature **on both iOS and Android, on a real device**.
- Before UI work, read `DESIGN.md` and `docs/design/design-guide.md`; do not go outside the tokens and rules. If a new design decision is needed, use `/design`.

## Verification (evidence before a task is done)

- Logic: run the Jest tests and show the output.
- Flow: if there is a relevant flow under `.maestro/`, run `maestro test`; if not, write one for critical flows.
- The AI cannot do device testing: Write me, as a list, the steps I need to try on iOS and Android, with the expected result for each.

## Automatic checks

| Layer | What it does | Setup |
|---|---|---|
| Claude hooks | Block writing secrets; format the edited file with Prettier | Ready (`.claude/settings.json`). Prettier must be installed in the project |
| Pre-commit | lint-staged (ESLint + Prettier) + secret scan | `npm i -D husky lint-staged prettier` → `npm pkg set scripts.prepare="husky"` → `npx husky` |
| CI (+ Semgrep, duplicate code, complexity budget) | Lint, types, tests, expo-doctor, vulnerability scan, gitleaks, complexity budget on changed files (function complexity 15, function 80, file 400 lines; `node .claude/hooks/budget.mjs --check`) | `.github/workflows/ci.yml` ready |
| Dependabot | Weekly small updates (except Expo SDK packages) | `.github/dependabot.yml` ready |
| MCP | Supabase (read-only), Sentry · when needed: Supabase dev (`docs/workflow/mcp-catalog.md`) | `.mcp.json`: fill in `DEV_REF` (read-only, **development** project; the prod ref is not written into the AI environment). The Supabase MCP with write access goes only to the **development** project (`supabase-dev`) |

## Acceptance tests and feature flags

**Acceptance tests** (`docs/quality/test-plan.md` §1a): The name of the Jest test or Maestro flow carries the criterion id (`Ö-01.1`). The dashboard reads the JUnit report:

```bash
npx jest --reporters=default --reporters=jest-junit   # JEST_JUNIT_OUTPUT_DIR=test-results
maestro test .maestro/ --format junit --output test-results/junit-e2e.xml
```

**Feature flags** (`docs/operations/feature-flags.md`): It must be possible to turn a feature off without a store update. The app reads the flag remotely at launch and caches the last known value; with no network, the safe default (off) is used:
- PostHog feature flags or Firebase Remote Config; or a Supabase `feature_flags` table.
- Reading goes through a single hook: `hooks/useBayrak.ts`. Features that take payments, use AI or send notifications are not released without a flag.

## Common AI mistakes (watch for these)

- Writing an absolute path specific to this machine into code, a test or a setting (`C:\Users\<ad>\…`, `/home/<ad>/…`, the full path of the project folder): it does not work on another machine. Derive the path with `import.meta.url` / `__dirname`, `path.join(process.cwd(), …)` or `os.tmpdir()`. The deterministic gate catches this.
- Using web-only APIs or packages (DOM, `window`, libraries that work only on the web).
- Installing a version that is incompatible with the SDK through `npm install`.
- Writing the token to AsyncStorage.
- Assuming a package that needs a native module works in Expo Go (it needs a development build).
- Trying to ship a native change (a new permission, a native package) through an OTA update.

## Security (extra)

- [ ] No secrets in the bundle (review the `EXPO_PUBLIC_` variables after the build).
- [ ] Tokens are in SecureStore.
- [ ] Deep link parameters are validated.
- [ ] API calls use HTTPS only.

## Go live (extra)

- [ ] `app.config.ts`: bundle id / package name is permanent and correct; `version`, iOS `buildNumber`, Android `versionCode` incremented
- [ ] App icon, splash, app name
- [ ] Store page: description, keywords, screenshots (all required sizes), support URL, **privacy policy URL**
- [ ] **App Store privacy labels** (App Privacy) and the **Google Play Data Safety** form, matching the real data collection
- [ ] **In-app account deletion** (Apple and Google require it if the app has account creation)
- [ ] If there is third-party sign-in (Google etc.), Apple's sign-in rule (Guideline 4.8) was checked
- [ ] Digital content/subscription sales go through the store payment (Apple 3.1.1); prices and subscription texts are in the store
- [ ] A **test account** and notes for the review team
- [ ] At least a few days of testing in the TestFlight / Google Play internal test track
- [ ] Android: the current Google Play **target API level** requirement is met
- [ ] EAS Update: `runtimeVersion` policy is set; only JS changes go out through OTA
- [ ] Sentry symbol/source maps are uploaded
- [ ] Performance: cold start < 3 s (on a mid-range Android), list scrolling does not stutter

## Maintenance (extra)

- Weekly: **crash rate** in Sentry (target: crash-free users ≥ 99.5%), store reviews and rating.
- Monthly: `npx expo-doctor`, `npm outdated`, `npm audit`.
- Quarterly: Expo SDK upgrade (about 3 SDKs come out per year; do not fall more than 2 versions behind), Apple developer membership and certificate/provisioning expiry dates, Google Play target API level announcements, Apple's new Xcode/SDK requirements.
