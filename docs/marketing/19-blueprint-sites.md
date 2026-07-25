# Blueprint dos Sites — diagnóstico consolidado + plano de reforma (para aprovação)

> Consolida as 3 análises de 25/07/2026 (UX/conversão Ecobraz · pesquisa CRO ·
> UX/conversão Villanova — relatórios completos nos agentes). **Aguarda aprovação do
> Marcio antes de qualquer execução.** Guardrails de SEO: doc 18 (invioláveis).

## 1. Veredito científico da tese do Marcio

"Muito texto não converte; visual é fundamental" → **meio certa, e a metade certa é
poderosa**: julgamento estético em ~50ms (Lindgaard 2006); 46% da credibilidade vem
do design (Stanford); linguagem simples converte ~2× (Unbounce, 41 mil páginas).
**A correção que salva o B2B:** a variável é CLAREZA, não quantidade — o comprador
B2B chega ~70% decidido (Gartner/6sense) e vem validar PROVA; cortar profundidade
derrubaria a conversão. **Fórmula travada: "Visual ganha os primeiros 50ms; prova
ganha a reunião" — camadas, não cortes.** 5 regras de ouro: (1) clareza nível
5ª–7ª série na superfície; (2) camadas: topo curto/visual, profundidade embaixo;
(3) 1 CTA primário por persona, formulário ≤3 campos; (4) prova verificável no lugar
de adjetivo (QR clicável, tour do sistema, volumes, licenças); (5) bifurcação por
TAREFA na home, com rótulos inequívocos.

## 2. ECOBRAZ — veredito: reformular PARCIALMENTE

**Preservar (é bom demais para jogar fora):** as ~20 landings B2B (estrutura
persuasiva completa em blocos); a seção de evidências verificáveis da home (ONU, UE,
ORCID — com fonte primária linkada); escopo negativo declarado; estrutura do
formulário em 3 passos; WhatsApp onipresente + instrumentação data-track.

**Os 8 problemas centrais (por impacto):**
1. Funil vaza: o mini-formulário do topo coleta dados que o /agendamento/ descarta —
   o lead redigita tudo (correção já mapeada na auditoria).
2. A home não fala com a PF: H1 e 95% das seções são B2B; o bloco PF é o penúltimo,
   com o botão mais fraco do site.
3. A gratuidade PF está escondida (FAQ diz "depende") — ⚠️ DECISÃO DO MARCIO.
4. **O sistema — diferencial central — não é vendido em página nenhuma** (só um link
   "Acesso do cliente" para URL workers.dev, que passa improviso a quem audita).
