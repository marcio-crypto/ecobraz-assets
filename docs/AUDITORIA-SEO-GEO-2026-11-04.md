# Auditoria técnica fria — ecobraz.org (SEO técnico, GEO, arquitetura, autoridade)

Data: 04/11/2026. Fontes: crawl ao vivo via GitHub Actions (`ecobraz-pente-fino` run 41841415158, `ecobraz-check-live` run 41841877671, `ecobraz-auditoria-live`, `ecobraz-indexacao`), HTML real da home guardado pelo Ahrefs Site Audit (projeto 9845837), Ahrefs Site Explorer, grafo de links do repositório (`site-ghost/content/*.json` + tema). O que não pôde ser medido está marcado como **não verificado**.

Legenda: ✅ medido/provado · ⚠️ problema medido · ❓ não verificado nesta sessão.

---

## BLOCO 1 — SEO técnico e indexação

### 1.1 robots.txt e sitemap
- ✅ `robots.txt` (do tema) libera tudo exceto `/ghost/`, `/email/`, `/r/`, `/webmentions/receive/`, `/p/`; lista explicitamente GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Applebot, Bytespider etc. com `Allow: /`; declara `Sitemap: https://ecobraz.org/sitemap.xml`.
- ✅ Sitemap: 289 URLs; **289/289 respondem 200** (pente-fino 04/11 13:49 UTC).
- ⚠️ **Contradição de sinal:** `/assinatura-debora/` está `noindex,nofollow` **e** dentro do sitemap. O Google trata como "enviada, mas bloqueada". Remover do sitemap (ou tirar o noindex, se a página for pública de verdade).
- ⚠️ URL legada ainda 404: `/es_br/blog/apoe%20ecobraz` (espaço codificado; o `redirects.yaml` não casa). 1 ocorrência, impacto baixo.
- ⚠️ Na home, o `<link rel="alternate" type="application/rss+xml">` aponta para `https://ecobraz.org/museu/rss/`, não para o feed principal. Causa: ordem das coleções no `routes.yaml` (o Ghost usa a primeira coleção). Não afeta ranking, mas é o feed errado para agregadores e assistentes.

### 1.2 Canonicals e variações de URL
- ✅ `https://ecobraz.org/` → `canonical` self; `hreflang` pt-BR / en / x-default corretos (278/278 pares verificados; 16 páginas sem hreflang são as que não têm par — informativo).
- ✅ `/pagina` → 301 → `/pagina/` (barra final forçada pelo Ghost). `http://` e `www` → 301 para `https://ecobraz.org/`. ⚠️ `http://www.ecobraz.org/…` faz **2 saltos** (http→https, www→raiz). Resolver com uma única regra no Cloudflare (Redirect Rule: `http://www` → `https://ecobraz.org/$1` direto).
- ✅ URLs com querystring (`?origem=`, `?perfil=`) mantêm canonical limpo.
- ⚠️ Ahrefs: **22 páginas com "title da página ≠ title mostrado na SERP"** — o Google está reescrevendo títulos. Sinal de títulos longos ou pouco alinhados à consulta.

### 1.3 Title e meta description
- ✅ Home: title 46 caracteres, description 138 — dentro do padrão.
- ⚠️ **37 titles > 60 caracteres** (cortam na SERP) e **2 descriptions > 160**.
- ⚠️ **1 title duplicado** (par Osasco: página `/coleta-de-lixo-eletronico-osasco/` × post `/blog/coleta-de-lixo-eletronico-em-osasco/`). Canibalização direta entre página comercial e post.
- ⚠️ Arquivos de tag e autor usam o título padrão do Ghost ("Notícias ESG - Ecobraz Emigre", "Marcio Villanova - Ecobraz Emigre"). Sem meta description própria.

### 1.4 Dados estruturados (JSON-LD)
- ⚠️ **Erro meu, confirmado no HTML ao vivo da home:** há **dois grafos concorrentes no `<head>`**:
  1. o que o `{{ghost_head}}` emite sozinho — `WebSite` + `Organization` (+ `ImageObject` do logo);
  2. o que eu coloquei no `default.hbs` — `NGO` + `Person` + `WebSite`.
  Resultado: duas entidades `WebSite` e a mesma organização descrita como `Organization` e como `NGO`, sem `@id` em comum. O Google tende a ignorar ou escolher uma; para motores de IA é ruído. Correção: manter só o grafo do tema e **desligar a saída do Ghost** (Ghost Admin → Settings → Code injection não resolve; é preciso que o `NGO` use `@id: {{@site.url}}/#organization` **e** o Ghost deixe de emitir — a opção prática é mover o grafo do tema para `"@type": ["NGO","Organization"]` com o mesmo `@id` e `url` do Ghost para que os dois nós se fundam).
