# Remediação dos backlinks de spam (Ecobraz e Villanova) — guia passo a passo

**Data:** 2026-07-19 · **Documento vivo.**
**Para o Marcio.** Explico o problema com honestidade, o que já está pronto, o que eu **não** posso fazer por você (e por quê), e o passo a passo exato — clique a clique.

---

## 1. O que aconteceu (o fato, sem enfeite)

Ao auditar os backlinks dos dois sites no Ahrefs (link a link, em 19/07/2026), descobri o seguinte:

- **Villanova:** dos **348 domínios** que apontam para o site, **~99% são spam** de uma rede de "links comprados" (PBN). São domínios com cara de fábrica de link: `itxoft...`, `seoexpress...`, terminados em `.shop`, `.store`, `.site`. **Isso não é autoridade — é lixo, e pode virar risco.** Links legítimos de verdade são pouquíssimos (ex.: europa.eu, ghost.org, f6s.com, ecobraz.org).
- **Ecobraz:** tem um **núcleo de links reais** (situação melhor que a da Villanova), **mas também recebeu parte do mesmo spam**.

**Você me confirmou que nunca comprou links** — e eu acredito. O padrão (inclusive o token "Incognita digital" que apareceu no Google Search Console) aponta para **um fornecedor/agência anterior que fez isso sem sua autorização**.

> **Correção honesta da minha parte:** numa etapa anterior eu cheguei a te dizer que a Villanova tinha "autoridade surpreendentemente forte, vinda de fontes acadêmicas (Zenodo/ORCID)". **Isso estava errado** e eu assumo. Quando fui conferir link a link, o quadro real é o oposto: quase tudo é spam. Já corrigi o playbook para refletir a verdade.

---

## 2. O que isso significa (sem alarmismo, sem minimizar)

Preciso ser transparente sobre a incerteza aqui:

- **O Google, na maioria dos casos, simplesmente ignora esse tipo de spam** (o sistema dele, "SpamBrain", costuma neutralizar links comprados sem punir o site). Ou seja: **provavelmente não há uma penalidade ativa** — mas eu **não tenho como garantir isso** sem olhar o Search Console.
- **O disavow ("desautorização") é a forma correta de o dono do site dizer ao Google: "esses links não são meus, não confie neles".** É exatamente a ferramenta feita para esse caso.
- **O que o disavow NÃO faz:** ele não te dá autoridade nova, não sobe ranking sozinho, e não é mágica. Ele **limpa o passado** e protege o site. A autoridade de verdade a gente constrói depois (Zenodo/ORCID, imprensa, diretórios — está no plano de backlinks).

---

## 3. O que EU já fiz (pronto, verificado)

- ✅ Auditei os backlinks dos dois sites no Ahrefs.
- ✅ Montei o arquivo de disavow: **`docs/PR/disavow-spam-links.txt`** — 106 domínios de spam claramente identificados + 8 `.shop` do mesmo cluster para você revisar. Está no formato exato que o Google exige (`domain:exemplo.com`, um por linha).
- ✅ Corrigi o playbook de SEO (tirei a afirmação errada sobre a "autoridade acadêmica").

## 4. O que EU **não** posso fazer (e por quê — transparência)

- ❌ **Não posso submeter o disavow por você.** A ferramenta fica dentro da **sua conta Google** (Search Console), logada com a sua senha. Eu não tenho — e **nem devo ter** — acesso à sua conta Google. Esse passo é seu. Eu te guio clique a clique.
- ❌ **Não posso "cancelar" os links na origem** (são sites de terceiros, da tal rede de spam). Ninguém consegue apagá-los de fora; por isso a ferramenta certa é o disavow.

---

## 5. Passo a passo — o que VOCÊ faz (clique a clique)

### Passo A — Verificar se há punição ativa (2 minutos) — **faça isto primeiro**

