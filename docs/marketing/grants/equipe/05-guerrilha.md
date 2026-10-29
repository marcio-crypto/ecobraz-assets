# 05 — Guerrilha offline → Google: gerar coletas e buscas pela marca na Grande SP

Autor: especialista em marketing de guerrilha · 29/10/2026 · só leitura, nada foi alterado em sistemas.

## 0. Ponto de partida (fatos verificados hoje)

- **A demanda pela marca é pequena — FATO.** Aba `termos_busca_30d` da planilha da conta
  Grants (lida em 29/10/2026): "ecobraz" = 58 impressões, 15 cliques, 6 conversões;
  "ecobraz emigre" = 6 impressões, 3 cliques, 0 conversões. Ou seja, **~64 buscas pela marca
  em 30 dias** chegaram ao leilão. CTR da marca é alto (26%–50%), então cada busca nova
  pela marca é o tráfego mais barato e de maior CTR que a conta tem — ajuda inclusive a
  segurar o CTR da conta (regra dos 5%, ver brief).
- **O Perfil da Empresa no Google se chama "Ecobraz Emigre"** — FATO (arquivo
  `docs/marketing/dados/avaliacoes-google-2026-07-26.json`: nome "Ecobraz Emigre", nota 4,9,
  354 avaliações em 26/07/2026). Não verifiquei a nota/contagem de hoje.
- **O formulário de agendamento já guarda UTM** — FATO de código: `site-ghost/theme/custom-agendamento.hbs`
  tem campos ocultos `utm_source/medium/campaign/term/content`, `source`, `page_url` e
  `marketing_consent`. **Não testei ao vivo** se a UTM chega gravada no lead — testar antes
  de imprimir qualquer QR (passo 0 abaixo).
- **Capacidade operacional — FATO parcial.** Base Ecobraz (visão geral, hoje): 343 OS no sistema,
  **79 agendadas**, 223 concluídas, 39 canceladas. Plano-mestre: 200–250 coletas PF/mês,
  custo médio R$ 35, ~20 kg/coleta (informado pelo Marcio em 25/07). Não sei se as 79
  agendadas são fila normal ou atraso — **precisa confirmar com a operação antes de
  acelerar** (ver riscos).
- **O que já existe e NÃO vou repetir:** página `/para-condominios/` (com comprovante para ata,
  modelo de comunicado de elevador/grupo citado na FAQ), campanha "Jornada do Descarte"
  60 dias nas redes (doc 27, encerrada em 25/09), Adote um Bairro precificado mas sem
  patrocinador (doc 01), pendências do doc 24 (canal de urgência no fim de semana,
  garantia de custo zero para condomínio-padrão, pacote para administradora, coletor
  permanente). As ações abaixo usam esses ativos, não os recriam.

### Princípio que amarra tudo
Cada peça offline precisa dizer **"Procure Ecobraz no Google"** (gera busca de marca, que é
o que a campanha de Marca do Grants precisa) **e** ter um QR com UTM (gera medição).
Os dois juntos: o QR mede quem estava com pressa; a frase de busca gera o volume de marca e
leva a pessoa ao Perfil (avaliações 4,9 = prova social que a persona PF pede, doc 33).

⚠️ Decisão pendente do Marcio: **qual nome a pessoa deve buscar** — "Ecobraz" (marca do site)
ou "Ecobraz Emigre" (nome do Perfil). Recomendo imprimir **"Ecobraz"** (mais curto; hoje já é
o termo com mais volume) e conferir que a busca "ecobraz" mostra o Perfil no painel lateral.
Não verifiquei isso hoje.

---

## 1. As 10 ações, priorizadas (custo × coletas esperadas)

Legenda de confiança: **A** = apoiado em dado interno · **M** = lógica + referência de mercado ·
**B** = hipótese a testar. Todos os custos e volumes são **ESTIMATIVAS** salvo indicação.

