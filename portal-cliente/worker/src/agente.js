// App do Agente de Coletas (PWA mobile). Fatia 1: login do agente + lista das coletas em "Em Transporte".
// Os agentes NÃO são usuários do Ploomes (equipe enxuta): a lista de agentes vive no NOSSO sistema
// (env AGENTE_EMAILS = "email|Nome,email2|Nome2"). O app lê as Vendas (Orders) na etapa "Em Transporte"
// (StageId 35313, configurável). Câmera/GPS/offline/encerrar/PDF vêm nas próximas fatias.

const STAGE_EM_TRANSPORTE = (env) => Number(env.COLETA_STAGE_EM_TRANSPORTE || 35313);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

// Lê as coletas em "Em Transporte" no Ploomes (Vendas/Orders).
export async function listarColetas(env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const stage = STAGE_EM_TRANSPORTE(env);
  const r = await fetch(`${base}/Orders?$filter=StageId%20eq%20${stage}&$top=50&$orderby=Id%20desc&$select=Id,OrderNumber,ContactId,ContactName,Date`, { headers });
  if (!r.ok) return [];
  const arr = (await r.json()).value || [];
  return arr.map((o) => ({ id: o.Id, numero: o.OrderNumber, cliente: o.ContactName || '', contactId: o.ContactId }));
}

export function paginaLoginAgente() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Ecobraz Coletas</title></head>
<body style="margin:0;background:#00333B;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#fff;display:flex;align-items:center;">
<div style="max-width:400px;margin:0 auto;padding:32px 24px;width:100%;box-sizing:border-box;">
  <div style="text-align:center;margin-bottom:28px;"><span style="font-size:26px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">coletas</span></div>
  <div style="background:#fff;border-radius:18px;padding:26px 22px;color:#10262B;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#00333B;">App do Agente</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6;">Digite seu e-mail. Enviamos um link de acesso (vale uma vez, 15 min).</p>
    <input id="e" type="email" inputmode="email" placeholder="seu e-mail" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:11px;padding:14px;font-size:16px;font-family:inherit;">
    <button id="b" style="width:100%;margin-top:12px;background:#92C430;color:#10262B;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:800;">Entrar</button>
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

