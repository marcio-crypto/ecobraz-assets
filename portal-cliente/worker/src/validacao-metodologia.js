// Selo de validação da metodologia (ideia do Marcio: mesmo esquema do QR do CDF, agora para provar que a
// VILLANOVA validou). Quando a Villanova valida (logada), o sistema:
//   1) grava um REGISTRO imutável (quem/quando/versão/comentário) + a "impressão digital" (hash) do conteúdo;
//   2) o selo público (/validar-metodologia) confirma "validado por Villanova ESG em DD/MM, versão X" e,
//      se a metodologia mudar depois, avisa "conteúdo alterado após a validação" (o hash deixa de bater).
// O que dá credibilidade: (a) ação AUTENTICADA da Villanova (login), (b) registro versionado, (c) selo
// assinado + hash (inviolável). Público vê SÓ a confirmação — nunca a receita.

import qrcode from 'qrcode-generator';
import { METODOLOGIA, hashConteudo } from './carbono-metodologia.js';

const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function agoraISO() { try { return new Date().toISOString(); } catch { return ''; } }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dataBR(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, TE.encode(data));
  return b64url(new Uint8Array(sig));
}
async function seloCodigo(versao, hash, env) {
  const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-metodo';
  return (await hmac(`${base}|metodo-selo-v1`, `${versao}:${hash}`)).slice(0, 12);
}
function origemPortal(env, url) { return String(env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }

// ---- Registro de validação (KV) ----
export async function lerValidacao(env) {
  if (!env.PORTAL_KV) return null;
  const raw = await env.PORTAL_KV.get('carbono:validacao');
  return raw ? JSON.parse(raw) : null;
}
async function lerValidacaoPorHash(env, hash) {
  if (!env.PORTAL_KV) return null;
  const raw = await env.PORTAL_KV.get(`carbono:validacao:${hash}`);
  return raw ? JSON.parse(raw) : null;
}
export async function registrarValidacao(env, { validadorEmail, comentario }) {
  const hash = await hashConteudo();
  const rec = {
    versao: METODOLOGIA.versao,
    hash,
    validadoPor: 'Villanova ESG',
    validadorEmail: validadorEmail || '',
    em: agoraISO(),
    comentario: String(comentario || '').slice(0, 300),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`carbono:validacao:${hash}`, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 365 * 5 });
    await env.PORTAL_KV.put('carbono:validacao', JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 365 * 5 });
  }
  return rec;
}

