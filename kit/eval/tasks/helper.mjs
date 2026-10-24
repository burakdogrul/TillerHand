// Shared by the hidden tests: copied next to them into the run folder (tests/__hidden__/).
import { before, after } from 'node:test';
import { createApp } from '../../src/app/server.js';

// A server of its own for one test (a clean store): const { call, close } = await fresh();
export async function fresh() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, user, body) => {
    const r = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(user !== undefined ? { 'x-user': user } : {}) }, body: body && JSON.stringify(body),
    });
    const text = await r.text();
    let json; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: r.status, json, headers: r.headers };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

export function api() {
  const ctx = {};
  before(async () => {
    ctx.server = createApp().listen(0);
    await new Promise((r) => ctx.server.once('listening', r));
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  });
  after(() => ctx.server.close());
  return async (method, path, user, body) => {
    const r = await fetch(ctx.base + path, {
      method, headers: { 'content-type': 'application/json', ...(user !== undefined ? { 'x-user': user } : {}) }, body: body && JSON.stringify(body),
    });
    const text = await r.text();
    let json; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    return { status: r.status, json };
  };
}
