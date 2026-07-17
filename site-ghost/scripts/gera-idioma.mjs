// Gera theme/assets/css/lang.css a partir de content/pares-idioma.json.
// Páginas EN identificadas pela classe body `page-<slug-en>`; posts EN pela
// classe `tag-hash-en`. Determinístico: rode e commite a saída.
import fs from 'node:fs/promises';

const pares = JSON.parse(await fs.readFile('site-ghost/pares-idioma.json', 'utf8'));
const seletores = ['body.tag-hash-en'];
for (const par of pares.pages) {
  if (par.en) seletores.push(`body.page-${par.en}`);
}

const sel = (sub) => seletores.map((s) => `${s} ${sub}`).join(',\n');
const esconderPt = sel('.only-pt');
const mostrarEn = sel('.only-en');

// O reveal geral usa `display:revert`, que devolve cada elemento ao padrão do
// HTML (block/inline). Isso quebra elementos com layout específico no idioma EN
// (menu = flex, botões = inline-flex, blocos de CTA = flex). No mobile o próprio
// block é o correto; então só restauramos o display no desktop, na largura certa.
const css = `/* GERADO por scripts/gera-idioma.mjs a partir de content/pares-idioma.json — não edite à mão. */
.only-en{display:none !important}
${esconderPt}{display:none !important}
${mostrarEn}{display:revert !important}

/* Correção de layout no idioma EN (ver comentário no gerador). */
${sel('.button.only-en:not(.header-cta)')}{display:inline-flex !important}
@media(min-width:901px){
${sel('.primary-nav ul.only-en')}{display:flex !important}
${sel('.header-cta.only-en')}{display:inline-flex !important}
}
@media(max-width:900px){
${sel('.header-cta.only-en')}{display:none !important}
}
@media(min-width:621px){
${sel('.article-cta.only-en')}{display:flex !important}
${sel('.page-conversion.only-en')}{display:flex !important}
}
`;
await fs.writeFile('site-ghost/theme/assets/css/lang.css', css);
console.log(`lang.css gerado com ${seletores.length} seletores EN.`);
