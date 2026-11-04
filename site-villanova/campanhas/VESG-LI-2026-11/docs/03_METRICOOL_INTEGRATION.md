# Metricool REST integration

Source: Metricool help centre (API basics, scheduler endpoints, FAQ). Verify against the Swagger linked from `https://app.metricool.com/resources/apidocs/index.html` before relying on optional fields — some fields below were observed from the MCP connector's responses and may be named slightly differently in Swagger.

## 1. Authentication

Every call needs three values:
- header `X-Mc-Auth: <token>` (Account Settings → API → REST API Access token)
- query `userId=5102078`
- query `blogId=7795884` (Villanova ESG)

Requests with a body use `Content-Type: application/json`.

Base URL: `https://app.metricool.com/api`

List brands you manage (to confirm the blogId): `GET /admin/simpleProfiles?userId=5102078`

## 2. Scheduler endpoints

| Action | Call |
|---|---|
| Create scheduled post | `POST /v2/scheduler/posts?blogId=&userId=` |
| List scheduled posts between dates | `GET /v2/scheduler/posts?blogId=&userId=&start=<ISO>&end=<ISO>&timezone=Europe/Rome` (parameter names observed as `start`/`end`; confirm in Swagger) |
| Update | `PUT /v2/scheduler/posts/{id}?blogId=&userId=` with the full post body |
| Delete | `DELETE /v2/scheduler/posts/{id}?blogId=&userId=` |

### 2.1 Create — body (as accepted for this campaign)

```json
{
  "text": "…post text…",
  "providers": [{"network": "linkedin"}],
  "publicationDate": {"dateTime": "2026-11-02T09:00:00", "timezone": "Europe/Rome"},
  "autoPublish": true,
  "draft": false,
  "media": [],
  "mediaAltText": [],
  "shortener": false,
  "hasNotReadNotes": false,
  "firstCommentText": "",
  "descendants": [],
  "smartLinkData": {"ids": []},
  "linkedinData": {"previewIncluded": true, "type": "post"}
}
```

Response carries `data.id` (numeric), `data.uuid`, `data.plannerUrl`, and `data.providers[].status` (`PENDING` until published). Metricool stores `publicationDate` in the brand timezone (America/Sao_Paulo) — the planner shows the converted time; pass Europe/Rome and let it convert.

### 2.2 Media

Media links must be public and non-expiring. Before attaching:

```
GET /actions/normalize/image/url?url=<public_png_url>   (+ auth headers/params)
→ { "mediaId": "…", … }
```

Then in the post body: `"media": [{"mediaId": "<id>"}]` (observed; the MCP connector also accepts raw public URLs in `media` — if the raw URL form works in Swagger, prefer it and skip normalisation). Set `mediaAltText` to one entry per media item.

LinkedIn-specific: `linkedinData.publishImagesAsPDF` turns several images into a document carousel — do not set for single-image posts. `videoThumbnailUrl` only for video.

### 2.3 Idempotency rule (implemented in `scripts/schedule_posts.py`)

Key = `(publicationDate.date, front)` where `front` is derived from the text: starts with `Evidence Note` → authority, otherwise sales. Before creating, GET the day's posts; if the key exists, skip (or update text with `--force-text`). This is what allows re-running the pipeline safely.

## 3. Rate and errors

- The FAQ lists plan-based API call limits; usage is visible at Account Settings → API and via `GET /v2/settings/users/{userId}/api-usage-stats?from=&to=&aggregation=`.
- Errors return JSON with a message; `date in the past` and `missing blogId/userId` are the two common ones.
- Browser-side calls fail CORS — always call from a backend/script.

## 4. Review workflow (optional)

The MCP connector exposes `createScheduledPostForReview` / `sendScheduledPostForReview`, which flag a post for approval inside Metricool. The REST equivalent should exist as a flag on the post body; if the team wants Marcio to approve each post in the planner, find that flag in Swagger and set it in `run_month.py` via `--for-review`.

## 5. Analytics (weekly report)

The MCP connector exposes `getAnalyticsAvailableMetrics` and `getAnalyticsDataByMetrics` per network. In REST, open the Metricool LinkedIn analytics page with DevTools → Network and copy the endpoint the app calls (Metricool documents this method as the way to find endpoints not in the PDF). Needed metrics per post: impressions, clicks, engagement, and the post text to map back to `posts.json` IDs. Store weekly under `reports/`.

## 6. Current state to respect

`content/schedule_log.json` holds the 60 live post IDs created on 2026-11-01 via the Metricool MCP connector. They are real; treat them as the baseline. Phase 2 updates them (PUT) — it does not recreate them.
