#!/usr/bin/env node
// Vibe Coding Kit: install and update.
//   node kit/kit.mjs install --type web-saas [--addons ai,tr] [--keep-kit]
//       In a project opened from the template, places the type and addons, then deletes the kit/ folder. Run by /start.
//   node <kit-clone>/kit/kit.mjs init [--project <path>] [--tool claude,codex,antigravity]
//       Installs the kit from a separate folder into a project (default: the current folder). Does not touch the kit folder.
//       Without --tool it asks in the terminal (default claude).
//       In a non-empty folder it does not overwrite existing files: the kit's version goes beside them as .kit-new (/adopt merges).
//   node <kit-clone>/kit/kit.mjs install --type web-saas --project <path>
//       Places the type into a project set up by init. Run by /start and /adopt.
//   node <kit-clone>/kit/kit.mjs update --project <path> [--addons ai,tr]
//       Brings the project to this kit version. Run by /kit-update.
//   node <kit-clone>/kit/kit.mjs remove --project <path> [--yes]
//       Takes the kit out of a project; files the user changed stay. Without --yes it only lists. Run by /kit-remove.
//
// Layers: repo root (common) -> kit/templates/<type> -> kit/templates/addons/<addon>; a later one overrides an earlier one.
// Special files: "x.append" -> appended to x in the project; "x.merge.json" -> merged into x.json.
// Tools (--tool): Claude Code files are always installed. For codex and antigravity kit/tools/<tool>/ (hook config)
// is copied and .agents/skills/<name>/SKILL.md is generated from .claude/commands + .claude/skills (single source: .claude/).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readLang } from '../.claude/hooks/lang.mjs';

const KIT = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(KIT);
const TEMPLATES = path.join(KIT, 'templates');
const VERSION = fs.readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim();
const SOURCE = fs.readFileSync(path.join(KIT, 'SOURCE'), 'utf8').trim();
const TYPES = fs.readdirSync(TEMPLATES).filter((d) => d !== 'addons');
const ADDONS = fs.readdirSync(path.join(TEMPLATES, 'addons'));
const TOOLS = ['claude', 'codex', 'antigravity'];
// Root entries that are not part of the common layer (the kit itself, generated and temporary files)
// CLAUDE.local.md is personal (in .gitignore); it must not be carried into a project installed from a local folder
const COMMON_EXCLUDE = new Set(['.git', 'kit', 'node_modules', '.kit.json', '.kit.local.json', 'README.md', 'dashboard.html', '.previews', 'sandbox', '.calisma', '.impeccable', 'CLAUDE.local.md', 'LICENSE', 'README.tr.md', 'package.json', '.claude-plugin']);
// Files that only make sense in the kit repo and are not carried into projects
const KIT_ONLY = ['.github/workflows/kit-tests.yml', '.github/workflows/npm-publish.yml'];
// Run from the npm package (npx tillerhand): the kit lives in the npx cache, which can be cleared, so the record names
// the package version instead of the folder
const VIA_NPX = /[\\/]_npx[\\/]/.test(ROOT);
// Git-ignored personal files and secrets of a local kit checkout (a clone does not have them): never copied, at any depth
const PERSONAL = /(^|\/)(\.env(\.(?!example(\.|$))[^/]*)?|secrets\/.*|\.claude\/(settings\.local\.json|state\/.*)|[^/]*\.kit-new|[^/]*\.log|logs\/.*|CLAUDE-SECURITY-[^/]*\/.*)$/;

// Files the kit owns: on update they are replaced if the user has not changed them.
// The rest belong to the project (CLAUDE.md, PRD, stack, settings.json...); the update only adds them if missing.
const KIT_OWNED = [
  /^\.claude\/(commands|agents|hooks|board|findings|skills)\//,
  /^\.claude\/i18n\/tr\.json$/,
  /^docs\/(security\/checklist|operations\/(release-checklist|maintenance|deploy-setup)|legal\/(privacy-kvkk|turkiye)|workflow\/(decision-protocol|skills|usage-limits|models))\.md$/,
];
const isKitOwned = (rel) => KIT_OWNED.some((re) => re.test(rel));

const read = (p) => fs.readFileSync(p, 'utf8');
// A line ending difference (CRLF/LF) does not count as a change
const hash = (p) => crypto.createHash('sha256').update(read(p).replace(/\r\n/g, '\n')).digest('hex');

function listFiles(root, exclude = new Set()) {
  const result = [];
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!rel && exclude.has(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (!KIT_ONLY.includes(r) && !PERSONAL.test(r)) result.push(r);
    }
  })(root, '');
  return result;
}

// copies: target relative path -> source file. patches: append/merge operations (applied in order).
// An addon may carry files for one project type under addons/<addon>/types/<type>/ (e.g. code in the stack's language):
// that folder is a layer of its own, after the addon, and only for that type.
const layerNames = (type, addons) => [type, ...addons.flatMap((e) =>
  [`addons/${e}`, ...(fs.existsSync(path.join(TEMPLATES, 'addons', e, 'types', type)) ? [`addons/${e}/types/${type}`] : [])])];

function layers(commonRoot, names) {
  const copies = new Map();
  const patches = [];
  if (commonRoot) for (const rel of listFiles(commonRoot, COMMON_EXCLUDE)) copies.set(rel, path.join(commonRoot, rel));
  // npm never packs a .gitignore: the package carries a copy, so a project set up with npx still ignores .env
  if (commonRoot && !copies.has('.gitignore')) copies.set('.gitignore', path.join(KIT, 'project', 'gitignore'));
  for (const name of names) {
    const root = path.join(TEMPLATES, name);
    if (!fs.existsSync(root)) throw new Error(`Template layer not found: ${name}`);
    const isAddon = /^addons\/[^/]+$/.test(name);
    for (const rel of listFiles(root, isAddon ? new Set(['types']) : undefined)) {
      const source = path.join(root, rel);
      if (rel.endsWith('.append')) patches.push({ kind: 'append', target: rel.slice(0, -'.append'.length), source, layer: name });
      else if (rel.endsWith('.merge.json')) patches.push({ kind: 'merge', target: rel.replace(/\.merge\.json$/, '.json'), source, layer: name });
      else copies.set(rel, source);
    }
  }
  return { copies, patches };
}

