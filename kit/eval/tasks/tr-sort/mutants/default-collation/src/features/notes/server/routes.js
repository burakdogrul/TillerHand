import { sendJson, readJson } from '../../../lib/http.js';

// Users write Turkish: ordering and case folding follow Turkish rules (I ↔ ı, İ ↔ i; ç after c, ş after s...)
const fold = (s) => s.toLocaleLowerCase('tr');
const collator = new Intl.Collator('en');

// The caller is identified by the x-user header (the auth layer in front of this service sets it).
export function notesRoutes(store) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const user = req.headers['x-user'];
    const match = url.pathname.match(/^\/notes(?:\/([^/]+))?$/);
    if (!match) return false;
    const id = match[1];

    if (!id && req.method === 'GET') {
      let list = store.list();
      const q = url.searchParams.get('q');
      if (q) list = list.filter((n) => fold(n.title).includes(fold(q)));
      if (url.searchParams.get('sort') === 'title') list = [...list].sort((a, b) => collator.compare(a.title, b.title));
      return sendJson(res, 200, list);
    }

    if (!id && req.method === 'POST') {
      const body = await readJson(req);
      if (!body || typeof body.title !== 'string' || !body.title.trim()) return sendJson(res, 400, { error: 'title gerekli' });
      return sendJson(res, 201, store.create({ owner: user, title: body.title.trim(), body: body.body, createdAt: body.createdAt }));
    }

    if (id && req.method === 'GET') {
      const note = store.get(id);
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'bulunamadı' });
    }

    if (id && req.method === 'PATCH') {
      const body = await readJson(req);
      if (!body) return sendJson(res, 400, { error: 'geçersiz JSON' });
      const note = store.update(id, { ...(body.title ? { title: body.title } : {}), ...(body.body !== undefined ? { body: body.body } : {}) });
      return note ? sendJson(res, 200, note) : sendJson(res, 404, { error: 'bulunamadı' });
    }

    if (id && req.method === 'DELETE') {
      return store.remove(id) ? sendJson(res, 204, {}) : sendJson(res, 404, { error: 'bulunamadı' });
    }

    return sendJson(res, 405, { error: 'yöntem desteklenmiyor' });
  };
}
