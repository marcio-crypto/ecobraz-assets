# Campaign strategy — VESG-LI-2026-11

## 1. Objective

Convert LinkedIn attention into **intake submissions** on villanovaesg.com (`/supplier-evidence-risk-intake/` EN, `/solicitar-analise/` PT) and qualified DMs. Authority exists to make the sales post credible on the same day; it is not an end in itself.

Target readers:
- Brazilian exporters to the EU — CFO, controller, export director, legal/compliance (PT and EN).
- European buyers — procurement, supplier-risk, compliance, sustainability (EN).

## 2. Two fronts, one day

| | Authority (AM) | Sales (PM) |
|---|---|---|
| Time | 09:00 Europe/Rome | 15:00 Europe/Rome (11:00 São Paulo) |
| Language | EN | alternates EN (odd days) / PT (even days) |
| Format | "Evidence Note NN/30" — numbered series | problem → what the review returns → intake link |
| Length | 900–1,600 chars | 600–1,000 chars |
| CTA | none or a page/DOI link | always one villanovaesg.com link |
| Hashtags | #SupplierEvidence + pillar + audience | #SupplierEvidence + pillar + buyer/exporter tag |
| Label | Fact / Interpretation stated explicitly | disclaimer line ("Advisory review — not audit/certification") |

**Interlinking ("amarrações") rules — these are what make it a campaign, not 60 posts:**
1. The PM sales post answers the AM authority post of the same day. Opening line references it ("This morning's note…", "Sete blocos… desta manhã").
2. Saturday authority post = weekly recap + "next week" teaser. Saturday sales post = buyer-side or intake-only.
3. Every authority note carries the series counter `NN/30`; the last note of each week announces the next pillar.
4. The campaign hashtag `#SupplierEvidence` is on all 60 posts; it is the thread a reader can follow.
5. Pillar hashtag (#CBAM, #EUDR, #CSDDD, #CSRD, #Scope3, #SEMM) matches the week's theme, never mixed.
6. Sales posts rotate the seven service pages so every service gets ≥3 posts in the month; the intake page gets the most.

## 3. Weekly architecture

| Week | Dates | Pillar | Commercial target page |
|---|---|---|---|
| W1 | 1–7 Nov | The evidence gap; SEMM; questionnaires; Fact/Interpretation/Hypothesis | intake, supplier-evidence-file-assessment, contract-clause review, for-european-buyers |
| W2 | 8–14 Nov | CBAM: definitive period, default values, data request, owner of the number, Scope 1/2 vs embedded | cbam-evidence-review, PT revisão page, intake |
| W3 | 15–21 Nov | EUDR: 30 Dec 2026, obligation vs evidence, geolocation, legality, DDS file, SME misreading, 6-folder file | eudr-evidence-readiness-review, PT revisão page, intake |
| W4 | 22–28 Nov | CSDDD post-Omnibus, contract clauses, CSRD value-chain cap, liability → procurement score, board file, evidence index | contract-clause review, eu-brazil-supply-chain-risk-review, PT revisão page, intake |
| W5 | 29–30 Nov | Scope 3 Brazil, continuous evidence management, series recap | scope-3-brazil-programme, continuous-evidence-management |

## 4. Voice

- Executive, cold, specific. Short sentences. Numbered lists where the content is a procedure.
- No sustainability slogans, no "journey", no "delve", no emojis, no exclamation marks.
- Facts carry a legal reference when they are dates/thresholds (Regulation (EU) 2023/1115; Directive (EU) 2026/470).
- "We" = Villanova ESG. Never "I". The page speaks for the firm; Marcio's personal profile reposts selectively (see §7).

## 5. Safe-language gate (hard)

Never: guarantee, risk zero, compliance guaranteed, certification/certified, EU endorsement, Brussels seal, legal advice, audit assurance, "única solução", "100%", blockchain/token, competitor names, invented clients/cases/numbers. Every sales post ends with a one-line scope disclaimer. `scripts/validate.py` fails the build on the regex subset; the Compliance Agent reads the rest.

## 6. KPIs and review cadence

Weekly (Monday): impressions, clicks, CTR per post; intake submissions; DMs; replies/comments from target roles. Decision rule: if a sales post format gets <0.5% CTR for two consecutive weeks, replace the format, not the pillar. If a pillar week produces zero intake submissions, the next month's version of that pillar leads with a buyer-side case structure rather than regulatory explanation.

Not tracked as success: likes, follower count, impressions alone.

## 7. Distribution outside the page (manual, Marcio profile)

- Repost 2 authority notes per week from the personal profile with one added sentence (no copy of the post).
- Do not repost sales posts from the personal profile.
- Weekly newsletter edition (LinkedIn newsletter, EU-BR Supplier Evidence) = the Saturday recap note expanded with the DOI link.
- Comments: "comentar pouco, comentar alto" — only on posts by target roles, only when adding a regulatory or procurement angle.

## 8. December (month 2) — direction, not content

Buyer-side protocols: how a European procurement team should request evidence, score it, and write it into contracts. Same two-front structure. Series name continues ("Evidence Note 31/60"). Content produced by the agent team in `agents/`, validated and scheduled by the Codex pipeline.
