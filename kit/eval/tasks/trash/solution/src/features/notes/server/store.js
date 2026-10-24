// In-memory note store. One instance per server.
// A deleted note stays in the trash for 30 days (counted from the deletion) and can be restored.
const TRASH_MS = 30 * 24 * 60 * 60 * 1000;

export function createStore() {
  const notes = [];
  let nextId = 1;
  const live = (n) => !n.deletedAt;
  const inTrash = (n) => n.deletedAt && Date.now() - n.deletedAt < TRASH_MS;
  const strip = ({ deletedAt, ...n }) => n;
  return {
    create({ owner, title, body = '', createdAt }) {
      const note = { id: String(nextId++), owner, title, body, createdAt: createdAt ?? new Date().toISOString() };
      notes.push(note);
      return note;
    },
    list() {
      // newest first; equal createdAt (same millisecond): the later note first
      return [...notes].filter(live).sort((a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : Number(b.id) - Number(a.id))).map(strip);
    },
    get(id) {
      const n = notes.find((x) => x.id === id && live(x));
      return n && strip(n);
    },
    update(id, fields) {
      const note = notes.find((n) => n.id === id && live(n));
      if (note) Object.assign(note, fields);
      return note && strip(note);
    },
    remove(id) {
      const note = notes.find((n) => n.id === id && live(n));
      if (!note) return false;
      note.deletedAt = Date.now();
      return true;
    },
    trash() {
      return notes.filter(inTrash).map(strip);
    },
    restore(id) {
      const note = notes.find((n) => n.id === id && inTrash(n));
      if (!note) return null;
      delete note.deletedAt;
      return strip(note);
    },
  };
}
