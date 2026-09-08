// Simula a JORNADA de entrada na Villanova ESG, não só o carregamento da página.
//
// Existe separado da auditoria-navegador.mjs porque testa comportamento, não
// conteúdo: o desvio automático de idioma e o banner de consentimento. Os dois
// agem nos primeiros segundos e são exatamente os dois primeiros segundos que
// aparecem numa gravação do Clarity.
//
// SEGUNDO DETALHE, DESCOBERTO DEPOIS E CARO: nada de isMobile. Com ele, este
// Chromium sem interface ignora a tela pedida (390x844 virou 500x1080) e o
// clique normal no banner de cookies falha por artefato da emulação — o que me
// fez quase relatar que o botão de aceitar não funcionava no celular. Não
// funcionava era o meu teste. A largura da janela basta: todo o CSS do tema
// decide por media query de largura.
//
// DETALHE QUE INVALIDA O TESTE SE FOR ESQUECIDO: o idioma-auto.js tem
// "if (navigator.webdriver) return;" — ou seja, ele NÃO desvia quando um robô
// abre a página. O Playwright é um robô. Sem falsear navigator.webdriver este
// teste diria "não há desvio" e estaria errado. Aqui ele é falseado de propósito
// via addInitScript, para reproduzir o que a pessoa vive.
import { chromium } from 'playwright';

const BASE = 'https://www.villanovaesg.com';
const navegador = await chromium.launch({ args: ['--no-sandbox'] });

const comoPessoa = async (opcoes) => {
  const ctx = await navegador.newContext(opcoes);
  // Sem isto o desvio de idioma não acontece e o teste mente.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  return ctx;
};

const relata = (t) => console.log(t);

// ---------------------------------------------------- 1. desvio automático de idioma
relata('\n============ 1. QUEM ABRE A HOME, ONDE CAI? ============');
relata('Cada teste é um visitante novo (sem nada guardado no navegador).\n');

for (const caso of [
  { nome: 'navegador em português do Brasil', locale: 'pt-BR' },
  { nome: 'navegador em italiano', locale: 'it-IT' },
  { nome: 'navegador em inglês', locale: 'en-US' },
  { nome: 'navegador em alemão', locale: 'de-DE' },
]) {
  const ctx = await comoPessoa({ locale: caso.locale, viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  const saltos = [];
  pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) saltos.push(f.url()); });
  try {
    await pg.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForTimeout(3000);
    relata(`${caso.nome}`);
    relata(`   caminho: ${saltos.join('  →  ')}`);
    relata(`   terminou em: ${pg.url()}`);
    relata(`   título na aba: ${await pg.title()}`);
    relata(`   lang do HTML: ${await pg.evaluate(() => document.documentElement.lang)}`);
    if (saltos.length > 2) relata(`   ⚠ ATENÇÃO: ${saltos.length} navegações — isso é um salto a mais do que o esperado.`);
  } catch (e) {
    relata(`${caso.nome}: FALHOU — ${e.message.slice(0, 160)}`);
  }
  await ctx.close();
}

// -------------------------------------------------- 2. o visitante que volta ao site
relata('\n\n============ 2. O VISITANTE QUE VOLTA ============');
relata('Guarda a preferência, fecha, e abre a home de novo — é o caso mais comum\ne o que mais aparece nas gravações, porque a gravação só existe depois do aceite.\n');
{
  const ctx = await comoPessoa({ locale: 'pt-BR', viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(2500);
  relata(`primeira visita terminou em: ${pg.url()}`);
  const guardado = await pg.evaluate(() => { try { return localStorage.getItem('vn-idioma'); } catch (e) { return '(bloqueado)'; } });
  relata(`preferência guardada: ${guardado}`);

  const saltos = [];
  pg.on('framenavigated', (f) => { if (f === pg.mainFrame()) saltos.push(f.url()); });
  await pg.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(2500);
  relata(`segunda visita — caminho: ${saltos.join('  →  ')}`);
  relata(`segunda visita terminou em: ${pg.url()}`);
  await ctx.close();
}

// --------------------------------------------- 3. banner de consentimento e Clarity
relata('\n\n============ 3. BANNER DE COOKIES E O PRÓPRIO CLARITY ============');
for (const tela of [
  { nome: 'celular', viewport: { width: 390, height: 844 } },
  { nome: 'desktop', viewport: { width: 1366, height: 768 } },
]) {
  const ctx = await comoPessoa({ locale: 'en-US', viewport: tela.viewport });
  const pg = await ctx.newPage();
  const pedidosClarity = [];
  pg.on('request', (r) => { if (r.url().includes('clarity.ms')) pedidosClarity.push(r.url().slice(0, 120)); });

  await pg.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(2500);

  const antes = await pg.evaluate(() => {
    const b = document.querySelector('.vn-consent');
    if (!b) return { existe: false };
    const r = b.getBoundingClientRect();
    // O que o banner está tapando no meio da sua própria área.
    const meio = document.elementFromPoint(Math.min(window.innerWidth - 2, r.left + r.width / 2), Math.min(window.innerHeight - 2, r.top + 4));
    return {
      existe: true,
      altura: Math.round(r.height),
      alturaTela: window.innerHeight,
      porcentoDaTela: Math.round((r.height / window.innerHeight) * 100),
      topo: Math.round(r.top),
      cobreLogoAbaixo: meio ? `${meio.tagName.toLowerCase()}.${String(meio.className || '').slice(0, 40)}` : '(nada)',
    };
  });

  relata(`\n${tela.nome}:`);
  if (!antes.existe) {
    relata('   banner NÃO apareceu — sem banner, o Clarity nunca carrega e a sessão nunca é gravada.');
  } else {
    relata(`   banner ocupa ${antes.altura}px de ${antes.alturaTela}px de tela = ${antes.porcentoDaTela}% da tela`);
    if (antes.porcentoDaTela >= 30) relata(`   ⚠ ATENÇÃO: o banner come ${antes.porcentoDaTela}% da tela. É muito para celular.`);
  }
  relata(`   pedidos ao clarity.ms ANTES do aceite: ${pedidosClarity.length} ${pedidosClarity.length === 0 ? '(correto — só depois do aceite)' : '(ERRADO — carregou sem consentimento)'}`);

  if (antes.existe) {
    try {
      await pg.click('.vn-consent .vn-ok', { timeout: 5000 });
      await pg.waitForTimeout(4000);
      const sumiu = await pg.evaluate(() => !document.querySelector('.vn-consent'));
      relata(`   depois de clicar em aceitar: banner ${sumiu ? 'sumiu (certo)' : 'CONTINUOU NA TELA (errado)'}`);
      relata(`   pedidos ao clarity.ms DEPOIS do aceite: ${pedidosClarity.length} ${pedidosClarity.length > 0 ? '(certo — a gravação começa aqui)' : '(ERRADO — o Clarity não carregou, a sessão não é gravada)'}`);
      for (const u of pedidosClarity.slice(0, 4)) relata(`       ${u}`);
    } catch (e) {
      relata(`   ✗ NÃO CONSEGUI CLICAR EM ACEITAR: ${e.message.slice(0, 120)}`);
    }
  }
  await ctx.close();
}

await navegador.close();
relata('\nFim da jornada.');
