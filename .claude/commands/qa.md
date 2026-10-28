---
description: Runs the UI acceptance criteria as Playwright tests in a real browser; writes the report from the test result.
argument-hint: [criterion ids (AC-01.1 AC-02.3), empty = UI criteria in the PRD]
---

Scope: $ARGUMENTS

`/qa` ties the "it works" claim to evidence. Each criterion is a Playwright test that runs in a real browser, and the report is produced from the test result. In a mobile project, run the Maestro flows (`.maestro/`) instead of this command. In a project without a UI, acceptance tests are enough.

1. **Select the criteria.** From the criteria with ids (`AC-01.1`) in `docs/product/prd.md`, take those that describe behavior the user sees on screen. If an argument was given, take only those. Tell me the list in one line.
2. **Preparation.** Tests go only to the local app: if `baseURL` and `webServer.url` in `playwright.config.*` are not localhost, 127.0.0.1 or [::1], stop and ask me (tests that write data must not go to another environment). If there is no `webServer`, add it: `command` = `AGENTS.md` → `dev:`, `url` = `preview:`, `reuseExistingServer: true`. Show me the command and address you added: `npx playwright test` will run this command.
3. **Each criterion is one test.**
   - If the criterion has a permanent test in `tests/e2e/` (outside `tests/e2e/qa/`), use it; do not rewrite it.
   - Otherwise write `tests/e2e/qa/<id>.spec.ts` (this folder does not go into git; if a test is left from a previous `/qa`, update it). The test name starts with the id: `test('AC-01.2 The record appears in the list', ...)`. Do what the user does (click, fill) and look for the result on screen. Do not touch the app code or the database directly.
   - Put this pattern at the top of each new test file. A screenshot is taken even if the test stays, and a console error turns the test red:
     ```ts
     let errors: string[] = [];
     test.beforeEach(({ page }) => {
       errors = [];
       page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
       page.on('pageerror', (e) => errors.push(e.message));
     });
     test.afterEach(async ({ page }, info) => {
       await page.screenshot({ path: `test-results-qa/shots/${info.title.split(' ')[0]}.png`, fullPage: true });
       expect(errors, `console error: ${errors[0] ?? ''}`).toEqual([]);
     });
     ```
4. **Run:** run all selected test files in a single command every time:
   `PLAYWRIGHT_JUNIT_OUTPUT_NAME=test-results-qa/junit.xml npx playwright test <files> --output=test-results-qa --reporter=list,junit`.
   A separate output folder is required: Playwright empties its output folder on every run, and the acceptance report in `test-results/` must not be deleted. Do not fix the bug in the app here: `/qa` measures, fixing is `/fix-bug`'s job. If the error is in the test itself (wrong selector, wrong address), fix the test, rerun all files, and say so in the report.
5. **Report:** `node .claude/hooks/qa-report.mjs` → `docs/quality/qa/<date>.md`, evidence in `.previews/qa-<tarih>/`. Do not edit the report by hand. If the script says "QA report not written", tell me the reason; if no test ran, the result is not "passed". Show the remaining criteria with the screenshot and the reason, and suggest `/fix-bug` for each.
6. **New tests:** If a test passed in `tests/e2e/qa/`, ask with AskUserQuestion: "Move the N passing tests to `tests/e2e/` as permanent acceptance tests?" If yes, move them. If no, they stay in the folder; the next `/qa` reuses them.
7. Status block.
