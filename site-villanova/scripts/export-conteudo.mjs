// Exporta todo o conteúdo do Ghost da Villanova ESG (páginas e posts, com HTML)
// para JSON em site-villanova/export/ — insumo do retrabalho visual e da tradução.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

const listar = async (tipo) => {
  const itens = [];
  let page = 1;
  for (;;) {
    const r = await fetch(`${adminUrl}/ghost/api/admin/${tipo}/?formats=html&include=tags&limit=50&page=${page}`, {headers});
    if (!r.ok) throw new Error(`${tipo} p${page}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    for (const it of j[tipo]) {
      itens.push({
        id: it.id,
        slug: it.slug,
        title: it.title,
        status: it.status,
        visibility: it.visibility,
        custom_excerpt: it.custom_excerpt,
        meta_title: it.meta_title,
        meta_description: it.meta_description,
        canonical_url: it.canonical_url,
        codeinjection_head: it.codeinjection_head,
        custom_template: it.custom_template,
        feature_image: it.feature_image,
        published_at: it.published_at,
        updated_at: it.updated_at,
        tags: (it.tags || []).map((t) => t.name),
        html: it.html
      });
    }
    const pag = j.meta?.pagination;
    if (!pag || page >= pag.pages) break;
    page += 1;
  }
  return itens;
};

await fs.mkdir('site-villanova/export', {recursive: true});
const pages = await listar('pages');
const posts = await listar('posts');
await fs.writeFile('site-villanova/export/pages.json', JSON.stringify(pages, null, 1) + '\n');
await fs.writeFile('site-villanova/export/posts.json', JSON.stringify(posts, null, 1) + '\n');
console.log(`Exportado: ${pages.length} páginas, ${posts.length} posts.`);
console.log('Páginas:', pages.map((p) => `${p.slug} [${p.status}]`).join(' | '));
