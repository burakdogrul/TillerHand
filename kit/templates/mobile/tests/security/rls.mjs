// RLS attacker test: an anonymous user and a second user must not read, change or delete the first user's data,
// or write on their behalf. A public table with RLS off, or not registered in this test, turns the test red.
// Runs ONLY against a LOCAL Supabase (no dev or prod data touched, no secrets needed). CI: .github/workflows/ci.yml → rls.
//   npx -y supabase@2.120.0 start
//   npx -y supabase@2.120.0 status -o env  → export API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL (see the CI step)
//   node --test tests/security/rls.mjs   (not named .test.mjs: Vitest/Jest must not collect it without the environment)
// Out of scope: views (without security_invoker they run with the owner's rights and skip RLS) and SECURITY DEFINER
// functions. If they are in the public schema, review them by hand or write a separate test.
// For every new table: add it to TABLES. A table everyone reads on purpose (pricing plans etc.) goes to PUBLIC_TABLES; writes must still be closed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// { name: 'notes', owner: 'user_id', sample: () => ({ title: 'secret note' }) }  (if the key column is not "id": key: 'note_id')
const TABLES = [];
// { name: 'plans', sample: () => ({ name: 'trial' }) }
const PUBLIC_TABLES = [];

const API = process.env.API_URL;
const ANON = process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
const DB = process.env.DB_URL;

const isLocal = (u) => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };
if (!API || !ANON || !SERVICE) throw new Error('API_URL, ANON_KEY and SERVICE_ROLE_KEY are missing: start the local Supabase first and export the output of "supabase status -o env" to the environment.');
// If CI skips the table list, a table with RLS off passes unnoticed
if (!DB && process.env.CI) throw new Error(`DB_URL is missing: CI cannot skip the table list. Export DB_URL from the output of "supabase status -o env" to the environment.`);
if (!isLocal(API) || (DB && !isLocal(DB))) throw new Error(`The RLS test only runs against a local Supabase; ${new URL(API).hostname} is not local. Do not run it against a dev or prod project.`);

let client, admin, users;
const newUser = async () => {
  const email = `rls-${randomUUID()}@test.local`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = client(ANON);
  const login = await c.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  return { id: data.user.id, c };
};

before(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  client = (key) => createClient(API, key, { auth: { persistSession: false, autoRefreshToken: false } });
  admin = client(SERVICE);
  users = [await newUser(), await newUser()];
});
after(async () => { for (const k of users ?? []) await admin.auth.admin.deleteUser(k.id); });

function publicTables(t) {
  if (!DB) return t.skip('DB_URL is missing; table list skipped') ?? null;
  try {
    return execFileSync('psql', [DB, '-At', '-F', ':', '-c', "select tablename, rowsecurity from pg_tables where schemaname = 'public'"], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((s) => { const [name, rls] = s.split(':'); return { name, rls: rls === 't' }; });
  } catch (e) {
    if (e.code === 'ENOENT' && !process.env.CI) return t.skip('psql is not installed; it runs in CI') ?? null;
    throw e;
  }
}

test('ATTACK: RLS is on for every public table', (t) => {
  const tables = publicTables(t);
  if (!tables) return;
  assert.deepEqual(tables.filter((x) => !x.rls).map((x) => x.name), [], 'table with RLS off: write "alter table ... enable row level security" and a policy');
});

test('ATTACK: RLS every public table is registered in this test', (t) => {
  const tables = publicTables(t);
  if (!tables) return;
  const registered = new Set([...TABLES, ...PUBLIC_TABLES].map((x) => x.name));
  assert.deepEqual(tables.map((x) => x.name).filter((name) => !registered.has(name)), [], 'Add the new table to the TABLES (or PUBLIC_TABLES) list in tests/security/rls.mjs');
});

for (const { name, owner, sample, key = 'id' } of TABLES) {
  test(`ATTACK: RLS ${name} is closed to other users and to anonymous`, async () => {
    const [a, b] = users;
    const anon = client(ANON);
    const { data: row, error } = await a.c.from(name).insert({ ...sample(), [owner]: a.id }).select().single();
    assert.ifError(error); // the owner must be able to write their own row; if not, sample() or the policy is missing
    const id = row[key];

    assert.equal((await anon.from(name).select().eq(key, id)).data?.length ?? 0, 0, 'anonymous can read');
    assert.equal((await b.c.from(name).select().eq(key, id)).data?.length ?? 0, 0, 'another user can read');
    assert.equal((await b.c.from(name).update({ ...sample(), [owner]: b.id }).eq(key, id).select()).data?.length ?? 0, 0, 'another user can update');
    assert.equal((await b.c.from(name).delete().eq(key, id).select()).data?.length ?? 0, 0, 'another user can delete');
    // Even with 0 rows returned the change may have applied (with no select policy): the row is read again
    assert.deepEqual((await admin.from(name).select().eq(key, id).single()).data, row, 'another user changed or deleted the row');
    assert.ok((await b.c.from(name).insert({ ...sample(), [owner]: a.id })).error, 'another user can write on their behalf');
    assert.ok((await anon.from(name).insert({ ...sample(), [owner]: a.id })).error, 'anonymous can write');
  });
}

for (const { name, sample } of PUBLIC_TABLES) {
  test(`ATTACK: RLS ${name} is public to read but closed to writes`, async () => {
    assert.ok((await client(ANON).from(name).insert(sample())).error, 'anonymous can write');
    assert.ok((await users[1].c.from(name).insert(sample())).error, 'a signed-in user can write');
  });
}
