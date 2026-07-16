// Gera os arquivos de conteúdo publicáveis a partir dos rascunhos curados:
//  - site-ghost/content/migrated-posts.json (posts com tags de seção)
//  - site-ghost/content/autor-pages.json (5 páginas de colunista)
// Resolve os links marcados com data-antigo usando o próprio de-para.
import fs from 'node:fs/promises';

const rascunhos = JSON.parse(await fs.readFile('migracao-informa/rascunhos/posts-migrados.json', 'utf8'));
const csv = await fs.readFile('migracao-informa/de-para.csv', 'utf8');
const mapa = new Map();
for (const line of csv.trim().split('\n').slice(1)) {
  const [origem, destino] = line.split(',');
  if (origem && destino) mapa.set(origem, destino);
}

const normaliza = (html) => html
  .replace(/href="http:\/\//gi, 'href="https://')
  .replace(/href="https:\/\/ecobraz\.org\/agendamento"/gi, 'href="https://ecobraz.org/agendamento/"')
  .replace(/href="https?:\/\/museu\.ecobraz\.net\/?"/gi, 'href="https://ecobraz.org/museu/"')
  .replace(/href="https:\/\/ecobraz\.org\/ecobraz_carbon"/gi, 'href="https://ecobraz.org/"');

const resolveAntigos = (html) => normaliza(html).replace(/<a data-antigo="([^"]*)">/gi, (_, href) => {
  let path = href.replace(/^https?:\/\/(www\.)?ecobrazinforma\.org/i, '').split('?')[0].replace(/\/amp$/, '').replace(/\/$/, '');
  if (!path.startsWith('/')) path = '/' + path;
  const destino = mapa.get(path);
  if (destino) return `<a href="https://ecobraz.org${destino}">`;
  const secao = path.split('/')[1] || '';
  const fallback = {noticia: '/noticias-esg/', coluna: '/blog/', downloads: '/evidencias/', conteudo: '/noticias-esg/'}[secao] || '/noticias-esg/';
  return `<a href="https://ecobraz.org${fallback}">`;
});

const posts = rascunhos.map((r) => ({
  slug: r.slug,
  title: r.title,
  html: resolveAntigos(r.html),
  custom_excerpt: r.custom_excerpt,
  meta_title: r.meta_title,
  meta_description: r.meta_description,
  tags: r.secao === 'museu'
    ? [{name: 'Museu do Eletrônico', slug: 'museu-do-eletronico'}]
    : [{name: 'Notícias ESG', slug: 'noticias-esg'}],
}));
await fs.writeFile('site-ghost/content/migrated-posts.json', JSON.stringify(posts, null, 1));
console.log(`migrated-posts.json: ${posts.length} posts`);

// Páginas de autor: estrutura factual mínima; as bios entram quando o Marcio
// enviar (nunca inventar credenciais).
const autores = [
  ['autor-sergio-diniz', 'Sergio Diniz'],
  ['autor-marcelo-aragao', 'Marcelo de Oliveira Lopes Aragão'],
  ['autor-marcio-villanova', 'Marcio Villanova'],
  ['autor-ernesto-machado', 'Ernesto Machado'],
  ['autor-silvana-leite', 'Silvana Leite'],
].map(([slug, nome]) => ({
  slug,
  title: nome,
  custom_excerpt: `Colunista do acervo editorial da Ecobraz Emigre (Ecobraz Informa).`,
  html: `<p><strong>${nome}</strong> assina colunas e análises no acervo editorial da Ecobraz Emigre, publicado originalmente no Ecobraz Informa e hoje reunido nas <a href="https://ecobraz.org/noticias-esg/">Notícias ESG</a> e no <a href="https://ecobraz.org/museu/">Museu Virtual do Eletrônico</a>.</p><p>Os textos tratam de logística reversa, compliance ambiental, economia circular e descarte responsável de eletrônicos — sempre com foco em operação real e documentação auditável.</p>`,
  meta_title: `${nome} — Colunista | Ecobraz`,
  meta_description: `Colunas e análises de ${nome} no acervo editorial da Ecobraz Emigre: ESG, logística reversa e descarte responsável de eletrônicos.`.slice(0, 155),
}));
await fs.writeFile('site-ghost/content/autor-pages.json', JSON.stringify(autores, null, 1));
console.log(`autor-pages.json: ${autores.length} páginas`);
