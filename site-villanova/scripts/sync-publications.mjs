// Cria/atualiza a página Publications no Ghost da Villanova ESG.
// Uso: node sync-publications.mjs [draft|published]
// Em modo draft, imprime o link secreto de pré-visualização (/p/<uuid>/).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const STATUS = process.argv[2] === 'published' ? 'published' : 'draft';
const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 400)}`);
  return r.json();
};

const [pagina] = JSON.parse(await fs.readFile('site-villanova/content/publications-page.json', 'utf8'));
const existente = (await api('GET', `pages/?filter=slug:${pagina.slug}&limit=1`)).pages?.[0];
const payload = {pages: [{...pagina, status: STATUS, updated_at: existente?.updated_at}]};
const resultado = existente
  ? await api('PUT', `pages/${existente.id}/?source=html`, payload)
  : await api('POST', 'pages/?source=html', payload);
const p = resultado.pages[0];
console.log(`Página '${p.slug}' ${existente ? 'atualizada' : 'criada'} com status: ${p.status}`);
if (p.status === 'draft') {
  console.log(`PREVIEW: https://www.villanovaesg.com/p/${p.uuid}/`);
} else {
  console.log(`NO AR: https://www.villanovaesg.com/${p.slug}/`);
}
