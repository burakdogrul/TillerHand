#!/usr/bin/env node
// External session guard (PreToolUse, Agent and Task): in a session opened by run-session.mjs every request goes through the proxy, so a subagent set to a Claude model
// would run on the external model instead, without saying so. It stops, and the user chooses. Outside such a session it does nothing.
import fs from 'node:fs';
import path from 'node:path';
import { findRoot, isMain, decide } from './shared.mjs';
import { t } from './lang.mjs';

const CLAUDE_MODEL = /^(?:opus|sonnet|haiku|fable|claude-[\w.-]+)(?:\[[\w-]+\])?$/i;

// The agent file's front matter says the model when the call does not. The name comes from the AI, so it must be a plain name inside the agents folder.
function agentModel(type, root) {
  if (typeof type !== 'string' || !/^[\w-]+$/.test(type)) return null;
  try {
    return fs.readFileSync(path.join(root, '.claude', 'agents', `${type}.md`), 'utf8').split(/^---\s*$/m)[1]?.match(/^model:\s*(\S+)/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function decideAgent({ env = process.env, input, root = findRoot() }) {
  if (!env?.KIT_EXTERNAL_SESSION) return null;
  const model = typeof input?.model === 'string' && input.model ? input.model : agentModel(input?.subagent_type, root);
  if (!model || !CLAUDE_MODEL.test(model.trim())) return null;
  return { decision: 'deny', reason: t(root, 'guard.externalSession.claude', { model }) };
}

if (isMain(import.meta.url)) {
  let g = null;
  try { g = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* unreadable input: do not block the work */ }
  const result = decideAgent({ input: g?.tool_input });
  if (result) decide('claude', result.decision, result.reason);
  process.exit(0);
}
