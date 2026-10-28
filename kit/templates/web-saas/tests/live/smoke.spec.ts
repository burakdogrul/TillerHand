// Live smoke test (.github/workflows/live-monitoring.yml): runs against the LIVE site every 3 hours.
// Read only: it opens pages, never fills or submits a form. Flows that need the test account go in their own files
// (LIVE_TEST_EMAIL / LIVE_TEST_PASSWORD come from the repo secrets, never from code).
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const MAX_MS = Number(process.env.LIVE_MAX_MS ?? 3000);

test('live: home page opens, response time within the limit, no console errors',async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  const start = Date.now();
  const response = await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const ms = Date.now() - start;
  expect(response?.ok(), `status code ${response?.status()}`).toBe(true);
  expect(ms, `home page ${ms} ms (limit ${MAX_MS} ms)`).toBeLessThan(MAX_MS);
  expect(errors, `console error: ${errors[0] ?? ''}`).toEqual([]);
});
