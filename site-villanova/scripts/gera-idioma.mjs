// Gera theme/assets/css/lang.css a partir de content/pares-idioma.json.
// Páginas PT são identificadas pela classe body `page-<slug>`; posts PT pela
// classe `tag-hash-pt`; arquivos de tag PT pela classe `tag-<slug>`.
// Determinístico: rode e commite a saída.
import fs from 'node:fs/promises';

const pares = JSON.parse(await fs.readFile('site-villanova/content/pares-idioma.json', 'utf8'));
const seletores = ['body.tag-hash-pt'];
for (const par of pares.pages) {
  if (par.pt && par.pt !== '') seletores.push(`body.page-${par.pt}`);
}
for (const tag of pares.pt_tags || []) seletores.push(`body.tag-${tag}`);

const esconderEn = seletores.map((s) => `${s} .only-en`).join(',\n');
const mostrarPt = seletores.map((s) => `${s} .only-pt`).join(',\n');

const css = `/* GERADO por scripts/gera-idioma.mjs a partir de content/pares-idioma.json — não edite à mão. */
.only-pt{display:none !important}
${esconderEn}{display:none !important}
${mostrarPt}{display:revert !important}
`;
await fs.writeFile('site-villanova/theme/assets/css/lang.css', css);
console.log(`lang.css gerado com ${seletores.length} seletores PT.`);
