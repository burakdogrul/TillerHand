# Security guidance for projects set up with this kit

The model reviews of the security-guidance plugin read this file as an extra checklist. Project-specific rules are in `docs/security/checklist.md`; this file holds only what applies to every project.

- The Supabase secret key (`sb_secret_…`, formerly `service_role`) and every other secret key are used only on the server; they never go into client code or a `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variable.
- In Supabase, RLS is on for every table; a new table is not added without an RLS policy. The policy checks the row owner with `auth.uid()`.
- Every API endpoint and server action checks the session first, then the owner of the resource (IDOR). A `user_id` / `org_id` value that comes from the client is not trusted.
- Webhooks (payment, email, third party) are not processed without signature verification; if the same event arrives twice, it is not processed twice.
- Personal data (name, email, phone, national ID number, location, health) is not logged at INFO level or above and is not sent to error tracking (Sentry). KVKK.
- On file upload, type and size are checked on the server; an uploaded file is not put in a public bucket by default.
- In LLM calls, user input and external content (web page, document) are kept apart as data, not as instructions; model output is not run as SQL, a shell command or HTML without validation.
- Operations that change money, credit or quota run on the server and are atomic; the price sent by the client is not trusted.
