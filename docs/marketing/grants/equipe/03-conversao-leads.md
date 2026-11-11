# 03 — Conversão e comportamento de leads (Google Ad Grants → coleta)

Autor: especialista em conversão · Data: 29/10/2026 · Somente leitura (nada foi alterado na conta, no site ou no CRM).

## 0. Limites desta análise (ler antes)

- **O site ao vivo não pôde ser aberto.** O WebFetch de `ecobraz.org` e `www.ecobraz.org` falhou (o host não é resolvido nesta sessão de nuvem; o domínio precisa ser liberado nas configurações de rede da sessão). Também não abri `support.google.com`.
- **Por isso analisei o código-fonte do tema no repositório** (`site-ghost/theme/custom-agendamento.hbs`, `site-ghost/theme/assets/js/main.js`, `site-ghost/content/search-intent-pages.json`, `page-coleta-gratuita.hbs`, `page-para-condominios.hbs`, `site-ghost/worker/src/index.js`, commit `eb179c1` de 29/10/2026). **Não verifiquei se o que está publicado é igual ao repositório.** Tudo o que digo sobre as páginas vale "segundo o repositório".
- **Não testei no celular.** As observações sobre a experiência no celular são deduzidas da ordem do HTML. São hipóteses.
- **Dados da conta:** planilha `1mcAzV4…qGc`, abas `anuncios_30d`, `termos_busca_30d` e `conversoes_por_acao_30d` (lidas em 29/10/2026).
- **Dados da operação:** ferramenta Base Ecobraz (`visao_geral` e `coletas`), lida em 29/10/2026. Uso só números agregados; nenhum dado pessoal foi copiado.
- **Regras do Google Ad Grants não verificadas na fonte oficial.** Uma busca em fontes secundárias ([Search Engine Land](https://searchengineland.com/google-grants-policy-changes-5-percent-click-through-rate-288452), [Whole Whale](https://www.wholewhale.com/tips/google-ad-grant-policy-updates/)) diz que a regra de CTR de 5% existe. Essas fontes divergem sobre a exigência de 2 anúncios por grupo. **A confirmar em support.google.com/grants** (é tarefa do especialista em política).

---

## 1. Diagnóstico da jornada clique → página → pedido

### 1.1 O que os dados mostram (FATO)

| Anúncio (30 dias) | Página de destino | Impressões | Cliques | CTR | Conversões |
|---|---|---|---|---|---|
| GR PF · Eletrônicos | /agendamento/ | 399 | 4 | 1,0% | 0 |
| GR PF · Eletrodomésticos | /agendamento/ | 108 | 3 | 2,8% | 0 |
| GR Marca · Ecobraz | / (home) | 73 | 19 | 26,0% | 8 |
| SP Linha Branca · Geladeiras (pausada) | /descarte-de-geladeira-velha/ | 58 + 22 | 3 + 0 | 5,2% / 0% | 0 |
| SP Lixo Eletrônico · Coleta geral (pausada) | /coleta-gratuita/ | 160 | 3 | 1,9% | 0 |
| SP Lixo Eletrônico · Coleta geral (pausada) | /coleta-de-lixo-eletronico-em-sao-paulo/ | 117 | 3 | 2,6% | 0 |
| BR B2B · Empresas (pausada) | /para-empresas/ | 24 + 27 | 1 + 0 | — | 0 |
| BR Patrocínio · Condomínios (pausada) | /para-condominios/ | 0 | 0 | — | 0 |
| Resíduos Especiais · Equip. médicos | /descarte-de-equipamentos-hospitalares/ | 16 | 2 | 12,5% | 2 |

- **Conversões dos últimos 30 dias, por ação:** 11 no total. Dessas, 9 são cliques no botão de WhatsApp (`contact_whatsapp`), 1 é clique em telefone e só 1 é formulário enviado (`generate_lead`, na campanha de Marca).
  - **Nenhuma conversão veio das campanhas PF.**
  - **Nenhuma conversão é uma coleta agendada.**
- **O que as pessoas buscam** (aba `termos_busca_30d`): a maioria é informativa ("onde descartar tv quebrada", "como descartar bateria de litio"). Há três grupos de termos que a operação não atende ou que buscam outra coisa:
  - **Querem vender:** "onde vender sucata eletrônica em sp", "compra de tv quebrada zona leste", "lugar que compra geladeira com defeito".
  - **Móveis:** "retirada de móveis velhos gratuito" (5 impressões e 1 clique), "descarte de moveis sp".
  - **Outras cidades, na campanha BR B2B:** BH, Recife, Fortaleza, Rio de Janeiro, Londrina, Porto Alegre.
- **Base operacional:** 343 ordens de coleta no sistema e 139 clientes com coleta nos últimos 30 dias.
  - **Não há campo de origem visível na ordem de coleta.** Hoje não dá para ligar uma coleta a um anúncio.
  - **O Worker do formulário grava UTM e `page_url`,** mas não tem campo próprio para o `gclid` (identificador do clique no Google). Os leads que chegam por WhatsApp chegam sem origem nenhuma.

**Leitura:** o funil quebra em dois lugares.
1. **Antes do clique.** O CTR de 1–3% no PF indica anúncio genérico ou pouco relevante para a busca.
2. **Depois do clique.** Os anúncios PF levam direto a um formulário frio. Quem chega tem dúvida ("como/onde descartar?") e encontra uma ficha cadastral.

A campanha de Marca converte porque quem busca "ecobraz" já decidiu.

### 1.2 A promessa do anúncio confere com a página?

Não pude ler o texto dos anúncios: a aba `anuncios_30d` não traz títulos nem descrições. Avaliei, então, o encaixe entre a **intenção da busca** e a **página**.

- **Campanha PF → /agendamento/ (FATO: destino de 507 impressões).** Quem busca "onde descartar microondas" quer primeiro saber se a Ecobraz busca, se é de graça e se atende o bairro. A /agendamento/ abre com "Solicite sua coleta" e um formulário.
  - Não tem lista de itens aceitos, não nomeia cidades e não tem FAQ.
  - A prova social (★4,9) fica no painel lateral, que no código vem **depois** do formulário. **Hipótese:** no celular, a nota só aparece no fim da página.
- **/descarte-de-geladeira-velha/ (FATO, texto do repositório).** Fala com a pessoa física no topo, mas:
  - O botão é "Solicitar avaliação para retirada de geladeira", e "avaliação" é jargão que a persona PF-55/65 rejeita (doc 33).
  - O FAQ diz: "O formulário inicia uma avaliação; **não confirma automaticamente a coleta nem a gratuidade**". É exatamente o "cheiro de letra miúda" que derrubou a Dona Marli (doc 22/33) e a dona de casa de Guarulhos (doc 24).
  - A página pede "CEP, quantidade, **fotos**, andar, elevador", mas **o formulário não tem nenhum desses campos** para pessoa física (nem upload de foto). A página promete um fluxo que o formulário não executa. A Debora terá de perguntar tudo de novo.
- **/coleta-de-lixo-eletronico-em-sao-paulo/.** Está boa (nomeia casa, empresa e condomínio, tem telefone, ★4,9 e a frase "avisamos antes, com o valor"). O botão manda `?local=SP`, que preenche "SP" no campo cidade (ponto menor).

### 1.3 Atrito do formulário /agendamento/ (FATO no código; não testado ao vivo)

- **Campos obrigatórios para pessoa física (6):** categoria, cidade, nome, **e-mail**, telefone e a caixa de consentimento. A descrição é opcional e o prazo vem pré-selecionado.
  - **E-mail obrigatório para pessoa física** contraria o doc 33 (PF-55: "nunca exigir e-mail como único canal; prefere ligação/WhatsApp"). Para quem preenche no celular, é o campo que mais faz desistir. **Hipótese** forte, mas sem teste A/B.
- **A pessoa física não informa CEP nem quantidade.** A operação não sabe se o endereço está dentro da área atendida nem se o pedido é "1 micro-ondas" ou "mudança inteira". Isso gera lead que não pode ser atendido e retrabalho no WhatsApp.
- **Possível redigitação (hipótese pelo código).** O mini-formulário da /coleta-gratuita/ aceita "CEP ou cidade". Se a pessoa digita um CEP, ele vai para `postal_code`, que fica escondido para pessoa física, e o campo **cidade** (obrigatório) chega vazio. A pessoa tem de digitar de novo. **Testar.**
- **Tela de confirmação.** Existe ("Solicitação recebida!"), o que é bom. Mas:
  - não repete o prazo ("até 24h úteis"), não dá protocolo e não diz o que acontece no fim de semana;
  - fala em WhatsApp sem botão clicável.
  - O "silêncio pós-clique" é o mandamento nº 6 do doc 34.
- **Link de WhatsApp sem mensagem pronta** (`https://wa.me/5511912728412`, sem `?text=`):
  - A Debora recebe um "Oi" sem saber de qual página ou anúncio a pessoa veio, nem o que ela quer descartar.
  - Isso também impede medir qual anúncio gera conversa.
- **Coleta expressa R$ 55 no campo "Prazo".** É um ponto positivo para a persona com urgência ("geladeira nova chega sábado", doc 24). Teve 1 venda paga desde 08/10 (Base Ecobraz).

### 1.4 Medição: o que o robô do Google está otimizando (FATO + risco)

- As conversões principais incluem `contact_whatsapp`, que é o **clique** no botão (`main.js`, linha 20), não a conversa iniciada nem o pedido.
- Com "Maximizar conversões", o Google aprende a trazer quem **clica no WhatsApp**. Hoje são 9 de 11 conversões.
- **Risco:** a campanha pode otimizar para curiosos e não para coletas. Não há como saber, porque nenhuma coleta está ligada ao clique (ver 1.1).

---

## 2. Por que cada lead desiste e o que muda a decisão

Fontes: docs 24, 33 e 34 (personas simuladas, não pesquisa de campo, como os próprios docs declaram) e os dados da conta acima.

### 2.1 Lead PF de lixo eletrônico (PF-25/35/45)

| Momento em que desiste | Causa (fonte) | O que muda a decisão |
|---|---|---|
| Antes do clique | A Ecobraz não aparece na busca local (doc 24: 0 de 4 buscas em Guarulhos); CTR de 1–3% (dado) | Anúncio com a cidade e o item no título; página por cidade (doc 24, Faixa 1) |
| Na página | "Grátis" com condição colada ao botão = "pegadinha" (docs 33/34) | "Coleta padrão sem custo. Se no seu caso houver custo, avisamos antes, com o valor", **longe** do botão e com o porquê ("nos remuneramos com o material", doc 34, mandamento 3) |
| No formulário | E-mail obrigatório; formulário frio sem contexto; possível redigitação | 3 campos visíveis (o quê, CEP, WhatsApp); e-mail opcional |
| Depois do envio | "24h úteis" lido no sábado = segunda (doc 24, derrota real); sem confirmação nem status | Confirmação imediata na tela **e** no WhatsApp; mensagem de ausência honesta no fim de semana; aviso "sua coleta é quinta" |

### 2.2 Lead de linha branca (geladeira, fogão, máquina, ar-condicionado; PF-55/65 e filhos)

- **Gatilho:** um evento com data (geladeira nova chegando, mudança, reforma). **O prazo é o critério nº 1** (doc 33, PF-55; doc 24).
- **Desiste quando:**
  1. a página diz que "não confirma a gratuidade" (FAQ da página da geladeira);
  2. não sabe se "sobem no apartamento" (andar/escada);
  3. não vê o rosto de quem entra em casa (fotos reais ainda pendentes do Marcio, doc 22);
  4. ninguém responde no fim de semana;
  5. busca "retirada de móveis" junto e percebe que a Ecobraz não leva móveis.
- **O que muda a decisão:**
  - data concreta ("padrão: 1 a 7 dias úteis; expressa: até 72h, R$ 55" — o valor está no formulário; confirmar se a expressa vale para linha branca);
  - pergunta de andar e elevador no próprio formulário, para não haver surpresa no dia;
  - telefone como botão (PF-65: "ligar É o CTA");
  - foto do item pelo WhatsApp.
- **Termos que trazem lead sem fit (FATO, termos de busca):** "compra geladeira com defeito" (quer receber dinheiro) e "retirada de móveis". **Recomendo negativar** depois que o Marcio confirmar que a Ecobraz não compra linha branca de pessoa física nem retira móveis.

### 2.3 Lead de grande volume (síndico, PME, gerente de TI)

- **Síndico (doc 24: a Ecobraz venceu, por pouco).** Quase perdeu pela condição de custo e pelo coletor permanente da concorrência (Recicla Digital).
  - Converte com: comprovante para a ata, ausência de fidelidade e modelo de aviso aos moradores.
- **PME com galpão para esvaziar (doc 24: venceu por pouco).** Quase perdeu para o "dinheiro na mão" do sucateiro.
  - Converte com: "o lote combinado sai inteiro, não garimpamos" e a nota fiscal ou comprovante como evidência.
- **Gerente de TI / diretora ESG (doc 24: a Ecobraz perdeu).** A causa é a camada regulatória invisível (licença publicada, ISO 14001, R2v3, método de sanitização nomeado).
  - **Não é problema de anúncio nem de página.** O Grants não resolve isso. Não prometer no anúncio o que não existe (ISO, R2).
  - **Atenção (FATO, `docs/institucional/DOCUMENTOS-ECOBRAZ.md`):** o CTF/IBAMA tinha validade em 10/09/2026, e a licença de funcionamento está "em andamento". Não usar "licenciada" nem "certificada" em anúncio sem o Marcio confirmar a situação atual.
- **Desiste quando:**
  - o único botão é "Agendar demonstração" (doc 33: "não agendo reunião para descobrir preço");
  - não acha os documentos;
  - a cidade dele não é atendida (os termos de BH, Recife etc. mostram que a campanha BR atrai fora da área).
- **O que muda a decisão:** condições por escrito antes de agendar; resposta com prazo; um caminho sem reunião (formulário de 1 minuto ou WhatsApp); comprovante da destinação. A página /coleta-avulsa-para-empresas/ já diz "sem contrato nem mensalidade", "condições por escrito antes de agendar" e "comprovante da destinação no final" (texto do repositório).

---

## 3. Páginas de destino por intenção

Regras para as quatro páginas:
- seguir o padrão visual v2 (`site-ghost/design/PADRAO-V2.md`) e conferir a prévia contra as referências antes de publicar;
- 1 página = 1 público e 1 botão principal por dobra;
- WhatsApp com mensagem pronta e telefone como botão;
- ★4,9 Google visível já na primeira tela (o número de avaliações deve ser reconferido antes de publicar: o repositório diz 357 em set/2026).

### 3.1 Lixo eletrônico PF (Grande SP)

- **URL:** reaproveitar `/coleta-gratuita/` (já existe e é a melhor página PF, segundo o doc 33). Ajustes abaixo.
- **Título (H1):** "Aquele eletrônico parado? A gente busca na sua casa."
- **Subtítulo:** "Coleta padrão sem custo na Grande São Paulo. Nos remuneramos com o material reciclado; se no seu caso houver custo, avisamos antes, com o valor."
- **Estrutura:**
  1. Herói com formulário de 3 campos e ★4,9.
  2. "Pegamos / não pegamos" com ícones (celular, notebook, TV, impressora, cabos / pilhas soltas?, lâmpadas?, móveis — **lista a confirmar com o Marcio**).
  3. Cidades atendidas nomeadas (lista oficial do Marcio).
  4. 3 passos com prazo.
  5. Avaliações verbatim.
  6. FAQ ("é grátis mesmo?", "e meus dados?", "fim de semana?").
  7. Botão final.
- **Formulário (3 visíveis + 2 opcionais):**
  - O que você tem: chips de múltipla escolha (TV, computador/notebook, celular, impressora, outro) com quantidade (1 / 2–5 / 6+).
  - CEP: valida no navegador contra a lista de CEPs ou municípios atendidos.
  - WhatsApp.
  - Opcionais: nome e e-mail.
- **Qualificação:**
  - CEP fora da área → mensagem honesta ("Ainda não atendemos esse CEP com coleta em casa") e **não** dispara a conversão principal; registra um evento secundário `lead_fora_area`.
  - "6+ itens" ou "mudança" → marca o lead como prioridade.

### 3.2 Linha branca (geladeira, fogão, máquina de lavar, ar-condicionado)

- **URL:** nova `/coleta-de-linha-branca/` (ou reescrever `/descarte-de-geladeira-velha/` e criar irmãs para máquina e ar-condicionado com o mesmo formulário).
- **H1:** "Geladeira, fogão ou máquina velha? Retiramos na sua casa."
- **Subtítulo:** "Grande São Paulo · coleta padrão sem custo, sujeita a avaliação (se houver custo, avisamos antes, com o valor) · resposta em até 24h úteis."
- **Estrutura:**
  1. Herói com formulário e o botão "Mandar foto pelo WhatsApp".
  2. "Sobe escada? Tem elevador?" (resposta honesta do que a equipe faz).
  3. Prazos: padrão 1–7 dias úteis / expressa até 72h, R$ 55 (**confirmar se a expressa vale para linha branca**).
  4. Escopo: o que não levamos (móveis? colchão? — confirmar).
  5. "Por que não deixar na calçada" (gás refrigerante, compressor, em tom de cuidado e não de medo).
  6. Avaliações e FAQ.
  - **Retirar** a frase "não confirma automaticamente a coleta nem a gratuidade".
- **Formulário:**
  - Item (geladeira/freezer, fogão, máquina de lavar/secadora, ar-condicionado, outro) com quantidade.
  - CEP.
  - Andar + elevador (sim/não/casa térrea).
  - O aparelho está desligado e livre? (sim/não).
  - WhatsApp.
  - Prazo (padrão / expressa).
- **Qualificação:** CEP na área; ar-condicionado instalado na parede → avisar que a desinstalação não está incluída (**confirmar a regra com o Marcio**).

### 3.3 Grandes volumes / condomínio

- **URLs:** `/para-condominios/` (já existe; o anúncio de condomínio teve 0 impressões) e nova `/coleta-de-grandes-volumes/` para PME, galpão e escritório.
- **H1 (grandes volumes):** "Galpão, escritório ou depósito cheio de eletrônicos? Retiramos o lote inteiro."
- **Subtítulo:** "Sem contrato e sem mensalidade. Condições por escrito antes de agendar. Comprovante da destinação no final."
- **Estrutura:**
  1. Herói com formulário de 1 minuto e o link "Baixar o resumo das condições (PDF)" (o irmão sem reunião, doc 34).
  2. O que retiramos (TI, linha branca em volume, cabos, baterias).
  3. Como funciona em 4 passos com prazo.
  4. O que você recebe (comprovante, portal).
  5. Condições: quando é sem custo e quando tem valor (mesmo que em faixas, doc 34, conflito nº 1).
  6. Cases nomeados (só com autorização).
  7. FAQ.
- **Formulário:**
  - Tipo de local (empresa / condomínio / instituição).
  - Itens (múltipla escolha).
  - Volume (até 10 / 11–50 / 51–200 / 200+ itens, ou "cabe em: carro / van / caminhão").
  - CEP.
  - Precisa de documento? (comprovante / dados e HDs / não sei).
  - Nome, empresa, WhatsApp e e-mail corporativo.
- **Qualificação:**
  - Fora da área → mensagem "atendemos sob consulta" e lead marcado.
  - "Até 10 itens" de empresa → direcionar para a coleta avulsa.
  - "Dados e HDs" → encaminhar à página de destruição de dados.

### 3.4 Empresa que precisa de documentação (logística reversa, CDF/MTR, LGPD)

- **URL:** `/para-empresas/` (já existe).
- **Ajustes para o tráfego do Grants:**
  - âncora no topo para "Documentos que você recebe";
  - CTA duplo: "Pedir coleta com documentação" (formulário) + "Baixar dossiê-amostra" (depende do Marcio, doc 34, gap 2);
  - **não usar "Agendar demonstração" como único botão.**
- **Formulário:** o atual para perfil empresa já tem CEP, UF, volume e necessidade documental, o que está correto. Acrescentar "Prazo da auditoria" (este mês / trimestre / sem prazo).
- **Atenção:** os anúncios da campanha "Empresa | Obrigações e documentação" apontam para **posts do blog** (`/blog/certificado-de-descarte…`, `/blog/empresas-obrigadas…`). Isso é aceitável para a intenção informativa, mas o post precisa de uma faixa de CTA "Precisa do documento? Peça a coleta com comprovante" com o formulário embutido. **Não verifiquei se os posts têm CTA.**

---

## 4. Processo de resposta ao lead

### 4.1 Tempo de resposta (meta; hipótese operacional, não medida)

| Situação | Meta | Como |
|---|---|---|
| Dia útil, horário comercial | Primeira resposta **em até 15 min** | Notificação de formulário novo no celular da Debora; WhatsApp Business com etiquetas |
| Fora do horário e fim de semana | Resposta automática **imediata** + humana no próximo dia útil até 10h | Mensagem de ausência do WhatsApp Business; e-mail ou WhatsApp automático após o formulário (**verificar se o Worker/Ploomes já envia algo**) |
| Lead sem resposta | 3 tentativas: D0, D+1, D+3 | Script abaixo |

**Base da meta:** o doc 24 registra uma derrota real por velocidade ("24h úteis no sábado = segunda"). Os 15 minutos são uma meta interna, não um número de pesquisa. **Decisão do Marcio:** existe plantão no sábado? Se existir, declarar na página. Se não, dizer a verdade na mensagem automática.

### 4.2 Scripts de WhatsApp para a Debora (prontos para colar; ajustar nome e prazo)

**Mensagem pronta no botão do site** (vai no link `wa.me/5511912728412?text=`, um texto por página, com código de origem):
> Olá! Vim pelo site (GEL). Quero descartar: ____ · CEP: ____

Códigos sugeridos: GEL = linha branca · ELE = eletrônicos PF · VOL = grandes volumes · CON = condomínio · DOC = empresa/documentação.

**1. Primeira resposta (até 15 min)**
> Oi, [nome]! Aqui é a Debora, da Ecobraz 😊 Recebi seu pedido de coleta de [item]. Para eu já ver a melhor data, me confirma 3 coisas:
> 1) o CEP da retirada;
> 2) quantos itens são;
> 3) se é casa ou apartamento (andar e se tem elevador).
> Se puder, manda uma foto — ajuda muito.

