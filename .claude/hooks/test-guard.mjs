#!/usr/bin/env node
// Test guard: the AI must not weaken a test to make it pass (AGENTS.md rule 7).
//   PreToolUse hook (Write|Edit|MultiEdit, Codex apply_patch, Antigravity write tools). In a test file it asks the user
//   (ask) when the expectation (expect/assert) count drops, .skip/.only/xit/@pytest.mark.skip is added, weak
//   expectations (toBeTruthy, toBeDefined, expect.anything, expect without a matcher, assert True) grow, or the test
//   file is deleted. It also asks when a test config file (vitest/jest/playwright config, conftest.py, package.json
//   test script) changes a field that could narrow the scope. A commented-out expectation counts as deleted.
//   It does not block: the user approves a justified change.
//   In Claude Code a test file can only be written by the test-writer subagent (agent_type); anyone else is denied.
//   --record (PostToolUse): stores the digest of each test file test-writer wrote; commit-gate.mjs checks it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readInput, decide, isMain, findRoot } from './shared.mjs';
import { t } from './lang.mjs';

const TEST = /(^|\/)(tests?|__tests__|e2e|spec)\/|\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]*\.py$|_test\.(py|go)$/i;
// Windows resolves "a.test.ts.", "a.test.ts " and "a.test.ts::$DATA" (alternate stream) to the same file
const plain = (file) => file.replace(/\\/g, '/').replace(/:[^/]*$/, '').replace(/[. ]+(?=\/|$)/g, '');
export const isTestFile = (file) => TEST.test(plain(file));
// A file the test runner recognizes by name (a file in a test folder whose name does not match does not run)
const TEST_NAME = /\.(test|spec|e2e-spec)\.[cm]?[jt]sx?$|^test_[^/]*\.py$|_test\.(py|go)$/i;

const CONFIG = /(^|\/)((vitest|vite|jest|playwright|cypress)(\.[\w-]+)?\.config\.([cm]?[jt]s|json)|vitest\.workspace\.[cm]?[jt]s|\.mocharc\.\w+|conftest\.py|noxfile\.py|pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml|package\.json)$/i;
export const isTestConfig = (file) => CONFIG.test(plain(file));
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
  if (count(after, SKIP) > count(before, SKIP)) return t(findRoot(), 'guard.test.skip');
  if (count(after, EXPECT) < count(before, EXPECT)) return t(findRoot(), 'guard.test.expectRemoved');
  if (count(after, WEAK) > count(before, WEAK)) return t(findRoot(), 'guard.test.expectWeak');
  return null;
}

// In a config file only added or removed lines are checked
export function configRisk(before, after) {
  const a = new Set(before.split('\n')), b = new Set(after.split('\n'));
  const changed = [...a].filter((s) => !b.has(s)).concat([...b].filter((s) => !a.has(s)));
  return changed.some((s) => RISKY.test(s)) ? t(findRoot(), 'guard.test.configRisk') : null;
}

// The real path too: a link or junction into the test folder, a Windows short name (TESTS~1)
// A new nested path (lnk/new/sub/x.ts): resolve the nearest folder that exists and append the rest
const realOf = (p) => {
  for (let dir = p, rest = ''; ; rest = path.join(path.basename(dir), rest), dir = path.dirname(dir)) {
    try { return path.join(fs.realpathSync.native(dir), rest); } catch { if (path.dirname(dir) === dir) return p; }
  }
};

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
    const realRel = path.relative(realOf(g.root), realOf(full));
    if (!source && !config && !isTestFile(name) && !isTestFile(realRel)) continue;
    // Tests are written by the test-writer agent only (AGENTS.md rule 7): whoever writes the code must not shape the test
    // to it. Only Claude Code reports the subagent; Codex and Antigravity keep the rule in text. Config files stay a question.
    if (g.tool === 'claude' && g.agent !== 'test-writer' && !config) {
      decide(g.tool, 'deny', `Test separation: ${name.split(path.sep).join('/')} is a test file; only the test-writer agent writes test files, and whoever writes the code cannot change tests (AGENTS.md rule 7). ` +
        'If a test must be added or changed, call the test-writer agent (continue it with SendMessage if it exists); if the criterion changes, ask the user.');
    }
    let before = f.before;
    if (before === undefined) { try { before = fs.readFileSync(full, 'utf8'); } catch { before = ''; } }
    const after = f.after ?? f.text;
    let reason;
    if (f.deleted) reason = t(g.root, config ? 'guard.test.configDeleted' : 'guard.test.fileDeleted');
    // Codex Move: a test moved to a path that does not run is as good as deleted; moving onto an existing file overwrites it
    else if (source && (!isTestFile(name) || (TEST_NAME.test(path.basename(source)) && !TEST_NAME.test(path.basename(name))))) reason = t(g.root, 'guard.test.movedAway', { source: f.source });
    else if (f.source && fs.existsSync(full)) reason = t(g.root, 'guard.test.moveOverwrite', { source: f.source, path: f.path });
    else reason = config ? configRisk(before, after) : weakening(before, after);
    if (reason) {
      decide(g.tool, 'ask', t(g.root, 'guard.test.ask', { name: name.split(path.sep).join('/'), reason }));
    }
  }
  process.exit(0);
}

// What test-writer wrote: the commit gate stops a changed test file whose content on disk is not one of these
// (git apply, patch or a script writes past the PreToolUse guards). State: .claude/state/test-writer.json → { files: { path: digest } }
export const digest = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
export const recordPath = (root) => path.join(root, '.claude', 'state', 'test-writer.json');
export function readRecord(root) {
  try {
    const d = JSON.parse(fs.readFileSync(recordPath(root), 'utf8'));
    return d?.files && typeof d.files === 'object' && !Array.isArray(d.files) ? d.files : {};
  } catch { return {}; }
}

// PostToolUse: the file is on disk now, so its digest is what test-writer left
function record() {
  const g = readInput();
  if (!g || g.tool !== 'claude' || g.agent !== 'test-writer') process.exit(0);
  const files = readRecord(g.root);
  const rootReal = realOf(g.root);
  for (const f of g.files) {
    if (!f.path) continue;
    const full = path.resolve(g.dir, f.path);
    let body;
    try { body = fs.readFileSync(full); } catch { continue; }
    // The written path and its real path (a link into the test folder): git lists the one it tracks
    for (const rel of [path.relative(g.root, full), path.relative(rootReal, realOf(full))]) {
      const key = rel.split(path.sep).join('/');
      if (!key.startsWith('..') && !path.isAbsolute(rel) && isTestFile(key) && !isTestConfig(key)) files[key] = digest(body);
    }
  }
  // Temp file + rename: a reader never sees half a JSON (it would read {} and drop every record)
  const tmp = `${recordPath(g.root)}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ files }, null, 2));
    fs.renameSync(tmp, recordPath(g.root));
  } catch { fs.rmSync(tmp, { force: true }); /* the commit gate then asks for test-writer again */ }
  process.exit(0);
}

if (isMain(import.meta.url)) (process.argv.includes('--record') ? record : hook)();