export function paginaAppAgente(agente, coletas) {
  const itens = coletas.length ? coletas.map((c) => `<a href="/agente/coleta?id=${c.id}" style="display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:15px 16px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-size:14px;font-weight:800;color:#10262B;">OS ${esc(c.numero)}</div><span style="font-size:10px;font-weight:800;color:#8A6A16;background:#FFF4DE;padding:3px 8px;border-radius:20px;">EM TRANSPORTE</span></div>
      <div style="font-size:13px;color:#4F6469;margin-top:7px;">${esc(c.cliente || 'Cliente')}</div>
      <div style="font-size:12px;color:#3f8f3a;font-weight:700;margin-top:10px;">Abrir coleta →</div>
    </a>`).join('') : `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:26px 18px;text-align:center;color:#8fa39f;font-size:13.5px;">Nenhuma coleta em transporte agora.<br>Quando a Débora liberar uma coleta, ela aparece aqui.</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Minhas coletas — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="background:#00333B;padding:16px 18px 14px;">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div><span style="color:#fff;font-size:15px;font-weight:800;">Olá, ${esc((agente.nome || '').split(/\s+/)[0] || 'agente')} 👋</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px;">Ecobraz · Coletas</div></div>
    <form method="post" action="/api/agente/sair" style="margin:0;"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;">Sair</button></form>
  </div>
</div>
<div style="max-width:520px;margin:0 auto;padding:16px 16px 40px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><div style="font-size:13px;font-weight:800;">Coletas em transporte</div><span style="font-size:11px;background:#E3F0F3;color:#0B5B66;font-weight:800;padding:3px 9px;border-radius:20px;">${coletas.length}</span></div>
  ${itens}
  <div style="font-size:10.5px;color:#9aa7a4;text-align:center;margin-top:14px;">Toque numa coleta para fazer o check-in por GPS e a foto da carga.</div>
</div>
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
  const { base, headers } = ploomesCfg(env);
  const r = await fetch(`${base}/Orders?$filter=Id%20eq%20${Number(id)}&$top=1&$select=Id,OrderNumber,ContactId,ContactName,StageId&$expand=Contact($select=Name,StreetAddress,StreetAddressNumber,StreetAddressLine2,Neighborhood,City,StateName,ZipCode)`, { headers });
  if (!r.ok) return null;
  const o = ((await r.json()).value || [])[0]; if (!o) return null;
  const c = o.Contact || {};
  const endereco = [[c.StreetAddress, c.StreetAddressNumber].filter(Boolean).join(', '), c.StreetAddressLine2, c.Neighborhood, [c.City, c.StateName].filter(Boolean).join(' - '), c.ZipCode].filter(Boolean).join(' · ');
  return { id: o.Id, numero: o.OrderNumber, cliente: o.ContactName || c.Name || '', stageId: o.StageId, endereco };
}
export async function lerEstadoColeta(env, id) { if (!env.PORTAL_KV) return {}; const raw = await env.PORTAL_KV.get(`coleta:${id}`); return raw ? JSON.parse(raw) : {}; }
async function salvarEstadoColeta(env, id, e) { if (env.PORTAL_KV) await env.PORTAL_KV.put(`coleta:${id}`, JSON.stringify(e).slice(0, 4000), { expirationTtl: 60 * 60 * 24 * 120 }); }
export async function registrarCheckin(env, id, agente, geo) { const e = await lerEstadoColeta(env, id); e.checkin = { lat: Number(geo.lat), lon: Number(geo.lon), acc: Math.round(Number(geo.acc) || 0), em: agora(), agente: agente.email }; await salvarEstadoColeta(env, id, e); return e; }
export async function registrarFoto(env, id, agente, b64) { const e = await lerEstadoColeta(env, id); if (env.PORTAL_KV) await env.PORTAL_KV.put(`coletafoto:${id}`, String(b64).slice(0, 3000000), { expirationTtl: 60 * 60 * 24 * 120 }); e.foto = { em: agora(), agente: agente.email }; await salvarEstadoColeta(env, id, e); return e; }
export async function servirFotoColeta(env, id) {
  if (!env.PORTAL_KV) return new Response('sem foto', { status: 404 });
  const b64 = await env.PORTAL_KV.get(`coletafoto:${id}`);
  if (!b64) return new Response('sem foto', { status: 404 });
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
}

export function paginaColetaDetalhe(agente, coleta, estado) {
  const chk = estado && estado.checkin;
  const foto = estado && estado.foto;
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coleta.endereco || coleta.cliente)}`;
  const linhaChk = chk ? `<div style="font-size:12.5px;color:#1E5B31;font-weight:700;">✓ Check-in no local — ${hhmm(chk.em)}</div><div style="font-size:10.5px;color:#8fa39f;margin-top:2px;">GPS registrado · precisão ${chk.acc} m</div>` : `<div style="font-size:12.5px;color:#8fa39f;">Aguardando check-in…</div>`;
  const linhaFoto = foto ? `<div style="font-size:12.5px;color:#1E5B31;font-weight:700;margin-top:8px;">✓ Foto da carga — ${hhmm(foto.em)}</div><img src="/agente/coleta/foto?id=${coleta.id}" style="width:100%;border-radius:10px;margin-top:8px;border:1px solid #E4EBE9;">` : '';
  const btnChk = chk ? `<button class="btn done" disabled>✓ Cheguei ao local (${hhmm(chk.em)})</button>` : `<button class="btn primary" id="bchk">📍 Cheguei ao local (check-in)</button>`;
  const btnFoto = `<label class="btn ${chk ? 'primary' : 'muted'}" style="${chk ? '' : 'pointer-events:none;'}">${foto ? '📷 Trocar foto da carga' : '📷 Tirar foto da carga'}<input type="file" accept="image/*" capture="environment" id="fp" style="display:none;"></label>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Coleta OS ${esc(coleta.numero)}</title>
<style>.btn{display:block;width:100%;box-sizing:border-box;border:none;border-radius:12px;padding:15px;font-size:14px;font-weight:800;margin-bottom:10px;text-align:center;cursor:pointer;}
.primary{background:#92C430;color:#10262B;}.dark{background:#00333B;color:#fff;}.ghost{background:#fff;color:#00333B;border:1.5px solid #cfe0dd;}.done{background:#E4F3E6;color:#1E5B31;}.muted{background:#EEF1F0;color:#9aa7a4;}</style></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="background:#00333B;padding:14px 18px;">
  <a href="/agente" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none;">← COLETA OS ${esc(coleta.numero)}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px;">${esc(coleta.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px;">${esc(coleta.endereco || 'Endereço no cadastro')}</div>
</div>
<div style="max-width:520px;margin:0 auto;padding:16px;">
  <a href="${esc(mapa)}" target="_blank" rel="noopener" class="btn ghost" style="margin-bottom:14px;">📍 Abrir no mapa</a>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:14px;">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:8px;">Linha do tempo</div>
    ${linhaChk}${linhaFoto}
  </div>
  ${btnChk}
  ${btnFoto}
  <button class="btn muted" disabled>🏭 Encerrar na Ecobraz</button>
  <div style="text-align:center;font-size:10px;color:#9aa7a4;margin:-2px 0 14px;">encerrar e reagendar entram na próxima fatia</div>
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;"></div>
  <div id="net" style="text-align:center;font-size:10.5px;font-weight:700;margin-top:8px;"></div>
</div>
<script>
  const ID=${Number(coleta.id)}, msg=document.getElementById('msg'), net=document.getElementById('net');
  function rede(){ net.textContent = navigator.onLine ? '🟢 Online' : '🟡 Sem sinal — tente de novo quando voltar'; net.style.color = navigator.onLine ? '#1E7A3D' : '#8A6A16'; }
  rede(); addEventListener('online',rede); addEventListener('offline',rede);
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
</script>
</body></html>`;
}
