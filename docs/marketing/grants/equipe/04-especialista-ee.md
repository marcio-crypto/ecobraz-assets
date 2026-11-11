# 04 — Especialista em descarte de eletroeletrônicos (Grants Ecobraz)

Preparado em 29/10/2026. Só leitura: nada foi alterado na conta, no site ou no Drive.

## 0. Fontes usadas e o que vale cada uma

- **Termos de busca reais:** aba `termos_busca_30d` da planilha `1mcAzV4u…` (290 linhas, lidas em 29/10/2026). FATO.
- **Palavras ativas:** aba `palavras_30d`. Ela mostrou só a campanha "Compensação", com cerca de 300 palavras em correspondência ampla, várias de uma palavra só e em alemão/inglês, todas com status ENABLED e 0 impressões. FATO sobre o que a aba contém. Não sei se a campanha está ativa na conta: confirmar no Google Ads.
- **Volumes de busca:** Ahrefs Keywords Explorer, país BR, consultado em 29/10/2026. FATO que a ferramenta devolveu esses números, com 3 limites:
  1. É **média mensal nacional** (Brasil), não Grande SP.
  2. É estimativa da ferramenta, não dado do Google.
  3. "0" ou ausência significa "sem dado/baixo", não "ninguém busca". Os termos com cidade quase todos vieram 0 ou sem dado.
  Volume do **Planejador de Palavras-chave do Google** (dentro da conta) não foi consultado. É ele que deve calibrar a decisão final.
- **Escopo da operação:** páginas do site no repositório (`site-ghost/landing/landing-pages.json`, `site-ghost/theme/page-materiais-e-equipamentos-coletados.hbs`) e `docs/marketing/00-PLANO-MESTRE.md`. FATO sobre o que o site **diz**. Não confirmei com o Marcio se a operação atual bate 100% com o site.
- **Legislação:** busca na web. Os sites oficiais (planalto.gov.br, camara.leg.br, ambiente.sp.gov.br) estão **bloqueados na rede desta sessão**, então trabalhei com transcrições secundárias (legjur, escritórios de advocacia, órgãos estaduais). Cada item na seção 4 diz o nível de confiança.

---

## 1. Como as pessoas buscam descarte (diagnóstico pelos termos reais)

### 1.1 O que os 290 termos dos últimos 30 dias mostram (FATO, contagem manual)

- Quase todos os termos tiveram **1 a 5 impressões**. O volume está pulverizado em cauda longa. Fora a marca, nenhum termo passou de 16 impressões.
- Os que mais apareceram: "descarte de eletronicos" (16 na PF), "lixo eletronico" (14), "recuperação de hd" (14, já negativado), "green eletron" (9), "reciclagem de eletronicos" (7).
- Conversões nos termos: "ecobraz" (6), "descarte de aparelho de raio x odontológico" (1) e "logistica reversa de pilhas e baterias" (1). Não sei qual ação de conversão contou essas 2 últimas, então **não dá para afirmar que foram leads reais**.
- **Tráfego errado que puxa o CTR para baixo:**

| Tema fora do escopo | Nº de termos distintos | Exemplos reais |
|---|---|---|
| Compra/venda/sucata | 21 | "onde vender sucata eletrônica em sp" (4 impr.), "compra de tv quebrada zona leste", "lugar que compra geladeira com defeito" |
| Móveis (o site diz que não busca) | 15 | "retirada de móveis velhos gratuito" (5 impr., 1 clique), "descarte de moveis osasco" |
| Pilhas (fora do portfólio desde 25/07/2026) | 11 | "onde descartar pilhas usadas em são paulo", "descarte de pilhas e baterias perto de mim" |
| Outras entidades/concorrentes (navegacional) | 10 | "green eletron" (2 cliques, US$ 2,12), "abree", "coopermiti", "ecotechno", "tupy reciclagem de baterias" |
| Cidades fora da área (campanhas "Brasil") | 9 | "descarte eletrônicos rio de janeiro" (3), "descarte lixo eletronico bh", "londrina", "recife", "fortaleza", "porto alegre", "df" |
| Ecoponto / cata-bagulho / prefeitura | 10 | "ecoponto zona norte", "como funciona o cata bagulho da prefeitura" |
| Toner/cartucho (fora do portfólio) | 4 | "reciclagem de toner de impressora" (3) |
| Recuperação de dados / HD | 2 | "recuperação de hd" (14 impr., já negativado), "recuperacao de hds" |
| Informacional genérico | 7+ | "reciclagem", "reciclavel", "como funciona a reciclagem de lixo eletronico" |

**Leitura:** a demanda certa existe, mas é miúda e espalhada. O maior risco para o CTR é a mistura com compra/venda, móveis, pilhas e serviço público. Isso se resolve com negativas e com grupos de anúncio bem fechados (seção 3).

### 1.2 Padrões de busca por categoria (termos reais + Ahrefs BR)

As pessoas físicas buscam em 4 formas. Volume Ahrefs BR por mês entre parênteses.

1. **"onde descartar X"**: o mais comum. "onde descartar lixo eletrônico" (500), "onde descartar eletrodomésticos" (200), "onde descartar celular velho" (200), "onde descartar geladeira velha" (150), "onde descartar tv quebrada" (100), "onde descartar maquina de lavar" (100), "onde descartar microondas" (90).
2. **"descarte de X"**: "descarte de lixo eletrônico" (2.500), "descarte de eletrodomésticos" (300), "descarte de geladeira" (250), "descarte de eletrônicos" (200–400 conforme a grafia), "descarte de maquina de lavar" (40–150).
3. **"retirada / coleta / recolhe"**, que é a intenção mais próxima da Ecobraz (vamos buscar): "descarte de eletrodomésticos gratuito" (250), "coleta de eletrodomésticos" (50), "coleta de geladeira velha" (30), "retirada de geladeira velha" (20). Nos termos reais apareceram "retirada de eletrodomésticos quebrados", "retirar eletrodomesticos usados", "empresa que recolhe lixo eletrônico" e "quem recolhe eletrodomésticos usados".
4. **"como descartar X"**: mais informacional. "como descartar celular velho" (150), "como descartar celular com segurança", "como descartar hd com segurança".

