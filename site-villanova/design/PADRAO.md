# Padrão de Design Villanova v2 — APROVADO pelo Marcio em 30/07/2026

> REGRA PERMANENTE: toda página, template ou material novo da Villanova ESG
> segue este padrão. As referências renderizadas e aprovadas estão nesta
> pasta: `referencia-home-v2.html` (home) e `referencia-artigo-v2.html`
> (matéria). Antes de publicar qualquer página nova, renderizar prévia
> (Playwright) e conferir visualmente contra estas referências.

## Tokens (CSS custom properties)

```css
--navy:   #061426;  /* fundo escuro principal */
--navy2:  #0b2a52;  /* gradiente do navy */
--gold:   #b88a3d;  /* ação/acentos */
--gold-l: #d9b573;  /* dourado claro (sobre navy) */
--paper:  #faf8f4;  /* fundo claro (off-white quente) */
--ink:    #1a2634;  /* texto */
--mut:    #5b6b7c;  /* texto secundário */
--line:   #e6e0d4;  /* bordas */
```

Gradientes: herói/finais `radial-gradient(...#123a6b...) + linear-gradient(160deg, navy 55%, navy2)`;
botão `linear-gradient(135deg, gold, #a2762c)`; seção alternada `#f2eee6 → paper`.

## Tipografia

- Títulos (h1/h2/citações/números grandes): **serifada** (Georgia nas prévias;
  produção: serifada premium self-hosted — ex. Fraunces/Playfair)
- Corpo/UI: **Inter** (fallback system-ui)
- Eyebrow: 11px, caps, tracking .2em, dourado, com traço de 26px antes
- Corpo de artigo: 16.5px, line-height 1.7, coluna máx. 700px

## Ícones

Biblioteca própria inline SVG: stroke 1.8, round caps, 24×24, dourado
(#b88a3d claro / #d9b573 sobre navy). Conjunto em `icones.json` desta pasta.
NUNCA usar emoji nem bibliotecas externas de ícones.

## Componentes canônicos (ver referências para o CSS exato)

- **Topbar** navy: marca VILLANOVA ESG (dourado no "ESG") + nav + seletor
  PT·EN·IT + botão dourado "Começar →"
- **Herói**: fundo navy com radial azul + rota Brasil→Europa pontilhada;
  copy à esquerda; à direita um VISUAL DE PRODUTO (ex.: o "dossiê de
  evidências" com linhas de status RESPONDIDO/COM LASTRO/EM REVISÃO)
- **Faixa de provas** (estrip): 4 itens com ícone + número/fato
- **Cards**: fundo branco, radius 12, sombra suave, ícone em quadrado
  degradê creme, tag-pílula no canto
- **Escada SEMM**: níveis 0-4 com linha vertical conectando, nível ativo
  em dourado
- **Ponte**: 3 nós (Ecobraz Opera → Villanova Documenta [navy] → Comprador
  Decide) com ícones circulares e setas douradas
- **Faixa de números**: fundo navy, números grandes serifados dourados
- **Card-bandeira de serviço**: navy, largura total, CTA dourado
- **Seção do fundador**: foto com outline dourado + citação serifada +
  selos-pílula (Zenodo·DOI / ECESP / ORCID)
- **Fechamento**: navy radial, título serifado, UM disclaimer discreto
- **Artigo**: capa navy com ícone gigante da categoria + selo verde
  "Status legal verificado · data" + meta (tempo de leitura, autor,
  PT·EN·IT); corpo com h2 de barra dourada, kbox navy "o que mudou",
  pull-quote serifada, checklists ✓, tabela estilizada, FAIXA DOURADA de
  CTA no meio, trilha de fontes em card, box do autor, relacionados com
  capas em degradê por categoria; sidebar sticky (sumário + card do
  serviço do tema + "por que confiar")

## Regras de conteúdo no design

- Texto curto por bloco; máx. 3 itens por enumeração; 1 exemplo concreto
  por seção (setor, documento ou cena)
- CTA em degrau: pedido em mãos → /start/ · sem pedido → material gateado
- UM disclaimer por página, no fechamento, nunca colado no botão
- Selo "Status legal verificado + data" em todo conteúdo regulatório
- Sem preços (caso a caso) · sem WhatsApp (formulário é o canal) ·
  sem clientes nomeados sem autorização escrita · prova social só com
  fato verificável (18 DOIs, ECESP, desde 2011, 1 dia útil)

## Idiomas (adaptação, não tradução)

- **PT**: setores nomeados (aço, alumínio, café, soja, carne, couro,
  têxtil), urgência com data e conta ("faltam X meses"), "você/sua
  empresa", botão principal = fornecedor
- **EN**: sóbrio, factual, comprador europeu primeiro
- **IT**: formal-normativo (citar Reg. UE), filiere italianas (moda,
  caffè, meccanica, arredo), botão principal = azienda italiana
