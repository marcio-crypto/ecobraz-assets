# Portal do Cliente Ecobraz — Visão e Roadmap (documento vivo)

> Este documento registra a visão do produto, as ideias combinadas e os **pontos
> de atenção honestos**. Ele é atualizado a cada avanço. Datas no formato AAAA-MM-DD.
> Última atualização: 2026-07-20.

## 1. Visão

Um sistema dentro do site da Ecobraz, com **acesso restrito a clientes ativos**,
que transforma o descarte de eletrônicos em **valor de conformidade e ESG** para o
cliente — feito sob medida para o negócio dele (a partir do CNPJ), não genérico.

O objetivo comercial: **agregar valor ao serviço da Ecobraz** e virar uma
**ferramenta de alto valor, comercializável junto com o produto**.

## 2. Princípios inegociáveis (o que sustenta o valor comercial)

1. **Conformidade real, não aparência.** Todo documento emitido precisa ter lastro
   verificável e seguir norma aceita por auditoria. Um PDF bonito sem lastro
   destrói o valor do produto no primeiro auditor que olhar.
2. **Sem greenwashing.** Alegações de redução/neutralização de CO₂ só quando forem
   verdadeiras e comprováveis. É também exigência legal (UE e Brasil).
3. **LGPD desde o início.** O sistema guarda CNPJ e dados de empresas/pessoas;
   ele mesmo precisa estar em conformidade.
4. **Segurança.** Chaves só em cofres (GitHub/Cloudflare); nunca no código, log ou chat.
5. **Construção em pacotes.** Cada pacote entra no ar sozinho, agregando valor;
   aprendemos e ajustamos antes do próximo.

## 3. Roadmap por pacotes

> Ordem por **menor risco / maior valor imediato** primeiro. Sujeita a ajuste.

- **Pacote 0 — Portal do Cliente (fundação).** Login só para cliente ativo; painel
  com as OS/atendimentos do Ploomes; abertura de chamado que vira nova OS no Ploomes.
  *Pré-requisito em andamento: diagnóstico do Ploomes.*
- **Pacote 1 — Certificado de Destinação Final (CDF).** Gerado a partir das OS reais,
  em PDF, com rastreabilidade e verificação. Padrão audit-grade.
- **Pacote 2 — Painel de carbono.** Cálculo das reduções por descarte (o material
  entregue "desconta" da conta do cliente), com metodologia que a Ecobraz assine.
  Inclui a **Calculadora de Pegada de Carbono** (modelo *freemium* — ver §4.4).
- **Pacote 3 — Radar de legislação por CNPJ/setor.** Puxa o setor (CNAE) pelo CNPJ,
  mostra obrigações e dispara alertas — com base jurídica validada e mantida.
- **Pacote 4 — Neutralização + compensação.** Certificado de neutralização de CO₂,
  **somente com lastro real** (ver §5). Aqui entra a ligação com o *Adote um Bairro*.

## 4. Ideias combinadas (a preservar na construção)

### 4.1 Vínculo por **completude** (incentivo honesto, não armadilha)
Quanto mais o cliente concentra os descartes na Ecobraz, mais **completo e sem
trabalho** fica o dossiê dele (conformidade + carbono "mastigado" e pronto). Se ele
descarta só de vez em quando, o material ajuda mas fica **incompleto**, e ele tem
trabalho para juntar tudo.
- **Como o sistema entrega isso:** o Ploomes vira a fonte única do histórico de
  descartes; histórico completo → documentos automáticos e completos; histórico
  parcial → lacunas que o cliente teria que preencher na mão.
- **Reforço sugerido:** um **indicador de cobertura/completude** visível no painel
  ("seu dossiê está 78% completo") — o incentivo fica transparente e motivador.
- *Por que é honesto:* o "vínculo" vem de **entregar mais valor**, não de prender o
  cliente. Isso é defensável comercial e juridicamente.

### 4.2 Carbono com **desconto pelo material** + complemento via *Adote um Bairro*
O sistema calcula as emissões do cliente e quanto ele precisa neutralizar. O que ele
entrega de material **desconta** desse cálculo. O que faltar, ele pode completar
comprando **cotas de patrocínio do Adote um Bairro** — fechando a conta do ano.
Comercialmente, é uma **venda cruzada** (ele já recebe tudo pronto para usar).
- ✅ A **mecânica** (calcular, descontar o que foi reciclado, oferecer complemento) é
  ótima e viável.
- ⚠️ **Dois cuidados sérios** antes de chamar isso de "neutralização" — ver §5.

### 4.3 Varredura mensal de legislação assistida por IA (radar automático)
Uma rotina automática (1×/mês) usa IA (via API) para varrer mudanças de regras e
legislação (BR + UE), comparar com a base de conhecimento do sistema e
**sinalizar e rascunhar** as atualizações necessárias.
- ✅ **Motor já demonstrado:** os dois agentes de pesquisa deste projeto são exatamente isso.
- ⚠️ **Regra de ouro — humano no circuito.** A varredura **detecta, alerta e rascunha**;
  um **especialista aprova** antes de o sistema mudar o que o cliente vê. IA sozinha erra
  ou interpreta mal, e fontes oficiais às vezes bloqueiam a leitura automática.
