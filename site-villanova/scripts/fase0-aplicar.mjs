// Fase 0 — aplica no Ghost da Villanova ESG (via Admin API):
//  1. Renomeia a página /eudr-audit/ -> /eudr-evidence-readiness-review/ com
//     título e metadados controlados (Master Manual P0-06: o serviço é análise
//     de prontidão de evidências, não auditoria).
//  2. Atualiza a navegação do site se houver link para o slug antigo.
// Idempotente: pode rodar mais de uma vez sem efeito colateral.
import crypto from 'node:crypto';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: now, exp: now + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 400)}`);
  return r.json();
};

const SLUG_NOVO = 'eudr-evidence-readiness-review';

// 1. renomear a página do serviço EUDR
const antiga = (await api('GET', `pages/?filter=slug:eudr-audit&limit=1`)).pages?.[0];
if (antiga) {
  await api('PUT', `pages/${antiga.id}/`, {pages: [{
    slug: SLUG_NOVO,
    title: 'EUDR Evidence Readiness Review',
    meta_title: 'EUDR Evidence Readiness Review | Villanova ESG',
    meta_description: 'Advisory review of EUDR-related supplier evidence: origin, geolocation and document readiness. Not an audit, certification or legal advice.',
    updated_at: antiga.updated_at,
  }]});
  console.log(`Página renomeada: /eudr-audit/ -> /${SLUG_NOVO}/ (título e metadados atualizados)`);
} else {
  const nova = (await api('GET', `pages/?filter=slug:${SLUG_NOVO}&limit=1`)).pages?.[0];
  if (!nova) throw new Error('Nem /eudr-audit/ nem o slug novo foram encontrados');
  console.log(`Página já renomeada anteriormente: /${SLUG_NOVO}/ — nada a fazer`);
}

// 2. navegação do site (menu principal e secundário)
const settings = (await api('GET', 'settings/')).settings;
const nav = {};
for (const chave of ['navigation', 'secondary_navigation']) {
  const item = settings.find((s) => s.key === chave);
  if (!item || !item.value) continue;
  const antes = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
  if (antes.includes('/eudr-audit/')) {
    nav[chave] = JSON.parse(antes.replaceAll('/eudr-audit/', `/${SLUG_NOVO}/`));
  }
}
if (Object.keys(nav).length) {
  await api('PUT', 'settings/', {settings: Object.entries(nav).map(([key, value]) => ({key, value: JSON.stringify(value)}))});
  console.log('Navegação atualizada:', Object.keys(nav).join(', '));
} else {
  console.log('Navegação: sem links para o slug antigo — ok');
}

// 3. conferência pública
const pub = await fetch(`https://www.villanovaesg.com/${SLUG_NOVO}/`, {redirect: 'follow'});
console.log(`Página nova ao vivo: /${SLUG_NOVO}/ -> HTTP ${pub.status}`);
console.log('\nFASE 0 (parte automática) CONCLUÍDA ✔ — falta o upload do redirects.yaml (manual, painel Labs)');
