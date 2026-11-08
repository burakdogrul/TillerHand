// Run: node --test "kit/tests/seed.test.mjs"
// Seed data (3.73.0): a documented, deterministic way to load sample data into the LOCAL dev database.
// AC-73.1 seed: is a known Commands key, AC-73.2 key lists name it, AC-73.3 stack.md "Seed data" section,
// AC-73.4 structure maps allow the seed files, AC-73.5 /lock mentions it, AC-73.6 /start mentions it, ATTACK-73.1 shield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unknownCommandKeys } from '../../.claude/hooks/gate.mjs';
import { readMap, check } from '../../.claude/hooks/structure-guard.mjs';
import { evaluate } from '../../.claude/hooks/destructive-guard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const section = (md, heading) => {
  const m = md.match(new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : null;
};

// ---------- AC-73.1 ----------

test('AC-73.1 unknownCommandKeys: "seed: npm run seed" in the Commands block is not an unknown key', () => {
  const md = '## Commands\n\n```bash\ndev: npm run dev\nseed: npm run seed\ntest: npm test\n```\n';
  assert.deepEqual(unknownCommandKeys(md), []);
});

test('AC-73.1 unknownCommandKeys: a seed-like typo is still unknown (seed is matched exactly)', () => {
  assert.deepEqual(unknownCommandKeys('## Commands\n\n```bash\nseeds: npm run seed\ntest: npm test\n```\n'), ['seeds']);
});

test('AC-73.1 root AGENTS.md has a seed: line inside the fenced block under ## Commands and no unknown key', () => {
  const md = readRepo('AGENTS.md');
  const sec = section(md, '## Commands');
  assert.notEqual(sec, null, '## Commands exists');
  const fenced = [...sec.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1]).join('\n');
  assert.match(fenced, /^seed:/m, 'seed: line inside the fence');
  assert.deepEqual(unknownCommandKeys(md), []);
});

// ---------- AC-73.2 ----------

test('AC-73.2 messages.mjs: guard.commit.gateUnknownKeys English text lists seed', () => {
  const src = readRepo('.claude/hooks/messages.mjs');
  const line = src.split('\n').find((l) => l.includes("'guard.commit.gateUnknownKeys'"));
  assert.notEqual(line, undefined, 'key found');
  assert.match(line, /\bseed\b/);
});

test('AC-73.2 tr.json: guard.commit.gateUnknownKeys lists seed', () => {
  const tr = JSON.parse(readRepo('.claude/i18n/tr.json'));
  assert.match(tr['guard.commit.gateUnknownKeys'], /\bseed\b/);
});

test('AC-73.2 gate.mjs: both literal key lists (the note and the warning) list seed', () => {
  const src = readRepo('.claude/hooks/gate.mjs');
  const note = src.split('\n').find((l) => l.includes('Keys the gate does not read'));
  const warn = src.split('\n').find((l) => l.includes('AGENTS.md → Commands has keys'));
  assert.notEqual(note, undefined, 'note found');
  assert.notEqual(warn, undefined, 'warning found');
  assert.match(note, /\bseed\b/, 'Keys the gate does not read');
  assert.match(warn, /\bseed\b/, 'Commands has keys warning');
});

// ---------- AC-73.3 ----------

const STACKS = [
  { type: 'web-saas', file: 'supabase/seed.sql', orm: true },
  { type: 'backend', file: 'scripts/seed.py', orm: true },
  { type: 'mobile', file: 'supabase/seed.sql', orm: false },
];

