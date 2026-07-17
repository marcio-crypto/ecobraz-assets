// Cria/atualiza uma página do Ghost da Villanova ESG a partir de um arquivo JSON.
// Uso: node sync-pagina.mjs <caminho-do-json> [draft|published]
// O JSON é uma lista de páginas (mesmo formato de publications-page.json).
// Em modo draft, imprime o link secreto de pré-visualização (/p/<uuid>/).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2];
if (!ARQUIVO) throw new Error('Informe o caminho do arquivo JSON da página.');
const STATUS = process.argv[3] === 'published' ? 'published' : 'draft';
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

// O conteúdo vai como UM cartão HTML (formato lexical). Com `?source=html` o
// Ghost converte para nós nativos do editor e DESCARTA as classes (vn-cards,
// vn-steps...), quebrando o design. O cartão HTML preserva a marcação intacta.
const comoLexical = (html) => JSON.stringify({
  root: {children: [{type: 'html', version: 1, html}], direction: null, format: '', indent: 0, type: 'root', version: 1}
});

const paginas = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
for (const pagina of paginas) {
  const existente = (await api('GET', `pages/?filter=slug:${pagina.slug}&limit=1`)).pages?.[0];
  const {html, ...resto} = pagina;
  const payload = {pages: [{...resto, lexical: comoLexical(html || ''), status: STATUS, updated_at: existente?.updated_at}]};
  const resultado = existente
    ? await api('PUT', `pages/${existente.id}/`, payload)
    : await api('POST', 'pages/', payload);
  const p = resultado.pages[0];
  console.log(`Página '${p.slug}' ${existente ? 'atualizada' : 'criada'} com status: ${p.status}`);
  if (p.status === 'draft') {
    console.log(`PREVIEW: https://www.villanovaesg.com/p/${p.uuid}/`);
  } else {
    console.log(`NO AR: https://www.villanovaesg.com/${p.slug}/`);
  }
}
