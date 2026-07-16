// Gera as landing pages comerciais da arquitetura de conversão:
// - theme/page-<slug>.hbs: template visual completo (mesma linguagem da home);
// - content/commercial-pages.json: página sincronizável no Ghost (metas, JSON-LD
//   e um resumo semântico como conteúdo de reserva — a exibição vem do template).
// Fonte única: landing/landing-pages.json. Rode e commite a saída.
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = 'https://ecobraz.org';
const pages = JSON.parse(await fs.readFile(path.join(root, 'landing', 'landing-pages.json'), 'utf8'));

const icons = {
  shield: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>',
  file: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
  box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
  truck: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 7h13v10H1zM14 10h4l4 4v3h-8z"/><circle cx="6" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/></svg>',
  alert: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18h.01"/></svg>',
  lock: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  chart: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>',
  building: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18"/><path d="M8 7h2M8 11h2M8 15h2M14 7h2M14 11h2M14 15h2M10 21v-3h4v3"/></svg>'
};
const wa = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.9 1.5 2 2.4 1.4 1.2 2.5 1.6 2.8 1.7.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2.1 1c.3.2.5.3.6.4 0 .2 0 .8-.3 1.4Z"/></svg>';
const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Bloco "Referência técnica" (DOI no Zenodo) — declarado em landing-pages.json
// no campo opcional `referencia: {doi, titulo}` e renderizado no template
// visível e no conteúdo de reserva do Ghost.
const referenciaSection = (p, slug) => !p.referencia ? '' : `<section class="hx-block">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Referência técnica</span><h2>Base publicada, com identificador permanente</h2></div>
      <p>Este tema é aprofundado em relatório técnico autoral da Ecobraz Emigre, publicado com DOI no repositório aberto Zenodo.</p>
    </div>
    <p style="margin:0">VILLANOVA, Marcio. <em>${esc(p.referencia.titulo)}</em>. Zenodo, 2026. <a class="hx-src" href="https://doi.org/${p.referencia.doi}" rel="noopener" data-track="${slug}_referencia_doi">doi.org/${p.referencia.doi}</a> &nbsp;·&nbsp; <a class="hx-src" href="{{@site.url}}/publicacoes/" data-track="${slug}_referencia_publicacoes">Todas as publicações →</a></p>
  </div>
</section>

`;
const referenciaHtml = (p) => !p.referencia ? '' : `<hr><h2>Referência técnica</h2><p>Este tema é aprofundado em relatório técnico autoral da Ecobraz Emigre, publicado com identificador permanente (DOI) no repositório aberto Zenodo:</p><ul><li>VILLANOVA, Marcio. <em>${esc(p.referencia.titulo)}</em>. Zenodo, 2026. <a href="https://doi.org/${p.referencia.doi}" rel="noopener">doi.org/${p.referencia.doi}</a>.</li></ul><p><a href="/publicacoes/">Conheça todas as publicações técnicas da Ecobraz →</a></p>`;

