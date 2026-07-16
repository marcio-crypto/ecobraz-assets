// Inventário técnico do villanovaesg.com (Fase 0 do plano — manual §22/P1-04).
// Varre o sitemap ao vivo e coleta, por página: status, título, meta description,
// canônica, meta robots, H1, hreflang, tipos de JSON-LD e sinais de risco
// (links para /eudr-audit/, "audit" em título, datas regulatórias antigas).
// Uso: node site-villanova/scripts/inventario-site.mjs https://www.villanovaesg.com
import fs from 'node:fs/promises';

const BASE = (process.argv[2] || 'https://www.villanovaesg.com').replace(/\/$/, '');
const UA = {headers: {'User-Agent': 'Mozilla/5.0 (compatible; EcobrazInventario/1.0)'}};

const xml = async (url) => {
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.text();
};
const locs = (s) => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

const indice = await xml(`${BASE}/sitemap.xml`);
const filhos = locs(indice).filter((u) => u.endsWith('.xml'));
const urls = [];
for (const f of filhos) urls.push(...locs(await xml(f)).filter((u) => !/\.(png|jpe?g|webp|gif|svg)$/i.test(u)));
console.log(`Sitemap: ${urls.length} URLs em ${filhos.length} sitemaps`);

const pega = (html, rx) => (html.match(rx) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
const inventario = [];
for (const url of urls) {
  try {
    const r = await fetch(url, UA);
    const html = await r.text();
    const item = {
      url,
      status: r.status,
      title: pega(html, /<title[^>]*>([^<]*)<\/title>/i),
      meta_description: pega(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                        pega(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
      canonical: pega(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
      robots: pega(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
      h1: pega(html, /<h1[^>]*>(.*?)<\/h1>/is).replace(/<[^>]+>/g, ''),
      hreflang: [...html.matchAll(/<link[^>]+hreflang=["']([^"']+)["']/gi)].map((m) => m[1]),
      ldtypes: [...html.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]),
      palavras: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
      links_eudr_audit: (html.match(/href="[^"]*\/eudr-audit\//g) || []).length,
    };
    inventario.push(item);
  } catch (e) {
    inventario.push({url, status: 'ERRO', erro: String(e).slice(0, 120)});
  }
}
await fs.writeFile('villanova-inventario.json', JSON.stringify(inventario, null, 1));

// resumo dos sinais de risco
const semCanonical = inventario.filter((p) => p.status === 200 && !p.canonical);
const noindex = inventario.filter((p) => /noindex/i.test(p.robots || ''));
const canonicalDivergente = inventario.filter((p) => p.canonical && p.canonical.replace(/\/$/, '') !== p.url.replace(/\/$/, ''));
const linkamEudr = inventario.filter((p) => p.links_eudr_audit > 0);
const auditNoTitulo = inventario.filter((p) => /audit/i.test((p.title || '') + (p.h1 || '')));
const semDescricao = inventario.filter((p) => p.status === 200 && !p.meta_description);
const comHreflang = inventario.filter((p) => (p.hreflang || []).length > 0);
const naoOk = inventario.filter((p) => p.status !== 200);
console.log(`\n== RESUMO ==`);
console.log(`status != 200: ${naoOk.length}`, naoOk.map((p) => `${p.url} (${p.status})`).slice(0, 10));
console.log(`sem canônica: ${semCanonical.length}`);
console.log(`canônica divergente da URL: ${canonicalDivergente.length}`, canonicalDivergente.map((p) => p.url).slice(0, 10));
console.log(`noindex: ${noindex.length}`, noindex.map((p) => p.url).slice(0, 10));
console.log(`sem meta description: ${semDescricao.length}`);
console.log(`com hreflang: ${comHreflang.length}`);
console.log(`páginas que linkam /eudr-audit/: ${linkamEudr.length}`, linkamEudr.map((p) => p.url).slice(0, 15));
console.log(`"audit" no título/H1: ${auditNoTitulo.length}`, auditNoTitulo.map((p) => p.url).slice(0, 15));
const tipos = {};
for (const p of inventario) for (const t of p.ldtypes || []) tipos[t] = (tipos[t] || 0) + 1;
console.log(`tipos de JSON-LD:`, JSON.stringify(tipos));
console.log(`média de palavras: ${Math.round(inventario.filter((p) => p.palavras).reduce((a, p) => a + p.palavras, 0) / Math.max(1, inventario.filter((p) => p.palavras).length))}`);
