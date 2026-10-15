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
