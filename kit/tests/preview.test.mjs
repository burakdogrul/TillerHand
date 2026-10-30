// Run: node --test "kit/tests/*.test.mjs"
// Live preview (F-17): preview.mjs opens the dev server, takes desktop and mobile screenshots, then stops what it started.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'hooks');
let p, port;
const write = (f, s) => { fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true }); fs.writeFileSync(path.join(p, f), s); };
const log = () => path.join(p, 'cli.log');
const calls = () => (fs.existsSync(log()) ? fs.readFileSync(log(), 'utf8') : '');
const env = (extra = {}) => ({ ...process.env, CLAUDE_PROJECT_DIR: p, PREVIEW_CLI: path.join(p, 'cli.mjs'), PREVIEW_LOG: log(), PREVIEW_TIMEOUT_MS: '15000', ...extra });
const preview = (extra, task = 'G-01') => spawnSync(process.execPath, [path.join(HOOKS, 'preview.mjs'), task], { cwd: p, encoding: 'utf8', env: env(extra) });
const approve = () => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--approve'], { cwd: p, encoding: 'utf8', env: env() });
const agents = (dev, url = `http://127.0.0.1:${port}`) => write('AGENTS.md', `# X\n\n## Commands\n\n\`\`\`bash\ndev:  ${dev}\npreview:    ${url}\ntest:        [ ]\nlint:        [ ]\ntype check: [ ]\nbuild:       [ ]\n\`\`\`\n`);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pid = () => Number(fs.readFileSync(path.join(p, 'dev.pid'), 'utf8'));
const reset = () => { fs.rmSync(log(), { force: true }); fs.rmSync(path.join(p, 'dev.pid'), { force: true }); };
async function gone(n) {
  for (let i = 0; i < 50 && alive(n); i++) await new Promise((r) => setTimeout(r, 100)); // POSIX stop is SIGTERM, then SIGKILL
  return !alive(n);
}
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port: n } = s.address(); s.close(() => r(n)); }); });

before(async () => {
  p = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-'));
  port = await freePort();
  // A noisy server (1 MB of log per request): a pipe nobody drains during the screenshots would freeze it
  write('dev.mjs', "import http from 'node:http'; import fs from 'node:fs';\nfs.writeFileSync('dev.pid', String(process.pid));\n" +
    "http.createServer((q, s) => { process.stdout.write('x'.repeat(1 << 20)); s.end('<h1>ok</h1>'); }).listen(Number(process.argv[2]), '127.0.0.1');\n");
  // Like npm run dev → next: the server is a grandchild of the shell
  write('launcher.mjs', "import { spawn } from 'node:child_process';\nspawn(process.execPath, ['dev.mjs', process.argv[2]], { stdio: 'inherit' });\n");
  write('hang.mjs', "import fs from 'node:fs'; fs.writeFileSync('dev.pid', String(process.pid)); setInterval(() => {}, 1000);\n");
  // Test double for @playwright/cli: logs its folder and arguments, writes the --filename file, checks the page answers on open
  write('cli.mjs', "import fs from 'node:fs';\nconst a = process.argv.slice(2);\nfs.appendFileSync(process.env.PREVIEW_LOG, `cwd=${process.cwd()} ${a.join(' ')}\\n`);\n" +
    "if (process.env.PREVIEW_FAIL && a.includes(process.env.PREVIEW_FAIL)) process.exit(1);\n" +
    "if (a.includes('open') && !(await fetch(a.at(-1))).ok) process.exit(1);\n" +
    "if (a.includes('screenshot')) fs.writeFileSync(a.find((x) => x.startsWith('--filename=')).slice(11), 'png');\n");
});
after(() => {
  fs.rmSync(approvalPath(p), { force: true });
  fs.rmSync(p, { recursive: true, force: true });
});

test('Ö-17.1 Ö-17.2 two screenshots at 1440 and 390 wide; the dev server tree it started is stopped', async () => {
  reset();
  agents(`node launcher.mjs ${port}`);
  approve();
  const r = preview();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['desktop.png', 'mobile.png']) {
    assert.ok(fs.existsSync(path.join(p, '.previews', 'G-01', f)), f);
    assert.match(r.stdout, new RegExp(`\\.previews/G-01/${f}`));
  }
  assert.match(calls(), /resize 1440 \d+/);
  assert.match(calls(), /resize 390 \d+/);
  assert.match(calls(), /close/);
  assert.ok(await gone(pid()), 'the server (a grandchild) is not left running');
});

