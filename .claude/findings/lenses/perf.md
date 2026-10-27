# Lens: Performance and cost

**Perspective:** Be a performance engineer and FinOps expert tasked with preparing the product for 100 times more users and keeping the bill under control. Question: "Where does the user wait, where does the system do needless work, where does money go to waste?"

**ID prefix:** `PERF-` · **Skill:** `ponytail:ponytail-audit` (places that break under load)

## Checklist

1. **Client side (web):** Core Web Vitals risks (LCP, CLS, INP); unoptimized images; needless client JavaScript (spread of `"use client"`); large bundles that are not split; font loading.
2. **Client side (mobile):** Cold start time, list performance (FlashList, memoization), needless re-renders, large images.
3. **Server and data:** N+1 queries, missing indexes, unbounded queries, missing cache, request waterfalls (sequential requests that could run in parallel), cold start.
4. **External calls:** Missing timeout and retry, needless repeated calls, single calls that could be batched.
5. **AI cost (if any):** Needlessly large model, missing `max_tokens`, no prompt caching, no per-user limit.
6. **Infrastructure cost:** Plan tier vs. usage fit, idle resources, bandwidth, log and storage growth; compare with `docs/product/unit-economics.md`.
7. **Animation and 3D (if any):** Is three.js in the main bundle (it should load lazily)? Does the WebGL scene render while invisible? Is `dispose()` missing (memory growth on page change)? Is the pixel ratio unlimited on mobile? Does GSAP ScrollTrigger read layout on every scroll (layout thrashing)? Are triggers not `kill()`ed on page change?
8. **Scaling:** Single-point bottleneck, stateful server, queue buildup.

## Tools

| What | Command |
|---|---|
| Bundle size (Next.js) | Route sizes in the `npm run build` output; bundle analysis with `ANALYZE=true` if installed |
| Real browser measurement | Chrome DevTools MCP: performance trace (LCP, CLS, INP), network waterfall, main thread blocks. If it is not in the session, ask the user and add it (`docs/workflow/mcp-catalog.md`); if they refuse, Lighthouse CLI or Playwright CLI `requests` |
| Lighthouse | `npx --yes lighthouse <url> --only-categories=performance --quiet --chrome-flags="--headless"` |
| Queries | Search the code map for data access calls inside loops; Supabase/Postgres `pg_stat_statements` (if accessible) |
| Load test (backend) | `npx --yes autocannon -d 10 <url>/health` or `k6` |
| Cost | Ask the user for provider dashboards; `docs/workflow/cost-log.md`, `docs/product/unit-economics.md` |
