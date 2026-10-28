// Label dictionary (3.48.0): the labels hooks read from project files, Turkish (pre-3.48 projects) and English.
// Readers call normalize() first and then only know the English labels. Turkish reading goes away in 4.0.

export const LABELS = {
  lastUpdated: { en: 'Last updated', tr: 'Son güncelleme' },
  activePhase: { en: 'Active phase', tr: 'Aktif faz' },
  activeTask: { en: 'Active task', tr: 'Aktif görev' },
  setupStep: { en: 'Setup step', tr: 'Başlangıç adımı' },
  questionMode: { en: 'Question mode', tr: 'Soru modu' },
  profile: { en: 'Profile', tr: 'Profil' },
  currentState: { en: 'Current state', tr: 'Şu anki durum' },
  doneLastSession: { en: 'Done last session', tr: 'Son oturumda yapılanlar' },
  nextStep: { en: 'Next step', tr: 'Sıradaki adım' },
  pendingDecisions: { en: 'Pending decisions', tr: 'Bekleyen kararlar' },
  whereWeLeftOff: { en: 'Where we left off', tr: 'Kaldığı yer' },
  openIssues: { en: 'Open issues / blockers', tr: 'Açık sorunlar / bloklayıcılar' },
  status: { en: 'Status', tr: 'Durum' },
  commitReview: { en: 'Commit review', tr: 'Commit denetimi' },
  members: { en: 'Members', tr: 'Üyeler' },
  meetingLog: { en: 'Meeting log', tr: 'Toplantı günlüğü' },
  decisionLog: { en: 'Decision log', tr: 'Karar günlüğü' },
  phase: { en: 'Phase', tr: 'Faz' },
  commands: { en: 'Commands', tr: 'Komutlar' },
  dev: { en: 'dev', tr: 'geliştirme' },
  preview: { en: 'preview', tr: 'önizleme' },
  typeCheck: { en: 'type check', tr: 'tip kontrol' },
  type: { en: 'Type', tr: 'Tür' },
  class: { en: 'Class', tr: 'Sınıf' },
  mustNotChange: { en: 'Behavior that must not change', tr: 'Değişmemesi gereken davranış' },
  priority: { en: 'Priority', tr: 'Öncelik' },
  outOfScope: { en: 'Out of scope', tr: 'Kapsam dışı' },
  chosenTech: { en: 'Chosen technologies', tr: 'Seçilen teknolojiler' },
  maintenanceLog: { en: 'Maintenance log', tr: 'Bakım kaydı' },
  flags: { en: 'Flags', tr: 'Bayraklar' },
  records: { en: 'Records', tr: 'Kayıtlar' },
  unreleased: { en: 'Unreleased', tr: 'Yayınlanmamış' },
  currency: { en: 'Currency', tr: 'Para birimi' },
  price: { en: 'Price (per user, monthly)', tr: 'Fiyat (kullanıcı başı aylık)' },
  paymentFee: { en: 'Payment fee (%)', tr: 'Ödeme komisyonu (%)' },
  fixedCost: { en: 'Fixed monthly cost', tr: 'Sabit aylık maliyet' },
  variableCost: { en: 'Variable cost per user (monthly)', tr: 'Kullanıcı başı değişken maliyet (aylık)' },
  targetUsers: { en: 'Target active users', tr: 'Hedef aktif kullanıcı' },
  freeShare: { en: 'Free user share (%)', tr: 'Ücretsiz kullanıcı oranı (%)' },
};

export function label(key) {
  if (!Object.hasOwn(LABELS, key)) throw new Error(`unknown label: ${key}`);
  return LABELS[key].en;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COMMAND_KEYS = ['dev', 'preview', 'typeCheck'];
// Longest first so a shorter label never wins over a longer one that starts the same way.
const PAIRS = Object.entries(LABELS).filter(([k]) => !COMMAND_KEYS.includes(k)).map(([, v]) => v)
  .sort((a, b) => b.tr.length - a.tr.length);
const BOLD = PAIRS.map(({ tr, en }) => [new RegExp(`^\\*\\*${esc(tr)}:\\*\\*`), `**${en}:**`]);
// The label must end at a non-letter: "## Faz 1" changes, "## Fazla mesai" does not. A PRD heading may be numbered
// ("## 6. Kapsam dışı"), the CHANGELOG one is bracketed ("## [Yayınlanmamış]").
const HEADING = [
  [new RegExp(`^## \\[${esc(LABELS.unreleased.tr)}\\]`), `## [${LABELS.unreleased.en}]`],
  ...PAIRS.map(({ tr, en }) => [new RegExp(`^## (\\d+\\. )?${esc(tr)}(?![\\p{L}\\p{N}])`, 'u'), `## $1${en}`]),
];
const COMMAND = COMMAND_KEYS.map((k) => [new RegExp(`^${esc(LABELS[k].tr)}:`), `${LABELS[k].en}:`]);
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const COMMANDS_HEADING = /^## (Komutlar|Commands)(?![\p{L}\p{N}])/u;

const swap = (line, rules) => {
  for (const [re, to] of rules) if (re.test(line)) return line.replace(re, to);
  return line;
};

// Rewrites Turkish labels to English only at label positions: a line-start **Label:**, a "## Label" heading,
// and the keys of the AGENTS.md Commands block. Prose, tables, other code blocks and values stay byte-identical.
export function normalize(text) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const parts = text.slice(bom.length).split(/(\r?\n)/);
  let fence = false;
  let commands = false;
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i];
    if (FENCE.test(line)) { fence = !fence; continue; }
    if (!fence && /^#{1,2} /.test(line)) commands = COMMANDS_HEADING.test(line);
    if (commands) parts[i] = swap(line, [...COMMAND, ...HEADING]);
    else if (!fence) parts[i] = swap(line, [...BOLD, ...HEADING]);
  }
  return bom + parts.join('');
}

// The label a writer uses for key in this file: the language the file already has for it (English if both, or neither).
// Same positions as normalize: a line-start **Label:** or a "## Label" heading outside code blocks.
export function labelIn(text, key) {
  const { en, tr } = LABELS[key] ?? {};
  if (!Object.hasOwn(LABELS, key)) throw new Error(`unknown label: ${key}`);
  const at = (word) => new RegExp(`^(\\*\\*${esc(word)}:\\*\\*|## (\\d+\\. )?\\[?${esc(word)}(?![\\p{L}\\p{N}]))`, 'u');
  const [isEn, isTr] = [at(en), at(tr)];
  let fence = false, found = en;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (FENCE.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    if (isEn.test(line)) return en;
    if (isTr.test(line)) found = tr;
  }
  return found;
}

const VERDICTS = [['KOŞULLU ONAY', 'conditional'], ['CONDITIONAL', 'conditional'], ['KOŞULLU', 'conditional'],
  ['APPROVE', 'approve'], ['ONAY', 'approve'], ['REJECT', 'reject'], ['RET', 'reject']];

// Board result in either language. Fail-closed: anything that is not one clean verdict is 'unknown'.
export function verdict(text) {
  if (typeof text !== 'string') return 'unknown';
  const s = text.trim().replace(/^\*\*[^*]+:\*\*\s*/, '').toUpperCase();
  for (const [word, result] of VERDICTS) {
    if (s.startsWith(word) && /^\s*(?:$|[—–(-])/.test(s.slice(word.length))) return result;
  }
  return 'unknown';
}
