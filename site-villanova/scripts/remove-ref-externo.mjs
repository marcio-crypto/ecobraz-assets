// Tira o parametro ?ref=villanovaesg.com dos links externos do conteudo.
//
// Uso: node remove-ref-externo.mjs [simular|aplicar]
//
// Por que: o parametro nao e enfeite, ele quebra fonte. Comprovado em
// 08/09/2026 — https://sciencebasedtargets.org/net-zero devolve 404 COM o
// parametro e 200 SEM ele, levando a "The Corporate Net-Zero Standard". Como o
// ?ref esta em mais de duzentos links externos, nao da para saber pelo relatorio
// quantas outras citacoes ele estraga.
//
// Alem do defeito tecnico, ha o custo de credibilidade: um site cujo argumento
// e "o comprador europeu confere na fonte" nao deveria entregar a URL do
// EUR-Lex com um parametro de marketing colado.
//
// Seguranca: mexe SOMENTE dentro de href, e SOMENTE no parametro ref cujo valor
// e villanovaesg.com. Nao toca em texto, nao toca em link interno, nao remove
// outros parametros — se a URL tiver ?foo=1&ref=villanovaesg.com, so o ref sai.
// Grava o lexical direto, sem ?source=html (que destruiria as classes do design).
import crypto from 'node:crypto';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
// Token novo a cada chamada: o JWT do Ghost vale 5 min e a rotina e longa.
const headers = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  const token = `${base}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(base).digest('base64url')}`;
  return {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};
};
const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {
    method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

// Duas formas: o ref e o unico parametro (some com a interrogacao junto) ou ele
// vem depois de outro (some so o &ref=...). A barra invertida opcional cobre o
// lexical, onde as aspas do href aparecem escapadas.
const SO_PARAM = /(href=\\?["'][^"'\\]*?)\?ref=villanovaesg\.com(?=(&|\\?["']))/g;
const COM_OUTROS = /(href=\\?["'][^"'\\]*?)&ref=villanovaesg\.com/g;

const limpa = (texto) => {
  let n = 0;
  let saida = texto.replace(SO_PARAM, (m, pre, prox) => {
    // Se vier "&" logo apos, a interrogacao precisa sobreviver para o proximo
    // parametro: ?ref=x&y=1 vira ?y=1, nao &y=1.
    n++;
    return prox === '&' ? `${pre}?` : pre;
  });
  // O caso acima pode ter deixado "?&"; normaliza.
  saida = saida.replace(/(href=\\?["'][^"'\\]*?)\?&/g, '$1?');
  saida = saida.replace(COM_OUTROS, (m, pre) => { n++; return pre; });
  return {saida, n};
};

const buscaTudo = async (tipo) => {
  const itens = [];
  let pag = 1;
  for (;;) {
    const r = await api('GET', `${tipo}/?limit=50&page=${pag}&formats=lexical&fields=id,slug,title,status,updated_at`);
    itens.push(...r[tipo]);
    if (!r.meta?.pagination?.next) break;
    pag = r.meta.pagination.next;
  }
  return itens;
};

console.log(`modo: ${MODO}\n`);
let totalLinks = 0, totalItens = 0, erros = 0;

for (const tipo of ['pages', 'posts']) {
  const itens = await buscaTudo(tipo);
  console.log(`--- ${tipo}: ${itens.length} itens ---`);
  for (const it of itens) {
    const original = it.lexical || '';
    if (!original.includes('ref=villanovaesg.com')) continue;
    const {saida, n} = limpa(original);
    if (!n) { console.log(`  AVISO: /${it.slug}/ menciona ref=villanovaesg.com fora de href — nao tocado`); continue; }
    totalItens++; totalLinks += n;
    console.log(`  ${String(n).padStart(3)} link(s)  /${it.slug}/  [${it.status}]`);
    if (MODO === 'aplicar') {
      try {
        await api('PUT', `${tipo}/${it.id}/`, {[tipo]: [{lexical: saida, updated_at: it.updated_at}]});
        await espera(150);
      } catch (e) {
        erros++;
        console.log(`      ERRO ao gravar: ${e.message}`);
      }
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${totalLinks} parametro(s) removidos em ${totalItens} itens | erros: ${erros}`);
console.log('='.repeat(70));
if (MODO === 'simular') console.log('\nMODO SIMULAR — nada foi gravado.');
if (erros) process.exit(1);