test('F-17 audit: the browser CLI never runs in the project (repo .playwright/cli.config.json, .npmrc)', () => {
  const cwds = [...calls().matchAll(/^cwd=(.*?) -s=/gm)].map((m) => path.resolve(m[1]));
  assert.ok(cwds.length >= 5, calls());
  for (const c of cwds) assert.ok(path.relative(fs.realpathSync.native(p), c).startsWith('..'), `CLI ran inside the project: ${c}`);
  assert.equal(new Set(cwds).size, 1, 'one temp folder per run');
  assert.ok(!fs.existsSync(cwds[0]), 'the temp folder is removed');
  assert.match(calls(), /-s=kit-preview-\d+ /, 'a session name per run');
});

test('Ö-17.2 a server that is already running is used and left open', async () => {
  agents(`node dev.mjs ${port}`);
  approve();
  reset();
  const own = spawn(process.execPath, ['dev.mjs', String(port)], { cwd: p, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50 && !fs.existsSync(path.join(p, 'dev.pid')); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    const r = preview();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(pid(), own.pid, 'no second server was started');
    assert.ok(alive(own.pid), 'the user\'s server stays open');
    agents(`node dev.mjs ${port}`, `http://127.0.0.1:${port}/admin`);
    fs.rmSync(log(), { force: true });
    const changed = preview();
    assert.equal(changed.status, 1, 'audit: an address changed after approval is not opened, even with a server up');
    assert.match(changed.stdout, /Preview · command approval needed/);
    assert.equal(calls(), '');
  } finally { own.kill(); }
});

test('Ö-17.3 missing lines and an unapproved command: clear message, nothing runs', () => {
  reset();
  write('AGENTS.md', '# X\n\n## Commands\n\n```bash\ndev:  [ ]\ntest:        [ ]\n```\n');
  const missingEn = preview();
  assert.equal(missingEn.status, 1);
  assert.match(missingEn.stdout, /preview:/);
  agents(`node dev.mjs ${port} --new`);
  const unapproved = preview();
  assert.equal(unapproved.status, 1);
  assert.match(unapproved.stdout, /Preview · command approval needed/);
  assert.match(unapproved.stdout, /--new/, 'the user sees what they approve');
  assert.ok(!fs.existsSync(path.join(p, 'dev.pid')), 'an unapproved dev command does not run');
  const prompt = spawnSync(process.execPath, [path.join(HOOKS, 'commit-gate.mjs')], { input: JSON.stringify({ tool_input: { command: 'node .claude/hooks/gate.mjs --approve' } }), encoding: 'utf8', env: env() });
  const reason = JSON.parse(prompt.stdout).hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /- dev: node dev\.mjs/, 'the gate approval prompt shows the dev command');
  assert.match(reason, /- preview: http:\/\/127\.0\.0\.1/, 'and the preview address');
});

test('F-17 audit: only a plain local address is accepted (shell characters, user info, other hosts)', () => {
  reset();
  for (const url of [`http://localhost:${port}/;touch pwn`, `http://localhost:${port}/$(id)`, 'http://localhost@evil.com', `http://localhost:${port}.evil.com`,
    'https://example.com', `http://localhost:${port}/a b`, 'file:///etc/passwd']) {
    agents(`node dev.mjs ${port}`, url);
    approve();
    const r = preview();
    assert.equal(r.status, 1, url);
    assert.match(r.stdout, /address must be local/, url);
  }
  assert.equal(calls(), '', 'no browser call');
  assert.ok(!fs.existsSync(path.join(p, 'dev.pid')), 'no server');
});

test('Ö-17.3 a server that exits or never opens: clear message, the process is stopped', async () => {
  reset();
  agents('node -e "console.error(\'PORT in use\'); process.exit(1)"');
  approve();
  const exited = preview();
  assert.equal(exited.status, 1);
  assert.match(exited.stdout, /exited before it came up/);
  assert.match(exited.stdout, /PORT in use/, 'the last lines of the server output are shown');
  agents('node hang.mjs');
  approve();
  const hung = preview({ PREVIEW_TIMEOUT_MS: '1500' });
  assert.equal(hung.status, 1);
  assert.match(hung.stdout, /did not come up within/);
  assert.ok(await gone(pid()), 'the server that never opened is stopped');
});

test('Ö-17.3 a failed browser step still closes the browser and stops the server', async () => {
  agents(`node dev.mjs ${port}`);
  approve();
  for (const step of ['open', 'screenshot']) {
    reset();
    const r = preview({ PREVIEW_FAIL: step });
    assert.equal(r.status, 1, step);
    assert.match(r.stdout, /could not take the screenshot/, step);
    assert.match(calls(), /-s=kit-preview-\d+ close/, `${step}: close is called`);
    assert.ok(await gone(pid()), step);
  }
});

