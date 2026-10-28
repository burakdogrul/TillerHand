# Accounts and Deadlines

> Every external account the project depends on is listed here. In one-person projects the most common disasters are not code:
> an expired domain, an invalid card that stops a service, a hijacked account without 2FA,
> a key nobody remembers owning. The `/dashboard` dashboard shows **dates expiring within 30 days** in the "Needs attention" area.
>
> **Never write a password, key or token here.** Write only which account, who holds it, when it ends.
> Dates must use the `YYYY-AA-GG` format (the dashboard reads them).

## Hesaplar

| Service | Purpose | Account owner | 2FA | Plan / monthly cost | Expiry / renewal | Key rotation | Note |
|---|---|---|---|---|---|---|---|
| [GitHub] | Code repository | [email] | [yes/no] | [Free] | - | - | |
| [Domain registrar] | Domain name | | | | [YYYY-AA-GG] | - | Is auto-renewal on? |
| [Hosting] | | | | | | | |
| [Database] | | | | | | [YYYY-AA-GG] | |
| [Email service] | | | | | | | |
| [Payment provider] | | | | | | | |
| [Error tracking] | | | | | | | |
| [AI provider] | | | | | | [YYYY-AA-GG] | Spend limit: |
| [Apple / Google developer] | Store | | | | [YYYY-AA-GG] | | Annual membership |

## Ortamlar (dev / prod)

> A project ref and a URL are not secrets; keys are still not written here. `/release` reads this table: it blocks the release
> if the prod ref appears in `.mcp.json`, in `.claude/` or in code.

| Environment | Service | Project ref / URL | Who connects |
|---|---|---|---|
| dev | [Supabase] | [dev ref] | Local environment, AI (MCP read-only and `supabase-dev`), trials outside CI |
| prod | [Supabase] | [prod ref] | Hosting only (Vercel / EAS environment variables). AI and the local environment do not connect |

## Rules

- Add a row to this table whenever a new external service is added (`/start` Step 5, a new integration).
- 2FA is mandatory on critical accounts: code repository, hosting, database, domain, payment, email.
- Also write the payment card's expiry date in the "Expiry" column (services stop when the card expires).
- `/maintain quarterly` reviews this table; `/release first` leaves no empty row.
