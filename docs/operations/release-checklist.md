# Go-Live Checklist

> Before the first launch, **all of it**; for every later release, the **"Every release"** section.
> The `/release` command runs the items that can be checked automatically and asks you about the rest.
> Project-type-specific extra items: `docs/architecture/stack.md` → "Canlıya alma" (go live).
> Marks: ✅ done · ❌ missing · ➖ not applicable to this project

## A. Every release (before each deploy)

- [ ] CI is green on the `main` branch (tests, lint, type check, build, secret scan)
- [ ] The manual checklist in `docs/quality/test-plan.md` was done
- [ ] New environment variables were added to the prod environment
- [ ] If there is a DB migration: **backup first**, then the migration; checked that the migration can be rolled back
- [ ] `CHANGELOG.md` updated, version number given
- [ ] The rollback path is known: [e.g. "Promote" the previous deploy in Vercel, `git revert`]
- [ ] Smoke test after deploy: home page, login, main flow, no new error in error tracking

## B. First launch (once, then review yearly)

### Code and quality
- [ ] `docs/product/roadmap.md` Phase 1-2 done
- [ ] Critical flow tests (`docs/quality/test-plan.md` K1-K5) are green
- [ ] Debug code, `console.log`, test data, fake users cleaned up
- [ ] 404, 500 and maintenance pages/screens exist

### Security
- [ ] All items in `docs/security/checklist.md` are done; the `security-auditor` agent gave no blocking finding
- [ ] Prod keys are separate from local/test keys
- [ ] GitHub: `main` branch is protected (CI required), Dependabot security updates on, secret scanning on
- [ ] If there is an AI feature: `docs/ai/guide.md` → "Canlıya alma" (go live) is done
- [ ] Admin accounts have a strong password + 2FA (hosting, DB, domain, email, payment, code repository)

### Legal
- [ ] The texts in `docs/legal/privacy-kvkk.md` are published and linked
- [ ] The cookie banner works, analytics does not load before consent

### Accounts, flags, monitoring
- [ ] `docs/operations/accounts.md` is complete: every service, account owner, 2FA, expiry dates
- [ ] Risky features are behind flags; the kill switch was tried at least once (`docs/operations/feature-flags.md`)
- [ ] Synthetic monitoring is on in production (`.github/workflows/live-monitoring.yml`, `LIVE_URL` variable defined, every 3 hours), the dashboard shows "Live monitoring · succeeded", and an alert was seen to arrive after a test failure
- [ ] `docs/product/unit-economics.md`: contribution margin is positive, break-even point is known
- [ ] Spend alarms: every paid service has a cap or alert set up and tried once (`docs/operations/spend-alarms.md`); an AI/paid API call has a per-user quota and a global daily budget
- [ ] All acceptance tests are green (MVP criteria)
- [ ] The last `/qa` report (`docs/quality/qa/`) has no "kaldı" (remaining) item; in a web project the interface criteria were run in the browser

### Infrastructure
> Steps by provider are in `docs/operations/deploy-setup.md` (`/release first` → Deploy setup).
- [ ] Domain, SSL, `www` redirect
- [ ] Prod database is a separate project/instance; automatic backup is on
- [ ] **Restore from backup was tried once** (an untried backup is not a backup)
- [ ] Email sending: domain verified (SPF, DKIM, DMARC), does not land in spam
- [ ] Error tracking (Sentry etc.) is active in prod, the alarm email/notification arrives
- [ ] Uptime monitoring (UptimeRobot, Better Stack etc.) is set up
- [ ] Log retention period is defined

### Cost
- [ ] A spend limit/alarm is set on all paid services (hosting, DB, AI API, email)
- [ ] Free tier limits are known; what happens when they are exceeded (stop or billing?) is known
- [ ] The estimated monthly cost is in `docs/architecture/overview.md` → the external services table ("dış servisler")

### Performance and visibility
- [ ] Project-type-specific performance targets (`docs/architecture/stack.md`) are met
- [ ] Analytics (privacy-friendly) is set up, basic events (sign-up, main action) are tracked

### Preparation
- [ ] `docs/product/launch.md` → "Lansman öncesi" (before launch) is done
- [ ] A support channel (email/form) exists and someone watches it
- [ ] `README.md`: setup, environment variables, deploy steps are current
- [ ] Project-type-specific items (`docs/architecture/stack.md` → "Canlıya alma") are done

## C. First 72 hours after launch

- [ ] Check error tracking twice a day
- [ ] Check the cost panel once a day
- [ ] First user feedback was added to `docs/product/roadmap.md` → "Faz 4" (Phase 4)