| Categoria | Termos-chave e volume (Ahrefs BR) | Observação |
|---|---|---|
| Eletrônicos gerais | descarte de lixo eletrônico 2.500 · onde descartar lixo eletrônico 500 · lixo eletronico descarte 350 · reciclagem de eletronicos 300 · reciclagem de lixo eletronico 250 | Maior volume e mais disputado |
| Celular | onde descartar celular velho 200 · como descartar celular velho 150 · descarte de celular 30 | Muita gente quer só levar a um ponto, não agendar coleta. Ver seção 5 |
| Computador/notebook | reciclagem de computadores 90 · descarte de computador 60 · descarte de computadores 40 · descarte de notebook 10 | Ponte para B2B (dados) |
| Monitor/TV | onde descartar tv quebrada 100 · descarte de tv 20 · onde descartar tv 20 · descarte de monitor ~0 | TV de tubo é o caso clássico de "ninguém aceita" |
| Impressora | descarte de impressora 20 · onde descartar impressora 20 | Termos reais: "impressora hp", "quebrada", "velha" |
| Geladeira/freezer | descarte de geladeira 250 · onde descartar geladeira velha 150 · onde descartar geladeira 50 · descarte de geladeira velha 30 · coleta de geladeira velha 30 · descarte de freezer ~0 | Melhor intenção da linha branca |
| Máquina de lavar | descarte de maquina de lavar 40–150 · onde descartar maquina de lavar 100 | Termo real: "retirada de maquina de lavar quebrada" |
| Fogão | onde descartar fogão velho 30 · descarte de fogão velho 20 | **O site não lista fogão** (ver seção 5) |
| Micro-ondas | onde descartar microondas 90 · descarte de microondas 40 | O site PF lista micro-ondas |
| Ar-condicionado | descarte de ar condicionado 20 · onde descartar ar condicionado ~0 | Volume baixo; desinstalação é a dúvida (seção 5) |
| Eletrodomésticos (guarda-chuva) | descarte de eletrodomésticos 300 · descarte de eletrodomésticos gratuito 250 · onde descartar eletrodomésticos 200 · coleta de eletrodomésticos 50 | "gratuito" é intenção forte e casa com a oferta PF |
| Baterias/nobreak | descarte de baterias 80 · descarte de baterias de lítio 10 · descarte de nobreak ~0 · descarte de bateria de carro 10 | Fica junto de "pilhas e baterias" (1.000), que é negativa |
| Dados/HD | destruição de hd 30 · descarte de hd 10 | Pouco volume; serviço pago |
| B2B | descarte de equipamentos eletrônicos 40 · descarte de equipamentos de ti 20 · descarte de lixo eletrônico para empresas 10 · descarte de ativos de ti 10 · descarte de servidores 10 | Volume B2B no Google é **muito baixo** |
| Documentação | lei 12305 400 · certificado de destinação final 90 · cadri cetesb 150 · mtr cetesb 20 · mtr sigor 20 · plano de gerenciamento de resíduos sólidos 100 · pnrs 3.000 | **Majoritariamente informacional/navegacional** (quem busca quer o site da CETESB ou o texto da lei). Risco alto para o CTR |
| Condomínio/escola/hospital | sem volume medido no Ahrefs | Demanda real chega por outros canais. No Google é nicho |

**Conclusão (confiança média):** no Grants, a PF de linha branca + eletrônicos na Grande SP é onde há volume com intenção de "venha buscar". No B2B o volume de busca é pequeno. Lá o Grants serve para captar o "chão de fábrica" (TI, facilities) com termos de ação ("descarte de computadores empresa", "coleta de lixo eletrônico para empresas"), não termos de lei.

---

## 2. Banco de palavras-chave para o Grants

**Regras aplicadas:**
- Sem palavra de uma palavra só.
- Só **frase** ("…") e **exata** ([…]).
- Acento e plural não precisam de variação, porque o Google trata como variante próxima. **FATO** conhecido do Google Ads; não reverifiquei a página de ajuda nesta sessão.
- Cada grupo deve apontar para a página dedicada que **já existe** no site (slugs verificados no repositório).

Legenda: **[E]** = exata · **"F"** = frase · (n) = volume Ahrefs BR por mês, quando verificado. Sem número = sem volume verificado.

### Campanha PF — Grande SP (geo: municípios da RMSP, ver 2.3)

**G1. Lixo eletrônico — coleta em casa** → `/coleta-gratuita/` ou `/coleta-de-lixo-eletronico/`
- [descarte de lixo eletrônico] (2.500) · "descarte de lixo eletrônico"
- [onde descartar lixo eletrônico] (500) · "onde descartar lixo eletrônico"
- [lixo eletrônico descarte] (350) · [descarte de eletrônicos] (200–400)
- "coleta de lixo eletrônico" (50) · "coleta de lixo eletrônico gratuita" (10) · "coleta de lixo eletrônico em casa"
- "empresa que recolhe lixo eletrônico" · "recolher lixo eletrônico" · "retirada de lixo eletrônico"
- "descarte de eletrônicos perto de mim" (30) · "onde jogar lixo eletrônico" · "onde jogar eletrônicos velhos"
- "ong lixo eletrônico" · "ong que recolhe eletrônicos" (termo real; casa com a natureza de OSCIP)
- "reciclagem de lixo eletrônico" (250), "reciclagem de eletrônicos" (300): **com cautela**. São mais informacionais; só manter se o CTR do grupo ficar ≥ 5%.

**G2. Geladeira e freezer** → `/descarte-de-geladeira-velha/`
- [descarte de geladeira] (250) · "descarte de geladeira" · [onde descartar geladeira velha] (150)
- "onde descartar geladeira" (50) · "descarte de geladeira velha" (30) · "coleta de geladeira velha" (30) · "retirada de geladeira velha" (20)
- "descarte de geladeira quebrada" · "onde descartar geladeira quebrada" · "descarte de geladeira gratuito"
- "retirar geladeira velha" · "quem recolhe geladeira velha" · "doar geladeira quebrada" (termo real)
- "descarte de freezer" · "onde descartar freezer" · "descarte de freezer horizontal" · "descarte de frigobar"

