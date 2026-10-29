// Labels and values hooks read from project files. They stay English in every project language.

export const LABELS = {
  lastUpdated: 'Last updated',
  activePhase: 'Active phase',
  activeTask: 'Active task',
  setupStep: 'Setup step',
  questionMode: 'Question mode',
  profile: 'Profile',
  currentState: 'Current state',
  doneLastSession: 'Done last session',
  nextStep: 'Next step',
  pendingDecisions: 'Pending decisions',
  whereWeLeftOff: 'Where we left off',
  openIssues: 'Open issues / blockers',
  status: 'Status',
  commitReview: 'Commit review',
  members: 'Members',
  meetingLog: 'Meeting log',
  decisionLog: 'Decision log',
  phase: 'Phase',
  commands: 'Commands',
  dev: 'dev',
  preview: 'preview',
  typeCheck: 'type check',
  type: 'Type',
  class: 'Class',
  mustNotChange: 'Behavior that must not change',
  priority: 'Priority',
  outOfScope: 'Out of scope',
  chosenTech: 'Chosen technologies',
  maintenanceLog: 'Maintenance log',
  flags: 'Flags',
  records: 'Records',
  unreleased: 'Unreleased',
  currency: 'Currency',
  price: 'Price (per user, monthly)',
  paymentFee: 'Payment fee (%)',
  fixedCost: 'Fixed monthly cost',
  variableCost: 'Variable cost per user (monthly)',
  targetUsers: 'Target active users',
  freeShare: 'Free user share (%)',
  accounts: 'Accounts',
  inbox: 'Inbox',
  themes: 'Themes',
  reports: 'Reports',
  alarms: 'Alarms',
  chosenDirection: 'Chosen direction',
  valueProposition: 'Value proposition',
  criticalFlows: 'Critical flows',
  learnedRules: 'Learned rules',
  rule: 'Rule',
  environments: 'Environments (dev / prod)',
};

// Values hooks read at known label or column positions. Readers compare with isValue().
export const VALUES = {
  on: 'on',
  off: 'off',
  none: 'none',
  setup: 'Setup',
  notSetUp: 'not set up',
  setUp: 'set up',
  full: 'Full',
  light: 'Light',
  standard: 'Standard',
  waiting: 'waiting',
  automatic: 'automatic',
  user: 'user',
  oneWay: 'one-way',
  twoWay: 'two-way',
  yes: 'yes',
  no: 'no',
  right: 'right',
  wrong: 'wrong',
  passed: 'passed',
  failed: 'failed',
  notRun: 'not run',
  bug: 'bug',
  feature: 'feature',
  request: 'request',
  complaint: 'complaint',
  praise: 'praise',
  question: 'question',
  new: 'new',
  planned: 'planned',
  done: 'done',
  rejected: 'rejected',
  merged: 'merged',
};

// The value, case-insensitive, whole or followed by a non-letter: "on · closed topics: none" is on, "online" is not.
export function isValue(text, key) {
  if (!Object.hasOwn(VALUES, key)) throw new Error(`unknown value: ${key}`);
  if (typeof text !== 'string') return false;
  const s = text.trim().toLowerCase();
  const w = VALUES[key].toLowerCase();
  return s.startsWith(w) && !/^[\p{L}\p{N}]/u.test(s.slice(w.length));
}

export function label(key) {
  if (!Object.hasOwn(LABELS, key)) throw new Error(`unknown label: ${key}`);
  return LABELS[key];
}

const VERDICTS = [['CONDITIONAL', 'conditional'], ['APPROVE', 'approve'], ['REJECT', 'reject']];

// Board result. Fail-closed: anything that is not one clean verdict is 'unknown'.
export function verdict(text) {
  if (typeof text !== 'string') return 'unknown';
  // "**Result:** REJECT", "**REJECT**"; after the word only the end, a dash, a bracket or ": , ; ." ("REJECT: security")
  const s = text.trim().replace(/^\*\*[^*]+:\*\*\s*/, '').replace(/^\*\*([^*]+)\*\*/, '$1').toUpperCase();
  for (const [word, result] of VERDICTS) {
    if (s.startsWith(word) && /^(?:\s*(?:$|[—–(-])|[:,;.])/.test(s.slice(word.length))) return result;
  }
  return 'unknown';
}
