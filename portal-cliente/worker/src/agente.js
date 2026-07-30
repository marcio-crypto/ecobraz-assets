// App do Agente de Coletas (PWA mobile). Fatia 1: login do agente + lista das coletas em "Em Transporte".
// Os agentes NÃO são usuários do Ploomes (equipe enxuta): a lista de agentes vive no NOSSO sistema
// (env AGENTE_EMAILS = "email|Nome,email2|Nome2"). O app lê as Vendas (Orders) na etapa "Em Transporte"
// (StageId 35313, configurável). Câmera/GPS/offline/encerrar/PDF vêm nas próximas fatias.

import { tagsPWA, botaoInstalarPWA } from './pwa.js';
import qrcode from 'qrcode-generator';
import { listarColetasOS, lerColetaOS, atualizarStatusOS } from './coletas.js';
import { botaoGoogle } from './google-auth.js';
const STAGE_EM_TRANSPORTE = (env) => Number(env.COLETA_STAGE_EM_TRANSPORTE || 35313);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function hmacSHA(secret, data) {
  const k = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, TE.encode(data))));
}
// Selo público da coleta: código curto derivado do id por HMAC (não dá pra adivinhar nem forjar).
export async function seloColeta(id, env) {
  const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-coleta';
  return (await hmacSHA(`${base}|coleta-selo-v1`, `coleta:${id}`)).slice(0, 12);
}
function origemPortal(env, url) { return String(env.PORTAL_BASE_URL || env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }
const dataHoraBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ''; };

// Registro de agentes (nome por e-mail). Fonte única: env AGENTE_EMAILS.
export function agentesDe(env) {
  const out = new Map();
  for (const par of String(env.AGENTE_EMAILS || '').split(/[,;]+/)) {
    const [em, nome] = par.split('|');
    const e = (em || '').trim().toLowerCase();
    if (e) out.set(e, (nome || '').trim() || e.split('@')[0]);
  }
  return out;
}
export function agentePermitido(email, env) { return agentesDe(env).has(String(email || '').trim().toLowerCase()); }
export function nomeAgente(email, env) { return agentesDe(env).get(String(email || '').trim().toLowerCase()) || String(email || '').split('@')[0]; }

// Lê as coletas que o escritório JÁ LIBEROU para a rua ("Em transporte") e que estão
// ATRIBUÍDAS a ESTE motorista. Uma OS recém-criada fica "Agendada" e só entra aqui quando o
// comercial escolhe o motorista e a coloca "Em transporte" — assim cada motorista vê apenas
// a SUA rota do dia (nunca a de outro, nem coletas sem motorista). Substitui o Ploomes.
const COLETAS_ATIVAS = new Set(['em_transporte']);
export async function listarColetas(env, agenteEmail) {
  const email = String(agenteEmail || '').trim().toLowerCase();
  if (!email) return [];
  const todas = await listarColetasOS(env);
  return todas
    .filter((c) => COLETAS_ATIVAS.has(c.status) && String(c.agenteEmail || '').trim().toLowerCase() === email)
    .map((c) => ({ id: c.id, numero: c.numero, cliente: c.clienteNome || '' }));
}

export function paginaLoginAgente(googleOn) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${tagsPWA('agente')}<title>Ecobraz Coletas</title></head>
<body style="margin:0;background:#00333B;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#fff;display:flex;align-items:center;">
<div style="max-width:400px;margin:0 auto;padding:32px 24px;width:100%;box-sizing:border-box;">
  <div style="text-align:center;margin-bottom:28px;"><span style="font-size:26px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">coletas</span></div>
  <div style="background:#fff;border-radius:18px;padding:26px 22px;color:#10262B;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#00333B;">App do Agente</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6;">Digite seu e-mail. Enviamos um link de acesso (vale uma vez, 15 min).</p>
    <input id="e" type="email" inputmode="email" placeholder="seu e-mail" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:11px;padding:14px;font-size:16px;font-family:inherit;">
    <button id="b" style="width:100%;margin-top:12px;background:#92C430;color:#10262B;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:800;">Entrar</button>
    ${googleOn ? `<div style="text-align:center;color:#9aa7a4;font-size:12px;margin:14px 0 10px;">ou</div>${botaoGoogle('agente')}` : ''}
    <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px;line-height:1.5;"></div>
  </div>
