# Feature Flags

> Risky features ship behind a flag. If something goes wrong, the flag is turned off **without a redeploy** (kill switch).
> A forgotten flag is technical debt: every flag gets a removal date. The `/dashboard` dashboard shows the overdue ones.
> The implementation method is in `docs/architecture/stack.md` → "Acceptance tests and feature flags".

## When is a flag mandatory?

- Payment, subscription or money movement
- A feature that calls an AI/LLM (risk of a cost explosion)
- A feature that sends bulk email / notifications
- A feature that deletes, moves or exports data
- A large interface change (to roll it out gradually)

## Flags

The `/dashboard` dashboard reads this table. Date format `YYYY-MM-DD`, status `on` / `off` / `gradual %N`, kill switch tested `yes` / `no` (English in every language).

| Flag | Purpose | Status | Owner | Added | Removal date | Kill switch tested |
|---|---|---|---|---|---|---|

## Rules

- The flag name uses the `feature_name` form and matches `docs/product/glossary.md`.
- The code path is also tested while the flag is off (at least one test for each of the two states).
- After the feature is open to everyone and has run without problems for 2 weeks, the flag and the old code path are removed.
- Kill switch: the step to turn it off from the panel or an environment variable is written in this file and has been tried at least once.
