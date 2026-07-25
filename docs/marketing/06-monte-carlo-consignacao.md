# Monte Carlo — Ecobraz entrando na consignação certificada (cenário pessimista)

> Rodado em 25/07/2026 · 20.000 simulações · horizonte de 24 meses · script em
> `simulacao/monte-carlo-consignacao.py` (reproduzível, semente fixa).
> **Regra de honestidade:** a simulação é tão boa quanto as premissas. As premissas
> estão listadas abaixo, todas deliberadamente pessimistas, e as marcadas [M] dependem
> de números internos que o Marcio ainda não passou. Isto é uma ferramenta de decisão
> estruturada, não uma previsão.

## 1. Premissas do cenário pessimista

| Premissa | Valor | Comentário |
|---|---|---|
| Chance de o piloto converter algum cliente | 50% | pessimista: cara ou coroa |
| Lotes/mês em regime (mês 24) | ~1,3 (Poisson) | nem 2 lotes/mês |
| Resultado por lote para a Ecobraz | mediana R$ 10 mil (cauda até ~R$ 35 mil) | cenários do doc 05 |
| "Haircut" de erro das minhas estimativas | corta 10–55% do valor (média ~33%) | assume que meus números estão otimistas |
| Receita de recaptura por cliente | só 40% dos clientes geram algo; R$ 0,5–4 mil/mês | pessimista |
| Custo de estruturação (jurídico/fiscal/processos) | R$ 15–40 mil (uma vez) | |
| Custo mensal (comercial/admin/compliance) | R$ 4 mil | |
| **Canibalização da base doadora [M]** | 40% de chance de ocorrer; afeta 5–25% de uma receita de material estimada em R$ 120–250 mil/mês; perda líquida de 50% do afetado | **[M] = maior incerteza do modelo — precisa do número real** |
| Piloto fracassa | perde setup + 3 meses de custo | risco contido |

## 2. Resultados (cenário pessimista)

**Resultado acumulado em 24 meses:**

| Percentil | R$ |
|---|---:|
| P5 (muito azarado) | −227 mil |
| P10 | −142 mil |
| P25 | −47 mil |
| **P50 (mediana)** | **−34 mil** |
| P75 | +45 mil |
| P90 | +208 mil |
| P95 | +332 mil |

| Probabilidade | Valor |
|---|---:|
| Resultado acumulado POSITIVO em 24m | **32,4%** |
| Prejuízo acumulado | 67,6% |
| Prejuízo > R$ 100 mil | 13,2% |
| Prejuízo > R$ 500 mil | 0,1% |

**Fluxo mensal no mês 24 (regime):** mediana R$ 0 (metade dos pilotos morre);
P75 ≈ +R$ 6,7 mil/mês; P95 ≈ +R$ 37,5 mil/mês.

**Condicionais (onde a decisão mora):**

| Cenário | Mediana acumulada 24m | P(positivo) |
|---|---:|---:|
| Se o piloto funcionar | +R$ 43 mil | 64,7% |
| Se funcionar E a canibalização for evitada | **+R$ 84 mil** | **86,0%** |
| Se o piloto fracassar | −R$ 41 mil (perda contida) | — |
| Se houver canibalização | −R$ 110 mil (mediana) | — |

## 3. Leitura honesta dos números

1. **No cenário bem pessimista, a consignação NÃO é um grande motor de receita.**
   Mesmo dando certo, o fluxo mediano em regime é ~R$ 6,5 mil/mês — perto de nada
   diante do buraco de R$ 200 mil/mês. O valor da aposta não está no split: está em
   **recuperar o cliente** (o lote traz de volta o relacionamento, o contrato, os
   serviços pagos e o volume de material que hoje vai para o Superbid sem passar
   pela Ecobraz).
2. **O risco de ruína é desprezível, o risco de perda moderada é real.** Prejuízo
   acima de R$ 500 mil: 0,1%. Mas 2 em 3 simulações pessimistas terminam no vermelho,
   tipicamente entre −R$ 30 e −R$ 50 mil (setup + piloto que não vingou).
3. **A canibalização é O risco.** Sozinha, ela transforma −R$ 32 mil em −R$ 110 mil
   de mediana. Tudo que protege a base doadora (as 3 cercas do doc 04) vale mais do
   que qualquer otimização de preço. E a variável [M] — quanto a Ecobraz fatura hoje
   vendendo material doado — é o número que mais muda o resultado e **ainda não temos**.
4. **A estrutura da aposta é assimétrica e barata:** perda provável contida
   (~R$ 40–50 mil no fracasso), cauda positiva relevante (P90 +R$ 208 mil) e opção
   estratégica de recuperar clientes perdidos. Em linguagem de investimento: é uma
   opção barata, não um novo negócio-âncora.

## 4. Decisão recomendada (sujeita ao aval do Marcio)

- **Ir para o piloto, com trava de perda:** orçamento máximo definido (ex.: R$ 50 mil
  incluindo jurídico), 2–3 clientes já perdidos, 6 meses, sob proposta fechada.
  Critério de continuação pré-combinado (ex.: ≥2 lotes fechados e resultado por lote
  ≥ R$ 8 mil) — se não bater, encerra sem dó.
- **Não lançar publicamente** antes de: parecer jurídico/fiscal, custos reais no
  modelo, e as cercas anti-canibalização testadas.
- Refinar esta simulação quando chegarem: (a) o número [M] do Marcio, (b) os custos
  reais de processamento, (c) os relatórios de pesquisa de concorrência ITAD e de
  riscos jurídicos (em andamento em 25/07).

## 4-bis. Atualização pós-pesquisa jurídica (25/07/2026)

A pesquisa de riscos (doc 08) identificou um **risco de cauda não modelado** nesta
simulação: se a consignação rodar dentro da ONG, há risco de descaracterização da
isenção tributária com autuação retroativa de 5 anos — perda potencial muito maior
que qualquer cenário simulado. **Mitigação estrutural: operar via Ltda do grupo**
(ver doc 08). Com a estrutura correta, os números desta simulação voltam a valer;
sem ela, esta simulação SUBESTIMA o risco.

## 5. Números que faltam do Marcio para a versão final

- [ ] **[M] Receita mensal atual com venda de material doado** (o driver nº 1 do risco)
- [ ] Custos reais: triagem/item, sanitização/disco, logística/lote, R$/kg refugo
- [ ] Comissão real dos contratos Superbid/Kawara
- [ ] Estimativa própria de lotes/mês alcançáveis no 1º ano
