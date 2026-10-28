# [PROJECT NAME]

[One-sentence description]

**Live:** [URL] · **Status:** [development / beta / live]

## Requirements

- [Runtime and its version: Node.js 22 (`.nvmrc`) / Python 3.12 (`.python-version`) / Expo CLI]
- [System dependencies: PostgreSQL 16, ffmpeg, ... (the ones the package manager does not install)]
- [Accounts: Supabase, Vercel, ...]

Package versions are pinned in the lock file (`package-lock.json` / `uv.lock`); install from that file.

## Installation

```bash
git clone [repo-url]
cd [project]
[dependency install command]
cp .env.example .env    # fill in the values
[migration command]
[dev command]
```

## Environment variables

Full list and descriptions: `.env.example`.

## Commands

| Command | What it does |
|---|---|
| `[dev]` | Development server |
| `[test]` | Tests |
| `[lint]` | Lint |
| `[build]` | Production build |

## Deploy

[How to deploy, where to, who is authorized. How to roll back.]

## Docs

| File | Contents |
|---|---|
| `docs/product/prd.md` | What we are building, for whom |
| `docs/architecture/overview.md` · `docs/architecture/structure.md` | How it is built, where the folders are |
| `docs/product/roadmap.md` | Tasks |
| `docs/decisions/log.md` | Why we did it this way |
| `docs/operations/release-checklist.md` · `docs/operations/deploy-setup.md` · `docs/operations/maintenance.md` | Operations |
| `docs/findings/` | Technical, business, security, UX, performance and legal findings reports |
