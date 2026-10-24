#!/usr/bin/env node
// Context packages: non-core plugins ship disabled in the project settings and are enabled in personal settings (settings.local.json) when needed.
//   node .claude/hooks/tools.mjs                       package status
//   node .claude/hooks/tools.mjs --enable <package>    enables the package on this machine (then /reload-plugins)
//   node .claude/hooks/tools.mjs --disable <package>   deletes the personal override, back to the project default
//   node .claude/hooks/tools.mjs --required <package>  0 if enabled, 2 if disabled (commands call it in their first step)
//   node .claude/hooks/tools.mjs --measure             skill and agent description load of installed plugins
// Why: the skill list is capped at 1% of the context; past that, descriptions drop and skills get missed. Plugin skills cannot
// be turned off one by one, a plugin is on or off as a whole. Enabling mid-session breaks the prompt cache: best at a phase boundary, with /clear.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { missingPlugins } from './plugins-sync.mjs';

// Keys are the package names users type (/tools ac tasarim): they stay Turkish
export const PACKAGES = {
  tasarim: {
    description: 'Stil yönleri, palet ve yazı tipi, GSAP',
    command: '/design',
    plugins: ['taste-skill@taste-skill', 'ui-ux-pro-max@ui-ux-pro-max-skill', 'gsap-skills@gsap-skills'],
  },
  guvenlik: {
    description: 'Derin güvenlik taraması',
    command: '/findings-security, /release',
    plugins: ['differential-review', 'insecure-defaults', 'sharp-edges', 'static-analysis', 'supply-chain-risk-auditor', 'agentic-actions-auditor', 'fp-check']
      .map((e) => `${e}@trailofbits`).concat('claude-security@claude-plugins-official'),
  },
  yayin: {
    description: 'İnsan için kod haritası, oturum raporu',
    command: '/release, /handoff, /adopt',
    plugins: ['understand-anything@understand-anything', 'session-report@claude-plugins-official'],
  },
  video: { description: 'Remotion ile video', command: 'motion-video', plugins: ['remotion@remotion'] },
};

const settingsPaths = (root) => ({ project: path.join(root, '.claude', 'settings.json'), local: path.join(root, '.claude', 'settings.local.json') });

function readJson(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {
    throw new Error(`${p} geçerli JSON değil; düzeltmeden paket değiştirilemez.`);
  }
}

function pkg(name) {
  if (!Object.hasOwn(PACKAGES, name ?? '')) throw new Error(`Bilinmeyen paket: ${name}. Seçenekler: ${Object.keys(PACKAGES).join(', ')}`);
  return PACKAGES[name];
}

export function packageStatus(root) {
  const sp = settingsPaths(root);
  const project = readJson(sp.project).enabledPlugins ?? {};
  const local = readJson(sp.local).enabledPlugins ?? {};
  return Object.entries(PACKAGES).map(([name, p]) => {
    const ids = p.plugins.filter((id) => id in project); // a plugin not in this project's type does not count
    return { name, ...p, plugins: ids, enabled: ids.length > 0 && ids.every((id) => (local[id] ?? project[id]) !== false) };
  });
}

// Touches only plugins defined in the project. A value equal to the project default is not written; the override is deleted.
export function setPackage(root, name, enabled) {
  const p = pkg(name);
  const sp = settingsPaths(root);
  const project = readJson(sp.project).enabledPlugins ?? {};
  const local = readJson(sp.local);
  const ep = { ...(local.enabledPlugins ?? {}) };
  const ids = p.plugins.filter((id) => id in project);
  for (const id of ids) {
    if ((project[id] !== false) === enabled) delete ep[id];
    else ep[id] = enabled;
  }
  fs.writeFileSync(sp.local, JSON.stringify({ ...local, enabledPlugins: ep }, null, 2) + '\n');
  return ids;
}

const configDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
function installRecords() {
  try { return JSON.parse(fs.readFileSync(path.join(configDir(), 'plugins', 'installed_plugins.json'), 'utf8')).plugins ?? {}; } catch { return {}; }
}

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') walk(p, out); } else out.push(p);
  }
  return out;
}
const descLength = (md) => {
  const fm = md.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Math.min(1536, fm.match(/^description:\s*([\s\S]*?)(?=\n[\w-]+:|$)/m)?.[1].length ?? 0); // the list cuts at 1536 characters
};

// shortcut: token ≈ characters/4 and when_to_use is not counted; for the exact value use /context or /doctor.
export function measure() {
  return Object.entries(installRecords()).map(([id, record]) => {
    const dir = [record].flat().map((k) => k?.installPath).find((p) => p && fs.existsSync(p));
    if (!dir) return { id, skill: 0, skillTokens: 0, agentTokens: 0 };
    const files = walk(dir).map((p) => path.relative(dir, p));
    const skill = files.filter((p) => /(^|[\\/])SKILL\.md$/.test(p) && !/(^|[\\/])(\.claude|tests?|examples?|upstream)[\\/]/.test(p));
    const agent = files.filter((p) => /(^|[\\/])agents[\\/][^\\/]+\.md$/.test(p) && !/(^|[\\/])\.claude[\\/]/.test(p));
    const top = (list) => Math.round(list.reduce((s, p) => s + descLength(fs.readFileSync(path.join(dir, p), 'utf8')), 0) / 4);
    return { id, skill: skill.length, skillTokens: top(skill), agentTokens: top(agent) };
  });
}

