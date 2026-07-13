# Ecobraz — única ação manual para proteger backlinks

O novo site possui **7.913 redirecionamentos** preparados para preservar URLs antigas, backlinks e tráfego orgânico. O Ghost permite importar esse arquivo somente por uma sessão de proprietário no painel; a chave de integração usada na automação não possui essa permissão.

Esta importação não altera o DNS e não tira o site atual do ar.

## Faça exatamente isto

1. No GitHub, abra a execução mais recente de **Deploy Ghost staging**.
2. Na área **Artifacts**, baixe **ecobraz-backlink-redirects-OWNER-IMPORT**.
3. Descompacte o arquivo baixado. Dentro dele estará `redirects.yaml`.
4. Abra o Ghost Admin da Ecobraz.
5. Entre em **Settings / Configurações → Labs → Redirects**.
6. Clique em **Upload redirects** e selecione o `redirects.yaml` que acabou de descompactar.
7. Aguarde a mensagem de sucesso do Ghost.
8. Avise “feito” para executarmos a auditoria automática.

## Atenção

- Não use o arquivo pequeno existente em uma pasta `dist`; use somente o artefato indicado acima.
- Não altere o domínio nem o DNS antes da auditoria automática apresentar zero falhas.
- Se o Ghost mostrar qualquer erro, não tente improvisar: envie uma captura da mensagem.

## Validação técnica após a importação

A auditoria deve testar as URLs prioritárias e uma amostra ampla do inventário legado:

```bash
node site-ghost/scripts/audit-live-redirects.mjs \
  https://ecobraz-emigre.ghost.io \
  site-ghost/migration/legacy-url-inventory.csv \
  250
```

Somente depois dessa validação o checklist de migração libera a troca do domínio.
