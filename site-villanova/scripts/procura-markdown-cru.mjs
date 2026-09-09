// Procura MARKDOWN CRU publicado como texto no conteúdo da Villanova.
//
// POR QUE EXISTE. Em 09/09/2026, caçando a rolagem lateral de um post, a
// auditoria mediu um "pedaço indivisível" de quase 400px dentro de um
// parágrafo. Não era CSS: era isto, publicado e visível para o leitor —
//
//   ([energy.ec.europa.eu](https://energy.ec.europa.eu/topics/energy-effic...))
//
// O autor escreveu a citação em Markdown, o Ghost guardou como texto puro, e
// ninguém percebeu porque no desktop a linha só fica feia; no celular ela
// empurrava a página inteira. O CSS agora impede o estrago no layout, mas o
// leitor continua vendo a sintaxe crua. Este script diz ONDE isso acontece.
//
// SÓ LÊ. Não grava nada, nem em modo nenhum: converter texto em link de
// verdade mexe na árvore lexical do Ghost, e isso é decisão do Marcio, não
// efeito colateral de uma busca.
//
// Uso: node procura-markdown-cru.mjs
import crypto from 'node:crypto';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey) { console.error('Faltam VILLANOVA_GHOST_ADMIN_URL / VILLANOVA_GHOST_ADMIN_API_KEY.'); process.exit(1); }
const [id, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const headers = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  const token = `${base}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(base).digest('base64url')}`;
  return {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};
};
const api = async (path) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, { headers: headers(), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`GET ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

// O que procurar. Cada padrão roda no HTML RENDERIZADO, não no lexical: o que
// interessa é o que o leitor vê. Se o Ghost tivesse transformado em link, o
// texto do link não teria sobrado no meio do parágrafo.
const PADROES = [
  { nome: 'link em markdown cru', re: /\[[^\]\n]{1,120}\]\(https?:\/\/[^)\s]{1,300}\)/g },
  { nome: 'imagem em markdown cru', re: /!\[[^\]\n]{0,120}\]\([^)\s]{1,300}\)/g },
  { nome: 'negrito/itálico em markdown cru', re: /(?:^|[\s(])\*\*[^*\n]{2,80}\*\*(?=[\s.,;:)]|$)/g },
  { nome: 'título em markdown cru', re: /(?:^|\n)#{1,4}\s+\S/g },
];

// Tira as tags para não confundir atributo com texto: um href legítimo contém
// parênteses e dois-pontos e daria falso positivo no padrão de imagem.
const soTexto = (html) => String(html || '')
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

const buscaTudo = async (tipo) => {
  const itens = [];
  let pag = 1;
  for (;;) {
    const r = await api(`${tipo}/?limit=50&page=${pag}&formats=html&fields=id,slug,title,status,url`);
    itens.push(...r[tipo]);
    if (!r.meta?.pagination?.next) break;
    pag = r.meta.pagination.next;
  }
  return itens;
};

let totalItens = 0, totalOcorr = 0, lidos = 0;
const porPadrao = new Map();

for (const tipo of ['pages', 'posts']) {
  const itens = await buscaTudo(tipo);
  lidos += itens.length;
  console.log(`\n--- ${tipo}: ${itens.length} itens lidos ---`);
  for (const it of itens) {
    const texto = soTexto(it.html);
    const achados = [];
    for (const p of PADROES) {
      const m = texto.match(p.re);
      if (!m || !m.length) continue;
      achados.push({ nome: p.nome, exemplos: m.slice(0, 3), n: m.length });
      porPadrao.set(p.nome, (porPadrao.get(p.nome) || 0) + m.length);
    }
    if (!achados.length) continue;
    totalItens++;
    const n = achados.reduce((s, a) => s + a.n, 0);
    totalOcorr += n;
    console.log(`  /${it.slug}/  [${it.status}]  ${n} ocorrência(s)`);
    for (const a of achados) {
      console.log(`      ${a.nome}: ${a.n}x`);
      for (const e of a.exemplos) console.log(`        ${e.trim().slice(0, 150)}`);
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${lidos} itens lidos · ${totalItens} com markdown cru · ${totalOcorr} ocorrência(s)`);
for (const [nome, n] of porPadrao) console.log(`  ${nome}: ${n}`);
console.log('='.repeat(70));
console.log('Este script SÓ LÊ. Nada foi alterado no Ghost.');
