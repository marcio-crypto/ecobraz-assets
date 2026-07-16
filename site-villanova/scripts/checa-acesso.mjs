// Verificação de acesso ao Ghost Admin da Villanova ESG (somente leitura).
// Usa VILLANOVA_GHOST_ADMIN_URL e VILLANOVA_GHOST_ADMIN_API_KEY.
import crypto from 'node:crypto';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
if (!adminUrl) throw new Error('VILLANOVA_GHOST_ADMIN_URL ausente');
if (!adminKey.includes(':')) throw new Error('VILLANOVA_GHOST_ADMIN_API_KEY ausente ou sem o formato id:secret');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: now, exp: now + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

const get = async (path) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {headers});
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

const site = await get('site/');
console.log('Conectado ao Ghost:', site.site?.title, '|', site.site?.url, '| versão', site.site?.version);
const posts = await get('posts/?limit=1');
const pages = await get('pages/?limit=1');
console.log('Posts publicados/total:', posts.meta?.pagination?.total);
console.log('Páginas total:', pages.meta?.pagination?.total);
const redirects = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {headers});
console.log('Acesso a redirects:', redirects.status === 200 ? 'OK' : `status ${redirects.status}`);
console.log('\nACESSO VERIFICADO ✔');
