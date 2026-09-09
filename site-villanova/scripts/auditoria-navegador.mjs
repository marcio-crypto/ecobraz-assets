// Auditoria da Villanova ESG num navegador de verdade (Chromium via Playwright).
//
// POR QUE ESTE ARQUIVO EXISTE. Em 08/09/2026 o Marcio mandou uma gravação do
// Microsoft Clarity dizendo que o site estava "cheio de erros". Uma gravação do
// Clarity não abre fora da conta dele, e o ambiente onde eu rodo tem o domínio
// bloqueado por política de saída. Então em vez de adivinhar pelo código, este
// script ABRE o site publicado no mesmo motor que a pessoa usou (Chromium) e
// anota o que de fato quebra.
//
// O que ele mede, e por que cada coisa aparece numa gravação do Clarity:
//   erro de JavaScript ....... o Clarity marca a sessão com "JS error"
//   requisição falhada ....... imagem/script que não carrega = buraco na tela
//   rolagem horizontal ....... no celular vira aquele arrasta-para-o-lado
//   imagem quebrada .......... ícone de imagem partida na gravação
//   clique morto (candidato) . o que parece botão e não faz nada = "dead click",
//                              e repetido vira "rage click"
//   link interno 4xx/5xx ..... a pessoa clica e cai em erro
//
// TAMANHO IMPORTA, E EU ERREI ISSO NA PRIMEIRA VERSÃO. O site tem mais de 500
// URLs. Varrer todas em duas telas leva mais de uma hora e o workflow morre no
// tempo limite — e como a primeira versão só imprimia o relatório NO FIM, morrer
// no limite significava perder tudo. Agora: (a) há um limite de páginas, com as
// páginas institucionais antes dos posts, e (b) cada página é relatada assim que
// termina. Se der tempo limite no meio, o que já foi medido está no log.
//
// O QUE ELA JÁ ENCONTROU (08/09/2026, 24 páginas x 3 telas = 72 carregamentos):
// zero erro de JavaScript, zero requisição falhada, zero imagem quebrada, zero
// link interno quebrado — e 48 de 72 com ROLAGEM HORIZONTAL. Os 48 são as 24
// páginas nas duas telas de celular; nenhuma no desktop. Sempre os mesmos
// 508px de conteúdo, em toda página, porque a causa está no cabeçalho:
//
//   <div class="top-right">      227px → 508px
//   <a class="top-cta only-en">  285px → 508px   "Submit a buyer request"
//
// .topbar .wrap é flex com space-between e NÃO TEM regra de celular — o bloco
// @media(max-width:900px) do main.css só esconde nav.main e .brand-tag. O botão
// tem white-space:nowrap, então não quebra nem encolhe. E era a ÚNICA causa:
// eu também acusei os SVGs decorativos, e estava errado — .h2arc (home/pt/it) e
// o svg .mark do page.hbs já ficam dentro de seções com overflow:hidden
// (.hero em main.css:45, .article-head em v2.css:87). Eles passam da tela sem
// esticar o documento. Foi esta ferramenta que me induziu ao erro, listando
// "passa da tela" como se fosse "causa a rolagem"; agora ela separa os dois.
//
// Uso: node auditoria-navegador.mjs [url1 url2 ...]
//      Sem argumentos, lê o sitemap e respeita LIMITE_PAGINAS (padrão 24).
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://www.villanovaesg.com';
const PASTA = process.env.PASTA_SAIDA || 'auditoria-navegador';
fs.mkdirSync(PASTA, { recursive: true });

