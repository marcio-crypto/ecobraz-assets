// Verifica ao vivo: (1) o menu em inglês está horizontal (display:flex) no
// desktop; (2) o link da ONU aponta para a base (esango.un.org/civilsociety/).
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
const p = await ctx.newPage();

// 1. Página EN: menu deve estar em flex (horizontal)
await p.goto(`${base}/en/`, {waitUntil: 'domcontentloaded'});
await p.waitForTimeout(800);
const navInfo = await p.evaluate(() => {
  const ul = document.querySelector('.primary-nav ul.only-en');
  if (!ul) return {achou: false};
  const cs = getComputedStyle(ul);
  const itens = [...ul.querySelectorAll('li a')].map((a) => a.textContent.trim());
  const rects = [...ul.querySelectorAll('li')].map((li) => Math.round(li.getBoundingClientRect().top));
  const linhasDistintas = new Set(rects).size; // 1 = todos na mesma linha (horizontal)
  return {achou: true, display: cs.display, itens, linhas: linhasDistintas};
});
console.log('MENU EN:', JSON.stringify(navInfo));
console.log(`  -> display=${navInfo.display} | itens em ${navInfo.linhas} linha(s) => ${navInfo.display === 'flex' && navInfo.linhas === 1 ? 'HORIZONTAL OK' : 'AINDA TORTO'}`);
await fs.mkdir('shots', {recursive: true});
await p.locator('header.site-header').screenshot({path: 'shots/menu-en.png'}).catch(() => p.screenshot({path: 'shots/menu-en.png'}));

// 2. Home: link da ONU
await p.goto(`${base}/`, {waitUntil: 'domcontentloaded'});
const onu = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a[href*="esango.un.org"]')][0];
  return a ? {href: a.href, texto: a.textContent.trim()} : null;
});
console.log('LINK ONU:', JSON.stringify(onu));
const okOnu = onu && /esango\.un\.org\/civilsociety\/$/.test(onu.href);
console.log(`  -> ${okOnu ? 'aponta para a base da ONU OK' : 'href inesperado'}`);

await browser.close();
