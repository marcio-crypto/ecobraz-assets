// Diagnóstico dirigido aos avisos do Google Search Console de 15/10/2026.
//
// Motivos relatados pelo Google em ecobraz.org:
//   (a) "Erro no servidor (5xx)"  -> validação da correção FALHOU
//   (b) "Não encontrado (404)"    -> motivo novo
//   (c) "Página com redirecionamento"
//   (d) "Página alternativa com tag canônica adequada"
//   (e) "Cópia, o Google e o usuário selecionaram uma página canônica diferente"
//
// O Search Console diz O QUE está errado, não ONDE. Este script mede o site ao
// vivo para achar as URLs exatas de cada bucket. Precisa rodar num runner do
// GitHub: o ambiente do assistente é bloqueado pelo Cloudflare.
//
// SÓ LEITURA — não altera nada no site.

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const LIMITE_SITEMAP = Number(process.env.LIMITE_SITEMAP || 600);
const UA_BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const host = new URL(base).host;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- utilitários
async function pegar(url, {ua = UA_BOT, seguir = false, metodo = 'GET'} = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: {'User-Agent': ua, 'Accept-Language': 'pt-BR,pt;q=0.9'},
      redirect: seguir ? 'follow' : 'manual',
      signal: AbortSignal.timeout(30000)
    });
    const corpo = metodo === 'GET' ? await r.text().catch(() => '') : '';
    return {
      status: r.status,
      location: r.headers.get('location') || '',
      server: r.headers.get('server') || '',
      cfCache: r.headers.get('cf-cache-status') || '',
      xRobots: r.headers.get('x-robots-tag') || '',
      corpo,
      ms: Date.now() - t0
    };
  } catch (e) {
    return {status: 0, erro: String(e.message || e).slice(0, 90), corpo: '', ms: Date.now() - t0};
  }
}

// Executa `tarefa` sobre `itens` com no máximo `n` em paralelo (gentil com a origem).
async function emLotes(itens, n, tarefa) {
  const saida = new Array(itens.length);
  let i = 0;
  await Promise.all(
    Array.from({length: Math.min(n, itens.length)}, async () => {
      while (i < itens.length) {
        const meu = i++;
        saida[meu] = await tarefa(itens[meu], meu);
      }
    })
  );
  return saida;
}

const canonicalDe = (html) =>
  (html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1]) || '';