**2. Fora do horário (mensagem automática)**
> Oi! Aqui é a Ecobraz. Recebemos sua mensagem. Nosso atendimento é de [dias/horário] — a Debora te responde no próximo dia útil até as 10h. Para adiantar, mande: item, quantidade, CEP e uma foto. Se tiver pressa, existe a coleta expressa (até 72h, R$ 55) — é só pedir.

(Remover a última frase se a expressa não valer para o item.)

**3. Confirmação de coleta sem custo**
> Tudo certo, [nome]! Sua coleta é sem custo. Fica agendada para [dia], entre [faixa de horário]. No dia, nossa equipe ([nome do motorista, se possível]) avisa quando estiver a caminho. Precisa remarcar? É só responder aqui.

**4. Quando há custo (honestidade antes, nunca na porta)**
> [Nome], no seu caso a coleta tem um custo de R$ [valor], por causa de [motivo concreto: distância / item / acesso]. Estou avisando antes para você decidir com calma. Se preferir, a alternativa é [opção]. Quer que eu agende?

**5. Fora da área**
> [Nome], obrigado por pensar na Ecobraz. Infelizmente ainda não fazemos coleta em casa no seu CEP. [Se houver alternativa real verificada, indicar; se não, não inventar.] Se for empresa ou tiver grande volume, me avisa que vejo uma solução.

