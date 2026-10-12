#!/usr/bin/env node
// Bu projenin son 30 günlük token ve API karşılığı maliyetini ccusage ile okur → .claude/state/cost.json (pano okur).
//   node .claude/hooks/cost.mjs
// /dashboard ve /wrap-up çalıştırır. Stop hook'una konmaz: npx ilk seferde paketi indirir, yavaştır.
// Abonelikte (Pro/Max) gerçek fatura değildir; ne kadar iş yapıldığının API fiyatıyla karşılığıdır.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ccusageProjeAdi } from './dashboard-data.mjs';

const CCUSAGE = 'ccusage@20.0.30'; // sürüm sabit; güncellemek teknik karardır
const kok = path.resolve(process.argv[2] ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10).replace(/-/g, '');

try {
  // Argümanlar sadece harf, rakam ve "-" içerir; Windows'ta npx.cmd kabuk ister
  const cikti = execSync(`npx -y ${CCUSAGE} claude daily --json --instances --project ${ccusageProjeAdi(kok)} --since ${since} --offline`,
    { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
  const veri = JSON.parse(cikti);
  fs.mkdirSync(path.join(kok, '.claude', 'state'), { recursive: true });
  fs.writeFileSync(path.join(kok, '.claude', 'state', 'cost.json'), JSON.stringify({ okundu: new Date().toISOString(), veri }));
  const t = veri.totals ?? {};
  console.log(`Son 30 gün: ${Math.round((t.totalTokens ?? 0) / 1e6)}M token · API karşılığı $${(t.totalCost ?? 0).toFixed(2)}`);
} catch (h) {
  console.error(`ccusage okunamadı (${h.code ?? h.message}). Node ve ağ erişimi gerekir; pano bu kartı boş gösterir.`);
}
