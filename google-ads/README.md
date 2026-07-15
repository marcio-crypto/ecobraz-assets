# Google Ads — Campanha de Pesquisa B2B

Pacote completo da campanha `[Pesquisa] Ecobraz — Coletas B2B`: coletas de lixo eletrônico, ativos de TI, linha branca em lote, equipamentos hospitalares eletrônicos (não contaminados) e sanitização/destruição de dados, para empresas na Grande São Paulo.

## Conteúdo

| Arquivo | O que é |
|---|---|
| `plano-campanha-pesquisa-b2b.md` | Estratégia completa: configurações, estrutura, conversões, fases de lance e rotina anti-desperdício |
| `editor-import/01-campanha.csv` | Configurações da campanha |
| `editor-import/02-grupos-de-anuncio.csv` | 8 grupos de anúncio com landing de destino |
| `editor-import/03-palavras-chave.csv` | 70 palavras-chave (frase + exata) |
| `editor-import/04-palavras-negativas.csv` | ~110 negativas em 6 categorias + roteamento entre grupos |
| `editor-import/05-anuncios-rsa.csv` | 8 anúncios responsivos (12 títulos + 4 descrições cada, validados nos limites de caracteres) |
| `editor-import/06-recursos-sitelinks-destaques.csv` | Sitelinks, frases de destaque e snippets estruturados |
| `gerar-csvs.py` | Gerador dos CSVs — edite os textos aqui e rode de novo; ele valida os limites do Google Ads automaticamente |

## Como importar

1. Abra o **Google Ads Editor** → `Conta > Importar > Colar texto` (ou `Importar arquivo CSV`), na ordem 01 → 06.
2. No assistente de importação, confirme o mapeamento das colunas (os cabeçalhos seguem a nomenclatura do Editor).
3. As negativas do CSV 04 com coluna `Ad Group` vazia são de **nível de campanha** (ideal: criar como *lista de palavras-chave negativas compartilhada* chamada `B2B — bloqueio geral` e aplicar à campanha).
4. Revise em *Fazer alterações pendentes* e publique **com a campanha pausada**.
5. **Antes de ativar:** configurar as conversões (seção 5 do plano) — sem isso a campanha roda cega.

Alternativa sem o Editor: os CSVs são legíveis o suficiente para criar tudo manualmente na interface web.

## Regenerar os CSVs

```bash
python3 google-ads/gerar-csvs.py
```

O script falha com a lista de violações se algum título passar de 30 caracteres, descrição de 90, etc.
