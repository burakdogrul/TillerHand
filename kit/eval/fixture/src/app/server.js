import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createStore } from '../features/notes/server/store.js';
import { notesRoutes } from '../features/notes/server/routes.js';
import { sendJson } from '../lib/http.js';

export function createApp() {
  const handlers = [notesRoutes(createStore())];
  return http.createServer(async (req, res) => {
    try {
      for (const h of handlers) if ((await h(req, res)) !== false) return;
      sendJson(res, 404, { error: 'bulunamadı' });
    } catch (e) {
      console.error(e);
      sendJson(res, 500, { error: 'sunucu hatası' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`notes-api :${port}`));
}
