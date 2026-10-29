#!/usr/bin/env node
// Live preview (F-17): opens the dev server, takes desktop (1440) and mobile (390) screenshots, stops what it started.
//   node .claude/hooks/preview.mjs <task>   → .previews/<task>/desktop.png and mobile.png · exit code: 0 done or skipped, 1 error
//   Commands come from AGENTS.md → Commands: dev (dev server) and preview (local address). Nothing runs or is opened
//   without the gate approval (gate.mjs --approve covers both lines). A server already answering is used and left open.
//   Mobile (Expo) projects are skipped: a web screenshot is not what the phone shows.
//   Screenshots: @playwright/cli (pinned, via npx). PREVIEW_CLI=<node script> replaces it in tests; PREVIEW_TIMEOUT_MS: wait for the address.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { approvedCommands, approvalNeeded, isApproved } from './gate.mjs';
import { findRoot, isMain } from './shared.mjs';

const CLI = 'npx -y @playwright/cli@0.1.22';
const SIZES = [['desktop', 1440, 900], ['mobile', 390, 844]];
// Local only, and no shell characters: the address is joined into the npx command line
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/[\w\-./]*)?$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tail = (s) => s.trimEnd().split(/\r?\n/).slice(-15).join('\n');
const block = (s) => (s.trim() ? `\n\`\`\`\n${tail(s)}\n\`\`\`` : '');
const fail = (text) => ({ code: 1, text: `Preview failed: ${text}` });

async function answers(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true; } catch { return false; }
}

// The dev command runs through a shell and starts its own children (npm → next): the whole tree is stopped.
// shortcut: on Windows a child that outlived its shell is not found by taskkill /T; upgrade to a job object if that shows up.
function kill(child, signal) {
  if (process.platform === 'win32') { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); return false; }
  try { process.kill(-child.pid, signal); return true; } catch { return false; } // false: the group is gone
}
async function stop(child) {
  if (!kill(child, 'SIGTERM')) return;
  for (let i = 0; i < 30; i++) { if (!kill(child, 0)) return; await sleep(100); }
  kill(child, 'SIGKILL'); // only a group that ignored SIGTERM: a reused pid of a dead group is not hit
}

// The CLI runs in a kit-owned temp folder, never in the project: it would load a repo's .playwright/cli.config.json
// (launchOptions.executablePath) and npx a repo's .npmrc. A session name per run keeps parallel previews apart.
function browser(tmp, args) {
  const opts = { cwd: tmp, encoding: 'utf8', timeout: 120000 };
  const all = [`-s=kit-preview-${process.pid}`, ...args];
  // The arguments are fixed words and a checked address: joining them for the shell is safe
  return process.env.PREVIEW_CLI ? spawnSync(process.execPath, [process.env.PREVIEW_CLI, ...all], opts)
    : spawnSync(`${CLI} ${all.join(' ')}`, { ...opts, shell: true });
}

export async function preview(root, task) {
  let kit = {};
  try { kit = JSON.parse(fs.readFileSync(path.join(root, '.kit.json'), 'utf8')); } catch { /* not set up */ }
  if (kit.type === 'mobile') return { code: 0, text: 'Preview skipped: in a mobile project a web screenshot does not show what the phone shows. Ask the user to open the screen on the phone or in Expo Go and check it.' };
  const list = approvedCommands(root);
  const command = (name) => list.find((k) => k.name === name).command;
  const url = command('preview'), dev = command('dev');
  if (!url) return fail('AGENTS.md → Commands has no `preview:` line, or it is empty. Add it (example: `preview:     http://localhost:3000`) or produce the evidence by hand in this task.');
  if (!LOCAL.test(url)) return fail(`the preview address must be local (http://localhost:<port>, 127.0.0.1 or [::1]). Now: ${url}`);
  if (!isApproved(root, list)) return { code: 1, text: `Preview · ${approvalNeeded(list)}` };
  const dir = `.previews/${String(task || 'latest').replace(/[^\w-]/g, '-')}`;
  // A linked folder from the repo would send the files elsewhere
  for (const d of ['.previews', dir]) {
    try { if (fs.lstatSync(path.join(root, d)).isSymbolicLink()) return fail(`${d} is a link (symlink/junction); it must be a real folder.`); } catch { /* missing: created below */ }
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-preview-'));
  const logFile = path.join(tmp, 'dev.log');
  const devLog = () => { try { return fs.readFileSync(logFile, 'utf8').slice(-8000); } catch { return ''; } };
  let child = null, opened = false;
  // Cut off (Ctrl+C, a tool timeout): the server must not outlive the script; on POSIX it is in its own group
  const onSignal = () => {
    if (child) kill(child, 'SIGKILL');
    if (opened) browser(tmp, ['close']);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp folder */ }
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    if (!(await answers(url))) {
      if (!dev) return fail(`${url} is not up and AGENTS.md → Commands has no \`dev:\` command.`);
      // Output goes to a file, not a pipe: the screenshot steps block the event loop and a full pipe would freeze the server
      const fd = fs.openSync(logFile, 'w');
      // A process group on POSIX so the whole tree can be stopped; on Windows detached would open a console window
      child = spawn(dev, { cwd: root, shell: true, detached: process.platform !== 'win32', stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      const running = () => child.exitCode === null && child.signalCode === null;
      const wait = Number(process.env.PREVIEW_TIMEOUT_MS) || 60000;
      const deadline = Date.now() + wait;
      let up = false;
      while (!up && running() && Date.now() < deadline) { await sleep(500); up = await answers(url); }
      if (!up) {
        return fail(running()
          ? `${url} did not come up within ${Math.round(wait / 1000)} s. Are the address and port the same as \`preview:\` in AGENTS.md → Commands?${block(devLog())}`
          : `the dev server exited before it came up (${child.exitCode ?? child.signalCode}): ${dev}${block(devLog())}`);
      }
    }
    opened = true;
    const steps = [['open', url], ...SIZES.flatMap(([name, w, h]) => [['resize', w, h], ['screenshot', `--filename=${name}.png`]])];
    for (const step of steps) {
      const r = browser(tmp, step.map(String));
      const shot = step[0] === 'screenshot' ? path.join(tmp, step[1].slice(11)) : null;
      if (r.status !== 0 || (shot && !fs.existsSync(shot))) {
        return fail(`could not take the screenshot (${step.join(' ')}).${block(`${r.error?.message ?? ''}\n${r.stdout ?? ''}${r.stderr ?? ''}`)}`);
      }
    }
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const [name] of SIZES) {
      const dest = path.join(root, dir, `${name}.png`);
      fs.rmSync(dest, { force: true }); // a link left in its place is removed, not written through
      fs.copyFileSync(path.join(tmp, `${name}.png`), dest);
    }
    return { code: 0, text: `Preview ready (${url}):\n${SIZES.map(([name, w]) => `- ${dir}/${name}.png (${w} px)`).join('\n')}\nOpen the images and show them to the user.` };
  } finally {
    if (opened) browser(tmp, ['close']);
    if (child) await stop(child);
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows may still hold a file; it is in the temp folder */ }
  }
}

if (isMain(import.meta.url)) {
  const { code, text } = await preview(findRoot(), process.argv[2]);
  console.log(text);
  process.exit(code);
}
