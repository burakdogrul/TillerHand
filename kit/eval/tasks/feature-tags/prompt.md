Feature: tags on notes.

- `POST /notes` and `PATCH /notes/:id` accept an optional `tags` field: an array of strings, at most 5 tags, each 1-20 characters after trimming whitespace. Tags are lowercased with Turkish rules (`İŞ` → `iş`), duplicates are dropped, and first-seen order is kept. A request that breaks the rules returns 400.
- A note without tags is returned with `tags: []`. `tags` sent with `PATCH` replaces the old ones.
- `GET /notes?tag=<tag>` returns only the notes that carry that tag (case-insensitive).
- `GET /tags` returns the tags in the notes of the user in the `x-user` header, with usage counts: `[{ "tag": "iş", "count": 2 }]`, descending by count, alphabetical on ties.
