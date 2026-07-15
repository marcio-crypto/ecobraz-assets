# Diagnóstico de backlinks — 15/07/2026

Dados do Ahrefs (Site Explorer, links ao vivo, top 100 referring domains por DR).

## Situação atual

| Métrica | ecobraz.org | villanovaesg.com |
|---|---|---|
| Domain Rating (DR) | 36 | 30 |
| Links legítimos de alta autoridade | europa.eu (96), globo.com (91), terra.com.br (86), ig.com.br (83), ifixit.com (83), f6s.com (83), techtudo.com.br (80), em.com.br (79), uai.com.br (74), comunique-se (67), oglobo (53), dino (52), tupi.fm (58) | europa.eu (96), ghost.org (92), f6s.com (83) |
| Domínios marcados como **spam** no top 100 | ~60 | **~97** |

## ⚠️ Alerta principal: infestação de links comprados

Os dois domínios estão cheios de links de redes de venda de backlinks
(padrões `itxoft-*.site`, `fiverr-*.site`, `seoexpress*`, `link-baron*`, `*.shop`, `*.store`,
`buybacklinks.agency` etc.). No caso da villanovaesg.com, **97 dos 100 maiores
referring domains são spam** — só 3 são legítimos.

Isso é o resultado típico de serviços baratos de "backlinks DR alto" (Fiverr e similares).
Esses links **não transferem autoridade** (o Google os neutraliza) e, em escala,
criam risco de ação manual contra o site. Recomendações:

1. **Interromper imediatamente** qualquer serviço contratado de compra de links.
2. Revisar e, se confirmado o padrão, enviar os arquivos de `disavow/` no Google Search Console.
3. Concentrar esforço nos alvos de qualidade de `alvos.csv` — 10 links bons valem mais
   que 1.000 comprados.

## O que os concorrentes de qualidade têm (e a Ecobraz não)

Perfil da greeneletron.org.br (DR 62): www.gov.br, universidades federais (UFMG, UFSC,
Unesp, Unifesp…), imprensa (Estadão, UOL, Abril, EBC), setoriais (ecycle.com.br DR 73,
tecnoblog, olhardigital, tiinside, datacenterdynamics), diretórios (solutudo.com.br DR 75),
associações (gs1br.org, cnm.org.br, sbc.org.br).

Tradução prática: **cadastro oficial (SINIR/gov.br), pauta em veículos setoriais,
parceria com universidades/pesquisa (os DOIs já existentes ajudam muito aqui)
e presença nos diretórios sérios** — exatamente a lista priorizada em `alvos.csv`.

## Consumo de API nesta análise

~1.200 de 100.000 unidades mensais do plano Lite. O monitor mensal consome
na mesma ordem de grandeza por execução.
