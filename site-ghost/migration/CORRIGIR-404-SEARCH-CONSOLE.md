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

## A única ação manual (Ghost não deixa automatizar)

O arquivo no repositório **não é o que está no ar**. Prova: a regra
`^/llms\.txt$` → `/assets/llms-2026-09.txt` está no arquivo desde `ebeb27b`,
mas `https://ecobraz.org/llms.txt` ainda entrega `/assets/llms.txt`. A chave de
integração recebe 403 para baixar e para subir redirects; só uma sessão de
proprietário no painel consegue.

1. Baixe `site-ghost/theme/redirects.yaml` deste repositório.
2. Abra o Ghost Admin da Ecobraz.
3. **Settings → Labs → Redirects**.
4. **Upload redirects** e escolha o arquivo baixado.
5. Espere a mensagem de sucesso.

Essa importação **substitui o conjunto inteiro** de redirects — por isso o
arquivo precisa ser o completo, com as 9.123 regras, e não um pedaço.

Um único upload resolve três coisas de uma vez:

- os 404 das 40 URLs legadas (o que o Google reclamou);
- o `/llms.txt`, que serve conteúdo velho desde setembro;
- a base para o `/bio`, se a regra dele for acrescentada antes.

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

## Nota de manutenção

As regras novas foram escritas à mão no fim do `redirects.yaml`, do mesmo jeito
que a regra do `/llms.txt` foi em `ebeb27b`. `site-ghost/scripts/build-redirects.py`
regenera o arquivo a partir de um CSV de inventário e **apagaria** essas
adições. Antes de rodar o gerador de novo, leve as linhas novas para o
inventário.
