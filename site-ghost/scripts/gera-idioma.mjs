// Gera theme/assets/css/lang.css a partir de content/pares-idioma.json.
// Páginas EN identificadas pela classe body `page-<slug-en>`; posts EN pela
// classe `tag-hash-en`. Determinístico: rode e commite a saída.
import fs from 'node:fs/promises';

const pares = JSON.parse(await fs.readFile('site-ghost/pares-idioma.json', 'utf8'));
const seletores = ['body.tag-hash-en'];
for (const par of pares.pages) {
  if (par.en) seletores.push(`body.page-${par.en}`);
}

const esconderPt = seletores.map((s) => `${s} .only-pt`).join(',\n');
const mostrarEn = seletores.map((s) => `${s} .only-en`).join(',\n');

const css = `/* GERADO por scripts/gera-idioma.mjs a partir de content/pares-idioma.json — não edite à mão. */
.only-en{display:none !important}
${esconderPt}{display:none !important}
${mostrarEn}{display:revert !important}
`;
await fs.writeFile('site-ghost/theme/assets/css/lang.css', css);
console.log(`lang.css gerado com ${seletores.length} seletores EN.`);