**6. Grande volume / condomínio**
> Oi, [nome]! Aqui é a Debora, da Ecobraz. Para te mandar as condições por escrito, preciso de: tipo de local (empresa/condomínio), lista aproximada dos itens, volume (cabe em carro, van ou caminhão?), CEP e se vocês precisam de comprovante de destinação. Respondo com a proposta em até [prazo].

**7. Follow-up (sem resposta)**
- D+1:
  > Oi, [nome]! Só confirmando: ainda quer retirar o(a) [item]? Se quiser, me manda o CEP que já vejo a data.
- D+3 (última):
  > [Nome], vou encerrar seu pedido por aqui para não te incomodar. Se precisar depois, é só mandar "coleta" neste número. 🙂

**8. Pós-coleta (D+1 da coleta realizada)**
> Oi, [nome]! A coleta de ontem deu certo? Se puder, conta como foi no Google — ajuda outras pessoas a confiarem: [link de avaliação]. Obrigado!

(Pedir avaliação é permitido; **oferecer brinde ou desconto em troca, não**.)

### 4.3 Métricas e como medir

**Funil:** clique → lead (formulário enviado ou conversa no WhatsApp **com item informado**) → lead qualificado (CEP na área + item aceito) → coleta agendada (ordem de coleta criada) → coleta realizada (ordem concluída).

