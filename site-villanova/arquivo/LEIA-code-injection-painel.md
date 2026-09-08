# Arquivo — bloco de Code injection do painel do Ghost da Villanova

Cópia literal do que estava em **Settings → Code injection → Site header** do
Ghost da Villanova em **08/09/2026**, guardada antes de o Marcio apagar.
O arquivo ao lado (`code-injection-painel-2026-09-08.html`) é o bloco inteiro,
sem uma vírgula alterada.

## Por que existia

Nasceu quando o site rodava o tema **Source**, o padrão do Ghost. Naquele
momento não havia tema versionado: todo o visual (cabeçalho, navegação,
rodapé, tipografia, largura das páginas, responsividade) tinha de ser
empurrado por CSS no painel, e os dados estruturados também.

## Por que saiu

Duas razões, e as duas foram conferidas no HTML servido em 08/09/2026:

1. **O CSS ficou órfão.** Ele mira classes do tema Source —
   `.gh-head`, `.gh-foot`, `.gh-canvas`, `.gh-content`, `.kg-html-card`,
   e as classes próprias `.ve-homepage` e `.ve-resource-page`. O tema atual
   não usa nenhuma delas: usa `.topbar`, `.site-footer`, `.wrap`, `.brand`.
   Conferido em seis páginas ao vivo (home, /marcio-villanova/, dois artigos,
   /pt/ e /it/): em todas, as únicas classes presentes eram `topbar` e
   `site-footer`. Nenhuma regra desse CSS tinha em que pegar.

2. **O JSON-LD virou duplicata conflitante.** O `theme/default.hbs` já serve o
   `@graph` da marca em todas as páginas. O bloco do painel servia um segundo,
   com valores DIFERENTES para o mesmo identificador: o nó de serviço
   `#supplier-evidence-review-service` aparecia como "EU Buyer-Ready Supplier
   Evidence Review" aqui e "Supplier Evidence File Assessment" no tema, e o
   site era declarado só em inglês em vez de en/pt-BR/it. Dois nós com o mesmo
   `@id` e conteúdo divergente é pior que nenhum: obriga o Google a escolher.

## O que NÃO se perdeu ao apagar

Tudo o que este bloco tinha de vivo já está versionado:

- identidade visual → `theme/assets/css/main.css`, `v2.css`, `lang.css`
- `@graph` da marca, incluindo ORCID e o registro de perito → `theme/default.hbs`
- hreflang → aplicado por página pelo `scripts/aplica-hreflang.mjs`
- GA4, Consent Mode, Ahrefs e a meta de verificação do Ahrefs → `theme/default.hbs`

Conferido no HTML servido: gtag, Ahrefs e a verificação vêm todos do tema.

## Se algo quebrar

Cole o conteúdo de `code-injection-painel-2026-09-08.html` de volta em
Settings → Code injection → Site header e salve. Volta ao estado anterior.
