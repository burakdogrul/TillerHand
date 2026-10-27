# Architecture

> Stage: written at the end of **0 - Idea**, updated throughout **2 - Development**.
> When the structure changes, this file changes too. If it is out of date, the AI makes wrong assumptions.

## 1. Overview

```
[Client] ──HTTPS──> [App/API] ──> [Database]
                          │
                          ├──> [Auth provider]
                          ├──> [Payment]
                          └──> [E-posta / AI API / Depolama]
```

## 2. Technology choice

| Layer | Choice | Why | Alternative |
|---|---|---|---|
| Language | | | |
| Framework | | | |
| Database | | | |
| Auth | | | |
| Hosting | | | |
| Error tracking | | | |

Detailed rules: `docs/architecture/stack.md`.

## 3. Folder structure

```
[Project root folder tree, main folders only + the job of each]
```

## 4. Data model

| Table | Fields (the important ones) | Relations | Personal data? | Access rule |
|---|---|---|---|---|
| users | id, email, created_at | | Yes | Only the user |
| | | | | |

## 5. External services

| Service | Purpose | Environment variable | Price / limit | Account owner |
|---|---|---|---|---|
| | | | | |

## 6. Authentication and authorization

- **Sign-in methods:** [email+password / magic link / Google / Apple]
- **Roles:** [user, admin]
- **Where authorization is checked:** [server side / DB rules (RLS) / both]

## 7. Environments

| Environment | URL | Database | How it is deployed |
|---|---|---|---|
| Local | localhost | local/dev project | - |
| Preview/Staging | | separate | when a PR is opened |
| Prod | | separate | merge to `main` |

## 8. Known technical debt

| What | Why it is this way | When it should be fixed |
|---|---|---|
| | | |
