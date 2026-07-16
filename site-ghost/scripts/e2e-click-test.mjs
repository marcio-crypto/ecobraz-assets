// Teste de cliques de ponta a ponta com navegador real (Chromium/Playwright):
// navegação, consentimento, links internos, WhatsApp, mini-formulário do hero,
// formulário completo (lead rotulado de teste), FAQ das landings e menu mobile.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
const WHATSAPP = 'https://wa.me/5511912728412';
const failures = [];
const notes = [];
let shots = 0;

const browser = await chromium.launch({args: ['--no-sandbox']});
const context = await browser.newContext({viewport: {width: 1366, height: 900}, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 EcobrazE2E'});
const page = await context.newPage();
const jsErrors = [];
page.on('pageerror', (error) => jsErrors.push({url: page.url(), message: String(error.message).slice(0, 200)}));

async function check(label, fn) {
  try {
    await fn();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures.push(`${label}: ${String(error.message).slice(0, 300)}`);
    console.log(`FAIL ${label} — ${String(error.message).slice(0, 300)}`);
    try { await fs.mkdir('e2e-shots', {recursive: true}); await page.screenshot({path: `e2e-shots/fail-${++shots}.png`, fullPage: false}); } catch {}
  }
}
const assert = (condition, message) => { if (!condition) throw new Error(message); };

// 1. Home + banner de consentimento
await check('home carrega com H1 único', async () => {
  await page.goto(`${base}/`, {waitUntil: 'domcontentloaded', timeout: 30000});
  assert(await page.locator('h1').count() === 1, 'H1 diferente de 1');
});
await check('banner de consentimento aparece, aceita e some', async () => {
  const bar = page.locator('[data-consent-bar]');
  await bar.waitFor({state: 'visible', timeout: 8000});
  await page.locator('[data-consent-accept]').click();
  await bar.waitFor({state: 'hidden', timeout: 4000});
});
await check('escolha de consentimento persiste após recarregar', async () => {
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(1500);
  assert(await page.locator('[data-consent-bar]').isHidden(), 'banner voltou a aparecer');
});
await check('link "Preferências de cookies" reabre o banner', async () => {
  await page.locator('[data-consent-open]').first().click();
  await page.locator('[data-consent-bar]').waitFor({state: 'visible', timeout: 4000});
  await page.locator('[data-consent-accept]').click();
});

// 2. Todos os links internos da home (navegação renderizada)
await check('todos os links internos da home abrem com H1', async () => {
  await page.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
  const baseHost = new URL(base).hostname;
  const internal = [...new Set(hrefs
    .filter((h) => h && !h.startsWith('#') && !h.startsWith('mailto:') && !h.startsWith('tel:') && !h.startsWith('javascript:'))
    .map((h) => { try { const u = new URL(h, `${base}/`); return u.hostname === baseHost ? u.pathname : null; } catch { return null; } })
    .filter((h) => h && h.startsWith('/')))];
  const broken = [];
  for (const path of internal) {
    const response = await page.goto(`${base}${path}`, {waitUntil: 'domcontentloaded', timeout: 30000});
    const ok = response && response.status() === 200 && await page.locator('h1').count() >= 1;
    if (!ok) broken.push(`${path} (${response ? response.status() : 'sem resposta'})`);
  }
  notes.push(`links internos da home visitados: ${internal.length}`);
  assert(broken.length === 0, `quebrados: ${broken.join(', ')}`);
});

// 3. WhatsApp em páginas-chave
await check('links de WhatsApp corretos e alcançáveis', async () => {
  const pagesToCheck = ['/', '/agendamento/', '/descarte-de-ativos-de-ti-desmobilizados/'];
  for (const path of pagesToCheck) {
    await page.goto(`${base}${path}`, {waitUntil: 'domcontentloaded'});
    const links = await page.$$eval('a[href*="wa.me"]', (as) => as.map((a) => a.href));
    assert(links.length > 0, `${path}: nenhum link de WhatsApp`);
    for (const href of links) assert(href.startsWith(WHATSAPP), `${path}: WhatsApp inesperado ${href}`);
  }
  const reach = await page.request.get(WHATSAPP, {timeout: 15000});
  assert(reach.status() < 400, `wa.me respondeu ${reach.status()}`);
});

// 4. Mini-formulário do hero da home → /agendamento/ com pré-preenchimento
await check('mini-formulário do hero pré-preenche o agendamento', async () => {
  await page.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
  await page.locator('#hx-material').selectOption('Baterias');
  await page.locator('#hx-local').fill('02175-010');
  await page.locator('.hx-quote button[type="submit"]').click();
  await page.waitForURL('**/agendamento/**', {timeout: 15000});
  await page.waitForTimeout(1200);
  assert(await page.locator('[name="profile"][value="empresa"]').isChecked(), 'perfil empresa não pré-selecionado');
  assert(await page.locator('[name="material_category"]').inputValue() === 'Baterias', 'material não pré-selecionado');
});

// 5. Declaração hospitalar condicional (o campo fica na etapa 2 do formulário,
// então é preciso avançar a etapa de perfil antes de mexer no seletor de material)
await check('checkbox de declaração hospitalar aparece e some', async () => {
  await page.goto(`${base}/agendamento/?perfil=empresa`, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(800);
  await page.locator('.form-step.is-active [data-next-step]').click();
  const declaration = page.locator('[data-hospital-declaration]');
  await page.locator('[name="material_category"]').selectOption('Equipamentos hospitalares');
  assert(await declaration.isVisible(), 'declaração não apareceu para hospitalares');
  await page.locator('[name="material_category"]').selectOption('Informática e TI');
  assert(await declaration.isHidden(), 'declaração não sumiu ao trocar de categoria');
});

// 6. Formulário completo com lead rotulado (cria registro real no CRM!)
await check('formulário completo envia e mostra a tela de sucesso', async () => {
  await page.goto(`${base}/agendamento/`, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(800);
  await page.locator('label.choice:has(input[value="empresa"])').click();
  await page.locator('[data-next-step]').first().click();
  await page.locator('[name="material_category"]').selectOption('Informática e TI');
  await page.locator('[name="volume"]').selectOption('Até 10 itens');
  await page.locator('[name="material_description"]').fill(`TESTE AUTOMATIZADO ${stamp} — teste de cliques do site, pode excluir.`);
  await page.locator('[name="postal_code"]').fill('02175-010');
  await page.locator('[name="city"]').fill('São Paulo');
  await page.locator('[name="state"]').selectOption('SP');
  await page.locator('.form-step.is-active [data-next-step]').click();
  await page.locator('[name="name"]').fill(`TESTE AUTOMATIZADO ${stamp} — pode excluir`);
  await page.locator('[name="company"]').fill('Teste Cliques Ecobraz');
  await page.locator('[name="email"]').fill(`contato+teste-clique-${stamp}@ecobraz.org.br`);
  await page.locator('[name="phone"]').fill('11999990000');
  await page.locator('[name="documentation"]').selectOption('Certificados e documentos de destinação');
  await page.locator('[name="urgency"]').selectOption('Sem urgência definida');
  await page.locator('label.consent:has(input[name="service_consent"])').click();
  await page.locator('button.form-submit').click();
  await page.locator('.form-done').waitFor({state: 'visible', timeout: 20000});
  const text = await page.locator('.form-done').innerText();
  assert(/Solicita[çc][aã]o recebida/i.test(text), 'texto de sucesso ausente');
  notes.push(`lead de teste criado: "TESTE AUTOMATIZADO ${stamp}" (excluir no funil INTEGRAÇÃO SITE)`);
});

// 7. Landing: FAQ sanfona e âncora "Como funciona"
await check('FAQ da landing abre e fecha; âncora funciona', async () => {
  await page.goto(`${base}/descarte-de-ativos-de-ti-desmobilizados/`, {waitUntil: 'domcontentloaded'});
  const faq = page.locator('.hx-faq details').first();
  await faq.locator('summary').click();
  assert(await faq.getAttribute('open') !== null, 'FAQ não abriu');
  await faq.locator('summary').click();
  assert(await page.locator('#como-funciona').count() === 1, 'âncora #como-funciona ausente');
  assert(await page.locator('.hx-wa-float').isVisible(), 'botão flutuante de WhatsApp ausente');
});

// 8. Menu mobile
await check('menu mobile abre no toque', async () => {
  const mobile = await browser.newContext({viewport: {width: 390, height: 844}, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 EcobrazE2E'});
  const m = await mobile.newPage();
  await m.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
  await m.locator('[data-consent-accept]').click({timeout: 8000}).catch(() => {});
  await m.locator('[data-nav-toggle]').click();
  const opened = await m.locator('[data-nav].is-open').count();
  await mobile.close();
  assert(opened === 1, 'menu não abriu');
});

await browser.close();

console.log('\n== RESUMO ==');
for (const note of notes) console.log('NOTA:', note);
if (jsErrors.length) { console.log('ERROS DE JAVASCRIPT NAS PÁGINAS:'); for (const e of jsErrors) console.log(` ${e.url} — ${e.message}`); }
if (failures.length || jsErrors.length) {
  console.log(`\n${failures.length} falha(s), ${jsErrors.length} erro(s) de JS.`);
  process.exit(1);
}
console.log('Todos os testes de clique passaram.');
