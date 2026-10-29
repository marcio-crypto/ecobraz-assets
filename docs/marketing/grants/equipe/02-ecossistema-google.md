# 02 — Plataformas e ecossistema Google (mensuração, site, Perfil da Empresa, GSC, YouTube, Nonprofits)

Autor: especialista em plataformas Google da equipe · 29/10/2026 · só leitura (nada foi alterado em conta, site ou sistema).

## 0. O que consegui e o que NÃO consegui verificar

- **Verificado (dado lido):** planilha da conta (abas `conversoes_config`, `conversoes_por_acao_30d`, `conta_mensal`); código do tema e do Worker no repositório (`site-ghost/theme/default.hbs`, `site-ghost/theme/assets/js/main.js`, `site-ghost/theme/custom-agendamento.hbs`, `site-ghost/worker/src/index.js`); base de coletas (MCP Base_Ecobraz, visão geral de 29/10).
- **NÃO verificado:** o site ao vivo. `ecobraz.org` e `support.google.com` estão **fora da rede liberada desta sessão** (WebFetch: "ENOTFOUND"; curl: proxy 403). Por isso não medi velocidade/mobile nem confirmei a tag no HTML publicado. Para inspecionar ao vivo, `ecobraz.org` precisa ser liberado nas configurações de rede da sessão — ou o Marcio roda o PageSpeed Insights (passo na seção 6).
- As regras do Grants abaixo vêm de **trechos de busca** das páginas oficiais (não consegui abrir a página inteira). URLs citadas; recomendo uma leitura final da página antes de agir em algo que dependa de redação exata.

## 1. Regras oficiais do Grants que importam para mensuração (FATO, com fonte)

