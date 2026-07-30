# Lote 3 — Mapa de execução: espinha EN de 14 páginas (fusões + 301s)

Data: 30/07/2026 · Base: varredura 100% (doc 28) + export de 30/07 (42 EN + 41 PT publicadas)
Regra inviolável: **zero backlink perdido** — toda página que sai ganha 301 para o destino da fusão, com auditoria automática no deploy.

## A espinha (14 páginas EN)

| # | Página (slug mantido) | Situação | Funde (com 301) |
|---|---|---|---|
| 1 | `home` | ✅ feita no Lote 1 | — |
| 2 | `supplier-evidence-risk-intake` (Start) | ✅ feita no Lote 2 | `contact` (301 já no bloco pendente) |
| 3 | `supplier-evidence-file-assessment` — **Supplier Evidence Review** (serviço central; formatos: Diagnóstico 30 dias · Revisão completa · Retainer) | reescrever v2 | `eu-buyer-readiness-review-brazilian-suppliers` · `board-usable-evidence-review-eu-facing-suppliers` · `eu-buyer-ready-supplier-evidence-review` · `30-day-supplier-evidence-readiness-review` |
| 4 | `cbam-evidence-review-brazilian-suppliers` — **CBAM Review** | reescrever v2 | `cbam-compliance` |
| 5 | `eudr-evidence-readiness-review` — **EUDR Review** | reescrever v2 | `eudr-traceability-evidence-review-brazilian-suppliers` |
| 6 | `contract-clause-risk-review-eu-facing-suppliers` — **CSDDD & Contract Clauses** | reescrever v2 | `csddd-due-diligence` · `eu-brazil-supply-chain-risk-review` · `supply-chain-risk` |
| 7 | `european-product-passport` — **Product Data / DPP** | reescrever v2 | `eu-buyer-readable-evidence-framework-circular-supply-chains` · `circular-supply-chain-evidence-toolkit-non-eu-suppliers` |
| 8 | `for-european-buyers` | revisar CTA (já ganhou visual v2 via compat) | — |
| 9 | `scope-3-brazil-programme` | expandir (hoje 3 KB) | — |
| 10 | `continuous-evidence-management` | expandir (hoje 2,5 KB) | — |
| 11 | `supplier-evidence-maturity-model` — **SEMM** | reescrever v2 (diagrama 5 níveis + gate do whitepaper) | — |
| 12 | `the-firm` — **A Firma + Método** | reescrever v2 (diagrama Ecobraz→Villanova→Comprador) | `what-villanova-esg-reviews` · `brazil-europe-compliance-bridge` |
| 13 | `marcio-villanova` | reescrever v2 (foto + história real) | — |
| 14 | `eu-brazil-supplier-evidence-knowledge-base` — **Biblioteca** (abas/âncoras: Publicações* · Fontes · Glossário · FAQ · Mercado) | reescrever v2 como hub | `reference-villanova-esg-source-trail` · `regulatory-source-trail` · `supplier-evidence-glossary` · `faq-eu-buyer-evidence-brazilian-suppliers` · `eu-brazil-supplier-evidence-market` · manifestos: `brazilian-suppliers-have-an-evidence-problem` · `european-buyers-need-supplier-evidence` · `when-european-buyer-requests-evidence` · `2026-eu-buyer-evidence-file` |

\* `publications` PERMANECE como página própria (recebe links externos de registros técnicos/DOI); a Biblioteca aponta para ela.

Mantidas sem mudança: `privacy` · `terms` · `cookies` · `publications` · `it` (placeholder até o Lote 5).

## 301s novos do Lote 3 (17 regras — entram no bloco pendente do painel)

```
eu-buyer-readiness-review-brazilian-suppliers  → supplier-evidence-file-assessment
board-usable-evidence-review-eu-facing-suppliers → supplier-evidence-file-assessment
eu-buyer-ready-supplier-evidence-review        → supplier-evidence-file-assessment
30-day-supplier-evidence-readiness-review      → supplier-evidence-file-assessment
cbam-compliance                                → cbam-evidence-review-brazilian-suppliers
eudr-traceability-evidence-review-brazilian-suppliers → eudr-evidence-readiness-review
csddd-due-diligence                            → contract-clause-risk-review-eu-facing-suppliers
eu-brazil-supply-chain-risk-review             → contract-clause-risk-review-eu-facing-suppliers
supply-chain-risk                              → contract-clause-risk-review-eu-facing-suppliers
eu-buyer-readable-evidence-framework-circular-supply-chains → european-product-passport
circular-supply-chain-evidence-toolkit-non-eu-suppliers → european-product-passport
what-villanova-esg-reviews                     → the-firm
brazil-europe-compliance-bridge                → the-firm
reference-villanova-esg-source-trail           → eu-brazil-supplier-evidence-knowledge-base
regulatory-source-trail                        → eu-brazil-supplier-evidence-knowledge-base
supplier-evidence-glossary                     → eu-brazil-supplier-evidence-knowledge-base
faq-eu-buyer-evidence-brazilian-suppliers      → eu-brazil-supplier-evidence-knowledge-base
eu-brazil-supplier-evidence-market             → eu-brazil-supplier-evidence-knowledge-base
brazilian-suppliers-have-an-evidence-problem   → eu-brazil-supplier-evidence-knowledge-base
european-buyers-need-supplier-evidence         → eu-brazil-supplier-evidence-knowledge-base
when-european-buyer-requests-evidence          → eu-brazil-supplier-evidence-knowledge-base
2026-eu-buyer-evidence-file                    → eu-brazil-supplier-evidence-knowledge-base
```

Atenção: header/footer/artigo.js apontam para alguns slugs fundidos
(`what-villanova-esg-reviews` no menu). Na onda 3, repontear TODOS os links
internos do tema para os destinos finais ANTES de despublicar.

## Ordem de execução (ondas, cada uma com prévia renderizada + deploy + auditoria)

1. **Onda 1 — Serviços:** páginas 3–7 (reescrita v2 com o melhor conteúdo das fundidas; seções visuais: dor → o que é analisado → entregável → formatos → FAQ → CTA degrau).
2. **Onda 2 — Autoridade:** 11 (SEMM), 12 (Firma), 13 (Marcio), 9–10 (expandir).
3. **Onda 3 — Biblioteca + repontear:** 14 (hub), atualizar menus/links do tema, revisar 8.
4. **Onda 4 — Despublicar + 301:** despublicar as 22 fundidas via sync (status→draft), gerar bloco de redirects consolidado para o Marcio colar no painel, rodar auditorias (sitemap + redirects ao vivo).

Interdependência PT: os pares PT das páginas fundidas seguem o MESMO mapa no
Lote 4 (ex.: `conformidade-cbam` → `revisao-evidencias-cbam`), mantendo o
hreflang íntegro par a par em cada onda.
