import fs from 'node:fs/promises';

const origin = 'https://ecobraz.org';
const output = process.argv[2] || 'content/priority-posts.json';

// Conteúdos selecionados pelos resultados reais do Google Search Console.
// Excluímos variações duplicadas de idioma e artigos com promessas comerciais inadequadas.
const slugs = [
  'tabela-de-classificacao-de-residuos-eletronicos-abntconama-consulta-rapida',
  'a-evolucao-dos-computadores-dos-anos-70-ao-seculo-xxi',
  'lixo-eletronico-no-brasil-numeros-atualizados-2025',
  'como-limpar-roteadores-e-modems-antes-do-descarte',
  'lixo-eletronico-resumo-principais-causas-consequencias-e-solucoes',
  'bateria-de-notebook-vazando-o-que-fazer-agora',
  'normas-da-antt-e-abnt-para-transporte-de-baterias-de-litio',
  'descarte-de-equipamentos-de-imagem-medica-raio-x-tomografos-etc',
  'o-mapa-completo-do-lixo-eletronico-no-brasil-dados-regionais-volumes-e-riscos',
  'como-montar-um-ponto-de-coleta-de-eletronicos-na-sua-empresa',
  'os-componentes-toxicos-presentes-no-lixo-eletronico-e-seus-riscos',
  'onde-descartar-lixo-eletronico-em-sao-paulo-mapa-e-opcoes-seguras',
  'lixo-eletronico-nas-escolas-como-ensinar-sustentabilidade-com-a-ecobraz',
  'ranking-global-os-20-paises-que-mais-geram-lixo-eletronico',
  'o-valor-de-um-quilo-de-lixo-eletronico-por-que-ele-nao-paga-o-trabalho-que-fazemos',
  'qual-documentacao-fiscal-adequada-para-saida-de-sucata-x-reciclagem',
  'a-diferenca-entre-descarte-reciclagem-reuso-e-remanufatura-e-por-que-isso-importa-no-compliance',
  'os-impactos-do-lixo-eletronico-nos-solos-rios-e-oceanos',
  'procedimento-operacional-padrao-pop-coleta-e-descarte-de-elixo',
  'o-impacto-ambiental-do-descarte-incorreto-de-eletrodomesticos',
  'por-que-nao-jogar-eletronicos-no-lixo-comum-entenda-os-riscos-reais',
  'guia-completo-dos-documentos-do-descarte-certificado-de-lixo-eletronico',
  'o-que-e-considerado-lixo-eletronico-exemplos-e-destinos-corretos-com-a-ecobraz',
  'coleta-de-lixo-eletronico-em-osasco',
  'de-onde-vem-o-lixo-eletronico-a-origem-dos-residuos-de-tecnologia-no-brasil',
  'como-a-inteligencia-artificial-esta-ajudando-a-reciclar-lixo-eletronico',
  'licenciamento-ambiental-para-recicladores-de-eletronicos-o-que-verificar-antes-de-contratar',
  'empresas-obrigadas-a-fazer-logistica-reversa-lista-completa',
  'lixo-eletronico-lista-completa-do-que-pode-e-nao-pode-descartar',
  'normas-da-anvisa-e-lixo-eletronico-cuidados-especiais-no-descarte-de-equipamentos-eletromedicos-e-hospitalares',
  'o-papel-da-logistica-reversa-na-certificacao-iso-14001-das-empresas',
  'por-que-fios-e-cabos-eletricos-nao-devem-ser-jogados-no-lixo-comum',
  'o-impacto-do-lixo-eletronico-no-meio-ambiente-dados-2025',
  'descarte-de-ar-condicionado-a-solucao-sustentavel-da-ecobraz-emigre',
  'descarte-de-baterias-de-litio-riscos-normas-e-destinacao-segura',
  'passo-a-passo-para-emitir-mtr-e-cdf-no-descarte-de-eletronicos',
  'reciclagem-de-eletronicos-no-brasil-panorama-atual-desafios-e-oportunidades-para-empresas',
  'power-banks-sinais-de-risco-e-descarte-seguro',
  'como-funciona-a-triagem-do-lixo-eletronico-passo-a-passo',
  'coleta-e-reciclagem-de-autoclaves-e-equipamentos-de-esterilizacao',
  'como-descartar-geladeira-velha-em-sao-paulo',
  'mineracao-urbana-na-pratica-quanto-ouro-cobre-e-prata-existem-em-uma-tonelada-de-placas-eletronicas',
  'tv-antiga-como-e-onde-descartar-corretamente-em-2025',
  'sanitizacao-de-dados-em-hds-e-ssds-como-fazer-de-forma-certificada',
  'descarte-de-ti-e-lixo-eletronico-para-governo-e-orgaos-publicos-guia-pratico',
  'certificado-de-descarte-de-lixo-eletronico-por-que-sua-empresa-precisa'
];