function renderTemplate(p) {
  const slug = p.slug;
  const formAction = '{{@site.url}}/agendamento/';
  const hiddenMaterial = p.form.material ? `<input type="hidden" name="material" value="${esc(p.form.material)}">` : '';
  const heroBand = p.hero.band.map((b) => `<span><strong>${esc(b.title)}</strong>${esc(b.text)}</span>`).join('\n        ');
  const pains = p.pains.map((c) => `<div class="hx-sol"><span class="hx-icon">${icons[c.icon] || icons.alert}</span><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>${c.consequence ? `<span class="hx-cost">${esc(c.consequence)}</span>` : ''}</div>`).join('\n        ');
  const recognize = p.recognize ? p.recognize.items.map((i) => `<li>${esc(i)}</li>`).join('') : '';
  const contrastBefore = p.contrast ? p.contrast.before.items.map((i) => `<li>${esc(i)}</li>`).join('') : '';
  const contrastAfter = p.contrast ? p.contrast.after.items.map((i) => `<li>${esc(i)}</li>`).join('') : '';
  const gains = p.gains ? p.gains.items.map((g) => `<div class="hx-sol"><span class="hx-icon">${icons[g.icon] || icons.chart}</span><h3>${esc(g.title)}</h3><p>${esc(g.text)}</p></div>`).join('\n        ') : '';
  const why = p.why ? p.why.items.map((w) => `<div class="hx-sol"><span class="hx-icon">${icons[w.icon] || icons.shield}</span><h3>${esc(w.title)}</h3><p>${esc(w.text)}</p></div>`).join('\n        ') : '';
  const scopeIn = p.scope.in.map((i) => `<li>${esc(i)}</li>`).join('');
  const scopeOut = p.scope.out.map((i) => `<li>${esc(i)}</li>`).join('');
  const steps = p.steps.map((s) => `<div class="hx-step"><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div>`).join('\n        ');
  const docs = p.evidence.map((d) => `<div class="hx-doc"><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></div>`).join('\n        ');
  const faq = p.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n        ');
  const related = p.related.map((r) => `<a class="hx-sol" href="{{@site.url}}${r.href}"><span class="hx-icon">${icons[r.icon] || icons.box}</span><h3>${esc(r.title)}</h3><p>${esc(r.text)}</p><span class="hx-go">Ver solução →</span></a>`).join('\n        ');

  return `{{!< default}}
{{! Gerado por scripts/build-landing-pages.mjs a partir de landing/landing-pages.json — não edite à mão. }}
{{#contentFor "head"}}
<link rel="stylesheet" href="{{asset "css/landing.css"}}">
{{/contentFor}}

<section class="hx-hero">
  <div class="container hx-crumbs"><a href="{{@site.url}}/">Início</a> › <a href="{{@site.url}}${p.hub.href}">${esc(p.hub.title)}</a> › ${esc(p.crumb)}</div>
  <div class="container hx-hero-grid">
    <div>
      <span class="hx-label on-dark">${esc(p.hero.eyebrow)}</span>
      <h1>${esc(p.title)}</h1>
      <p class="hx-sub">${esc(p.hero.sub)}</p>
      <div class="hx-hero-ctas">
        <a class="button" href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem=${slug}${p.form.material ? `&amp;material=${encodeURIComponent(p.form.material)}` : ''}" data-track="${slug}_hero_cta">${esc(p.hero.cta)}</a>
        <a class="button hx-btn-outline-dark" href="#como-funciona" data-track="${slug}_hero_como">Como funciona</a>
      </div>
      <div class="hx-hero-band">
        ${heroBand}
      </div>
    </div>
    <form class="hx-quote" id="avaliacao" method="get" action="${formAction}">
      <span class="hx-label">Avaliação técnica</span>
      <h2>${esc(p.form.title)}</h2>
      <p class="hx-hint">${esc(p.form.hint)}</p>
      <input type="hidden" name="perfil" value="empresa">
      <input type="hidden" name="origem" value="${slug}">
      ${hiddenMaterial}
      <div class="hx-field">
        <label for="lp-desc">${esc(p.form.describeLabel)}</label>
        <input id="lp-desc" name="descricao" placeholder="${esc(p.form.describePlaceholder)}">
      </div>
      <div class="hx-field">
        <label for="lp-local">CEP ou cidade da retirada</label>
        <input id="lp-local" name="local" placeholder="Ex.: 02175-010 ou São Paulo">
      </div>
      <button class="button" type="submit" data-track="${slug}_hero_form">${esc(p.form.button || 'Solicitar avaliação técnica')} →</button>
      <div class="hx-or-wa">ou <a href="{{@custom.whatsapp_url}}" rel="noopener" data-track="${slug}_hero_whatsapp">${wa} falar com a equipe no WhatsApp</a></div>
      <p class="hx-micro">${esc(p.form.micro || 'A coleta é confirmada após a avaliação de material, volume, localidade e documentação.')}</p>
    </form>
  </div>
</section>

${p.recognize ? `<section class="hx-block">
  <div class="container hx-reco">
    <div>
      <span class="hx-label">Você se reconhece?</span>
      <h2>${esc(p.recognize.title)}</h2>
      <p class="hx-reco-cta">Bastou um item da lista ser verdade aí dentro? Então esta página foi escrita para você — <a href="#avaliacao">descreva a situação em 1 minuto</a> e receba um retorno técnico, não um telemarketing.</p>
    </div>
    <ul class="hx-reco-list">${recognize}</ul>
  </div>
</section>

` : ''}<section class="hx-block${p.recognize ? ' alt' : ''}">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">O que está em jogo</span><h2>${esc(p.painsTitle)}</h2></div>
      <p>${esc(p.painsSub)}</p>
    </div>
    <div class="hx-sol-grid">
        ${pains}
    </div>
  </div>
</section>

${p.contrast ? `<section class="hx-block">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">A virada</span><h2>${esc(p.contrast.title)}</h2></div>
      <p>${esc(p.contrast.sub)}</p>
    </div>
    <div class="hx-contrast">
      <div class="hx-before"><h3>${esc(p.contrast.before.title)}</h3><ul>${contrastBefore}</ul></div>
      <div class="hx-after"><h3>${esc(p.contrast.after.title)}</h3><ul>${contrastAfter}</ul></div>
    </div>
  </div>
</section>

` : ''}${p.gains ? `<section class="hx-block alt">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">O que você ganha</span><h2>${esc(p.gains.title)}</h2></div>
      <p>${esc(p.gains.sub)}</p>
    </div>
    <div class="hx-sol-grid g4">
        ${gains}
    </div>
  </div>
</section>

` : ''}<section class="hx-block">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Escopo claro</span><h2>${esc(p.scope.title || 'O que entra — e o que não entra')}</h2></div>
      <p>${esc(p.scope.sub || 'Escopo declarado antes do agendamento reduz retrabalho e surpresa. Cada lote é avaliado tecnicamente.')}</p>
    </div>
    <div class="hx-scope">
      <div class="hx-yes"><h3>${esc(p.scope.inTitle || 'Dentro do escopo')}</h3><ul>${scopeIn}</ul><p>${esc(p.scope.conditions)}</p></div>
      <div class="hx-not"><h3>${esc(p.scope.outTitle || 'Fora do escopo')}</h3><ul>${scopeOut}</ul><p>${esc(p.scope.outNote || 'Materiais fora do escopo exigem cadeias específicas e não fazem parte deste serviço.')}</p></div>
    </div>
  </div>
</section>

<section class="hx-block alt" id="como-funciona">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Processo</span><h2>${esc(p.stepsTitle || 'Como funciona, do contato à destinação')}</h2></div>
      <p>${esc(p.stepsSub || 'Nenhuma retirada é confirmada sem avaliação técnica. É isso que mantém a operação previsível e documentável.')}</p>
    </div>
    <div class="hx-steps${p.steps.length === 4 ? ' four' : ''}">
        ${steps}
    </div>
  </div>
</section>

<section class="hx-block">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Evidência da operação</span><h2>${esc(p.evidenceTitle)}</h2></div>
      <p>A documentação reflete o que foi efetivamente executado em cada lote — sem promessa genérica.</p>
    </div>
    <div class="hx-docs">
        ${docs}
    </div>
  </div>
</section>

${p.why ? `<section class="hx-block alt">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Por que a Ecobraz</span><h2>${esc(p.why.title)}</h2></div>
      <p>${esc(p.why.sub)}</p>
    </div>
    <div class="hx-sol-grid g4">
        ${why}
    </div>
  </div>
</section>

` : ''}<section class="hx-block" style="padding-top:0">
  <div class="container">
    <div class="hx-authority">
      <div>
        <span class="hx-label on-dark">Autoridade verificável</span>
        <strong>Associação Auxílio à Reciclagem de Eletrônicos e Inclusão Digital — CNPJ 14.197.457/0001-42</strong>
        <p>${esc(p.authority)}</p>
      </div>
      <a href="{{@site.url}}/evidencias/" data-track="${slug}_evidencias">Ver evidências públicas →</a>
    </div>
  </div>
</section>

<section class="hx-block alt">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Perguntas frequentes</span><h2>${esc(p.faqTitle)}</h2></div>
    </div>
    <div class="hx-faq">
        ${faq}
    </div>
  </div>
</section>

<section class="hx-block">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">Soluções relacionadas</span><h2>Também pode fazer parte da sua operação</h2></div>
    </div>
    <div class="hx-sol-grid">
        ${related}
    </div>
  </div>
</section>

${referenciaSection(p, slug)}<section class="hx-block" style="padding-top:0">
  <div class="container">
    <div class="hx-final">
      <div>
        <span class="hx-label on-dark">${esc(p.final.eyebrow)}</span>
        <h2>${esc(p.final.title)}</h2>
        <p>${esc(p.final.text)}</p>
      </div>
      <div class="hx-actions">
        <a class="button" href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem=${slug}${p.form.material ? `&amp;material=${encodeURIComponent(p.form.material)}` : ''}" data-track="${slug}_final_cta">${esc(p.hero.cta)}</a>
        <a class="button hx-btn-wa" href="{{@custom.whatsapp_url}}" rel="noopener" data-track="${slug}_final_whatsapp">${wa} WhatsApp</a>
      </div>
    </div>
  </div>
</section>

<a class="hx-wa-float" href="{{@custom.whatsapp_url}}" rel="noopener" aria-label="Falar no WhatsApp" data-track="${slug}_whatsapp_flutuante">${wa}<span>Falar no WhatsApp</span></a>
`;
}

