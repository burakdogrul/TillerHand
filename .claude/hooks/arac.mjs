// Hook girdi/çıktı katmanı: aynı koruma betikleri Claude Code, Codex ve Antigravity'de çalışsın.
//   Claude Code: { tool_name, tool_input: { command | file_path, content, new_string, edits } }; CLAUDE_PROJECT_DIR verir.
//                NotebookEdit: { notebook_path, new_source }.
//   Codex:       Claude ile aynı alanlar + turn_id. Dosya düzenleme apply_patch; yama metni tool_input.command'da.
//   Antigravity: { toolCall: { name, args }, workspacePaths }. Araçlar: run_command (CommandLine),
//                write_to_file (TargetFile, CodeContent), replace_file_content (ReplacementContent),
//                multi_replace_file_content (ReplacementChunks[].ReplacementContent).
// Kaynak: learn.chatgpt.com/docs/hooks, antigravity.google/docs/hooks (2026-10-23).
// İlke: yazma veya komut aracında beklenen alan yoksa izin verme (boş yol, tüm argümanlar taranır).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AG_YAZMA = ['write_to_file', 'replace_file_content', 'multi_replace_file_content'];

// Claude Code hook'lara CLAUDE_PROJECT_DIR verir; Codex vermez. Codex'te "ask" yok, yanlış tanıma güvenli tarafta kalsın.
export function aracBul(g) {
  if (g.toolCall || g.workspacePaths) return 'antigravity';
  if ('turn_id' in g || g.tool_name === 'apply_patch') return 'codex';
  return process.env.CLAUDE_PROJECT_DIR ? 'claude' : 'codex';
}

const metinMi = (x) => typeof x === 'string';
// İç içe dizi ve nesnelerdeki bütün metinler (okuma koruması yolu argümanın neresinde olursa olsun görsün)
const metinler = (x) => (metinMi(x) ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(metinler) : []);

// Proje kökü betiğin kendi yerinden çıkar (<proje>/.claude/hooks/): cwd'ye veya ajanın açabileceği işaret
// dosyalarına (.git) bağlı değil, Codex alt klasörde açılsa da doğru kalır.
const BETIK_KOKU = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const kokBul = () => process.env.CLAUDE_PROJECT_DIR || BETIK_KOKU;

// Codex yaması: "*** Add File: x" yeni dosya, "*** Update File: x", "*** Move to: y"; "+" satırları eklenen metin,
// "-" satırları silinen metin (once). Add var olan dosyanın üstüne de yazabilir: once tanımsız, betik diske bakar.
// Move kaydı taşınan dosyanın yolunu da taşır (kaynak).
export function yamaDosyalari(yama) {
  const dosyalar = [];
  let d = null;
  for (const satir of yama.split(/\r?\n/)) {
    const m = satir.match(/^\s*\*\*\*\s*(Add|Update|Delete) File:\s*(.+)$/) ?? satir.match(/^\s*\*\*\*\s*(Move) to:\s*(.+)$/);
    if (m) {
      const kaynak = m[1] === 'Move' ? d?.yol : undefined;
      dosyalar.push((d = { yol: m[2].trim(), yeni: m[1] === 'Add' || m[1] === 'Move', metin: '', once: m[1] === 'Add' ? undefined : '' }));
      if (m[1] === 'Delete') d.sil = true;
      if (kaynak) d.kaynak = kaynak;
    } else if (d && satir.startsWith('+')) d.metin += satir.slice(1) + '\n';
    else if (d && satir.startsWith('-')) d.once = (d.once ?? '') + satir.slice(1) + '\n';
  }
  for (const x of dosyalar) x.sonra = x.metin;
  // Başlık anlaşılmadıysa yamanın tamamı yolsuz tek dosya sayılır: sır taranır, kilit engeller
  return dosyalar.length || !yama.trim() ? dosyalar : [{ yol: '', metin: yama }];
}

