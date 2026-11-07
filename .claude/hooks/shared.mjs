// Hook input/output layer: the same guard scripts run on Claude Code, Codex and Antigravity.
//   Claude Code: { tool_name, tool_input: { command | file_path, content, new_string, edits } }; sets CLAUDE_PROJECT_DIR.
//                NotebookEdit: { notebook_path, new_source }.
//   Codex:       same fields as Claude + turn_id. File edits go through apply_patch; the patch text is in tool_input.command.
//   Antigravity: { toolCall: { name, args }, workspacePaths }. Tools: run_command (CommandLine),
//                write_to_file (TargetFile, CodeContent), replace_file_content (ReplacementContent),
//                multi_replace_file_content (ReplacementChunks[].ReplacementContent).
// Source: learn.chatgpt.com/docs/hooks, antigravity.google/docs/hooks (2026-10-23).
// Principle: if a write or command tool lacks the expected field, do not allow it (empty path, every argument is scanned).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The name of the model panel's temporary page (it holds the one-time token), also spelled with a glob or a Windows 8.3 short name. A text check: a search of the whole temp folder by content stays a known limit.
export const PANEL_TOKEN = /vibe-panel-|panel-open(?:\.html|(?![\w.-]))|vib[^\s/\\;&|]*[*?]|v[*?]be|[*?][^\s/\\;&|]*panel-|panel-o[^\s/\\;&|]*[*?]|\b(?:vibe-p|panel-|vi[\da-f]{4}|pa[\da-f]{4})~\d/i;

// A /try branch: fake parts are allowed only here. Lower case only, so a look-alike name gets no exemption.
export const TRIAL_BRANCH = /^try\/[a-z0-9][\w.-]*$/;

