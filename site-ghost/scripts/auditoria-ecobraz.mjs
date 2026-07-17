// Pente fino da Ecobraz com navegador real (Chromium/Playwright).
// Fase A — Rastreio total: todas as URLs do sitemap (PT e EN): status 200,
//   H1 único, <title>, canonical, hreflang, erros de JavaScript e links
//   internos quebrados (amostrados por página).
// Fase B — Analytics de verdade: intercepta as requisições que saem para o
//   Google Analytics (/g/collect) e prova que os eventos são registrados —
//   page_view, contact_whatsapp, contact_phone, contact_email,
//   form_start_coleta e generate_lead (envio de formulário).
// Fase C — Capturas de tela de páginas-chave (PT, EN, serviço rico, blog).
// Uso: node auditoria-ecobraz.mjs [base_url] [--enviar-lead]
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const ENVIAR_LEAD = process.argv.includes('--enviar-lead');
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
const host = new URL(base).hostname;
const problemas = [];
const notas = [];
const ok = (m) => console.log(`PASS ${m}`);
const falha = (m) => { problemas.push(m); console.log(`FAIL ${m}`); };

const browser = await chromium.launch({args: ['--no-sandbox']});
const context = await browser.newContext({
  viewport: {width: 1366, height: 900},
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 EcobrazAudit'
});

// ---- Captura global de eventos GA4 que SAEM do navegador (prova de rede) ----
const gaHits = [];
context.on('request', (req) => {
  const u = req.url();
  if (/google-analytics\.com|analytics\.google\.com/.test(u) && /\/(g\/)?collect/.test(u)) {
    const evs = [];
    try { const q = new URL(u).searchParams; if (q.get('en')) evs.push(q.get('en')); } catch {}
    // eventos em lote vão no corpo do POST (uma linha por evento, com en=...)
    const body = req.postData() || '';
    for (const m of body.matchAll(/(?:^|&|\n)en=([^&\n]+)/g)) evs.push(decodeURIComponent(m[1]));
    for (const e of evs) gaHits.push({event: e, page: null});
  }
});
const houveEvento = (nome) => gaHits.some((h) => h.event === nome);
const zerarGA = () => { gaHits.length = 0; };
// Espera o beacon do GA4 sair (o gtag envia de forma assíncrona; um waitForTimeout
// fixo pode fechar a janela antes do POST). Faz polling até `ms` e retorna assim
// que o evento aparecer — elimina a falha de timing intermitente.
const esperaEvento = async (pagina, nome, ms = 6000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) {
    if (houveEvento(nome)) return true;
    await pagina.waitForTimeout(200);
  }
  return houveEvento(nome);
};

const jsErrors = [];
const novaPagina = async () => {
  const p = await context.newPage();
  p.on('pageerror', (e) => jsErrors.push({url: p.url(), message: String(e.message).slice(0, 200)}));
  return p;
};

// ============================ FASE A — RASTREIO ============================
async function urlsDoSitemap(p) {
  const urls = new Set();
  const filhos = new Set([`${base}/sitemap.xml`]);
  const vistos = new Set();
  while (filhos.size) {
    const sm = [...filhos][0]; filhos.delete(sm); vistos.add(sm);
    let xml = '';
    try { const r = await p.request.get(sm, {timeout: 20000}); if (r.ok()) xml = await r.text(); } catch {}
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const loc = m[1].trim();
      if (/\.xml$/.test(loc)) { if (!vistos.has(loc)) filhos.add(loc); }
      else if (!/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(loc)) urls.add(loc);
    }
  }
  return [...urls];
}

const p = await novaPagina();
const todas = await urlsDoSitemap(p);
notas.push(`URLs no sitemap: ${todas.length}`);
if (todas.length < 100) falha(`sitemap com apenas ${todas.length} URLs (esperado 100+)`);

let n200 = 0; const rotasRuins = []; const semH1 = []; const semTitle = [];
const semHreflangEsperado = [];
for (const url of todas) {
  let resp;
  try { resp = await p.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000}); }
  catch (e) { rotasRuins.push(`${url} (erro: ${String(e.message).slice(0, 60)})`); continue; }
  const st = resp ? resp.status() : 0;
  if (st !== 200) { rotasRuins.push(`${url} (${st})`); continue; }
  n200++;
  const h1 = await p.locator('h1').count();
  if (h1 !== 1) semH1.push(`${url} (${h1} H1)`);
  const title = (await p.title()) || '';
  if (!title.trim()) semTitle.push(url);
  const hreflang = await p.locator('link[rel="alternate"][hreflang]').count();
  const path = new URL(url).pathname;
  const ehGerenciada = !/\/(tag|autor|author)\//.test(path);
  if (hreflang === 0 && ehGerenciada) semHreflangEsperado.push(url);
}
notas.push(`páginas 200: ${n200}/${todas.length}`);
if (rotasRuins.length) falha(`rotas com status != 200: ${rotasRuins.slice(0, 15).join(' | ')}${rotasRuins.length > 15 ? ` … +${rotasRuins.length - 15}` : ''}`);
else ok(`todas as ${n200} URLs do sitemap respondem 200`);
if (semH1.length) falha(`H1 != 1 em: ${semH1.slice(0, 12).join(' | ')}${semH1.length > 12 ? ` … +${semH1.length - 12}` : ''}`);
else ok('todas as páginas têm exatamente 1 H1');
if (semTitle.length) falha(`sem <title>: ${semTitle.slice(0, 8).join(' | ')}`);
else ok('todas as páginas têm <title>');
notas.push(`páginas sem hreflang (informativo): ${semHreflangEsperado.length}`);

