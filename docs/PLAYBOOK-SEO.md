# Playbook SEO vivo — Ecobraz & Villanova ESG

**Propósito:** documento único de referência para a estratégia de crescimento orgânico das duas marcas. Objetivo declarado do cliente: **ultrapassar organicamente a concorrência e manter-se à frente de forma contínua.**

**Data desta versão:** 2026-07-19
**Natureza:** **Documento vivo.** Deve ser atualizado a cada ciclo de trabalho — sempre que houver nova medição (Ahrefs / Google Search Console), nova ação executada ou mudança de posição. O "Registro de mudanças" no fim é para preenchermos continuamente.

> **Aviso honesto que vale para o playbook inteiro:** SEO nunca tem resultado garantido nem data certa. Quem decide o ranking é o Google, e ele leva de semanas a meses para reprocessar mudanças — ainda mais na Ecobraz, cuja migração foi em 14/jul/2026, e na Villanova, que é domínio novo. Tudo aqui separa **fato verificado** (com o dado Ahrefs de 19/07/2026) de **expectativa** (o que esperamos que aconteça, sem promessa de posição). Os números usados são apenas os coletados; não inventamos métricas nem palavras-chave.

---

## 0. Cobertura geográfica (referência — confirmada pelo Marcio em 19/07/2026)

- **Ecobraz:** atende a **Grande São Paulo — raio de ~150 km da capital**. Negócio **local** → SEO local é alavanca forte (Google Business Profile com área de serviço, termos "[cidade]/perto de mim", conteúdo por cidade **de qualidade**, sem páginas "vazias").
- **Villanova:** atua em **todo o Brasil e em toda a União Europeia**. Negócio **B2B, não-local** → sem páginas por cidade; foco em autoridade temática (EUDR/CBAM/CSDDD/supplier evidence) em EN (mercados da UE: DE, NL, FR, etc.) e PT (Brasil inteiro).

## 1. Estado atual (números reais)

Dados Ahrefs coletados em 19/07/2026 (modo subdomínios). Estado técnico verificado no Site Audit.

| Métrica | **Ecobraz** (ecobraz.org) | **Villanova** (villanovaesg.com) |
|---|---|---|
| Domain Rating (DR) | **36** | **34** |
| Backlinks (vivos) | **59.176** | **667** |
| Domínios de referência (vivos) | **903** | **348** |
| Keywords orgânicas | **27** | **0** |
| Tráfego orgânico/mês | **~20 visitas** | **0** |
| Keywords no top-3 | **5** | **0** |
| Saúde técnica (Site Audit) | **100** (~0 erros) | **94** (correção no ar, aguardando re-crawl) |

**Leitura honesta de cada um:**

- **Ecobraz — o descompasso central.** Autoridade **forte** (DR36, 903 domínios, 59 mil backlinks) e tráfego orgânico **quase nulo** (~20 visitas/mês). Isso é o inverso do normal: a maioria dos concorrentes tem menos autoridade e mais tráfego. **Fato:** o problema não é falta de força, é **mira** — conteúdo não otimizado + migração recente (14/jul). A boa notícia: corrigir a mira quando a força já existe costuma render mais rápido do que construir força do zero. **Não é promessa** — é a leitura dos dados.

- **Villanova — semente plantada agora, MAS com um problema sério de backlinks (corrigido nesta versão).** O DR34 com 348 domínios de referência **NÃO é autoridade real** — ao auditar os links um a um (Ahrefs, 19/07/2026), descobri que **~99% são spam de uma rede de links comprados/PBN** (domínios `.shop`/`.store`, `itxoft`, `seoexpress` e similares). Os únicos backlinks legítimos são pouquíssimos (ex.: europa.eu, ghost.org, f6s.com, ecobraz.org). **O Marcio confirmou que NUNCA comprou links** — o padrão aponta para um fornecedor/agência anterior que fez isso sem autorização (mesmo rastro do token "Incognita digital" achado no GSC). ⚠️ **Correção da minha própria avaliação anterior:** eu havia escrito aqui que essa autoridade vinha "de fontes de altíssima confiança (Zenodo, ORCID, citações acadêmicas)" — **isso estava errado**, e eu assumo o erro. A base real de autoridade da Villanova hoje é **quase zero**, não "surpreendentemente forte". O 0 de tráfego orgânico continua **esperado** (domínio novo, conteúdo recém-publicado leva meses). **Ação em curso:** desautorizar (disavow) o spam no Google Search Console — ver seção 4 e o arquivo `docs/PR/disavow-spam-links.txt`.