function renderHubTemplate(p) {
  const slug = p.slug;
  const groups = p.groups.map((g) => `<section class="hx-block${g.alt ? ' alt' : ''}">
  <div class="container">
    <div class="hx-head-split">
      <div><span class="hx-label">${esc(g.eyebrow)}</span><h2>${esc(g.title)}</h2></div>
      <p>${esc(g.sub)}</p>
    </div>
    <div class="hx-sol-grid">
        ${g.items.map((i) => `<a class="hx-sol" href="{{@site.url}}${i.href}"><span class="hx-icon">${icons[i.icon] || icons.box}</span><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p><span class="hx-go">Ver página →</span></a>`).join('\n        ')}
    </div>
  </div>
</section>`).join('\n\n');

  return `{{!< default}}
{{! Gerado por scripts/build-landing-pages.mjs a partir de landing/landing-pages.json — não edite à mão. }}
{{#contentFor "head"}}
<link rel="stylesheet" href="{{asset "css/landing.css"}}">
{{/contentFor}}

<section class="hx-hero">
  <div class="container hx-crumbs"><a href="{{@site.url}}/">Início</a> › ${esc(p.crumb)}</div>
  <div class="container hx-hero-grid" style="grid-template-columns:1fr">
    <div>
      <span class="hx-label on-dark">${esc(p.hero.eyebrow)}</span>
      <h1>${esc(p.title)}</h1>
      <p class="hx-sub">${esc(p.hero.sub)}</p>
      <div class="hx-hero-ctas">
        <a class="button" href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem=${slug}" data-track="${slug}_hero_cta">${esc(p.hero.cta)}</a>
        <a class="button hx-btn-outline-dark" href="{{@custom.whatsapp_url}}" rel="noopener" data-track="${slug}_hero_whatsapp">Falar no WhatsApp</a>
      </div>
    </div>
  </div>
</section>

${groups}

<section class="hx-block" style="padding-top:0">
  <div class="container">
    <div class="hx-authority">
      <div>
        <span class="hx-label on-dark">${esc(p.note.eyebrow)}</span>
        <strong>${esc(p.note.title)}</strong>
        <p>${esc(p.note.text)}</p>
      </div>
      <a href="{{@site.url}}${p.note.href}" data-track="${slug}_note">${esc(p.note.linkLabel)} →</a>
    </div>
  </div>
</section>

${referenciaSection(p, slug)}<section class="hx-block alt">
  <div class="container">
    <div class="hx-final">
      <div>
        <span class="hx-label on-dark">${esc(p.final.eyebrow)}</span>
        <h2>${esc(p.final.title)}</h2>
        <p>${esc(p.final.text)}</p>
      </div>
      <div class="hx-actions">
        <a class="button" href="{{@site.url}}/agendamento/?perfil=empresa&amp;origem=${slug}" data-track="${slug}_final_cta">${esc(p.hero.cta)}</a>
        <a class="button hx-btn-wa" href="{{@custom.whatsapp_url}}" rel="noopener" data-track="${slug}_final_whatsapp">${wa} WhatsApp</a>
      </div>
    </div>
  </div>
</section>

<a class="hx-wa-float" href="{{@custom.whatsapp_url}}" rel="noopener" aria-label="Falar no WhatsApp" data-track="${slug}_whatsapp_flutuante">${wa}<span>Falar no WhatsApp</span></a>
`;
}

