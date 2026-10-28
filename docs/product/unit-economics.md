# Unit Economics

> Does the product earn money or lose money on each new user? In AI products the cost per user
> can pass the price without anyone noticing. `/dashboard` does the calculation from the inputs below **automatically**.
> Filled in at `/start` Step 5; `/maintain monthly` updates it with real bills.
> Use a dot as the decimal separator in numbers (e.g. `3.5`). Use a single currency.
> The dashboard reads the input labels below; keep their wording (files from before 3.48 have Turkish labels, and those are still read).

## Inputs

**Currency:** TL
**Price (per user, monthly):** 0
**Payment fee (%):** 0
**Fixed monthly cost:** 0
**Variable cost per user (monthly):** 0
**Target active users:** 0
**Free user share (%):** 0

## Breakdown of variable cost (per user, monthly)

| Item | Assumption | Amount |
|---|---|---|
| AI / LLM calls | [e.g. 200 requests per user per month × average tokens × price] | |
| Email | | |
| Storage / bandwidth | | |
| Other | | |

## Breakdown of fixed cost (monthly)

| Item | Amount |
|---|---|
| Hosting | |
| Database | |
| Domain name (divided per month) | |
| Other subscriptions | |

## Notes

- **Contribution margin** = price × (1 − commission) − variable cost. If it is negative, every new paying user causes a loss.
- **Break-even** = fixed cost ÷ contribution margin (number of paying users).
- Free users also create variable cost; the calculation includes it through the "Free user share (%)" input (free user share).
- If variable cost passes 30% of the price, a price or usage-limit decision is asked as a `cost` topic.