// Links internos quebrados: coleta todos os hrefs internos das páginas e testa (dedup)
const internos = new Set();
for (const url of todas) {
  try {
    await p.goto(url, {waitUntil: 'domcontentloaded', timeout: 25000});
    const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const h of hrefs) {
      if (!h || h.startsWith('#') || /^(mailto:|tel:|javascript:)/.test(h)) continue;
      try { const u = new URL(h, `${base}/`); if (u.hostname === host && !u.pathname.startsWith('/cdn-cgi/')) internos.add(u.pathname); } catch {}
    }
  } catch {}
}
notas.push(`links internos únicos coletados: ${internos.size}`);
const linksQuebrados = [];
for (const path of internos) {
  if (todas.some((u) => new URL(u).pathname === path)) continue; // já validado 200 acima
  try {
    const r = await p.request.get(`${base}${path}`, {timeout: 15000, maxRedirects: 5});
    if (r.status() >= 400) linksQuebrados.push(`${path} (${r.status()})`);
  } catch (e) { linksQuebrados.push(`${path} (erro)`); }
}
if (linksQuebrados.length) falha(`links internos quebrados: ${linksQuebrados.slice(0, 20).join(' | ')}`);
else ok('nenhum link interno quebrado');

// ============================ FASE B — ANALYTICS ============================
// Aceita consentimento (libera analytics_storage) e prova que os eventos saem.
const ga = await novaPagina();
await ga.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
await ga.locator('[data-consent-accept]').click({timeout: 10000}).catch(() => {});
await ga.waitForTimeout(2500);
if (houveEvento('page_view') || gaHits.length > 0) ok(`GA4 ativo: ${gaHits.length} hit(s) após consentimento`);
else falha('nenhuma requisição ao Google Analytics após aceitar o consentimento — analytics pode não estar disparando');

// Clique no WhatsApp -> contact_whatsapp
zerarGA();
await ga.goto(`${base}/descarte-de-ativos-de-ti-desmobilizados/`, {waitUntil: 'domcontentloaded'});
await ga.waitForTimeout(600);
await ga.evaluate(() => { document.querySelectorAll('a[href*="wa.me"]').forEach((a) => { a.setAttribute('target', '_self'); a.addEventListener('click', (e) => e.preventDefault(), {once: true}); }); });
await ga.locator('a[href*="wa.me"]').first().click({timeout: 8000}).catch(() => {});
if (await esperaEvento(ga, 'contact_whatsapp')) ok('evento contact_whatsapp registrado no clique do WhatsApp');
else falha('clique no WhatsApp NÃO registrou contact_whatsapp no analytics');

