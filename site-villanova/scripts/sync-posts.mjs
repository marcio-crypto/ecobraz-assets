// Cria/atualiza posts no Ghost da Villanova ESG a partir de um arquivo JSON.
// Uso: node sync-posts.mjs <caminho-do-json>
// O JSON é uma lista de posts: {slug, title, custom_excerpt, meta_title,
// meta_description, html, tags: [nomes], published_at?, feature_image?}.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2];
if (!ARQUIVO) throw new Error('Informe o caminho do arquivo JSON dos posts.');
const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 400)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

const posts = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
let ok = 0;
for (const post of posts) {
  const {tags, status, html, ...resto} = post;
  const existente = (await api('GET', `posts/?filter=slug:${post.slug}&limit=1`)).posts?.[0];
  // Campos comuns. Só mexe em `tags` se o arquivo trouxer o campo (senão as
  // tags atuais ficam intactas). `status` explícito vence; padrão: published.
  const comuns = {
    ...resto,
    status: status || 'published',
    ...(tags ? {tags: tags.map((name) => ({name}))} : {}),
    updated_at: existente?.updated_at,
  };
  let r;
  if (html == null) {
    // Atualização somente de metadados/status — NÃO reescreve o corpo do post.
    if (!existente) throw new Error(`Post '${post.slug}' não existe; para criar, inclua o campo html.`);
    r = await api('PUT', `posts/${existente.id}/`, {posts: [comuns]});
  } else {
    // Cria/atualiza com corpo. `?source=html` converte o HTML em nós nativos.
    const corpo = {posts: [{...comuns, html}]};
    r = existente
      ? await api('PUT', `posts/${existente.id}/?source=html`, corpo)
      : await api('POST', 'posts/?source=html', corpo);
  }
  ok += 1;
  console.log(`${existente ? 'atualizado' : 'criado'}: /${r.posts[0].slug}/ -> ${r.posts[0].status}`);
  await espera(250);
}
console.log(`Total sincronizado: ${ok}/${posts.length}`);
