# Search Console de 15/10/2026 — o que foi medido e o que falta fazer

## O que o Google mandou

Quatro e-mails de `sc-noreply@google.com` em 15/10/2026, 12:26–12:27 UTC:

| # | Site | Assunto | Leitura |
|---|---|---|---|
| 1 | ecobraz.org | "Bloqueada devido a outro problema 4xx" validada como corrigida (1 página) | boa notícia |
| 2 | ecobraz.org | **"Erro no servidor (5xx)": a validação FALHOU** | problema |
| 3 | ecobraz.org | Motivos novos: 404, página com redirecionamento, página alternativa com canônica adequada, cópia com canônica diferente | misto |
| 4 | villanovaesg.com | "Bloqueada pelo robots.txt" validada como corrigida (4 páginas) | boa notícia |

## O que foi medido ao vivo

Rodado em 15/10/2026 12:55 UTC pelo workflow de auditoria de indexação
(`site-ghost/scripts/diagnostico-search-console.mjs`), num runner do GitHub.

- **288 URLs do sitemap: todas 200.** Zero 4xx, zero 5xx, zero redirect, zero
  sem resposta.
- **Estabilidade:** 11 URLs lidas 5 vezes cada, todas estáveis, 28–168 ms.
- **Pressão:** 24 requisições rápidas (12 em paralelo) — 24/24 em 200. Nenhum
  429, nenhum 503. A origem **não** quebra sob rastreamento rápido.
- **Links internos:** 53 destinos fora do sitemap, nenhum quebrado.
- **Canônicas das variantes de querystring:** corretas. `?origem=`, `?gclid=`,
  `?gad_source=`, `?utm_*` e o lixo legado `?option=com_k2` todos devolvem
  canônica limpa, sem parâmetro.

Conclusão: os motivos 3 e 4 do e-mail (canônica/cópia) são **benignos** — é o
comportamento certo, o Google só está relatando. O motivo "página com
redirecionamento" também: nenhuma URL do sitemap redireciona.

## O que estava realmente quebrado

A varredura do sitemap não achou os 404 porque **as URLs que o Google reclama
não estão no sitemap**. Elas são URLs legadas, conhecidas por links externos.

Cruzando a lista de URLs 4xx do crawler do Ahrefs contra as 9.083 regras de
`site-ghost/theme/redirects.yaml`, apareceram **40 URLs legadas sem regra** —
em sua maioria caminhos com prefixo de idioma de uma estrutura antiga
(`/pt_BR/`, `/en/`, `/es/`, `/de/`, `/fr/`) e posts de cripto/token retirados
do ar.

O método foi validado contra o site ao vivo em 8 URLs: onde havia regra, o
site redireciona (200); onde não havia, devolve 404. Sem exceção.

Exemplos confirmados ao vivo:

| URL | Antes | Depois da importação |
|---|---|---|
| `/en/blog/ecobraz-carbon-whitepaper` | 404 | `/sobre/` |
| `/blog/como-investir-em-criptomoedas-de-forma-segura` | 404 | `/sobre/` |
| `/pt_BR/blog/a-importancia-do-descarte-correto-de-cabos-e-fios-eletricos` | 404 | `/descarte-de-cabos-e-fios/` |

Já funcionavam e seguem funcionando (não mexer):

- `/pt_BR/blog/ecobraz-emigre-lanca-servico-exclusivo-...` → `/descarte-de-cabos-e-fios/`
  (esta é a URL com mais links apontando para ela: 158 domínios de referência)
- `/projetos/para-voce/coleta-gratuita-de-e-lixo` → `/pontos-de-coleta/`
  (link de 2013 do techtudo.com.br, domínio de autoridade 81)

## O que mudou no repositório

`site-ghost/theme/redirects.yaml` passou de **9.083 para 9.123 regras**.
Verificado: o YAML parseia, não há chave duplicada, e a regra do `/llms.txt`
continua no arquivo.

Uma URL ficou de fora de propósito: `/blog/capos%20reci`, que tem um espaço
codificado no meio — é endereço malformado, e 404 é a resposta certa para ele.

## A importação foi feita — e verificada ao vivo

O Marcio subiu o arquivo no Ghost Admin em 15/10/2026, por volta de 13:15 UTC.
A partir daí **não acreditei na palavra de ninguém: medi**. Três execuções do
workflow `ferramenta-checa-url.yml` em runners do GitHub, 58 URLs ao vivo.

**As 40 regras novas: 40/40 em HTTP 200**, cada uma caindo no destino previsto
(runs `38741959743` e `38741978580`, 15/10 13:21 UTC).