const installedList = () => Object.entries(installRecords()).flatMap(([id, k]) => [k].flat().map((e) => ({ id, scope: e?.scope, projectPath: e?.projectPath })));
const tokenOf = (measurement, ids) => {
  const found = measurement.filter((o) => ids.includes(o.id));
  return found.length ? `~${found.reduce((s, o) => s + o.skillTokens + o.agentTokens, 0)} token` : '? token (kurulu değil)';
};
const NOTE = 'Açtıktan sonra /reload-plugins. Oturum ortasında açmak prompt önbelleğini bozar; en iyisi faz sınırında, /clear ile.';
// Flags before 3.15.0; still accepted with a warning, remove in 3.16.0
const OLD_FLAGS = { '--ac': '--enable', '--kapat': '--disable', '--gerekli': '--required', '--olc': '--measure' };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const [arg, name] = process.argv.slice(2);
  const flag = OLD_FLAGS[arg] ?? arg;
  if (OLD_FLAGS[arg]) console.error(`Uyarı: ${arg} eski bayrak; yenisi ${flag}. 3.16.0'da kalkacak.`);
  try {
    if (flag === '--enable' || flag === '--disable') {
      const ids = setPackage(root, name, flag === '--enable');
      if (!ids.length) { console.log(`${name} paketinin eklentisi bu projede tanımlı değil; değişiklik yok.`); process.exit(0); }
      console.log(`${name} paketi ${flag === '--enable' ? 'açıldı' : 'proje varsayılanına döndü'} (.claude/settings.local.json): ${ids.join(', ')}`);
      const missing = missingPlugins(Object.fromEntries(ids.map((id) => [id, true])), installedList(), root).map((e) => e.id);
      if (flag === '--enable' && missing.length) console.log(`Kurulu değil: ${missing.join(', ')}. Kullanıcıya sor, onaylarsa: node .claude/hooks/plugins-sync.mjs --install`);
      console.log(NOTE);
    } else if (flag === '--required') {
      pkg(name);
      const d = packageStatus(root).find((x) => x.name === name);
      if (!d.plugins.length) { console.log(`${name} paketi bu projede yok; adımı atla.`); process.exit(0); }
      if (d.enabled) { console.log(`${name} paketi açık.`); process.exit(0); }
      console.log(`${name} paketi kapalı (${tokenOf(measure(), d.plugins)}/oturum: ${d.plugins.join(', ')}). ` +
        `Kullanıcıya sor; onaylarsa: node .claude/hooks/tools.mjs --enable ${name}, sonra /reload-plugins. Reddederse adımı paketsiz yap.`);
      process.exit(2);
    } else if (flag === '--measure') {
      const project = readJson(settingsPaths(root).project).enabledPlugins ?? {};
      const effective = { ...project, ...(readJson(settingsPaths(root).local).enabledPlugins ?? {}) };
      const packageOf = (id) => Object.keys(PACKAGES).find((a) => PACKAGES[a].plugins.includes(id)) ?? (id in project ? 'çekirdek' : '-');
      const rows = measure().map((o) => ({ plugin: o.id, pkg: packageOf(o.id), enabled: effective[o.id] === true, skill: o.skill, descTokens: o.skillTokens, agentTokens: o.agentTokens }))
        .sort((a, b) => b.descTokens + b.agentTokens - a.descTokens - a.agentTokens);
      // Table headers are shown to the user: Turkish
      console.table(rows.map((r) => ({ eklenti: r.plugin, paket: r.pkg, açık: r.enabled, skill: r.skill, açıklamaTok: r.descTokens, ajanTok: r.agentTokens })));
      const top = (l) => l.reduce((s, r) => s + r.descTokens + r.agentTokens, 0);
      console.log(`Açık eklentiler: ~${top(rows.filter((r) => r.enabled))} token · hepsi açık olsaydı: ~${top(rows)} token. Kesin değer: /context, /doctor.`);
    } else if (!flag) {
      const state = packageStatus(root);
      const project = readJson(settingsPaths(root).project).enabledPlugins ?? {};
      const packaged = new Set(Object.values(PACKAGES).flatMap((p) => p.plugins));
      console.log(`Çekirdek (hep açık): ${Object.keys(project).filter((id) => project[id] !== false && !packaged.has(id)).join(', ') || '-'}`);
      const measurement = measure();
      for (const d of state.filter((x) => x.plugins.length)) {
        console.log(`  ${d.name.padEnd(9)} ${d.enabled ? 'açık  ' : 'kapalı'}  ${tokenOf(measurement, d.plugins).padEnd(24)} ${d.command} · ${d.description}`);
      }
      console.log(NOTE);
    } else {
      console.error('Kullanım: tools.mjs [--enable <paket> | --disable <paket> | --required <paket> | --measure]');
      process.exit(1);
    }
  } catch (h) {
    console.error(h.message);
    process.exit(1);
  }
}