// Was this file started as the program (not imported)? Compared as real paths: a project opened through a symlink or a
// junction (macOS /tmp, linked folders, npx's node_modules/.bin) starts the script by its linked path, while
// import.meta.url is the target. A plain comparison would skip the guard silently there.
// Windows refuses a rename while another process has the target open for a moment, so a reader must not make a write fail
export function renameWithRetry(from, to) {
  // Measured against a process reading in a tight loop: refused for up to 720 ms, about 46 tries
  const end = Date.now() + 3000;
  for (;;) {
    try { return fs.renameSync(from, to); } catch (e) {
      if (process.platform !== 'win32' || Date.now() >= end || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

export function isMain(metaUrl) {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

// What the commit gate reads in board.md: a line starting with **Commit review:** off (the whole word, "offer" is not off)
export const reviewOff = (s) => /^\*\*Commit review:\*\*[ \t]*off(?![\p{L}\p{N}])/imu.test(s ?? '');

const AG_WRITE = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];

// Claude Code passes CLAUDE_PROJECT_DIR to hooks; Codex does not. Codex has no "ask", so a misdetection stays on the safe side.
export function detectTool(g) {
  if (g.toolCall || g.workspacePaths) return 'antigravity';
  if ('turn_id' in g || g.tool_name === 'apply_patch') return 'codex';
  return process.env.CLAUDE_PROJECT_DIR ? 'claude' : 'codex';
}

const isText = (x) => typeof x === 'string';
// Every string inside nested arrays and objects (the read guard sees a path wherever it sits in the arguments)
const texts = (x) => (isText(x) ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(texts) : []);

// The environment a child process may inherit (run-role.mjs, cost.mjs): names only, so a key or token in the environment never reaches it
export const ENV_ALLOWED = /^(?:PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|HOMEDRIVE|HOMEPATH|USERPROFILE|USERNAME|USER|LOGNAME|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|COMMONPROGRAMFILES(?:\(X86\))?|COMMONPROGRAMW6432|OS|PROCESSOR_[A-Z0-9_]+|NUMBER_OF_PROCESSORS|LANG|LC_[A-Z]+|TZ|TERM|SHELL|XDG_[A-Z_]+|CLAUDE_CODE_GIT_BASH_PATH)$/i;

// A program's full path from PATH, never one inside the project. On Windows a bare name looks in the working folder first. .exe and .com only: spawn cannot run a .cmd without a shell.
export function findProgram(name, root, env = process.env) {
  const win = process.platform === 'win32';
  const base = fs.realpathSync(root);
  for (const dir of String(env.PATH ?? env.Path ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(dir)) continue;
    for (const ext of win ? ['.exe', '.com'] : ['']) {
      const file = path.join(dir, name + ext);
      try {
        fs.accessSync(file, fs.constants.X_OK);
        const real = fs.realpathSync(file);
        const rel = path.relative(base, real);
        if (fs.statSync(real).isFile() && (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))) return file;
      } catch { /* not here */ }
    }
  }
  return null;
}

// Project root comes from the script's own location (<project>/.claude/hooks/): it does not depend on cwd or on
// marker files the agent could create (.git), so it stays right when Codex opens in a subfolder.
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// A missing file resolves through its nearest existing parent folder (links, Windows short names)
const realPath = (p) => {
  try { return fs.realpathSync.native(p); } catch { /* missing */ }
  const parent = path.dirname(p);
  return parent === p ? path.resolve(p) : path.join(realPath(parent), path.basename(p));
};
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const inside = (dir, base) => { const r = path.relative(base, dir); return !r.startsWith('..') && !path.isAbsolute(r); };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8').trim(); } catch { return null; } };
// The git layout read from the files, without starting git (every hook runs it; old git lacks --path-format).
// A linked worktree has a .git FILE "gitdir: <common>/worktrees/<name>", that folder a "commondir" file and a "gitdir"
// back link to <top>/.git: a .git file planted elsewhere does not match the back link and is no worktree.
// shortcut: reads git's files, not `git worktree list`; if git changes this layout, worktrees fall back to the main root (safe side).
function gitInfo(start) {
  for (let d = start; ; d = path.dirname(d)) {
    const dotGit = path.join(d, '.git');
    let stat = null; try { stat = fs.statSync(dotGit); } catch { /* not here */ }
    if (stat?.isDirectory()) return { top: d, common: realPath(dotGit), linked: false };
    if (stat?.isFile()) {
      const m = /^gitdir:\s*(.+)$/m.exec(readText(dotGit) ?? '');
      if (!m) return null;
      const gitDir = path.resolve(d, m[1].trim());
      const commondir = readText(path.join(gitDir, 'commondir'));
      if (!commondir) return { top: d, common: realPath(gitDir), linked: false }; // a submodule or --separate-git-dir
      const back = readText(path.join(gitDir, 'gitdir'));
      if (!back || !samePath(realPath(path.resolve(gitDir, back)), realPath(dotGit))) return null;
      // The admin folder must be the repository's own <common>/worktrees/<name>: one built elsewhere (an outside folder
      // with a commondir pointing at main's .git) is not registered, and writing under .git is asked
      const common = realPath(path.resolve(gitDir, commondir));
      if (!samePath(path.dirname(realPath(gitDir)), path.join(common, 'worktrees'))) return null;
      return { top: d, common, linked: true };
    }
    if (path.dirname(d) === d) return null;
  }
}
export const projectBase = () => process.env.CLAUDE_PROJECT_DIR || SCRIPT_ROOT;
// A worktree session (claude -w, the desktop Worktree switch) keeps CLAUDE_PROJECT_DIR on the main checkout while its cwd
// is the worktree: the root is that worktree when it belongs to the same repository (same git common dir), never another repo.
export function findRoot(cwd = process.cwd()) {
  const base = projectBase();
  const dir = realPath(cwd), baseReal = realPath(base);
  // Fast path: inside the project and not under its worktrees folder
  if (inside(dir, baseReal) && !inside(dir, path.join(baseReal, '.claude', 'worktrees'))) return base;
  const own = gitInfo(dir), main = own?.linked && gitInfo(baseReal);
  return main && samePath(own.common, main.common) && !samePath(own.top, main.top) ? own.top : base;
}
export const inLinkedWorktree = (root) => gitInfo(realPath(root))?.linked === true;
// The root whose rules govern a path: the session root, or the main checkout for a path a worktree session writes there
// (its rule files, board.md and state must not fall outside every check). null: outside both.
export function rootFor(full, root) {
  const f = realPath(full);
  for (const r of [root, projectBase()]) if (inside(f, realPath(r))) return r;
  return null;
}

// Auth, payment, webhook, upload, secrets: flow.mjs adds security-auditor, the commit gate keeps them out of the fast lane
export const SENSITIVE = /auth|login|session|passw|payment|checkout|billing|webhook|upload|secret|token|crypto|\.env|iyzico|paytr|stripe/i;

// Codex patch: "*** Add File: x" new file, "*** Update File: x", "*** Move to: y"; "+" lines are added text,
// "-" lines are removed text (before). Add can also overwrite an existing file: before is undefined, the script checks the disk.
// A Move entry also carries the moved file's path (source).
export function patchFiles(patch) {
  const files = [];
  let f = null;
  for (const line of patch.split(/\r?\n/)) {
    const m = line.match(/^\s*\*\*\*\s*(Add|Update|Delete) File:\s*(.+)$/) ?? line.match(/^\s*\*\*\*\s*(Move) to:\s*(.+)$/);
    if (m) {
      const source = m[1] === 'Move' ? f?.path : undefined;
      files.push((f = { path: m[2].trim(), isNew: m[1] === 'Add' || m[1] === 'Move', text: '', before: m[1] === 'Add' ? undefined : '' }));
      if (m[1] === 'Delete') f.deleted = true;
      if (source) f.source = source;
    } else if (f && line.startsWith('+')) f.text += line.slice(1) + '\n';
    else if (f && line.startsWith('-')) f.before = (f.before ?? '') + line.slice(1) + '\n';
  }
  for (const x of files) x.after = x.text;
  // Unparsed header: the whole patch counts as one file without a path, so secrets are scanned and the lock blocks
  return files.length || !patch.trim() ? files : [{ path: '', text: patch }];
}

// Returns: { tool, root, dir, session, command, files: [{ path, text, isNew?, before?, after?, deleted? }], reads: [path] }.
// reads: Antigravity read tools. isNew is undefined when unknown (the script checks the disk).
// dir: folder that relative paths resolve against (the session cwd in a Codex patch).
// text: all written text to scan. before/after: the edited part before and after (before undefined means a full write: the script checks the disk).
// edits: [{ old, new, all }] in order, when the tool gives them one by one (Claude Edit/MultiEdit, Antigravity chunks).
export function parseInput(g) {
  const tool = detectTool(g);
  const root = findRoot(isText(g.cwd) ? g.cwd : undefined);
  const session = String(g.session_id ?? g.conversationId ?? '');
  // agent: the subagent the call runs in (Claude Code agent_type; '' in the main session and on other tools)
  const agent = tool === 'claude' && isText(g.agent_type) ? g.agent_type : '';
  const result = { tool, root, dir: isText(g.cwd) ? g.cwd : root, session, agent, command: '', files: [], reads: [] };
  if (tool === 'antigravity') {
    const { name, args = {} } = g.toolCall ?? {};
    if (name === 'run_command') result.command = isText(args.CommandLine) ? args.CommandLine : JSON.stringify(args);
    // Independent of the content field name: every argument is scanned
    if (AG_WRITE.includes(name)) {
      const chunks = Array.isArray(args.ReplacementChunks) ? args.ReplacementChunks : [args];
      const join = (field) => chunks.map((c) => (isText(c?.[field]) ? c[field] : '')).join('\n');
      const full = name === 'write_to_file';
      result.files.push({
        path: isText(args.TargetFile) ? args.TargetFile : '', text: JSON.stringify(args),
        before: full ? undefined : join('TargetContent'),
        after: full ? (isText(args.CodeContent) ? args.CodeContent : '') : join('ReplacementContent'),
        edits: full ? undefined : chunks.map((c) => ({ old: String(c?.TargetContent ?? ''), new: String(c?.ReplacementContent ?? ''), all: c?.AllowMultiple === true })),
      });
    }
    // Reads: independent of the tool name, every string in the arguments counts as a possible path (unknown read tools too)
    result.reads = texts(args);
    return result;
  }
  const t = g.tool_input ?? {};
  const command = isText(t.command) ? t.command : Array.isArray(t.command) ? t.command.join(' ') : t.command == null ? '' : JSON.stringify(t.command);
  // Codex can pass the patch text in tool_input.input instead of command
  if (g.tool_name === 'apply_patch') result.files = patchFiles(command || (isText(t.input) ? t.input : t.input == null ? '' : JSON.stringify(t.input)));
  else result.command = command;
  const file = t.file_path ?? t.notebook_path;
  if (file) {
    const text = isText(t.content) ? t.content
      : isText(t.new_string) ? t.new_string
      : Array.isArray(t.edits) ? t.edits.map((e) => e?.new_string ?? '').join('\n')
      : isText(t.new_source) ? t.new_source
      : JSON.stringify(t); // an unexpected shape (content or new_source as an array): every argument is scanned
    const before = isText(t.old_string) ? t.old_string
      : Array.isArray(t.edits) ? t.edits.map((e) => e?.old_string ?? '').join('\n') : undefined;
    const edits = isText(t.old_string) ? [{ old: t.old_string, new: isText(t.new_string) ? t.new_string : '', all: t.replace_all === true }]
      : Array.isArray(t.edits) ? t.edits.map((e) => ({ old: String(e?.old_string ?? ''), new: String(e?.new_string ?? ''), all: e?.replace_all === true }))
      : undefined;
    result.files.push({ path: String(file), text, before, after: text, edits });
  }
  return result;
}

// Reads stdin; null if it is not JSON (the hook does not block the work)
export function readInput() {
  let g;
  try { g = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
  return parseInput(g && typeof g === 'object' ? g : {});
}

// PreToolUse decision (deny | ask) in the tool's own format.
// Codex has no "ask" (the tool would still run): it is denied and the AI asks the user.
export function decisionText(tool, decision, reason) {
  if (tool === 'antigravity') return JSON.stringify({ decision, reason });
  if (tool === 'codex' && decision === 'ask') {
    decision = 'deny';
    reason = `User approval required. ${reason} Blocked because Codex has no approval prompt: ask the user; if they approve, they should do the action themselves.`;
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } });
}

export function decide(tool, decision, reason) {
  console.log(decisionText(tool, decision, reason));
  process.exit(0);
}

// SessionStart note: Claude and Codex use additionalContext, Antigravity uses injectSteps.
// screen: the line shown to the user, Claude only (systemMessage); undocumented elsewhere.
export function sessionNote(tool, text, screen) {
  if (tool === 'antigravity') return JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: text } }] });
  const out = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
  if (screen && tool === 'claude') out.systemMessage = screen;
  return JSON.stringify(out);
}
