// Fase 1 — diagnóstico de indexação do villanovaesg.com:
//  1. Diferença entre conteúdo publicado (Admin API) e o sitemap ao vivo,
//     com o motivo provável de cada ausência (canonical_url apontando para
//     outra URL, post só de e-mail etc.)
//  2. Conteúdo do robots.txt ao vivo
//  3. Cabeçalhos do redirecionamento do domínio raiz (para achar o 302)
import crypto from 'node:crypto';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: now, exp: now + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

const listar = async (tipo) => {
  const itens = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${adminUrl}/ghost/api/admin/${tipo}/?limit=100&page=${page}&filter=status:published&fields=slug,title,canonical_url,visibility,email_only,updated_at`, {headers});
    if (!r.ok) throw new Error(`${tipo}: ${r.status}`);
    const j = await r.json();
    itens.push(...j[tipo]);
    if (!j.meta.pagination.next) break;
    page += 1;
  }
  return itens;
};

const SITE = 'https://www.villanovaesg.com';
const xml = async (u) => (await fetch(u)).text();
const locs = (s) => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const filhos = locs(await xml(`${SITE}/sitemap.xml`)).filter((u) => u.endsWith('.xml'));
const noSitemap = new Set();
for (const f of filhos) for (const u of locs(await xml(f))) noSitemap.add(u.replace(/\/$/, ''));

console.log(`Sitemap ao vivo: ${noSitemap.size} URLs`);

for (const tipo of ['pages', 'posts']) {
  const itens = await listar(tipo);
  const fora = itens.filter((i) => !noSitemap.has(`${SITE}/${i.slug}`));
  console.log(`\n===== ${tipo.toUpperCase()}: ${itens.length} publicados, ${fora.length} FORA do sitemap =====`);
  for (const i of fora) {
    const motivos = [];
    if (i.canonical_url) motivos.push(`canonical_url=${i.canonical_url}`);
    if (i.email_only) motivos.push('somente e-mail');
    if (i.visibility && i.visibility !== 'public') motivos.push(`visibility=${i.visibility}`);
    console.log(`- /${i.slug}/ [${motivos.join('; ') || 'motivo não óbvio'}] ${i.title}`);
  }
}

console.log('\n===== ROBOTS.TXT AO VIVO =====');
console.log(await (await fetch(`${SITE}/robots.txt`)).text());

console.log('===== REDIRECIONAMENTOS DO DOMÍNIO RAIZ =====');
for (const u of ['http://villanovaesg.com/', 'https://villanovaesg.com/', 'http://www.villanovaesg.com/']) {
  const r = await fetch(u, {redirect: 'manual'});
  console.log(`${u} -> ${r.status} | location: ${r.headers.get('location')} | server: ${r.headers.get('server')} | via: ${r.headers.get('via') || '-'}`);
}
