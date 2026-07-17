// Diagnóstico + correção: remove o Sérgio Diniz como AUTOR no Ghost.
// Reatribui os posts dele ao proprietário do site (some do sitemap de autores)
// e tenta remover/inativar o usuário. Idempotente.
import crypto from 'node:crypto';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const jwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const u = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: now, exp: now + 300, aud: '/admin/'})}`;
  return `${u}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(u).digest('base64url')}`;
};
const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {
    method, headers: {Authorization: `Ghost ${jwt()}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  return {status: r.status, json: txt ? JSON.parse(txt) : null, txt};
};

// 1. Sérgio é usuário/autor?
const users = await api('GET', 'users/?filter=slug:sergio-diniz&include=count.posts&limit=1');
const sergio = users.json?.users?.[0];
if (!sergio) {
  console.log('Sérgio Diniz NÃO é autor no Ghost — nada a fazer no lado de autores.');
} else {
  console.log(`Sérgio encontrado: id=${sergio.id} | posts atribuídos=${sergio.count?.posts ?? '?'} | status=${sergio.status}`);

  // 2. Proprietário do site (destino da reatribuição)
  const owners = await api('GET', 'users/?limit=all');
  const owner = owners.json.users.find((u) => (u.roles || []).some((r) => r.name === 'Owner')) || owners.json.users[0];
  console.log(`Autor de destino: ${owner.name} (id=${owner.id})`);

  // 3. Posts do Sérgio -> reatribui ao proprietário
  let page = 1, reatribuidos = 0;
  for (;;) {
    const r = await api('GET', `posts/?filter=authors:sergio-diniz&include=authors&limit=50&page=${page}`);
    const posts = r.json?.posts || [];
    if (!posts.length) break;
    for (const p of posts) {
      const novos = (p.authors || []).filter((a) => a.slug !== 'sergio-diniz').map((a) => ({id: a.id}));
      if (!novos.length) novos.push({id: owner.id});
      const put = await api('PUT', `posts/${p.id}/`, {posts: [{authors: novos, updated_at: p.updated_at}]});
      if (put.status === 200) { reatribuidos++; console.log(`  reatribuído: /${p.slug}/`); }
      else console.log(`  FALHA ${p.slug}: ${put.status} ${put.txt.slice(0, 160)}`);
    }
    const pag = r.json.meta?.pagination;
    if (!pag || page >= pag.pages) break;
    page++;
  }
  console.log(`Posts reatribuídos: ${reatribuidos}`);

  // 4. Tenta remover o usuário (Ghost 6 pode bloquear via integração — não fatal)
  const del = await api('DELETE', `users/${sergio.id}/`);
  if (del.status === 200 || del.status === 204) console.log('Usuário Sérgio removido do Ghost.');
  else console.log(`Não foi possível remover o usuário via integração (${del.status}) — sem posts, o arquivo dele sai do sitemap mesmo assim.`);
}

// 5. Confirma: Sérgio ainda tem posts?
const check = await api('GET', 'users/?filter=slug:sergio-diniz&include=count.posts&limit=1');
const s2 = check.json?.users?.[0];
console.log(s2 ? `Estado final: Sérgio ainda existe, posts=${s2.count?.posts ?? '?'}` : 'Estado final: Sérgio não existe mais como autor.');