**G3. Máquina de lavar e secadora** → `/descarte-de-maquina-de-lavar/`
- [descarte de maquina de lavar] (40–150) · [onde descartar maquina de lavar] (100)
- "descarte de maquina de lavar roupa" · "retirada de maquina de lavar quebrada" · "descarte de tanquinho" · "descarte de secadora de roupa" · "descarte de lava e seca"

**G4. Micro-ondas e pequenos eletrodomésticos** → `/descarte-de-eletrodomesticos/`
- [onde descartar microondas] (90) · "descarte de microondas" (40) · "onde descartar microondas quebrado"
- "descarte de air fryer" · "como descartar air fryer" (termo real) · "descarte de liquidificador velho" · "descarte de ventilador quebrado" · "descarte de aspirador de pó"
- (Itens pequenos: ver dúvida na seção 5. Se a Ecobraz só busca a partir de certo volume, este grupo atrai pedido inviável.)

**G5. Eletrodomésticos (guarda-chuva)** → `/descarte-de-eletrodomesticos/`
- [descarte de eletrodomésticos] (300) · [descarte de eletrodomésticos gratuito] (250) · [onde descartar eletrodomésticos] (200)
- "coleta de eletrodomésticos" (50) · "coleta de eletrodomésticos usados" (50) · "retirada de eletrodomésticos quebrados" · "retirada de eletrodomésticos gratuito"
- "onde descartar eletrodomésticos quebrados" · "quem recolhe eletrodomésticos usados" · "empresa que recolhe eletrodomésticos"
- "descarte de linha branca"

**G6. Fogão** → **NÃO ATIVAR até confirmar** com o Marcio (o site não lista fogão)
- "onde descartar fogão velho" (30) · "descarte de fogão velho" (20) · "descarte de fogão" · "retirada de fogão velho"

**G7. Ar-condicionado** → `/descarte-de-ar-condicionado/`
- "descarte de ar condicionado" (20) · "descarte de ar condicionado split" · "descarte de ar condicionado de janela" · "onde descartar ar condicionado" · "retirada de ar condicionado velho"

**G8. TV e monitor** → `/descarte-de-televisao/`
- [onde descartar tv quebrada] (100) · "descarte de tv" (20) · "onde descartar tv" (20) · "onde descartar tv velha" (20)
- "descarte de tv de tubo" · "descarte de tv quebrada" · "onde descartar televisão" (10) · "descarte de televisão velha" (10)
- "descarte de monitor" · "onde descartar monitor velho" · "descarte de tv usada"

**G9. Computador e notebook (casa)** → `/coleta-de-computadores-e-notebooks/`
- "descarte de computador" (60) · "descarte de computador velho" · "onde descartar computador velho" (10)
- "descarte de notebook" (10) · "onde descartar notebook velho" · "o que fazer com notebook quebrado" (termo real)
- "descarte de cpu velha" · "descarte de gabinete de computador"

**G10. Celular e tablet** → `/descarte-de-celulares-e-tablets/`
- [onde descartar celular velho] (200) · [como descartar celular velho] (150) · "descarte de celular" (30) · "descarte de celular velho" (20)
- "como descartar celular com segurança" · "onde descartar celulares usados" · "onde jogar celular velho" · "descarte de tablet"
- Risco: quem tem **1 celular** quer um ponto de entrega. Se a Ecobraz só faz coleta domiciliar com volume mínimo, este grupo gera pedidos inviáveis e frustração (seção 5).

**G11. Impressora** → `/descarte-de-impressoras/`
- "descarte de impressora" (20) · "onde descartar impressora" (20) · "onde descartar impressora velha" · "onde descartar impressora quebrada" · "descarte de impressora hp" · "descarte de multifuncional"

**G12. Mudança, espólio, limpeza de casa (HIPÓTESE; sem volume verificado)** → `/coleta-gratuita/`
- "descarte de eletrônicos mudança" · "o que fazer com eletrodomésticos velhos" · "esvaziar apartamento eletrodomésticos" · "retirada de eletrodomésticos mudança"
- Testar com orçamento pequeno. Se não tiver impressões em 30 dias, remover.

### Variações por cidade (aplicar só em G1, G2, G5 e G8, os grupos de maior volume)

Os termos com cidade têm volume nacional ~0 no Ahrefs. Mesmo assim, são o que as pessoas digitam: os termos reais trazem "osasco", "santo andré", "zona leste", "zona norte", "sp". Usar em **frase**, na forma `"[núcleo] [cidade]"`:

- Núcleos: `descarte de lixo eletrônico`, `coleta de lixo eletrônico`, `onde descartar lixo eletrônico em`, `descarte de geladeira`, `descarte de eletrodomésticos`, `onde descartar tv`
- Cidades e regiões:
  - sp · são paulo · zona norte · zona sul · zona leste · zona oeste
  - guarulhos · osasco · abc · santo andré · são bernardo do campo · são caetano do sul · diadema · mauá
  - barueri · alphaville · carapicuíba · cotia · taboão da serra · embu das artes · itapevi
  - mogi das cruzes · suzano · itaquaquecetuba · ferraz de vasconcelos · arujá
  - caieiras · franco da rocha · mairiporã
- O site já tem páginas de cidade: `/coleta-de-lixo-eletronico-em-sao-paulo/`, `-em-guarulhos/`, `-osasco/`, `-no-abc/` (e `-em-campinas/`). Direcionar cada variação de cidade para a página da cidade sobe a relevância. Impacto esperado: CTR um pouco maior nesses termos (confiança baixa a média; volume pequeno).
- Não criar centenas de combinações. Começar com ~6 núcleos × 12 cidades principais (~72 palavras) e cortar em 30 dias o que ficar sem impressão.

### Campanha B2B — "Empresa | Grandes volumes" (geo: definir com o Marcio; ver seção 5)

