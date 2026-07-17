// Diagnóstico do formulário: (1) testa a chave Web3Forms direto na API
// (server-side, sem CORS); (2) confere o que está publicado na página.
const KEY = 'e92c1709-3b84-4b64-b4e9-7c9ddb1be472';
const base = 'https://www.villanovaesg.com';

// 1. POST direto na API do Web3Forms (com cabeçalhos de navegador)
try {
  const r = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'Origin': 'https://www.villanovaesg.com', 'Referer': 'https://www.villanovaesg.com/',
    },
    body: JSON.stringify({access_key: KEY, subject: 'Diagnóstico server-side', name: 'Diagnostico', email: 'teste@villanovaesg.com', message: 'teste direto da API, pode ignorar'}),
  });
  const txt = await r.text();
  const server = r.headers.get('server') || '';
  console.log(`Web3Forms API -> HTTP ${r.status} | server=${server} | corpo(400): ${txt.slice(0, 400).replace(/\s+/g, ' ')}`);
} catch (e) { console.log('Web3Forms API -> erro:', e.message); }

// 2. Página publicada: form ok? e as CLASSES de design sobreviveram à publicação?
for (const path of ['/solicitar-analise/', '/supplier-evidence-risk-intake/', '/csddd-due-diligence/']) {
  const html = await (await fetch(`${base}${path}`, {cache: 'no-store'})).text().catch(() => '');
  const ep = (html.match(/data-endpoint="([^"]*)"/) || [])[1] || '(ausente)';
  const temForm = /data-intake-form/.test(html);
  const conta = (rx) => (html.match(rx) || []).length;
  console.log(`${path} -> form=${temForm} | endpoint=${ep !== '(ausente)'} | classes de design: vn-steps=${conta(/class="vn-steps"/g)} vn-cards=${conta(/class="vn-cards"/g)} vn-card=${conta(/class="vn-card"/g)} vn-cta=${conta(/class="vn-cta"/g)}`);
}

// 3. Asset JS publicado é a versão FormData/web3forms?
const js = await (await fetch(`${base}/assets/js/form-intake.js`, {cache: 'no-store'})).text().catch(() => '');
console.log(`form-intake.js -> FormData:${/new FormData/.test(js)} | web3formsSuccess:${/j\.success/.test(js)} | tamanho:${js.length}`);