// NÃO PONHA isMobile DE VOLTA AQUI. Medido em 08/09/2026 pelo
// diag-banner-celular.mjs: com isMobile:true neste Chromium sem interface a
// tela pedida É IGNORADA — pedi 390x844 e a janela virou 500x1080, e um clique
// normal no banner de cookies passou a falhar por causa disso. A primeira
// rodada desta auditoria mediu o celular a 500x1080 sem eu perceber, e o
// "zero rolagem horizontal no celular" que ela produziu não valia nada.
//
// Sem isMobile a tela é respeitada (conferido: 390x844 e 360x640 saem certos).
// O que decide rolagem lateral e quebra de layout aqui é a LARGURA da janela,
// porque todo o CSS do tema usa media query de largura — nada depende de
// touch nem do user agent.
// 1024 esta aqui de proposito: e o limite superior da faixa em que o menu
// sanfona passa a valer, e a auditoria nao testava nenhuma largura entre 901 e
// 1024 — justamente a faixa que a mudanca do menu criou. iPad deitado.
const TELAS = [
  { nome: 'celular', viewport: { width: 390, height: 844 }, movel: true },
  { nome: 'celular pequeno', viewport: { width: 360, height: 640 }, movel: true },
  // Tablet EM PE entrou em 09/09/2026 porque era um buraco de medicao: entre
  // 701px e 980px nao havia nenhuma tela na lista, e e justamente a faixa onde
  // a regra de tabela do celular (max-width:700px) ja nao vale e a barra lateral
  // do artigo ainda esta escondida (max-width:980px).
  { nome: 'tablet em pe', viewport: { width: 768, height: 1024 }, movel: false },
  { nome: 'tablet deitado', viewport: { width: 1024, height: 768 }, movel: false },
  { nome: 'desktop', viewport: { width: 1366, height: 768 }, movel: false },
];

// ---------------------------------------------------------------- lista de páginas
const LIMITE = Number(process.env.LIMITE_PAGINAS || 24);
let TOTAL_URLS = 0;

