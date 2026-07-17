// Define a meta description das tags do Ghost (ecobraz.org) a partir de
// site-ghost/content/tags-meta.json — [{slug, meta_description}].
// Corrige o aviso "meta description ausente" nas páginas de arquivo de tag.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

const itens = JSON.parse(await fs.readFile('site-ghost/content/tags-meta.json', 'utf8'));
let ok = 0;
for (const {slug, meta_description} of itens) {
  const tag = (await api('GET', `tags/?filter=slug:${slug}&limit=1`)).tags?.[0];
  if (!tag) { console.log(`AVISO: tag/${slug} não existe — pulada`); continue; }
  if ((tag.meta_description || '') === meta_description) { console.log(`ok (sem mudança): tag/${slug}`); ok += 1; continue; }
  await api('PUT', `tags/${tag.id}/`, {tags: [{meta_description, updated_at: tag.updated_at}]});
  console.log(`meta aplicada: tag/${slug} (${meta_description.length} chars)`);
  ok += 1;
  await espera(200);
}
console.log(`Concluído: ${ok}/${itens.length} tags.`);
