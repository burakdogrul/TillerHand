// In-memory note store. One instance per server.
// Order: newest first; equal createdAt by id, newest first, so a page boundary is always well defined.
export const after = (a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : Number(b.id) - Number(a.id));

export function createStore() {
  const notes = [];
  let nextId = 1;
  return {
    create({ owner, title, body = '', createdAt }) {
      const note = { id: String(nextId++), owner, title, body, createdAt: createdAt ?? new Date().toISOString() };
      notes.push(note);
      return note;
    },
    list() {
      return [...notes].sort(after);
    },
    get(id) {
      return notes.find((n) => n.id === id);
    },
    update(id, fields) {
      const note = notes.find((n) => n.id === id);
      if (note) Object.assign(note, fields);
      return note;
    },
    remove(id) {
      const i = notes.findIndex((n) => n.id === id);
      if (i === -1) return false;
      notes.splice(i, 1);
      return true;
    },
  };
}
