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

**✅ DECIDIDO pelo Marcio (25/07/2026) — a linha é DIY vs. tudo-pronto:**

> **GRÁTIS: entrega os dados rastreados que o cliente precisa para alimentar o
> sistema dele ou passar para a equipe de ESG dele montar.
> PAGO: entrega tudo PRONTO — ele não precisa fazer mais nada. Simples assim.**

| GRÁTIS com o contrato (a matéria-prima) | PAGO (o trabalho pronto) |
|---|---|
| Portal, chamados, acompanhamento | Módulos de cálculo (o sistema calcula por ele) |
| TODA a documentação rastreada do descarte: NF, MTR, CDF com QR, laudos, pesos, fotos | Consultoria de preenchimento (Villanova busca e preenche) |
| Estimativa de emissões da entrada (a isca) | Validação de evidências pela Villanova |
| Dados brutos exportáveis para o ESG dele usar | Relatórios ESG prontos e emitidos (BR/UE/Bancário) |
| Dados das coletas do Adote patrocinadas | Cotas do Adote um Bairro |

**Frase de venda da linha:** *"De graça, você recebe toda a prova — rastreada,
auditável, exportável. Pago, você recebe o trabalho pronto — aperta o botão e
entrega."* O grátis já elimina a maior dor (caçar documento de fornecedor); o pago
elimina o resto do trabalho. Empresas pagam felizes por conveniência — é o modelo
DIY vs. done-for-you, clássico e comprovado.

**Ajuste decorrente no pitch (doc 12):** a virada das 4 perguntas passa a ser:
*"Com o contrato, TODA a documentação e os dados rastreados saem de graça — sua
equipe de ESG para de caçar papel. E se você não quiser nem montar o relatório,
temos os módulos que entregam tudo pronto."* (Substitui o "fazemos tudo de graça"
genérico — que agora seria promessa maior que a entrega.)

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

## 4-bis. Nota do Marcio (25/07/2026) + método de batismo

**Todos os nomes desta arquitetura são ilustrativos** — a decisão final será tomada
"com inteligência, blindada e com pesquisa de mercado; um nome errado pode brecar a
venda; tudo pensado para converter ao máximo; cada detalhe conta."

Método travado para quando formos batizar (nomes de módulos, pacotes e telas):
1. **Clareza vence criatividade**: o nome tem que dizer o que o produto faz em 2
   segundos para quem nunca ouviu falar (teste: ler só o nome e perguntar "o que
   você acha que isso é?").
2. **Sobreviver à auditoria**: nenhum nome pode prometer mais do que entrega
   (inventário ≠ estimativa; verificado ≠ auditado por terceiro).
3. **Testar antes de travar**: 2–3 opções de nome apresentadas a 5–10 clientes
   reais da base (ou nos primeiros pitches da Reconquista) — o que converter mais,
   fica.
4. **Blindagem**: checagem INPI + domínio + colisão com marcas do setor antes de
   qualquer material público.
5. **Consistência**: o nome no sistema = nome na proposta = nome no site = nome na
   NF. Nome que muda de tela para tela mata a confiança.

## 5. Próximos passos

- [ ] Pesquisa de preços (em andamento 25/07): SaaS de carbono BR e internacional,
      inventário GHG por consultoria, relatório avulso, verificação
- [ ] Marcio: bater o martelo na "linha do grátis" (seção 3)
- [ ] Montar tabela de preços dos degraus 2–7 com as âncoras da pesquisa
- [ ] Atualizar simulação do caminho completo com a nova linha de receita (MRR de módulos)
