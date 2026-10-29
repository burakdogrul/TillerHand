# Turkey Pack

> Comes with the `tr` add-on (`--addons tr`). For a product that sells in Turkey or has Turkish users.
> **Not legal advice.** Every item links to a primary source and has a check date; legislation changes. Ask a lawyer or an accountant before launch.
> Before use, reopen the sources with `source-research`; if something changed, update this file and change the date.
> `/findings-legal` and `/findings-business` read this file.

## 1. KVKK: transfer abroad

Checked: 2026-10-25. Source: [Law no. 6698 (KVKK), art. 9](https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf) (as amended by Law no. 7499, 2/3/2024)

Personal data going to a service abroad is a transfer: AI provider (user data in the prompt text), hosting and database region, email, analytics, error tracking. Order:

1. Is there an **adequacy decision** (art. 9/1-3)? The Board (Personal Data Protection Authority) issues it; it is published in the Official Gazette. If there is one, transfer is allowed under a condition in art. 5 or art. 6.
2. If not, **appropriate safeguards** (art. 9/4): the **standard contract** announced by the Board, approved binding corporate rules, an undertaking permitted by the Board or (between public bodies) an agreement permitted by the Board. A condition in art. 5 or art. 6 is still required here, and the data subject must be able to exercise their rights in that country.
   - **After the standard contract is signed, notify the Authority within 5 business days** (art. 9/5).
3. If neither exists, only in **incidental** (non-repeated) cases (art. 9/6): informed explicit consent, necessity for performing a contract and the other cases listed in the article. An AI or hosting service that runs continuously is not "incidental".

Project to-do:
- [ ] For each external service in `docs/operations/accounts.md`: which country is the data in, what is the transfer basis (adequacy / standard contract / none)?
- [ ] If a standard contract is needed, it is signed with the provider and notified to the Authority within 5 business days; the date is in `accounts.md` → Note column.
- [ ] The privacy notice (`docs/legal/privacy-kvkk.md`) states the transfer abroad, the recipient group and the purpose (art. 10).
- [ ] No unneeded personal data goes into the AI prompt (data minimization); identity data is masked where possible.

## 2. e-Fatura and e-Arşiv Fatura

