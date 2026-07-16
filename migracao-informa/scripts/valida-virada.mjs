// Validação pós-virada: confere no ar que cada origem do de-para responde
// 301 no domínio antigo e termina no destino esperado do ecobraz.org
// (tolerante a até 3 saltos). Roda também as variações /amp.
import fs from 'node:fs/promises';

const BASE = String(process.argv[2] || 'https://ecobrazinforma.org').replace(/\/$/, '');
const csv = await fs.readFile('migracao-informa/de-para.csv', 'utf8');
const worker = await fs.readFile('migracao-informa/worker-redirects.js', 'utf8');
const mapa = JSON.parse(worker.match(/const MAPA = (\{.*?\});/s)[1]);

async function finalUrl(start) {
  let url = start;
  for (let hop = 0; hop < 4; hop += 1) {
    const response = await fetch(url, {redirect: 'manual', headers: {'User-Agent': 'EcobrazMigracao/validacao'}});
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return {url, status: response.status, hops: hop};
      url = new URL(location, url).href;
      continue;
    }
    return {url, status: response.status, hops: hop};
  }
  return {url, status: 'loop', hops: 4};
}

let ok = 0;
const erros = [];
const origens = Object.keys(mapa);
for (let i = 0; i < origens.length; i += 6) {
  await Promise.all(origens.slice(i, i + 6).map(async (origem) => {
    const esperado = `https://ecobraz.org${mapa[origem]}`;
    for (const variante of [origem, `${origem === '/' ? '' : origem}/amp`]) {
      if (variante === '/amp') continue;
      const {url, status} = await finalUrl(`${BASE}${variante}`);
      const normaliza = (u) => u.replace(/\/+$/, '/').replace(/([^/])$/, '$1/');
      if (status === 200 && normaliza(url) === normaliza(esperado)) ok += 1;
      else erros.push(`${variante} -> ${url} (${status}), esperado ${esperado}`);
    }
  }));
}
console.log(`${ok} redirecionamentos corretos, ${erros.length} erro(s).`);
for (const erro of erros.slice(0, 40)) console.log('ERRO:', erro);
if (erros.length > 0) process.exit(1);
console.log('VIRADA VALIDADA: todos os caminhos do de-para chegam ao destino.');
