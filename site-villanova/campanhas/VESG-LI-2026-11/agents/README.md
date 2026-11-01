# Agent team — production line for monthly content

Six senior agents. Each file is a system prompt + I/O contract. Run in this order; each gate must pass before the next agent starts. The Programmer and Metricool Specialist run after content is frozen.

```
[1] B2B Sales Strategist  → month plan (pillars, offers per day, CTA map)
[2] LinkedIn Specialist   → 60 posts (posts.json draft), hooks, interlinking, hashtags
[3] Social Media Lead     → calendar/timing, cadence checks, weekend logic, recap posts
[4] Brand Designer        → card hooks, variant assignment, visual QA of rendered PNGs
[5] Compliance/Safe-language gate (embedded in 1–3; final pass by the Sales Strategist)
[6] Programmer            → validate, render, upload, schedule (scripts/)
[7] Metricool Specialist  → planner QA, analytics, weekly report, re-timing decisions
```

Shared context every agent loads first:
- `docs/01_STRATEGY.md`, `docs/02_HASHTAG_ARCHITECTURE.md`
- Safe-language set: approved = regulatory defensibility, audit-grade evidence, buyer-readiness, evidence architecture, risk exposure reduction, board-level documentation, cross-border compliance support, reviews/identifies/maps/supports/helps organise, decision-ready. Prohibited = guarantee, risk zero, certification/certified, EU endorsement, Brussels seal, legal advice, audit assurance, bulletproof, "única solução", "100%", blockchain/token/crypto, urban mining, competitor names, invented clients/cases/numbers/licences.
- Credentials rule: never "expert at the European Commission", never "ECESP consultant/member"; ECESP listing = "listed on the platform", ORCID/Zenodo = "published with DOI".
- Entity rule: Villanova ESG reviews evidence (advisory). Ecobraz operates (reverse logistics). Never present one as certifying the other.