- ⚠️ **Não existe `LocalBusiness`** (nem `RecyclingCenter`). O `NGO` tem endereço, telefone e `taxID`, mas falta `geo`, `openingHoursSpecification`, `hasMap`, `priceRange` e `areaServed` estruturado por cidade — justamente o que alimenta o Perfil de Empresa e as respostas "coleta de lixo eletrônico perto de mim".
- ✅ `FAQPage` presente na home (3 perguntas, no corpo) e em 38 páginas comerciais.
- ⚠️ **48 páginas exibem FAQ visível sem `FAQPage` no schema** (padrão desigual entre lotes de páginas que eu mesmo gerei).
- ⚠️ 6 páginas `/blog/tag/*` com erro de schema (`Series` do núcleo do Ghost, sem `name`). Não é do tema; é do Ghost. Mitigação: `noindex` nas tags ou aceitar o aviso.

### 1.5 Core Web Vitals e `<head>`
- ❓ **Dados de campo (CrUX) não obtidos**: PageSpeed Insights devolveu HTTP 429 nesta sessão. Não afirmo LCP/INP/CLS reais.
- ⚠️ `<head>` da home (HTML ao vivo): **8 folhas de estilo bloqueantes** (`screen`, `lang`, `materials`, `flow`, `post`, `v2b`, Google Fonts, `/public/cards.min.css`) + 5 scripts externos (Rocket Loader, gtag, Ahrefs, sodo-search via jsdelivr, cards.min.js) + 4 scripts inline. Seis CSS do tema para uma home é excesso: concatenar `screen+lang+materials+flow+post+v2b` em um único arquivo no build.
- ⚠️ **Cloudflare Rocket Loader está ativo** (`type="…-text/javascript"` em todos os scripts, inclusive no bloco de Consent Mode). O Rocket Loader adia e reordena scripts; é causa conhecida de `gtag('consent','default')` rodar depois do `config` e de erros em scripts inline. Recomendo desligar (Cloudflare → Speed → Optimization → Rocket Loader: Off) e medir.
- ⚠️ **E-goi (`egoi.site/1774067_ecobraz.org.js`) carrega sem passar pelo consentimento** — item já apontado na auditoria de 25/07 e ainda pendente. Como existe banner de consentimento no site, é incoerência LGPD/GDPR. Clarity também é injetado antes da escolha (o consentimento só é sinalizado via API depois).
- ⚠️ **Erro meu:** `post.hbs` usa `{{img_url feature_image size="xl"}}`, mas o `package.json` declara só `xs/s/m/l`. O Ghost cai para a imagem original — payload maior nos posts.
- ⚠️ 3 imagens em `assets/images` acima do tamanho razoável; `/favicon.ico` responde 302.
- ⚠️ Ahrefs: **484 páginas com CSS redirecionado** (`/public/cards.min.css?v=` → redirect). É efeito da regra que eu criei no Cloudflare para contornar o cache do `cards.min.*`. Funciona, mas cada página faz um salto extra no caminho crítico. Alternativa: Transform Rule que reescreve a URL internamente (sem 30x), ou cache rule por `?v=`.
- ⚠️ Cabeçalhos de segurança ausentes (só `server: cloudflare`): sem HSTS, `X-Content-Type-Options`, `Referrer-Policy`, CSP. Não é fator de ranking direto, mas reduz pontuação de "práticas recomendadas" e confiança.

---

## BLOCO 2 — GEO (Generative Engine Optimization)

