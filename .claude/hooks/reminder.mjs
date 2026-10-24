#!/usr/bin/env node
// UserPromptSubmit hook: in long sessions it repeats the core rules at regular intervals (against context rot)
// and suggests closing the session when the context is very full. stdout is added to the user's message as context.
// Kept short: every reminder costs tokens.
import fs from 'node:fs';
import path from 'node:path';

export const INTERVAL = 12; // every 12 messages
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const counterFile = path.join(root, '.claude', 'state', 'reminder.json');

let data = { session: '', count: 0 };
let session = '';
try { session = JSON.parse(fs.readFileSync(0, 'utf8')).session_id ?? ''; } catch { /* no input */ }
try { data = JSON.parse(fs.readFileSync(counterFile, 'utf8')); } catch { /* first run */ }
if (data.session !== session) data = { session, count: 0 };
data.count++;
data.turnAt = Date.now(); // notify.mjs computes the length of long jobs from this
try { fs.mkdirSync(path.dirname(counterFile), { recursive: true }); fs.writeFileSync(counterFile, JSON.stringify(data)); } catch { /* not writable: skip silently */ }

const notes = [];
if (data.count % INTERVAL === 0) {
  notes.push('[Kit hatırlatma] Kararları AskUserQuestion ile sor (önerilen ilk sırada). Kapsamı genişletme. Kurul ve limit kurallarına uy. Her cevabın sonuna durum bloğu ekle.');
}
try {
  const b = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'context.json'), 'utf8'));
  const percent = b.percent ?? b.yuzde; // yuzde: key before 3.15.0 (remove in 3.17.0)
  if (percent >= 70) notes.push(`[Kit] Bağlam %${percent} dolu: yanıt kalitesi düşebilir. Mevcut adımı bitir, kullanıcıya /wrap-up ve ardından /clear öner.`);
  else if (percent >= 50 && data.count % 4 === 0) notes.push(`[Kit] Bağlam %${percent}: uygun bir noktada /wrap-up + /clear önermeyi düşün.`);
} catch { /* no context info */ }

if (notes.length) console.log(notes.join('\n'));
