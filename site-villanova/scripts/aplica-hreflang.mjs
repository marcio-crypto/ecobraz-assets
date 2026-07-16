// Aplica tags hreflang (en / pt-BR / x-default) via codeinjection_head nas
// duas pontas de cada par declarado em content/pares-idioma.json.
// Bloco delimitado por marcadores para ser idempotente e preservar outras injeções.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const BASE = 'https://www.villanovaesg.com';
const INI = '<!--vn-hreflang-->';
const FIM = '<!--/vn-hreflang-->';

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
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

const bloco = (en, pt) => {
  const urlEn = en === '' ? `${BASE}/` : `${BASE}/${en}/`;
  const urlPt = `${BASE}/${pt}/`;
  return `${INI}\n<link rel="alternate" hreflang="en" href="${urlEn}">\n<link rel="alternate" hreflang="pt-BR" href="${urlPt}">\n<link rel="alternate" hreflang="x-default" href="${urlEn}">\n${FIM}`;
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

const pares = JSON.parse(await fs.readFile('site-villanova/content/pares-idioma.json', 'utf8'));
let aplicados = 0;
for (const par of pares.pages) {
  const b = bloco(par.en, par.pt);
  if (par.en !== '') aplicados += (await aplicar('pages', par.en, b)) ? 1 : 0;
  aplicados += (await aplicar('pages', par.pt, b)) ? 1 : 0;
}
for (const par of pares.posts || []) {
  const b = bloco(par.en, par.pt);
  aplicados += (await aplicar('posts', par.en, b)) ? 1 : 0;
  aplicados += (await aplicar('posts', par.pt, b)) ? 1 : 0;
}
console.log(`Concluído: ${aplicados} recursos com hreflang.`);