function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

export function merge(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set(a.map((x) => JSON.stringify(x)));
    return [...a, ...b.filter((x) => !seen.has(JSON.stringify(x)))];
  }
  const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (isObject(a) && isObject(b)) {
    const r = { ...a };
    // Own keys only; a JSON "__proto__" key would replace the result's prototype
    for (const [k, v] of Object.entries(b)) if (k !== '__proto__') r[k] = Object.hasOwn(a, k) ? merge(a[k], v) : v;
    return r;
  }
  return b;
}

// Rules older kits added that match nothing now or were too broad. Exact spelling only, so a rule the user wrote is never removed.
const OLD_RULES = {
  allow: [
    // 3.19.1: in the project folder the CLI loads a repo's .playwright/cli.config.json (it can run a program); asked, not allowed
    ...['open', 'snapshot', 'console', 'requests', 'screenshot'].map((c) => `Bash(npx -y @playwright/cli@0.1.22 ${c}:*)`),
    // 3.28.0: --plan-end + --plan-save widened or dropped the scope shield unasked; both are asked now
    'Bash(node .claude/hooks/freeze-guard.mjs --plan-save:*)', 'Bash(node .claude/hooks/freeze-guard.mjs --plan-end)',
    // 3.10.0 allowed every tools.mjs flag; --enable and --commands are asked since 3.10.1, the broad rule skipped that
    'Bash(node .claude/hooks/tools.mjs:*)',
    // 3.49.2: lang.mjs --write saves the texts approval prompts show; only --show, --check, --export and --set stay allowed
    'Bash(node .claude/hooks/lang.mjs:*)',
    // 3.49.2: kit.mjs install copies files over the project, the guards included; asked, not allowed
    'Bash(node kit/kit.mjs install:*)'],
  ask: [],
};

// settings.json belongs to the project and is not replaced on update, but the kit's permission rules must reach it:
// missing allow/ask/deny rules are added (the project's own rules stay), the kit's old rules are removed, and hook flags
// renamed in 3.15.0 are rewritten so the old and new hook entries do not both run.
// Returns { settings, added: ['ask: Bash(...)', ...], removed: [...] }; throws on a shape it cannot merge safely (the caller reports it).
export function migrateSettings(projectSettings, kitSettings) {
  const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObject(projectSettings)) throw new Error('root is not an object');
  const s = structuredClone(projectSettings);
  if (s.permissions !== undefined && !isObject(s.permissions)) throw new Error('permissions is not an object');
  const added = [], removed = [];
  for (const k of ['allow', 'ask', 'deny']) {
    let list = s.permissions?.[k];
    if (list !== undefined && !Array.isArray(list)) throw new Error(`permissions.${k} is not an array`);
    const old = (list ?? []).filter((r) => OLD_RULES[k]?.includes(r));
    if (old.length) list = s.permissions[k] = list.filter((r) => !old.includes(r));
    removed.push(...old.map((r) => `${k}: ${r}`));
    const have = new Set(list ?? []);
    const add = (kitSettings.permissions?.[k] ?? []).filter((r) => !have.has(r));
    if (add.length) (s.permissions ??= {})[k] = [...(list ?? []), ...add];
    added.push(...add.map((r) => `${k}: ${r}`));
  }
  // 3.16.0: the light command list reaches projects that have none; a present key (Full profile: {}) is the project's choice
  if (s.skillOverrides !== undefined && !isObject(s.skillOverrides)) throw new Error('skillOverrides is not an object');
  if (s.skillOverrides === undefined && isObject(kitSettings.skillOverrides)) {
    s.skillOverrides = { ...kitSettings.skillOverrides };
    added.push(`skillOverrides: ${Object.keys(s.skillOverrides).length} commands are listed by name only (in the Full profile: node .claude/hooks/tools.mjs --commands full)`);
  }
  return { settings: s, added, removed };
}

function applyPatch(projectDir, { kind, target, source }) {
  const filePath = path.join(projectDir, target);
  if (kind === 'merge') {
    const existing = fs.existsSync(filePath) ? JSON.parse(read(filePath)) : {};
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(merge(existing, JSON.parse(read(source))), null, 2) + '\n');
    return;
  }
  const patch = read(source);
  const existing = fs.existsSync(filePath) ? read(filePath) : '';
  if (existing.includes(patch.split('\n')[0])) return; // already appended
  fs.appendFileSync(filePath, (existing && !existing.endsWith('\n') ? '\n' : '') + (existing ? '\n' : '') + patch);
}

// Do not overwrite the project's own file: the kit's new version goes beside it as .kit-new.
// .gitignore merges line by line, .claude/settings.json merges deeply (the project's value wins).
function safeCopy(projectDir, rel, source, conflicts) {
  const target = path.join(projectDir, rel);
  if (!fs.existsSync(target)) { copy(source, target); return; }
  if (hash(target) === hash(source)) return;
  if (rel === '.gitignore') {
    for (const line of read(source).split(/\r?\n/)) if (line.trim()) appendLine(target, line);
    return;
  }
  if (rel === '.claude/settings.json') {
    fs.writeFileSync(target, JSON.stringify(merge(JSON.parse(read(source)), JSON.parse(read(target))), null, 2) + '\n');
    return;
  }
  copy(source, target + '.kit-new');
  conflicts.push(rel);
}