| Métrica | Fórmula | Onde medir | Situação hoje |
|---|---|---|---|
| Taxa de lead | leads / cliques | Google Ads + CRM | Não confiável: o clique no WhatsApp conta como "lead" |
| % qualificado | qualificados / leads | Ploomes (campo novo "qualificado s/n") | Não existe |
| Lead → agendada | ordens criadas / leads qualificados | Ploomes + Base Ecobraz | Impossível: a ordem não tem origem |
| Agendada → realizada | concluídas / agendadas | Base Ecobraz | Medível no geral: 223 concluídas e 39 canceladas de 343 (não por canal) |
| Tempo até 1ª resposta | mediana em minutos | WhatsApp Business / Ploomes | Não medido |
| Custo (Grants) por coleta realizada | gasto / coletas realizadas vindas do Ads | Ads + Ploomes | Impossível hoje |

**O que precisa ser criado** (depende de TI/Marcio; não alterei nada):
1. **Campo "origem" na ordem de coleta e no negócio do Ploomes,** preenchido com o UTM e o código do WhatsApp (GEL/ELE/VOL…).
2. **Guardar o `gclid` em campo próprio.**
   - O Worker já grava `page_url`, que *pode* conter o `gclid` se a marcação automática do Ads estiver ligada. **Hipótese, verificar.**
   - Com o `gclid` guardado, dá para **importar conversões offline** "coleta_agendada" e "coleta_realizada" para o Google Ads e otimizar para coleta, não para clique.