// ---- Tela da Villanova (logada) ----
export async function paginaAreaValidacao(env, validador, url) {
  const m = METODOLOGIA;
  const rec = await lerValidacao(env);
  const jaValidada = !!(rec && rec.versao === m.versao);
  const hashAtual = await hashConteudo();
  const seloUrl = jaValidada ? `${origemPortal(env, url)}/validar-metodologia?v=${encodeURIComponent(rec.versao)}&h=${rec.hash}&c=${await seloCodigo(rec.versao, rec.hash, env)}` : '';
  const fatores = m.fatores.map((f) => `<tr><td style="padding:9px 12px;border-top:1px solid #EDF1F0;font-size:13px;font-weight:600;color:#10262B;">${esc(f.material)}</td><td style="padding:9px 12px;border-top:1px solid #EDF1F0;font-size:12px;color:#5B6570;">${esc(f.fonte)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação de Metodologia — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="max-width:760px;margin:0 auto;padding:26px 18px 60px;">
  <div style="background:#00333B;border-radius:16px;padding:24px 28px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
    <div><span style="color:#fff;font-size:19px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:7px;">emigre</span>
      <div style="color:#9FC6C1;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-top:8px;">Área de validação — Villanova ESG</div></div>
    <form method="post" action="/api/validacao/sair"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;">Sair</button></form>
  </div>

  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:22px 24px;margin-top:16px;">
    <div style="font-size:13px;color:#5B6570;">Logado como <strong style="color:#10262B;">${esc(validador.email)}</strong></div>
    <h1 style="margin:8px 0 6px;font-size:22px;color:#00333B;letter-spacing:-.02em;">Metodologia de Carbono — versão ${esc(m.versao)}</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6;">Revise a metodologia completa em <a href="/metodologia" style="color:#00333B;font-weight:700;">/metodologia</a>. Ao validar, sua aprovação fica <strong>registrada</strong> (com data e versão) e gera um <strong>selo público com QR</strong> que comprova a validação — inclusive detectando se a metodologia for alterada depois.</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tbody>${fatores}</tbody></table>
  </div>

  ${jaValidada ? `<div style="background:#E4F3E6;border:1px solid #B7E0BE;border-radius:14px;padding:20px 24px;margin-top:16px;">
      <div style="font-size:15px;font-weight:800;color:#1E5B31;">✓ Você já validou esta versão</div>
      <div style="font-size:13px;color:#3f6b4c;margin-top:6px;line-height:1.6;">Validada em <strong>${esc(dataBR(rec.em))}</strong>${rec.comentario ? ` — “${esc(rec.comentario)}”` : ''}.</div>
      <div style="font-size:12px;color:#4F6469;margin-top:12px;">Selo público: <a href="${esc(seloUrl)}" style="color:#00333B;font-weight:700;word-break:break-all;">${esc(seloUrl)}</a></div>
    </div>` : `<form method="post" action="/api/validacao/validar" style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:22px 24px;margin-top:16px;">
      <div style="font-size:15px;font-weight:800;color:#00333B;margin-bottom:12px;">Validar esta versão</div>
      <label style="display:block;font-size:12px;color:#5B6570;font-weight:700;margin-bottom:6px;">Comentário / parecer (opcional)</label>
      <textarea name="comentario" rows="3" maxlength="300" placeholder="Ex.: metodologia aderente ao GHG Protocol; fatores conforme fontes citadas." style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:9px;padding:10px 12px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
      <label style="display:flex;align-items:flex-start;gap:9px;margin:14px 0 16px;font-size:12.5px;color:#4F6469;line-height:1.5;cursor:pointer;">
        <input type="checkbox" name="declaro" required style="margin-top:2px;"> Declaro que revisei esta metodologia (versão ${esc(m.versao)}) e a valido em nome da Villanova ESG.</label>
      <button type="submit" style="background:#92C430;color:#10262B;border:none;border-radius:10px;padding:13px 26px;font-size:14px;font-weight:800;cursor:pointer;">Validar versão ${esc(m.versao)}</button>
    </form>`}

  <div style="margin-top:22px;font-size:11px;color:#9fb0ac;line-height:1.6;">Impressão digital da versão atual: <code style="color:#5B6570;">${esc(hashAtual)}</code> · A validação é registrada de forma imutável e versionada.</div>
</div>
</body></html>`;
}

// ---- QR do selo (imagem) ----
export async function qrMetodologia(request, env, url) {
  const rec = await lerValidacao(env);
  if (!rec) return new Response('metodologia ainda não validada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const alvo = `${origemPortal(env, url)}/validar-metodologia?v=${encodeURIComponent(rec.versao)}&h=${rec.hash}&c=${await seloCodigo(rec.versao, rec.hash, env)}`;
  if ((url.searchParams.get('fmt') || 'gif') === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=3600' } });
}

// ---- Página pública do selo ----
export async function validarMetodologiaPublico(request, env, url) {
  const v = (url.searchParams.get('v') || '').slice(0, 40);
  const h = (url.searchParams.get('h') || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const okSelo = v && h && c && c === await seloCodigo(v, h, env);
  let rec = okSelo ? await lerValidacaoPorHash(env, h) : null;
  const hashAtual = await hashConteudo();
  const alterada = okSelo && h !== hashAtual; // conteúdo mudou desde esta validação
  const autentico = okSelo && !!rec;
  const cor = autentico && !alterada ? '#1E7A3D' : (autentico && alterada ? '#8A6A16' : '#B23A2E');
  const selo = autentico && !alterada ? '✓' : (autentico && alterada ? '!' : '✕');
  let titulo, sub, extra = '';
  if (!okSelo) { titulo = 'Selo inválido'; sub = 'Não foi possível verificar este selo. Escaneie o QR diretamente do documento original.'; }
  else if (!rec) { titulo = 'Validação não encontrada'; sub = 'A assinatura confere, mas não há registro dessa validação.'; }
  else if (alterada) { titulo = 'Metodologia alterada após a validação'; sub = `Esta versão (${esc(v)}) foi validada, mas o conteúdo mudou desde então — requer nova validação.`; }
  else {
    titulo = 'Metodologia validada'; sub = `Validada por <strong>${esc(rec.validadoPor)}</strong> e registrada nos sistemas da Ecobraz.`;
    extra = `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;">
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Validado por</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800;color:#10262B;">${esc(rec.validadoPor)}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Data</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#10262B;">${esc(dataBR(rec.em))}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Versão</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#10262B;">${esc(rec.versao)}</td></tr>
      ${rec.comentario ? `<tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Parecer</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:600;color:#4F6469;">${esc(rec.comentario)}</td></tr>` : ''}</table>`;
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação de Metodologia — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="max-width:520px;margin:0 auto;padding:28px 18px;">
  <div style="background:#00333B;border-radius:16px 16px 0 0;padding:22px 26px;"><span style="color:#fff;font-size:20px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">emigre</span>
    <div style="color:#9FC6C1;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:10px;">Selo de metodologia</div></div>
  <div style="background:#fff;border-radius:0 0 16px 16px;border:1px solid #E4EBE9;border-top:none;padding:30px 26px 34px;box-shadow:0 18px 50px rgba(0,51,59,.08);">
    <div style="width:74px;height:74px;border-radius:50%;background:${cor};color:#fff;font-size:40px;line-height:74px;text-align:center;margin:0 auto 18px;font-weight:700;">${selo}</div>
    <h1 style="margin:0 0 10px;text-align:center;font-size:21px;color:${cor};">${esc(titulo)}</h1>
    <p style="margin:0;text-align:center;font-size:14px;line-height:1.6;color:#4F6469;">${sub}</p>
    ${extra}
    <p style="margin:26px 0 0;text-align:center;font-size:11.5px;color:#9fb0ac;line-height:1.6;">Verificação de autenticidade — Ecobraz. Dúvidas: <strong style="color:#4F6469;">acesso@ecobraz.org.br</strong>.</p>
  </div>
</div></body></html>`;
  return new Response(html, { status: autentico ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