</div>
<script>
  const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
  b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/agente/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail estiver cadastrado, enviamos o link.';}catch{m.textContent='Tente de novo em instantes.';}b.disabled=false;};
  e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});
</script>
</body></html>`;
}

export function paginaAppAgente(agente, coletas, banner) {
  const badgeDe = (c) => c.encerrada
    ? '<span style="font-size:10px;font-weight:800;color:#1E5B31;background:#E4F3E6;padding:3px 8px;border-radius:20px;">ENCERRADA</span>'
    : c.reagendar
      ? '<span style="font-size:10px;font-weight:800;color:#8A6A16;background:#FFF4DE;padding:3px 8px;border-radius:20px;">REAGENDAR</span>'
      : c.status === 'andamento'
        ? '<span style="font-size:10px;font-weight:800;color:#0B5B66;background:#E3F0F3;padding:3px 8px;border-radius:20px;">EM ANDAMENTO</span>'
        : '<span style="font-size:10px;font-weight:800;color:#8A6A16;background:#FFF4DE;padding:3px 8px;border-radius:20px;">EM TRANSPORTE</span>';
  const itens = coletas.length ? coletas.map((c) => {
    const href = c.encerrada ? `/agente/coleta/comprovante?id=${c.id}` : `/agente/coleta?id=${c.id}`;
    const cta = c.encerrada ? 'Ver comprovante →' : 'Abrir coleta →';
    return `<a href="${href}" class="coleta-card" data-lat="${c.lat != null ? c.lat : ''}" data-lon="${c.lon != null ? c.lon : ''}" style="display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:15px 16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:14px;font-weight:800;color:#10262B;">${esc(c.numero)}</div>${badgeDe(c)}</div>
      <div style="font-size:13px;color:#4F6469;margin-top:7px;">${esc(c.cliente || 'Cliente')}</div>
      <div class="km" style="font-size:11.5px;color:#0B5B66;font-weight:700;margin-top:4px;display:none;"></div>
      <div style="font-size:12px;color:#3f8f3a;font-weight:700;margin-top:10px;">${cta}</div>
    </a>`;
  }).join('') : `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:26px 18px;text-align:center;color:#8fa39f;font-size:13.5px;">Nenhuma coleta em transporte agora.<br>Quando a Débora liberar uma coleta, ela aparece aqui.</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${tagsPWA('agente')}<title>Minhas coletas — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="background:#00333B;padding:16px 18px 14px;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div><span style="color:#fff;font-size:15px;font-weight:800;">Olá, ${esc((agente.nome || '').split(/\s+/)[0] || 'agente')} 👋</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px;">Ecobraz · Coletas</div></div>
    <form method="post" action="/api/agente/sair" style="margin:0;"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;">Sair</button></form>
  </div>
</div>
<div style="max-width:520px;margin:0 auto;padding:16px 16px 40px;">
  ${banner || ''}
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div style="font-size:13px;font-weight:800;">Coletas em transporte</div><span style="font-size:11px;background:#E3F0F3;color:#0B5B66;font-weight:800;padding:3px 9px;border-radius:20px;">${coletas.length}</span></div>
  <div id="prox-hint" style="display:none;font-size:10.5px;color:#8fa39f;margin:-4px 0 10px;">📍 Ordenado por proximidade (linha reta, sugestão). Você escolhe a ordem que quiser.</div>
  <div id="lista-coletas">${itens}</div>
  <div style="font-size:10.5px;color:#9aa7a4;text-align:center;margin-top:14px;">Toque numa coleta para fazer o check-in por GPS e a foto da carga.</div>
  ${botaoInstalarPWA()}
  <div style="text-align:center;margin-top:10px"><a href="/manual-motorista.pdf" target="_blank" rel="noopener" style="color:#0B5B66;font-size:12px;font-weight:700;text-decoration:none">📄 Manual do motorista (PDF)</a></div>