| # | Ação | Custo/mês (estim.) | Coletas/mês esperadas (estim.) | Confiança | Prioridade |
|---|---|---|---|---|---|
| 1 | Pedido de avaliação + "salve nosso contato" pós-coleta | ~R$ 0 | indireto (+avaliações, +recompra/indicação) | A/M | 1 |
| 2 | Cartão/ímã "na próxima, busque Ecobraz" entregue na coleta | R$ 150–400 | 5–15 (indicação/recorrência) | M | 2 |
| 3 | Mutirão de condomínio via síndico (grupo do prédio) | R$ 50–200 por mutirão | 1 mutirão = 10–40 domicílios | M (doc 24) | 3 |
| 4 | Administradoras e síndicos profissionais (pacote multi-condomínio) | ~R$ 0 + horas | 2–6 mutirões/mês se fechar 1 parceira | B | 4 |
| 5 | Assistências técnicas: "aparelho sem conserto" | R$ 100–300 (displays) | 5–20 | M | 5 |
| 6 | Lojas de eletrodomésticos/usados de bairro: "geladeira nova chegou, a velha sai" | R$ 100–300 | 5–20 linha branca | B | 6 |
| 7 | Imobiliárias, vistoriadores e empresas de mudança | ~R$ 0–200 | 3–10 (picos) | B | 7 |
| 8 | Escolas, igrejas e associações de bairro: "Dia do Eletrônico" | R$ 100–300 por evento | 1 evento = 20–60 entregas no ponto | M | 8 |
| 9 | Adote um Bairro como "bairro do mês" nomeado (gancho para o patrocinador) | R$ 0 extra (usa o fluxo dos itens 3/8) | depende de patrocinador | B | 9 |
| 10 | Imprensa/rádio de bairro e grupos locais (Facebook/WhatsApp de bairro) | ~R$ 0 | 0–30 (pico, irregular) | B | 10 |

Por que esta ordem: 1 e 2 são quase gratuitos e atuam sobre quem **já** foi atendido
(~200–250/mês — base real); 3 e 4 trazem volume concentrado (uma rota, muitos domicílios = custo
por kg menor) e já têm página pronta e uma vitória na simulação do doc 24; 5–7 são parcerias
que demoram para "pegar"; 8–10 dependem de terceiros e são irregulares.

---

## 2. Detalhe de cada ação

### Passo 0 (antes de tudo, 1 dia, custo zero)
- Criar os links curtos/QRs com UTM (padrão abaixo) e **fazer 1 agendamento de teste** por QR,
  confirmando que `utm_campaign` aparece no lead (Ploomes/Base). Sem isso, não há medição.
- Padrão de UTM (segue o do doc 27):
  `https://ecobraz.org/agendamento/?utm_source=offline&utm_medium=<canal>&utm_campaign=guerrilha-<acao>&utm_content=<codigo-do-parceiro>`
  Ex.: `utm_medium=condominio&utm_campaign=guerrilha-mutirao&utm_content=cond-mooca-017`.
- Conversão no Google: um lead com UTM `offline` que vira coleta é contado como coleta do canal
  offline — **não** como conversão do Grants. O efeito no Grants se mede pela **busca de marca**
  (seção 5).

