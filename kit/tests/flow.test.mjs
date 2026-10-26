// Run: node --test "kit/tests/*.test.mjs"
// Subagent only when it pays (3.34.0): flow.mjs turns task size, context and limit into a work plan, 0 tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { flow, flowText } from '../../.claude/hooks/flow.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('3.34.0 flow: a small task stays in the main session, a bigger one goes to the code role; quality roles are kept', () => {
  const small = flow({ files: 2, context: 10, level: 'green' });
  assert.equal(small.size, 'küçük');
  assert.equal(small.code, 'ana');
  assert.equal(small.docs, 'ana');
  assert.equal(small.members, 1);
  const mid = flow({ files: 5, context: 10, level: 'green' });
  assert.deepEqual([mid.size, mid.code, mid.docs, mid.members], ['orta', 'alt ajan', 'alt ajan', 2]);
  const big = flow({ files: 12, context: 10, level: 'green' });
  assert.deepEqual([big.size, big.members, big.parallel], ['büyük', 3, true]);
  // yellow halves the members, red runs them one by one; code-reviewer is never dropped
  assert.equal(flow({ files: 12, context: 10, level: 'yellow' }).members, 2);
  const red = flow({ files: 12, context: 10, level: 'red' });
  assert.deepEqual([red.members, red.parallel], [1, false]);
  for (const f of [small, mid, big, red]) assert.equal(f.reviewer, true);
  // a full context makes the main session expensive per turn: clear first, then code goes out of it
  const full = flow({ files: 1, context: 60, level: 'green' });
  assert.equal(full.clear, true);
  assert.equal(full.code, 'alt ajan');
  assert.equal(flow({ files: 1, context: null, level: 'unknown' }).clear, false, 'unknown context does not ask for /clear');
});

test('3.36.0 flow picks the board members from the changed paths: installed ones only, most files first; a sensitive path adds security-auditor', () => {
  const installed = ['board-api', 'board-qa', 'board-ux', 'board-architect'];
  const f = flow({ paths: ['src/api/notes.ts', 'src/api/users.ts', 'tests/notes.test.ts', 'tests/users.test.ts', 'src/components/Card.tsx', 'android/x.kt'], installed, context: 10, level: 'green' });
  assert.equal(f.size, 'orta');
  assert.deepEqual(f.board, ['board-api', 'board-qa'], 'two members for a mid task; board-mobile is not installed');
  assert.equal(f.security, false);
  const s = flow({ paths: ['src/auth/login.ts'], installed, context: 10, level: 'green' });
  assert.equal(s.security, true);
  assert.deepEqual(s.board, []);
  assert.match(flowText(s), /security-auditor/);
  assert.match(flowText(f), /Kurul: board-api, board-qa \+ code-reviewer, paralel/);
  assert.match(flowText(flow({ files: 4, context: 10, level: 'green' })), /Kurul: ilgili 2 üye \+ code-reviewer/, 'no paths yet (planning): only the count');
});

test('3.34.0 flow CLI: reads the git diff, takes overrides, and /build and the board use it', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, '.claude/hooks/flow.mjs'), ...a], { cwd: p, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p } });
  spawnSync('git', ['init', '-q'], { cwd: p });
  for (const f of ['a.js', 'b.js', 'c.js']) fs.writeFileSync(path.join(p, f), '1');
  const out = run().stdout;
  assert.match(out, /3 dosya · orta/);
  assert.match(out, /Kod: alt ajan/);
  assert.match(run('--files', '1', '--context', '20', '--limit', '90').stdout, /1 dosya · küçük[\s\S]*Kurul: ilgili 1 üye \+ code-reviewer, sırayla/);
  assert.equal(JSON.parse(run('--json', '--files', '8').stdout).size, 'büyük');
  assert.match(run('--files', 'x').stderr, /Kullanım/);
  fs.rmSync(p, { recursive: true, force: true });
  assert.match(read('.claude/commands/build.md'), /flow\.mjs/);
  assert.match(read('.claude/board/rules.md'), /flow\.mjs/);
  assert.match(read('.claude/settings.json'), /"Bash\(node \.claude\/hooks\/flow\.mjs:\*\)"/);
});