- **Saúde técnica.** Ecobraz praticamente perfeita (health 100, 0 erro 5xx, 6004 redirects funcionando). Villanova em 94 — os erros são páginas de arquivo paginadas sem meta description; a correção **já está no ar aguardando o robô re-rastrear**. IndexNow ativo nos dois. Isso está **verificado**, não estimado.

---

## 2. O que já foi feito (histórico, por site)

Registro para dar continuidade e não refazer o que já está pronto.

### Ecobraz

- Versão EN completa e navegável; pente-fino de rotas/links/analytics/visual.
- **Migração em 14/jul/2026 com 9069 redirects**; monitoramento diário via `verify-migration.yml`. Bot Analytics: rastreado por Google/Bing/Baidu/Yandex + **GPTBot/ClaudeBot/PerplexityBot/Applebot**; 0 erro 5xx; 6004 redirects funcionando; 404 restantes = fantasmas corretos do site antigo.
- Worker de e-mail de confirmação ao lead; Google tag GT-PHC28JHZ.
- `canonical_url` em 4 páginas de autor (fora do sitemap); `og:url` em páginas paginadas; metas encurtadas; seção Colunistas no rodapé; `html lang`; bio de autor (edição manual).
- Ahrefs Web Analytics (0.12.5) + meta tag de verificação de propriedade (0.12.6).
- Tentativa de 73 redirects de cauda-longa **REVERTIDA** — o Ghost estava no limite de regras e não aplicava novas.

### Villanova

- Tema institucional bilíngue padronizado; ~41 páginas reescritas + pares PT; **~212 posts traduzidos EN→PT e publicados**; duplicata "-2" despublicada.
- GA4 reinstalado + **Microsoft Clarity** (mapa de calor).
- **IndexNow automático ao publicar** + Worker Cloudflare servindo a chave na raiz.
- `hreflang` (en / pt-BR / x-default) nos pares via codeinjection; `html lang` bilíngue via foreach+match no tema; hreflang das 12 duplicatas limpo.
- Rodapé com 5 páginas EN antes órfãs, agora linkadas; 11 meta descriptions longas encurtadas; meta description em páginas paginadas de arquivo (tema 1.2.7).
- Ahrefs Web Analytics (1.2.8) + meta tag de verificação (1.2.9); imagem feature WEEE otimizada (1,9 MB PNG → 314 KB JPEG).

---

## 3. Plano priorizado (por site, Impacto × Esforço × Responsável)

Consolida as 4 fontes sem repetir. **Responsável:** *Eu* (assistente, executo sozinho) ou *Marcio* (depende de relação humana, verificação, seu nome ou dinheiro). Ordenado do maior retorno para o menor.

### 3.1 ECOBRAZ — corrigir a mira (o conteúdo é o gargalo; backlink é a 2ª prioridade)

