// Sobe o tema villanova-institutional para o Ghost da Villanova ESG.
// Uso: node deploy-theme.mjs <zip> [activate]
//  - sem "activate": apenas envia (o tema fica disponível, sem trocar o ativo)
//  - com "activate": envia e ativa
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const themePath = process.argv[2] || 'villanova-institutional.zip';
const activate = process.argv[3] === 'activate';
if (!adminUrl || !adminKey.includes(':')) throw new Error('Credenciais do Ghost da Villanova ausentes');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const auth = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

const bytes = await fs.readFile(themePath);
const form = new FormData();
form.append('file', new Blob([bytes], {type: 'application/zip'}), 'villanova-institutional.zip');

const up = await fetch(`${adminUrl}/ghost/api/admin/themes/upload/`, {method: 'POST', headers: auth, body: form});
const upText = await up.text();
if (!up.ok) throw new Error(`Upload do tema falhou (${up.status}): ${upText.slice(0, 600)}`);
const nome = JSON.parse(upText).themes?.[0]?.name;
if (!nome) throw new Error(`Upload não retornou o nome do tema: ${upText.slice(0, 400)}`);
console.log(`Tema enviado: ${nome}`);

if (activate) {
  const act = await fetch(`${adminUrl}/ghost/api/admin/themes/${encodeURIComponent(nome)}/activate/`, {method: 'PUT', headers: auth});
  const actText = await act.text();
  if (!act.ok) throw new Error(`Ativação falhou (${act.status}): ${actText.slice(0, 600)}`);
  console.log(`TEMA ATIVADO: ${nome} ✔`);
  const home = await fetch('https://www.villanovaesg.com/', {redirect: 'follow'});
  const html = await home.text();
  console.log(`Home ao vivo: HTTP ${home.status} | marca no HTML: ${html.includes('VILLANOVA') ? 'sim' : 'NÃO'} | css do tema: ${html.includes('villanova-institutional') || html.includes('main.css') ? 'sim' : 'NÃO'}`);
} else {
  console.log('Tema apenas enviado (não ativado). Ative com o parâmetro "activate".');
}
