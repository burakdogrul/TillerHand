# Test Plan

> Approach: **Balanced.** Automatic tests are required for critical flows; a manual checklist is enough for the rest.
> Test tools and commands: `docs/architecture/stack.md`.

## 1. Critical flows (automatic test REQUIRED)

Every change that touches one of these flows comes with a test. If a test is red, there is no merge/deploy.
Status column (the dashboard reads it; English in every language): `✅` when the test file exists and passes, `⬜` when it does not yet.

| # | Flow | Why critical | Test type | Test file | Status |
|---|---|---|---|---|---|
| K1 | Sign-up / sign-in / sign-out | Everyone uses it | e2e | | ⬜ |
| K2 | Authorization: a user cannot see another user's data | Data leak | integration | | ⬜ |
| K3 | Payment / subscription (if any) | Money | e2e + webhook | | ⬜ |
| K4 | Main data write operation (create/update/delete) | Data loss | integration | | ⬜ |
| K5 | [Project-specific] | | | | ⬜ |

## 1a. Acceptance tests (living specification)

Every acceptance criterion in the PRD (like `AC-01.1`) becomes a runnable test **before any code is written**, and it is red first.
The test name contains the criterion id. Examples:

```ts
test('AC-01.1 the form is not submitted with an invalid email', async ({ page }) => { /* ... */ });
```
```python
def test_AC_01_1_invalid_email_form_not_submitted(client): ...   # Python: use "AC_01_1" instead of "AC-01.1"
```

- Tests are run so that they produce a JUnit XML report. The dashboard reads this report:
  - Playwright: `--reporter=junit` → `test-results/junit.xml`
  - Vitest: `--reporter=junit --outputFile=test-results/junit.xml`
  - pytest: `--junitxml=test-results/junit.xml`
- Check the box in the PRD only for a criterion whose test passes. The dashboard compares the two sources: if the box is checked but the test is missing or red, it warns in the "Needs attention" area.
- Even if the AI says "done", a criterion whose test is not green is not finished.

## 1b. Adversarial tests

About half of AI code has a security hole (Veracode, 2025). So for every endpoint / server action that returns or writes data, these tests are written:

| Test | What it tries | Expected |
|---|---|---|
| Someone else's record (IDOR) | User B reads / updates / deletes with the id of A's record | 403 or 404; data does not change |
| Access without a session | Request without signing in | 401 / redirect |
| Role escalation | A normal user calls an admin endpoint | 403 |
| XSS | `<script>alert(1)</script>` and `"><img src=x onerror=alert(1)>` in a text field | Shown as text, does not run |
| Input limits | Very long text, negative number, empty array, unexpected field | Validation error; not 500 |
| Log injection | A line break (`
`) and a fake log line in the input | Escaped / single line in the logs |

Test names start with the prefix `ATTACK:`. The `security-auditor` agent counts missing adversarial tests as CRITICAL.

**If Supabase is used,** the adversarial test of the database layer comes ready: `tests/security/rls.mjs`. An anonymous user and a second user try to read, update, delete and write on behalf of the first user's rows; it is red if there is a public table with RLS off or not registered in the test. It runs only against local Supabase (CI `rls` job, no secret needed). Every new table is added to the `TABLES` list. Tests at the application layer (server action, route handler) are still written separately according to the table above.

## 2. Rules

- **Every bug fix comes with a regression test.** First the test that shows the bug goes red, then it turns green with the fix.
- Changing a test to make it pass is forbidden; if the test is wrong, explain that first.
- Pure business logic (calculation, price, date, permission check) is covered by unit tests.
- External services (payment, email, AI API) are mocked in tests; no real key is used.

## 3. Manual checklist (before every release, ~10 min)

- [ ] The main flow from start to finish as a new user
- [ ] Wrong inputs: empty form, very long text, special characters, emoji
- [ ] Slow/interrupted network (browser/device network throttling)
- [ ] Mobile width / small screen
- [ ] Sign out, then try to reach a protected page with the back button
- [ ] Empty state (a user with no data at all)
- [ ] [Project-specific]

## 4. Commands

```bash
[test command]         # all
[test command] [file]  # single file
[e2e command]          # end to end
```
