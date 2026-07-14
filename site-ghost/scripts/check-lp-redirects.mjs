// Verifica se o espelho lp.ecobraz.org redireciona cada URL até a página
// final no site oficial, seguindo toda a cadeia de 301 e exigindo 200 no fim.
const mirror = 'https://lp.ecobraz.org';
const canonicalHost = 'ecobraz.org';

// Amostra: raiz + URLs do espelho com cliques/impressões no Search Console
// e caminhos representativos do inventário legado.
const paths = [
  '/',
  '/blog/normas-da-antt-e-abnt-para-transporte-de-baterias-de-litio',
  '/pt_BR/como-funciona',
  '/descarte/equipamentos-hospitalares',
  '/sanitizacao-de-hd',
  '/contato',
  '/descarte/ar-condicionado',
  '/eletronicos'
];

const errors = [];
for (const path of paths) {
  let response;
  try {
    response = await fetch(`${mirror}${path}`, {redirect: 'follow', headers: {'User-Agent': 'Ecobraz lp redirect audit'}});
  } catch (error) {
    errors.push(`${path}: falha na requisição (${error.message})`);
    continue;
  }
  const finalUrl = new URL(response.url);
  if (finalUrl.hostname !== canonicalHost && finalUrl.hostname !== `www.${canonicalHost}`) {
    errors.push(`${path}: terminou em ${response.url} (host inesperado)`);
    continue;
  }
  if (!response.ok) {
    errors.push(`${path}: destino final respondeu ${response.status} (${response.url})`);
    continue;
  }
  console.log(`OK ${mirror}${path} -> ${response.url}`);
}

if (errors.length) {
  for (const error of errors) console.error(`ERRO: ${error}`);
  process.exit(1);
}
console.log(`Todos os ${paths.length} caminhos do espelho lp chegam ao site oficial com 200.`);
