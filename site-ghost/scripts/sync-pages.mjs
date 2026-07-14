import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const file = process.argv[2] || 'site-ghost/content/pages.json';
if (!adminUrl || !adminKey.includes(':')) throw new Error('Missing Ghost Admin credentials');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization:`Ghost ${token}`,'Accept-Version':'v5.0','Content-Type':'application/json'};
const pages = JSON.parse(await fs.readFile(file,'utf8'));
const syncedSlugs = [];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const page of pages) {
  const lookup = await fetch(`${adminUrl}/ghost/api/admin/pages/?filter=slug:${encodeURIComponent(page.slug)}&limit=1`, {headers});
  if (!lookup.ok) throw new Error(`Lookup failed for ${page.slug}: ${lookup.status} ${await lookup.text()}`);
  const existing = (await lookup.json()).pages?.[0];
  const payload = {pages:[{...page,status:'published',updated_at:existing?.updated_at}]};
  const endpoint = existing ? `${adminUrl}/ghost/api/admin/pages/${existing.id}/?source=html` : `${adminUrl}/ghost/api/admin/pages/?source=html`;
  const response = await fetch(endpoint,{method:existing?'PUT':'POST',headers,body:JSON.stringify(payload)});
  if (!response.ok) throw new Error(`Sync failed for ${page.slug}: ${response.status} ${(await response.text()).slice(0,600)}`);
  const synced = (await response.json()).pages?.[0];
  if (!synced || synced.status !== 'published' || synced.slug !== page.slug) {
    throw new Error(`Ghost did not publish the expected page: ${page.slug}`);
  }
  syncedSlugs.push(page.slug);
  console.log(existing ? 'Updated' : 'Created', page.slug);
}

async function verifyPublicPage(slug) {
  const url = `${adminUrl}/${slug}/`;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {'User-Agent': 'Ecobraz deployment verification'}
    });
    lastStatus = response.status;
    if (response.ok) {
      console.log('Verified', url, response.status);
      return;
    }
    if (attempt < 6) await wait(2000);
  }

  throw new Error(`Public verification failed for ${url}: ${lastStatus}`);
}

for (const slug of syncedSlugs) await verifyPublicPage(slug);
