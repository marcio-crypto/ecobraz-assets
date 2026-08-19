# Arquitetura de Evidência para Ativos Eletroeletrônicos Pós-Uso

### Um modelo de eventos de captura ligando as etapas operacionais à documentação legível pelo comprador

**Autor:** Marcio Villanova — ORCID [0009-0001-8072-6287](https://orcid.org/0009-0001-8072-6287)
**Afiliação:** Villanova ESG
**Versão:** 1.0 · **Tipo:** Relatório técnico (controlado pelo autor; sem revisão por pares)
**Licença:** CC BY 4.0
**Referência web:** https://villanovaesg.com

> **Situação deste documento.** Relatório técnico versão 1.0. O depósito no Zenodo e a atribuição de DOI tornam a obra identificável e recuperável; **não** constituem revisão por pares, aprovação regulatória nem endosso institucional. Este relatório serve de metodologia e referência — **não** substitui parecer jurídico, aduaneiro, técnico ou de asseguração para um caso concreto. "Nível auditoria" descreve um conceito de evidência, não uma opinião de auditoria. Os instrumentos normativos citados servem de orientação e **devem ser verificados nas fontes oficiais vigentes** (Planalto, EUR-Lex e as autoridades competentes) antes de qualquer decisão operacional.

> **Declaração de interesse.** O autor é CEO da Ecobraz, empresa brasileira que opera coleta e destinação de ativos eletroeletrônicos pós-uso, e fundador da Villanova ESG. O autor tem, portanto, interesse comercial em sistemas do tipo aqui descrito. O modelo apresentado é deliberadamente neutro em relação a fornecedores e implementável por qualquer operador, inclusive concorrentes; nenhum produto é nomeado, especificado ou endossado, e não se afirma que qualquer implementação específica esteja em conformidade com ele.

---

## Resumo

Uma falha recorrente na gestão de ativos eletroeletrônicos pós-uso não é a ausência de boa prática operacional, mas a ausência de uma **estrutura de registro** que leve essa prática adiante, até virar documentação que um comprador ou auditor consiga ler. A operação captura dados — fotografias, pesos, manifestos, notas fiscais, certificados — e ainda assim o arquivo resultante frequentemente não responde à pergunta que o comprador realmente faz: *qual lote entregue é este, para onde ele foi, e o que liga uma coisa à outra?* Este relatório especifica uma **arquitetura de evidência**: um modelo de **eventos de captura** discretos ao longo da cadeia, do pedido de coleta à destinação final, cada um definido por seus campos mínimos, pelo ator que o produz, pela alegação que ele sustenta e — explicitamente — pela alegação que ele **não** sustenta. O artefato citável é a **tabela de eventos de captura**, somada a três **regras de ligação** que identificam onde as cadeias de evidência se rompem na prática (identidade do lote na passagem de mão, junção documento↔evento e reconciliação de massa). A arquitetura é agnóstica a instrumento normativo e está mapeada às categorias de evidência e aos níveis de maturidade do Supplier Evidence Maturity Model (SEMM). É uma especificação de projeto sobre o que um sistema precisa registrar; não é método de auditoria nem avaliação de qualquer operador.

**Palavras-chave:** arquitetura de evidência; cadeia de custódia; rastreabilidade de eletroeletrônicos; evento de captura; documentação nível auditoria; balanço de massa; evidência de fornecedor; certificado de destinação; Brasil.

---

## 1. Introdução e o que este registro acrescenta

Dois registros anteriores desta série estabeleceram o terreno conceitual. *Cadeia de Custódia de Resíduos Eletroeletrônicos* (DOI 10.5281/zenodo.21398390) sustentou que a evidência de custódia precisa ser contínua para significar alguma coisa, e *Da Coleta à Destinação: O que Cada Etapa Pode Sustentar — e o que Não Sustenta* (DOI 10.5281/zenodo.21398750) percorreu, etapa a etapa, quais alegações cada estágio operacional suporta e quais não suporta. *Evidência de Destinação Ambiental* (DOI 10.5281/zenodo.21398814) mostrou os limites de documentos e certificados isolados.

Esses registros respondem **o que** precisa valer. Este responde **como um sistema precisa registrar**. A contribuição é mais estreita e mais mecânica: um **modelo de eventos de captura** — a estrutura do registro em si, os campos que ele precisa conter para permanecer "juntável", e as junções que falham na prática. A distinção importa porque a maior parte da perda de evidência observada em operação não é uma etapa ausente; é uma etapa que aconteceu e foi registrada de uma forma que não se liga às etapas anterior e seguinte.

O modelo é escrito para dois leitores: o operador que projeta ou compra um sistema, e o cliente corporativo ou comprador europeu que precisa dizer, num pedido de informação, o que de fato precisa receber.

## 2. Escopo e método

O modelo resultou da síntese estruturada de (a) as etapas operacionais comuns aos fluxos de ativos eletroeletrônicos pós-uso no Brasil; (b) as categorias de documentação a que os pedidos europeus de cadeia de suprimentos recorrem, na organização do SEMM (DOI 10.5281/zenodo.21445455); e (c) os modos de falha que surgem quando um registro existe mas não pode ser ligado, datado ou atribuído.

É uma contribuição **conceitual e de projeto**. Não apresenta estatística primária, não reporta amostra de operadores e não afirma com que frequência qualquer modo de falha ocorre. Onde um instrumento brasileiro é citado — a Política Nacional de Resíduos Sólidos (Lei 12.305/2010), o sistema de manifesto MTR/SINIR, sistemas estaduais como o SIGOR/CETESB, licenças de operação e CADRI — ele é citado como **orientação sobre onde uma obrigação pode estar**, e ⚠️ **deve ser verificado** no texto oficial vigente e nas regras do estado específico envolvido, que diferem entre si.

## 3. A unidade do modelo: o evento de captura

Um **registro de evidência** não é um documento. É um conjunto de **eventos de captura**, cada um deles uma afirmação feita por um ator identificado, num momento identificado, sobre um objeto identificado.

Um evento de captura é bem formado quando carrega sete atributos:

| Atributo | O que ele fixa | Por que é exigido |
|---|---|---|
| **Tipo do evento** | O que aconteceu (coleta, pesagem, passagem de mão, tratamento, destinação) | Sem tipo, registros não podem ser ordenados nem comparados |
| **Identidade do objeto** | Qual lote, carga ou ativo é o assunto da afirmação | É a chave de junção de tudo que vem depois |
| **Ator** | Quem afirma (pessoa, função, organização) | Atribuição; registro sem autor não é defensável |
| **Carimbo de tempo** | Quando a afirmação foi feita | Ordenação e detecção de criação retroativa |
| **Local** | Onde ocorreu | Separa alegação de sítio específico de alegação genérica |
| **Atributos medidos** | Os valores capturados (peso, contagem, classe de material, condição) | A substância da alegação |
| **Artefatos vinculados** | Documentos, imagens ou registros anexados naquele momento | O que converte afirmação em evidência |

Duas regras de projeto decorrem diretamente:

- **Capturar no momento, não depois.** Um peso digitado no dia seguinte é uma *declaração sobre* uma pesagem; um peso registrado na balança é a pesagem. Os dois podem ser verdadeiros; só um é evidência de si mesmo.
- **Nunca sobrescrever um evento de captura.** Correções são eventos novos que referenciam o corrigido. Uma base de evidência que permite edição silenciosa não sustenta atribuição — a propriedade sobre a qual todo o resto se apoia. (É a mesma exigência que a categoria *governança e prestação de contas* do SEMM descreve.)

## 4. A tabela de eventos de captura

Os oito eventos abaixo são a espinha ordenada de um fluxo de ativos eletroeletrônicos pós-uso. Para cada um: os campos mínimos, a alegação que ele sustenta e — a coluna mais frequentemente ausente das descrições de fornecedores — a alegação que ele **não** sustenta.

| # | Evento | Campos mínimos | Sustenta a alegação | **Não** sustenta |
|---|---|---|---|---|
| **1** | **Pedido de coleta** | Identidade do cliente, sítio, escopo pedido, data, solicitante | Que o cliente iniciou um descarte controlado, numa data | Nada sobre o que foi efetivamente coletado |
| **2** | **Captura no sítio** | Id do lote, fotografias, classes de itens, contagens, peso indicativo, operador, carimbo de tempo, geolocalização | Que material específico saiu de um sítio específico, documentado no momento | Pesos finais; composição do material após triagem |
| **3** | **Passagem de mão para transporte** | Id do lote, identidade do transportador, veículo, hora de saída, assinatura de recebimento, referência do manifesto | Que a custódia foi transferida a uma parte identificada | Que a carga chegou inalterada |
| **4** | **Pesagem de entrada (doca)** | Id do lote, peso bruto/tara/líquido, identidade da balança, carimbo de tempo, operador | Uma massa de chegada autenticada na unidade receptora | A composição dessa massa |
| **5** | **Recebimento e triagem** | Id do lote, classes de material com pesos, não conformidades encontradas, operador | Em que a carga de fato consistia, por classe | Que cada classe foi depois tratada conforme registrado |
| **6** | **Tratamento / processamento** | Id do lote ou do batelada, processo aplicado, saídas por classe e peso, registros de sanitização de dados quando aplicável | Que um processo definido foi aplicado a material definido | Resultado ambiental; efeito de carbono |
| **7** | **Saída para destinação** | Id da batelada, identidade do destino **e sua referência de licença**, peso, referência do manifesto, data | Que material de massa declarada saiu para destino identificado e licenciado | Que o destino o processou como pretendido |
| **8** | **Confirmação de destinação e certificado** | Referência de baixa do manifesto, confirmação do destino, identificador do certificado, emissor, responsável técnico | Destinação documentada e encerrada para a massa declarada | Qualquer alegação de carbono, e qualquer alegação sobre material não coberto pelo manifesto baixado |

Duas observações decorrem da quarta coluna:

- **Nenhum evento isolado sustenta a alegação de cadeia completa.** A alegação de cadeia completa é uma propriedade emergente das *junções*, não de um registro qualquer. É por isso que um certificado apresentado sozinho é evidência fraca, como argumentado no DOI 10.5281/zenodo.21398814 — não por ser falso, mas por resumir uma cadeia que ele próprio não contém.
- **Carbono está ausente de todas as linhas.** Nenhum evento operacional de captura evidencia emissão evitada; essa alegação exige método declarado e fatores aplicados às massas registradas, e é um objeto documental separado, com regras próprias. Está deliberadamente fora do escopo aqui.

## 5. As três regras de ligação

Eventos bem formados são necessários e insuficientes. A evidência se perde nas junções. Três regras tratam das três junções que falham.

**Regra 1 — A identidade sobrevive à passagem de mão.** O identificador de lote atribuído na captura em sítio (evento 2) precisa persistir, inalterado, pela passagem de mão, pesagem e recebimento (eventos 3–5), e precisa ser rastreável até o identificador de batelada usado adiante (eventos 6–8). Quando a unidade consolida vários lotes numa batelada, a relação muitos-para-um precisa ser registrada explicitamente, com as massas contribuintes.
*Modo de falha:* o lote é renumerado na portaria segundo o esquema próprio da unidade receptora, e as fotografias do sítio e o peso da doca viram dois registros sem relação sobre o mesmo material.

**Regra 2 — Todo documento é anexado a um evento, nunca a um período.** Notas fiscais, manifestos, licenças, cartas de doação e certificados precisam referenciar o evento (ou eventos) que evidenciam. Um documento arquivado contra um cliente e um mês, em vez de contra um lote e um evento, não responde a uma pergunta no nível do lote.
*Modo de falha:* o arquivo contém todos os documentos corretos e mesmo assim não demonstra que *esta* entrega foi para *aquele* destino.

**Regra 3 — A massa é reconciliada, e o resíduo é declarado.** A massa de entrada (evento 4) precisa ser reconciliada contra a soma das massas de saída por destino (evento 7), mais estoque interno registrado e perdas registradas. Uma reconciliação que não fecha não é motivo para suprimir o número: **o resíduo, seu tamanho e sua explicação são, eles próprios, evidência** de operação controlada.
*Modo de falha:* percentuais de "material reciclado" reportados sem nenhum balanço de massa por trás — a condição descrita no DOI 10.5281/zenodo.21399040 como indicadores sem evidência.

A Regra 3 traz um corolário que vale dizer sem rodeio: **uma operação que não consegue fechar seu balanço de massa não consegue sustentar um percentual de destinação**, digam o que disserem os seus certificados.

## 6. Legibilidade pelo comprador: a camada de saída

Os eventos e as junções são internos. O que o comprador recebe é uma **visão derivada**, e a arquitetura precisa produzi-la sem virar projeto. Três visões cobrem a maior parte dos pedidos:

1. **Dossiê de lote** — uma entrega, os oito eventos em ordem, com documentos anexados e a reconciliação da sua batelada.
2. **Arquivo de período** — todos os lotes de um cliente num intervalo, com reconciliação agregada e declaração do que **não** está coberto (lotes descartados por outra via; manifestos em aberto na data de corte).
3. **Relatório de exceções** — as não conformidades registradas no evento 5, os manifestos não baixados e o resíduo não reconciliado. Publicar exceções é contraintuitivo comercialmente e é o indicador isolado mais forte de uma base de evidência controlada, porque demonstra que o sistema detecta as próprias lacunas.

A declaração de completude nas visões 2 e 3 não é ressalva: é elemento obrigatório. Um arquivo de período que sugere cobertura total cobrindo apenas os lotes que o operador manuseou deturpa a posição do cliente — risco que se transfere ao comprador que confiar nele.

## 7. Mapeamento para o SEMM

A arquitetura é a camada operacional sob três das sete categorias de evidência do SEMM (DOI 10.5281/zenodo.21445455, §5): *identidade e rastreabilidade*, *cadeia de custódia* e *destinação ambiental*. A relação com os níveis de maturidade é direta:

| Nível SEMM | Estado correspondente da arquitetura |
|---|---|
| **0 Opaco** | Os eventos ocorrem; poucos são capturados. As alegações se apoiam em confiança |
| **1 Documentado** | Eventos capturados, mas como documentos livres; a identidade não sobrevive à passagem de mão (Regra 1 falha) |
| **2 Estruturado** | Os oito eventos capturados com campos mínimos; documentos anexados a eventos (Regra 2 vale); reconciliação ainda não rotineira |
| **3 Pronto para o comprador** | Regras 1–3 valem; as três visões derivadas saem sob demanda, sem reprocessamento |
| **4 Assegurado continuamente** | Relatório de exceções é rotina interna; o resíduo é monitorado no tempo; correções são versionadas, nunca sobrescritas |

A implicação prática para um operador no Nível 1 é que o salto de nível mais barato disponível costuma ser a **Regra 2** — anexar documentos que já existem a eventos que já existem. Não exige captura nova de dado, apenas mudança na forma de arquivar o que já se tem.

## 8. Limitações

Esta é uma contribuição conceitual e de projeto, versão 1.0, sem revisão por pares e sem validação empírica contra uma amostra de operadores. Não apresenta estatística primária. Os oito eventos são uma espinha comum, não universal: fluxos com recondicionamento e revenda, movimentação transfronteiriça ou frações perigosas com licenciamento específico têm eventos não modelados aqui. O modelo trata da **comprovabilidade** das etapas operacionais, não do seu mérito ambiental, e não produz declaração alguma sobre carbono. As referências legais e ao sistema de manifesto são orientação, variam por estado e ⚠️ devem ser verificadas nas fontes oficiais vigentes. Nada aqui constitui parecer jurídico, técnico ou de asseguração, e conformidade a esta arquitetura não é — nem pode ser — certificação de conformidade legal.

## 9. Como citar

> Villanova, M. (2026). *Arquitetura de Evidência para Ativos Eletroeletrônicos Pós-Uso: um modelo de eventos de captura ligando as etapas operacionais à documentação legível pelo comprador* (Versão 1.0) [Relatório técnico]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

*(DOI a inserir após o depósito.)*

## Referências

Instrumentos normativos citados como orientação; verificar títulos, números e datas exatos na fonte oficial.

1. Villanova, M. (2026). *Cadeia de Custódia de Resíduos Eletroeletrônicos: Integridade, Continuidade e Rastreabilidade da Evidência.* Zenodo. https://doi.org/10.5281/zenodo.21398390
2. Villanova, M. (2026). *Da Coleta à Destinação: O que Cada Etapa Pode Sustentar — e o que Não Sustenta.* Zenodo. https://doi.org/10.5281/zenodo.21398750
3. Villanova, M. (2026). *Evidência de Destinação Ambiental: Alcance e Limites de Documentos, Registros e Certificados Isolados.* Zenodo. https://doi.org/10.5281/zenodo.21398814
4. Villanova, M. (2026). *Indicadores sem Evidência: Limites de Peso, Volume e Percentuais de Reciclagem na Prestação de Contas Corporativa.* Zenodo. https://doi.org/10.5281/zenodo.21399040
5. Villanova, M. (2026). *The Supplier Evidence Maturity Model (SEMM).* Zenodo. https://doi.org/10.5281/zenodo.21445455
6. Brasil. Lei 12.305/2010 — Política Nacional de Resíduos Sólidos; sistema de manifesto MTR/SINIR e sistemas estaduais (ex.: SIGOR/CETESB). ⚠️ Verificar texto vigente, sistema competente e regras estaduais específicas.