- ⚠️ **Posicionamento honesto:** o produto é **apoio e alerta de conformidade**, e **não
  "garantia de conformidade total"**. Prometer "100% automático" transferiria para a
  Ecobraz a responsabilidade legal por cada cliente. O que prometemos: "mantemos você
  atualizado e alertado", com validação humana.
- Encaixe: é o motor de atualização do **Pacote 3 (Radar de Legislação)**.

### 4.4 Calculadora de Pegada de Carbono — modelo *freemium* (proposto pelo Marcio, 2026-07-20)

Módulo no Painel do Assinante (ativa o card **"Pegada de carbono"** já plantado no dashboard).
Funil em **3 níveis**, do grátis ao serviço — cada nível com a palavra certa para não virar promessa que não se cumpre:

**Nível 1 — Estimativa grátis (isca).** A partir do **CNPJ**, o sistema puxa **CNAE (setor) + porte**
(API pública: BrasilAPI/ReceitaWS) e cruza com **fatores de emissão por setor** para exibir uma
**estimativa** de tCO₂e.
- ⚠️ **Basear no setor (CNAE), não só no porte** — porte sozinho erra feio (uma software house e uma
  fundição do mesmo porte emitem coisas absurdamente diferentes). Opcional: 1–2 dados rápidos
  (nº de funcionários, faixa da conta de luz) para afinar.
- ⚠️ Rótulo obrigatório na tela: **"cálculo estimado"**, não inventário (coerente com §4-bis: a pegada
  real "não sai só do CNPJ").

**Nível 2 — Cálculo detalhado (R$ 250, pago).** Cliente clica → cobrança via **Mercado Pago**
(Pix/cartão) → ao **confirmar o pagamento**, libera um **formulário** que ele preenche e o sistema
calcula a pegada detalhada.
- **Metodologia âncora:** **GHG Protocol** (e **Programa Brasileiro GHG Protocol** / FGV), Escopos 1/2/3,
  com fatores oficiais citáveis (ex.: fator de emissão do **SIN/MCTI** p/ energia). As "perguntas padrão
  que toda consultoria faz" **são** os campos de inventário do GHG Protocol.
- ⚠️ **Palavra certa:** o R$250 compra um **cálculo detalhado/indicativo a partir dos dados informados**
  — **não** um **inventário verificado** (esse exige consultor + verificação de terceiro, ISO 14064).
  **Nunca prometer "neutralidade" nesse nível.**

**Nível 3 — Inventário verificado + compensação (sob consulta — a receita de verdade).** Inventário com
asseguração + **compensação com crédito verificado** (ISO 14068-1) e/ou *Adote um Bairro* como impacto
social (§5.2, Caminho B). É a escada natural depois do R$250.

**Fluxo de pagamento e Nota Fiscal (decidido pelo Marcio, 2026-07-20):**
- **Pagamento:** Mercado Pago. O formulário do Nível 2 libera **só na confirmação do pagamento** — usar
  **webhook/IPN** do Mercado Pago (status `approved`), não só o redirect, para ser confiável.
- **NF:** o sistema **não** emite nota. Ao confirmar o pagamento, dispara **e-mail para
  `pagamento@ecobraz.org.br`** com **dados da empresa** (razão social/CNPJ/endereço — já vêm da consulta
  do CNPJ), **produto**, **valor pago** e o **ID do pagamento no Mercado Pago** (p/ o financeiro
  conciliar). O **financeiro emite a NF e envia direto ao cliente**.

**Campos do formulário (Nível 2) — padrão GHG Protocol (rascunho a detalhar):**
- **Escopo 1** (direto): combustível de frota própria (litros/ano por tipo), combustão estacionária,
  gases fugitivos (refrigeração/ar-condicionado).
- **Escopo 2** (energia): consumo de energia elétrica (kWh/ano) → fator SIN.
- **Escopo 3** (indireto, principais conforme o setor): viagens a negócio, deslocamento de funcionários,
  resíduos, compras/serviços.

**Pontos em aberto (ver §6):** tabela de **fatores por CNAE** (fonte + validação do especialista de
carbono, §5.4); **enquadramento tributário** da venda (Ecobraz é Associação); taxa do Mercado Pago
(~4–5% + fixo) sobre os R$250; curadoria da estimativa setorial para não sair irreal.

## 4-bis. Escopo detalhado do Portal (v1) — definido pelo Marcio em 2026-07-20

**Acesso (quem entra):** somente **Pessoas Jurídicas com contrato ativo** com a Ecobraz — não todos os clientes.
- **Marcação no Ploomes:** campo **"Contrato ativo?"** + **"Data de encerramento do contrato"** no
  cadastro da empresa. O sistema **libera** enquanto vigente e **trava** ao vencer (até renovar).
- **Login:** **link/código enviado por e-mail** (sem senha). O e-mail precisa bater com uma empresa
  PJ de contrato ativo.

