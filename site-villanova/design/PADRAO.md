# Padrão de Design Villanova v2 — APROVADO pelo Marcio em 30/07/2026

> **Alteração aprovada em 09/09/2026 (Marcio, opção C): o dourado de TEXTO
> escureceu.** O dourado da marca continua o mesmo no ornamento; o que mudou é
> a cor do dourado quando ele é *texto*, porque a antiga reprovava no contraste
> mínimo do WCAG AA. Ver a seção "Cor e contraste" abaixo. As referências
> renderizadas desta pasta já estão com os valores novos.

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

## Cor e contraste (acrescentado em 09/09/2026, medido no site publicado)

**Existem TRÊS dourados, e confundi-los é o erro que já aconteceu.**

| token | valor | onde usar |
|---|---|---|
| `--gold` | `#b88a3d` | **ornamento**: filete, losango, borda de `h2`, contorno de foto, borda de card. Não é texto, o WCAG não pede contraste. É o dourado da marca e não mudou. |
| `--gold-txt` | `#8a6224` | **texto** sobre fundo claro: link, `.go`, `.rel-tag`, eyebrow em seção clara. |
| `--gold-b1` / `--gold-b2` | `#966d2b` / `#7d5920` | **gradiente de botão** com texto branco. |
| `--gold-l` | `#d9b573` | **só sobre fundo escuro** (hero, cartão navy). Nunca em caixa clara. |

**As duas referências de fundo, e elas não são as óbvias:**

- fundo claro de referência = **`#f2eee6`** (o bege do `.vn-boundary`), não o branco.
  É o mais escuro dos claros; quem passa nele passa em todos.
- fundo escuro de referência = **`#123a6b`** (a parada mais clara do gradiente do
  hero), não o navy. Mesma lógica, ao contrário.

**A regra que resume tudo:** cor de texto anda junto com o fundo em que ela vai
cair. Se você mudar o fundo de um componente, **redeclare a cor**.

**O erro real que isso já causou**, e vale ler porque nenhuma revisão de código
pega: o `v2.css` define `.vn-note` como cartão escuro (fundo navy, texto
`#c6d2e0`); o `main.css` define que dentro do artigo ele é cartão claro
(`#F4F6F2`) e **ganha por especificidade** — mas não redeclara a cor do texto.
Resultado servido: texto `#c6d2e0` sobre `#F4F6F2`, contraste **1,41**,
praticamente invisível, em toda página com nota. Só medindo a página montada.

**Não confie em promessa, inclusive na minha.** Eu havia reportado ao Marcio
"botão 3,12" como se fosse o único ponto abaixo do mínimo. Eram **dez regras**,
e o dourado explicava três. A `auditoria-navegador.mjs` agora mede o contraste
de todo texto da página, lê também as paradas de gradiente e fica com a pior, e
conta o resultado **por regra de CSS** (uma linha errada pinta dezenas de
elementos; o número por elemento assustaria sem informar).

Limites conhecidos do medidor, para ninguém tratar como laudo: texto sobre
**imagem** de fundo não é medido; opacidade e mistura de camadas não entram na
conta; fundo semitransparente é resolvido pelo primeiro ancestral opaco.

## Idioma: o `lang.css` só ESCONDE (regra reescrita em 09/09/2026)

O `lang.css` é gerado por `scripts/gera-idioma.mjs`. **Ele nunca declara
`display` no idioma que está ligado — só esconde os outros.**

Antes ele fazia o contrário: escondia tudo e religava o idioma da página com
`display:revert` (PT) ou `display:inline` (IT). Para isso funcionar era preciso
adivinhar o tipo de caixa de cada elemento, e vinham as exceções à mão
(`nav.only-it` vira flex, `div.only-it` vira flex, `.cols.only-it` vira grade).
Medindo o `display` calculado dos três idiomas na mesma página apareceram
**quatro defeitos de uma causa só, nenhum visível em inglês**:

| elemento | EN | PT | IT | efeito |
|---|---|---|---|---|
| `nav.main` | flex | **block** | flex | menu PT em duas linhas, em toda largura |
| `div.cols` | grid | **block** | grid | colunas do rodapé PT empilhadas |
| `a.top-cta` | flex | **block** | **block** | botão principal sem `inline-flex` |
| `div.legal` | block | block | **flex** | regra `div.only-it{flex}` ampla demais |

