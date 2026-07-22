// Testa o QR anti-fraude do CDF de ponta a ponta (roda no CI: alcança o Ploomes E o Worker).
//   1) acha um Certificado real no Ploomes (nº + empresa);
//   2) pede ao Worker a URL de validação assinada (/qr?fmt=txt) e a imagem (/qr);
//   3) abre /validar com o código CERTO -> deve dizer "Documento autêntico" e mostrar a empresa;
//   4) abre /validar com código ERRADO -> deve dizer "Código inválido" (HTTP 400).
// Nada é criado/alterado no Ploomes.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const WORKER = (process.env.WORKER_URL || 'https://ecobraz-portal.ti-0ab.workers.dev').replace(/\/+$/, '');
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j }; };
const tituloDe = (html) => (String(html).match(/<h1[^>]*>([^<]+)</) || [])[1] || '?';

(async () => {
  L('== Validação do QR do CDF (ponta a ponta) ==');
  L(`  Worker: ${WORKER}`);

  // 1) Certificado real com número.
  const d = await api('Documents?$top=80&$select=Id,Name,DocumentNumber,DealId,Date,TemplateId&$orderby=Id%20desc');
  const arr = Array.isArray(d.val) ? d.val : [];
  const cert = arr.find((x) => /certificad|cdf|destina/i.test(x.Name || '') && x.DocumentNumber);
  if (!cert) { L('  ⚠️ não achei um Certificado com número para testar.'); process.exit(0); }
  const n = cert.DocumentNumber;
  L(`  Certificado de teste: "${cert.Name}" nº=${n} DealId=${cert.DealId} TemplateId=${cert.TemplateId}`);

  // 2) URL de validação assinada + imagem.
  let r = await fetch(`${WORKER}/qr?n=${n}&fmt=txt`);
  const urlValid = (await r.text()).trim();
  L(`  /qr?fmt=txt -> HTTP ${r.status} -> ${urlValid}`);
  r = await fetch(`${WORKER}/qr?n=${n}`);
  const ab = await r.arrayBuffer();
  L(`  /qr (imagem) -> HTTP ${r.status} content-type=${r.headers.get('content-type')} bytes=${ab.byteLength}`);

  // 3) validar com o código CERTO.
  if (/^https?:\/\//.test(urlValid)) {
    r = await fetch(urlValid);
    const body = await r.text();
    const titulo = tituloDe(body);
    const empresa = /Emitido para/.test(body);
    L(`  /validar (código CERTO) -> HTTP ${r.status} | título: "${titulo}" | mostra empresa? ${empresa ? 'sim' : 'não'}`);
    L(`     >> ${/aut[êe]ntico/i.test(titulo) ? '✅ AUTÊNTICO (funcionou de ponta a ponta)' : '❌ não validou — investigar'}`);
  } else {
    L('  ⚠️ /qr?fmt=txt não retornou uma URL — Worker no ar? já com a v9?');
  }

  // 4) validar com código ERRADO.
  r = await fetch(`${WORKER}/validar?n=${n}&c=codigoerrado123`);
  const b2 = await r.text();
  L(`  /validar (código ERRADO) -> HTTP ${r.status} | título: "${tituloDe(b2)}" (esperado: "Código inválido" / 400)`);
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
