// Run: node --test "kit/tests/*.test.mjs"
// 3.49.0 audit, kept in CI: a freshly installed project (every type, and every type with the tr + ai add-ons and all
// tools) holds no Turkish letter and no ASCII-Turkish word outside a short allow-list. Turkish stays only where it is
// the subject: the Turkish UI file, the Turkish README / guide, the Turkey add-on's named Turkish terms, person names.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = path.join(REPO, 'kit', 'kit.mjs');
const run = (args) => spawnSync(process.execPath, [KIT, ...args], { encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined } });

const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/u;
const WORDS = new Set(['kontrol', 'guvenlik', 'kayit', 'tamir', 'bakim', 'izle', 'karmasiklik', 'kurul', 'karar', 'tercihler',
  'ozet', 'ozellik', 'girdi', 'beklenen', 'calistir', 'calisan', 'gorev', 'sablon', 'ornek', 'devral', 'kapat', 'olc',
  'komutlar', 'hafif', 'tasarim', 'urun', 'maliyet', 'otomatik', 'kullanici', 'anlatici', 'saldiri', 'varsayilan', 'gunluk',
  'siparis', 'alanadin', 'silindi', 'mesaj', 'durum', 'eski', 'yeni', 'dosya', 'tarih', 'proje', 'paket', 'hedef', 'terimler']);
// Multi-part names the word split cannot see as one word
const PHRASES = /yol-izinli/i;

// Whole files that are Turkish on purpose (path relative to the project, / separated)
const TURKISH_FILES = new Set(['.claude/i18n/tr.json', 'README.tr.md', 'kit/guide.tr.html', 'guide.tr.html']);
// Substrings that may stay, per file ('*' = any file). The '*' list is the allow-list of templates-lang.test.mjs
// (Ö-48.70): official Turkish names, the fixed legal sentence and the I/İ/ı test data the rules name.
const ALLOWED = {
  '*': ['İ/ı', 'İYS', 'GİB', 'e-Arşiv', 'VERBİS', 'BTK', 'ETBİS', '"Bu satış internet üzerinden yapılmıştır."',
    'ısparta', 'İSTANBUL', 'Çağla', 'Ömer', 'İstanbul'],
  // turkiye.md §4 names the Turkish letters, §3 the currency subunit
  'docs/legal/turkiye.md': ['"ı"', '"İ"', 'ç, ğ, ı, ö, ş, ü', 'kuruş'],
  // Clutter globs that catch Turkish-named copies on purpose
  '.claude/structure.json': ['**/*-yedek*', '**/*kopya*'],
  // The Turkish national id number is a personal-data pattern
  '.claude/security-patterns.json': ['tc_kimlik', 'tckn'],
  // Comments that explain the Turkish I/İ/ı case rules the code guards against
  '.claude/hooks/council.mjs': ['"DİSAGREE"'],
  '.claude/hooks/prefs.mjs': ['("KISA" = "kısa", "İ" = "i")'],
  // Turkey add-on attack tests: a non-ASCII signature must not throw
  'tests/security/payment-webhook.mjs': ["'ğ'.repeat(64)"],
  'tests/security/test_payment_webhook.py': ['"ğ" * 64'],
  // Person names
  'LICENSE': ['Doğrul'],
  '.claude-plugin/plugin.json': ['Doğrul'],
  '.claude-plugin/marketplace.json': ['Doğrul'],
};

