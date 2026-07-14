import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const redirectsPath = process.argv[2] || 'site-ghost/theme/redirects.yaml';

if (!adminUrl || !adminKey.includes(':')) {
  throw new Error('Missing GHOST_ADMIN_URL or GHOST_ADMIN_API_KEY');
}

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${encode({alg:'HS256',typ:'JWT',kid:id})}.${encode({iat:now,exp:now+300,aud:'/admin/'})}`;
const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url');
const token = `${unsigned}.${signature}`;

const bytes = await fs.readFile(redirectsPath);
const sourceText = bytes.toString('utf8');
const expectedEntries = countEntries(sourceText);
const form = new FormData();
form.append('redirects', new Blob([bytes], {type:'application/yaml'}), 'redirects.yaml');

const response = await fetch(`${adminUrl}/ghost/api/admin/redirects/upload/`, {
  method: 'POST',
  headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'},
  body: form
});

const text = await response.text();
if (response.status === 403 && text.includes('API tokens do not have permission')) {
  const notice = [
    '## Proteção dos backlinks — ação manual pendente',
    '',
    `O Ghost bloqueia a importação de redirects por chave de integração (403), portanto os ${expectedEntries} redirecionamentos NÃO foram instalados automaticamente.`,
    '',
    'O proprietário precisa importar o arquivo pelo painel, seguindo o guia `site-ghost/migration/IMPORTAR-REDIRECTS.md`:',
    '',
    '1. Baixe o artefato **ecobraz-backlink-redirects-OWNER-IMPORT** desta execução.',
    '2. No Ghost Admin, abra **Settings → Labs → Redirects → Upload redirects** e envie o `redirects.yaml`.',
    '3. Depois rode a auditoria ao vivo (`audit-live-redirects.mjs`) antes de qualquer troca de domínio.',
    ''
  ].join('\n');
  console.warn(`Ghost blocked the redirects API import for integration tokens (403). Manual owner import of ${expectedEntries} rules is still required — see site-ghost/migration/IMPORTAR-REDIRECTS.md.`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `${notice}\n`);
  process.exit(0);
}
if (!response.ok) throw new Error(`Ghost redirects upload failed (${response.status}): ${text.slice(0,500)}`);

const download = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {
  headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'}
});
const installedText = await download.text();
if (!download.ok) {
  throw new Error(`Ghost redirects verification failed (${download.status}): ${installedText.slice(0,500)}`);
}

const installedEntries = countEntries(installedText);
const sentinels = ['sobre-nos', 'ecobraz_carbon', 'integracao-de-iot-e-blockchain'];
const missingSentinels = sentinels.filter((value) => !installedText.includes(value));

console.log(`Redirects upload verified: ${installedEntries}/${expectedEntries} rules returned by Ghost.`);
if (installedEntries !== expectedEntries || missingSentinels.length) {
  throw new Error(
    `Ghost did not retain the complete redirects file: expected ${expectedEntries}, received ${installedEntries}; ` +
    `missing sentinels: ${missingSentinels.join(', ') || 'none'}`
  );
}

console.log('Redirects installed and verified successfully on', adminUrl);
if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Proteção dos backlinks\n\nO pacote completo (${expectedEntries} redirecionamentos) foi instalado e verificado automaticamente no Ghost.\n\nA troca de domínio continua condicionada à auditoria ao vivo dos endereços antigos.\n`
  );
}

function countEntries(yaml) {
  return yaml.split(/\r?\n/).filter((line) => /^\s{2}(?:["']|\^)/.test(line) && line.includes(':')).length;
}
