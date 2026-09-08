// Mostra, por inteiro, todos os blocos de dados estruturados (JSON-LD) que uma
// página está servindo — e aponta entidade declarada duas vezes.
//
// Uso: node mostra-schema.mjs <url> [url2 ...]
//
// Por que existe: a ferramenta de grep mostra trechos, e trecho esconde
// contexto. Ao investigar o erro de validação de schema nas páginas de tag,
// os trechos mostravam "ProfessionalService" e "Series" soltos, sem dizer de
// qual bloco vinham nem se havia bloco repetido. Aqui sai o texto completo de
// cada bloco, na ordem em que aparece no HTML, mais um resumo de tipos e de
// "@id" repetidos entre blocos — que é o sintoma de duas definições
// concorrentes da mesma entidade.
//
// Só leitura.

const urls = process.argv.slice(2);
if (!urls.length) throw new Error('Informe pelo menos uma URL.');

const BLOCO = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// Coleta todo "@type" e todo "@id" de qualquer profundidade.
const colhe = (no, tipos, ids) => {
  if (Array.isArray(no)) return no.forEach((x) => colhe(x, tipos, ids));
  if (no && typeof no === 'object') {
    for (const t of [].concat(no['@type'] || [])) if (typeof t === 'string') tipos.push(t);
    if (typeof no['@id'] === 'string') ids.push(no['@id']);
    return Object.values(no).forEach((x) => colhe(x, tipos, ids));
  }
};

for (const url of urls) {
  console.log(`\n${'='.repeat(72)}\n${url}\n${'='.repeat(72)}`);
  let html;
  try {
    const r = await fetch(url, {redirect: 'follow', signal: AbortSignal.timeout(25000)});
    if (!r.ok) { console.log(`FALHA ${r.status}`); continue; }
    html = await r.text();
  } catch (e) {
    console.log(`ERRO: ${e.message}`);
    continue;
  }

  const blocos = [...html.matchAll(BLOCO)].map((m) => m[1]);
  console.log(`Blocos de JSON-LD encontrados: ${blocos.length}\n`);

  const porBloco = [];
  blocos.forEach((corpo, i) => {
    console.log(`----- bloco ${i + 1} -----`);
    let dado;
    try {
      dado = JSON.parse(corpo);
    } catch (e) {
      console.log(`JSON INVÁLIDO (${e.message}). Texto cru:\n${corpo.trim().slice(0, 1500)}`);
      porBloco.push({tipos: [], ids: []});
      return;
    }
    console.log(JSON.stringify(dado, null, 2));
    const tipos = [];
    const ids = [];
    colhe(dado, tipos, ids);
    porBloco.push({tipos, ids});
    console.log('');
  });

  console.log('----- resumo -----');
  porBloco.forEach((b, i) => console.log(`bloco ${i + 1}: ${[...new Set(b.tipos)].sort().join(', ') || '(vazio)'}`));

  // Um "@id" que aparece em dois blocos é a mesma entidade definida duas vezes.
  const onde = new Map();
  porBloco.forEach((b, i) => new Set(b.ids).forEach((id) => {
    if (!onde.has(id)) onde.set(id, []);
    onde.get(id).push(i + 1);
  }));
  const repetidos = [...onde].filter(([, blocos]) => blocos.length > 1);
  if (repetidos.length) {
    console.log(`\nENTIDADES DEFINIDAS EM MAIS DE UM BLOCO: ${repetidos.length}`);
    repetidos.forEach(([id, b]) => console.log(`  ${id}  (blocos ${b.join(' e ')})`));
  } else {
    console.log('\nNenhum "@id" repetido entre blocos.');
  }

  // Tipos abstratos que os validadores recusam.
  const ABSTRATOS = ['Series', 'CreativeWork', 'Intangible', 'Thing', 'StructuredValue'];
  const achados = [...new Set(porBloco.flatMap((b) => b.tipos))].filter((t) => ABSTRATOS.includes(t));
  if (achados.length) console.log(`\nTipos genéricos/abstratos usados como @type: ${achados.join(', ')}`);
}