Se você sentir vontade de escrever `display:algo` no `lang.css` para "religar"
um idioma, é sinal de que o CSS de verdade está faltando — conserte lá.

**E não deixe regra de idioma fora do arquivo gerado.** Havia um
`.only-it{display:none!important}` escrito à mão no `v2.css`; com a lógica nova
nada religava o italiano e o site inteiro em italiano teria sumido. Quem pegou
foi a conferência de `display` nos três idiomas, não a leitura do código. Por
isso ela virou teste permanente da auditoria, junto com a de vazamento (um
idioma aparecendo na página do outro) e a de idioma vazio.

## Tabela dentro de artigo

Uma tabela **nunca** fica menor que a largura mínima das suas colunas, e
`overflow` nela corta a célula sem segurar a caixa. O `artigo.js` envolve toda
tabela num `<div class="tabela-rolavel">` que rola por dentro, em **qualquer**
largura — inclusive na faixa de 701px a 980px, que antes ficava sem regra. A
tabela continua com `width:100%` dentro do contêiner, então tabela estreita
continua esticando. Quem está sem JavaScript cai numa reserva em CSS que só
vale abaixo de 700px.

## Página de erro

`theme/error.hbs` existe desde 09/09/2026. Antes o Ghost servia a página de
erro dele: sem barra, sem rodapé, sem saída. A nova herda o `default.hbs` e
oferece rota nos três idiomas. Numa URL que não existe não há slug nem tag,
então nenhuma regra do `lang.css` casa e **o inglês é o que aparece** — isso é
proposital: é a língua padrão do site, e o seletor da barra continua ali.

## Celular (acrescentado em 08/09/2026, medido)

O padrão não tinha nenhuma regra de celular até aqui, e a falta custou caro:
toda página do site rolava para o lado no telefone, em todos os idiomas, e o
menu do topo desaparecia abaixo de 900px sem nada no lugar — as páginas de
serviço só eram alcançáveis rolando até o rodapé.

- **A barra do topo tem de caber.** Abaixo de 1025px: marca + seletor de idioma
  + botão do menu, e nada mais. O botão de pedido desce para dentro do painel.
  1025px não é número redondo: é a largura, medida de pixel em pixel, em que o
  cabeçalho em inglês (que precisa de 1026px) volta a caber.
- **Menu sanfona** abaixo de 1025px, painel navy abaixo da barra, links em
  linhas separadas por filete, e o botão dourado do padrão como último item.
  O painel precisa de `z-index` **acima de 999**: o banner de cookies é
  `position:fixed; z-index:999` e, medido em 360x640, cobria exatamente o botão
  dourado — a pessoa não conseguia tocar no CTA principal. E precisa de teto de
  altura com rolagem própria, medido pelo JavaScript e não chutado: a barra tem
  96px (padding 14 + 68 + 14), e um valor fixo errado deixou o último item 28px
  abaixo da tela no celular deitado.
- **Contraste do botão dourado (medido, e vale para o site inteiro):** `#fff`
  sobre `linear-gradient(135deg, gold, #a2762c)` dá **3,12** na ponta clara e
  **4,07** na escura. O WCAG AA pede 4,5 para texto normal, e o texto do botão
  (13,5–14px, peso 600–700) não conta como "texto grande". Isto **não é defeito
  de uma página**: é o botão canônico do padrão, usado em todo CTA do site
  (`v2.css:30`). Corrigir exige escurecer o dourado ou engrossar/aumentar o
  texto, e é decisão de marca do Marcio — não mexa por conta própria.
- **Cor sobre o botão dourado precisa de três classes.** `.topbar a` é
  `(0,1,1)` e vence um seletor de uma classe só; o texto saía cinza-azulado em
  vez de branco.
- **Foco de teclado:** o painel vem ANTES do botão no HTML, então abrir e
  apertar Tab pularia os links. Abrir manda o foco ao primeiro link; `Esc` e o
  fim da lista devolvem o foco ao botão.