**O que o cliente vê/faz no painel:**
- **Abrir OS** direto pelo sistema (sem falar com o comercial) → nova OS no Ploomes.
- **Acompanhar todas as suas OS** (abertas e realizadas, com datas).
- **Baixar documentos** (quando existirem): **Nota Fiscal**, **MTR**, **Carta de Doação**, **Certificado de Destinação Final**.
- **Carbono:** calcular as emissões anuais da empresa; ver quanto foi **evitado** pelos descartes;
  quanto **falta** para zerar; e **contratar Adote um Bairro** para complementar.
- **Relatórios de conformidade** padronizados, **prontos para auditoria e ESG**, a partir dos
  descartes + cotas do Adote um Bairro.

**Regras que continuam valendo (de `conformidade/`), para o relatório ser aceito por auditor:**
- A **pegada anual total** exige dados de entrada do cliente (energia, combustível etc.) ou estimativa
  setorial — **não sai só do CNPJ**.
- **Emissão evitada** pelo descarte **não é** neutralização no rigor contábil; neutralização real usa
  **crédito verificado**; **Adote um Bairro = impacto social** (§5.3).
- Documentos só são baixáveis se estiverem **guardados no Ploomes**; **MTR/CDF nascem no SINIR** (gov) —
  ou a Ecobraz anexa a cópia no Ploomes, ou integramos o SINIR depois.

## 5. Pontos de atenção honestos (ler antes de construir os pacotes 2 e 4)

> Estes são os pontos onde "bonito" e "confiável" se separam. Registrados para não
> serem esquecidos. Detalhamento virá do documento de conformidade (em pesquisa).

1. **"Venda casada" — termo e estrutura.** No Brasil, *venda casada* (condicionar a
   venda de um produto à compra de outro) é **proibida** pelo Código de Defesa do
   Consumidor. **Oferecer** o complemento como opção é legal e recomendável; **obrigar**
   não. Vamos tratar como **venda cruzada opcional**, nunca condicionada.
2. **Integridade da compensação (o ponto mais crítico).** Para um **certificado de
   neutralização** ser aceito por auditoria e não ser greenwashing, a compensação
   precisa ter **lastro verificável** (quantificação por metodologia reconhecida,
   adicionalidade, verificação por terceiro, aposentadoria do crédito, sem dupla
   contagem). A norma internacional que rege isso é a **ISO 14068-1** (neutralidade
   de carbono), somada às regras anti-greenwashing da UE.
   - **DECIDIDO (2026-07-20):** o *Adote um Bairro* é um **programa de impacto social/urbano**
     (não é projeto de carbono verificado). Portanto seguimos o **Caminho B** abaixo.
   - **Dois caminhos honestos:**
     - **A) Transformar o *Adote um Bairro* em projeto de carbono certificável** —
       metodologia + MRV + verificação de terceiro. Aí as cotas viram compensação real
       e o certificado de neutralização é legítimo e audit-grade. (Mais trabalho, maior valor.)
     - **B) Separar as duas coisas com honestidade [← CAMINHO ESCOLHIDO]** — (1) *reduções* comprovadas pela
       destinação correta (calculadas por norma) e (2) *compensação* feita com **créditos
       certificados**; e oferecer o *Adote um Bairro* como **patrocínio de impacto social**
       adicional, sem vendê-lo como toneladas de CO₂ enquanto não houver verificação.
       (Mais rápido e seguro.)
3. **Emissões evitadas ≠ desconto ou compensação (confirmado pela pesquisa de normas, 2026-07-20).**
   A redução gerada pela reciclagem é, tecnicamente, *emissão evitada* (*avoided emissions*).
   Pela regra consensual de contabilização (GHG Protocol, SBTi, WBCSD), ela **não pode ser
   subtraída** das emissões do cliente (Escopos 1/2/3), **não é compensação/offset** e **não
   sustenta alegação de "carbono neutro"** — a menos que vire crédito verificado. Logo, a ideia
   de "o material entregue desconta do que ele precisa neutralizar" (§4.2) deve ser reapresentada
   como **duas coisas separadas e verdadeiras**: (1) "sua destinação correta **evitou** X tCO₂e"
   (número real, auditável, reportado à parte) e (2) **neutralização** do residual com **crédito
   verificado**. Reforço: a Diretiva UE 2024/825 **proíbe rótulo de "produto carbono neutro"
   baseado em compensação a partir de 27/09/2026**.
4. **Validação por especialista.** Todo o conteúdo legal e de normas precisa ser
   **validado por um advogado ambiental (BR), um especialista de conformidade (UE) e
   um especialista em asseguração de carbono/ESG** antes do uso comercial. O software
   organiza e entrega; não substitui o parecer técnico.

## 6. O que depende do Marcio / Ecobraz (decisões em aberto)

