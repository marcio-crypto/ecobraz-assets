# Plano de campanha — Rede de Pesquisa Google Ads (B2B)

**Campanha:** `[Pesquisa] Ecobraz — Coletas B2B`
**Objetivo:** solicitações de avaliação de coleta (`generate_lead` no formulário `/agendamento/`) de empresas com demanda imediata: lixo eletrônico, ativos de TI, linha branca em lote, equipamentos hospitalares eletrônicos não contaminados e sanitização/destruição de dados.
**Princípio:** cada real gasto precisa ter chance real de virar coleta. A campanha é desenhada para *repelir* curiosos, estudantes, pessoas físicas com 1 item e buscas fora da área de cobertura — antes do clique (segmentação, negativas, copy) e depois dele (landing certa por grupo).

---

## 1. Por que esta estrutura (dados Ahrefs, Brasil, jul/2026)

| Termo | Volume/mês BR | CPC médio (USD) |
|---|---|---|
| descarte de lixo eletrônico | 2.500 | 0,15 |
| descarte de eletrodomésticos | 300 | 0,25 |
| descarte de geladeira | 250 | 0,20 |
| descarte de eletrônicos | 200 | 0,20 |
| sanitização de dados | 150 | 0,50 |
| coleta de lixo eletrônico | 50 | 0,30 |
| descarte de computadores | 30 | 0,25 |
| descarte de equipamentos hospitalares | 20 | 0,25 |
| desmobilização de data center / ativos de TI | ~0–10 | — |

Leituras que definem a estratégia:

1. **O nicho é de cauda longa e volume baixo.** Termos explicitamente B2B ("coleta de lixo eletrônico para empresas") têm volume ≈ 0. Se a campanha usar só correspondência exata em termos B2B, ela não veicula. Por isso usamos **correspondência de frase nos termos-núcleo + muro de negativas + copy que qualifica**, em vez de restringir a ponto de sumir.
2. **O termo-cabeça (`descarte de lixo eletrônico`, 2.500/mês) é majoritariamente informacional/residencial.** As variações reais de busca são "como fazer", "resumo", "pontos de coleta", "perto de mim", "gratuita", cidades fora de SP. Ele entra em frase, mas é o termo a vigiar na rotina semanal (seção 8) — as negativas já cobrem os padrões ruins identificados.
3. **CPCs são baixos (R$ 1–3).** Não é um mercado de leilão caro; o desperdício aqui não vem de CPC alto, vem de **clique errado**. Todo o desenho ataca isso.

## 2. Configurações da campanha (anti-desperdício)

| Configuração | Valor | Por quê |
|---|---|---|
| Tipo | Somente Rede de Pesquisa | **Desmarcar** Rede de Display e Parceiros de Pesquisa — são as duas maiores fontes de clique lixo em campanhas de pesquisa |
| Localização | Região Metropolitana de São Paulo | Área de cobertura declarada no site |
| Opção de local | **"Presença: pessoas em ou regularmente em"** | O padrão do Google ("presença ou interesse") mostra anúncios para o Brasil inteiro; esta troca é o ajuste anti-desperdício mais importante da configuração |
| Idioma | Português | — |
| Programação | Seg–Sex, 07h–19h | Decisor B2B pesquisa em horário comercial; expandir depois se os dados mostrarem conversão fora dele |
| Orçamento inicial | R$ 70/dia (ajustável) | Suficiente para ~25–40 cliques/dia neste leilão; concentra dados para o aprendizado |
| Rotação de anúncios | Otimizar | — |
| Sufixo de URL final | `utm_source=google&utm_medium=cpc&utm_campaign=coletas-b2b&utm_term={keyword}&utm_content={adgroupid}` | O `main.js` do site já persiste UTMs na sessão e grava no lead — origem rastreada até o CRM |

**Públicos (em Observação, sem ajuste de lance no início):** visitantes do site (GA4), "Serviços empresariais" no mercado. Servem para, na fase de lances automáticos, alimentar sinal — nunca para restringir a veiculação em Pesquisa.

## 3. Estrutura: 8 grupos de anúncio, 1 landing por grupo

O site já tem landing dedicada para cada intenção — o anúncio nunca manda para a home:

| # | Grupo | Landing | Intenção capturada |
|---|---|---|---|
| 1 | Lixo eletrônico — Empresas | `/coleta-de-lixo-eletronico-para-empresas/` | Coleta corporativa geral |
| 2 | Ativos de TI desmobilizados | `/descarte-de-ativos-de-ti-desmobilizados/` | Notebooks/servidores parados, baixa contábil |
| 3 | Sanitização de dados | `/sanitizacao-segura-de-dados/` | Devolução de locação, wipe com relatório |
| 4 | Destruição de dados e mídias | `/destruicao-fisica-de-dados-e-midias/` | HDs/fitas/SSDs com dados |
| 5 | Data center e servidores | `/desmobilizacao-de-data-center/` | Pós-migração, descomissionamento |
| 6 | Equipamentos hospitalares eletrônicos | `/descarte-de-equipamentos-hospitalares/` | Eletromédicos **não contaminados** |
| 7 | Linha branca — Lotes | `/descarte-de-eletrodomesticos/` | Geladeiras/lavadoras em volume |
| 8 | Logística reversa — Fabricantes | `/logistica-reversa-para-fabricantes-e-importadores/` | Obrigação de logística reversa |

Palavras-chave, anúncios e negativas de cada grupo estão nos CSVs em `editor-import/`.

## 4. Como a campanha repele o tráfego ruim

**Camada 1 — Segmentação:** presença física na RMSP, horário comercial, só rede de pesquisa.