test('F-17 audit: the task name cannot leave .previews; an empty one is "latest"', () => {
  agents(`node dev.mjs ${port}`);
  approve();
  for (const [task, folder] of [['../x', '---x'], ['G-01; touch x', 'G-01--touch-x'], ['', 'latest']]) {
    reset();
    const r = preview({}, task);
    assert.equal(r.status, 0, `${task}: ${r.stdout}`);
    assert.ok(fs.existsSync(path.join(p, '.previews', folder, 'desktop.png')), task);
  }
  assert.ok(!fs.existsSync(path.join(p, 'x')) && !fs.existsSync(path.join(path.dirname(p), 'x', 'desktop.png')));
});

test('F-17 audit: a linked .previews folder is refused', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
  fs.renameSync(path.join(p, '.previews'), path.join(p, 'previews-old'));
  fs.symlinkSync(outside, path.join(p, '.previews'), 'junction');
  try {
    const r = preview();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\.previews is a link/);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    fs.unlinkSync(path.join(p, '.previews'));
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('F-17 mobile project: the step is skipped with a message', () => {
  write('.kit.json', JSON.stringify({ type: 'mobile' }));
  reset();
  const r = preview();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Expo Go/);
  assert.equal(calls(), '', 'no browser is opened');
  fs.rmSync(path.join(p, '.kit.json'));
});

test('AC-49.5 preview: a Turkish "## Komutlar" block (geliştirme / önizleme) is not read: the lines are missing, nothing runs', () => {
  reset();
  write('AGENTS.md', `# X\n\n## Komutlar\n\n\`\`\`bash\ngeliştirme:  node dev.mjs ${port}\nönizleme:    http://127.0.0.1:${port}\ntest:        [ ]\n\`\`\`\n`);
  approve();
  const r = preview();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /`preview:` line/, 'the missing English line is named');
  assert.equal(calls(), '', 'no browser call');
  assert.ok(!fs.existsSync(path.join(p, 'dev.pid')), 'the Turkish dev command did not run');
  // English heading, Turkish keys: the same
  write('AGENTS.md', `# X\n\n## Commands\n\n\`\`\`bash\ngeliştirme:  node dev.mjs ${port}\nönizleme:    http://127.0.0.1:${port}\n\`\`\`\n`);
  approve();
  const mixed = preview();
  assert.equal(mixed.status, 1, mixed.stdout + mixed.stderr);
  assert.ok(!fs.existsSync(path.join(p, 'dev.pid')), 'nothing ran');
});

test('AC-48.2 preview: an English Commands block (dev / preview) starts the server and takes both screenshots', async () => {
  reset();
  write('AGENTS.md', `# X\n\n## Commands\n\n\`\`\`bash\ndev:  node launcher.mjs ${port}\npreview:    http://127.0.0.1:${port}\ntest:        [ ]\nlint:        [ ]\ntype check: [ ]\nbuild:       [ ]\n\`\`\`\n`);
  approve();
  const r = preview({}, 'G-48');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const f of ['desktop.png', 'mobile.png']) assert.ok(fs.existsSync(path.join(p, '.previews', 'G-48', f)), f);
  assert.match(calls(), new RegExp(`open http://127\\.0\\.0\\.1:${port}`));
  assert.ok(await gone(pid()), 'the server it started is stopped');
});

test('3.49.6: preview before approval names an unknown Commands key (deploy) with the same text as gate --run', () => {
  reset();
  fs.rmSync(approvalPath(p), { force: true });
  write('AGENTS.md', '# X\n\n## Commands\n\n```bash\ndeploy:  npm run deploy\npreview: http://localhost:3000\n```\n');
  const r = preview();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^Preview · command approval needed/);
  const g = spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), '--run'], { cwd: p, encoding: 'utf8', env: env() });
  assert.equal(g.status, 1, g.stdout + g.stderr);
  assert.match(g.stdout, /^## Gate · command approval needed[\s\S]*deploy/, 'control: the gate names deploy');
  assert.equal(r.stdout.replace(/^Preview · /, ''), g.stdout.replace(/^## Gate · /, ''), 'preview names deploy exactly like the gate does');
  assert.doesNotMatch(r.stdout, /- deploy: npm run deploy/, 'deploy is not listed as a command to approve');
  assert.equal(calls(), '', 'no browser call');
});
