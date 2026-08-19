# Série de DOI — Sistema Ecobraz × Villanova ESG (proposta)

**Data:** 2026-08-19 · Para o Marcio.
**Pergunta que originou:** "fazer uma série de DOI sobre o Sistema da Ecobraz e a
integração com a Villanova ESG, e como isso ajuda na rastreabilidade e na
comprovação perante a legislação brasileira e europeia — o que você acha? quantos DOI?"

> Este documento é **proposta e opinião**, não execução. Nada foi depositado.
> Onde eu não verifiquei um fato, está dito que não verifiquei.

---

## Resposta curta

**Sim, vale muito — mas não do jeito mais óbvio.**

- **Quantidade recomendada: 4 registros no núcleo + 2 extensões opcionais** →
  **4 a 6 DOIs**, um a cada **4–6 semanas** (núcleo completo em ~4–6 meses).
- **A regra que decide tudo:** publicar o **método**, não o **produto**.
  O Sistema da Ecobraz não é o *assunto* dos registros — ele é a
  **implementação de referência**, citada e declarada como tal.
- Feito assim, a série responde exatamente à sua pergunta (rastreabilidade +
  comprovação BR/UE) **e** constrói autoridade legítima. Feito ao contrário,
  ela vira folheto com DOI e **contamina os 18 registros que já existem**.

---

## 1. Por que NÃO publicar "o Sistema da Ecobraz" diretamente

Quatro razões concretas, e todas têm solução:

1. **O Zenodo não tem revisão por pares.** Ele aceita praticamente qualquer
   coisa. Isso significa que o valor de um registro vem do **conteúdo**, não do
   selo. Um texto que descreve as funcionalidades do próprio produto é um
   folheto comercial que ganhou um DOI — e um comprador europeu de procurement
   percebe isso na primeira página.
2. **O dano seria retroativo.** Os seus 18 registros valem justamente porque são
   **conceituais e genéricos** (o gap de evidência, cadeia de custódia,
   taxonomia de não conformidade, o SEMM). Um registro promocional no meio da
   série faz o leitor reler os outros 18 com desconfiança. Você perde mais do
   que ganha.
3. **O conflito de interesse é real e precisa aparecer.** Você é CEO da Ecobraz
   e fundador da Villanova ESG. A página `/publications` já declara isso — os
   registros novos precisam declarar **no corpo do texto**, não só na página.
   Declarado, é normal e aceito; omitido, é o que destrói credibilidade.
4. **Material genérico é mais citado do que material de produto.** É o mesmo
   raciocínio que fez o SEMM ser escrito como ferramenta e não como ensaio.
   Uma especificação que **um concorrente também pode usar** é linkada,
   reutilizada e citada — e cada citação volta como backlink de alta confiança
   para villanovaesg.com. Um folheto não é citado por ninguém.

**A inversão que resolve:** cada registro entrega um **artefato reutilizável**
(uma arquitetura, uma especificação, uma tabela de correspondência, um
protocolo). O Sistema da Ecobraz aparece como a prova de que aquilo **roda na
vida real** — o que é uma credencial forte, e não um anúncio.

---

## 2. Os 4 registros do núcleo (+2 extensões)

| # | Título de trabalho | Pergunta que responde | Artefato citável | Depende de |
|---|---|---|---|---|
| **1** | **Arquitetura de evidência ponta a ponta na destinação de eletroeletrônicos** (coleta → doca → destino) | *O que um sistema precisa capturar para que o certificado no fim não seja só papel?* | Modelo de eventos: cada etapa, o que ela registra, e **qual alegação aquele registro sustenta — e qual não sustenta** | Nada externo. Escrevo já |
| **2** | **Certificado de destinação verificável: especificação mínima** (identificador persistente + verificação por QR) | *O que faz um certificado ser verificável de verdade, e o que a verificação NÃO prova?* | Especificação mínima + checklist de conformidade (identificador, resolução, revogação, privacidade, falha offline) | Nada externo. Escrevo já |
| **3** | **Da MTR/SINIR ao comprador europeu: tabela de correspondência BR↔UE** | **← esta é a sua pergunta, respondida de frente:** *o documento brasileiro que já existe comprova o quê, para quem, na Europa?* | **Crosswalk**: Lei 12.305/2010, MTR/SINIR, CDF, CADRI/LO, NBR 10004 ↔ as 7 categorias de evidência do SEMM ↔ pedidos tipo EUDR / CBAM / CSDDD | ⚠️ **Validação jurídica** (advogado ambiental BR + compliance UE) |
| **4** | **Emissões evitadas na destinação: o que se pode declarar e como documentar** | *Como reportar o CO₂ evitado sem cair em greenwashing?* | Formato de declaração + tabela "**pode dizer / não pode dizer**" (evitada ≠ Escopo 3 ≠ compensação; UE 2024/825) | Nada externo — **e propositalmente sem números da Ecobraz** (ver §5) |
| **5** *(opc.)* | **Do SEMM ao sistema: uma implementação de referência** | *Como um fornecedor sai do Nível 1 para o Nível 3 do SEMM na prática?* | Relato de implementação com o que funcionou **e o que não funcionou** | Confirmação de quais módulos estão **realmente no ar** (§5) + declaração de conflito de interesse |
| **6** *(opc.)* | **Radar de legislação assistido por IA com humano no circuito** | *Como manter uma base normativa atualizada sem transferir responsabilidade legal para a IA?* | Protocolo de governança: detectar → rascunhar → **aprovação humana** → versionar | O Pacote 3 existir minimamente |