3. **Rebaixar `contact_whatsapp` (clique) para conversão secundária,** ou com valor baixo, **depois** que a importação offline existir.
   - **Risco de fazer antes:** a campanha fica sem sinal e o "Maximizar conversões" para de aprender.
   - Decisão conjunta com o especialista de conta.
4. **Painel semanal com 5 números:** leads, % qualificado, agendadas, realizadas e mediana do tempo de resposta, por intenção (PF eletrônicos / linha branca / volume / documentação).

**Metas iniciais:** são HIPÓTESES, a recalibrar após 4 semanas de dado real. Lead → qualificado ≥ 70%; qualificado → agendada ≥ 50%; agendada → realizada ≥ 85%. O histórico geral é 223 concluídas para 39 canceladas, cerca de 85% entre as que tiveram desfecho, mas isso mistura todos os canais.

---

## 5. Anúncios responsivos de pesquisa (prontos; caracteres contados por script)

**Regra de honestidade aplicada:**
- nada de "grátis" absoluto: a condição vai na descrição;
- nada de licença, ISO ou certificação;
- prazos copiados do formulário do site.

**Recomendação:** **fixar (pin) a Descrição 1 na posição 1** nos dois anúncios, para a condição de custo aparecer sempre junto do título "sem custo". Isso reduz a "força do anúncio" no indicador do Google, mas evita prometer o que não está garantido.

