// Varredura do prazo da COLETA EXPRESSA em tudo o que o Ghost serve.
//
// POR QUE ESTE SCRIPT EXISTE. O repositorio governa o tema e as paginas
// listadas em content/ e landing/. Ele NAO governa os posts do blog nem
// paginas criadas direto no painel. O prazo da expressa mudou de 24h para 72h;
// sem varrer o que esta no Ghost, a promessa velha continua no ar em lugares
// que ninguem lembra de olhar.
//
//   listar    (padrao) so LE e imprime o relatorio. Nao escreve nada.
//   corrigir  aplica as mesmas trocas do repositorio via API e confere o
//             resultado item por item.
//
// O relatorio separa DUAS coisas que sao parecidas e nao podem ser confundidas:
//   PRAZO DA COLETA   "coleta expressa em ate 24h"  -> tem de virar 72h
//   PRAZO DE RESPOSTA "resposta em ate 24h uteis"   -> NAO se mexe
// A confusao entre as duas apagaria a promessa de atendimento do site inteiro.
import crypto from 'node:crypto';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
const modo = (process.argv[2] || 'listar').toLowerCase();
if (!adminUrl || !adminKey.includes(':')) throw new Error('Faltam GHOST_ADMIN_URL / GHOST_ADMIN_API_KEY.');
if (!['listar', 'corrigir'].includes(modo)) throw new Error(`Modo desconhecido: ${modo}`);

const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

// Campos de texto que chegam ao visitante ou ao buscador.
const CAMPOS = [
  'title', 'custom_excerpt', 'meta_title', 'meta_description',
  'og_title', 'og_description', 'twitter_title', 'twitter_description',
  'codeinjection_head', 'codeinjection_foot', 'html'
];

// "24h uteis" e prazo de RESPOSTA: fica fora da conta de coisas a corrigir.
const RESPOSTA = /24\s*h(?:oras)?\s*[úu]teis/i;

// Qualquer mencao a um prazo de 24 horas, com o texto em volta.
const PRAZO = /.{0,140}(?:24\s*h\b|24\s*horas|24\s*hours|24-hour).{0,140}/gis;
// "para amanha" so aparece no site colado na frase da expressa.
const AMANHA = /.{0,140}(?:para amanh[ãa]|need it tomorrow).{0,140}/gis;

// As mesmas trocas ja aplicadas no repositorio, na mesma ordem.
const TROCAS = [
  [/expressa em at[ée] 24h/g, 'expressa em até 72h'],
  [/expressa, em at[ée] 24h/g, 'expressa, em até 72h'],
  [/EXPRESSA — em at[ée] 24h/g, 'EXPRESSA — em até 72h'],
  [/Expressa — em at[ée] 24h/g, 'Expressa — em até 72h'],
  [/Express — within 24h/g, 'Express — within 72h'],
  [/Express collection within 24 hours/g, 'Express collection within 72 hours'],
  [/express within 24 hours/g, 'express within 72 hours'],
  [/expressa 24h/g, 'expressa 72h'],
  [/Precisa para amanh[ãa]\?/g, 'Precisa com mais urgência?'],
  [/precisa para amanh[ãa]\?/g, 'precisa com mais urgência?'],
  [/Need it tomorrow\?/g, 'Need it sooner?'],
  [/need it tomorrow\?/g, 'need it sooner?']
];

const aplica = (texto) => TROCAS.reduce((t, [de, para]) => t.replace(de, para), texto);
const limpa = (s) => String(s).replace(/\s+/g, ' ').trim();

