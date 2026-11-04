// Links internos pilar ⇄ conteúdo (auditoria de 04/11/2026, prioridade ALTA).
//
// O que faz, de forma determinística e idempotente:
//  1. Em cada post (PT e EN), insere no primeiro terço do texto um parágrafo
//     "Leia também:" com 2 links para páginas de serviço do mesmo tema
//     (página específica do material/assunto + pilar comercial).
//  2. Nos posts do Museu com mais tráfego (lista TOP_MUSEU), insere um CTA
//     contextual no meio do artigo apontando para a página do material
//     correspondente e para /para-empresas/ (EN: /business-e-waste-collection/).
//  3. Nas páginas de conteúdo simples (materiais, intenção de busca,
//     institucionais, EN), acrescenta ao fim um bloco "Leia também" com até 3
//     posts do mesmo tema — é o caminho pilar → post que não existia.
//  4. Nas landings geradas (landing/landing-pages*.json), grava o campo
//     `leituras` (slugs de posts) que o build-landing-pages renderiza.
//
// Marcação propositalmente simples (<p>, <blockquote>, <ul>) para sobreviver à
// conversão HTML → Lexical do Ghost (sync via ?source=html). A idempotência é
// por texto-marcador ("Leia também:" / "Read next:" / título do CTA).
//
// Uso: node site-ghost/scripts/insere-links-contextuais.mjs [--dry]
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dry = process.argv.includes('--dry');
const read = async (rel) => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const write = async (rel, data) => { if (!dry) await fs.writeFile(path.join(root, rel), JSON.stringify(data, null, 2) + '\n'); };

