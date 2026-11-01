# Codex implementation brief — VESG-LI-2026-11

You are implementing the automation layer for a LinkedIn campaign that is **already written and already scheduled**. Do not rewrite content. Do not create duplicate posts. Your job is verification, image attachment, and a repeatable pipeline for the next months.

## 0. Environment

```
METRICOOL_TOKEN=<REST API Access token: Metricool → Account Settings → API>
METRICOOL_USER_ID=5102078
METRICOOL_BLOG_ID=7795884          # brand "Villanova ESG" (LinkedIn org urn:li:organization:115845114)
MEDIA_PUBLIC_BASE=<public https base where rendered cards are hosted>
```

Never commit the token. Never use blogId 6627481 (that is the Ecobraz brand) for this campaign.

Python 3.11+. Dependencies: `requests`, `playwright` (+ `playwright install chromium`).

## 1. Phase 1 — Verify (read-only first)

1. `python3 scripts/validate.py content/posts.json` → must exit 0.
2. `python3 scripts/schedule_posts.py --dry-run` → lists for each of the 60 posts: `EXISTS <metricool_id>` (matched by date + front, text compared) or `MISSING`. Expected: 60 × EXISTS. If any MISSING, run without `--dry-run`; the script only creates the missing ones.
3. If text differs between `posts.json` and the planner for a post, report the diff; do not overwrite unless `--force-text` is passed.

Acceptance: 60 posts in the planner between 2026-11-01 and 2026-11-30, two per day, provider `linkedin`, `autoPublish=true`, `draft=false`.

## 2. Phase 2 — Cards (images)

Why: LinkedIn text-only posts underperform posts with a native image; link previews are secondary. Attach one 1200×627 PNG per post.

1. `python3 scripts/render_cards.py content/posts.json out/cards/` → 60 PNGs named `<id>.png`. Template in `scripts/templates/card.html`; rules in `docs/04_DESIGN_SYSTEM.md`.
2. Host the PNGs at a stable public URL. Two acceptable options:
   - Ghost (villanovaesg.com is Ghost 6): upload through the Ghost Admin API `POST /ghost/api/admin/images/upload/` → returns `https://www.villanovaesg.com/content/images/...`.
   - Cloudflare R2 public bucket (connector exists in the workspace).
   URLs must be permanent and public; Metricool rejects private/expiring links.
3. For each post: normalise then attach (see `docs/03_METRICOOL_INTEGRATION.md`):
   - `GET /api/actions/normalize/image/url?url=<png_url>` → `mediaId`
   - `PUT /api/v2/scheduler/posts/{id}?blogId=&userId=` with the existing post body + `media` set. IDs are in `content/schedule_log.json`. Keep `text`, `publicationDate`, `providers`, `linkedinData` unchanged.
4. `GET` the post back and assert `media` is non-empty.

Acceptance: 60 posts with one image each; text unchanged; dates unchanged.

Important: a post with an image **and** a link in the text shows the image, not the link card. That is intended for sales posts (the link stays clickable in the text).

## 3. Phase 3 — Month 2 pipeline

Build `scripts/run_month.py` that:

1. Takes a `posts.json` for the next month (same schema; produced by the agent team in `agents/`, not by code).
2. Runs `validate.py`; stops on error.
3. Runs `render_cards.py`, uploads, normalises.
4. Runs `schedule_posts.py` (idempotent) with media attached on creation.
5. Writes `schedule_log.json` for that month.
6. Prints a summary table: date, front, lang, id, plannerUrl.

Scheduling rules the code must enforce (not the writer):
- 2 posts/day, every day including weekends; `authority` first, `sales` second.
- Default times `09:00` and `15:00` Europe/Rome; override via `time` field per post.
- Never schedule in the past; never create a `(date, front)` pair that already exists.
- Weekly cadence check: each ISO week must contain ≥1 PT sales post and ≥4 EN authority posts.

## 4. Analytics hook (optional, after Phase 2)

Weekly job (Monday 08:00 Europe/Rome) reading LinkedIn post metrics through Metricool analytics endpoints (see `docs/03_METRICOOL_INTEGRATION.md`, section 5) and writing `reports/week-<iso>.md` with: impressions, clicks, CTR, engagement per post; top 5 authority; top 5 sales; and, from Ghost/GA, intake submissions attributed to `utm_campaign=vesg-li-2026-11`. Clicks and intake submissions are the KPIs. Likes are not.

UTM note: posts were scheduled with clean URLs (link preview reliability). If attribution is required, Phase 2 may rewrite sales links to append `?utm_source=linkedin&utm_medium=social&utm_campaign=vesg-li-2026-11&utm_content=<id>` when updating the post. Only do this when attaching the image (one PUT per post, not two).

## 5. Definition of done

- [ ] `validate.py` exit 0
- [ ] `schedule_posts.py --dry-run` → 60 EXISTS, 0 MISSING
- [ ] 60 cards rendered, hosted, attached; spot-check 5 in the planner visually
- [ ] `run_month.py` runs end-to-end on a 2-post fixture with `--dry-run`
- [ ] No secrets in the repo; `.env.example` present
