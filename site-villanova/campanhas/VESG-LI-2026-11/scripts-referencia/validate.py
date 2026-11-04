#!/usr/bin/env python3
"""Validate content/posts.json before scheduling.

Checks: JSON parses; 2 posts per date (1 authority + 1 sales); LinkedIn length
(<= 3000 chars; warn > 1600); 2-4 hashtags; campaign hashtag present; links only
from the allowlist; safe-language violations; no cliché AI transitions.

Usage: python3 scripts/validate.py [content/posts.json]
Exit 1 on any error.
"""
import json, re, sys
from collections import defaultdict

PATH = sys.argv[1] if len(sys.argv) > 1 else "content/posts.json"
CAMPAIGN_TAG = "#SupplierEvidence"
ALLOWED_HOSTS = ("https://www.villanovaesg.com/", "https://doi.org/10.5281/zenodo.")
FORBIDDEN = [
    r"\brisco zero\b", r"\bzero risk\b", r"\bgarantia jurídica\b", r"\bcompliance garantido\b",
    r"\bguarantee[ds]?\b", r"\bbulletproof\b", r"\bblindagem\b", r"\bEU endorse", r"\bendosso europeu\b",
    r"\bBrussels seal\b", r"\b100% ", r"\búnica solução\b", r"\bmarket access guaranteed\b",
    r"\bevita sanç", r"\bproteção total\b", r"\bneutraliz", r"\bblockchain\b", r"\btoken\b",
    r"\burban mining\b", r"\bespecialista (da|na) Comissão\b", r"\bexpert da UE\b",
    r"\bem resumo\b", r"\bno cenário atual\b", r"\bmergulh", r"\bjornada\b", r"\bdesvend",
    r"\bpanorama dinâmico\b", r"\bin today's dynamic\b", r"\bdelve\b", r"\bjourney\b",
    r"\bgreenwash", r"\bcertif(ied|icado) by\b",
]
ALLOWED_NEGATED = [r"not (an? )?(audit|certification|guarantee)", r"não (é|emitimos) certificação",
                   r"nem certificação", r"guarantee of any certificate price"]

def main():
    errors, warns = [], []
    data = json.load(open(PATH, encoding="utf-8"))
    posts = data["posts"]
    by_date = defaultdict(list)
    ids = set()
    for p in posts:
        pid = p["id"]
        if pid in ids:
            errors.append(f"{pid}: duplicate id")
        ids.add(pid)
        by_date[p["date"]].append(p["front"])
        t = p["text"]
        n = len(t)
        if n > 3000:
            errors.append(f"{pid}: {n} chars > LinkedIn 3000 limit")
        elif n > 1600:
            warns.append(f"{pid}: {n} chars (long for feed)")
        tags = re.findall(r"#\w+", t)
        if not (2 <= len(tags) <= 4):
            errors.append(f"{pid}: {len(tags)} hashtags (need 2-4)")
        if CAMPAIGN_TAG not in tags:
            errors.append(f"{pid}: missing campaign tag {CAMPAIGN_TAG}")
        for url in re.findall(r"https?://\S+", t):
            if not url.startswith(ALLOWED_HOSTS):
                errors.append(f"{pid}: link not in allowlist: {url}")
        if p.get("link") and p["link"] not in t:
            errors.append(f"{pid}: declared link not present in text")
        low = t.lower()
        for pat in FORBIDDEN:
            for m in re.finditer(pat, low):
                ctx = low[max(0, m.start()-40): m.end()+40]
                if any(re.search(a, ctx) for a in ALLOWED_NEGATED):
                    continue
                errors.append(f"{pid}: forbidden language '{m.group(0)}' in: ...{ctx.strip()}...")
        if p["front"] == "sales" and not p.get("link"):
            errors.append(f"{pid}: sales post without link")
    for d, fronts in sorted(by_date.items()):
        if sorted(fronts) != ["authority", "sales"]:
            errors.append(f"{d}: expected 1 authority + 1 sales, got {fronts}")
    print(f"{len(posts)} posts, {len(by_date)} days")
    for w in warns: print("WARN ", w)
    for e in errors: print("ERROR", e)
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
