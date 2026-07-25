# Monetização do sistema — arquitetura definida pelo Marcio (25/07/2026)

> Registro da escada de monetização + análise da equipe + a decisão de desenho que
> precisa ser tomada antes de precificar. Pesquisa de preços em andamento.

## 1. A escada, como o Marcio desenhou

| Degrau | O quê | Preço |
|---|---|---|
| 0. Acesso ao sistema | Grátis com contrato de exclusividade 36m + 1 descarte/trimestre | R$ 0 |
| 1. Estimativa de emissões na entrada | Automática por CNPJ + CNAE + faturamento — todo cliente vê ao logar | R$ 0 (isca) |
| 2. Módulo de cálculo — Simplificado | Média de consumo energético | a definir |
| 3. Módulo — Moderado | Energia + frota + funcionários | a definir |
| 4. Módulo — Completo | Inclui cadeia de fornecedores (Escopo 3) | a definir |
| 5. Consultoria de preenchimento | Villanova ESG busca os dados e preenche pelo cliente | a definir |
| 6. Validação das evidências | Cliente anexa provas → Villanova ESG valida | (incluída nos módulos? a definir) |
| 7. Relatórios ESG (BR / UE / Bancário) | Por unidade ou pacote com os 3 | a definir |
| 8. Cotas Adote um Bairro | Compradas dentro do sistema, abatem na calculadora | tabela v2 (doc 03) |

## 2. Veredito da equipe: SIM — é o modelo certo. Por quê:

1. **A estimativa gratuita é o vendedor interno do produto** (freemium clássico): o
   cliente vê um número grande e estimado de emissões na primeira tela — a pergunta
   "quer o número real?" se vende sozinha. Melhor gatilho de upsell possível.
2. **Diversifica a receita para longe do leilão** (hoje 90%) com MRR de software e
   serviços — exatamente o objetivo de estabilidade do plano-mestre.
3. **Dá produto recorrente à Villanova no Brasil** (validação + consultoria de
   preenchimento), com pipeline gerado automaticamente pela calculadora.
4. **Cross-sell do Adote em contexto**: o cliente vê o que falta abater e compra a
   cota ali mesmo.

## 3. ⚠️ A DECISÃO DE DESENHO obrigatória antes de precificar: a "linha do grátis"

**Conflito a resolver:** o pitch travado da Reconquista promete *"tudo mastigado,
de graça — você só descarta conosco"*. Se relatórios e cálculos viram tudo pago, o
pitch quebra e a exclusividade de 36 meses perde a contrapartida percebida.

**Proposta da equipe (aguarda martelo do Marcio):**

| GRÁTIS com o contrato (o que sustenta a exclusividade) | PAGO (o que vai ALÉM do descarte) |
|---|---|
| Portal, chamados, acompanhamento | Módulos de inventário de carbono (energia/frota/cadeia) |
| TODA a documentação do descarte: NF, MTR, CDF com QR, laudos | Consultoria de preenchimento (Villanova) |
| **Relatório de destinação/resíduos anual** (o "ESG do descarte" — mastigado, como prometido) | Relatórios ESG corporativos completos (BR/UE/Bancário) |
| Estimativa de emissões da entrada | Verificação de evidências além do escopo do descarte |
| Dados do Adote um Bairro patrocinado | Cotas do Adote um Bairro |

Regra de ouro: **tudo que nasce do descarte é grátis** (é a promessa do contrato);
**tudo que cobre a empresa inteira é pago** (é outro produto — o cliente entende).
Assim o vendedor nunca se contradiz: "seu descarte gera tudo isso de graça; se
quiser o retrato da empresa inteira, temos os módulos".

## 4. Nomes honestos dos módulos (antigreenwashing)

"Simplificado" (só energia) NÃO é um inventário Escopo 3 — vender como inventário
derrubaria a credibilidade no primeiro auditor. Nomes propostos:
- Módulo 1: **"Retrato Inicial"** (estimativa orientativa — energia)
- Módulo 2: **"Inventário Operacional"** (escopos 1 e 2 + deslocamentos)
- Módulo 3: **"Inventário Completo"** (escopos 1, 2 e 3 com cadeia de fornecedores)
Cada um com a nota: "verificado pela Villanova ESG (grupo declarado); pronto para
asseguração independente".

⚠️ Sobre "cotas do Adote abatem os números do Escopo 3 na calculadora": exibir como
**"contribuição/compensação em análise metodológica"** até a metodologia de carbono
ser validada — nunca como abatimento oficial (princípio do roadmap; mesmo ajuste da
tela 10 no doc 14).

## 5. Próximos passos

- [ ] Pesquisa de preços (em andamento 25/07): SaaS de carbono BR e internacional,
      inventário GHG por consultoria, relatório avulso, verificação
- [ ] Marcio: bater o martelo na "linha do grátis" (seção 3)
- [ ] Montar tabela de preços dos degraus 2–7 com as âncoras da pesquisa
- [ ] Atualizar simulação do caminho completo com a nova linha de receita (MRR de módulos)
