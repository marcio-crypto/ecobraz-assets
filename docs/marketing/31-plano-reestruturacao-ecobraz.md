# 31 — Reestruturação do site Ecobraz (v2): diagnóstico e plano de lotes

Data: 30/07/2026 · Aprovação das diretrizes: Marcio, 30/07 (chat)
Base: síntese de toda a estratégia documentada (docs 00–27), mapa completo do
tema no código (47 templates, 36 landings, formulário, worker), dados reais
(Ahrefs Web Analytics jul/26, Clarity 3 dias, auditoria total de 25/07).

## Diagnóstico (resumo com evidência)

1. **Tráfego real é ~10× menor que o painel sugere.** Clarity (3 dias): 49
   sessões humanas × 587 de robôs no mobile; ~251 sessões humanas/3 dias
   (~2.500/mês). Humanos rolam ~45% da página e veem 1,2 pág./visita.
   Zero rage clicks — o site não está quebrado; a jornada não puxa.
2. **O sistema (diferencial nº 1) não é vendido**: fora do menu/rodapé; a
   narrativa de poder de decisão (Conta que Ninguém Fez, QR validável em 5s,
   painel executivo — docs 11/12) não está em página nenhuma.
3. **Bug de jornada PF**: /coleta-gratuita/ manda o visitante ao formulário
   pré-marcado como "Empresa" (hardcoded em 21 landings PT).
4. **Portas faltando**: governo sem caminho real (link cinza 12px; sem rota
   de licitação/ofício); multinacional só existe como "inglês"; página EN do
   formulário renderiza dentro do chrome PT; PME sem porta avulsa clara.
5. **Menu esconde o que converte** (sem Agendar, sem Portal, sem Governo);
   home com 3 caminhos concorrentes sem hierarquia.
6. **Formulário pede trabalho antes do contato** (categoria, volume,
   descrição obrigatória, CEP/cidade/UF antes de nome/telefone), erra sem
   dizer o campo, e perde o lead para sempre se o Ploomes cair.
7. **Design monótono**: 3 sistemas CSS convivendo; home com ~30 cards; 36
   landings visualmente idênticas; nenhuma imagem de operação.
8. **40 achados da auditoria de 25/07 ainda pendentes**, incl. backlink DR 80
   (TechTudo) em 404, 404 com 173 RD, sem error.hbs, www em 302 duplo.

## Decisões do Marcio (30/07) — valem como réguas do projeto

1. **Sem preço público** no site. Valor sim, preço na conversa/demonstração.
2. **Sem fotos reais de equipe.** Imagens ultra-realistas geradas por IA,
   com régua de honestidade: cenas de operação/ambientação, NUNCA
   apresentadas como retrato documental de pessoas reais ("nossa equipe").
   Nada que possa ser desmentido como "foto falsa de funcionário".
3. **Confidencialidade por design** (não alimentar concorrência): público =
   valor, resultados, prova de autoridade (★4,9/354, DOIs, QR validável);
   reservado = método, processos, preços, telas detalhadas do sistema
   (demonstração e portal logado). Reduzir a exposição atual das 8 telas
   públicas na página do sistema.
4. **Sistema grátis para TODOS os clientes, sem contrato, sem exclusividade,
   sem condição — incluindo pessoa física.** Login com o e-mail cadastrado.
   "Sem pegadinhas, sem segredos." Vira o coração da mensagem: nenhum
   concorrente oferece isso.

### Modelo comercial confirmado (Marcio, 30/07)

- **Grátis**: coleta padrão (prazo de 1 a 7 dias úteis) · sistema/portal
  completo para todo cliente (login com e-mail cadastrado) · todo o resto
  que não estiver listado abaixo.
- **Pago, à parte**: coleta expressa em até 24h (R$ 55) · laudos
  específicos · sanitização de dados com laudo · descarte de equipamentos
  médicos e laboratoriais · programa Adote um Bairro (para quem contratar) ·
  relatórios ESG.
- **Não retiramos**: existe lista de materiais fora do escopo (manter
  visível e clara no site, como já é hoje).
- Exibição de preços no site: regra geral segue "sem preço público"
  (régua 1). Único caso possível de exceção, a decidir pelo Marcio: o
  valor da coleta expressa (taxa operacional B2C, tipo frete). Sem decisão,
  fica fora do site.
5. **EN por transcriação, não tradução literal.** Narrativa: "operação no
   Brasil, serviço vendido e realizado no Brasil, documentação válida para
   auditoria no mundo todo" — na língua de CSRD/Scope 3/due diligence de
   quem responde à matriz. 100% do site EN adaptado a essa realidade.

## Réguas herdadas (continuam valendo)

Zero backlink perdido (301 para tudo) · nada de afirmação sem prova (carbono
só com metodologia declarada; "certificado" só com certificador; risco CONAR
mapeado nas pesquisas) · WhatsApp mantido · conteúdo despublicado vira
rascunho, nunca é apagado · prévia visual antes de publicar página nova ·
meta honesta: multiplicar leads qualificados por visitante humano e zerar
perdas evitáveis (não existe "100% de conversão" literal).

## Plano de lotes

- **Lote 0 — Estancar sangrias** (sem mudar visual): 301 do TechTudo (DR 80)
  e dos 404 com backlinks fortes; error.hbs próprio com CTA; corrigir
  perfil=empresa na coleta-gratuita/condomínios; erros do formulário
  legíveis (mostrar campo); cópia de segurança de todo lead (fallback se o
  Ploomes cair); página EN do formulário fora do chrome PT; www em 301 único.
- **Lote 1 — Design system Ecobraz v2**: identidade própria (mais humana que
  a Villanova), tokens, componentes, diretrizes de imagem IA; prévia
  renderizada para aprovação visual do Marcio ANTES de qualquer página.
- **Lote 2 — Home nova**: pergunta única com portas claras (Pessoa física ·
  Empresa · Governo · Internacional), prova social forte, sistema grátis em
  destaque, 1 CTA primário por porta.
- **Lote 3 — Máquina B2B**: /para-empresas/ como página central de vendas;
  página do sistema recontada como ferramenta de decisão executiva (Conta
  que Ninguém Fez, QR, painel) com exposição reduzida (régua 3); porta
  PME/avulsa separada; mensagem central "sistema grátis sem contrato".
- **Lote 4 — Jornada PF + condomínios + formulário adaptativo por perfil**:
  mínimo de campos (PF: quem, contato, o quê, onde), contato primeiro;
  certificado no portal também para PF como diferencial.
- **Lote 5 — Portas Governo e Internacional**: governo documental (Lei
  13.019 × 14.133, habilitação, ofício); internacional por transcriação
  (régua 5) com ponte Villanova.
- **Lote 6 — Landings de setor/material no v2** + linkagem interna.
- **Lote 7 — Auditoria final + pente fino** (mesmo rito da Villanova).

## Pendências que dependem do Marcio

- Confirmar a premissa da régua 4 (o que permanece pago).
- Licença CETESB nº 11314 (confirmação) · autorização escrita CEJAM ·
  decisão sobre "+5 toneladas" na home.
- Validação futura das imagens IA geradas (aprovação visual por lote).
