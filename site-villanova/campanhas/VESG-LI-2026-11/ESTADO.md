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

> Comentário fixado, enquete e vídeo saíram desta lista em 01/11 — ver a
> "Fase 3" no fim deste arquivo, com o que foi provado e o que não foi.

- **Relatório semanal** de impressões/cliques/CTR: previsto na Fase 4 do
  pacote, ainda não montado.
- **Vídeo nos outros meses**: existe um piloto, não uma rotina. Se o de
  novembro render, dezembro ganha um por semana; se não render, fica no piloto.
- **Conferência exaustiva arte×post**: as 95 imagens não foram abertas uma a
  uma para confirmar que a arte X é do post X (foi por amostra).

## Fase 3 — os recursos do LinkedIn (01/11/2026)

Três recursos que a Fase 2 deixou explicitamente em aberto entraram nesta
rodada. O que segue separa o que a API confirmou do que só o dia da publicação
confirma.

### Comentário fixado — 30 de 30 posts de autoridade

`firstCommentText` gravado nos 30 posts das 05:00, com o link de apoio da
semana (W1 SEMM · W2 CBAM · W3 EUDR · W4 CSDDD/contratos · W5 Scope 3 e
publicações). Os 30 posts de VENDAS das 11:00 **não** foram tocados: eles já
levam o link no corpo.

Por que o link vai no comentário e não no corpo, nos posts de autoridade: o
corpo deles é argumento, não oferta. Ressalva honesta: que link no primeiro
comentário alcance mais que link no corpo é **prática de mercado, não medição
minha** — o que eu meço é clique e pedido de análise.

Confirmado na resposta da API de cada update, post a post: `firstCommentText`
gravado, `publicationDate` idêntico, `len(mediaAltText) == len(media)`, e os
**cinco carrosséis intactos** (A03 7 imagens, A10 9, A21 8, A28 9, A30 7, todos
com `publishImagesAsPDF: true` e `documentTitle`).

> Registro de um erro meu: o briefing que escrevi para a rodada 02–15 citava só
> o A10 como carrossel e esqueceu o A03. Quem executou leu o planner antes de
> escrever, viu as 7 imagens e copiou tudo igual. Se tivesse seguido o meu
> briefing ao pé da letra, teria destruído o carrossel do A03.

### Duas enquetes nativas

| quando | pergunta | opções | id |
|---|---|---|---|
| 06/11 08:00 SP | nível SEMM da sua operação | 0-1 / 2 / 3 / 4 | 412920440 |
| 13/11 08:00 SP | quem responde por emissões embutidas | Sustentabilidade / Operações / Financeiro / Ninguém ainda | 412920576 |

`linkedinData.type: "POLL"`, `autoPublish: true`, duração 7 dias, cada uma com
primeiro comentário levando à página do tema. Enquete não leva mídia — é assim
que o LinkedIn trata o formato, não omissão.

São posts **acrescentados** ao plano, num horário que não existia (08:00), para
não tirar do ar nenhum dos 60 originais.

### Vídeo — piloto no A15

O pacote não previa vídeo. Entrou um, no post âncora da semana de EUDR
(A15, 15/11, "45 days to 30 December 2026"), porque contagem regressiva é o
único conteúdo do mês que ganha de verdade com movimento.

- Arte: `arte/videos/A15.mp4`, gerado por
  `site-villanova/scripts/renderiza-video.mjs` a partir de
  `site-villanova/design/video-campanha.html`. Seis cenas, toda posição e
  opacidade é função do tempo — **não** há animação de CSS, que escorrega
  quando o quadro é capturado por screenshot.
- Medido no arquivo: H.264 High 4.1, yuv420p, 1080×1350 (4:5), 25 fps,
  600 quadros, 24,0 s, 1,20 MB, com trilha de áudio muda.
- Mudo por decisão: o feed do LinkedIn começa sem som. Todo o conteúdo está em
  texto na tela.
- O cartão estático do A15 **saiu** e o vídeo entrou no lugar. O estado
  anterior está em `content/A15-video-rollback.json` — desfazer é um comando.
- Capa do vídeo fixada em 2,2 s (o quadro do "45"), para o feed não congelar
  no primeiro quadro, que é quase vazio.

**O que foi verificado:** os seis quadros-chave foram abertos e olhados um a um
(na primeira renderização a rota pontilhada cruzava o texto em quatro cenas —
defeito corrigido e re-renderizado); o Metricool ingeriu o arquivo e devolveu
`…/6627481-file-15375827695960453597.mp4`; e aceitou `videoCoverMilliseconds`,
que ele só aceita quando reconhece um vídeo na mídia de um post de LinkedIn.

**O que NÃO foi verificado, e não dá para verificar daqui:** o
`static.metricool.com` está bloqueado pelo proxy desta sessão, então eu **não**
baixei o arquivo que o Metricool guardou para conferir que ele toca. E
aceitação do vídeo pelo LinkedIn só se prova no dia 15/11. O formato está
dentro do que o LinkedIn documenta (3 s a 30 min, 256×144 a 4096×2304, proporção
entre 1:2.4 e 2.4:1), mas estar dentro da especificação não é o mesmo que ter
publicado.

### Contagem de mídia depois desta rodada

59 cartões estáticos + 1 vídeo + 40 slides de carrossel. A frase "60/60 com
imagem" da Fase 2 não vale mais ao pé da letra: o A15 agora é vídeo.
