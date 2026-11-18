import fs from 'node:fs';
import path from 'node:path';

const siteRoot = path.resolve(import.meta.dirname, '..');
const root = fs.existsSync(path.join(siteRoot, 'theme')) ? path.join(siteRoot, 'theme') : siteRoot;
const contentDir = path.join(siteRoot, 'content');
// tags-meta.json tem formato próprio (metadados de tag: slug + meta_description),
// não é página/post — fica fora desta auditoria de páginas.
const files = fs.readdirSync(contentDir).filter((name) => name.endsWith('.json') && name !== 'tags-meta.json').sort();
const pages = files.flatMap((name) => {
  const parsed = JSON.parse(fs.readFileSync(path.join(contentDir, name), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${name}: expected an array`);
  return parsed.map((page) => ({...page, sourceFile: name}));
});

const errors = [];
const warnings = [];
const seen = new Map();
const fixedRoutes = new Set(['agendamento', 'blog', 'como-funciona']);

for (const page of pages) {
  const label = `${page.sourceFile}:${page.slug || '(missing slug)'}`;
  for (const field of ['title', 'slug', 'custom_excerpt', 'meta_title', 'meta_description', 'html']) {
    if (!String(page[field] || '').trim()) errors.push(`${label}: missing ${field}`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug || '')) errors.push(`${label}: invalid slug`);
  if (seen.has(page.slug)) errors.push(`${label}: duplicate slug also in ${seen.get(page.slug)}`);
  seen.set(page.slug, page.sourceFile);
  if ((page.meta_title || '').length > 70) warnings.push(`${label}: meta title has ${page.meta_title.length} characters`);
  if ((page.meta_description || '').length > 165) warnings.push(`${label}: meta description has ${page.meta_description.length} characters`);
  if (/http:\/\//i.test(page.html || '')) errors.push(`${label}: insecure HTTP link`);
  if (/<h1\b/i.test(page.html || '')) errors.push(`${label}: content must not add a second H1`);
}

const priorityPosts = pages.filter((page) => page.sourceFile === 'priority-posts.json');
const managedPages = pages.filter((page) => page.sourceFile !== 'priority-posts.json');
const knownSlugs = new Set([...managedPages.map((page) => page.slug), ...fixedRoutes]);
const knownRoutes = new Set([
  ...knownSlugs,
  ...priorityPosts.map((post) => `blog/${post.slug}`)
]);
const landingTemplates = fs.readdirSync(root).filter((name) => name.startsWith('page-') && name.endsWith('.hbs'));
const sourceText = [
  ...pages.map((page) => page.html),
  fs.readFileSync(path.join(root, 'home.hbs'), 'utf8'),
  fs.readFileSync(path.join(root, 'partials', 'header.hbs'), 'utf8'),
  fs.readFileSync(path.join(root, 'partials', 'footer.hbs'), 'utf8'),
  ...landingTemplates.map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
].join('\n');

for (const match of sourceText.matchAll(/href=["'](?:{{@site\.url}})?\/([^?#"'\s]+?)(?:\/)?(?:\?[^"'\s]*)?["']/g)) {
  const route = match[1].replace(/^\/+|\/+$/g, '');
  if (route && !knownSlugs.has(route)) warnings.push(`Internal link target not managed by page sync: /${route}/`);
}

// Contrato do formulário de coleta (TELA ÚNICA, 31/07/2026): todos os campos
// numa tela só, perfil como alternador com pessoa física pré-selecionada,
// nada de assistente em passos. Vale para o PT e para o espelho EN.
const collectionForms = [
  ['custom-agendamento.hbs', true],
  ['page-request-a-collection.hbs', false]
];
for (const [formFile, isPt] of collectionForms) {
  const form = fs.readFileSync(path.join(root, formFile), 'utf8');
  if (isPt) {
    for (const required of ['Eletrodomésticos', 'Cabos e fios', 'Informática e TI', 'Servidores e data center']) {
      if (!form.includes(`<option>${required}</option>`)) errors.push(`${formFile}: collection form missing category: ${required}`);
    }
  } else {
    // O EN traduz o rótulo mas envia o valor PT que o Worker espera.
    for (const required of ['Eletrodomésticos', 'Cabos e fios', 'Informática e TI', 'Servidores e data center']) {
      if (!form.includes(`value="${required}"`)) errors.push(`${formFile}: collection form missing category value: ${required}`);
    }
  }
  for (const requiredField of ['profile', 'material_category', 'volume', 'material_description', 'postal_code', 'city', 'state', 'name', 'email', 'phone', 'service_consent']) {
    if (!form.includes(`name="${requiredField}"`)) errors.push(`${formFile}: collection form missing required field: ${requiredField}`);
  }
  // Tela única: o assistente em passos não pode voltar.
  for (const forbidden of ['data-form-step', 'data-next-step', 'data-prev-step']) {
    if (form.includes(forbidden)) errors.push(`${formFile}: wizard markup is back (${forbidden}) — the form must stay single-screen`);
  }
  // Perfil pré-selecionado (pessoa física = maior tráfego) no alternador.
  if (!form.includes('value="pessoa_fisica" checked')) errors.push(`${formFile}: profile toggle must preselect pessoa_fisica`);
  if (!form.includes('data-collection-form')) errors.push(`${formFile}: missing data-collection-form hook`);
  if (!form.includes('data-form-status')) errors.push(`${formFile}: missing data-form-status hook`);
  if (!form.includes('name="ecb_nao_preencher"')) errors.push(`${formFile}: missing anti-spam honeypot field`);
  // A armadilha antiga (name="website", fora da tela mas visível para assistentes de IA)
  // não pode voltar: se preenchida, o pedido real era descartado em silêncio.
  if (form.includes('name="website"')) errors.push(`${formFile}: honeypot antigo name="website" voltou — use ecb_nao_preencher dentro de bloco display:none`);
  // Formulário declarado como ferramenta para assistentes de IA (WebMCP, F040,
  // decisão do Marcio de 18/11/2026). Sem toolautosubmit: quem envia é a pessoa,
  // depois de conferir os dados e o consentimento. Ligar o envio automático é
  // decisão do Marcio, não ajuste técnico.
  if (!/<form[^>]*\stoolname="[a-z_]{3,30}"[^>]*\stooldescription="[^"]{40,500}"/.test(form)) errors.push(`${formFile}: <form> sem toolname/tooldescription (WebMCP, F040) ou descrição acima de 500 caracteres`);
  if (/<form[^>]*\stoolautosubmit[\s>=]/.test(form)) errors.push(`${formFile}: toolautosubmit ligado — o envio automático por assistente de IA exige decisão do Marcio`);
  for (const campo of ['profile', 'material_category', 'service_consent', 'marketing_consent']) {
    if (!new RegExp(`name="${campo}"[^>]*toolparamdescription="[^"]{10,150}"`).test(form)) errors.push(`${formFile}: campo ${campo} sem toolparamdescription (WebMCP, F040)`);
  }
}

// Ação de pedir a coleta nos dados da organização (F039, 18/11/2026). O bloco de
// dados estruturados do tema precisa continuar sendo JSON válido e apontar para
// os dois formulários (PT e EN).
{
  const layout = fs.readFileSync(path.join(root, 'default.hbs'), 'utf8');
  const bloco = layout.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!bloco) errors.push('default.hbs: bloco de dados estruturados não encontrado');
  else {
    const limpo = bloco[1]
      .replace(/\{\{!--[\s\S]*?--\}\}/g, '')
      .replace(/\{\{@site\.url\}\}/g, 'https://ecobraz.org')
      .replace(/\{\{asset "([^"]+)"\}\}/g, 'https://ecobraz.org/assets/$1');
    try {
      const org = (JSON.parse(limpo)['@graph'] || []).find((n) => String(n['@id'] || '').endsWith('/#organization'));
      const alvos = org && org.potentialAction ? [].concat(org.potentialAction.target || []).map((t) => t.urlTemplate) : [];
      for (const esperado of ['https://ecobraz.org/agendamento/', 'https://ecobraz.org/request-a-collection/']) {
        if (!alvos.includes(esperado)) errors.push(`default.hbs: dados da organização sem a ação de pedir a coleta apontando para ${esperado} (F039)`);
      }
    } catch (erro) { errors.push(`default.hbs: dados estruturados deixaram de ser JSON válido (${erro.message})`); }
  }
}

const redirectsText = fs.readFileSync(path.join(root, 'redirects.yaml'), 'utf8');
const redirectSources = new Set();
for (const line of redirectsText.split(/\r?\n/)) {
  const match = line.match(/^\s{2}("(?:[^"\\]|\\.)*"):\s+("(?:[^"\\]|\\.)*")\s*$/);
  if (!match) continue;
  const source = JSON.parse(match[1]);
  const target = JSON.parse(match[2]);
  if (redirectSources.has(source)) errors.push(`Duplicate redirect source: ${source}`);
  redirectSources.add(source);
  const targetRoute = target.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  // Alvos /assets/... apontam para arquivos do tema (ex.: llms.txt): valida no disco.
  if (targetRoute.startsWith('assets/')) {
    if (!fs.existsSync(path.join(root, targetRoute))) errors.push(`Redirect asset target missing on disk: ${source} -> ${target}`);
    // O arquivo entregue em /llms.txt é uma cópia com nome datado (o caminho fixo
    // assets/llms.txt pode ficar preso em cache a montante). A cópia tem de ser
    // idêntica a assets/llms.txt: em 18/11/2026 o prazo mudou só no original e a
    // cópia seguiu no ar com o texto antigo.
    else if (source === '^/llms\\.txt$' && targetRoute !== 'assets/llms.txt') {
      const original = fs.readFileSync(path.join(root, 'assets', 'llms.txt'));
      if (!original.equals(fs.readFileSync(path.join(root, targetRoute)))) {
        errors.push(`llms.txt: ${targetRoute} (alvo de /llms.txt) difere de assets/llms.txt — copie o original para a cópia datada`);
      }
    }
  } else if (targetRoute && !knownRoutes.has(targetRoute)) errors.push(`Redirect target does not exist: ${source} -> ${target}`);
}

const exactRedirectSource = (value) => `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\/$/, '') || '/'}\/?$`;
const inventoryPath = path.join(siteRoot, 'migration', 'legacy-url-inventory.csv');
if (fs.existsSync(inventoryPath)) {
  const rows = fs.readFileSync(inventoryPath, 'utf8').trim().split(/\r?\n/).slice(1);
  for (const row of rows) {
    const columns = row.split(',');
    if (columns[6] !== '301') continue;
    const sourcePath = decodeURIComponent(columns[4]).replace(/\/$/, '') || '/';
    const targetPath = columns[7].replace(/\/$/, '') || '/';
    if (sourcePath === targetPath) continue;
    if (!redirectSources.has(exactRedirectSource(sourcePath))) {
      errors.push(`Backlink map requires missing redirect: ${sourcePath}`);
    }
  }
}

console.log(`Audited ${pages.length} managed pages across ${files.length} files.`);
for (const warning of [...new Set(warnings)]) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`Content, internal-link, collection-form and ${redirectSources.size} redirect checks passed.`);
