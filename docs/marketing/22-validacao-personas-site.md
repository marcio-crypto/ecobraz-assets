# Validação do site novo — painel de personas (rodada 1) + protocolo com pessoas reais (rodada 2)

> 26/07/2026. Método da rodada 1: 5 personas simuladas (perfis do plano mestre,
> instrução de honestidade brutal) leram o TEXTO REAL das páginas publicadas e
> responderam teste de 5 segundos, reformulação da oferta, objeções e nota 0-10.
> **Limite declarado do método:** personas simuladas encontram problemas de
> clareza e objeção com ótima precisão, mas NÃO substituem gente real — por isso
> existe a rodada 2 (§4). Nenhuma decisão definitiva só com a rodada 1.

## 1. Resultado geral

| Persona | Página principal | Entendeu a oferta? | Nota (agir) | Objeção nº 1 |
|---|---|---|---|---|
| Ricardo, gerente TI/facilities | /para-empresas/ | Sim, com precisão | 6/10 | Modelo comercial "atrás da demo" (36m só no FAQ; sem números no comparativo) |
| Patrícia, diretora ESG | /para-empresas/ + /sistema/ | Sim | 6/10 | "Três padrões" sem nomear padrões; sem metodologia, licenças, case do porte dela |
| Dona Marli, PF 62 anos | /coleta-gratuita/ | Sim | 7/10 | Medo do "confirmada na avaliação" = letra miúda; não sabe se Guarulhos entra; sem telefone/rosto |
| Fernanda, consultoria ESG | /parceiros/ | Sim, 1ª leitura | 7/10 (candidatar) | Proteção de carteira sem prazo público; zero prova social de parceiro |
| Dr. Augusto, comprador público | /para-governo/ | Sim | 6/10 | Sem caso com ente público, sem docs de habilitação, regimes jurídicos misturados |

**Leitura executiva:** todas as 5 entenderam a oferta e nenhuma classificou como
golpe/greenwashing — a arquitetura nova funciona. As notas param em 6-7 pelo
mesmo motivo estrutural: **falta prova específica e falta abrir o jogo antes da
conversa** (números, prazos, documentos, nomes). O elogio mais repetido: a
disciplina de "não prometemos X" (Patrícia: "quase inédito"; Fernanda: "vocês
nomearam o risco espontaneamente"). A tese do Marcio se confirma: clareza + prova
convertem; o que resta é aprofundar a prova.

## 2. Correções JÁ aplicadas (deploy junto com este doc)

1. **/para-empresas/**: "Contrato de 36 meses" agora está no topo (banda do hero),
   não escondido no FAQ · modelo de receita dito com todas as letras ("a Ecobraz
   se remunera com a destinação e valorização do material — por isso não cobra") ·
   exclusividade esclarecida (vale para categorias/unidades contratadas, não para
   tudo) · saída/portabilidade do histórico no lugar do meta-discurso · MTR/CDF
   por extenso.
2. **/coleta-gratuita/**: cidades da Grande SP nomeadas (Guarulhos incluída) ·
   "se não for gratuito, avisamos antes, com o valor" · telefone (11) 4329-2001 no
   formulário · jargão removido ("lote", "escopo", "avaliado tecnicamente").
3. **/parceiros/**: proteção de carteira publicada com prazo e mecânica (6 meses
   por conta registrada, renovável; cliente registrado que vier direto é
   redirecionado ao parceiro; registro conta a conta — sem entregar a carteira).
4. **/para-governo/**: regimes jurídicos separados corretamente (Lei 13.019
   parceria × Lei 14.133 contratação) + "caminho usual" recomendado + lista
   explícita dos documentos fornecidos mediante solicitação.
5. **Home**: porta do governo renomeada ("Informações para contratação e
   parceria") + porta de parceiros adicionada ao hero.

## 3. O que depende do MARCIO (a prova que falta — em ordem de impacto)

- [ ] **Exemplo numérico do comparativo** (Ricardo: "sem número, o comparativo é
      opinião"): venda avulsa típica R$ X vs. custo de montar prova + risco.
      Preciso dos seus números reais de lote típico.
- [ ] **Amostra do dossiê para download** (Ricardo e Patrícia pediram o mesmo):
      1 CDF + 1 página de inventário + print do QR/painel, anonimizados, em PDF.
- [ ] **Nomear a metodologia de carbono** do sistema (GHG Protocol? fatores de
      qual base?) — sem nome, "metodologia declarada" soa greenwashing para quem
      é técnico. ⚠️ Também: revisar a alegação "padrão europeu/bancário" — a
      Patrícia alertou risco CONAR de alegação sem norma de referência. Precisamos
      nomear (ESRS E5/GRI 306/Taxonomia UE/FEBRABAN) SÓ se o dossiê realmente
      mapear para eles — senão, suavizar o texto.
- [ ] **Licenças e cadeia** (Patrícia e Dr. Augusto): licença/situação CETESB,
      CADRI, destinos finais — o que puder ser publicado, publicar; o resto listado.
- [ ] **1 case corporativo nomeado** (com autorização do cliente) e **1 referência
      com ente público** se existir — "vale mais que ONU+UE+Banco Mundial somados".
- [ ] **Fotos reais** da equipe e do caminhão para /coleta-gratuita/ (Dona Marli:
      "quero ver a cara de quem entra na minha casa").
- [ ] Parceiros: quando houver o 1º parceiro credenciado, depoimento dele na página.

## 4. Rodada 2 — validação com PESSOAS REAIS (protocolo pronto)

**A. Teste dos 5 segundos (custo ~zero):** mostre a home por 5s no celular a
10 pessoas (5 leigos + 5 empresários/gestores conhecidos) e pergunte: "o que essa
empresa faz? para quem? o que você clicaria?". Meta: ≥8/10 respondem certo.
**B. Entrevistas (1 semana):** 2 clientes atuais B2B + 2 leads perdidos + 2 PF
recentes — 15 min por telefone, roteiro: "abre o site na minha frente, narra o que
entende, o que te faria (não) chamar". Silvana pode conduzir.
**C. Números (30 dias):** acompanhar no formulário/analytics: taxa de envio do
formulário por página de origem, cliques em WhatsApp, agendamentos de demo. Como
cada lead agora carrega a página de origem, saberemos QUAL página converte.
**D. Critério de decisão:** o que a rodada 2 confirmar da rodada 1 → prioridade
máxima; o que contradisser → prevalece a pessoa real.

## 5. Registro das notas/verbatims completos

As 5 devolutivas completas (com citações textuais) estão na conversa da sessão de
26/07/2026; os achados acionáveis estão integralmente refletidos nos §2 e §3.
