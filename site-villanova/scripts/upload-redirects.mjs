// Envia site-villanova/redirects-villanova.yaml para o Ghost da Villanova ESG.
// Uso: node upload-redirects.mjs [caminho-do-yaml]
// Antes de subir, baixa e imprime o arquivo atual (backup no log do run).
// Depois de subir, baixa de novo para conferir e testa 1 redirect ao vivo.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const arquivo = process.argv[2] || 'site-villanova/redirects-villanova.yaml';
if (!adminUrl || !adminKey.includes(':')) throw new Error('Credenciais do Ghost da Villanova ausentes');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const auth = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

const baixa = async (rotulo) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {headers: auth});
  const texto = await r.text();
  if (!r.ok) throw new Error(`Download (${rotulo}) falhou (${r.status}): ${texto.slice(0, 600)}`);
  console.log(`--- redirects no Ghost (${rotulo}) ---\n${texto}\n--- fim (${rotulo}) ---`);
  return texto;
};

await baixa('ANTES — backup');

const bytes = await fs.readFile(arquivo);
const form = new FormData();
form.append('redirects', new Blob([bytes], {type: 'application/x-yaml'}), 'redirects.yaml');
const up = await fetch(`${adminUrl}/ghost/api/admin/redirects/upload/`, {method: 'POST', headers: auth, body: form});
if (!up.ok) throw new Error(`Upload falhou (${up.status}): ${(await up.text()).slice(0, 600)}`);
console.log('Upload aceito pelo Ghost ✔');

const depois = await baixa('DEPOIS — conferência');
const local = await fs.readFile(arquivo, 'utf8');
const regrasLocais = local.split('\n').filter((l) => l.includes(': ')).length;
const regrasVivas = depois.split('\n').filter((l) => l.includes(': ')).length;
console.log(`Regras no arquivo local: ${regrasLocais} | no Ghost após upload: ${regrasVivas}`);
if (!depois.includes('the-cfo-checklist-for-eu-brazil-supplier-evidence-2')) {
  throw new Error('Conferência falhou: as regras novas não aparecem no arquivo baixado do Ghost.');
}

// Teste ao vivo: um dos duplicados deve responder 301 para o slug base.
const alvo = 'https://www.villanovaesg.com/the-cfo-checklist-for-eu-brazil-supplier-evidence-2/';
const vivo = await fetch(alvo, {redirect: 'manual'});
console.log(`AO VIVO: ${alvo} -> HTTP ${vivo.status} Location: ${vivo.headers.get('location') || '(nenhum)'}`);
if (vivo.status !== 301) throw new Error(`Esperava 301 no duplicado, veio ${vivo.status}.`);
console.log('Redirects aplicados e verificados ao vivo ✔');
