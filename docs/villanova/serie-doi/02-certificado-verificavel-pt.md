# Especificação Mínima para Certificados de Destinação Ambiental Verificáveis

### Identificadores persistentes, resolução, revogação — e os limites do que a verificação prova

**Autor:** Marcio Villanova — ORCID [0009-0001-8072-6287](https://orcid.org/0009-0001-8072-6287)
**Afiliação:** Villanova ESG
**Versão:** 1.0 · **Tipo:** Relatório técnico (controlado pelo autor; sem revisão por pares)
**Licença:** CC BY 4.0
**Referência web:** https://villanovaesg.com

> **Situação deste documento.** Relatório técnico versão 1.0. O depósito no Zenodo e a atribuição de DOI tornam a obra identificável e recuperável; **não** constituem revisão por pares, aprovação regulatória nem endosso institucional. Este relatório serve de metodologia e referência — **não** substitui parecer jurídico, técnico ou de asseguração para um caso concreto. A especificação abaixo é um mínimo **proposto pelo autor**, não uma norma emitida por organismo normalizador, e conformidade a ela não é certificação de conformidade legal. Instrumentos legais e de proteção de dados são citados como orientação e **devem ser verificados** nas fontes oficiais vigentes antes de qualquer decisão operacional.

> **Declaração de interesse.** O autor é CEO da Ecobraz, empresa brasileira que emite documentação de destinação de ativos eletroeletrônicos pós-uso, e fundador da Villanova ESG. O autor tem, portanto, interesse comercial em sistemas do tipo aqui especificado. A especificação é deliberadamente neutra em relação a fornecedores e implementável por qualquer emissor, inclusive concorrentes; nenhum produto é nomeado ou endossado, e não se afirma que qualquer implementação específica esteja em conformidade com ela.

---

## Resumo

Certificados de destinação ambiental são amplamente emitidos e pouco verificáveis. Quem recebe costuma ter em mãos um PDF cuja autenticidade se apoia na aparência: um logotipo, uma imagem de assinatura, um número num formato que ninguém fora do emissor consegue conferir. Acrescentar um QR code a esse documento, por si só, não muda o quadro — porque a propriedade que importa não é a presença do código, e sim o que a resolução dele devolve, quem controla essa resolução e se a resposta continua disponível e verdadeira ao longo da vida útil do documento. Este relatório especifica um conjunto **mínimo de dez requisitos** para um certificado de destinação verificável — identificador persistente, comportamento de resolução, identidade do emissor, vínculo de integridade, revogação e substituição, validade temporal, minimização de dados, comportamento offline e em falha, equivalência do artefato impresso e declaração de alcance —, somado a uma **lista de conformidade** e a uma declaração explícita dos **limites da verificação**. A tese central é que a verificação pode estabelecer que um certificado é autêntico, inalterado e vigente; ela **não** pode estabelecer que a destinação física ocorreu como descrita. Confundir as duas coisas é o principal modo de falha que a especificação foi desenhada para evitar.

**Palavras-chave:** certificado verificável; certificado de destinação final; identificador persistente; verificação por QR; integridade documental; revogação; cadeia de custódia; documentação nível auditoria; antifraude; eletroeletrônicos.

---

## 1. O problema

Um cliente corporativo recebe um certificado dizendo que determinada quantidade de material eletroeletrônico pós-uso chegou a um destino licenciado. O cliente arquiva. Dois anos depois, um auditor, a equipe de *due diligence* de um comprador ou um regulador pergunta se aquele documento é genuíno.

É nesse momento que se descobre o que o documento consegue e o que não consegue fazer. Tipicamente ele pode ser fotocopiado, redigitado, alterado num editor de PDF sem deixar rastro visível, ou produzido do zero por qualquer pessoa que tenha o leiaute. O número dele não significa nada fora dos registros do próprio emissor — e perguntar ao emissor não é verificação: é uma segunda garantia da mesma parte interessada, entregue por e-mail, sem melhor situação que a primeira.

A direção da prática europeia de cadeia de suprimentos, como registrado em trabalhos anteriores desta série, é que compradores agem sobre documentação que consigam **ler, confiar e defender perante os próprios auditores**. Um documento por quem só o emissor responde não atende a essa condição. Este relatório especifica o mínimo que muda isso.

Cabe dizer desde já o que isto **não** substitui. No Brasil, manifestos e certificados de destinação são regidos por sistemas públicos — o arranjo MTR/SINIR sob a Política Nacional de Resíduos Sólidos e sistemas estaduais como o SIGOR/CETESB — e o registro juridicamente operante é o que está lá, emitido por destinador licenciado, com assinatura do responsável técnico. ⚠️ **Verificar** os instrumentos vigentes, o sistema competente e as regras estaduais aplicáveis. Tudo o que se especifica abaixo é uma **camada suplementar de verificabilidade** sobre documentação que precisa, de forma independente, refletir a cadeia real e o sistema oficial correto.

## 2. Escopo e método

Os requisitos foram derivados de trás para frente: de um modelo de ameaças (Seção 3) até as propriedades mínimas que derrotam cada ameaça, aplicando ao caso específico da destinação ambiental o desenho geral de sistemas de credencial verificável e de identificador persistente — em que um identificador resolve, por um serviço controlado, para uma declaração autoritativa sobre o objeto referenciado.

Esta é uma **especificação de projeto**, não um estudo empírico. Não apresenta estatística e não avalia nenhum produto existente. Os níveis de exigência usam a leitura convencional: **DEVE** para requisitos sem os quais o certificado não é verificável no sentido aqui usado; **RECOMENDA-SE** para requisitos que um emissor conforme atende, salvo razão declarada em contrário.

## 3. Modelo de ameaças

A especificação trata de seis ameaças. Um mecanismo de verificação que não declara seu modelo de ameaças não pode ser avaliado.

| # | Ameaça | O que o atacante faz |
|---|---|---|
| **A1** | **Fabricação** | Produz um certificado que nunca foi emitido, copiando o leiaute |
| **A2** | **Alteração** | Pega um certificado genuíno e muda pesos, datas, destino ou cliente |
| **A3** | **Reaproveitamento** | Cola um identificador ou código válido de um certificado genuíno em outro documento |
| **A4** | **Revisão silenciosa** | O emissor altera um certificado já entregue, e a cópia do titular e o registro autoritativo divergem sem aviso |
| **A5** | **Link podre** | O serviço de verificação muda de lugar ou desaparece; o certificado fica inverificável justamente quando enfim é examinado |
| **A6** | **Leitura excessiva** | O resultado da verificação é genuíno, e quem recebe lê nele uma alegação que ele nunca fez — tipicamente, que a destinação física está confirmada |

A6 não é ataque técnico e é a mais consequente, porque é cometida de boa-fé por quem confia no documento. O requisito R10 existe por causa dela.

## 4. A especificação

**R1 — Identificador persistente (DEVE).**
Cada certificado carrega um identificador único, opaco (não pode codificar identidade do cliente, posição em sequência ou volume), permanente e nunca reutilizado — inclusive após cancelamento. O identificador, não o arquivo, é a identidade do certificado.

**R2 — Resolução (DEVE).**
O identificador resolve, por uma interface pública controlada pelo emissor, para uma declaração sobre aquele certificado. A resolução precisa ser possível sem conta, sem falar com funcionário do emissor e sem software além de um navegador comum. Um QR code, quando existir, é uma codificação do identificador e **não é**, ele próprio, o mecanismo de verificação.

**R3 — Conteúdo definido da resposta (DEVE).**
A resolução devolve, no mínimo: situação atual (válido / revogado / substituído / desconhecido); data de emissão; identidade do emissor; e um valor de integridade do documento (R4). Devolve os campos substantivos — massas, datas, destino, cliente — **somente** sob a regra de divulgação do R7.

**R4 — Vínculo de integridade (DEVE).**
A resposta permite ao titular determinar se o arquivo em mãos é o arquivo que foi emitido, seja publicando um resumo criptográfico (*hash*) do documento emitido, seja renderizando no serviço a versão autoritativa para comparação. Sem o R4, A2 e A3 sobrevivem a R1–R3: um identificador inalterado sobre um documento alterado continua resolvendo para "válido".

**R5 — Identidade do emissor (DEVE).**
A resposta identifica a pessoa jurídica emissora e declara a licença ou autorização sob a qual a destinação atestada foi realizada, com uma referência que o destinatário possa conferir no sistema público competente. Um emissor que não consegue apontar para fora de si mesmo produziu autogarantia com passos adicionais.

**R6 — Revogação e substituição (DEVE).**
Certificados podem ser revogados ou substituídos, e a resposta declara qual dos dois, com a data e uma categoria de motivo não identificante, e aponta para o certificado substituto quando houver. Versões anteriores continuam resolvíveis e são marcadas como substituídas. Nada é apagado; correção é registro novo que referencia o antigo — a mesma regra de não sobrescrita que a arquitetura de evidência aplica aos eventos de captura (DOI 10.5281/zenodo.XXXXXXX, §3).

**R7 — Minimização de dados nas respostas públicas (DEVE).**
Um identificador é, por construção, compartilhável. Uma resposta pública que divulgue identidade do cliente, endereços de sítio, volumes ou condições comerciais cria uma exposição com a qual o cliente não concordou. Logo, respostas públicas divulgam situação e integridade; conteúdo substantivo é divulgado ou apenas a quem já possui o documento (por exemplo, exigindo um valor tirado do próprio documento), ou por canal com controle de acesso. ⚠️ As regras de proteção de dados aplicáveis (LGPD no Brasil; GDPR quando houver dado pessoal da UE) **devem ser verificadas** para a implantação específica.

**R8 — Comportamento offline e em falha (RECOMENDA-SE).**
O certificado permanece um documento legível sem o serviço, e a especificação declara o que significa um serviço inacessível: *não verificado*, nunca *inválido*. Quem recebe não pode ser induzido a tratar uma indisponibilidade como resultado negativo. Disponibilidade de longo prazo é compromisso do emissor, e o prazo de retenção deve constar no próprio certificado.

**R9 — Equivalência do impresso (RECOMENDA-SE).**
O artefato impresso carrega o identificador em forma legível por humano, além de qualquer codificação legível por máquina, para que a verificação sobreviva a uma fotocópia, a um fax e a um scanner que torne o QR ilegível.

**R10 — Declaração de alcance (DEVE).**
O certificado e a resposta de verificação declaram, em linguagem simples, o que a verificação estabelece e o que não estabelece (Seção 5). É o requisito que trata da ameaça A6, e é aquele que o emissor tem mais tentação de omitir, porque limita a força da alegação que está sendo vendida.

## 5. O que a verificação prova — e o que não prova

**A verificação, quando R1–R7 valem, estabelece que:**

- um certificado com este identificador foi emitido por este emissor;
- o documento em mãos corresponde ao documento que foi emitido;
- o certificado está atualmente válido, revogado ou substituído, na data da consulta.

**A verificação não estabelece que:**

- o material chegou fisicamente ao destino declarado, ou foi processado como descrito — isso se apoia na evidência operacional subjacente e no sistema oficial de manifesto, não na verificabilidade do certificado;
- os registros internos do emissor são exatos, ou que suas licenças estão vigentes no momento da leitura;
- qualquer resultado ambiental ou de carbono ocorreu;
- o certificado satisfaz alguma obrigação legal específica de quem o recebe.

Estas quatro negativas são a substância da especificação, não uma ressalva anexada a ela. Um certificado verificável eleva o custo da falsificação de quase zero para substancial, e torna detectável a alteração silenciosa. **Ele não transforma um documento em auditoria, e não transfere ao emissor o dever de conformidade de quem o recebe.**

## 6. Lista de conformidade

É o artefato citável deste relatório. Um emissor — ou um cliente avaliando um emissor — marca cada requisito como atendido / parcialmente atendido / não atendido. **A conformidade é reivindicada como um todo: uma implementação que atende R1–R3 mas não R4 não é conforme**, porque produz um resultado de verificação confiantemente errado sob A2 e A3.

| Req. | Requisito | Nível | Atende? |
|---|---|---|---|
| R1 | Identificador único, opaco, permanente, nunca reutilizado | DEVE | ☐ |
| R2 | Resolução pública, sem conta, em navegador comum | DEVE | ☐ |
| R3 | Conteúdo mínimo definido da resposta | DEVE | ☐ |
| R4 | Vínculo de integridade entre identificador e documento | DEVE | ☐ |
| R5 | Identidade do emissor e referência de licença conferível fora dele | DEVE | ☐ |
| R6 | Revogação e substituição; versões anteriores retidas | DEVE | ☐ |
| R7 | Minimização de dados nas respostas públicas | DEVE | ☐ |
| R8 | Legibilidade offline; indisponibilidade significa *não verificado* | RECOMENDA-SE | ☐ |
| R9 | Identificador legível por humano no artefato impresso | RECOMENDA-SE | ☐ |
| R10 | Declaração explícita do que a verificação prova e não prova | DEVE | ☐ |

**Duas perguntas que resolvem a maior parte das avaliações rapidamente.** *(1)* Se alguém editar o peso no PDF, a verificação continua devolvendo "válido"? Se sim, falta o R4. *(2)* Se o emissor deixar de operar, o que fica com quem recebeu? Se a resposta for "um documento inverificável", o R8 não foi tratado.

## 7. Relação com o modelo de maturidade

Em termos do SEMM (DOI 10.5281/zenodo.21445455), um certificado conforme é um artefato de Nível 3 na categoria *destinação ambiental*: mantido proativamente, legível pelo comprador e defensável sem acesso aos sistemas internos do emissor. Ele **não** eleva, sozinho, uma relação de fornecimento ao Nível 3 no conjunto, já que o nível do modelo é dado pela categoria aplicável mais baixa. Um certificado verificável sobre uma operação não reconciliada é um envelope bem lacrado em torno de uma quantidade desconhecida.

## 8. Limitações

Esta é uma especificação proposta pelo autor, versão 1.0, não é norma, não tem revisão por pares e não foi validada empiricamente contra implementações. Não é prova de segurança; o modelo de ameaças é enumerado e não formal, e gestão de chaves, disponibilidade de serviço e governança do emissor — que determinam se R1–R10 valem na prática — estão fora do seu escopo. Ela trata da verificabilidade de um documento e nada diz sobre a verdade da operação que o documento descreve. As referências legais e de proteção de dados são orientação e ⚠️ devem ser verificadas. Nada aqui constitui parecer jurídico, técnico ou de asseguração.

## 9. Como citar

> Villanova, M. (2026). *Especificação Mínima para Certificados de Destinação Ambiental Verificáveis: identificadores persistentes, resolução, revogação — e os limites do que a verificação prova* (Versão 1.0) [Relatório técnico]. Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX

*(DOI a inserir após o depósito.)*

## Referências

1. Villanova, M. (2026). *Arquitetura de Evidência para Ativos Eletroeletrônicos Pós-Uso.* Zenodo. https://doi.org/10.5281/zenodo.XXXXXXX ⚠️ Inserir o DOI após o depósito do registro companheiro.
2. Villanova, M. (2026). *Evidência de Destinação Ambiental: Alcance e Limites de Documentos, Registros e Certificados Isolados.* Zenodo. https://doi.org/10.5281/zenodo.21398814
3. Villanova, M. (2026). *Cadeia de Custódia de Resíduos Eletroeletrônicos.* Zenodo. https://doi.org/10.5281/zenodo.21398390
4. Villanova, M. (2026). *The Supplier Evidence Maturity Model (SEMM).* Zenodo. https://doi.org/10.5281/zenodo.21445455
5. Brasil. Lei 12.305/2010 — Política Nacional de Resíduos Sólidos; sistema MTR/SINIR; sistemas estaduais (ex.: SIGOR/CETESB). ⚠️ Verificar texto vigente e regras estaduais.
6. Brasil. Lei 13.709/2018 (LGPD); Regulamento (UE) 2016/679 (GDPR), quando houver dado pessoal da UE. ⚠️ Verificar aplicabilidade à implantação específica.