function renderHubSyncEntry(p) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: p.title,
        url: `${base}/${p.slug}/`,
        description: p.meta_description,
        isPartOf: {'@id': `${base}/#website`},
        about: {'@id': `${base}/#organization`}
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'Início', item: `${base}/`},
          {'@type': 'ListItem', position: 2, name: p.crumb, item: `${base}/${p.slug}/`}
        ]
      },
      {
        '@type': 'ItemList',
        itemListElement: p.groups.flatMap((g) => g.items).map((i, index) => ({'@type': 'ListItem', position: index + 1, name: i.title, url: `${base}${i.href}`}))
      }
    ]
  };
  const html = [
    `<p>${esc(p.hero.sub)}</p>`,
    ...p.groups.map((g) => `<h2>${esc(g.title)}</h2><ul>${g.items.map((i) => `<li><a href="${i.href}">${esc(i.title)}</a> — ${esc(i.text)}</li>`).join('')}</ul>`),
    `<p>${esc(p.note.text)} <a href="${p.note.href}">${esc(p.note.linkLabel)}</a>.</p>`,
    `<p><a href="/agendamento/?perfil=empresa&amp;origem=${p.slug}">${esc(p.hero.cta)}</a>.</p>`
  ].join('') + referenciaHtml(p);
  return {
    title: p.title,
    slug: p.slug,
    custom_excerpt: p.custom_excerpt,
    meta_title: p.meta_title,
    meta_description: p.meta_description,
    codeinjection_head: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    html
  };
}

