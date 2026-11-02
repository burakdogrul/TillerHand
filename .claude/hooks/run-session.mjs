#!/usr/bin/env node
// Opens the main session on an external model (docs/workflow/models.md): node .claude/hooks/run-session.mjs, in your own terminal.
// The session never holds the key: the proxy of run-role.mjs adds it and sends only to the address sealed with it.
// Claude plan models cannot run here, because every request goes through the proxy: external-session-guard.mjs stops a subagent set to one.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { findRoot, isMain, findProgram } from './shared.mjs';
import { savedChoice, modelsFile } from './models.mjs';
import { parseExternal, readProvider, readStore, hasKey, validPrice, spendAllowed, addSpend, addModelSpend, today, purgePlainKeys, unsafeEnv } from './providers.mjs';
import { startProxy, childEnv, guardsMissing, STAY_INSIDE, DEFAULT_PRICE } from './run-role.mjs';

// No MCP servers: what they return would go to the provider too
export const sessionArgs = ({ model }) => ['--model', model, '--settings', STAY_INSIDE, '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

export const sessionEnv = (baseEnv, { port, token, provider, model, effort, root }) => ({
  ...childEnv(baseEnv, { port, token, model, root }),
  KIT_EXTERNAL_SESSION: `${provider}/${model}`,
  ...(effort ? { CLAUDE_CODE_EFFORT_LEVEL: effort } : {}),
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const root = findRoot();
  if (!process.stdin.isTTY) fail('Run this in your own terminal: it opens an interactive session.');
  const unsafe = unsafeEnv();
  if (unsafe.length) fail(`Not running: ${unsafe.join(', ')} is set, which can send the key to another machine.`);
  try { purgePlainKeys(); } catch { /* the store is not writable; a plain key in it is never read */ }
  const missing = guardsMissing(root, { userSettings: true });
  if (missing) fail(`Not running: ${missing}.`);
  const choice = parseExternal(savedChoice('main', modelsFile(root)));
  if (!choice) fail('The main job has no external model. Choose one with /models, or open Claude Code as usual.');
  const { provider, model, effort } = choice;
  const claude = findProgram('claude', root);
  if (!claude) fail('claude was not found on PATH outside this project.');
  const sealed = readProvider(provider);
  if (!sealed) fail(hasKey(provider)
    ? `The ${provider} key cannot be read: the vault did not open, or an older kit saved it. Enter it again: node .claude/hooks/models.mjs --set-key ${provider}`
    : `No ${provider} key. Add one: node .claude/hooks/models.mjs --set-key ${provider}`);
  const { url, key } = sealed;
  const saved = Number(readStore().limits[provider]);
  const limit = saved > 0 ? saved : undefined;
  const day = today();
  if (!spendAllowed(provider, limit, day)) fail(`The daily limit for ${provider} ($${limit}) is spent, or the ledger cannot be read.`);

  const listed = readStore().catalog[provider]?.[model];
  const known = validPrice(listed, model) ? { input: listed.input, output: listed.output } : undefined;
  let spent = 0, tokensIn = 0, tokensOut = 0, child = null;
  const token = `run-${crypto.randomBytes(24).toString('hex')}`;
  const proxy = await startProxy({ key, token, model, upstream: url, prices: known ?? DEFAULT_PRICE,
    canSpend: () => spendAllowed(provider, limit, day),
    onUsage: ({ usage, cost }) => {
      // A cost that cannot be added up ends the session, as in run-role.mjs
      if (!Number.isFinite(cost)) {
        if (limit !== undefined) addSpend(provider, limit, day);
        console.error('The cost could not be counted, so the session is being stopped.');
        child?.kill();
        return;
      }
      spent += cost;
      tokensIn += (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
      tokensOut += usage.output_tokens ?? 0;
      addSpend(provider, cost, day);
    } });

  console.log(`Main session on ${provider}/${model}. Your conversation and everything it reads go to ${new URL(url).host}. Jobs set to a Claude model stop here.`);
  // Ctrl+C belongs to the session; this process waits for it so the proxy closes last
  process.on('SIGINT', () => {});
  const started = Date.now();
  const code = await new Promise((done) => {
    child = spawn(claude, sessionArgs({ model }), { cwd: root, env: sessionEnv(process.env, { port: proxy.port, token, provider, model, effort, root }), stdio: 'inherit', shell: false });
    child.on('error', (e) => { console.error(`claude could not start: ${e.message}`); done(1); });
    child.on('close', (c) => done(c ?? 1));
  });
  await proxy.close();
  const seconds = Math.round((Date.now() - started) / 1000);
  try {
    fs.mkdirSync(path.join(root, '.claude', 'state'), { recursive: true });
    fs.appendFileSync(path.join(root, '.claude', 'state', 'role-runs.jsonl'), `${JSON.stringify({ date: new Date().toISOString(), job: 'main', role: 'main', provider, model, seconds, usd: +spent.toFixed(4), priceKnown: Boolean(known), exit: code, input: tokensIn, output: tokensOut })}\n`);
  } catch { /* the run still reports */ }
  try { addModelSpend(`${provider}/${model}`, { usd: spent, input: tokensIn, output: tokensOut, seconds, priceKnown: Boolean(known) }, day); } catch { /* the run still reports */ }
  console.log(`Session closed: ${seconds} s, $${spent.toFixed(4)}${known ? '' : ' (estimate: the price of this model is unknown, a high default was used)'}.`);
  process.exit(code);
}

if (isMain(import.meta.url)) main().catch((e) => fail(`run-session failed: ${e.message}`));
