# INCIDENTE — ecobrazinforma.org fora do ar desde 10/10/2026

**Descoberto em 15/10/2026, 14h25 UTC**, por acaso: eu ia confirmar se o
redirect do colunista Sergio Diniz ainda dava 404 e o domínio não respondeu.

## O que está acontecendo

| Medida | Resultado |
|---|---|
| `https://ecobrazinforma.org/` | **falha de TLS** — `tlsv1 alert internal error`, sem resposta |
| `https://www.ecobrazinforma.org/` | mesma falha |
| `http://ecobrazinforma.org/` | HTTP 200, título **"Your domain is expired"** |
| Qualquer `/colunista/…`, `/noticia/…` | mesma falha de TLS |

Medido no run `116477533657`, em runner do GitHub.

## A causa, pelo registro do domínio

Consulta RDAP ao Public Interest Registry (run `116479039343`):

```json
{
  "ldhName": "ecobrazinforma.org",
  "status": ["client transfer prohibited", "auto renew period"],
  "events": [
    {"eventAction": "expiration",   "eventDate": "2027-10-10T02:07:51Z"},
    {"eventAction": "registration", "eventDate": "2025-10-10T02:07:51Z"},
    {"eventAction": "last changed", "eventDate": "2026-10-10T02:10:15Z"}
  ],
  "nameservers": ["ns1.dns-expired.com", "ns2.dns-expired.com"]
}
```

**O domínio NÃO foi perdido.** A expiração já consta como 2027-10-10 e o status
é `auto renew period` — ou seja, renovou automaticamente em 10/10/2026.

**O que quebrou foram os nameservers.** Quando o domínio venceu, o registrador
apontou o DNS para os servidores de estacionamento dele
(`ns1.dns-expired.com` / `ns2.dns-expired.com`) e **não devolveu para a
Cloudflare** depois da renovação. Está assim há 5 dias.

Comparação com o domínio saudável — `ecobraz.org`:

```json
{"status": ["client transfer prohibited"],
 "expiration": "2027-06-03",
 "nameservers": ["maisie.ns.cloudflare.com", "nick.ns.cloudflare.com"]}
```

## O impacto

O worker `informa-redirects` está intacto na Cloudflare, mas **não recebe
tráfego nenhum**, porque o DNS não aponta mais para lá. Consequência:

- Os **303 redirects** da consolidação ecobrazinforma → ecobraz estão mortos.
- A home do informa, com **284 domínios de referência** (incluindo
  `europa.eu` dofollow, segundo `de-para.csv:2`), não resolve.
- O colunista Sergio Diniz, com **115 domínios** (`de-para.csv:3`), idem.
- **Falha de TLS é pior que 404.** Um 404 ao menos responde; aqui o navegador
  mostra erro de segurança e o rastreador não consegue nem ler a resposta.

Isso torna o conserto do mapa do worker (trocar o destino do Sergio Diniz)
**irrelevante até o DNS voltar** — não adianta consertar o desvio de uma estrada
que está fechada.

## O que precisa ser feito, e só o Marcio pode

1. Entrar no **registrador** do `ecobrazinforma.org` (não é a Cloudflare — a
   Cloudflare é só o DNS).
2. Confirmar que a **renovação foi efetivamente paga**. O status `auto renew
   period` significa que o registrador renovou, mas ainda está na janela em que
   pode cancelar por falta de pagamento.
3. **Trocar os nameservers** de `ns1.dns-expired.com` / `ns2.dns-expired.com`
   para o par da Cloudflare **daquele domínio**. O par correto aparece no painel
   da Cloudflare, na zona do `ecobrazinforma.org`. Não copiar o par do
   `ecobraz.org` por suposição: a Cloudflare atribui pares diferentes por conta
   e por zona, e chutar aqui quebra de outro jeito.
4. Esperar a propagação (costuma levar de minutos a algumas horas).

Depois disso dá para medir de novo e confirmar que os 303 redirects voltaram.

## Nota de método

Esta checagem só foi possível porque a `ferramenta-checa-url.yml` passou a
mostrar o corpo de respostas que não são HTML. Antes ela só procurava `<title>`,
então uma consulta RDAP voltava vazia e o problema continuaria invisível.

---

## 22/10/2026 — o DNS voltou, mas os redirects por caminho NÃO

