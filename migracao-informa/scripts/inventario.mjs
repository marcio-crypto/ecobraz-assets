// Inventário completo do ecobrazinforma.org para a migração de domínio.
// Estratégia: tenta o sitemap; em paralelo, varre os IDs sequenciais das seções
// (/noticia/<id>, /coluna/<id>, ...) — o CMS redireciona o ID para a URL com
// slug, o que nos dá a URL canônica + título/autor/descrição de cada página.
// Sai em migracao-informa/inventario.json (+ relatório de falhas).
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const BASE = 'https://ecobrazinforma.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SECTIONS = [
  {name: 'noticia', max: 1750},
  {name: 'coluna', max: 330},
  {name: 'colunista', max: 15},
  {name: 'conteudo', max: 40},
  {name: 'downloads', max: 60},
  {name: 'ver-noticia', max: 30},
];
const CONCURRENCY = 8;

const browser = await chromium.launch({args: ['--no-sandbox']});
const context = await browser.newContext({userAgent: UA, viewport: {width: 1366, height: 900}});
const api = context.request;

const meta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i');
  return (html.match(re) || html.match(alt))?.[1] || '';
};
const tag = (html, re) => (html.match(re)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function fetchPage(url) {
  // 1º sem JavaScript (rápido); se bloquear, tenta com o navegador de verdade.
  try {
    const response = await api.get(url, {maxRedirects: 5, timeout: 20000});
    if (response.ok()) return {finalUrl: response.url(), html: await response.text(), via: 'http'};
    if (![403, 429, 503].includes(response.status())) return {status: response.status()};
  } catch {}
  const page = await context.newPage();
  try {
    const response = await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
    if (!response || !response.ok()) return {status: response ? response.status() : 0};
    await page.waitForTimeout(400);
    return {finalUrl: page.url(), html: await page.content(), via: 'browser'};
  } catch { return {status: -1}; } finally { await page.close(); }
}

function parse(section, id, result) {
  const {finalUrl, html} = result;
  return {
    section,
    id,
    url: new URL(finalUrl).pathname,
    title: (meta(html, 'og:title') || tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).slice(0, 220),
    h1: tag(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).slice(0, 220),
    description: meta(html, 'description').slice(0, 300) || meta(html, 'og:description').slice(0, 300),
    author: tag(html, /colunista\/\d+\/[^"']+["'][^>]*>([\s\S]*?)<\//i) || meta(html, 'article:author'),
    published: meta(html, 'article:published_time'),
    canonical: (html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || ''),
    words: (html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').match(/\S+/g) || []).length,
  };
}

// Sitemap (se existir, é bônus de cobertura)
const sitemapUrls = new Set();
for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap.txt']) {
  const result = await fetchPage(`${BASE}${path}`);
  if (result.html && result.html.includes('<loc>')) {
    for (const m of result.html.matchAll(/<loc>([^<]+)<\/loc>/g)) sitemapUrls.add(m[1].trim());
    console.log(`Sitemap ${path}: ${sitemapUrls.size} URLs`);
  }
}

const inventory = [];
const failures = [];
let blocked = 0;

for (const {name, max} of SECTIONS) {
  console.log(`Varredura /${name}/ (1..${max})…`);
  const ids = Array.from({length: max}, (_, i) => i + 1);
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (id) => {
      const result = await fetchPage(`${BASE}/${name}/${id}`);
      if (result.html) return parse(name, id, result);
      if (result.status === 404 || result.status === 410) return null;
      failures.push({section: name, id, status: result.status});
      if ([403, 0, -1].includes(result.status)) blocked += 1;
      return null;
    }));
    inventory.push(...results.filter(Boolean));
    if (blocked > 40) { console.log('Bloqueio persistente detectado — abortando varredura para análise.'); break; }
  }
  if (blocked > 40) break;
  console.log(`  /${name}/: ${inventory.filter((r) => r.section === name).length} páginas vivas até aqui.`);
}

await browser.close();
await fs.mkdir('migracao-informa', {recursive: true});
await fs.writeFile('migracao-informa/inventario.json', JSON.stringify({
  generated_note: 'Gerado pela varredura automatizada; datas/horas conforme o runner.',
  base: BASE,
  sitemap_urls: [...sitemapUrls],
  pages: inventory,
  failures,
}, null, 1));
console.log(`\nRESULTADO: ${inventory.length} páginas inventariadas, ${failures.length} falhas (${blocked} bloqueios), sitemap: ${sitemapUrls.size} URLs.`);
if (inventory.length === 0) process.exit(1);
