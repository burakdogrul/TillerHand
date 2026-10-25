#!/usr/bin/env node
// Test guard: the AI must not weaken a test to make it pass (AGENTS.md rule 7).
//   PreToolUse hook (Write|Edit|MultiEdit, Codex apply_patch, Antigravity write tools). In a test file it asks the user
//   (ask) when the expectation (expect/assert) count drops, .skip/.only/xit/@pytest.mark.skip is added, weak
//   expectations (toBeTruthy, toBeDefined, expect.anything, expect without a matcher, assert True) grow, or the test
//   file is deleted. It also asks when a test config file (vitest/jest/playwright config, conftest.py, package.json
//   test script) changes a field that could narrow the scope. A commented-out expectation counts as deleted.
//   It does not block: the user approves a justified change.
import fs from 'node:fs';
import path from 'node:path';
import { readInput, decide, isMain } from './shared.mjs';

const TEST = /(^|\/)(tests?|__tests__|e2e|spec)\/|\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/i;
export const isTestFile = (file) => TEST.test(file.replace(/\\/g, '/'));
// A file the test runner recognizes by name (a file in a test folder whose name does not match does not run)
const TEST_NAME = /\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$|^test_[^/]*\.py$|_test\.(py|go)$/i;

const CONFIG = /(^|\/)((vitest|vite|jest|playwright|cypress)(\.[\w-]+)?\.config\.([cm]?[jt]s|json)|vitest\.workspace\.[cm]?[jt]s|\.mocharc\.\w+|conftest\.py|noxfile\.py|pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml|package\.json)$/i;
export const isTestConfig = (file) => CONFIG.test(file.replace(/\\/g, '/'));
// Fields that decide which tests run or whether a failure counts (user decision 2026-10-24)
const RISKY = /\b(include|exclude|testMatch|testRegex|testPathIgnorePatterns|testIgnore|testDir|testpaths|roots|passWithNoTests|bail|retries|thresholds?|coverageThreshold|grep|grepInvert|addopts|collect_ignore\w*|python_files|norecursedirs|pytest_collection_modifyitems|pytest_runtest_\w+|skip\w*|only|forbidOnly|setupFiles|globalSetup|lines|branches|functions|statements|fail_under|cov-fail-under)\b|"(test|e2e|ci)[\w:.-]*"\s*:/i;

const SKIP = /\.\s*(skip|only|fixme|skipIf|runIf)\b|(?<!\.\s*)\b(xit|xtest|xdescribe|fit|fdescribe)\s*\(|@pytest\.mark\.(skip|skipif|xfail)\b|\bpytest\.(skip|xfail)\s*\(|@unittest\.skip/g;
const EXPECT = /\bexpect\s*\(|\bassert\w*|\.should\b/g;
// expect without a matcher: expect(x) not followed by . checks nothing (up to one level of nested parentheses).
// An expect preceded by . (supertest .expect(200)) is itself a check.
const WEAK = /\.\s*(toBeTruthy|toBeDefined|toBeFalsy)\s*\(|\bexpect\.anything\s*\(|(?<![.\w])expect\s*\((?:[^()]|\([^()]*\))*\)(?!\s*[.(])|\bassert\s+True\b/g;

// Comments do not count: /* */, // (except :// in URLs) and # at line start or after whitespace (except #!, #{, #[)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1').replace(/(^|\s)#(?![!{[])[^\n]*/g, '$1');
const count = (s, re) => (stripComments(s).match(re) ?? []).length;

// Returns: null (no problem) | a description of the weakening
export function weakening(before, after) {
  if (count(after, SKIP) > count(before, SKIP)) return 'test atlanıyor veya tek teste odaklanıyor (.skip / .only / skipIf / xit / pytest skip)';
  if (count(after, EXPECT) < count(before, EXPECT)) return 'beklenti (expect/assert) siliniyor veya yoruma alınıyor';
  if (count(after, WEAK) > count(before, WEAK)) return 'beklenti gevşetiliyor (toBeTruthy, toBeDefined, expect.anything, matcher\'sız expect, assert True)';
  return null;
}

// In a config file only added or removed lines are checked
export function configRisk(before, after) {
  const a = new Set(before.split('\n')), b = new Set(after.split('\n'));
  const changed = [...a].filter((s) => !b.has(s)).concat([...b].filter((s) => !a.has(s)));
  return changed.some((s) => RISKY.test(s)) ? 'testlerin kapsamını belirleyen ayar değişiyor (include/exclude, testMatch, passWithNoTests, eşik, test script\'i)' : null;
}

function hook() {
  const g = readInput();
  if (!g) process.exit(0);
  const resolveName = (file) => {
    const full = path.resolve(g.dir, file);
    const rel = path.relative(g.root, full);
    return [full, rel.startsWith('..') || path.isAbsolute(rel) ? full : rel];
  };
  for (const f of g.files) {
    if (!f.path) continue;
    const [full, name] = resolveName(f.path);
    const source = f.source && isTestFile(resolveName(f.source)[1]) ? resolveName(f.source)[1] : null;
    const config = isTestConfig(name);
    if (!source && !config && !isTestFile(name)) continue;
    let before = f.before;
    if (before === undefined) { try { before = fs.readFileSync(full, 'utf8'); } catch { before = ''; } }
    const after = f.after ?? f.text;
    let reason;
    if (f.deleted) reason = config ? 'test ayar dosyası siliniyor' : 'test dosyası siliniyor';
    // Codex Move: a test moved to a path that does not run is as good as deleted; moving onto an existing file overwrites it
    else if (source && (!isTestFile(name) || (TEST_NAME.test(path.basename(source)) && !TEST_NAME.test(path.basename(name))))) reason = `test dosyası çalışmayan bir yola taşınıyor (${f.source})`;
    else if (f.source && fs.existsSync(full)) reason = `taşıma var olan dosyanın üstüne yazıyor (${f.source} → ${f.path})`;
    else reason = config ? configRisk(before, after) : weakening(before, after);
    if (reason) {
      decide(g.tool, 'ask', `Test koruması: ${name.split(path.sep).join('/')} içinde ${reason}. Testi geçirmek için testi zayıflatmak yasak (AGENTS.md kural 7). ` +
        'Gerekçe gerçekse (yanlış test, değişen kabul kriteri) kullanıcıya söyle ve onayını al; değilse kodu düzelt.');
    }
  }
  process.exit(0);
}

if (isMain(import.meta.url)) hook();
