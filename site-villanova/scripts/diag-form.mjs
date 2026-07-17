// Diagnóstico do formulário: (1) testa a chave Web3Forms direto na API
// (server-side, sem CORS); (2) confere o que está publicado na página.
const KEY = 'e92c1709-3b84-4b64-b4e9-7c9ddb1be472';
const base = 'https://www.villanovaesg.com';

// 1. POST direto na API do Web3Forms
try {
  const r = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
    body: JSON.stringify({access_key: KEY, subject: 'Diagnóstico server-side', name: 'Diagnostico', email: 'teste@villanovaesg.com', message: 'teste direto da API, pode ignorar'}),
  });
  const j = await r.json().catch(() => ({}));
  console.log(`Web3Forms API -> HTTP ${r.status} | ${JSON.stringify(j)}`);
} catch (e) { console.log('Web3Forms API -> erro:', e.message); }

// 2. Página publicada: qual data-endpoint e tem access_key?
for (const path of ['/solicitar-analise/', '/supplier-evidence-risk-intake/']) {
  const html = await (await fetch(`${base}${path}`, {cache: 'no-store'})).text().catch(() => '');
  const ep = (html.match(/data-endpoint="([^"]*)"/) || [])[1] || '(ausente)';
  const key = /e92c1709/.test(html);
  const temForm = /data-intake-form/.test(html);
  const jsRef = (html.match(/form-intake\.js[^"']*/) || [])[0] || '(sem ref)';
  console.log(`${path} -> form=${temForm} | data-endpoint="${ep}" | access_key=${key} | ${jsRef}`);
}

// 3. Asset JS publicado é a versão FormData/web3forms?
const js = await (await fetch(`${base}/assets/js/form-intake.js`, {cache: 'no-store'})).text().catch(() => '');
console.log(`form-intake.js -> FormData:${/new FormData/.test(js)} | web3formsSuccess:${/j\.success/.test(js)} | tamanho:${js.length}`);
