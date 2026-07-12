import crypto from 'node:crypto';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Missing Ghost Admin credentials');

const targets = {
  pages: [
    'about',
    'blog',
    'sobre-2',
    'evidencias-2',
    'descarte-corporativo-de-ti-2',
    'destruicao-de-dados-2',
    'logistica-reversa-2',
    'documentacao-e-rastreabilidade-2',
    'coletas-recorrentes-2'
  ],
  posts: ['coming-soon']
};

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization:`Ghost ${token}`,'Accept-Version':'v5.0','Content-Type':'application/json'};

for (const [resource, slugs] of Object.entries(targets)) {
  for (const slug of slugs) {
    const lookup = await fetch(`${adminUrl}/ghost/api/admin/${resource}/?filter=slug:${encodeURIComponent(slug)}&limit=1`, {headers});
    if (!lookup.ok) throw new Error(`Cleanup lookup failed for ${resource}/${slug}: ${lookup.status} ${await lookup.text()}`);
    const item = (await lookup.json())[resource]?.[0];
    if (!item) {
      console.log('Already absent', resource, slug);
      continue;
    }
    if (item.status === 'draft') {
      console.log('Already draft', resource, slug);
      continue;
    }
    const payload = {[resource]:[{id:item.id,title:item.title,slug:item.slug,status:'draft',updated_at:item.updated_at}]};
    const response = await fetch(`${adminUrl}/ghost/api/admin/${resource}/${item.id}/`, {
      method:'PUT', headers, body:JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Cleanup failed for ${resource}/${slug}: ${response.status} ${(await response.text()).slice(0,600)}`);
    console.log('Unpublished', resource, slug);
  }
}
