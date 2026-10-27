# Maintenance and Regular Checks

> A live project decays on its own: dependencies age, certificates and cards expire,
> bills swell, backups stop silently. This file catches those.
> The commands `/maintain weekly` · `/maintain monthly` · `/maintain quarterly` run the matching list and add to the log.
> Project-type-specific extra items: `docs/architecture/stack.md` → "Bakım" (maintenance).

## Weekly (~15 min)

- [ ] Error tracking: any new or rising errors? If yes, add them to `docs/product/roadmap.md` as tasks.
- [ ] Uptime: was there an outage?
- [ ] Cost: is hosting, DB and AI API spend within the expected range? Did a spend alarm fire (`docs/operations/spend-alarms.md`)?
- [ ] User feedback / support inbox scanned.
- [ ] Were backups taken successfully in the last 7 days?

## Monthly (~1 hour)

- [ ] Dependency updates (patch and minor versions) + tests.
- [ ] Dependency security scan (`npm audit` / `uv run --with pip-audit pip-audit`).
- [ ] Performance measurement (project-type-specific targets, `docs/architecture/stack.md`).
- [ ] Cost trend: why did it rise compared with last month?
- [ ] Clean up unused services, environment variables, feature flags, dead code.
- [ ] Are `docs/workflow/progress.md` and `docs/architecture/overview.md` current?
- [ ] Analytics: status against the success criteria (`docs/product/prd.md` §4).
- [ ] Duplicate code ratio (`npx jscpd --silent .`) and a monthly row in `docs/quality/metrics.md`.
- [ ] Is `docs/product/unit-economics.md` current with the real invoices?
- [ ] `docs/operations/feature-flags.md`: were the flags past their removal date cleaned up?
- [ ] `docs/product/feedback.md`: was new feedback processed (`/user-feedback`)?

## Quarterly (every 3 months, ~half a day)

- [ ] **Full restore drill from backup** (into a separate environment).
- [ ] Access review: hosting, DB, payment, domain, code repository. Remove old access.
- [ ] Rotate critical keys, especially those suspected of a leak.
- [ ] Plan major version updates (framework, runtime, SDK).
- [ ] Are `docs/legal/privacy-kvkk.md` and the published texts current? Was new data/a new service added?
- [ ] Full pass of `docs/security/checklist.md`.
- [ ] `docs/operations/accounts.md`: expiry dates, 2FA, accounts no longer used.

## Incident response (site down / data leaked / bill exploded)

1. **Stop:** If damage continues, stop it first. Return to the previous version (rollback), revoke the leaked key, put the service in maintenance mode.
2. **Record:** When did it start, who was affected, what did you see? Take screenshots and logs. You will not remember later.
3. **Fix:** Find and fix the root cause; add a regression test.
4. **Notify:** For a personal data breach, notify the KVKK Board within **72 hours** and inform the affected users (`docs/legal/privacy-kvkk.md`).
5. **Learn:** Write it in the log below. Add the check that prevents a repeat to the matching list.

## Bakım kaydı

| Date | Type | Findings | Done / task opened |
|---|---|---|---|
| | weekly/monthly/quarterly/incident | | |
