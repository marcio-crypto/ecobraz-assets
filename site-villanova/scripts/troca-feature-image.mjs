// Sobe uma imagem otimizada no Ghost e aponta todos os posts/páginas cujo
// feature_image contém <substrAntiga> para a nova URL.
// Uso: node troca-feature-image.mjs <substrAntiga> <arquivoLocalOtimizado> [mime]
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const [substr, localPath, mime = 'image/jpeg'] = process.argv.slice(2);
if (!substr || !localPath) throw new Error('Uso: troca-feature-image.mjs <substrAntiga> <arquivoLocal> [mime]');

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const auth = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

const api = async (method, p, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${p}`, {
    method, headers: {...auth, 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

// 1) Upload da imagem otimizada
const bytes = await fs.readFile(localPath);
const form = new FormData();
form.append('file', new Blob([bytes], {type: mime}), path.basename(localPath));
form.append('purpose', 'image');
const up = await fetch(`${adminUrl}/ghost/api/admin/images/upload/`, {method: 'POST', headers: auth, body: form});
if (!up.ok) throw new Error(`upload: ${up.status} ${(await up.text()).slice(0, 300)}`);
const newUrl = (await up.json()).images[0].url;
console.log(`Imagem otimizada enviada: ${newUrl} (${(bytes.length / 1024).toFixed(0)} KB)`);

// 2) Repontar todos os posts e páginas que usavam a imagem antiga
let total = 0;
for (const tipo of ['posts', 'pages']) {
  let page = 1;
  while (true) {
    const data = await api('GET', `${tipo}/?limit=100&page=${page}&fields=id,slug,feature_image,updated_at`);
    for (const item of data[tipo]) {
      if (item.feature_image && item.feature_image.includes(substr)) {
        await api('PUT', `${tipo}/${item.id}/`, {[tipo]: [{feature_image: newUrl, updated_at: item.updated_at}]});
        console.log(`repontado: ${tipo}/${item.slug}`);
        total += 1;
      }
    }
    if (page >= data.meta.pagination.pages) break;
    page += 1;
  }
}
console.log(`Concluído: ${total} recurso(s) apontando agora para a imagem otimizada.`);
if (total === 0) console.warn('AVISO: nenhum recurso referenciava a imagem antiga — nada foi repontado.');
