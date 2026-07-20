# Portal do Cliente Ecobraz

Sistema de valor agregado, dentro do site da Ecobraz, com acesso restrito a
clientes ativos. Está sendo construído **em pacotes** (ver
[`VISAO-E-ROADMAP.md`](./VISAO-E-ROADMAP.md)).

Este diretório vai crescer conforme os pacotes forem entrando. Por enquanto ele
contém o **diagnóstico do Ploomes** — o primeiro passo, que descobre como o
Ploomes está montado para construirmos o Portal em cima da estrutura real.

---

## 1. Diagnóstico do Ploomes (somente leitura)

**O que é:** uma rodada única que pergunta ao Ploomes quais **funis, etapas e
campos** existem e quantos **contatos/negócios** há — para sabermos, sem chutar,
o que é "cliente ativo", qual funil é "OS/atendimento" e quais campos podemos usar.

**O que ele NÃO faz (importante):**
- ❌ Não cria, não altera e não apaga **nada** no Ploomes.
- ❌ Não baixa dados pessoais de clientes. De contatos e negócios ele lê **apenas
  contagens** (ex.: "há 1.240 contatos"), nunca a lista de pessoas — respeitando a LGPD.
- ❌ Nunca imprime a chave de API.

### Passo a passo para rodar (você faz uma vez)

**Passo 1 — Guardar a chave do Ploomes no GitHub (uma vez só).**
A chave de API do Ploomes precisa ficar guardada no cofre de segredos do GitHub
(nunca no chat, nunca no código):

1. Abra o repositório no GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Clique em **New repository secret**.
3. Em **Name**, escreva exatamente: `PLOOMES_USER_KEY`
4. Em **Secret**, cole a **mesma chave de API do Ploomes** que já usamos hoje
   (a que está na Cloudflare; ou pegue no Ploomes em **Administração → Integrações → API**).
5. Salve.

> Se preferir, me avise quando tiver feito o Passo 1 que **eu disparo o diagnóstico
> por você** (via GitHub Actions) e leio o resultado — você não precisa mexer em mais nada.

**Passo 2 — Rodar o diagnóstico** (posso fazer por você, ou você mesmo):
1. No GitHub, aba **Actions** → workflow **"Portal — Diagnóstico do Ploomes (somente leitura)"**.
2. Botão **Run workflow**.
3. Ao terminar, o resultado fica em dois lugares: no **log** da execução (resumo
   legível) e como **artefato** para download (`diagnostico-ploomes` → arquivo
   `resultado-ploomes.json`).

### O que faço com o resultado
Com a estrutura real em mãos, eu defino com você:
- qual campo/estado significa **"cliente ativo"** (o portão de acesso ao Portal);
- qual funil representa **OS / atendimento** (para o cliente acompanhar);
- em qual funil/etapa cai um **chamado aberto pelo Portal** (nova OS);
- quais **campos personalizados** já existem e quais faltam.

Só depois disso eu escrevo o código do login e do painel — para não construir em cima de suposição.

---

## Segurança e privacidade (regras deste diretório)
- Segredos (chaves de API) **só** em GitHub Actions Secrets / Cloudflare — nunca no
  repositório, nunca em logs, nunca no chat.
- Nenhuma ferramenta aqui baixa dados pessoais de clientes sem necessidade; quando
  precisar (no Portal em si), será com base legal e minimização de dados (LGPD).
