# Série de DOI — registros 1 a 4: guia de depósito no Zenodo

**Data:** 2026-08-19 · Para o Marcio.
**Plano da série:** [`../PLANO-SERIE-DOI.md`](../PLANO-SERIE-DOI.md)

Estes são os **registros 19 a 22** da sua série no Zenodo, no mesmo padrão dos 18
que você já tem: mesmo ORCID, mesma licença CC BY 4.0, mesmo tom honesto, mesmo
bloco de "situação deste documento".

**Nada foi depositado.** Os textos estão escritos e os PDFs gerados; o depósito é
seu, sob o seu ORCID.

---

## 1. O que está pronto nesta pasta

| Registro | Fonte (markdown) | PDF |
|---|---|---|
| **#1 EN** — *Evidence Architecture for Post-Use Electronic Assets* | `01-evidence-architecture-en.md` | `01-evidence-architecture-EN.pdf` (6 pág.) |
| **#1 PT** — *Arquitetura de Evidência para Ativos Eletroeletrônicos Pós-Uso* | `01-arquitetura-evidencia-pt.md` | `01-arquitetura-evidencia-PT.pdf` (7 pág.) |
| **#2 EN** — *A Minimum Specification for Verifiable Environmental-Destination Certificates* | `02-verifiable-certificate-en.md` | `02-verifiable-certificate-EN.pdf` (5 pág.) |
| **#2 PT** — *Especificação Mínima para Certificados de Destinação Ambiental Verificáveis* | `02-certificado-verificavel-pt.md` | `02-certificado-verificavel-PT.pdf` (6 pág.) |
| **#3 EN** — *From MTR/SINIR to the European Buyer* | `03-crosswalk-br-eu-en.md` | `03-crosswalk-br-eu-EN.pdf` (8 pág.) |
| **#3 PT** — *Da MTR/SINIR ao Comprador Europeu* | `03-crosswalk-br-ue-pt.md` | `03-crosswalk-br-ue-PT.pdf` (9 pág.) |
| **#4 EN** — *Documenting Avoided Emissions from Correct Waste Destination* | `04-avoided-emissions-en.md` | `04-avoided-emissions-EN.pdf` (6 pág.) |
| **#4 PT** — *Documentar Emissões Evitadas pela Destinação Correta de Resíduos* | `04-emissoes-evitadas-pt.md` | `04-emissoes-evitadas-PT.pdf` (6 pág.) |

Conforme o plano: **um trabalho = um DOI**, com os dois idiomas **no mesmo
depósito** (dois arquivos PDF). São, portanto, **4 depósitos**, não 8.

*(Os PDFs saem do markdown pelo conversor `site-villanova/scripts/md-para-pdf.py` +
Chromium — mesmo caminho usado no PDF do SEMM. Se você quiser mudar uma frase, eu
edito o markdown e regero o PDF.)*

---

## 2. ⚠️ O que VOCÊ precisa conferir antes de depositar

### Registros #1 e #2 — poucos pontos, e todos leves

Foram escritos de propósito para **não** depender de validação jurídica.

- [ ] **Lei 12.305/2010 e o sistema MTR/SINIR** — citados como *orientação sobre
      onde a obrigação pode estar*, nunca como afirmação categórica.
- [ ] **Regras estaduais** (SIGOR/CETESB como exemplo) — o texto já diz que diferem
      por estado; confira se quer citar outros estados onde a Ecobraz atua.