function renderSyncEntry(p) {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: p.title,
        serviceType: p.serviceType,
        provider: {'@id': `${base}/#organization`},
        areaServed: {'@type': 'AdministrativeArea', name: 'São Paulo e região; operações corporativas avaliadas em outras regiões do Brasil'},
        url: `${base}/${p.slug}/`,
        description: p.meta_description
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'Início', item: `${base}/`},
          {'@type': 'ListItem', position: 2, name: p.hub.title, item: `${base}${p.hub.href}`},
          {'@type': 'ListItem', position: 3, name: p.crumb, item: `${base}/${p.slug}/`}
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: p.faq.map((f) => ({'@type': 'Question', name: f.q, acceptedAnswer: {'@type': 'Answer', text: f.a}}))
      }
    ]
  };
  // Conteúdo de reserva no Ghost (a exibição vem do template page-<slug>.hbs);
  // mantém os links internos auditáveis e um resumo legível no editor.
  const html = [
    `<p>${esc(p.hero.sub)}</p>`,
    `<h2>${esc(p.painsTitle)}</h2>`,
    `<p>${esc(p.painsSub)}</p>`,
    `<h2>Escopo</h2><p>${esc(p.scope.conditions)}</p>`,
    `<p>Solução do hub <a href="${p.hub.href}">${esc(p.hub.title)}</a>. Relacionadas: ${p.related.map((r) => `<a href="${r.href}">${esc(r.title)}</a>`).join(', ')}. Comprovação: <a href="/documentacao-e-rastreabilidade/">documentação e rastreabilidade</a> e <a href="/evidencias/">evidências públicas</a>.</p>`,
    `<p><a href="/agendamento/?perfil=empresa&amp;origem=${p.slug}">Solicitar avaliação técnica</a>.</p>`
  ].join('') + referenciaHtml(p);
  return {
    title: p.title,
    slug: p.slug,
    custom_excerpt: p.custom_excerpt,
    meta_title: p.meta_title,
    meta_description: p.meta_description,
    codeinjection_head: `<script type="application/ld+json">${JSON.stringify(ld)}</script>`,
    html
  };
}

const syncEntries = [];
for (const p of pages) {
  const isHub = p.type === 'hub';
  const template = isHub ? renderHubTemplate(p) : renderTemplate(p);
  await fs.writeFile(path.join(root, 'theme', `page-${p.slug}.hbs`), template);
  syncEntries.push(isHub ? renderHubSyncEntry(p) : renderSyncEntry(p));
  console.log('Gerado page-%s.hbs%s', p.slug, isHub ? ' (hub)' : '');
}
await fs.writeFile(path.join(root, 'content', 'commercial-pages.json'), JSON.stringify(syncEntries, null, 2) + '\n');
console.log('Gerado content/commercial-pages.json com %d páginas.', syncEntries.length);
