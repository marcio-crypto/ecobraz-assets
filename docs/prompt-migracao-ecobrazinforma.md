# Prompt: migração ecobrazinforma.org → ecobraz.org

> Cole o texto abaixo na conversa que desenvolve o site do EcoBraz.
> Ele é autossuficiente — contém todos os dados da análise Ahrefs de 16/07/2026.

---

CONTEXTO — CONSOLIDAÇÃO DE DOMÍNIOS (decisão já tomada, baseada em análise Ahrefs de 16/07/2026):

Vamos descontinuar o ecobrazinforma.org e consolidar tudo no ecobraz.org. A análise de backlinks mostrou que a sobreposição de domínios de referência de qualidade entre os dois sites é altíssima (globo.com, terra.com.br, europa.eu, uai.com.br, oglobo.com.br, comunique-se.com.br, vidamoderna.com.br etc. já linkam para os dois), então o objetivo NÃO é ganho de DR — é concentrar o conteúdo que rankeia, os redirects e todo o esforço futuro de SEO num único domínio.

Métricas de referência: ecobraz.org DR 36 / 895 refdomains ativos; ecobrazinforma.org DR 32 / 462 refdomains ativos, ~19 keywords orgânicas sendo 11 no top 3.

PRECISO QUE VOCÊ IMPLEMENTE NO SITE DO ECOBRAZ.ORG:

1) ESTRUTURAS DE DESTINO (criar antes de ativar redirects):
   a. Seção de notícias/colunas ESG (para receber o conteúdo editorial do ecobrazinforma)
   b. Páginas de autor para 3 colunistas: Sergio Diniz, Marcelo de Oliveira Lopes Aragão e Marcio Villanova (importante para E-E-A-T — essas páginas têm 87-103 domínios de referência cada)
   c. Seção de história da tecnologia (ex.: ecobraz.org/museu/...) para receber a vertical "museu do eletrônico", que é o conteúdo que melhor rankeia

2) MIGRAÇÃO DE CONTEÚDO PRIORITÁRIA (páginas com posições nº 1 no Google BR — migrar 1:1, manter título/H1/corpo):
   - /noticia/178/bina-... → "bina" (posição 1, 1.800 buscas/mês)
   - /noticia/377/apple-ii-... → "apple 2 / apple ii" (posição 1, ~1.200 buscas/mês)
   - /noticia/494/altair-8800-... → "altair 8800" (posição 1)
   - /noticia/198/televisao-a-cores-... → "tv colorida no brasil" (posição 1)
   - /noticia/343/iphone-5-2012-... → "iphone de 2012" (posição 1)
   - /noticia/159/radio-experimental-de-nikola-tesla-... → posição 1
   - /noticia/215/ibm-pc-5150-... → "ibm primeiro pc" (posição 1)
   - /noticia/213/sony-playstation-1-... → "playstation 1" (posição 5, 14.000 buscas/mês — maior potencial)
   - /noticia/493/eniac-1945-... → "eniac" (posição 17, 2.250 buscas/mês somadas)
   - /coluna/203/monitores-quebrados-... → "cristal liquido" (posição 3)

3) REDIRECTS 301 PÁGINA A PÁGINA (nunca tudo para a home — ordem de prioridade por autoridade):
   1. Homepage ecobrazinforma.org/ (272 refdomains) → home do ecobraz.org ou seção de notícias
   2. /colunista/7/sergio-diniz (103 rd) → página de autor equivalente
   3. /colunista/8/marcelo-de-oliveira-lopes-aragao (90 rd) → página de autor
   4. /noticia/442/descarte-de-ti-venda-sucata-ou-compra-risco (90 rd)
   5. /noticia/712/adote-um-bairro-a-engenharia-por-tras-do-esg-urbano (88 rd)
   6. /noticia/753/novo-marco-da-cvm-o-fim-do-esg-de-fachada-nas-empresas (88 rd)
   7. /colunista/9/marcio-villanova (87 rd) → página de autor
   8. /noticia/805/o-deficit-que-enterra-43-milhoes-de-arvores-no-brasil (87 rd)
   9. /conteudo/14/parceria-estrategica-esg-ecobraz (8 rd)
   + Todas as demais URLs de /noticia/, /coluna/, /colunista/ e /conteudo/ para seus equivalentes migrados
   + IMPORTANTE: incluir as variações /amp de cada URL (elas também rankeiam, ex.: /noticia/510/.../amp)
   + O que não tiver equivalente: 301 para a página de categoria mais próxima (não deixar 404)

4) PÓS-ATIVAÇÃO (checklist):
   - Mudança de endereço no Google Search Console (ecobrazinforma → ecobraz)
   - Sitemap atualizado no ecobraz.org com as novas URLs
   - Manter o registro do domínio ecobrazinforma.org renovado com os 301 ativos INDEFINIDAMENTE
   - Atualizar manualmente os links que controlamos, com prioridade para: greeneletron.org.br e cortex-intelligence.com (únicos domínios de qualidade que só linkam para o ecobrazinforma), depois vidamoderna.com.br (115 links dofollow) e portais de imprensa
   - Corrigir os links internos do ecobraz.org que hoje apontam para o ecobrazinforma (15 links dofollow identificados), passando a apontar para as URLs internas novas

RESTRIÇÕES:
   - Não ativar nenhum redirect antes de o conteúdo de destino estar publicado
   - Não contratar/renovar pacotes de backlinks de redes .shop/.site/.store — a análise mostrou que os dois perfis estão poluídos com spam dessas redes e isso não constrói autoridade
   - Expectativa realista: oscilação de tráfego por 2-4 meses após a migração é normal; DR deve ficar estável ou subir 1-3 pontos, não mais que isso

Comece propondo o mapeamento de-para completo das URLs e a estrutura das novas seções, para eu validar antes de implementar.
