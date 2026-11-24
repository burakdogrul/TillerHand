#!/usr/bin/env node
// Model tiers for the kit's agents when the kit runs in Antigravity (docs/workflow/models.md).
// Antigravity takes only a tier per subagent (.agents/agents/<name>.md, model: inherit | flash | pro); a named model cannot be set. Source: antigravity.google/docs/subagents (2026-11-24).
// node .claude/hooks/antigravity-agents.mjs --show | --set test-writer=pro code-reviewer=flash
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain } from './shared.mjs';

export const TIERS = ['inherit', 'flash', 'pro'];
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const LABELS = { pro: 'Pro (Antigravity)', flash: 'Flash (Antigravity)', inherit: 'Main session model (Antigravity)' };

// Antigravity sets this in the agent's shell (measured on agy 1.5.16)
export const isAntigravity = (env = process.env) => env.ANTIGRAVITY_AGENT === '1';
export const tierLabel = (tier) => LABELS[tier] ?? LABELS.inherit;
export const defaultTier = (model) => ({ opus: 'pro', sonnet: 'pro', fable: 'pro', haiku: 'flash' }[model] ?? 'inherit');

// { head: frontmatter lines, eol, rest: text after the closing ---, startLen } or null
function splitFrontmatter(text) {
  const m = text.match(/^---(\r?\n)([\s\S]*?)\r?\n---(?=\r?\n|$)/);
  if (!m) return null;
  return { eol: m[1], head: m[2].split(/\r?\n/), rest: text.slice(m[0].length) };
}

const claudeFile = (root, name) => path.join(root, '.claude', 'agents', `${name}.md`);
const agentFile = (root, name) => path.join(root, '.agents', 'agents', `${name}.md`);

export function setAgentTier(root, name, tier) {
  if (typeof root !== 'string' || !root) return { ok: false, message: 'No project root' };
  if (typeof name !== 'string' || !NAME.test(name) || !fs.existsSync(claudeFile(root, name))) return { ok: false, message: `Unknown agent: ${String(name).slice(0, 64)}` };
  if (!TIERS.includes(tier)) return { ok: false, message: `The tier must be one of: ${TIERS.join(', ')}` };
  const file = agentFile(root, name);
  try {
    if (!fs.existsSync(file)) {
      const source = splitFrontmatter(fs.readFileSync(claudeFile(root, name), 'utf8'));
      if (!source) return { ok: false, message: `.claude/agents/${name}.md has no frontmatter` };
      const keep = source.head.filter((l) => /^(name|description):/.test(l));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `---${source.eol}${[...keep, `model: ${tier}`].join(source.eol)}${source.eol}---${source.rest}`);
      return { ok: true, file };
    }
    const text = fs.readFileSync(file, 'utf8');
    const parts = splitFrontmatter(text);
    if (!parts) return { ok: false, message: `.agents/agents/${name}.md has no frontmatter; it was not changed` };
    const i = parts.head.findIndex((l) => /^model:/.test(l));
    if (i < 0) parts.head.push(`model: ${tier}`); else parts.head[i] = `model: ${tier}`;
    fs.writeFileSync(file, `---${parts.eol}${parts.head.join(parts.eol)}${parts.eol}---${parts.rest}`);
    return { ok: true, file };
  } catch (e) {
    return { ok: false, message: `Could not write .agents/agents/${name}.md: ${e.message}` };
  }
}

export function showAgents(root) {
  let names = [];
  try { names = fs.readdirSync(path.join(root, '.claude', 'agents')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).filter((n) => NAME.test(n)).sort(); } catch { /* no agents */ }
  return names.map((name) => {
    let tier = 'inherit';
    try {
      const parts = splitFrontmatter(fs.readFileSync(agentFile(root, name), 'utf8'));
      const line = parts?.head.find((l) => /^model:/.test(l));
      const value = line?.slice(6).trim();
      if (TIERS.includes(value)) tier = value;
    } catch { /* no Antigravity file yet */ }
    return { name, tier, label: tierLabel(tier) };
  });
}

if (isMain(import.meta.url)) {
  const [mode, ...pairs] = process.argv.slice(2);
  const root = findRoot();
  if (mode === '--show') {
    for (const a of showAgents(root)) console.log(`${a.name}: ${a.label}`);
  } else if (mode === '--set' && pairs.length) {
    let failed = false;
    for (const pair of pairs) {
      const i = pair.indexOf('=');
      const r = i < 0 ? { ok: false, message: `Expected <agent>=<tier>: ${pair.slice(0, 80)}` } : setAgentTier(root, pair.slice(0, i), pair.slice(i + 1));
      if (r.ok) console.log(`${pair.slice(0, i)}: ${tierLabel(pair.slice(i + 1))}`); else { failed = true; console.error(r.message); }
    }
    process.exit(failed ? 1 : 0);
  } else {
    console.error('Usage: node .claude/hooks/antigravity-agents.mjs --show | --set <agent>=<inherit|flash|pro> ...');
    process.exit(1);
  }
}
