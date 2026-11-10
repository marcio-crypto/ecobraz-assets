# Instruções do projeto — ecobraz-assets

## Relação de trabalho com o Marcio (marcio@ecobraz.org.br)

Leia isto no início de toda sessão. É um compromisso permanente, não uma preferência opcional.

- **Transparência absoluta, sempre.** Nunca minta, nunca engane, nunca induza ao erro — nem por omissão, nem por otimismo. O Marcio é muito sistemático e detalhista, e a confiança dele é a base do trabalho. Uma única informação enganosa quebra essa confiança.
- **Separe fato verificado de suposição.** Diga claramente o que foi **testado/provado** (com a evidência: log, status ao vivo, verificação) versus o que é estimativa, expectativa ou "deve estar". Se não verificou, diga que não verificou.
- **Nunca declare algo "100% / pronto / perfeito" sem prova.** Se houver qualquer item em aberto — por menor que seja, ou que dependa dele, ou do tempo (ex.: indexação do Google) — liste com honestidade em vez de dar garantia cheia.
- **Ao terminar uma tarefa, feche com um balanço honesto:** o que está feito e verificado, o que ficou pendente, e o que depende do Marcio ou de terceiros.
- **Prefira mostrar a incerteza a esconder.** "Não sei / não testei ainda / preciso confirmar" é sempre melhor que uma afirmação confortável e incerta.
- Comunicação em **português**. O Marcio não é técnico: explique com clareza, um passo de cada vez quando ele precisar agir, com cliques/telas exatos.

## Segurança (regra rígida)

- Nunca exponha, imprima ou grave chaves de API no repositório, em logs ou na conversa. Use apenas GitHub Actions Secrets, Ghost Integration Keys e Cloudflare Secrets já configurados. Nunca peça ao Marcio para colar segredos no chat.
- **Este repositório é PÚBLICO.** Nunca grave aqui dados pessoais (CPF, RG,
  endereços residenciais, telefones particulares), nem chaves de autenticação
  ou códigos verificadores de documentos oficiais — mesmo que o Marcio envie os
  PDFs. Os originais ficam no Google Drive dele; aqui só a ficha institucional.
- Exceção única, autorizada pelo Marcio em 08/09/2026: o número de registro dele
  na base de peritos da Comissão Europeia (`EX2026…`) pode ficar versionado no
  `site-villanova/theme/default.hbs`, dentro do JSON-LD da marca. É registro
  público, já servido no site, e não abre acesso a nada. Está lá com a ressalva
  de que é só registro — não é aval, nomeação nem certificação da Comissão. Não
  remova por causa da regra acima; se for para sair, o Marcio decide.

## Documentação institucional da Ecobraz

Dados cadastrais, licenças e prazos: `docs/institucional/DOCUMENTOS-ECOBRAZ.md`.
Consultar antes de preencher cadastros, responder questionários de compradores
ou publicar qualquer dado institucional em página nova. Atualizar a ficha (e
avisar o Marcio) sempre que um documento for renovado ou vencer.

## Padrão visual da Villanova ESG (aprovado em 30/07/2026)

Toda página, template ou material novo da Villanova ESG DEVE seguir o
padrão de design v2 aprovado pelo Marcio: tokens, componentes, ícones e
regras em `site-villanova/design/PADRAO.md` (referências renderizadas na
mesma pasta). Antes de publicar página nova, renderizar prévia e conferir
visualmente contra as referências.

## Publicação do site Ecobraz e edições no Ghost (regra de 10/11/2026)

- A publicação (`.github/workflows/deploy-ghost.yml`) regrava título, texto, meta
  e código injetado de todas as páginas e posts listados em
  `site-ghost/content/*.json`. Edição feita direto no editor do Ghost nesses
  conteúdos some na publicação seguinte. Em 10/11/2026 isso reverteu a página
  `/coleta-de-lixo-eletronico-para-empresas/`.
- Mudança de texto nesses conteúdos entra pelo repositório, nunca só pelo
  editor. Se for preciso editar no Ghost com urgência, levar o mesmo texto para
  o repositório antes da próxima publicação.
- As landing pages geradas por `build-landing-pages.mjs`
  (`commercial-pages.json`) são renderizadas por template: o texto do editor
  não aparece ao público, mas título, meta e código injetado aparecem. As
  demais páginas mostram o texto do editor. Conferir como a página é
  renderizada antes de afirmar que uma edição "não aparece ao público".
- A trava `site-ghost/scripts/trava-edicoes-manuais.mjs` para a publicação,
  antes de qualquer escrita, se houver conteúdo gerido alterado no Ghost depois
  da última escrita do pipeline. Liberar de propósito (título do commit
  começando por `[regravar-ghost]`, ou execução manual com "Regravar o Ghost")
  só com decisão do Marcio, porque a edição manual é perdida.
- A trava não cobre configurações gerais do site, meta das tags nem o tema.
