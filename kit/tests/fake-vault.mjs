// Test helper (3.64.0): a key vault that lives in a folder, so no test ever reaches a real vault or the real ~/.vibe-kit.
//
// As a preload:   node --import <this file> script.mjs
//   KIT_TEST_VAULT_DIR     folder of the fake vault (read only by this helper; without it the preload does nothing)
//   KIT_TEST_VAULT_MODE    ok (default) | locked (save, read and remove throw) | explode (even asking for the kind throws) | none (no vault: kind is null, every call throws)
//   KIT_TEST_SPY           file: claude and git program calls and outside network calls are appended there as JSON lines; claude is never really run
//   KIT_TEST_FAKE_TTY      1: stdin, stdout and stderr claim to be a terminal (the real input is still a pipe, nothing is typed)
// The keystore that gets the backend is the one of CLAUDE_PROJECT_DIR when that project holds a copy of the hooks, else the one of this repository.
//
// As a module: fileBackend() for tests that run in the same process.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import https from 'node:https';
import tls from 'node:tls';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_KEYSTORE = path.join(HERE, '..', '..', '.claude', 'hooks', 'keystore.mjs');
export const FAKE_VAULT_URL = import.meta.url;
export const VAULT_DIR_VAR = 'KIT_TEST_VAULT_DIR';

const fileOf = (dir, name) => path.join(dir, `${encodeURIComponent(String(name))}.vault`);

// { kind, save, read, remove } as keystore.mjs wants it. calls counts every use; the vault folder holds one file per name.
export function fileBackend(dir, mode = 'ok') {
  const calls = { save: 0, read: 0, remove: 0 };
  const log = (op, name) => { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'calls.log'), `${op} ${name}\n`); } catch { /* the count in memory still works */ } };
  const locked = () => { if (mode === 'locked' || mode === 'explode' || mode === 'none') throw new Error('vault is locked'); };
  const backend = {
    calls,
    save(name, key) { calls.save++; log('save', name); locked(); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(fileOf(dir, name), String(key)); },
    read(name) { calls.read++; log('read', name); locked(); try { return fs.readFileSync(fileOf(dir, name), 'utf8'); } catch { return null; } },
    remove(name) { calls.remove++; log('remove', name); locked(); fs.rmSync(fileOf(dir, name), { force: true }); },
  };
  Object.defineProperty(backend, 'kind', {
    get() { if (mode === 'explode') throw new Error('the vault was asked for its kind'); return mode === 'none' ? null : 'fake'; },
  });
  return backend;
}

// What the vault holds right now: { name: text }, read from the folder without going through the backend
export function vaultFiles(dir) {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.vault')).map((f) => [decodeURIComponent(f.slice(0, -'.vault'.length)), fs.readFileSync(path.join(dir, f), 'utf8')]));
}
// Calls made through a backend in another process
export const vaultCalls = (dir) => (fs.existsSync(path.join(dir, 'calls.log')) ? fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').split('\n').filter(Boolean) : []);

// A folder with a stand-in for the claude program (an empty file: the spy preload never runs it)
export function makeFakeClaude(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
  fs.writeFileSync(file, process.platform === 'win32' ? '' : '#!/bin/sh\nexit 0\n');
  if (process.platform !== 'win32') fs.chmodSync(file, 0o755);
  return file;
}

// ---- Preload part ----

const dir = process.env[VAULT_DIR_VAR];
if (dir) {
  const project = process.env.CLAUDE_PROJECT_DIR ? path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'hooks', 'keystore.mjs') : null;
  const target = project && fs.existsSync(project) ? project : REPO_KEYSTORE;
  const { setVaultBackend } = await import(pathToFileURL(target).href);
  setVaultBackend(fileBackend(dir, process.env.KIT_TEST_VAULT_MODE || 'ok'));
}

if (process.env.KIT_TEST_FAKE_TTY === '1') {
  for (const stream of [process.stdin, process.stdout, process.stderr]) Object.defineProperty(stream, 'isTTY', { value: true, configurable: true });
  process.stdin.setRawMode = () => process.stdin;
}

const spy = process.env.KIT_TEST_SPY;
if (spy) {
  const rec = (o) => fs.appendFileSync(spy, JSON.stringify(o) + '\n');
  const program = (cmd) => path.basename(String(cmd)).replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
  const isLoop = (h) => /^(127\.0\.0\.1|localhost|\[::1\])$/.test(h);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    if (isLoop(u.hostname)) return realFetch(input, init);
    rec({ kind: 'net', url: u.href });
    throw new Error('real network is blocked in this test');
  };
  https.request = (...a) => { rec({ kind: 'net', url: String(a[0]) }); throw new Error('real network is blocked in this test'); };
  tls.connect = (...a) => { rec({ kind: 'net', url: String(a[0]?.host ?? a[0]) }); throw new Error('real network is blocked in this test'); };
  const noteCall = (via, cmd, args, opts) => {
    const name = program(cmd);
    if (name === 'claude' || name === 'git') rec({ kind: 'program', via, name, cmd: String(cmd), args: Array.isArray(args) ? args : [], env: (Array.isArray(args) ? opts : args)?.env ?? null });
    return name;
  };
  const real = { spawn: cp.spawn, spawnSync: cp.spawnSync, execFileSync: cp.execFileSync, execFile: cp.execFile };
  cp.spawn = (cmd, args, opts) => {
    if (noteCall('spawn', cmd, args, opts) !== 'claude') return real.spawn(cmd, args, opts);
    const child = new EventEmitter();
    Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), pid: 4242, kill: () => true });
    setTimeout(() => { child.stdout.end(); child.stderr.end(); child.emit('exit', 0, null); child.emit('close', 0, null); }, 20);
    return child;
  };
  cp.spawnSync = (cmd, args, opts) => (noteCall('spawnSync', cmd, args, opts) === 'claude' ? { status: 0, stdout: '', stderr: '', output: [], pid: 1 } : real.spawnSync(cmd, args, opts));
  cp.execFileSync = (cmd, args, opts) => (noteCall('execFileSync', cmd, args, opts) === 'claude' ? '' : real.execFileSync(cmd, args, opts));
  cp.execFile = (cmd, ...rest) => { noteCall('execFile', cmd, rest[0], rest[1]); return real.execFile(cmd, ...rest); };
  syncBuiltinESMExports();
}

// Used by tests that need the home the operating system reports, whatever HOME says
export const osHome = () => os.userInfo().homedir;