Checked: 2026-10-25. Source: [General Communiqué on the Tax Procedure Law no. 509, current version](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=MEVZUAT_TEBLIGLER%2FUNIVERSAL%2F2026%2FMEVZUAT_TEBLIGLER_2026_VukTeb509_Guncel.pdf) (GİB, with the amendments of Communiqué no. 589 applied) · [e-Belge](https://ebelge.gib.gov.tr/)

- **e-Fatura obligation** (IV.1.4): those whose gross sales revenue was **3 million TL** or more in accounting periods of 2022 or later. For those selling goods/services on their own site or in another electronic medium, intermediary service providers and internet listing/advertising intermediaries, the threshold is **500 thousand TL**. Those who exceed the threshold switch by the start of the seventh month of the following year (IV.1.5).
- **e-Arşiv**: those in e-Fatura also switch to e-Arşiv (IV.2.4.1). Invoices of those not in e-Arşiv are issued as e-Arşiv Fatura (through the GİB portal or a private integrator) from 1/1/2026, regardless of amount. For the simplified procedure and the business account basis this date is 1/1/2027 (IV.2.4.3).
- **Internet sales invoice** (IV.2.4.5): The invoice is delivered electronically. It carries the statement "Bu satış internet üzerinden yapılmıştır.", the web address where the sale was made, the payment method and date, the shipping carrier's information, the shipping date and a return section.

Project to-do:
- [ ] Invoicing method chosen: GİB portal (manual, small volume) or a private integrator API (automatic). The choice is in `docs/decisions/log.md`.
- [ ] The invoice flow is triggered when payment succeeds; if the invoice cannot be issued, the order is not lost (retry queue).
- [ ] The accountant approved the threshold and the method.

## 3. Payment notifications (iyzico, PayTR)

Checked: 2026-10-25. Sources: [iyzico webhook](https://docs.iyzico.com/en/advanced/webhook) · [iyzico Retrieve Payment](https://docs.iyzico.com/en/advanced/retrieve-payment) · [iyzico CF Retrieve](https://docs.iyzico.com/en/payment-methods/checkoutform/cf-implementation/cf-retrieve) · [iyzico live / sandbox](https://docs.iyzico.com/en/getting-started/preliminaries/live-vs-sandbox) · [PayTR iFrame API step 2](https://dev.paytr.com/en/iframe-api/iframe-api-2-adim) (the pages have no date)

A payment result is processed from the notification the provider sends from its server, not from the browser redirect. An order is not confirmed before the notification signature is verified. The code is ready:
- web-saas: `src/lib/payments/webhook-signature.ts` → `verifyIyzico`, `verifyPaytr`; adversarial test `tests/security/payment-webhook.mjs` (CI: `payment-webhook` workflow; locally Node 22.18 or later)
- backend: `app/shared/payments.py` → `verify_iyzico`, `verify_paytr`; adversarial test `tests/security/test_payment_webhook.py`
- mobile: the payment notification comes to the server; use the backend template or a Supabase Edge Function. Do not take the card inside the app; redirect to the provider's payment page.

Flow:
1. Open a sandbox account (iyzico: sandbox-merchant.iyzipay.com, API `https://sandbox-api.iyzipay.com`; PayTR: test mode in the merchant panel). Keys use the names in `.env.example` and live **on the server only**; you enter the values.
2. Payment is started on the server; the amount and order number come from the order in the database, not from the client. In iyzico, give the order number as `conversationId` on every payment: the signature covers this field too, and verification rejects it if empty.
3. The notification endpoint (route) verifies the signature first. If it returns `false`, return 4xx and log; do not log the request body (personal data).
   - iyzico: `X-IYZ-SIGNATURE-V3` header. The signature feature must be on in the account (request it from iyzico). Subscription notifications are outside the scope of this code.
   - PayTR: the `hash` field in the POST; the response is plain text `OK`, no session check. Take the fields from the form body as text; do not convert `total_amount` to a number and write it back (this breaks the signature).
4. **A valid signature does not mean the payment succeeded.** A failed payment also arrives signed. Confirm the order only if the result is a success: PayTR `status` = `success`, iyzico `status` = `SUCCESS` and `iyziEventType` the type you expect. In the other cases do not confirm; still return a success response to the provider.
5. Compare the amount and currency with the order:
   - PayTR: `total_amount` in the notification (kuruş: 34.56 TL → 3456).
   - iyzico: the notification has no amount. Query the server: CF Retrieve with `token` for the checkout form, Retrieve Payment with `paymentId` for the others. The returned `paymentStatus`, `paidPrice`, `currency` and `conversationId` must match the order.
6. **A repeated notification** (the provider retries, an attacker can resend an old notification; the iyzico signature has no timestamp): confirm the order with a single atomic update (`UPDATE … SET status='paid' WHERE id=… AND status='pending'`) or put a unique constraint on the payment id (`merchant_oid` / `paymentId`). Do not read first and write after; two concurrent notifications would both pass. Return a success response to the repeated one too.
7. The payment feature ships behind a flag (`docs/operations/feature-flags.md`); run `/findings-security` before going live.

- [ ] The signature adversarial test is green (unsigned and altered notifications are rejected).
- [ ] The notification endpoint test shows: a failed-payment notification does not confirm the order; when the same notification arrives twice (and concurrently), the order is processed once; a payment with a different amount is not confirmed. These tests are written for the project's own route.
- [ ] Prod keys are only in the hosting panel; sandbox and prod are separate.

## 4. Turkish text: İ/ı

`"I".toLowerCase()` → `"i"`, but in Turkish it is `"ı"`. `"i".toUpperCase()` → `"I"`, in Turkish it is `"İ"`. The default sort puts the letters `ç, ğ, ı, ö, ş, ü` at the end of the alphabet. Add these cases to the tests of every feature that does search, sorting, uppercasing and email comparison:

```js
// Text shown as Turkish: the language is given explicitly
expect('ISPARTA'.toLocaleLowerCase('tr')).toBe('ısparta');
expect('istanbul'.toLocaleUpperCase('tr')).toBe('İSTANBUL');
expect(['Zeynep', 'Çağla', 'Ali', 'Ömer'].sort(new Intl.Collator('tr').compare)).toEqual(['Ali', 'Çağla', 'Ömer', 'Zeynep']);
// Case-insensitive search: searching "İstanbul" finds "istanbul"
expect(new Intl.Collator('tr', { sensitivity: 'base' }).compare('İstanbul', 'istanbul')).toBe(0);
// Machine text (email, code, URL, key): no language-dependent conversion
expect('INFO@EXAMPLE.COM'.toLowerCase()).toBe('info@example.com');
```

- [ ] In text shown to the user use `toLocaleLowerCase('tr')` / `Intl.Collator('tr')`; in machine text such as email, username and code use the language-independent `toLowerCase()`.
- [ ] Database sorting: a Turkish collation in Postgres (e.g. ICU `tr-TR-x-icu`) or sorting in the application.