function appendLine(file, line) {
  const existing = fs.existsSync(file) ? read(file) : '';
  if (existing.split(/\r?\n/).includes(line)) return;
  fs.appendFileSync(file, (existing && !existing.endsWith('\n') ? '\n' : '') + line + '\n');
}

function writeRecord(projectDir, data) {
  fs.writeFileSync(path.join(projectDir, '.kit.json'), JSON.stringify(data, null, 2) + '\n');
}

// A local kit clone outside the project is a folder on this machine only: its path goes to the git-ignored
// .kit.local.json and .kit.json says "local", so a clone of the project on another machine never points at this one.
// Returns the value for .kit.json → kit; an old record with an absolute path is moved the same way on install/update.
// A path written on another OS (D:\Kit read on Linux) counts too; one that does not exist here is not copied into
// .kit.local.json: /start and /adopt then ask for the kit folder instead of using another machine's path.
export function portableKit(projectDir, kit) {
  if (typeof kit !== 'string' || !(path.win32.isAbsolute(kit) || path.posix.isAbsolute(kit))) return kit;
  if (!fs.existsSync(kit)) return 'local';
  fs.writeFileSync(path.join(projectDir, '.kit.local.json'), JSON.stringify({ kit }, null, 2) + '\n');
  appendLine(path.join(projectDir, '.gitignore'), '.kit.local.json');
  return 'local';
}

function validateTools(tools) {
  for (const a of tools) if (!TOOLS.includes(a)) throw new Error(`Invalid tool: ${a}. Options: ${TOOLS.join(', ')}`);
  return tools.length ? tools : ['claude'];
}

// Command -> skill: Codex and Antigravity call commands as skills ($start, /start).
export function commandToSkill(name, md) {
  const m = md.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const field = (k) => m?.[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].trim() ?? '';
  const hint = field('argument-hint');
  return `---\nname: ${name}\ndescription: ${JSON.stringify(field('description') || name)}\n---\n\n` +
    `<!-- Generated by the kit (kit.mjs): edit .claude/commands/${name}.md; this copy is refreshed on update. -->\n` +
    `$ARGUMENTS = the text the user typed when calling this skill (empty if none)${hint ? `. Expected: ${hint}` : ''}.\n\n` +
    (m ? m[2] : md);
}

// Files for the chosen tools. Skill copies and hooks.json follow the same rule as isKitOwned on update: refreshed if the
// user has not changed them, .kit-new if changed (or the project's own file); a hook config the user deleted does not come back.
// AGENTS.md "In Codex and Antigravity" section: filled only for projects that use those tools (F-13: ~450 tokens a session).
// An empty block is filled from the kit; only an unchanged kit block is emptied; a file without markers is left alone.
const TOOL_BLOCK = /(<!-- kit:other-tools -->\r?\n)([\s\S]*?)(<!-- \/kit:other-tools -->)/;
export function syncToolSection(text, kitText, needed) {
  const m = text.match(TOOL_BLOCK);
  const kitBody = kitText.match(TOOL_BLOCK)?.[2] ?? '';
  if (!m || (needed ? m[2].trim() : m[2] !== kitBody)) return text;
  return text.replace(TOOL_BLOCK, (all, open, body, close) => open + (needed ? kitBody : '') + close);
}

