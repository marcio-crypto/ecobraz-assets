// Aplica tags hreflang (pt-BR / en / x-default) via codeinjection_head nas
// duas pontas de cada par declarado em content/pares-idioma.json (ecobraz.org).
// x-default = versão PT (site brasileiro). Idempotente via marcadores.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const BASE = 'https://ecobraz.org';
const INI = '<!--ecb-hreflang-->';
const FIM = '<!--/ecb-hreflang-->';

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

const bloco = (pt, en, tipoRota) => {
  const prefixo = tipoRota === 'posts' ? '/blog' : '';
  const urlPt = pt === '' ? `${BASE}/` : `${BASE}${prefixo}/${pt}/`;
  const urlEn = `${BASE}${prefixo}/${en}/`;
  return `${INI}\n<link rel="alternate" hreflang="pt-BR" href="${urlPt}">\n<link rel="alternate" hreflang="en" href="${urlEn}">\n<link rel="alternate" hreflang="x-default" href="${urlPt}">\n${FIM}`;
};

const aplicar = async (tipo, slug, blocoNovo) => {
  const item = (await api('GET', `${tipo}/?filter=slug:${slug}&limit=1`))[tipo]?.[0];
  if (!item) { console.log(`AVISO: ${tipo}/${slug} não existe ainda — pulado`); return false; }
  let inj = item.codeinjection_head || '';
  const re = new RegExp(`${INI}[\\s\\S]*?${FIM}\\n?`, 'g');
  inj = inj.replace(re, '').trim();
  inj = (inj ? inj + '\n' : '') + blocoNovo;
  if ((item.codeinjection_head || '').trim() === inj.trim()) { console.log(`ok (sem mudança): ${tipo}/${slug}`); return true; }
  await api('PUT', `${tipo}/${item.id}/`, {[tipo]: [{codeinjection_head: inj, updated_at: item.updated_at}]});
  console.log(`hreflang aplicado: ${tipo}/${slug}`);
  await espera(200);
  return true;
};

const pares = JSON.parse(await fs.readFile('site-ghost/pares-idioma.json', 'utf8'));
let aplicados = 0;
for (const par of pares.pages) {
  const b = bloco(par.pt, par.en, 'pages');
  if (par.pt !== '') aplicados += (await aplicar('pages', par.pt, b)) ? 1 : 0;
  aplicados += (await aplicar('pages', par.en, b)) ? 1 : 0;
}
for (const par of pares.posts || []) {
  const b = bloco(par.pt, par.en, 'posts');
  aplicados += (await aplicar('posts', par.pt, b)) ? 1 : 0;
  aplicados += (await aplicar('posts', par.en, b)) ? 1 : 0;
}
console.log(`Concluído: ${aplicados} recursos com hreflang.`);
