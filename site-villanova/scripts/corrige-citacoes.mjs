// Troca citações externas que morreram pelo substituto vivo, âncora incluída.
//
// Uso: node corrige-citacoes.mjs [simular|aplicar]
//
// Regra que guia este script: a âncora tem que continuar dizendo a verdade
// sobre a página do outro lado. Quando o substituto não é o mesmo documento —
// caso da ESPR, onde o plano de trabalho sumiu e sobrou a página do regulamento
// — trocar só o endereço deixaria a frase prometendo um documento que o leitor
// não vai encontrar. Por isso cada regra carrega também o par de textos.
//
// Cada substituto foi testado ao vivo antes de entrar no arquivo: 200, sem
// soft 404, com o título conferido. O motivo de cada troca está no JSON.
//
// Segurança: URL e texto são contados separadamente e relatados separadamente.
// Se o endereço trocar e a âncora não, isso aparece no relatório — é o sinal de
// que a âncora no conteúdo não é igual à que eu esperava, e aí é caso de olhar
// à mão em vez de deixar passar uma citação desencontrada.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';
const ARQUIVO = 'site-villanova/content/citacoes-mortas.json';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
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
const todas = (texto, agulha) => texto.split(agulha).length - 1;

const regras = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
console.log(`${regras.length} citações a corrigir | modo: ${MODO}\n`);

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

let totalUrl = 0, totalTexto = 0, totalItens = 0, erros = 0, desencontros = 0;

for (const tipo of ['pages', 'posts']) {
  const itens = await buscaTudo(tipo);
  console.log(`--- ${tipo}: ${itens.length} itens ---`);
  for (const it of itens) {
    let texto = it.lexical || '';
    if (!texto) continue;
    let nUrl = 0, nTexto = 0;
    const detalhe = [];

    for (const regra of regras) {
      const u = todas(texto, regra.de_url);
      if (!u) continue;
      texto = texto.split(regra.de_url).join(regra.para_url);
      nUrl += u;
      let t = 0;
      for (const par of regra.textos || []) {
        const c = todas(texto, par.de);
        if (!c) continue;
        texto = texto.split(par.de).join(par.para);
        t += c;
      }
      nTexto += t;
      // Regra com âncora declarada que trocou endereço e não trocou texto:
      // a frase pode ter ficado prometendo um documento que nao esta mais la.
      if ((regra.textos || []).length && !t) {
        detalhe.push(`ATENÇÃO: endereço trocado (${u}x) mas nenhuma âncora conferiu — conferir à mão`);
        desencontros++;
      }
    }

    if (!nUrl) continue;
    totalItens++; totalUrl += nUrl; totalTexto += nTexto;
    console.log(`  /${it.slug}/  [${it.status}]  ${nUrl} endereço(s), ${nTexto} âncora(s)`);
    detalhe.forEach((d) => console.log(`      ${d}`));
    if (MODO === 'aplicar') {
      try {
        await api('PUT', `${tipo}/${it.id}/`, {[tipo]: [{lexical: texto, updated_at: it.updated_at}]});
        await espera(150);
      } catch (e) {
        erros++;
        console.log(`      ERRO ao gravar: ${e.message}`);
      }
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${totalUrl} endereço(s) e ${totalTexto} âncora(s) em ${totalItens} itens`);
console.log(`erros: ${erros} | endereço trocado sem âncora correspondente: ${desencontros}`);
console.log('='.repeat(70));
if (MODO === 'simular') console.log('\nMODO SIMULAR — nada foi gravado.');
if (erros) process.exit(1);
