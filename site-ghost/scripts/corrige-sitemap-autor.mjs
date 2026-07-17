// Corrige o resíduo /autor/sergio-diniz/ no sitemap-pages.xml.
// 1) localiza qualquer página/post com "sergio" no slug/url (qualquer status);
// 2) remove o recurso órfão do Sérgio (delete) — a bio dele não deve existir;
// 3) força o Ghost a reconstruir o sitemap tocando numa página publicada;
// 4) reconfere o sitemap público. Idempotente.
import crypto from 'node:crypto';

const base = (process.env.BASE_URL || 'https://ecobraz.org').replace(/\/$/, '');
const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const jwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const u = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: now, exp: now + 300, aud: '/admin/'})}`;
  return `${u}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(u).digest('base64url')}`;
};
const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {
    method, headers: {Authorization: `Ghost ${jwt()}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch {}
  return {status: r.status, json, txt};
};
const sitemapTemSergio = async () => {
  const r = await fetch(`${base}/sitemap-pages.xml`, {cache: 'no-store'});
  const t = await r.text().catch(() => '');
  const hit = /sergio/i.test(t);
  return {hit, cf: r.headers.get('cf-cache-status')};
};

const alvo = /sergio/i;
const suspeitos = [];
for (const tipo of ['pages', 'posts']) {
  let page = 1;
  for (;;) {
    const r = await api('GET', `${tipo}/?formats=&limit=100&page=${page}&fields=id,slug,title,status,url,visibility,updated_at`);
    const arr = r.json?.[tipo] || [];
    for (const it of arr) {
      if (alvo.test(it.slug || '') || alvo.test(it.title || '') || alvo.test(it.url || '')) {
        suspeitos.push({tipo, ...it});
      }
    }
    const pg = r.json?.meta?.pagination;
    if (!pg || page >= pg.pages) break;
    page++;
  }
}
console.log(`Recursos com "sergio" encontrados: ${suspeitos.length}`);
for (const s of suspeitos) console.log(`  [${s.tipo}] id=${s.id} slug=${s.slug} status=${s.status} url=${s.url}`);

// Remove APENAS a página de bio do Sérgio (slug exato), nunca um artigo que
// só o mencione no conteúdo. É a bio dele que precisa sair do site/sitemap.
const ehBio = (s) => s.tipo === 'pages' && /^(autor-)?sergio-diniz$/i.test(s.slug || '');
let removidos = 0;
for (const s of suspeitos) {
  if (!ehBio(s)) { console.log(`  mantido (não é bio, apenas menciona Sérgio): [${s.tipo}] ${s.slug}`); continue; }
  const del = await api('DELETE', `${s.tipo}/${s.id}/`);
  if (del.status === 200 || del.status === 204) { removidos++; console.log(`  removido (bio): [${s.tipo}] ${s.slug}`); }
  else console.log(`  NÃO removido [${s.tipo}] ${s.slug}: ${del.status} ${del.txt.slice(0, 160)}`);
}
console.log(`Bios removidas: ${removidos}`);

// Força a reconstrução do sitemap: toca (PUT no-op) na página publicada mais recente.
const pubs = await api('GET', 'pages/?filter=status:published&limit=1&order=updated_at desc&fields=id,slug,title,updated_at');
const alvoTouch = pubs.json?.pages?.[0];
if (alvoTouch) {
  const put = await api('PUT', `pages/${alvoTouch.id}/`, {pages: [{title: alvoTouch.title, updated_at: alvoTouch.updated_at}]});
  console.log(`Toque para reconstruir sitemap em "${alvoTouch.slug}": HTTP ${put.status}`);
} else {
  console.log('Nenhuma página publicada para tocar (sitemap será reconstruído no próximo evento de conteúdo).');
}

// Reconfere
await new Promise((r) => setTimeout(r, 4000));
const antes = suspeitos.length > 0;
const dep = await sitemapTemSergio();
console.log(`\nsitemap-pages.xml ainda contém "sergio": ${dep.hit ? 'SIM' : 'NÃO'} (cf-cache=${dep.cf})`);
if (dep.hit) console.log('Obs.: se o recurso já foi removido, pode ser cache de CDN — expira em até 1h (max-age=3600).');