function installTools(projectDir, tools, files, conflicts) {
  const others = tools.filter((a) => a !== 'claude');
  const kitAgents = read(path.join(ROOT, 'AGENTS.md'));
  for (const rel of ['AGENTS.md', 'AGENTS.md.kit-new']) {
    const p = path.join(projectDir, rel);
    if (!fs.existsSync(p)) continue;
    const before = read(p), after = syncToolSection(before, kitAgents, others.length > 0);
    if (after === before) continue;
    fs.writeFileSync(p, after);
    if (rel in files) files[rel] = hash(p);
  }
  if (!others.length) return;
  const skills = new Map(); // .agents/skills/... -> content
  const commandsDir = path.join(projectDir, '.claude', 'commands');
  for (const f of fs.existsSync(commandsDir) ? fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md')) : []) {
    skills.set(`.agents/skills/${f.slice(0, -3)}/SKILL.md`, commandToSkill(f.slice(0, -3), read(path.join(commandsDir, f))));
  }
  const kitSkills = path.join(projectDir, '.claude', 'skills');
  if (fs.existsSync(kitSkills)) for (const rel of listFiles(kitSkills)) skills.set(`.agents/skills/${rel}`, read(path.join(kitSkills, rel)));
  for (const [rel, content] of skills) {
    const filePath = path.join(projectDir, rel);
    const seen = fs.existsSync(filePath);
    if (seen && read(filePath).replace(/\r\n/g, '\n') === content.replace(/\r\n/g, '\n')) { files[rel] = hash(filePath); continue; }
    if (seen && files[rel] !== hash(filePath)) { // the project's own skill, or the user changed it
      fs.writeFileSync(filePath + '.kit-new', content);
      conflicts.push(rel);
      continue;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    files[rel] = hash(filePath);
  }
  for (const toolName of others) {
    const root = path.join(KIT, 'tools', toolName);
    for (const rel of listFiles(root)) {
      const source = path.join(root, rel);
      const filePath = path.join(projectDir, rel);
      if (!fs.existsSync(filePath)) {
        if (rel in files) continue;
        copy(source, filePath);
      } else if (files[rel] === hash(filePath)) copy(source, filePath);
      else if (files[rel] === hash(source)) continue;
      else {
        safeCopy(projectDir, rel, source, conflicts);
        if (conflicts.includes(rel)) continue;
      }
      files[rel] = hash(filePath);
    }
  }
}

function validateType(typeName, addonNames) {
  if (!TYPES.includes(typeName)) throw new Error(`Invalid type: ${typeName}. Options: ${TYPES.join(', ')}`);
  for (const e of addonNames) if (!ADDONS.includes(e)) throw new Error(`Invalid add-on: ${e}. Options: ${ADDONS.join(', ')}`);
}

const conflictReport = (conflicts) => conflicts.length && console.log(
  `Existing files were not touched; the kit's version was placed beside them as .kit-new (${conflicts.length}):\n  ${conflicts.join('\n  ')}`);

function init({ project, tool }) {
  const tools = validateTools(tool); // if none chosen, files are set up for Claude Code and tool stays empty (/start asks)
  const projectDir = path.resolve(project ?? process.cwd());
  if (projectDir === ROOT) throw new Error('The target is the kit\'s own folder. Run from the project folder: node <kit>/kit/kit.mjs init');
  if (fs.existsSync(path.join(projectDir, '.kit.json'))) throw new Error('The kit is already installed in this project (.kit.json exists).');
  fs.mkdirSync(projectDir, { recursive: true });
  const conflicts = [];
  const { copies } = layers(ROOT, []);
  for (const [rel, source] of copies) safeCopy(projectDir, rel, source, conflicts);
  if (!fs.existsSync(path.join(projectDir, 'README.md'))) copy(path.join(KIT, 'project', 'README.md'), path.join(projectDir, 'README.md'));

  // If the kit is inside the project folder, keep it out of git
  const kitRel = path.relative(projectDir, ROOT).replace(/\\/g, '/');
  const inside = !kitRel.startsWith('..') && !path.isAbsolute(kitRel);
  if (inside) appendLine(path.join(projectDir, '.gitignore'), `${kitRel}/`);
  let git = 'existed';
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    git = spawnSync('git', ['init', '-q'], { cwd: projectDir }).status === 0 ? 'created' : 'could not create (is git installed?)';
  }

  // If the project has its own AGENTS.md, the kit rules are imported from .kit-new until /adopt step 4
  if (conflicts.includes('AGENTS.md') && !conflicts.includes('CLAUDE.md')) {
    const c = path.join(projectDir, 'CLAUDE.md');
    fs.writeFileSync(c, read(c).replace(/^@AGENTS\.md$/m, '@AGENTS.md.kit-new'));
  }
  const files = {};
  for (const rel of copies.keys()) if (!conflicts.includes(rel)) files[rel] = hash(path.join(projectDir, rel));
  installTools(projectDir, tools, files, conflicts);
  const today = new Date().toISOString().slice(0, 10);
  // type: null = kit installed, no type chosen yet (/start step 3 or /adopt)
  writeRecord(projectDir, { version: VERSION, source: SOURCE, kit: VIA_NPX ? `npx:tillerhand@${VERSION}` : inside ? kitRel : portableKit(projectDir, ROOT), type: null, addons: [], tool: tool.length ? tools : null, created: today, updated: today, files });

  console.log(`Kit ${VERSION} installed: ${projectDir} · tool: ${tool.length ? tools.join(', ') : 'none chosen (Claude Code files installed; /start and /adopt ask, use --tool for Codex/Antigravity)'}`);
  console.log(`Kit folder: ${VIA_NPX ? `npm package tillerhand@${VERSION}` : inside ? `${kitRel} (added to .gitignore)` : ROOT} · git repository: ${git}`);
  conflictReport(conflicts);
  console.log('Next step: Open this folder in a new session of your tool (so commands and hooks load). New project: /start [idea]; existing project: /adopt.');
  nextSteps(tools);
}

// Type layer for a project set up by init. Files init placed and the user did not change are overwritten,
// the project's own files are not (.kit-new).
function installIntoProject(projectDir, type, addons, tool) {
  const recordPath = path.join(projectDir, '.kit.json');
  if (!fs.existsSync(recordPath)) throw new Error(`.kit.json not found: run init first (node ${path.join(KIT, 'kit.mjs')} init).`);
  const j = JSON.parse(read(recordPath));
  if (j.type) throw new Error(`The kit is already installed in this project (type: ${j.type}).`);
  const files = { ...j.files };
  const conflicts = [];
  const { copies, patches } = layers(null, layerNames(type, addons));
  for (const [rel, source] of copies) {
    const target = path.join(projectDir, rel);
    if (fs.existsSync(target) && files[rel] === hash(target)) copy(source, target);
    else safeCopy(projectDir, rel, source, conflicts);
    if (!conflicts.includes(rel)) files[rel] = hash(target);
  }
  for (const p of patches) applyPatch(projectDir, p);
  const tools = tool.length ? validateTools(tool) : (j.tool ?? ['claude']);
  installTools(projectDir, tools, files, conflicts);
  writeRecord(projectDir, { ...j, kit: portableKit(projectDir, j.kit), version: VERSION, type, addons, tool: tool.length ? tools : (j.tool ?? null), updated: new Date().toISOString().slice(0, 10), files });
  console.log(`Installed: ${type}${addons.length ? ' + ' + addons.join(', ') : ''} (kit ${VERSION}) · ${projectDir}`);
  conflictReport(conflicts);
}

