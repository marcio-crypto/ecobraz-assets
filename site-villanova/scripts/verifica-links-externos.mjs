// Testa ao vivo os links externos que a auditoria marcou como 4XX, para separar
// link morto de bloqueio a robô.
//
// Uso: node verifica-links-externos.mjs [caminho-do-json]
//
// Por que existe: a auditoria de 01/09 listou 58 endereços externos com 4XX —
// 47 deles 403 e 6 deles 429, quase todos em eur-lex.europa.eu e outros sites
// da União Europeia. 403 e 429 não são link morto: são o site respondendo
// "não sirvo robôs" ou "devagar". Trocar uma citação legislativa por causa
// disso seria estragar a fonte por um falso positivo. 404 é outra história.
//
// O teste é feito duas vezes por endereço: primeiro como navegador comum
// (User-Agent do Chrome, Accept de página), depois sem cabeçalho nenhum. Se o
// primeiro passa e o segundo não, está provado que é filtro de robô e o link
// funciona para gente.
//
// Só leitura: não altera uma linha do site.
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2] || 'site-villanova/content/links-externos-4xx.json';

const NAVEGADOR = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const bate = async (url, headers) => {
  try {
    const r = await fetch(url, {headers, redirect: 'follow', signal: AbortSignal.timeout(25000)});
    return r.status;
  } catch (e) {
    return `erro: ${String(e.message || e).slice(0, 60)}`;
  }
};

const itens = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
console.log(`${itens.length} endereços externos a testar\n`);

const grupos = {vivo: [], bloqueio: [], morto: [], duvida: []};

for (const item of itens) {
  const comoNavegador = await bate(item.url, NAVEGADOR);
  const semNada = await bate(item.url, {});
  const ok = (s) => typeof s === 'number' && s >= 200 && s < 300;

  let veredito;
  if (ok(comoNavegador)) veredito = ok(semNada) ? 'vivo' : 'bloqueio';
  else if (comoNavegador === 404 || comoNavegador === 410) veredito = 'morto';
  else veredito = 'duvida';

  grupos[veredito].push({...item, navegador: comoNavegador, cru: semNada});
  const marca = {vivo: 'VIVO    ', bloqueio: 'BLOQUEIO', morto: 'MORTO   ', duvida: 'DÚVIDA  '}[veredito];
  console.log(`${marca} ahrefs=${item.status_ahrefs} navegador=${comoNavegador} cru=${semNada}  ${item.url.slice(0, 100)}`);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`VIVO (responde 200 de qualquer jeito): ${grupos.vivo.length}`);
console.log(`BLOQUEIO a robô (abre no navegador, recusa o cru): ${grupos.bloqueio.length}`);
console.log(`MORTO (404/410 até no navegador): ${grupos.morto.length}`);
console.log(`DÚVIDA (não abriu de nenhum jeito, mas não é 404): ${grupos.duvida.length}`);
console.log('='.repeat(70));

if (grupos.morto.length) {
  console.log('\nOs que precisam de troca de fonte:');
  grupos.morto.forEach((x) => console.log(`  [${x.navegador}] ${x.paginas} página(s)  ${x.url}`));
}
if (grupos.duvida.length) {
  console.log('\nOs que não abriram de nenhum jeito (conferir à mão antes de mexer):');
  grupos.duvida.forEach((x) => console.log(`  [nav ${x.navegador} / cru ${x.cru}] ${x.paginas} página(s)  ${x.url}`));
}
console.log('\nNada foi alterado — este script só lê.');
