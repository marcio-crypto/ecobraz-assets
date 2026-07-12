import crypto from 'node:crypto';

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
