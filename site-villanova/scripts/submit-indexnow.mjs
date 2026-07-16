// Envia as URLs do sitemap do villanovaesg.com ao IndexNow (Bing e parceiros).
// A chave é servida na raiz pelo worker villanova-indexnow (Cloudflare).
const SITE = 'https://www.villanovaesg.com';
const KEY = '385d6b5556ede7e7fd3495972139ec73';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

// 1. valida a chave ao vivo antes de enviar
const chave = await fetch(KEY_LOCATION);
const corpo = (await chave.text()).trim();
if (chave.status !== 200 || corpo !== KEY) {
  throw new Error(`Chave IndexNow inválida em ${KEY_LOCATION}: HTTP ${chave.status}, corpo "${corpo.slice(0, 60)}"`);
}
console.log(`Chave validada em ${KEY_LOCATION} ✔`);

// 2. coleta as URLs do sitemap (somente páginas do próprio host)
const xml = async (u) => (await fetch(u)).text();
const locs = (s) => [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const filhos = locs(await xml(`${SITE}/sitemap.xml`)).filter((u) => u.endsWith('.xml'));
const urls = [];
for (const f of filhos) {
  urls.push(...locs(await xml(f)).filter((u) => u.startsWith(SITE) && !/\.(png|jpe?g|webp|gif|svg)$/i.test(u)));
}
console.log(`URLs coletadas do sitemap: ${urls.length}`);

// 3. envia em lote
const resposta = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: {'Content-Type': 'application/json; charset=utf-8'},
  body: JSON.stringify({host: 'www.villanovaesg.com', key: KEY, keyLocation: KEY_LOCATION, urlList: urls}),
});
console.log(`IndexNow: ${urls.length} URLs enviadas (HTTP ${resposta.status})`);
if (resposta.status >= 400) throw new Error(`IndexNow recusou: ${resposta.status} ${await resposta.text()}`);