| # | Ação | Impacto | Esforço | Responsável |
|---|---|---|---|---|
| 1 | Otimizar a página **"lixo eletronico"** (pos22, vol 2.700, KD1) — o maior prêmio de curto prazo: termo no H1, meta e 1º parágrafo; texto completo (o que é, exemplos, como descartar, por quê); links internos apontando pra ela | **Muito alto** | Baixo | **Eu** |
| 2 | **Abrir a comporta da autoridade:** links internos dos posts fortes (que receberam os backlinks) → páginas de serviço, com âncora comercial ("coleta de lixo eletrônico", "descarte de lixo eletrônico") | **Muito alto** | Baixo | **Eu** |
| 3 | **Google Business Profile** — verificar se já existe; se não, criar. Destrava todo o SEO local | **Alto** | Baixo | **Marcio** (eu guio clique a clique) |
| 4 | Investigar **"descarte de geladeira"** (pos1, vol 300, **0 tráfego** — anomalia a diagnosticar) e **"pgrs"** (pos5, numa página **/es/** antiga errada) | Alto (correção barata) | Baixo | **Eu** investigo; correção pode precisar de decisão do Marcio |
| 5 | Otimizar **"o que e lixo eletronico"** (pos15, vol 600, KD1) — bloco de resposta direta no topo ("Lixo eletrônico é…") | Alto | Baixo | **Eu** |
| 6 | **Corrigir o descasamento** post × serviço: apontar os termos comerciais (coleta/descarte/reciclagem) para **páginas de serviço**, não para artigos de blog | **Muito alto** (estratégico) | Médio | **Eu** escrevo; **Marcio** revisa a oferta |
| 7 | Criar página **"descarte de pilhas e baterias"** (vol 1.000, KD2) — melhor lacuna do site; cobre junto "descarte correto…" (vol 90, KD0) | Alto | Médio | **Eu** escrevo; **Marcio** revisa |
| 8 | **Páginas por cidade** de SEO local, só onde a Ecobraz atende de verdade ("Coleta de lixo eletrônico em [cidade]") | Alto (somado) | Médio | **Marcio** dá a lista de cidades; **Eu** crio |
| 9 | Empurrar alvos de 1ª página: **"lixo eletronico exemplos"** (pos8) com lista clara; **"mapa mental lixo eletronico"** (pos10) melhorando imagem/alt | Médio | Baixo | **Eu** |
| 10 | Página **"ponto(s) de coleta de lixo eletronico"** (vol 50, KD8-10, local) com endereços/mapa | Médio | Baixo-Médio | **Eu** monto; **Marcio** informa os pontos |
| 11 | Páginas de **reciclagem de resíduos / componentes eletrônicos** (vol 20 cada, KD1-2) | Baixo | Baixo | **Eu** |
| 12 | **Auditar os 903 domínios que já linkam** e recuperar links apontando para URLs mortas do site antigo (/es/, /en/, fantasmas) | Alto | Baixo | **Eu** levanto; correção técnica (redirect já existe) |

**A regra prática que orienta a Ecobraz:** post informacional **atrai e educa**; **página de serviço é quem tem que rankear os termos comerciais.** Hoje isso está trocado. E a autoridade forte (DR36) está "presa" nos posts de blog que receberam os backlinks — os itens 1, 2 e 6 são exatamente redistribuir força que a Ecobraz **já tem**, sem depender de conteúdo novo nem de links novos. Por isso lideram a lista.

**Sobre bater a concorrência (fato):** os concorrentes medidos são greeneletron.org.br (DR62, 4.854 tráfego, 786 kw — **alvo direto**), reciclasampa.com.br (DR45, 9.742), ambiental.sc (DR30), bbbaterias.com.br (DR20, mas **26.806** de tráfego — prova de que termos certos vencem DR). **Expectativa honesta:** bater o greeneletron no head-to-head dos termos-cabeça é **improvável no curto prazo**. O caminho realista é ganhar por **KD baixo, SEO local e conteúdo melhor** — não por força bruta de DR.

### 3.2 VILLANOVA — construir os clusters onde o comprador de alto valor está (EN)

O nicho é B2B regulatório UE-Brasil: **volumes baixos, KD baixo (0-12), CPC altíssimo ($130-$700)**. Traduzindo: poucas visitas, mas cada uma vale muito. **O critério de sucesso da Villanova NÃO é tráfego — é lead qualificado.** Um único comprador certo (empresa que precisa se adequar a CSDDD/EUDR) paga o esforço inteiro.

| # | Ação | Impacto | Esforço | Responsável |
|---|---|---|---|---|
| 1 | Página-pilar **Supplier evidence** — "esg supply chain due diligence" (vol 150, **KD0**, CPC $600) + satélite "supplier traceability" (vol 90, CPC $300) | **Alto** (KD0 = mais fácil de ranquear) | Baixo | **Eu** redijo EN; **Marcio** revisa |
| 2 | **Linkagem interna dos 4 clusters** + pilares no menu e na home (distribui o DR34 para as páginas certas) | **Alto** | Baixo | **Eu** |
| 3 | Página-pilar **EUDR** — "eudr compliance" (vol 500, **KD5**, CPC $300) + satélites "what is eudr compliance" (90) e "eudr compliance checklist" (30, ótimo ímã de lead) | **Alto** (maior volume ganhável) | Médio | **Eu** redijo EN; **Marcio** publica |
| 4 | Artigos **CSDDD** — "csddd timeline" (vol 150, KD6, CPC $600) e "csddd requirements" (vol 200, KD12, CPC $200). Preparam o ataque futuro ao termo-cabeça "csddd" (vol 800, **KD37 — alto demais para agora**) | **Alto** (constroem autoridade no tema) | Médio | **Eu**; **Marcio** revisa |
| 5 | **Depositar 1 guia forte no Zenodo/ORCID** (whitepaper com DOI) — cria backlinks acadêmicos de alta confiança e **constrói do zero** a autoridade real que hoje o site não tem (os 348 domínios atuais são spam, ver §4). Esta é a via para autoridade legítima | **Alto** (constrói autoridade verdadeira) | Médio | **Eu** redijo; **Marcio** deposita/assina |
| 6 | Cluster/satélites **CBAM** em EN ("cbam compliance", vol 100) | Médio | Médio | **Eu** |
| 7 | Exibir **registro CE / credenciais** nas páginas-pilar (autoridade E-E-A-T + conversão em nicho regulatório) | Médio | Baixo | **Marcio** confirma o exibível; **Eu** insiro |
| 8 | Versões **PT** de "o que é EUDR / CBAM" reaproveitando o EN (curiosidade + agronegócio brasileiro) | Médio-baixo | Baixo | **Eu** |

**Alerta honesto sobre o PT (fato dos dados):** "cbam" em PT mostra vol 1.500/KD1, mas está **contaminado por fisiculturismo** ("cbam atleta" 200, "cbam fisiculturismo" 90) — o volume regulatório real é bem menor. **Não devemos nos empolgar com esse 1.500.** O dinheiro está no EN (70-80% do esforço); o PT é presença local e captura de curiosidade barata (20-30%), oportunista.

---

## 3b. Primeiros 30 dias (ordem concreta)

Sequência pensada por impacto/esforço, misturando o que eu executo sozinho com o único passo que depende do Marcio logo no início.

1. **Marcio:** iniciar a verificação dos dois sites no **Google Search Console** (ver seção 6) — ~10 minutos dele, destrava toda a medição e a priorização. **Este é o passo mais alto retorno / menor esforço do playbook.**
2. **Marcio:** confirmar se **já existe Google Business Profile** da Ecobraz; se não, criamos juntos (destrava o SEO local).
3. **Eu:** otimizar a página **"lixo eletronico"** (Ecobraz, pos22/2.700/KD1) — o maior prêmio de curto prazo.
4. **Eu:** montar a **malha de links internos** da Ecobraz (posts fortes → páginas de serviço) e reforçar a página "lixo eletronico".
5. **Eu:** investigar as duas anomalias da Ecobraz — **"descarte de geladeira"** (pos1, 0 tráfego) e **"pgrs"** (página /es/ errada) — e trazer o diagnóstico.
6. **Eu:** criar a página-pilar **Supplier evidence** da Villanova ("esg supply chain due diligence", KD0) e a **linkagem interna dos 4 clusters**.
7. **Eu:** otimizar **"o que e lixo eletronico"** (Ecobraz, pos15/600/KD1) com bloco de resposta direta.
8. **Eu, em paralelo:** redigir o primeiro **guia forte** da Villanova para depósito no Zenodo/ORCID (Marcio assina/deposita quando pronto).

---

## 4. Autoridade / backlinks (resumo acionável)

**Princípio:** DR maior larga na frente **exceto** quando o termo é fácil (KD baixo), o conteúdo do outro é fraco, ou a busca é local — é aí que se ganha mesmo com DR menor.

**Ecobraz (backlink é a 2ª prioridade — o gargalo é conteúdo):**
- **Eu executo/rascunho:** auditar os 903 domínios e recuperar links quebrados; montar listas de diretórios de reciclagem/logística reversa BR (ABREE e similares) e rascunhar cadastros; escrever guest posts (sustentabilidade/ESG/gestão de resíduos), releases de imprensa setorial e o selo HTML "descarte responsável por Ecobraz".
- **Depende do Marcio:** criar/verificar o Google Business Profile + citações locais (nome/endereço/telefone iguais em diretórios); aprovar e enviar dados oficiais; abrir portas com jornalistas, blogs, clientes e parceiros. **Se só puder fazer uma coisa: o Perfil do Google + citações locais** (maior retorno, menor esforço, onde não dependemos de DR).

**Villanova (autoridade real a construir do zero + limpeza urgente do spam herdado):**

> ⚠️ **Achado crítico (19/07/2026):** os 348 domínios de referência da Villanova são **~99% spam de rede de links comprados/PBN**, herdados de um fornecedor anterior (o Marcio confirmou que nunca comprou links). Isso **não** é autoridade — é risco. Antes de construir, é preciso **limpar**.

- **Limpeza (prioridade nº1 — Marcio executa, Eu preparo):** submeter o **disavow** no Google Search Console usando o arquivo já pronto `docs/PR/disavow-spam-links.txt` (106 domínios de spam claros). Antes, checar **GSC → Segurança e ações manuais** para ver se há penalidade ativa. Passo a passo detalhado no guia de remediação.
- **Eu executo/rascunho:** whitepapers/datasets técnicos para Zenodo/ORCID (**autoridade legítima construída do zero**); listas de diretórios RegTech/ESG B2B; guest posts EN em publicações de compliance/comércio internacional; releases posicionando a Villanova como fonte citável.
- **Depende do Marcio:** validar e publicar o material científico sob autoria/ORCID (**a via real de autoridade** — a única que constrói DR legítimo); garantir que Zenodo/ORCID/futuras publicações apontem para as páginas-pilar, não só para a home; abrir relações com escritórios de advocacia, consultorias de comex e câmaras Brasil-UE.

---

## 5. IA-search (AEO) — ser citado por ChatGPT, Perplexity, Claude

**Fato verificado (Bot Analytics Ecobraz):** GPTBot, ClaudeBot, PerplexityBot e Applebot **já rastreiam** o site — a porta está aberta. **O que ainda não sabemos** (não temos como verificar com os dados atuais): se elas de fato **nos citam** nas respostas. Rastrear é pré-condição, não é o mesmo que ser citado.

**O que aumenta a chance de citação (tudo baixo esforço, tudo Eu, na redação):**
1. **Bloco de resposta direta** no topo de cada página (responder a pergunta em 2-3 frases antes de qualquer introdução).
2. **Dados estruturados FAQ e HowTo** (perguntas-e-respostas marcadas no código).
3. **Definições explícitas e citáveis** em uma frase ("Lixo eletrônico é…", "EUDR é…").
4. **Schema Organization** (quem é a empresa que responde).
5. **Listas e tabelas objetivas** (as IAs extraem bem: "tipos de lixo eletrônico", "etapas do descarte").
6. **Datas visíveis** de publicação/atualização.
7. **Citar legislação e dados verificáveis** (PNRS, logística reversa) — aqui o Marcio valida os fatos do setor quando eu tiver dúvida.

**Onde AEO é mais promissor:** a **Villanova**. O nicho é cheio de perguntas "o que é / como cumprir / qual o prazo" (csddd meaning, what is eudr compliance, csddd requirements, csddd timeline) — exatamente o que se pergunta ao ChatGPT, e cada resposta pode ser um lead de altíssimo valor. Na Ecobraz, o formato que já rankeia (posts informacionais) é justamente o que as IAs mais citam — vantagem real. **Expectativa honesta:** citação por IA é território novo e instável, sem garantia; hoje **não medimos** menções de marca em IA — passa a ser possível quando o GSC estiver verificado e o Ahrefs trouxer dados de IA.

---

## 6. Manutenção técnica contínua (resumo acionável)

**Fato verificado hoje:** Ecobraz health 100, 0 erro 5xx, 6004 redirects ok; Villanova health 94 (correção no ar aguardando re-crawl); hreflang, canônicas, metas e OG corrigidos; IndexNow ativo nos dois.

| O que monitorar | Frequência | Responsável |
|---|---|---|
| Site Audit (health score) | Mensal | **Eu** |
| Core Web Vitals (velocidade/estabilidade) | Mensal | **Eu** monitoro; correção pode depender de ajuste no Ghost |
| 404 novos | Mensal | **Eu** |
| Indexação (páginas realmente indexadas) | Mensal | **Eu**, após GSC verificado |
| Villanova health voltar a ~100 após re-crawl | Próximas semanas | **Eu** verifico |

**Ponto de atenção — mapa de redirects no limite.** O Ghost já tem **9069 regras** e está no **limite prático**. Hoje tudo funciona (os 404 restantes são fantasmas corretos). **Carta na manga:** se um dia precisarmos de muitos redirects novos (ex.: reorganizar URLs comerciais), o plano é **migrar os redirects para o Cloudflare**, que aguenta muito mais. Não é para agora — aviso o Marcio com antecedência se chegarmos lá (decisão dele).

---

## 7. Medição (KPIs)

**Passo que destrava tudo — depende do Marcio (~10 min):** verificar os dois sites no **Google Search Console (GSC)**. É a fonte de verdade do Google: mostra por quais buscas nos acham, em que posição e quantos cliques. Sem ele, trabalho com estimativa do Ahrefs — "no escuro". Com ele, priorizo as páginas certas e explico anomalias como "descarte de geladeira" (pos1, 0 tráfego).

**Passo a passo para o Marcio:**
1. Abrir **search.google.com/search-console** e entrar com a conta Google da empresa.
2. Clicar em **"Adicionar propriedade"** e digitar o domínio — fazer para **ecobraz.org** e depois para **villanovaesg.com**.
3. O Google mostra um **código de verificação (registro TXT)**.
4. **Me mandar esse código** — é só verificação, **não é senha nem chave secreta**, pode compartilhar sem risco. Eu configuro no Cloudflare e confirmo.
   *(Passos 1-3 são do Marcio, por envolverem a conta Google dele; o passo 4 é comigo.)*

**Painel mensal de KPIs (monto e atualizo — Eu):**

| KPI | O que mede | Ponto de partida (verificado hoje) |
|---|---|---|
| Tráfego orgânico/mês | Visitas vindas de busca | Ecobraz ~20 · Villanova 0 |
| Keywords no top-10 | Termos na 1ª página | Ecobraz 5 no top-3 (de 27 kw) · Villanova 0 |
| Posição média | Onde aparecemos, em média | A definir com o GSC |
| Leads / contatos | Negócio gerado | Depende de o Marcio informar |
| (futuro) Menções em IA | Citações em ChatGPT/Perplexity/Claude | Não medido ainda |

**Nota honesta:** verificar o GSC **não melhora posição por si só** — destrava a medição e a priorização (e dá um empurrão de indexação). Todo mês entrego a leitura honesta ("subiu/caiu/estável e por quê"), sempre marcando o que é dado do Google (GSC) vs estimativa (Ahrefs). Para a Villanova, o normal é **não haver movimento** nas primeiras medições — é domínio novo.

---

## 8. Registro de mudanças

Preencher a cada ação executada, para acompanharmos causa e efeito ao longo da vida dos sites.

| Data | Site | O que foi feito | Efeito observado |
|---|---|---|---|
| 2026-07-19 | Ecobraz | Post carro-chefe "lixo eletrônico" otimizado: meta reescrita + 4 links internos p/ páginas de serviço + CTA | Aguardando re-crawl (medir posição de "lixo eletrônico", hoje pos. 22) |
| 2026-07-19 | Ecobraz | 14 posts fortes sem link ganharam link interno contextual → páginas de serviço (abrir comporta da autoridade) | Aguardando re-crawl |
| 2026-07-19 | (nota) | Confirmado: **Ecobraz NÃO coleta pilhas domésticas** — nenhum conteúdo deve prometer isso | — |
| 2026-07-19 | Ecobraz | 6 posts do mesmo tema passaram a linkar **para** o carro-chefe "lixo eletrônico" (concentra autoridade no termo de 2.700) | Aguardando re-crawl |
| 2026-07-19 | (achado) | Investigação: 90% da oportunidade Ecobraz está no post carro-chefe (já otimizado). "pgrs" (vol 120) sendo redirecionado p/ página não-relacionada → tende a perder ranking (recuperação = baixa prioridade). GSC dos 2 sites verificado + sitemaps processados. Villanova = on-page já forte; gargalo é tempo+backlinks. | — |
| 2026-07-19 | (nota) | GSC↔Ahrefs ainda não conectado (opcional) — dados do Google via Ahrefs indisponíveis até conectar | — |
| 2026-07-19 | Ecobraz | SEO local: seção "Área de cobertura" (Grande SP/150km) na página principal + **3 páginas locais de qualidade** (Guarulhos, ABC, Campinas), conteúdo diferenciado e tom honesto de avaliação | Aguardando indexação |
| 2026-07-19 | (pendência Marcio) | Google Business Profile da Ecobraz: configurar **área de serviço** = Grande SP/150km + categoria correta (maior alavanca do SEO local) | — |
| 2026-07-19 | Villanova | ⚠️ **ACHADO CRÍTICO + correção de erro meu:** auditei os 348 domínios de referência e descobri que **~99% são spam de rede PBN/links comprados** (`.shop`/`.store`, itxoft, seoexpress). Marcio confirmou que nunca comprou links → fornecedor anterior não autorizado. **Corrigi o playbook**, que antes afirmava (errado) que a autoridade vinha de Zenodo/ORCID/acadêmico. Preparei `docs/PR/disavow-spam-links.txt` (106 domínios) + guia de remediação. | Autoridade real da Villanova ≈ zero; disavow a submeter no GSC (Marcio) |
| 2026-07-19 | Ecobraz | Auditoria de backlinks: núcleo de links reais existe (diferente da Villanova), mas há **parte de spam da mesma rede**. Incluída na limpeza/disavow. | Verificar ações manuais no GSC |
| 2026-07-19 | Ecobraz | **Kits de backlink prontos:** `docs/PR/kit-parceiro-ecobraz.md` (selo HTML autossuficiente — verificado o render + textos p/ clientes linkarem) e `docs/PR/kit-cadastro-diretorios-ecobraz.md` (NAP padrão + 3 descrições + categorias, copiar/colar). | Depende do Marcio: enviar aos clientes / cadastrar nos diretórios (login é dele) |
| 2026-07-19 | Ecobraz | ✅ **Ações manuais checadas no GSC = "Nenhum problema detectado"** (sem penalidade). **Disavow SUBMETIDO** (114 domínios) na propriedade URL-prefix `https://ecobraz.org/` às 17:10 — Marcio executou; verificado em tela. (Obs.: disavow não aceita propriedade "Domínio"; criada propriedade "Prefixo do URL" para isso.) | Aguardar semanas o Google reprocessar |
| 2026-07-19 | Villanova | ✅ **Disavow SUBMETIDO** (114 domínios) na propriedade URL-prefix `https://villanovaesg.com/` às 17:12 — Marcio executou; verificado em tela. | Aguardar reprocessamento; DR pode cair (bom sinal = autoridade falsa saindo) |
| 2026-07-19 | Villanova | ✅ **Autoridade legítima — 18º registro Zenodo PUBLICADO:** whitepaper *Supplier Evidence Maturity Model (SEMM)* depositado por Marcio, **DOI 10.5281/zenodo.21445455** (CC BY 4.0, Report, aberto). Artefato citável (modelo + matriz) mirando "supplier evidence"/"eudr compliance checklist". Fonte/PDF/guia em `docs/villanova/`. | Registro adicionado à página /publications do site; medir tráfego/backlink ao longo do tempo |

---

### Balanço honesto desta versão

- **Fato (Ahrefs 19/07/2026):** todos os DR, tráfegos, keywords, backlinks, volumes, KD e CPC citados; o descompasso da Ecobraz (autoridade forte, tráfego ~zero) e o zero orgânico da Villanova; a saúde técnica (Ecobraz 100, Villanova 94 em correção).
- **Correção de avaliação (assumo o erro):** eu havia classificado a autoridade de backlinks da Villanova como "surpreendentemente forte / de fontes acadêmicas". Ao auditar link a link, o real é o oposto: **~99% é spam de rede PBN herdada de fornecedor anterior**. Corrigido em todo o playbook nesta versão. A autoridade legítima da Villanova será **construída do zero** (Zenodo/ORCID), não "aproveitada".
- **Expectativa, não garantia:** que as otimizações subam posições e que os termos KD 0-12 rankeiem em alguns meses. O Google decide; eu controlo a qualidade da execução, não o resultado.
- **Pendências que dependem do Marcio:** verificar o GSC (destrava tudo); Google Business Profile + lista de cidades da Ecobraz; validar/publicar material no Zenodo/ORCID e credenciais exibíveis da Villanova; abrir relações para backlinks/imprensa.
- **A investigar antes de eu garantir qualquer coisa:** causa de "descarte de geladeira" (pos1, 0 tráfego) e o caso "pgrs" em página /es/.