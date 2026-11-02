#!/usr/bin/env node
// Reads this project's last 30 days of tokens and API-equivalent cost via ccusage → .claude/state/cost.json (the dashboard reads it).
//   node .claude/hooks/cost.mjs [root]            this project → cost.json
//   node .claude/hooks/cost.mjs --all [root]      every project on this machine → cost-all.json (the panel's "all projects" scope)
// Run by /dashboard and /wrap-up. Not in the Stop hook: npx downloads the package the first time, it is slow.
// On a subscription (Pro/Max) this is not a real bill; it is what the work would cost at API prices.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ccusageProjectName } from './dashboard-data.mjs';
import { isMain, ENV_ALLOWED } from './shared.mjs';

const CCUSAGE = 'ccusage@20.0.30'; // pinned version; updating it is a technical decision

// npx downloads and runs a package: it gets only the names it needs to run (the same list as a role's child), so no key, token or password goes along
export const safeEnv = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => ENV_ALLOWED.test(name) || /^npm_config_/i.test(name)));

function main(args) {
  const all = args.includes('--all');
  const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');

  // Run in a fresh folder of its own: in the project npx would read a repo .npmrc or node_modules/.bin/ccusage (code from the
  // repo), and in a shared /tmp it would walk up to another user's /tmp/node_modules. The empty package.json stops that walk.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-cost-'));
  try {
    fs.writeFileSync(path.join(work, 'package.json'), '{}');
    // Arguments contain only letters, digits and "-"; on Windows npx.cmd needs a shell.
    const output = execSync(`npx -y ${CCUSAGE} claude daily --json ${all ? '' : `--instances --project ${ccusageProjectName(root)} `}--since ${since} --offline`,
      { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000, env: safeEnv(process.env) });
    const data = JSON.parse(output);
    fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'state', all ? 'cost-all.json' : 'cost.json'), JSON.stringify({ readAt: new Date().toISOString(), data }));
    const t = data.totals ?? {};
    console.log(`Last 30 days: ${Math.round((t.totalTokens ?? 0) / 1e6)}M tokens · API-equivalent cost $${(t.totalCost ?? 0).toFixed(2)}`);
  } catch (h) {
    console.error(`Could not read ccusage (${h.code ?? h.message}). Node and network access are needed; the dashboard shows this card empty.`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
