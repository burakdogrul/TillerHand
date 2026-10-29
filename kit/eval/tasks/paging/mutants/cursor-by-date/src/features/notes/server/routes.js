import { sendJson, readJson } from '../../../lib/http.js';
import { after } from './store.js';

// The cursor is the position of the last note of a page (createdAt + id): a note added later does not move it
const encode = (n) => Buffer.from(JSON.stringify({ c: n.createdAt, i: n.id })).toString('base64url');
function decode(s) {
  try {
    const p = JSON.parse(Buffer.from(s, 'base64url').toString());
    return typeof p?.c === 'string' && typeof p?.i === 'string' ? { createdAt: p.c, id: p.i } : null;
  } catch { return null; }
}

function page(res, list, url) {
  const raw = url.searchParams.get('limit');
  const limit = raw === null ? 20 : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(limit >= 1 && limit <= 100)) return sendJson(res, 400, { error: 'limit must be 1-100' });
  let rest = list;
  const c = url.searchParams.get('cursor');
  if (c !== null) {
    const pos = decode(c);
    if (!pos) return sendJson(res, 400, { error: 'invalid cursor' });
    rest = list.filter((n) => n.createdAt < pos.createdAt);
  }
  const items = rest.slice(0, limit);
  if (rest.length > limit) res.setHeader('x-next-cursor', encode(items.at(-1)));
  return sendJson(res, 200, items);
}

// The caller is identified by the x-user header (the auth layer in front of this service sets it).
export function notesRoutes(store) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const user = req.headers['x-user'];
    const match = url.pathname.match(/^\/notes(?:\/([^/]+))?$/);
    if (!match) return false;
    const id = match[1];

    if (!id && req.method === 'GET') return page(res, store.list(), url);

    if (!id && req.method === 'POST') {
      const body = await readJson(req);
      if (!body || typeof body.title !== 'string' || !body.title.trim()) return sendJson(res, 400, { error: 'title required' });
      return sendJson(res, 201, store.create({ owner: user, title: body.title.trim(), body: body.body, createdAt: body.createdAt }));
    }

    if (id && req.method === 'GET') {
      const note = store.get(id);
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'not found' });
    }

    if (id && req.method === 'PATCH') {
      const body = await readJson(req);
      if (!body) return sendJson(res, 400, { error: 'invalid JSON' });
      const note = store.update(id, { ...(body.title ? { title: body.title } : {}), ...(body.body !== undefined ? { body: body.body } : {}) });
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'not found' });
    }

    if (id && req.method === 'DELETE') {
      return store.remove(id) ? sendJson(res, 204, {}) : sendJson(res, 404, { error: 'not found' });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  };
}