### 5.1 Anúncio — Linha Branca | Grande SP

URL final: `/coleta-de-linha-branca/` (proposta), ou hoje `/descarte-de-geladeira-velha/`, **não** `/agendamento/`.
Caminho exibido: `ecobraz.org/linha-branca/grande-sp`.

| # | Título | Caract. |
|---|---|---|
| 1 | Descarte de Geladeira em SP | 27 |
| 2 | Coleta de Linha Branca em SP | 28 |
| 3 | Retiramos Geladeira e Fogão | 27 |
| 4 | Máquina de Lavar Velha? | 23 |
| 5 | Ar-Condicionado Velho? | 22 |
| 6 | Buscamos na Sua Casa | 20 |
| 7 | Avaliação Sem Custo | 19 |
| 8 | Coleta Padrão Sem Custo | 23 |
| 9 | Resposta em Até 24h Úteis | 25 |
| 10 | Peça Pelo WhatsApp | 18 |
| 11 | Dia Combinado com Você | 22 |
| 12 | Sem Surpresa na Porta | 21 |
| 13 | Nota 4,9 no Google | 18 |
| 14 | Sem Fins Lucrativos Desde 2011 | 30 |
| 15 | Atendemos a Grande São Paulo | 28 |

| # | Descrição | Caract. |
|---|---|---|
| 1 (fixar) | Coleta padrão sem custo, sujeita a avaliação. Se houver custo, avisamos antes o valor. | 86 |
| 2 | Conte o item, o andar e o CEP em 2 minutos. A equipe responde em até 24h úteis. | 79 |
| 3 | Geladeira, freezer, fogão, máquina de lavar e ar-condicionado. Grande São Paulo. | 80 |
| 4 | Associação sem fins lucrativos desde 2011. Prefere falar com gente? Chame no WhatsApp. | 86 |

