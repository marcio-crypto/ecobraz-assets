// Renderiza os carrosséis (documentos do LinkedIn) da campanha: 1200x1500 por
// slide, um PNG por página, e opcionalmente sobe tudo para o Ghost.
//
//   node site-villanova/scripts/renderiza-carrossel.mjs \
//     --spec site-villanova/campanhas/VESG-LI-2026-11/content/carrosseis.json \
//     --tpl  site-villanova/design/carrossel-campanha.html \
//     --out  /tmp/carrosseis [--upload] [--so A03]
//
// O Metricool monta o documento a partir das imagens: manda-se a lista de PNGs
// em `media` com `linkedinData.publishImagesAsPDF = true` e um `documentTitle`.
// Por isso a ORDEM importa e o manifesto guarda um array ordenado por carrossel,
// não um objeto solto.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SPEC = arg('--spec', 'site-villanova/campanhas/VESG-LI-2026-11/content/carrosseis.json');
const TPL = arg('--tpl', 'site-villanova/design/carrossel-campanha.html');
const SAIDA = arg('--out', 'out/carrosseis');
const SUBIR = process.argv.includes('--upload');
// jpeg ou png. O padrão é jpeg: a arte é gradiente + texto, onde o PNG gasta
// ~300 kB por peça sem ganho visível, e são 100 peças. JPEG 88 fica em ~1/3
// disso, e nenhuma delas precisa de transparência.
const FORMATO = (arg('--formato', 'jpeg') || 'jpeg').toLowerCase();
const EXT = FORMATO === 'png' ? 'png' : 'jpg';
const TIPO_MIME = FORMATO === 'png' ? 'image/png' : 'image/jpeg';
const opcoesFoto = FORMATO === 'png' ? {type: 'png'} : {type: 'jpeg', quality: 88};
const SO = (arg('--so', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

const escapa = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function tokenGhost(chave) {
  const [id, segredo] = chave.split(':');
  const agora = Math.floor(Date.now() / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const base = `${enc({ alg: 'HS256', typ: 'JWT', kid: id })}.${enc({ iat: agora, exp: agora + 300, aud: '/admin/' })}`;
  return `${base}.${crypto.createHmac('sha256', Buffer.from(segredo, 'hex')).update(base).digest('base64url')}`;
}
async function sobeParaGhost(arquivo, nome) {
  const url = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
  const chave = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
  if (!url || !chave.includes(':')) throw new Error('Credenciais do Ghost da Villanova ausentes.');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(arquivo)], { type: TIPO_MIME }), nome);
  form.append('purpose', 'image');
  const r = await fetch(`${url}/ghost/api/admin/images/upload/`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Ghost ${tokenGhost(chave)}`, 'Accept-Version': 'v5.0' },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Upload de ${nome} falhou (${r.status}): ${txt.slice(0, 300)}`);
  const u = JSON.parse(txt).images?.[0]?.url;
  if (!u) throw new Error(`Upload de ${nome} sem URL: ${txt.slice(0, 200)}`);
  return u;
}

const spec = JSON.parse(fs.readFileSync(SPEC, 'utf8'));
const tpl = fs.readFileSync(TPL, 'utf8');
fs.mkdirSync(SAIDA, { recursive: true });

const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module');
  return createRequire('/opt/node-tools/package.json')('playwright');
});
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });

const manifesto = {};
for (const c of spec.carrosseis.filter((c) => (SO.length ? SO.includes(c.post) : true))) {
  const paginas = [
    { kind: 'capa' },
    ...c.slides.map((s) => ({ kind: 'item', ...s })),
    { kind: 'fecho' },
  ];
  const total = paginas.length;
  const urls = [];
  for (let i = 0; i < total; i++) {
    const p = paginas[i];
    const ctx = {
      kind: p.kind, nota: c.nota, pilar: c.pilar,
      capa: c.capa, fecho: c.fecho, fecho_linha: c.fecho_linha,
      n: p.n ?? '', titulo: p.titulo ?? '', linha: p.linha ?? '',
      pagina: `${i + 1} / ${total}`,
      tituloclass: (p.kind === 'capa' ? c.capa : c.fecho).length > 85 ? 'long' : '',
      numclass: String(p.n ?? '').length > 1 ? 'curto' : '',
    };
    let html = tpl;
    for (const [k, v] of Object.entries(ctx)) html = html.replaceAll(`{{${k}}}`, escapa(v));
    await pagina.setContent(html, { waitUntil: 'load' });
    const arquivo = path.join(SAIDA, `${c.post}-${String(i + 1).padStart(2, '0')}.${EXT}`);
    await pagina.screenshot({ path: arquivo, ...opcoesFoto, clip: { x: 0, y: 0, width: 1200, height: 1500 } });
    if (SUBIR) urls.push(await sobeParaGhost(arquivo, `vesg-li-2026-11-${c.post}-${String(i + 1).padStart(2, '0')}.${EXT}`));
    else urls.push(arquivo);
  }
  manifesto[c.post] = { documentTitle: c.titulo_documento, alt: c.capa, paginas: urls };
  console.log(`${c.post}  ${total} slides  "${c.titulo_documento}"`);
}
await navegador.close();

fs.writeFileSync(path.join(SAIDA, 'manifest.json'), JSON.stringify(manifesto, null, 2) + '\n');
console.log(`\n${Object.keys(manifesto).length} carrosséis · manifesto em ${path.join(SAIDA, 'manifest.json')}`);
if (SUBIR) {
  console.log('\n===== MANIFESTO (post → documentTitle + páginas em ordem) =====');
  console.log(JSON.stringify(manifesto, null, 0));
}