// ---------------------------------------------------------------------------
// Taxonomia: tema → página PT/EN (slug) + âncora descritiva + pilar.
// `b2c` escolhe o pilar: coleta gratuita (casa) ou para empresas.
const TEMAS = {
  tv:            {pt: 'descarte-de-televisao', en: 'tv-monitor-disposal', aPt: 'descarte de televisão e monitores com coleta agendada', aEn: 'TV and monitor disposal with scheduled collection', b2c: true},
  geladeira:     {pt: 'descarte-de-geladeira-velha', en: 'old-fridge-disposal', aPt: 'descarte de geladeira velha em São Paulo', aEn: 'old fridge disposal in São Paulo', b2c: true},
  lavar:         {pt: 'descarte-de-maquina-de-lavar', en: 'washing-machine-disposal', aPt: 'descarte de máquina de lavar', aEn: 'washing machine disposal', b2c: true},
  eletrodom:     {pt: 'descarte-de-eletrodomesticos', en: 'white-goods-disposal', aPt: 'descarte de eletrodomésticos com destinação documentada', aEn: 'white goods disposal with documented destination', b2c: true},
  ar:            {pt: 'descarte-de-ar-condicionado', en: 'air-conditioner-disposal', aPt: 'descarte de ar-condicionado com recolhimento de gás', aEn: 'air conditioner disposal', b2c: true},
  computadores:  {pt: 'coleta-de-computadores-e-notebooks', en: 'computer-laptop-collection', aPt: 'coleta de computadores e notebooks', aEn: 'computer and laptop collection', b2c: false},
  celulares:     {pt: 'descarte-de-celulares-e-tablets', en: 'phone-tablet-disposal', aPt: 'descarte de celulares e tablets', aEn: 'phone and tablet disposal', b2c: true},
  baterias:      {pt: 'descarte-de-baterias-e-nobreaks', en: 'battery-ups-disposal', aPt: 'descarte de baterias e nobreaks', aEn: 'battery and UPS disposal', b2c: false},
  cabos:         {pt: 'descarte-de-cabos-e-fios', en: 'cable-wire-disposal', aPt: 'descarte de cabos e fios por volume', aEn: 'cable and wire disposal', b2c: false},
  placas:        {pt: 'descarte-de-placas-e-componentes-eletronicos', en: 'circuit-board-component-disposal', aPt: 'descarte de placas e componentes eletrônicos', aEn: 'circuit board and component disposal', b2c: false},
  hospitalar:    {pt: 'descarte-de-equipamentos-hospitalares', en: 'hospital-equipment-disposal', aPt: 'descarte de equipamentos hospitalares e eletromédicos', aEn: 'hospital and medical equipment disposal', b2c: false},
  telecom:       {pt: 'descarte-de-equipamentos-de-telecomunicacoes', en: 'telecoms-equipment-disposal', aPt: 'descarte de equipamentos de telecomunicações', aEn: 'telecoms equipment disposal', b2c: false},
  impressoras:   {pt: 'descarte-de-impressoras', en: 'printer-disposal', aPt: 'descarte de impressoras', aEn: 'printer disposal', b2c: false},
  dados:         {pt: 'destruicao-de-dados', en: 'data-destruction', aPt: 'destruição e sanitização de dados com laudo', aEn: 'data destruction and sanitisation with report', b2c: false},
  ti:            {pt: 'descarte-corporativo-de-ti', en: 'corporate-it-disposal', aPt: 'descarte corporativo de TI com certificado', aEn: 'corporate IT disposal with certificate', b2c: false},
  datacenter:    {pt: 'descarte-de-servidores-e-data-center', en: 'server-data-centre-disposal', aPt: 'descarte de servidores e desmobilização de data center', aEn: 'server and data centre disposal', b2c: false},
  logistica:     {pt: 'logistica-reversa', en: 'reverse-logistics', aPt: 'logística reversa de eletrônicos para empresas', aEn: 'reverse logistics for electronics', b2c: false},
  fabricantes:   {pt: 'logistica-reversa-para-fabricantes-e-importadores', en: 'manufacturer-importer-reverse-logistics', aPt: 'logística reversa para fabricantes e importadores', aEn: 'reverse logistics for manufacturers and importers', b2c: false},
  documentacao:  {pt: 'documentacao-e-rastreabilidade', en: 'documentation-traceability', aPt: 'documentação de destinação (MTR, CDF e certificado)', aEn: 'disposal documentation (MTR, CDF and certificate)', b2c: false},
  certificado:   {pt: 'sistema-de-rastreabilidade', en: 'documentation-traceability', aPt: 'certificado de destinação com QR validável', aEn: 'disposal certificate with verifiable QR', b2c: false},
  esg:           {pt: 'documentacao-esg', en: 'esg-documentation', aPt: 'documentação ESG para relatórios e auditorias', aEn: 'ESG documentation for reports and audits', b2c: false},
  escopo3:       {pt: 'escopo-3-cadeia-global', en: 'scope-3-global-chain', aPt: 'descarte documentado para Escopo 3 e CSRD', aEn: 'documented disposal for Scope 3 and CSRD', b2c: false},
  pontos:        {pt: 'pontos-de-coleta', en: 'collection-points', aPt: 'pontos de coleta de lixo eletrônico', aEn: 'e-waste collection points', b2c: true},
  sp:            {pt: 'coleta-de-lixo-eletronico-em-sao-paulo', en: 'e-waste-collection-sao-paulo', aPt: 'coleta de lixo eletrônico em São Paulo', aEn: 'e-waste collection in São Paulo', b2c: true},
  osasco:        {pt: 'coleta-de-lixo-eletronico-osasco', en: 'e-waste-collection-osasco', aPt: 'coleta de lixo eletrônico em Osasco', aEn: 'e-waste collection in Osasco', b2c: true},
  adote:         {pt: 'programa-adote-um-bairro', en: 'adopt-a-neighbourhood-programme', aPt: 'Programa Adote um Bairro', aEn: 'Adopt a Neighbourhood Programme', b2c: false},
  licenciamento: {pt: 'evidencias', en: 'public-evidence', aPt: 'licenças e evidências públicas da Ecobraz', aEn: 'Ecobraz licences and public evidence', b2c: false},
  escolas:       {pt: 'para-governo', en: 'business-e-waste-collection', aPt: 'coleta para escolas e órgãos públicos', aEn: 'e-waste collection for organisations', b2c: false},
  condominios:   {pt: 'para-condominios', en: 'electronic-waste-collection', aPt: 'coleta de eletrônicos em condomínios', aEn: 'electronic waste collection', b2c: true},
  materiais:     {pt: 'materiais-e-equipamentos-coletados', en: 'materials-we-collect', aPt: 'materiais e equipamentos que a Ecobraz coleta', aEn: 'materials and equipment we collect', b2c: true},
  geral:         {pt: 'coleta-de-lixo-eletronico', en: 'electronic-waste-collection', aPt: 'coleta de lixo eletrônico com certificado', aEn: 'electronic waste collection with certificate', b2c: true}
};
const PILAR = {
  b2b: {pt: 'para-empresas', en: 'business-e-waste-collection', aPt: 'descarte para empresas com certificado QR', aEn: 'e-waste collection for businesses'},
  b2c: {pt: 'coleta-gratuita', en: 'electronic-waste-collection', aPt: 'coleta gratuita de eletrônicos em casa', aEn: 'free household e-waste collection'}
};

