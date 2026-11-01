# Design system — campaign cards

One card per post, 1200×627 px (LinkedIn landscape), PNG, ≤ 1 MB. Rendered from `scripts/templates/card.html` by `scripts/render_cards.py`.

## Palette (inherited from villanovaesg.com)
- Navy: `#020914` (bg), `#061224`, `#071a33` (panels), `#09203f`, `#0a2547`
- Gold: `#b88a3d` (accent), `#c9a45c` (highlight), `#f6efe4` (gold-soft, text on navy)
- White: `#ffffff`; muted: `#aeb7c4` (never below 60% luminance on navy — no translucent text)

## Typography
- Display: Inter (or system sans fallback), 600–700, tight tracking.
- Body: Inter 400.
- Minimum text size on card: 28 px (reads on mobile feed at ~390 px width).

## Two variants

### Authority card
- Background navy `#020914`, left gold rule 8 px.
- Top-left label: `EVIDENCE NOTE NN/30` in gold caps, 24 px, letter-spacing 0.12em.
- Centre: one sentence (the post's hook — first non-label line, ≤ 110 chars) in white, 52–60 px.
- Bottom-left: pillar tag (`CBAM`, `EUDR`, `CSDDD`, …) in a gold-outlined pill.
- Bottom-right: wordmark `VILLANOVA ESG · EU–BRAZIL SUPPLIER EVIDENCE`, 20 px, gold-soft.

### Sales card
- Background panel `#071a33` with a `#020914` outer frame.
- Top-left label: `SUPPLIER EVIDENCE REVIEW` (or the service name from the link slug) in gold caps.
- Centre: the problem line (first line of the post, ≤ 110 chars) in white, 48–56 px.
- Under it: one line in gold-soft, 28 px: `Send the request you received →` (EN) / `Envie o pedido do comprador →` (PT).
- Bottom: `villanovaesg.com` in white, 24 px; wordmark right.

## Rules
- No photos of people, no globes, no leaves, no handshakes, no stock imagery.
- Abstract background allowed: thin diagonal grid lines at 6% white opacity, or a subtle data-flow line pattern. Nothing that competes with the text.
- No logos of third parties (EU flag, LinkedIn, Zenodo).
- Text on the card is derived from `posts.json` — never hand-edit a card; fix the JSON and re-render.
- Alt text (`mediaAltText`) = the hook sentence.

## Render
```
python3 scripts/render_cards.py content/posts.json out/cards/
```
Output: `out/cards/<id>.png` + `out/cards/manifest.json` (id → file → alt text). Hook extraction rules are in the script; override per post with an optional `"card_hook"` field in `posts.json`.
