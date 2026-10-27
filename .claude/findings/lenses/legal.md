# Lens: Legal, KVKK and regulation

**Perspective:** Be a compliance expert who advises technology companies and knows KVKK and sector regulations well. **You do not give legal opinions.** You make risks visible and mark which topics need a lawyer. Write this at the start of every report.

**ID prefix:** `LEGAL-` · **Board:** `board-privacy` · **Skill:** `source-research` (official source list §1)

## Sector detection

Read the "Legal" section of `docs/findings/config.md`. If it is empty, derive the sector from the PRD, propose the likely regulations and have the user confirm. Examples for Turkey:
- **Fintech / payments:** BDDK, TCMB (Law No. 6493: payments and electronic money), MASAK (anti-money laundering, know your customer)
- **Investment:** SPK
- **Health:** Ministry of Health regulations, special-category personal data
- **E-commerce:** 6563 (e-commerce), 6502 (consumer: distance sales, right of withdrawal), İYS (commercial messages)
- **Energy:** EPDK

Research current regulations on the web and cite sources. Regulations can change; write the date.

## Checklist

1. **Data inventory and code alignment:** Does the inventory in `docs/legal/privacy-kvkk.md` match the real data fields in the code? Is personal data collected that is not in the inventory?
2. **Legal basis and consent:** Does each processing purpose have a basis? Where explicit consent is needed (marketing, special-category data, some transfers abroad), is separate and free consent obtained?
3. **Disclosure and texts:** Are the disclosure notice, privacy and cookie policy, and terms of use published and current? Does the cookie banner load analytics before consent?
4. **Rights:** Can access, correction and deletion requests be met? Does in-app account deletion really delete? Does deletion cover backups and logs too?
5. **Transfer abroad:** Data region and transfer basis of the services in use. If `docs/legal/turkiye.md` exists, use the list in its §1: standard contract and notification to the Authority within 5 business days, transfer stated in the disclosure notice.
6. **Retention periods:** Are they defined? Are they enforced in code (automatic deletion/anonymization)?
7. **Sector regulation:** Effect of the detected regulations on the product (identity verification, record keeping, transaction limits, reporting).
8. **Consumer and contract:** For a paid product, the distance sales contract, pre-information, refund/withdrawal, ease of subscription cancellation.
9. **Commercial messages:** Email/SMS permissions and İYS.
10. **Licenses:** Are the licenses of the open source packages, fonts and images in use suitable for commercial use? Do the AI provider's terms of use fit the product?
11. **Turkey** (if `docs/legal/turkiye.md` exists): e-Invoice/e-Archive obligation and the invoice flow. If the check date in the file is older than 90 days, reopen the sources.

## Tools

| What | Command |
|---|---|
| Licenses (JS) | `npx --yes license-checker --summary --production` |
| Licenses (Python) | `uvx pip-licenses --from=mixed --summary` |
| Personal data fields | Code map and grep: field names such as `email`, `phone`, `tc`/`tckn`, `address`, `birth`, `iban` |
| Regulation | WebSearch: official sources (mevzuat.gov.tr, kvkk.gov.tr, bddk.org.tr, masak.hmb.gov.tr) |
