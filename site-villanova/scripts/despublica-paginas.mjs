// Despublica páginas do Ghost (status -> draft) a partir de uma lista de slugs.
// Uso: node despublica-paginas.mjs <caminho-do-json>
//
// Feito para o caso descoberto em 16/08/2026: 38 páginas continuavam publicadas
// (e no sitemap) mesmo tendo um 301 ativo mandando o visitante para outro lugar.
// O sitemap dizia ao Google "indexe" enquanto o servidor dizia "vá embora" — o
// que aparecia no Search Console como 53 "páginas com redirecionamento".
// Despublicar tira do sitemap e mantém o 301 funcionando.
//
// NÃO apaga nada: o conteúdo continua no Ghost como rascunho e republicar é
// um clique. O corpo da página não é tocado (só o campo status).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2];
if (!ARQUIVO) throw new Error('Informe o caminho do JSON com a lista de slugs.');
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

const itens = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
let feitos = 0;
let avisos = 0;

for (const item of itens) {
  const slug = typeof item === 'string' ? item : item.slug;
  const atual = (await api('GET', `pages/?filter=slug:${slug}&limit=1`)).pages?.[0];
  if (!atual) { console.log(`AVISO: página ${slug} não existe — pulada`); avisos++; continue; }
  if (atual.status !== 'published') { console.log(`ok (já estava ${atual.status}): ${slug}`); continue; }

  await api('PUT', `pages/${atual.id}/`, {pages: [{status: 'draft', updated_at: atual.updated_at}]});
  console.log(`despublicada: /${slug}/  (301 ativo -> ${item.destino || '?'})`);
  feitos++;
  await espera(200);
}

console.log(`\nResumo: ${feitos} despublicadas, ${avisos} avisos, ${itens.length} na lista.`);