- ✅ H1 único em 289/289 páginas (pente-fino). ⚠️ O H1 da home é narrativo ("De uma geladeira a um *data center*: coletamos, destinamos certo e entregamos a prova") — bom para humanos, fraco para extração: não contém a entidade nem o serviço nem a cidade. O `<title>` compensa, mas motores de IA pesam o H1. Sugestão: manter a frase como subtítulo e usar H1 "Coleta e descarte de lixo eletrônico em São Paulo — Ecobraz".
- ⚠️ **68 de 160 posts não têm nenhum H2** (migrados 34/40; EN 34/79). São blocos de texto sem seções — quase inextraíveis para resposta direta.
- ✅ FAQ e listas: as 38 páginas comerciais com `FAQPage` seguem o formato pergunta → resposta curta. ⚠️ Os 48 com FAQ visível sem schema perdem metade do valor.
- ✅ `llms.txt` existe (`/assets/llms.txt`, 40 linhas): resumo denso, 18 URLs principais, fatos verificáveis (ECESP, ONU 708794, Zenodo/ORCID). ⚠️ Problemas: `https://ecobraz.org/llms.txt` responde **301** para a cópia em `/assets/` (deveria ser 200 direto na raiz); não aponta para blog, museu nem notícias ESG; traz fatos datados que envelhecem sem manutenção ("★ 4,9 … 357 avaliações em set/2026", "coleta expressa … R$ 55"); não existe `llms-full.txt`.
- ✅ Fatos densos no JSON-LD (`taxID`, `foundingDate`, endereço, telefone). ⚠️ Nos textos das páginas faltam números auditáveis repetíveis (toneladas/ano, nº de coletas, prazo médio) com data — é o que LLMs citam.
- ✅ `robots.txt` autoriza explicitamente todos os crawlers de IA relevantes.
- ⚠️ **Tráfego orgânico está no lugar errado para GEO comercial:** das ~605 visitas/mês (Ahrefs), **295 vêm de um único post EN sobre o telégrafo de Morse** (1 palavra-chave: "telegraph inventor"); as 9 primeiras páginas por tráfego são do Museu. A primeira página comercial aparece em 10º com 10 visitas (`/descarte-de-eletrodomesticos/`). O site é hoje, para o Google, um site de história da tecnologia com um serviço de coleta ao lado.

---

## BLOCO 3 — Arquitetura de pilares e links internos

Inventário do repositório: 116 páginas + 160 posts; 46 links globais (header + footer); 13.995 links internos contextuais em páginas.

### 3.1 Mapa atual
- **Pilares (nível 1, no header/footer):** `/para-empresas/`, `/coleta-gratuita/`, `/para-governo/`, `/como-funciona/`, `/materiais-e-equipamentos-coletados/`, `/agendamento/`, `/en/`. Cada um recebe link de 279–280 páginas. ✅
- **Clusters comerciais (nível 2):** materiais (`/descarte-de-*`), setores (`/solucoes-por-setor/`), cidades (`/coleta-de-lixo-eletronico-em-*`), corporativo (`/solucoes-corporativas/`, `/descarte-corporativo-de-ti/`, `/logistica-reversa-para-fabricantes-e-importadores/`), e espelhos EN.
- **Conteúdo (nível 3):** `/blog/` (160 posts, 12 por página), `/museu/`, `/noticias-esg/`.

### 3.2 Problemas medidos
- ⚠️ **Pilar → cluster → post não existe de cima para baixo: 159 de 160 posts recebem zero links contextuais de qualquer página.** Só são alcançáveis pela listagem do `/blog/` (paginação de até 14 páginas → **profundidade até 13 cliques**). O PageRank dos pilares não chega ao conteúdo e o conteúdo não devolve para os pilares de forma temática.
- ⚠️ **9 páginas órfãs** (zero links de qualquer página, post ou navegação): `/assinatura-debora/`, `/coleta-de-lixo-eletronico-osasco/`, `/e-waste-collection-osasco/`, `/e-waste-collection-sao-paulo/`, `/how-to-dispose-old-fridge-sao-paulo/`, `/old-fridge-disposal/`, `/washing-machine-disposal/`, `/parceiros/`, `/privacy-policy/`. Cinco delas são páginas EN que eu criei e nunca liguei.
- ⚠️ **17 páginas com um único link interno**, entre elas páginas de dinheiro: `/descarte-corporativo-de-ti/`, `/logistica-reversa-para-fabricantes-e-importadores/`, `/coleta-de-lixo-eletronico-em-campinas|guarulhos|abc/`, `/grandes-empresas-e-multinacionais/`.
- ⚠️ Profundidade de páginas: 1 (home), 39 a 1 clique, 53 a 2, 16 a 3 — ✅ dentro de ≤3 —, mas **2 acima de 3**: `/solucoes-por-setor/` (4) e `/descarte-de-equipamentos-de-varejo-e-pdv/` (5). Um hub de setores a 4 cliques é falha de arquitetura.
- ⚠️ `/descarte-de-cabos-e-fios/` recebe apenas 2 links internos — e é exatamente a página para onde o cluster de backlinks "Reciclagem de Cabos e Fios" é redirecionado (ver Bloco 4).
- Anchors: ✅ 0 âncoras genéricas ("clique aqui") em 13.995. ⚠️ Mas há **âncoras-cartão**: o `<a>` envolve o card inteiro e a âncora vira "Descarte para empresas — o modelo completoContrato contínuo, sistema de rastreabilidade incluso e prova em três padrões.Ver solução →" (9–11 ocorrências por pilar). Dilui o sinal; o link deve envolver só o título do card (ou usar `aria-label`).
- ✅ **404 internos ao vivo: zero** (pente-fino percorreu 295 links únicos). Nota honesta: meu script de grafo apontou "155× /agendamento/ quebrado" — **falso positivo da minha ferramenta** (`/agendamento/` é página criada direto no Ghost e não está nos JSON do repositório). O crawl ao vivo é o que vale.