**Por que exatamente esses:** cada um tem um **artefato distinto**. Se dois
registros entregam a mesma tabela com palavras diferentes, viram duplicata — e
duplicata em série auto-publicada parece inflar contagem, que é o oposto do que
queremos.

### Por que 4–6 e não 10

- Você já tem **18**. O ganho marginal do 19º não está no número, está na
  **diferenciação**. Dez registros parecidos somam menos que quatro distintos.
- Cada registro sai sob **seu nome e seu ORCID**. Volume aumenta a superfície de
  erro — e o registro nº 3 tem dependência jurídica real.
- **Autoridade por DOI é lenta por natureza** (indexação, citação, link). Espaçar
  4–6 semanas não atrasa nada; publicar tudo numa rajada é, inclusive, um padrão
  ruim (foi o que já aconteceu com o blog: 428 posts em rajada, sem histórico).

---

## 3. Ordem e calendário sugeridos

| Ordem | Registro | Quando | Por quê nessa posição |
|---|---|---|---|
| 1º | **#1 Arquitetura** | imediato | Não depende de ninguém e **abre a série** (os outros citam ele) |
| 2º | **#2 Certificado verificável** | +4–6 sem. | O mais citável e reutilizável de todos; é o diferencial técnico real |
| 3º | **#3 Crosswalk BR↔UE** | quando a validação jurídica sair | Maior valor comercial **e** maior risco: só sai com jurista |
| 4º | **#4 Emissões evitadas** | +4–6 sem. | Independente; pode antecipar se o #3 atrasar |
| 5º | **#5 Implementação (Ecobraz)** | depois do núcleo | Chega como **evidência**, não como anúncio — porque os 4 anteriores já são neutros |
| 6º | **#6 Radar com IA** | quando o Pacote 3 existir | Nunca antes de existir |

O **#5 por último** não é detalhe: é o que separa "série técnica com um caso
real" de "quatro textos para justificar o quinto".

---

## 4. Decisões práticas de depósito

- **Idioma — um trabalho = um DOI, com os dois PDFs (EN + PT) no mesmo depósito.**
  Não criar dois DOIs para o mesmo conteúdo: infla a contagem, divide as citações
  e fica visível. Se você preferir depósitos separados, ligá-los com o
  *related identifier* **"is translation of"**.
  Núcleo em **EN** (comprador europeu) + **PT**; o **#3 (crosswalk)** é o mais
  importante em PT, porque quem precisa dele é o exportador brasileiro.
  IT fica fora — o kit comercial italiano já cobre.
- **Considerar depositar 1 artefato legível por máquina** (o crosswalk como CSV,
  ou o esquema do certificado como JSON) como *Dataset*, junto do relatório.
  Nenhum dos seus 18 registros é assim — material reutilizável por máquina é
  citado e reaproveitado com muito mais frequência que PDF.
- **Manter o padrão dos 18:** ORCID 0009-0001-8072-6287, **CC BY 4.0**,
  *Technical report*, aberto, e o mesmo bloco honesto de *"Status of this
  document"* (DOI ≠ revisão por pares ≠ endosso regulatório).
- ***Related identifiers*** apontando para `villanovaesg.com` e para as
  **páginas-pilar** (não só a home) — é daí que vem o backlink de confiança.
