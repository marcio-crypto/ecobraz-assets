// Read-only: baixa o routes.yaml que está VIVO no Ghost e testa as URLs /autor/.
// Objetivo: provar se existe uma rota /autor/sergio-diniz/ órfã no Ghost
// (fora de sincronia com o repo) que gera o resíduo no sitemap.
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

// 1. Baixa o routes.yaml vivo
const r = await fetch(`${adminUrl}/ghost/api/admin/settings/routes/yaml/`, {
  headers: {Authorization: `Ghost ${jwt()}`, 'Accept-Version': 'v5.0'}
});
const yaml = await r.text();
console.log(`GET settings/routes/yaml -> HTTP ${r.status}`);
console.log('===== routes.yaml VIVO no Ghost =====');
console.log(yaml);
console.log('=====================================');
console.log(`Contém "sergio": ${/sergio/i.test(yaml) ? 'SIM' : 'NÃO'}`);

// 2. Testa as URLs de autor
const autores = ['marcelo-aragao', 'marcio-villanova', 'ernesto-machado', 'silvana-leite', 'sergio-diniz'];
console.log('\n--- Status das URLs /autor/ ---');
for (const a of autores) {
  const resp = await fetch(`${base}/autor/${a}/`, {redirect: 'manual'});
  console.log(`  /autor/${a}/ -> HTTP ${resp.status}`);
}

// 3. Quais estão no sitemap-pages.xml
const sm = await (await fetch(`${base}/sitemap-pages.xml`, {cache: 'no-store'})).text();
console.log('\n--- Presença no sitemap-pages.xml ---');
for (const a of autores) console.log(`  /autor/${a}/ no sitemap: ${sm.includes(`/autor/${a}/`) ? 'SIM' : 'não'}`);