- [ ] **LGPD / GDPR** (só no #2, requisito R7) — citados como orientação sobre
      minimização de dados.
- [ ] **Registro #2, Seção 5** — é a seção que diz o que a verificação **não** prova.
      Ela limita, de propósito, a força do argumento comercial do QR. Eu considero
      que é ela que dá autoridade ao documento perante um auditor europeu, mas
      **a decisão é sua**.

### Registro #3 (crosswalk) — o único com peso jurídico real

> **Ponto que eu preciso registrar com clareza.** Você me disse que o advogado
> ambiental e o especialista de compliance da UE deram OK. Esse OK, pelo que consta
> aqui, cobre a **base de pesquisa** (`portal-cliente/conformidade/`). **O crosswalk
> é um documento novo**, que faz correlações que eles não leram. Escrevi colado no
> que a base marcou como `[LEI FIRME]` e **omiti deliberadamente** os números de
> artigo que a própria base marcou como `[A CONFIRMAR]`. Ainda assim, **recomendo
> uma leitura final dos dois antes do depósito** — é o documento da série que mais
> se aproxima de afirmação jurídica, e sai sob o seu nome.

- [ ] **Leitura final dos dois especialistas** sobre este documento (não sobre a base).
- [ ] **§3.1 — os dois "provavelmente não se aplicam"** (regulamento de desmatamento
      e CBAM). É a afirmação mais forte e mais útil do texto, e é a que um comprador
      pode contestar. Confirme com o especialista da UE.
- [ ] **§3.1, caso de fronteira do CBAM:** levantei que a **venda de frações
      metálicas para o mercado europeu** pode tocar categoria coberta — como
      *pergunta*, não como conclusão. Se a Ecobraz vende metal para a Europa, isso
      precisa de resposta antes de publicar.
- [ ] **Regime de transferência transfronteiriça de resíduos:** deixei marcado
      ⚠️ "verificar qual instrumento está em vigor" porque a base de pesquisa não
      cobriu esse ponto e **eu não verifiquei**. Se o especialista da UE confirmar
      o instrumento vigente, eu troco o ⚠️ pela citação correta.
- [ ] **Datas de transposição** (2024/825, 2024/1760) e status do pacote "Omnibus".

### Registro #4 (emissões evitadas) — sem número, por decisão

- [ ] Confirme que está de acordo com a decisão de **não publicar nenhum fator,
      linha de base ou resultado** — nem da Ecobraz. É o que torna o documento
      publicável hoje, com o módulo de cálculo ainda em fase de plano.
- [ ] **§4, tabela de linguagem de alegação** — ela restringe o que o comercial pode
      dizer. Leia com a Silvana antes de publicar, porque vira padrão da casa.

### Comum aos quatro

- [ ] **Declaração de interesse** — os quatro declaram que você é CEO da Ecobraz e
      fundador da Villanova, e que tem interesse comercial no assunto. **Isso é
      proposital e é o que protege a credibilidade da série.** Leia e confirme.

---

## 3. ORDEM IMPORTA: 1 → 2 → 3 → 4

Cada registro cita o anterior, e o DOI só existe depois de publicado:

| Registro | Cita o DOI de |
|---|---|
| #1 | — |
| #2 | #1 |
| #3 | #2 |
| #4 | #1 e #3 |

Fluxo: depositar **#1** → o Zenodo gera o DOI **na hora, ao publicar** → você me
manda → eu troco os `10.5281/zenodo.XXXXXXX` no seguinte e **regero o PDF** →
você deposita o seguinte. E assim por diante.

**Isso pode ser feito tudo numa sessão só**, porque o DOI sai instantaneamente na
publicação — não há espera. Mas o plano recomenda **espaçar 4–6 semanas** entre os
registros, por outro motivo (rajada de depósitos é padrão ruim). **A ordem é
obrigatória; o espaçamento é recomendação.**

O `XXXXXXX` do "Como citar" **do próprio documento** é normal — o Zenodo só atribui
o DOI na publicação.

---

## 4. Campos do depósito (copiar e colar)

Padrão comum aos quatro: **Authors:** Marcio Villanova — ORCID `0009-0001-8072-6287`
· **Affiliation:** Villanova ESG · **Resource type:** *Publication → Technical
report* · **License:** *Creative Commons Attribution 4.0 (CC BY 4.0)* · **Access:**
Open · **Related identifiers:** `https://villanovaesg.com` e
`https://villanovaesg.com/publications` como *"is referenced by"*, mais
`https://doi.org/10.5281/zenodo.21445455` (SEMM) como *"is supplemented by"*.

### Registro #1

- **Title:** *Evidence Architecture for Post-Use Electronic Assets: A capture-event model linking operational steps to buyer-readable documentation*
- **Files:** `01-evidence-architecture-EN.pdf` **e** `01-arquitetura-evidencia-PT.pdf`
- **Description/Abstract:** copiar o *Abstract* do PDF em inglês.
- **Keywords:** evidence architecture; chain of custody; e-waste traceability; capture event; audit-grade documentation; mass balance; supplier evidence; certificate of destination; Brazil.
- **Related identifiers (adicionais, como *"cites"*):** `10.5281/zenodo.21398390`,
  `10.5281/zenodo.21398750`, `10.5281/zenodo.21398814`, `10.5281/zenodo.21399040`.

### Registro #2

- **Title:** *A Minimum Specification for Verifiable Environmental-Destination Certificates: Persistent identifiers, resolution, revocation — and the limits of what verification proves*
- **Files:** `02-verifiable-certificate-EN.pdf` **e** `02-certificado-verificavel-PT.pdf`
- **Description/Abstract:** copiar o *Abstract* do PDF em inglês.
- **Keywords:** verifiable certificate; certificate of destination; persistent identifier; QR verification; document integrity; revocation; chain of custody; audit-grade documentation; anti-fraud; e-waste.
- **Related identifiers (adicionais, como *"cites"*):** o DOI do **#1**, mais
  `10.5281/zenodo.21398814` e `10.5281/zenodo.21398390`.

### Registro #3

- **Title:** *From MTR/SINIR to the European Buyer: A crosswalk between Brazilian waste-traceability instruments and European supply-chain evidence requests*
- **Files:** `03-crosswalk-br-eu-EN.pdf` **e** `03-crosswalk-br-ue-PT.pdf`
- **Description/Abstract:** copiar o *Abstract* do PDF em inglês.
- **Keywords:** MTR; SINIR; certificate of final destination; CDF; supplier evidence; EU-Brazil; CSDDD; ESRS E5; GRI 306; waste traceability; crosswalk; due diligence.
- **Related identifiers (adicionais, como *"cites"*):** o DOI do **#2**, mais `10.5281/zenodo.21445455`.

### Registro #4

- **Title:** *Documenting Avoided Emissions from Correct Waste Destination: A declaration protocol with explicit baseline, traceable factors, and separation from the GHG inventory*
- **Files:** `04-avoided-emissions-EN.pdf` **e** `04-emissoes-evitadas-PT.pdf`
- **Description/Abstract:** copiar o *Abstract* do PDF em inglês.
- **Keywords:** avoided emissions; baseline; counterfactual; emission factors; GHG inventory; Scope 3; greenwashing; recycling; declaration protocol; assurance.
- **Related identifiers (adicionais, como *"cites"*):** os DOIs do **#1** e do **#3**,
  mais `10.5281/zenodo.21445455`.

---

## 5. Passo a passo no Zenodo

1. Entrar em **zenodo.org** com a sua conta (a mesma dos 18 registros).
2. **New upload**.
3. Subir os **dois PDFs** (EN e PT) do mesmo registro.
4. Preencher os campos do §4.
5. **Publish** → o Zenodo gera o DOI.
6. **Me mandar o DOI.** Eu então: adiciono o registro na página `/publications`
   do site, insiro a citação nas páginas-pilar que fizerem sentido, e atualizo o
   texto do registro seguinte antes do próximo depósito.

---

## 6. Balanço honesto

**Feito por mim e verificável nesta pasta:** os oito textos escritos, no padrão da
série, cada registro com artefato citável próprio — a tabela de eventos de captura e
as três regras de ligação (#1); os dez requisitos e a lista de conformidade (#2); a
tabela de correspondência, as seis lacunas e o conteúdo do arquivo legível pelo
comprador (#3); os nove elementos e a tabela de linguagem de alegação (#4). Os oito
PDFs gerados e conferidos visualmente (A4, tabelas e blocos de citação legíveis).

**O que eu NÃO fiz e não posso fazer:** depositar (é sob o seu ORCID); afirmar que
os textos estão juridicamente corretos — no #3 em especial, o que eu tenho é a base
de pesquisa validada por especialistas, e **o documento em si ainda não foi lido por
eles**; verificar o regime europeu de transferência transfronteiriça de resíduos
(deixei ⚠️ e disse que não verifiquei); prever se e quando isso vai gerar citação ou
backlink.

**O que estes quatro registros deliberadamente NÃO fazem:** não descrevem o Sistema
da Ecobraz, não citam nenhum produto, e não afirmam que qualquer implementação está
em conformidade com eles — inclusive a nossa. É a regra "método, não produto".
O registro sobre a implementação da Ecobraz é o **#5**; a classificação de maturidade
que você passou em 19/08 está registrada no plano da série e é a base honesta dele.

**Ainda na fila:** **#5** (implementação de referência) e **#6** (radar de legislação
com IA, que depende do Pacote 3 existir).