- [x] Rodar o **diagnóstico do Ploomes** — feito (ver `diagnostico/RESULTADOS.md`). (2026-07-20)
- [x] **"Cliente ativo"** = PJ com **contrato ativo** no Ploomes (marcação + data de encerramento); trava ao vencer. (2026-07-20)
- [x] **Login** = link/código por e-mail, **sem senha** (magic link). (2026-07-20)
- [x] **Marcação de contrato no Ploomes** — pronta (2026-07-20): usa **"Contrato Ativo?"**
      (Id 277451, Sim/Não) como gatilho de acesso + **"Termino de Contrato"** (Id 366005, data
      que **aparece no formulário**) como validade. O campo 365984 criado via API ficou **órfão**
      (não aparece no formulário) e **deixou de ser usado**. Ambos no cadastro de empresa (EntityId 1).
- [ ] **Metodologia de CO₂** que a Ecobraz vai assumir — **âncora proposta: GHG Protocol / Programa
      Brasileiro GHG Protocol (FGV)**, com fatores oficiais citáveis (fator SIN/MCTI etc.). Falta a
      Ecobraz assumir formalmente + validação do especialista.
- [x] **Gateway de pagamento** = **Mercado Pago** (Pix/cartão) — **conta já existe**, só integrar.
      Produto: **"Cálculo detalhado de pegada de carbono — GHG Protocol"**, R$ 250. (2026-07-20)
- [x] **Nota Fiscal** = o sistema manda e-mail p/ `pagamento@ecobraz.org.br` (dados da empresa + produto
      + valor + ID do pagamento); **o financeiro emite e envia ao cliente**. (2026-07-20)
- [x] **Enquadramento tributário/estatutário** — **resolvido** (Marcio, 2026-07-20): a Ecobraz **já
      comercializa** esses serviços há anos; é **automação** do que já é praticado. Sem pendência nova.
- [ ] **Tabela de fatores de emissão por CNAE** (fonte + curadoria, validada pelo especialista de carbono).
- [x] Situação do **Adote um Bairro**: **programa de impacto social** (decidido 2026-07-20) →
      vendido como patrocínio de impacto; a neutralização de CO₂ usa **crédito verificado**.
- [ ] Onde o Portal vai morar (ex.: `portal.ecobraz.org`) e a identidade visual.
- [ ] **Posicionamento** dos documentos: "apoio/alerta de conformidade" (recomendado) vs.
      "garantia total" (não recomendado — transfere responsabilidade legal para a Ecobraz).

## 7. Estado atual (honesto)

**Feito e verificado:**
- Base técnica que já existe e funciona: site ↔ Ploomes seguro (Worker `ecobraz-coletas`),
  deploy automático. A API do Ploomes é OData v4 com chave — confirmado.
- Diagnóstico do Ploomes **executado** (ver `diagnostico/RESULTADOS.md`).
- **Pacote 0 escrito e publicado**: Worker `ecobraz-portal` no ar (login por link, portão por
  contrato, sessão assinada, painel com OS + abrir chamado).
- **Portão de acesso corrigido e provado** por autoteste sobre cliente real ativo (`liberado: true`).
  Campos de contrato confirmados: 277451 "Contrato Ativo?" (Sim/Não, BoolValue) e 366005
  "Termino de Contrato" (data, no formulário).
- **Login PONTA A PONTA funcionando** (2026-07-20): pessoa→empresa→contrato → link por e-mail →
  clique → painel. Testado de verdade com uma empresa "Teste" ativa. Segredos configurados na
  Cloudflare (`/health` mostra tudo `true`).
- **Envio de e-mail: migrado do E-goi para o Resend.** O envio transacional do E-goi recusava toda
  requisição com "Required request body is missing" (comprovado que o Worker envia o corpo certo; é
  problema do lado do E-goi). O Resend funcionou de primeira e o e-mail de login chegou na caixa de
  entrada. (Provável que o e-mail transacional do Worker de coletas, mesmo padrão, nunca tenha saído.)

- **Domínio ecobraz.org.br verificado no Resend** (2026-07-20) e remetente do login definido como
  **acesso@ecobraz.org.br** → o Portal envia login para **qualquer cliente**. **Confirmado com teste
  real** para um e-mail externo (chegou e o painel abriu). **Pacote 0 (login + acesso) concluído.**

**Ainda não feito / não testado:**
- **Conteúdo do painel:** a lista de **OS** e o **abrir chamado** estão escritos mas **não validados
  com um cliente real que tenha OS**. Mapeamento provisório (lê Negócios da empresa); refinar para o
  modelo real (Documentos) e apontar o funil certo (`PORTAL_OS_PIPELINE_ID`).
- **Reforço de segurança (pendente):** chaves na Cloudflare foram adicionadas como **Text**; ideal
  convertê-las para **Secret**. Turnstile (anti-abuso no login) disponível no código, não ativado.
- **Código do E-goi** ficou como reserva morta (o envio dele nunca funcionou); pode ser removido.
- A base de **conformidade legal (BR+UE) e de normas de auditoria** já foi **pesquisada e
  documentada** em [`conformidade/`](./conformidade/CONFORMIDADE-E-NORMAS.md) (síntese + 2 anexos
  com fontes oficiais). ⚠️ Está marcada como **material de pesquisa, pendente de validação** por
  advogado(a) ambiental (BR), especialista de compliance (UE) e especialista de asseguração ESG.

