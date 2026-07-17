// Testa, como um navegador real, se o link da ONU (iCSO/esango) abre o perfil
// da Ecobraz (código 708794) ou se cai em erro de sessão / página de busca.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const H = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
};
const urls = [
  'https://esango.un.org/civilsociety/showProfileDetail.do?method=showProfileDetails&profileCode=708794',
  'https://esango.un.org/civilsociety/',
];
for (const start of urls) {
  console.log(`\n===== ${start} =====`);
  let url = start, hop = 0;
  try {
    for (; hop < 6; hop++) {
      const r = await fetch(url, {headers: H, redirect: 'manual'});
      const loc = r.headers.get('location');
      console.log(`  [${hop}] HTTP ${r.status}${loc ? ` -> ${loc}` : ''}`);
      if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url).href; continue; }
      const body = await r.text().catch(() => '');
      const title = (body.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || '(sem title)';
      const temEcobraz = /ecobraz/i.test(body);
      const temCodigo = body.includes('708794');
      const sessao = /session (?:has )?expired|sessão expir|invalid session|please log|no longer valid/i.test(body);
      console.log(`      title: ${title.trim().slice(0, 90)}`);
      console.log(`      menciona "Ecobraz": ${temEcobraz ? 'SIM' : 'não'} | contém "708794": ${temCodigo ? 'SIM' : 'não'} | erro de sessão: ${sessao ? 'SIM' : 'não'} | tamanho: ${body.length}`);
      break;
    }
  } catch (e) { console.log(`  erro: ${e.message}`); }
}
