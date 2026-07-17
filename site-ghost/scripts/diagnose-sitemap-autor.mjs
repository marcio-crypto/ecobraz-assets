// Diagnóstico: por que /autor/sergio-diniz/ ainda aparece no sitemap (404)?
// Compara o sitemap público (o que crawlers veem) com o estado real do Ghost.
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
  return {status: r.status, json: txt ? (() => { try { return JSON.parse(txt); } catch { return null; } })() : null, txt};
};
const getXml = async (path) => {
  const r = await fetch(`${base}${path}`, {redirect: 'manual'});
  const txt = await r.text().catch(() => '');
  return {status: r.status, cf: r.headers.get('cf-cache-status'), age: r.headers.get('age'), cc: r.headers.get('cache-control'), txt};
};

// 1. Índice de sitemaps
const idx = await getXml('/sitemap.xml');
console.log(`sitemap.xml -> HTTP ${idx.status} | cf-cache=${idx.cf} | age=${idx.age} | ${idx.cc}`);
const subs = [...idx.txt.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log('sub-sitemaps:', subs.map((s) => s.replace(base, '')).join(', ') || '(nenhum)');

// 2. Procura sergio-diniz em cada sub-sitemap
for (const s of subs) {
  const path = s.replace(base, '');
  const x = await getXml(path);
  const temSergio = /sergio-diniz/i.test(x.txt);
  const nLocs = (x.txt.match(/<loc>/g) || []).length;
  console.log(`  ${path} -> HTTP ${x.status} | cf-cache=${x.cf} | age=${x.age} | locs=${nLocs} | contém sergio-diniz=${temSergio ? 'SIM' : 'não'}`);
  if (temSergio) {
    for (const m of x.txt.matchAll(/<loc>([^<]*sergio[^<]*)<\/loc>/gi)) console.log(`     -> ${m[1]}`);
  }
}

// 3. Estado real no Ghost: todos os autores/usuários e contagem de posts
const users = await api('GET', 'users/?limit=all&include=count.posts');
console.log('\n--- Autores no Ghost ---');
for (const u of (users.json?.users || [])) {
  const roles = (u.roles || []).map((r) => r.name).join(',');
  console.log(`  ${u.slug} | ${u.name} | posts=${u.count?.posts ?? '?'} | status=${u.status} | roles=${roles}`);
}

// 4. Confirma diretamente a URL do autor
const autor = await getXml('/autor/sergio-diniz/');
console.log(`\n/autor/sergio-diniz/ -> HTTP ${autor.status} | cf-cache=${autor.cf}`);
