#!/usr/bin/env python3
"""Regenerate docs/05_CALENDAR.md from content/posts.json."""
import json, sys
from collections import defaultdict

src = sys.argv[1] if len(sys.argv) > 1 else "content/posts.json"
dst = sys.argv[2] if len(sys.argv) > 2 else "docs/05_CALENDAR.md"
data = json.load(open(src, encoding="utf-8"))
log = {}
try:
    log = json.load(open("content/schedule_log.json", encoding="utf-8")).get("metricool_post_ids", {})
except Exception:
    pass
by_day = defaultdict(dict)
for p in data["posts"]:
    by_day[p["date"]][p["front"]] = p

def first_line(p):
    lines = [l.strip() for l in p["text"].split("\n") if l.strip()]
    if p["front"] == "authority" and lines[0].startswith("Evidence Note"):
        lines = lines[1:]
    return lines[0][:90]

out = [f"# Calendar — {data['campaign']} (times Europe/Rome)\n",
       "| Date | Week | AM authority (EN) | Metricool id | PM sales | lang | link | Metricool id |",
       "|---|---|---|---|---|---|---|---|"]
for d in sorted(by_day):
    a, s = by_day[d].get("authority"), by_day[d].get("sales")
    link = (s.get("link") or "").replace("https://www.villanovaesg.com", "")
    out.append(f"| {d} | {a['week']} | {a['time'][:5]} {first_line(a)} | {log.get(a['id'],'')} | {s['time'][:5]} {first_line(s)} | {s['lang']} | {link} | {log.get(s['id'],'')} |")
open(dst, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("wrote", dst)