**G13. Empresa trocando parque de TI** → `/descarte-corporativo-de-ti/` ou `/descarte-de-ativos-de-ti-desmobilizados/`
- "descarte de computadores empresa" · "descarte de equipamentos de ti" (20) · "descarte de equipamentos eletrônicos" (40) · "descarte de ativos de ti" (10)
- "descarte de lixo eletrônico para empresas" (10) · "coleta de lixo eletrônico para empresas" · "empresa de coleta de lixo eletrônico" (termo real) · "empresas de descarte de lixo eletrônico" (termo real)
- "descarte de servidores" (10) · "descarte de notebooks corporativos" · "desmobilização de data center" · "descarte de equipamentos de informática"
- "reciclagem de computadores" (90): ambíguo entre PF e empresa. Testar aqui.

**G14. Condomínio** → `/para-condominios/`
- "coleta de lixo eletrônico em condomínio" · "lixo eletrônico condomínio" · "ponto de coleta de lixo eletrônico condomínio" · "descarte de eletrônicos condomínio" · "campanha de lixo eletrônico condomínio"

**G15. Escola, universidade, hospital** → `/descarte-de-equipamentos-hospitalares/` e `/solucoes-por-setor/`
- "descarte de equipamentos hospitalares" · "descarte de equipamento médico eletrônico" · "descarte de aparelho de raio x odontológico" (converteu 1×, **depende de confirmação**, seção 5)
- "descarte de computadores escola" · "lixo eletrônico na escola" (risco: trabalho escolar. Usar só se negativar "trabalho/projeto/cartaz")

**G16. Dados e HD (serviço pago)** → `/destruicao-de-dados/`, `/sanitizacao-segura-de-dados/`
- "destruição de hd" (30) · "descarte de hd" (10) · "como descartar hd com segurança" · "destruição de hd com certificado" · "trituração de hd" · "descarte seguro de dados"

**G17. Baterias e nobreak** → `/descarte-de-baterias-e-nobreaks/`
- "descarte de baterias" (80) · "descarte de baterias de lítio" (10) · "descarte de bateria de lítio" · "onde descartar bateria de lítio"
- "descarte de nobreak" · "descarte de baterias de nobreak" · "descarte de baterias estacionárias" · "descarte de bateria de empilhadeira"
- "reciclagem de baterias" (termo real, 1 clique)
- "descarte de bateria de carro" (10) e "descarte de baterias automotivas": o site lista automotivas, mas confirmar se vale para PF (seção 5)
- **Toda palavra deste grupo precisa da negativa "pilha/pilhas"** (seção 3)

### Campanha "Empresa | Obrigações e documentação" (cautela: ler a seção 4)

**G18. Documentação de descarte (intenção de compra)** → `/documentacao-e-rastreabilidade/`
- "certificado de destinação final" (90) · "certificado de destinação final de resíduos" (10) · "cdf de resíduos eletrônicos"
- "empresa que emite cdf" · "descarte de eletrônicos com certificado" · "descarte de lixo eletrônico com mtr" · "descarte com laudo de destinação"

**G19. Logística reversa / lei (informacional; usar só com página de conteúdo e CTA)** → `/logistica-reversa/`
- "logística reversa de eletroeletrônicos" (10) · "logística reversa de eletrônicos para empresas" · "obrigação de descarte de lixo eletrônico empresa" · "lei de descarte de lixo eletrônico" · "política nacional de resíduos sólidos eletrônicos"
- **Não usar:** [pnrs] (3.000), "lei 12305" (400), "cadri cetesb" (150), "mtr cetesb"/"mtr sigor"/"sigor cetesb". Motivo: são buscas de quem quer o texto da lei ou o sistema da CETESB (o Ahrefs marca cadri/mtr como **navegacional/branded**). Gastam impressão e derrubam o CTR. Confiança média a alta.

### 2.3 Observações de estrutura (HIPÓTESE, para a equipe de conta validar)

- A campanha PF hoje usa **raio de 40 km do centro de SP**. O site e o kit de diretórios dizem "raio de ~150 km" e há página de Campinas. Mogi das Cruzes (~50 km), Santa Isabel e parte do ABC ficam no limite ou fora dos 40 km. Sugestão: segmentar **por lista de municípios** em vez de raio, e só depois que o Marcio confirmar a área real de coleta PF.
- Hoje existem só 2 grupos na PF (Eletrodomésticos, Eletrônicos). Separar em G1–G12 permite anúncio com o nome do item no título ("Descarte de geladeira velha — buscamos em casa"). Impacto esperado: CTR e Índice de Qualidade maiores nos grupos de linha branca. Confiança média (é a prática padrão do Ads, mas o volume é pequeno e o efeito não foi medido aqui).

---

## 3. Palavras NEGATIVAS

Negativas podem ter uma palavra só: a proibição do Grants vale para palavras-chave positivas. Aplicar como **lista compartilhada de negativas no nível da conta**, salvo quando indicado.

### 3.1 Compra e venda (lista de conta)
compro · compra · comprar · comprador · compramos · vender · venda · vendo · vende · vendas · quanto paga · quanto vale · preço do kg · valor do kg · kg do cobre · cotação · sucateiro · ferro velho · olx · mercado livre · enjoei · leilão · "geladeira usada barata" · "comprar geladeira usada" · "loja de eletrodomésticos usados" · seminovo · seminova · troca · "troco"

> **Justificativa:** 21 termos reais de compra/venda em 30 dias. O próprio site diz "Não compramos sucata". Quem quer vender não agenda doação.
> **Polêmica: "sucata".** Recomendo negativa **ampla na PF** e **frase "venda de sucata"/"compra de sucata"** no B2B. Na PF, quase toda busca com "sucata" é para vender (termos reais: "sucata digital sp", "sucata de geladeira"). No B2B, um técnico pode buscar "descarte de sucata eletrônica" com intenção de descarte. Se negativar "sucata" amplo no B2B, essa pessoa some.
> **Polêmica: "usado/usada".** **NÃO negativar** a palavra isolada: "descarte de geladeira usada" e "coleta de eletrodomésticos usados" são termos bons. Negativar só as frases de compra acima.

