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
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
// Token novo a cada chamada: o JWT do Ghost vale 5 min e este script roda ~500
// requisições — um token único morria no meio de execuções longas (401).
const makeHeaders = () => {
  const agora = Math.floor(Date.now() / 1000);
  const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
  return {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};
};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers: makeHeaders(), body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

const bloco = (urlPt, urlEn) =>
  `${INI}\n<link rel="alternate" hreflang="pt-BR" href="${urlPt}">\n<link rel="alternate" hreflang="en" href="${urlEn}">\n<link rel="alternate" hreflang="x-default" href="${urlPt}">\n${FIM}`;

// Busca o item vivo; usa a URL REAL do Ghost (item.url) para o hreflang, em vez
// de reconstruir o caminho. Assim o hreflang aponta para a URL final (ex.: os
// posts do museu vivem em /museu/, não /blog/) e nunca cai num redirect 301.
const getItem = async (tipo, slug) =>
  (await api('GET', `${tipo}/?filter=slug:${slug}&limit=1`))[tipo]?.[0];

const injeta = async (item, tipo, blocoNovo) => {
  if (!item) { console.log(`AVISO: ${tipo} inexistente — pulado`); return false; }
  let inj = item.codeinjection_head || '';
  const re = new RegExp(`${INI}[\\s\\S]*?${FIM}\\n?`, 'g');
  inj = inj.replace(re, '').trim();
  inj = (inj ? inj + '\n' : '') + blocoNovo;
  if ((item.codeinjection_head || '').trim() === inj.trim()) { console.log(`ok (sem mudança): ${tipo}/${item.slug}`); return true; }
  await api('PUT', `${tipo}/${item.id}/`, {[tipo]: [{codeinjection_head: inj, updated_at: item.updated_at}]});
  console.log(`hreflang aplicado: ${tipo}/${item.slug} -> pt/en pela URL real`);
  await espera(200);
  return true;
};

const pares = JSON.parse(await fs.readFile('site-ghost/pares-idioma.json', 'utf8'));
let aplicados = 0;
for (const par of pares.pages) {
  const ptTipo = par.pt_tipo || 'pages';
  const ptItem = par.pt === '' ? null : await getItem(ptTipo, par.pt);
  const enItem = await getItem('pages', par.en);
  const urlPt = par.pt === '' ? `${BASE}/` : (ptItem?.url || `${BASE}/${par.pt}/`);
  const urlEn = enItem?.url || `${BASE}/${par.en}/`;
  const b = bloco(urlPt, urlEn);
  if (ptItem) aplicados += (await injeta(ptItem, ptTipo, b)) ? 1 : 0;
  aplicados += (await injeta(enItem, 'pages', b)) ? 1 : 0;
}
for (const par of pares.posts || []) {
  const ptItem = await getItem('posts', par.pt);
  const enItem = await getItem('posts', par.en);
  const urlPt = ptItem?.url || `${BASE}/blog/${par.pt}/`;
  const urlEn = enItem?.url || `${BASE}/blog/${par.en}/`;
  const b = bloco(urlPt, urlEn);
  aplicados += (await injeta(ptItem, 'posts', b)) ? 1 : 0;
  aplicados += (await injeta(enItem, 'posts', b)) ? 1 : 0;
}
console.log(`Concluído: ${aplicados} recursos com hreflang.`);
