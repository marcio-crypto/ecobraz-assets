// Diagnóstico de ACESSO ao villanovaesg.com: descobre se alguém — pessoa,
// buscador ou robô de IA — está sendo bloqueado antes mesmo de ver o conteúdo.
//
// Criado em 01/09/2026, quando o site apareceu com tráfego zero e sem
// passagem de robôs. Testa, em uma só rodada:
//   1. se a Cloudflare está na frente e o que ela responde;
//   2. o robots.txt que o mundo realmente recebe;
//   3. cada URL com vários User-Agents (navegador, Googlebot, GPTBot,
//      ClaudeBot, PerplexityBot, Bingbot), olhando status, cabeçalhos de
//      indexação e sinais de bloqueio;
//   4. modo privado do Ghost, noindex no HTML e X-Robots-Tag no cabeçalho;
//   5. sitemap e llms.txt.
//
// Só lê. Não altera nada.

const BASE = 'https://www.villanovaesg.com';

const AGENTES = {
  navegador: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  GPTBot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.1; +https://openai.com/gptbot',
  ClaudeBot: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  PerplexityBot: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  Bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
};

// Cabeçalhos que decidem se a página pode ser indexada, ou que denunciam bloqueio.
const HEADERS_CHAVE = ['x-robots-tag', 'cf-mitigated', 'cf-ray', 'server', 'location',
  'content-type', 'cache-control', 'set-cookie', 'retry-after', 'x-ghost-cache-status'];

const URLS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [`${BASE}/`, `${BASE}/the-firm/`, `${BASE}/marcio-villanova/`,
     `${BASE}/supplier-evidence-file-assessment/`, `${BASE}/pt/`];

const pega = async (url, ua, seguir = 'follow') => {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {redirect: seguir, headers: {'User-Agent': ua, 'Accept': 'text/html,*/*'}});
    const corpo = await r.text();
    return {ok: true, status: r.status, url: r.url, ms: Date.now() - t0, headers: r.headers, corpo};
  } catch (e) {
    return {ok: false, erro: String(e.message || e), ms: Date.now() - t0};
  }
};

const cab = (h, nome) => (h && h.get(nome)) || '';
const trecho = (s, re) => { const m = s.match(re); return m ? m[0].slice(0, 160) : ''; };

console.log('='.repeat(78));
console.log('1. CLOUDFLARE ESTÁ NA FRENTE?');
console.log('='.repeat(78));
const trace = await pega(`${BASE}/cdn-cgi/trace`, AGENTES.navegador);
if (trace.ok && trace.status === 200 && /(^|\n)h=/.test(trace.corpo)) {
  const campos = Object.fromEntries(trace.corpo.trim().split('\n').map((l) => l.split('=')));
  console.log(`Cloudflare ATIVA — colo ${campos.colo || '?'} | visitante visto como ${campos.loc || '?'} | http ${campos.http || '?'} | tls ${campos.tls || '?'}`);
} else {
  console.log(`/cdn-cgi/trace respondeu ${trace.status || trace.erro} — Cloudflare pode não estar em modo proxy.`);
}

console.log('\n' + '='.repeat(78));
console.log('2. robots.txt QUE O MUNDO RECEBE');
console.log('='.repeat(78));
for (const nome of ['navegador', 'GPTBot', 'Googlebot']) {
  const r = await pega(`${BASE}/robots.txt`, AGENTES[nome]);
  if (!r.ok) { console.log(`[${nome}] FALHA: ${r.erro}`); continue; }
  const bloqueiaTudo = /User-agent:\s*\*\s*[\r\n]+Disallow:\s*\/\s*$/mi.test(r.corpo);
  console.log(`[${nome}] status ${r.status} | ${r.corpo.length} bytes | bloqueio total do site: ${bloqueiaTudo ? 'SIM — CRÍTICO' : 'não'}`);
  if (nome === 'navegador') {
    console.log('--- conteúdo servido ---');
    console.log(r.corpo.trim());
    console.log('--- fim ---');
  }
}

