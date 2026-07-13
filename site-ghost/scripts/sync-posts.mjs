import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const file = process.argv[2] || 'site-ghost/content/priority-posts.json';
if (!adminUrl || !adminKey.includes(':')) throw new Error('Missing Ghost Admin credentials');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization:`Ghost ${token}`,'Accept-Version':'v5.0','Content-Type':'application/json'};
const posts = JSON.parse(await fs.readFile(file, 'utf8'));

for (const post of posts) {
  const lookup = await fetch(`${adminUrl}/ghost/api/admin/posts/?filter=slug:${encodeURIComponent(post.slug)}&limit=1`, {headers});
  if (!lookup.ok) throw new Error(`Lookup failed for ${post.slug}: ${lookup.status} ${await lookup.text()}`);
  const existing = (await lookup.json()).posts?.[0];
  const payload = {posts:[{...post,status:'published',updated_at:existing?.updated_at}]};
  const endpoint = existing ? `${adminUrl}/ghost/api/admin/posts/${existing.id}/?source=html` : `${adminUrl}/ghost/api/admin/posts/?source=html`;
  const response = await fetch(endpoint,{method:existing?'PUT':'POST',headers,body:JSON.stringify(payload)});
  if (!response.ok) throw new Error(`Sync failed for ${post.slug}: ${response.status} ${(await response.text()).slice(0,600)}`);
  console.log(existing ? 'Updated post' : 'Created post', post.slug);
}
