// Diagnóstico: o tráfego do ecobraz.org passa pelo PROXY do Cloudflare do
// cliente (laranja) — condição necessária para o Google Tag Gateway rewrever a
// tag first-party — ou o domínio é "DNS only" (cinza) apontando para o Ghost?
// Também mostra se o HTML entregue ainda referencia googletagmanager.com.
import dns from 'node:dns/promises';

const base = (process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const host = new URL(base).host;

// 1. DNS: para onde o apex/www resolvem
for (const h of [host, `www.${host}`]) {
  try {
    const a = await dns.resolve4(h).catch(() => []);
    const cn = await dns.resolveCname(h).catch(() => []);
    console.log(`DNS ${h}: A=${a.join(', ') || '—'}${cn.length ? ` | CNAME=${cn.join(', ')}` : ''}`);
  } catch (e) { console.log(`DNS ${h}: erro ${e.message}`); }
}

// 2. Cabeçalhos da resposta (quem está na frente)
const r = await fetch(`${base}/`, {redirect: 'manual'});
const H = (k) => r.headers.get(k) || '—';
console.log(`\nHTTP ${r.status}`);
for (const k of ['server', 'cf-ray', 'cf-cache-status', 'via', 'x-served-by', 'x-cache', 'x-ghost-cache-status', 'nel', 'report-to', 'content-security-policy']) {
  console.log(`  ${k}: ${H(k)}`);
}

// 3. O HTML entregue ainda carrega a tag por googletagmanager.com? Há caminho first-party?
const html = await r.text().catch(() => '');
const temGtm = /googletagmanager\.com\/gtag\/js/.test(html);
console.log(`\nHTML referencia googletagmanager.com/gtag/js: ${temGtm ? 'SIM (não reescrito)' : 'não'}`);
// Sinais de reescrita first-party (caminho de medição do gateway)
const firstParty = html.match(/src="\/[^"']*gtag[^"']*"|\/metrics\/|\/cdn-cgi\/zaraz|_cf|first[_-]?party|server_container_url/gi) || [];
console.log(`Sinais de caminho first-party no HTML: ${firstParty.length ? firstParty.slice(0, 6).join(' | ') : 'nenhum'}`);

// 4. O gateway costuma expor um caminho de medição no próprio domínio; testa alguns comuns
for (const path of ['/cdn-cgi/zaraz/s.js', '/cdn-cgi/trace', '/metrics']) {
  try { const t = await fetch(`${base}${path}`, {redirect: 'manual'}); console.log(`teste ${path} -> HTTP ${t.status}`); } catch { console.log(`teste ${path} -> erro`); }
}
