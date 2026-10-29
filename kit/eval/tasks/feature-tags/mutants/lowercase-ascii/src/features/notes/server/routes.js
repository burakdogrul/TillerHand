import { sendJson, readJson } from '../../../lib/http.js';

// Valid tags: up to 5 strings, 1-20 characters after trimming; lowercased with Turkish rules, duplicates dropped, order kept.
// Returns null when the input breaks the rules.
function normalizeTags(tags) {
  if (!Array.isArray(tags) || tags.length > 5) return null;
  const out = [];
  for (const t of tags) {
    if (typeof t !== 'string') return null;
    const tag = t.trim().toLowerCase();
    if (tag.length < 1 || tag.length > 20) return null;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

// The caller is identified by the x-user header (the auth layer in front of this service sets it).
export function notesRoutes(store) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const user = req.headers['x-user'];

    if (url.pathname === '/tags' && req.method === 'GET') {
      const counts = new Map();
      for (const n of store.list()) if (n.owner === user) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      const list = [...counts].map(([tag, count]) => ({ tag, count }));
      return sendJson(res, 200, list.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'tr')));
    }

    const match = url.pathname.match(/^\/notes(?:\/([^/]+))?$/);
    if (!match) return false;
    const id = match[1];

    if (!id && req.method === 'GET') {
      const tag = url.searchParams.get('tag')?.toLocaleLowerCase('tr');
      return sendJson(res, 200, store.list().filter((n) => !tag || n.tags.includes(tag)));
    }

    if (!id && req.method === 'POST') {
      const body = await readJson(req);
      if (!body || typeof body.title !== 'string' || !body.title.trim()) return sendJson(res, 400, { error: 'title required' });
      const tags = body.tags === undefined ? [] : normalizeTags(body.tags);
      if (!tags) return sendJson(res, 400, { error: 'invalid tag' });
      return sendJson(res, 201, store.create({ owner: user, title: body.title.trim(), body: body.body, createdAt: body.createdAt, tags }));
    }

    if (id && req.method === 'GET') {
      const note = store.get(id);
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'not found' });
    }

    if (id && req.method === 'PATCH') {
      const body = await readJson(req);
      if (!body) return sendJson(res, 400, { error: 'invalid JSON' });
      const tags = body.tags === undefined ? undefined : normalizeTags(body.tags);
      if (tags === null) return sendJson(res, 400, { error: 'invalid tag' });
      const note = store.update(id, { ...(body.title ? { title: body.title } : {}), ...(body.body !== undefined ? { body: body.body } : {}), ...(tags ? { tags } : {}) });
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'not found' });
    }

    if (id && req.method === 'DELETE') {
      return store.remove(id) ? sendJson(res, 204, {}) : sendJson(res, 404, { error: 'not found' });
    }

    return sendJson(res, 405, { error: 'method not allowed' });
  };
}
