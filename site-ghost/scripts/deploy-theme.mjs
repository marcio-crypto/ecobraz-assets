import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const themePath = process.argv[2] || 'theme.zip';

if (!adminUrl || !adminKey.includes(':')) {
  throw new Error('Missing GHOST_ADMIN_URL or GHOST_ADMIN_API_KEY');
}

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${encode({alg:'HS256',typ:'JWT',kid:id})}.${encode({iat:now,exp:now+300,aud:'/admin/'})}`;
const signature = crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url');
const token = `${unsigned}.${signature}`;

const bytes = await fs.readFile(themePath);
const form = new FormData();
form.append('file', new Blob([bytes], {type:'application/zip'}), 'ecobraz-conversion.zip');

const response = await fetch(`${adminUrl}/ghost/api/admin/themes/upload/`, {
  method: 'POST',
  headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'},
  body: form
});

const text = await response.text();
if (!response.ok) throw new Error(`Ghost theme upload failed (${response.status}): ${text.slice(0,500)}`);
console.log('Theme uploaded successfully to', adminUrl);