const decode = (value = '') => value
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#039;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const text = (html = '') => decode(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const absoluteToLocal = (html) => html
  .replace(/https?:\/\/(?:www\.)?ecobraz\.org\/(?:pt_BR\/)?eletronicos\/?/gi, '/coleta-de-lixo-eletronico/')
  .replace(/https?:\/\/(?:www\.)?ecobraz\.org\/(?:pt_BR\/)?sanitizacao-de-hd\/?/gi, '/destruicao-de-dados/')
  .replace(/https?:\/\/(?:www\.)?ecobraz\.org\/(?:pt_BR\/)?agendamento\/?/gi, '/agendamento/')
  .replace(/https?:\/\/(?:www\.)?ecobraz\.org\/contato\/?/gi, '/agendamento/')
  .replace(/https?:\/\/(?:www\.)?ecobraz\.org\/?/gi, '/')
  .replace(/\/logistica-reversa-eletronicos\/?/gi, '/logistica-reversa/')
  .replace(/\/reciclagem-de-eletronicos\/?/gi, '/coleta-de-lixo-eletronico/')
  .replace(/\/processamento-de-cabos-e-fios\/?/gi, '/descarte-de-cabos-e-fios/')
  .replace(/href=("|')\/coleta-de-lixo-eletronico\/\s+agendamento\1/gi, 'href="/agendamento/"')
  .replace(/href=("|')\/destruicao-de-dados\/\s+eletronicos\s+agendamento\1/gi, 'href="/destruicao-de-dados/"')
  .replace(/href=("|')\/cdn-cgi\/(?:l\/)?email-protection[^"']*\1/gi, 'href="mailto:contato@ecobraz.org.br"')
  .replace(/<a\b[^>]*href=("|')\/cdn-cgi\/(?:l\/)?email-protection[^"']*\1[^>]*>[\s\S]*?<\/a>/gi, 'contato@ecobraz.org.br')
  .replace(/<span\b[^>]*data-cfemail[^>]*>[\s\S]*?<\/span>/gi, 'contato@ecobraz.org.br')
  .replace(/é reconhecida como o <strong>maior projeto do mundo em reciclagem de lixo eletrônico<\/strong>/gi, 'atua na coleta e na gestão de resíduos eletroeletrônicos para empresas')
  .replace(/se posiciona como líder mundial em soluções B2B, garantindo/gi, 'oferece soluções B2B voltadas à')
  .replace(/<li><strong>Atendimento nacional:<\/strong> coleta e logística em todo o Brasil;<\/li>/gi, '<li><strong>Avaliação operacional:</strong> atendimento definido conforme materiais, volume e localidade;</li>')
  .replace(/<li><strong>Documentação completa:<\/strong> emissão de manifestos, relatórios técnicos e certificados ambientais;<\/li>/gi, '<li><strong>Documentação aplicável:</strong> emissão conforme o serviço contratado e efetivamente realizado;</li>')
  .replace(/<li><strong>Impacto ESG comprovado:<\/strong> relatórios alinhados a práticas globais de governança e sustentabilidade\.<\/li>/gi, '<li><strong>Rastreabilidade:</strong> registros compatíveis com o escopo operacional contratado.</li>')
  .replace(/<h2>(?:&nbsp;|\s)*<\/h2>/gi, '')
  .replace(/http:\/\//gi, 'https://')
  .replace(/\s(?:class|style|id)=("[^"]*"|'[^']*')/gi, '')
  .replace(/\s+target=("[^"]*"|'[^']*')/gi, '');

const cta = '<aside class="post-conversion"><h2>Precisa descartar equipamentos eletrônicos?</h2><p>Informe os materiais, o volume e a localidade. A equipe da Ecobraz avaliará a viabilidade, o escopo e a documentação aplicável à operação.</p><p><a href="/agendamento/">Solicitar avaliação de coleta</a></p></aside><p><small>Conteúdo informativo. Classificações, obrigações, documentos e condições operacionais devem ser confirmados conforme o material, a localidade e a legislação vigente.</small></p>';

const posts = [];
for (const slug of slugs) {
  const candidates = [
    `${origin}/blog/${slug}`,
    `${origin}/pt_BR/blog/${slug}`,
    `${origin}/en/blog/${slug}`,
    `${origin}/es/blog/${slug}`,
    `${origin}/de/blog/${slug}`,
    `${origin}/fr/blog/${slug}`,
    `https://lp.ecobraz.org/blog/${slug}`
  ];
  let response;
  let url;
  for (const candidate of candidates) {
    const attempt = await fetch(candidate, {headers:{'user-agent':'Ecobraz migration audit/1.0'}});
    if (attempt.ok) {
      response = attempt;
      url = candidate;
      break;
    }
  }
  if (!response) {
    console.warn(`Skipped ${slug}: no live legacy copy found`);
    continue;
  }
  const source = await response.text();
  const block = source.match(/<div class="blog-article-details">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/i)?.[1];
  if (!block) throw new Error(`${slug}: article body not found`);
  const title = text(block.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  let html = block
    .replace(/<img\b[^>]*class="blog-main-image"[^>]*>/i, '')
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, '')
    .replace(/<div class="pt-3 pb-4">[\s\S]*?<\/div>/i, '')
    .trim();
  html = html.replace(/<h1\b[^>]*>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>');
  html = absoluteToLocal(html) + cta;
  const description = decode(source.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || '')
    .replace(/\s+/g, ' ').trim();
  const excerpt = (description || text(html)).slice(0, 155).replace(/\s+\S*$/, '') + '…';
  const metaTitle = title.length <= 58 ? `${title} | Ecobraz` : title.slice(0, 67).replace(/\s+\S*$/, '');
  posts.push({
    title,
    slug,
    custom_excerpt: excerpt,
    meta_title: metaTitle,
    meta_description: excerpt,
    html,
    tags: [{name:'Conteúdos sobre lixo eletrônico', slug:'conteudos-lixo-eletronico'}]
  });
  console.log(`Prepared ${slug}`);
}

await fs.writeFile(output, `${JSON.stringify(posts, null, 2)}\n`);
console.log(`Wrote ${posts.length} priority posts to ${output}`);
