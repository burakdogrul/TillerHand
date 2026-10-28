# Spend Alarms

> The bill of a live product can grow silently. A loop that calls an AI, bot traffic or a leaked API key can use up the monthly budget overnight. For every paid service, this file records the **cap** (stops when exceeded) and the **alert** (warns at a threshold).
> This is separate from the Claude Code limit: here the subject is your own product's bill.
> The `/dashboard` dashboard (Operations tab) reads the table below. It marks a paid row with an empty limit as "not set".

## Alarmlar

One row per paid service. **Type:** `cap` (cap: the service stops or requests are rejected) or `alert` (alert: only warns). **Amount:** monthly, with currency (e.g. `50 USD`). **Last check:** `YYYY-AA-GG`.

| Service | Type | Amount | Alert thresholds | Set up at | Last check |
|---|---|---|---|---|---|

## Settings the providers offer

Verified: 2026-10-12. Panel locations and features can change. Before setting up, check the current docs with `source-research`.

| Service | What exists | Does it stop? |
|---|---|---|
| Anthropic (Claude API) | Monthly spend limit per organization and workspace in the Console | Yes. When the limit is reached, requests return an error. Open a separate workspace for each product. |
| OpenAI | Budget alerts per project; new accounts may also have a hard limit | Alerts do not stop. If a hard limit exists, requests return 429 when it is reached. Check in the panel. |
| Vercel | Spend Management (Pro): notifications and a webhook at 50%, 75% and 100% | Does not stop by default. The "pause projects" option must be turned on separately. |
| Supabase | On the Pro plan the spend cap is on by default | Yes, while the cap is on, quota overage is not billed. If you turn it off, it does not stop. |
| Google Cloud / Firebase | Budgets & alerts | No, it only warns. Stopping needs extra automation. |

Rule: For services that do not stop, set the alert at two thresholds at least (50% and 80%). The email address the alerts go to must be one that is actually read.

## In-app protection (in code)

The provider limit is the last defense. Before it, the product itself limits spending. For every feature that calls an AI or a paid API:

1. **Per-user quota:** There is a daily or monthly limit on requests or tokens. When it is exceeded, a clear message is shown ("You have used today's allowance, it renews tomorrow"). The quota is kept on the server; do not trust the client.
2. **Global daily budget:** The estimated spend of all users for that day is summed.
   - At 80% of the budget: send an alert (email and error tracking).
   - At 100% of the budget: the feature flag (`docs/operations/feature-flags.md`) turns off automatically. The user sees a "temporarily unavailable" message.
3. **Log every call:** feature, model, input and output token counts, estimated cost, user id. Do not log the content (KVKK).
4. **Abuse:** No AI call without signing up. There is a rate limit and bot protection.

How these rules are implemented is written in `docs/architecture/stack.md` and, in the AI add-on, in `docs/ai/guide.md` → "Cost control".

## When it is checked

- **`/start` Step 5 (external services):** A row is added to the table for every paid service chosen.
- **`/release`:** The cap or alert of every paid service must be set up and tested once. Test: with a low threshold, see the alert arrive.
- **`/maintain` weekly:** Did an alarm fire? Does the real spend match the estimate in `docs/product/unit-economics.md`?
