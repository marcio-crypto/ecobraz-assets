# Assinaturas de e-mail — Ecobraz Emigre

Padrão visual v2 "Abraço Verde" (`site-ghost/design/PADRAO-V2.md`): logo à
esquerda, barra verde `#8DC63F` de separação, nome em petrol `#0E3B43`,
cargo em cinza `#5E7268` e os contatos com o "dot" verde do padrão.

| Arquivo | Para que serve |
|---|---|
| `assinatura-debora-villanova.html` | A assinatura em si — é este que se cola no Gmail/Outlook |
| `previa-assinatura-debora.html` | Prévia para abrir no navegador (usa a logo local) |
| `previa-assinatura-debora.png` | Imagem da prévia, para conferir sem abrir nada |
| `ecobraz-emigre-logo-380.png` | Cópia da logo (380×126), caso precise subir manualmente |

## Conteúdo desta assinatura

Débora Villanova · Comercial · (11) 4329-2001 · debora@ecobraz.org.br
(só telefone e e-mail, conforme pedido — sem endereço, site ou redes sociais).

## Como instalar no Gmail

1. Abrir `previa-assinatura-debora.html` no navegador (duplo clique no arquivo).
2. Selecionar a assinatura com o mouse — do logo até o e-mail — e copiar
   (`Ctrl+C`). **Não** copiar o título nem o "Att.,".
3. No Gmail: engrenagem ⚙ → **Ver todas as configurações** → aba **Geral** →
   rolar até **Assinatura** → **Criar** (ou escolher a existente).
4. Clicar dentro da caixa de texto da assinatura e colar (`Ctrl+V`).
5. Logo abaixo, em **Padrões da assinatura**, escolher a assinatura em
   "PARA NOVOS E-MAILS" e em "AO RESPONDER/ENCAMINHAR".
6. Rolar até o fim da página e clicar em **Salvar alterações**.
7. Enviar um e-mail de teste para outra conta e conferir se a logo aparece.

## Como instalar no Outlook (aplicativo)

Arquivo → Opções → E-mail → **Assinaturas...** → **Nova**, colar do mesmo
jeito (passos 1 e 2 acima) e definir para novas mensagens e respostas.

## Se a logo não aparecer

O arquivo aponta para `https://ecobraz.org.br/assets/images/ecobraz-emigre-logo-380.png`
(caminho dos assets do tema do Ghost). Se por algum motivo a imagem sair
quebrada no e-mail de teste, dá para resolver de duas formas:

- **No Gmail:** apagar a imagem quebrada e usar o botão "Inserir imagem" da
  caixa de assinatura → **Fazer upload** → escolher `ecobraz-emigre-logo-380.png`
  desta pasta → redimensionar para "Pequena".
- **No arquivo:** trocar o `src` do `<img>` pela URL correta da logo.

## Para criar a assinatura de outra pessoa

Copiar `assinatura-debora-villanova.html`, renomear e trocar apenas nome,
cargo, telefone e e-mail. Não mexer nas cores, tamanhos nem na estrutura de
tabelas — é ela que mantém o layout inteiro no Gmail e no Outlook.

## Página publicada (link para a Débora)

`pagina-assinatura-debora.html` é a versão em página da assinatura, publicada
como artifact: a Débora abre o link, clica em **Copiar assinatura** e cola no
Gmail — sem precisar baixar arquivo nem mexer em HTML.

- Link: https://claude.ai/code/artifact/bd1ca6cb-862e-418e-819e-c53a11f4af03
- **O link nasce privado.** Para a Débora conseguir abrir, o Marcio precisa
  compartilhar pelo menu de compartilhamento da própria página.
- A prévia dentro da página usa a logo embutida (para aparecer mesmo sem rede);
  o que o botão copia usa a logo hospedada em `ecobraz.org.br`, que é o que o
  Gmail precisa.
- Para atualizar a página depois de mudar a assinatura, republicar o mesmo
  arquivo no mesmo link (não criar artifact novo).
