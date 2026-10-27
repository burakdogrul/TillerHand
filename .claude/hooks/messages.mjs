// Text hooks show the user directly, in Turkish and English. Other languages: .claude/i18n/<lang>.json, written once by the AI
// (node .claude/hooks/lang.mjs --export → translate → --write). Words in braces ({command}, {step}) are placeholders; keep them in every translation.
export const MESSAGES = {
  'session.begin': { tr: 'Başlamak için: /start [proje fikrin] · var olan projede: /adopt', en: 'To begin: /start [your project idea] · existing project: /adopt' },
  'session.resume': { tr: 'Devam: {command} (adım {step})', en: 'Continue: {command} (step {step})' },
  'session.next': { tr: 'Sıradaki: /build {code} · {title}', en: 'Next: /build {code} · {title}' },
  'session.handoff': { tr: 'Devir notu var: /handoff devral', en: 'Handoff note waiting: /handoff devral' },
  'session.handoffThen': { tr: 'Devir notu var: /handoff devral · sonra {next}', en: 'Handoff note waiting: /handoff devral · then {next}' },
};
