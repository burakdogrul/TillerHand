#!/usr/bin/env node
// PostToolUse hook: formats the file the AI edited with Prettier.
// If Prettier is not installed in the project it passes silently; it never blocks the work.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname, resolve } from 'node:path';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.md']);

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const file = input.tool_input?.file_path;
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // Prettier 3's own entry run with node: no shell, so a spaced or special-character path is passed as is
  const bin = join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
  if (file && EXTENSIONS.has(extname(file)) && existsSync(bin)) {
    // shortcut: Prettier 3 only (v2 has bin-prettier.js and --loglevel); the kit's stack installs the latest. Absolute path: never read as a flag
    spawnSync(process.execPath, [bin, '--write', '--log-level', 'warn', resolve(root, file)], { cwd: root, stdio: 'ignore' });
  }
} catch {
  // a formatting error must not break the edit
}