function install({ type, addons, keepKit, project, tool }) {
  validateType(type, addons);
  if (project && path.resolve(project) !== ROOT) return installIntoProject(path.resolve(project), type, addons, tool);
  const tools = validateTools(tool);
  if (fs.existsSync(path.join(ROOT, '.kit.json'))) throw new Error('The kit is already installed in this project (.kit.json exists).');
  // This folder is about to lose kit/, README.md and the kit-only files: uncommitted work there could not be brought back
  const st = spawnSync('git', ['status', '--porcelain', '--', '.'], { cwd: ROOT, encoding: 'utf8' });
  if (st.status === 0 && st.stdout.trim()) {
    throw new Error(`Uncommitted changes found; install deletes the kit/ folder and replaces README.md. Commit first or save with git stash:\n${st.stdout.trimEnd().split('\n').slice(0, 10).join('\n')}`);
  }

  const { copies, patches } = layers(null, layerNames(type, addons));
  for (const [rel, source] of copies) copy(source, path.join(ROOT, rel));
  for (const p of patches) applyPatch(ROOT, p);
  copy(path.join(KIT, 'project', 'README.md'), path.join(ROOT, 'README.md'));
  for (const rel of KIT_ONLY) fs.rmSync(path.join(ROOT, rel), { force: true });

  const tracked = new Set([...listFiles(ROOT, COMMON_EXCLUDE), ...copies.keys()]);
  const files = {};
  for (const rel of [...tracked].sort()) if (fs.existsSync(path.join(ROOT, rel))) files[rel] = hash(path.join(ROOT, rel));
  installTools(ROOT, tools, files, []);
  const today = new Date().toISOString().slice(0, 10);
  const lang = readLang(ROOT); // chosen by /start before install (.claude/state/lang.json); null if not
  writeRecord(ROOT, { version: VERSION, source: SOURCE, type, addons, tool: tool.length ? tools : null, ...(lang && { lang }), created: today, updated: today, files });

  console.log(`Installed: ${type}${addons.length ? ' + ' + addons.join(', ') : ''} (kit ${VERSION}) · tool: ${tools.join(', ')}`);
  console.log(`Files added/changed: ${copies.size + patches.length + 1}`);
  nextSteps(tools);
  if (!keepKit) {
    fs.rmSync(KIT, { recursive: true, force: true });
    console.log('kit/ folder removed. For updates: /kit-update');
  }
}

function update({ project, addons: newAddons, tool }) {
  project = path.resolve(project);
  const recordPath = path.join(project, '.kit.json');
  if (!fs.existsSync(recordPath)) throw new Error(`.kit.json not found: ${project} was not set up with the kit.`);
  const j = JSON.parse(read(recordPath));
  if (!j.type) throw new Error('.kit.json is in the old format (kit 2.x). It cannot be updated to this version automatically; see the 3.0.0 notes in kit/CHANGELOG.md.');
  const oldAddons = j.addons ?? [];
  const allAddons = [...new Set([...oldAddons, ...newAddons])];
  validateType(j.type, allAddons);
  const record = { ...j.files };

  const { copies, patches } = layers(ROOT, layerNames(j.type, allAddons));
  const report = { added: [], updated: [], conflicts: [], removed: [] };
  const addedAddons = newAddons.filter((e) => !oldAddons.includes(e)).map((e) => `addons/${e}`);
  const fromAddedAddon = (source) => addedAddons.some((a) => source.startsWith(path.join(TEMPLATES, a) + path.sep));

  for (const [rel, source] of copies) {
    const target = path.join(project, rel);
    const kitHash = hash(source);
    if (!fs.existsSync(target)) {
      if (rel in record) continue; // the user deleted it on purpose, do not bring it back
      copy(source, target); record[rel] = kitHash; report.added.push(rel);
      continue;
    }
    if (rel === '.claude/settings.json') {
      let local, migrated;
      try {
        local = JSON.parse(read(target));
        migrated = migrateSettings(local, JSON.parse(read(source)));
      } catch (e) { report.conflicts.push(`${rel} (permissions not added: ${e.message})`); continue; }
      if (JSON.stringify(migrated.settings) !== JSON.stringify(local)) {
        fs.writeFileSync(target, JSON.stringify(migrated.settings, null, 2) + '\n');
        const notes = [migrated.added.length && `added: ${migrated.added.join(' · ')}`, migrated.removed.length && `removed old lines: ${migrated.removed.join(' · ')}`].filter(Boolean);
        report.updated.push(`${rel} (${notes.join('; ') || 'hook flag'})`);
      }
      continue;
    }
    // A newly added addon meets a project file of the same name: same as install, the kit's copy waits as .kit-new
    if (!(rel in record) && fromAddedAddon(source)) {
      const before = report.conflicts.length;
      safeCopy(project, rel, source, report.conflicts);
      if (report.conflicts.length === before) record[rel] = hash(target);
      continue;
    }
    if (!isKitOwned(rel)) continue;
    const localHash = hash(target);
    if (localHash === kitHash) { record[rel] = kitHash; continue; }
    if (record[rel] === kitHash) continue; // the kit did not change, the user did
    if (record[rel] === localHash) { copy(source, target); record[rel] = kitHash; report.updated.push(rel); }
    else { copy(source, target + '.kit-new'); report.conflicts.push(rel); } // both changed: do not touch the user's
  }
  // append/merge only from newly added addons (old ones were applied at install; do not touch project files again)
  for (const p of patches) if (addedAddons.some((a) => p.layer === a || p.layer.startsWith(`${a}/types/`))) applyPatch(project, p);
  for (const rel of Object.keys(record)) if (!copies.has(rel) && isKitOwned(rel)) report.removed.push(rel);
  const tools = tool.length ? validateTools(tool) : (j.tool ?? ['claude']);
  installTools(project, tools, record, report.conflicts);

  const kit = portableKit(project, j.kit);
  if (kit !== j.kit) console.log(fs.existsSync(path.join(project, '.kit.local.json'))
    ? 'The kit folder path for this machine was moved from .kit.json to .kit.local.json (not in git).'
    : 'The kit folder path in .kit.json does not exist on this machine (written on another machine); removed. /start and /adopt ask for the kit folder.');
  writeRecord(project, { ...j, kit, version: VERSION, addons: allAddons, tool: tool.length ? tools : (j.tool ?? null), updated: new Date().toISOString().slice(0, 10), files: record });

  console.log(`Kit ${j.version} -> ${VERSION}`);
  const printList = (title, list) => list.length && console.log(`${title} (${list.length}):\n  ${list.join('\n  ')}`);
  printList('Added', report.added);
  printList('Updated', report.updated);
  printList('Conflict: your change was kept, the new version was placed beside it as .kit-new. Compare, merge, delete the .kit-new file', report.conflicts);
  printList('Removed from the kit (still in the project, delete if you want)', report.removed);
  if (!Object.values(report).some((l) => l.length)) console.log('No changes.');
  console.log(`Release notes: ${SOURCE.replace(/\.git$/, '')}/blob/main/kit/CHANGELOG.md (see the "Adapt by hand" items)`);
}

