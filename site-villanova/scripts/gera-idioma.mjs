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

// A REGRA DE OURO DESTE ARQUIVO, e ela mudou em 09/09/2026 depois de medir:
// NUNCA declare display no idioma que está LIGADO. Só esconda os outros.
//
// A versão anterior fazia o contrário: escondia tudo e depois religava o
// idioma da página com display:revert (PT) ou display:inline (IT). Para isso
// funcionar era preciso adivinhar o tipo de caixa de cada elemento, e vinham
// as remendagens: nav.only-it vira flex, div.only-it vira flex, .cols.only-it
// vira grade. Uma lista de exceções escrita à mão nunca alcança o CSS que
// cresce do lado.
//
// Medido em 09/09/2026, comparando o display calculado de cada elemento nos
// três idiomas na mesma página:
//   nav.main .... EN flex   PT block  IT flex   -> menu PT quebrava em 2 linhas
//   div.cols .... EN grid   PT block  IT grid   -> colunas do rodapé PT empilhavam
//   a.top-cta ... EN flex   PT block  IT block  -> botão principal perdia o inline-flex
//   div.legal ... EN block  PT block  IT flex   -> a regra div.only-it{flex} era ampla demais
// Quatro defeitos, uma causa só, e nenhum deles aparecia em inglês — que é
// justamente onde a gente sempre olha primeiro.
//
// A inversão: o idioma ligado não recebe declaração nenhuma de display, então
// ele herda exatamente o que o main.css e o v2.css mandam, igualzinho ao
// inglês. Some a adivinhação, somem as exceções, e some a classe inteira de
// bug. O preço é um seletor comprido de :not() encadeado — que não custa nada
// porque este arquivo é gerado.
//
// Uso :not(.a):not(.b) encadeado, e não :not(.a, .b): a forma com lista dentro
// do :not() é mais nova e não quero depender dela para uma regra que decide se
// a página aparece no idioma certo.
const naoE = (sel) => sel.map((s) => `:not(.${s.replace('body.', '')})`).join('');

const css = `/* GERADO por scripts/gera-idioma.mjs a partir de content/pares-idioma.json — não edite à mão.

   ATENÇÃO ao ler: aqui só existe REGRA DE ESCONDER. O idioma que está ligado
   não recebe nenhuma declaração de display — ele fica com o que o main.css e o
   v2.css deram, igual ao inglês. Foi assim que quatro defeitos silenciosos
   morreram de uma vez (menu PT em duas linhas, rodapé PT empilhado, botão
   principal PT/IT sem inline-flex, .legal italiano virando flex). Se você
   sentir vontade de escrever display:algo aqui para "religar" um idioma, é
   sinal de que o CSS de verdade está faltando — conserte lá, não aqui. */

/* Português aparece só em página portuguesa. */
body${naoE(seletoresPt)} .only-pt{display:none !important}

/* Italiano aparece só em página italiana. */
body${naoE(seletoresIt)} .only-it{display:none !important}

/* Inglês some nas páginas dos outros dois. */
${lista(seletoresPt, '.only-en')},
${lista(seletoresIt, '.only-en')}{display:none !important}
`;
await fs.writeFile('site-villanova/theme/assets/css/lang.css', css);
console.log(`lang.css gerado: ${seletoresPt.length} seletores PT, ${seletoresIt.length} seletores IT — só regras de esconder.`);
