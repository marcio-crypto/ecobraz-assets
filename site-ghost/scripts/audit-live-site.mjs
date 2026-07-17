import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = String(process.argv[2] || 'https://ecobraz-emigre.ghost.io').replace(/\/$/, '');
// Slugs EN registrados (podem ainda não existir ao vivo durante a migração bilíngue).
let enPendentes = new Set();
try {
  const paresIdioma = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '..', 'pares-idioma.json'), 'utf8'));
  enPendentes = new Set((paresIdioma.pages || []).map((par) => par.en).filter(Boolean));
} catch {}
const contentDir = path.resolve(import.meta.dirname, '..', 'content');
const errors = [];
const warnings = [];
let checkedPages = 0;
let checkedLinks = 0;

// tags-meta.json são metadados de tag (arquivos de arquivo /blog/tag/...), não
// páginas na raiz — fora da verificação de rotas ao vivo.
const files = (await fs.readdir(contentDir)).filter((name) => name.endsWith('.json') && name !== 'tags-meta.json').sort();
// alternates: URLs de transição aceitas enquanto o routes.yaml novo não é
// importado no painel do Ghost (posts do museu ficam em /blog/ até lá; as
// páginas de autor respondem na URL "achatada" /autor-<nome>/).
const routes = ['/', '/agendamento/', '/blog/',
  {route: '/noticias-esg/', alternates: ['/blog/']},
  {route: '/museu/', alternates: ['/blog/']}];
for (const name of files) {
  const items = JSON.parse(await fs.readFile(path.join(contentDir, name), 'utf8'));
  for (const item of items) {
    if (name === 'priority-posts.json' || name === 'en-posts.json') routes.push(`/blog/${item.slug}/`);
    else if (name === 'migrated-posts.json') {
      const isMuseu = (item.tags || []).some((tag) => tag.slug === 'museu-do-eletronico');
      routes.push(isMuseu ? {route: `/museu/${item.slug}/`, alternates: [`/blog/${item.slug}/`]} : `/blog/${item.slug}/`);
    } else if (name === 'autor-pages.json') {
      routes.push({route: `/autor/${item.slug.replace(/^autor-/, '')}/`, alternates: [`/${item.slug}/`]});
    } else routes.push(`/${item.slug}/`);
  }
}

async function fetchPage(route) {
  const response = await fetch(`${baseUrl}${route}`, {redirect: 'manual', headers: {'User-Agent': 'Ecobraz site audit'}});
  return response;
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i'));
  return match ? match[1] : '';
}

