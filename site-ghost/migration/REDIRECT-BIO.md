# Redirect do /bio — o que foi medido e por que a cópia do repositório NÃO serve

Objetivo: `https://ecobraz.org/bio` (com e sem barra final) responder **302**
para `https://ecobraz.org/agendamento/?utm_source=social_bio&utm_medium=organic&utm_campaign=link_bio`,
porque o link da bio do Instagram/TikTok está em 404 e todo post agendado diz
"detalhes no link da bio".

## 1. Estado medido (23/09/2026, ao vivo, via GitHub Actions)

| O que | Resultado |
|---|---|
| `https://ecobraz.org/bio` | HTTP **301** → `/bio/` |
| `https://ecobraz.org/bio/` | HTTP **404** |
| destino com UTM | HTTP **200**, `<form>` presente, 19 campos `<input>` |
| 3 redirects antigos sorteados | 301 para o destino certo |
| 9 destinos dos posts agendados | 200 |

## 2. A API do Ghost recusa a chave de integração — nos DOIS sentidos

    GET  /ghost/api/admin/redirects/download/  -> HTTP 403
    POST /ghost/api/admin/redirects/upload/    -> HTTP 403
    "API tokens do not have permission to access this endpoint"

O 403 no upload já era tratado no `deploy-redirects.mjs`. Medimos que vale
também para a **leitura**. Conclusão: por API não se baixa nem se sobe redirect
neste site. Só pelo painel, com as mãos do proprietário.

## 3. Por que NÃO se pode montar o arquivo a partir da cópia do repositório

O upload de redirects do Ghost **substitui o conjunto inteiro** — são 9.083
regras. Não existe "adicionar uma regra". Logo, o arquivo enviado precisa ser
exatamente o que está no ar, mais a linha nova.

A cópia do repositório **não é** o que está no ar. Prova medida:

    site-ghost/theme/redirects.yaml, linha 2:
      "^/llms\.txt$": "/assets/llms-2026-09.txt"

    ao vivo, 23/09/2026:
      curl -L https://ecobraz.org/llms.txt
      -> HTTP 200 | efetiva: https://ecobraz.org/assets/llms.txt

O valor ao vivo é `/assets/llms.txt`; o do repositório é
`/assets/llms-2026-09.txt`. A edição veio do commit ebeb27b e nunca foi enviada
ao painel. Ou seja: os dois arquivos **divergem**, e isso é fato, não suspeita.

Essa divergência conhecida aponta numa direção inofensiva (o repositório tem um
valor mais novo). O risco está na direção oposta, e ela é **indemonstrável
daqui**: se o painel tiver alguma regra que o repositório não tem, subir um
arquivo montado sobre a cópia do repositório **apagaria essa regra** sem
ninguém perceber. Não há como enumerar regras que eu não conheço.

Por isso o modo `montar` do `scripts/redirect-bio.mjs` exige o arquivo **baixado
do painel** como entrada, e se recusa a trabalhar sobre a cópia do repositório.

## 4. Caminho A (recomendado) — regra na Cloudflare, sem tocar no Ghost

Medido hoje: a zona `ecobraz.org` está **ativa na conta Cloudflare do Marcio**
(`id=2d6baf0aac87808029a9caa2aed8f4cf`) e o domínio resolve para IPs da
Cloudflare. Uma regra de redirect na Cloudflare responde **antes** do Ghost,
não encosta nas 9.083 regras e se desfaz em dois cliques.

Limitação medida: o `CLAUDE_...`/`CLOUDFLARE_API_TOKEN` configurado **valida e
lê a zona, mas não tem permissão de Ruleset** (`request is not authorized`,
confirmado em 25/07/2026 e de novo em 23/09/2026). Então a regra tem de ser
criada no painel, à mão.

Painel Cloudflare → domínio `ecobraz.org` → **Rules** → **Redirect Rules** →
**Create rule**:

- **Rule name:** `bio -> agendamento (link da bio)`
- **When incoming requests match:** Custom filter expression → campo de
  expressão (Edit expression):

      (http.request.uri.path eq "/bio" or http.request.uri.path eq "/bio/")