### 3.2 Conserto e assistência técnica (lista de conta)
conserto · consertar · assistência técnica · assistencia · autorizada · manutenção · reparo · técnico de geladeira · técnico de máquina de lavar · peça · peças · "placa de geladeira" · "compressor de geladeira" · gás de geladeira · recarga de gás · instalação de ar condicionado · "limpeza de ar condicionado" · desbloqueio · "tela de celular" · troca de tela · recuperação de dados · recuperação de hd · "recuperar arquivos"

> **Polêmica: "placa".** Não negativar a palavra isolada: "descarte de placas eletrônicas" é serviço B2B real (`/descarte-de-placas-e-componentes-eletronicos/`). Negativar só as frases de conserto.
> **"instalação de ar condicionado"**: negativar. Mas a **desinstalação** pode ser uma dúvida legítima da PF (ver seção 5). Não negativar "desinstalar".

### 3.3 Emprego (lista de conta)
emprego · empregos · vaga · vagas · trabalhe conosco · salário · currículo · contrata · contratando · "auxiliar de coleta" · catador · "jovem aprendiz" · estágio · concurso

> "auxiliar de coleta" tem 450 buscas/mês no Ahrefs BR. É emprego de coleta de sangue/lixo.

### 3.4 Itens fora do escopo declarado (lista de conta)
pilha · pilhas · lâmpada · lâmpadas · lampada · toner · cartucho · cartuchos · óleo · oleo · isopor · vidro · remédio · remédios · medicamento · medicamentos · colchão · colchao · sofá · móveis · moveis · móvel · entulho · madeira · pneu · pneus · roupa · roupas · "lixo hospitalar" · "resíduos de saúde" · perfurocortante · seringa · "chapa de raio x" · "filme de raio x" · radiografia · radioativo · tinta · solvente

> **Polêmica: pilhas.** FATO: a Ecobraz **não coleta pilhas domésticas** (decisão do Marcio em 25/07/2026, `00-PLANO-MESTRE.md`; o site declara isso em todas as páginas). Por isso "pilha/pilhas" fica como negativa ampla em toda a conta. Isso bloqueia "descarte de pilhas e baterias" (1.000/mês), que é exatamente quem vai chegar e ouvir "não aceitamos".
> **Ponto de atenção:** "logistica reversa de pilhas e baterias" teve 1 conversão. Pode ser um fabricante ou importador (há página `/logistica-reversa-para-fabricantes-e-importadores/`). Mesmo assim, o tema é pilha, que está fora do portfólio. **Confirmar com o Marcio** antes de manter.
> **Polêmica: móveis.** 15 termos reais de móveis em 30 dias, inclusive "descarte de móveis e eletrodomésticos". Negativar "móveis" bloqueia esse misto. Recomendo bloquear mesmo assim: o site diz "Não buscamos: móveis", e quem quer tirar o sofá junto vai se frustrar e não converte. Confiança média.
> **Polêmica: raio-x.** "chapa/filme de raio x" e "radiografia" são filme radiográfico (o caso de "onde descartar raio x", 200/mês), e não aparelho eletrônico: negativar. O **aparelho** de raio-x odontológico converteu 1 vez e fica em G15, pendente de confirmação.

### 3.5 Serviço público, ecoponto, cata-bagulho

Lista **da campanha PF**, com teste controlado opcional:
prefeitura · cata bagulho · cata-bagulho · catabagulho · ecoponto · ecopontos · "coleta seletiva" · "dia da coleta" · "horário da coleta" · [coleta de lixo] (usar **exata**: em frase ou ampla ela bloquearia "coleta de lixo eletrônico", que contém a mesma sequência) · sabesp · limpurb · "loga" · "amlurb"

> **Polêmica.** FATO: os 10 termos reais de ecoponto/cata-bagulho tiveram **0 cliques**. "cata bagulho" tem 450 buscas/mês e "ecoponto" 2.600 (Ahrefs BR).
> HIPÓTESE: parte dessas pessoas tem uma geladeira que o cata-bagulho não levou e aceitaria a Ecobraz. A taxa de clique delas, porém, é baixa (querem o serviço da prefeitura), o que pesa contra a regra de CTR do Grants.
> **Recomendação:** negativar já. Se o CTR da conta passar com folga de 5%, testar por 30 dias um grupo isolado "alternativa ao cata-bagulho" com 2–3 palavras exatas ([cata bagulho geladeira], [ecoponto aceita geladeira]) e cortar se o CTR ficar < 5%.

### 3.6 Navegacional de outras organizações (lista de conta)
green eletron · greeneletron · abree · coopermiti · ecotechno · circulare · tupy · "meta reciclagem" · "sucata digital" · ambipar · malibrasil · ecoassist · "reciclanip" · "programa recicle" · "vivo recicle" · "samsung recicla" · "apple trade in" · shopee · "ponto de coleta shopee" · "ponto de coleta mercado livre" · "correios" (frase: ver nota)

> **Por quê:** quem busca o nome de outra entidade quer o site dela. "green eletron" teve 2 cliques (US$ 2,12) e 0 conversão. "ponto de coleta shopee/mercado livre" soma milhares de buscas/mês no Ahrefs e não tem relação com descarte.
> **"correios":** só negativar se a equipe confirmar que a Ecobraz não quer promover o envio pelos Correios (o site menciona essa opção para quem é de fora da Grande SP).

### 3.7 Geográficas (campanhas PF; e B2B se a coleta B2B não for nacional)
rio de janeiro · rj · belo horizonte · bh · minas gerais · curitiba · londrina · porto alegre · recife · fortaleza · salvador · brasília · df · goiânia · manaus · belém · florianópolis · campinas* · sorocaba* · santos* · ribeirão preto · são josé dos campos*

> FATO: 9 termos de outras cidades apareceram nas campanhas "Brasil". A segmentação geográfica é a 1ª defesa; a negativa cobre quem está em SP e busca outra cidade.
> *Campinas, Sorocaba, Santos e São José dos Campos ficam dentro dos "~150 km" do site e há página de Campinas. **Não negativar antes de o Marcio confirmar** se a coleta PF chega lá.

