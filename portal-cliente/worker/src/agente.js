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
  <div style="font-size:10.5px;color:#9aa7a4;text-align:center;margin-top:14px;">Fatia 1 (lista real). Check-in GPS, foto e encerrar vêm nas próximas.</div>
</div>
</body></html>`;
}
