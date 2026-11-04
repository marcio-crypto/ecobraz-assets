// Plano de correcao dos 404 que o Search Console reporta.
//
// Entrada:
//   - site-ghost/migration/search-console-2026-10-15/404-urls.csv (export do painel)
//   - site-ghost/theme/redirects.yaml (as regras que estao no ar)
//   - o sitemap AO VIVO do site (precisa de rede; roda em runner do GitHub)
//
// Saida: classificacao de cada URL 404 e, para as resolviveis, as linhas de regra
// prontas para colar no fim do redirects.yaml.
//
// A classificacao e conservadora de proposito. So propoe regra quando o destino
// vem de EVIDENCIA, nunca de chute:
//   (a) IRMAO  - o mesmo slug ja tem regra sob outro prefixo de idioma; usa o
//                destino que a maioria dos irmaos usa.
//   (b) VIVA   - tirando o prefixo de idioma, a pagina EXISTE hoje no sitemap;
//                manda para ela mesma. E o caso mais seguro que existe.
//   (c) ORFA   - sem irmao e sem pagina viva. NAO propoe destino: lista para
//                decisao humana.
//   (d) OUTRO HOST - lp./www.: redirect do Ghost nao alcanca. Lista a parte.
import fs from 'node:fs/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const csvPath = process.argv[3] || 'site-ghost/migration/search-console-2026-10-15/404-urls.csv';
const yamlPath = process.argv[4] || 'site-ghost/theme/redirects.yaml';

const PREFIXOS = ['pt_BR','pt_br','en_BR','en_br','es_BR','es_br','de_BR','de_br','fr_BR','fr_br','pt','en','es','de','fr','public','zh'];
const RE_PREF = new RegExp(`^/(${PREFIXOS.join('|')})(?=/)`);

const desmonta = (caminho) => {
  const m = RE_PREF.exec(caminho);
  return m ? {prefixo: m[1], resto: caminho.slice(m[1].length + 1)} : {prefixo: '(nenhum)', resto: caminho};
};
const semBarra = (c) => (c.replace(/\/+$/, '') || '/');

