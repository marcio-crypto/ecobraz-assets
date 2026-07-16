// Inventário do ecobrazinforma.org para a migração de domínio — via Wayback
// Machine (web.archive.org), já que o site vivo bloqueia qualquer robô (403
// para GitHub runners, Ahrefs e afins).
// 1) CDX API lista todas as URLs já arquivadas do domínio;
// 2) para as seções de conteúdo, baixa o snapshot mais recente e extrai
//    título/H1/descrição/autor/data/nº de palavras.
// Sai em migracao-informa/inventario.json.
import fs from 'node:fs/promises';

const HOST = 'ecobrazinforma.org';
const CONTENT_SECTIONS = ['noticia', 'coluna', 'colunista', 'autor', 'conteudo', 'downloads', 'ver-noticia'];
const CONCURRENCY = 4;
const UA = 'EcobrazMigracao/1.0 (inventario para consolidacao de dominios; contato ti@ecobraz.org)';

const fetchText = async (url, tries = 3) => {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url, {headers: {'User-Agent': UA}, redirect: 'follow'});
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) return null;
      return await response.text();
    } catch (error) {
      if (attempt === tries) { console.log(`falha definitiva: ${url} (${error.message})`); return null; }
      await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
    }
  }
  return null;
};

// 1. Lista completa de URLs arquivadas (só respostas 200, uma por URL única)
const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${HOST}%2F*&output=json&collapse=urlkey&fl=original,timestamp,statuscode&filter=statuscode:200&limit=50000`;
const cdxRaw = await fetchText(cdxUrl);
if (!cdxRaw) { console.log('CDX indisponível.'); process.exit(1); }
const rows = JSON.parse(cdxRaw).slice(1); // primeira linha é o cabeçalho
console.log(`CDX: ${rows.length} URLs arquivadas com status 200.`);

// Normaliza: caminho sem query, sem assets, dedupe mantendo o snapshot mais novo
const byPath = new Map();
for (const [original, timestamp] of rows) {
  let url;
  try { url = new URL(original); } catch { continue; }
  if (!url.hostname.endsWith(HOST)) continue;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|pdf|xml|txt|mp4|zip)$/i.test(path)) continue;
  const existing = byPath.get(path);
  if (!existing || timestamp > existing.timestamp) byPath.set(path, {original, timestamp});
}
console.log(`Caminhos únicos de página: ${byPath.size}`);

const meta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
  const alt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i');
  return (html.match(re) || html.match(alt))?.[1] || '';
};
const tag = (html, re) => (html.match(re)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// 2. Metadados das páginas de conteúdo (snapshot bruto, sem o banner do archive)
const contentPaths = [...byPath.entries()].filter(([path]) => {
  const section = path.split('/')[1] || '';
  return CONTENT_SECTIONS.includes(section) || path === '/' || ['/colunas', '/noticias', '/contato'].includes(path);
});
console.log(`Páginas de conteúdo para extrair metadados: ${contentPaths.length}`);

const pages = [];
const failures = [];
let done = 0;
for (let i = 0; i < contentPaths.length; i += CONCURRENCY) {
  const batch = contentPaths.slice(i, i + CONCURRENCY);
  const results = await Promise.all(batch.map(async ([path, {original, timestamp}]) => {
    const html = await fetchText(`https://web.archive.org/web/${timestamp}id_/${original}`);
    if (!html) { failures.push(path); return null; }
    return {
      path,
      section: path.split('/')[1] || 'raiz',
      snapshot: timestamp,
      title: (meta(html, 'og:title') || tag(html, /<title[^>]*>([\s\S]*?)<\/title>/i)).slice(0, 220),
      h1: tag(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i).slice(0, 220),
      description: (meta(html, 'description') || meta(html, 'og:description')).slice(0, 300),
      author: tag(html, /(?:colunista|autor)\/[^"']+["'][^>]*>([\s\S]{2,80}?)<\//i),
      published: meta(html, 'article:published_time'),
      words: (html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').match(/\S+/g) || []).length,
    };
  }));
  pages.push(...results.filter(Boolean));
  done += batch.length;
  if (done % 100 < CONCURRENCY) console.log(`  ${done}/${contentPaths.length} processadas…`);
  await new Promise((resolve) => setTimeout(resolve, 700));
}

await fs.mkdir('migracao-informa', {recursive: true});
await fs.writeFile('migracao-informa/inventario.json', JSON.stringify({
  source: 'wayback-machine',
  host: HOST,
  all_paths: [...byPath.keys()].sort(),
  pages,
  failures,
}, null, 1));
console.log(`\nRESULTADO: ${byPath.size} caminhos, ${pages.length} páginas com metadados, ${failures.length} falhas.`);
if (pages.length === 0) process.exit(1);
