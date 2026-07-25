# Por que empresas vendem/leiloam TI em vez de destinar — e como a Ecobraz contorna

> Síntese da pesquisa de comportamento de 25/07/2026 (fontes/URLs no relatório do
> pesquisador). Responde à hipótese do Marcio: "quem decide é escalão baixo que quer
> mostrar receita e não entende o risco".

## 1. Veredito sobre a hipótese do Marcio

**Plausível e compatível com a evidência — mas ainda hipótese.** Não existe pesquisa
pública que nomeie o decisor típico. O que está documentado:
- A decisão formal de desmobilizar passa por patrimônio/financeiro/diretoria, mas a
  **execução** (leilão vs. doação vs. destinação) cai em TI/facilities/compras — o
  próprio Gartner endereça seus guias de ITAD a procurement e líderes de TI, não a
  CISO/jurídico. Responsabilidade fragmentada = ninguém dono do risco.
- O paradoxo medido (Blancco/Coleman Parkes, 1.850 decisores sênior): **68–73% se dizem
  preocupados** com violação em equipamentos em fim de vida, mas **1/3 das maiores
  empresas do mundo usa sanitização inadequada** — operam com "falsa sensação de
  segurança" (acham que formatar apaga).
- As plataformas de leilão alimentam ativamente o comportamento: o discurso da Superbid
  ao vendedor corporativo é "recupere capital em projetos de desinvestimento" — sem uma
  palavra sobre sanitização ou destinação. Superbid: GMV ~R$ 4 bi (2022), comissão 7–8%.
- **Recomendação de validação:** 10–15 entrevistas curtas com clientes perdidos
  (Marcio/Silvana) para confirmar quem decidiu e por quê. Vira dado proprietário.

## 2. A munição (números com fonte para os materiais de venda)

| Argumento | Número | Fonte |
|---|---|---|
| O caso âncora: Morgan Stanley economizou na desativação de 2 datacenters; servidores com dados de ~15 mi de clientes foram parar em leilão online | **~US$ 161,5 milhões** em multas/acordos (OCC US$ 60 mi, SEC US$ 35 mi, class action) | OCC 2020, SEC 2022 |
| "Formatar não apaga" | **42%** dos drives vendidos como "limpos" no eBay tinham dados sensíveis (Blancco 2019); **56%** dos roteadores corporativos usados tinham credenciais (ESET 2023); só **11%** de 185 mídias usadas estavam limpas (Kaspersky) | Blancco/ESET/Kaspersky |
| Custo médio de UMA violação de dados no Brasil | **R$ 7,19 milhões** (financeiro: R$ 8,92 mi; saúde: R$ 11,43 mi) | IBM Cost of a Data Breach 2025 |
| O que o lote rende | Sucata: R$ 1–90/kg conforme componente; equipamento <4 anos: 20–40% do valor original, menos 7–8% de comissão | tabelas comerciais + guias ITAD |
| **A conta final** | A violação média custa **~20 a 50× a receita típica do lote** | cálculo sobre os dois dados acima |
| Passivo ambiental | Corresponsabilidade do gerador (PNRS): vender a atravessador NÃO transfere o passivo; multa até R$ 50 mi + responsabilização criminal de gestores | Lei 12.305/2010, Decreto 6.514/2008 |

**Regra de honestidade no discurso (importante):** a ANPD, até início de 2026, aplicou
UMA multa a empresa privada (R$ 14,4 mil). Nunca dizer "a ANPD vai te multar" — o
argumento verdadeiro é: custo de violação (IBM), caso Morgan Stanley, responsabilidade
civil/reputacional e o dever LGPD de comprovar a destinação do dado (o certificado é a
prova). Exagerar quebra a credibilidade com auditor — e com o padrão da casa.

**Achado jurídico relevante:** o Decreto 10.240/2020 (logística reversa de
eletroeletrônicos) cobre uso doméstico e **exclui o B2B** — o descarte corporativo se
apoia na PNRS e na corresponsabilidade do gerador. Ajustar qualquer material que sugira
o contrário.

## 3. A estratégia de contorno — 3 movimentos

**Movimento 1 — Mudar a régua (comunicação/venda consultiva).** Calculadora de custo
total: "seu lote rende R$ X — a violação média custa R$ 7,19 mi — quem assume esse
risco por vocês?". Municiar o campeão interno (TI) com o kit que o protege pessoalmente:
"quando der problema, quem autorizou a venda assina o quê?".

