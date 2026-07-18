// Define a meta description das paginas de arquivo de tag e do autor do
// villanovaesg.com a partir de site-villanova/content/tags-meta.json.
// Corrige o aviso "meta description ausente" da auditoria Ahrefs.
//
// Robusto por design: as tags sao casadas pelo NOME exato (nao pelo slug, que
// o Ghost deriva sozinho) e o autor pelo "primary author" com posts publicados.
// Nao destrutivo: se algo nao casar, apenas avisa (nao falha o job).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

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
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

// Busca paginada de um recurso (tags/users), incluindo contagem de posts.
async function todos(tipo) {
  const out = [];
  let page = 1;
  while (true) {
    const j = await api('GET', `${tipo}/?limit=100&page=${page}&include=count.posts`);
    out.push(...(j[tipo] || []));
    if (!j.meta?.pagination?.next) break;
    page += 1;
  }
  return out;
}

const cfg = JSON.parse(await fs.readFile('site-villanova/content/tags-meta.json', 'utf8'));

// --- TAGS (casadas por nome exato) ---
const tags = await todos('tags');
console.log(`Tags no Ghost (${tags.length}): ${tags.map((t) => `${t.name} [${t.slug}]`).join(' | ')}`);
let okTags = 0;
for (const {name, meta_description} of (cfg.tags || [])) {
  const tag = tags.find((t) => t.name === name);
  if (!tag) { console.log(`AVISO: tag "${name}" nao encontrada — pulada`); continue; }
  if ((tag.meta_description || '') === meta_description) { console.log(`ok (sem mudanca): tag/${tag.slug}`); okTags += 1; continue; }
  await api('PUT', `tags/${tag.id}/`, {tags: [{meta_description, updated_at: tag.updated_at}]});
  console.log(`meta aplicada: tag/${tag.slug} (${meta_description.length} chars)`);
  okTags += 1;
  await espera(200);
}

// --- AUTOR (primary author = usuario com mais posts publicados) ---
let okAutores = 0;
const autoresCfg = cfg.authors || [];
if (autoresCfg.length) {
  const users = await todos('users');
  console.log(`Autores no Ghost: ${users.map((u) => `${u.name} [${u.slug}] posts=${u.count?.posts ?? '?'}`).join(' | ')}`);
  const principal = [...users].sort((a, b) => (b.count?.posts || 0) - (a.count?.posts || 0))[0];
  for (const a of autoresCfg) {
    const alvo = a.match_primary ? principal : users.find((u) => u.slug === a.slug || u.name === a.name);
    if (!alvo) { console.log(`AVISO: autor ${a.slug || a.name || '(primary)'} nao encontrado — pulado`); continue; }
    if ((alvo.meta_description || '') === a.meta_description) { console.log(`ok (sem mudanca): author/${alvo.slug}`); okAutores += 1; continue; }
    try {
      // O Ghost exige email no PUT de users; reenvia o email atual para nao alterar.
      await api('PUT', `users/${alvo.id}/`, {users: [{email: alvo.email, meta_description: a.meta_description, updated_at: alvo.updated_at}]});
      console.log(`meta aplicada: author/${alvo.slug} (${a.meta_description.length} chars)`);
      okAutores += 1;
      await espera(200);
    } catch (e) {
      // Tokens de integracao do Ghost Admin nao tem permissao para editar
      // usuarios/staff (403 NoPermissionError). Nao e um bug: a meta do autor
      // precisa ser definida manualmente no painel (Ghost Admin > Staff) ou o
      // Ghost usa a bio como fallback. Nao falha o job por causa disso.
      console.log(`AVISO: nao foi possivel definir meta do autor/${alvo.slug} via API (${String(e.message).slice(0, 120)}). Deixe manual no painel do Ghost.`);
    }
  }
}

console.log(`Concluido: ${okTags}/${(cfg.tags || []).length} tags, ${okAutores}/${autoresCfg.length} autores.`);
