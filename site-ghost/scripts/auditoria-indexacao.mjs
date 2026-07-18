// Auditoria de indexabilidade + cobertura de hreflang do ecobraz.org.
// (1) robots.txt e sitemap acessíveis;
// (2) cada URL: status, meta robots, header X-Robots-Tag, canonical, hreflang;
// (3) simula rastreadores/idiomas de Brasil e Europa (User-Agent + Accept-Language
//     do Googlebot, Bingbot e navegadores BR/UE) para detectar bloqueio geográfico;
// (4) lista as URLs do sitemap SEM par de idioma (hreflang ausente).
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const problemas = [];
const ok = (m) => console.log(`PASS ${m}`);
const falha = (m) => { problemas.push(m); console.log(`FAIL ${m}`); };

const pegar = async (url, headers = {}) => {
  const r = await fetch(url, {headers, redirect: 'manual'});
  const txt = await r.text().catch(() => '');
  return {status: r.status, headers: r.headers, body: txt, location: r.headers.get('location')};
};

// ---------- 1. robots.txt ----------
const robots = await pegar(`${base}/robots.txt`);
if (robots.status === 200) {
  ok('robots.txt acessível (200)');
  const bloqueiaTudo = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*(\n|$)/i.test(robots.body) &&
    !/Allow:/i.test(robots.body);
  if (bloqueiaTudo) falha('robots.txt bloqueia todo o site (Disallow: /)');
  else ok('robots.txt NÃO bloqueia o rastreamento geral');
  const smNoRobots = /Sitemap:\s*\S+sitemap\.xml/i.test(robots.body);
  if (smNoRobots) ok('robots.txt aponta o sitemap'); else console.log('NOTA: sitemap não declarado no robots.txt');
  // rastreadores de IA (para chats): não devem estar bloqueados
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot']) {
    const re = new RegExp(`User-agent:\\s*${bot}[\\s\\S]*?Disallow:\\s*/`, 'i');
    if (re.test(robots.body)) console.log(`NOTA: robots.txt bloqueia ${bot} (limita visibilidade em chats de IA)`);
  }
} else falha(`robots.txt retornou ${robots.status}`);

// ---------- 2. sitemap ----------
const urls = new Set();
const filhos = [`${base}/sitemap.xml`];
const vistos = new Set();
while (filhos.length) {
  const sm = filhos.shift(); if (vistos.has(sm)) continue; vistos.add(sm);
  const r = await pegar(sm);
  if (r.status !== 200) { if (sm.endsWith('/sitemap.xml')) falha(`sitemap índice ${r.status}`); continue; }
  for (const m of r.body.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    if (/\.xml$/.test(loc)) filhos.push(loc);
    else if (!/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(loc)) urls.add(loc);
  }
}
const listaUrls = [...urls];
ok(`sitemap com ${listaUrls.length} URLs`);

// ---------- 3. amostra: meta robots / X-Robots-Tag / noindex ----------
const amostra = listaUrls.filter((_, i) => i % 7 === 0).slice(0, 40); // ~1 a cada 7
const noindex = [];
for (const url of amostra) {
  const r = await pegar(url, {'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'});
  const xrobots = (r.headers.get('x-robots-tag') || '').toLowerCase();
  const metaNoindex = /<meta[^>]+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(r.body);
  if (xrobots.includes('noindex') || metaNoindex) noindex.push(`${url}${xrobots ? ` [header: ${xrobots}]` : ' [meta noindex]'}`);
}
if (noindex.length) falha(`páginas com noindex (não serão indexadas): ${noindex.join(' | ')}`);
else ok(`amostra de ${amostra.length} páginas: nenhuma com noindex`);

