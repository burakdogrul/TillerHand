#!/usr/bin/env node
// Blocks writing secrets (API keys, private keys).
// Two uses:
//   1) PreToolUse hook (Claude Code, Codex, Antigravity): reads the tool input from stdin, denies if it holds a secret.
//   2) Git pre-commit: `node .claude/hooks/guard-secrets.mjs --staged` scans the staged changes.
// High-confidence patterns only; no generic "password=" search, to avoid false alarms.
import { execSync } from 'node:child_process';
import { readInput, decide, isMain } from './shared.mjs';

export const PATTERNS = [
  ['Anthropic/OpenAI key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}/],
  ['Stripe secret key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['Resend key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ['Supabase secret key', /\bsb_secret_(?=[\w-]*\d)[\w-]{16,}/],
];

export function findSecrets(text) {
  return PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function hookMode() {
  const g = readInput();
  if (!g) process.exit(0); // unreadable input: do not block the work
  // Codex and Antigravity also scan shell commands (heredoc, echo > file); Claude Code only file tools
  if (g.tool !== 'claude' && findSecrets(g.command).length) {
    decide(g.tool, 'deny', `BLOCKED: the command contains a secret (${findSecrets(g.command).join(', ')}). Do not write the secret into a command or a file; read it from an environment variable.`);
  }
  for (const { path, text } of g.files) {
    const found = findSecrets(text);
    if (found.length) {
      decide(g.tool, 'deny',
        `BLOCKED: a secret is being written to ${path} (${found.join(', ')}). ` +
          'Do not put the secret in code; read it from an environment variable and add the variable name to .env.example with an empty value.');
    }
  }
}

function stagedMode() {
  const diff = execSync('git diff --cached -U0 --no-color', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let file = '';
  const findings = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(6);
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      const f = findSecrets(line);
      if (f.length) findings.push(`${file}: ${f.join(', ')}`);
    }
  }
  if (findings.length) {
    console.error('Commit stopped, secret found:\n  ' + findings.join('\n  '));
    console.error('Remove the secret and move it to an environment variable. Revoke and replace any key that may have leaked.');
    process.exit(1);
  }
}

// Run only when called directly, not when tests import this file
if (isMain(import.meta.url)) {
  process.argv.includes('--staged') ? stagedMode() : hookMode();
}
