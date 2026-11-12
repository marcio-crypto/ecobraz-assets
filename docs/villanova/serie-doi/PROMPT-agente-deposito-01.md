# Prompt para o agente publicar o registro #1 no Zenodo

**Data:** 2026-08-19 · Para o Marcio.

**Como usar:** abra o chat do agente **já logado na sua conta do Zenodo**
(faça o login você mesmo, na sua janela — nunca passe senha para o agente,
nem no chat). Depois copie tudo o que está entre as linhas `======` e cole.

**Este prompt cobre apenas o registro #1.** Os registros #2, #3 e #4 citam o DOI
do anterior no corpo do texto — enquanto o #1 não for publicado, eles ainda têm
`10.5281/zenodo.XXXXXXX` nas referências. Me mande o DOI do #1 e eu preparo o
prompt do #2 em minutos.

**Antes de colar, saiba de duas coisas:**

1. **DOI publicado no Zenodo é permanente.** Um registro publicado não pode ser
   apagado — só se publica uma versão nova por cima. Por isso o prompt manda o
   agente **parar antes de clicar em Publish** e te mostrar o formulário
   preenchido. Se você quiser que ele publique direto, sem parar, apague o
   **Passo 6**.
2. O prompt proíbe o agente de **inventar ou "melhorar"** qualquer campo. Se algo
   não bater com a tela do Zenodo, ele deve parar e te perguntar — não improvisar.

---

======

Você tem acesso ao navegador e eu já estou logado na minha conta do Zenodo nesta
sessão. Preciso que você deposite um relatório técnico sob a minha autoria.

REGRA MAIS IMPORTANTE: não invente, não resuma, não reescreva e não "melhore"
nenhum valor abaixo. Use exatamente o texto que eu dou. Se um campo não existir na
tela, ou se o Zenodo recusar um valor, PARE e me pergunte. Não improvise e não
prossiga com um valor diferente do que está aqui.

PASSO 1 — Baixe os dois arquivos PDF (são públicos, não precisam de login):

https://raw.githubusercontent.com/marcio-crypto/ecobraz-assets/refs/heads/claude/doi-ecobraz-villanoca-esg-fxl2cu/docs/villanova/serie-doi/01-evidence-architecture-EN.pdf

https://raw.githubusercontent.com/marcio-crypto/ecobraz-assets/refs/heads/claude/doi-ecobraz-villanoca-esg-fxl2cu/docs/villanova/serie-doi/01-arquitetura-evidencia-PT.pdf

O primeiro é a versão em inglês (6 páginas), o segundo é a mesma obra em português
(7 páginas). Os DOIS entram no MESMO depósito — não crie dois registros separados.
Confirme que cada arquivo abriu como PDF legível antes de continuar.

PASSO 2 — Vá em zenodo.org e comece um novo depósito (New upload). Suba os dois
PDFs no mesmo registro.

PASSO 3 — Preencha os campos exatamente assim:

Resource type: Publication → Technical report

Title:
Evidence Architecture for Post-Use Electronic Assets: A capture-event model linking operational steps to buyer-readable documentation

Authors: um único autor
  Nome: Villanova, Marcio
  ORCID: 0009-0001-8072-6287
  Affiliation: Villanova ESG

Description / Abstract (cole este texto, sem alterar):
A recurring failure in post-use electronic asset management is not the absence of good operational practice, but the absence of a record structure that carries that practice forward into documentation a buyer or auditor can read. Operations capture data — photographs, weights, manifests, invoices, certificates — yet the resulting file frequently cannot answer the buyer's actual question: which delivered lot is this, where did it go, and what connects the two? This report specifies an evidence architecture: a model of discrete capture events along the chain from collection request to final destination, each defined by its minimum fields, the actor who produces it, the claim it can support, and — explicitly — the claim it cannot support. The citable artifact is the capture-event table together with three linkage rules that identify where evidence chains break in practice (lot identity across hand-off, document-to-event join, and mass reconciliation). The architecture is instrument-agnostic and is mapped to the evidence categories and maturity levels of the Supplier Evidence Maturity Model (SEMM). It is a design specification for what a system must record, not an audit method and not an assessment of any operator.

License: Creative Commons Attribution 4.0 International (CC BY 4.0)
Access: Open access
Publication date: a data de hoje
Version: 1.0
Language: English
  (a versão em português está no mesmo registro, como segundo arquivo)

Keywords (uma por campo, se o Zenodo separar):
evidence architecture
chain of custody
e-waste traceability
capture event
audit-grade documentation
mass balance
supplier evidence
certificate of destination
Brazil

Related identifiers — adicione estes SEIS, com a relação indicada para cada um:

  https://villanovaesg.com                        → relação: is referenced by
  https://villanovaesg.com/publications           → relação: is referenced by
  https://doi.org/10.5281/zenodo.21445455         → relação: is supplemented by
  https://doi.org/10.5281/zenodo.21398390         → relação: cites
  https://doi.org/10.5281/zenodo.21398750         → relação: cites
  https://doi.org/10.5281/zenodo.21398814         → relação: cites
  https://doi.org/10.5281/zenodo.21399040         → relação: cites

(São sete linhas no total: duas URLs do site e cinco DOIs. Se o Zenodo pedir o
tipo do identificador, as URLs são "URL" e os DOIs são "DOI".)

PASSO 4 — NÃO preencha nada além do que está acima. Deixe em branco qualquer campo
que eu não listei (funder, grant, conference, journal, publisher, etc.). Se você
achar que algum outro campo deveria ser preenchido, me diga qual e por quê, mas
não preencha por conta própria.

PASSO 5 — Salve como rascunho (Save draft), sem publicar.

PASSO 6 — PARE AQUI. Me mostre, em texto, tudo o que você preencheu, campo por
campo, e me diga se o Zenodo recusou ou alterou alguma coisa. Espere eu responder
"pode publicar" antes de clicar em Publish. Não publique sem essa confirmação.

PASSO 7 — Depois que eu autorizar, clique em Publish e me devolva:
  - o DOI gerado (formato 10.5281/zenodo.XXXXXXXX)
  - o link público do registro
  - confirmação de que os DOIS PDFs aparecem no registro publicado

Se em qualquer ponto você não conseguir concluir — login expirado, campo diferente
do descrito, upload falhando — pare e me explique exatamente onde travou. Não tente
contornar e não invente um resultado.

======

---

## Depois que ele publicar

Me manda o DOI. Eu então:

1. Adiciono o registro na página `/publications` do site.
2. Troco o `10.5281/zenodo.XXXXXXX` no texto do **#2** (duas ocorrências: §4 R6 e a
   referência 1), regero os PDFs em EN e PT, e te mando o **prompt do #2** pronto.
3. Cito o registro nas páginas-pilar onde fizer sentido.