**A confirmar antes de subir:**
- Fogão e ar-condicionado são aceitos? (Há grupos de anúncio de ar-condicionado na conta, mas não vi a regra da operação.)
- A nota 4,9 continua atual?
- Os títulos 2 e 3 dependem de a página ter a mesma promessa.

**Negativas sugeridas para este grupo** (depois da confirmação do Marcio): móveis, colchão, sofá, compra, compro, vender, vendo, "com defeito" (quando vier junto de "compra"), conserto, assistência técnica.

### 5.2 Anúncio — Grandes Volumes / Empresas

URL final: `/coleta-de-grandes-volumes/` (proposta), ou hoje `/coleta-avulsa-para-empresas/` (condomínio: `/para-condominios/`).
Caminho exibido: `ecobraz.org/empresas/grandes-volumes`.

| # | Título | Caract. |
|---|---|---|
| 1 | Coleta Para Empresas em SP | 26 |
| 2 | Grandes Volumes de Eletrônicos | 30 |
| 3 | Descarte de TI Para Empresas | 28 |
| 4 | Coleta em Condomínios de SP | 27 |
| 5 | Sem Contrato e Sem Mensalidade | 30 |
| 6 | Condições Por Escrito Antes | 27 |
| 7 | Comprovante de Destinação | 25 |
| 8 | O Lote Sai Inteiro | 18 |
| 9 | PCs, Servidores e Monitores | 27 |
| 10 | Linha Branca em Volume | 22 |
| 11 | Dia do Eletrônico no Prédio | 27 |
| 12 | Resposta em Até 24h Úteis | 25 |
| 13 | Associação Desde 2011 | 21 |
| 14 | Grande SP e Região | 18 |
| 15 | Peça Sua Avaliação | 18 |

| # | Descrição | Caract. |
|---|---|---|
| 1 (fixar) | Coleta sem custo ou com valor, conforme volume e local. Tudo por escrito antes de agendar. | 90 |
| 2 | Informe CEP, itens e quantidade. Resposta em até 24h úteis, sem reunião obrigatória. | 84 |
| 3 | Empresas, condomínios e instituições: retiramos o lote combinado inteiro, sem garimpo. | 86 |
| 4 | Comprovante da destinação no final e portal com o histórico das coletas da sua empresa. | 87 |

**A confirmar antes de subir:**
- O "comprovante da destinação" é emitido em toda coleta avulsa? (O site afirma; não vi um documento-modelo.)
- O portal está incluso na avulsa ou só no contrato contínuo? (O site diz "sistema de rastreabilidade incluso" no contrato contínuo.) Se for só no contrato, trocar a descrição 4 por: "Comprovante da destinação no final. Para descarte recorrente, coletas programadas." (79 caract.)
- "Grande SP e Região": qual é o raio real?