const obfuscatedPages = [];
for (const entry of routes) {
  const route = typeof entry === 'string' ? entry : entry.route;
  const alternates = typeof entry === 'string' ? [] : (entry.alternates || []);
  let response;
  let effectiveRoute = route;
  try {
    response = await fetchPage(route);
    for (const alt of alternates) {
      if (response.status === 200) break;
      const altResponse = await fetchPage(alt);
      if (altResponse.status === 200) { response = altResponse; effectiveRoute = alt; warnings.push(`${route}: ainda respondendo em ${alt} (routes.yaml pendente)`); }
    }
  } catch (error) {
    errors.push(`${route}: fetch failed (${error.message})`);
    continue;
  }
  if (response.status !== 200) {
    // Exceção temporária: /en/ segue 301 até o proprietário reimportar o
    // redirects.yaml atualizado no Ghost Admin (Labs) — o Ghost 6 bloqueia o
    // upload por integração, então a regra antiga '^/en/?$: /' ainda está ativa.
    if (route === '/en/' && response.status === 301) {
      warnings.push(`${route}: 301 pendente da reimportação manual do redirects.yaml (Labs)`);
      continue;
    }
    errors.push(`${route}: expected 200, received ${response.status}`);
    continue;
  }
  checkedPages += 1;
  const html = await response.text();

  // Sinaliza (sem falhar) se a Cloudflare ainda está ofuscando e-mails, o que
  // gera links quebrados /cdn-cgi/l/email-protection na auditoria do Ahrefs.
  if (html.includes('/cdn-cgi/l/email-protection')) obfuscatedPages.push(effectiveRoute);

  const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1Count !== 1) errors.push(`${route}: expected exactly 1 <h1>, found ${h1Count}`);

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!titleMatch || !titleMatch[1].trim()) errors.push(`${route}: missing <title>`);

  const canonicalTag = (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [])[0];
  if (!canonicalTag) {
    errors.push(`${route}: missing canonical link`);
  } else {
    const canonical = attr(canonicalTag, 'href');
    const expected = `${baseUrl}${route}`;
    if (canonical !== expected) warnings.push(`${route}: canonical is ${canonical}, expected ${expected}`);
  }

  const descriptionTags = html.match(/<meta[^>]+name=["']description["'][^>]*>/gi) || [];
  if (!descriptionTags.length || !attr(descriptionTags[0], 'content').trim()) {
    warnings.push(`${route}: missing meta description`);
  } else if (descriptionTags.length > 1) {
    errors.push(`${route}: ${descriptionTags.length} meta description tags (must be exactly 1)`);
  }

  if (route === '/') {
    if (!html.includes('application/ld+json')) errors.push('/: missing JSON-LD structured data');
    if (!/wa\.me\//.test(html)) errors.push('/: missing WhatsApp link');
    const gtagMatch = html.match(/googletagmanager\.com\/gtag\/js\?id=(G-[A-Z0-9]+)/);
    if (!gtagMatch) errors.push('/: Google Analytics (gtag) not installed');
    else {
      // O ID publicado deve ser exatamente o oficial do repositório (o painel do
      // Ghost pode sobrepor o default do tema sem ninguém perceber).
      const themePackage = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '..', 'theme', 'package.json'), 'utf8'));
      const officialId = themePackage.config.custom.ga_measurement_id.default;
      if (gtagMatch[1] !== officialId) errors.push(`/: published GA4 tag is ${gtagMatch[1]}, expected ${officialId} — fix "Ga measurement id" in Ghost Design settings`);
      // O endpoint do gtag devolve 404 quando o ID de medição não existe no GA4.
      const gtagResponse = await fetch(`https://www.googletagmanager.com/gtag/js?id=${gtagMatch[1]}`);
      if (!gtagResponse.ok) errors.push(`/: GA4 measurement ID ${gtagMatch[1]} appears invalid (gtag.js returned ${gtagResponse.status}) — no data reaches Google Analytics`);
    }
    if (!html.includes('clarity.ms/tag/"+i') && !html.includes('clarity.ms/tag/')) errors.push('/: Microsoft Clarity (mapa de calor) não está instalado');
    const hrefs = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
    const internal = [...new Set(hrefs
      .filter((href) => href.startsWith(baseUrl) || (href.startsWith('/') && !href.startsWith('//')))
      .map((href) => href.replace(baseUrl, ''))
      // /cdn-cgi/ são links técnicos injetados pela Cloudflare (ex.: ofuscação
      // de e-mail), decodificados por JavaScript — não são páginas do site.
      .filter((href) => href.startsWith('/') && !href.startsWith('/ghost') && !href.startsWith('/cdn-cgi/')))];
    for (const link of internal) {
      const linkResponse = await fetch(`${baseUrl}${link}`, {redirect: 'follow', headers: {'User-Agent': 'Ecobraz site audit'}});
      checkedLinks += 1;
      if (!linkResponse.ok) {
        // Páginas EN declaradas em pares-idioma.json podem ainda não estar
        // publicadas (a tradução é publicada em lote) — pendência, não erro.
        if (enPendentes.has(link.replace(/\/$/, '').replace(/^\//, ''))) {
          warnings.push(`/ -> ${link}: página EN ainda não publicada (pendente do lote de tradução)`);
        } else {
          errors.push(`/ -> ${link}: broken internal link (${linkResponse.status})`);
        }
      }
    }
  }

  if (route === '/agendamento/') {
    if (!html.includes('ecobraz-coletas')) errors.push('/agendamento/: collection endpoint (ecobraz-coletas worker) not configured in page');
    for (const field of ['name="profile"', 'name="material_category"', 'name="email"', 'name="service_consent"']) {
      if (!html.includes(field)) errors.push(`/agendamento/: missing form field ${field}`);
    }
    for (const banned of ['<option>Iluminação</option>']) {
      if (html.includes(banned)) errors.push(`/agendamento/: out-of-scope category still offered: ${banned}`);
    }
  }
}

const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
if (!sitemap.ok) errors.push(`/sitemap.xml: ${sitemap.status}`);
else {
  const xml = await sitemap.text();
  if (!xml.includes('sitemap')) errors.push('/sitemap.xml: unexpected content');
}
const robots = await fetch(`${baseUrl}/robots.txt`);
if (!robots.ok) errors.push(`/robots.txt: ${robots.status}`);

console.log(`Audited ${checkedPages} live pages and ${checkedLinks} home internal links on ${baseUrl}.`);
if (obfuscatedPages.length === 0) {
  console.log('Ofuscação de e-mail da Cloudflare: DESLIGADA (nenhuma página com /cdn-cgi/l/email-protection).');
} else {
  console.warn(`WARN: ofuscação de e-mail ainda ativa/cacheada em ${obfuscatedPages.length} página(s): ${obfuscatedPages.slice(0, 8).join(', ')}`);
}
for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('Live site audit passed: status, H1, titles, canonicals, structured data, form wiring, sitemap and robots.');
