// Validação pública de CDF (anti-fraude, ideia do Marcio).
//
// Fluxo: o modelo do CDF no Ploomes embute uma imagem <img src=".../qr?n={número}">.
// O Worker gera um QR que aponta para /validar?n=NÚMERO&c=CÓDIGO. O CÓDIGO é assinado
// (HMAC-SHA256) a partir do número do certificado — não dá para forjar nem "chutar", e a
// validação é feita SEM guardar nada (recalcula e compara). A página /validar confere o
// documento AO VIVO contra o Ploomes e mostra só o que já está no papel que a pessoa tem em
// mãos (nº do certificado, empresa, data) — sem CNPJ nem dados internos.
//
// Segurança/privacidade:
//  - Só valida documentos que são Certificado/CDF (pelo modelo do Ploomes) — nunca outro doc.
//  - O código assinado evita varredura em massa (não dá pra listar clientes chutando números).
//  - Chave derivada do PORTAL_SESSION_SECRET com rótulo próprio (separação de domínio).

import qrcode from 'qrcode-generator';

const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, TE.encode(data));
  return b64url(new Uint8Array(sig));
}
// Código curto e assinado a partir do número do certificado.
async function codigoCDF(numero, env) {
  const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-cdf';
  const h = await hmac(`${base}|cdf-qr-v1`, `cdf:${numero}`);
  return h.slice(0, 12);
}
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function origemPortal(env, url) { return String(env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }
function fmtData(d) { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }

// GET /qr?n=NUMERO[&fmt=gif|svg|txt] — imagem do QR (GIF por padrão, mais compatível com o PDF do
// Ploomes) ou a URL de validação em texto. Público (a imagem só codifica a URL de validação).
export async function qrCDF(request, env, url) {
  const raw = url.searchParams.get('n') || '';
  const n = raw.replace(/\D/g, '').slice(0, 12);
  // Diagnóstico (temporário): grava o ÚLTIMO acesso ao /qr para descobrir o que o Ploomes
  // de fato manda no lugar de [Documento.Número]. Sem segredos; expira em 7 dias.
  if (env.PORTAL_KV) {
    try {
      await env.PORTAL_KV.put('qr:ultimo', JSON.stringify({
        em: new Date().toISOString(),
        nRaw: raw.slice(0, 120),
        nLimpo: n,
        ua: (request.headers.get('user-agent') || '').slice(0, 180),
        ref: (request.headers.get('referer') || '').slice(0, 180),
      }), { expirationTtl: 7 * 24 * 3600 });
    } catch (_) { /* diagnóstico não pode derrubar o QR */ }
  }
  if (!n) return new Response('faltou o parâmetro n (número do certificado)', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const code = await codigoCDF(n, env);
  const alvo = `${origemPortal(env, url)}/validar?n=${n}&c=${code}`;
  const fmt = (url.searchParams.get('fmt') || 'gif').toLowerCase();
  if (fmt === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  if (fmt === 'svg') {
    const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    return new Response(svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
  }
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=86400' } });
}

// GET /validar?n=NUMERO&c=CODIGO — página pública de validação do CDF.
export async function validarCDF(request, env, url) {
  const n = (url.searchParams.get('n') || '').replace(/\D/g, '').slice(0, 12);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const esperado = n ? await codigoCDF(n, env) : '';
  const assinaturaOk = !!(n && c && esperado && c === esperado);
  let info = null;
  if (assinaturaOk) { try { info = await buscarCertificado(n, env); } catch { info = null; } }
  const status = !assinaturaOk ? 400 : (info ? 200 : 404);
  return new Response(paginaValidacao({ assinaturaOk, info, n }), { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function buscarCertificado(numero, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const r = await fetch(`${base}/Documents?$filter=DocumentNumber%20eq%20${Number(numero)}&$top=10&$select=Id,Name,DocumentNumber,DealId,Date,TemplateId`, { headers });
  if (!r.ok) return null;
  const docs = (await r.json()).value || [];
  const modeloCDF = Number(env.CDF_TEMPLATE_ID || 224095);
  // Só aceita Certificado/CDF (pelo modelo do Ploomes ou pelo nome) — nunca outro tipo de documento.
  const doc = docs.find((d) => Number(d.TemplateId) === modeloCDF || /certificad|cdf|destina/i.test(d.Name || ''));
  if (!doc) return null;
  let empresa = '';
  if (doc.DealId) {
    const rd = await fetch(`${base}/Deals?$filter=Id%20eq%20${doc.DealId}&$top=1&$select=Id,Title&$expand=Contact($select=Id,Name)`, { headers });
    if (rd.ok) { const dl = ((await rd.json()).value || [])[0]; empresa = dl?.Contact?.Name || dl?.Title || ''; }
  }
  return { numero: doc.DocumentNumber ?? numero, empresa, data: doc.Date || '' };
}

function paginaValidacao({ assinaturaOk, info, n }) {
  const ok = assinaturaOk && info;
  const cor = ok ? '#1E7A3D' : '#B23A2E';
  const selo = ok ? '✓' : '✕';
  const titulo = ok ? 'Documento autêntico' : (assinaturaOk ? 'Certificado não encontrado' : 'Código inválido');
  const sub = ok
    ? 'Este Certificado de Destinação Final consta como <strong>legítimo</strong> nos registros da Ecobraz.'
    : (assinaturaOk
      ? 'A assinatura confere, mas não encontramos um certificado com esse número. Verifique o documento.'
      : 'Não foi possível validar este código. Escaneie o QR diretamente do certificado original.');
  const linhas = ok ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:22px;">
        <tr><td style="padding:10px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Certificado de Destinação Final nº</td><td style="padding:10px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800;color:#10262B;">${esc(info.numero)}</td></tr>
      ${info.empresa ? `<tr><td style="padding:10px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Emitido para</td><td style="padding:10px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#10262B;">${esc(info.empresa)}</td></tr>` : ''}
      ${fmtData(info.data) ? `<tr><td style="padding:10px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Data</td><td style="padding:10px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#10262B;">${esc(fmtData(info.data))}</td></tr>` : ''}
      </table>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação de Certificado — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;-webkit-font-smoothing:antialiased;">
<div style="max-width:520px;margin:0 auto;padding:28px 18px;">
  <div style="background:#00333B;border-radius:16px 16px 0 0;padding:22px 26px;">
    <span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-.01em;">ecobraz</span>
    <span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">emigre</span>
    <div style="color:#9FC6C1;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:10px;">Validação de documento</div>
  </div>
  <div style="background:#fff;border-radius:0 0 16px 16px;border:1px solid #E4EBE9;border-top:none;padding:30px 26px 34px;box-shadow:0 18px 50px rgba(0,51,59,.08);">
    <div style="width:74px;height:74px;border-radius:50%;background:${cor};color:#fff;font-size:40px;line-height:74px;text-align:center;margin:0 auto 18px;font-weight:700;">${selo}</div>
    <h1 style="margin:0 0 10px;text-align:center;font-size:22px;letter-spacing:-.02em;color:${cor};">${esc(titulo)}</h1>
    <p style="margin:0;text-align:center;font-size:14.5px;line-height:1.6;color:#4F6469;">${sub}</p>
    ${linhas}
    <p style="margin:26px 0 0;text-align:center;font-size:11.5px;color:#9fb0ac;line-height:1.6;">Conferido em tempo real contra os registros da Ecobraz.<br>Em caso de dúvida, fale com <strong style="color:#4F6469;">acesso@ecobraz.org.br</strong>.</p>
  </div>
</div>
</body></html>`;
}
