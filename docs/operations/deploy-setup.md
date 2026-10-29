# Deploy Setup

> `/release first` → "Deploy setup" uses this file. Only the section for the providers in `docs/architecture/stack.md` is read.
> The steps come from the providers' official docs; each section has the source and the check date. Panels change:
> before using, reopen the source page with `source-research`. If something changed, follow the current source and write the difference in the report.
> A source date older than a year is marked with ⚠️.

## Rules

- **A secret value is never written in chat or in a file.** Not in this file, not in `accounts.md`, not in code. The AI says only the variable name (as in `.env.example`); the user enters the value in the provider's panel themselves.
- The `mattpocock-skills:wizard` script does not ask for a prod secret and does not write a prod value to `.env`. The prod value is entered in the panel. The script passes only CI secrets (e.g. `LIVE_TEST_*`) to `gh secret set` with hidden input in the user's terminal. The script stays under `sandbox/` and is deleted when the work is done.
- A prod deploy, a rollback drill and a restore from backup do not start without approval.
- The AI and the local environment do not connect to the prod database (`accounts.md` → Environments). The only exception: the backup the user takes in their own terminal (Supabase → Backup).
- The result of each step goes into `accounts.md` (service, owner, 2FA, plan, expiry; the prod ref and URL under Environments) and into the `/release` report.
- The kit updates this file; do not edit it in the project. Write a step that conflicts with the source in the report.

## Order

1. Hosting project (prod, separate from dev)
2. Environment variables (separate values for Production and Preview)
3. Domain and DNS
4. Backup and point-in-time recovery (PITR)
5. Rollback drill (last, with approval)

## Vercel (web)

