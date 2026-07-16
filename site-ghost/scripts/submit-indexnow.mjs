// IndexNow: avisa o Bing (e demais buscadores participantes) sobre as URLs
// publicadas do site logo após cada deploy. Lê o sitemap vivo do Ghost, junta
// todas as URLs e envia em um único POST para api.indexnow.org.
// A chave é pública por definição do protocolo e PRECISA estar na raiz do
// domínio (o protocolo só aceita URLs no mesmo diretório da chave ou abaixo).
// O Ghost(Pro) não serve arquivos na raiz, então quem responde por
// /<chave>.txt é o worker ahrefs-bot-analytics na Cloudflare.
const SITE = String(process.argv[2] || 'https://ecobraz.org').replace(/\/$/, '');
const KEY = '12c72def66356cc12abec2a1f93c9e1f';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;

const fetchText = async (url) => {
  const response = await fetch(url, {headers: {'User-Agent': 'EcobrazIndexNow/1.0'}});
  if (!response.ok) throw new Error(`${url} respondeu ${response.status}`);
  return response.text();
};

// O arquivo de verificação precisa estar no ar antes de qualquer envio.
const keyBody = (await fetchText(KEY_LOCATION)).trim();
if (keyBody !== KEY) throw new Error(`Arquivo de verificação divergente em ${KEY_LOCATION}`);

const locsOf = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
const index = await fetchText(`${SITE}/sitemap.xml`);
const childSitemaps = locsOf(index).filter((u) => u.endsWith('.xml'));
const urls = new Set();
for (const sitemap of childSitemaps.length ? childSitemaps : [`${SITE}/sitemap.xml`]) {
  for (const loc of locsOf(await fetchText(sitemap))) if (!loc.endsWith('.xml')) urls.add(loc);
}
if (!urls.size) throw new Error('Nenhuma URL encontrada no sitemap');

// O IndexNow exige que todas as URLs sejam do mesmo host da chave; qualquer
// intruso (outro domínio/subdomínio no sitemap) derruba o envio inteiro.
const host = new URL(SITE).hostname;
const sameHost = [];
const dropped = [];
for (const loc of urls) {
  try { (new URL(loc).hostname === host ? sameHost : dropped).push(loc); }
  catch { dropped.push(loc); }
}
if (dropped.length) console.log(`AVISO: ${dropped.length} URL(s) fora de ${host} descartada(s):`, dropped.slice(0, 10));
if (!sameHost.length) throw new Error(`Nenhuma URL do sitemap pertence a ${host} — exemplos: ${dropped.slice(0, 5).join(', ')}`);

const payload = {host, key: KEY, keyLocation: KEY_LOCATION, urlList: sameHost.slice(0, 10000)};
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: {'Content-Type': 'application/json; charset=utf-8'},
  body: JSON.stringify(payload),
});
if (response.status !== 200 && response.status !== 202) {
  throw new Error(`IndexNow respondeu ${response.status}: ${(await response.text()).slice(0, 300)}`);
}
console.log(`IndexNow: ${payload.urlList.length} URLs enviadas (HTTP ${response.status}).`);