**Movimento 2 — Capturar a receita em vez de negá-la (novo produto — DECISÃO do Marcio).**
Os ITADs sérios do mundo (Iron Mountain, SK tes, Ingram) não dizem "não venda" — dizem
**"você recebe o cheque, nós assumimos o risco"**.

*Desenho refinado em 25/07/2026 após objeções do Marcio (corretas: lote vem com lixo
junto; HDs nunca são comercializados; split simples sobre o bruto não fecharia a conta;
risco de canibalizar os doadores atuais):*

**As três camadas de receita (o cliente paga duas antes de qualquer divisão):**
1. **Serviço pago, garantido, independente do leilão:** triagem, descaracterização,
   sanitização e destruição certificada de HDs (nunca vão a leilão — viram o serviço
   pago que já existe), logística e destinação documentada do refugo do lote.
   Cobrado por item/kg. Pior cenário (lote todo lixo) = contrato de serviço pago normal.
2. **Split sobre o LÍQUIDO do comercializável:** só o que sobra como vendável vai a
   leilão; o percentual (60/40, 70/30 — negociável por lote) incide após os custos.
3. **Arrasto:** cada lote vende laudo + sanitização + CDF + contrato + sistema.

*Exemplo ilustrativo (números internos, a validar):* lote de 100 notebooks de 3 anos →
revenda ~R$ 100 mil brutos; serviços cobrados ~R$ 15 mil; split 30% do líquido ~R$ 25 mil
→ **~R$ 40 mil/lote para a Ecobraz**, de um cliente que hoje rende zero. Cliente sai com
~R$ 60 mil + certificados + risco zero (vs. ~R$ 92 mil do leilão direto carregando risco
médio de R$ 7,19 mi — a diferença é o preço do seguro, e é assim que se vende).

**As três cercas anti-canibalização (proteger os doadores atuais):**
1. **Avaliação prévia transparente:** a conta é mostrada ao cliente. Lote velho (5+ anos,
   perfil típico do doador) → valor residual − processamento = negativo → recomendação
   honesta: destinação gratuita com documentação. A matemática mantém o doador doador.
2. **Corte de elegibilidade:** só lotes com valor residual comprovado (~<4 anos, volume
   mínimo) — exatamente o perfil que hoje vai ao Superbid e não chega à Ecobraz.
3. **Canal fechado:** sob proposta, sem página no site, sem tabela pública; oferta ativa
   apenas a clientes perdidos/leiloadores. Doadores nunca são abordados com isso.

**Comparação certa:** não é "consignação vs. doação" (doador segue igual, com Adote um
Bairro e sistema como valor) — é **"consignação vs. zero"**: esses lotes já vão a leilão.

⚠️ Antes de lançar: (1) enquadramento jurídico/fiscal de ONG operando consignação (pode
exigir veículo próprio do grupo); (2) coerência de discurso ("revenda certificada com
rastreabilidade por série + CDF do refugo" ≠ atravessador); (3) **piloto silencioso** com
2–3 clientes já perdidos para leilão — medir a conta real antes de decidir se vira
produto; (4) risco residual de canibalização não é zero (cliente conversa com cliente) —
decisão consciente do Marcio.

**Movimento 3 — Validar com dados próprios.** Entrevistas com clientes perdidos +
registrar no Ploomes o motivo de cada perda ("vendeu/leiloou") para medir o tamanho
real desse vazamento de receita.

## 4. Encaixe no plano-mestre

- Persona 4 (quem quer vender) passa a ter DUAS respostas: o argumento de risco
  (Movimento 1) e a alternativa que preserva a receita (Movimento 2, se aprovado).
- A calculadora de risco (Fase 2) usa os números da seção 2, com as fontes.
- **Canal confirmado (Marcio, 25/07/2026):** a Ecobraz já tem contrato com a Superbid
  e com a Kawara e costuma vender lá — **nunca nada que armazene dados**. O canal de
  leilão do modelo já existe dentro de casa; cenários numéricos em
  `05-consignacao-cenarios.md`.

## 5. Pendências

- [ ] Marcio: decidir se topa estudar o modelo de consignação/híbrido (muda o modelo de negócio — não implantar sem análise jurídica/fiscal)
- [ ] Marcio: confirmar relação com "VM Eletrônicos" (Superbid)
- [ ] Entrevistas com 10–15 clientes perdidos (roteiro a produzir)
- [ ] Calculadora de custo total (Fase 2 do plano)
