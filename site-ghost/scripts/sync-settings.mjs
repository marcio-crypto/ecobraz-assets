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

// O Ghost(Pro) nega alguns endpoints administrativos a tokens de integração
// (403 NoPermissionError). Nesses casos degradamos com aviso em vez de falhar,
// e registramos o passo manual no resumo do workflow.
const manualSteps = [];
async function tolerantPut(url, body, okMessage, manualStep) {
  const response = await fetch(url, {method:'PUT', headers, body:JSON.stringify(body)});
  if (response.ok) { console.log(okMessage); return true; }
  const text = await response.text();
  if (response.status === 403 && text.includes('API tokens do not have permission')) {
    console.warn(`AVISO: sem permissão para ${new URL(url).pathname} — requer ação manual do proprietário.`);
    manualSteps.push(manualStep);
    return false;
  }
  throw new Error(`Ghost update failed (${response.status}) at ${url}: ${text.slice(0,600)}`);
}

await tolerantPut(
  `${adminUrl}/ghost/api/admin/settings/`,
  {settings:[{key:'description', value:'Coleta, logística reversa e descarte responsável de resíduos eletrônicos para empresas, instituições e pessoas físicas.'}]},
  'Ghost publication description updated.',
  'Configurações → Título e descrição: conferir a descrição da publicação.'
);

// O ID da tag do Google é governado pelo repositório: um valor salvo no painel
// (mesmo vazio) sobrepõe o default do tema, então forçamos o valor aqui.
const themePackage = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '..', 'theme', 'package.json'), 'utf8'));
const gaTagId = themePackage.config.custom.ga_measurement_id.default;
const current = await fetch(`${adminUrl}/ghost/api/admin/custom_theme_settings/`, {headers});
if (!current.ok) {
  console.warn(`AVISO: sem acesso de leitura a custom_theme_settings (${current.status}); a auditoria ao vivo valida o ID publicado.`);
  manualSteps.push(`Design → configurações do tema: deixar "Ga measurement id" vazio ou igual a ${gaTagId}.`);
} else {
  const settings = (await current.json()).custom_theme_settings || [];
  const gaSetting = settings.find((setting) => setting.key === 'ga_measurement_id');
  if (!gaSetting) {
    console.log('ga_measurement_id not exposed by the active theme yet; skipping.');
  } else if (!gaSetting.value || gaSetting.value === gaTagId) {
    console.log(`ga_measurement_id ok (${gaSetting.value || `vazio — vale o default ${gaTagId}`}).`);
  } else {
    await tolerantPut(
      `${adminUrl}/ghost/api/admin/custom_theme_settings/`,
      {custom_theme_settings:[{key:'ga_measurement_id', value:gaTagId}]},
      `ga_measurement_id updated to ${gaTagId} (was: ${gaSetting.value}).`,
      `Design → configurações do tema: trocar "Ga measurement id" para ${gaTagId}.`
    );
  }
}

// Descrição da tag do blog: sem ela, a página da tag sai sem meta description.
const tagDescriptions = {
  'conteudos-lixo-eletronico': 'Artigos e guias da Ecobraz sobre coleta de lixo eletrônico, descarte de equipamentos, logística reversa e destruição segura de dados.'
};
for (const [slug, description] of Object.entries(tagDescriptions)) {
  const lookup = await fetch(`${adminUrl}/ghost/api/admin/tags/slug/${slug}/`, {headers});
  if (!lookup.ok) {
    console.warn(`AVISO: tag ${slug} não encontrada (${lookup.status}); pulando.`);
    continue;
  }
  const tag = (await lookup.json()).tags?.[0];
  if (!tag) continue;
  if (tag.description === description) {
    console.log(`Tag ${slug}: descrição já correta.`);
    continue;
  }
  await tolerantPut(
    `${adminUrl}/ghost/api/admin/tags/${tag.id}/`,
    {tags:[{id: tag.id, name: tag.name, slug: tag.slug, description, updated_at: tag.updated_at}]},
    `Tag ${slug}: descrição atualizada.`,
    `Tags → ${tag.name}: preencher a descrição da tag.`
  );
}

if (manualSteps.length && process.env.GITHUB_STEP_SUMMARY) {
  const fsSync = await import('node:fs');
  fsSync.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Ajustes manuais pendentes no painel do Ghost\n\n${manualSteps.map((step) => `- [ ] ${step}`).join('\n')}\n`);
}