const doSitemap = async (mapa) => {
  const out = [];
  try {
    const r = await fetch(`${BASE}/${mapa}`, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.log(`aviso: ${mapa} respondeu ${r.status}`); return out; }
    for (const m of (await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) out.push(m[1].trim());
  } catch (e) { console.log(`aviso: não consegui ler ${mapa}: ${e.message}`); }
  return out;
};

const paginas = async () => {
  if (process.argv.length > 2) return process.argv.slice(2);

  const inst = await doSitemap('sitemap-pages.xml');
  const posts = await doSitemap('sitemap-posts.xml');
  console.log(`Sitemap: ${inst.length} páginas institucionais, ${posts.length} posts.`);

  // COTA GARANTIDA PARA POST, E ESTA E UMA CORRECAO DE ERRO GRAVE. Antes a
  // conta era inst.slice(0, LIMITE) e so DEPOIS sobrava vaga para post. Com 44
  // paginas institucionais no sitemap e o limite padrao de 24, sobrava ZERO:
  // nenhum post entrava, e o template post.hbs — que serve 188 das 232 URLs do
  // site — nunca foi auditado uma vez sequer. O relatorio dizia "24 paginas" e
  // parecia amostra do site; era amostra so das paginas institucionais.
  // Agora pelo menos um terco da amostra e reservado a post, e o log diz
  // quantos de cada tipo entraram.
  const cotaPosts = posts.length ? Math.max(1, Math.floor(LIMITE / 3)) : 0;
  const cotaInst = LIMITE - cotaPosts;
  const escolhidas = inst.slice(0, cotaInst);
  if (cotaPosts) {
    const passo = Math.max(1, Math.floor(posts.length / cotaPosts));
    for (let i = 0; i < posts.length && escolhidas.length < LIMITE; i += passo) escolhidas.push(posts[i]);
  }
  const nInst = Math.min(inst.length, cotaInst);
  console.log(`Amostra: ${nInst} página(s) institucional(is) + ${escolhidas.length - nInst} post(s).`);
  TOTAL_URLS = inst.length + posts.length;
  if (inst.length + posts.length > LIMITE) {
    console.log(`ATENÇÃO: existem ${inst.length + posts.length} URLs e o limite desta rodada é ${LIMITE}.`);
    console.log('Isto NÃO é uma varredura completa do site. É uma amostra.');
  }
  return escolhidas;
};

// ------------------------------------------------------------- checagem de uma tela
async function auditaPagina(navegador, url, tela) {
  const ctx = await navegador.newContext({
    viewport: tela.viewport,
    locale: 'en-US',
    userAgent: tela.movel
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
  });

  const achados = { erros: [], console: [], rede: [], navegacao: null };
  const pg = await ctx.newPage();

  pg.on('pageerror', (e) => achados.erros.push(String(e && e.message || e).slice(0, 300)));
  pg.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    // O aviso de cookie de terceiro do próprio Google/Clarity polui e não é do site.
    if (/third-party cookie|SameSite|Tracking Prevention/i.test(t)) return;
    achados.console.push(`[${m.type()}] ${t.slice(0, 300)}`);
  });
  pg.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    if (/ERR_ABORTED/.test(err)) return; // navegação cancelada por redirect, não é falha
    achados.rede.push(`FALHOU ${r.url().slice(0, 160)} — ${err}`);
  });
  pg.on('response', (r) => {
    if (r.status() >= 400) achados.rede.push(`HTTP ${r.status()} ${r.url().slice(0, 160)}`);
  });

  let resposta = null;
  try {
    resposta = await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForTimeout(1800); // deixa o JS de consentimento/idioma agir
  } catch (e) {
    // Em campo separado: somado a "erros", a falha de rede aparecia no resumo
    // como se fosse erro de JavaScript da pagina, que e outra coisa.
    achados.navegacao = `NAVEGAÇÃO FALHOU: ${e.message.slice(0, 200)}`;
    const r = { url, tela: tela.nome, status: 0, ...achados };
    try { await ctx.close(); } catch (e2) {}
    return r;
  }

  // A medição fica em try/catch e o fechamento do contexto acontece depois, no
  // caminho normal: antes, se o evaluate lançasse, a exceção subia, o contexto
  // do navegador ficava aberto e uma varredura longa ia acumulando processos.
  // Agora a página entra no relatório com "MEDIÇÃO FALHOU" em vez de sumir.
  let medidas = {};
  try {
    medidas = await pg.evaluate(() => {
      const out = {};
      const de = document.documentElement;

      // Rolagem horizontal e quem a causa.
      const larguraVisivel = window.innerWidth;
      out.scrollWidth = de.scrollWidth;
      out.innerWidth = larguraVisivel;
      // PASSAR DA TELA NAO E O MESMO QUE CAUSAR ROLAGEM. Esta distincao custou
      // caro em 08/09/2026: a lista acusava os SVGs decorativos (.h2arc, .mark)
      // como culpados, e eu acreditei e escrevi uma regra de overflow para eles.
      // Os dois ja estavam dentro de secoes com overflow:hidden — passavam da
      // tela, sim, mas nao esticavam o documento em um pixel. A causa real era
      // so o cabecalho. Agora quem tem ancestral que corta entra em "contidos",
      // separado, e nunca mais e apresentado como culpado.
      const cortaOEixoX = (el) => {
        const o = getComputedStyle(el).overflowX;
        return o === 'hidden' || o === 'clip' || o === 'auto' || o === 'scroll';
      };
      out.vazandoLado = [];
      out.vazandoContido = [];
      if (de.scrollWidth > larguraVisivel + 1) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right <= larguraVisivel + 1 && r.left >= -1) continue;
          let contidoPor = null;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (cortaOEixoX(p)) { contidoPor = `${p.tagName.toLowerCase()}.${String(p.className || '').trim().slice(0, 40)}`; break; }
          }
          const item = {
            tag: el.tagName.toLowerCase(),
            classe: (el.className && String(el.className).slice(0, 60)) || '',
            esq: Math.round(r.left), dir: Math.round(r.right), larg: Math.round(r.width),
            texto: (el.textContent || '').trim().slice(0, 50),
            contidoPor,
          };
          (contidoPor ? out.vazandoContido : out.vazandoLado).push(item);
        }
        out.vazandoLado = out.vazandoLado.slice(0, 12);
        out.vazandoContido = out.vazandoContido.slice(0, 6);

        // QUEM NAO ENCOLHE. A lista acima nao basta, e isso apareceu em
        // 09/09/2026 nos dois posts que sobraram com rolagem: ela mostrou
        // <div class="article-body"> e depois TODO paragrafo dentro dele com
        // exatamente a mesma faixa (20px a 438px). E obvio depois de ver: um
        // filho de bloco herda a largura do pai, entao a lista repete o bloco
        // inteiro e nao diz de ONDE vem o 438.
        //
        // Este teste responde isso fisicamente, sem teoria: aperta o <body>
        // para 120px e pergunta quem CONTINUA largo. Quem nao encolhe e quem
        // empurra a pagina. Depois fica so o mais fundo de cada ramo (o que
        // nao tem outro teimoso dentro), que e a causa de verdade — e, se for
        // texto, tambem a palavra mais comprida dele, que e o motivo classico
        // de uma caixa nao encolher (URL sem hifen, codigo, nome colado).
        //
        // Fixos e absolutos ficam de fora: nao dependem da largura do pai e so
        // fariam ruido. O estilo do body e restaurado logo em seguida, antes de
        // qualquer outra medida desta mesma passagem.
        const APERTO = 120;
        const estiloAntes = document.body.getAttribute('style');
        document.body.style.width = APERTO + 'px';
        document.body.style.minWidth = '0';
        void document.body.offsetWidth;
        const teimosos = [];
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.position === 'absolute') continue;
          if (cs.display === 'none') continue;
          const r = el.getBoundingClientRect();
          if (r.height === 0) continue;
          if (r.width <= APERTO + 8) continue;
          teimosos.push({ el, larg: Math.round(r.width) });
        }
        if (estiloAntes === null) document.body.removeAttribute('style');
        else document.body.setAttribute('style', estiloAntes);
        void document.body.offsetWidth;

        const caminhoDe = (el) => {
          const partes = [];
          for (let n = el; n && n !== document.body; n = n.parentElement) {
            const c = String(n.className || '').trim().split(/\s+/)[0];
            partes.unshift(n.tagName.toLowerCase() + (c ? '.' + c : ''));
            if (partes.length >= 5) break;
          }
          return partes.join(' > ');
        };
        const palavraMaisLonga = (el) => {
          let melhor = null;
          const it = document.createNodeIterator(el, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = it.nextNode())) {
            const re = /\S+/g;
            let m;
            while ((m = re.exec(n.nodeValue))) {
              if (m[0].length < 12) continue;
              const rg = document.createRange();
              rg.setStart(n, m.index);
              rg.setEnd(n, m.index + m[0].length);
              // O RETANGULO UNICO MENTE, e me enganou uma vez: se a palavra
              // quebra (o navegador quebra depois de hifen e depois de barra),
              // getBoundingClientRect devolve a UNIAO dos pedacos, que tem a
              // largura da linha inteira. Foi assim que "preferred-supplier"
              // apareceu com 330px, quando o pedaco indivisivel dela e bem
              // menor. O que interessa e o MAIOR PEDACO que nao quebra, que e
              // o que de fato impede a caixa de encolher.
              const pedacos = [...rg.getClientRects()].map((k) => k.width);
              const w = Math.round(pedacos.length ? Math.max(...pedacos) : 0);
              if (!melhor || w > melhor.px) melhor = { palavra: m[0].slice(0, 60), px: w };
            }
          }
          return melhor;
        };

        out.naoEncolhe = [];
        for (const t of teimosos) {
          if (teimosos.some((o) => o !== t && t.el.contains(o.el))) continue;
          out.naoEncolhe.push({
            tag: t.el.tagName.toLowerCase(),
            classe: (t.el.className && String(t.el.className).slice(0, 60)) || '',
            larg: t.larg,
            caminho: caminhoDe(t.el),
            texto: (t.el.textContent || '').trim().slice(0, 50),
            palavra: palavraMaisLonga(t.el),
          });
        }
        out.naoEncolhe.sort((a, b) => b.larg - a.larg);
        out.naoEncolhe = out.naoEncolhe.slice(0, 10);
      }

      // Imagens que não carregaram.
      out.imagensQuebradas = [...document.images]
        .filter((i) => i.complete && i.naturalWidth === 0)
        .map((i) => (i.currentSrc || i.src || '(sem src)').slice(0, 160));

      // Links: âncoras vazias e destinos internos, para checar depois.
      out.linksMortos = [];
      out.internos = [];
      for (const a of document.querySelectorAll('a')) {
        const h = a.getAttribute('href');
        const rotulo = (a.textContent || '').trim().slice(0, 60);
        if (h === null || h === '' || h === '#') { out.linksMortos.push(rotulo || '(sem texto)'); continue; }
        if (/^(mailto:|tel:|javascript:)/i.test(h)) continue;
        try {
          const u = new URL(a.href, location.href);
          if (u.origin === location.origin) out.internos.push(u.href.split('#')[0]);
        } catch (e) {}
      }
      out.internos = [...new Set(out.internos)];

      // Candidatos a clique morto: parece clicável, não é link nem botão.
      // LIMITE CONHECIDO: só enxerga onclick embutido. Um elemento com
      // addEventListener passa por aqui como suspeito mesmo funcionando, por isso
      // a linha sai marcada com "?" e nunca conta como problema no resumo.
      out.pareceClicavel = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('a,button,label,summary,select,input,textarea')) continue;
        if (getComputedStyle(el).cursor !== 'pointer') continue;
        if (el.getAttribute('role') === 'button' || el.onclick) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 12) continue;
        out.pareceClicavel.push({
          tag: el.tagName.toLowerCase(),
          classe: (el.className && String(el.className).slice(0, 60)) || '',
          texto: (el.textContent || '').trim().slice(0, 50),
        });
      }
      out.pareceClicavel = out.pareceClicavel.slice(0, 10);

      // Banner de consentimento presente?
      out.temBanner = !!document.querySelector('.vn-consent');

      // Alvos de toque pequenos demais (WCAG 2.2, 2.5.8: 24px).
      // A REGRA TEM EXCECAO PARA LINK EM TEXTO CORRIDO, e sem ela esta lista
      // enchia de falso positivo: "contact page" no meio de um paragrafo saia
      // como 104x20 e parecia defeito. Link dentro de <p>, <li> ou do corpo do
      // artigo fica de fora; botao e link de navegacao continuam valendo.
      const emTextoCorrido = (el) => !!el.closest('p, li, .article-body, .lead, blockquote');
      out.alvosPequenos = [];
      for (const el of document.querySelectorAll('a,button')) {
        if (el.tagName === 'A' && emTextoCorrido(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 24 || r.width < 24) {
          out.alvosPequenos.push(`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      out.alvosPequenos = out.alvosPequenos.slice(0, 10);

      out.titulo = document.title;
      out.lang = de.getAttribute('lang');
      return out;
    });
  } catch (e) {
    achados.erros.push(`MEDIÇÃO FALHOU: ${String(e && e.message || e).slice(0, 200)}`);
  }

  // O MENU SANFONA PRECISA SER ABERTO AQUI. Ate 09/09/2026 esta auditoria nunca
  // clicava no hamburguer: o painel inteiro — que e a mudanca que ela existe
  // para verificar — so tinha sido testado na previa local, nunca no site
  // publicado. Abaixo de 1025px, abre e confere o que a pessoa veria.
  if (tela.viewport.width <= 1024) {
    try {
      const temBotao = await pg.$('.menu-btn');
      if (!temBotao) {
        medidas.menu = { erro: 'não existe .menu-btn nesta largura' };
      } else {
        await pg.click('.menu-btn', { timeout: 5000 });
        await pg.waitForTimeout(400);
        medidas.menu = await pg.evaluate(() => {
          const p = document.getElementById('menu-villanova');
          if (!p) return { erro: 'painel #menu-villanova não existe' };
          const navs = [...p.querySelectorAll('nav.main')].filter((n) => getComputedStyle(n).display !== 'none');
          const ctas = [...p.querySelectorAll('.menu-cta')].filter((a) => getComputedStyle(a).display !== 'none');
          const cta = ctas[0];
          let alcance = null;
          if (cta) {
            cta.scrollIntoView({ block: 'nearest' });
            const r = cta.getBoundingClientRect();
            const el = (r.top >= 0 && r.bottom <= window.innerHeight)
              ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
            alcance = el ? `${el.tagName.toLowerCase()}.${String(el.className || '').trim().slice(0, 30)}` : '(fora da tela)';
          }
          return {
            aberto: p.classList.contains('is-open'),
            aria: document.querySelector('.menu-btn').getAttribute('aria-expanded'),
            idiomasVisiveis: navs.length,
            links: navs[0] ? navs[0].querySelectorAll('a').length : 0,
            botoesVisiveis: ctas.length,
            corDoBotao: cta ? getComputedStyle(cta).color : null,
            toqueChegaNoBotao: alcance,
            painelCabe: p.getBoundingClientRect().bottom <= window.innerHeight + 1,
            vazaComMenuAberto: document.documentElement.scrollWidth > window.innerWidth + 1,
            foco: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
          };
        });
      }
      // Fecha antes da foto: a tela guardada tem de mostrar a pagina como a
      // pessoa a encontra, nao o menu que este teste acabou de abrir.
      try { await pg.keyboard.press('Escape'); await pg.waitForTimeout(200); } catch (e) {}
    } catch (e) {
      medidas.menu = { erro: String(e && e.message || e).slice(0, 160) };
    }
  }

  const arquivoTela = `${PASTA}/${tela.nome}-${url.replace(/https?:\/\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 80)}.png`;
  try { await pg.screenshot({ path: arquivoTela, fullPage: true }); } catch (e) {}

  const r = {
    url, tela: tela.nome,
    status: resposta ? resposta.status() : 0,
    urlFinal: pg.url(),
    ...achados, ...medidas,
    imagem: arquivoTela,
  };
  try { await ctx.close(); } catch (e) {}
  return r;
}

// ------------------------------------------------------- relato de UMA página
// Fica antes da execução de propósito: cada página é relatada assim que
// termina, para que um tempo limite no meio não apague o que já foi medido.
const linha = (t) => console.log(t);

const COM_PROBLEMA = [];

function relataPagina(r) {
  const problemas = [];
  if (r.navegacao) problemas.push('a página não carregou');
  else if (r.status >= 400 || r.status === 0) problemas.push(`status HTTP ${r.status}`);
  if (r.erros?.length) problemas.push(`${r.erros.length} erro(s) de JavaScript`);
  if (r.rede?.length) problemas.push(`${r.rede.length} requisição(ões) com falha`);
  if (r.scrollWidth > r.innerWidth + 1) problemas.push('rolagem horizontal');
  if (r.imagensQuebradas?.length) problemas.push(`${r.imagensQuebradas.length} imagem(ns) quebrada(s)`);
  if (r.linksMortos?.length) problemas.push(`${r.linksMortos.length} link(s) sem destino`);
  const m = r.menu;
  if (m) {
    if (m.erro) problemas.push(`menu: ${m.erro}`);
    else {
      if (!m.aberto || m.aria !== 'true') problemas.push('o menu não abriu');
      if (m.idiomasVisiveis !== 1) problemas.push(`${m.idiomasVisiveis} menus de idioma visíveis (deveria ser 1)`);
      if (m.botoesVisiveis !== 1) problemas.push(`${m.botoesVisiveis} botões no painel (deveria ser 1)`);
      if (m.corDoBotao && m.corDoBotao !== 'rgb(255, 255, 255)') problemas.push(`botão do painel com texto ${m.corDoBotao}`);
      if (m.toqueChegaNoBotao && m.toqueChegaNoBotao.indexOf('menu-cta') < 0) problemas.push(`algo cobre o botão do painel: ${m.toqueChegaNoBotao}`);
      if (m.vazaComMenuAberto) problemas.push('rolagem horizontal com o menu aberto');
    }
  }
  if (!problemas.length) return false;
  COM_PROBLEMA.push({ tela: r.tela, url: r.url, problemas: problemas.slice() });

  linha(`\n──────────────────────────────────────────────`);
  linha(`${r.tela.toUpperCase()}  ${r.url}`);
  if (r.urlFinal && r.urlFinal !== r.url) linha(`  (terminou em ${r.urlFinal})`);
  linha(`  título: ${r.titulo}   lang: ${r.lang}   HTTP ${r.status}`);
  linha(`  PROBLEMAS: ${problemas.join(' · ')}`);

  if (r.navegacao) linha(`   ✗ ${r.navegacao}`);
  for (const e of (r.erros || [])) linha(`   ✗ JS: ${e}`);
  for (const e of (r.console || []).slice(0, 6)) linha(`   ! console: ${e}`);
  for (const e of (r.rede || []).slice(0, 8)) linha(`   ✗ rede: ${e}`);
  for (const i of (r.imagensQuebradas || [])) linha(`   ✗ imagem não carregou: ${i}`);
  if (r.vazandoLado?.length || r.vazandoContido?.length) {
    linha(`   ✗ a página é mais larga que a tela: ${r.scrollWidth}px de conteúdo para ${r.innerWidth}px de tela`);
    if (r.vazandoLado?.length) {
      linha('     CULPADOS (nada os corta, então esticam a página):');
      for (const v of r.vazandoLado) linha(`       <${v.tag} class="${v.classe}"> vai de ${v.esq}px a ${v.dir}px — "${v.texto}"`);
    } else {
      linha('     Nenhum elemento sem corte foi encontrado — a largura pode vir de');
      linha('     margem, padding ou de um filho de caixa com rolagem própria.');
    }
    for (const v of (r.vazandoContido || [])) {
      linha(`       (passa da tela mas NÃO é culpado: <${v.tag} class="${v.classe}"> já é cortado por ${v.contidoPor})`);
    }
    if (r.naoEncolhe?.length) {
      linha('     QUEM NÃO ENCOLHE (apertei o body a 120px e estes continuaram largos):');
      for (const v of r.naoEncolhe) {
        const pal = v.palavra ? `  ·  maior pedaco indivisivel: "${v.palavra.palavra}" (${v.palavra.px}px)` : '';
        linha(`       ${v.larg}px  ${v.caminho}${pal}`);
        if (v.texto) linha(`              "${v.texto}"`);
      }
    }
  }
  for (const l of (r.linksMortos || [])) linha(`   ! link sem destino (href vazio ou "#"): "${l}"`);
  for (const p of (r.pareceClicavel || [])) linha(`   ? parece clicável e talvez não seja: <${p.tag} class="${p.classe}"> "${p.texto}"`);
  for (const a of (r.alvosPequenos || [])) linha(`   ? alvo de toque menor que 24px: ${a}`);
  return true;
}

// ------------------------------------------------------------------------ execução
const lista = await paginas();
console.log(`Páginas a auditar nesta rodada: ${lista.length}`);
if (!lista.length) { console.log('Nenhuma URL. Sitemap vazio ou inacessível.'); process.exit(1); }

const navegador = await chromium.launch({ args: ['--no-sandbox'] });
const resultados = [];
let totalErros = 0, totalRede = 0, totalOverflow = 0, totalImg = 0, paginasComProblema = 0;

for (const url of lista) {
  for (const tela of TELAS) {
    const r = await auditaPagina(navegador, url, tela);
    resultados.push(r);
    totalErros += r.erros?.length || 0;
    totalRede += r.rede?.length || 0;
    totalImg += r.imagensQuebradas?.length || 0;
    if (r.scrollWidth > r.innerWidth + 1) totalOverflow++;
    if (relataPagina(r)) paginasComProblema++;
  }
}

// Links internos: junta todos e confere o status de cada um, uma vez só, em
// paralelo — em série isto sozinho estourava o tempo do workflow.
const todosInternos = [...new Set(resultados.flatMap((r) => r.internos || []))];
linha(`\n\nConferindo ${todosInternos.length} links internos distintos...`);
const linksRuins = [];
const confere = async (u) => {
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (r.status >= 400) linksRuins.push(`HTTP ${r.status} — ${u}`);
  } catch (e) { linksRuins.push(`ERRO ${e.message.slice(0, 60)} — ${u}`); }
};
for (let i = 0; i < todosInternos.length; i += 8) {
  await Promise.all(todosInternos.slice(i, i + 8).map(confere));
}

// ------------------------------------------------------------------------ resumo
linha('\n=================== LINKS INTERNOS QUEBRADOS ===================');
if (!linksRuins.length) linha('Nenhum. Todos os links internos responderam abaixo de 400.');
for (const l of linksRuins) linha(`  ✗ ${l}`);

linha('\n\n=========================== RESUMO ============================');
linha(`Páginas auditadas .................. ${lista.length} (x${TELAS.length} telas = ${resultados.length} carregamentos)`);
if (!process.argv[2] && TOTAL_URLS > lista.length) {
  linha(`ISTO É UMA AMOSTRA de ${lista.length} das ${TOTAL_URLS} URLs do site.`);
  linha('Nenhum número abaixo cobre o site inteiro.');
}
linha(`Carregamentos com algum problema ... ${paginasComProblema}`);
linha(`Erros de JavaScript ................ ${totalErros}`);
linha(`Requisições com falha .............. ${totalRede}`);
linha(`Telas com rolagem horizontal ....... ${totalOverflow}`);
linha(`Imagens quebradas .................. ${totalImg}`);
linha(`Links internos quebrados ........... ${linksRuins.length}`);
if (COM_PROBLEMA.length) {
  // Esta lista existe porque em 09/09/2026 o resumo disse "3 telas com rolagem
  // horizontal" e nao havia como saber QUAIS sem baixar o log inteiro. Um
  // relatorio que obriga a reler o proprio relatorio nao serve.
  linha('\n=================== ONDE ESTAO OS PROBLEMAS ===================');
  for (const p of COM_PROBLEMA) {
    linha(`  [${p.tela}] ${p.url}`);
    linha(`      ${p.problemas.join(' · ')}`);
  }
}

linha('\nAs telas cheias de cada página estão no artefato "telas" deste workflow.');

fs.writeFileSync(`${PASTA}/resultado.json`, JSON.stringify(resultados, null, 2));
await navegador.close();