| Grupo | Quantidade | Destino | Resultado |
|---|---|---|---|
| Posts de cripto/token (`/de/`, `/en/`, `/es/`, `/fr/`, `/blog/`) | 31 | `/sobre/` | 31/31 em 200 |
| `/pt_BR/blog/5-razoes…` e `/pt_BR/blog/apoie-a-ecobraz…` | 2 | `/sobre/` | 2/2 em 200 |
| `/pt_BR/blog/a-importancia-da-logistica-reversa…` | 1 | `/logistica-reversa/` | 200 |
| `/pt_BR/blog/a-importancia-do-descarte-correto-de-cabos…` | 1 | `/descarte-de-cabos-e-fios/` | 200 |
| `/pt_BR/blog/certificacao…` e `/pt_BR/blog/certificado-de-descarte…` | 2 | `/documentacao-e-rastreabilidade/` | 2/2 em 200 |
| `/pt_BR/blog/descartar-com-a-ecobraz…` | 1 | `/descarte-corporativo-de-ti/` | 200 |
| `/pt_BR/blog/descarte-de-cabos-e-fios-em-data-centers…` | 1 | `/descarte-de-servidores-e-data-center/` | 200 |
| `/blog/meioambiente` | 1 | `/blog/` | 200 |

**As 9.083 regras antigas sobreviveram.** Esse era o risco real da importação:
ela substitui o conjunto inteiro, então um arquivo errado teria apagado tudo.
Amostra determinista de 18 regras espalhadas por todo o arquivo (do índice 0 ao
9.082), testadas ao vivo no run `38742162922`: **18/18 caem no destino exato que
o arquivo prescreve**.

As duas URLs de maior valor de links foram verificadas numa checagem anterior
(run `38741350496`): `/pt_BR/blog/ecobraz-emigre-lanca-servico-exclusivo-…`, a de
158 domínios de referência, continua em `/descarte-de-cabos-e-fios/`, e
`/projetos/para-voce/coleta-gratuita-de-e-lixo`, o link de 2013 do techtudo.com.br,
continua em `/pontos-de-coleta/`. A home e o `/agendamento/` também seguem em 200.

**O `/llms.txt` foi resolvido.** Era o problema aberto desde setembro: o arquivo
tinha a regra desde `ebeb27b`, mas o site continuava entregando o conteúdo velho.
Agora `https://ecobraz.org/llms.txt` devolve 200 em
`https://ecobraz.org/assets/llms-2026-09.txt`. O cache de um ano a montante do
Cloudflare não bloqueou o redirect novo — isso era uma dúvida real e foi medida,
não suposta.

### Ressalva honesta sobre os 31 redirects para `/sobre/`

Os posts de cripto/token foram todos para `/sobre/` porque não existe página
equivalente no site atual. Isso **resolve o 404** que o Google reclamou, mas o
Google pode classificar redirect de muitas URLs distintas para uma única página
genérica como *soft 404* — ou seja, não espere que esses endereços passem força
de link para o `/sobre/`. A troca é deliberada: 404 limpo virou redirect limpo,
o que é melhor para quem clica num link antigo, mas não é ganho de SEO.

## O que continua em aberto

**O "Erro no servidor (5xx)" não foi reproduzido e não está explicado.** O site
está saudável em toda a medição acima. Duas razões possíveis, nenhuma
descartada:

1. O relatório do Search Console tem atraso de dias — ele descreve o que o
   Googlebot viu numa janela anterior, não o estado de agora.
2. As URLs com 5xx podem estar fora do conjunto medido (288 do sitemap + 53 de
   links internos). O Google conhece milhares de URLs históricas deste domínio.

Para fechar isso é preciso a lista de URLs afetadas, que só existe dentro do
painel: Search Console → Indexação de páginas → "Erro no servidor (5xx)" →
botão de exportar. Com esse CSV dá para medir exatamente as URLs certas.

## Nota de manutenção — corrigida

A versão anterior desta nota dizia que `site-ghost/scripts/build-redirects.py`
regeneraria o `redirects.yaml` a partir de um CSV de inventário e apagaria as
regras acrescentadas à mão. **Isso estava impreciso, e a situação real é mais
delicada:**

- `build-redirects.py` espera um CSV com a coluna `caminho_original`. O único CSV
  do repositório, `site-ghost/migration/redirect-map.csv`, tem 87 linhas e usa
  `url_antiga` — **o gerador não roda contra ele**, quebraria na primeira linha.
- O CSV com as ~9.000 linhas era produzido por `build-legacy-inventory.py`, que
  exige uma planilha `.xlsx` e um arquivo de crawl **que não estão no
  repositório** (vieram de exportações externas, de fora do Git).

Conclusão prática: **o `redirects.yaml` é a única cópia das 9.123 regras.** Não
existe como regerá-lo a partir do que está versionado aqui. Portanto:

1. Trate esse arquivo como fonte de verdade, não como artefato gerado.
2. Nunca suba no Ghost um arquivo que não seja o completo — a importação
   substitui o conjunto inteiro.
3. Se algum dia for preciso rodar o gerador de novo, primeiro reconstrua o
   inventário a partir do próprio `redirects.yaml`, não o contrário.
