import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = String(process.argv[2] || 'https://ecobraz-emigre.ghost.io').replace(/\/$/, '');
const contentDir = path.resolve(import.meta.dirname, '..', 'content');
const errors = [];
const warnings = [];
let checkedPages = 0;
let checkedLinks = 0;

const files = (await fs.readdir(contentDir)).filter((name) => name.endsWith('.json')).sort();
const routes = ['/', '/agendamento/', '/blog/'];
for (const name of files) {
  const items = JSON.parse(await fs.readFile(path.join(contentDir, name), 'utf8'));
  for (const item of items) {
    routes.push(name === 'priority-posts.json' ? `/blog/${item.slug}/` : `/${item.slug}/`);
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

for (const route of routes) {
  let response;
  try {
    response = await fetchPage(route);
  } catch (error) {
    errors.push(`${route}: fetch failed (${error.message})`);
    continue;
  }
  if (response.status !== 200) {
    errors.push(`${route}: expected 200, received ${response.status}`);
    continue;
  }
  checkedPages += 1;
  const html = await response.text();

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
      // O endpoint do gtag devolve 404 quando o ID de medição não existe no GA4.
      const gtagResponse = await fetch(`https://www.googletagmanager.com/gtag/js?id=${gtagMatch[1]}`);
      if (!gtagResponse.ok) errors.push(`/: GA4 measurement ID ${gtagMatch[1]} appears invalid (gtag.js returned ${gtagResponse.status}) — no data reaches Google Analytics`);
    }
    const hrefs = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
    const internal = [...new Set(hrefs
      .filter((href) => href.startsWith(baseUrl) || (href.startsWith('/') && !href.startsWith('//')))
      .map((href) => href.replace(baseUrl, ''))
      .filter((href) => href.startsWith('/') && !href.startsWith('/ghost')))];
    for (const link of internal) {
      const linkResponse = await fetch(`${baseUrl}${link}`, {redirect: 'follow', headers: {'User-Agent': 'Ecobraz site audit'}});
      checkedLinks += 1;
      if (!linkResponse.ok) errors.push(`/ -> ${link}: broken internal link (${linkResponse.status})`);
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
for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log('Live site audit passed: status, H1, titles, canonicals, structured data, form wiring, sitemap and robots.');