// ---------- 1. regras atuais ----------
const yaml = await fs.readFile(yamlPath, 'utf8');
const regras = new Map();
for (const linha of yaml.split('\n')) {
  const m = /^  "\^(.*?)\$":\s*"(.*)"\s*$/.exec(linha);
  if (!m) continue;
  if (/[[(*+]/.test(m[1])) continue;            // padrao nao-literal: fora
  regras.set(semBarra(m[1].replace('/?', '').replace(/\\/g, '')), m[2]);
}
const porResto = new Map();
for (const [c, d] of regras) {
  const {prefixo, resto} = desmonta(c);
  if (!porResto.has(resto)) porResto.set(resto, new Map());
  porResto.get(resto).set(prefixo, d);
}
console.log(`regras literais no arquivo: ${regras.size}`);

// ---------- 2. sitemap ao vivo ----------
const vivas = new Set();
// SITEMAP_LOCAL permite rodar sem rede: um arquivo com uma URL por linha, obtido
// de uma execucao anterior no runner. Sem ele, busca o sitemap ao vivo.
const sitemapLocal = process.env.SITEMAP_LOCAL;
if (sitemapLocal) {
  const txt = await fs.readFile(sitemapLocal, 'utf8');
  for (const linha of txt.split('\n')) {
    const l = linha.trim();
    if (!l) continue;
    try { vivas.add(semBarra(new URL(l).pathname)); } catch { vivas.add(semBarra(l)); }
  }
  console.log(`sitemap lido de arquivo local: ${sitemapLocal}`);
}
const fila = sitemapLocal ? [] : [`${base}/sitemap.xml`];
const vistos = new Set();
while (fila.length) {
  const sm = fila.shift();
  if (vistos.has(sm)) continue;
  vistos.add(sm);
  const r = await fetch(sm).catch(() => null);
  if (!r || r.status !== 200) { console.log(`  aviso: ${sm} -> ${r ? r.status : 'sem resposta'}`); continue; }
  const corpo = await r.text();
  for (const m of corpo.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = m[1].trim();
    if (/\.xml$/.test(loc)) fila.push(loc);
    else if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(loc)) {
      try { vivas.add(semBarra(new URL(loc).pathname)); } catch {}
    }
  }
}
console.log(`paginas vivas no sitemap: ${vivas.size}`);
if (vivas.size === 0) {
  console.log('FALHA: sitemap vazio — sem ele a classificacao (b) nao e confiavel.');
  console.log('Rode num runner com rede, ou passe SITEMAP_LOCAL=<arquivo com uma URL por linha>.');
  process.exit(1);
}

// ---------- 3. classifica ----------
const csv = await fs.readFile(csvPath, 'utf8');
const linhas = csv.split('\n').slice(1).filter((l) => l.trim());
const grupos = {irmao: [], viva: [], orfa: [], outroHost: [], jaTemRegra: []};

for (const linha of linhas) {
  const url = linha.split(',')[0].trim();
  let u;
  try { u = new URL(url); } catch { continue; }
  const caminho = semBarra(decodeURIComponent(u.pathname));
  if (u.hostname !== new URL(base).hostname) { grupos.outroHost.push({url, caminho, host: u.hostname}); continue; }
  if (regras.has(caminho)) { grupos.jaTemRegra.push({caminho, destino: regras.get(caminho)}); continue; }

  const {prefixo, resto} = desmonta(caminho);
  const irmaos = porResto.get(resto);
  if (irmaos && irmaos.size) {
    const conta = new Map();
    for (const d of irmaos.values()) conta.set(d, (conta.get(d) || 0) + 1);
    const destino = [...conta.entries()].sort((a, b) => b[1] - a[1])[0][0];
    grupos.irmao.push({caminho, destino, prefixo, irmaos: [...irmaos.keys()].sort()});
    continue;
  }
  // a pagina existe hoje, sem o prefixo?
  const nua = resto.startsWith('/') ? resto : `/${resto}`;
  if (prefixo !== '(nenhum)' && vivas.has(semBarra(nua))) {
    grupos.viva.push({caminho, destino: `${semBarra(nua)}/`, prefixo});
    continue;
  }
  grupos.orfa.push({caminho, prefixo, resto});
}

// ---------- 4. balanco ----------
const n = linhas.length;
console.log(`\n================ PLANO PARA AS ${n} URLs ================`);
const pct = (x) => `${((x / n) * 100).toFixed(1)}%`;
console.log(`(a) IRMAO  — destino herdado de regra existente .. ${grupos.irmao.length}  (${pct(grupos.irmao.length)})`);
console.log(`(b) VIVA   — a pagina existe hoje no sitemap ..... ${grupos.viva.length}  (${pct(grupos.viva.length)})`);
console.log(`(c) ORFA   — precisa decisao humana ............. ${grupos.orfa.length}  (${pct(grupos.orfa.length)})`);
console.log(`(d) OUTRO HOST — fora do alcance do Ghost ....... ${grupos.outroHost.length}  (${pct(grupos.outroHost.length)})`);
console.log(`    ja tem regra (nao deveria aparecer) ......... ${grupos.jaTemRegra.length}`);
const resolviveis = grupos.irmao.length + grupos.viva.length;
console.log(`\nRESOLVIVEL SEM CHUTE: ${resolviveis} de ${n} (${pct(resolviveis)})`);

const porPrefixo = (lista) => {
  const c = new Map();
  for (const x of lista) c.set(x.prefixo, (c.get(x.prefixo) || 0) + 1);
  return Object.fromEntries([...c.entries()].sort((a, b) => b[1] - a[1]));
};
console.log(`\nprefixos faltando (a): ${JSON.stringify(porPrefixo(grupos.irmao))}`);
console.log(`prefixos faltando (b): ${JSON.stringify(porPrefixo(grupos.viva))}`);

console.log(`\n== ORFAS por prefixo ==`);
console.log(JSON.stringify(porPrefixo(grupos.orfa)));
console.log('amostra de 20 orfas:');
grupos.orfa.slice(0, 20).forEach((o) => console.log('   ', o.caminho));

console.log(`\n== OUTRO HOST (${grupos.outroHost.length}) ==`);
const hosts = new Map();
for (const o of grupos.outroHost) hosts.set(o.host, (hosts.get(o.host) || 0) + 1);
console.log(JSON.stringify(Object.fromEntries(hosts)));
grupos.outroHost.slice(0, 10).forEach((o) => console.log(`    ${o.host}${o.caminho}`));

// ---------- 5. regras propostas ----------
const propostas = [...grupos.irmao, ...grupos.viva]
  .map((x) => ({origem: x.caminho, destino: x.destino}))
  .filter((x, i, arr) => arr.findIndex((y) => y.origem === x.origem) === i)
  .sort((a, b) => b.origem.length - a.origem.length || a.origem.localeCompare(b.origem));

const escapar = (p) => p.replace(/([.*+?^${}()|[\]\\])/g, '\\$1');
const linhasYaml = propostas.map((p) => `  ${JSON.stringify(`^${escapar(p.origem)}/?$`)}: ${JSON.stringify(p.destino)}`);
await fs.writeFile('regras-propostas.yaml', linhasYaml.join('\n') + '\n', 'utf8');
console.log(`\n== REGRAS PROPOSTAS: ${propostas.length} (gravadas em regras-propostas.yaml) ==`);
linhasYaml.slice(0, 15).forEach((l) => console.log(l));
console.log(`  ... e mais ${Math.max(0, linhasYaml.length - 15)}`);

// conferencia: nenhuma proposta pode colidir com regra existente
const colisoes = propostas.filter((p) => regras.has(semBarra(p.origem)));
console.log(`\ncolisoes com regras existentes: ${colisoes.length} (tem que ser 0)`);
if (colisoes.length) { colisoes.slice(0, 5).forEach((c) => console.log('   ', c.origem)); process.exit(1); }
