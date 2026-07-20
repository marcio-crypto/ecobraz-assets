# Colocar o Portal para funcionar — passo a passo (para o Marcio)

Depois que eu publicar a primeira versão (te passo o **endereço de teste**), faltam
só os **segredos** na Cloudflare. Eles ficam guardados lá — **nunca no chat, nunca no código**.

## Passo 1 — Abrir as configurações do Worker
1. Entre na **Cloudflare** → **Workers & Pages**.
2. Clique no Worker **`ecobraz-portal`**.
3. Vá em **Settings** → **Variables and Secrets**.

## Passo 2 — Adicionar os segredos
Clique em **+ Add**, escolha o tipo, preencha e salve. São 4:

| Nome (exato) | Tipo | Valor |
|---|---|---|
| `PLOOMES_USER_KEY` | **Secret** | a **mesma chave** de API do Ploomes (a que já usamos) |
| `PORTAL_SESSION_SECRET` | **Secret** | um **texto aleatório longo** (ver dica abaixo) |
| `EGOI_TRANSACTIONAL_API_KEY` | **Secret** | a chave do **E-goi transacional** (a mesma que envia e-mails) |
| `PORTAL_BASE_URL` | **Text** | o **endereço de teste** que eu te passo (ex.: `https://ecobraz-portal.SEU-SUBDOMINIO.workers.dev`) |

**Dica para o `PORTAL_SESSION_SECRET`:** precisa ser um texto comprido e aleatório (uns 40+
caracteres). Pode teclar aleatoriamente letras/números, ou me pedir que eu te gero um — mas
**não me mande o valor de volta**: você cola direto no campo da Cloudflare.

> Se preferir usar a chave normal do E-goi (a mesma do Worker de coletas), o nome pode ser
> `EGOI_API_KEY` em vez de `EGOI_TRANSACTIONAL_API_KEY` — o Portal aceita as duas.

## Passo 3 — (para testar) marcar uma empresa
No Ploomes, pegue **uma empresa** para teste e no cadastro dela:
- marque **Contrato Ativo? = Sim**;
- preencha **Data de encerramento do contrato** com uma data **no futuro**;
- confirme que ela tem um **e-mail** no cadastro.

## Passo 4 — Testar
1. Abra o **endereço de teste** do Portal.
2. Digite o **e-mail dessa empresa** e peça o link.
3. Confira o e-mail (e o spam), clique no link e veja se entra no painel.
4. Me conte o que aconteceu — se algo travar, o log me diz o motivo e eu ajusto.

## Depois (produção)
- Trocar o endereço de teste por **`portal.ecobraz.org`** (configuração de domínio na Cloudflare).
- Definir o **funil** onde o chamado deve cair (`PORTAL_OS_PIPELINE_ID`).
- Remover o gatilho de publicação automática por push (deixar só publicação manual).