- **Quem decide o idioma é o `lang.css`**, com `!important`. Nenhuma regra nova
  deve disputar `display` com ele em classe `only-en/only-pt/only-it` — perde.
  Use classe própria no recipiente. Foi assim que o menu apareceu esparramado
  na barra nas páginas PT e IT: `display:revert !important` venceu a regra de
  celular do `main.css`, que não era `!important`.
- **Desenho decorativo que sangra** (`.h2arc` na home, `.mark` no `page.hbs`)
  **já está resolvido e não precisa de regra nova**: `.hero` tem
  `overflow:hidden` (`main.css:45`) e `.article-head` também (`v2.css:87`), e as
  duas faixas do site são `<section class="hero h2hero">` e
  `<section class="hero page-hero">`. Em 08/09/2026 eu acrescentei um
  `overflow-x:clip` achando que esses SVGs empurravam a página; medi com e sem a
  regra e o resultado foi idêntico. Era inerte, e foi removida. (`.article-icon`
  existe no CSS mas **não tem markup** — é classe morta; não use esse nome.)
- **Passar da tela não é o mesmo que causar rolagem.** Um elemento pode
  ultrapassar a borda e não esticar o documento, se um ancestral o corta. Antes
  de culpar um elemento, confira se algum pai tem `overflow-x` diferente de
  `visible`. A `auditoria-navegador.mjs` já separa "culpados" de "contidos".
- **Conferir antes de publicar** em 320, 360, 390, 768, 900, 1024 e 1025px, nos
  três idiomas, com o menu fechado e aberto. `scripts/auditoria-navegador.mjs`
  faz isso no site publicado; a prévia local roda com o Chromium do ambiente.
- **NUNCA usar `isMobile` do Playwright** para essa conferência: ele ignora a
  tela pedida (390x844 vira 500x1080) e devolve resultado limpo e falso.
- **Item de flex não encolhe sozinho: sem `min-width:0` ele para na largura
  mínima do próprio conteúdo.** Esta foi a causa da última rolagem lateral que
  sobrou, medida em 09/09/2026. O `.article-layout` é criado em tempo de
  execução pelo `artigo.js` (não existe no `post.hbs`) e é `display:flex`; o
  `.article-body` é `flex:1` e nasce com `min-width:auto`. Bastava **uma** coisa
  larga e indivisível dentro do post — uma tabela, uma URL colada — para o corpo
  do artigo parar de encolher e empurrar a página inteira: 438px de conteúdo
  numa tela de 360. **No desktop nunca aparece**, porque sobra espaço, e por
  isso passou por todas as revisões anteriores. Todo item de flex que recebe
  conteúdo de terceiros precisa de `min-width:0` (o `.intake-main` já usava,
  `v2.css:235`).
- **Tabela nunca encolhe abaixo da largura mínima das colunas**, e `overflow`
  nela corta as células sem segurar a caixa. Depois do `min-width:0` a tabela
  voltou a esticar a página sozinha (365px de tabela para 320px de coluna). A
  regra que resolve é transformá-la em caixa que rola por dentro, e **só abaixo
  de 700px** — acima disso a coluna tem 620px ou mais e o desenho aprovado fica
  intacto: `@media(max-width:700px){.article-body table{display:block;width:100%;overflow-x:auto;overflow-y:hidden}}`.
  Limite conhecido: entre 701px e 980px não há regra; a tela de tablet em pé
  (768x1024) entrou na auditoria justamente para vigiar essa faixa.
- **Markdown cru publicado como texto é problema de layout, não só de revisão.**
  Um `([site.com](https://site.com/pagina/muito/longa))` no meio do parágrafo é
  um trecho indivisível de quase 400px. O `overflow-wrap:break-word` do
  `.article-body` impede o estrago, mas o leitor continua vendo a sintaxe.
  `scripts/procura-markdown-cru.mjs` encontra esses casos (só leitura).

## Idiomas (adaptação, não tradução)

- **PT**: setores nomeados (aço, alumínio, café, soja, carne, couro,
  têxtil), urgência com data e conta ("faltam X meses"), "você/sua
  empresa", botão principal = fornecedor
- **EN**: sóbrio, factual, comprador europeu primeiro
- **IT**: formal-normativo (citar Reg. UE), filiere italianas (moda,
  caffè, meccanica, arredo), botão principal = azienda italiana