1. Abra **[search.google.com/search-console](https://search.google.com/search-console)** e entre com a conta Google da empresa.
2. Selecione a propriedade **ecobraz.org**.
3. No menu da esquerda, desça até **"Segurança e ações manuais"** → clique em **"Ações manuais"**.
4. **O que você quer ver:** a mensagem verde **"Nenhum problema detectado"**.
   - Se aparecer isso ✅ → ótimo, não há punição. Siga para o Passo B.
   - Se aparecer **qualquer aviso** (ex.: "Links não naturais para o site") → **tire um print e me mande**. Muda um pouco o procedimento (aí o disavow vira parte de um "pedido de reconsideração"). Não se preocupe — é resolvível.
5. **Repita os passos 2–4 para a propriedade `villanovaesg.com`.**

### Passo B — Baixar o arquivo de disavow

O arquivo está pronto no repositório em `docs/PR/disavow-spam-links.txt`. Se você preferir, **eu te mando o conteúdo aqui no chat** para você salvar como um arquivo `.txt` no seu computador — é só me pedir. (São só nomes de domínios de spam; não tem nada secreto.)

> **Antes de enviar — 30 segundos:** dê uma olhada rápida na lista. Se reconhecer **algum** domínio como um parceiro/cliente real seu (improvável, mas possível na seção `.shop` do fim), me avise que eu tiro da lista. Disavow é "tiro definitivo": o que entrar ali, o Google passa a ignorar.

### Passo C — Enviar o disavow (para CADA site, separadamente)

1. Abra a ferramenta de disavow: **[search.google.com/search-console/disavow-links](https://search.google.com/search-console/disavow-links)**.
2. No alto, **selecione a propriedade** (comece pela **ecobraz.org**).
3. Clique em **"Fazer upload da lista de rejeições"** (Upload disavow list).
4. Escolha o arquivo `disavow-spam-links.txt`.
5. Confirme. Pronto para esse site.
6. **Repita os passos 1–5 selecionando `villanovaesg.com`.** *(O mesmo arquivo serve para os dois — o spam é da mesma rede.)*

> **Importante:** cada propriedade tem a sua própria lista de disavow. Enviar na Ecobraz **não** cobre a Villanova. Por isso é preciso fazer **duas vezes**, uma em cada.

---

## 6. Depois de enviar — expectativa honesta

- **Não há confirmação de "deu certo" imediata.** O Google leva de **semanas** para reprocessar (ele precisa re-rastrear cada link para passar a ignorá-lo). Não espere ver número mudando no dia seguinte — isso é característica do processo, não falha.
- **O DR (Domain Rating) no Ahrefs pode até cair** quando esses links forem desconsiderados — e **isso é bom**: significa que a "autoridade falsa" está saindo e sobra o que é real. Vou te avisar quando acontecer para você não se assustar.
- **Isto é defesa, não crescimento.** A parte de **construir autoridade de verdade** (depósito no Zenodo/ORCID com DOI, imprensa com dados, diretórios legítimos, Google Business Profile) continua no `PLANO-BACKLINKS.md` e no `PLAYBOOK-SEO.md`. É lá que a gente ganha da concorrência de forma limpa e sustentável.

---

## 7. Resumo (balanço honesto)

| Item | Estado |
|---|---|
| Auditoria dos backlinks (2 sites) | ✅ Feito e verificado (Ahrefs 19/07) |
| Arquivo de disavow (106 domínios) | ✅ Pronto (`docs/PR/disavow-spam-links.txt`) |
| Playbook corrigido (tirar afirmação errada) | ✅ Feito |
| Checar "Ações manuais" no GSC | ⏳ **Você** (Passo A) — 2 min por site |
| Enviar disavow na Ecobraz | ⏳ **Você** (Passo C) |
| Enviar disavow na Villanova | ⏳ **Você** (Passo C) |
| Construir autoridade real (Zenodo, imprensa…) | 🔜 Plano em `PLANO-BACKLINKS.md` |

**O que depende de mim:** já entreguei (auditoria + arquivo + guia + correção do playbook). Se aparecer ação manual no GSC, eu te ajudo a montar o pedido de reconsideração.
**O que depende de você:** os 3 passos acima (A, B/C), porque exigem a sua conta Google — eu não tenho acesso e não devo ter.
**O que ainda não sei / não verifiquei:** se há penalidade ativa (só o Passo A revela) e quanto do DR era sustentado por esse spam (saberemos nas próximas medições).
