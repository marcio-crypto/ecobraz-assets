// Teste E2E do formulário de contato (Web3Forms): preenche e envia ao vivo,
// confirma a resposta success e a mensagem de sucesso na tela.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://www.villanovaesg.com').replace(/\/$/, '');
const url = `${base}/solicitar-analise/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 1280, height: 1000}});
const page = await ctx.newPage();

let respostaWeb3 = null;
page.on('response', async (r) => {
  if (/api\.web3forms\.com\/submit/.test(r.url())) {
    try { respostaWeb3 = await r.json(); } catch { respostaWeb3 = {status: r.status()}; }
  }
});

await page.goto(url, {waitUntil: 'domcontentloaded'});
// fecha barra de cookies se estiver cobrindo
await page.locator('[data-consent-accept], .vn-consent button').first().click({timeout: 4000}).catch(() => {});
await page.waitForTimeout(500);

const existe = await page.locator('[data-intake-form]').count();
console.log(`formulário nativo presente em ${url}: ${existe ? 'SIM' : 'NÃO'}`);
if (!existe) { console.log('FALHA: formulário não encontrado'); await browser.close(); process.exit(1); }

await page.fill('#if-nome', 'TESTE AUTOMATIZADO — pode ignorar');
await page.fill('#if-email', 'teste@villanovaesg.com');
await page.fill('#if-empresa', 'Teste do formulário do site');
await page.fill('#if-msg', 'Envio de teste do formulário de contato (Web3Forms). Pode ignorar/excluir.');
await page.locator('.vn-form-consent input[type=checkbox]').check();
await page.locator('[data-intake-submit]').click();

// espera a resposta do web3forms e/ou a mensagem de sucesso
const ok = await page.locator('.vn-form-status.is-ok').waitFor({state: 'visible', timeout: 20000}).then(() => true).catch(() => false);
await page.waitForTimeout(1500);
const statusTxt = await page.locator('[data-intake-status]').textContent().catch(() => '');

console.log(`resposta Web3Forms: ${JSON.stringify(respostaWeb3)}`);
console.log(`mensagem na tela: "${(statusTxt || '').trim()}"`);
console.log(`=> ${ (respostaWeb3 && respostaWeb3.success) || ok ? 'FORMULÁRIO FUNCIONANDO (envio confirmado)' : 'FALHOU — verificar' }`);

await fs.mkdir('shots', {recursive: true});
await page.screenshot({path: 'shots/form-villanova.png', fullPage: true}).catch(() => {});
await browser.close();
if (!((respostaWeb3 && respostaWeb3.success) || ok)) process.exit(1);