const listar = async (tipo) => {
  const itens = [];
  for (let page = 1; ; page += 1) {
    const url = `${adminUrl}/ghost/api/admin/${tipo}/?formats=html&limit=50&page=${page}&filter=status:[published,draft,scheduled,sent]`;
    const r = await fetch(url, {headers});
    if (!r.ok) throw new Error(`${tipo} p${page}: ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    itens.push(...j[tipo]);
    const pag = j.meta?.pagination;
    if (!pag || page >= pag.pages) break;
  }
  return itens;
};

const achados = [];
const contaResposta = {n: 0};

const examina = (tipo, item) => {
  for (const campo of CAMPOS) {
    const valor = item[campo];
    if (!valor || typeof valor !== 'string') continue;
    const trechos = [...valor.matchAll(PRAZO), ...valor.matchAll(AMANHA)].map((m) => m[0]);
    for (const trecho of trechos) {
      if (RESPOSTA.test(trecho) && !/express/i.test(trecho)) { contaResposta.n += 1; continue; }
      achados.push({tipo, slug: item.slug, status: item.status, campo, trecho: limpa(trecho)});
    }
  }
};

const paginas = await listar('pages');
const posts = await listar('posts');
for (const p of paginas) examina('page', p);
for (const p of posts) examina('post', p);

// Configuracoes gerais e tags tambem carregam texto publico.
const cfg = await fetch(`${adminUrl}/ghost/api/admin/settings/`, {headers});
if (cfg.ok) {
  const s = Object.fromEntries(((await cfg.json()).settings || []).map((x) => [x.key, x.value]));
  for (const k of ['description', 'meta_description', 'og_description', 'twitter_description', 'codeinjection_head', 'codeinjection_foot']) {
    const v = s[k];
    if (typeof v !== 'string') continue;
    for (const m of [...v.matchAll(PRAZO), ...v.matchAll(AMANHA)]) {
      if (RESPOSTA.test(m[0]) && !/express/i.test(m[0])) { contaResposta.n += 1; continue; }
      achados.push({tipo: 'settings', slug: k, status: '-', campo: k, trecho: limpa(m[0])});
    }
  }
} else {
  console.log(`AVISO: nao consegui ler settings (HTTP ${cfg.status}). Configuracoes gerais NAO foram varridas.`);
}

console.log(`Varridos: ${paginas.length} paginas, ${posts.length} posts (todos os status).`);
console.log(`Mencoes a "24h uteis" (prazo de RESPOSTA, nao se mexe): ${contaResposta.n} — ignoradas de proposito.`);
console.log(`\n=== PRAZO DE COLETA / "amanha" encontrados: ${achados.length} ===`);
for (const a of achados) {
  console.log(`\n[${a.tipo}] ${a.slug} (${a.status}) · campo ${a.campo}`);
  console.log(`  …${a.trecho}…`);
  const depois = aplica(a.trecho);
  console.log(depois === a.trecho ? '  >> NENHUMA troca automatica se aplica — decisao humana.' : `  >> viraria: …${depois}…`);
}

if (modo === 'listar') {
  console.log('\nMODO LISTAR — nada foi alterado no Ghost.');
  process.exit(0);
}

// ---- corrigir ----
const alvos = new Map();
for (const item of [...paginas.map((p) => ['pages', p]), ...posts.map((p) => ['posts', p])]) {
  const [tipo, it] = item;
  const mudou = {};
  for (const campo of CAMPOS) {
    const v = it[campo];
    if (!v || typeof v !== 'string') continue;
    const novo = aplica(v);
    if (novo !== v) mudou[campo] = novo;
  }
  if (Object.keys(mudou).length) alvos.set(`${tipo}:${it.id}`, {tipo, it, mudou});
}

console.log(`\n=== CORRIGIR: ${alvos.size} itens com troca automatica ===`);
let ok = 0;
const falhas = [];
for (const [, {tipo, it, mudou}] of alvos) {
  const corpo = {[tipo]: [{...mudou, updated_at: it.updated_at}]};
  const url = `${adminUrl}/ghost/api/admin/${tipo}/${it.id}/${mudou.html ? '?source=html' : ''}`;
  const r = await fetch(url, {method: 'PUT', headers, body: JSON.stringify(corpo)});
  const txt = await r.text();
  if (!r.ok) { falhas.push(`${it.slug}: HTTP ${r.status} ${txt.slice(0, 200)}`); console.log(`FALHOU ${it.slug}`); continue; }
  // Confere no proprio retorno do Ghost que o 24h sumiu dos campos tocados.
  const volta = JSON.parse(txt)[tipo][0];
  const resta = Object.keys(mudou).filter((c) => /expressa em at[ée] 24h|Express collection within 24 hours|para amanh/i.test(String(volta[c] || '')));
  if (resta.length) { falhas.push(`${it.slug}: Ghost aceitou mas o texto velho continua em ${resta.join(', ')}`); console.log(`SUSPEITO ${it.slug}`); continue; }
  ok += 1;
  console.log(`OK ${tipo} ${it.slug} (${Object.keys(mudou).join(', ')})`);
}
console.log(`\nCorrigidos e conferidos: ${ok}/${alvos.size}`);
if (falhas.length) { console.log('FALHAS:'); for (const f of falhas) console.log('  - ' + f); process.exit(1); }
