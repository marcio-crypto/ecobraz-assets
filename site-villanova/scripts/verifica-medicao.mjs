// Prova, em navegador real, se a medição do villanovaesg.com dispara.
//
// O site aparece "zerado" no Google Analytics enquanto o Ahrefs (sem cookies)
// registra centenas de visitas. Este teste tira a dúvida: abre a home num
// Chromium de verdade, escuta TODAS as requisições de rede e reporta quais
// batedores de medição realmente saíram — GA4, Tag Manager, Ahrefs, Clarity.
//
// Depois clica em "aceitar" no banner de consentimento e mede de novo, para
// separar "não dispara nunca" de "só não dispara antes do aceite".
//
// Somente leitura: não envia formulário nem altera nada.
import {chromium} from 'playwright';

const BASE = process.argv[2] || 'https://www.villanovaesg.com';
const ALVOS = [
  ['GA4 (coleta)', /google-analytics\.com\/(g\/)?collect|analytics\.google\.com\/g\/collect/],
  ['GA4 (gtag.js)', /googletagmanager\.com\/gtag\/js/],
  ['Ahrefs Analytics', /analytics\.ahrefs\.com/],
  ['Microsoft Clarity', /clarity\.ms/],
];

const navegador = await chromium.launch();
const contexto = await navegador.newContext({locale: 'en-US'});
const pagina = await contexto.newPage();

const vistos = [];
pagina.on('request', (r) => vistos.push(r.url()));
const erros = [];
pagina.on('pageerror', (e) => erros.push(String(e.message || e).slice(0, 200)));
pagina.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text().slice(0, 200)); });

const conta = (re) => vistos.filter((u) => re.test(u)).length;
const relatorio = (titulo) => {
  console.log(`\n--- ${titulo} ---`);
  for (const [nome, re] of ALVOS) {
    const n = conta(re);
    console.log(`  ${nome.padEnd(20)} ${n > 0 ? 'DISPAROU (' + n + ')' : 'não disparou'}`);
  }
};

console.log(`Abrindo ${BASE}/ num Chromium real (locale en-US, IP dos EUA)…`);
await pagina.goto(`${BASE}/`, {waitUntil: 'networkidle', timeout: 45000});
await pagina.waitForTimeout(4000);
relatorio('ANTES de qualquer clique no banner');

// Estado do Consent Mode como o navegador realmente o montou.
const estado = await pagina.evaluate(() => {
  const dl = (window.dataLayer || []).map((a) => Array.from(a));
  const consent = dl.filter((a) => a[0] === 'consent');
  let guardado = null;
  try { guardado = localStorage.getItem('vn-consent'); } catch (e) {}
  return {
    temGtag: typeof window.gtag === 'function',
    tamanhoDataLayer: dl.length,
    chamadasConsent: consent.map((c) => JSON.stringify(c).slice(0, 300)),
    guardado,
    bannerVisivel: !!document.querySelector('.vn-consent'),
    textoBotaoAceitar: (document.querySelector('.vn-consent .vn-ok') || {}).textContent || null,
  };
});
console.log('\n--- ESTADO DO CONSENTIMENTO NO NAVEGADOR ---');
console.log('  função gtag definida:', estado.temGtag);
console.log('  itens no dataLayer:', estado.tamanhoDataLayer);
console.log('  escolha salva (vn-consent):', estado.guardado === null ? '(nenhuma)' : estado.guardado);
console.log('  banner visível:', estado.bannerVisivel, estado.textoBotaoAceitar ? `| botão: "${estado.textoBotaoAceitar}"` : '');
estado.chamadasConsent.forEach((c, i) => console.log(`  consent[${i}]: ${c}`));

// Agora aceita e mede de novo.
if (estado.bannerVisivel) {
  console.log('\nClicando em aceitar…');
  const antes = vistos.length;
  await pagina.click('.vn-consent .vn-ok');
  await pagina.waitForTimeout(5000);
  console.log(`  ${vistos.length - antes} requisições novas após o aceite`);
  relatorio('DEPOIS do aceite');
} else {
  console.log('\nBanner não apareceu — nada a aceitar.');
}

if (erros.length) {
  console.log('\n--- ERROS DE JAVASCRIPT NA PÁGINA ---');
  [...new Set(erros)].slice(0, 10).forEach((e) => console.log('  ' + e));
} else {
  console.log('\nNenhum erro de JavaScript na página.');
}

console.log('\n--- REQUISIÇÕES DE MEDIÇÃO OBSERVADAS (amostra) ---');
const medicao = vistos.filter((u) => /google-analytics|googletagmanager|ahrefs|clarity/.test(u));
[...new Set(medicao)].slice(0, 12).forEach((u) => console.log('  ' + u.slice(0, 150)));
if (!medicao.length) console.log('  NENHUMA. A página não chamou nenhum serviço de medição.');

await navegador.close();
