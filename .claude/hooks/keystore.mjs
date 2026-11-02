// The system key vault (docs/workflow/models.md): Windows DPAPI, the macOS Keychain, Linux secret-tool.
// A key reaches a child process through stdin only: never in argv, never in the environment.
// VIBE_KIT_VAULT=none turns the vault off (the plain store of providers.mjs is used instead).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { findRoot } from './shared.mjs';

const SERVICE = 'tillerhand';
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/; // becomes a file name on Windows
const run = (cmd, args, input) => cp.execFileSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000, windowsHide: true });
const check = (provider) => { if (!PROVIDER_ID.test(String(provider))) throw new Error('Invalid provider name.'); return provider; };

// Programs by full path, so a look-alike earlier on PATH is never run with a key
const SECURITY = '/usr/bin/security';
const SECRET_TOOL = '/usr/bin/secret-tool';

// SystemRoot comes from the environment, which a project's settings can set: it counts only when absolute, outside the project, and holding powershell.exe
function powershell() {
  const system = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? String.raw`C:\Windows`;
  if (!path.isAbsolute(system)) return null;
  try {
    const exe = path.join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const rel = path.relative(fs.realpathSync(findRoot()), fs.realpathSync(exe));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)) ? null : exe;
  } catch {
    return null;
  }
}

// Constant scripts: the key or the ciphertext comes in on stdin
const PS = ['-NoProfile', '-NonInteractive', '-Command'];
const PS_PROTECT = "Add-Type -AssemblyName System.Security; $k = [Console]::In.ReadToEnd().Trim(); $e = [System.Security.Cryptography.ProtectedData]::Protect([System.Text.Encoding]::UTF8.GetBytes($k), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($e))";
const PS_UNPROTECT = "Add-Type -AssemblyName System.Security; $c = [Console]::In.ReadToEnd().Trim(); $d = [System.Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($c), $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($d))";

const keyFile = (provider) => path.join(os.homedir(), '.vibe-kit', 'keys', `${check(provider)}.dpapi`);
const quiet = (fn) => { try { return fn(); } catch { return null; } };

const dpapi = {
  kind: 'dpapi',
  save(provider, key) {
    const file = keyFile(provider);
    const cipher = run(powershell(), [...PS, PS_PROTECT], key);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    try { fs.writeFileSync(tmp, cipher, { mode: 0o600 }); fs.renameSync(tmp, file); } finally { fs.rmSync(tmp, { force: true }); }
  },
  read(provider) {
    const file = keyFile(provider);
    if (!fs.existsSync(file)) return null;
    return run(powershell(), [...PS, PS_UNPROTECT], fs.readFileSync(file, 'utf8')).trim();
  },
  remove(provider) { fs.rmSync(keyFile(provider), { force: true }); },
};

const keychain = {
  kind: 'keychain',
  // security -i reads its commands from stdin, so the key is not in argv. The key format is [\w-], so no quoting is needed.
  save: (provider, key) => {
    // The key is part of a command line that security parses: only the characters of a real key, so nothing can end the command early
    if (!/^[\w-]+$/.test(String(key))) throw new Error('Invalid key.');
    run(SECURITY, ['-i'], `add-generic-password -U -s ${SERVICE} -a ${check(provider)} -w ${key}\n`);
  },
  read: (provider) => quiet(() => run(SECURITY, ['find-generic-password', '-s', SERVICE, '-a', check(provider), '-w']).trim()) || null,
  remove: (provider) => { quiet(() => run(SECURITY, ['delete-generic-password', '-s', SERVICE, '-a', check(provider)])); },
};

const secretTool = {
  kind: 'secret-tool',
  save: (provider, key) => { run(SECRET_TOOL, ['store', '--label=TillerHand', 'service', SERVICE, 'provider', check(provider)], key); },
  read: (provider) => quiet(() => run(SECRET_TOOL, ['lookup', 'service', SERVICE, 'provider', check(provider)]).trim()) || null,
  remove: (provider) => { quiet(() => run(SECRET_TOOL, ['clear', 'service', SERVICE, 'provider', check(provider)])); },
};

let backendOverride = null;
// Tests replace the backend: { kind, save(provider, key), read(provider), remove(provider) }
export const setVaultBackend = (backend) => { backendOverride = backend; };

function backend() {
  if (process.env.VIBE_KIT_VAULT === 'none') return null;
  if (backendOverride) return backendOverride;
  if (process.platform === 'win32') return powershell() ? dpapi : null;
  if (process.platform === 'darwin') return keychain;
  return process.platform === 'linux' && fs.existsSync(SECRET_TOOL) ? secretTool : null;
}

export const vaultKind = () => backend()?.kind ?? null;

function open() {
  const b = backend();
  if (!b) throw new Error('No key vault on this system.');
  return b;
}
export const vaultSave = (provider, key) => open().save(provider, key);
export const vaultRead = (provider) => open().read(provider) ?? null;
export const vaultDelete = (provider) => open().remove(provider);
