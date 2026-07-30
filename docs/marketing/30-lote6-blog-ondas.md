# Lote 6 — Blog 421→~200: plano de ondas e execução

Data: 30/07/2026 · Base: export atualizado (421 posts publicados; 208 EN / 213 PT)
Dados: Ahrefs (backlinks) + GSC 90 dias (impressões/cliques por URL).

## Descoberta que muda o risco

**Backlinks externos de posts ≈ zero.** Ahrefs: toda a autoridade aponta para a
home (405+141 domínios); apenas 1 post tem 1 backlink
(`csddd-enforcement-2026-hidden-cost-global-exporters` — MANTER sempre).
Logo, a poda do blog é de baixo risco de SEO off-page; o cuidado fica com
impressões GSC (top ~100 URLs com ≥22 impressões/90d) e com o funil interno —
que já é global via artigo.js (sidebar, CTA no meio, selo, autor em TODOS os posts).

## Onda 1 — EXECUTADA 30/07 (39 posts, mecânica e segura)

- **17 posts de entidade/meta** (perfis, "quem é", metodologia, "o que afirma",
  listagens públicas) → 301 para as páginas institucionais novas
  (/marcio-villanova/, /the-firm/, /publications/ e twins PT).
- **22 posts-sombra de serviço** (re-vendem revisões que agora têm página v2
  forte) → 301 para a página do serviço correspondente.
- Regras adicionadas ao bloco do painel (total 121). Despublicação gateada na
  colagem, como sempre. 421 → 382.

## Onda 2 — EXECUTADA 30/07 (fusões por cluster: 30 pilares, 56 satélites)

11 clusters fundidos em 4 blocos (A: CBAM caixa 5→1, CBAM aduana 3→1,
antes-do-preço 3→1 · B: renovação 3→1, saída 2→1, memo conselho 3→1 ·
C: salas 2→1, WEEE 3→1, green claims 2→1, escopo 3 3→1 · D: DPP →3
pilares, manifestos →2), sempre EN+PT. 30 pilares reescritos (2.500+
palavras, CTAs→intake, disclaimers 1×, trilha de fontes) e publicados;
56 satélites → rascunho após colagem do bloco (total 177 regras);
amostra de 301 testada ao vivo; auditoria verde (376 URLs, 0 erros).
Blog: 382 → 326 posts. PRs #239–#242.

Clusters EN identificados originalmente (espelhar PT):
- **CBAM cash-flow** (5→1): cbam-2026-carbon-border-tax-cash-flow-impact (pilar)
  ← cbam-2026-carbon-data-cash-flow-variable · cbam-2026-why-carbon-data-became-a-cash-flow-file
  · cbam-2026-turns-emissions-data-into-financial-risk · cbam-brazilian-exporters-embedded-emissions-cash-flow-risk
- **CBAM aduaneiro** (3→1): cbam-customs-codes… (pilar) ← cbam-carbon-data-import-risk · cbam-customs-reality…
- **"Antes do preço"** (3→1): the-supplier-evidence-gap-why…-before-price-discussion (pilar)
  ← european-buyers-will-filter… · why-european-procurement-teams-will-demand…
- **Renovação de contrato** (2→1) · **Saída de fornecedor** (2→1) ·
  **Board memo** (3→1) · **Salas de evidência** (2→1) · **WEEE open scope** (2→1) ·
  **Green claims** (2→1) · **Escopo 3** (3→1) · **DPP satélites** (7→3) ·
  **"não basta/anti-atalho"** (5→2 manifestos).
- Cada fusão: pilar reescrito 2.500+ palavras absorvendo o melhor dos satélites,
  satélites → 301 para o pilar.

## Onda 3 — EXECUTADA 30/07 (poda final com dados: 69 pares, 138 posts)

- Critérios de manutenção (por par EN↔PT, nunca meio-par): pilar das ondas 1–2 ·
  presença no top-100 do GSC (dados atualizados no dia) · alvo de redirect ou
  twin de alvo (para não criar cadeias de 301) · par cujo twin mais ANTIGO é
  ≥ 06/2026 (idade do par = mínimo entre os dois twins — o lote de julho é
  majoritariamente tradução PT de posts antigos EN).
- 101 pares avaliados manualmente → 69 podados / 32 mantidos.
- 138 regras novas de 301 (total do bloco do painel: **315**); todos os alvos
  verificados ao vivo antes da colagem; amostra de 8 redirects testada ao vivo
  após a colagem — todos caindo no alvo correto (incl. twins PT).
- Despublicação gateada na colagem, como sempre: 138/138 → rascunho
  (run com sucesso; o script falha na primeira ocorrência de erro).
- Blog: 326 → **188 posts (~94/idioma)**. pares-idioma.json: 213 → 96 pares.
- Selo "Legal status checked + data" em lote: **adiado deliberadamente** —
  carimbar data nova sem reverificar de fato o status legal violaria a regra
  de transparência. Selos existentes (10 July 2026) preservados intactos.
  Fica como tarefa futura com verificação legal real, cluster a cluster.

## Lote 7 — Auditoria final EXECUTADA 30/07

- Sitemap: 238 URLs únicas, 238/238 checadas ao vivo — 0 não-200, 0 noindex,
  0 slugs mortos, 0 sem canonical, 0 sem hreflang, 0 pares descasados.
  Distribuição de lang: en 120 · pt-BR 112 · it 6. RESULTADO: sitemap limpo.
- Pipeline de leads: /health ok + 2 POSTs de teste (JSON intake e FormData
  magnet) com {"ok":true,"email":"enviado"} — leads chegam marcados TESTE.

## Réguas

Zero backlink perdido (o único post com backlink é intocável) · hreflang par a
par nas fusões (EN e PT juntos) · prévia + auditoria por onda · conteúdo
despublicado preservado em rascunho.
