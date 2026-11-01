#!/usr/bin/env python3
"""Render 1200x627 PNG cards from content/posts.json using scripts/templates/card.html.

Usage: python3 scripts/render_cards.py content/posts.json out/cards/
Requires: pip install playwright && playwright install chromium

Hook rule: post["card_hook"] if present; else first non-label line of the text, trimmed to 110 chars.
Writes out/cards/<id>.png and out/cards/manifest.json {id: {"file":..., "alt":...}}.
"""
import json, os, re, sys, html
from pathlib import Path

PILLAR_BY_WEEK = {"W1": "SUPPLIER EVIDENCE", "W2": "CBAM", "W3": "EUDR", "W4": "CSDDD · CONTRACTS", "W5": "SCOPE 3"}
SERVICE_LABEL = {
    "supplier-evidence-risk-intake": "SCOPE ASSESSMENT", "solicitar-analise": "AVALIAÇÃO DE ESCOPO",
    "supplier-evidence-file-assessment": "SUPPLIER EVIDENCE REVIEW",
    "revisao-evidencias-eudr-cbam-csddd-exportadores": "REVISÃO DE EVIDÊNCIAS",
    "contract-clause-risk-review-eu-facing-suppliers": "CONTRACT CLAUSE RISK REVIEW",
    "cbam-evidence-review-brazilian-suppliers": "CBAM EVIDENCE REVIEW",
    "eudr-evidence-readiness-review": "EUDR EVIDENCE READINESS REVIEW",
    "eu-brazil-supply-chain-risk-review": "EU–BRAZIL SUPPLY CHAIN RISK REVIEW",
    "scope-3-brazil-programme": "SCOPE 3 BRAZIL PROGRAMME",
    "continuous-evidence-management": "CONTINUOUS EVIDENCE MANAGEMENT",
    "for-european-buyers": "FOR EUROPEAN BUYERS",
}

def hook_of(p):
    if p.get("card_hook"):
        return p["card_hook"]
    lines = [l.strip() for l in p["text"].split("\n") if l.strip()]
    if p["front"] == "authority" and lines and lines[0].startswith("Evidence Note"):
        lines = lines[1:]
    h = lines[0] if lines else ""
    h = re.sub(r"\s+", " ", h)
    if len(h) > 110:
        cut = h[:110].rsplit(" ", 1)[0]
        h = cut.rstrip(".,;:—-") + "…"
    return h

def render_html(tpl, p):
    hook = hook_of(p)
    ctx = {"variant": p["front"], "hook": html.escape(hook), "hookclass": "long" if len(hook) > 80 else ""}
    if p["front"] == "authority":
        m = re.match(r"Evidence Note (\d+/\d+)", p["text"])
        ctx["label"] = f"EVIDENCE NOTE {m.group(1)}" if m else "EVIDENCE NOTE"
        ctx["pill"] = PILLAR_BY_WEEK.get(p["week"], "")
        ctx["cta"] = ""; ctx["site"] = ""
    else:
        slug = (p.get("link") or "").rstrip("/").split("/")[-1]
        ctx["label"] = SERVICE_LABEL.get(slug, "SUPPLIER EVIDENCE REVIEW")
        ctx["cta"] = "Envie o pedido do comprador →" if p["lang"] == "pt" else "Send the request you received →"
        ctx["pill"] = ""; ctx["site"] = "1"
    out = tpl
    for k in ("cta", "pill", "site"):
        block = re.search(r"\{\{#%s\}\}(.*?)\{\{/%s\}\}" % (k, k), out, re.S)
        if block:
            out = out.replace(block.group(0), block.group(1) if ctx[k] else "")
    for k, v in ctx.items():
        out = out.replace("{{%s}}" % k, str(v))
    return out, hook

def main():
    src, outdir = sys.argv[1], Path(sys.argv[2])
    outdir.mkdir(parents=True, exist_ok=True)
    tpl = Path(__file__).parent.joinpath("templates/card.html").read_text(encoding="utf-8")
    posts = json.load(open(src, encoding="utf-8"))["posts"]
    from playwright.sync_api import sync_playwright
    manifest = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page(viewport={"width": 1200, "height": 627}, device_scale_factor=1)
        for p in posts:
            htmltxt, hook = render_html(tpl, p)
            page.set_content(htmltxt)
            f = outdir / f"{p['id']}.png"
            page.screenshot(path=str(f), clip={"x": 0, "y": 0, "width": 1200, "height": 627})
            manifest[p["id"]] = {"file": str(f), "alt": hook}
            print("rendered", f)
        b.close()
    json.dump(manifest, open(outdir / "manifest.json", "w", encoding="utf-8"), indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()
