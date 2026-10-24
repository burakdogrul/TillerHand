#!/usr/bin/env node
// PostToolUse hook: formats and fixes the .py file the AI edited with Ruff.
// Remaining lint errors go back to the AI with exit code 2, and it fixes them in the same turn.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let file;
try {
  file = JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!file || !file.endsWith('.py')) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ruff = (...a) => spawnSync('uv', ['run', 'ruff', ...a, file], { cwd: root, encoding: 'utf8' });

const fmt = ruff('format', '--quiet');
if (fmt.error) process.exit(0); // no uv/ruff: skip silently
const check = ruff('check', '--fix', '--quiet');
if (check.status === 1 && check.stdout.trim()) {
  process.stderr.write(`Ruff bu dosyada düzeltilmesi gereken hatalar buldu:\n${check.stdout}`);
  process.exit(2);
}
