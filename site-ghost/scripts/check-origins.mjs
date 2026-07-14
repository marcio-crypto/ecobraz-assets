// Verifica, sem criar nenhum lead, se o Worker de coletas autoriza os domínios
// informados. Usa uma requisição CORS preflight (OPTIONS), que apenas consulta
// a lista de origens permitidas e não processa nenhum dado.
const endpoint = String(process.argv[2] || 'https://ecobraz-coletas.ti-0ab.workers.dev');
const origins = process.argv.slice(3);
if (origins.length === 0) {
  origins.push('https://ecobraz.org', 'https://www.ecobraz.org', 'https://ecobraz-emigre.ghost.io');
}

const errors = [];
for (const origin of origins) {
  let response;
  try {
    response = await fetch(`${endpoint}/api/coletas`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
  } catch (error) {
    errors.push(`${origin}: preflight falhou (${error.message})`);
    continue;
  }
  const allow = response.headers.get('access-control-allow-origin');
  if (allow === origin) {
    console.log(`AUTORIZADO ${origin}`);
  } else {
    errors.push(`${origin}: não autorizado (allow-origin recebido: ${allow || 'nenhum'})`);
  }
}

if (errors.length) {
  for (const error of errors) console.error(`ERRO: ${error}`);
  process.exit(1);
}
console.log(`Todos os ${origins.length} domínios estão autorizados a enviar o formulário.`);