## 8. Registro de decisões e ideias

- **2026-07-20** — Marcio aprovou começar pela **fundação (Portal do Cliente)**.
- **2026-07-20** — Combinado: eu opero o Ploomes por automação **sem nunca ver a chave**;
  a chave que funciona hoje está na **Cloudflare** (não no GitHub) — para o diagnóstico,
  ela será adicionada como segredo do GitHub.
- **2026-07-20** — Ideia do **vínculo por completude** (§4.1) — adotada como princípio.
- **2026-07-20** — Ideia de **carbono com desconto + Adote um Bairro** (§4.2) — adotada,
  com os cuidados de §5 (venda cruzada opcional + lastro real da compensação).
- **2026-07-20** — Pedido do Marcio: documentos **audit-grade** e em conformidade
  **BR + UE** → pesquisa de conformidade iniciada.
- **2026-07-20** — Pesquisa de **normas/auditoria concluída**: confirma que *emissão evitada*
  não é desconto/compensação (§5.3) e que a neutralização exige lastro verificado (ISO 14068-1),
  com alerta da Diretiva UE 2024/825. Parte **jurídica (BR+UE)** ainda em pesquisa.
- **2026-07-20** — Ideia da **varredura mensal de legislação por IA** (§4.3) — adotada, com
  **humano no circuito** e posicionamento "apoio", não "garantia total".
- **2026-07-20** — **Decisão:** *Adote um Bairro* é **programa de impacto social** → vendido como
  patrocínio de impacto; a neutralização de CO₂ usa **crédito verificado** (Caminho B do §5).
  Podem ser oferecidos juntos (venda cruzada), sem rotular o patrocínio como "neutralização".
- **2026-07-20** — **Diagnóstico do Ploomes concluído**: 26,9k contatos (19,7k empresas), 18,8k
  negócios (9,5k ganhos), funis comerciais nomeados, dado operacional (nº OS, peso, datas) vive nos
  **Documentos**. Ver `diagnostico/RESULTADOS.md`.
- **2026-07-20** — **Escopo do Portal detalhado** (§4-bis): acesso só **PJ com contrato ativo**
  (marcação no Ploomes + data de encerramento, trava ao vencer); **login por link no e-mail** (sem
  senha); painel com OS, downloads (NF/MTR/Carta de Doação/CDF), carbono e relatórios de conformidade.
- **2026-07-20** — **Marcação de contrato criada no Ploomes** via API (usuário de integração tem
  permissão): reaproveita **"Contrato Ativo?"** (Id 277451) + cria **"Data de encerramento do
  contrato"** (Id 365984) no cadastro de empresa. Pré-requisito do portão de acesso: **concluído**.
- **2026-07-20** — **Pacote 0 — código da fundação escrito** (`worker/`): Worker `ecobraz-portal`
  com login por link no e-mail, portão de acesso por contrato (relê do Ploomes), sessão assinada,
  painel (lista de OS + abrir chamado). ⚠️ Ainda **não publicado nem testado ponta a ponta**;
  mapeamento de "OS" provisório (lê Negócios); depende de config na Cloudflare (segredos, KV, domínio).
- **2026-07-20** — **Portal publicado** (deploy verde, verificado) em `ecobraz-portal.ti-0ab.workers.dev`.
- **2026-07-20** — **Login corrigido** após teste do Marcio falhar. Dois bugs achados por diagnóstico
  de leitura no Ploomes real: (1) o código não seguia **pessoa → empresa** (o e-mail é de uma pessoa
  vinculada); (2) decidia por **TypeId** de forma errada — nesta conta a **empresa** que guarda o
  contrato é TypeId 1 e a **pessoa** é TypeId 2 (invertido do padrão). Correção: portão **agnóstico a
  TypeId**, procura "Contrato Ativo?" no próprio contato **e** na empresa vinculada
  (CompanyId/LastCompanyId). Formato do campo confirmado: 277451 é Sim/Não → lido por **BoolValue**.
- **2026-07-20** — **Validade passou a usar "Termino de Contrato" (Id 366005)**, campo de data que já
  **aparece no formulário** do Ploomes — resolve a pendência do campo de data sem criar nada. O órfão
  365984 foi abandonado (candidato a remoção futura, com aval do Marcio).
- **2026-07-20** — **Autoteste (somente leitura) provou o portão**: sobre um **cliente real ativo**,
  a mesma lógica do Worker retorna `liberado: true`. ✅ Falta a prova ponta a ponta (e-mail chegando +
  painel), que depende dos segredos e do teste do Marcio.
- **2026-07-20** — ⚠️ **Bloqueio achado:** `wrangler secret list` no Worker devolveu **vazio** — o
  `ecobraz-portal` está **sem os segredos** na Cloudflare (`PLOOMES_USER_KEY`, `PORTAL_SESSION_SECRET`,
  chave do E-goi). Sem eles o login não envia e-mail e fica calado (anti-enumeração) — provável causa do
  teste anterior. `/health` passou a mostrar a **presença** (sim/não) das configs para conferência.
