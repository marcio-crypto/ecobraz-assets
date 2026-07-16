// Fase 1 — corrige as canonical_url do Ghost da Villanova ESG:
//  - Remove canonical_url autorreferente (o Ghost já emite a canônica correta
//    sozinho; o campo preenchido exclui o conteúdo do sitemap)
//  - Remove a canônica da página EUDR que apontava para o slug antigo
//  - Normaliza (www + barra final) as canônicas legítimas de duplicatas "-2"
// Idempotente. Ao final, refaz a contagem do sitemap ao vivo.
import crypto from 'node:crypto';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

const SITE = 'https://www.villanovaesg.com';
const normaliza = (u) => {
  try {
    const url = new URL(u);
    let path = url.pathname.replace(/\/+$/, '');
    return `${path}/`.replace(/^\/*/, '/');
  } catch { return null; }
};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

let limpas = 0, normalizadas = 0, mantidas = 0;
for (const tipo of ['pages', 'posts']) {
  let page = 1;
  const itens = [];
  while (true) {
    const j = await api('GET', `${tipo}/?limit=100&page=${page}&filter=status:published&fields=id,slug,canonical_url,updated_at`);
    itens.push(...j[tipo]);
    if (!j.meta.pagination.next) break;
    page += 1;
  }
  for (const item of itens) {
    if (!item.canonical_url) continue;
    const proprio = `/${item.slug}/`;
    const alvo = normaliza(item.canonical_url);
    let payload = null;
    if (alvo === proprio || item.slug === 'eudr-evidence-readiness-review') {
      payload = {canonical_url: null};
      limpas += 1;
      console.log(`limpa\t/${item.slug}/`);
    } else {
      const certo = `${SITE}${alvo}`;
      if (item.canonical_url !== certo) {
        payload = {canonical_url: certo};
        normalizadas += 1;
        console.log(`normaliza\t/${item.slug}/ -> ${certo}`);
      } else {
        mantidas += 1;
        console.log(`mantém\t/${item.slug}/ -> ${item.canonical_url}`);
      }
    }
    if (payload) {
      await api('PUT', `${tipo}/${item.id}/`, {[tipo]: [{...payload, updated_at: item.updated_at}]});
    }
  }
}
console.log(`\nCanônicas autorreferentes removidas: ${limpas}`);
console.log(`Canônicas de duplicatas normalizadas: ${normalizadas}`);
console.log(`Canônicas legítimas mantidas: ${mantidas}`);

// contagem do sitemap depois da correção
await new Promise((r) => setTimeout(r, 5000));
const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
const filhos = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.endsWith('.xml'));
let total = 0;
for (const f of filhos) {
  const s = await (await fetch(f)).text();
  total += [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].filter((m) => !/\.(png|jpe?g|webp|gif|svg)$/i.test(m[1])).length;
}
console.log(`\nSITEMAP APÓS A CORREÇÃO: ${total} URLs (antes: 207)`);