// Regras slug → tema (a primeira que casar vence; ordem importa).
const REGRAS = [
  [/televis|tv-|-tv$|colour-television|monitores-quebrados|broken-monitors/, 'tv'],
  [/geladeira|fridge/, 'geladeira'],
  [/maquina-de-lavar|washing/, 'lavar'],
  [/ar-condicionado|air-conditioner/, 'ar'],
  [/eletrodomestic|appliance/, 'eletrodom'],
  [/notebook|laptop|computador|computer|apple-ii|ibm-pc|altair|eniac|zx81|pdp11|microprocessador|microprocessor|evolucao-dos-computadores|evolution-of-computers/, 'computadores'],
  [/celular|iphone|smartphone|phone-tablet/, 'celulares'],
  [/bateria|battery|power-bank|litio|lithium/, 'baterias'],
  [/cabos|cables|fios/, 'cabos'],
  [/componentes|components|circuito-integrado|integrated-circuit|placas/, 'placas'],
  [/hospital|anvisa|autoclave|imagem-medica|medical/, 'hospitalar'],
  [/telegrafo|telegraph|bina|orelhao|payphone|roteador|router|modem|tesla|radio|telefon|telecom/, 'telecom'],
  [/impressora|printer/, 'impressoras'],
  [/sanitizacao|sanitisation|hds-e-ssds|hdd-ssd|destruicao-de-dados|data-destruction/, 'dados'],
  [/descarte-de-ti|it-disposal|ativos-de-ti|it-asset/, 'ti'],
  [/servidor|server|data-center|data-centre/, 'datacenter'],
  [/fabricantes|manufacturer|importador|importer/, 'fabricantes'],
  [/logistica-reversa|reverse-logistics|iso-14001/, 'logistica'],
  [/mtr|cdf|documentacao-fiscal|tax-documents|sucata|scrap/, 'documentacao'],
  [/certificado|certificate|licenciamento|licensing/, 'certificado'],
  [/esg|cvm|greenwashing|compliance|remanufatura|remanufacturing/, 'esg'],
  [/escopo-3|scope-3|mineracao-urbana|urban-mining|minerais|minerals/, 'escopo3'],
  [/ponto-de-coleta|collection-point|onde-descartar|where-to-dispose|pontos-de-coleta/, 'pontos'],
  [/sao-paulo/, 'sp'],
  [/osasco/, 'osasco'],
  [/adote-um-bairro|adopt-a-neighbourhood/, 'adote'],
  [/escola|school/, 'escolas'],
  [/condominio/, 'condominios'],
  [/museu|museum|fonografo|phonograph|lumiere|cinematograph|playstation|ps2|neo-geo|odyssey|singer|sewing|camera|glass-plate|placa-vidro|ultracentrifuga|ultracentrifuge|microscopio|microscope/, 'materiais'],
  [/pop-|sop-|triagem|sorting|reciclad|recycl|componentes-toxicos|toxic|impacto|impact|lixo-comum|general-waste|numeros|figures|ranking|top-20|de-onde-vem|where-e-waste|mapa|map|o-que-e|what-is|lista-completa|can-and-cannot|inteligencia-artificial|ai-helps|agbogbloshie|minamata|cubatao|itai|deepwater|anniston|obsolescencia|obsolescence|carros|cars/, 'geral']
];
const temaDe = (slug) => (REGRAS.find(([re]) => re.test(slug)) || [null, 'geral'])[1];