5. O modelo comercial (contrato 36m + exclusividade + escada) não existe no site.
6. Zero prova comercial: nenhum volume agregado relevante ("40+ representações
   diplomáticas", toneladas/ano), nenhum case anonimizado.
7. Governo: persona inexistente (nenhuma página/vocabulário).
8. Funil EN quebrado (CTAs para formulário 100% PT — auditoria).

**Blueprint Ecobraz:**
- **Home nova:** hero bifurcado por tarefa — "Quero descartar meus eletrônicos" /
  "Sou empresa e preciso de destinação certificada" / "Órgão público" — + evidências
  preservadas + prova por agregado.
- **Jornada PF:** landing curta e visual (headline simples, 3 passos ilustrados,
  prova emocional, FAQ enxuto, 1 CTA, formulário ≤3 campos adaptado a PF).
- **Jornada PJ (a página central de venda):** hero <30 palavras + certificado QR de
  exemplo CLICÁVEL + tour/screenshots do sistema + bloco por dor (TI/facilities ×
  ESG/financeiro) + "A Conta que Ninguém Fez" (calculadora) + comparativo leilão vs.
  contrato + modelo comercial transparente (36m, o que é grátis, escada) + CTA
  "agendar demonstração" + alternativa de baixo compromisso (apresentação PDF).
- **Governo:** página-validadora documental (licenças, certidões, capacidade técnica,
  contato institucional) — sem persuasão, irrepreensível.
- **Formulário:** passa a usar os dados do mini-form (correção da auditoria), campos
  adaptados por perfil, promessa de prazo de resposta ("retorno em N horas úteis" —
  N definido pelo Marcio), funil EN consertado.
- **Portal:** migrar de workers.dev para domínio próprio (ex.: sistema.ecobraz.org).
- Landings e páginas de materiais: reorganizadas sob as jornadas, slugs preservados.

## 3. VILLANOVA — veredito: ajustar (reforma dirigida, não site novo)

**Preservar:** autoridade verificável (17 DOIs, ECESP, source trail — nenhum
concorrente tem); disciplina dos boundary statements ("is not an audit…"); visual
premium; infraestrutura bilíngue (hreflang, 213 pares); ~220 posts (SEO).

**O problema central (achado nº 1):** o site inteiro vende para o FORNECEDOR
brasileiro — o comprador europeu (nossa persona da tabela de €) é retratado como
"a contraparte". O CTA é "Submit the buyer request". A persona-alvo não se reconhece.
E o SEMM — âncora do produto de €6.500–14.500 — aparece UMA vez no site inteiro,
como item de lista.

**Blueprint Villanova (re-camada sobre o existente):**
1. Home reposicionada buyer-side ("European companies with operations and suppliers
   in Brazil"), com a trilha supplier-side mantida como secundária.
2. Página-âncora do SEMM (níveis, diagrama, whitepaper com captura de e-mail).
3. Três páginas de oferta produtizadas COM faixas de preço (P1 diagnóstico, P2
   retainer, P3 Programa Escopo 3 — Ecobraz como braço de execução com governança
   declarada, não como nota de rodapé).
4. CTA primário: "Agendar conversa de escopo (30 min)" com agendador corporativo;
   formulário com qualificação (cargo, país, nº de fornecedores no Brasil, regulação,
   prazo).
5. Italiano mínimo viável: /it/ + one-pager SEMM + contato (infra de idiomas pronta).
6. Credibilidade institucional: CNPJ/VAT e endereço no footer, LinkedIn, volumes
   agregados da linhagem Ecobraz, 2–3 mini-cases anonimizados.
7. Meio de funil: whitepaper como isca de e-mail; cross-link dos 220 posts para as
   páginas de oferta.

## 4. Decisões do Marcio para liberar a execução

- [ ] **D1 — Gratuidade PF:** comunicar "coleta grátis na Grande SP" abertamente, ou
      manter o "depende"? (Se grátis é real, é o argumento nº 1 da jornada PF.)
- [ ] **D2 — Preços públicos no site:** Villanova com faixas em € (análise recomenda;
      filtra lead e posiciona boutique) e escada do sistema na página PJ da Ecobraz
      (coerente com "único do mercado com preço público")?
- [ ] **D3 — Governo:** criar a página-validadora ou descartar governo como público
      do site?
- [ ] **D4 — Prazo de resposta prometido** no formulário (ex.: "retorno em 24h úteis")
      — qual número a operação sustenta?
- [ ] **D5 — Aprovação geral do blueprint** para iniciar a execução em lotes.

## 5. Plano de execução em lotes (após aprovação)

| Lote | Conteúdo | Risco SEO |
|---|---|---|
| 0 | **301s de recuperação** (404s com backlinks: 173 RD + 2×21 RD + TechTudo DR80) + correções de funil da auditoria (prefill, EN) | zero — só recupera |
| 1 | Página nova da jornada PJ + página do sistema + página Adote (URLs novas) | zero — só adiciona |
| 2 | Home nova bifurcada (mesma URL, conteúdo preservado em camadas) | baixo — monitorado |
| 3 | Jornada PF + formulário adaptativo + governo | baixo |
| 4 | Villanova: home buyer-side + SEMM + 3 ofertas + /it/ | baixo — re-camada |
| 5 | Reorganização de landings sob jornadas + pente-fino SEO completo | controlado por matriz de redirects |