Checked: 2026-10-25. Sources: [Environment variables](https://vercel.com/docs/environment-variables) (2026-09-17) · [Add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) (2026-09-16) · [A record](https://vercel.com/kb/guide/a-record-and-caa-with-vercel) (2026-10-16) · [Instant Rollback](https://vercel.com/docs/instant-rollback) (2026-07-07)

**Project.** Connect the GitHub repository to a Vercel project. A push to the prod branch (usually `main`) produces the prod deploy; other branches produce previews.

**Environment variables.** Settings → Environment Variables. For each variable pick the environment: Production, Preview, Development. Keys and tokens are entered as **Secret** (unreadable after saving); open values such as URLs as **Config**. A change does not apply to old deploys; a new deploy is needed. Limit: 64 KB total per deploy (5 KB per variable at the edge).

**Domain.** Settings → Domains → Add Domain (CLI: `vercel domains add example.com <project>`). When you add the apex, `www` is recommended: add both and redirect one to the other.
- Apex (`example.com`): **A** record. Take the value from the project's domain card. In most projects it is `76.76.21.21`; new projects may differ (e.g. `216.198.79.1`); verification looks for the value on the card.
- Subdomain (`www`, `app`): **CNAME**, the target is project-specific (on the card, e.g. `…vercel-dns-017.com`).
- If the domain is in another Vercel account, a **TXT** verification named `_vercel` is requested.
- If you will move the nameserver to Vercel, first copy the MX and verification TXT records; otherwise email stops. SSL is automatic.

**Backup.** There is no data in Vercel; see the database's section.

**Rollback.** Project → Production Deployment box → Instant Rollback (or Deployments → ⋮ → Instant Rollback).
- Hobby returns only to the previous prod deploy; Pro and Enterprise to any deploy that went to prod.
- Environment variables are not rolled back; the old build runs with its own values.
- After a rollback the prod domain is not assigned automatically: a new push does not go live. When the fix is ready, "Undo Rollback" or `vercel promote <deploy-url>`.

## Supabase (database + auth)

Checked: 2026-10-25. Sources: [Backups](https://supabase.com/docs/guides/platform/backups) · [Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [API keys](https://supabase.com/docs/guides/api/api-keys) (no dates on the pages)

**Project.** Open a separate project for prod. Write its ref in `accounts.md` → Environments → prod row. Auth and email settings: `docs/architecture/stack.md` → "Go live (extra)".

**Keys.** The new keys are `sb_publishable_…` (can go to the client) and `sb_secret_…` (server only; as Secret in the hosting panel). A long key starting with `eyJ` is the old type. Supabase is deprecating the old `anon` and `service_role` keys by the end of 2026: use the new keys in a new project. If `.env.example` still has the old names (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), enter the new key under the same name.

**Backup.**
- Free: automatic backups are not listed. Take a regular external backup. The default `db dump` takes only the schema; a full backup is three files. **The user runs** these commands **in their own terminal**: the connection address holds the prod database password, the AI does not run the command and does not ask for the password. The files do not enter the repository.
  ```bash
  npx -y supabase@2.120.0 db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
  npx -y supabase@2.120.0 db dump --db-url "$PROD_DB_URL" -f schema.sql
  npx -y supabase@2.120.0 db dump --db-url "$PROD_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
  ```
  `PROD_DB_URL`: the Session pooler address on the panel's Connect screen; it is not written to a permanent file. Requirements: Supabase CLI and Docker.
- Pro keeps daily backups up to 7 days, Team 14 days, Enterprise 30 days.
- PITR: an add-on on Pro and above, at least Small compute. 7/14/28 days retention, about $100/$200/$400 a month. At worst 2 minutes of data loss. When PITR is turned on, daily backups stop.
- Restore: Database → Backups. The project is unreachable during this; the time grows with the database size. Storage files are not in the backup.
- Drill: do not restore prod. The user loads the three files into a temporary local database on their own machine (`supabase start`) with `psql --single-transaction` (order and flags are on the source page), checks a few tables, then deletes the local database and the files. Loading into the dev project: personal data from prod would move to the environment the AI reads.

**Rollback.** To undo a migration, write a reverse migration; restoring from backup is the last resort (downtime and data loss).

## Railway (backend)

Checked: 2026-10-25. Sources: [Working with domains](https://docs.railway.com/networking/domains/working-with-domains) · [Variables](https://docs.railway.com/variables) · [Deployment actions](https://docs.railway.com/deployments/deployment-actions) · [Backups](https://docs.railway.com/volumes/backups) · [Plans](https://docs.railway.com/pricing/plans) (no dates on the pages)

**Project.** Create a service from the GitHub repository. Railway address: service Settings → Networking → Public Networking → Generate Domain.

**Environment variables.** The service's Variables tab. A value shared by several services: Project Settings → Shared Variables, in the service `${{shared.AD}}`. Database address by reference: `${{Postgres.DATABASE_URL}}` (if the service name is Postgres). Make secrets **sealed**: the value is not visible in the interface or the API, cannot be unsealed, and is not copied to a PR environment. Changes are first "staged"; Deploy applies them.

**Domain.** Service Settings → Public Networking → + Custom Domain. The panel shows a **CNAME** (e.g. `…up.railway.app`) and a **TXT** record; enter both exactly. Without the TXT the domain is not verified and returns 404. Propagation can take up to 72 hours.
- For the apex, the DNS provider must support CNAME flattening or ALIAS (Cloudflare, Namecheap: CNAME; DNSimple: ALIAS). Route 53, Azure DNS, GoDaddy, Hostinger, NameSilo, Squarespace do not support it: move the nameserver to Cloudflare.
- If the Cloudflare proxy is on, the SSL/TLS setting must be **Full**; Full (Strict) does not work.
- SSL (Let's Encrypt) within 1 hour after DNS. Limit: Trial 1 domain, Hobby 2 per service, Pro 20.

**Backup.** Database service → Backups tab. Manual backup and schedule: daily (kept 6 days), weekly (27 days), monthly (89 days). A manual backup is limited to 50% of the volume size. A restore opens a new volume, the old one stays detached; Deploy applies it and it works only within the same project and environment. If the volume is deleted, its backups go too: also take an external backup with `pg_dump`.

**Rollback.** Service → Deployments → previous deploy → ⋮ → Rollback. It restores the image and the variables, not the database schema. The window equals the image retention time: Free/Trial 24 hours, Hobby 72 hours, Pro 120 hours. For anything older, redeploy.

## EAS (mobile)

Checked: 2026-10-25. Sources: [Environment variables](https://docs.expo.dev/eas/environment-variables/) (2026-07-21) · [Manage variables](https://docs.expo.dev/eas/environment-variables/manage/) (2026-07-21) · [Submit](https://docs.expo.dev/submit/introduction/) (2026-10-12) · [Rollbacks](https://docs.expo.dev/eas-update/rollbacks/) (2025-03-03 ⚠️)

**Project and accounts.** Apple Developer Program and Google Play Console accounts go into `accounts.md` (with the yearly renewal date). Prepare the store listing in Play Console before submission. `eas submit` uploads the first Android release to the internal testing track. Submission in CI needs a Google service account key and an App Store Connect API key; these files do not enter the repository.

**Environment variables.** Environments: development, preview, production. Visibility:
- plain text: visible on the site, in the CLI and in the log;
- sensitive: hidden in the log, readable on the site and in the CLI;
- secret: readable only on EAS servers. For keys needed during the build (e.g. a private package token).

Every value that goes into the app (`EXPO_PUBLIC_…`) is public: do not put a secret there. The build profile picks the environment from `eas.json` → `environment`; update with `eas update --environment production`. Enter the value on the site: `eas env:set --value …` writes the value to the shell history.

**Backup.** There is no data in EAS; see the backend's section (Supabase or Railway).

**Rollback.** `eas update:rollback`: republishes the previous update or returns to the update embedded in the build. A native code change is not rolled back with an update: a new build and store review are needed.

## Rollback drill (all)

Once before launch, with user approval: publish a harmless change, roll it back, see with a smoke test that the old version is live, then return to normal (in Vercel "Undo Rollback"). Write the result in the `/release` report on the "Rollback path" line.
