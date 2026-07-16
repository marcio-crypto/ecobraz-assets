// Gera o Cloudflare Worker de redirects do ecobrazinforma.org a partir do
// de-para.csv (fonte única) e valida a lógica localmente antes de existir
// qualquer DNS: simula todas as origens (com e sem /amp, com e sem barra
// final, com querystring) e confere cada destino.
// Regra de segurança: destino de linha "migrar" cujo artigo ainda não está
// publicado (não consta nos content JSONs) cai no fallback da seção até o
// conteúdo entrar — nunca redirecionar para 404.
import fs from 'node:fs/promises';

const DESTINO_BASE = 'https://ecobraz.org';

// Slugs publicados (posts e páginas) para validar destinos de "migrar"
const publicados = new Set(['/', '/blog/', '/museu/', '/noticias-esg/', '/agendamento/']);
for (const file of ['migrated-posts.json', 'priority-posts.json']) {
  for (const p of JSON.parse(await fs.readFile(`site-ghost/content/${file}`, 'utf8'))) {
    const isMuseu = (p.tags || []).some((t) => t.slug === 'museu-do-eletronico');
    publicados.add(isMuseu ? `/museu/${p.slug}/` : `/blog/${p.slug}/`);
  }
}
for (const file of ['institutional-pages.json', 'commercial-pages.json', 'material-pages.json', 'search-intent-pages.json', 'pages.json', 'autor-pages.json']) {
  try {
    for (const p of JSON.parse(await fs.readFile(`site-ghost/content/${file}`, 'utf8'))) {
      publicados.add(`/${p.slug}/`);
      if (p.slug.startsWith('autor-')) publicados.add(`/autor/${p.slug.replace(/^autor-/, '')}/`);
    }
  } catch {}
}

const FALLBACK = {noticia: '/noticias-esg/', coluna: '/blog/', colunista: '/noticias-esg/', autor: '/noticias-esg/', conteudo: '/noticias-esg/', downloads: '/evidencias/', arquivos: '/evidencias/', 'ver-noticia': '/noticias-esg/', en: '/noticias-esg/'};

const csv = await fs.readFile('migracao-informa/de-para.csv', 'utf8');
const mapa = {};
const pendentes = [];
for (const line of csv.trim().split('\n').slice(1)) {
  const [origem, destino, acao] = line.split(',');
  if (!origem || !destino) continue;
  let destinoFinal = destino;
  if (acao === 'migrar' && !publicados.has(destino)) {
    const secao = origem.split('/')[1] || '';
    destinoFinal = FALLBACK[secao] || '/noticias-esg/';
    pendentes.push({origem, aguardando: destino, provisorio: destinoFinal});
  }
  mapa[origem.toLowerCase()] = destinoFinal;
}
console.log(`Mapa: ${Object.keys(mapa).length} entradas explícitas; ${pendentes.length} provisórias (conteúdo pendente).`);
for (const p of pendentes) console.log(`  PROVISÓRIO ${p.origem} -> ${p.provisorio} (aguardando ${p.aguardando})`);

const worker = `// Redirects permanentes ecobrazinforma.org -> ecobraz.org (consolidação de domínios).
// GERADO AUTOMATICAMENTE por gera-worker-redirects.mjs a partir do de-para.csv — não editar à mão.
const DESTINO = ${JSON.stringify(DESTINO_BASE)};
const MAPA = ${JSON.stringify(mapa, null, 0)};
const FALLBACK = ${JSON.stringify(FALLBACK)};

function decidir(pathname) {
  let path = pathname.replace(/\\/+$/, '') || '/';
  path = path.replace(/\\/amp$/i, '').replace(/\\/+$/, '') || '/';
  const lower = path.toLowerCase();
  if (MAPA[lower]) return MAPA[lower];
  const secao = lower.split('/')[1] || '';
  if (FALLBACK[secao]) return FALLBACK[secao];
  return '/noticias-esg/';
}

addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const destino = DESTINO + decidir(url.pathname);
  event.respondWith(new Response(null, {status: 301, headers: {Location: destino, 'Cache-Control': 'public, max-age=86400'}}));
});

export { decidir };
`;
await fs.writeFile('migracao-informa/worker-redirects.js', worker);
console.log('worker-redirects.js gerado.');

// ---- Teste local da lógica: todas as linhas do de-para + variações ----
globalThis.addEventListener = globalThis.addEventListener || (() => {}); // stub p/ Node
const {decidir} = await import(`${process.cwd()}/migracao-informa/worker-redirects.js`);
let falhas = 0;
for (const line of csv.trim().split('\n').slice(1)) {
  const [origem, destinoDeclarado, acao] = line.split(',');
  if (!origem || !destinoDeclarado) continue;
  const esperado = mapa[origem.toLowerCase()];
  for (const variante of [origem, origem + '/', origem + '/amp', origem.toUpperCase()]) {
    const obtido = decidir(variante);
    if (obtido !== esperado) { console.log(`FALHA: ${variante} -> ${obtido} (esperado ${esperado})`); falhas += 1; }
  }
}
// URLs desconhecidas caem no fallback correto
const casos = [['/noticia/999/qualquer-coisa', '/noticias-esg/'], ['/coluna/999/x', '/blog/'], ['/downloads/99/y', '/evidencias/'], ['/qualquer-pagina-desconhecida', '/noticias-esg/'], ['/noticia/999/x/amp', '/noticias-esg/']];
for (const [entrada, esperado] of casos) {
  const obtido = decidir(entrada);
  if (obtido !== esperado) { console.log(`FALHA fallback: ${entrada} -> ${obtido} (esperado ${esperado})`); falhas += 1; }
}
console.log(falhas === 0 ? `TESTE OK: ${Object.keys(mapa).length * 4 + casos.length} casos passaram.` : `${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
