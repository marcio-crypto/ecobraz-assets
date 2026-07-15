import fs from 'node:fs';
import path from 'node:path';

const siteRoot = path.resolve(import.meta.dirname, '..');
const root = fs.existsSync(path.join(siteRoot, 'theme')) ? path.join(siteRoot, 'theme') : siteRoot;
const contentDir = path.join(siteRoot, 'content');
const files = fs.readdirSync(contentDir).filter((name) => name.endsWith('.json')).sort();
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

const form = fs.readFileSync(path.join(root, 'custom-agendamento.hbs'), 'utf8');
for (const required of ['Eletrodomésticos', 'Cabos e fios', 'Informática e TI', 'Servidores e data center']) {
  if (!form.includes(`<option>${required}</option>`)) errors.push(`Collection form missing category: ${required}`);
}
for (const requiredField of ['profile', 'material_category', 'volume', 'material_description', 'postal_code', 'city', 'state', 'name', 'email', 'phone', 'service_consent']) {
  if (!form.includes(`name="${requiredField}"`)) errors.push(`Collection form missing required field: ${requiredField}`);
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
  if (targetRoute && !knownRoutes.has(targetRoute)) errors.push(`Redirect target does not exist: ${source} -> ${target}`);
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
