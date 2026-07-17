// Verifica se o Google Tag Gateway (medição first-party via Cloudflare) está
// ativo no ecobraz.org: registra de onde a tag carrega e para onde os hits de
// medição (/g/collect, /gtag/js) são enviados — domínio próprio vs. Google.
import {chromium} from 'playwright';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const host = new URL(base).host;
const browser = await chromium.launch();
const ctx = await browser.newContext();
const reqs = [];
ctx.on('request', (r) => {
  const u = r.url();
  if (/gtag\/js|\/g\/collect|googletagmanager|google-analytics|\/gtm\.js|\/gtag\/destination/.test(u)) {
    reqs.push(u);
  }
});
const p = await ctx.newPage();
await p.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
await p.locator('[data-consent-accept]').click({timeout: 10000}).catch(() => {});
await p.waitForTimeout(4000);
// Navega para uma segunda página para gerar mais hits de medição
await p.goto(`${base}/descarte-de-ativos-de-ti-desmobilizados/`, {waitUntil: 'domcontentloaded'}).catch(() => {});
await p.waitForTimeout(3000);

const primeiraParte = (u) => { try { return new URL(u).host === host; } catch { return false; } };
const loader = reqs.filter((u) => /gtag\/js|gtm\.js/.test(u));
const collect = reqs.filter((u) => /\/g\/collect/.test(u));

const resumo = (lista) => {
  const hosts = {};
  for (const u of lista) { const h = (() => { try { return new URL(u).host; } catch { return '?'; } })(); hosts[h] = (hosts[h] || 0) + 1; }
  return Object.entries(hosts).map(([h, n]) => `${h} (${n})`).join(', ') || '(nenhum)';
};

console.log(`Site: ${base}`);
console.log(`\n--- Carregamento da tag (gtag.js) ---`);
console.log(`  hosts: ${resumo(loader)}`);
console.log(`  first-party (${host}): ${loader.some(primeiraParte) ? 'SIM' : 'não'}`);
console.log(`\n--- Envio de medição (/g/collect) ---`);
console.log(`  hosts: ${resumo(collect)}`);
console.log(`  first-party (${host}): ${collect.some(primeiraParte) ? 'SIM' : 'não'}`);

const ativo = loader.some(primeiraParte) || collect.some(primeiraParte);
console.log(`\n=> Google Tag Gateway roteando pelo domínio próprio: ${ativo ? 'SIM (first-party ativo)' : 'AINDA NÃO (medição saindo pelos domínios do Google)'}`);
console.log(`Total de requisições de tag/medição observadas: ${reqs.length}`);
await browser.close();
