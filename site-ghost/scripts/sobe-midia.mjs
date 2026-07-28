// Sobe arquivos de mídia (mp4 etc.) para o Ghost da Ecobraz via Admin API.
// Uso: node sobe-midia.mjs <arquivo1> [arquivo2 ...]
// Imprime a URL pública de cada arquivo enviado.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Credenciais do Ghost ausentes');
const arquivos = process.argv.slice(2);
if (!arquivos.length) throw new Error('Informe ao menos um arquivo.');

const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:agora,exp:agora+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;

for (const arq of arquivos) {
  const bytes = await fs.readFile(arq);
  const nome = path.basename(arq);
  const tipo = nome.endsWith('.mp4') ? 'video/mp4' : 'application/octet-stream';
  const form = new FormData();
  form.append('file', new Blob([bytes], {type: tipo}), nome);
  const r = await fetch(`${adminUrl}/ghost/api/admin/media/upload/`, {
    method: 'POST', headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'}, body: form
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Upload de ${nome} falhou (${r.status}): ${texto.slice(0, 400)}`);
  const url = JSON.parse(texto).media?.[0]?.url;
  console.log(`NO AR: ${url}`);
}