// Döndürür: { arac, kok, dizin, oturum, komut, dosyalar: [{ yol, metin, yeni?, once?, sonra?, sil? }], okunan: [yol] }. okunan: Antigravity okuma araçları. yeni bilinmiyorsa tanımsız (betik diske bakar).
// dizin: göreli yolların çözüleceği klasör (Codex yamasında oturumun cwd'si).
// metin: taranacak bütün yazılan metin. once/sonra: düzenlenen parçanın önceki ve sonraki hali (once tanımsızsa tam yazım: betik diske bakar).
export function cozumle(g) {
  const arac = aracBul(g);
  const kok = kokBul();
  const oturum = String(g.session_id ?? g.conversationId ?? '');
  const sonuc = { arac, kok, dizin: metinMi(g.cwd) ? g.cwd : kok, oturum, komut: '', dosyalar: [], okunan: [] };
  if (arac === 'antigravity') {
    const { name, args = {} } = g.toolCall ?? {};
    if (name === 'run_command') sonuc.komut = metinMi(args.CommandLine) ? args.CommandLine : JSON.stringify(args);
    // İçerik alanı adından bağımsız: tüm argümanlar taranır
    if (AG_YAZMA.includes(name)) {
      const parcalar = Array.isArray(args.ReplacementChunks) ? args.ReplacementChunks : [args];
      const birlestir = (alan) => parcalar.map((c) => (metinMi(c?.[alan]) ? c[alan] : '')).join('\n');
      const tam = name === 'write_to_file';
      sonuc.dosyalar.push({
        yol: metinMi(args.TargetFile) ? args.TargetFile : '', metin: JSON.stringify(args),
        once: tam ? undefined : birlestir('TargetContent'),
        sonra: tam ? (metinMi(args.CodeContent) ? args.CodeContent : '') : birlestir('ReplacementContent'),
      });
    }
    // Okuma: araç adından bağımsız, argümanlardaki her metin olası yol sayılır (bilinmeyen okuma aracı da kapsanır)
    sonuc.okunan = metinler(args);
    return sonuc;
  }
  const t = g.tool_input ?? {};
  const komut = metinMi(t.command) ? t.command : Array.isArray(t.command) ? t.command.join(' ') : t.command == null ? '' : JSON.stringify(t.command);
  if (g.tool_name === 'apply_patch') sonuc.dosyalar = yamaDosyalari(komut);
  else sonuc.komut = komut;
  const dosya = t.file_path ?? t.notebook_path;
  if (dosya) {
    const metin = metinMi(t.content) ? t.content
      : metinMi(t.new_string) ? t.new_string
      : Array.isArray(t.edits) ? t.edits.map((e) => e?.new_string ?? '').join('\n')
      : metinMi(t.new_source) ? t.new_source : '';
    const once = metinMi(t.old_string) ? t.old_string
      : Array.isArray(t.edits) ? t.edits.map((e) => e?.old_string ?? '').join('\n') : undefined;
    sonuc.dosyalar.push({ yol: String(dosya), metin, once, sonra: metin });
  }
  return sonuc;
}

// stdin'i okur; JSON değilse null (hook işi engellemez)
export function girdiOku() {
  let g;
  try { g = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
  return cozumle(g && typeof g === 'object' ? g : {});
}

// PreToolUse kararı (deny | ask) aracın biçiminde yazılır.
// Codex'te "ask" yok (verilirse araç yine çalışır): engellenir, AI kullanıcıya sorar.
export function kararMetni(arac, karar, neden) {
  if (arac === 'antigravity') return JSON.stringify({ decision: karar, reason: neden });
  if (arac === 'codex' && karar === 'ask') {
    karar = 'deny';
    neden = `Kullanıcı onayı gerekli. ${neden} Codex'te onay penceresi olmadığı için engellendi: kullanıcıya sor; onaylarsa işlemi kendisi yapsın.`;
  }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: karar, permissionDecisionReason: neden } });
}

export function kararVer(arac, karar, neden) {
  console.log(kararMetni(arac, karar, neden));
  process.exit(0);
}

// SessionStart notu: Claude ve Codex additionalContext, Antigravity injectSteps.
// ekran: sadece Claude'da kullanıcıya gösterilen satır (systemMessage); diğerlerinde belgelenmemiş.
export function oturumNotu(arac, metin, ekran) {
  if (arac === 'antigravity') return JSON.stringify({ injectSteps: [{ systemMessage: { systemMessage: metin } }] });
  const cikti = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: metin } };
  if (ekran && arac === 'claude') cikti.systemMessage = ekran;
  return JSON.stringify(cikti);
}
