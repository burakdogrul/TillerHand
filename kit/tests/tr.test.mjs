// Run: node --test "kit/tests/*.test.mjs"
// Turkey addon (F-26): --addons tr places the legal notes for every type and the payment notification check in the
// stack's language; the attack test goes red when the check is removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = path.join(REPO, 'kit', 'kit.mjs');
const ADDON = path.join(REPO, 'kit/templates/addons/tr');
const run = (cmd, args, cwd) => spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
const exists = (p, f) => fs.existsSync(path.join(p, f));

function project(type) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), `tr-${type}-`));
  for (const args of [['init', '--project', p], ['install', '--type', type, '--addons', 'tr', '--project', p]]) {
    const r = run(process.execPath, [KIT, ...args]);
    assert.equal(r.status, 0, r.stderr);
  }
  return p;
}

test('Ö-26.1 install --addons tr places the files of the chosen type only', () => {
  const web = project('web-saas'), backend = project('backend'), mobile = project('mobile');
  try {
    const env = (p) => fs.readFileSync(path.join(p, '.env.example'), 'utf8');
    for (const p of [web, backend, mobile]) {
      assert.ok(exists(p, 'docs/legal/turkiye.md'));
      assert.ok(!exists(p, 'types'), 'the per-type folder is not copied as is');
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(p, '.kit.json'), 'utf8')).addons, ['tr']);
    }
    for (const p of [web, backend]) assert.match(env(p), /^IYZICO_SECRET_KEY=$/m);
    assert.doesNotMatch(env(mobile), /IYZICO|PAYTR/, 'server-only keys stay out of the app project');
    for (const f of ['tests/__init__.py', 'tests/security/__init__.py']) assert.ok(exists(backend, f), `${f}: pytest finds app/ from the project root`);
    for (const f of ['src/lib/payments/webhook-signature.ts', 'tests/security/payment-webhook.mjs', '.github/workflows/payment-webhook.yml']) assert.ok(exists(web, f), f);
    for (const f of ['app/shared/payments.py', 'tests/security/test_payment_webhook.py']) assert.ok(exists(backend, f), f);
    assert.ok(!exists(backend, 'src/lib/payments/webhook-signature.ts') && !exists(web, 'app/shared/payments.py'), 'no code from another stack');
    assert.ok(!exists(mobile, 'src/lib/payments/webhook-signature.ts') && !exists(mobile, 'app/shared/payments.py'), 'mobile gets the notes only');
  } finally {
    for (const p of [web, backend, mobile]) fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-26.1 an existing project gets the addon with update --addons tr; a second run changes nothing', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-up-'));
  try {
    for (const args of [['init', '--project', p], ['install', '--type', 'web-saas', '--project', p]]) assert.equal(run(process.execPath, [KIT, ...args]).status, 0);
    const first = run(process.execPath, [KIT, 'update', '--project', p, '--addons', 'tr']);
    assert.equal(first.status, 0, first.stderr);
    for (const f of ['docs/legal/turkiye.md', 'src/lib/payments/webhook-signature.ts', 'tests/security/payment-webhook.mjs']) assert.ok(exists(p, f), f);
    const env = () => fs.readFileSync(path.join(p, '.env.example'), 'utf8');
    assert.equal(env().match(/^IYZICO_SECRET_KEY=$/gm)?.length, 1, 'the per-type .append is applied on update too');
    assert.match(run(process.execPath, [KIT, 'update', '--project', p, '--addons', 'tr']).stdout, /Değişiklik yok/);
    assert.equal(env().match(/^IYZICO_SECRET_KEY=$/gm)?.length, 1, 'not appended twice');
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-26.1 an addon added later never overwrites or silently skips the project\'s own file of the same name', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-own-'));
  try {
    for (const args of [['init', '--project', p], ['install', '--type', 'web-saas', '--project', p]]) assert.equal(run(process.execPath, [KIT, ...args]).status, 0);
    const own = path.join(p, 'src/lib/payments/webhook-signature.ts');
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, '// projenin kendi kodu\n');
    const r = run(process.execPath, [KIT, 'update', '--project', p, '--addons', 'tr']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(own, 'utf8'), '// projenin kendi kodu\n', 'the project file is untouched');
    assert.ok(exists(p, 'src/lib/payments/webhook-signature.ts.kit-new'), 'the kit version waits next to it');
    assert.match(r.stdout, /webhook-signature\.ts/, 'and the report names it');
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-26.1 the payment attack test is red without the signature check and green with it (web-saas)', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-web-'));
  try {
    fs.cpSync(path.join(ADDON, 'types/web-saas'), p, { recursive: true });
    const testRun = () => run(process.execPath, ['--test', 'tests/security/payment-webhook.mjs'], p);
    const mod = path.join(p, 'src/lib/payments/webhook-signature.ts');
    const real = fs.readFileSync(mod, 'utf8');
    fs.writeFileSync(mod, 'export const verifyIyzico = (): boolean => true;\nexport const verifyPaytr = (): boolean => true;\n');
    assert.notEqual(testRun().status, 0, 'accepting every notification must fail the test');
    // Checking only that a signature is present is not enough either
    fs.writeFileSync(mod, 'export const verifyIyzico = (b: object, s?: string | null): boolean => Boolean(s);\nexport const verifyPaytr = (f: { hash?: string }): boolean => Boolean(f.hash);\n');
    assert.notEqual(testRun().status, 0, 'a presence-only check must fail the test');
    fs.writeFileSync(mod, real);
    const green = testRun();
    assert.equal(green.status, 0, green.stdout + green.stderr);
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-26.1 backend: the same vectors pass in Python; red without the check', (t) => {
  const python = ['python3', 'python'].find((c) => run(c, ['--version']).status === 0);
  if (!python) return t.skip('python not installed');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-py-'));
  try {
    fs.cpSync(path.join(ADDON, 'types/backend'), p, { recursive: true });
    const testRun = () => run(python, ['-B', '-m', 'unittest', 'tests.security.test_payment_webhook'], p);
    const green = testRun();
    assert.equal(green.status, 0, green.stderr);
    const mod = path.join(p, 'app/shared/payments.py');
    fs.writeFileSync(mod, 'def verify_iyzico(*a):\n    return True\n\n\ndef verify_paytr(*a):\n    return True\n');
    assert.notEqual(testRun().status, 0);
    // TS and Python agree on one signed notification
    const sig = run(process.execPath, ['-e', `const { createHmac } = require('node:crypto'); process.stdout.write(createHmac('sha256', 'k').update('o' + 's' + 'success' + '100').digest('base64'))`]).stdout;
    fs.cpSync(path.join(ADDON, 'types/backend/app'), path.join(p, 'app'), { recursive: true });
    const py = run(python, ['-B', '-c', `from app.shared.payments import verify_paytr; print(verify_paytr({"merchant_oid": "o", "status": "success", "total_amount": "100", "hash": "${sig}"}, "k", "s"))`], p);
    assert.equal(py.stdout.trim(), 'True', py.stderr);
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
  }
});

