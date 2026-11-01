# VESG-LI-2026-11 — estado real da campanha

> Este arquivo descreve o que **está no ar**, medido, não o que o plano previa.
> O `README.md` ao lado é o pacote como chegou; onde os dois divergirem, vale
> este.

## O que foi conferido ao vivo (01/11/2026)

| Item | Estado | Como sei |
|---|---|---|
| 60 posts agendados no Metricool | ✅ existem | consultei o planner da marca 7795884 dia a dia |
| Rede | ✅ só LinkedIn | `providers: [{network: linkedin}]` em todos |
| Publicação automática | ✅ `autoPublish: true`, `draft: false` | resposta da API em cada post |
| Horários | ✅ 05:00 e 11:00 São Paulo | = 09:00 e 15:00 Europe/Rome, como o plano pede |
| Lint de conteúdo | ✅ 60 posts, 30 dias, saída 0 | `scripts-referencia/validate.py` |
| Imagem em cada post | ✅ 60/60 | verificação independente, diff byte a byte |

## Verificação final (01/11/2026, somente leitura)

Um passe independente varreu os 30 dias, gravou as respostas da API em arquivo e
rodou um comparador de verdade — não leitura:

- **texto:** 60/60 idênticos ao `posts.json`, 51.721 caracteres comparados;
- **imagem:** 60 com imagem, 0 sem; 95 URLs, **95 distintas** (nenhuma arte repetida);
- **alt:** `len(mediaAltText) == len(media)` em 60/60;
- **entrega:** 60/60 `autoPublish: true`, `draft: false`, provider `linkedin`;
- **carrossel:** 5/5 com `publishImagesAsPDF` e `documentTitle`.

O comparador foi testado contra si mesmo (1 caractere trocado → reprova; espaço
a mais no fim → reprova). Não é um diff que passa de qualquer jeito.

**Defeito encontrado e corrigido na mesma rodada:** 24 dos 55 cartões tinham o
texto alternativo cortado em 110 caracteres, terminando em reticências no meio
da frase. O corte era da arte, não do alt — leitor de tela não tem largura. O
gerador foi corrigido e os 24 posts foram atualizados (24/24, zero falhas); os
JPEG não mudaram, o que confirma que era só texto.

**O que NÃO foi verificado:** as 95 imagens não foram abertas uma a uma para
conferir que a arte X é do post X (conferência por amostra, não exaustiva), e
publicação efetiva só o relógio confirma — todos estão `PENDING`, que é o estado
correto de post agendado.

## Fase 2 — as imagens

A arte vive em `arte/` e é gerada por código, nunca à mão:

- `arte/cartoes/<ID>.jpg` — 60 cartões 1200×627, um por post.
- `arte/carrosseis/<ID>-NN.jpg` — 40 slides 1200×1500, cinco carrosséis.

Gerados por `site-villanova/scripts/renderiza-cards.mjs` e
`renderiza-carrossel.mjs` a partir de `content/posts.json` e
`content/carrosseis.json`, com os templates em `site-villanova/design/`.
**Para corrigir um cartão, corrija o JSON e renderize de novo** — editar PNG à
mão quebra a regra e some na próxima geração.

### Por que cinco posts viraram carrossel

LinkedIn trata documento (PDF) como formato próprio: o leitor passa página
dentro do feed. Os cinco escolhidos são os que já nasceram em lista no texto —
SEMM (A03), os sete blocos do pedido CBAM (A10), as seis pastas do arquivo EUDR
(A21), o índice de uma página (A28) e o recap do mês (A30). São também os que um
comprador salva.

Ressalva honesta: **que documento rende mais que imagem única no LinkedIn é
prática de mercado, não medição minha.** O que eu meço é o que a campanha
gerar — cliques e pedidos de análise, que é o KPI do plano, não curtida.

### Hospedagem das imagens

As imagens são servidas por `raw.githubusercontent.com`, presas ao SHA do commit
que as criou — URL pública, permanente e imutável. Conferido: responde `HTTP
200` com `image/jpeg`. O Metricool baixa a imagem para o storage dele no momento
em que é anexada (as URLs do post passam a ser `static.metricool.com`), então a
publicação não depende do GitHub estar no ar no dia.

O caminho previsto no pacote era subir para a biblioteca do Ghost. A esteira
existe (`.github/workflows/villanova-cards.yml`, com `upload`), mas o
`workflow_dispatch` só enxerga workflow que já está na `main`, e este nasceu na
branch do PR. Quando o PR entrar, o caminho do Ghost passa a funcionar também.

## Dezembro, e os meses seguintes

1. Escrever `content/posts.json` do mês novo (mesmo esquema; quem escreve é o
   time de `agents/`, não o código).
2. `python3 scripts-referencia/validate.py content/posts.json` — tem de sair 0.
3. `node site-villanova/scripts/renderiza-cards.mjs --posts <novo> --out arte/cartoes`
   e, se houver carrossel, `renderiza-carrossel.mjs`.
4. Commitar a arte (o SHA do commit vira a URL).
5. Agendar no Metricool e anexar a mídia pelo conector.

## O que NÃO está feito

- **Comentário fixado** (primeiro comentário com link de apoio): possível pelo
  campo `firstCommentText`, não usado nesta rodada.
- **Enquete**: o LinkedIn tem enquete nativa e o Metricool expõe
  (`linkedinData.poll`). Não entrou — enquete substitui o post escrito, e
  acrescentar posts fora do plano é decisão do Marcio.
- **Vídeo**: o pacote não prevê. Cartão animado é possível, mas vídeo de
  LinkedIn que rende não é cartão com movimento.
- **Relatório semanal** de impressões/cliques/CTR: previsto na Fase 4 do
  pacote, ainda não montado.