</div>
<script>
(function(){
  var box=document.getElementById('lista-coletas'); if(!box||!navigator.geolocation) return;
  var cards=[].slice.call(box.querySelectorAll('.coleta-card'));
  var temGeo=cards.some(function(c){return c.getAttribute('data-lat')&&c.getAttribute('data-lon');});
  if(!temGeo) return;
  navigator.geolocation.getCurrentPosition(function(pos){
    var la=pos.coords.latitude, lo=pos.coords.longitude, rad=Math.PI/180;
    function dist(a,b,c,d){var dLa=(c-a)*rad,dLo=(d-b)*rad;var x=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin(dLo/2)*Math.sin(dLo/2);return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
    cards.forEach(function(c){
      var lat=parseFloat(c.getAttribute('data-lat')),lon=parseFloat(c.getAttribute('data-lon'));
      if(isFinite(lat)&&isFinite(lon)){var km=dist(la,lo,lat,lon);c._km=km;var el=c.querySelector('.km');if(el){el.textContent='📍 ~'+km.toLocaleString('pt-BR',{maximumFractionDigits:1})+' km de você';el.style.display='block';}}
      else{c._km=Infinity;}
    });
    cards.slice().sort(function(a,b){return a._km-b._km;}).forEach(function(c){box.appendChild(c);});
    var h=document.getElementById('prox-hint'); if(h) h.style.display='block';
  }, function(){}, {enableHighAccuracy:false,timeout:8000,maximumAge:300000});
})();
</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Fatia 2: detalhe da coleta + check-in por GPS + foto da carga
// ---------------------------------------------------------------------------
function ploomesCfg(env) { return { base: env.PLOOMES_API_URL || 'https://public-api2.ploomes.com', headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } }; }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function agora() { try { return new Date().toISOString(); } catch { return ''; } }
function hhmm(iso) { const m = String(iso || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; }

export async function detalheColeta(env, id) {
  const os = await lerColetaOS(env, id);
  if (!os) return null;
  return { id: os.id, numero: os.numero, cliente: os.clienteNome || '', endereco: os.endereco || '', stageId: os.status };
}
export async function lerEstadoColeta(env, id) { if (!env.PORTAL_KV) return {}; const raw = await env.PORTAL_KV.get(`coleta:${id}`); return raw ? JSON.parse(raw) : {}; }
async function salvarEstadoColeta(env, id, e) { if (env.PORTAL_KV) await env.PORTAL_KV.put(`coleta:${id}`, JSON.stringify(e).slice(0, 4000), { expirationTtl: 60 * 60 * 24 * 120 }); }
// "Estou indo": marca a coleta como em transporte e registra o momento — o cliente é
// avisado por e-mail (feito no index) e passa a acompanhar o caminhão ao vivo.
export async function registrarACaminho(env, id, agente) {
  const e = await lerEstadoColeta(env, id);
  const jaAvisado = !!e.acaminho;
  if (!jaAvisado) { e.acaminho = { em: agora(), agente: agente.email }; await salvarEstadoColeta(env, id, e); }
  try { await atualizarStatusOS(env, id, 'em_transporte'); } catch { /* ok */ }
  return { estado: e, jaAvisado };
}
export async function registrarCheckin(env, id, agente, geo) { const e = await lerEstadoColeta(env, id); e.checkin = { lat: Number(geo.lat), lon: Number(geo.lon), acc: Math.round(Number(geo.acc) || 0), em: agora(), agente: agente.email }; await salvarEstadoColeta(env, id, e); try { await atualizarStatusOS(env, id, 'em_transporte'); } catch { /* ok */ } return e; }
export async function registrarFoto(env, id, agente, b64) { const e = await lerEstadoColeta(env, id); if (env.PORTAL_KV) await env.PORTAL_KV.put(`coletafoto:${id}`, String(b64).slice(0, 3000000), { expirationTtl: 60 * 60 * 24 * 120 }); e.foto = { em: agora(), agente: agente.email }; await salvarEstadoColeta(env, id, e); return e; }
export async function servirFotoColeta(env, id) {
  if (!env.PORTAL_KV) return new Response('sem foto', { status: 404 });
  const b64 = await env.PORTAL_KV.get(`coletafoto:${id}`);
  if (!b64) return new Response('sem foto', { status: 404 });
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
}

// ---------------------------------------------------------------------------
// Fatia 3: encerrar a coleta (entrega na Ecobraz) + comprovante com QR + reagendar
// ---------------------------------------------------------------------------
export async function registrarEncerramento(env, id, agente, dados) {
  const e = await lerEstadoColeta(env, id);
  const d = dados || {};
  e.os = { numero: d.numero || (e.os && e.os.numero) || '', cliente: d.cliente || (e.os && e.os.cliente) || '', endereco: d.endereco || (e.os && e.os.endereco) || '' };
  e.encerramento = { em: agora(), agente: agente.email, agenteNome: agente.nome || '', volumes: String(d.volumes || '').slice(0, 40), obs: String(d.obs || '').slice(0, 300) };
  e.status = 'encerrada';
  delete e.reagendar;
  await salvarEstadoColeta(env, id, e);
  // O motorista concluiu a coleta no cliente → a OS fica CONCLUÍDA e, com isso, entra
  // automaticamente na fila da doca (listarColetasRecebiveis lê status 'concluida').
  try { await atualizarStatusOS(env, id, 'concluida'); } catch { /* ok */ }
  return e;
}
export async function registrarReagendamento(env, id, agente, dados) {
  const e = await lerEstadoColeta(env, id);
  const d = dados || {};
  e.os = { numero: d.numero || (e.os && e.os.numero) || '', cliente: d.cliente || (e.os && e.os.cliente) || '', endereco: d.endereco || (e.os && e.os.endereco) || '' };
  e.reagendar = { em: agora(), agente: agente.email, motivo: String(d.motivo || '').slice(0, 300) };
  e.status = 'reagendar';
  await salvarEstadoColeta(env, id, e);
  return e;
}

// Lista as coletas do Ploomes JÁ com o status do NOSSO sistema (encerrada/reagendar/andamento).
export async function listarColetasComStatus(env, agenteEmail) {
  const arr = await listarColetas(env, agenteEmail);
  const out = [];
  for (const c of arr) {
    let e = {};
    try { e = await lerEstadoColeta(env, c.id); } catch { e = {}; }
    const status = e.status || ((e.checkin || e.foto) ? 'andamento' : 'pendente');
    out.push({ ...c, status, encerrada: e.status === 'encerrada', reagendar: e.status === 'reagendar' });
  }
  return out;
}

// --- Sugestão de proximidade (opcional, best-effort) ---------------------------
// Extrai o CEP (8 dígitos) de um texto de endereço.
function extrairCEP(txt) { const m = String(txt || '').match(/(\d{5})-?(\d{3})/); return m ? m[1] + m[2] : ''; }

// Geocodifica um CEP para { lat, lon } via BrasilAPI (v2), com cache no KV (guarda
// inclusive o "não achou", para não repetir a chamada). Devolve null sem coordenada.
async function geocodeCEP(env, cep) {
  cep = String(cep || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;
  const chave = `geocep:${cep}`;
  if (env.PORTAL_KV) { try { const cache = await env.PORTAL_KV.get(chave); if (cache != null) { const v = JSON.parse(cache); return (v && v.lat && v.lon) ? v : null; } } catch { /* segue */ } }
  let coord = null;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (r.ok) { const d = await r.json(); const c = d && d.location && d.location.coordinates; const lat = c && parseFloat(c.latitude); const lon = c && parseFloat(c.longitude); if (lat && lon && isFinite(lat) && isFinite(lon)) coord = { lat, lon }; }
  } catch { coord = null; }
  if (env.PORTAL_KV) { try { await env.PORTAL_KV.put(chave, JSON.stringify(coord), { expirationTtl: 60 * 60 * 24 * 180 }); } catch { /* ok */ } }
  return coord;
}

// Anexa { lat, lon } a cada coleta (pela coordenada do CEP do endereço), para a sugestão
// de proximidade no app. Best-effort: nunca quebra a lista; coleta sem coordenada fica
// sem lat/lon (e vai para o fim da ordenação, feita no navegador com o GPS do motorista).
export async function enriquecerProximidade(env, coletas) {
  const arr = Array.isArray(coletas) ? coletas : [];
  return Promise.all(arr.map(async (c) => {
    try {
      const os = await lerColetaOS(env, c.id);
      const cep = extrairCEP(os && os.endereco);
      const geo = cep ? await geocodeCEP(env, cep) : null;
      return geo ? { ...c, lat: geo.lat, lon: geo.lon } : { ...c };
    } catch { return { ...c }; }
  }));
}

// QR público do comprovante (aponta para /validar-coleta com o selo assinado).
export async function qrColeta(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  if (!id) return new Response('faltou id', { status: 400 });
  const code = await seloColeta(id, env);
  const alvo = `${origemPortal(env, url)}/validar-coleta?id=${id}&c=${code}`;
  if ((url.searchParams.get('fmt') || '') === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=86400' } });
}

// Página pública de validação do comprovante (qualquer pessoa que leia o QR).
export async function validarColetaPublico(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const esperado = id ? await seloColeta(id, env) : '';
  const assinaturaOk = !!(id && c && esperado && c === esperado);
  let e = {};
  if (assinaturaOk) { try { e = await lerEstadoColeta(env, id); } catch { e = {}; } }
  const enc = e && e.encerramento;
  const ok = assinaturaOk && !!enc;
  const os = (e && e.os) || {};
  const chk = e && e.checkin;
  const cor = ok ? '#1E7A3D' : '#B23A2E';
  const titulo = ok ? 'Coleta autêntica' : 'Comprovante não confere';
  const sub = ok ? 'Este comprovante foi emitido pela Ecobraz.' : (assinaturaOk ? 'Esta coleta ainda não foi encerrada pelo agente.' : 'Código inválido ou adulterado.');
  const linhas = ok ? `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Coleta (OS)</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800">${esc(os.numero || id)}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Cliente</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(os.cliente || '—')}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Coletado em</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(dataHoraBR(enc.em))}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Agente responsável</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(enc.agenteNome || '—')}</td></tr>
      ${chk ? `<tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Check-in por GPS</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#1E7A3D">confirmado no local</td></tr>` : ''}
    </table>` : '';
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;display:flex;align-items:center;justify-content:center">
<div style="max-width:440px;margin:0 auto;padding:28px 22px;width:100%;box-sizing:border-box">
  <div style="background:#fff;border-radius:18px;padding:28px 24px;border:1px solid #E4EBE9">
    <div style="text-align:center"><span style="font-size:22px;font-weight:800;color:#00333B">ecobraz</span></div>
    <div style="text-align:center;margin-top:18px"><div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:${ok ? '#E4F3E6' : '#FBE9E7'};line-height:56px;font-size:28px">${ok ? '✓' : '✕'}</div></div>
    <h1 style="margin:14px 0 6px;text-align:center;font-size:19px;color:${cor}">${titulo}</h1>
    <p style="margin:0;text-align:center;font-size:13px;color:#6B7B78;line-height:1.6">${sub}</p>
    ${linhas}
    <div style="margin-top:22px;font-size:11px;color:#9aa7a4;text-align:center;line-height:1.6">Comprovante de coleta de resíduos eletroeletrônicos.<br>A destinação final e o certificado (CDF) são emitidos após o processamento na unidade.</div>
  </div>
</div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

export function paginaColetaDetalhe(agente, coleta, estado) {
  const chk = estado && estado.checkin;
  const foto = estado && estado.foto;
  const enc = estado && estado.encerramento;
  const rea = estado && estado.reagendar;
  const destino = encodeURIComponent(coleta.endereco || coleta.cliente || '');
  const waze = `https://waze.com/ul?q=${destino}&navigate=yes`;
  const mapa = `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
  const acam = estado && estado.acaminho;
  const linhaAcam = acam ? `<div style="font-size:12.5px;color:#1E5B31;font-weight:700;">✓ A caminho — cliente avisado às ${hhmm(acam.em)}</div>` : '';
  const linhaChk = chk ? `<div style="font-size:12.5px;color:#1E5B31;font-weight:700;${acam ? 'margin-top:6px;' : ''}">✓ Check-in no local — ${hhmm(chk.em)}</div><div style="font-size:10.5px;color:#8fa39f;margin-top:2px;">GPS registrado · precisão ${chk.acc} m</div>` : `<div style="font-size:12.5px;color:#8fa39f;${acam ? 'margin-top:6px;' : ''}">Aguardando check-in…</div>`;
  const btnAcam = enc ? '' : (acam ? `<button class="btn done" disabled>✓ Cliente avisado (${hhmm(acam.em)})</button>` : `<button class="btn primary" id="bacam" style="background:#0B5B66;color:#fff;">🚗 Estou indo — avisar o cliente</button>`);
  const linhaFoto = foto ? `<div style="font-size:12.5px;color:#1E5B31;font-weight:700;margin-top:8px;">✓ Foto da carga — ${hhmm(foto.em)}</div><img src="/agente/coleta/foto?id=${coleta.id}" style="width:100%;border-radius:10px;margin-top:8px;border:1px solid #E4EBE9;">` : '';
  const btnChk = chk ? `<button class="btn done" disabled>✓ Cheguei ao local (${hhmm(chk.em)})</button>` : `<button class="btn primary" id="bchk">📍 Cheguei ao local (check-in)</button>`;
  const btnFoto = `<label class="btn ${chk ? 'primary' : 'muted'}" style="${chk ? '' : 'pointer-events:none;'}">${foto ? '📷 Trocar foto da carga' : '📷 Tirar foto da carga'}<input type="file" accept="image/*" capture="environment" id="fp" style="display:none;"></label>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${tagsPWA('agente')}<title>Coleta OS ${esc(coleta.numero)}</title>
<style>.btn{display:block;width:100%;box-sizing:border-box;border:none;border-radius:12px;padding:15px;font-size:14px;font-weight:800;margin-bottom:10px;text-align:center;cursor:pointer;}
.primary{background:#92C430;color:#10262B;}.dark{background:#00333B;color:#fff;}.ghost{background:#fff;color:#00333B;border:1.5px solid #cfe0dd;}.done{background:#E4F3E6;color:#1E5B31;}.muted{background:#EEF1F0;color:#9aa7a4;}</style></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="background:#00333B;padding:14px 18px;">
  <a href="/agente" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none;">← COLETA OS ${esc(coleta.numero)}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px;">${esc(coleta.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px;">${esc(coleta.endereco || 'Endereço no cadastro')}</div>
</div>
<div style="max-width:520px;margin:0 auto;padding:16px;">
  <div style="display:flex;gap:8px;margin-bottom:14px;">
    <a href="${esc(waze)}" target="_blank" rel="noopener" class="btn" style="flex:1;margin-bottom:0;background:#33ccff;color:#083b47;">🧭 Abrir no Waze</a>
    <a href="${esc(mapa)}" target="_blank" rel="noopener" class="btn ghost" style="flex:1;margin-bottom:0;">📍 Google Maps</a>
  </div>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:14px;">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:8px;">Linha do tempo</div>
    ${linhaAcam}${linhaChk}${linhaFoto}
  </div>
  ${btnAcam}
  ${btnChk}
  ${btnFoto}
  ${enc ? `
  <div class="btn done">✓ Coleta encerrada — ${hhmm(enc.em)}</div>
  <a href="/agente/coleta/comprovante?id=${esc(coleta.id)}" class="btn dark" style="text-decoration:none;">📄 Ver comprovante (QR)</a>
  ` : `
  <button class="btn ${chk ? 'dark' : 'muted'}" id="benc" ${chk ? '' : 'disabled'}>🏭 Encerrar na Ecobraz</button>
  ${chk ? '' : `<div style="text-align:center;font-size:10.5px;color:#9aa7a4;margin:-4px 0 12px;">faça o check-in no local antes de encerrar</div>`}
  <div id="pane-enc" style="display:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:14px;margin-bottom:10px;">
    <div style="font-size:12px;font-weight:800;color:#10262B;margin-bottom:8px;">Confirmar entrega na Ecobraz</div>
    <input id="vol" inputmode="text" placeholder="Volumes / quantidade (opcional)" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:12px;font-size:15px;margin-bottom:8px;">
    <textarea id="obs" rows="2" placeholder="Observações (opcional)" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:12px;font-size:15px;font-family:inherit;"></textarea>
    <button class="btn primary" id="benc2" style="margin-top:8px;">✓ Confirmar entrega</button>
  </div>
  <button class="btn ghost" id="brea">↩︎ Não deu pra coletar — reagendar</button>
  <div id="pane-rea" style="display:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:14px;margin-bottom:10px;">
    <textarea id="mot" rows="2" placeholder="Motivo (ex: cliente ausente, carga não estava pronta)" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:12px;font-size:15px;font-family:inherit;"></textarea>
    <button class="btn ghost" id="brea2" style="margin-top:8px;border-color:#E0B4AE;color:#B23A2E;">Enviar para reagendar</button>
  </div>
  `}
  ${rea ? `<div style="text-align:center;font-size:11.5px;color:#8A6A16;background:#FFF4DE;border-radius:8px;padding:9px;margin-bottom:12px;">↩︎ Enviado para reagendar${rea.motivo ? ' — ' + esc(rea.motivo) : ''}</div>` : ''}
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;"></div>
  <div id="net" style="text-align:center;font-size:10.5px;font-weight:700;margin-top:8px;"></div>
</div>
<script>
  const ID=${JSON.stringify(String(coleta.id))}, msg=document.getElementById('msg'), net=document.getElementById('net');
  function rede(){ net.textContent = navigator.onLine ? '🟢 Online' : '🟡 Sem sinal — tente de novo quando voltar'; net.style.color = navigator.onLine ? '#1E7A3D' : '#8A6A16'; }
  rede(); addEventListener('online',rede); addEventListener('offline',rede);
  const bacam=document.getElementById('bacam');
  if(bacam) bacam.onclick=async()=>{
    bacam.disabled=true; msg.textContent='Avisando o cliente…';
    try{ const r=await fetch('/api/agente/acaminho',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID})}); if(r.ok){location.reload();} else {msg.textContent='Falha ao avisar. Tente de novo.'; bacam.disabled=false;} }
    catch{ msg.textContent='Sem conexão. Tente de novo com sinal.'; bacam.disabled=false; }
  };
  const bchk=document.getElementById('bchk');
  if(bchk) bchk.onclick=()=>{
    if(!navigator.geolocation){ msg.textContent='Este aparelho não tem GPS disponível.'; return; }
    bchk.disabled=true; msg.textContent='Pegando sua localização…';
    navigator.geolocation.getCurrentPosition(async p=>{
      try{ const r=await fetch('/api/agente/checkin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID,lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy})}); if(r.ok){location.reload();} else {msg.textContent='Falha ao salvar. Tente de novo.'; bchk.disabled=false;} }
      catch{ msg.textContent='Sem conexão. Tente de novo com sinal.'; bchk.disabled=false; }
    }, e=>{ msg.textContent = e.code===1?'Precisa permitir a localização no navegador.':'Não consegui pegar o GPS. Tente de novo.'; bchk.disabled=false; }, {enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };
  const fp=document.getElementById('fp');
  if(fp) fp.onchange=async()=>{
    const f=fp.files&&fp.files[0]; if(!f) return; msg.textContent='Preparando a foto…';
    try{
      const img=await createImageBitmap(f); const max=1100; const sc=Math.min(1,max/Math.max(img.width,img.height));
      const cv=document.createElement('canvas'); cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      const dataUrl=cv.toDataURL('image/jpeg',0.6); const b64=dataUrl.split(',')[1];
      msg.textContent='Enviando a foto…';
      const r=await fetch('/api/agente/foto',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID,foto:b64})});
      if(r.ok){location.reload();} else {msg.textContent='Falha ao enviar a foto. Tente de novo.';}
    }catch{ msg.textContent='Não consegui processar a foto. Tente de novo.'; }
  };
  const benc=document.getElementById('benc'),benc2=document.getElementById('benc2'),brea=document.getElementById('brea'),brea2=document.getElementById('brea2');
  function toggle(id){const p=document.getElementById(id);if(p)p.style.display=p.style.display==='none'?'block':'none';}
  if(benc) benc.onclick=()=>toggle('pane-enc');
  if(brea) brea.onclick=()=>toggle('pane-rea');
  if(benc2) benc2.onclick=async()=>{benc2.disabled=true;msg.textContent='Encerrando…';
    try{const r=await fetch('/api/agente/encerrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID,volumes:(document.getElementById('vol').value||''),obs:(document.getElementById('obs').value||'')})});
      if(r.ok){location.href='/agente/coleta/comprovante?id='+ID;}else{msg.textContent='Falha ao encerrar. Tente de novo.';benc2.disabled=false;}}
    catch{msg.textContent='Sem conexão. Tente de novo com sinal.';benc2.disabled=false;}};
  if(brea2) brea2.onclick=async()=>{brea2.disabled=true;msg.textContent='Enviando…';
    try{const r=await fetch('/api/agente/reagendar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID,motivo:(document.getElementById('mot').value||'')})});
      if(r.ok){location.reload();}else{msg.textContent='Falha ao enviar. Tente de novo.';brea2.disabled=false;}}
    catch{msg.textContent='Sem conexão. Tente de novo com sinal.';brea2.disabled=false;}};
</script>
</body></html>`;
}

// Comprovante de coleta imprimível (o motorista/cliente pode salvar em PDF pelo navegador).
export function paginaComprovante(agente, coleta, estado, seloUrl) {
  const enc = (estado && estado.encerramento) || {};
  const chk = estado && estado.checkin;
  const os = (estado && estado.os) || {};
  const numero = os.numero || (coleta && coleta.numero) || '';
  const cliente = os.cliente || (coleta && coleta.cliente) || '';
  const endereco = os.endereco || (coleta && coleta.endereco) || '';
  const foto = estado && estado.foto;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${tagsPWA('agente')}<title>Comprovante — Coleta OS ${esc(numero)}</title>
<style>@media print{.noprint{display:none!important}body{background:#fff!important}}</style></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="max-width:560px;margin:0 auto;padding:18px;">
  <div class="noprint" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <a href="/agente/coleta?id=${esc(coleta.id)}" style="color:#4F6469;font-size:13px;font-weight:800;text-decoration:none;">← Voltar</a>
    <button onclick="window.print()" style="background:#00333B;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:800;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:26px 24px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #00333B;padding-bottom:14px;">
      <div><div style="font-size:22px;font-weight:800;color:#00333B;">ecobraz</div><div style="font-size:10.5px;color:#6B7B78;margin-top:2px;">Gestão de resíduos eletroeletrônicos</div></div>
      <div style="text-align:right;"><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7c8a87;">Comprovante</div><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7c8a87;">de coleta</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:16px;">
      <div><div style="font-size:10px;color:#7c8a87;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Coleta (OS)</div><div style="font-size:20px;font-weight:800;margin-top:3px;">${esc(numero || '—')}</div></div>
      <div style="text-align:right;"><div style="font-size:10px;color:#7c8a87;text-transform:uppercase;letter-spacing:.08em;font-weight:800;">Data / hora</div><div style="font-size:14px;font-weight:700;margin-top:5px;">${esc(dataHoraBR(enc.em))}</div></div>
    </div>
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:18px;font-size:13.5px;">
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;width:42%;">Cliente</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;">${esc(cliente || '—')}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;vertical-align:top;">Endereço da coleta</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:600;">${esc(endereco || '—')}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;">Agente responsável</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;">${esc(enc.agenteNome || (agente && agente.nome) || '—')}</td></tr>
      ${enc.volumes ? `<tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;">Volumes / quantidade</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;">${esc(enc.volumes)}</td></tr>` : ''}
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;">Check-in no local</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:${chk ? '#1E7A3D' : '#8A6A16'};">${chk ? 'confirmado por GPS · ' + hhmm(chk.em) : 'não registrado'}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;">Registro fotográfico</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:${foto ? '#1E7A3D' : '#8A6A16'};">${foto ? 'anexado' : 'não anexado'}</td></tr>
    </table>
    ${enc.obs ? `<div style="margin-top:14px;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:10px;padding:12px 14px;font-size:12.5px;"><b>Observações:</b> ${esc(enc.obs)}</div>` : ''}
    <div style="display:flex;gap:16px;align-items:center;margin-top:22px;border-top:1px solid #E4EBE9;padding-top:18px;">
      <img src="${esc(seloUrl)}" alt="QR de validação" style="width:104px;height:104px;flex:none;border:1px solid #E4EBE9;border-radius:8px;">
      <div style="font-size:12px;color:#4F6469;line-height:1.6;">Aponte a câmera para o QR e confirme a autenticidade desta coleta no site da Ecobraz.<br><span style="font-size:10.5px;color:#9aa7a4;">A destinação final e o CDF são emitidos após o processamento na unidade.</span></div>
    </div>
  </div>
  <div style="text-align:center;font-size:10px;color:#9aa7a4;margin-top:12px;">Documento gerado eletronicamente pela Ecobraz${enc.em ? ' · ' + esc(dataHoraBR(enc.em)) : ''}</div>
</div>
</body></html>`;
}