**Recomendação de segmentação:** este anúncio deve rodar só na Grande SP. Os termos de BH, Recife, Fortaleza, RJ, Londrina e Porto Alegre na campanha BR B2B (FATO) são cliques que a operação provavelmente não atende. **Confirmar com o Marcio** se há atendimento nacional sob consulta.

---

## 6. As 5 recomendações de maior impacto (ordem de prioridade)

1. **Parar de mandar o PF direto para /agendamento/; usar páginas por intenção** (/coleta-gratuita/ e uma de linha branca), com a condição de custo em versão positiva e sem "não confirma a gratuidade".
   - **Por quê:** 507 impressões PF com CTR de 1–3% e 0 conversões (FATO); a condição colada ao botão é a causa nº 1 de desistência PF (docs 22/24/33).
   - **Impacto:** médio-alto. **Confiança:** média, porque o volume é pequeno (10–55 impressões/dia).
   - **Risco:** baixo; exige trocar a URL final e ajustar o texto da página.
2. **Formulário PF de 3 campos (item com quantidade, CEP, WhatsApp; e-mail opcional) com qualificação por CEP;** para linha branca, somar andar e elevador.
   - **Por quê:** e-mail obrigatório e ausência de CEP e quantidade (FATO no código); retrabalho da Debora; leads fora da área.
   - **Impacto:** alto em qualidade de lead. **Confiança:** média.
   - **Risco:** o Worker valida campos por perfil e precisa mudar junto (para não rejeitar o envio).
3. **WhatsApp com mensagem pronta e código de origem por página, mais a rotina de resposta da Debora** (15 min no horário comercial, mensagem de ausência honesta, follow-up D+1 e D+3).
   - **Por quê:** 9 de 11 conversões são clique no WhatsApp (FATO), mas a Debora recebe a conversa sem contexto; derrota real por velocidade no fim de semana (doc 24).
   - **Impacto:** alto. **Confiança:** média-alta.
   - **Risco:** depende da capacidade da Debora e da decisão do Marcio sobre plantão.
4. **Ligar a coleta ao clique:** campo de origem e `gclid` no Ploomes e na ordem de coleta, mais a importação offline de "coleta agendada/realizada"; só depois rebaixar o clique de WhatsApp a secundário.
   - **Por quê:** hoje o robô otimiza para clique e não há como saber se o Grants gera coleta (FATO: a ordem de coleta não tem origem).
   - **Impacto:** alto no médio prazo (4–8 semanas). **Confiança:** alta de que é necessário.
   - **Risco:** técnico; a campanha perde sinal se a troca for feita na ordem errada.
5. **Subir os 2 anúncios responsivos acima** (Linha Branca SP e Grandes Volumes), com a descrição de condição fixada, negativas de "comprar/vender/móveis" e segmentação Grande SP.
   - **Por quê:** os termos reais mostram intenção de venda, de móveis e de fora da área (FATO); anúncio específico eleva a relevância (CTR) e corta lead sem fit.
   - **Impacto:** médio. **Confiança:** média; ainda depende dos lances e da qualidade, que perdem cerca de 90% das impressões por classificação.
   - **Risco:** baixo, desde que as afirmações marcadas "a confirmar" sejam validadas.

## 7. Balanço honesto

- **Feito e verificado:**
  - leitura das abas de anúncios, termos e conversões da planilha;
  - leitura dos templates, do JavaScript e do Worker no repositório;
  - leitura dos docs 24/33/34 e da ficha institucional;
  - números agregados da Base Ecobraz;
  - contagem de caracteres por script (todos os títulos ≤30 e descrições ≤90).
- **Não verificado:**
  - o site ao vivo (domínio bloqueado nesta sessão, precisa ser liberado);
  - o comportamento no celular;
  - o texto atual dos anúncios (não está na planilha);
  - se a importação offline e o `gclid` são viáveis no Ploomes;
  - o texto oficial atual das regras do Ad Grants.
- **Depende do Marcio:**
  - lista de cidades e CEPs atendidos;
  - lista do que aceita e do que não aceita (móveis, fogão, ar-condicionado instalado);
  - se a expressa vale para linha branca;
  - política de plantão no fim de semana;
  - situação atual da licença CETESB, do CTF/IBAMA e da licença de funcionamento antes de qualquer menção em anúncio;
  - fotos reais da equipe;
  - autorização de cases nomeados;
  - resumo das condições B2B em PDF.
- **Depende de terceiros:** a Debora (rotina de resposta); TI (campos no Worker, no Ploomes e na ordem de coleta).