// ---------------------------------------------------------------------------
// Posts do Museu com mais tráfego orgânico (Ahrefs, 04/11/2026) → CTA no meio.
// Texto específico por peça; página do material + pilar para empresas.
const TOP_MUSEU = {
  'telegrafo-de-morse-o-inicio-da-era-das-mensagens-eletricas': {lang: 'pt', tema: 'telecom', titulo: 'Do telégrafo ao roteador: todo equipamento de comunicação tem destino certo', texto: 'Centrais, modems, roteadores e aparelhos de telefonia fora de uso entram na mesma rota documentada que o resto do parque eletrônico. Veja como funciona o'},
  'bina-a-invencao-brasileira-que-identificou-o-telefone-do-futuro': {lang: 'pt', tema: 'telecom', titulo: 'Tem aparelhos de telefonia ou PABX parados na empresa?', texto: 'Equipamentos de telecomunicação antigos acumulam metais e placas que não podem ir para o lixo comum. Conheça o'},
  'televisao-a-cores-o-espetaculo-visual-do-seculo-xx': {lang: 'pt', tema: 'tv', titulo: 'Tem uma TV antiga parada em casa ou no estoque?', texto: 'Tubo, LCD ou LED: televisores têm chumbo, mercúrio e placas que exigem destinação específica. Veja o'},
  'sony-playstation-2-o-videogame-que-dominou-mundo': {lang: 'pt', tema: 'materiais', titulo: 'Consoles, controles e fontes antigas também são lixo eletrônico', texto: 'A Ecobraz coleta videogames e acessórios junto com os demais equipamentos da casa ou da empresa. Confira os'},
  'fonografo-de-edison-o-som-gravado-pela-primeira-vez': {lang: 'pt', tema: 'materiais', titulo: 'Aparelhos de som e áudio fora de uso têm coleta e destino documentado', texto: 'Amplificadores, toca-discos, caixas e rádios entram na lista de'},
  'apple-ii-o-micro-que-levou-computador-para-casa': {lang: 'pt', tema: 'computadores', titulo: 'Computadores antigos no estoque ou no almoxarifado?', texto: 'Desktops, notebooks e periféricos obsoletos saem com certificado de destinação e, se houver dados, com laudo de sanitização. Veja a'},
  'ibm-pc-5150-o-computador-que-definiu-a-era-dos-pcs': {lang: 'pt', tema: 'computadores', titulo: 'Parque de PCs desmobilizado? A rota correta começa aqui', texto: 'Computadores corporativos fora de uso têm coleta, registro por lote e certificado QR. Conheça a'},
  'radio-experimental-de-nikola-tesla-o-nascimento-da-comunicacao-sem-fio': {lang: 'pt', tema: 'telecom', titulo: 'Rádios, antenas e transmissores antigos têm destinação específica', texto: 'Equipamentos de radiocomunicação e telecom acumulam placas e metais que exigem tratamento licenciado. Veja o'},
  'iphone-5-2012-o-smartphone-que-afinou-a-era-retina': {lang: 'pt', tema: 'celulares', titulo: 'Smartphones antigos na gaveta? A bateria é o maior risco', texto: 'Celulares e tablets fora de uso precisam de coleta que trate a bateria de lítio e apague os dados. Veja o'},
  'projetor-dos-irmaos-lumiere-o-nascimento-do-cinema': {lang: 'pt', tema: 'materiais', titulo: 'Projetores, câmeras e equipamentos audiovisuais também têm coleta', texto: 'Equipamentos de imagem e som fora de uso entram na rota documentada da Ecobraz. Confira os'},
  'morse-telegraph-dawn-of-electric-messaging': {lang: 'en', tema: 'telecom', titulo: 'From the telegraph to the router: communication equipment has a documented end of life', texto: 'Decommissioned switches, modems, routers and telephony hardware in Brazil follow the same traceable route as the rest of the IT estate. See how our'}
};