- **2026-07-20** — **Portal com identidade Ecobraz Emigre publicado** (PR #158): login premium (painel
  teal + logo), dashboard estilo corporativo, e-mail de acesso no padrão da marca (Resend). **Link
  "Acesso do cliente" no cabeçalho do site** (deploy do tema, verde). Menu do topo enxugado
  (Conteúdos/Notícias/Museu → rodapé, PR #159).
- **2026-07-20** — **Calculadora de Pegada de Carbono (freemium) adotada** (§4.4): Nível 1 estimativa
  grátis por **CNAE+porte** (API pública); Nível 2 **cálculo detalhado por R$250** via **Mercado Pago**
  (libera na confirmação do pagamento) com **formulário GHG Protocol**; Nível 3 inventário verificado +
  compensação. **NF pelo financeiro** (e-mail p/ `pagamento@ecobraz.org.br` com dados + valor + ID do
  pagamento). Cuidados registrados: R$250 = **cálculo, não neutralidade**; estimativa por **setor**, não
  só porte; validar **fatores por CNAE** e **enquadramento tributário** da associação (sem fins lucrativos).
- **2026-07-20** — **Marcio confirmou** e destravou a calculadora: (1) **tributação/estatuto = sem
  pendência** — a Ecobraz já vende esses serviços há anos; é só automatizar; (2) **conta Mercado Pago
  já existe** (só integrar); (3) **produto** = "Cálculo detalhado de pegada de carbono — GHG Protocol",
  R$ 250. Próximo (a partir de quarta, com créditos): consulta CNPJ→CNAE + esqueleto do módulo no painel.
- **2026-07-20** — **Calculadora Nível 1 CONSTRUÍDA e TESTADA ao vivo** (página pública `/calculadora`):
  CNPJ → BrasilAPI → CNAE + porte → faixa de tCO₂e/ano. **Bug achado e corrigido:** a BrasilAPI recusava
  a chamada do Worker **sem `User-Agent`** (add UA + 3 tentativas → passou; provado com CNPJ real, trouxe
  razão social, setor e faixa corretos). ⚠️ Os **fatores por setor seguem ILUSTRATIVOS** (pendente especialista).
- **2026-07-20** — **Requisito do Marcio para o PAINEL principal (a construir):** tudo **automático** — ao
  logar, já mostra os dados da empresa + a **estimativa já calculada** (o CNPJ vem do contrato no Ploomes,
  sem digitar); um **"termômetro"** com o que a empresa já descartou "abatendo o ponteiro"; abrir OS;
  consultar OS feitas; e os **documentos emitidos**.
  - ⚠️ **FREIO (ligado ao §5.3):** "abater o descartado do ponteiro" é exatamente a armadilha de
    *emissão evitada ≠ compensação*. Mostrar como **DOIS indicadores** ("sua pegada estimada" + "quanto você
    já evitou destinando certo com a Ecobraz"), lado a lado — **não** um subtraindo do outro como se
    neutralizasse. Mantém o impacto visual e fica audit-safe.
  - **Dependências:** o número do "evitado" e os **documentos** dependem dos **dados reais de descarte
    (conversa com a Débora)** + **fatores de emissão evitada** validados por especialista. A estimativa
    automática por CNPJ, essa dá pra ligar já (se o CNPJ estiver no cadastro do Ploomes).
- **2026-07-20** — **Preço do Nível 2 decidido — escalonado por porte** (usando o porte que já vem do CNPJ),
  substitui o "R$ 250 fixo" citado antes (§4.4/§6):
  - Micro/Pequena: **R$ 290** · Média: **R$ 690** · **Grande → não vende o indicativo, vai direto pro
    Nível 3** (inventário verificado; empresa grande precisa do completo).
  - Regras de ouro: (1) deixar **cristalino** que é cálculo **indicativo**, não inventário verificado
    (preço tem que casar com a promessa); (2) desenhar o **próximo passo (Nível 3)** logo após o resultado.
  - ⚠️ Números são **estimativa fundamentada**, não benchmark — **validar com pesquisa de concorrência**
    (preço de mercado BR) na quarta e ajustar.
- **2026-07-21** — **Nível 2 (pago) construído; testado até o checkout do Mercado Pago.** Feito: motor
  de cálculo GHG (`calculoDetalhadoGHG`, testado localmente), formulário `/calculo-detalhado`, e a
  integração **Mercado Pago Checkout Pro** (`mercadopago.js`: preferência + consulta de pagamento),
  webhook `/api/mp/webhook`, status do pedido no KV, e e-mail da NF (no teste vai pro Marcio).
  - ✅ **Provado ao vivo:** botão → cria a preferência → **checkout do MP abre com R$1 e descrição
    corretos**. A parte do MP que eu não conseguia testar do sandbox **funciona**. Bug do começo
    (BrasilAPI sem User-Agent) e este passo confirmam o motor.
  - ⏳ **Ainda a testar** (precisa de um pagamento concluído): webhook → "pago" → e-mail da NF.
  - ⚠️ **Pix não apareceu** no checkout — provável causa: pagar a **própria conta** (MP não oferece Pix
    pra você mesmo). Alternativas p/ testar: cartão real de R$1, cartão de teste, ou 2ª conta.
  - ⚠️ Token do MP ainda em **produção** (`APP_USR-`); o de teste `TEST-` ficou pendente (o painel do MP
    confundiu). Não bloqueia — dá pra testar com valor simbólico real.
- **2026-07-22** — **ESTRUTURA REAL DE OS/DOCUMENTOS DESCOBERTA** (inspeção só-leitura no cliente-exemplo
  autorizado pela Débora: **ENEL Distribuição SP**, CNPJ 61.695.227/0001-93) + confirmado pela Débora:
  - **A OS é o Negócio (Deal)**, no funil **[44259] 🟦 [PJ] VENDAS**. O **status** é a **etapa (Stage)** do
    negócio, ajustada à mão (ex.: *"Doc. Env: OS Finalizada"* = concluída, *"❌ Cancelado"*).
  - **Campos operacionais no Negócio (por FieldKey):**
    - Número da OS = `deal_7EAFD2A7-7804-4B61-B717-1D895F1B4AF9` (cada OS tem nº próprio; 1 negócio pode
      ter vários — ex.: "000019774, 000019778").
    - Peso = `deal_6CDA6722-B287-42B9-97DA-A7987A963CBE` (ex.: "141,2 KG").
    - Data de Coleta = `deal_C8D28B9E-0F76-492B-B03D-6935CA2C39C8`.
    - Região = `deal_85AE1C16-E06F-4638-8D77-6DD40A576786`; Endereço = `deal_F4BF490C-707A-434A-BB3A-E187CBFD8638`.
  - **Documentos:** ligados ao negócio via entidade **Orders** (o "documento de venda", com template HTML —
    é o que o Ploomes **emite**: Carta de Doação etc.). **MTR e NF são ANEXADOS**; os demais o Ploomes emite.
    Tudo no banco do Ploomes, por cliente — qualquer funcionário acessa e encaminha.
  - **→ Destrava:** a **lista de OS real no painel** (nº, peso, data de coleta, status pela etapa) e a
    **área de documentos**.
  - ⚠️ **A confirmar com o Marcio/Débora:** se TODOS os clientes seguem esse padrão (a ENEL usa o funil de
    VENDAS pra OS) ou se varia; e qual etapa = "em andamento" vs "concluída" vs "cancelada".
- **2026-07-22** — **Respostas da Débora + lista de OS construída e verificada.** Todos os clientes seguem
  o padrão, em **4 funis por tipo** (LEADS, PJ VENDAS, SAC/RECEPTIVO, PESSOA FÍSICA), etapas parecidas.
  Mapeamento (agnóstico ao funil, `os-utils.js`): *Concluída* = "OS finalizada"/"certificado liberado";
  *Em atendimento* = de "ordem de serviço" até "pesagem" (**decisão do Marcio: "coleta finalizada" = Em
  atendimento**); *Cancelada*; negociação não aparece. **Lista de OS real no painel — construída e
  verificada com dados reais da ENEL** (nº, peso, data de coleta, status). Login de teste = cadastro do
  Marcio (contrato ativo = sim).
- **2026-07-22** — **Inspeção de anexos/documentos/webhook** (via `$metadata`, 492 entidades) — destrava
  os próximos recursos:
  - **Documentos emitidos** (CDF/Carta de Doação): `Orders`/`Documents` têm **`DocumentUrl`** (link do PDF),
    `Key`, `Shared`, endpoint **`/Share`** e o HTML (`BodySourceCode`) → download viável.
  - **Anexos (MTR/NF):** sistema **`Attachments`/`AttachmentsItems`/`AttachmentsFolders`** (`Base64`,
    `GetById`). Falta só sondar o vínculo exato anexo↔negócio (via AttachmentsItems).
  - **Upload de fotos (Abrir OS):** `Deals/{key}/UploadFile` (também Orders/Contacts). **Formato
    confirmado por sonda em 2026-07-22:** multipart, campo **`file`** → HTTP 200 (criação e exclusão de
    negócio de teste também OK; nada ficou no Ploomes).
  - **E-mail branded na mudança de status:** o Ploomes TEM **`Webhooks` + `Automations`** → o "jeito bonito"
    (portal avisado na mudança de etapa → e-mail com a cara da Ecobraz) **é viável**. ✅
  - **QR de validação no CDF (ideia do Marcio, anti-fraude) — adotada:** documentos têm `Key`/`/Share`; o QR
    aponta pra uma **página de validação nossa** que confere contra o registro real. `DocumentTemplates` é
    configurável (pode embutir o QR).
  - **Abrir OS (form pedido pelo Marcio):** Razão Social, CNPJ, **Endereço de coleta (editável — muda por
    coleta)**, telefone, e-mail, responsável, **lista/fotos dos equipamentos**; pré-preenche do Ploomes,
    cliente confirma/atualiza → cria a OS. Ploomes gera a OS + documento inicial (imediato); CDF vem depois.
- **2026-07-22** — **Documento da OS no download + OS/NF mapeados.** Confirmado com a Débora: **CDF/laudo
  liberam na etapa "Certificado Liberado"** (valida a trava). **Documento da OS** agora entra no download
  (entidade `Orders`; `DocumentUrl` verificado = PDF 60 KB), classificado **pelo nome do modelo** (só "OS";
  **proposta/orçamento nunca vaza**, mesmo com "serviço" no nome — reforçado). Download unificado por
  `fonte` (document|order), mesma trava de dono + liberação. **NF (anexos):** localizada (`NF_000019709.pdf`
  entre 12 anexos — os outros são fotos WhatsApp + Termo, **internos → escondidos**); **falta só o caminho
  de download do anexo** (a verificar) pra incluir a NF. Próximo: NF; e-mail nas 3 mudanças; QR no CDF.
- **2026-07-22** — **Regras de documento da Débora (segurança no download):** cliente pode ver **OS, NF,
  MTR, Carta de Descarte, CDF, laudo**; **CDF e laudo só quando liberados**; **nunca** contrato/imagens de
  controle interno. Sonda dos tipos (400 docs): a entidade `Documents` traz **MTR, Carta de Descarte,
  CDF/Certificado**; o flag **`Shared` do Ploomes NÃO é usado (0 de 400)** — então "liberado" é detectado
  pela **etapa "Certificado Liberado"** (a **confirmar com a Débora**). Implementado `classificaDoc` +
  trava por etapa **na lista E no download direto**; tipo desconhecido = escondido (padrão seguro). **Achado
  do processo (Débora):** o **número da OS é automático (sequencial)**, mas o **documento da OS é gerado
  MANUALMENTE** (cadastro → status "Ordem de Serviço" → "vendas" → preenche endereço/responsável/material →
  salvar); os demais documentos idem, conforme a coleta anda. → o Portal **alimenta** esse passo (não
  substitui a validação humana). **Pendente:** incluir no download a **OS (entidade `Orders`)** e a **NF
  (anexos)**; confirmar a etapa de liberação; mapear responsável/material nos campos do "vendas".
- **2026-07-22** — **3 pedidos do Marcio no teste ao vivo:** (1) **Baixar documentos** — descoberto e
  **verificado** como os documentos ligam à OS (`Documents?$filter=DealId`) e como baixar (o `DocumentUrl`
  devolve o PDF, 140 KB). Implementado: `/api/os/docs` (lista) e `/api/os/doc` (download **proxy pelo
  Worker**, URL de storage nunca exposta), ambos **só para OS do próprio cliente** (confere ContactId).
  Painel: botão "📄 Documentos" por OS. (2) **CEP** — novo `/api/cep` (BrasilAPI) autopreenche
  rua/bairro/cidade/UF; seção "Local da coleta" reorganizada (CEP, número, rua, bairro, cidade/UF,
  complemento) — reduz erro de digitação. **Confirmado ao vivo pelo Marcio.** (3) **Documentos preenchidos corretos** — achado o **campo real
  do endereço de coleta** (`deal_F4BF490C-...`) e o Portal agora **grava nele** (não só na nota) — gravação
  **verificada por sonda** (gravou e leu de volta idêntico). **Pendente:** anexos NF/MTR (sistema
  `Attachments`, 12 itens por OS — download é um passo a mais) e confirmar com a Débora como o Nº/documentos
  são gerados hoje.
- **2026-07-22** — **Abrir OS vira OS de verdade (não mais lead):** o teste do Marcio mostrou que a
  solicitação caía na 1ª etapa ("Em contato") = um lead, sem virar OS. **Corrigido:** a solicitação agora
  é criada já no funil **[PJ] VENDAS (44259)**, etapa **"📄 Ordem de Serviço" (StageId 199543)** — IDs e o
  comportamento **verificados por sonda** (criou negócio de teste → caiu na etapa certa → apagado; nada
  ficou). Cliente vê "Em atendimento" na hora; Débora recebe na coluna de OS. **Achado honesto:** o **Nº da
  OS e os documentos NÃO saem ao entrar na etapa** — das 49 OS reais nessa etapa, **0 têm número**; o número
  aparece mais à frente (pesagem/finalização). **Pendente com a Débora:** como o Nº/documentos são gerados
  hoje (automação do Ploomes ou clique?), pra decidir se dá pra sair automático já na solicitação.
- **2026-07-22** — **Abrir OS elaborado (fotos):** formulário reorganizado em seções (empresa, local da
  coleta, equipamentos, fotos), pré-preenchido do cadastro; anexo de fotos com arrastar-e-soltar, redução
  no navegador e miniaturas; o Worker envia as fotos ao negócio no Ploomes (`Deals/{id}/UploadFile`, campo
  `file`). **Publicado no endereço de teste** (workers.dev). **Falta o teste ao vivo do Marcio** (criar uma
  solicitação de verdade e conferir a foto anexada no Ploomes) — ainda NÃO verificado ponta a ponta com ele.
