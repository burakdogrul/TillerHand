import { sendJson, readJson } from '../../../lib/http.js';

// The caller is identified by the x-user header (the auth layer in front of this service sets it).
export function notesRoutes(store) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const user = req.headers['x-user'];
    const match = url.pathname.match(/^\/notes(?:\/([^/]+))?$/);
    if (!match) return false;
    const id = match[1];
    if (!user) return sendJson(res, 401, { error: 'kimlik gerekli' });
    // Another user's note answers like a missing one: its existence does not leak
    const own = (noteId) => { const n = store.get(noteId); return n && n.owner === user ? n : null; };

    if (!id && req.method === 'GET') return sendJson(res, 200, store.list().filter((n) => n.owner === user));

    if (!id && req.method === 'POST') {
      const body = await readJson(req);
      if (!body || typeof body.title !== 'string' || !body.title.trim()) return sendJson(res, 400, { error: 'title gerekli' });
      return sendJson(res, 201, store.create({ owner: user, title: body.title.trim(), body: body.body, createdAt: body.createdAt }));
    }

    if (id && req.method === 'GET') {
      const note = own(id);
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'bulunamadı' });
    }

    if (id && req.method === 'PATCH') {
      const body = await readJson(req);
      if (!body) return sendJson(res, 400, { error: 'geçersiz JSON' });
      const note = store.update(id, { ...(body.title ? { title: body.title } : {}), ...(body.body !== undefined ? { body: body.body } : {}) });
      return sendJson(res, 200, note);
    }

    if (id && req.method === 'DELETE') {
      return own(id) && store.remove(id) ? sendJson(res, 204, {}) : sendJson(res, 404, { error: 'bulunamadı' });
    }

    return sendJson(res, 405, { error: 'yöntem desteklenmiyor' });
  };
}
