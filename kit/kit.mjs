#!/usr/bin/env node
// Vibe Coding Kit: install and update.
//   node kit/kit.mjs install --type web-saas [--addons ai] [--keep-kit]
//       In a project opened from the template, places the type and addons, then deletes the kit/ folder. Run by /start.
//   node <kit-klonu>/kit/kit.mjs init [--project <yol>] [--tool claude,codex,antigravity]
//       Installs the kit from a separate folder into a project (default: the current folder). Does not touch the kit folder.
//       Without --tool it asks in the terminal (default claude).
//       In a non-empty folder it does not overwrite existing files: the kit's version goes beside them as .kit-new (/adopt merges).
//   node <kit-klonu>/kit/kit.mjs install --type web-saas --project <yol>
//       Places the type into a project set up by init. Run by /start and /adopt.
//   node <kit-klonu>/kit/kit.mjs update --project <yol> [--addons ai]
//       Brings the project to this kit version. Run by /kit-update.
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
const COMMON_EXCLUDE = new Set(['.git', 'kit', 'node_modules', '.kit.json', 'README.md', 'dashboard.html', '.previews', 'sandbox', '.calisma', '.impeccable', 'CLAUDE.local.md']);
// Files that only make sense in the kit repo and are not carried into projects
const KIT_ONLY = ['.github/workflows/kit-tests.yml'];

// Files the kit owns: on update they are replaced if the user has not changed them.
// The rest belong to the project (CLAUDE.md, PRD, stack, settings.json...); the update only adds them if missing.
const KIT_OWNED = [
  /^\.claude\/(commands|agents|hooks|board|findings|skills)\//,
  /^docs\/(security\/checklist|operations\/(release-checklist|maintenance)|legal\/privacy-kvkk|workflow\/(decision-protocol|skills|usage-limits))\.md$/,
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
      else if (!KIT_ONLY.includes(r)) result.push(r);
    }
  })(root, '');
  return result;
}

