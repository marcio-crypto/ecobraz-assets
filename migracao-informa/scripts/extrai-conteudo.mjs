// Extrai o conteúdo completo (HTML) das páginas marcadas como "migrar" no
// de-para + páginas de colunista (bios), buscando na Wayback Machine QUALQUER
// snapshot 200 de cada URL (sem collapse — o mais recente íntegro vence).
// Salva um JSON por página em migracao-informa/conteudo/ para curadoria.
import fs from 'node:fs/promises';

const HOST = 'https://ecobrazinforma.org';
const UA = 'EcobrazMigracao/1.0 (extracao de conteudo proprio para consolidacao de dominios; ti@ecobraz.org)';

const fetchText = async (url, tries = 3) => {
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch(url, {headers: {'User-Agent': UA}});
      if (response.status === 429 || response.status >= 500) throw new Error(`HTTP ${response.status}`);
      if (!response.ok) return null;
      return await response.text();
    } catch (error) {
      if (attempt === tries) return null;
      await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
    }
  }
  return null;
};

const csv = await fs.readFile('migracao-informa/de-para.csv', 'utf8');
const targets = csv.trim().split('\n').slice(1)
  .filter((line) => line.includes(',migrar,'))
  .map((line) => line.split(',')[0]);
const colunistas = ['/colunista/5/ernesto-machado', '/colunista/7/sergio-diniz',
  '/colunista/8/marcelo-de-oliveira-lopes-aragao', '/colunista/9/marcio-villanova', '/autor/silvana-leite'];
const all = [...new Set([...targets, ...colunistas])];
console.log(`Alvos: ${all.length} páginas`);

await fs.mkdir('migracao-informa/conteudo', {recursive: true});
const results = [];
for (const path of all) {
  const slug = path.replace(/^\//, '').replace(/\//g, '-').slice(0, 80);
  const already = await fs.access(`migracao-informa/conteudo/${slug}.json`).then(() => true, () => false);
  if (already) { results.push({path, status: 'ok', fonte: 'existente'}); continue; }

  // Lista TODOS os snapshots 200 dessa URL (qualquer época), pega o mais recente
  const cdx = await fetchText(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(HOST + path)}&output=json&filter=statuscode:200&limit=100`);
  let snaps = [];
  try { snaps = JSON.parse(cdx || '[]').slice(1); } catch {}
  if (!snaps.length) {
    // Plano B: cache AMP do Google (as variações /amp ficam copiadas no CDN da Google)
    const ampUrl = `https://ecobrazinforma-org.cdn.ampproject.org/c/s/ecobrazinforma.org${path}/amp`;
    const ampHtml = await fetchText(ampUrl);
    if (ampHtml && ampHtml.length > 3000) {
      const clean = ampHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
      await fs.writeFile(`migracao-informa/conteudo/${slug}.json`, JSON.stringify({path, fonte: 'amp-cache', html: clean}, null, 1));
      console.log(`OK (cache AMP) ${path} (${(clean.length / 1024).toFixed(0)} KB)`);
      results.push({path, status: 'ok', fonte: 'amp-cache'});
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }
    // Plano C: leitor público (r.jina.ai devolve o conteúdo em markdown)
    const jina = await fetchText(`https://r.jina.ai/${HOST}${path}`);
    if (jina && jina.length > 1500 && !/403 Forbidden|Access denied/i.test(jina.slice(0, 500))) {
      await fs.writeFile(`migracao-informa/conteudo/${slug}.json`, JSON.stringify({path, fonte: 'jina-reader', markdown: jina}, null, 1));
      console.log(`OK (leitor) ${path} (${(jina.length / 1024).toFixed(0)} KB)`);
      results.push({path, status: 'ok', fonte: 'jina-reader'});
      await new Promise((resolve) => setTimeout(resolve, 1200));
      continue;
    }
    console.log(`SEM SNAPSHOT/CACHE: ${path}`);
    results.push({path, status: 'sem-snapshot'});
    continue;
  }
  snaps.sort((a, b) => (a[1] > b[1] ? -1 : 1)); // timestamp desc
  let saved = false;
  for (const snap of snaps.slice(0, 3)) { // tenta até 3 snapshots, do mais novo ao mais antigo
    const timestamp = snap[1];
    const html = await fetchText(`https://web.archive.org/web/${timestamp}id_/${HOST}${path}`);
    if (!html || html.length < 3000) continue;
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    await fs.writeFile(`migracao-informa/conteudo/${slug}.json`, JSON.stringify({path, snapshot: timestamp, html: clean}, null, 1));
    console.log(`OK ${path} (snap ${timestamp}, ${(clean.length / 1024).toFixed(0)} KB)`);
    results.push({path, status: 'ok', snapshot: timestamp});
    saved = true;
    break;
  }
  if (!saved) { console.log(`SNAPSHOTS ILEGÍVEIS: ${path}`); results.push({path, status: 'ilegivel'}); }
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

await fs.writeFile('migracao-informa/conteudo/_resultado.json', JSON.stringify(results, null, 1));
const ok = results.filter((r) => r.status === 'ok').length;
console.log(`\nRESULTADO: ${ok}/${all.length} páginas extraídas.`);
if (ok === 0) process.exit(1);
