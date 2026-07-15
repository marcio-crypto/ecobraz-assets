# Guia de publicação — como colocar a campanha no ar

Ordem correta: **medição primeiro, campanha depois**. Se a campanha subir antes da conversão estar medindo, o Google otimiza no escuro. Tempo total estimado: 1h30 a 2h, em uma sentada.

---

## Etapa 0 — O que você precisa ter em mãos

- [ ] Acesso ao **Google Ads** (ads.google.com) com a conta da Ecobraz. Se ainda não existe conta: criar em ads.google.com → *pular a campanha guiada* (o assistente inicial tenta criar uma campanha "esperta" — clique em "Mudar para o modo especialista" / "Criar uma conta sem campanha").
- [ ] **Forma de pagamento** cadastrada (Faturamento → Configurações de pagamento). Sem isso nada veicula.
- [ ] Acesso ao **Google Analytics 4** da Ecobraz (ou criar uma propriedade em analytics.google.com).
- [ ] Acesso de administrador ao **Ghost** (painel do site) para colar o snippet.

## Etapa 1 — Tag do Google no site: **já está instalada** (só conferir, 5 min)

O tema do site já carrega a tag do Google com o GA4 **`G-WRQSPMQ8KD`** (configuração `ga_measurement_id` do tema) e já dispara os eventos certos (`generate_lead`, `contact_whatsapp`, etc.). **Não cole nada no Code Injection** — isso duplicaria a medição.

O que fazer:

1. **Teste do GA4:** abra `https://ecobraz.org/agendamento/`, preencha e envie um teste real. Em GA4 (analytics.google.com, propriedade da Ecobraz) → Relatórios → Tempo real, devem aparecer `form_start_coleta` e `generate_lead`. (Depois avise a equipe que foi um lead de teste 🙂)
2. **ID do Google Ads:** o tema também aceita o ID de conversão do Ads (configuração `google_ads_conversion_id`, usada para conversões otimizadas e remarketing). Depois de criar/acessar a conta do Google Ads, copie o ID no formato `AW-XXXXXXXXXX` (Metas → Conversões → qualquer ação → "instruções da tag") e preencha no painel do Ghost em **Design & branding → configurações do tema → "Google ads conversion id"**. Salvar — pronto, sem código.

> Melhoria futura (não bloqueia o lançamento): banner de cookies + Modo de Consentimento do Google para reforço LGPD. O formulário já tem consentimento próprio para o lead.

## Etapa 2 — Transformar `generate_lead` em conversão do Google Ads (15 min)

1. **GA4:** Admin → Eventos → aguardar o `generate_lead` aparecer (dispara no teste da etapa 1) → alternar **"Marcar como evento principal"** (key event).
2. **Vincular GA4 ↔ Google Ads:** GA4 Admin → Vinculações de produtos → Google Ads → vincular a conta (aceitar no lado do Ads se pedir).
3. **Google Ads:** Metas → Conversões → **+ Nova ação de conversão → Importar → Propriedades do Google Analytics 4 → Web** → selecionar `generate_lead` → Importar.
4. Na ação importada: categoria **"Envio de formulário de lead"**, contagem **"Uma"** (um clique = um lead, mesmo se enviar 2x), janela de conversão 30 dias, e marcar como **Meta principal da conta**.
5. Repetir a importação para `contact_whatsapp` e `contact_phone`, mas configurá-las como **metas secundárias** (somente observação — não deixar o lance otimizar por clique de WhatsApp).
6. Metas → Conversões → Configurações → ativar **Conversões otimizadas** (enhanced conversions) via "Tag do Google".

## Etapa 3 — Importar a campanha no Google Ads Editor (20 min)