// The reverse of merge: what the kit merged in comes out, what the project added or changed stays.
// Arrays lose the kit's items (JSON equality); a key whose value equals the kit's is dropped; a key emptied this way is dropped.
export function unmerge(a, b) {
  const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (Array.isArray(a) && Array.isArray(b)) return a.filter((x) => !b.some((y) => same(x, y)));
  if (!isObject(a) || !isObject(b)) return a;
  const r = {};
  for (const [k, v] of Object.entries(a)) {
    if (k === '__proto__') continue; // as in merge: a JSON "__proto__" key would replace the result's prototype
    if (!Object.hasOwn(b, k)) { r[k] = v; continue; }
    if (same(v, b[k])) continue;
    const u = unmerge(v, b[k]);
    if ((Array.isArray(u) && !u.length) || (isObject(u) && !Object.keys(u).length)) continue;
    r[k] = u;
  }
  return r;
}

// Removes what the kit placed: a recorded file whose hash still matches goes, a changed one stays. settings.json and
// .env.example lose the kit's lines; .gitignore only loses the type's block (it keeps .env out of git). Without --yes it
// only lists. Nothing is committed: git checkout . brings the tracked files back.
async function remove({ project, yes }) {
  const projectDir = path.resolve(project ?? process.cwd());
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return p; } };
  if (real(projectDir).toLowerCase() === real(ROOT).toLowerCase()) throw new Error('The target is the kit\'s own folder; give the project with --project <path>.');
  const recordPath = path.join(projectDir, '.kit.json');
  if (!fs.existsSync(recordPath)) throw new Error(`.kit.json not found: ${projectDir} was not set up with the kit.`);
  const j = JSON.parse(read(recordPath));
  if (!j.files || typeof j.files !== 'object' || Array.isArray(j.files)) throw new Error('.kit.json has no files record; the kit cannot tell which files it placed.');
  if (yes) {
    // GIT_DIR and the like would answer for another repository; cwd is the kit's folder so no git.exe in the project is picked
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_/i.test(k)));
    const st = spawnSync('git', ['-C', projectDir, 'status', '--porcelain'], { cwd: KIT, env, encoding: 'utf8' });
    if (st.status !== 0) throw new Error('Not a git repository: --yes needs git so the removal can be undone. Run git init and commit first.');
    if (st.stdout.trim()) throw new Error('Uncommitted changes found. Commit first or save with git stash; the removal is then undone with git checkout .');
  }

  const realRoot = real(projectDir);
  const inside = (r) => r && r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r);
  const underGit = (r) => r.split(path.sep)[0].toLowerCase() === '.git';
  // A recorded path is data from the project: outside the root, under .git, a link or a path through a linked folder is skipped
  const safeTarget = (rel) => {
    if (typeof rel !== 'string' || path.isAbsolute(rel) || path.win32.isAbsolute(rel)) return null;
    const target = path.resolve(projectDir, rel);
    const r = path.relative(projectDir, target);
    if (!inside(r) || underGit(r)) return null;
    let st;
    try { st = fs.lstatSync(target); } catch { return { target, missing: true }; }
    // The real path catches a linked folder on the way and Windows aliases of .git (.git., GIT~1)
    const realRel = path.relative(realRoot, real(target));
    if (!st.isFile() || !inside(realRel) || underGit(realRel)) return null;
    return { target };
  };

  const notes = [];
  let copies, patches;
  try { ({ copies, patches } = layers(ROOT, j.type ? layerNames(j.type, j.addons ?? []) : [])); } catch {
    ({ copies, patches } = layers(ROOT, []));
    notes.push(`this kit has no template for ${j.type} + ${(j.addons ?? []).join(', ') || 'no add-ons'}; those files were judged by their record only`);
  }
  const plan = { remove: [], clean: [], changed: [], missing: [], unsafe: [] };
  const writes = new Map(); // rel -> new content (kit lines taken out)
  const lf = (s) => s.replace(/\r\n/g, '\n');
  const sha = (s) => crypto.createHash('sha256').update(lf(s)).digest('hex');
  const eol = (orig, text) => (orig.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text); // keep the file's line endings
  const appendTargets = [...new Set(patches.filter((p) => p.kind === 'append').map((p) => p.target))];
  const SETTINGS = '.claude/settings.json';
  // An append target the kit did not record (the project's own .env.example under /adopt) still got the kit's block
  for (const rel of [...new Set([...Object.keys(j.files), ...appendTargets])].filter((r) => r !== SETTINGS)) {
    const recorded = j.files[rel];
    const t = safeTarget(rel);
    if (!t) { plan.unsafe.push(rel); continue; }
    if (t.missing) { if (recorded) plan.missing.push(rel); continue; }
    if (rel === '.gitignore' || appendTargets.includes(rel)) {
      if (rel !== '.gitignore' && recorded && hash(t.target) === recorded) { plan.remove.push(rel); continue; }
      const orig = read(t.target);
      let text = lf(orig);
      for (const p of patches.filter((x) => x.kind === 'append' && x.target === rel)) {
        const block = lf(read(p.source));
        text = text.includes('\n' + block) ? text.replace('\n' + block, '') : text.replace(block, '');
      }
      if (rel !== '.gitignore' && recorded && sha(text) === recorded) plan.remove.push(rel);
      else if (text !== lf(orig)) { writes.set(rel, eol(orig, text)); plan.clean.push(rel); }
      else if (rel !== '.gitignore') plan.changed.push(rel);
      if (rel === '.gitignore') notes.push('.gitignore stays: it keeps .env and other secrets out of git; delete the kit\'s lines yourself if you want');
      continue;
    }
    // A Codex/Antigravity skill generated from the project's own command or skill belongs to the project
    const skill = rel.match(/^\.agents\/skills\/(.+)$/);
    if (skill) {
      const sources = [`.claude/skills/${skill[1]}`, ...(skill[1].endsWith('/SKILL.md') ? [`.claude/commands/${skill[1].slice(0, -'/SKILL.md'.length)}.md`] : [])];
      if (sources.some((s) => !(s in j.files) && fs.existsSync(path.join(projectDir, s)))) { plan.changed.push(`${rel} (made from your own command)`); continue; }
    }
    if (hash(t.target) === recorded) plan.remove.push(rel);
    else plan.changed.push(rel);
  }

  // settings.json last: a hook or rule that calls a script now leaving (an older kit's line, or one inside a group the user
  // edited) goes too, so no hook is left pointing at a deleted file
  if (SETTINGS in j.files) {
    const t = safeTarget(SETTINGS);
    if (!t) plan.unsafe.push(SETTINGS);
    else if (t.missing) plan.missing.push(SETTINGS);
    else {
      try {
        const kit = patches.filter((p) => p.kind === 'merge' && p.target === SETTINGS)
          .reduce((acc, p) => merge(acc, JSON.parse(read(p.source))), JSON.parse(read(copies.get(SETTINGS))));
        const left = unmerge(JSON.parse(read(t.target)), kit);
        const gone = (s) => typeof s === 'string' && [...s.matchAll(/\.claude\/hooks\/[\w.-]+/g)]
          .some(([m]) => plan.remove.includes(m) || !fs.existsSync(path.join(projectDir, m)));
        const kept = [];
        if (left.hooks && typeof left.hooks === 'object') {
          for (const [event, groups] of Object.entries(left.hooks)) {
            const g = (Array.isArray(groups) ? groups : []).map((x) => ({ ...x, hooks: (Array.isArray(x?.hooks) ? x.hooks : []).filter((h) => !gone(h?.command)) })).filter((x) => x.hooks.length);
            if (g.length) { left.hooks[event] = g; kept.push(...g.flatMap((x) => x.hooks.map((h) => `hooks.${event}: ${h.command}`))); } else delete left.hooks[event];
          }
          if (!Object.keys(left.hooks).length) delete left.hooks;
        }
        if (left.permissions && typeof left.permissions === 'object') {
          for (const k of Object.keys(left.permissions)) {
            if (!Array.isArray(left.permissions[k])) continue;
            left.permissions[k] = left.permissions[k].filter((r) => !gone(r));
            if (left.permissions[k].length) kept.push(...left.permissions[k].map((r) => `permissions.${k}: ${r}`)); else delete left.permissions[k];
          }
          if (!Object.keys(left.permissions).length) delete left.permissions;
        }
        if (gone(left.statusLine?.command)) delete left.statusLine;
        kept.push(...Object.keys(left).filter((k) => !['hooks', 'permissions'].includes(k)));
        if (!Object.keys(left).length) plan.remove.push(SETTINGS);
        else { writes.set(SETTINGS, JSON.stringify(left, null, 2) + '\n'); plan.clean.push(`${SETTINGS}, stays: ${kept.join(' · ')}`); }
      } catch { plan.changed.push(`${SETTINGS} (could not be read as JSON)`); }
    }
  }

  // Kit traces outside the record
  const toolFiles = new Set(TOOLS.filter((x) => x !== 'claude').flatMap((x) => listFiles(path.join(KIT, 'tools', x))));
  const readme = path.join(projectDir, 'README.md');
  if (!('README.md' in j.files) && fs.existsSync(readme) && fs.lstatSync(readme).isFile() && hash(readme) === hash(path.join(KIT, 'project', 'README.md'))) plan.remove.push('README.md');
  for (const rel of ['.kit.json', '.kit.local.json']) if (safeTarget(rel) && !safeTarget(rel).missing) plan.remove.push(rel);
  (function walk(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      // other worktrees keep their own files; links are not followed (a link is not a directory entry here)
      if (e.isDirectory() && !['.git', 'node_modules'].includes(e.name) && r !== '.claude/worktrees') walk(path.join(dir, e.name), r);
      else if (e.isFile() && e.name.endsWith('.kit-new')) {
        // Only the kit's own: the .kit-new of a kit file or a generated skill, never a project file that happens to end so
        const base = r.slice(0, -'.kit-new'.length);
        if ((copies.has(base) || Object.hasOwn(j.files, base) || toolFiles.has(base) || base.startsWith('.agents/skills/')) && safeTarget(r)) plan.remove.push(r);
      }
    }
  })(projectDir, '');
  const stateDir = path.join(projectDir, '.claude', 'state');
  const stateOk = fs.existsSync(stateDir) && !fs.lstatSync(path.join(projectDir, '.claude')).isSymbolicLink() && fs.lstatSync(stateDir).isDirectory();
  const stateCount = stateOk ? fs.readdirSync(stateDir, { recursive: true }).length : 0;
  const { approvalPath } = await import('../.claude/hooks/gate.mjs');
  const approval = approvalPath(projectDir);
  // Checked before anything goes, so the dry run and the real run say the same
  const claude = path.join(projectDir, 'CLAUDE.md');
  if (!plan.remove.includes('CLAUDE.md') && fs.existsSync(claude)) {
    const lost = [...read(claude).matchAll(/^@(\S+)$/gm)].map((m) => m[1]).filter((f) => plan.remove.includes(f));
    if (lost.length) notes.push(`CLAUDE.md stays and imports files that ${yes ? 'are' : 'will be'} gone: ${lost.join(', ')}`);
  }

  // Paths come from .kit.json and the AI reads this output: no control characters, no endless lines
  const show = (s) => String(s).replace(/[\x00-\x1f\x7f]/g, '?').slice(0, 300);
  const list = (title, items) => items.length && console.log(`${title} (${items.length}):\n  ${items.map(show).join('\n  ')}`);
  console.log(`Kit removal${yes ? '' : ' (dry run, nothing changed)'}: ${projectDir}`);
  list(yes ? 'Removed' : 'Will remove', [...plan.remove,
    ...(stateOk ? [`.claude/state/ (${stateCount} entries, git-ignored: git does not bring them back)`] : []),
    ...(fs.existsSync(approval) ? ['commit gate approval record (in your user folder)'] : [])]);
  list(yes ? 'Kit lines taken out' : 'Kit lines will be taken out', plan.clean);
  list('Kept: you changed these', plan.changed);
  list('Recorded but already gone', plan.missing);
  list('Skipped, unsafe path in .kit.json', plan.unsafe);

  if (yes) {
    for (const [rel, text] of writes) fs.writeFileSync(path.join(projectDir, rel), text);
    for (const rel of plan.remove) fs.rmSync(path.join(projectDir, rel), { force: true });
    if (stateOk) fs.rmSync(stateDir, { recursive: true, force: true });
    fs.rmSync(approval, { force: true });
    // Folders the removal emptied go, up to the root; a folder with anything left in it stays
    for (const rel of [...plan.remove, '.claude/state/x']) {
      for (let dir = path.dirname(path.join(projectDir, rel)); dir !== projectDir && inside(path.relative(projectDir, dir)); dir = path.dirname(dir)) {
        try { if (fs.readdirSync(dir).length) break; fs.rmdirSync(dir); } catch { break; }
      }
    }
  }

  if (typeof j.kit === 'string' && !path.isAbsolute(j.kit) && j.kit !== 'local' && !j.kit.startsWith('npx:')) notes.push(`the kit folder ${j.kit} inside the project is not removed; delete it yourself if you want`);
  for (const n of notes) console.log(`Note: ${show(n)}`);
  if (yes) console.log('Nothing was committed: see it with git status, undo it with git checkout . (git-ignored kit state such as .claude/state/ does not come back). Restart open sessions (their hooks are gone).');
  else console.log('Run again with --yes to remove (needs a clean git tree).');
}

