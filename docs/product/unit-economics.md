# Unit Economics

> Does the product earn money or lose money on each new user? In AI products the cost per user
> can pass the price without anyone noticing. `/dashboard` does the calculation from the inputs below **automatically**.
> Filled in at `/start` Step 5; `/maintain monthly` updates it with real bills.
> Use a dot as the decimal separator in numbers (e.g. `3.5`). Use a single currency.
> The input labels stay Turkish because the dashboard reads them: Para birimi = currency, Fiyat = price per user per month, Ödeme komisyonu = payment fee, Sabit aylık maliyet = fixed monthly cost, Kullanıcı başı değişken maliyet = variable cost per user, Hedef aktif kullanıcı = target active users, Ücretsiz kullanıcı oranı = free user share.

## Inputs

**Para birimi:** TL
**Fiyat (kullanıcı başı aylık):** 0
**Ödeme komisyonu (%):** 0
**Sabit aylık maliyet:** 0
**Kullanıcı başı değişken maliyet (aylık):** 0
**Hedef aktif kullanıcı:** 0
**Ücretsiz kullanıcı oranı (%):** 0

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
- Free users also create variable cost; the calculation includes it through the "Ücretsiz kullanıcı oranı (%)" input (free user share).
- If variable cost passes 30% of the price, a price or usage-limit decision is asked as a `maliyet` topic.
