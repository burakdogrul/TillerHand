#!/usr/bin/env node
// PostToolUse hook: formats the file the AI edited with Prettier.
// If Prettier is not installed in the project it passes silently; it never blocks the work.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname } from 'node:path';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.md']);

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const file = input.tool_input?.file_path;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
  if (file && EXTENSIONS.has(extname(file)) && existsSync(bin)) {
    spawnSync(bin, ['--write', '--log-level', 'warn', file], { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  }
} catch {
  // a formatting error must not break the edit
}
