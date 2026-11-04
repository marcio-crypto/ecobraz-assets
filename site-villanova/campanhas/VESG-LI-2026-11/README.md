# Villanova ESG — LinkedIn Campaign Pack (Metricool)

Campaign ID: `VESG-LI-2026-11` · Brand: Villanova ESG · Channel: LinkedIn company page (via Metricool brand 7795884)

## Status (2026-11-01)

| Item | State |
|---|---|
| Strategy, two fronts (Authority + Sales) | Done — `docs/01_STRATEGY.md` |
| 60 posts, 30 days, 2/day | Written — `content/posts.json` (source of truth) |
| Scheduled in Metricool | **Done. 60/60 live in the planner**, autoPublish, text + link preview — `content/schedule_log.json` |
| Hashtag architecture | Done — `docs/02_HASHTAG_ARCHITECTURE.md` |
| Agent team (6 senior roles) | Specified — `agents/` |
| Metricool REST integration (for Codex) | Specified + reference scripts — `docs/03_METRICOOL_INTEGRATION.md`, `scripts/` |
| Visual cards (images on posts) | **Not yet attached** — Phase 2 for Codex — `docs/04_DESIGN_SYSTEM.md` |

## What Codex must do

Read `docs/00_CODEX_BRIEF.md`. In short:

1. **Phase 1 (verify, do not re-schedule):** run `scripts/validate.py`, then `scripts/schedule_posts.py --dry-run` against the live planner to confirm the 60 posts exist and match `posts.json`. The script is idempotent: it never creates a post whose `(date, front)` already exists.
2. **Phase 2 (images):** render one 1200×627 card per post with `scripts/render_cards.py`, host them at a public URL, and attach them to the existing Metricool posts with `PUT /v2/scheduler/posts/{id}` (IDs in `schedule_log.json`).
3. **Phase 3 (month 2):** generate December from the same JSON schema and pipeline; the agent specs in `agents/` are the production line.

## Folder map

```
README.md
docs/00_CODEX_BRIEF.md            step-by-step implementation + acceptance criteria
docs/01_STRATEGY.md               fronts, pillars, interlinking, cadence, KPIs, rules
docs/02_HASHTAG_ARCHITECTURE.md   tag tiers and per-post rule
docs/03_METRICOOL_INTEGRATION.md  REST API spec, payloads, idempotency, media
docs/04_DESIGN_SYSTEM.md          card templates, palette, typography, image rules
docs/05_CALENDAR.md               human-readable 30-day calendar (generated)
agents/*.md                       6 senior agent specs (roles, inputs, outputs, gates)
content/posts.json                60 posts — the only content source
content/schedule_log.json         Metricool post IDs per post
scripts/validate.py               content lint (length, hashtags, links, safe language)
scripts/schedule_posts.py         idempotent scheduler via Metricool REST
scripts/render_cards.py           HTML → PNG card renderer (Playwright)
scripts/templates/card.html       card template (authority / sales variants)
scripts/make_calendar.py          regenerates docs/05_CALENDAR.md from posts.json
```

## Non-negotiables (apply to every post, every month)

- Safe language only. Never: guarantee, risk zero, certification, EU endorsement, legal advice, audit assurance. `validate.py` enforces a subset; the Compliance gate in `agents/` enforces the rest.
- Every regulatory claim labelled Fact / Interpretation / Hypothesis in the authority front. Verify dates before writing (EUDR 30 Dec 2026 / 30 Jun 2027; CSDDD Omnibus Directive (EU) 2026/470: 5,000 employees / EUR 1.5 bn, application 26 Jul 2029; CSRD 1,000 / EUR 450 m; CBAM definitive period from 1 Jan 2026).
- Links only to `villanovaesg.com` pages that exist (allowlist in `validate.py`) or Zenodo DOIs already published.
- No calls offered in posts. CTA = send the buyer's request through the intake page.
- Commercial metrics that matter: intake submissions, DMs, proposals. Not likes.
