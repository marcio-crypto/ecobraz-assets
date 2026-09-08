// Por que o clique em "aceitar" falhou no celular — e se falhou de verdade.
//
// Na auditoria de 08/09/2026 o clique em .vn-ok expirou no celular e funcionou
// no desktop. Isso pode significar duas coisas MUITO diferentes:
//
//   (a) o botão realmente não é alcançável num telefone, e nesse caso nenhuma
//       sessão de celular é gravada pelo Clarity nem medida pelo GA4, porque os
//       dois só ligam depois do aceite; ou
//   (b) a emulação de celular do teste não se aplicou e o erro é meu.
//
// A suspeita de (b) é concreta: aquele teste relatou window.innerHeight = 1080
// numa janela que eu havia pedido com 844 de altura. Enquanto isso não estiver
// explicado, nenhuma conclusão sobre o celular vale.
//
// Este script não conclui nada sozinho: ele imprime a medida bruta de cada
// tentativa — tamanho da janela, caixa do botão, o que está por cima do ponto
// central dele — e tenta clicar de três jeitos, para separar "não dá para
// clicar" de "o robô não conseguiu clicar".
import { chromium } from 'playwright';

const BASE = 'https://www.villanovaesg.com';
const navegador = await chromium.launch({ args: ['--no-sandbox'] });

const CASOS = [
  { nome: 'celular 390x844 com isMobile',    viewport: { width: 390, height: 844 }, isMobile: true,  hasTouch: true,  dsf: 3 },
  { nome: 'celular 390x844 SEM isMobile',    viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false, dsf: 1 },
  { nome: 'celular pequeno 360x640',         viewport: { width: 360, height: 640 }, isMobile: false, hasTouch: false, dsf: 1 },
  { nome: 'desktop 1366x768 (controle)',     viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, dsf: 1 },
];

for (const c of CASOS) {
  console.log(`\n================ ${c.nome} ================`);
  const ctx = await navegador.newContext({
    viewport: c.viewport,
    isMobile: c.isMobile,
    hasTouch: c.hasTouch,
    deviceScaleFactor: c.dsf,
    locale: 'en-US',
  });
  const pg = await ctx.newPage();
  const clarity = [];
  pg.on('request', (r) => { if (r.url().includes('clarity.ms')) clarity.push(r.url()); });

  await pg.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForTimeout(2000);

  const m = await pg.evaluate(() => {
    const out = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      viewportMeta: (document.querySelector('meta[name="viewport"]') || {}).content || '(nenhuma)',
    };
    const b = document.querySelector('.vn-consent');
    if (!b) { out.banner = null; return out; }
    const rb = b.getBoundingClientRect();
    const ok = b.querySelector('.vn-ok');
    const ro = ok ? ok.getBoundingClientRect() : null;
    out.banner = {
      topo: Math.round(rb.top), base: Math.round(rb.bottom),
      esq: Math.round(rb.left), dir: Math.round(rb.right),
      altura: Math.round(rb.height),
      dentroDaTela: rb.top >= 0 && rb.bottom <= window.innerHeight,
    };
    out.botaoOk = ro ? {
      topo: Math.round(ro.top), base: Math.round(ro.bottom),
      esq: Math.round(ro.left), dir: Math.round(ro.right),
      larg: Math.round(ro.width), alt: Math.round(ro.height),
      dentroDaTela: ro.top >= 0 && ro.bottom <= window.innerHeight && ro.left >= 0 && ro.right <= window.innerWidth,
      // Quem o navegador entrega se alguém tocar no centro do botão.
      quemRecebeOToque: (() => {
        const x = ro.left + ro.width / 2, y = ro.top + ro.height / 2;
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return '(centro fora da tela)';
        const el = document.elementFromPoint(x, y);
        if (!el) return '(nada)';
        return `${el.tagName.toLowerCase()}.${String(el.className || '').trim().slice(0, 40)}${el.classList.contains('vn-ok') ? '  <-- é o próprio botão' : '  <-- OUTRO ELEMENTO ESTÁ POR CIMA'}`;
      })(),
    } : null;
    return out;
  });

  console.log(`  janela: ${m.innerWidth}x${m.innerHeight}   dpr: ${m.dpr}`);
  console.log(`  meta viewport da página: ${m.viewportMeta}`);
  if (!m.banner) { console.log('  banner: NÃO EXISTE nesta carga'); await ctx.close(); continue; }
  console.log(`  banner: topo ${m.banner.topo} base ${m.banner.base} altura ${m.banner.altura} — dentro da tela: ${m.banner.dentroDaTela}`);
  if (m.botaoOk) {
    console.log(`  botão aceitar: ${m.botaoOk.larg}x${m.botaoOk.alt} em (${m.botaoOk.esq},${m.botaoOk.topo}) — dentro da tela: ${m.botaoOk.dentroDaTela}`);
    console.log(`  quem recebe o toque no centro do botão: ${m.botaoOk.quemRecebeOToque}`);
  } else {
    console.log('  botão aceitar: NÃO ENCONTRADO dentro do banner');
  }

  // Três tentativas, da mais parecida com uma pessoa à mais forçada.
  for (const t of [
    { nome: 'clique normal', fn: () => pg.click('.vn-consent .vn-ok', { timeout: 4000 }) },
    { nome: 'clique forçado (ignora o que estiver por cima)', fn: () => pg.click('.vn-consent .vn-ok', { timeout: 4000, force: true }) },
    { nome: 'clique por JavaScript', fn: () => pg.evaluate(() => document.querySelector('.vn-consent .vn-ok')?.click()) },
  ]) {
    const aindaTem = await pg.evaluate(() => !!document.querySelector('.vn-consent'));
    if (!aindaTem) { console.log(`  (banner já sumiu antes de "${t.nome}")`); break; }
    try {
      await t.fn();
      await pg.waitForTimeout(2500);
      const sumiu = await pg.evaluate(() => !document.querySelector('.vn-consent'));
      console.log(`  ${t.nome}: ${sumiu ? 'FUNCIONOU (banner sumiu)' : 'clicou mas o banner ficou'}`);
    } catch (e) {
      console.log(`  ${t.nome}: FALHOU — ${String(e.message).split('\n')[0]}`);
    }
  }

  await pg.waitForTimeout(2500);
  console.log(`  pedidos ao clarity.ms no fim: ${clarity.length}`);
  await ctx.close();
}

await navegador.close();
console.log('\nFim.');