1. Baixe o **Google Ads Editor**: https://ads.google.com/intl/pt-BR/home/tools/ads-editor/ → instale e faça login → adicione a conta.
2. Baixe os 6 CSVs desta pasta (`editor-import/01…06`) para o seu computador (no GitHub: botão "Download raw file" em cada arquivo, ou baixe o repositório como ZIP).
3. No Editor: **Conta → Importar → Do arquivo…**, na ordem **01 → 02 → 03 → 04 → 05 → 06**. Em cada importação o assistente mostra o mapeamento de colunas — os cabeçalhos já seguem a nomenclatura do Editor, então normalmente é só confirmar. Revise o "preview" e aceite.
4. Detalhes que o CSV não configura sozinho (fazer no próprio Editor, com a campanha selecionada):
   - **Status da campanha: Pausada** (importante — publicar tudo pausado).
   - Orçamento diário: R$ 70,00.
   - Estratégia de lances: "Maximizar cliques" com **limite de CPC máx. R$ 4,00**.
   - Redes: desmarcar "Parceiros de pesquisa" e "Rede de Display".
5. **Postar** as alterações (botão "Postar/Post" no canto superior).

## Etapa 4 — Ajustes finais na interface web (15 min)

No ads.google.com, na campanha recém-criada (ainda pausada):

- [ ] **Localização:** Configurações → Locais → confirmar "Região Metropolitana de São Paulo" e, em *Opções de local*, marcar **"Presença: pessoas em ou regularmente em seus locais segmentados"** (o padrão "presença ou interesse" mostra o anúncio para o Brasil inteiro — este é o ajuste anti-desperdício nº 1).
- [ ] **Programação de anúncios:** seg–sex, 07h–19h.
- [ ] **Negativas:** conferir se as ~95 negativas de campanha entraram (Palavras-chave → Negativas). Dica: mover para uma *lista compartilhada* ("B2B — bloqueio geral") em Ferramentas → Listas de palavras-chave negativas, para reaproveitar em campanhas futuras.
- [ ] **Recursos:** conferir sitelinks, frases de destaque e snippets (Recursos/Assets). Se a importação do CSV 06 não mapear direito (recursos às vezes exigem criação manual), criar na interface — são 4 sitelinks, 6 destaques e 6 valores de snippet, todos no CSV.
- [ ] **Desativar auto-aplicação de recomendações:** Ferramentas → Recomendações → ícone de configurações → desmarcar tudo (senão o Google adiciona palavras amplas sozinho).
- [ ] Conferir que a conversão principal da campanha é `generate_lead` (Configurações → Metas de conversão).

## Etapa 5 — Ativar e acompanhar

1. Com o checklist acima ok e a conversão testada, mude a campanha de **Pausada → Ativada**.
2. **Primeiras 48h:** conferir em Palavras-chave → Termos de pesquisa o que está acionando os anúncios. Negativar qualquer padrão ruim que escapou.
3. **Semanalmente (30 min):** seguir a rotina da seção 8 do `plano-campanha-pesquisa-b2b.md` — termos de pesquisa, vigilância do termo-cabeça, qualidade dos leads no CRM, parcela de impressões.
4. **Semana 3–4:** se houver ≥15 conversões em 30 dias, trocar o lance para "Maximizar conversões" (seção 6 do plano).

## Problemas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| Campanha ativa, zero impressões | Pagamento não configurado, ou anúncios "Em análise" | Faturamento; aguardar análise (até 1 dia útil) |
| Impressões mas zero cliques em 2–3 dias | CPC máx. baixo demais para o leilão local | Subir teto para R$ 5–6 |
| Cliques mas GA4 não mostra `generate_lead` | Tag da etapa 1 ausente/ID errado | Testar com a extensão "Tag Assistant" do Chrome |
| Conversões no GA4 mas não no Ads | Importação (etapa 2.3) não feita ou vínculo pendente | Refazer etapa 2 |
| Termos de pesquisa cheios de "como/resumo/grátis" | Lista de negativas não aplicada | Etapa 4, item negativas |

---

**Divisão de trabalho sugerida:** as etapas 1–2 dependem de acessos (Ghost, GA4, Ads) — são suas. A partir dos IDs (`G-…` e `AW-…`), o snippet exato e qualquer ajuste nos CSVs podem ser regenerados aqui no repositório (`gerar-csvs.py`).
