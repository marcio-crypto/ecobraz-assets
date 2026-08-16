// Verifica ao vivo uma lista de URLs: status inicial, para onde vai e status final.
// Uso: node verifica-urls.mjs <caminho-do-json-com-lista-de-urls>
//
// Criado em 16/08/2026 para provar (e não estimar) que as 66 URLs listadas pelo
// Search Console em "Não encontrado (404)" passaram a resolver depois do envio
// do redirects-villanova.yaml pelo painel do Ghost.
//
// Sai com código 1 se qualquer URL terminar fora da faixa 200 — assim o
// workflow fica vermelho quando ainda houver link quebrado.
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2];
if (!ARQUIVO) throw new Error('Informe o caminho do JSON com a lista de URLs.');
const urls = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));

const ok = [];
const quebradas = [];
const semRedirect = [];

for (const url of urls) {
  let inicial = 0;
  let destino = url;
  let final = 0;
  try {
    // Primeiro sem seguir, para saber se existe 301 na porta de entrada.
    const r1 = await fetch(url, {redirect: 'manual'});
    inicial = r1.status;
    destino = r1.headers.get('location') || url;
    // Depois seguindo, para saber onde o visitante realmente para.
    const r2 = await fetch(url, {redirect: 'follow'});
    final = r2.status;
    destino = r2.url;
  } catch (e) {
    quebradas.push({url, erro: String(e.message || e)});
    console.log(`ERRO   ${url} -> ${e.message}`);
    continue;
  }

  const caminho = new URL(destino).pathname;
  if (final >= 200 && final < 300) {
    ok.push({url, inicial, destino: caminho});
    if (inicial >= 300 && inicial < 400) console.log(`OK ${inicial} ${new URL(url).pathname} -> ${caminho}`);
    else { console.log(`OK ${inicial} ${new URL(url).pathname} (respondeu direto, sem redirect)`); semRedirect.push(url); }
  } else {
    quebradas.push({url, inicial, final, destino: caminho});
    console.log(`FALHA ${inicial}/${final} ${new URL(url).pathname} -> ${caminho}`);
  }
}

console.log(`\nTotal: ${urls.length}`);
console.log(`Resolvem (final 2xx): ${ok.length}`);
console.log(`Ainda quebradas: ${quebradas.length}`);
if (semRedirect.length) console.log(`Respondem sem redirect (página existe no ar): ${semRedirect.length}`);
if (quebradas.length) {
  console.log('\nLista das que continuam quebradas:');
  quebradas.forEach((q) => console.log(`  ${q.url} (${q.inicial}/${q.final || '-'})`));
  process.exit(1);
}
console.log('\nRESULTADO: todas as URLs da lista resolvem em página 200.');
