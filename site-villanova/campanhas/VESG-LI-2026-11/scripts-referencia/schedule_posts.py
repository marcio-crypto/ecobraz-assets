#!/usr/bin/env python3
"""Idempotent Metricool scheduler for content/posts.json.

Env: METRICOOL_TOKEN, METRICOOL_USER_ID, METRICOOL_BLOG_ID
Usage:
  python3 scripts/schedule_posts.py --dry-run            # report EXISTS / MISSING, create nothing
  python3 scripts/schedule_posts.py                      # create only MISSING posts
  python3 scripts/schedule_posts.py --force-text         # also PUT text where it differs
  python3 scripts/schedule_posts.py --media out/cards/manifest.json   # attach media on create

Idempotency key: (date, front). front = "authority" if text starts with "Evidence Note" else "sales".
Endpoint names follow docs/03_METRICOOL_INTEGRATION.md; confirm against Swagger before first live run.
"""
import argparse, json, os, sys, time
from datetime import datetime, timedelta
import requests

BASE = "https://app.metricool.com/api"
TZ = "Europe/Rome"

def env(k):
    v = os.environ.get(k)
    if not v:
        sys.exit(f"missing env {k}")
    return v

class Metricool:
    def __init__(self):
        self.token, self.user, self.blog = env("METRICOOL_TOKEN"), env("METRICOOL_USER_ID"), env("METRICOOL_BLOG_ID")
        self.s = requests.Session()
        self.s.headers.update({"X-Mc-Auth": self.token, "Content-Type": "application/json"})

    def _p(self, extra=None):
        p = {"blogId": self.blog, "userId": self.user}
        if extra: p.update(extra)
        return p

    def _req(self, method, path, **kw):
        for attempt in range(4):
            r = self.s.request(method, BASE + path, timeout=60, **kw)
            if r.status_code < 500:
                if r.status_code >= 400:
                    raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
                return r.json() if r.text else {}
            time.sleep(2 ** attempt)
        raise RuntimeError(f"{method} {path} failed after retries")

    def list_posts(self, start, end):
        # parameter names observed as start/end; adjust if Swagger differs
        d = self._req("GET", "/v2/scheduler/posts", params=self._p({"start": start, "end": end, "timezone": TZ}))
        return d.get("data", d if isinstance(d, list) else [])

    def create(self, body):
        return self._req("POST", "/v2/scheduler/posts", params=self._p(), data=json.dumps(body))["data"]

    def update(self, post_id, body):
        return self._req("PUT", f"/v2/scheduler/posts/{post_id}", params=self._p(), data=json.dumps(body))

    def normalize(self, url):
        return self._req("GET", "/actions/normalize/image/url", params=self._p({"url": url}))

def front_of(text):
    return "authority" if text.lstrip().startswith("Evidence Note") else "sales"

def body_for(p, media=None):
    b = {
        "text": p["text"],
        "providers": [{"network": "linkedin"}],
        "publicationDate": {"dateTime": f'{p["date"]}T{p["time"]}', "timezone": TZ},
        "autoPublish": True, "draft": False,
        "media": media or [], "mediaAltText": [p.get("card_hook", "")] if media else [],
        "shortener": False, "hasNotReadNotes": False, "firstCommentText": "",
        "descendants": [], "smartLinkData": {"ids": []},
        "linkedinData": {"previewIncluded": True, "type": "post"},
    }
    return b

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("posts", nargs="?", default="content/posts.json")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-text", action="store_true")
    ap.add_argument("--media", help="manifest.json from render_cards.py + upload (id -> public url)")
    ap.add_argument("--log", default="content/schedule_log.json")
    a = ap.parse_args()

    data = json.load(open(a.posts, encoding="utf-8"))
    posts = data["posts"]
    manifest = json.load(open(a.media)) if a.media else {}
    mc = Metricool()

    dates = sorted({p["date"] for p in posts})
    start = f"{dates[0]}T00:00:00+01:00"
    end = (datetime.fromisoformat(dates[-1]) + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00+01:00")
    live = mc.list_posts(start, end)
    index = {}
    for lp in live:
        pd = lp["publicationDate"]["dateTime"][:10]
        index[(pd, front_of(lp["text"]))] = lp

    created, existing, differing = [], [], []
    log = {"blogId": mc.blog, "userId": mc.user, "metricool_post_ids": {}}
    now = datetime.now().astimezone()
    for p in posts:
        key = (p["date"], p["front"])
        if key in index:
            lp = index[key]
            log["metricool_post_ids"][p["id"]] = lp["id"]
            if lp["text"].strip() != p["text"].strip():
                differing.append(p["id"])
                print(f"DIFF   {p['id']} id={lp['id']}")
                if a.force_text and not a.dry_run:
                    lp2 = dict(lp); lp2["text"] = p["text"]
                    mc.update(lp["id"], lp2)
                    print(f"UPDATED {p['id']}")
            else:
                existing.append(p["id"])
                print(f"EXISTS {p['id']} id={lp['id']}")
            continue
        when = datetime.fromisoformat(f'{p["date"]}T{p["time"]}+01:00')
        if when <= now:
            print(f"SKIP   {p['id']} slot in the past")
            continue
        print(f"MISSING {p['id']} {p['date']} {p['time']}")
        if a.dry_run:
            continue
        media = None
        if p["id"] in manifest:
            m = mc.normalize(manifest[p["id"]])
            media = [{"mediaId": m["mediaId"]}] if "mediaId" in m else [manifest[p["id"]]]
        res = mc.create(body_for(p, media))
        log["metricool_post_ids"][p["id"]] = res["id"]
        created.append(p["id"])
        print(f"CREATED {p['id']} id={res['id']} {res.get('plannerUrl','')}")

    print(f"\nexisting={len(existing)} created={len(created)} differing={len(differing)}")
    if not a.dry_run:
        json.dump(log, open(a.log, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()