**Camada 2 — ~110 palavras-chave negativas** em 6 categorias (CSV `04`):
- *Informacional/estudante:* como fazer, o que é, resumo, tcc, redação, mapa mental, impactos ambientais…
- *Emprego/curso/negócio próprio:* vagas, salário, curso, franquia, como montar…
- *Curioso/residencial/gratuito:* grátis, perto de mim, ecoponto, prefeitura, cata-treco, doação, onde jogar…
- *Compra/venda de sucata:* comprar, vender, quanto vale, sucata paga…
- *Fora de escopo hospitalar:* resíduo hospitalar, lixo hospitalar, infectante, perfurocortante, seringas, medicamentos, radioativo… (a Ecobraz só coleta **eletrônicos hospitalares não contaminados** — atrair gerador de RSS é clique perdido e risco de imagem)
- *Fora da cobertura:* capitais e cidades distantes que aparecem nas buscas reais (rj, bh, curitiba, porto alegre…).

**Camada 3 — Copy que qualifica antes do clique:** todos os anúncios fixam na posição 2 um título qualificador ("Para Empresas com CNPJ", "Equipamentos Não Contaminados", "Linha Branca em Lote"). O anúncio hospitalar diz explicitamente *"Não coletamos resíduos infectantes ou químicos"* — quem tem RSS não clica. Nenhum anúncio promete nada fora do que as landings sustentam (inventário, custódia, relatório por mídia, MTR/CDF *quando aplicáveis*, retirada agendada).

**Camada 4 — Landing + formulário:** os CTAs das landings já enviam `?perfil=empresa` pré-selecionado ao `/agendamento/`, e o formulário pede volume estimado — o lead chega qualificado ao CRM.

## 5. Conversões (pré-requisito antes de ativar)

O site **já dispara os eventos** — falta só ligá-los ao Google Ads:

1. Instalar a **tag do Google** (gtag) no Ghost via *Code Injection* (ou confirmar GA4 existente) e ativar o **Modo de Consentimento** (LGPD).
2. Conversão principal: **`generate_lead`** — o `main.js` só dispara após o CRM confirmar o recebimento (sem falso positivo). Importar do GA4 ou criar ação de conversão própria. Contagem: *uma por clique*.
3. Conversões secundárias (**marcar como "não incluir em Conversões"**, só observação): `contact_whatsapp`, `contact_phone`, `form_start_coleta`.
4. Ativar **conversões otimizadas** (enhanced conversions) — o formulário coleta e-mail/telefone.
5. **Fase 2 de qualidade:** o payload do lead já traz `volume` (ex.: "Mais de 200 itens"). Quando o CRM permitir, importar conversão offline "lead qualificado" e passar a otimizar por ela — aí o Google aprende a achar *quem quer coleta agora*, não quem só preenche formulário.

## 6. Estratégia de lances — 3 fases

| Fase | Quando | Estratégia | Objetivo |
|---|---|---|---|
| 1 | Semanas 1–3 | Maximizar cliques com **teto de CPC R$ 4,00** | Coletar termos de pesquisa e primeiras conversões sem dar mão livre ao algoritmo |
| 2 | ≥ 15 conversões/30 dias | Maximizar conversões (sem meta) | Deixar o smart bidding aprender com o `generate_lead` |
| 3 | ≥ 30 conversões/30 dias | **CPA desejado** (começar ~20% acima do CPA real observado) | Custo por lead previsível; depois migrar a otimização para o lead qualificado (item 5.5) |

Não pular direto para tCPA sem histórico: com volume baixo, o algoritmo sem dados desperdiça — exatamente o que queremos evitar.

## 7. O que NÃO fazer (armadilhas clássicas deste nicho)

- **Não ativar correspondência ampla** na fase 1–2. Só considerar em fase 3, com tCPA maduro e conversão qualificada — e mesmo assim num grupo separado.
- **Não aceitar "aplicações automáticas" do Google** (recomendações auto-aplicadas): desativar em Configurações da conta. Elas adicionam amplas e públicos que dispersam o orçamento.
- **Não usar Performance Max** para este objetivo por enquanto: sem conversão offline qualificada, PMax otimiza para preenchedores de formulário, não para coletas.
- **Não mandar clique para a home.** Cada grupo tem sua landing.

## 8. Rotina semanal anti-desperdício (30 min)

1. **Termos de pesquisa:** negativar tudo que for informacional, residencial-unitário, fora de área. Padrões novos → adicionar à lista compartilhada.
2. **Vigiar o termo-cabeça** `"descarte de lixo eletrônico"` (frase): se depois de 4 semanas ele consumir >40% do custo com CTR <1% ou zero conversão, pausar a frase e manter só variantes com "empresa/corporativo".
3. **Leads no CRM:** marcar origem × qualidade (o UTM chega junto). Grupo que gera lead ruim → apertar copy/negativas antes de cortar.
4. **Parcela de impressões:** se >80% com orçamento sobrando, expandir horário ou termos; se <40%, subir teto de CPC nos grupos que convertem.

## 9. Expectativa realista

Com os volumes medidos (~3.500 buscas/mês relevantes na soma, sendo a maior parte no termo-cabeça misto), a expectativa honesta para a RMSP é de **centenas de cliques/mês, não milhares** — e é isso que queremos: pouco tráfego, certo. Benchmark inicial: CPC médio R$ 1,50–3,00; taxa de conversão da landing 3–8% (as páginas são de conversão); **8–25 solicitações de avaliação/mês** no primeiro trimestre, melhorando conforme o smart bidding amadurece. Se o funil confirmar, escala-se por orçamento e por expansão geográfica (o site já prevê "operações corporativas avaliadas em outras regiões").