### 3.8 Informacional / escolar (lista de conta)
trabalho escolar · cartaz · redação · tcc · monografia · artigo · pdf · resumo · brainly · "o que é" · "o que significa" · "tipos de reciclagem" · "símbolo da reciclagem" · "cores da reciclagem" · desenho · "projeto escolar" · "educação infantil" · "atividade" · "dia do meio ambiente"

> **Polêmica: "como".** Não negativar ("como descartar celular velho" é bom). Negativar só os modificadores de pesquisa escolar.

### 3.9 Outros ruídos (lista de conta)
"coleta domiciliar" (exata) · "coleta de sangue" · exame · laboratório · "tornozeleira" · "retirada de passaporte" · "retirada na loja" · "descartar sinonimo" · "descartar em ingles" · "descarte irregular" · denúncia · multa (só na PF) · "fita vhs" · "fitas vhs" · "dvd" · "cd"

> **"multa"** é negativa só na PF. No B2B, "multa por descarte irregular de lixo eletrônico empresa" pode ser intenção relevante.
> **"fita vhs"**: 3 impressões reais ("onde descartar fitas vhs em sp"). O site não diz se mídias magnéticas domésticas são aceitas. **Confirmar**; se aceitar, vira palavra positiva em vez de negativa.

---

## 4. Contexto regulatório para anúncios e páginas B2B

Cada item traz FATO (o que a norma diz, com fonte) e INTERPRETAÇÃO (o que isso significa para o texto do anúncio). Os sites oficiais estavam bloqueados nesta sessão. **Antes de publicar qualquer anúncio que cite artigo de lei, alguém deve conferir no texto oficial** (planalto.gov.br / cetesb.sp.gov.br).

### 4.1 Lei 12.305/2010 (PNRS)