---

## BLOCO 4 — Backlinks e autoridade

### 4.1 Perfil (Ahrefs, 04/11)
- DR 39; ~1.350 domínios de referência ativos; 192 palavras-chave orgânicas; ~605 visitas orgânicas/mês.
- ✅ Domínios fortes e legítimos: globo.com (DR 91), terra.com.br (86), techtudo (81), em.com.br (80), ufu.br (75), cps.sp.gov.br (72), trt15.jus.br (68), climate-chance.org (65), cetem.gov.br (52). É um perfil editorial raro para o nicho — ativo real.

### 4.2 Links tóxicos e quebrados
- ⚠️ **Cluster PBN/spam:** ≥100 domínios marcados `is_spam` (subdomínios `*.pointblog.net`, `*.thezenweb.com`, etc.), todos com a âncora exata **"Reciclagem de Cabos e Fios"** apontando para a URL antiga `/pt_BR/blog/ecobraz-emigre-lanca-servico-exclusivo-de-processamento-de-fios-e-cabos-eletricos-…`. O Ahrefs ainda os lista em "broken backlinks" (crawl antigo); hoje essa URL **301 → `/descarte-de-cabos-e-fios/`**, ou seja, o redirecionamento que eu configurei canaliza um padrão de âncora exata artificial para uma página comercial. O Google diz ignorar spam de PBN, mas âncora exata em volume para página de serviço é o único cenário em que disavow ainda faz sentido como defesa. Opções: (a) arquivo de disavow com esse cluster; (b) trocar o 301 dessa URL legada por **410** (perde os poucos links legítimos ao post antigo, mas corta o funil). Recomendo (a).
- ❓ **Link da ECESP (European Circular Economy Stakeholder Platform): não consigo afirmar se é DoFollow ou NoFollow.** Evidência: o Ahrefs **não registra nenhum backlink de `europa.eu` para `ecobraz.org` nem para `ecobraz.org.br`**, e a sandbox desta sessão não alcança `circulareconomy.europa.eu` (bloqueio de rede). Isso é compatível com três hipóteses: link `nofollow`/`ugc`, link injetado por JavaScript (não visto pelo crawler), ou página não recrawlada. **Como você confere em 30 segundos:** abra a página da boa prática → clique com o botão direito no link para a Ecobraz → "Inspecionar" → na linha `<a href="…">` destacada, veja se existe `rel="nofollow"` (ou `ugc`/`sponsored`). Se não existir, é DoFollow. Mande o print que eu registro.

### 4.3 Três oportunidades de link building B2B/B2G (sem compra de links)
1. **Sistemas de logística reversa de fabricantes (B2B/B2G):** Green Eletron e ABREE publicam listas públicas de pontos de recebimento e operadores; a Ecobraz, com CNPJ e licenças da ficha institucional, pode pleitear listagem com link. Mesmo caminho no **SINIR (MMA)** e no **Cadastro Técnico Federal (IBAMA)** quando houver página pública do operador.
2. **Universidades e órgãos públicos de SP (B2G/.edu):** já existem links de `ufu.br`, `cps.sp.gov.br`, `trt15.jus.br`. Replicar com páginas "onde descartar eletrônicos" de USP Recicla, Unicamp/Unifesp/UFABC, Prefeitura de São Paulo (AMLURB — ecopontos/PEVs) e CETESB, oferecendo o **Programa Adote um Bairro** e o **Museu Virtual** como material citável (as duas únicas coisas do site que a imprensa já linka espontaneamente).
3. **Relatórios ESG e guias setoriais (B2B):** Sebrae, FIESP/CIESP e Instituto Ethos publicam guias de descarte/ESG para PMEs; as **publicações com DOI no Zenodo** e a tabela ABNT/CONAMA do blog são conteúdo de referência que esses guias citam. Ação concreta: enviar o PDF do relatório Zenodo + link da tabela para os autores dos guias já existentes (menção com link, não pedido de link).