| Regra | Fonte |
|---|---|
| Conta precisa de rastreamento de conversão válido e **≥ 1 conversão por mês**. | [Account management policy](https://support.google.com/nonprofits/answer/117827?hl=en) |
| Tempo no site / visita à home "podem ser adicionados, mas **devem ser excluídos de 'Conversões' e usar a categoria 'Outro'**". (Versão mais nova do guia: podem existir, mas não em todas as campanhas.) | [Set up conversion tracking](https://support.google.com/grants/answer/9841491?hl=en) · [9038650](https://support.google.com/grants/answer/9038650?hl=en-GB) |
| Ligações contam só com **duração mínima de 30 s**. | mesmas páginas de configuração |
| Conversões ≈ cliques é sinal de alerta; taxa alta precisa ser de ação significativa; preferir página de "obrigado". | [Policy compliance guide](https://support.google.com/nonprofits/answer/9314402?hl=en) |
| CTR **≥ 5% por mês no nível da conta**; 2 meses seguidos abaixo → **desativação temporária**. | [Account management policy](https://support.google.com/nonprofits/answer/117827?hl=en) |
| Teto de lance US$ 2 não se aplica a Maximizar conversões / CPA desejado / ROAS desejado. Google recomenda **Maximizar conversões** quando o objetivo não é doação/compra; 15–30 conversões em 30 dias é um bom ponto de partida. | [Conversion tracking guide (Grants)](https://support.google.com/grants/answer/9085439?hl=en) · [Tips for success](https://support.google.com/nonprofits/answer/98870?hl=en) |
| **WhatsApp / clique em link externo:** **não achei** regra oficial dizendo que conta ou que não conta. | — (lacuna declarada) |

Consequência direta para a Ecobraz (FATO, planilha `conta_mensal`): CTR abaixo de 5% de junho a outubro (3,9% / 3,5% / 3,9% / 3,8% / 2,9%). Isso é um risco ativo pela regra acima — fora do meu escopo, mas a equipe precisa saber que a conta já está há 5 meses descumprindo essa regra.

## 2. Diagnóstico da configuração de conversões

### 2.1 O que está realmente otimizando hoje (FATO)
Ações **ativas e primárias** (`primary_for_goal=TRUE`, `include_in_conversions_metric=TRUE`):

| Ação | Categoria | O que é de verdade (código `main.js`) | Conversões 30d |
|---|---|---|---|
| Ecobraz Emigre (web) generate_lead | Enviar formulário de lead | Disparada **só depois que o Worker/CRM confirmou o recebimento** do pedido de coleta (linha ~178). É a melhor conversão do site. | **1** |
| Ecobraz Emigre (web) contact_whatsapp | Ligação (PHONE_CALL_LEAD) | **Clique** em qualquer link wa.me / api.whatsapp.com (linha 20). Não sabe se a pessoa mandou mensagem. | **9** |
| Ecobraz Emigre (web) contact_phone | Ligação (PHONE_CALL_LEAD) | **Clique** em link `tel:`. Não é ligação; não mede 30 s. | **1** |
| Lead form - Submit | Enviar formulário de lead | Formulário de lead do próprio Google Ads | 0 |

- Total 30 dias: **11 conversões, das quais 9 (82%) são clique em WhatsApp** e **1 é pedido de coleta confirmado**. O Maximizar conversões está, na prática, otimizando para "clicou no WhatsApp".
- Histórico (FATO, `conta_mensal`): jun = **1.068 conversões para 354 cliques** (mais conversões que cliques) — exatamente o padrão que o guia de conformidade manda evitar. Hoje isso acabou (ações antigas de visualização foram removidas), mas reforça por que a configuração precisa ficar limpa.

### 2.2 Mal categorizado (FATO; impacto atual na otimização = baixo, porque são secundárias)
- `form_error_coleta` → categoria **Compra (PURCHASE)**. É um **erro** de formulário. Hoje é secundária e fora de "Conversões", então não puxa lance; mas qualquer campanha configurada com meta "Compra" passaria a otimizar para erro. **Mudar para "Outro" ou remover.**
- `page_view`, `session_start`, `first_visit`, `scroll`, `consent_choice`, `form_start`, `form_submit`, `form_start_coleta` → categoria **Enviar formulário de lead**. Estão secundárias (ok), mas:
  - A regra do Grants pede que visualização/tempo no site usem a **categoria "Outro"** (fonte acima). Do jeito que está, um revisor do Google vê `page_view` como "lead". **Risco de conformidade (confiança média).**
  - Poluem "Todas as conversões" e qualquer relatório por meta "Lead".
- `click` (genérico) → categoria Ligação. Deve ser "Outro" (ou removida).
- `contact_whatsapp` e `contact_phone` → "Ligação". São **cliques**, não ligações; categoria mais honesta: **"Contato"**.
- `form_submit` (GA4 automático) duplica a intenção do `generate_lead` e dispara mesmo quando o envio falha no servidor (o evento automático do GA4 olha o submit do navegador). Manter **secundária**; nunca primária.
- YouTube channel subscriptions / follow-on views: ativas, secundárias, fora de "Conversões" — **ok assim**.
- `cta_click`, `user_engagement`, `contact_email`, `file_download`: secundárias; mover para "Outro" quando tiver tempo.

### 2.3 Lacunas que impedem medir COLETA (FATO, código)
1. **O site não guarda o GCLID** (nem gbraid/wbraid). Só UTMs vão para o Worker → portal (`sistema.ecobraz.org/api/lead`). Sem GCLID, a importação offline "clássica" não casa a coleta com o clique.
2. **`generate_lead` não envia valor** (`value`/`currency`). Todo pedido vale igual: geladeira de PF = 300 itens de empresa.
3. Existe mitigação parcial: o site já entrega e-mail/telefone à tag (`gtag('set','user_data',…)`, autorizado em 15/07), o que permite **conversões otimizadas para leads** casarem por e-mail/telefone com hash. **Não verifiquei** se "conversões otimizadas"/"coleta de dados fornecidos pelo usuário" está ligada na conta Ads e no GA4.
4. A conta não tem nenhuma ação "coleta agendada" ou "coleta concluída". O portal tem esse dado (FATO, MCP: 343 OS — 79 agendadas, 223 concluídas, 39 canceladas; cobranças de OS somam R$ 16.108,50 em 53 OS ⇒ ~R$ 304 por OS cobrada).

### 2.4 Observação sobre a propriedade GA4 (HIPÓTESE a confirmar)
O tema tem por padrão `G-Y1ERW8GNPR` ("Ecobraz — Site", criado em 15/07) mais `GT-PHC28JHZ`. As conversões na conta vêm de uma propriedade chamada **"Ecobraz Emigre"**. Os nomes de evento casam exatamente com o `main.js` (`form_start_coleta`, `form_error_coleta`, que só existem nesse código), então **o site publicado está, sim, mandando eventos para a propriedade ligada ao Ads** (inferência forte). Só não sei se "Ecobraz Emigre" é o nome da propriedade cujo fluxo é o G-Y1ERW8GNPR ou se o ID foi trocado no painel do Ghost. Vale 1 minuto de conferência (seção 6, passo A).

## 3. Recomendação de mensuração

### 3.1 Primárias vs. secundárias (o que fazer)

| Ação | Hoje | Recomendado | Por quê | Confiança |
|---|---|---|---|---|
| generate_lead (pedido confirmado) | Primária | **Primária**, categoria Lead, com valor (3.3) | É o único sinal ligado a coleta | Alta |
| **Nova: "Coleta agendada (offline)"** | não existe | **Primária** assim que tiver ≥ 2–3 semanas de upload regular | É o que a missão quer: coleta real | Alta (conceito) / média (prazo) |
| **Nova: "Coleta concluída (offline)"** | não existe | **Secundária** no início (atrasa dias); primária depois, se o volume permitir | Melhor sinal, mas lento e pouco volume | Média |
| contact_whatsapp (clique) | Primária | **Manter primária por ora**, categoria "Contato", **contagem "Uma"** por clique, valor baixo | Sem ela a conta cai para ~1–2 conv./mês e fica no limite da regra "≥ 1 por mês"; mas é sinal fraco | Média |
| contact_phone (clique tel:) | Primária | **Secundária** e trocar por **ligações de anúncio (recurso de ligação) com mínimo de 30 s** | Clique em `tel:` não é ligação; a regra oficial fala em 30 s | Média-alta |
| Lead form - Submit | Primária | Primária (sem mudança) | Lead real; hoje 0 | Alta |
| form_error_coleta | Compra, secundária | **Outro**, secundária (ou remover) | Erro não é conversão | Alta |
| page_view, session_start, first_visit, scroll, consent_choice, click, user_engagement | Lead/Ligação/Engaj., secundárias | **Outro**, secundárias, fora de "Conversões" | Regra do Grants (categoria "Outro") | Média-alta |
| form_start, form_start_coleta, form_submit, cta_click | Lead, secundárias | Secundárias (categoria "Outro" ou "Lead" só para diagnóstico) | Úteis para ver funil, ruins para lance | Alta |

**Plano de transição (para não ficar sem conversão em nenhum mês):**
1. Semana 1: limpar categorias (sem mudar o que é primário) + ligar ligações ≥ 30 s + pôr valores.
2. Semanas 2–4: site passa a guardar GCLID; começar upload diário de "Coleta agendada".
3. Quando "Coleta agendada" + generate_lead somarem ≥ ~15/mês de forma estável: passar `contact_whatsapp` para **secundária**. Antes disso, rebaixar o WhatsApp tira quase todo o sinal do Maximizar conversões (HIPÓTESE fundamentada no volume atual: 1 lead de formulário em 30 dias).

**É válido contar clique no WhatsApp para o Grants?** O que é FATO: a política exige "ação significativa", alerta contra conversões ≈ cliques e não cita WhatsApp; ligação exige 30 s. O que é HIPÓTESE: clique no WhatsApp provavelmente passa numa revisão (é "contato com a organização", contado 1 por clique, longe de 1:1 com cliques — hoje 9 conv. para ~66 cliques/mês ≈ 14%), mas é o elo mais fraco da configuração. Por isso: manter só como ponte, com valor baixo, e substituir por coleta confirmada.

### 3.2 Conversão offline / coleta confirmada (como fazer)
Fluxo recomendado (HIPÓTESE de desenho; peças técnicas verificadas no código):
1. **Site** (mudança de código, nossa, com aprovação): ler `gclid`, `gbraid`, `wbraid` da URL de chegada, guardar 90 dias (cookie/armazenamento com o consentimento já existente) e enviar em campos ocultos no formulário, como já é feito com UTMs. Worker repassa ao portal.
2. **Portal** (`sistema.ecobraz.org`): gravar GCLID + e-mail/telefone no lead e na OS. Quando a OS virar "agendada" e "concluída", gerar uma linha de exportação.
3. **Google Ads:** criar 2 ações do tipo **Importação → Conversões de leads (CRM/arquivo)**, metas "Lead qualificado" (agendada) e "Lead convertido" (concluída) — são as metas que o Google recomenda para leads trabalhados offline ([About enhanced conversions for leads](https://support.google.com/google-ads/answer/15713840?hl=en)).
4. **Envio:** pelo **Gerenciador de dados (Data Manager)** do Google Ads, lendo uma planilha Google que o portal atualiza. Motivo: o Google anunciou que importação offline / conversões otimizadas para leads migram para a Data Manager API a partir de **15/06/2026** e ficam bloqueadas no caminho antigo da Google Ads API ([Updates to your enhanced conversions settings](https://support.google.com/google-ads/answer/16884284?hl=en-GB) · [Using Data Manager](https://support.google.com/google-ads/answer/15707550?hl=en)). **Não verifiquei** se o upload por planilha via script (`AdsApp.bulkUploads`) ainda funciona depois dessa mudança — por isso recomendo Data Manager.
5. Prazos de upload (fonte antiga, confirmar): até 90 dias do clique com GCLID; até 63 dias com dados pessoais ([Offline conversion imports FAQs](https://support.google.com/google-ads/answer/10029210?hl=en)).

Alternativa mais rápida e mais fraca: GA4 já tem as ações `qualify_lead`/`close_convert_lead` (hoje **removidas** na conta). Dá para o portal mandar esses eventos ao GA4 via Measurement Protocol com o `client_id` — mas exige guardar o client_id e o casamento com o clique é pior. Prefiro o caminho GCLID + e-mail.

### 3.3 Valores por conversão (proposta — pesos relativos, em R$)
Com Maximizar conversões, **valor não muda o lance** (o que muda é primária/secundária). Valor serve para (a) relatório honesto e (b) migrar no futuro para ROAS desejado, se houver volume. Base: ~R$ 304 por OS cobrada (FATO, portal); faixas de volume do formulário (FATO, `custom-agendamento.hbs`).

| Conversão | Valor proposto | Lógica |
|---|---|---|
| generate_lead — PF (eletrônico/linha branca) | R$ 30 | Coleta PF é gratuita; peso de missão, não de receita |
| generate_lead — empresa, até 50 itens | R$ 100 | Lead B2B pequeno |
| generate_lead — empresa, 51+ itens ou "Servidores e data center" | R$ 300 | ~valor médio de OS cobrada |
| Coleta agendada (offline) | PF R$ 50 · empresa = valor previsto da OS | Sinal real |
| Coleta concluída (offline) | valor cobrado da OS (PF: R$ 50) | Sinal final |
| contact_whatsapp | R$ 10 | Contato não qualificado |
| Ligação ≥ 30 s | R$ 20 | Contato qualificado mínimo |

Implementação: no `main.js`, passar `value` e `currency: 'BRL'` no `track('generate_lead', …)` conforme `profile`/`volume`/`material_category` (todos já existem no payload). As demais, valor fixo na própria ação no Ads. Confiança nos números: **baixa-média** — são pesos para o Marcio aprovar ou ajustar.

## 4. Site (o que o código mostra — não o site ao vivo)
- Tag: `gtag.js` com o ID do painel do Ghost (padrão `G-Y1ERW8GNPR`) + `GT-PHC28JHZ`, Consent Mode v2 (UE negado por padrão, Brasil concedido). Microsoft Clarity também.
- Eventos: `contact_whatsapp`, `contact_phone`, `contact_email`, `cta_click`, `consent_choice`, `form_start_coleta`, `form_error_coleta` (validação e falha de rede), `generate_lead` (após confirmação do servidor) + dados para conversões otimizadas, `express_checkout_shown`, `hero_personalizado`, e `dataLayer` `collection_request_submitted`.
- Pontos fortes: conversão principal só conta pedido confirmado (bom para conformidade); confirmação substitui o formulário (evita duplicidade).
- Lacunas: sem GCLID; sem `value`; sem evento de "pagamento da expressa concluído" (o Stripe confirma no servidor — HIPÓTESE: dá para virar conversão offline também).
- Velocidade/mobile: **não medido** (rede bloqueada). Pedir ao Marcio o PageSpeed (seção 6, passo F) ou liberar `ecobraz.org` na rede da sessão.

## 5. Perfil da Empresa (Maps), Search Console, YouTube, Google for Nonprofits

### 5.1 Perfil da Empresa (Google Maps) — maior alavanca para "descarte geladeira Guarulhos"
FATO (repositório): o perfil existe com o nome **"Ecobraz Emigre"**, sede Rua Dona Maria Quedas, 230 — Jardim Andaraí/SP, área de atendimento configurada (`docs/PR/lista-diretorios-ecobraz.md`); nota ★4,9 com 354 avaliações citada em `docs/marketing/34-…` (**não conferi ao vivo**). Doc 24: na simulação da dona de casa de Guarulhos, a Ecobraz **não apareceu em nenhuma das 4 buscas locais** e perdeu para a JR Coleta.

Ações (Marcio, no próprio perfil):
1. **Categorias:** principal coerente com coleta de eletrônicos (ex.: "Serviço de reciclagem de lixo eletrônico", se existir na lista em português) + secundárias "Centro de reciclagem" e "Serviço de remoção de lixo/entulho" (escolher só as que descrevem o que a Ecobraz faz de fato). Confiança média — o ranking local depende fortemente da categoria.
2. **Área de atendimento:** listar as cidades uma a uma (Guarulhos, Osasco, Santo André, São Bernardo, São Caetano, Diadema, Mauá, Barueri, Carapicuíba, Taboão, Mogi…), não só "Grande SP" — o Google aceita até 20 áreas.
3. **Serviços** com nome de busca: "Coleta de geladeira", "Coleta de fogão", "Coleta de máquina de lavar", "Coleta de ar-condicionado", "Coleta de lixo eletrônico para empresas", "Coleta em condomínio".
4. **Postagens semanais** com foto real de coleta e cidade no texto ("coleta de geladeira em Guarulhos hoje") e **resposta a avaliações** citando o serviço/cidade quando o cliente citou.
5. **Link do site do perfil** → `https://ecobraz.org/agendamento/?utm_source=google&utm_medium=organic&utm_campaign=gbp` para medir quanto o Maps traz.
6. **Nome:** "Ecobraz Emigre" difere da marca dos anúncios e do site ("Ecobraz"). O Google pede o nome do mundo real; se "Ecobraz Emigre" é como aparece na fachada/documentos, manter; se não, **o Marcio decide** (mudança de nome pode pedir nova verificação). HIPÓTESE: o nome diferente dilui busca de marca.
7. **Vincular o Perfil ao Google Ads** para usar **recurso de local** nos anúncios. **Não confirmei** na fonte oficial se Grants aceita recurso de local (busca não retornou); a campanha pausada "BR | Ponto de Coleta Maps" e as ações removidas "Local actions" indicam que já houve vínculo. **Não** recriar "Rotas"/"Visitas ao site do perfil" como conversão primária (são visualização, não coleta).
Impacto esperado: alto para buscas locais PF (confiança média); prazo de semanas, não dias. Complementa as páginas por cidade já previstas no doc 24 (fora do meu escopo).

### 5.2 Search Console
FATO: GSC da Ecobraz verificado desde 19/07/2026 (PLAYBOOK-SEO). Ações:
- **Vincular GSC ao Google Ads** → relatório "Pago e orgânico": mostra buscas onde a Ecobraz aparece no orgânico mas não no pago (e vice-versa) — fonte direta de palavras-chave para a campanha PF e de negativas.
- **Vincular GSC ao GA4** (Admin → Vinculações de produtos).
- Consultar no GSC as buscas com "geladeira", "fogão", "guarulhos", "osasco": posição e cliques reais (o playbook registra "descarte de geladeira" em posição 1 e 0 tráfego segundo Ahrefs — conferir no GSC).

### 5.3 YouTube
FATO: a conta tem conversões de YouTube (inscrições, visualizações seguintes) ativas e secundárias — ok. O Grants é **só Pesquisa**, então o crédito não paga vídeo. O **YouTube Nonprofit Program** é separado: ativa-se pelo Google for Nonprofits, revisão de 2–14 dias úteis, dá "Link Anywhere Cards" para levar ao site ([Activate the YouTube Nonprofit Program](https://support.google.com/nonprofits/answer/3367463?hl=en)). Recomendação: ativar (se ainda não ativo — **não verifiquei**), publicar vídeos curtos "como funciona a coleta de geladeira" com card para `/agendamento/`. Impacto no Grants: indireto e baixo (busca de marca, CTR da marca). Confiança baixa-média.

### 5.4 Google for Nonprofits
- Conferir no painel se Ad Grants, YouTube Nonprofit e Workspace estão ativos e se o **e-mail de administrador** recebe avisos (desativação por CTR chega por lá).
- Responder a pesquisa anual do programa quando vier (a política lista a não-resposta como causa de desativação — [Account management policy](https://support.google.com/nonprofits/answer/117827?hl=en)).

## 6. Quem faz o quê

### 6.1 Marcio, à mão (cliques; a interface do Google muda os nomes às vezes — se algo não bater, me diga o que aparece na tela)
- **A. Conferir a propriedade GA4 (1 min):** Google Ads → ícone **Metas** (troféu) → **Conversões** → **Resumo** → clique em "Ecobraz Emigre (web) generate_lead" → veja a **Origem**/propriedade. Depois, no Ghost: **Configurações → Design e marca → Personalizar → Configurações do site** → campo "ga_measurement_id". Me diga os dois.
- **B. Recategorizar (10 min):** Metas → Conversões → Resumo → clique na ação (ex.: "form_error_coleta") → **Editar configurações** → **Meta e tipo de ação** → "Outro" → **Salvar**. Repetir para page_view, session_start, first_visit, scroll, consent_choice, click, user_engagement. Para contact_whatsapp e contact_phone: categoria **Contato**; em contact_whatsapp, **Contagem → Uma**.
- **C. Rebaixar contact_phone:** mesma tela → **Otimização da meta de ação** → **Ação secundária** → Salvar.
- **D. Ligações ≥ 30 s:** Metas → Conversões → **+ Nova ação de conversão** → **Chamadas telefônicas** → "Chamadas de anúncios usando recursos de ligação" → duração mínima **30 segundos** → valor R$ 20 → Primária. Depois adicionar **recurso de ligação** (telefone oficial) às campanhas ativas.
- **E. Vinculações:** Ads → **Ferramentas** → **Gerenciador de dados** (ou "Contas vinculadas") → Search Console (ecobraz.org) e Perfil da Empresa. GA4 → **Administrador → Vinculações de produtos → Search Console**.
- **F. PageSpeed:** abrir `pagespeed.web.dev`, colar `https://ecobraz.org/agendamento/`, clicar **Analisar**, aba **Celular**; mandar print das 4 notas e do bloco "Core Web Vitals".
- **G. Perfil da Empresa:** itens da seção 5.1 (categorias, cidades, serviços, link com UTM, postagens).
- **H. Valores fixos** nas ações (WhatsApp R$ 10; ligação R$ 20): na ação → Editar configurações → **Valor** → "Usar o mesmo valor" → Salvar.
- **I. Ações offline:** criar "Coleta agendada (offline)" e "Coleta concluída (offline)" (Nova ação → **Importação** → CRM/arquivos/outras fontes → leads) e conectar a fonte no **Gerenciador de dados** — eu guio clique a clique quando o portal estiver exportando.
- **J. Decisões dele:** nome do Perfil ("Ecobraz Emigre" × "Ecobraz"); aprovar a tabela de valores (3.3); quando rebaixar o WhatsApp.

### 6.2 Mudanças de código (equipe, com aprovação do Marcio — não é script do Ads)
- `main.js`: capturar/guardar `gclid`/`gbraid`/`wbraid` e enviar em campos ocultos; `value` + `currency` no `generate_lead`.
- `custom-agendamento.hbs`: campos ocultos para os IDs de clique. Worker: repassar ao portal.
- Portal: gravar ID de clique + e-mail/telefone no lead/OS e exportar linhas "agendada"/"concluída" para planilha (ou direto à Data Manager API).

### 6.3 Script do Google Ads (pode ser feito por script)
- **Monitor diário (só leitura):** conversões por ação e por campanha, CTR do mês da conta vs. 5%, alerta por e-mail se (a) mês corrente com 0 conversões primárias depois do dia 20, (b) CTR do mês < 5%, (c) conversões ≥ 50% dos cliques em alguma campanha. Pode estender o `docs/marketing/grants/exportar-dados-grants.js` existente.
- **Upload offline por planilha via script:** possível no modelo antigo, mas **não verifiquei** se continua aceito após a migração para Data Manager (15/06/2026) — tratar como plano B.
- **Alterar categoria/primária de conversões por script:** **não verifiquei** suporte nos Scripts do Google Ads; recomendo fazer à mão (são ~12 cliques e é uma vez só).

## 7. Balanço honesto
- **Feito e verificado:** leitura da configuração de conversões e dos números de 30 dias e mensais; leitura do código do site/Worker; dados do portal; trechos das regras oficiais via busca (URLs acima).
- **Não verificado:** site ao vivo (rede bloqueada — `ecobraz.org` e `support.google.com` precisam ser liberados na sessão), velocidade/mobile, estado real do Perfil da Empresa, se conversões otimizadas estão ligadas, qual propriedade GA4 está no painel do Ghost, se Grants aceita recurso de local, se WhatsApp é aceito explicitamente.
- **Depende do Marcio:** itens 6.1 A–J. **Depende de desenvolvimento:** 6.2. **Depende do tempo:** efeito do Perfil da Empresa e do aprendizado do Maximizar conversões (semanas).