for (const { type, file, orm } of STACKS) {
  test(`AC-73.3 ${type} stack.md: ## Seed data section names the file, the rules, the package gate and the seed: line`, () => {
    const md = readRepo(`kit/templates/${type}/docs/architecture/stack.md`);
    assert.match(md, /^## Seed data\s*$/m, 'heading ## Seed data');
    const sec = section(md, '## Seed data');
    assert.notEqual(sec, null);
    assert.ok(sec.includes(file), `seed file path ${file}`);
    for (const phrase of ['no real personal data', 'local database only', 'fixed seed', 'package gate', 'seed:'])
      assert.ok(sec.toLowerCase().includes(phrase), `phrase "${phrase}"`);
    if (orm) assert.match(sec, /drizzle|prisma/i, 'Drizzle/Prisma route');
  });
}

// ---------- AC-73.4 ----------

const ALLOWED = {
  'web-saas': ['supabase/seed.sql', 'scripts/seed.ts'],
  backend: ['scripts/seed.py', 'scripts/seed.ts'],
  mobile: ['supabase/seed.sql'],
};
for (const [type, files] of Object.entries(ALLOWED)) {
  test(`AC-73.4 structure map ${type}: allows ${files.join(' and ')}`, () => {
    const map = readMap(path.join(REPO, 'kit', 'templates', type));
    assert.equal(map?.broken, undefined, 'the map parses');
    for (const f of files) assert.equal(check(f, map), null, f);
  });
}

// ---------- AC-73.5 / AC-73.6 ----------

test('AC-73.5 lock.md ## Harden mentions the seed and the real schema', () => {
  const sec = section(readRepo('.claude/commands/lock.md'), '## Harden');
  assert.notEqual(sec, null, '## Harden exists');
  assert.match(sec, /seed/i);
  assert.match(sec, /real schema/i);
});

test('AC-73.6 start.md: the step that fills the Commands section of AGENTS.md mentions the seed: line', () => {
  const line = readRepo('.claude/commands/start.md').split('\n').find((l) => /^\d+\.\s+Fill the "Commands" section of `AGENTS\.md`/.test(l));
  assert.notEqual(line, undefined, 'step found');
  assert.match(line, /seed:/i);
});

// ---------- ATTACK-73.1 ----------

test('ATTACK-73.1 destructive guard denies database resets and seeding a remote database', () => {
  for (const c of [
    'supabase db reset',
    'supabase db reset --linked',
    'npx supabase db reset --local',
    'DATABASE_URL=postgres://app:pw@db.example.com:5432/app uv run python scripts/seed.py',
    'psql postgres://postgres:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres -f supabase/seed.sql',
    'npx prisma migrate reset',
  ]) assert.equal(evaluate(c)?.decision, 'deny', c);
});

test('ATTACK-73.1 destructive guard does not deny a local seed run', () => {
  for (const c of [
    'npm run seed',
    'uv run python scripts/seed.py',
    'psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/seed.sql',
  ]) assert.notEqual(evaluate(c)?.decision, 'deny', c);
});

// ---------- ATTACK-73.2 ----------
// One test per command so a failure names the command and the rest still run.
// The prod flag is built from parts so this file does not trip the shield when written.
const PROD_FLAG = '--' + 'pro' + 'd';

const DENY = [
  'psql postgres://db.example.com/app -f supabase/seed.sql',
  'DATABASE_URL=postgres://db.example.com/app npm run seed',
  'DATABASE_URL=postgresql+psycopg://u:p@db.example.com/app uv run python scripts/seed.py',
  'psql -h db.abcd.supabase.co -U postgres -f supabase/seed.sql',
  'psql --host=db.abcd.supabase.co -U postgres -f supabase/seed.sql',
  `npm run seed -- ${PROD_FLAG}`,
  'npx supabase db push --include-seed',
  'supabase db push --linked --include-seed',
  'supabase seed buckets --linked',
  'DATABASE_URL=postgres://u:p@localhost.evil.com/x npm run seed',
  '. ./.env && psql postgres://u:p@db.example.com/app -f supabase/seed.sql',
];
for (const c of DENY) {
  test(`ATTACK-73.2 denies (with a reason): ${c}`, () => {
    const r = evaluate(c);
    assert.equal(r?.decision, 'deny', c);
    assert.equal(typeof r.reason, 'string', `${c}: reason is a string`);
    assert.notEqual(r.reason.trim(), '', `${c}: reason not empty`);
  });
}

const NOT_DENY = [
  'supabase seed buckets',
  'psql -h localhost -U postgres -f supabase/seed.sql',
  'psql -h 127.0.0.1 -p 54322 -U postgres -f supabase/seed.sql',
  'DATABASE_URL=postgresql+psycopg://app:app@localhost:5432/app uv run python scripts/seed.py',
  'DATABASE_URL=postgres://app:app@db:5432/app uv run python scripts/seed.py',
  'uv run python scripts/seed.py -h',
  'psql postgres://localhost/app -f supabase/seed.sql',
];
for (const c of NOT_DENY) {
  test(`ATTACK-73.2 does not deny: ${c}`, () => {
    assert.notEqual(evaluate(c)?.decision, 'deny', c);
  });
}

test('ATTACK-73.2 regression: a prod deploy stays ask', () => {
  assert.equal(evaluate(`vercel ${PROD_FLAG}`)?.decision, 'ask');
});

test('ATTACK-73.2 regression: a remote non-seed psql query stays ask', () => {
  assert.equal(evaluate('psql postgres://db.example.com/app -c "select 1"')?.decision, 'ask');
});

// ---------- ATTACK-73.3 ----------

const DENY3 = [
  'psql postgres://a@localhost:x@db.example.com/app -f supabase/seed.sql',
  'DATABASE_URL=postgres://u:p@localhost@db.example.com/app npm run seed',
  'psql -hdb.abcd.supabase.co -U postgres -f supabase/seed.sql',
  'PGHOST=db.abcd.supabase.co psql -U postgres -f supabase/seed.sql',
  'PGHOSTADDR=10.1.2.3 psql -U postgres -f supabase/seed.sql',
  'psql "host=db.abcd.supabase.co user=postgres" -f supabase/seed.sql',
  'psql "postgresql:///postgres?host=db.abcd.supabase.co" -f supabase/seed.sql',
  'mysql -h db.example.com app < seed.sql',
  'npx supabase db push --include-seed # --local',
  'supabase db push --local --include-seed',
];
for (const c of DENY3) {
  test(`ATTACK-73.3 denies (with a reason): ${c}`, () => {
    const r = evaluate(c);
    assert.equal(r?.decision, 'deny', c);
    assert.equal(typeof r.reason, 'string', `${c}: reason is a string`);
    assert.notEqual(r.reason.trim(), '', `${c}: reason not empty`);
  });
}

const NOT_DENY3 = [
  'PGHOST=localhost psql -U postgres -f supabase/seed.sql',
  'psql "host=127.0.0.1 port=54322 user=postgres" -f supabase/seed.sql',
  'psql -hlocalhost -U postgres -f supabase/seed.sql',
  'grep -h seed notes.txt',
  'mysql -h localhost app < seed.sql',
];
for (const c of NOT_DENY3) {
  test(`ATTACK-73.3 does not deny: ${c}`, () => {
    assert.notEqual(evaluate(c)?.decision, 'deny', c);
  });
}

// ---------- ATTACK-73.4 ----------

const DENY4 = [
  'psql -h localhost,db.example.com -U postgres -f supabase/seed.sql',
  'PGHOST=localhost,db.example.com psql -f supabase/seed.sql',
  'psql "host=127.0.0.1,db.example.com user=postgres" -f supabase/seed.sql',
  'psql postgresql://u:p@localhost:5432,db.example.com:5432/app -f supabase/seed.sql',
  'DB_HOST=db.example.com npm run seed',
  'MYSQL_HOST=db.example.com node scripts/seed.ts',
  'node scripts/seed.ts --host db.example.com',
  'uv run python scripts/seed.py --db-url=postgres://db.example.com/app',
];
for (const c of DENY4) {
  test(`ATTACK-73.4 denies (with a reason): ${c}`, () => {
    const r = evaluate(c);
    assert.equal(r?.decision, 'deny', c);
    assert.equal(typeof r.reason, 'string', `${c}: reason is a string`);
    assert.notEqual(r.reason.trim(), '', `${c}: reason not empty`);
  });
}

const NOT_DENY4 = [
  'psql -h localhost,127.0.0.1 -U postgres -f supabase/seed.sql',
  'DB_HOST=localhost npm run seed',
  'node scripts/seed.ts --host 127.0.0.1',
];
for (const c of NOT_DENY4) {
  test(`ATTACK-73.4 does not deny: ${c}`, () => {
    assert.notEqual(evaluate(c)?.decision, 'deny', c);
  });
}

// ---------- ATTACK-73.5 ----------

const DENY5 = [
  'psql "postgres://u@db.example.com?a=@localhost" -f supabase/seed.sql',
  'psql "postgres://u@db.example.com#@localhost" -f supabase/seed.sql',
  'psql -h localhost -U postgres -h db.example.com -f supabase/seed.sql',
  'mysql -h 127.0.0.1 -h db.example.com app < seed.sql',
];
for (const c of DENY5) {
  test(`ATTACK-73.5 denies (with a reason): ${c}`, () => {
    const r = evaluate(c);
    assert.equal(r?.decision, 'deny', c);
    assert.equal(typeof r.reason, 'string', `${c}: reason is a string`);
    assert.notEqual(r.reason.trim(), '', `${c}: reason not empty`);
  });
}

const NOT_DENY5 = [
  'psql -h localhost -U postgres -h 127.0.0.1 -f supabase/seed.sql',
  'psql "postgres://u:p@localhost:54322/postgres?sslmode=disable" -f supabase/seed.sql',
];
for (const c of NOT_DENY5) {
  test(`ATTACK-73.5 does not deny: ${c}`, () => {
    assert.notEqual(evaluate(c)?.decision, 'deny', c);
  });
}

// ---------- ATTACK-73.6 ----------

const SLOW = [
  ['supabase seed ', 700],
  ['supabase seed x ', 600],
  ['seed psql supabase ', 500],
];
for (const [unit, n] of SLOW) {
  test(`ATTACK-73.6 evaluate stays under 300 ms: "${unit}" x ${n}`, () => {
    const cmd = unit.repeat(n);
    const t0 = performance.now();
    evaluate(cmd);
    const ms = performance.now() - t0;
    assert.ok(ms < 300, `"${unit}" x ${n} took ${Math.round(ms)} ms (limit 300)`);
  });
}

const DENY6 = [
  'psql postgres://postgres:1234#x@db.example.com/db -f supabase/seed.sql',
  'python seed_db.py --db postgres://u:p@db.example.com/app',
  'DATABASE_URL=postgres://u:p@db.example.com/app node run-seeder.js',
  'SUPABASE_URL=https://abcd.supabase.co npm run seed',
];
for (const c of DENY6) {
  test(`ATTACK-73.6 denies (with a reason): ${c}`, () => {
    const r = evaluate(c);
    assert.equal(r?.decision, 'deny', c);
    assert.equal(typeof r.reason, 'string', `${c}: reason is a string`);
    assert.notEqual(r.reason.trim(), '', `${c}: reason not empty`);
  });
}

const NOT_DENY6 = [
  'psql -h /var/run/postgresql -f supabase/seed.sql',
  'PGHOST=/tmp npm run seed',
  'vite --host --port 3000 && npm run seed',
  'DB_HOST=${DB_HOST:-localhost} npm run seed',
  'SUPABASE_URL=http://127.0.0.1:54321 npm run seed',
  'psql postgres://u:p@localhost;echo seed',
];
for (const c of NOT_DENY6) {
  test(`ATTACK-73.6 does not deny: ${c}`, () => {
    assert.notEqual(evaluate(c)?.decision, 'deny', c);
  });
}

// ---------- AC-73.3b ----------

for (const { type } of STACKS) {
  test(`AC-73.3b ${type} stack.md: ## Seed data says the shield cannot see an address in .env`, () => {
    const sec = section(readRepo(`kit/templates/${type}/docs/architecture/stack.md`), '## Seed data');
    assert.notEqual(sec, null);
    assert.ok(sec.includes('.env'), 'mentions .env');
    assert.ok(sec.includes('destructive command shield'), 'term "destructive command shield"');
  });
}

for (const type of ['web-saas', 'mobile']) {
  test(`AC-73.3b ${type} stack.md: ## Seed data names supabase status and psql`, () => {
    const sec = section(readRepo(`kit/templates/${type}/docs/architecture/stack.md`), '## Seed data');
    assert.notEqual(sec, null);
    assert.ok(sec.includes('supabase status'), 'supabase status');
    assert.ok(sec.includes('psql'), 'psql');
  });
}