const metaRobotsDe = (html) =>
  (html.match(/<meta[^>]+name=["']robots["'][^>]*>/i)?.[0]?.match(/content=["']([^"']+)["']/i)?.[1]) || '';
const semBarra = (u) => String(u).replace(/\/+$/, '');

// ------------------------------------------------- 1. robots.txt e sitemap
console.log(`\n================ DIAGNÓSTICO SEARCH CONSOLE — ${base} ================`);
console.log(`Rodado em: ${new Date().toISOString()}`);

const robots = await pegar(`${base}/robots.txt`);
console.log(`\n--- robots.txt: HTTP ${robots.status} ---`);
if (robots.status === 200) console.log(robots.corpo.trim().split('\n').map((l) => `  ${l}`).join('\n'));

const urlsSitemap = new Set();
const sitemapsVistos = new Set();
const fila = [`${base}/sitemap.xml`];
const sitemapsComProblema = [];
while (fila.length) {
  const sm = fila.shift();
  if (sitemapsVistos.has(sm)) continue;
  sitemapsVistos.add(sm);
  const r = await pegar(sm);
  if (r.status !== 200) {
    sitemapsComProblema.push(`${sm} -> HTTP ${r.status}`);
    continue;
  }
  for (const m of r.corpo.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    if (/\.xml$/i.test(loc)) fila.push(loc);
    else if (!/\.(png|jpe?g|webp|gif|svg|avif|ico)$/i.test(loc)) urlsSitemap.add(loc);
  }
}
console.log(`\n--- sitemap: ${sitemapsVistos.size} arquivos, ${urlsSitemap.size} URLs de página ---`);
sitemapsVistos.forEach((s) => console.log(`  ${s}`));
if (sitemapsComProblema.length) {
  console.log('  !! sitemaps que não abriram:');
  sitemapsComProblema.forEach((s) => console.log(`     ${s}`));
}

// ------------------------------- 2. varredura completa das URLs do sitemap
let listaSitemap = [...urlsSitemap];
if (listaSitemap.length > LIMITE_SITEMAP) {
  console.log(`\n!! AVISO: sitemap tem ${listaSitemap.length} URLs; varrendo as primeiras ${LIMITE_SITEMAP}.`);
  console.log(`   (as ${listaSitemap.length - LIMITE_SITEMAP} restantes NÃO foram medidas — aumente LIMITE_SITEMAP)`);
  listaSitemap = listaSitemap.slice(0, LIMITE_SITEMAP);
}

console.log(`\n=== VARREDURA: ${listaSitemap.length} URLs do sitemap (Googlebot UA, sem seguir redirect) ===`);
const medidas = await emLotes(listaSitemap, 6, async (u) => {
  const r = await pegar(u);
  return {
    url: u,
    status: r.status,
    location: r.location,
    ms: r.ms,
    erro: r.erro,
    canonical: canonicalDe(r.corpo),
    metaRobots: metaRobotsDe(r.corpo),
    xRobots: r.xRobots,
    cfCache: r.cfCache
  };
});

const porFaixa = {ok: [], red: [], c4: [], c5: [], falha: []};
for (const m of medidas) {
  if (m.status === 0) porFaixa.falha.push(m);
  else if (m.status >= 500) porFaixa.c5.push(m);
  else if (m.status >= 400) porFaixa.c4.push(m);
  else if (m.status >= 300) porFaixa.red.push(m);
  else porFaixa.ok.push(m);
}
console.log(
  `\nResumo do sitemap: ${porFaixa.ok.length} OK | ${porFaixa.red.length} redirect | ` +
  `${porFaixa.c4.length} 4xx | ${porFaixa.c5.length} 5xx | ${porFaixa.falha.length} sem resposta`
);

// (c) "Página com redirecionamento" — URL no sitemap que redireciona é erro de sitemap
if (porFaixa.red.length) {
  console.log(`\n### (c) URLS DO SITEMAP QUE REDIRECIONAM (${porFaixa.red.length}) — não deveriam estar no sitemap:`);
  porFaixa.red.forEach((m) => console.log(`  ${m.status}  ${m.url}  ->  ${m.location}`));
}
if (porFaixa.c4.length) {
  console.log(`\n### (b) URLS DO SITEMAP COM 4XX (${porFaixa.c4.length}):`);
  porFaixa.c4.forEach((m) => console.log(`  ${m.status}  ${m.url}`));
}
if (porFaixa.c5.length) {
  console.log(`\n### (a) URLS DO SITEMAP COM 5XX (${porFaixa.c5.length}):`);
  porFaixa.c5.forEach((m) => console.log(`  ${m.status}  ${m.url}`));
}
if (porFaixa.falha.length) {
  console.log(`\n### URLS SEM RESPOSTA (${porFaixa.falha.length}):`);
  porFaixa.falha.forEach((m) => console.log(`  ${m.erro}  ${m.url}`));
}

// noindex em página que está no sitemap: contradição que o Google reclama
const noindex = medidas.filter(
  (m) => /noindex/i.test(m.metaRobots) || /noindex/i.test(m.xRobots)
);
if (noindex.length) {
  console.log(`\n### NOINDEX EM URL DO SITEMAP (${noindex.length}) — contradição:`);
  noindex.forEach((m) => console.log(`  ${m.url}  meta:"${m.metaRobots}" header:"${m.xRobots}"`));
}

// (d)/(e) canonical que aponta para outra URL
const canonOutro = medidas.filter(
  (m) => m.status === 200 && m.canonical && semBarra(m.canonical) !== semBarra(m.url)
);
if (canonOutro.length) {
  console.log(`\n### (d/e) URL DO SITEMAP COM CANONICAL APONTANDO PARA OUTRA PÁGINA (${canonOutro.length}):`);
  canonOutro.forEach((m) => console.log(`  ${m.url}\n      canonical -> ${m.canonical}`));
}

// ------------------------------------------- 3. o 5xx é intermitente? (crítico)
// O Google insiste em 5xx mas um curl único costuma dar 200. Reamostramos as
// páginas mais pesadas várias vezes para separar falha permanente de instável.
const alvos5xx = [...new Set([
  ...porFaixa.c5.map((m) => m.url),
  ...porFaixa.falha.map((m) => m.url),
  `${base}/`,
  `${base}/blog/`,
  `${base}/agendamento/`,
  ...porFaixa.ok.slice().sort((a, b) => b.ms - a.ms).slice(0, 8).map((m) => m.url)
])].slice(0, 15);

console.log(`\n=== (a) REAMOSTRAGEM DE ESTABILIDADE: ${alvos5xx.length} URLs x 5 leituras espaçadas ===`);
for (const u of alvos5xx) {
  const codigos = [];
  for (let i = 0; i < 5; i++) {
    const r = await pegar(u);
    codigos.push(`${r.status === 0 ? 'ERR' : r.status}/${r.ms}ms${r.cfCache ? `/${r.cfCache}` : ''}`);
    await dormir(700);
  }
  const instavel = new Set(codigos.map((c) => c.split('/')[0])).size > 1;
  console.log(`  ${instavel ? '!! INSTÁVEL' : '   estável  '}  ${u.replace(base, '') || '/'}  [${codigos.join('  ')}]`);
}

// -------------------------- 4. a origem devolve 5xx sob pressão de rastreamento?
// Causa clássica de "Erro no servidor (5xx)" que não se reproduz com um curl:
// o Googlebot rastreia rápido e a origem/CDN passa a devolver 429/503.
console.log(`\n=== (a) TESTE DE PRESSÃO: 24 requisições rápidas (12 em paralelo) ===`);
const alvoPressao = porFaixa.ok.slice(0, 24).map((m) => m.url);
if (alvoPressao.length) {
  const res = await emLotes(alvoPressao, 12, (u) => pegar(u, {metodo: 'HEAD'}));
  const cont = {};
  res.forEach((r) => {
    const k = r.status === 0 ? `ERRO:${r.erro}` : String(r.status);
    cont[k] = (cont[k] || 0) + 1;
  });
  console.log(`  distribuição de status: ${JSON.stringify(cont)}`);
  const ruins = res.filter((r) => r.status === 0 || r.status >= 429);
  if (ruins.length) {
    console.log(`  !! ${ruins.length} de ${res.length} falharam sob pressão — forte candidato à causa do 5xx:`);
    res.forEach((r, i) => {
      if (r.status === 0 || r.status >= 429) console.log(`     ${r.status || r.erro}  ${alvoPressao[i]}`);
    });
  } else {
    console.log('  nenhuma falha sob pressão nesta amostra');
  }
}

// ------------------------- 5. links internos quebrados (origem dos 404 do Google)
// O Google descobre URL por link. Um link interno para página inexistente vira
// "Não encontrado (404)" no relatório.
console.log(`\n=== (b) CRAVANDO OS 404: links internos a partir de ${Math.min(40, porFaixa.ok.length)} páginas ===`);
const sementes = porFaixa.ok.slice(0, 40).map((m) => m.url);
const alvosLink = new Map(); // url -> páginas que apontam para ela
await emLotes(sementes, 6, async (u) => {
  const r = await pegar(u);
  for (const m of r.corpo.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let href = m[1].trim();
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, u); } catch { continue; }
    if (abs.host !== host) continue;
    if (/\.(png|jpe?g|webp|gif|svg|avif|ico|css|js|pdf|xml|txt)$/i.test(abs.pathname)) continue;
    abs.hash = '';
    const chave = abs.toString();
    if (urlsSitemap.has(chave)) continue; // já medido acima
    if (!alvosLink.has(chave)) alvosLink.set(chave, new Set());
    alvosLink.get(chave).add(u);
  }
});
const listaLink = [...alvosLink.keys()].slice(0, 300);
console.log(`  ${alvosLink.size} destinos internos fora do sitemap; medindo ${listaLink.length}`);
if (alvosLink.size > listaLink.length) {
  console.log(`  !! AVISO: ${alvosLink.size - listaLink.length} destinos NÃO medidos (corte em 300)`);
}
const medLink = await emLotes(listaLink, 6, async (u) => ({u, r: await pegar(u, {metodo: 'HEAD'})}));
const linkRuim = medLink.filter(({r}) => r.status >= 400 || r.status === 0);
if (linkRuim.length) {
  console.log(`\n  ### LINKS INTERNOS APONTANDO PARA ERRO (${linkRuim.length}):`);
  for (const {u, r} of linkRuim) {
    console.log(`    ${r.status || r.erro}  ${u}`);
    [...alvosLink.get(u)].slice(0, 4).forEach((de) => console.log(`         linkado em: ${de}`));
  }
} else {
  console.log('  nenhum link interno quebrado nesta amostra');
}

// ------------------- 6. variantes de querystring: o canonical limpa o parâmetro?
// Decide se (d)/(e) são benignos (canonical correto) ou dano real (duplicatas).
console.log(`\n=== (d/e) VARIANTES DE QUERYSTRING: o canonical remove o parâmetro? ===`);
const variantes = [
  `${base}/agendamento/?origem=contato`,
  `${base}/agendamento/?origem=sobre`,
  `${base}/?gclid=TESTE123`,
  `${base}/?gad_source=1`,
  `${base}/?option=com_k2&view=itemlist&task=user&id=101952`,
  `${base}/?utm_source=teste&utm_medium=teste`,
  `${base}/agendamento/pessoa-fisica`,
  `${base}/agendamento/pessoa-jurifica`
];
for (const v of variantes) {
  const r = await pegar(v);
  const can = canonicalDe(r.corpo);
  const limpo = can && !/[?&]/.test(can);
  // Redirect não tem corpo HTML, logo não tem canonical: é o esperado, não
  // defeito. Marcar 3xx como "sem canonical" seria alarme falso.
  if (r.status >= 300 && r.status < 400) {
    console.log(`     ok    HTTP ${r.status}  ${v.replace(base, '')}  ->  ${r.location || '(sem Location)'}`);
    continue;
  }
  const marca = r.status >= 400 ? '!! ERRO' : can ? (limpo ? '   ok   ' : '!! SUJO') : '!! SEM ';
  console.log(`  ${marca} HTTP ${r.status}  ${v.replace(base, '')}`);
  console.log(`            canonical: ${can || '(nenhum)'}`);
}

// -------------------------------------------------------- 7. balanço final
console.log(`\n================ BALANÇO ================`);
console.log(`(a) 5xx no sitemap ............ ${porFaixa.c5.length}`);
console.log(`(b) 4xx no sitemap ............ ${porFaixa.c4.length}`);
console.log(`(b) links internos quebrados .. ${linkRuim.length}`);
console.log(`(c) redirects no sitemap ...... ${porFaixa.red.length}`);
console.log(`(d/e) canonical p/ outra URL .. ${canonOutro.length}`);
console.log(`    noindex no sitemap ........ ${noindex.length}`);
console.log(`    sem resposta .............. ${porFaixa.falha.length}`);
console.log(`\nMedido: ${listaSitemap.length} URLs de sitemap + ${listaLink.length} destinos de link interno.`);
console.log('Este script NÃO altera o site. As correções são decididas depois, à mão.');
