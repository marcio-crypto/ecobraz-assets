// Procura substituto vivo para um link externo que morreu, sem chutar.
//
// Uso: node procura-substituto-link.mjs <url-morta> [outra-url-morta ...]
//
// Como funciona: para cada endereço, tira a query e vai encurtando o caminho um
// segmento por vez, testando cada nível. Quem responde 200 entra na lista com o
// título da página, para dar para julgar se serve como fonte. Não inventa
// endereço novo: só sobe na própria árvore do site que já era citado, que é o
// caminho mais provável quando uma página institucional é reorganizada.
//
// Escolher qual nível vira a nova citação é decisão editorial — trocar uma
// página específica pela seção que a contém muda o que a citação afirma. Por
// isso este script só apresenta as opções; não altera nada.
const alvos = process.argv.slice(2);
if (!alvos.length) throw new Error('Informe pelo menos uma URL.');

const NAVEGADOR = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

const titulo = (html) => {
  const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  return t.replace(/\s+/g, ' ').slice(0, 110);
};

// Responder 200 não basta. Muitos sites institucionais mandam o endereço que
// não existe mais para a home ou para um seletor de idioma, e isso volta 200 —
// é o "soft 404". Como fonte de citação não serve para nada: o leitor cai na
// capa do site e não encontra o documento.
//
// A primeira versão disto também marcava como soft 404 qualquer redirect que
// mudasse o primeiro segmento do caminho. Regra boa na intenção e errada na
// prática: a página da ESPR na Comissão Europeia vai de commission.europa.eu
// para environment.ec.europa.eu/strategy/circular-economy/... — mudança de
// subdomínio e de caminho inteiro, e mesmo assim chega numa página real e no
// assunto certo. Reprovar essa seria descartar um substituto bom. Ficam só os
// três sinais que de fato significam "não achei": a raiz, o index_en e o
// seletor de idioma.
const capaOuSeletor = (pedido, final) => {
  let f;
  try { f = new URL(final); } catch { return false; }
  return f.pathname === '/' || /select-language|index_en$/.test(f.pathname + f.search);
};

const testa = async (url) => {
  try {
    const r = await fetch(url, {headers: NAVEGADOR, redirect: 'follow', signal: AbortSignal.timeout(25000)});
    const corpo = r.ok ? await r.text() : '';
    return {status: r.status, final: r.url, titulo: r.ok ? titulo(corpo) : '', desviado: r.ok && capaOuSeletor(url, r.url)};
  } catch (e) {
    return {status: `erro: ${String(e.message || e).slice(0, 40)}`, final: url, titulo: '', desviado: false};
  }
};

for (const alvo of alvos) {
  console.log(`\n${'='.repeat(72)}\nMORTA: ${alvo}\n${'='.repeat(72)}`);
  const u = new URL(alvo);
  const partes = u.pathname.split('/').filter(Boolean);

  // Nível 0 é o mesmo endereço sem a query — às vezes o parâmetro é o problema.
  const candidatos = [`${u.origin}/${partes.join('/')}`];
  for (let i = partes.length - 1; i >= 0; i--) {
    candidatos.push(`${u.origin}/${partes.slice(0, i).join('/')}${i ? '/' : ''}`);
  }

  for (const c of [...new Set(candidatos)]) {
    const r = await testa(c);
    const ok = typeof r.status === 'number' && r.status >= 200 && r.status < 300;
    const marca = !ok ? '     ' : r.desviado ? 'SOFT ' : 'VIVO ';
    console.log(`  [${String(r.status).padStart(3)}] ${marca} ${c}`);
    if (ok) {
      if (r.final !== c) console.log(`         chega em: ${r.final}`);
      if (r.titulo) console.log(`         título:   ${r.titulo}`);
      if (r.desviado) console.log('         NÃO SERVE: caiu na capa ou no seletor de idioma (soft 404).');
    }
  }
}
console.log('\nVIVO = serve como fonte. SOFT = responde 200 mas joga o leitor na capa: não serve.');
console.log('Nada foi alterado — este script só lê. A escolha da nova fonte é editorial.');
