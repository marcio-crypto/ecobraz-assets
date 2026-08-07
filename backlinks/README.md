# Sistema de backlinks — Ecobraz + Villanova ESG

Automação **semiautomática** de construção de autoridade: a máquina varre, compara e
aponta; o cadastro em si é assistido (Claude preenche, humano revisa e resolve CAPTCHA).

## Por que não é 100% automático

Cadastro totalmente autônomo em massa esbarra em três muros:

1. **CAPTCHA e verificação por e-mail/telefone** existem justamente para impedir robôs.
2. **Termos de uso** dos diretórios proíbem cadastro automatizado — conta banida e link perdido.
3. **É a estratégia errada**: o diagnóstico de 15/07/2026 mostra o que o cadastro em massa
   produz — dezenas de domínios spam que o Google neutraliza ou pune
   (ver `relatorios/2026-07-15-diagnostico.md`). Autoridade se herda de poucos links bons,
   não de muitos links quaisquer.

## Como o sistema funciona

```
alvos.csv  ←  lista curada de onde VALE A PENA estar (P0 a P3)
    ↓
backlink-gap.mjs  ←  consulta a API do Ahrefs e marca o que já tem link
    ↓
relatorios/AAAA-MM-DD-gap.md  ←  o que falta + spam novo detectado
    ↓
GitHub Actions (mensal)  ←  roda sozinho e abre PR com o relatório
```

### Arquivos

| Arquivo | Função |
|---|---|
| `alvos.csv` | Lista priorizada de diretórios, cadastros oficiais, associações e perfis. Colunas de status por empresa: `pendente`, `tem_link`, `verificar`, `tem_pagina`, `nao_aplica`, `descartado`. |
| `dados-cadastro.md` | NAP e descrições prontas para copiar em qualquer formulário (consistência importa). |
| `scripts/backlink-gap.mjs` | Compara alvos × referring domains reais (API Ahrefs) e atualiza os status. |
| `disavow/*.txt` | Rascunhos de disavow com o spam identificado. **Não enviar sem revisão.** |
| `relatorios/` | Diagnósticos e relatórios mensais. |
| `../.github/workflows/backlink-monitor.yml` | Execução mensal automática (requer secret `AHREFS_API_KEY`). |

### Ativar o monitor mensal

1. No GitHub: Settings → Secrets and variables → Actions → New repository secret.
2. Nome `AHREFS_API_KEY`, valor = chave da API do Ahrefs (plano Lite já serve).
3. Pronto — todo dia 1º o workflow roda e abre um PR com o relatório quando houver novidade.
   Também dá para disparar manualmente em Actions → "Monitor mensal de backlinks" → Run workflow.

### Rodar localmente

```bash
AHREFS_API_KEY=... node backlinks/scripts/backlink-gap.mjs
```

## Fluxo de cadastro assistido (o mais perto do "assume minha máquina")

O Claude não consegue operar a sua máquina a partir desta sessão na nuvem, mas **localmente**
(app desktop do Claude/Cowork ou extensão Claude no Chrome) o fluxo fica assim:

1. Abrir o próximo alvo `P0`/`P1` com status `pendente` em `alvos.csv`.
2. Pedir: *"preencha o cadastro deste site com os dados de `backlinks/dados-cadastro.md`"* —
   o Claude navega, preenche os formulários e para nos pontos de verificação.
3. Você resolve CAPTCHA/confirmação de e-mail e revisa antes de enviar (2 min por cadastro).
4. O monitor mensal confirma sozinho quando o link ficar no ar (status vira `tem_link`).

## Regras de ouro

- Nunca contratar "pacotes de backlinks" — foi isso que gerou o lixo atual.
- Priorizar P0 antes de P1, P1 antes de P2. Os P3 são opcionais.
- Um cadastro bem-feito por semana supera vinte apressados.
- Links realmente transformadores (gov.br/SINIR, universidades, imprensa setorial)
  vêm de relacionamento e pauta, não de formulário — os DOIs publicados e a parceria
  com a Europa (link da europa.eu já existente!) são os melhores ativos para isso.
