#!/usr/bin/env node
// PostToolUse hook'u: AI'nın düzenlediği dosyayı Prettier ile biçimlendirir.
// Prettier projede kurulu değilse sessizce geçer; işi asla engellemez.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, extname } from 'node:path';

const UZANTILAR = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.md']);

try {
  const girdi = JSON.parse(readFileSync(0, 'utf8'));
  const dosya = girdi.tool_input?.file_path;
  const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const bin = join(kok, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
  if (dosya && UZANTILAR.has(extname(dosya)) && existsSync(bin)) {
    spawnSync(bin, ['--write', '--log-level', 'warn', dosya], { cwd: kok, stdio: 'ignore', shell: process.platform === 'win32' });
  }
} catch {
  // biçimlendirme hatası düzenlemeyi bozmasın
}
