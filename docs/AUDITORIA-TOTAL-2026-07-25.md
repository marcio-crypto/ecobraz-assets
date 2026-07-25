# Auditoria total do site Ecobraz — 25/07/2026

**Método:** 8 auditores de IA em paralelo (tema, conteúdo PT, bilíngue, scripts/CI, worker do formulário, redirects, SEO/dados estruturados, dados da API do Ahrefs) + verificação adversarial (céticos releram cada evidência) + auditoria ao vivo por runner (40 URLs, sitemap com amostra, redirects, CORS do formulário). **58 achados confirmados**, 1 incerto, 0 falsos aprovados.

**Nota honesta:** um achado do lote inicial (og:image relativa) se provou FALSO ao vivo — o `{{asset}}` do Ghost Pro já gera URL absoluta em produção; a "correção" foi revertida no PR #171. Registrado aqui para memória.

## Saúde geral (verificada ao vivo em 25/07)
- 40 páginas-chave: todas 200, 0,18–0,32s, com title/meta/canonical/GA/Clarity e 1 botão de WhatsApp cada.
- Sitemap 103 páginas + 160 posts; amostra de 50 URLs: zero quebradas. robots.txt e 404 corretos.
- Formulário: endpoint no ar, CORS correto (preflight 204). lp.ecobraz.org e http→https com 301.

## Achados (com veredito do cético e status)

### 🔴 ALTO · [tema] Os mini-formulários do hero (home + ~20 landings) coletam CEP/cidade e descrição do lote, mas o /agendamento/ descarta esses dados — o lead precisa redigitar tudo
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** home.hbs:187 `<input id="hx-local" name="local" placeholder="Ex.: 02175-010 ou São Paulo">`; page-decommissioned-it-asset-disposal.hbs:34-38 campos `name="descricao"` e `name="local"`; assets/js/main.js:86-91 lê SOMENTE `params.get('perfil')` e `params.get('material')` — nenhuma linha lê `local` ou `descricao` (grep confirma: 21 templates enviam name="local")
- **Impacto:** O caminho principal de lead pede dados no hero, promete continuidade ("Descreva a operação em 1 minuto") e depois joga fora o que o visitante digitou: no formulário multi-etapas ele redigita CEP, cidade e descrição. Fricção direta no funil primário de conversão em ~21 páginas.
- **Correção sugerida:** Em main.js, além de perfil/material, ler `local` e `descricao` da URL e pré-preencher `postal_code`/`city` (detectar CEP por regex de dígitos) e `material_description`. Opcionalmente persistir em sessionStorage como já é feito com UTMs.

### 🔴 ALTO · [bilingue] CTAs principais e formulário embutido das 15 landings EN apontam para /agendamento/, página 100% em português
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/scripts/build-landing-pages-en.mjs:44 `const formAction = '{{@site.url}}/agendamento/';` e :75 `href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem=${slug}..."`; saída gerada em site-ghost/theme/page-secure-data-sanitisation.hbs:16 (hero CTA) e :25 `<form class="hx-quote" ... action="{{@site.url}}/agendamento/">` (idem nas outras 14). custom-agendamento.hbs não tem nenhum elemento only-en (todo o formulário de 3 passos é PT, linhas 6-33) e page-agendamento não está no lang.css. Contrasta com o padrão EN deliberado do resto do site: header.hbs:48 (CTA EN = WhatsApp), page.hbs:
- **Impacto:** Um lead B2B de língua inglesa que clica "Request a technical assessment" ou envia o mini-formulário das landings EN cai num formulário multi-etapas inteiramente em português — risco real de abandono na conversão principal das 15 páginas comerciais EN. Há fallback de WhatsApp ao lado, mas o CTA primá
- **Correção sugerida:** Alinhar as landings EN ao padrão já usado no restante do EN (CTA primário → WhatsApp), ou criar uma variante EN do agendamento (ex.: /en-collection-request/, com par declarado em pares-idioma.json) e apontar formAction/CTAs do build-landing-pages-en.mjs para ela. Se o destino PT for uma escolha consciente, ao menos avisar no CTA (ex.: "form in Portuguese").