- **Versionamento em vez de registro novo:** atualização de um trabalho existente
  (ex.: SEMM v1.1) usa o versionamento do Zenodo — mantém o *concept DOI* e
  mantém a série viva sem inflar a contagem.
- **Fechar o circuito no site:** cada DOI publicado entra em `/publications` e é
  citado na página-pilar correspondente. (Isso é comigo, é rápido.)

---

## 5. O que eu NÃO posso afirmar — e preciso de você

Isto é o que me impede de simplesmente sair escrevendo:

1. **⚠️ Não verifiquei o que do Sistema está no ar hoje.** O que eu tenho é a
   **descrição canônica que você mesmo escreveu** (`docs/marketing/11-sistema-descricao-canonica.md`,
   25/07/2026): QR anti-fraude, pesagem entrada/saída, NF-e amarrada, painel de
   diretoria. **Eu não testei nada disso rodando.** No repositório, o que consta
   como concluído e provado é o **Pacote 0 do Portal** (login por link + portão de
   contrato); os Pacotes 1 a 4 (CDF, carbono, radar, neutralização) constam como
   **não construídos**. Um DOI escrito no presente é uma **afirmação de fato sob
   seu nome** — então, para o registro #5, preciso que você me diga, módulo a
   módulo, o que está em produção, o que é piloto e o que é plano.
2. **⚠️ A metodologia de CO₂ da Ecobraz ainda não está definida** (consta como item
   em aberto no roadmap do Portal). Por isso o registro **#4 é sobre a *forma* da
   declaração**, não sobre os seus números — assim ele pode ser publicado já, e
   sem risco.
3. **⚠️ A pesquisa jurídica BR+UE do repositório está marcada como pendente de
   validação** por advogado(a) ambiental (BR), especialista de compliance (UE) e
   asseguração ESG. O registro **#3 não sai sem isso** — é o único da série com
   dependência externa obrigatória.
4. **⚠️ Dado de cliente não entra.** O repositório é público e o DOI é público.
   Qualquer caso real precisa ser **anonimizado** e ter **autorização escrita** do
   cliente. Nada de CNPJ, número de MTR real, nome de empresa ou peso identificável.
5. **⚠️ Diretiva (UE) 2024/825 a partir de 27/09/2026** — proíbe rotular produto
   como "carbono neutro" com base em compensação. Isso restringe a redação do #4 e
   do #5, e as datas precisam ser conferidas na fonte (EUR-Lex) antes do depósito,
   como fizemos no SEMM.

---

## 6. Balanço honesto

**Minha opinião, sem enfeite:** a ideia é boa e o momento é bom — você tem 18
registros, um framework próprio (SEMM) já citável e um sistema real por trás. Isso
é matéria-prima que quase nenhum concorrente brasileiro tem. **O risco não é o
tema; é o enquadramento.** Se a série for lida como divulgação do produto, ela
custa credibilidade em vez de construir.

**O que está verificado (li no repositório):** os 18 registros e seus DOIs; o SEMM
publicado (10.5281/zenodo.21445455); a descrição canônica do Sistema; o estado do
Portal (Pacote 0 concluído, 1–4 não); a pesquisa de conformidade e seus 5 pontos
pendentes de validação; a decisão sobre o *Adote um Bairro* (impacto social,
Caminho B).

**O que é suposição minha:** a estimativa de 4–6 registros e o calendário de 4–6
semanas — é julgamento editorial, não medição. E a premissa de que artefato
genérico é mais citado que folheto: é consenso de como citação funciona, mas eu
**não medi** isso no seu caso.

**O que eu não verifiquei:** o Sistema rodando; se os seus 18 DOIs estão gerando
backlink ou citação hoje (dá para medir, é outra tarefa).

**Expectativa realista:** isto **não** produz tráfego em semanas. Constrói
autoridade temática e backlinks de confiança ao longo de meses. É o caminho limpo
— o oposto do PBN que a gente acabou de desautorizar.

**Depende de você:** (a) aprovar o formato "método, não produto"; (b) confirmar a
quantidade (recomendo começar com **4** e decidir sobre o 5 e o 6 depois);
(c) responder o item 1 do §5 (o que está no ar) — só é necessário para o #5;
(d) acionar a validação jurídica, que destrava o #3.

**Se você aprovar, eu começo pelo #1 e pelo #2**, que não dependem de ninguém —
escrevo, você revisa e deposita sob o seu ORCID, do mesmo jeito que fizemos no SEMM.
