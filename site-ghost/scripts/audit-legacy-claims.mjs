// Auditoria de legado e alegações: verifica as URLs críticas apontadas pela
// auditoria externa e inventaria todo o conteúdo publicado no Ghost que NÃO é
// gerenciado pelo repositório, sinalizando alegações proibidas pela governança.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Missing Ghost Admin credentials');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization:`Ghost ${token}`,'Accept-Version':'v5.0'};

// 1) URLs críticas citadas pela auditoria externa — o que respondem hoje?
const criticalUrls = [
  'https://ecobraz.org/pt_BR/blog/5-razoes-que-fazem-da-ecobraz-o-maior-projeto-mundial-de-reciclagem-de-lixo-eletronico',
  'https://ecobraz.org/blog/ecobraz-emigre-como-a-maior-ong-de-reciclagem-de-lixo-eletronico-do-mundo-ajuda-o-meio-ambiente',
  'https://ecobraz.org/pt_BR/blog/esg-na-pratica-case-ecobraz-a-maior-ong-do-mundo-em-reciclagem-de-eletronicos',
  'https://ecobraz.org/pt_BR/projeto_reciclando',
  'https://lp.ecobraz.org/pt_BR/blog/5-razoes-que-fazem-da-ecobraz-o-maior-projeto-mundial-de-reciclagem-de-lixo-eletronico'
];
console.log('== URLS CRÍTICAS DA AUDITORIA ==');
for (const url of criticalUrls) {
  try {
    const first = await fetch(url, {redirect: 'manual', headers: {'User-Agent': 'Ecobraz legacy audit'}});
    const location = first.headers.get('location') || '';
    let line = `${first.status}${location ? ' -> ' + location : ''}`;
    if (first.status === 200) {
      const html = await first.text();
      const title = (html.match(/<title[^>]*>([^<]*)</i) || [])[1] || '';
      line += ` | title: ${title.trim().slice(0, 90)}`;
    }
    console.log(`  ${url}\n    ${line}`);
  } catch (error) {
    console.log(`  ${url}\n    ERRO: ${error.message}`);
  }
}

// 2) Inventário do Ghost: tudo publicado vs. o que o repositório gerencia.
const contentDir = path.resolve(import.meta.dirname, '..', 'content');
const managedPosts = new Set();
const managedPages = new Set();
for (const name of (await fs.readdir(contentDir)).filter((n) => n.endsWith('.json'))) {
  const items = JSON.parse(await fs.readFile(path.join(contentDir, name), 'utf8'));
  for (const item of items) (name === 'priority-posts.json' ? managedPosts : managedPages).add(item.slug);
}

async function browseAll(resource) {
  const all = [];
  let page = 1;
  while (true) {
    const response = await fetch(`${adminUrl}/ghost/api/admin/${resource}/?limit=100&page=${page}&formats=html&filter=status:published`, {headers});
    if (!response.ok) throw new Error(`${resource} browse failed: ${response.status} ${(await response.text()).slice(0,300)}`);
    const data = await response.json();
    all.push(...data[resource]);
    if (!data.meta.pagination.next) break;
    page = data.meta.pagination.next;
  }
  return all;
}

const forbidden = [
  [/maior\s+(projeto|ong|empresa|iniciativa)/i, 'superlativo "maior"'],
  [/coleta\s+(100%\s*)?gratuita|gratuitamente|sem\s+custo/i, 'promessa de gratuidade'],
  [/carbon\s*token|ecobraz\s*carbon|cr[eé]dito[s]?\s+de\s+carbono/i, 'Ecobraz Carbon/carbono'],
  [/\+1\s*\(?555\)?/, 'telefone falso +1 (555)'],
  [/48\s*mil|12\s*mil\s+empresas|24\s*mil\s+pessoas|600\s*mil\s+toneladas|2\.?000\s*t|200\s+centros|500\s*mil\s+pessoas/i, 'números não conciliados'],
  [/certifica[çc][aã]o\s+(CETESB|IBAMA)|ISO\s*14001|ISO\s*41001/i, 'selo/certificação sem titular'],
  [/l[aâ]mpada[s]?\s+(aceit|colet)/i, 'oferta de lâmpadas (fora do escopo)'],
  [/risco\s+zero|conformidade\s+total|tudo\s+audit[aá]vel/i, 'garantia absoluta']
];

console.log('\n== POSTS PUBLICADOS NO GHOST ==');
const posts = await browseAll('posts');
let unmanagedCount = 0, flaggedCount = 0;
const flaggedRows = [];
for (const post of posts) {
  const managed = managedPosts.has(post.slug);
  const text = `${post.title}\n${post.custom_excerpt || ''}\n${post.html || ''}`;
  const flags = forbidden.filter(([re]) => re.test(text)).map(([, label]) => label);
  if (!managed) unmanagedCount += 1;
  if (flags.length) {
    flaggedCount += 1;
    flaggedRows.push({slug: post.slug, managed, flags});
  }
}
console.log(`Total publicados: ${posts.length} | gerenciados pelo repo: ${posts.length - unmanagedCount} | NÃO gerenciados: ${unmanagedCount}`);
console.log(`Posts com alegações proibidas: ${flaggedCount}`);
for (const row of flaggedRows) console.log(`  [${row.managed ? 'GERENCIADO' : 'legado'}] /blog/${row.slug}/ — ${row.flags.join('; ')}`);

console.log('\n== PÁGINAS PUBLICADAS NO GHOST ==');
const pages = await browseAll('pages');
const unmanagedPages = pages.filter((p) => !managedPages.has(p.slug));
console.log(`Total publicadas: ${pages.length} | NÃO gerenciadas: ${unmanagedPages.length}`);
for (const p of unmanagedPages) console.log(`  legado: /${p.slug}/ — "${p.title}"`);

await fs.writeFile('legacy-audit.json', JSON.stringify({posts: flaggedRows, unmanagedPages: unmanagedPages.map((p) => ({slug: p.slug, title: p.title}))}, null, 2));
console.log('\nDetalhe salvo em legacy-audit.json');