- **Then... Type:** Static
- **URL:** `https://ecobraz.org/agendamento/?utm_source=social_bio&utm_medium=organic&utm_campaign=link_bio`
- **Status code:** **302** (Found / Temporary)
- **Preserve query string:** desmarcado
- **Deploy**

Depois disso eu meço ao vivo com a ferramenta `ferramenta-checa-url.yml`.
Se a regra não fizer efeito (caso o registro não esteja proxied), o custo é
zero — é só apagar a regra e seguir pelo Caminho B.

## 5. Caminho B — pelo painel do Ghost (só se o A não funcionar)

1. Ghost Admin → **Settings → Labs → Redirects → Download current redirects**.
   Guardar esse arquivo como backup com a data no nome. **É este o backup de
   verdade** — a cópia do repositório não serve como backup.
2. Enviar o arquivo baixado para mim.
3. Eu rodo `node site-ghost/scripts/redirect-bio.mjs montar <arquivo>`, que
   valida oito coisas antes de devolver o arquivo novo, entre elas: o conteúdo
   original intacto byte a byte, a contagem subindo de N para N+1, a seção
   `301:` preservada e a `302:` com exatamente uma regra.
4. Marcio envia o arquivo novo em **Upload redirects**.
5. Eu rodo `redirect-bio.mjs verificar` e meço o 302 ao vivo.

**Rollback:** se qualquer verificação falhar, reenviar o backup original sem
alterações.

## 6. O mesmo bloqueio atinge o `/llms.txt` — medido em 23/09/2026

Quando o prazo da coleta expressa passou de 24h para 72h, todas as páginas do
site foram corrigidas pelo deploy. **Uma coisa não foi:** a linha da expressa
dentro do `/llms.txt`, o arquivo que os robôs de IA leem.

    https://ecobraz.org/llms.txt          -> "coleta expressa em até 24h"  (velho)
    https://ecobraz.org/assets/llms.txt   -> "coleta expressa em até 24h"  (velho)
    https://ecobraz.org/assets/llms-2026-09.txt -> "em até 72h"            (CERTO)

O diagnóstico (`ecobraz-diag-asset.yml`) mostrou por quê:

    etag: W/"a7a-1a080f7e175"
    last-modified: Tue, 08 Sep 2026 12:22:03 GMT
    x-cache: MISS, HIT, HIT

As três leituras públicas — normal, com parâmetro novo e pedindo cópia fresca —
devolvem **o mesmo byte**. A camada que guarda essa cópia fica **antes** do
Cloudflare, ignora pedido de revalidação e declara validade de um ano. Purgar a
borda não resolve; já foi tentado em setembro e não teve efeito.

O conteúdo certo **já está no ar**, no caminho novo `assets/llms-2026-09.txt`,
que não tem cópia presa em cache. O que falta é o `/llms.txt` apontar para lá.

E é exatamente a mesma pedra do `/bio`: a regra de redirect vive no painel do
Ghost, e a chave de integração recebe 403 tanto para baixar quanto para subir.

**Então um único movimento resolve os dois problemas:**

- pelo **Caminho A** (Cloudflare, seção 4): além da regra do `/bio`, uma segunda
  Redirect Rule, com expressão `(http.request.uri.path eq "/llms.txt")` e
  destino estático `https://ecobraz.org/assets/llms-2026-09.txt`, status **301**;
- pelo **Caminho B** (download/upload no painel do Ghost, seção 5): o arquivo
  montado leva as duas mudanças de uma vez — a regra nova do `/bio` e a troca do
  destino do `/llms.txt`, que no repositório já está correta desde o `ebeb27b`.

Alternativa independente: pedir de novo ao suporte do Ghost que limpe o cache de
`/assets/llms.txt`. Funcionou em setembro, mas depende de terceiro e o problema
volta na próxima vez que esse arquivo mudar. Apontar para um caminho novo não
volta.
