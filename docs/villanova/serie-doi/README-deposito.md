# Série de DOI — registros 1 e 2: guia de depósito no Zenodo

**Data:** 2026-08-19 · Para o Marcio.
**Plano da série:** [`../PLANO-SERIE-DOI.md`](../PLANO-SERIE-DOI.md)

Estes são os **registros 19 e 20** da sua série no Zenodo, no mesmo padrão dos 18
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

Conforme o plano: **um trabalho = um DOI**, com os dois idiomas **no mesmo
depósito** (dois arquivos PDF). São, portanto, **2 depósitos**, não 4.

*(Os PDFs saem do markdown pelo conversor `site-villanova/scripts/md-para-pdf.py` +
Chromium — mesmo caminho usado no PDF do SEMM. Se você quiser mudar uma frase, eu
edito o markdown e regero o PDF.)*

---

## 2. ⚠️ O que VOCÊ precisa conferir antes de depositar

Sai sob o seu nome e o seu ORCID, então o de sempre: eu não invento fato jurídico.
Marquei no texto cada ponto que depende de lei com `⚠️`. **São menos pontos que no
SEMM** — de propósito: estes dois registros foram escritos para **não** depender de
validação jurídica (por isso vêm primeiro na série).

- [ ] **Lei 12.305/2010 e o sistema MTR/SINIR** — os dois textos citam como
      *orientação sobre onde a obrigação pode estar*, nunca como afirmação
      categórica. Confira se a menção está confortável para você.
- [ ] **Regras estaduais** (SIGOR/CETESB citado como exemplo) — o texto já diz que
      diferem por estado; confira se quer citar outros estados onde a Ecobraz atua.
- [ ] **LGPD / GDPR** (só no registro #2, requisito R7) — citados como orientação
      sobre minimização de dados. Confira se concorda com a formulação.
- [ ] **Declaração de interesse** — os dois textos declaram que você é CEO da
      Ecobraz e fundador da Villanova, e que tem interesse comercial em sistemas
      desse tipo. **Isso é proposital e é o que protege a credibilidade da série.**
      Leia e confirme que está de acordo com a redação.
- [ ] **Registro #2 — leia a Seção 5 com atenção.** É a seção que diz o que a
      verificação **não** prova. Ela limita, de propósito, a força do argumento
      comercial do QR. Eu considero que é ela que dá autoridade ao documento
      perante um auditor europeu, mas **a decisão é sua**.

---

## 3. ORDEM IMPORTA: deposite o #1 primeiro

O registro **#2 cita o #1**, e o DOI do #1 só existe depois de publicado. Por isso:

1. Depositar e publicar o **#1** → o Zenodo gera o DOI.
2. **Me mandar o DOI do #1.**
3. Eu substituo os `10.5281/zenodo.XXXXXXX` no texto do #2 (duas ocorrências: §4 R6
   e a referência 1) e **regero os PDFs do #2**.
4. Só então depositar o **#2**.

O `XXXXXXX` de "Como citar" do próprio documento é normal — o Zenodo só atribui o
DOI no momento da publicação. Se você quiser o número dentro do próprio PDF, dá
para publicar uma **versão 1.1** depois com o DOI preenchido (o Zenodo mantém o
mesmo *concept DOI*). Recomendo **não** fazer isso: dá trabalho e o valor é baixo.

---

## 4. Campos do depósito (copiar e colar)

Padrão comum aos dois: **Authors:** Marcio Villanova — ORCID `0009-0001-8072-6287`
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
- **Related identifiers (adicionais):** os DOIs citados no texto —
  `10.5281/zenodo.21398390`, `10.5281/zenodo.21398750`, `10.5281/zenodo.21398814`,
  `10.5281/zenodo.21399040` como *"cites"*.

### Registro #2

- **Title:** *A Minimum Specification for Verifiable Environmental-Destination Certificates: Persistent identifiers, resolution, revocation — and the limits of what verification proves*
- **Files:** `02-verifiable-certificate-EN.pdf` **e** `02-certificado-verificavel-PT.pdf`
- **Description/Abstract:** copiar o *Abstract* do PDF em inglês.
- **Keywords:** verifiable certificate; certificate of destination; persistent identifier; QR verification; document integrity; revocation; chain of custody; audit-grade documentation; anti-fraud; e-waste.
- **Related identifiers (adicionais):** o DOI do **#1** como *"cites"* (por isso a
  ordem do §3), mais `10.5281/zenodo.21398814` e `10.5281/zenodo.21398390`.

---

## 5. Passo a passo no Zenodo

1. Entrar em **zenodo.org** com a sua conta (a mesma dos 18 registros).
2. **New upload**.
3. Subir os **dois PDFs** (EN e PT) do mesmo registro.
4. Preencher os campos do §4.
5. **Publish** → o Zenodo gera o DOI.
6. **Me mandar o DOI.** Eu então: adiciono o registro na página `/publications`
   do site, insiro a citação nas páginas-pilar que fizerem sentido, e — no caso do
   #1 — atualizo o texto do #2 antes do segundo depósito.

---

## 6. Balanço honesto

**Feito por mim e verificável nesta pasta:** os quatro textos escritos, no padrão
da série, com artefato citável próprio em cada um (a tabela de eventos de captura e
as três regras de ligação no #1; os dez requisitos e a lista de conformidade no #2);
os quatro PDFs gerados e conferidos visualmente (render em A4, tabelas e blocos de
citação legíveis).

**O que eu NÃO fiz e não posso fazer:** depositar (é sob o seu ORCID); afirmar que
os textos estão juridicamente corretos (marquei os pontos com ⚠️, que são poucos e
todos formulados como orientação, não como afirmação); prever se e quando isso vai
gerar citação ou backlink.

**O que estes dois registros deliberadamente NÃO fazem:** não descrevem o Sistema da
Ecobraz, não citam nenhum produto, e não afirmam que qualquer implementação está em
conformidade com eles — inclusive a nossa. É a regra "método, não produto" do plano.
O registro sobre a implementação da Ecobraz é o **#5**, e depende de você me dizer,
módulo a módulo, o que está em produção hoje.

**Próximos da série, quando você quiser:** **#4** (emissões evitadas: o que se pode
declarar) não depende de ninguém e eu escrevo em seguida; **#3** (o crosswalk BR↔UE,
o de maior valor comercial) só sai depois da validação jurídica.