// ---------------------------------------------------------------------------
const href = (slug) => `/${slug}/`;
const linkPagina = (temaKey, lang) => {
  const t = TEMAS[temaKey];
  return lang === 'pt' ? `<a href="${href(t.pt)}">${t.aPt}</a>` : `<a href="${href(t.en)}">${t.aEn}</a>`;
};
const linkPilar = (temaKey, lang) => {
  const p = TEMAS[temaKey].b2c ? PILAR.b2c : PILAR.b2b;
  return lang === 'pt' ? `<a href="${href(p.pt)}">${p.aPt}</a>` : `<a href="${href(p.en)}">${p.aEn}</a>`;
};

// Insere `bloco` depois do N-ésimo fechamento de parágrafo de nível superior
// (ignora <p> dentro de <li>/<blockquote>, onde um <p> extra quebraria a lista).
function insereAposParagrafo(html, n, bloco) {
  let depth = 0, count = 0;
  const re = /<\/?(ul|ol|blockquote|table|figure)\b[^>]*>|<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0].toLowerCase();
    if (tag === '</p>') {
      if (depth === 0 && ++count === n) {
        const at = m.index + m[0].length;
        return html.slice(0, at) + '\n' + bloco + html.slice(at);
      }
    } else if (tag.startsWith('</')) depth = Math.max(0, depth - 1);
    else depth += 1;
  }
  return html + '\n' + bloco;
}
const contaParagrafos = (html) => (html.match(/<\/p>/gi) || []).length;

function blocoLeiaTambem(temaKey, lang) {
  const rotulo = lang === 'pt' ? 'Leia também:' : 'Read next:';
  const pagina = linkPagina(temaKey, lang);
  const pilar = linkPilar(temaKey, lang);
  // Evita repetir o mesmo link quando página e pilar coincidem.
  const partes = pagina === pilar ? [pagina] : [pagina, pilar];
  return `<p><strong>${rotulo}</strong> ${partes.join(' · ')}</p>`;
}

function blocoCtaMuseu(slug) {
  const c = TOP_MUSEU[slug];
  const t = TEMAS[c.tema];
  const pagina = c.lang === 'pt' ? `<a href="${href(t.pt)}">${t.aPt}</a>` : `<a href="${href(t.en)}">${t.aEn}</a>`;
  const pilar = c.lang === 'pt' ? `<a href="${href(PILAR.b2b.pt)}">descarte para empresas</a>` : `<a href="${href(PILAR.b2b.en)}">e-waste collection for businesses</a>`;
  const fecho = c.lang === 'pt' ? `Para volumes corporativos, veja ${pilar}.` : `For corporate volumes, see ${pilar}.`;
  return `<blockquote class="ecb-cta"><p><strong>${c.titulo}</strong></p><p>${c.texto} ${pagina}. ${fecho}</p></blockquote>`;
}

// ---------------------------------------------------------------------------
const POSTS = [['content/priority-posts.json', 'pt'], ['content/migrated-posts.json', 'pt'], ['content/en-posts.json', 'en']];
const PAGINAS_SIMPLES = [
  ['content/material-pages.json', 'pt'], ['content/search-intent-pages.json', 'pt'], ['content/institutional-pages.json', 'pt'],
  ['content/pages.json', 'pt'], ['content/en-paginas.json', 'en']
];
const SEM_LEITURAS = new Set(['politica-de-privacidade', 'privacy-policy', 'contato', 'contact', 'sobre', 'about', 'publicacoes', 'technical-publications', 'ecobraz-villanova-esg', 'request-a-collection']);

const resumo = {postsComLeiaTambem: 0, postsJaTinham: 0, ctasMuseu: 0, paginasComLeituras: 0, landingsComLeituras: 0};
const postsPorTema = {pt: {}, en: {}};