console.log('\n' + '='.repeat(78));
console.log('3. CADA URL, COM CADA ROBÔ');
console.log('='.repeat(78));
const problemas = [];
for (const url of URLS) {
  console.log(`\n### ${url.replace(BASE, '') || '/'}`);
  for (const [nome, ua] of Object.entries(AGENTES)) {
    const r = await pega(url, ua);
    if (!r.ok) { console.log(`  ${nome.padEnd(14)} FALHA: ${r.erro}`); problemas.push(`${url} ${nome}: ${r.erro}`); continue; }
    const xr = cab(r.headers, 'x-robots-tag');
    const mit = cab(r.headers, 'cf-mitigated');
    const noindexHtml = /<meta[^>]+name=["']robots["'][^>]*noindex/i.test(r.corpo);
    const metaRobots = trecho(r.corpo, /<meta[^>]+name=["']robots["'][^>]*>/i);
    const titulo = trecho(r.corpo, /<title>[^<]*<\/title>/i);
    const privado = /\/private\/?$/.test(r.url) || /name=["']password["']/.test(r.corpo);
    const flags = [];
    if (r.status !== 200) flags.push(`STATUS ${r.status}`);
    if (xr) flags.push(`X-Robots-Tag: ${xr}`);
    if (mit) flags.push(`CF-Mitigated: ${mit}`);
    if (noindexHtml) flags.push('NOINDEX no HTML');
    if (privado) flags.push('MODO PRIVADO do Ghost');
    if (r.corpo.length < 1500) flags.push(`corpo minúsculo (${r.corpo.length}b)`);
    console.log(`  ${nome.padEnd(14)} ${r.status} ${String(r.ms).padStart(5)}ms ${String(r.corpo.length).padStart(7)}b  ${flags.length ? '<<< ' + flags.join(' | ') : 'ok'}`);
    if (nome === 'navegador' && (metaRobots || titulo)) {
      if (titulo) console.log(`                 ${titulo}`);
      if (metaRobots) console.log(`                 ${metaRobots}`);
    }
    if (flags.length) problemas.push(`${url} [${nome}] ${flags.join(' | ')}`);
  }
}

console.log('\n' + '='.repeat(78));
console.log('4. MODO PRIVADO / PÁGINA DE SENHA');
console.log('='.repeat(78));
const semSeguir = await pega(`${BASE}/`, AGENTES.navegador, 'manual');
console.log(`GET / sem seguir redirect: status ${semSeguir.status} | Location: ${cab(semSeguir.headers, 'location') || '(nenhum)'}`);
const priv = await pega(`${BASE}/private/`, AGENTES.navegador);
console.log(`GET /private/: status ${priv.status} (404 = modo privado desligado, 200 = LIGADO e o site está fechado)`);

console.log('\n' + '='.repeat(78));
console.log('5. SITEMAP E llms.txt');
console.log('='.repeat(78));
for (const caminho of ['/sitemap.xml', '/sitemap-pages.xml', '/sitemap-posts.xml', '/llms.txt']) {
  const r = await pega(`${BASE}${caminho}`, AGENTES.navegador);
  if (!r.ok) { console.log(`${caminho.padEnd(22)} FALHA: ${r.erro}`); continue; }
  const locs = (r.corpo.match(/<loc>/g) || []).length;
  const xr = cab(r.headers, 'x-robots-tag');
  console.log(`${caminho.padEnd(22)} ${r.status} | ${String(r.corpo.length).padStart(7)}b | <loc>: ${locs}${xr ? ' | X-Robots-Tag: ' + xr : ''}`);
}

console.log('\n' + '='.repeat(78));
console.log(`RESUMO: ${problemas.length} sinal(is) de atenção`);
console.log('='.repeat(78));
problemas.forEach((p) => console.log('  - ' + p));
if (!problemas.length) console.log('  Nenhum bloqueio detectado nesta rodada.');
