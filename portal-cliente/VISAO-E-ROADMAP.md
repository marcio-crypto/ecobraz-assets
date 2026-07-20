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
- [ ] **Metodologia de CO₂** que a Ecobraz vai assumir (fatores de emissão / fonte).
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

**Ainda não feito / não testado:**
- ⚠️ **Segredos do Worker na Cloudflare** — `wrangler secret list` veio **vazio**; sem eles o login
  não envia e-mail. **É o próximo passo para o teste real funcionar.**
- **Teste ponta a ponta** (e-mail chegando → link → painel) ainda **não feito** — depende dos segredos.
- **Mapeamento de "OS"** no painel é provisório (lê Negócios da empresa); precisa ser validado com
  dados reais e, depois, apontar para o funil certo de OS (`PORTAL_OS_PIPELINE_ID`).
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
