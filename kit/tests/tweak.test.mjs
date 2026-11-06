// Run: node --test "kit/tests/tweak.test.mjs"
// The fast lane (/tweak): a small change with a green gate is committed without the board stop, at most three times in a row.
// H-1..H-8, H-10 commit gate and its counter, H-9 flow.mjs --tweak, H-11..H-13 command, tool list and docs.
// Every test builds its own temp project; nothing reads .claude/state/ of the working copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const COMMIT_GATE = path.join(HOOKS, 'commit-gate.mjs');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

// ---------- temp project with a board ----------

let p;
const env = () => ({ ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' });
const sh = (c) => execSync(c, { cwd: p, stdio: 'ignore' });
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const agents = (lint, test) => write('AGENTS.md', `# X\n\n## Commands\n\n\`\`\`bash\ndev:  [ ]\ntest:        ${test}\nlint:        ${lint}\ntype check: [ ]\nbuild:       [ ]\n\`\`\`\n`);
const run = (script, ...args) => spawnSync(process.execPath, [path.join(HOOKS, script), ...args], { cwd: p, encoding: 'utf8', env: env() });
const hookRun = (script, input, tool = 'Bash') => spawnSync(process.execPath, [path.join(HOOKS, script)], { cwd: p, input: JSON.stringify({ tool_name: tool, tool_input: input }), encoding: 'utf8', env: env() });
const commit = (command = 'git commit -m x') => spawnSync(process.execPath, [COMMIT_GATE], { cwd: p, input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8', env: env() });
const approve = (note = 'board-x') => run('commit-gate.mjs', '--approve', note);

const GREEN = 'node -e "process.exit(0)"';
const RED = 'node -e "process.exit(1)"';
const COUNTER = () => path.join(p, '.claude', 'state', 'fast-commits.json');
const BASE = ['a', 'b', 'c', 'd'];
const body = (name, n, v = 1) => Array.from({ length: n }, (_, i) => `export const ${name}${i + 1} = ${v};\n`).join('');
const BINARY_V1 = Buffer.from([0, 1, 2, 3, 0, 255, 254]);

// A fresh repo on main with four 40-line code files and a binary file committed; `p` is swapped for the run
function inTweak(fn, { lint = GREEN, test = GREEN, board = true, review = 'on', ignore = '' } = {}) {
  const outer = p;
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'tweak-'));
  try {
    sh('git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false && git symbolic-ref HEAD refs/heads/main');
    write('.gitignore', `.claude/state/\n${ignore}`);
    write('docs/workflow/board.md', `**Commit review:** ${review}\n`);
    if (board) write('.claude/agents/board-x.md', '---\nname: board-x\n---\n');
    agents(lint, test);
    for (const n of BASE) write(`src/${n}.js`, body(n, 40));
    fs.mkdirSync(path.join(p, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(p, 'assets', 'logo.png'), BINARY_V1);
    sh('git add -A && git commit -qm init');
    fn();
  } finally {
    fs.rmSync(p, { recursive: true, force: true });
    p = outer;
  }
}

// n lines added to the end of a file: n lines. n lines rewritten: 2n lines (n added + n deleted).
const append = (f, n, tag = 'x') => fs.appendFileSync(path.join(p, f), Array.from({ length: n }, (_, i) => `// ${tag} ${i + 1}\n`).join(''));
const rewrite = (name, n) => write(`src/${name}.js`, body(name, n, 2) + body(name, 40).split('\n').slice(n).join('\n'));
const green = () => {
  run('gate.mjs', '--approve');
  const g = run('gate.mjs', '--run');
  assert.equal(g.status, 0, `green gate\n${g.stdout}${g.stderr}`);
};
const count = () => {
  if (!fs.existsSync(COUNTER())) return 0;
  return JSON.parse(fs.readFileSync(COUNTER(), 'utf8')).count;
};

const BOARD_STOP = /the board has not reviewed these changes/;
const passes = (r, why) => {
  assert.equal(r.status, 0, `${why}\n${r.stderr}${r.stdout}`);
  assert.doesNotMatch(r.stdout, /permissionDecision/, `${why}: no deny or ask`);
};
const stopped = (r, why, re = BOARD_STOP) => {
  assert.equal(r.status, 2, `${why}\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /Commit stopped/, why);
  assert.match(r.stderr, re, why);
};
// The gate is green for exactly the changes on disk now, then the commit hook decides
const decide = (command) => { green(); return commit(command); };

// ---------- H-1 / H-2: the limits ----------

test('H-1 fast lane: 2 files with 30 lines in total pass without any approval', () => inTweak(() => {
  append('src/a.js', 15);
  append('src/b.js', 15);
  passes(decide('git commit -m "tweak"'), '2 files, 30 added lines');
  assert.equal(count(), 1);
}));

test('H-1 fast lane: 1 file and 1 line pass', () => inTweak(() => {
  append('src/a.js', 1);
  passes(decide('git add -A && git commit -qm tweak'), '1 line');
}));

test('H-1 fast lane: added and deleted lines are added up: 15 lines rewritten (30) pass, a new file of 30 lines passes', () => {
  inTweak(() => {
    rewrite('a', 15);
    passes(decide('git commit -am tweak'), '15 rewritten = 15 + 15');
  });
  inTweak(() => {
    write('src/new.js', body('n', 30));
    passes(decide('git add -A && git commit -qm tweak'), 'new file of 30 lines');
  });
});

test('H-2 fast lane: 3 files are stopped even with 3 lines', () => inTweak(() => {
  for (const n of ['a', 'b', 'c']) append(`src/${n}.js`, 1);
  stopped(decide('git commit -am tweak'), '3 changed files');
  assert.equal(count(), 0, 'a stopped commit does not count');
}));

test('H-2 fast lane: 31 lines are stopped (31 added; 16 rewritten = 32; split over two files)', () => {
  inTweak(() => {
    append('src/a.js', 31);
    stopped(decide('git commit -am tweak'), '31 added lines');
  });
  inTweak(() => {
    rewrite('a', 16);
    stopped(decide('git commit -am tweak'), '16 lines rewritten');
  });
  inTweak(() => {
    append('src/a.js', 16);
    append('src/b.js', 15);
    stopped(decide('git commit -am tweak'), '16 + 15');
  });
});

test('H-2 fast lane: a new file over the limit is stopped; its lines count', () => {
  inTweak(() => {
    write('src/new.js', body('n', 31));
    stopped(decide('git add -A && git commit -qm tweak'), 'new file of 31 lines');
  });
  inTweak(() => {
    write('src/new.js', body('n', 29));
    append('src/a.js', 2);
    stopped(decide('git add -A && git commit -qm tweak'), '29 + 2 lines over two files');
  });
});

test('H-2 fast lane: a binary file is stopped, changed or new', () => inTweak(() => {
  fs.writeFileSync(path.join(p, 'assets', 'logo.png'), Buffer.from([0, 9, 9, 9, 0, 1]));
  stopped(decide('git commit -am tweak'), 'changed binary');
  sh('git checkout -- assets/logo.png');
  fs.writeFileSync(path.join(p, 'assets', 'new.bin'), Buffer.from([0, 1, 2, 0]));
  stopped(decide('git add -A && git commit -qm tweak'), 'new binary');
}));

// ---------- H-3: risky paths ----------

const RISKY = [
  'src/features/auth/login.ts', 'src/lib/payment.ts', 'src/app/api/webhook/route.ts', 'src/lib/secret.ts',
  'supabase/migrations/1.sql', 'prisma/schema.prisma', 'drizzle/1.sql', 'package.json', 'package-lock.json',
  'pnpm-lock.yaml', 'requirements.txt', 'pyproject.toml', '.github/workflows/ci.yml', '.claude/settings.json',
  'AGENTS.md', 'CLAUDE.md', '.env.example', 'Dockerfile', 'docker-compose.yml',
];

test('H-3 fast lane: a risky path stops an otherwise small commit (the same commit without it passes)', () => inTweak(() => {
  // control: the small code change alone passes, so each stop below comes from the path
  append('src/a.js', 1, 'control');
  passes(decide('git commit -am control'), 'control');
  sh('git commit -qam control');
  const wrong = [];
  for (const risky of RISKY) {
    append('src/b.js', 1, 'tweak');
    if (risky === 'AGENTS.md') fs.appendFileSync(path.join(p, risky), '\nA note.\n'); else write(risky, '{}\n');
    const r = decide('git add -A && git commit -qm tweak');
    if (r.status !== 2 || !BOARD_STOP.test(r.stderr)) wrong.push(`${risky}: exit ${r.status} ${r.stderr.slice(0, 80)}`);
    sh('git reset -q && git checkout -- . && git clean -fdq -e .claude/state');
  }
  assert.deepEqual(wrong, [], 'each risky path stops the commit');
  assert.equal(count(), 1, 'only the control passed the fast lane');
}));

// ---------- H-4: the gate must be green for these changes ----------

test('H-4 fast lane: a red gate stops a small commit', () => inTweak(() => {
  append('src/a.js', 1);
  run('gate.mjs', '--approve');
  assert.equal(run('gate.mjs', '--run').status, 1, 'red gate');
  stopped(commit('git commit -am tweak'), 'red gate');
  assert.equal(count(), 0);
}, { test: RED }));

test('H-4 fast lane: an empty gate (no command ran) stops a small commit', () => inTweak(() => {
  append('src/a.js', 1);
  run('gate.mjs', '--approve');
  run('gate.mjs', '--run');
  stopped(commit('git commit -am tweak'), 'empty gate');
}, { lint: '[ ]', test: '[ ]' }));

test('H-4 fast lane: a gate that was green for other changes stops a small commit', () => inTweak(() => {
  append('src/a.js', 1);
  green();
  append('src/a.js', 1, 'later'); // changed after the gate ran
  stopped(commit('git commit -am tweak'), 'gate is stale');
}));

test('H-4 fast lane: no gate run at all stops a small commit', () => inTweak(() => {
  append('src/a.js', 1);
  stopped(commit('git commit -am tweak'), 'no gate run');
}));

// ---------- H-5: test files and chained commits ----------

test('H-5 fast lane: a changed test file test-writer did not write stops with the test-writer message', () => inTweak(() => {
  append('src/a.js', 1);
  write('src/a.test.js', "test('a', () => { expect(1).toBe(1); });\n");
  stopped(decide('git add -A && git commit -qm tweak'), 'foreign test', /test-writer did not write/);
}));

test('H-5 fast lane: a test file is a risky path even when it is recorded as accepted', () => inTweak(() => {
  append('src/a.js', 1);
  write('src/a.test.js', "test('a', () => { expect(1).toBe(1); });\n");
  const a = run('commit-gate.mjs', '--accept-tests', 'user edited the test', 'src/a.test.js');
  assert.equal(a.status, 0, a.stderr + a.stdout);
  stopped(decide('git add -A && git commit -qm tweak'), 'recorded test file');
  assert.equal(count(), 0);
}));

test('H-5 fast lane: a branch switch chained in front of the commit stops it', () => inTweak(() => {
  append('src/a.js', 1);
  green();
  for (const c of ['git switch main && git commit -m x', 'git checkout main; git commit -m x', 'git commit -m x && git switch main']) {
    assert.equal(commit(c).status, 2, c);
  }
  assert.equal(count(), 0);
}));

// ---------- H-6: the counter ----------

const smallRound = (n) => {
  append('src/a.js', 1, `round ${n}`);
  const r = decide('git add -A && git commit -qm "tweak"');
  return r;
};

test('H-6 fast lane: three commits pass, the fourth is stopped with the board message', () => inTweak(() => {
  for (const n of [1, 2, 3]) {
    passes(smallRound(n), `fast commit ${n}`);
    assert.equal(count(), n, `counter after ${n}`);
    sh('git add -A && git commit -qm tweak');
  }
  const r = smallRound(4);
  stopped(r, 'fourth fast commit');
  assert.equal(count(), 3, 'a stopped commit does not count');
}));

test('H-6 fast lane: a commit passed with a valid approval and a green gate resets the counter', () => inTweak(() => {
  for (const n of [1, 2, 3]) { passes(smallRound(n), `fast commit ${n}`); sh('git add -A && git commit -qm tweak'); }
  stopped(smallRound(4), 'fourth');
  sh('git checkout -- . && git clean -fdq -e .claude/state');
  append('src/a.js', 40, 'big'); // over the limit: the full review
  green();
  assert.equal(approve().status, 0);
  passes(commit('git commit -am big'), 'approved commit');
  sh('git commit -qam big');
  passes(smallRound(5), 'the next small commit');
  assert.equal(count(), 1, 'counted again from zero');
}));

test('H-6 fast lane: --skip does not reset the counter', () => inTweak(() => {
  for (const n of [1, 2, 3]) { passes(smallRound(n), `fast commit ${n}`); sh('git add -A && git commit -qm tweak'); }
  append('src/a.js', 1, 'skipped');
  assert.equal(run('commit-gate.mjs', '--skip', 'user request').status, 0);
  passes(commit('git commit -am skipped'), 'the skipped commit');
  sh('git commit -qam skipped');
  stopped(smallRound(5), 'small commit after --skip');
}));

// ---------- H-7: the counter file ----------

test('H-7 fast lane: the counter file holds { "count": n } and a missing file is count 0', () => inTweak(() => {
  assert.equal(fs.existsSync(COUNTER()), false, 'no file yet');
  passes(smallRound(1), 'first');
  assert.deepEqual(JSON.parse(fs.readFileSync(COUNTER(), 'utf8')), { count: 1 });
}));

test('H-7 fast lane: a count of 2 passes once more, a count of 3 is stopped', () => {
  inTweak(() => {
    write('.claude/state/fast-commits.json', '{ "count": 2 }');
    passes(smallRound(1), 'count 2');
    assert.equal(count(), 3);
  });
  inTweak(() => {
    write('.claude/state/fast-commits.json', '{ "count": 3 }');
    stopped(smallRound(1), 'count 3');
  });
});

test('H-7 fast lane: a broken or non-number counter file is treated as full, stopped, and the hook does not crash', () => {
  for (const content of ['{broken', '', '{"count":"0"}', '{"count":null}', '[]', 'null', '{"count":true}']) {
    inTweak(() => {
      write('.claude/state/fast-commits.json', content);
      const r = smallRound(1);
      stopped(r, `counter file ${JSON.stringify(content)}`);
      assert.notEqual(r.status, 1, 'not a crash');
    });
  }
});

// ---------- H-8: the AI does not write the counter ----------

const COUNTER_REL = '.claude/state/fast-commits.json';
const askOf = (r) => (r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null);

test('H-8 freeze-guard: a Write or Edit of the counter file is asked, by absolute and by relative path', () => inTweak(() => {
  write(COUNTER_REL, '{ "count": 3 }');
  for (const file of [path.join(p, COUNTER_REL), COUNTER_REL, `./${COUNTER_REL}`]) {
    const w = hookRun('freeze-guard.mjs', { file_path: file, content: '{ "count": 0 }' }, 'Write');
    assert.equal(w.status, 0, w.stderr);
    assert.equal(askOf(w), 'ask', `Write ${file}`);
    const e = hookRun('freeze-guard.mjs', { file_path: file, old_string: '3', new_string: '0' }, 'Edit');
    assert.equal(askOf(e), 'ask', `Edit ${file}`);
  }
}));

test('H-8 destructive-guard: a shell write to the counter file is asked', () => inTweak(() => {
  const wrong = [
    `echo x > ${COUNTER_REL}`, `echo '{"count":0}' > ${COUNTER_REL}`, `echo x >> ${COUNTER_REL}`,
    `rm ${COUNTER_REL}`, `printf '{"count":0}' | tee ${COUNTER_REL}`,
  ].filter((c) => askOf(hookRun('destructive-guard.mjs', { command: c })) !== 'ask');
  assert.deepEqual(wrong, [], 'each should be ask');
}));

// ---------- H-10: where the lane does not apply ----------

test('H-10 fast lane: with no board a small commit passes as today and no counter file is written', () => inTweak(() => {
  append('src/a.js', 1);
  passes(commit('git commit -am tweak'), 'no board');
  assert.equal(fs.existsSync(COUNTER()), false);
}, { board: false }));

test('H-10 fast lane: with "Commit review: off" a commit passes as today and no counter file is written', () => inTweak(() => {
  append('src/a.js', 40);
  passes(commit('git commit -am tweak'), 'review off');
  assert.equal(fs.existsSync(COUNTER()), false);
}, { review: 'off' }));

test('H-10 fast lane: on a try/ branch the counter is not written', () => inTweak(() => {
  sh('git checkout -q -b try/topic');
  append('src/a.js', 1);
  passes(commit('git commit -am "wip: try topic round 1"'), 'try branch');
  assert.equal(fs.existsSync(COUNTER()), false);
}));

// ---------- H-9: flow.mjs --tweak ----------

const tweak = () => run('flow.mjs', '--tweak');

test('H-9a flow --tweak: changes within the limits exit 0 and the output says they fit, before the gate has run', () => inTweak(() => {
  append('src/a.js', 15);
  append('src/b.js', 15);
  assert.equal(fs.existsSync(path.join(p, '.claude', 'state', 'gate.json')), false, 'setup: no gate run');
  const r = tweak();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\bfits?\b/i);
}));

test('H-9b flow --tweak: too many files, too many lines or a risky path exit 1 and are named, with /build', () => {
  inTweak(() => {
    for (const n of ['a', 'b', 'c', 'd']) append(`src/${n}.js`, 1);
    const r = tweak();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /\b4\b[^\n]*files?|files?[^\n]*\b4\b/i, 'names the file count');
    assert.match(r.stdout, /\/build/);
  });
  inTweak(() => {
    append('src/a.js', 45);
    const r = tweak();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /\b45\b[^\n]*lines?|lines?[^\n]*\b45\b/i, 'names the line count');
    assert.match(r.stdout, /\/build/);
  });
  inTweak(() => {
    write('src/lib/payment.ts', 'export const pay = 1;\n');
    const r = tweak();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /src\/lib\/payment\.ts/, 'names the risky path');
    assert.match(r.stdout, /\/build/);
  });
  inTweak(() => {
    append('src/a.js', 20);
    append('src/b.js', 20);
    append('src/c.js', 10);
    write('package.json', '{}\n');
    const r = tweak();
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /\b4\b[^\n]*files?|files?[^\n]*\b4\b/i, 'files');
    assert.match(r.stdout, /\b51\b[^\n]*lines?|lines?[^\n]*\b51\b/i, 'lines');
    assert.match(r.stdout, /package\.json/, 'risky path');
    assert.match(r.stdout, /\/build/);
  });
});

test('H-9c flow --tweak: no changes exit 0 and say nothing changed', () => inTweak(() => {
  const r = tweak();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nothing changed|no changes|not changed/i);
}));

test('H-9d flow --tweak: a red gate does not matter to this check', () => inTweak(() => {
  append('src/a.js', 1);
  run('gate.mjs', '--approve');
  assert.equal(run('gate.mjs', '--run').status, 1, 'setup: red gate');
  const r = tweak();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\bfits?\b/i);
}, { test: RED }));

// ---------- H-14 .. H-17: more paths and git states outside the lane ----------

const OUTSIDE = [
  'src/app/api/notes/route.ts', 'src/routes/notes.ts', 'middleware.ts', 'src/middleware.ts', 'src/proxy.ts',
  'db/policies.sql', 'firestore.rules', '.husky/pre-commit', '.pre-commit-config.yaml', 'lefthook.yml', '.mcp.json',
  '.npmrc', '.gitmodules', '.vscode/tasks.json', 'vercel.json', 'next.config.mjs', 'firebase.json', 'eslint.config.mjs',
  'tsconfig.json', 'vitest.config.ts', 'playwright.config.ts',
];
const FITS = ['src/lib/utils.ts', 'src/components/ui/button.tsx', 'src/styles/app.css'];
const fileBody = (f) => (f === '.gitmodules' ? '[submodule "x"]\n\tpath = lib/x\n\turl = ../x\n' : f.endsWith('pre-commit') ? '#!/bin/sh\nexit 0\n' : '{}\n');
const cleanTree = () => sh('git reset -q && git checkout -- . && git clean -fdq -e .claude/state');

test('H-14 fast lane: each of these paths stops an otherwise small commit with a green gate', () => inTweak(() => {
  append('src/a.js', 1, 'control');
  passes(decide('git commit -am control'), 'control');
  sh('git commit -qam control');
  const wrong = [];
  for (const f of OUTSIDE) {
    append('src/b.js', 1, 'tweak');
    write(f, fileBody(f));
    const r = decide('git add -A && git commit -qm tweak');
    if (r.status !== 2 || !BOARD_STOP.test(r.stderr)) wrong.push(`${f}: exit ${r.status} ${r.stderr.slice(0, 80)}`);
    cleanTree();
  }
  assert.deepEqual(wrong, [], 'each path stops the commit');
  assert.equal(count(), 1, 'only the control passed the fast lane');
}));

test('H-14 flow --tweak: each of these paths exits 1 and is named', () => inTweak(() => {
  const wrong = [];
  for (const f of OUTSIDE) {
    write(f, fileBody(f));
    const r = tweak();
    if (r.status !== 1 || !r.stdout.includes(f)) wrong.push(`${f}: exit ${r.status}`);
    cleanTree();
  }
  assert.deepEqual(wrong, [], 'each path is outside the lane');
}));

test('H-14 fast lane: utils, a ui component and a stylesheet still fit, in the commit gate and in flow --tweak', () => {
  for (const f of FITS) {
    inTweak(() => {
      write(f, 'export const v = 1;\n');
      const t = tweak();
      assert.equal(t.status, 0, `${f}\n${t.stdout}${t.stderr}`);
      passes(decide('git add -A && git commit -qm tweak'), f);
      assert.equal(count(), 1, f);
    });
  }
});

test('H-15 fast lane: a file mode change is outside the lane', (t) => inTweak(() => {
  sh('git update-index --chmod=+x src/a.js');
  stopped(decide('git commit -m x'), 'mode change alone');
  const r = tweak();
  assert.equal(r.status, 1, `flow\n${r.stdout}${r.stderr}`);
  sh('git reset -q');
  append('src/b.js', 1);
  sh('git update-index --chmod=+x src/a.js');
  stopped(decide('git add -A && git commit -qm x'), 'mode change next to a small change');
  assert.equal(tweak().status, 1, 'flow, with a small change');
  assert.equal(count(), 0);
  // A plain chmod, where the file system records it
  sh('git reset -q && git checkout -- .');
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(p, 'src', 'c.js'), 0o755);
    if (!/mode change/.test(execSync('git diff --summary', { cwd: p, encoding: 'utf8' }))) return t.diagnostic('this file system does not record chmod');
    stopped(decide('git commit -am x'), 'chmod +x');
    assert.equal(tweak().status, 1, 'flow, chmod +x');
  }
}));

test('H-15 fast lane: a submodule pointer change (a gitlink) is outside the lane, new or moved', () => inTweak(() => {
  const first = execSync('git rev-parse HEAD', { cwd: p, encoding: 'utf8' }).trim();
  sh('git commit -q --allow-empty -m second');
  const second = execSync('git rev-parse HEAD', { cwd: p, encoding: 'utf8' }).trim();
  sh(`git update-index --add --cacheinfo 160000,${first},lib/x`);
  stopped(decide('git commit -m x'), 'new gitlink');
  assert.equal(tweak().status, 1, 'flow, new gitlink');
  sh('git commit -qm "add submodule" --no-verify');
  sh(`git update-index --cacheinfo 160000,${second},lib/x`);
  stopped(decide('git commit -m x'), 'moved gitlink');
  assert.equal(tweak().status, 1, 'flow, moved gitlink');
  assert.equal(count(), 0);
}));

const CHAINED = /chained with other commands/;

test('H-16 fast lane: git add -f of an ignored file in front of the commit is stopped by the chain check though the rest fits', () => {
  for (const add of ['git add -f build/x.js', 'git add --force build/x.js']) {
    inTweak(() => {
      append('src/a.js', 1);
      write('build/x.js', 'export const x = 1;\n');
      stopped(decide(`${add} && git commit -m x`), add, CHAINED);
      assert.equal(count(), 0);
    }, { ignore: 'build/\n' });
  }
});

test('H-16 fast lane: a forced add run for real first, then a plain commit, is measured normally (the file counts toward the limits)', () => {
  inTweak(() => {
    append('src/a.js', 1);
    write('build/x.js', 'export const x = 1;\n');
    sh('git add -f build/x.js');
    passes(decide('git commit -m x'), 'forced file fits');
    assert.equal(count(), 1);
  }, { ignore: 'build/\n' });
  inTweak(() => {
    append('src/a.js', 1);
    write('build/x.js', body('x', 31));
    sh('git add -f build/x.js');
    stopped(decide('git commit -m x'), 'forced file over the line limit');
    assert.equal(count(), 0);
  }, { ignore: 'build/\n' });
});

test('H-16 fast lane: a plain git add of a file and a commit still passes', () => inTweak(() => {
  append('src/a.js', 1);
  write('build/x.js', 'export const x = 1;\n');
  passes(decide('git add src/a.js && git commit -m x'), 'plain add');
}, { ignore: 'build/\n' }));

test('H-16 fast lane: git add -f with no other change is stopped too (the ignored file is the whole commit)', () => inTweak(() => {
  write('build/x.js', 'export const x = 1;\n');
  stopped(decide('git add -f build/x.js && git commit -m x'), 'forced file alone', CHAINED);
  assert.equal(count(), 0);
}, { ignore: 'build/\n' }));

test('H-17 fast lane: a commit after git merge --squash of a small slice is stopped, and flow --tweak exits 1', () => inTweak(() => {
  sh('git checkout -q -b try/x');
  append('src/a.js', 1, 'slice');
  sh('git commit -qam "wip: try x round 1"');
  sh('git checkout -q main');
  sh('git merge --squash try/x');
  const r = decide('git commit -m x');
  stopped(r, 'squash commit');
  assert.equal(count(), 0);
  const f = tweak();
  assert.equal(f.status, 1, `flow\n${f.stdout}${f.stderr}`);
}));

// ---------- H-11 .. H-13: command, tool list, docs ----------

test('H-11 tweak.md: has a description and names the gate run, the size check and the two other commands', () => {
  const file = path.join(REPO, '.claude', 'commands', 'tweak.md');
  assert.equal(fs.existsSync(file), true, '.claude/commands/tweak.md exists');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^---\r?\n(?:[^\n]*\r?\n)*?description:[ \t]*\S[^\n]*\r?\n(?:[^\n]*\r?\n)*?---/, 'front matter with a description');
  for (const token of ['gate.mjs --run', 'flow.mjs --tweak', '/build', '/fix-bug']) assert.equal(text.includes(token), true, token);
});

test('H-12 tools.mjs: tweak is a core command', async () => {
  const { CORE_COMMANDS } = await import(`file://${path.join(HOOKS, 'tools.mjs').replace(/\\/g, '/')}`);
  assert.equal(CORE_COMMANDS.includes('tweak'), true);
});

test('H-13 docs: AGENTS.md names /tweak, board rules name the limit of 3 commits, usage-limits has a /tweak row', () => {
  assert.match(readRepo('AGENTS.md'), /\/tweak\b/);
  const rules = readRepo('.claude/board/rules.md').split(/\r?\n/);
  assert.equal(rules.some((l) => /tweak|fast/i.test(l) && /\b(3|three)\b/i.test(l) && /commits?/i.test(l)), true, 'a line with tweak/fast, 3 and commits');
  const limits = readRepo('docs/workflow/usage-limits.md').split(/\r?\n/);
  assert.equal(limits.some((l) => l.trimStart().startsWith('|') && /\/tweak\b/.test(l)), true, 'a table row with /tweak');
});
