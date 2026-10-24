// Shared by the hidden tests: copied next to them into the run folder (tests/__hidden__/).
import { before, after } from 'node:test';
import { createApp } from '../../src/app/server.js';

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