---

## BLOCO 5 — Tabela de correção priorizada

| Prioridade | Problema encontrado | Onde está o erro (URL/Arquivo) | Como corrigir (passo a passo) |
|---|---|---|---|
| **Alta** | Pilar→cluster→post inexistente: 159/160 posts sem link contextual de páginas; profundidade até 13 cliques via paginação | `site-ghost/content/*.json` (páginas) × `/blog/` | 1) Para cada página comercial, bloco "Leia também" com 3 posts do mesmo tema (material/setor/cidade). 2) Em cada post, link para a página comercial correspondente no 1º terço do texto. 3) Criar hubs `/blog/tag/<tema>/` com texto próprio e linká-los nos pilares. 4) Rodar `grafo.py` de novo e exigir ≥3 links de entrada por post. |
| **Alta** | Dois grafos JSON-LD concorrentes (Ghost `Organization`+`WebSite` × tema `NGO`+`WebSite`) | `site-ghost/theme/default.hbs` (bloco após `{{ghost_head}}`) + saída nativa do Ghost | 1) No tema, trocar `"@type": "NGO"` por `["Organization","NGO"]` e manter `@id {{@site.url}}/#organization` e `url` iguais aos do Ghost. 2) Remover o nó `WebSite` do tema (o Ghost já emite). 3) Validar em validator.schema.org e no Teste de Pesquisa Aprimorada. |
| **Alta** | Tráfego concentrado em conteúdo fora do negócio (295/605 visitas num post EN do telégrafo); páginas comerciais quase sem ranking | `/blog/morse-telegraph-…/`, `/museu/*` vs `/descarte-de-*`, `/coleta-de-lixo-eletronico*` | 1) Nos 10 posts do Museu com mais tráfego, inserir CTA + link contextual para a página comercial PT/EN correta. 2) Reescrever title/H1 das 10 páginas comerciais com maior volume de busca (Ahrefs Keywords Explorer) para a consulta exata ("onde descartar micro-ondas em São Paulo"). 3) Medir em 60 dias. |
| **Alta** | Cluster PBN com âncora exata "Reciclagem de Cabos e Fios" canalizado por 301 para página comercial | `redirects.yaml` (regra `/pt_BR/blog/ecobraz-emigre-lanca-servico-exclusivo-…`) → `/descarte-de-cabos-e-fios/` | 1) Exportar do Ahrefs os domínios `is_spam=true` com essa âncora. 2) Criar `disavow.txt` (`domain:pointblog.net`, `domain:thezenweb.com`, …). 3) Enviar em search.google.com/search-console/disavow-links. 4) Alternativa: trocar o 301 por 410 (decisão do Marcio). |
| **Alta** | E-goi carrega sem consentimento; Rocket Loader reordena o bloco de Consent Mode | `default.hbs` linhas 74–87 (E-goi); Cloudflare → Speed → Rocket Loader | 1) Envolver o loader do E-goi em `if (localStorage.getItem('ecb_consent')==='granted')` e disparar no evento de aceite do banner (`main.js`). 2) Cloudflare → Speed → Optimization → Content → Rocket Loader: **Off**. 3) Reexecutar `ecobraz-pente-fino` (verifica GA4 e eventos). |
| **Média** | 9 páginas órfãs e 17 com 1 único link (inclui páginas de dinheiro) | ver lista no Bloco 3.2 | 1) Adicionar as 5 EN órfãs ao `partials/footer.hbs` (coluna EN) e ao `/en/`. 2) `/parceiros/` e `/privacy-policy/` no rodapé. 3) Decidir o destino de `/assinatura-debora/` (ver linha abaixo). 4) Linkar Campinas/Guarulhos/ABC/Osasco a partir de `/coleta-gratuita/` e `/para-empresas/`. |
| **Média** | `/solucoes-por-setor/` a 4 cliques; `/descarte-de-equipamentos-de-varejo-e-pdv/` a 5 | `partials/header.hbs`, `/para-empresas/` | 1) Incluir "Soluções por setor" no menu de Empresas. 2) Na `/solucoes-corporativas/`, card para setores. |
| **Média** | 37 titles > 60, 2 descriptions > 160, 1 title duplicado (Osasco), 22 reescritos pelo Google | `site-ghost/content/*.json` (`meta_title`, `meta_description`) | 1) Exportar do Ahrefs Site Audit (issue "Title too long"). 2) Reescrever ≤ 58 caracteres, consulta principal no início. 3) Osasco: consolidar post no page com 301 ou diferenciar o título do post ("Guia para moradores"). |
| **Média** | 48 páginas com FAQ visível sem `FAQPage` | páginas dos lotes `search-intent-pages.json`, `en-paginas.json` | 1) Reaproveitar o gerador de `FAQPage` do lote `commercial-pages.json`. 2) Regerar e publicar via workflow. 3) Validar 3 amostras no Rich Results Test. |
| **Média** | Sem `LocalBusiness`/`RecyclingCenter`; `NGO` sem `geo`, horários, `hasMap` | `default.hbs` JSON-LD | 1) Adicionar `"@type": ["Organization","NGO","RecyclingCenter"]`, `geo` (lat/long do endereço), `openingHoursSpecification`, `hasMap` (URL do Maps já em `sameAs`), `areaServed` com as cidades das páginas locais. |
| **Média** | 8 CSS bloqueantes; 6 do tema | `default.hbs` linhas 12–18; build do tema | 1) Concatenar os 6 CSS em `screen.css` no script de build (ordem: screen, lang, materials, flow, post, v2b). 2) Manter `cards.min.css` (Ghost). 3) Medir LCP no PSI após liberação do 429. |
| **Média** | `post.hbs` pede `size="xl"` não declarado | `site-ghost/theme/package.json` (`config.image_sizes`) | 1) Adicionar `"xl": {"width": 2000}` em `image_sizes`. 2) Reenviar o tema. |
| **Média** | `llms.txt` servido por 301; cobertura parcial; fatos datados | `site-ghost/theme/assets/llms.txt`; regra de redirect `/llms.txt` | 1) Servir `/llms.txt` com 200 (Cloudflare Transform Rule → rewrite para `/assets/llms.txt`, sem 30x). 2) Incluir seções Blog, Museu, Notícias ESG. 3) Gerar `llms-full.txt` no build. 4) Fatos com data e revisão trimestral. |
| **Média** | 68/160 posts sem H2 | `migrated-posts.json`, `en-posts.json` | 1) Script que lista posts sem `<h2>`. 2) Inserir 3–5 H2 em forma de pergunta por post (começar pelos 20 com mais tráfego). |
| **Baixa** | `/assinatura-debora/` noindex + no sitemap | Ghost Admin → página → Settings | Se é só uma assinatura de e-mail: manter noindex e marcar "Exclude from sitemap"… o Ghost não tem essa opção nativa — alternativa: transformar em post não publicado/privado ou servir fora do Ghost. |
| **Baixa** | `http://www` em 2 saltos; favicon 302; headers de segurança ausentes | Cloudflare → Rules | 1) Redirect Rule única `http://www.ecobraz.org/*` → `https://ecobraz.org/$1` (301). 2) Transform Rule → Response headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. 3) Favicon como arquivo direto no tema. |
| **Baixa** | 484 páginas com CSS redirecionado (`cards.min.css?v=`) | Cloudflare Redirect Rule do `cards.min.*` | Trocar por Transform Rule (rewrite de URL) ou Cache Rule por querystring; conferir com `ecobraz-check-live`. |
| **Baixa** | RSS da home aponta para `/museu/rss/`; tags com título padrão; URL legada `%20` 404 | `routes.yaml`; `redirects.yaml` | 1) Colocar a coleção principal antes de `museu` em `routes.yaml` (testar — muda a ordem das coleções). 2) `meta_title`/`description` nas tags via Ghost Admin → Tags. 3) Regra em `redirects.yaml` para `/es_br/blog/apoe%20ecobraz` → `/programa-adote-um-bairro/`. |

### O que fica em aberto (honesto)
- ❓ CWV de campo não medidos (PSI 429). ❓ `rel` do link da ECESP (depende do print do Marcio). ❓ Impacto real do Rocket Loader no Consent Mode — hipótese forte, não medida.
- Os números de órfãs/profundidade vêm do inventário do repositório; páginas criadas direto no Ghost (como `/agendamento/`) não entram nesse grafo.
