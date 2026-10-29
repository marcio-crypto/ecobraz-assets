# Plano consolidado — Google Ad Grants Ecobraz (conta 886-124-7052)

> Equipe de 5 agentes especialistas, 29/10/2026. Dados reais da conta lidos pela planilha
> exportada diariamente (`exportar-dados-grants.js`). Entregas completas em `equipe/`.
> Nada foi alterado na conta, no site ou em qualquer sistema.

## Limites desta análise
- `support.google.com`, `ecobraz.org` e sites oficiais de lei/CETESB estão bloqueados na rede
  da sessão. Regras do Grants foram conferidas por resumo de busca das páginas oficiais
  (URLs nos arquivos), não pelo texto integral. Site analisado pelo código do tema, não ao vivo.
- Volumes de busca (Ahrefs) são média nacional; por cidade, quase sem dado.

## Diagnóstico (FATO, dados da conta)
| Mês 2026 | Gasto US$ | % de US$ 10 mil | CTR conta |
|---|---|---|---|
| mai | 1.911 | 19% | 5,7% |
| jun | 719 | 7% | 3,9% |
| jul | 595 | 6% | 3,5% |
| ago | 519 | 5% | 3,9% |
| set | 786 | 8% | 3,8% |
| out (até 28) | 68 | 0,7% | 2,9% |

- Gargalo é leilão, não verba: parcela de impressões ~10%, perda por classificação ~90%,
  perda por orçamento ~0%.
- CTR abaixo de 5% há 5 meses → risco ativo de desativação do Grants.
- A campanha PF atual tem CTR 1,4% (507 impr., 7 cliques, 0 conversões em 30 dias) e é
  quem derruba a conta. Sem ela, as ativas ficam em ~12%.
- Conversões de 30 dias: 11, sendo 9 cliques em WhatsApp e 1 pedido de coleta. A conta
  otimiza para clique, não para coleta. Nenhuma ordem de coleta registra origem/GCLID.
- Lances em Maximizar conversões sem conversões para aprender.
- ≥ 70 de 290 termos de busca fora do escopo (compra/venda, móveis, pilhas, ecoponto,
  outras entidades, outras cidades). Negativas atuais: 8.
- Tráfego "onde descartar X" cai direto no formulário `/agendamento/`.

## Plano em ordem de execução

### Fase 0 — Proteger a conta (agora)
1. Pausar "GR | PF | Como descartar | Grande SP" até a versão nova subir. Objetivo:
   novembro fechar ≥ 5% de CTR (outubro já está perdido).
2. Marcio: conferir sino de Notificações e Ferramentas → Gerente de políticas (alerta de
   CTR/suspensão?).
3. Confirmar se a campanha antiga "Compensação" (palavras de uma palavra, alemão/inglês)
   está ativa; se sim, pausar.
4. Garantir ≥ 2 sitelinks em cada campanha ativa (não verificado).

### Fase 1 — Semana 1 (1–7/11)
5. Lista de negativas para a conta inteira (`equipe/04-especialista-ee.md` §3), depois das
   confirmações do Marcio (compra de sucata? móveis? nobreak?).
6. Recategorizar conversões (passos B–C em `equipe/02-ecossistema-google.md` §6.1).
7. Nova arquitetura (`equipe/01-especialista-grants.md` §4):
   - PF | Lixo eletrônico | Grande SP — grupos por item, exata+frase, Maximizar cliques.
   - PF | Linha branca | Grande SP — geladeira, máquina, fogão*, ar*, micro-ondas.
   - Grandes volumes | Empresas e condomínios — Maximizar conversões.
   - Marca — manter.
   - Tirar termos de lei/CETESB da campanha "Obrigações".
8. Anúncios prontos de Linha Branca e Grandes Volumes (`equipe/03-conversao-leads.md` §5).

### Fase 2 — Semanas 2–4
9. Campanha nacional de conteúdo ("como descartar…", fora da RMSP) → blog. Única com
   potencial real de escala.
10. Regra diária: palavra com ≥ 30 impr./mês e CTR < 3% → pausar.
11. Páginas por intenção e formulário PF de 3 campos (item+qtd, CEP, WhatsApp);
    WhatsApp com mensagem pronta e código de origem; rotina de resposta da Debora.
12. Guerrilha que gera buscas pela marca: avaliação Google pós-coleta, ímã/cartão
    "procure Ecobraz no Google", mutirão de condomínio (`equipe/05-guerrilha.md`).

### Fase 3 — Mês 2
13. Guardar GCLID no site/portal; importar "Coleta agendada" e "Coleta concluída" como
    conversões offline; só então rebaixar clique de WhatsApp a secundária.
14. Campanhas PF com ≥ 15 conversões em 30 dias → voltar a Maximizar conversões.
15. Perfil da Empresa: categorias, cidades, serviços, postagens semanais com UTM.

## Metas (ESTIMATIVA, confiança baixa-média)
| Período | Gasto/mês | CTR |
|---|---|---|
| nov/2026 | US$ 800–1.500 | ≥ 6% |
| dez/2026 | US$ 1.500–3.000 | ≥ 6% |
| 3º mês+ | US$ 3.000–5.000 (otimista) | ≥ 6% |

US$ 10.000/mês: chance estimada < 15% em 3 meses; depende de produção de conteúdo
nacional com volume real. Meta final é coleta, não gasto.

## Pendências que dependem do Marcio
**Conta**
- Notificações/Gerente de políticas; status da campanha "Compensação".
- Autorizar Fase 0 e escolher como aplicar (painel com passo a passo ou script de alterações).

**Operação** (definem anúncios e negativas)
- Área real PF: 40 km (campanha) × ~150 km (site); municípios incluídos.
- Área B2B: Grande SP, estado ou Brasil.
- Itens: fogão? ar-condicionado instalado? item avulso? móveis? sucata comprada?
  baterias de nobreak? bateria automotiva PF? equipamento médico?
- Prazo de coleta que pode ir ao anúncio; coleta expressa R$ 55 vale para linha branca?
- Custo/volume mínimo B2B e condomínio; plantão de fim de semana.

**Documentação** (pré-requisito para anúncio que cite documentação)
- CTF/IBAMA renovado após 10/09/2026?
- Licença CETESB: qual, validade.
- Quem emite CDF; MTR no SIGOR em toda coleta B2B; necessidade de CADRI.

**Decisões**
- Nome do Perfil da Empresa: "Ecobraz Emigre" × "Ecobraz".
- Valores por conversão (proposta em `equipe/02-ecossistema-google.md` §3.3).
- Liberar `ecobraz.org` e `support.google.com` na rede do ambiente para verificação ao vivo.
