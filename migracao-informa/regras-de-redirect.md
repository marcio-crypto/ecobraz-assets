# Regras de redirect da migração ecobrazinforma.org → ecobraz.org

Ordem de avaliação no worker (a primeira que casar, vence). Nenhuma URL
responde 404: o último recurso é sempre o hub.

1. **Normalização `/amp`**: remover o sufixo `/amp` e reavaliar a URL
   resultante pelas regras abaixo (as variações /amp herdam o destino da
   URL principal — elas também rankeiam).
2. **Tabela explícita** (`de-para.csv`): correspondência exata do caminho.
3. **Padrões por seção** (para tudo que não estiver na tabela):
   - `/noticia/*` → `https://ecobraz.org/noticias-esg/`
   - `/coluna/*` → `https://ecobraz.org/blog/`
   - `/colunista/*` e `/autor/*` → `https://ecobraz.org/noticias-esg/`
   - `/conteudo/*` → `https://ecobraz.org/noticias-esg/`
   - `/downloads/*` e `/arquivos/*` → `https://ecobraz.org/evidencias/`
   - `/ver-noticia/*` → `https://ecobraz.org/noticias-esg/`
   - `/en` e `/en/*` → `https://ecobraz.org/noticias-esg/`
4. **Fallback final**: `https://ecobraz.org/noticias-esg/`.

Todos os redirects são **301** (permanentes) e ficam ativos
indefinidamente em um Cloudflare Worker na conta própria do Marcio,
independente do fornecedor da arquitetura fechada.

## Notas de qualidade

- O conteúdo migrado (ação `migrar`) precisa estar publicado e auditado
  ANTES da ativação de qualquer redirect (restrição do plano).
- Conteúdos de token/blockchain (coluna/242, coluna/267, noticia/451) NÃO
  migram sem revisão de compliance — viram regra para o hub.
- noticia/805 ("43 milhões de árvores") migra somente após reconciliação
  do número com fonte verificável (regra do dossiê: nada de número sem
  fonte).
- A série "grandes desastres ambientais" (noticia/1227–1246) e a série
  "figuras da tecnologia" (noticia/1248–1255) são candidatas OPCIONAIS de
  migração em lote posterior (boa autoridade temática ambiental); decisão
  do Marcio.
