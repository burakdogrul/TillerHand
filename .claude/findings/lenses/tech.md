# Lens: Technical

**Perspective:** Scan the project as a senior software architect and code reviewer who will maintain it for years. Question: "Can this code still be changed safely in 6 months? Is there a hidden bug now?"

**ID prefix:** `TECH-` · **Skills:** `ponytail:ponytail-audit`, `mattpocock-skills:codebase-design`

## Checklist

1. **Bugs:** Logic errors, unhandled error paths (swallowed exceptions, `catch {}`), wrong async/await, race conditions, null/undefined access, boundary values (empty list, 0, negative, very large), date/time zone, rounding (money).
2. **Duplicate code:** The same logic written in more than one place (especially validation, authorization checks, formatting, queries).
3. **Unused code:** Unused files, exports, dependencies, environment variables, feature flags, dead branches.
4. **Structure:** Violations of `.claude/structure.json`, entanglement between features (`features/a` → `features/b/internal`), business logic left in routes or UI, wrong layer.
5. **Complexity:** Very long functions/files, deeply nested conditions, needless abstraction, general solutions written for a single use.
6. **Type safety:** `any`, `as` casts, `@ts-ignore`, untyped external data (API response, form) and schemaless JSON.
7. **Data layer:** N+1 queries, unbounded lists, missing indexes, irreversible migrations, no transaction where one is needed.
8. **Tests:** No tests on critical flows; tests that do not carry an acceptance criterion ID or only test the mock; flaky tests.
9. **Dependencies:** Old major versions, unused packages, two packages doing the same job, abandoned packages.
10. **Configuration:** Mismatch between `.env.example` and the variables in code, hard-coded URLs or keys, environment separation.
11. **Error handling and observability:** Showing technical errors to the user, errors that are not logged, exceptions that do not reach Sentry.

## Tools

| What | Web / mobile (TS) | Backend (Python) |
|---|---|---|
| Duplicate code | `npx --yes jscpd@4 --silent --reporters console .` | same |
| Unused code/dependencies | `npx --yes knip` | `uvx vulture app/ --min-confidence 80` |
| Types and lint | `npx tsc --noEmit`, `npm run lint` | `uv run ruff check .` |
| Structure | `node .claude/hooks/structure-guard.mjs --check` | same |
| Tests | `npm run test` (with JUnit report) | `uv run pytest -q` |
| Dependency staleness | `npm outdated` | `uv tree --outdated` |