function parseArgs(argv) {
  const a = { addons: [], tool: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--type') a.type = argv[++i];
    else if (k === '--project') a.project = argv[++i];
    else if (k === '--addons') a.addons = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--tool') a.tool = argv[++i].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    else if (k === '--keep-kit') a.keepKit = true;
    else if (k === '--yes') a.yes = true;
    else throw new Error(`Unknown argument: ${k}`);
  }
  return a;
}

function nextSteps(tools) {
  if (tools.includes('codex')) console.log('Codex: commands are called as skills ($start, $build or /skills). For hooks, trust the project folder and approve the kit\'s hooks with /hooks.');
  if (tools.includes('antigravity')) console.log('Antigravity: commands are called as skills with /start, /build... Hooks load from .agents/hooks.json.');
}

// Asks in the terminal when --tool is not given; non-interactive runs (tests, CI) assume Claude Code.
async function askTools() {
  if (!process.stdin.isTTY) return [];
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const c = await rl.question('Which tool will you use? 1) Claude Code  2) Codex  3) Antigravity (comma-separated for several, e.g. 1,2) [1]: ');
  rl.close();
  return c.split(',').map((s) => TOOLS[Number(s.trim()) - 1] ?? s.trim().toLowerCase()).filter(Boolean);
}

// Real paths: npx starts the CLI through a link (node_modules/.bin/tillerhand), while import.meta.url is the target
const realArg = () => { try { return fs.realpathSync(process.argv[1]); } catch { return ''; } };
if (process.argv[1] && realArg() === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    const a = parseArgs(rest);
    if (command === 'init') init({ ...a, tool: a.tool.length ? a.tool : await askTools() });
    else if (command === 'install') {
      if (!a.type) throw new Error(`--type required: ${TYPES.join(' | ')}`);
      install(a);
    } else if (command === 'update') {
      if (!a.project) throw new Error('--project required');
      update(a);
    } else if (command === 'remove') {
      if (!a.project) throw new Error('--project required');
      await remove(a);
    } else {
      console.log('Usage:\n  node kit/kit.mjs install --type <type> [--addons ai,tr] [--keep-kit] [--project <path>] [--tool claude,codex,antigravity]\n  node <kit>/kit/kit.mjs init [--project <path>] [--tool claude,codex,antigravity]\n  node kit/kit.mjs update --project <path> [--addons ai,tr] [--tool ...]\n  node <kit>/kit/kit.mjs remove --project <path> [--yes]');
      process.exit(command ? 1 : 0);
    }
  } catch (e) {
    console.error('ERROR: ' + e.message);
    process.exit(1);
  }
}