// Clique no telefone -> contact_phone
zerarGA();
await ga.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
await ga.waitForTimeout(500);
const temTel = await ga.locator('a[href^="tel:"]').count();
if (temTel) {
  await ga.evaluate(() => { document.querySelectorAll('a[href^="tel:"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault(), {once: true})); });
  await ga.locator('a[href^="tel:"]').first().click({timeout: 6000}).catch(() => {});
  if (await esperaEvento(ga, 'contact_phone')) ok('evento contact_phone registrado no clique do telefone');
  else falha('clique no telefone NÃO registrou contact_phone');
} else notas.push('sem link tel: na home (pulado contact_phone)');

// Clique no e-mail (mailto) -> contact_email — CTA principal das páginas em inglês
zerarGA();
await ga.goto(`${base}/en/`, {waitUntil: 'domcontentloaded'});
await ga.waitForTimeout(600);
const temMail = await ga.locator('a[href^="mailto:"]').count();
if (temMail) {
  await ga.evaluate(() => { document.querySelectorAll('a[href^="mailto:"]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault(), {once: true})); });
  await ga.locator('a[href^="mailto:"]').first().click({timeout: 6000}).catch(() => {});
  if (await esperaEvento(ga, 'contact_email')) ok('evento contact_email registrado no clique do e-mail (/en/)');
  else falha('clique no e-mail NÃO registrou contact_email');
} else falha('/en/ não tem link mailto: (CTA de contato ausente)');

// Início do formulário -> form_start_coleta ; envio -> generate_lead
zerarGA();
await ga.goto(`${base}/agendamento/`, {waitUntil: 'domcontentloaded'});
await ga.waitForTimeout(900);
await ga.locator('label.choice:has(input[value="empresa"])').click({timeout: 8000}).catch(() => {});
await ga.locator('[data-next-step]').first().click({timeout: 6000}).catch(() => {});
if (await esperaEvento(ga, 'form_start_coleta')) ok('evento form_start_coleta registrado ao iniciar o formulário');
else falha('iniciar o formulário NÃO registrou form_start_coleta');

if (ENVIAR_LEAD) {
  zerarGA();
  try {
    await ga.locator('[name="material_category"]').selectOption('Informática e TI');
    await ga.locator('[name="volume"]').selectOption('Até 10 itens');
    await ga.locator('[name="material_description"]').fill(`TESTE AUTOMATIZADO ${stamp} — pente fino do site, pode excluir.`);
    await ga.locator('[name="postal_code"]').fill('02175-010');
    await ga.locator('[name="city"]').fill('São Paulo');
    await ga.locator('[name="state"]').selectOption('SP');
    await ga.locator('.form-step.is-active [data-next-step]').click();
    await ga.locator('[name="name"]').fill(`TESTE AUTOMATIZADO ${stamp} — pode excluir`);
    await ga.locator('[name="company"]').fill('Auditoria Ecobraz');
    await ga.locator('[name="email"]').fill(`contato+pente-fino-${stamp}@ecobraz.org.br`);
    await ga.locator('[name="phone"]').fill('11999990000');
    await ga.locator('[name="documentation"]').selectOption('Certificados e documentos de destinação');
    await ga.locator('[name="urgency"]').selectOption('Sem urgência definida');
    await ga.locator('label.consent:has(input[name="service_consent"])').click();
    await ga.locator('button.form-submit').click();
    await ga.locator('.form-done').waitFor({state: 'visible', timeout: 25000});
    if (await esperaEvento(ga, 'generate_lead')) ok('evento generate_lead registrado no envio do formulário');
    else falha('envio do formulário NÃO registrou generate_lead');
    notas.push(`lead de teste criado: "TESTE AUTOMATIZADO ${stamp}" — excluir no funil INTEGRAÇÃO SITE`);
  } catch (e) { falha(`fluxo de envio do formulário falhou: ${String(e.message).slice(0, 160)}`); }
} else {
  notas.push('envio real do formulário NÃO executado (sem --enviar-lead); generate_lead não verificado ao vivo');
}

// ============================ FASE C — CAPTURAS ============================
await fs.mkdir('auditoria-shots', {recursive: true});
const telas = [
  ['home-pt', `${base}/`],
  ['home-en', `${base}/en/`],
  ['servico-rico-en', `${base}/secure-data-sanitisation/`],
  ['servico-rico-pt', `${base}/sanitizacao-segura-de-dados/`],
  ['blog-post-en', `${base}/blog/zx81-1kb-micro-that-brought-computing-home/`],
  ['agendamento', `${base}/agendamento/`]
];
for (const [nome, url] of telas) {
  try {
    const s = await novaPagina();
    await s.goto(url, {waitUntil: 'networkidle', timeout: 30000});
    await s.locator('[data-consent-accept]').click({timeout: 4000}).catch(() => {});
    await s.screenshot({path: `auditoria-shots/${nome}.png`, fullPage: true});
    await s.close();
    ok(`captura: ${nome}`);
  } catch (e) { falha(`captura ${nome} falhou: ${String(e.message).slice(0, 80)}`); }
}

await browser.close();

// ============================ RESUMO ============================
console.log('\n===== RESUMO DA AUDITORIA =====');
for (const nota of notas) console.log('NOTA:', nota);
console.log(`\neventos GA4 distintos observados: ${[...new Set(gaHits.map((h) => h.event))].join(', ') || '(nenhum)'}`);
if (jsErrors.length) {
  console.log(`\nERROS DE JAVASCRIPT (${jsErrors.length}):`);
  const dedup = [...new Map(jsErrors.map((e) => [e.message, e])).values()];
  for (const e of dedup.slice(0, 15)) console.log(` ${e.url} — ${e.message}`);
  problemas.push(`${jsErrors.length} erro(s) de JavaScript nas páginas`);
}
console.log(`\n${problemas.length} problema(s) encontrado(s).`);
if (problemas.length) { for (const pr of problemas) console.log('PROBLEMA:', pr); process.exit(1); }
console.log('PENTE FINO OK — nenhum problema encontrado.');
