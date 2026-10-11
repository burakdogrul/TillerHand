#!/usr/bin/env node
// PostToolUse hook'u: AI'nın düzenlediği .py dosyasını Ruff ile biçimlendirir ve düzeltir.
// Kalan lint hatalarını çıkış kodu 2 ile AI'ya geri bildirir, AI aynı turda düzeltir.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let dosya;
try {
  dosya = JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path;
} catch {
  process.exit(0);
}
if (!dosya || !dosya.endsWith('.py')) process.exit(0);

const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const ruff = (...a) => spawnSync('uv', ['run', 'ruff', ...a, dosya], { cwd: kok, encoding: 'utf8' });

const fmt = ruff('format', '--quiet');
if (fmt.error) process.exit(0); // uv/ruff yoksa sessiz geç
const kontrol = ruff('check', '--fix', '--quiet');
if (kontrol.status === 1 && kontrol.stdout.trim()) {
  process.stderr.write(`Ruff bu dosyada düzeltilmesi gereken hatalar buldu:\n${kontrol.stdout}`);
  process.exit(2);
}