### 🔴 ALTO · [scripts-ci] Cada push a main apaga o hreflang de 32 páginas comerciais (o sync sobrescreve codeinjection_head só com JSON-LD)
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/scripts/build-landing-pages.mjs:360 e :408 — `codeinjection_head: \`<script type="application/ld+json">${JSON.stringify(ld)}</script>\`` (idem build-landing-pages-en.mjs:362/410); site-ghost/scripts/sync-pages.mjs:23 — `const payload = {pages:[{...page,status:'published',updated_at:existing?.updated_at}]}` envia esse codeinjection_head no PUT, substituindo o valor vivo; aplica-hreflang.mjs:38-43 grava o bloco `<!--ecb-hreflang-->` exatamente em codeinjection_head e SÓ roda via .github/workflows/ecobraz-hreflang.yml (workflow_dispatch, sem nenhum passo equivalente no deploy-ghost.yml
- **Impacto:** Toda vez que o deploy roda (qualquer push em site-ghost/**), as landings comerciais PT e EN perdem as tags hreflang aplicadas manualmente — o SEO bilíngue dessas 32 páginas regride em silêncio até alguém lembrar de rodar o workflow ecobraz-hreflang de novo. É um ciclo de apaga-e-reaplica sem fim.
- **Correção sugerida:** Escolher uma fonte única: (a) gerar as tags hreflang direto no codeinjection_head dentro de build-landing-pages(.en).mjs (o par PT/EN é conhecido no build), ou (b) adicionar `node site-ghost/scripts/aplica-hreflang.mjs` como passo final do deploy-ghost.yml, ou (c) fazer sync-pages.mjs preservar o bloco entre os marcadores <!--ecb-hreflang--> existente no Ghost ao montar o codeinjection_head.

### 🔴 ALTO · [worker-form] Worker valida turnstile_token, mas o tema nunca renderiza o widget Turnstile nem envia o token — se TURNSTILE_SECRET_KEY estiver ativo, 100% dos envios legítimos falham com 403
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:29-31 — `if (env.TURNSTILE_SECRET_KEY) { const passed = await verifyTurnstile(input.turnstile_token, ...); if (!passed) return json({ok:false,error:'challenge_failed'},403,cors); }`. Grep por 'turnstile' em /home/user/ecobraz-assets/site-ghost/theme/** retorna ZERO ocorrências — custom-agendamento.hbs não tem widget e main.js não envia turnstile_token no payload (main.js:114 monta o payload só com FormData do form). O wrangler.toml:15 lista TURNSTILE_SECRET_KEY entre os 'Segredos usados pelo Worker (definidos na Cloudflare)'.
- **Impacto:** Condicional ao estado do env (não verificável neste repositório, só ao vivo): se a chave estiver definida na Cloudflare, TODO envio do formulário recebe 403 challenge_failed e o usuário vê apenas a mensagem genérica de erro — perda total de leads do formulário. Se a chave NÃO estiver definida, o for
- **Correção sugerida:** 1) Verificar AO VIVO (auditoria separada) se um POST válido retorna 201 — isso confirma se a chave está ou não ativa. 2) Antes de qualquer ativação da chave, adicionar o widget Turnstile ao custom-agendamento.hbs (script api.js + div cf-turnstile) e incluir o token no payload em main.js. Nunca ativar TURNSTILE_SECRET_KEY sem o widget no tema.

### 🔴 ALTO · [ahrefs-live] Backlink dofollow de DR 80 (TechTudo/Globo) aponta para URL nossa que responde 404
- **Status:** ⬜ pendente
- **Evidência:** API site-explorer-broken-backlinks (ecobraz.org): url_from="https://www.techtudo.com.br/noticias/2013/07/como-descartar-tvs-com-defeito-ou-quebradas.ghtml", url_to="https://ecobraz.org/projetos/para-voce/coleta-gratuita-de-e-lixo", anchor="Ecobraz", domain_rating_source=80.0, http_code_target=404, is_dofollow=true
- **Impacto:** É provavelmente o backlink mais forte do site (DR 80, dofollow, em matéria sobre descarte de TVs — exatamente o público do negócio). Hoje quem clica cai em 404: perde-se tráfego de referência qualificado e a autoridade do link não flui para nenhuma página. Com tráfego orgânico total de ~28 visitas/m
- **Correção sugerida:** Criar redirect 301 no Cloudflare: /projetos/para-voce/coleta-gratuita-de-e-lixo → página B2C atual de coleta gratuita/agendamento (ex.: /agendamento/). Opcional: pedir à redação do TechTudo a atualização do link.

### 🟠 MÉDIO · [tema] Formulário de agendamento sem method/action: se o submit acontecer antes do main.js carregar (agravado pelo Rocket Loader), o navegador faz GET nativo — lead perdido e dados pessoais (e-mail/telefone) expostos na URL
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** custom-agendamento.hbs:8 `<form class="collection-form" data-collection-form data-endpoint="..." novalidate>` (sem method nem action); flow.css:1 `.collection-form.is-enhanced .form-step{display:none}` — antes do JS rodar TODAS as etapas ficam visíveis e o botão submit é clicável; main.js só previne o default em main.js:105-106
- **Impacto:** Sem JS (ou antes dele executar — o Rocket Loader adia todos os scripts), o clique em "Enviar" recarrega /agendamento/ com nome, e-mail, telefone e consentimentos na query string: nenhum lead é criado, sem mensagem de erro, e dados pessoais vazam para URL/logs (ângulo LGPD).
- **Correção sugerida:** Duas camadas: (1) esconder o botão de submit até `.is-enhanced` (CSS: `.collection-form:not(.is-enhanced) .form-submit{display:none}` com aviso para usar WhatsApp); (2) opcionalmente `method="post"` para que um submit nativo pelo menos não coloque dados na URL.

### 🟠 MÉDIO · [tema] Landings EN mandam material em inglês ("IT and computing", "Electronics", "Servers and data centre") que não casa com nenhuma opção do select PT — pré-preenchimento falha em silêncio, e o destino /agendamento/ é 100% em português
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** page-decommissioned-it-asset-disposal.hbs:31 `<input type="hidden" name="material" value="IT and computing">` (grep: 8 landings EN enviam valores EN); custom-agendamento.hbs:17-18 options são "Informática e TI", "Eletrônicos", "Servidores e data center"; main.js:91 exige match exato: `options.some((option) => option.value === material)`
- **Impacto:** O CTA principal das páginas EN leva o comprador estrangeiro a um formulário inteiramente em PT com a categoria de material perdida no caminho. O funil EN existe para captar compradores/auditores internacionais e degrada exatamente na conversão.
- **Correção sugerida:** No gerador build-landing-pages.mjs, emitir nos hidden fields os valores canônicos PT (o label pode continuar EN); ou adicionar em main.js um mapa EN→PT ({"IT and computing":"Informática e TI", "Electronics":"Eletrônicos", "Servers and data centre":"Servidores e data center"}). Avaliar direcionar CTA EN para WhatsApp (como o header EN já faz) enquanto não houver formulário EN.

### 🟠 MÉDIO · [tema] Script da E-goi (Connected Sites) carrega incondicionalmente e ignora a escolha do banner de cookies que GA e Clarity respeitam
- **Status:** ⬜ pendente
- **Evidência:** default.hbs:72-84 — o bloco E-goi (`g.src='https://egoi.site/1774067_ecobraz.org.js?v='+new Date().getTime()`) não tem nenhuma verificação de `ecb_consent`, ao contrário do GA (default.hbs:34-47) e do Clarity (default.hbs:64-69); main.js:44-47 `applyConsent` atualiza apenas gtag e clarity
- **Impacto:** O banner promete "Você pode aceitar ou recusar — a escolha fica guardada", mas recusar não desliga o rastreador de marketing da E-goi. Inconsistência de compliance (LGPD/GDPR) e com o compromisso de transparência do site. Bônus: o cache-buster `?v=timestamp` impede qualquer cache do script em toda p
- **Correção sugerida:** Condicionar o load da E-goi à mesma lógica de consentimento (carregar só com 'granted', ou expor API de opt-out da E-goi em applyConsent), e remover o `?v=+timestamp` para permitir cache.

### 🟠 MÉDIO · [tema] Tema não tem error.hbs / error-404.hbs: páginas 404/500 renderizam o template padrão do Ghost, sem marca, sem navegação e sem CTA
- **Status:** ⬜ pendente
- **Evidência:** Listagem completa dos 59 arquivos de site-ghost/theme/** não contém nenhum error*.hbs (`ls *.hbs | grep -i error` → vazio, exit 1)
- **Impacto:** Qualquer URL quebrada ou link antigo cai numa página genérica do Ghost (em inglês, sem header/footer do site) — visitante em rota de erro não vê caminho de volta para /agendamento/ ou WhatsApp. Num site cuja função é gerar lead, todo 404 é conversão desperdiçada.
- **Correção sugerida:** Criar error.hbs (e opcionalmente error-404.hbs) herdando o default: mensagem em PT, busca/links para as páginas principais e CTA de coleta/WhatsApp.

### 🟠 MÉDIO · [tema] post.hbs pede `img_url size="xl"`, mas o package.json só declara xs/s/m/l — a variante não existe e a feature image do artigo tende a ser servida no arquivo original em tamanho cheio
- **Status:** ⬜ pendente
- **Evidência:** post.hbs:11 `{{img_url feature_image size="xl"}}`; package.json:23-36 `image_sizes` define apenas xs(320), s(480), m(760), l(1200)
- **Impacto:** Comportamento esperado do helper com size não declarado é não redimensionar (não testei ao vivo — a auditoria live pode confirmar o URL gerado): imagem de destaque dos posts servida sem otimização, piorando LCP das páginas de artigo. Sem quebra visual.
- **Correção sugerida:** Trocar para `size="l"` em post.hbs, ou declarar `"xl": {"width": 1600}` no image_sizes do package.json (e re-deploy do tema).

### 🟠 MÉDIO · [tema] Fallback de <title> hardcoded: /museu/ e /noticias-esg/ (e páginas 2+ de todos os arquivos) recebem o mesmo título genérico "Conteúdos sobre lixo eletrônico e reciclagem | Ecobraz"
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** default.hbs:17-25 — `{{#is "home"}}...{{else}}{{#is "post, page, tag, author, error"}}{{meta_title}}{{else}}<title>Conteúdos sobre lixo eletrônico e reciclagem | Ecobraz</title>{{/is}}{{/is}}` — rotas de collection/channel (museu, noticias-esg, blog paginado) caem no else genérico
- **Impacto:** Duas seções indexáveis inteiras aparecem na SERP com título de blog genérico e duplicado entre si (e divergente do og:title emitido pelo ghost_head). Distinto do WARN conhecido do audit-content (que é sobre rotas fora do page-sync, não sobre o <title> do tema).
- **Correção sugerida:** No else final usar `<title>{{meta_title}}</title>` (o Ghost resolve título + paginação por rota), ou tratar os contextos das rotas custom explicitamente.

### 🟠 MÉDIO · [conteudo-pt] O hero do page.hbs injeta perfil=empresa em TODAS as páginas de pessoa física (geladeira, máquina de lavar, TV, regionais)
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/theme/page.hbs:12 — `<a class="button only-pt" href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem={{slug}}">Solicitar avaliação de coleta</a>`. Esse bloco envolve toda página sem template dedicado, incluindo as B2C de search-intent-pages.json (ex.: descarte-de-geladeira-velha, linha 8) e material-pages.json. Os CTAs escritos no html dessas páginas estão corretos (sem perfil), mas o CTA do hero do tema força empresa. Dedução de que o hero renderiza: o html dessas páginas não contém nenhum <h1> — o H1 só existe no hero (page.hbs:10), gated por show_title_and_feature_image (def
- **Impacto:** Visitante residencial que clica no primeiro botão da página (o do hero, acima do kg-card) chega ao formulário com 'Empresa ou instituição' pré-selecionado. Isso contamina a classificação do lead no Ploomes/GA se ele não corrigir, e pode fazer pessoa física achar que o serviço é só B2B. NÃO VERIFICAD
- **Correção sugerida:** Em page.hbs, trocar o href do hero para `/agendamento/?origem={{slug}}` (sem perfil) — as páginas realmente corporativas já têm perfil=empresa nos CTAs do próprio html e nos templates dedicados. Alternativa: condicionar o perfil a uma tag interna (ex.: #b2b) da página.

### 🟠 MÉDIO · [conteudo-pt] descarte-de-eletrodomesticos manda material='Máquinas e equipamentos' embora o formulário tenha a opção exata 'Eletrodomésticos'
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/content/material-pages.json:56 — duas ocorrências de `/agendamento/?material=M%C3%A1quinas%20e%20equipamentos&origem=descarte-de-eletrodomesticos` (CTA do topo e do rodapé). O select do formulário tem a opção literal `<option>Eletrodomésticos</option>` (theme/custom-agendamento.hbs:18), e as páginas irmãs do mesmo assunto usam-na: search-intent-pages.json:8 e :16 (`material=Eletrodom%C3%A9sticos` em descarte-de-geladeira-velha e descarte-de-maquina-de-lavar).
- **Impacto:** Leads de geladeira/lavadora vindos da página genérica de eletrodomésticos entram no Ploomes e no GA4 como 'Máquinas e equipamentos' (worker/src/index.js:89 grava material_category na nota do negócio; main.js:135-142 envia ao GA), enquanto os mesmos materiais vindos das páginas específicas entram com
- **Correção sugerida:** Trocar os dois CTAs de descarte-de-eletrodomesticos para `material=Eletrodom%C3%A9sticos` e re-sincronizar. Avaliar também descarte-de-ar-condicionado (material-pages.json:64), que usa 'Máquinas e equipamentos' — defensável por falta de categoria própria, mas vale decisão explícita do Marcio.

### 🟠 MÉDIO · [conteudo-pt] descarte-de-eletrodomesticos compete pelas mesmas buscas das páginas dedicadas de geladeira e máquina de lavar, sem linkar para elas
- **Status:** ⬜ pendente
- **Evidência:** material-pages.json:54 — meta_title `Descarte de eletrodomésticos e retirada de geladeira | Ecobraz` e H2 `Onde descartar geladeira, máquina de lavar e eletrodomésticos` (linha 56) vs. search-intent-pages.json:6 (`Descarte de geladeira velha e coleta em São Paulo | Ecobraz`) e :14 (`Descarte e coleta de máquina de lavar velha | Ecobraz`). O html de descarte-de-eletrodomesticos não contém nenhum link para /descarte-de-geladeira-velha/, /descarte-de-maquina-de-lavar/ ou /descarte-de-televisao/ (verificado na extração completa de links). O texto em si não é duplicado (overlap de shingles < 2%).
- **Impacto:** Duas URLs disputando 'descarte de geladeira' / 'retirada de geladeira' podem alternar no Google e diluir sinais; a página genérica também desperdiça a chance de canalizar o visitante para a página específica, mais persuasiva.
- **Correção sugerida:** Refocar meta_title/H2 de descarte-de-eletrodomesticos em 'linha branca / eletrodomésticos' (tirar 'retirada de geladeira' do meta_title) e adicionar links internos para as três páginas específicas na lista 'Itens que podem ser avaliados'.

### 🟠 MÉDIO · [bilingue] Prefill de material vindo das landings EN é silenciosamente descartado no /agendamento/ (valores EN não batem com as options PT)
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** landing-pages-en.json usa form.material = "IT and computing" | "Electronics" | "Servers and data centre" (gerado em page-secure-data-sanitisation.hbs:31 `<input type="hidden" name="material" value="IT and computing">`); site-ghost/theme/assets/js/main.js:91 só aplica se `option.value === material`, e as options em custom-agendamento.hbs:17-18 são PT ("Informática e TI", "Eletrônicos", "Servidores e data center"). Nenhum valor EN coincide. Os valores PT de landing-pages.json batem exatamente — só o lado EN perde o prefill.
- **Impacto:** Mesmo o lead EN que persiste no formulário PT chega sem a categoria pré-selecionada; a informação de material capturada na landing se perde no caminho.
- **Correção sugerida:** No build-landing-pages-en.mjs, mapear os valores EN para os valores PT das options (o parâmetro `material` é só prefill interno, invisível ao usuário) — ex.: "IT and computing" → "Informática e TI".

### 🟠 MÉDIO · [bilingue] Footer das páginas EN fica majoritariamente em português e linka rotas PT, mesmo existindo pares EN para a maioria dos destinos
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/theme/partials/footer.hbs: só a coluna de contato tem par only-pt/only-en (linhas 9-20). O parágrafo da marca (linha 7, "Coleta corporativa de eletrônicos...") e as colunas "Institucional" (21-32, /sobre/, /evidencias/, /publicacoes/...), "Colunistas" (33-39), "Coleta" (40-46, /coleta-de-lixo-eletronico-para-empresas/...) e "Materiais" (47-56, /descarte-de-eletrodomesticos/...) não têm variante EN — e about, public-evidence, technical-publications, business-e-waste-collection, white-goods-disposal etc. existem em pares-idioma.json.
- **Impacto:** Toda página EN termina com um bloco grande de texto e links em português apontando para o lado PT do site — quebra de idioma na experiência e internal linking EN desperdiçado (as páginas EN quase não recebem links internos do rodapé).
- **Correção sugerida:** Duplicar as colunas com only-pt/only-en no footer.hbs usando os slugs EN já declarados em pares-idioma.json, no mesmo padrão do header.hbs (nav only-pt/only-en).

### 🟠 MÉDIO · [scripts-ci] O sync anula a proteção anticolisão do Ghost e sobrescreve edição manual do dono sem nenhum aviso
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/scripts/sync-pages.mjs:23 — `updated_at:existing?.updated_at` (devolve o updated_at vivo, então o Ghost nunca dispara o erro de colisão de edição); sync-posts.mjs:21 idem; cleanup-staging.mjs:46 — `status:'draft',updated_at:item.updated_at` re-despublica os slugs da lista a cada run; sync-post-covers.mjs:317 troca feature_image sempre que difere da capa gerada. Gatilho: deploy-ghost.yml:10-20 (push em main, paths site-ghost/**) roda tudo isso em ~230 páginas/posts (soma dos JSONs de content/).
- **Impacto:** Se o Marcio corrigir um texto, meta description ou capa direto no painel do Ghost, o próximo push reverte a mudança silenciosamente — o log só diz 'Updated <slug>', sem indicar que uma edição manual foi descartada. Numa página de conversão isso pode desfazer uma correção urgente sem ninguém perceber
- **Correção sugerida:** Manter o repositório como fonte da verdade, mas nunca sobrescrever em silêncio: antes do PUT, comparar o html/meta remoto com o que o repo publicou da última vez (hash guardado ou comparação direta com o JSON) e, ao detectar divergência, gravar aviso destacado no GITHUB_STEP_SUMMARY ('sobrescrevendo edição manual em <slug>') — ou pular e falhar o passo para decisão humana.

### 🟠 MÉDIO · [scripts-ci] Teste de cliques cria lead real no CRM de produção em toda execução, sem input de proteção
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/scripts/e2e-click-test.mjs:111-136 — comentário '// 6. Formulário completo com lead rotulado (cria registro real no CRM!)' seguido do submit real em produção; .github/workflows/e2e-clicks.yml:4-9 — o workflow_dispatch só tem o input base_url, nenhum boolean para pular o envio (compare com deploy-ghost.yml:6-9, `test_integrations` default false, e ecobraz-pente-fino.yml, flag --enviar-lead).
- **Impacto:** Qualquer execução do workflow polui o funil de vendas do Ploomes (e os eventos generate_lead do GA4) com um lead de teste, obrigando exclusão manual — não há como rodar a jornada de cliques sem criar o registro.
- **Correção sugerida:** Adicionar input boolean `enviar_lead` (default false) no e2e-clicks.yml, passar um flag (ex.: --enviar-lead) ao script e condicionar o bloco 6 do e2e-click-test.mjs a esse flag, como já faz auditoria-ecobraz.mjs:15.

### 🟠 MÉDIO · [worker-form] Honeypot inerte: o Worker checa o campo 'website', mas o formulário nunca renderiza esse campo — anti-spam hoje depende só do header Origin, que é spoofável
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:28 — `if (input.website) return json({ok:true}, 202, cors);`. Em /home/user/ecobraz-assets/site-ghost/theme/custom-agendamento.hbs não existe nenhum input com name="website"; o que existe é `<input type="hidden" name="source" value="website">` (linha 9), que é outro campo. A única barreira restante é `if (!allowed.has(origin)) return ... 403` (index.js:23), e o header Origin pode ser forjado por qualquer script server-side.
- **Impacto:** Um bot que faça POST direto ao endpoint com `Origin: https://ecobraz.org` e campos válidos passa por tudo e cria Contato + Deal no Ploomes — spam sujando o CRM e mascarando leads reais. O honeypot escrito no Worker não protege nada porque nenhum bot encontra o campo para preencher.
- **Correção sugerida:** Adicionar ao formulário um input real de honeypot: `<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">` escondido via CSS (não `type=hidden`, que bots ignoram). Complementar com Turnstile (junto com o fix do achado 1) e/ou rate-limit por IP no Worker.

### 🟠 MÉDIO · [worker-form] Erro 422 do Worker vira mensagem genérica em loop: validação server-side é mais rígida que a do HTML e o front ignora o corpo da resposta com os campos inválidos
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:58 — `if (!/^\S+@\S+\.\S+$/.test(String(v.email||''))) fields.push('email');` (exige ponto no domínio; o `type="email"` do HTML aceita `nome@empresa`). index.js:59 — `if (String(v.material_description||'').length > 4000) fields.push('material_description');` mas o textarea em custom-agendamento.hbs:19 não tem maxlength. E main.js:122 — `if (!response.ok) throw new Error('submission_failed');` descarta o corpo `{error:'validation_failed',fields:[...]}`; o usuário vê só 'Não foi possível enviar agora. Tente novamente ou fale com a equipe p
- **Impacto:** Quem digita um e-mail sem TLD (ou uma descrição acima de 4000 caracteres) passa na validação do navegador, recebe 422 do Worker e fica preso num loop de 'tente novamente' sem nenhuma pista de qual campo corrigir — lead perdido por frustração, sem registro em lugar nenhum.
- **Correção sugerida:** Em main.js, ler o JSON da resposta quando status=422 e exibir mensagem apontando os campos (`fields`). Adicionar maxlength="4000" ao textarea e pattern de e-mail equivalente ao regex do Worker no input (ou relaxar o regex do Worker para o padrão do HTML).

### 🟠 MÉDIO · [worker-form] Falha do Ploomes = lead não persistido em lugar nenhum; a recuperação depende 100% do próprio visitante reenviar
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:35-36 — `try { ploomes = await sendToPloomes(lead, env); } catch (error) { console.error('ploomes_failure', safeError(error)); return json({ok:false,error:'crm_unavailable'},502,cors); }`. Não há gravação em KV/D1/fila nem e-mail interno de contingência; o wrangler.toml não declara nenhum binding de storage. O console.error só sobrevive se houver tail/logpush ativo.
- **Impacto:** Durante qualquer indisponibilidade ou mudança de API do Ploomes, todos os leads do período são perdidos a menos que cada visitante decida tentar de novo ou migrar para o WhatsApp. O usuário até vê uma mensagem clara (não é perda silenciosa para ele), mas para o negócio o dado se perde sem rastro per
- **Correção sugerida:** Antes de responder 502, persistir o payload normalizado em um KV/D1 (binding simples no wrangler.toml) ou disparar o e-mail transacional E-goi para um endereço interno da Ecobraz com os dados do lead, permitindo reprocessamento manual.

### 🟠 MÉDIO · [worker-form] Sem JavaScript, o botão Enviar faz GET para a própria página: lead perdido sem feedback e dados pessoais expostos na URL
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/theme/custom-agendamento.hbs:8 — `<form class="collection-form" data-collection-form data-endpoint=... novalidate>` (sem method e sem action) com botão `type="submit"` na linha 30. O interceptador só existe se main.js rodar (main.js:105 `form.addEventListener('submit', ...)`); os steps só ficam escondidos com a classe que o JS adiciona (/home/user/ecobraz-assets/site-ghost/theme/assets/css/flow.css:1 — `.collection-form.is-enhanced .form-step{display:none}`), então sem JS o form inteiro aparece e é submetível.
- **Impacto:** Se main.js não executar (falha de rede no asset, conflito com Rocket Loader, bloqueador de script), o submit vira GET para /agendamento/ com nome, e-mail e telefone na query string: a página recarrega sem nenhuma mensagem, o lead nunca chega ao Worker (perda totalmente silenciosa) e dados pessoais v
- **Correção sugerida:** Adicionar `method="post"` ao form (elimina dados na URL) e um `<noscript>` dentro do form orientando a usar o WhatsApp, já que o Worker só aceita JSON (request.json() em index.js:25) e não processaria um POST form-encoded de qualquer forma.

### 🟠 MÉDIO · [redirects] Camada de redirects do Cloudflare não é versionada nem auditada no repositório, enquanto o Ghost está no limite e novas regras passaram a nascer só no Cloudflare
- **Status:** ⬜ pendente
- **Evidência:** docs/PLAYBOOK-SEO.md:171 — "O Ghost já tem **9069 regras** e está no **limite prático**... o plano é **migrar os redirects para o Cloudflare**" e :217 — "Criado **redirect 301 no Cloudflare** (Ghost está no limite de 9.069 regras) → `/sobre/`" (recuperação dos backlinks iFixit DR83 e TechTudo DR80). No repositório não há nenhum arquivo que inventarie as regras de redirect do Cloudflare; os checks estáticos (site-ghost/scripts/audit-content.mjs:67-75) só validam o redirects.yaml do Ghost.
- **Impacto:** Os redirects agora vivem em duas camadas, mas só uma é versionada e auditada. Uma regra futura no Cloudflare pode criar cadeia ou colisão com as 9.069 regras do Ghost sem nenhuma detecção automática, e se uma regra do Cloudflare for perdida/alterada por engano, os backlinks de alto valor que ela pro
- **Correção sugerida:** Criar um inventário versionado das regras de redirect do Cloudflare (ex.: site-ghost/migration/cloudflare-redirects.json com origem→destino) e incluir no audit-content (ou num script novo) a checagem cruzada: destino de regra Cloudflare não pode casar com fonte do redirects.yaml (cadeia) e vice-versa. Opcionalmente, um workflow que exporte as regras via API do Cloudflare e compare com o inventário

### 🟠 MÉDIO · [seo-structured] 13 posts têm meta_title truncado no meio da frase, aparecendo quebrado no Google — inclusive um que ranqueia em #10
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/content/priority-posts.json:244 → "meta_title": "O impacto ambiental do descarte incorreto de" (termina em 'de'); priority-posts.json:6 → "Tabela de Classificação de Resíduos Eletrônicos (ABNT/CONAMA) —" (termina em travessão). Outros 11 casos no mesmo padrão (ex.: 'Lixo eletrônico nas escolas: como ensinar sustentabilidade com a', 'Reciclagem de eletrônicos no Brasil: panorama atual, desafios e', 'Passo a Passo para Emitir MTR e CDF no Descarte de'). Confirmação Ahrefs: Notice-indexable-Page_and_SERP_titles_do_not_match.csv mostra /blog/o-impacto-ambiental-do-descarte-incorreto-de-
- **Impacto:** Títulos que terminam em 'de', 'com a', vírgula ou travessão parecem defeituosos na SERP e derrubam CTR; o Google já está reescrevendo o título do post que ranqueia na primeira página. Parece que os meta_titles foram gerados cortando o título completo em ~64 caracteres sem cuidado com o fim da frase.
- **Correção sugerida:** Reescrever os 13 meta_titles (12 em priority-posts.json + 1 em migrated-posts.json, slug anniston-e-o-pcb...) para frases completas de até ~60 caracteres e rodar o sync de posts. Priorizar o post o-impacto-ambiental-do-descarte-incorreto-de-eletrodomesticos, que já ranqueia.

### 🟠 MÉDIO · [seo-structured] www.ecobraz.org redireciona com 302 (temporário) e http://www passa por cadeia de 2 saltos até o domínio final
- **Status:** ⬜ pendente
- **Evidência:** Ahrefs Warning-302_redirect.csv: "https://www.ecobraz.org/" → 302 → https://ecobraz.org/; Notice-Redirect_chain.csv: http://www.ecobraz.org/ → 302 https://www.ecobraz.org/ → 302... → https://ecobraz.org/ (2 saltos, códigos "302, 200"). Em contraste, http://ecobraz.org/ → 301 direto (Notice-HTTP_to_HTTPS_redirect.csv). Nenhuma regra de www encontrada no repo (worker/src/index.js e redirects.yaml não tratam www) — é configuração do Cloudflare.
- **Impacto:** 302 é sinal de redirect temporário e a cadeia de 2 saltos dilui o sinal canônico de qualquer backlink antigo apontando para www (domínio ativo desde 2011). O Google tolera 302 persistente, mas 301 em salto único é o sinal correto e mais forte.
- **Correção sugerida:** No Cloudflare, ajustar a regra de www para 301 permanente apontando DIRETO para https://ecobraz.org/$1 (cobrindo http e https de uma vez, eliminando o salto intermediário). Não verifiquei ao vivo — evidência é do crawl Ahrefs de 22-24/07.

### 🟠 MÉDIO · [seo-structured] 6 links internos sem a barra final apontam para /blog/o-que-e-considerado-lixo-eletronico.../ e geram 301 interno; a URL sem barra recebe tráfego orgânico
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/content/priority-posts.json linhas 106, 134, 204, 260, 302, 358: href=\"https://ecobraz.org/blog/o-que-e-considerado-lixo-eletronico-exemplos-e-destinos-corretos-com-a-ecobraz\" (sem '/' final) nos posts o-mapa-completo..., os-componentes-toxicos..., a-diferenca-entre-descarte..., por-que-nao-jogar..., de-onde-vem... e lixo-eletronico-lista-completa.... Ahrefs Error-3XX_page_receives_organic_traffic.csv: essa URL sem barra responde 301, tem 6 inlinks e tráfego orgânico 7 — bate exatamente com as 6 ocorrências do repo.
- **Impacto:** Todo clique e todo rastreamento nesses 6 links passa por um 301 desnecessário; o Google chegou a indexar/servir a URL redirecionada (tráfego orgânico na URL 301). Único caso de link interno sem barra em todo o conteúdo — o resto está limpo.
- **Correção sugerida:** Adicionar a barra final nos 6 hrefs em priority-posts.json e rodar o sync de posts (sync-posts.mjs / build-priority-posts.mjs).

### 🟠 MÉDIO · [seo-structured] 7 páginas comerciais/locais indexáveis têm apenas 1 link interno dofollow no site inteiro
- **Status:** ⬜ pendente
- **Evidência:** Ahrefs Notice-indexable-Page_has_only_one_dofollow_incoming_internal_link.csv + -links.csv: /coleta-de-lixo-eletronico-em-campinas/, /coleta-de-lixo-eletronico-em-guarulhos/, /coleta-de-lixo-eletronico-no-abc/ recebem 1 único link cada (todas a partir de /coleta-de-lixo-eletronico/); /desmobilizacao-de-data-center/ e /logistica-reversa-para-fabricantes-e-importadores/ só de /solucoes-corporativas/; /descarte-de-equipamentos-de-varejo-e-pdv/ só de /solucoes-por-setor/; /ecobraz-villanova-esg/ só de /programa-adote-um-bairro/. Confirmado no repo: theme/partials/footer.hbs linka apenas a página l
- **Impacto:** São páginas feitas para gerar lead (busca local 'coleta de lixo eletrônico em campinas/guarulhos/abc' e serviços B2B) recebendo o mínimo possível de autoridade interna — dificulta ranquear exatamente as páginas que convertem.
- **Correção sugerida:** Adicionar as 3 páginas regionais ao bloco de regiões do footer.hbs (junto com São Paulo) e criar links cruzados entre as páginas de serviço relacionadas (ex.: desmobilização de data center ↔ descarte de servidores ↔ destruição de dados) nas landings geradas por build-landing-pages.mjs.

### 🟠 MÉDIO · [ahrefs-live] 9 backlinks dofollow DR 64 apontam para URL antiga /pt_BR/blog/... que responde 404
- **Status:** ⬜ pendente
- **Evidência:** API site-explorer-broken-backlinks: 9 dos 10 resultados têm url_to="https://ecobraz.org/pt_BR/blog/ecobraz-emigre-lanca-servico-exclusivo-de-processamento-de-fios-e-cabos-eletricos-para-recicladoras-e-ferros-velhos", http_code_target=404, domain_rating_source=64.0, is_dofollow=true, todos de subdomínios *.thezenweb.com com anchor "Reciclagem de Cabos e Fios"
- **Impacto:** Todo o valor desses links se perde no 404. Ressalva honesta: os blogs de origem (*.thezenweb.com) parecem auto-gerados/PBN — o valor real é bem menor que o do achado da TechTudo, e o padrão (anchor exato repetido, 62 links por domínio na média do perfil: 59.380 backlinks live para só 956 refdomains)
- **Correção sugerida:** Criar redirect 301 no Cloudflare para o padrão /pt_BR/blog/* (ou ao menos essa URL) apontando para o post/página atual equivalente sobre reciclagem de fios e cabos — custo zero, recupera qualquer valor residual. Investigar se alguém contratou esses links (campanha "Ecobraz-Emigre").

### 🟠 MÉDIO · [ahrefs-live] 41 páginas carregam cards.min.css e cards.min.js através de redirect 301 (resíduo do workaround do 404)
- **Status:** ⬜ pendente
- **Evidência:** API site-audit-issues: "Page has redirected CSS" crawled=41 e "Page has redirected JavaScript" crawled=41 (Warning); "CSS redirects"=2 e "JavaScript redirects"=2. Page-explorer confirma: "https://ecobraz.org/public/cards.min.css?v=1d3f0bbf87" → 301 → "https://ecobraz.org/public/cards.min.css" (idem .js, e também ?v=df3fd72764)
- **Impacto:** O redirect 301 no Cloudflare resolveu o 404 conhecido, mas deixou um custo residual: cada page view faz uma viagem extra por asset antes de baixar o arquivo real, e o CSS redirecionado atrasa a renderização dos cards em todas as 41 páginas. Não re-reporto o 404 (já conhecido) — este achado é sobre e
- **Correção sugerida:** Atualizar a referência no code injection do Ghost para apontar direto à URL final servida (sem o ?v= que dispara o redirect, ou fazendo o destino aceitar ?v= com 200), mantendo o redirect 301 só como fallback para caches antigos.

### 🟠 MÉDIO · [ahrefs-live] Presença orgânica quase nula apesar do perfil de links: 36 keywords e ~28 visitas orgânicas/mês
- **Status:** ⬜ pendente
- **Evidência:** API site-explorer-metrics (ecobraz.org, 2026-07-25): org_keywords=36, org_keywords_1_3=7, org_traffic=28, org_cost=150 (US$ 1,50/mês); paid_keywords=18, paid_traffic=120, paid_cost=1246 (US$ 12,46/mês). site-explorer-domain-rating: domain_rating=36.0. backlinks-stats: live_refdomains=956
- **Impacto:** O negócio depende do site para gerar leads, mas a busca orgânica traz estimados ~28 visitantes/mês (4x menos que o tráfego pago estimado). Há DR 36 e 956 domínios de referência — autoridade existe, mas o conteúdo não captura a demanda de busca transacional local. É a maior alavanca de crescimento gr
- **Correção sugerida:** Plano de conteúdo/on-page para keywords transacionais locais (ex.: "descarte de lixo eletrônico São Paulo", "coleta de lixo eletrônico gratuita", bairros/cidades da Grande SP — o modelo da página de Campinas já existe), com CTA para /agendamento/ em cada página. Priorizar as 7 keywords já no top 3 para proteger e expandir.

### 🟡 BAIXO · [tema] og:image e twitter:image de /blog/, /museu/ e /noticias-esg/ usam {{asset}}, que gera URL relativa (/assets/...) — a spec Open Graph exige URL absoluta e vários scrapers ignoram relativa
- **Status:** ⬜ pendente
- **Evidência:** index.hbs:20 `<meta property="og:image" content="{{asset "images/og-ecobraz.png"}}">` (idem :22 twitter:image); museu.hbs:15; noticias-esg.hbs:15
- **Impacto:** Compartilhamento dessas seções no WhatsApp/LinkedIn/Slack pode sair sem imagem de preview (comportamento varia por scraper — não verificado ao vivo). Para um negócio que vive de WhatsApp, preview sem imagem reduz clique.
- **Correção sugerida:** Prefixar com a URL do site: `content="{{@site.url}}{{asset "images/og-ecobraz.png"}}"` nos 3 templates (site.url do Ghost não tem barra final, o path do asset começa com /).

### 🟡 BAIXO · [tema] CTA do hero de page.hbs fixa `?perfil=empresa` para TODA página sem template próprio — inclusive páginas claramente B2C (geladeira, máquina de lavar, celulares)
- **Status:** ⬜ pendente
- **Evidência:** page.hbs:12 `<a class="button only-pt" href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem={{slug}}">` — template genérico usado pelas páginas de materiais residenciais (ex.: page-old-fridge-disposal e irmãs PT listadas em lang.css)
- **Impacto:** Visitante residencial chega ao formulário com "Empresa ou instituição" pré-selecionado; pode enviar com perfil errado ou estranhar. Fricção pequena, corrigível pelo próprio usuário.
- **Correção sugerida:** Remover o `perfil=empresa` do CTA genérico (deixar só `origem={{slug}}`), mantendo o pré-preenchimento de perfil apenas nos templates corporativos gerados.

### 🟡 BAIXO · [tema] Sem author.hbs: os arquivos de taxonomia /blog/autor/{slug}/ caem no index.hbs, cujo h1 só trata contexto de tag — nome do autor nunca aparece
- **Status:** ⬜ pendente
- **Evidência:** routes.yaml:31 `author: /blog/autor/{slug}/`; index.hbs:25 `<h1>{{#is "tag"}}{{tag.name}}{{else}}Conteúdo técnico sobre descarte eletrônico{{/is}}</h1>`; nenhum author.hbs/tag.hbs na listagem do tema
- **Impacto:** Páginas de autor da taxonomia mostram cabeçalho genérico (as páginas /autor/* das rotas custom estão cobertas — isso aqui é a taxonomia /blog/autor/, pouco linkada mas alcançável). Cosmético/SEO menor.
- **Correção sugerida:** Estender o else do index.hbs com `{{#is "author"}}{{author.name}}{{/is}}`, ou criar author.hbs simples.

### 🟡 BAIXO · [tema] Se localStorage estiver bloqueado, o banner de cookies nunca aparece (readConsent retorna a string 'unavailable', que é truthy) e o visitante não consegue registrar escolha
- **Status:** ⬜ pendente
- **Evidência:** main.js:43 `catch (_) { return 'unavailable'; }` + main.js:51 `if (!readConsent() || readConsent() === null) consentBar.hidden = false;` — 'unavailable' não passa no teste, banner fica oculto
- **Impacto:** Em navegação privada antiga/armazenamento bloqueado, o usuário fica sem opção de aceitar/recusar; os defaults regionais do GA (granted fora da UE) valem sem escolha possível. Caso raro.
- **Correção sugerida:** Tratar 'unavailable' como sem-escolha: `const c = readConsent(); if (!c || c === 'unavailable') consentBar.hidden = false;` (a decisão só não persistirá entre visitas).

### 🟡 BAIXO · [conteudo-pt] CTA final de descarte-de-baterias-e-nobreaks é o único sem parâmetro origem — atribuição da página se perde no CRM
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/content/material-pages.json:96 — `<a href="/agendamento/?material=Baterias"><strong>Solicitar coleta de baterias</strong></a>`. Levantamento de todos os 70 links de /agendamento/ nos 6 arquivos PT mostra que este é o único CTA de serviço sem origem (todos os demais têm origem=<slug>).
- **Impacto:** A nota do lead no Ploomes registra a página de origem só via page_url do formulário (worker/src/index.js:89, campo 'Página:'), que ficará `/agendamento/?material=Baterias` — impossível saber que o lead veio da página de baterias; o data-track de GA do clique também não existe nesse link. Página de b
- **Correção sugerida:** Alterar para `/agendamento/?material=Baterias&origem=descarte-de-baterias-e-nobreaks` e re-sincronizar material-pages.json.

### 🟡 BAIXO · [conteudo-pt] Parâmetro local= (SP, Guarulhos, ABC, Campinas) nos CTAs regionais não é lido por nada no site
- **Status:** ⬜ pendente
- **Evidência:** search-intent-pages.json:48, :64, :72, :80 — CTAs `?local=SP&origem=...`, `?local=Guarulhos&...`, `?local=ABC&...`, `?local=Campinas&...`. main.js:75-91 lê apenas perfil e material da query; o formulário (custom-agendamento.hbs:21) usa campos postal_code/city/state sem qualquer prefill de 'local'.
- **Impacto:** Nenhum dano (o valor sobrevive dentro de page_url na nota do CRM, e origem já identifica a região), mas o parâmetro sugere um prefill de cidade que não acontece — código/intenção divergem.
- **Correção sugerida:** Ou implementar em main.js o prefill do campo city a partir de ?local=, ou remover o parâmetro dos 4 CTAs para não acumular parâmetro morto.

### 🟡 BAIXO · [conteudo-pt] Três links de /agendamento/ sem origem em páginas institucionais e hub (evidencias, publicacoes, materiais-e-equipamentos-coletados)
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** institutional-pages.json:32 (`<a href="/agendamento/">Solicitar uma operação com escopo documentado</a>` em evidencias), :56 (`pela <a href="/agendamento/">página de agendamento</a>` em publicacoes) e commercial-pages.json:108 (`<a href="/agendamento/">Solicitar coleta do que coletamos</a>` no fallback de materiais-e-equipamentos-coletados).
- **Impacto:** Leads vindos desses links entram sem atribuição de página na nota do Ploomes (page_url fica /agendamento/ limpo). Volume esperado baixo — por isso severidade baixa. Obs.: o terceiro caso está em html de fallback que hoje não renderiza (o template dedicado não usa {{content}}), então só importaria se
- **Correção sugerida:** Acrescentar ?origem=evidencias, ?origem=publicacoes e ?origem=materiais-e-equipamentos-coletados respectivamente.

### 🟡 BAIXO · [conteudo-pt] No html de fallback de solucoes-corporativas, a lista de materiais NÃO aceitos aparece sem nada dizendo que são exclusões
- **Status:** ⬜ pendente
- **Evidência:** commercial-pages.json:90 — parágrafo solto: `<p>Pilhas domésticas avulsas, toner e cartuchos, lâmpadas, óleo, isopor, embalagens e resíduos químicos, biológicos, radioativos ou contaminados. Cada página declara seu escopo — e toda coleta passa por avaliação técnica antes da confirmação. <a href="/evidencias/">Ver evidências públicas</a>.</p>` — sem prefixo 'Não coletamos' nem heading. No template renderizado (page-solucoes-corporativas.hbs) existe o heading 'O que não…', então a página ao vivo está correta; o problema fica restrito ao conteúdo armazenado no Ghost (usado por busca interna/excer
- **Impacto:** Lido isolado (busca do Ghost, mudança de template, feed), o parágrafo pode ser interpretado como lista de materiais ACEITOS — o oposto da realidade, incluindo pilhas domésticas que a Ecobraz não coleta.
- **Correção sugerida:** No campo html de solucoes-corporativas, prefixar o parágrafo com marcação explícita, ex.: `<h2>O que não coletamos</h2>` ou iniciar com 'Não coletamos: pilhas domésticas avulsas…' (materiais-e-equipamentos-coletados, linha 108, já faz isso com '…não fazem parte dos nossos serviços').

### 🟡 BAIXO · [bilingue] Nos 79 posts EN a data e o tempo de leitura aparecem em português
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/theme/post.hbs:9 `{{date published_at format="DD [de] MMMM [de] YYYY"}}` e `{{reading_time minute="1 minuto" minutes="% minutos"}}` — template compartilhado; posts com tag #en (verificado: todos os 79 em en-posts.json têm a tag) renderizam ex.: "25 de julho de 2026 · 8 minutos".
- **Impacto:** Texto PT visível na meta de todos os artigos EN — cosmético, mas contradiz o cuidado bilíngue do resto do template.
- **Correção sugerida:** Envolver a meta em spans only-pt/only-en (versão EN com format="MMMM DD, YYYY" e minutes="% min read"), aproveitando que lang.css já esconde/mostra por tag-hash-en.

### 🟡 BAIXO · [bilingue] Comentários de proveniência errados nos geradores EN (apontam script/arquivo de origem incorretos)
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/scripts/build-landing-pages-en.mjs:62 e :271 emitem nos 15 templates EN `{{! Gerado por scripts/build-landing-pages.mjs a partir de landing/landing-pages-en.json ... }}` — o gerador real é build-landing-pages-en.mjs. E site-ghost/scripts/gera-idioma.mjs:1 diz "a partir de content/pares-idioma.json", mas a linha 6 lê 'site-ghost/pares-idioma.json' (o cabeçalho gerado no lang.css:1 repete o caminho errado).
- **Impacto:** Quem for regenerar pode rodar o script errado (build-landing-pages.mjs sobrescreveria os templates PT) ou procurar o JSON no caminho errado.
- **Correção sugerida:** Corrigir a string do comentário em build-landing-pages-en.mjs para o próprio nome e o comentário/cabeçalho de gera-idioma.mjs para site-ghost/pares-idioma.json.

### 🟡 BAIXO · [scripts-ci] Input enviar_lead vem marcado por padrão (default: true) — rodar o pente fino manualmente cria lead no CRM salvo desmarcação
- **Status:** ⬜ pendente
- **Evidência:** .github/workflows/ecobraz-pente-fino.yml:11-14 — `enviar_lead: ... type: boolean / default: true`. O agendado de segunda-feira não envia (a condição da linha 33 exige workflow_dispatch), mas o disparo manual envia por padrão.
- **Impacto:** Padrão opt-out inconsistente com o deploy-ghost.yml (test_integrations default false): quem clica 'Run workflow' sem revisar os inputs gera um registro real no Ploomes.
- **Correção sugerida:** Trocar para `default: false`, alinhando com o padrão opt-in dos demais workflows que criam lead.

### 🟡 BAIXO · [scripts-ci] Auditoria de links internos aceita slug de post como se fosse rota de raiz (ponto cego para link quebrado)
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/scripts/audit-content.mjs:36-37 — `const managedPages = pages.filter((page) => page.sourceFile !== 'priority-posts.json'); const knownSlugs = new Set([...managedPages.map((page) => page.slug), ...fixedRoutes]);` — migrated-posts.json (40 posts em /blog/ ou /museu/) e en-posts.json (79 posts em /blog/) entram em knownSlugs como se respondessem em /<slug>/.
- **Impacto:** Um link interno escrito por engano como /<slug-do-post>/ (sem o prefixo /blog/) passa na auditoria de conteúdo mas dá 404 ao vivo — só a auditoria live da home pegaria, e apenas se o link estiver na home.
- **Correção sugerida:** Tratar en-posts.json e migrated-posts.json como posts (igual priority-posts.json): excluí-los de knownSlugs e registrar suas rotas como blog/<slug> (ou museu/<slug>) em knownRoutes.

### 🟡 BAIXO · [scripts-ci] JWT único com validade de 5 minutos para o loop inteiro — runs longos podem morrer com 401 no meio
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/scripts/sync-posts.mjs:12 — `exp:now+300` gerado uma única vez e usado para os 79 posts de en-posts.json (2 chamadas por post); aplica-hreflang.mjs:16 idem, com ~4 chamadas + espera(200) por par × 47 pares (pares-idioma.json). Contraste: sync-post-covers.mjs:288-293 já regenera o token por item (makeToken()).
- **Impacto:** Se o Ghost Pro estiver lento ou aplicar rate limit, a execução passa dos 300s e falha com 401 confuso no meio do lote, deixando o sync pela metade.
- **Correção sugerida:** Adotar o padrão do sync-post-covers.mjs: função makeToken() chamada a cada iteração (ou a cada N requisições) em vez de um token fixo no topo do script.

### 🟡 BAIXO · [scripts-ci] Workflows de diagnóstico pontual já cumpridos continuam no repositório e poluem a lista de Actions
- **Status:** ⬜ pendente
- **Evidência:** ecobraz-check-live.yml:3-8 (investigação do /public/cards.min.js — problema já resolvido com o redirect 301 no Cloudflare); diagnose-gtag.yml (diagnóstico pontual do GA4); ecobraz-limpa-codeinjection.yml:3-5 (limpeza pontual do script cards no code injection); informa-inventory.yml e informa-conteudo.yml (extração Wayback da migração ecobrazinforma, já consolidada em content/migrated-posts.json); portal-diagnostico-login.yml, portal-diagnostico-ploomes.yml, portal-inspeciona-campos.yml, villanova-diag-form.yml (diagnósticos one-off).
- **Impacto:** Ruído na aba Actions para um dono não-técnico e risco pequeno de rodar por engano ferramentas que não têm mais função (nenhuma delas é destrutiva por padrão, todas em modo read/dispatch).
- **Correção sugerida:** Remover (o git guarda o histórico) os workflows cujo diagnóstico foi concluído; manter ecobraz-cf-redirect-cards.yml, que ainda administra a regra viva na Cloudflare (modos read/apply/remove).

### 🟡 BAIXO · [scripts-ci] Nome do workflow diz 'staging' mas ele publica e audita a produção (ecobraz.org)
- **Status:** ⬜ pendente
- **Evidência:** .github/workflows/deploy-ghost.yml:1 — `name: Deploy Ghost staging`; porém as auditorias do próprio job apontam para produção: linha 157/159/161/163 usam https://ecobraz.org (audit-live-redirects, audit-live-site, submit-indexnow).
- **Impacto:** Rótulo enganoso na interface do GitHub Actions: sugere ambiente de teste quando cada push altera o site de produção que gera os leads.
- **Correção sugerida:** Renomear para algo como 'Deploy Ghost — producao (ecobraz.org)'.

### 🟡 BAIXO · [scripts-ci] Log imprime PASS 'nenhum bloqueio geográfico detectado' mesmo quando o loop acima registrou bloqueio
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/scripts/auditoria-indexacao.mjs:96 — `ok('nenhum bloqueio geográfico detectado (BR e Europa acessam sem restrição)');` é incondicional, logo após o loop das linhas 88-95 que pode ter chamado `falha(...)` para perfis bloqueados.
- **Impacto:** Só afeta a leitura do log (o exit code continua correto via `problemas`): num run com bloqueio real, aparecem FAIL e PASS contraditórios sobre o mesmo assunto, confundindo a interpretação.
- **Correção sugerida:** Guardar quantos `falha()` o loop geográfico gerou e só imprimir o PASS quando for zero.

### 🟡 BAIXO · [worker-form] Valor real de ALLOWED_ORIGINS não é versionado nem documentado — impossível confirmar pelo repositório se https://ecobraz.org (e a variante www) estão liberados
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:23 — `if (!allowed.has(origin)) return json({ok:false, error:'origin_not_allowed'}, 403, cors);` e index.js:51 lê `env.ALLOWED_ORIGINS`; o wrangler.toml:15 só cita o nome da variável, sem valor esperado documentado.
- **Impacto:** Se o valor na Cloudflare não incluir exatamente o(s) host(s) por onde o público acessa (apex e/ou www), o fetch falha por CORS e o usuário cai na mensagem genérica de erro — perda de leads difícil de diagnosticar. Não verificado: exige teste ao vivo (fora do alcance deste ambiente).
- **Correção sugerida:** Documentar no comentário do wrangler.toml o valor esperado (ex.: 'https://ecobraz.org,https://www.ecobraz.org') e, na auditoria ao vivo, testar um OPTIONS/POST a partir de ambos os hosts confirmando o header access-control-allow-origin.

### 🟡 BAIXO · [worker-form] Falha na inscrição E-goi de lead com consentimento de marketing é engolida sem rastro persistente — o opt-in explícito se perde em silêncio
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:38-41 — `if (lead.marketing_consent) { try { egoi = await sendToEgoi(lead, env); } catch (error) { console.error('egoi_failure', safeError(error)); egoi = {ok:false, ...}; } }`. O front nunca lê o corpo da resposta (main.js trata só response.ok), e console.error em Workers é efêmero sem tail/logpush.
- **Impacto:** O lead principal sobrevive (desenho correto: não-fatal), mas quando o E-goi falha, o pedido explícito 'Quero receber conteúdos' se perde sem nenhum registro recuperável — a pessoa consentiu e nunca entra na lista, e ninguém fica sabendo.
- **Correção sugerida:** Registrar a falha de forma persistente: acrescentar 'E-goi: FALHOU' ao Note do contato/deal no Ploomes (o consentimento já vai no Note, index.js:90), ou habilitar Workers Logs/logpush para permitir reprocesso.

### 🟡 BAIXO · [worker-form] resolveSenderId escolhe automaticamente o primeiro remetente da conta E-goi quando EGOI_SENDER_ID não está definido, com cache que nunca expira no isolate
- **Status:** ⬜ pendente
- **Evidência:** /home/user/ecobraz-assets/site-ghost/worker/src/index.js:115-117 — `const list = Array.isArray(data) ? data : (data.items || ...); const pick = (list || []).find(...) || (list||[])[0]; _cachedSenderId = pick ? (...) : null;` — sem filtro por domínio/verificação do remetente; `_cachedSenderId` (index.js:107) persiste até o isolate reciclar.
- **Impacto:** O e-mail de confirmação ao lead pode sair de um remetente errado ou não relacionado à Ecobraz se a conta E-goi tiver mais de um sender, prejudicando entregabilidade e confiança; se o sender for trocado na conta, o cache antigo continua sendo usado. Não fatal (o lead já foi salvo), mas afeta a experi
- **Correção sugerida:** Definir EGOI_SENDER_ID explicitamente no env da Cloudflare (o código já prioriza, index.js:109) e tratar o fallback automático apenas como contingência documentada.

### 🟡 BAIXO · [redirects] IMPORTAR-REDIRECTS.md está desatualizado: cita 7.913 regras (o arquivo real tem 9.069) e manda validar com um CSV que não existe no repositório
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/migration/IMPORTAR-REDIRECTS.md:3 — "O novo site possui **7.913 redirecionamentos** preparados" e :31 — "site-ghost/migration/legacy-url-inventory.csv". Verificado: `wc -l site-ghost/theme/redirects.yaml` = 9.070 linhas (9.069 regras sob `301:`), e `ls site-ghost/migration/` contém apenas IMPORTAR-REDIRECTS.md, launch-checklist.md e redirect-map.csv — legacy-url-inventory.csv não existe. Os workflows reais já usam outro caminho: .github/workflows/verify-migration.yml:22 e deploy-ghost.yml:157 chamam `audit-live-redirects.mjs ... site-ghost/migration/redirect-map.csv`.
- **Impacto:** Se o Marcio (ou alguém no futuro) seguir o guia ao pé da letra, o comando de validação falha com arquivo inexistente e a contagem esperada (7.913) não bate com a que o Ghost vai reportar (9.069), gerando confusão desnecessária num procedimento que é justamente o único passo manual dele. A migração j
- **Correção sugerida:** Atualizar IMPORTAR-REDIRECTS.md: trocar 7.913 por 9.069 (ou por texto dinâmico "o número exibido pelo deploy"), e corrigir o comando de validação para o que os workflows realmente usam: `node site-ghost/scripts/audit-live-redirects.mjs https://ecobraz.org site-ghost/migration/redirect-map.csv 100` e a amostra do pacote com `site-ghost/theme/redirects.yaml 250`.

### 🟡 BAIXO · [seo-structured] Erro de validação schema.org nas 6 páginas /blog/tag/* vem do JSON-LD 'Series' gerado pelo Ghost core, não do JSON-LD do tema
- **Status:** ⬜ pendente
- **Evidência:** Ahrefs Notice-Structured_data_has_schema.org_validation_error.csv: as 6 URLs flagadas são todas e somente tags (/blog/tag/noticias-esg/, /museu-do-eletronico/, /e-waste-insights/, /esg-news/, /conteudos-lixo-eletronico/, /electronics-museum/), com schema items 'NGO, Person, Series, WebSite'. O @graph do tema (NGO+Person+WebSite, theme/default.hbs:91-151) está presente em TODAS as páginas do site e só as tags foram flagadas — por eliminação, o item inválido é o 'Series' que o {{ghost_head}} (default.hbs:89) emite em arquivos de tag; é problema conhecido do Ghost (emite 'publisher' em Series, pr
- **Impacto:** Nenhum impacto prático nas páginas comerciais: são 6 páginas de tag com 0 de tráfego orgânico, e o item inválido não gera rich result de qualquer forma. O @graph do tema (NGO/Person/WebSite) está sintaticamente válido — chequei campo a campo (telephone, address, taxID, sameAs, @id).
- **Correção sugerida:** Aceitar como limitação do Ghost Pro (não é editável pelo tema) ou, se quiser zerar o aviso, reescrever/remover esse bloco via o worker do Cloudflare (site-ghost/worker/src/index.js) apenas em /blog/tag/*. Prioridade baixa.

### 🟡 BAIXO · [seo-structured] 2 meta_descriptions passam de 160 caracteres (162 e 163) e serão truncadas na SERP
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/content/search-intent-pages.json:79 (slug coleta-de-lixo-eletronico-em-campinas, 162 chars: "Coleta de eletrônicos em Campinas e região mediante avaliação. Dentro da área de cobertura da Ecobraz — informe CEP, materiais e volume para verificar a retirada.") e priority-posts.json:273 (slug o-que-e-considerado-lixo-eletronico..., 163 chars). Confirmado pelo Ahrefs Warning-indexable-Meta_description_too_long.csv (mesmas 2 URLs, 162/163).
- **Impacto:** Corte de 2-3 caracteres no fim da descrição na SERP — cosmético. Todo o restante do conteúdo está dentro do limite (verifiquei os 13 arquivos JSON: nenhuma meta_description ausente ou curta demais).
- **Correção sugerida:** Encurtar as 2 descrições para ≤160 caracteres (ex.: remover ' — informe CEP, materiais e volume' vira '— informe CEP e materiais') e re-sincronizar.

### 🟡 BAIXO · [seo-structured] FAQPage da home declara 6 perguntas no JSON-LD mas a página exibe 7 — falta a pergunta sobre auditoria europeia
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** theme/home.hbs:396 exibe a 7ª pergunta visível: <summary>Minha cadeia é auditada por matriz ou comprador europeu. Vocês atendem?</summary>; o bloco JSON-LD FAQPage (home.hbs:418-431) lista apenas 6 Questions e não inclui essa. Nas 15 landings comerciais o FAQ visível e o JSON-LD batem (verifiquei page-descarte-de-ativos-de-ti-desmobilizados.hbs: 5 <summary> = 5 Questions no codeinjection).
- **Impacto:** O Google recomenda que o FAQPage espelhe o conteúdo visível; a pergunta ausente é justamente a que conecta ao posicionamento Brasil-Europa/Villanova. Impacto pequeno (rich results de FAQ hoje são raros fora de sites gov/saúde).
- **Correção sugerida:** Adicionar a 7ª Question/Answer ao bloco FAQPage em home.hbs (linhas 418-431), com texto igual ao visível.

### 🟡 BAIXO · [seo-structured] tags-meta.json não cobre a tag conteudos-lixo-eletronico — a principal tag PT do blog fica sem meta_description
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** site-ghost/content/tags-meta.json contém só 5 slugs (noticias-esg, museu-do-eletronico, e-waste-insights, esg-news, electronics-museum); a tag conteudos-lixo-eletronico — usada pelos 41 posts de priority-posts.json (ex.: linha 12) e com página indexável /blog/tag/conteudos-lixo-eletronico/ (aparece no crawl do Ahrefs com 4 páginas de paginação) — não está no arquivo.
- **Impacto:** A página da tag mais populosa do blog fica sem meta description própria (o Ghost só emite se a tag tiver descrição), enquanto as 5 tags menores têm. Página de tag com 0 tráfego hoje — melhoria, não defeito.
- **Correção sugerida:** Adicionar entrada { "slug": "conteudos-lixo-eletronico", "meta_description": "..." } em tags-meta.json e rodar scripts/sync-tags-meta.mjs.

### 🟡 BAIXO · [seo-structured] Link externo para https://www.gov.br/conama/ retorna 404 real em um post EN indexável
- **Status:** ⬜ pendente
- **Evidência:** site-ghost/content/en-posts.json:1128 contém o href https://www.gov.br/conama/ (âncora 'CONAMA – National Environment Council', no post e-waste-recycling-brazil-challenges-opportunities). Ahrefs Error-indexable-Page_has_links_to_broken_page-links.csv confirma target 404 (content-type application/json). Os demais 'External 4XX' do crawl são 403 anti-bot (cetesb, unep, gov.br/mma, zenodo.org) — falsos positivos prováveis, não confirmados como quebrados.
- **Impacto:** Um link de referência regulatória quebrado num post EN — má experiência e sinal fraco de qualidade; sem efeito nas páginas de conversão.
- **Correção sugerida:** Trocar por https://www.gov.br/mma/pt-br/assuntos/conama (ou a URL vigente do CONAMA no portal gov.br — confirmar antes, não testei ao vivo) em en-posts.json e re-sincronizar.

### 🟡 BAIXO · [ahrefs-live] Meta description longa demais em 2 páginas indexáveis, incluindo a página comercial de Campinas
- **Status:** ✅ CORRIGIDO (lote 1, 25/07)
- **Evidência:** API site-audit-issues: "Meta description too long" (indexable, Warning) crawled=2. Page-explorer: "https://ecobraz.org/coleta-de-lixo-eletronico-em-campinas/" e "https://ecobraz.org/blog/o-que-e-considerado-lixo-eletronico-exemplos-e-destinos-corretos-com-a-ecobraz/", ambas http_code=200
- **Impacto:** O Google trunca a descrição no resultado de busca; na página de Campinas (página de captação de lead) isso pode reduzir um pouco o CTR.
- **Correção sugerida:** Reescrever as meta descriptions dessas 2 páginas no Ghost para ~150-155 caracteres, terminando com chamada de ação completa (ex.: "Agende sua coleta gratuita").

### 🟡 BAIXO · [ahrefs-live] Erro de validação schema.org em 6 páginas de tag do blog
- **Status:** ⬜ pendente
- **Evidência:** API site-audit-issues: "Structured data has schema.org validation error" crawled=6 (Notice). Page-explorer lista: /blog/tag/noticias-esg/, /blog/tag/museu-do-eletronico/, /blog/tag/e-waste-insights/, /blog/tag/esg-news/, /blog/tag/conteudos-lixo-eletronico/, /blog/tag/electronics-museum/ (todas 200)
- **Impacto:** Baixo: são arquivos de tag (não páginas de lead) e o erro é nível Notice; no máximo perde-se elegibilidade a rich results nessas páginas. Provavelmente vem do structured data padrão do tema Ghost em páginas de tag. Não confundi com os WARNs conhecidos do audit-content sobre rotas fora do page-sync —
- **Correção sugerida:** Abrir uma dessas URLs no validador schema.org (validator.schema.org) para ver o erro exato e ajustar o partial do tema (provável campo faltante no objeto Series/CollectionPage gerado pelo Ghost para tags).

### 🟡 BAIXO · [ahrefs-live] Post do blog recebe tráfego orgânico na URL sem barra final, servida via 301
- **Status:** ⬜ pendente
- **Evidência:** API site-audit-issues: "3XX page receives organic traffic" (Error) crawled=1. Page-explorer: url="https://ecobraz.org/blog/o-que-e-considerado-lixo-eletronico-exemplos-e-destinos-corretos-com-a-ecobraz" http_code=301 → final_redirect com "/" final, traffic=5.0
- **Impacto:** Impacto pequeno (~5 visitas/mês e o 301 preserva o valor), mas indica que algum link (interno, externo ou resultado indexado) aponta para a versão sem barra, adicionando um salto para o visitante.
- **Correção sugerida:** Localizar onde o link sem barra final é usado (busca no conteúdo do Ghost e nos backlinks) e corrigir para a URL canônica com "/"; nenhuma ação no Cloudflare é necessária.

### ⚪ INCERTO · [ahrefs-live] www.ecobraz.org/robots.txt inacessível no último crawl (timeout) — issue nível Error no Ahrefs
- **Evidência:** API site-audit-issues (project 9845837): "Robots.txt is not accessible", importance=Error, crawled=1. site-audit-page-explorer para esse issue: url="https://www.ecobraz.org/robots.txt", http_code=0, curl_code=28 (timeout)