### Ação 1 — Pedido de avaliação + salvar contato, pós-coleta
- **Público:** toda PF/PJ atendida (200–250 PF/mês segundo o plano-mestre).
- **Mecânica:**
  1. No dia seguinte à coleta concluída, Debora (ou mensagem automática do portal, se existir)
     envia o texto 3 (seção 3) por WhatsApp com o **link direto de avaliação do Perfil**
     (gerado no próprio Perfil da Empresa: "Pedir avaliações" — o Marcio copia o link uma vez).
  2. Pedir a **todos**, não só a quem ficou satisfeito.
  3. Responder toda avaliação em até 48h, inclusive negativas, sem expor dados do cliente.
  4. Junto, pedir para salvar o contato e indicar ("se um vizinho precisar, é só procurar
     Ecobraz no Google").
- **Custo:** ~R$ 0 (tempo: ~1 min por cliente; ~4h/mês para 250 envios — estimativa).
- **Quem executa:** Debora; Marcio responde avaliações (ou delega com modelo aprovado).
- **Medição:** contagem de avaliações no Perfil (anotar hoje o número de partida — o último
  registrado é 354 em 26/07); taxa = novas avaliações ÷ coletas concluídas no mês.
  Referência a confirmar: 5%–15% de resposta é a faixa comum (hipótese, não medi).
- **Como ajuda no Google:** avaliações recentes reforçam o Perfil nas buscas locais
  ("descarte de geladeira perto de mim"), que é exatamente onde a PF perde hoje (doc 24:
  "Ecobraz não apareceu nas 4 buscas locais"). Não atua direto sobre o Grants, atua no Maps.
- **Regra do Google (FATO, com ressalva):** é proibido oferecer benefício em troca de avaliação
  ou pedir apenas avaliações positivas. Fonte: "Conteúdo proibido e restrito" —
  https://support.google.com/contributionpolicy/answer/7400114?hl=pt-br e Central do Perfil
  da Empresa — https://support.google.com/business/answer/3474122?hl=pt-BR.
  ⚠️ Não consegui abrir essas páginas diretamente (a rede da sessão bloqueia support.google.com);
  li o resumo pelo buscador. Conferir o texto atual antes de treinar a equipe.
  Consequência prática: **nada de sorteio, brinde ou desconto por avaliação**, e nada de
  "se gostou, avalie; se não gostou, fale com a gente" (filtro seletivo).

### Ação 2 — Ímã/cartão "na próxima, busque Ecobraz", entregue na coleta
- **Público:** quem acabou de descartar (já confia) + quem vê a geladeira da casa (família, visita).
- **Mecânica:**
  1. Ímã de geladeira 5×5 cm (ou cartão, se o ímã sair caro): "Eletrônico parado? **Procure
     Ecobraz no Google**" + QR com UTM `utm_medium=ima&utm_campaign=guerrilha-pos-coleta` +
     WhatsApp e telefone (11) 4329-2001.
  2. A equipe de coleta entrega em mãos ao fim da retirada ("para quando aparecer mais coisa
     ou um vizinho precisar").
  3. Variante com `utm_content` por motorista/rota permite saber quais rotas geram mais retorno.
- **Custo (ESTIMATIVA, cotar):** ímã 1.000 un. ~R$ 300–600 (≈R$ 0,30–0,60/un.); cartão 1.000 un.
  ~R$ 80–150. Com ~250 coletas/mês, 1.000 un. duram ~4 meses.
- **Quem executa:** equipe de coleta (entrega); Marcio aprova arte; impressão terceirizada.
- **Medição:** leads com `utm_medium=ima` + aumento de buscas "ecobraz" (seção 5).
- **Como ajuda no Google:** o ímã fica meses visível — gera busca de marca e recorrência sem custo
  de clique. Volume esperado é baixo e lento (hipótese).

### Ação 3 — Mutirão de condomínio pelo síndico
- **Público:** síndicos moradores e zeladores de prédios médios/grandes na Grande SP.
- **Mecânica:**
  1. Fonte de contatos (sem comprar lista): (a) PF que já coletou e mora em condomínio — ao
     agendar, Debora pergunta "é condomínio? posso mandar ao síndico um convite para um dia de
     coleta do prédio?"; (b) síndicos que já pediram coleta na base; (c) indicação.
  2. Envio do texto 1 (seção 3) ao síndico, com link `/para-condominios/` com UTM.
  3. Data fechada → Ecobraz entrega o comunicado pronto (elevador + grupo) **com a frase
     "Procure Ecobraz no Google" e QR**; moradores levam itens ao ponto da área comum até o dia.
  4. Dia da coleta: 1 rota, comprovante para a ata ao síndico; entrega dos ímãs (ação 2) a quem
     estiver presente; cartaz pós-coleta "Neste prédio saíram X kg" (só número real pesado).
  5. Pedido de avaliação ao síndico (ação 1) — síndico avalia como cliente real.
- **Custo (ESTIMATIVA):** impressão de 2–4 cartazes A4/A3 + 50 ímãs/cartões ≈ R$ 50–200; a coleta
  em si custa o que a operação já custa, mas é **1 rota para vários domicílios** (provável
  custo por kg menor que a coleta PF unitária — hipótese, a Ecobraz tem o dado real).
- **Quem executa:** Debora (contato e agenda); operação (dia); Marcio aprova o comunicado.
- **Medição:** `utm_medium=condominio&utm_content=cond-<bairro>-<nº>` em cada comunicado;
  kg por mutirão; número de domicílios participantes (contagem no dia); avaliações do síndico.
- **Como ajuda no Google:** 1 comunicado é lido por centenas de moradores; parte busca a marca
  para checar se é golpe (comportamento da persona 45/55+, doc 33) → busca de marca + visita
  ao Perfil. Pendência do doc 24 que **aumenta muito a conversão aqui:** decisão do Marcio
  sobre "garantia de custo zero para o perfil-padrão de condomínio".

### Ação 4 — Administradoras e síndicos profissionais (multi-condomínio)
- **Público:** administradoras de condomínio e síndicos profissionais (um contato = 10–50 prédios).
- **Mecânica:**
  1. Lista montada à mão de fontes públicas (sites das administradoras, Google Maps) —
     **contato corporativo**, nunca celular pessoal raspado.
  2. Abordagem de Silvana/Debora por e-mail/telefone comercial oferecendo "agenda anual de
     mutirões" (ex.: 1 por semestre por prédio), sem fidelidade obrigatória (já é a régua da
     página de condomínios).
  3. Piloto com 1 administradora: 3 prédios em 30 dias, relatório simples por prédio.
  4. Inserção da Ecobraz no informativo/boletim que a administradora já manda aos condôminos
     (com "Procure Ecobraz no Google" + QR com `utm_content=adm-<nome>`).
- **Custo:** ~R$ 0 + horas de Silvana (estimo 4–8h/semana no 1º mês).
- **Quem executa:** Silvana (abordagem), Debora (agenda), Marcio (decide o pacote — pendência
  do doc 24 "Pacote multi-condomínio").
- **Medição:** administradoras contatadas → reuniões → prédios agendados → kg; UTM por administradora.
- **Como ajuda no Google:** boletim de administradora é canal de alto alcance e confiança;
  gera busca de marca de forma escalável. Confiança **B** — ciclo de venda pode passar de 60 dias.

### Ação 5 — Assistências técnicas: "aparelho sem conserto"
- **Público:** assistências técnicas de bairro (TV, celular, informática, linha branca) — lidam
  todo dia com o cliente cujo aparelho "não compensa consertar" e com sucata acumulada.
- **Mecânica:**
  1. Visita presencial (a equipe de coleta pode fazer na própria rota) ou WhatsApp comercial.
  2. Oferta dupla: (a) coleta da sucata acumulada da própria assistência (PJ pequena — seguir
     a régua de coleta avulsa para empresas; condições por escrito antes); (b) display de balcão
     A5 "Seu aparelho não tem conserto? Procure Ecobraz no Google — coleta grátis em casa na
     Grande SP (sujeita à avaliação)" + QR `utm_medium=assistencia&utm_content=ast-<nome>`.
  3. O técnico entrega o cartão ao cliente na hora do "não tem conserto".
  4. Sem comissão em dinheiro no começo (evita parecer compra de indicação e complica a OSCIP);
     a contrapartida é a coleta da sucata da loja e um selo "Parceiro de descarte certo" — só
     se o Marcio aprovar a criação do selo.
- **Custo (ESTIMATIVA):** displays A5 + cartões ≈ R$ 10–20 por loja; 10 lojas ≈ R$ 100–200.
- **Quem executa:** operação (visita na rota) + Debora (cadastro do parceiro).
- **Medição:** UTM por loja; ranking mensal de lojas que geram coletas; cortar lojas com zero em 60 dias.
- **Como ajuda no Google:** momento de dor exato + frase de busca da marca. Volume por loja é
  pequeno (hipótese: 0–3 coletas/mês por loja).

### Ação 6 — Lojas de eletrodomésticos e de usados de bairro: "a nova chegou, a velha sai"
- **Público:** lojas independentes de eletrodomésticos novos e de usados/seminovos (redes grandes
  têm programa próprio ou fornecedor — evitar no início; podem ser alvo futuro do Adote um Bairro).
- **Mecânica:**
  1. Abordagem com o texto 2 (seção 3).
  2. Na venda, o vendedor entrega o cartão "Sua geladeira/máquina velha: procure Ecobraz no Google
     ou aponte a câmera" com QR `utm_medium=loja&utm_content=loja-<nome>`; o cliente agenda a
     retirada para o dia da entrega da nova ou depois.
  3. **Não prometer retirada no mesmo dia da entrega** salvo se a operação confirmar janela — a
     derrota de Guarulhos (doc 24) foi justamente prazo.
  4. A loja ganha um argumento de venda ("a gente resolve a velha também") sem custo.
- **Custo (ESTIMATIVA):** cartões + display ≈ R$ 10–30 por loja.
- **Quem executa:** Silvana ou Debora (abordagem), operação (coleta).
- **Medição:** UTM por loja; % de linha branca nas coletas do canal.
- **Como ajuda no Google:** linha branca é exatamente a campanha pausada "SP | Linha Branca";
  a busca "geladeira velha" tem volume baixo nos termos de busca da conta (vários termos com 1–4
  impressões/30d). O canal da loja gera a demanda que o Google não está entregando. Confiança **B**.

### Ação 7 — Imobiliárias, vistoriadores e empresas de mudança
- **Público:** imobiliárias de locação (saída de inquilino deixa geladeira/fogão/TV), vistoriadores,
  pequenas transportadoras de mudança.
- **Mecânica:**
  1. Inclusão de 1 linha no checklist/termo de desocupação da imobiliária: "Eletrônicos e
     eletrodomésticos para descartar: procure Ecobraz no Google" + QR `utm_medium=imobiliaria`.
  2. Para mudanças: o carreteiro indica a Ecobraz para o que "não vai para a casa nova".
  3. Atenção ao prazo: mudança tem data fixa; só divulgar a imobiliárias quando houver resposta
     de fim de semana/urgência definida (pendência do doc 24).
- **Custo:** ~R$ 0–200 (cartões).
- **Quem executa:** Silvana (imobiliárias, perfil B2B), Debora.
- **Medição:** UTM por parceiro.
- **Como ajuda no Google:** gatilho "mudança" é o nº 1 citado nas personas PF 35/45/65 (doc 33).
  Confiança **B**.

### Ação 8 — Escolas, igrejas e associações de bairro: "Dia do Eletrônico"
- **Público:** escolas (pais), paróquias/templos, associações de moradores, clubes.
- **Mecânica:**
  1. A instituição cede espaço e divulga; data única (sábado de manhã); a Ecobraz recebe no ponto
     e leva tudo numa rota.
  2. Divulgação pela própria instituição (bilhete, aviso no culto/missa, grupo) com
     "Procure Ecobraz no Google" + QR `utm_medium=evento&utm_content=evt-<local>-<data>`.
  3. Escola: aula curta opcional (Marcio ou voluntário) sobre por que eletrônico não vai para o
     lixo comum — sem promessas de números ambientais não medidos.
  4. No dia: pesar tudo e divulgar só o número real; distribuir ímãs (ação 2) para quem tem
     itens grandes que não trouxe (geladeira) → vira coleta domiciliar.
- **Custo (ESTIMATIVA):** R$ 100–300 por evento (impressos, banner simples reaproveitável).
- **Quem executa:** Debora (agenda), operação (dia), Marcio (presença em eventos maiores).
- **Medição:** kg por evento; nº de pessoas; coletas domiciliares geradas em 30 dias com o UTM.
- **Como ajuda no Google:** evento local gera conversa no bairro e buscas pela marca;
  instituições costumam postar fotos/link (menção local). Linha branca vem depois, pela coleta
  domiciliar derivada. ⚠️ Item recebido sem cadastro de quem entregou não gera lead — o QR é o
  que transforma participante em contato.

### Ação 9 — Adote um Bairro como "bairro do mês"
- **Público:** moradores de 1 bairro + o patrocinador (persona ESG).
- **Mecânica:** quando houver o 1º patrocinador (hoje **não há nenhum** — doc 01), concentrar as
  ações 3, 5 e 8 em um bairro por mês, com materiais "Coleta neste bairro apoiada por [empresa]"
  (só com autorização escrita do patrocinador). Antes de haver patrocinador, usar o mesmo formato
  como **piloto mensurável** ("Bairro do mês: Mooca") para gerar o case e os números que o doc 01
  precisa para vender as cotas.
- **Custo:** o das ações 3/5/8 concentradas.
- **Quem executa:** Marcio/Silvana (patrocinador), Debora + operação (bairro).
- **Medição:** coletas, kg e domicílios por bairro/mês; `utm_campaign=guerrilha-bairro-<nome>`.
- **Como ajuda no Google:** concentração geográfica cria densidade de avaliações e buscas num
  bairro; o relatório vira prova para vender cota. Confiança **B**; não usar o nome de
  patrocinador sem contrato.

### Ação 10 — Imprensa de bairro, rádio comunitária e grupos locais
- **Público:** jornais/sites de bairro, rádios comunitárias, páginas "Bairro X" no Facebook/Instagram.
- **Mecânica:** pauta pronta para cada mutirão/evento (ação 3/8): data, local, o que entra e o que
  não entra (pilhas/lâmpadas/toner **fora** — decisão do Marcio de 25/07), "procure Ecobraz no
  Google". Postar em grupos só onde a regra do grupo permite e como a própria instituição parceira.
- **Custo:** ~R$ 0.
- **Quem executa:** Marcio (porta-voz) ou quem ele designar.
- **Medição:** pico de buscas de marca na semana da matéria; UTM `utm_medium=imprensa`.
- **Como ajuda no Google:** menções e links locais ajudam o Perfil e geram picos de busca de marca.
  Irregular — não planejar caixa com isso.

---

## 3. Os 3 textos prontos (sem promessa não comprovada)

Regras aplicadas: "sujeita à avaliação"/"se não for gratuito, avisamos antes, com o valor"
(régua já usada no site e no doc 33); sem número que não foi medido; sem nome de cliente.
Trechos entre colchetes são preenchidos na hora.

### Texto 1 — WhatsApp para síndico (primeiro contato, após indicação de morador)
> Olá, [nome], tudo bem? Aqui é a [Debora], da Ecobraz — associação sem fins lucrativos que
> coleta eletrônicos e eletrodomésticos na Grande São Paulo desde 2011.
> A [moradora/o nome, só se ela autorizou] do [condomínio] fez uma coleta conosco e sugeriu
> organizarmos um **dia de coleta para o prédio todo**.
> Como funciona: combinamos uma data com a zeladoria, mandamos o comunicado pronto para o
> elevador e o grupo, os moradores deixam TVs, computadores, micro-ondas e afins num ponto da área
> comum, e retiramos tudo no dia. Você recebe o **comprovante do que saiu, para a ata**.
> Na maioria dos casos não há custo; isso é confirmado antes, olhando volume e acesso — se
> houver custo, avisamos antes, com o valor. Não tem fidelidade.
> Se quiser conferir quem somos, é só procurar **Ecobraz** no Google. Detalhes:
> [ecobraz.org/para-condominios/?utm_source=offline&utm_medium=whatsapp&utm_campaign=guerrilha-mutirao&utm_content=cond-XXX]
> Posso te mandar duas datas possíveis?

Observação: só citar o morador se ele autorizou (LGPD e bom senso). Sem indicação, cortar a 2ª frase.

### Texto 2 — Abordagem para loja de eletrodomésticos / assistência técnica (presencial ou WhatsApp comercial)
> Bom dia! Sou [nome], da Ecobraz, associação sem fins lucrativos de coleta de eletrônicos e
> eletrodomésticos na Grande SP, desde 2011.
> Uma pergunta rápida: quando vocês vendem uma geladeira ou máquina nova [ou: quando o aparelho
> não tem conserto], o cliente pergunta o que fazer com a velha?
> A gente pode ser essa resposta. Deixo um cartão/display com QR: o cliente agenda a retirada em
> casa direto com a gente — **a coleta residencial é gratuita na Grande SP, sujeita à avaliação**,
> e se algum caso não puder ser gratuito, a gente avisa o cliente antes, com o valor.
> Para a loja: não custa nada, não exige contrato, e se vocês tiverem sucata eletrônica acumulada,
> combinamos a retirada também, com as condições por escrito antes.
> Posso deixar [10] cartões e um display no balcão para testar por 60 dias?

### Texto 3 — Pedido de avaliação pós-coleta (WhatsApp, dia seguinte, para TODOS os atendidos)
> Olá, [nome]! Aqui é a [Debora], da Ecobraz. Ontem retiramos [os itens] no seu endereço.
> Correu tudo como combinado? Se algo não saiu certo, me responde aqui que eu resolvo.
> Se puder, conte como foi a sua experiência no Google — boa ou ruim, ela ajuda outras famílias
> a decidir e ajuda a gente a melhorar: [link de avaliação do Perfil]
> E se um vizinho ou parente precisar descartar eletrônico, é só procurar **Ecobraz** no Google. Obrigada!

Por que este formato: pede a todos (sem filtrar satisfeitos), não oferece nada em troca
(regra do Google, seção 2, ação 1) e separa a oportunidade de resolver problema da avaliação
(a pessoa pode avaliar mesmo reclamando — isso é permitido e esperado).

---

## 4. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| **Operação não dá conta** (79 OS agendadas hoje; 200–250 PF/mês é a capacidade conhecida) | Média — não sei se 79 é fila normal | Alto: atraso vira avaliação negativa e mata justamente o que a guerrilha busca | Começar com ações 1–2 (sem volume novo concentrado) + **1 mutirão/semana** no máximo no 1º mês; teto de mutirões definido pela operação; pausar canal que gerar fila > X dias (Marcio define X) |
| **Imagem: promessa de "grátis" virar cobrança na porta** | Média | Alto (persona 45/55+ lê como golpe — doc 33) | Usar sempre a régua "sujeita à avaliação / avisamos antes, com o valor"; decidir a garantia de custo zero para condomínio-padrão (doc 24) antes de escalar a ação 3 |
| **Linha branca concentrada** (geladeira exige 2 pessoas, veículo, acesso; escadas) | Alta em ações 6/7 | Médio | Perguntar andar/elevador no agendamento; ações 6/7 só depois de confirmar com a operação que há janela para linha branca |
| **Itens fora do escopo** chegando em mutirões (pilhas, lâmpadas, toner, móveis — os termos de busca mostram muita procura por "móveis") | Alta | Médio (custo e constrangimento no dia) | Comunicado com "Entra / Não entra" explícito; zelador orientado |
| **LGPD — listas de contatos** | Média | Alto (multa e imagem) | Não comprar nem raspar listas de celulares; abordar B2B pelo contato comercial público; síndico/morador só com contato fornecido pelo próprio titular ou com autorização; registrar a origem do contato; usar o campo `marketing_consent` que já existe no formulário; oferecer saída ("se não quiser mais mensagens, responda SAIR") em mensagens de prospecção; não citar morador ao síndico sem autorização. ⚠️ Não sou advogado — validar com o jurídico da Ecobraz a base legal (legítimo interesse vs. consentimento) para WhatsApp de prospecção |
| **Política de avaliações do Google** (incentivo ou pedido seletivo derruba avaliações e pode punir o Perfil) | Baixa se seguir o texto 3 | Alto | Nenhum brinde/sorteio ligado a avaliação; pedir a todos; nunca escrever avaliação em nome do cliente; funcionários não avaliam |
| **Parceiro usar a marca de forma errada** (loja prometendo "retirada amanhã" ou cobrando do cliente pela "indicação") | Média | Médio | Material impresso pela Ecobraz, texto fechado; acordo simples de 1 página; cortar parceiro que desviar |
| **Expectativa de resultado rápido no Grants** | Alta | Médio | A guerrilha aumenta buscas de marca devagar (semanas); não resolve sozinha o gasto do Grants (o gargalo principal é classificação/qualidade nas campanhas não-marca — brief). É complemento, não substituto |
| **Nome dividido Ecobraz / Ecobraz Emigre** confunde a busca | Média | Baixo-médio | Decisão do Marcio (seção 0); conferir que "ecobraz" mostra o Perfil |

---

## 5. Como medir o efeito no Google (painel semanal, 10 min)

1. **Buscas de marca no Ads** — aba `termos_busca_30d`: impressões de "ecobraz", "ecobraz emigre"
   e variações. Linha de base FATO (30d até 28/10): 58 + 6 = 64 impressões. Meta de teste
   (hipótese): dobrar em 90 dias.
2. **Search Console** — consultas contendo "ecobraz" (cliques/impressões). Não consultei hoje.
3. **Perfil da Empresa** — "pesquisas pelo nome da empresa" e nº de avaliações. Base registrada:
   354 avaliações em 26/07/2026 (anotar o número atual no dia 1).
4. **Leads com UTM `utm_source=offline`**, por `utm_medium` e `utm_content` — e quantos viraram
   coleta concluída (Base Ecobraz).
5. **Pergunta no telefone/WhatsApp:** "como conheceu a Ecobraz?" (quem liga não passa pelo QR).

Leitura honesta: a busca de marca tem muitas causas (redes sociais, sazonalidade, imprensa);
uma subida não prova que foi a guerrilha. Os UTMs provam o canal; a busca de marca mostra a tendência.

---

## 6. Plano dos primeiros 30 dias (ordem de execução)

- Semana 1: Passo 0 (UTM + teste de lead); Marcio decide o nome a buscar e aprova textos 1–3;
  Debora inicia a ação 1 com todas as coletas da semana; cotar e imprimir ímãs/cartões.
- Semana 2: ação 2 nas coletas; primeiros 3 convites de mutirão (ação 3) a partir da base;
  operação define o teto de mutirões/semana.
- Semana 3: 1º mutirão; 5 assistências técnicas na rota (ação 5); Silvana contata 5 administradoras (ação 4).
- Semana 4: balanço com os números da seção 5; cortar o que não gerou nada; manter/escala o resto.

## 7. Balanço honesto

- **Verificado:** volume de busca de marca no Ads (64 impressões/30d), nome do Perfil e
  354 avaliações em 26/07, formulário com campos UTM no código, fila de 79 OS agendadas hoje,
  página de condomínios existente com a régua de custo.
- **Não verificado:** se a UTM chega gravada no lead em produção; nota/contagem atual de avaliações;
  o que aparece hoje na busca "ecobraz"; o texto atual da política do Google (li só pelo buscador);
  custos de impressão (estimativas sem cotação); todos os volumes de coletas por ação (hipóteses).
- **Depende do Marcio:** nome para busca; aprovação dos textos; garantia de custo zero para condomínio;
  canal de urgência/fim de semana; teto operacional; eventual selo de parceiro; validação jurídica LGPD.
