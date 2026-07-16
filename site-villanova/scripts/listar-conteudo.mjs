// Lista todos os slugs de posts e páginas do Ghost da Villanova (somente leitura).
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
    const r = await fetch(`${adminUrl}/ghost/api/admin/${tipo}/?limit=100&page=${page}&fields=slug,title,status,updated_at`, {headers});
    if (!r.ok) throw new Error(`${tipo} p${page}: ${r.status}`);
    const j = await r.json();
    itens.push(...j[tipo]);
    if (!j.meta.pagination.next) break;
    page += 1;
  }
  return itens;
};

for (const tipo of ['pages', 'posts']) {
  const itens = await listar(tipo);
  console.log(`\n===== ${tipo.toUpperCase()} (${itens.length}) =====`);
  for (const i of itens) console.log(`${i.status}\t/${i.slug}/\t${i.title}`);
}
