// Caça o "Erro no servidor (5xx)" que o Search Console relatou e que a varredura
// do sitemap não reproduziu.
//
// Hipótese: as URLs com 5xx não estão no sitemap. São endereços legados que o
// Googlebot conhece por links externos e rastreia via redirects.yaml. Este script
// amostra as PRÓPRIAS fontes de redirect — o conjunto que o Googlebot bate — e
// procura 5xx e 429 tanto no redirect quanto no destino.
//
// Ritmo deliberadamente contido (concorrência baixa, pausa entre lotes): a ideia
// é medir o site, não derrubá-lo. Um teste de carga agressivo contra produção
// precisa de autorização explícita do Marcio e NÃO está aqui.
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const arquivo = process.argv[3] || 'site-ghost/theme/redirects.yaml';
const quantas = Number(process.env.AMOSTRA || 300);
const CONCORRENCIA = Number(process.env.CONCORRENCIA || 5);
const PAUSA_MS = Number(process.env.PAUSA_MS || 150);

const UA_GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. lê as fontes de redirect do arquivo ----------
const bruto = await fs.readFile(arquivo, 'utf8');
const regras = [];
for (const linha of bruto.split('\n')) {
  const m = linha.match(/^\s+"\^(.*?)\\?\$":\s*"(.*)"\s*$/);
  if (!m) continue;
  // No YAML em aspas duplas, "\\." vale uma barra invertida escapando o ponto.
  // Para padrões literais basta tirar todas as barras invertidas: o que sobra é o
  // caminho real. Qualquer metacaractere que reste significa padrão não-literal.
  let caminho = m[1].replace(/\/\?$/, '').replace(/\\+/g, '');
  if (/[*+?()[\]|{}^$]/.test(caminho)) continue;
  if (/%[0-9a-f]{2}/i.test(caminho)) continue; // malformadas de propósito ficam 404
  regras.push({caminho, destino: m[2]});
}
console.log(`regras literais lidas de ${arquivo}: ${regras.length}`);

// Amostra determinista espalhada por todo o arquivo (sem Math.random: resultado
// reproduzível, dá para comparar execuções).
const passo = Math.max(1, Math.floor(regras.length / quantas));
const amostra = [];
for (let i = 0; i < regras.length && amostra.length < quantas; i += passo) amostra.push(regras[i]);
console.log(`amostra: ${amostra.length} URLs legadas (1 a cada ${passo}), UA de Googlebot`);
console.log(`ritmo: ${CONCORRENCIA} em paralelo, pausa de ${PAUSA_MS}ms entre lotes\n`);

// ---------- 2. varre ----------
const achados = {cinco: [], quatroVinteNove: [], falha: [], semRedirect: [], destinoRuim: []};
let contaOk = 0;
const statusVistos = {};

const medir = async (url, headers) => {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {headers, redirect: 'manual', signal: AbortSignal.timeout(20000)});
    await r.arrayBuffer().catch(() => {});
    return {status: r.status, location: r.headers.get('location'), ms: Date.now() - t0};
  } catch (e) {
    return {erro: String(e.message || e).slice(0, 90), ms: Date.now() - t0};
  }
};

const lotes = [];
for (let i = 0; i < amostra.length; i += CONCORRENCIA) lotes.push(amostra.slice(i, i + CONCORRENCIA));

for (const [n, lote] of lotes.entries()) {
  await Promise.all(lote.map(async ({caminho, destino}) => {
    const url = base + caminho;
    const r = await medir(url, {'User-Agent': UA_GOOGLEBOT});
    if (r.erro) { achados.falha.push(`${caminho} — ${r.erro}`); return; }
    statusVistos[r.status] = (statusVistos[r.status] || 0) + 1;
    if (r.status >= 500) { achados.cinco.push(`${caminho} — HTTP ${r.status} (${r.ms}ms)`); return; }
    if (r.status === 429) { achados.quatroVinteNove.push(`${caminho} — HTTP 429 (${r.ms}ms)`); return; }
    if (r.status !== 301 && r.status !== 302 && r.status !== 308) {
      achados.semRedirect.push(`${caminho} — HTTP ${r.status}, esperava redirect para ${destino}`);
      return;
    }
    // Confere o destino do redirect: um 5xx no destino também vira 5xx no relatório.
    const alvo = new URL(r.location, base).toString();
    const d = await medir(alvo, {'User-Agent': UA_GOOGLEBOT});
    if (d.erro) { achados.falha.push(`destino de ${caminho} (${alvo}) — ${d.erro}`); return; }
    statusVistos[`destino:${d.status}`] = (statusVistos[`destino:${d.status}`] || 0) + 1;
    if (d.status >= 500 || d.status === 429 || d.status >= 400) {
      achados.destinoRuim.push(`${caminho} -> ${alvo} — HTTP ${d.status}`);
      return;
    }
    contaOk++;
  }));
  if ((n + 1) % 10 === 0) console.log(`  ...${(n + 1) * CONCORRENCIA} de ${amostra.length}`);
  await dormir(PAUSA_MS);
}

// ---------- 3. balanço ----------
console.log(`\n== DISTRIBUIÇÃO DE STATUS ==`);
console.log(JSON.stringify(statusVistos, null, 2));

console.log(`\n== BALANÇO ==`);
console.log(`redirect + destino OK: ${contaOk} de ${amostra.length}`);
const rotular = (nome, lista) => {
  console.log(`${nome}: ${lista.length}`);
  lista.slice(0, 40).forEach((x) => console.log('   ', x));
  if (lista.length > 40) console.log(`    ... e mais ${lista.length - 40}`);
};
rotular('HTTP 5xx', achados.cinco);
rotular('HTTP 429 (limite de taxa)', achados.quatroVinteNove);
rotular('destino com 4xx/5xx', achados.destinoRuim);
rotular('não redirecionou', achados.semRedirect);
rotular('sem resposta / erro de rede', achados.falha);

const grave = achados.cinco.length + achados.quatroVinteNove.length + achados.destinoRuim.length;
if (grave) {
  console.log(`\nRESULTADO: ${grave} URL(s) legada(s) com 5xx, 429 ou destino quebrado.`);
  console.log('Essas são candidatas diretas ao "Erro no servidor (5xx)" do Search Console.');
} else {
  console.log(`\nRESULTADO: nenhum 5xx, nenhum 429, nenhum destino quebrado nesta amostra.`);
  console.log('Isso NÃO prova que o 5xx do Search Console não existe — prova apenas que');
  console.log(`não aparece em ${amostra.length} URLs legadas lidas neste ritmo. Para fechar de`);
  console.log('verdade continua sendo preciso o CSV exportado do painel do Search Console.');
}
