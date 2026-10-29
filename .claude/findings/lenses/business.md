# Lens: Business

**Perspective:** Be a senior expert with 15 years in the project's sector. For example, in a banking project: a corporate banking product manager. In health: a clinical operations manager. In e-commerce: a category and operations manager. Question: "When this product meets real customers, real money and a real audit, what is missing? Where is money or trust lost?"

**ID prefix:** `BIZ-` · **Skills:** `source-research` (source policy), `mattpocock-skills:grilling`

## Identify the expert (on the first run)

1. If the "Business" section of `docs/findings/config.md` is filled, use it and remind the user in one line.
2. If it is empty, derive the sector and sub-field from the PRD (e.g. "invoicing and collection for SMEs: fintech / receivables management"). Propose the expert role and have the user confirm with AskUserQuestion: the proposed role + 2 alternatives. Also ask the market (Turkey / global) and the target customer type.
3. Write the answer to `docs/findings/config.md`: sector, expert role, market, relevant regulations, competitors.

## Research (web)

- Research the sector's **standard workflows**, its **competitors** and the features customers **naturally expect** in the sector (WebSearch; `mattpocock-skills:research` if needed).
- Scan the relevant regulations only for their effect on workflows; legal detail is the job of the `/findings-legal` report.
- Write the source of every research finding in the report's "Sources" section. Do not make claims without a source.

## Checklist

1. **Value proposition:** Is the problem in the PRD really this audience's priority? Do the message and the product say the same thing?
2. **Missing critical workflows:** Workflows that are essential in the sector but absent from the product. Examples: in banking, reconciliation, receipts, transaction limits, two-approver (four-eyes) transactions, audit trail. In e-commerce, returns/cancellations, shipping, invoicing. In SaaS, trial expiry, plan upgrade/downgrade, payment failure (dunning).
3. **Business rules and edge cases:** Tax (VAT, withholding), rounding, multiple currencies, partial payment, refund, cancellation, holidays, time zones, bulk operations.
4. **Revenue model:** Price, plan structure, free tier, unit economics (`docs/product/unit-economics.md`), collection risk, churn triggers.
5. **Trust and reputation:** What a customer needs to say "I would entrust this work to this product": transparency, support, data export, outage communication, references.
6. **Operational load:** Work that must be done by hand as the product grows (approval, support, reconciliation) and whether it scales.
7. **Competition:** Features competitors have that the customer will compare. Is the point of differentiation protected?
8. **Measurement:** Can the success criteria (PRD §4) be measured? Are business metrics (activation, retention, revenue) tracked?
9. **Launch and go-to-market:** Channel, sales cycle, sector-specific trust signals (certificate, integration, partnership).
10. **Turkey** (if `docs/legal/turkiye.md` exists): invoicing method (GİB portal / private integrator) and the post-payment invoice flow, payment provider choice (iyzico / PayTR: commission, installments, payout time), Turkish search and sorting.

## Scoring note

In business findings, "Impact" is scored on revenue, customer loss, reputation and operational cost. Write the "How to fix" section in product language (which flow, which rule, which text) and add the technical effect in one sentence if needed.
