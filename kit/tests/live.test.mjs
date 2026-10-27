// Run: node --test "kit/tests/*.test.mjs"
// Live monitoring (F-19): the template workflows check the live site every 3 hours, read only, and the dashboard shows the last run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

test('Ö-19.1 every 3 hours (GitHub Free private repos: 2,000 min/month); read-only smoke test with a response time limit', () => {
  for (const t of ['web-saas', 'backend']) {
    const wf = read(`kit/templates/${t}/.github/workflows/live-monitoring.yml`);
    assert.match(wf, /cron: "17 \*\/3 \* \* \*"/, `${t}: every 3 hours`);
    assert.match(wf, /the LIVE (site|environment) every 3 hours/, `${t}: the comment follows the schedule`);
    assert.match(wf, /secrets\.LIVE_TEST_/, `${t}: the test account stays a secret`);
  }
  const smoke = read('kit/templates/web-saas/tests/live/smoke.spec.ts');
  assert.match(smoke, /LIVE_MAX_MS/);
  assert.match(smoke, /page\.goto/);
  assert.doesNotMatch(smoke, /\.(fill|click|check|setInputFiles)\(|method: ['"](POST|PUT|PATCH|DELETE)/i, 'the smoke test writes nothing');
  assert.match(read('kit/templates/web-saas/.github/workflows/live-monitoring.yml'), /LIVE_MAX_MS: \$\{\{ vars\.LIVE_MAX_MS \|\| '3000' \}\}/);
  const backend = read('kit/templates/backend/.github/workflows/live-monitoring.yml');
  assert.match(backend, /time_total/, 'backend: /health response time is measured');
  assert.match(backend, /-eq 5/, 'backend: "no tests collected" is not an alarm');
});

test('Ö-19.2 dashboard: the last live run is shown; skipped means not set up; a red run or an open issue suggests /fix-bug', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'live-'));
  const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
  write('.kit.json', JSON.stringify({ type: 'web-saas', version: '3.22.0' }));
  const render = (live, issues = []) => {
    write('.claude/state/github-cache.json', JSON.stringify({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: issues, liveRun: live } }));
    const r = spawnSync(process.execPath, [path.join(REPO, '.claude/hooks/dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8');
  };
  assert.match(render({ conclusion: 'skipped', status: 'completed', createdAt: '2026-10-25T09:17:00Z', url: 'https://x/1' }), /Canlı izleme[\s\S]{0,200}kurulmadı[\s\S]{0,80}LIVE_URL/);
  assert.match(render({ conclusion: 'success', status: 'completed', createdAt: '2026-10-25T09:17:00Z', url: 'https://x/2' }), /Canlı izleme[\s\S]{0,200}başarılı/);
  const red = render({ conclusion: 'failure', status: 'completed', createdAt: '2026-10-25T09:17:00Z', url: 'https://x/3' }, [{ number: 7, title: 'Canlı izleme: kritik akış bozuk', url: 'https://x/i/7' }]);
  assert.match(red, /Canlı izleme[\s\S]{0,200}başarısız/);
  assert.match(red, /\/fix-bug/);
  fs.rmSync(p, { recursive: true, force: true });
});
