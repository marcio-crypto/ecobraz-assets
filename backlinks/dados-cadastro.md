# Pacote de dados para cadastros

Dados prontos para copiar e colar em qualquer formulário de diretório, perfil ou associação.
Manter **exatamente iguais** em todos os cadastros (consistência de NAP — Nome, Endereço, Telefone —
é fator de confiança para o Google).

## Ecobraz

| Campo | Valor |
|---|---|
| Nome fantasia | Ecobraz |
| Razão social | Associação Auxílio à Reciclagem de Eletrônicos e Inclusão Digital |
| CNPJ | 14.197.457/0001-42 |
| Endereço | Rua Dona Maria Quedas, 230, Jardim Andaraí, São Paulo/SP, CEP 02175-010 |
| Telefone | +55 11 4329-2001 |
| E-mail | contato@ecobraz.org.br |
| Site | https://ecobraz.org |
| Categorias | Reciclagem de eletrônicos; Logística reversa; Descarte de equipamentos de TI; Sanitização de dados |
| Logos | `ecobraz-32.svg` e `perfil-eco.svg` (raiz deste repositório) |

**Descrição curta (até 160 caracteres, PT):**
> Coleta, inventário, custódia e destinação de eletrônicos e ativos de TI em São Paulo, com documentação de cada etapa para empresas e instituições.

**Descrição média (até 300 caracteres, PT):**
> A Ecobraz executa coleta, inventário, custódia, tratamento e destinação de eletrônicos e ativos de TI desmobilizados em São Paulo e região. Cada etapa gera registro documental — do agendamento à destinação final — para empresas, condomínios, escolas e órgãos públicos.

**Short description (EN):**
> Ecobraz handles collection, inventory, custody and final disposition of electronics and decommissioned IT assets in São Paulo, Brazil, with documented evidence at every step.

## Villanova ESG

| Campo | Valor |
|---|---|
| Nome | Villanova ESG |
| Site | https://www.villanovaesg.com |
| Fundador | Marcio Villanova (CEO da Ecobraz) |
| LinkedIn | https://www.linkedin.com/company/villanova-esg/ |
| Categorias | ESG advisory; Supply chain compliance; Regulatory intelligence (CSDDD, CBAM, EUDR, Scope 3) |
| CNPJ / registro | **[PREENCHER — não localizado no repositório]** |
| Endereço | **[PREENCHER]** |
| E-mail de contato | **[PREENCHER]** |

**Descrição curta (PT):**
> A Villanova ESG transforma a evidência operacional de fornecedores brasileiros em dossiês legíveis para procurement, compliance e conselhos europeus, em cadeias expostas a CSDDD, CBAM e EUDR.

**Short description (EN):**
> Villanova ESG converts Brazilian operational evidence into audit-grade files for European procurement, compliance and boards exposed to CSDDD, CBAM, EUDR and Scope 3 requirements.

## Regras ao cadastrar

1. Nunca inflar alegações: nada de "certificação garantida", "100% sustentável" ou promessas de aprovação
   em auditoria (ver auditoria de alegações proibidas em `site-ghost/scripts/audit-legacy-claims.mjs`).
2. Sempre apontar para `https://ecobraz.org` (sem www, com https) e `https://www.villanovaesg.com`.
3. Usar o e-mail institucional, nunca e-mail pessoal.
4. Após cada cadastro, atualizar a coluna de status em `alvos.csv` (ou deixar o monitor mensal detectar).