test('Ö-26.2 every legal item has a primary source and a check date; the note says it is not legal advice', () => {
  const doc = fs.readFileSync(path.join(ADDON, 'docs/legal/turkiye.md'), 'utf8');
  assert.match(doc, /\*\*Hukuki görüş değildir\.\*\*/);
  const sections = doc.split(/^## /m).slice(1);
  assert.equal(sections.length, 4);
  const primary = { 'KVKK': 'mevzuat.gov.tr', 'e-Fatura': 'gib.gov.tr', 'Ödeme': 'docs.iyzico.com' };
  for (const [name, domain] of Object.entries(primary)) {
    const s = sections.find((x) => x.split('\n')[0].includes(name));
    assert.match(s, /^Kontrol: \d{4}-\d{2}-\d{2}\./m, `${name}: check date`);
    assert.ok(new RegExp(`\\]\\(https://[\\w.-]*${domain.replace(/\./g, '\\.')}/`).test(s), `${name}: primary source`);
  }
  assert.match(doc, /5 iş günü içinde Kuruma bildirilir/);
  for (const f of ['legal', 'business']) assert.match(fs.readFileSync(path.join(REPO, `.claude/findings/lenses/${f}.md`), 'utf8'), /docs\/legal\/turkiye\.md/, f);
  assert.match(fs.readFileSync(path.join(REPO, '.claude/commands/start.md'), 'utf8'), /Türkiye eki \(`tr`\) önerilir/);
});