let tmp;
const projects = [];
before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-english-'));
  for (const type of ['web-saas', 'mobile', 'backend']) {
    for (const [name, init, install] of [
      [type, [], []],
      [`${type}+tr,ai`, ['--tool', 'claude,codex,antigravity'], ['--addons', 'tr,ai']],
    ]) {
      const p = path.join(tmp, name.replace(/[+,]/g, '-'));
      fs.mkdirSync(p);
      for (const args of [['init', '--project', p, ...init], ['install', '--type', type, '--project', p, ...install]]) {
        const r = run(args);
        assert.equal(r.status, 0, `${name}: ${args[0]}\n${r.stdout}${r.stderr}`);
      }
      projects.push({ name, p });
    }
  }
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Every text file of the project (no .git, no binary file)
function textFiles(root) {
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(root, path.join(d.parentPath ?? d.path, d.name)).split(path.sep).join('/'))
    .filter((f) => !/^\.git\//.test(f))
    .map((f) => ({ f, buf: fs.readFileSync(path.join(root, f)) }))
    .filter(({ buf }) => !buf.includes(0))
    .map(({ f, buf }) => ({ f, text: buf.toString('utf8') }));
}
const strip = (f, line) => [...ALLOWED['*'], ...(ALLOWED[f] ?? [])].reduce((s, a) => s.split(a).join(''), line);
// Words of a line: split on anything that is not an ASCII letter, then on camelCase humps; compared in lower case
const words = (line) => line.split(/[^A-Za-z]+/).flatMap((w) => w.split(/(?<=[a-z])(?=[A-Z])/)).map((w) => w.toLowerCase());

const scanned = new Map();
function findings(root) {
  if (scanned.has(root)) return scanned.get(root);
  const letters = [], ascii = [];
  for (const { f, text } of textFiles(root)) {
    if (TURKISH_FILES.has(f)) continue;
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = strip(f, raw);
      if (TURKISH_LETTER.test(line)) letters.push(`${f}:${i + 1}: ${raw.trim().slice(0, 120)}`);
      const hit = words(line).find((w) => WORDS.has(w)) ?? line.match(PHRASES)?.[0];
      if (hit) ascii.push(`${f}:${i + 1}: [${hit}] ${raw.trim().slice(0, 120)}`);
    });
  }
  scanned.set(root, { letters, ascii });
  return scanned.get(root);
}

test('3.49.0 installed project: the scan sees the installed text (control)', () => {
  assert.equal(projects.length, 6);
  for (const { name, p } of projects) {
    const files = textFiles(p).map(({ f }) => f);
    assert.equal(files.length > 100, true, `${name}: ${files.length} text files`);
    for (const f of ['AGENTS.md', 'CLAUDE.md', '.claude/settings.json', '.claude/commands/build.md', '.claude/hooks/gate.mjs', 'docs/workflow/progress.md'])
      assert.equal(files.includes(f), true, `${name}: scanned ${f}`);
    if (name.endsWith('+tr,ai')) {
      for (const f of ['docs/legal/turkiye.md', 'docs/ai/guide.md', '.claude/i18n/tr.json', '.codex/hooks.json', '.agents/hooks.json'])
        assert.equal(files.includes(f), true, `${name}: scanned ${f}`);
    }
  }
  // The checks themselves catch what they should
  assert.equal(TURKISH_LETTER.test(strip('x.md', 'Görev bitti')), true);
  assert.equal(TURKISH_LETTER.test(strip('x.md', 'İ/ı rule')), false, 'an allowed substring is removed');
  assert.deepEqual(['const ozetYaz = 1;', 'kontrol_et()', 'GUNLUK_LIMIT', '--plan-kurul', 'Eski text'].map((l) => words(l).find((w) => WORDS.has(w))),
    ['ozet', 'kontrol', 'gunluk', 'kurul', 'eski']);
  assert.deepEqual(['project files', 'Eskimo', 'karaoke', 'controller'].map((l) => words(l).find((w) => WORDS.has(w))),
    [undefined, undefined, undefined, undefined], 'longer English words are not hits');
  assert.equal(PHRASES.test('// kit:yol-izinli'), true);
});

for (const kind of ['letters', 'ascii']) {
  test(`3.49.0 installed project: no ${kind === 'letters' ? 'Turkish letter' : 'ASCII-Turkish word'} outside the allow-list (every type, with and without tr + ai)`, () => {
    const left = projects.flatMap(({ name, p }) => findings(p)[kind].map((x) => `${name} ${x}`));
    assert.deepEqual(left, [], left.slice(0, 40).join('\n'));
  });
}