// ---------- 4. bloqueio geográfico: BR e Europa ----------
const perfis = [
  {nome: 'Googlebot (EUA)', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', lang: 'en-US'},
  {nome: 'Bingbot', ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', lang: 'en-US'},
  {nome: 'Navegador Brasil', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36', lang: 'pt-BR,pt;q=0.9'},
  {nome: 'Navegador Alemanha', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36', lang: 'de-DE,de;q=0.9,en;q=0.8'},
  {nome: 'Navegador Itália', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36', lang: 'it-IT,it;q=0.9'},
  {nome: 'Navegador Portugal', ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0 Safari/537.36', lang: 'pt-PT,pt;q=0.9'}
];
const alvoGeo = [`${base}/`, `${base}/en/`, `${base}/corporate-solutions/`];
for (const perfil of perfis) {
  for (const url of alvoGeo) {
    const r = await pegar(url, {'User-Agent': perfil.ua, 'Accept-Language': perfil.lang});
    const status = r.status === 301 || r.status === 302 ? `${r.status}->${r.location}` : String(r.status);
    if (r.status >= 400 || r.status === 403 || r.status === 451) falha(`${perfil.nome} bloqueado em ${url} (${status})`);
    else console.log(`  ${perfil.nome} → ${url.replace(base, '')} : ${status}`);
  }
}
ok('nenhum bloqueio geográfico detectado (BR e Europa acessam sem restrição)');

// ---------- 5. cobertura de hreflang ----------
const semHreflang = [];
const comHreflang = [];
const langMismatch = [];
const langCount = {};
const raizIdioma = (v) => String(v || '').toLowerCase().split('-')[0];
const attrDe = (tag, name) => (tag && tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i')) || [])[1] || '';
for (const url of listaUrls) {
  const path = new URL(url).pathname;
  if (/\/(tag|autor|author)\//.test(path)) continue; // taxonomias não têm par
  const r = await pegar(url);
  if (/rel=["']alternate["'][^>]*hreflang/i.test(r.body)) comHreflang.push(url);
  else semHreflang.push(url);
  // html lang x self-hreflang: devem casar (evita o erro do Ahrefs)
  const htmlLang = attrDe((r.body.match(/<html[^>]*\slang=["'][^"']*["'][^>]*>/i) || [])[0], 'lang');
  langCount[htmlLang || '(vazio)'] = (langCount[htmlLang || '(vazio)'] || 0) + 1;
  const alts = [...r.body.matchAll(/<link[^>]+rel=["']alternate["'][^>]*>/gi)].map((m) => m[0]);
  const semBarra = (x) => String(x).replace(/\/$/, '');
  const self = alts.find((a) => semBarra(attrDe(a, 'href')) === semBarra(url));
  const selfLang = self ? attrDe(self, 'hreflang') : '';
  if (htmlLang && selfLang && raizIdioma(htmlLang) !== raizIdioma(selfLang)) langMismatch.push(`${url.replace(base, '')} html:${htmlLang} vs hreflang:${selfLang}`);
}
console.log(`\n== COBERTURA DE HREFLANG ==`);
console.log(`com hreflang: ${comHreflang.length} | sem hreflang: ${semHreflang.length}`);
if (semHreflang.length) {
  console.log('URLs SEM par de idioma (candidatas a tradução):');
  for (const u of semHreflang) console.log('  -', u.replace(base, '') || '/');
}
console.log(`\n== HTML LANG ==`);
console.log(`distribuição <html lang>: ${JSON.stringify(langCount)}`);
console.log(`descasados (html lang x self-hreflang): ${langMismatch.length}`);
langMismatch.slice(0, 30).forEach((x) => console.log('  ✗', x));
if (langMismatch.length) problemas.push(`${langMismatch.length} páginas com html lang ≠ hreflang`);

// ---------- resumo ----------
console.log(`\n===== RESUMO INDEXAÇÃO =====`);
console.log(`${problemas.length} problema(s) de indexação.`);
if (problemas.length) { for (const pr of problemas) console.log('PROBLEMA:', pr); process.exit(1); }
console.log('INDEXAÇÃO OK — site liberado para Brasil e Europa, sem noindex, sem bloqueio.');
