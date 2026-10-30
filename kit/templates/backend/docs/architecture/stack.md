# Stack: Backend / API / Automation

> This file is loaded into the AI every session. If the project makes a different choice, update this file
> and write the reason to `docs/decisions/log.md`.

## Decision points

`/start` asks these decisions in order (`docs/workflow/decision-protocol.md`). For each decision, offer the 2-4 options that fit this project best. The **recommended** label is the default, but if another option fits the PRD better, recommend that one and say why. A claim that can change (price, free tier, limit) with a `(source: <url>, YYYY-MM-DD)` note newer than 90 days is not researched again.

| # | Decision | Options (when each is better) |
|---|---|---|
| 1 | Language and framework | **Python + FastAPI** (recommended: AI/data work, fast development, automatic OpenAPI docs) · Node.js + TypeScript + Hono/Fastify (same language as the frontend, shared types) · Go (high performance, single binary, low memory) · Django (ready-made admin panel, large monolith) |
| 2 | Database | **PostgreSQL** (recommended: fits everything, JSON support) · SQLite / Turso (single server, small scale, zero operations) · MongoDB (schemaless documents, variable structure) |
| 3 | ORM / queries | **SQLAlchemy 2 + Alembic** (Python) · SQLModel (one model with Pydantic, simpler) · If Node is chosen: Drizzle (recommended) / Prisma |
| 4 | Authentication | **An external provider's JWT** (Supabase Auth / Clerk; you do not write user management) · API key (service to service, B2B API) · Your own session/JWT (full control; the security burden is yours) |
| 5 | Background jobs | **Platform cron** (recommended for simple scheduled jobs) · ARQ / Celery + Redis (queue, retries, heavy work) · Temporal / Inngest (multi-step, long-running workflows) · None |
| 6 | API style | **REST + OpenAPI** (recommended) · GraphQL (many different clients, flexible queries) · tRPC (TypeScript clients only) |
| 7 | Hosting | **Railway** (recommended: easiest, Postgres included; no free permanent tier, Hobby is 5 dollars a month and includes 5 dollars of usage (source: https://docs.railway.com/pricing/plans, 2026-10-26)) · Fly.io (region close to users, scaling) · Render · Google Cloud Run (pay per request, scales to zero) · VPS + Coolify (fixed cost, maintenance is yours) |
| 8 | Package management | **uv** (recommended for Python: very fast, lock file) · Poetry |
| 9 | Observability | **Sentry + structured logs** (Better Stack / Axiom) · OpenTelemetry (distributed services) |
| 10 | Testing | **pytest + httpx** (recommended) · If Node is chosen: Vitest + supertest |

## Chosen technologies

> Filled in by `/start` Step 4 from the decision points. The table below is the **recommended** stack and counts as a proposal until approved.
> If the choice differs, rewrite this file's commands, folder, rules, verification and checks sections to match.

| Layer | Choice | Note |
|---|---|---|
| Language | Python 3.12+ | Alternative: Node.js + TypeScript (Hono/Fastify + Drizzle) |
| Package management | uv | `uv add`, not `pip install` |
| API | FastAPI + Pydantic v2 | |
| Settings | pydantic-settings | All config comes from environment variables |
| DB | PostgreSQL + SQLAlchemy 2 (or SQLModel) | |
| Migration | Alembic | |
| Background jobs | Cron (platform) / ARQ / Celery | Only as needed; cron is enough for simple jobs |
| Lint + format | Ruff | |
| Test | pytest + httpx | |
| Packaging | Docker | |
| Hosting | Railway / Fly.io / Render | |
| Error tracking | Sentry | |
| Cron monitoring | Healthchecks.io (dead man's switch) | Alarm if a job does not run |

## Commands

```bash
uv sync                                  # install dependencies
uv run fastapi dev app/main.py           # development
uv run pytest                            # test
uv run ruff check .                      # lint
uv run ruff format .                     # format
uv run alembic revision --autogenerate -m "[name]"   # create a migration (always read the output)
uv run alembic upgrade head              # apply migrations
uv run --with pip-audit pip-audit                            # dependency vulnerabilities
docker build -t [name] . && docker run --env-file .env -p 8000:8000 [name]
```

## Folder structure

Feature-based structure and rules: `docs/architecture/structure.md`. Map: `.claude/structure.json` (writing outside it is asked about, CI checks it).
```
app/
├── main.py                     # app, router registration, /health
├── config.py                   # pydantic-settings
├── core/                       # database session, security, logging, error handlers, shared dependencies
├── features/
│   └── <feature>/              # e.g. invoice/
│       ├── router.py           # HTTP endpoints (thin)
│       ├── service.py          # business logic
│       ├── repository.py       # database access
│       ├── models.py           # SQLAlchemy models
│       ├── schemas.py          # Pydantic input/output schemas
│       ├── dependencies.py
│       └── exceptions.py
├── shared/                     # helpers used by more than one feature
└── jobs/                       # scheduled and background jobs (idempotent)
alembic/                        # migration'lar
tests/
├── <feature>/                   # tests by feature (test_AC_01_1_... acceptance tests included)
└── live/                       # live monitoring tests
Dockerfile  pyproject.toml  uv.lock
```

## Coding rules

- Keep the router thin; business logic goes in `services/`.
- Every endpoint has a Pydantic input schema; the response has a schema too (internal fields must not leak).
- Use a consistent error format: `{"error": {"code": "...", "message": "..."}}`.
- Pagination is required on list endpoints.
- **An explicit timeout on every external call** (`requests` has no default timeout, so a request can hang forever) and, where needed, retry with backoff.
- Jobs are **idempotent**: running twice does no harm.
- Logs are structured (JSON) and include the request id; they contain no personal data or secrets.
- `/health` endpoint: the app + the DB connection.
- Review migrations by hand; `autogenerate` does not catch everything correctly.
- Do not use a synchronous, blocking library in an async endpoint.

## Verification (evidence before a task is done)

- Endpoint: run the server, then use `curl -i` (or httpx) for the main scenario + an unauthorized request + invalid input. Show the request and the response.
- Job/cron: trigger the job by hand once, show the log and its effect in the DB; run it twice and show it is idempotent.
- Migration: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` passes cleanly.

## Automatic checks

| Layer | What it does | Setup |
|---|---|---|
| Claude hooks | Block writing secrets; format `.py` files with Ruff and feed lint errors back to the AI | Ready (`.claude/settings.json`). Needs Node.js |
| Pre-commit | Ruff + secret scan, before commit | `uvx pre-commit install` (once) |
| CI (+ Semgrep, duplicate code, complexity budget) | Lint, format, migration, test, vulnerability scan, Docker build, gitleaks, complexity budget on changed files (function complexity 15, function 80, file 400 lines; `node .claude/hooks/budget.mjs --check`) | `.github/workflows/ci.yml` is ready; push to GitHub |
| Dependabot | Weekly dependency PRs | `.github/dependabot.yml` is ready |
| MCP | Read errors in Sentry (`/maintain`) | `.mcp.json` is ready; sign in to Sentry on first use |

## Acceptance tests and feature flags

**Acceptance tests** (`docs/quality/test-plan.md` §1a): The test function name carries the criterion id (`test_AC_01_1_...`). The dashboard reads the JUnit report:

```bash
uv run pytest --junitxml=test-results/junit.xml
```

**Feature flags** (`docs/operations/feature-flags.md`): An emergency shutoff must not need a redeploy. Use a `feature_flags` table in the database (`name`, `enabled`, `percent`, `updated_at`) + a 60 s in-process cache. Reading happens in one place: `app/services/flags.py` → `is_enabled("name", user_id)`. Changing a flag is done through an admin endpoint or SQL and is logged.

## Common AI mistakes (watch for these)

- Writing a machine-specific absolute path into code, a test or a setting (`C:\Users\<ad>\…`, `/home/<ad>/…`, the full path of the project folder): it does not work on another machine. Derive the path with `Path(__file__).parent`, a root from settings, or `tmp_path` in a test. The deterministic gate catches this.
- Mixing Pydantic v1 syntax (`class Config`, `.dict()`) with v2.
- Not setting a timeout on an external API call, swallowing the error (`except: pass`).
- Opening CORS with `allow_origins=["*"]` together with credentials.
- Writing a cron job inside the server as `while True: sleep` (lost on restart, cannot be monitored).
- Not closing the DB session, exhausting the connection pool.

## Security (extra)

- [ ] Authentication: JWT verification (signature + expiry + issuer) or an API key (stored hashed).
- [ ] Rate limit (slowapi or reverse proxy).
- [ ] `/docs` and `/openapi.json` are off or protected in prod.
- [ ] CORS allowlist.
- [ ] The Docker image runs as a non-root user, and the image has no `.env`.

## Go live (extra)

- [ ] Dockerfile: multi-stage, non-root user, `HEALTHCHECK`
- [ ] The platform health check points to `/health`
- [ ] Migration runs automatically or in a controlled way at the deploy step (before the app)
- [ ] Environment variables are on the platform; `DEBUG` is off
- [ ] Resource limits (memory/CPU) and automatic restart
- [ ] Every cron job pings Healthchecks.io; an alarm fires if it does not
- [ ] Log retention and search (platform logs or Better Stack/Axiom)
- [ ] A simple load trial (`hey`, `k6`): no errors at 3 times the expected traffic
- [ ] Response time target: p95 < 500 ms (main endpoints)

## Maintenance (extra)

- Weekly: did the cron jobs succeed, is the queue backing up, the 5xx rate.
- Monthly: `uv lock --upgrade` + tests, `uv run --with pip-audit pip-audit`, slow queries (`pg_stat_statements`).
- Quarterly: major versions of Python and core libraries, Docker base image update, DB index and size review.
