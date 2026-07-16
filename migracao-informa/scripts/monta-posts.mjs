// Converte o HTML bruto extraído (migracao-informa/conteudo/*.json) em
// rascunhos de posts no formato do sync-posts (slug, title, html,
// custom_excerpt, meta_*, tags), preservando título/H1/corpo 1:1.
// Saída: migracao-informa/rascunhos/posts-migrados.json (para curadoria
// humana antes de entrar no deploy).
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = 'migracao-informa/conteudo';
const csv = await fs.readFile('migracao-informa/de-para.csv', 'utf8');
const migrar = csv.trim().split('\n').slice(1)
  .filter((line) => line.includes(',migrar,'))
  .map((line) => ({origem: line.split(',')[0], destino: line.split(',')[1]}));

const decode = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;|&#160;/g, ' ');
const strip = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function parseArticle(html, origem) {
  const artMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  // Layout antigo (sem <article>/<main>): recorta do primeiro <h1> em diante.
  let art;
  if (artMatch) art = artMatch[1];
  else {
    const h1At = html.search(/<h1[^>]*>/i);
    if (h1At < 0) return null;
    art = html.slice(h1At);
  }
  const h1 = strip((art.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '');
  const sub = strip((art.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1] || '');
  const metaDesc = decode((html.match(/<meta[^>]+name=["']?description["']?[^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']?description["']?/i)
    || html.match(/property=["']?og:description["']?[^>]*content=["']([^"']+)["']/i) || [])[1] || '');

  // Corpo: depois do bloco de resumo (amp-accordion) ou do meta do autor.
  let bodyStart = art.search(/<\/amp-accordion>/i);
  if (bodyStart < 0) bodyStart = art.search(/texto_release/i);
  if (bodyStart < 0) bodyStart = art.search(/<p[^>]*>/i);
  const bodyHtml = art.slice(bodyStart);

  // Mantém apenas blocos editoriais; descarta svg, divs de métrica, forms, amp-*
  const blocks = [];
  const re = /<(p|h2|h3|ul|ol|blockquote)([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(bodyHtml)) !== null) {
    const inner = m[3];
    if (/<svg|<path|<form|<input|amp-|ajh-|class=["']?(?:share|meta|breadcrumb)/i.test(inner + m[2])) continue;
    const text = strip(inner);
    if (!text || text.length < 3) continue;
    if (/^(Ecobraz Informa|Compartilhe|Leia também|Visite o Museu Virtual)/i.test(text)) continue;
    if (/\+55 11|Todos os direitos|©|Home Quem Somos|Política de Privacidade/i.test(text)) continue;
    // blocos com densidade alta de links = navegação/rodapé
    const linkCount = (inner.match(/<a[\s>]/gi) || []).length;
    if (linkCount >= 3 && text.length / (linkCount + 1) < 40) continue;
    const key = text.slice(0, 120);
    if (seen.has(key)) continue; // o CMS repete o resumo várias vezes
    seen.add(key);
    const tag = m[1].toLowerCase();
    const cleanInner = decode(inner)
      .replace(/https?:\/\/(?:www\.)?ecobraz\.org\/pt_BR\//gi, 'https://ecobraz.org/')
      .replace(/href=(https?:\/\/[^\s>"']+)/gi, 'href="$1"')
      .replace(/<a[^>]+href=["']([^"']*)["'][^>]*>/gi, (full, href) => {
        // reescreve links internos do informa para o novo domínio (resolvidos na curadoria)
        if (/ecobrazinforma\.org/i.test(href) || href.startsWith('/')) return '<a data-antigo="' + href.replace(/"/g, '') + '">';
        return full;
      })
      .replace(/<(?!\/?(a|strong|em|b|i|br|li|ul|ol)\b)[^>]+>/gi, '')
      .replace(/\s+/g, ' ').trim();
    blocks.push(`<${tag}>${cleanInner}</${tag}>`);
  }
  if (!blocks.length) return null;
  return {h1, sub, metaDesc, bodyBlocks: blocks, words: strip(blocks.join(' ')).split(' ').length};
}

const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const byPath = {};
for (const f of files) {
  const d = JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'));
  if (d.html) byPath[d.path] = d;
}

const posts = [];
const problemas = [];
for (const {origem, destino} of migrar) {
  const doc = byPath[origem];
  if (!doc) { problemas.push({origem, motivo: 'sem conteúdo extraído'}); continue; }
  const parsed = parseArticle(doc.html, origem);
  if (!parsed || parsed.words < 120) { problemas.push({origem, motivo: `parse fraco (${parsed ? parsed.words : 0} palavras)`}); continue; }
  const slug = destino.replace(/^\/(blog|museu)\//, '').replace(/\/$/, '');
  const secao = destino.startsWith('/museu/') ? 'museu' : 'blog';
  const tags = secao === 'museu'
    ? [{name: 'Museu do Eletrônico'}]
    : [{name: 'Notícias ESG'}];
  posts.push({
    slug,
    secao,
    origem,
    title: parsed.h1,
    html: (parsed.sub ? `<p><em>${parsed.sub}</em></p>` : '') + parsed.bodyBlocks.join('\n'),
    custom_excerpt: (parsed.metaDesc || parsed.sub || strip(parsed.bodyBlocks[0])).slice(0, 297),
    meta_title: parsed.h1.slice(0, 60),
    meta_description: (parsed.metaDesc || parsed.sub).slice(0, 155),
    tags,
    palavras: parsed.words,
  });
}

await fs.mkdir('migracao-informa/rascunhos', {recursive: true});
await fs.writeFile('migracao-informa/rascunhos/posts-migrados.json', JSON.stringify(posts, null, 1));
await fs.writeFile('migracao-informa/rascunhos/_problemas.json', JSON.stringify(problemas, null, 1));
console.log(`Rascunhos: ${posts.length} posts (${posts.filter(p=>p.secao==='museu').length} museu, ${posts.filter(p=>p.secao==='blog').length} blog)`);
console.log(`Problemas: ${problemas.length}`);
for (const p of problemas) console.log(' ', p.origem, '—', p.motivo);