// copies: target relative path -> source file. patches: append/merge operations (applied in order).
function layers(commonRoot, names) {
  const copies = new Map();
  const patches = [];
  if (commonRoot) for (const rel of listFiles(commonRoot, COMMON_EXCLUDE)) copies.set(rel, path.join(commonRoot, rel));
  for (const name of names) {
    const root = path.join(TEMPLATES, name);
    if (!fs.existsSync(root)) throw new Error(`Şablon katmanı yok: ${name}`);
    for (const rel of listFiles(root)) {
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
    for (const [k, v] of Object.entries(b)) r[k] = k in a ? merge(a[k], v) : v;
    return r;
  }
  return b;
}

// settings.json belongs to the project and is not replaced on update, but the kit's permission rules must reach it:
// missing allow/ask/deny rules are added (the project's own rules stay), and hook flags renamed in 3.15.0 are rewritten
// so the old and new hook entries do not both run.
// Returns { settings, added: ['ask: Bash(...)', ...] }; throws on a shape it cannot merge safely (the caller reports it).
export function migrateSettings(projectSettings, kitSettings) {
  const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObject(projectSettings)) throw new Error('kök bir nesne değil');
  const s = structuredClone(projectSettings);
  if (s.permissions !== undefined && !isObject(s.permissions)) throw new Error('permissions bir nesne değil');
  const added = [];
  for (const k of ['allow', 'ask', 'deny']) {
    const list = s.permissions?.[k];
    if (list !== undefined && !Array.isArray(list)) throw new Error(`permissions.${k} bir dizi değil`);
    const have = new Set(list ?? []);
    const add = (kitSettings.permissions?.[k] ?? []).filter((r) => !have.has(r));
    if (add.length) (s.permissions ??= {})[k] = [...(list ?? []), ...add];
    added.push(...add.map((r) => `${k}: ${r}`));
  }
  for (const groups of Object.values(isObject(s.hooks) ? s.hooks : {})) {
    for (const h of (Array.isArray(groups) ? groups : []).flatMap((g) => (Array.isArray(g?.hooks) ? g.hooks : []))) {
      if (typeof h?.command === 'string') h.command = h.command.replace(/(dashboard\.mjs"?)\s+--sessiz\b/, '$1 --quiet');
    }
  }
  return { settings: s, added };
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

function validateTools(tools) {
  for (const a of tools) if (!TOOLS.includes(a)) throw new Error(`Geçersiz araç: ${a}. Seçenekler: ${TOOLS.join(', ')}`);
  return tools.length ? tools : ['claude'];
}

// Command -> skill: Codex and Antigravity call commands as skills ($start, /start).
export function commandToSkill(name, md) {
  const m = md.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const field = (k) => m?.[1].match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1].trim() ?? '';
  const hint = field('argument-hint');
  return `---\nname: ${name}\ndescription: ${JSON.stringify(field('description') || name)}\n---\n\n` +
    `<!-- Kit üretir (kit.mjs): düzenleme .claude/commands/${name}.md dosyasında yapılır, bu kopya güncellemede yenilenir. -->\n` +
    `$ARGUMENTS = kullanıcının bu skill'i çağırırken yazdığı metin (yoksa boş)${hint ? `. Beklenen: ${hint}` : ''}.\n\n` +
    (m ? m[2] : md);
}

// Files for the chosen tools. Skill copies and hooks.json follow the same rule as isKitOwned on update: refreshed if the
// user has not changed them, .kit-new if changed (or the project's own file); a hook config the user deleted does not come back.
function installTools(projectDir, tools, files, conflicts) {
  const others = tools.filter((a) => a !== 'claude');
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
  if (!TYPES.includes(typeName)) throw new Error(`Geçersiz tip: ${typeName}. Seçenekler: ${TYPES.join(', ')}`);
  for (const e of addonNames) if (!ADDONS.includes(e)) throw new Error(`Geçersiz ek: ${e}. Seçenekler: ${ADDONS.join(', ')}`);
}

const conflictReport = (conflicts) => conflicts.length && console.log(
  `Mevcut dosyaya dokunulmadı, kitin hali yanına .kit-new olarak kondu (${conflicts.length}):\n  ${conflicts.join('\n  ')}`);

function init({ project, tool }) {
  const tools = validateTools(tool); // if none chosen, files are set up for Claude Code and tool stays empty (/start asks)
  const projectDir = path.resolve(project ?? process.cwd());
  if (projectDir === ROOT) throw new Error('Hedef kitin kendi klasörü. Proje klasöründen çalıştır: node <kit>/kit/kit.mjs init');
  if (fs.existsSync(path.join(projectDir, '.kit.json'))) throw new Error('Kit bu projede zaten kurulu (.kit.json var).');
  fs.mkdirSync(projectDir, { recursive: true });
  const conflicts = [];
  const { copies } = layers(ROOT, []);
  for (const [rel, source] of copies) safeCopy(projectDir, rel, source, conflicts);
  if (!fs.existsSync(path.join(projectDir, 'README.md'))) copy(path.join(KIT, 'project', 'README.md'), path.join(projectDir, 'README.md'));

  // If the kit is inside the project folder, keep it out of git
  const kitRel = path.relative(projectDir, ROOT).replace(/\\/g, '/');
  const inside = !kitRel.startsWith('..') && !path.isAbsolute(kitRel);
  if (inside) appendLine(path.join(projectDir, '.gitignore'), `${kitRel}/`);
  let git = 'vardı';
  if (!fs.existsSync(path.join(projectDir, '.git'))) {
    git = spawnSync('git', ['init', '-q'], { cwd: projectDir }).status === 0 ? 'açıldı' : 'açılamadı (git kurulu mu?)';
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
  writeRecord(projectDir, { version: VERSION, source: SOURCE, kit: inside ? kitRel : ROOT, type: null, addons: [], tool: tool.length ? tools : null, created: today, updated: today, files });

  console.log(`Kit ${VERSION} kuruldu: ${projectDir} · araç: ${tool.length ? tools.join(', ') : 'seçilmedi (Claude Code dosyaları kuruldu; /start ve /adopt sorar, Codex/Antigravity için --tool)'}`);
  console.log(`Kit klasörü: ${inside ? `${kitRel} (.gitignore'a eklendi)` : ROOT} · git deposu: ${git}`);
  conflictReport(conflicts);
  console.log('Sonraki adım: Bu klasörü aracında yeni oturumla aç (komutlar ve hook\'lar yüklensin). Yeni projede /start [fikir], var olan projede /adopt.');
  nextSteps(tools);
}

// Type layer for a project set up by init. Files init placed and the user did not change are overwritten,
// the project's own files are not (.kit-new).
function installIntoProject(projectDir, type, addons, tool) {
  const recordPath = path.join(projectDir, '.kit.json');
  if (!fs.existsSync(recordPath)) throw new Error(`.kit.json yok: önce init çalıştır (node ${path.join(KIT, 'kit.mjs')} init).`);
  const j = JSON.parse(read(recordPath));
  if (j.type) throw new Error(`Kit bu projede zaten kurulu (tip: ${j.type}).`);
  const files = { ...j.files };
  const conflicts = [];
  const { copies, patches } = layers(null, [type, ...addons.map((e) => `addons/${e}`)]);
  for (const [rel, source] of copies) {
    const target = path.join(projectDir, rel);
    if (fs.existsSync(target) && files[rel] === hash(target)) copy(source, target);
    else safeCopy(projectDir, rel, source, conflicts);
    if (!conflicts.includes(rel)) files[rel] = hash(target);
  }
  for (const p of patches) applyPatch(projectDir, p);
  const tools = tool.length ? validateTools(tool) : (j.tool ?? ['claude']);
  installTools(projectDir, tools, files, conflicts);
  writeRecord(projectDir, { ...j, version: VERSION, type, addons, tool: tool.length ? tools : (j.tool ?? null), updated: new Date().toISOString().slice(0, 10), files });
  console.log(`Kuruldu: ${type}${addons.length ? ' + ' + addons.join(', ') : ''} (kit ${VERSION}) · ${projectDir}`);
  conflictReport(conflicts);
}

function install({ type, addons, keepKit, project, tool }) {
  validateType(type, addons);
  if (project && path.resolve(project) !== ROOT) return installIntoProject(path.resolve(project), type, addons, tool);
  const tools = validateTools(tool);
  if (fs.existsSync(path.join(ROOT, '.kit.json'))) throw new Error('Kit bu projede zaten kurulu (.kit.json var).');

  const { copies, patches } = layers(null, [type, ...addons.map((e) => `addons/${e}`)]);
  for (const [rel, source] of copies) copy(source, path.join(ROOT, rel));
  for (const p of patches) applyPatch(ROOT, p);
  copy(path.join(KIT, 'project', 'README.md'), path.join(ROOT, 'README.md'));
  for (const rel of KIT_ONLY) fs.rmSync(path.join(ROOT, rel), { force: true });

  const izlenen = new Set([...listFiles(ROOT, COMMON_EXCLUDE), ...copies.keys()]);
  const files = {};
  for (const rel of [...izlenen].sort()) if (fs.existsSync(path.join(ROOT, rel))) files[rel] = hash(path.join(ROOT, rel));
  installTools(ROOT, tools, files, []);
  const today = new Date().toISOString().slice(0, 10);
  writeRecord(ROOT, { version: VERSION, source: SOURCE, type, addons, tool: tool.length ? tools : null, created: today, updated: today, files });

  console.log(`Kuruldu: ${type}${addons.length ? ' + ' + addons.join(', ') : ''} (kit ${VERSION}) · araç: ${tools.join(', ')}`);
  console.log(`Eklenen/değişen dosya: ${copies.size + patches.length + 1}`);
  nextSteps(tools);
  if (!keepKit) {
    fs.rmSync(KIT, { recursive: true, force: true });
    console.log('kit/ klasörü kaldırıldı. Güncellemeler için: /kit-update');
  }
}

function update({ project, addons: newAddons, tool }) {
  project = path.resolve(project);
  const recordPath = path.join(project, '.kit.json');
  if (!fs.existsSync(recordPath)) throw new Error(`.kit.json yok: ${project} kit ile kurulmamış.`);
  const j = JSON.parse(read(recordPath));
  if (!j.type) throw new Error('.kit.json eski biçimde (kit 2.x). Bu sürüme otomatik güncellenemez; kit/CHANGELOG.md → 3.0.0 notlarına bak.');
  const oldAddons = j.addons ?? [];
  const allAddons = [...new Set([...oldAddons, ...newAddons])];
  validateType(j.type, allAddons);
  const record = { ...j.files };

  const { copies, patches } = layers(ROOT, [j.type, ...allAddons.map((e) => `addons/${e}`)]);
  const report = { added: [], updated: [], conflicts: [], removed: [] };

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
      } catch (e) { report.conflicts.push(`${rel} (izinler eklenmedi: ${e.message})`); continue; }
      if (JSON.stringify(migrated.settings) !== JSON.stringify(local)) {
        fs.writeFileSync(target, JSON.stringify(migrated.settings, null, 2) + '\n');
        report.updated.push(`${rel}${migrated.added.length ? ` (eklenen izin kuralları: ${migrated.added.join(' · ')})` : ' (hook bayrağı)'}`);
      }
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
  const addedAddons = newAddons.filter((e) => !oldAddons.includes(e)).map((e) => `addons/${e}`);
  for (const p of patches) if (addedAddons.includes(p.layer)) applyPatch(project, p);
  for (const rel of Object.keys(record)) if (!copies.has(rel) && isKitOwned(rel)) report.removed.push(rel);
  const tools = tool.length ? validateTools(tool) : (j.tool ?? ['claude']);
  installTools(project, tools, record, report.conflicts);

  writeRecord(project, { ...j, version: VERSION, addons: allAddons, tool: tool.length ? tools : (j.tool ?? null), updated: new Date().toISOString().slice(0, 10), files: record });

  console.log(`Kit ${j.version} -> ${VERSION}`);
  const printList = (title, list) => list.length && console.log(`${title} (${list.length}):\n  ${list.join('\n  ')}`);
  printList('Eklenen', report.added);
  printList('Güncellenen', report.updated);
  printList('Çakışma: senin değişikliğin korundu, yeni hali yanına .kit-new olarak kondu. Karşılaştır, birleştir, .kit-new dosyasını sil', report.conflicts);
  printList('Kitten kaldırılmış (projede duruyor, istersen sil)', report.removed);
  if (!Object.values(report).some((l) => l.length)) console.log('Değişiklik yok.');
  console.log(`Sürüm notları: ${SOURCE.replace(/\.git$/, '')}/blob/main/kit/CHANGELOG.md ("Elle uyarla" maddelerine bak)`);
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
    else throw new Error(`Bilinmeyen argüman: ${k}`);
  }
  return a;
}

function nextSteps(tools) {
  if (tools.includes('codex')) console.log('Codex: komutlar skill olarak çağrılır ($start, $build ya da /skills). Hook\'lar için proje klasörüne güven ve /hooks ile kitin hook\'larını onayla.');
  if (tools.includes('antigravity')) console.log('Antigravity: komutlar skill olarak /start, /build... ile çağrılır. Hook\'lar .agents/hooks.json\'dan yüklenir.');
}

// Asks in the terminal when --tool is not given; non-interactive runs (tests, CI) assume Claude Code.
async function askTools() {
  if (!process.stdin.isTTY) return [];
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const c = await rl.question('Hangi araçla çalışacaksın? 1) Claude Code  2) Codex  3) Antigravity (birden fazlaysa virgülle, örn. 1,2) [1]: ');
  rl.close();
  return c.split(',').map((s) => TOOLS[Number(s.trim()) - 1] ?? s.trim().toLowerCase()).filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    const a = parseArgs(rest);
    if (command === 'init') init({ ...a, tool: a.tool.length ? a.tool : await askTools() });
    else if (command === 'install') {
      if (!a.type) throw new Error(`--type gerekli: ${TYPES.join(' | ')}`);
      install(a);
    } else if (command === 'update') {
      if (!a.project) throw new Error('--project gerekli');
      update(a);
    } else {
      console.log('Kullanım:\n  node kit/kit.mjs install --type <type> [--addons ai] [--keep-kit] [--project <yol>] [--tool claude,codex,antigravity]\n  node <kit>/kit/kit.mjs init [--project <yol>] [--tool claude,codex,antigravity]\n  node kit/kit.mjs update --project <yol> [--addons ai] [--tool ...]');
      process.exit(command ? 1 : 0);
    }
  } catch (e) {
    console.error('HATA: ' + e.message);
    process.exit(1);
  }
}
