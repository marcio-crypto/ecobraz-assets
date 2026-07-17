// Sobe o routes.yaml do repo (sem a rota órfã /autor/sergio-diniz/) para o Ghost.
// Remove a rota que gera o resíduo /autor/sergio-diniz/ (404) no sitemap.
// Se o Ghost 6 bloquear o upload via integração, o script avisa para upload manual.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

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

const novo = await fs.readFile('site-ghost/theme/routes.yaml', 'utf8');
if (/sergio/i.test(novo)) { console.error('ABORTADO: o routes.yaml do repo ainda contém "sergio".'); process.exit(1); }

// Estado atual vivo
const antes = await fetch(`${adminUrl}/ghost/api/admin/settings/routes/yaml/`, {
  headers: {Authorization: `Ghost ${jwt()}`, 'Accept-Version': 'v5.0'}
});
const yamlAntes = await antes.text();
console.log(`Antes: routes vivo contém "sergio": ${/sergio/i.test(yamlAntes) ? 'SIM' : 'NÃO'}`);

// Upload (multipart). Ghost aceita POST em settings/routes/yaml/ com o campo "routes".
const fd = new FormData();
fd.append('routes', new Blob([novo], {type: 'application/x-yaml'}), 'routes.yaml');
const up = await fetch(`${adminUrl}/ghost/api/admin/settings/routes/yaml/`, {
  method: 'POST', headers: {Authorization: `Ghost ${jwt()}`, 'Accept-Version': 'v5.0'}, body: fd
});
const upTxt = await up.text();
console.log(`Upload routes.yaml -> HTTP ${up.status}`);
if (up.status !== 200 && up.status !== 202) {
  console.log(`Corpo: ${upTxt.slice(0, 300)}`);
  console.log('>> Upload via integração bloqueado. Faça o upload manual em: Ghost Admin > Settings > Labs > Routes (arquivo site-ghost/theme/routes.yaml).');
  process.exit(2);
}

// Ghost reinicia o serviço de URLs; espera e reconfere
await new Promise((r) => setTimeout(r, 6000));
const depois = await fetch(`${adminUrl}/ghost/api/admin/settings/routes/yaml/`, {
  headers: {Authorization: `Ghost ${jwt()}`, 'Accept-Version': 'v5.0'}
});
const yamlDepois = await depois.text();
console.log(`Depois: routes vivo contém "sergio": ${/sergio/i.test(yamlDepois) ? 'SIM (ainda!)' : 'NÃO'}`);

const st = await fetch(`${base}/autor/sergio-diniz/`, {redirect: 'manual'});
console.log(`/autor/sergio-diniz/ -> HTTP ${st.status} (esperado 404; a URL deixa de existir como rota)`);
const sm = await (await fetch(`${base}/sitemap-pages.xml`, {cache: 'no-store'})).text();
console.log(`sitemap-pages.xml contém /autor/sergio-diniz/: ${sm.includes('/autor/sergio-diniz/') ? 'SIM (pode ser cache CDN até 1h)' : 'NÃO — resíduo removido'}`);
