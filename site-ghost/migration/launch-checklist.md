# Ecobraz — checklist de migração para o Ghost

Este documento protege conversão, autoridade orgânica e continuidade operacional durante a troca de `ecobraz.org` para o novo Ghost.

## 1. Antes da troca

- [ ] Manter o site atual publicado até a aprovação final do staging.
- [ ] Guardar exportação completa do site antigo, banco, mídia, sitemap e configuração DNS.
- [ ] Confirmar que o último GitHub Actions terminou com sucesso.
- [ ] Confirmar no Ghost as 26 páginas gerenciadas e os artigos importados.
- [ ] Conferir no celular e no computador: início, blog, soluções, materiais e formulário.
- [ ] Testar uma solicitação empresarial e uma residencial.
- [ ] Confirmar criação do contato e negócio no Ploomes.
- [ ] Confirmar entrada no E-goi apenas quando o consentimento de marketing estiver marcado.
- [ ] Confirmar telefone, WhatsApp, e-mail, CNPJ e endereço institucional.
- [ ] Importar `redirects.yaml` no Ghost seguindo `migration/IMPORTAR-REDIRECTS.md`.
- [ ] Executar a auditoria de redirecionamentos e exigir zero falhas antes de trocar o domínio.
- [ ] Registrar o horário da troca e reduzir o TTL do DNS com antecedência, se aplicável.

## 2. Troca do domínio

> **Bloqueio de segurança:** não iniciar esta etapa enquanto a importação e a auditoria dos redirecionamentos não estiverem concluídas.

- [ ] Adicionar `ecobraz.org` como domínio personalizado no Ghost.
- [ ] Aplicar no Cloudflare somente os registros DNS fornecidos pelo Ghost.
- [ ] Não apagar registros de e-mail, SPF, DKIM, DMARC ou outros serviços.
- [ ] Aguardar o certificado SSL ficar ativo antes de divulgar o novo site.
- [ ] Confirmar que `http`, `https`, `www` e sem `www` consolidam em uma versão canônica.

## 3. Testes imediatos

- [ ] Abrir a página inicial, `/agendamento/`, `/blog/`, `/como-funciona/` e `/pontos-de-coleta/`.
- [ ] Testar as URLs P0 e P1 do arquivo `redirect-map.csv`.
- [ ] Confirmar redirecionamento direto em uma etapa, sem cadeia ou loop.
- [ ] Enviar novo formulário no domínio final e validar Ploomes e E-goi.
- [ ] Conferir sitemap, robots.txt, canonical, título, descrição e dados estruturados.
- [ ] Conferir menus, logotipo, imagens, WhatsApp e telefone em mobile.

## 4. Google e monitoramento

- [ ] Manter a propriedade existente do Search Console; o domínio continua sendo o mesmo.
- [ ] Enviar o sitemap novo no Search Console.
- [ ] Verificar páginas com erro de indexação, 404 e redirecionamento.
- [ ] Monitorar cliques, impressões, posições e conversões diariamente na primeira semana.
- [ ] Comparar tráfego e leads em 7, 14, 30, 60 e 90 dias.
- [ ] Não remover redirects antigos durante pelo menos 12 meses; manter permanentemente os que recebem backlinks ou tráfego.

## 5. Segurança ao finalizar

- [ ] Excluir a integração temporária do Ghost usada na implantação.
- [ ] Excluir `GHOST_ADMIN_URL` e `GHOST_ADMIN_API_KEY` dos GitHub Actions secrets.
- [ ] Manter no GitHub apenas código e arquivos sem credenciais.
- [ ] Registrar quem possui acesso administrativo ao Ghost, Cloudflare, GitHub, Ploomes e E-goi.