Medido em 22/10 às 13h01 e 13h02 UTC (jobs `119839684049` e `119840047462`),
depois de **39 medições iguais** entre 15/10 e 21/10.

**O que mudou.** O registrador devolveu os nameservers. O RDAP agora mostra:

```json
{"nameservers": ["maisie.ns.cloudflare.com", "nick.ns.cloudflare.com"],
 "last changed": "2026-10-21T23:49:31.061Z"}
```

Ou seja, a troca foi feita na noite de 21/10. O par é o **mesmo** do
`ecobraz.org` — a ressalva do item 3 acima (não chutar o par) continua correta
como método, mas neste caso os dois domínios estão na mesma zona de
nameservers.

**O que NÃO voltou.** Rodando a validação completa (`informa-virada.yml`, job
`119840338813`): **2 redirecionamentos corretos, 303 erros**. Todo caminho
antigo cai na **home** do `ecobraz.org`, perdendo o caminho:

```
1o salto: HTTP/2 301
1o salto: location: https://ecobraz.org/
1o salto: server: cloudflare
```

(job `119841639217`, para `/autor/sergio-diniz` e
`/noticia/377/apple-ii-…` — as duas idênticas)

Os **2 "corretos"** são acidente, não sinal de que algo funciona: no mapa, a
única entrada cujo destino é a raiz é `/busca` → `/`, e com a normalização de
`/amp` ela conta duas vezes (`/busca` e `/busca/amp`). São exatamente as duas
que, por coincidência, esperam a home.

**Prova de que não é o worker que está respondendo.** O
`migracao-informa/worker-redirects.js` nunca devolve a raiz: o catch-all dele é
`/noticias-esg/`, e cada seção tem o seu (`noticia` → `/noticias-esg/`,
`coluna` → `/blog/`, `downloads` → `/evidencias/`). Se o worker estivesse no
caminho do tráfego, **nada** cairia em `https://ecobraz.org/`. O worker
`informa-redirects` existe na conta (confirmado por `workers_list`, modificado
em 2026-07-16), mas **a rota dele não está ligada à zona**.

Quem está respondendo é uma regra de redirecionamento da Cloudflare que manda
`ecobrazinforma.org/*` para `https://ecobraz.org/` sem preservar o caminho.

**Por que isso não resolve.** Redirecionar centenas de URLs distintas para a
home é lido pelo Google como *soft 404*: a resposta existe, mas o destino não
corresponde ao conteúdo pedido, e a autoridade dos links daquelas páginas
específicas não passa. Em termos de SEO está melhor que a falha de TLS (agora
há resposta), mas continua longe do que a consolidação foi feita para entregar —
em particular o Sergio Diniz (115 domínios de referência) e a home do informa
(284 domínios, com `europa.eu` dofollow).

### O que falta, e só o Marcio pode fazer (painel da Cloudflare)

1. Na zona `ecobrazinforma.org`, em **Rules → Redirect Rules** (e também em
   **Bulk Redirects**), localizar a regra que manda tudo para
   `https://ecobraz.org/` e **desativá-la**. É ela que está engolindo o caminho.
2. Em **Workers & Pages → `informa-redirects` → Settings → Domains & Routes**,
   adicionar as rotas na zona `ecobrazinforma.org`:
   - `ecobrazinforma.org/*`
   - `www.ecobrazinforma.org/*`
3. Me avisar: eu meço os 303 de novo com o `informa-virada.yml` e mostro o
   resultado caminho por caminho.

Não consigo fazer esses dois passos por aqui: o conector da Cloudflare nesta
sessão é **somente leitura** para workers e não tem ferramenta de zona, DNS nem
regras. E, ao contrário dos outros três workers do repositório, o
`informa-redirects` **não tem `wrangler.toml` nem workflow de publicação** —
então nem por GitHub Actions dá para publicá-lo com rota.

### Pendência que volta a valer depois da rota

O worker publicado é a versão de julho, que ainda manda
`/colunista/7/sergio-diniz` para `/autor/sergio-diniz/` — uma página que **não
existe** (404). O `gera-worker-redirects.mjs` já foi corrigido no repositório e
hoje gera `/noticias-esg/` para essa entrada. Então, assim que a rota voltar,
essa única entrada precisa ser atualizada no painel (de 153 pares, só ela muda).