- **FATO (confiança alta; texto reproduzido por várias fontes):**
  - art. 20: lista quem é obrigado a ter Plano de Gerenciamento de Resíduos Sólidos (PGRS). Inclui geradores industriais, de serviços de saúde e de mineração, e estabelecimentos comerciais e de serviços que gerem resíduos perigosos ou que, mesmo não perigosos, não se equiparem aos domiciliares.
  - art. 27, §1º: "a contratação de serviços de coleta, armazenamento, transporte, transbordo, tratamento ou destinação final de resíduos sólidos […] não isenta as pessoas físicas ou jurídicas referidas no art. 20 da responsabilidade por danos que vierem a ser provocados pelo gerenciamento inadequado".
  - Fontes: [LegJur, cap. III da Lei 12.305](https://www.legjur.com/legislacao/nivel/lei_00123052010/-capitulo-iii-das-responsabilidades-dos-geradores-e-do-poder-public) · [Normas Legais](https://www.normaslegais.com.br/juridico/responsabilidade-geradores-residuos-solidos.html)
- **FATO (confiança alta, conhecido; não reconferido no texto oficial nesta sessão):** o art. 33, VI obriga **fabricantes, importadores, distribuidores e comerciantes** de produtos eletroeletrônicos e seus componentes a estruturar a logística reversa.
- **INTERPRETAÇÃO para anúncio:**
  - Pode dizer: "Terceirizar o descarte não tira a responsabilidade da sua empresa — escolha quem documenta" (base: art. 27 §1º).
  - Não dizer: "toda empresa é obrigada a fazer logística reversa". A obrigação do art. 33 recai sobre quem **coloca o produto no mercado**, não sobre o escritório que usa computadores. O usuário corporativo tem dever de **gerenciamento adequado** (e de PGRS, se estiver no art. 20).

### 4.2 Decreto 10.240/2020 (logística reversa de eletroeletrônicos)

- **FATO (confiança alta):** o art. 1º trata de "sistema de logística reversa obrigatória de produtos eletroeletrônicos **de uso doméstico** e seus componentes". O art. 3º define uso doméstico como uso "próprio ou pessoal, residencial ou familiar, **exclusivamente de pessoa física**", em equipamentos de até **240 V**. O decreto também lista obrigações do consumidor, entre elas separar o produto e remover dados pessoais (o número exato do artigo não foi confirmado). Fontes: [Câmara — texto original](https://www2.camara.leg.br/legin/fed/decret/2020/decreto-10240-12-fevereiro-2020-789763-publicacaooriginal-160002-pe.html) · [Machado Meyer — análise](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/ambiental/novo-decreto-regulamenta-a-logistica-reversa-de-produtos-eletroeletronicos) · [Felsberg](https://www.felsberg.com.br/logistica-reversa-de-produtos-eletroeletronicos-e-regulamentada/)
- **INTERPRETAÇÃO para anúncio (importante):**
  - O Decreto 10.240 **não é a base certa** para anúncio "Empresa | Obrigações". O escopo dele é o eletroeletrônico doméstico, de pessoa física. Citar "Decreto 10.240 obriga sua empresa…" seria **enganoso**.
  - Uso correto: na campanha PF/conteúdo ("a lei prevê que o consumidor separe o aparelho e apague seus dados") e na página de fabricantes/importadores.
- **FATO (confiança média; fonte secundária):** o Decreto 10.936/2022 regulamenta hoje a PNRS (substituiu o 7.404/2010) e, segundo fonte secundária, passou a exigir MTR também nos sistemas de logística reversa. Não verifiquei no texto oficial.

### 4.3 MTR e CDF (federal)

- **FATO (confiança alta):** a Portaria MMA nº 280/2020 tornou o **MTR** (Manifesto de Transporte de Resíduos) obrigatório em todo o país a partir de **01/01/2021** para os geradores sujeitos a PGRS. Instituiu o **CDF** (Certificado de Destinação Final), que **é emitido pelo destinador**; a FAQ da ABREMA diz que transportador e armazenador temporário não podem emitir. Instituiu também o inventário anual, com declaração até **31/03**. Fontes: [Felsberg — MTR e Inventário](https://www.felsberg.com.br/mma-instituiu-o-manifesto-de-transporte-de-residuos-mtr-e-o-inventario-nacional-de-residuos-solidos/) · [Demarest](https://www.demarest.com.br/governo-federal-institui-o-manifesto-de-transporte-de-residuos-como-ferramenta-de-gestao-2/) · [FAQ ABREMA (PDF)](https://abrema.org.br/wp-content/uploads/2021/11/FAQ-completa-Sandra-rev.0.pdf) · [IMASUL-MS](https://www.imasul.ms.gov.br/?p=87004)
- **INTERPRETAÇÃO para anúncio:**
  - Pode dizer: "MTR e CDF por coleta, para o seu PGRS e auditoria" (o site já diz "MTR e CDF quando aplicáveis").
  - **Atenção:** se a Ecobraz faz triagem e envia para outro destinador final, quem emite o CDF, pela Portaria, é o destinador. O anúncio só pode prometer "CDF" se ficar claro **quem emite** (seção 5).

### 4.4 São Paulo: SIGOR/MTR e CADRI (CETESB)

- **FATO (confiança média a alta):** em SP o MTR é emitido no **SIGOR-MTR** da CETESB. Fonte: [guia SIGOR-MTR (Estre, PDF)](https://estre.com.br/wp-content/uploads/2020/12/SIGOR-Mo%CC%81dulo-MTR-Guia-ra%CC%81pido.pdf)
- **FATO (confiança média):** a CETESB publicou a DD 120/2016/C, com "procedimentos para o licenciamento ambiental de estabelecimentos envolvidos no sistema de logística reversa, **para a dispensa do CADRI** e para o gerenciamento dos resíduos de equipamentos eletroeletrônicos pós-consumo". Em 2025 publicou a DD 020/2025/C e a DD 077/2025/C, que tratam de instrumentos de controle de movimentação de resíduos. A 077/2025 diz que regras de emissão ou dispensa de CADRI para resíduos sujeitos à logística reversa sairão em **DD própria**. Não consegui ler o anexo da 120/2016 nem confirmar se ela segue vigente. Fontes: [DD 120/2016/C (SIGAM, PDF)](https://isigam.ambiente.sp.gov.br/sigam3/repositorio/506/documentos/DD-120-2016-C-010616.pdf) · [DD 077/2025/C (CETESB, PDF)](https://cetesb.sp.gov.br/wp-content/uploads/2026/01/DD-077.2025.C-Altera-parcialmente-a-DD-020.2025.C-sobre-instrumentos-de-controle-de-movimentacao-de-residuos-de-interesse-ambiental.pdf)
- **INTERPRETAÇÃO:**
  - **Não usar "CADRI" em anúncio** até alguém (consultor ambiental ou o Marcio) confirmar quando o CADRI se aplica a eletroeletrônico em SP hoje. Há sinal oficial de **dispensa** no pós-consumo, e prometer CADRI pode estar errado nos dois sentidos.
  - Também não usar "cadri cetesb" como palavra-chave (navegacional, seção 2).

### 4.5 Lei estadual SP 13.576/2009 ("lixo tecnológico")

- **FATO (confiança média a alta):** atribui responsabilidade pela destinação a quem produz, comercializa ou importa eletroeletrônicos. O escopo inclui produtos de **uso doméstico, industrial, comercial ou de serviços**. Fontes: [ALESP — texto](https://www.al.sp.gov.br/repositorio/legislacao/lei/2009/lei-13576-06.07.2009.html) · [ALESP — notícia de 15 anos](https://www.al.sp.gov.br/noticia/?id=480443)
- **INTERPRETAÇÃO:** útil para a página de fabricantes, varejo e importadores em SP. Para o usuário corporativo comum, vale de novo o argumento da PNRS (art. 27 §1º).

### 4.6 Sanções

- O repositório (`docs/marketing/03-pesquisa-mercado-precificacao.md`) cita o Decreto 6.514/2008. **NÃO verifiquei** os valores nesta sessão. Não usar números de multa em anúncio sem conferir no texto oficial.

### 4.7 A própria documentação da Ecobraz (pré-requisito antes de anunciar "documentação")

FATO, pela ficha `docs/institucional/DOCUMENTOS-ECOBRAZ.md` (atualizada em 12/08/2026):
- **CTF/IBAMA venceu em 10/09/2026.** A ficha não registra renovação. Hoje é 29/10/2026.
- A licença CETESB nº 11314 está marcada como "conferir documento".
- A licença de funcionamento da Prefeitura estava "em andamento".

Uma campanha "Empresa | Obrigações e documentação" leva o comprador exigente a pedir exatamente esses documentos (doc 24: "a causa única das derrotas B2B" foi o bloco regulatório). **Confirmar com o Marcio que o CTF foi renovado e atualizar a ficha antes de escalar essa campanha.**

### 4.8 Frases seguras para os anúncios B2B (rascunho; validar com o Marcio)

- "Coleta de eletrônicos para empresas na Grande SP — MTR e documentação por coleta" (só depois da confirmação do item 4.3 e da área)
- "Terceirizar o descarte não transfere sua responsabilidade (Lei 12.305, art. 27). Documente."
- "Descarte de TI com tratamento de dados e comprovante de destinação"
- **Evitar:** "obrigatório para toda empresa", "Decreto 10.240 exige", "CADRI incluso", "certificado aceito por qualquer auditor", qualquer valor de multa.

---

## 5. O que precisa ser confirmado com o Marcio (não supus)

**Itens aceitos**
1. **Fogão** é coletado? O site lista geladeira, freezer, lavadora, secadora e micro-ondas, mas **não fogão**. O G6 depende disso.
2. **Ar-condicionado:** a Ecobraz **desinstala** ou só retira o aparelho já solto? E o gás refrigerante: há algum procedimento ou restrição?
3. **Pequenos eletrodomésticos e itens isolados** (1 celular, 1 air fryer, 1 secador): vale coleta em casa ou a pessoa é orientada a usar ponto de entrega ou Correios? Se não há coleta para item avulso, os grupos G4 e G10 precisam de anúncio que diga isso.
4. **Bateria automotiva e de veículo elétrico de PF:** aceita? (O site lista automotivas no B2B.)
5. **Aparelho de raio-x odontológico** e outros equipamentos médicos: aceita? Com quais condições (declaração de não contaminação, remoção do tubo)? Teve 1 conversão.
6. **Fitas VHS, CDs, DVDs** (mídia doméstica): aceita ou não?
7. **"Logística reversa de pilhas e baterias"** converteu 1 vez. Mesmo assim fica fora (pilhas fora do portfólio)? Existe exceção para fabricante/importador?

**Área e prazo**
8. **Área real da coleta PF gratuita:** raio de 40 km (campanha) ou ~150 km (site)? Quais municípios estão dentro e quais fora (Campinas, Santos, Sorocaba, São José dos Campos, Jundiaí)?
9. **Área da coleta B2B:** nacional (o Plano-Mestre fala em 50–60 PJ/mês "nacional") ou só Grande SP? Isso define se as campanhas "Brasil" devem existir e quais cidades negativar.
10. **Prazo** real de coleta PF hoje: o site diz "retorno em 24h úteis" e há avaliação citando "menos de 10 dias". O anúncio pode prometer prazo?

**Volume e custo**
11. **Volume mínimo PF** para a coleta gratuita (nº de itens ou peso)? Há regra de "só linha branca grande vai de graça" ou algo parecido?
12. **Coleta expressa R$ 55**: continua valendo? Pode aparecer no anúncio?
13. **Volume mínimo e custo B2B** (condomínio, escola, empresa trocando parque de TI): é gratuito quando há material com valor e cobrado quando não há? Existe tabela ou faixa que possa ir para o anúncio?
14. **Mudança/espólio** (casa inteira): aceita? Retira de apartamento sem elevador?

**Documentação (pré-requisito da campanha "Obrigações")**
15. **CTF/IBAMA** foi renovado depois de 10/09/2026?
16. **Licença CETESB 11314**: qual é a licença, de qual unidade, com qual validade?
17. **Quem emite o CDF:** a Ecobraz, como destinadora, ou o destinador final a jusante? E o **MTR** é emitido pela Ecobraz no SIGOR em toda coleta B2B?
18. **CADRI:** a Ecobraz tem ou precisa ter, para os resíduos que recebe? (Seção 4.4: não está claro.)

**Conta**
19. A campanha **"Compensação"** (ampla, palavras de uma só palavra, alemão e inglês) ainda está **ativa** na conta? A aba mostra ENABLED com 0 impressões. Se estiver ativa, ela é risco de política do Grants (palavra de uma palavra só) e deve ser pausada (decisão de quem administra a conta).

---

## 6. Recomendações (o quê · por quê · impacto · risco)

| # | O que fazer | Por quê (dado/fonte) | Impacto esperado (confiança) | Risco |
|---|---|---|---|---|
| 1 | Subir a **lista de negativas da seção 3** como lista compartilhada na conta (compra/venda, conserto, emprego, fora de escopo, órgãos públicos, outras entidades, escolar) | 70+ termos reais em 30 dias eram compra/venda, móveis, pilhas, outras entidades ou outras cidades, com 0 conversão | CTR da conta sobe; menos pedidos que a Ecobraz recusa (alta para a direção, baixa para o tamanho: o volume é pequeno) | Bloquear algo útil. Por isso as polêmicas (sucata, usado, placa, multa, Campinas) foram tratadas à parte |
| 2 | Dividir a PF em **grupos por item** (G1–G11), cada um com a sua página dedicada | Hoje há 2 grupos para tudo. As páginas por item já existem no site | Mais relevância → melhor Índice de Qualidade, que é o gargalo apontado no brief (perda por classificação ~90%) (média) | Muitos grupos com pouco volume. Começar pelos de maior volume (G1, G2, G5, G8, G10) |
| 3 | **Tirar termos de lei/CETESB** (pnrs, lei 12305, cadri cetesb, mtr sigor) e manter na campanha "Obrigações" só termos de ação (CDF, descarte com MTR, para empresas) | O Ahrefs marca cadri/mtr como navegacional/branded; pnrs (3.000) e lei 12305 (400) são de estudo | Evita queda de CTR na campanha B2B (média) | Menos impressões nessa campanha. É aceitável, porque impressão sem clique prejudica a regra dos 5% |
| 4 | **Não citar o Decreto 10.240 como obrigação da empresa**. Usar a Lei 12.305 art. 27 §1º como gancho B2B; **não citar CADRI** | O decreto vale para uso doméstico de pessoa física; o CADRI tem sinal de dispensa no pós-consumo (DD 120/2016) | Evita anúncio enganoso que um comprador técnico derruba na hora (alta) | Nenhum relevante |
| 5 | **Resolver as pendências da seção 5 antes de escalar**: principalmente CTF/IBAMA, área de coleta, fogão, item avulso e quem emite o CDF | O CTF venceu em 10/09/2026 segundo a ficha; o raio de 40 km ≠ "150 km" do site; fogão não está no site | Evita gastar o Grants trazendo pedidos que a operação recusa e evita promessa documental sem lastro (alta) | Atrasa a escala da campanha B2B em alguns dias |

---

## 7. Balanço honesto

- **Feito e verificado:**
  - Leitura dos 290 termos reais e das palavras ativas.
  - Volumes Ahrefs BR para ~120 termos (estimativa nacional).
  - Escopo de aceite conforme o **site** (no repositório).
  - Normas citadas com fonte secundária e nível de confiança.
- **Não verificado:**
  - Volume do Planejador do Google e volume local da Grande SP.
  - Texto oficial das normas (sites gov bloqueados nesta sessão).
  - Se a DD 120/2016 da CETESB segue vigente.
  - Qual ação de conversão contou as 2 conversões não-marca.
  - Se a campanha "Compensação" está ativa.
- **Depende do Marcio:** todos os itens da seção 5.
- **Depende de terceiros:** liberar na rede da sessão os domínios planalto.gov.br, camara.leg.br, cetesb.sp.gov.br e ambiente.sp.gov.br, se a equipe quiser que eu confira o texto oficial das normas.
