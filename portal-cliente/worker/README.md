# Worker do Portal do Cliente (`ecobraz-portal`)

Fundação do Portal (Pacote 0): **login sem senha** + **portão de acesso por contrato** + **painel** (ver OS e abrir chamado). Segue o mesmo padrão do Worker `ecobraz-coletas` (segredos na Cloudflare, integração Ploomes).

## Estado honesto (o que é e o que ainda não é)

**Feito (código, nesta branch):**
- Login por **link mágico no e-mail** (E-goi transacional), link de **uso único** e expira em 15 min.
- **Portão de acesso:** só entra **empresa (PJ)** com **"Contrato Ativo?" = Sim** e dentro da validade (**"Data de encerramento do contrato"**), relido do Ploomes no momento do login.
- **Sessão** por cookie assinado (HMAC-SHA256), HttpOnly + Secure + SameSite=Lax.
- **Painel:** saudação + validade do contrato; lista de atendimentos; formulário para **abrir chamado** (cria negócio no Ploomes).
- Anti-enumeração no pedido de link; throttle simples; suporte a Turnstile.

**Ainda NÃO feito / a validar (não afirmo como pronto):**
- ⚠️ **Não foi testado ponta a ponta nem publicado** — depende da configuração abaixo.
- ⚠️ O mapeamento exato de **"OS/atendimento"** é provisório: hoje lista os **Negócios** do contato. O modelo real (Documentos com "Número da OS") será refinado após um teste real. (Ver `TODO(validar)` no código.)
- Downloads (NF, MTR, Carta de Doação, CDF), carbono e relatórios de conformidade: **próximos pacotes**.

## O que falta para publicar (config na Cloudflare — feito por você ou por mim, com seu ok)

1. **Segredos** (Cloudflare → Worker `ecobraz-portal` → Settings → Variables):
   - `PLOOMES_USER_KEY` — mesma chave do usuário de integração do Ploomes.
   - `PORTAL_SESSION_SECRET` — um texto aleatório longo (ex.: 40+ caracteres).
   - `EGOI_TRANSACTIONAL_API_KEY` (ou `EGOI_API_KEY`) — para enviar o e-mail do link.
   - `PORTAL_BASE_URL` — ex.: `https://portal.ecobraz.org`.
2. **KV (recomendado):** criar o namespace e ligar como `PORTAL_KV` (uso único do link + throttle):
   `npx wrangler kv namespace create PORTAL_KV` → colar o id no `wrangler.toml`.
3. **Domínio/rota:** onde o Portal vai responder (ex.: `portal.ecobraz.org`).
4. (Opcional) `TURNSTILE_SECRET_KEY`, e os IDs de funil `PORTAL_OS_PIPELINE_ID/STAGE_ID/OWNER_ID`
   para onde o chamado deve cair (a definir com base no funil de OS).

Os IDs dos campos de contrato já têm padrão embutido (`277451` e `365984`); só precisam de `PLOOMES_FIELD_*` se mudarem.

## Rotas
- `GET /` — login (sem sessão) ou painel (com sessão).
- `POST /api/auth/solicitar` — pede o link (resposta genérica, anti-enumeração).
- `GET /entrar?token=…` — valida o link e cria a sessão.
- `POST /api/auth/sair` — sai.
- `GET /api/os` — lista as OS/atendimentos do cliente (exige sessão).
- `POST /api/chamado` — abre um chamado (cria negócio no Ploomes; exige sessão).
- `GET /health` — verificação.

## Segurança
- Chaves só na Cloudflare; nunca no repositório, log ou chat.
- Tokens assinados; cookie de sessão HttpOnly/Secure/SameSite.
- LGPD: o Worker lê do Ploomes apenas o necessário para o cliente logado ver os próprios dados.
