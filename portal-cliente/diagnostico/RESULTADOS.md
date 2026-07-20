# Resultados do diagnóstico do Ploomes

> Rodada de **2026-07-20**, somente leitura, **sem baixar dados pessoais** (apenas
> contagens e estrutura). Dados vivos — os totais variam a cada minuto.

## Escala
- **Contatos:** 26.945 — **empresas (PJ): 19.698**; pessoas físicas: 7.247.
- **Negócios:** 18.837 — por situação: **Ganha 9.530**, Em aberto 4.947, Perdida 4.360.
- **Funis:** 23 no total.

## Funis (nome + nº de negócios)
Nomes obtidos por amostra de negócios (o Ploomes não lista os funis direto pela API —
catálogo dá 500 e `/Pipelines` dá 404). Por isso os funis **pequenos/antigos**, que não
apareceram na amostra, ficaram **sem nome** — a identificar com o Marcio.

| ID | Nome | Negócios |
|---|---|---|
| 45932 | 👥 PESSOA FISICA | 5.466 |
| 44259 | 🟦 [PJ] VENDAS | 3.714 |
| 47764 | 🟨 PROSPECT | 2.916 |
| 45882 | 🟧 FOLLOW-UP | 2.833 |
| 45860 | 🟩 LEADS | 1.721 |
| 44595 | Redes Sociais - MKT | 52 |
| 48016 | *(a identificar)* | 782 |
| 12089 | *(a identificar)* | 371 |
| 47347 | *(a identificar)* | 278 |
| 48014 | *(a identificar)* | 200 |
| 47770 | *(a identificar)* | 185 |
| 45870 | *(a identificar)* | 115 |
| 48972 | *(a identificar)* | 86 |
| 47339, 49789, 45855, 52767, 47417, 49216, 49811, 46658, 48535, 49083 | *(a identificar)* | ≤ 40 cada |

**Situações:** 1 = Em aberto · 2 = Ganha · 3 = Perdida.

> Observação: os funis nomeados são todos **comerciais** (vendas/prospecção). O funil de
> **coletas/OS/operação** é provavelmente um dos "a identificar" — a confirmar com o Marcio.

## Campos que já existem e servem ao Portal (ouro)
Já presentes no Ploomes — reduzem muito o trabalho dos pacotes 1 e 2:

- **Nos negócios:** `CNPJ`, `Porte da Empresa`, `Região`, `Data de Coleta`, `Solicitante`, `Operador`, `Valor`, `Valor Total`.
- **Nos documentos:** `Número da OS`, `Peso`, `Data de Coleta`, **`Data de reciclagem – destruição`**, `Data de processamento`, `Forma de Pagamento`, `Frete`, e integração de **assinatura digital (Clicksign / Lexdocs)**.

> Leitura importante para o desenho: o **dado operacional** (nº da OS, peso, datas de
> coleta/reciclagem/destruição) vive nos **Documentos** ligados aos negócios — é a
> matéria-prima do Certificado de Destinação Final e do cálculo de carbono.

## Decisões pendentes (com o Marcio)
1. **Qual funil é o de coletas / OS / atendimento** (provavelmente entre os "a identificar").
2. **O que define "cliente ativo"** (sugestão: empresa PJ com ao menos um negócio *Ganho*).

## Nota técnica
- Nomes de funil/etapa obtidos via `$expand` numa amostra de 300 negócios (sem dados
  pessoais). Para nomear os ~17 funis restantes, basta o Marcio informar, ou uma passada
  paginando os negócios mais antigos.
- Arquivo bruto de cada rodada: artefato `diagnostico-ploomes` (resultado-ploomes.json) na aba Actions.
