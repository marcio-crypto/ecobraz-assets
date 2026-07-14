import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Missing Ghost Admin credentials');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization:`Ghost ${token}`,'Accept-Version':'v5.0','Content-Type':'application/json'};

const response = await fetch(`${adminUrl}/ghost/api/admin/settings/`, {
  method:'PUT',
  headers,
  body:JSON.stringify({settings:[{
    key:'description',
    value:'Coleta, logística reversa e descarte responsável de resíduos eletrônicos para empresas, instituições e pessoas físicas.'
  }]})
});
const text = await response.text();
if (!response.ok) throw new Error(`Ghost settings update failed (${response.status}): ${text.slice(0,600)}`);
console.log('Ghost publication description updated.');

// O ID da tag do Google é governado pelo repositório: um valor salvo no painel
// (mesmo vazio) sobrepõe o default do tema, então forçamos o valor aqui.
const themePackage = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '..', 'theme', 'package.json'), 'utf8'));
const gaTagId = themePackage.config.custom.ga_measurement_id.default;
const current = await fetch(`${adminUrl}/ghost/api/admin/custom_theme_settings/`, {headers});
if (!current.ok) throw new Error(`Custom theme settings lookup failed (${current.status}): ${(await current.text()).slice(0,600)}`);
const settings = (await current.json()).custom_theme_settings || [];
const gaSetting = settings.find((setting) => setting.key === 'ga_measurement_id');
if (!gaSetting) {
  console.log('ga_measurement_id not exposed by the active theme yet; skipping.');
} else if (gaSetting.value === gaTagId) {
  console.log(`ga_measurement_id already set to ${gaTagId}.`);
} else {
  const update = await fetch(`${adminUrl}/ghost/api/admin/custom_theme_settings/`, {
    method:'PUT',
    headers,
    body:JSON.stringify({custom_theme_settings:[{key:'ga_measurement_id', value:gaTagId}]})
  });
  if (!update.ok) throw new Error(`Custom theme settings update failed (${update.status}): ${(await update.text()).slice(0,600)}`);
  console.log(`ga_measurement_id updated to ${gaTagId} (was: ${gaSetting.value || '(vazio)'}).`);
}
