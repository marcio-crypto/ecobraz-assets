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
   - **Pergunta em aberto:** o *Adote um Bairro* é hoje um **projeto de carbono
     quantificado e verificado**, ou um programa de impacto **social/urbano**? Disso
     depende tudo. (A confirmar com o Marcio.)
   - **Dois caminhos honestos:**
     - **A) Transformar o *Adote um Bairro* em projeto de carbono certificável** —
       metodologia + MRV + verificação de terceiro. Aí as cotas viram compensação real
       e o certificado de neutralização é legítimo e audit-grade. (Mais trabalho, maior valor.)
     - **B) Separar as duas coisas com honestidade** — (1) *reduções* comprovadas pela
       destinação correta (calculadas por norma) e (2) *compensação* feita com **créditos
       certificados**; e oferecer o *Adote um Bairro* como **patrocínio de impacto social**
       adicional, sem vendê-lo como toneladas de CO₂ enquanto não houver verificação.
       (Mais rápido e seguro.)
3. **Validação por especialista.** Todo o conteúdo legal e de normas precisa ser
   **validado por um advogado ambiental (BR), um especialista de conformidade (UE) e
   um especialista em asseguração de carbono/ESG** antes do uso comercial. O software
   organiza e entrega; não substitui o parecer técnico.

## 6. O que depende do Marcio / Ecobraz (decisões em aberto)

- [ ] Rodar o **diagnóstico do Ploomes** (guardar a chave no GitHub — ver README).
- [ ] Definição de **"cliente ativo"** (qual estado no Ploomes).
- [ ] Como o cliente **faz login** (recomendação atual: link mágico por e-mail — sem senha).
- [ ] **Metodologia de CO₂** que a Ecobraz vai assumir (fatores de emissão / fonte).
- [ ] Situação do **Adote um Bairro** (projeto de carbono verificado vs. programa social).
- [ ] Onde o Portal vai morar (ex.: `portal.ecobraz.org`) e a identidade visual.

## 7. Estado atual (honesto)

**Feito e verificado:**
- Base técnica que já existe e funciona: site ↔ Ploomes seguro (Worker `ecobraz-coletas`),
  deploy automático. A API do Ploomes é OData v4 com chave — confirmado.
- Diagnóstico do Ploomes (somente leitura) **escrito e no repositório**.

**Ainda não feito / não testado:**
- O diagnóstico **ainda não foi executado** (depende do segredo no GitHub).
- Nenhuma linha do Portal em si foi escrita (login, painel, chamados) — de propósito,
  para não construir sobre suposições.
- A base de **conformidade legal (BR+UE) e de normas de auditoria** está **em pesquisa**
  (será um documento próprio, com fontes, e marcado como "pendente de validação").

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
