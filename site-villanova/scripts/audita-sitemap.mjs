// Auditoria de "limpeza" do sitemap do villanovaesg.com para indexacao global.
// Roda no GitHub Actions (o sandbox nao passa pela Cloudflare). Verifica:
//  - cada URL do sitemap responde 200 (nao 301/404) -> sitemap sem lixo;
//  - nenhum slug morto conhecido (rascunhos/duplicatas) vazou pro sitemap;
//  - presenca de <link rel=canonical> autorreferente e hreflang em amostra;
//  - meta robots sem "noindex" nas paginas do sitemap;
//  - quebra por categoria (posts/paginas/tag/autor) so pra visibilidade.
// Sai com codigo 1 se achar sujeira (URL nao-200, noindex ou slug morto).
const SITE = 'https://www.villanovaesg.com';
const UA = 'Villanova sitemap audit';

// Slugs que NAO podem aparecer no sitemap (rascunhos/duplicatas ja despublicados).
const SLUGS_MORTOS = [
  'how-european-buyers-should-classify-brazilian-supplier-risk-2',
  'como-compradores-europeus-devem-classificar-risco-de-fornecedores-brasileiros',
];

const xml = async (u) => (await fetch(u, {headers: {'User-Agent': UA}})).text();
const locs = (s) => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// 1. coleta todas as URLs (paginas, nao imagens) dos sitemaps-filhos
const filhos = locs(await xml(`${SITE}/sitemap.xml`)).filter((u) => u.endsWith('.xml'));
const urls = [];
for (const f of filhos) {
  urls.push(...locs(await xml(f)).filter((u) => u.startsWith(SITE) && !/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(u)));
}
const unicas = [...new Set(urls)];
console.log(`Sitemaps-filhos: ${filhos.length} | URLs de pagina: ${urls.length} (unicas: ${unicas.length})`);

// 2. quebra por categoria
const cat = (u) => {
  const p = u.replace(SITE, '').replace(/^\/|\/$/g, '');
  if (p === '') return 'home';
  if (p.startsWith('tag/')) return 'tag';
  if (p.startsWith('author/')) return 'autor';
  if (p.startsWith('page/')) return 'paginacao';
  return 'post/pagina';
};
const contagem = {};
for (const u of unicas) contagem[cat(u)] = (contagem[cat(u)] || 0) + 1;
console.log('Por categoria:', JSON.stringify(contagem));

// 3. duplicatas (mesma URL sem barra final etc.) — o Set ja pega identicas;
//    aqui olhamos so slugs mortos conhecidos.
const mortosNoSitemap = unicas.filter((u) => SLUGS_MORTOS.some((s) => u.includes('/' + s)));

// 4. verifica cada URL: status ao vivo + noindex + canonical + hreflang (amostra)
const attr = (tag, name) => (tag && tag.match(new RegExp(`${name}=["']([^"']*)["']`, 'i')) || [])[1] || '';
const naoDuzentos = [];
const comNoindex = [];
const semCanonical = [];
const semHreflang = [];
let checadas = 0;
// concorrencia limitada pra nao estourar
const fila = [...unicas];
async function worker() {
  while (fila.length) {
    const u = fila.shift();
    try {
      const r = await fetch(u, {redirect: 'manual', headers: {'User-Agent': UA}});
      checadas += 1;
      if (r.status !== 200) { naoDuzentos.push(`${u} -> ${r.status}`); continue; }
      const html = await r.text();
      const robots = (html.match(/<meta[^>]+name=["']robots["'][^>]*>/i) || [])[0];
      if (robots && /noindex/i.test(attr(robots, 'content'))) comNoindex.push(u);
      const canon = (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i) || [])[0];
      if (!canon) semCanonical.push(u);
      if (!/hreflang=/.test(html)) semHreflang.push(u);
    } catch (e) {
      naoDuzentos.push(`${u} -> ERRO ${String(e.message).slice(0, 60)}`);
    }
  }
}
await Promise.all(Array.from({length: 8}, worker));

// 5. relatorio
console.log(`\nChecadas ao vivo: ${checadas}/${unicas.length}`);
console.log(`URLs nao-200 (redirect/404): ${naoDuzentos.length}`);
naoDuzentos.slice(0, 30).forEach((x) => console.log('  ✗', x));
console.log(`URLs com noindex: ${comNoindex.length}`);
comNoindex.slice(0, 30).forEach((x) => console.log('  noindex:', x));
console.log(`Slugs mortos (rascunho/duplicata) no sitemap: ${mortosNoSitemap.length}`);
mortosNoSitemap.forEach((x) => console.log('  MORTO:', x));
console.log(`Sem canonical: ${semCanonical.length} | Sem hreflang: ${semHreflang.length}`);
semCanonical.slice(0, 10).forEach((x) => console.log('  sem-canonical:', x));
semHreflang.slice(0, 10).forEach((x) => console.log('  sem-hreflang:', x));

const sujo = naoDuzentos.length + comNoindex.length + mortosNoSitemap.length;
if (sujo > 0) {
  console.error(`\nRESULTADO: sitemap com ${sujo} item(ns) a limpar.`);
  process.exit(1);
}
console.log('\nRESULTADO: sitemap limpo — todas as URLs respondem 200, sem noindex, sem slugs mortos.');
