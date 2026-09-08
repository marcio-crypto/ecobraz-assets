// Confere ao vivo o título e a meta description que o site está servindo, e
// mede o comprimento de cada um contra os limites práticos do Google.
//
// Uso: node verifica-metas.mjs <caminho-do-json-com-slugs>
//
// O JSON é o mesmo usado pelo atualiza-metas.mjs: cada item precisa de "slug",
// e opcionalmente "meta_title"/"meta_description" — quando esses campos estão
// presentes, o script compara o que foi pedido com o que o site devolve, em vez
// de só medir. É a diferença entre "mandei gravar" e "está no ar".
//
// Sai com código 1 se algo continuar acima do limite ou divergir do pedido.
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2];
if (!ARQUIVO) throw new Error('Informe o caminho do JSON com a lista de slugs.');
const SITE = 'https://www.villanovaesg.com';
const LIM_TITULO = 60;
const LIM_DESC = 160;

// A descrição pode vir com aspas simples ou duplas e com os atributos em
// qualquer ordem; por isso a busca é feita em duas etapas em vez de um regex só.
const meta = (html, nome) => {
  const re = new RegExp(`<meta[^>]+name=["']${nome}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content=["']([\s\S]*?)["']/i)?.[1] ?? null;
};
// O Ghost escapa o apóstrofo como &#x27; (hexadecimal), não como &#39;. Sem
// tratar as duas formas, uma descrição idêntica à pedida era acusada de
// divergente — falso alarme meu, não problema do site.
const decodifica = (s) => (s || '')
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const itens = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
let longos = 0, divergentes = 0, ausentes = 0;

for (const item of itens) {
  const url = `${SITE}/${item.slug === 'home' ? '' : `${item.slug}/`}`;
  let html;
  try {
    const r = await fetch(url, {redirect: 'follow'});
    if (!r.ok) { console.log(`FALHA ${r.status}  /${item.slug}/`); ausentes++; continue; }
    html = await r.text();
  } catch (e) {
    console.log(`ERRO   /${item.slug}/  ${e.message}`);
    ausentes++;
    continue;
  }

  const titulo = decodifica(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]);
  const desc = decodifica(meta(html, 'description'));

  const marcas = [];
  if (desc == null) { marcas.push('SEM DESCRIÇÃO'); ausentes++; }
  else {
    if (desc.length > LIM_DESC) { marcas.push(`descrição ${desc.length} (>${LIM_DESC})`); longos++; }
    if (item.meta_description && desc !== item.meta_description) { marcas.push('descrição DIFERENTE do pedido'); divergentes++; }
  }
  if (titulo && titulo.length > LIM_TITULO) marcas.push(`título ${titulo.length} (>${LIM_TITULO}): ${titulo}`);
  if (item.meta_title && titulo !== item.meta_title) { marcas.push('título DIFERENTE do pedido'); divergentes++; }

  const sinal = marcas.length ? 'ATENÇÃO' : 'ok     ';
  console.log(`${sinal} /${item.slug}/  desc=${desc == null ? '-' : desc.length}  título=${titulo?.length ?? '-'}${marcas.length ? '  << ' + marcas.join(' | ') : ''}`);
  if (marcas.includes('descrição DIFERENTE do pedido')) {
    console.log(`         pedido: ${item.meta_description}`);
    console.log(`         no ar:  ${desc}`);
  }
}

console.log(`\nTotal: ${itens.length}`);
console.log(`Acima do limite de descrição: ${longos}`);
console.log(`Diferentes do que foi pedido: ${divergentes}`);
console.log(`Sem descrição ou sem resposta: ${ausentes}`);
if (longos || divergentes || ausentes) process.exit(1);
console.log('\nRESULTADO: tudo no ar como foi pedido e dentro do limite.');
