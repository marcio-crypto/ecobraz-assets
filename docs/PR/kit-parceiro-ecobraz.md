# Kit de parceiro Ecobraz — selo + texto pronto para clientes linkarem

**Data:** 2026-07-19 · Material de apoio ao Plano de Backlinks. **Documento vivo.**
**Objetivo:** transformar a confiança dos clientes que a Ecobraz já atende em **backlinks reais** de sites de empresas (páginas de ESG/sustentabilidade delas). É um dos links de **mais alta confiança** que existem — vem de quem realmente usa o serviço.

> **Divisão de trabalho (honesta):** eu preparo o selo e os textos. **Você (ou o comercial) envia** aos clientes e pede a publicação — isso é relação humana, não dá para eu automatizar (nem enviar e-mail pelos seus clientes). Também **não submeto formulários externos** nem publico no site de terceiros.

---

## ⚠️ Confirme o NAP antes de enviar (30 segundos)

Use **sempre** o mesmo nome/endereço/telefone do seu Google Business Profile. O que achei no repositório (confirme se está exato):

- **Nome:** Ecobraz *(confirmar se no GBP é "Ecobraz" ou "Ecobraz Emigre")*
- **Endereço:** Rua Dona Maria Quedas, 230 — Jardim Andaraí — São Paulo/SP — CEP 02175-010
- **Telefone:** (11) 4329-2001
- **Site:** https://ecobraz.org
- **E-mail:** contato@ecobraz.org.br

Se algo estiver diferente do GBP, me avise que eu corrijo em todos os kits.

---

## 1. E-mail pronto para enviar ao cliente

**Assunto:** Selo de descarte responsável Ecobraz para o site de vocês

> Olá [nome],
>
> A [empresa do cliente] é parceira da Ecobraz na destinação ambientalmente adequada de resíduos eletroeletrônicos. Preparamos um **selo de "descarte responsável"** que vocês podem publicar na página de **sustentabilidade / ESG** do site de vocês — reforça o compromisso ambiental de vocês e ajuda quem visita a entender a cadeia de destinação.
>
> É só copiar o trecho de código abaixo (ou, se preferirem, a versão em texto). Qualquer dúvida da equipe de TI/marketing de vocês, estou à disposição.
>
> Obrigado por confiarem na Ecobraz.
> [assinatura]

---

## 2. Selo HTML (o que o cliente cola no site) — versão com imagem embutida

Este selo é **autossuficiente** (a arte é um SVG embutido no próprio código — não depende de hospedar imagem). O link aponta para a Ecobraz com uma âncora descritiva (bom para SEO da Ecobraz):

```html
<a href="https://ecobraz.org/coleta-de-lixo-eletronico/" rel="noopener"
   style="display:inline-flex;align-items:center;gap:10px;text-decoration:none;
          font-family:Arial,Helvetica,sans-serif;border:1px solid #c8dad6;
          border-radius:10px;padding:10px 14px;background:#ecf3f1;max-width:320px;">
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" fill="#128c46"/>
    <path d="m8.5 12 2.3 2.4L15.8 9" stroke="#fff" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span style="line-height:1.25;">
    <strong style="color:#0b6b38;font-size:14px;">Descarte responsável</strong><br>
    <span style="color:#102300;font-size:12px;">Resíduos eletrônicos destinados via <strong>Ecobraz</strong></span>
  </span>
</a>
```

**Como fica:** um selo verde com escudo + check, escrito "Descarte responsável — Resíduos eletrônicos destinados via Ecobraz", clicável para o site.

## 3. Versão em texto (para quem não pode colar HTML)

> **Descarte responsável.** A [empresa] destina seus resíduos eletroeletrônicos por meio da **[Ecobraz](https://ecobraz.org/)**, operadora de coleta e destinação ambientalmente adequada na Grande São Paulo.

*(A âncora "Ecobraz" com link para ecobraz.org já é suficiente. Se o cliente aceitar uma âncora mais rica, sugerir: "coleta de lixo eletrônico".)*

## 4. Variações de âncora (para não ficar tudo igual — bom para SEO)

Peça a clientes diferentes âncoras diferentes (variação natural evita padrão artificial):

- `Ecobraz`
- `coleta de lixo eletrônico` → https://ecobraz.org/coleta-de-lixo-eletronico/
- `descarte de lixo eletrônico`
- `destinação de resíduos eletrônicos`

---

## 5. Balanço honesto

- **Eu faço:** o selo, os textos, as variações — tudo pronto (acima).
- **Você faz:** enviar aos clientes e pedir a publicação. **Se só puder pedir a poucos, priorize os maiores** (empresas com site forte = link mais valioso).
- **O que NÃO controlo:** se o cliente vai publicar, e quando. Backlink de parceiro é dos mais valiosos justamente porque é voluntário e real — mas depende do "sim" deles.
- **Registro:** cada cliente que publicar, anote no `PLANO-BACKLINKS.md` (tabela "Registro de conquistas") para acompanharmos o efeito no DR ao longo do tempo.
