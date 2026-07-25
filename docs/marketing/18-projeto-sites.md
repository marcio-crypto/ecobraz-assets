# Projeto Sites — Ecobraz + Villanova ESG (charter da Fase 2)

> Comissionado pelo Marcio em 25/07/2026: analisar os sites inteiros, pesquisar como
> comunicar com cada persona e o funil, validar a tese "muito texto não converte /
> visual é fundamental", e então **refazer os sites para conversão máxima — sem perder
> um único backlink, posição orgânica ou qualidade técnica.**

## 1. Método (nesta ordem, sem pular etapa)

1. **Análise** (em andamento, 3 análises paralelas em 25/07): UX/conversão do site
   Ecobraz por persona e funil · pesquisa de CRO/comunicação por persona (valida ou
   refuta a tese do visual) · análise do site Villanova.
2. **Blueprint**: arquitetura nova página a página (duas jornadas Ecobraz + governo;
   Villanova com o portfólio aprovado), wireframes em texto, matriz de redirecionamentos.
3. **Aprovação do Marcio** sobre o blueprint (antes de tocar em qualquer página).
4. **Execução em lotes pequenos** (um PR por lote, verificável), começando pela
   página de maior impacto comercial (jornada PJ), com checagem de SEO após cada lote.
5. **Verificação final**: pente-fino de redirects, hreflang, sitemap, posições.

## 2. Guardrails de SEO (invioláveis — a exigência nº 1 do Marcio)

- **Nenhuma URL com backlink ou tráfego morre sem 301** para o equivalente mais próximo.
- **Nenhum conteúdo indexado é apagado** — é reorganizado/reescrito mantendo slug ou
  com 301; a QUANTIDADE de páginas não diminui.
- Title/meta/canonical/hreflang/dados estruturados preservados ou melhorados, nunca
  removidos; pares PT/EN mantidos.
- Toda mudança passa pelos scripts existentes (sync/audit) e pelo pente-fino após deploy.
- Reduzir texto VISÍVEL acima da dobra ≠ reduzir conteúdo indexável: o conteúdo
  profundo desce na página (SEO preservado), o visual assume o topo (conversão).

## 3. Mapa de preservação de backlinks (Ahrefs ao vivo, 25/07/2026)

Perfil: home com **1.057 domínios de referência** (a joia — URL intocável);
totais e páginas críticas na tabela renderizada + achados acionáveis:

| Achado | Ação |
|---|---|
| 🔴 `/pt_BR/blog/...fios-e-cabos...` — **173 domínios de referência, 404** | 301 → versão viva `/blog/...fios-e-cabos...` (200, 150 RD). Recupera o 2º maior ativo de links do site — **ganho imediato, antes mesmo do redesign** |
| 🔴 `/de/blog/logistica-reversa-de-eletronicos...` e `/de/blog/reciclagem-de-eletronicos...` — 21 RD cada, 404 | 301 → equivalentes vivos |
| 🔴 TechTudo DR80 → `/projetos/para-voce/coleta-gratuita-de-e-lixo` 404 (da auditoria) | 301 → /agendamento/ (já mapeado na auditoria, pendente) |
| 🟡 Rotas legadas `/de/`, `/en/`, `/fr/`, `/pt_BR/` ainda recebem links (21–131 RD) | Manter redirects vivos para sempre; conferir cobertura no redirects.yaml |
| 🟡 `/noticias-esg/` (27 RD) sem status | Verificar ao vivo e garantir 200/301 |

## 4. Escopo por site

**Ecobraz (ecobraz.org):** home com bifurcação clara PF/PJ · jornada PJ nova (sistema
em ação, comparativo leilão vs. contrato, "A Conta que Ninguém Fez", demo/CTA) ·
jornada PF simplificada e visual · página do Adote um Bairro (tabela v2) · governo ·
reorganização das ~20 landings B2B e páginas de materiais sob as jornadas ·
correções pendentes da auditoria de 25/07 que tocam conversão (CTAs EN→PT, error.hbs,
footer EN etc.).

**Villanova (villanovaesg.com):** home reposicionada no "vão" (EcoVadis × SMETA ×
consultoria local) · portfólio com a tabela aprovada (P1–P4) · SEMM como prova
central · página do Programa Escopo 3 Brasil · avaliação de idioma italiano ·
CTA = diagnóstico.

## 5. Tese do Marcio a validar (pesquisa em andamento)

"Site com muito texto e não intuitivo não converte; o apelo visual é fundamental."
Posição preliminar da equipe (a confirmar com evidência): a tese está certa na
essência com uma nuance — **clareza converte mais que beleza, e prova converte mais
que os dois**; texto longo mata acima da dobra, mas conteúdo profundo bem organizado
ajuda o comprador B2B consultivo e o SEO. O redesign aplicará: visual e prova no
topo, profundidade embaixo, um CTA por persona. (Veredito final com fontes quando a
pesquisa entregar.)

## 6. Status

- [x] Análises disparadas (3 agentes, 25/07)
- [x] Mapa de backlinks puxado (Ahrefs)
- [ ] Sínteses das análises → blueprint
- [ ] Aprovação do Marcio no blueprint
- [ ] Execução em lotes + verificação
- [ ] Quick win independente do redesign: os 301s dos 404s com backlinks (seção 3)