// 1 + 2: posts
for (const [rel, lang] of POSTS) {
  const posts = await read(rel);
  for (const post of posts) {
    const tema = temaDe(post.slug);
    (postsPorTema[lang][tema] ||= []).push({slug: post.slug, title: post.title});
    const marcador = lang === 'pt' ? '<strong>Leia também:</strong>' : '<strong>Read next:</strong>';
    if (TOP_MUSEU[post.slug]) {
      if (!post.html.includes(`<strong>${TOP_MUSEU[post.slug].titulo}</strong>`)) {
        const meio = Math.max(3, Math.round(contaParagrafos(post.html) * 0.45));
        post.html = insereAposParagrafo(post.html, meio, blocoCtaMuseu(post.slug));
        resumo.ctasMuseu += 1;
      }
      continue; // o CTA já traz página do material + pilar
    }
    if (post.html.includes(marcador)) { resumo.postsJaTinham += 1; continue; }
    const pos = Math.min(3, Math.max(2, Math.round(contaParagrafos(post.html) / 3)));
    post.html = insereAposParagrafo(post.html, pos, blocoLeiaTambem(tema, lang));
    resumo.postsComLeiaTambem += 1;
  }
  await write(rel, posts);
}

// Posts recomendados para uma página: mesmo tema; completa com "geral".
// Rotação por tema (cursor cíclico): páginas do mesmo tema recebem posts
// diferentes, para espalhar os links de entrada por todo o acervo em vez de
// concentrar nos 3 primeiros da lista.
const cursores = {};
function proximos(lang, tema, n, excluir) {
  const pool = (postsPorTema[lang][tema] || []).filter((p) => !excluir.has(p.slug));
  if (!pool.length) return [];
  const chave = `${lang}:${tema}`;
  const inicio = cursores[chave] || 0;
  const escolhidos = [];
  for (let i = 0; i < pool.length && escolhidos.length < n; i += 1) escolhidos.push(pool[(inicio + i) % pool.length]);
  cursores[chave] = (inicio + escolhidos.length) % pool.length;
  return escolhidos;
}
function leiturasPara(slugPagina, lang) {
  const tema = temaDe(slugPagina);
  const excluir = new Set();
  const doTema = proximos(lang, tema, 3, excluir);
  doTema.forEach((p) => excluir.add(p.slug));
  const complemento = tema !== 'geral' && doTema.length < 3 ? proximos(lang, 'geral', 3 - doTema.length, excluir) : [];
  return [...doTema, ...complemento];
}

// 3: páginas simples (HTML direto no Ghost)
for (const [rel, lang] of PAGINAS_SIMPLES) {
  const paginas = await read(rel);
  for (const pagina of paginas) {
    if (SEM_LEITURAS.has(pagina.slug)) continue;
    const titulo = lang === 'pt' ? 'Leia também' : 'Read next';
    const marcador = `<h2>${titulo}</h2>`;
    const leituras = leiturasPara(pagina.slug, lang);
    if (!leituras.length) continue;
    const lista = `<ul>${leituras.map((p) => `<li><a href="/blog/${p.slug}/">${p.title}</a></li>`).join('')}</ul>`;
    const bloco = `${marcador}${lista}`;
    if (pagina.html.includes(marcador)) {
      // Atualiza o bloco existente (lista pode mudar quando entram posts novos).
      pagina.html = pagina.html.replace(new RegExp(`${marcador}<ul>.*?</ul>`, 's'), bloco);
    } else {
      pagina.html = `${pagina.html}\n${bloco}`;
    }
    resumo.paginasComLeituras += 1;
  }
  await write(rel, paginas);
}

// 4: landings geradas — grava `leituras` na fonte; o build renderiza.
for (const [rel, lang] of [['landing/landing-pages.json', 'pt'], ['landing/landing-pages-en.json', 'en']]) {
  const landings = await read(rel);
  for (const p of landings) {
    const leituras = leiturasPara(p.slug, lang).map((x) => x.slug);
    if (!leituras.length) continue;
    p.leituras = leituras;
    resumo.landingsComLeituras += 1;
  }
  await write(rel, landings);
}

console.log(JSON.stringify(resumo, null, 2));
if (dry) console.log('(dry-run: nada gravado)');
