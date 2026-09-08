// Gera theme/assets/css/lang.css a partir de content/pares-idioma.json.
//
// Páginas PT são identificadas pela classe body `page-<slug>`; posts PT pela
// classe `tag-hash-pt`; arquivos de tag PT pela classe `tag-<slug>`. O mesmo
// vale para o italiano, pelo campo "it" de cada par e por `tag-hash-it`.
// Determinístico: rode e commite a saída.
//
// Por que o italiano passou a ser gerado aqui: as regras dele viviam chumbadas
// no v2.css cobrindo apenas /it/ e /richiedi-analisi/. Os pares já declaravam
// SEIS páginas em italiano, então as outras quatro — analisi-evidenze-
// fornitori-brasiliani, revisione-evidenze-cbam, revisione-evidenze-eudr e
// revisione-clausole-due-diligence — serviam o rodapé e os blocos em inglês.
// Uma lista escrita à mão ao lado de outra que cresce sozinha sempre atrasa;
// agora as duas saem da mesma fonte.
import fs from 'node:fs/promises';

const pares = JSON.parse(await fs.readFile('site-villanova/content/pares-idioma.json', 'utf8'));

const seletoresPt = ['body.tag-hash-pt'];
for (const par of pares.pages) {
  if (par.pt && par.pt !== '') seletoresPt.push(`body.page-${par.pt}`);
}
for (const tag of pares.pt_tags || []) seletoresPt.push(`body.tag-${tag}`);

const seletoresIt = ['body.tag-hash-it'];
for (const par of pares.pages) {
  if (par.it) seletoresIt.push(`body.page-${par.it}`);
}
for (const tag of pares.it_tags || []) seletoresIt.push(`body.tag-${tag}`);

const lista = (sel, sufixo) => sel.map((s) => `${s} ${sufixo}`).join(',\n');

const css = `/* GERADO por scripts/gera-idioma.mjs a partir de content/pares-idioma.json — não edite à mão. */
.only-pt{display:none !important}
${lista(seletoresPt, '.only-en')}{display:none !important}
${lista(seletoresPt, '.only-pt')}{display:revert !important}

/* Italiano: esconde os outros dois idiomas e liga o próprio, respeitando o tipo
   de caixa de cada elemento (linha, flex e grade). */
${lista(seletoresIt, '.only-en')},
${lista(seletoresIt, '.only-pt')}{display:none !important}
${lista(seletoresIt, '.only-it')}{display:inline !important}
${lista(seletoresIt, 'nav.only-it')},
${lista(seletoresIt, 'div.only-it')}{display:flex !important}
${lista(seletoresIt, '.cols.only-it')}{display:grid !important}
`;
await fs.writeFile('site-villanova/theme/assets/css/lang.css', css);
console.log(`lang.css gerado: ${seletoresPt.length} seletores PT, ${seletoresIt.length} seletores IT.`);
