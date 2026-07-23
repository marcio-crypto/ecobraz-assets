// Módulo Operacional Ecobraz (doca → destino). Slice 1: recepção na doca.
// Operadores da Ecobraz (equipe da doca) — NÃO são usuários do Ploomes; a lista vive no nosso
// sistema (env OPERACAO_EMAILS = "email|Nome,email2|Nome2"). Cada operação está ligada a um lote
// (OS/Venda do Ploomes) e acumula EVIDÊNCIA à prova de auditoria: pesagem, fotos carimbadas
// (OS + data/hora + GPS na imagem) por fase, e travas de conformidade.
//
// Fatias seguintes: triagem/classificação (IBAMA + classe), processamento/descaracterização (R2/R3),
// acondicionamento + pesagem de saída, balanço de massa, laudo (Pago/ANVISA) e envio pra validação
// da Engenharia Ambiental.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const hhmm = (iso) => { const m = String(iso || '').match(/T(\d{2}:\d{2})/); return m ? m[1] : ''; };
const dataHora = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${m[3]}/${m[2]} ${m[4]}` : ''; };
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function ploomesCfg(env) { return { base: (env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, ''), headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } }; }

// --- Registro de operadores (fonte única: env OPERACAO_EMAILS) ---
export function operadoresDe(env) {
  const out = new Map();
  for (const par of String(env.OPERACAO_EMAILS || '').split(/[,;]+/)) {
    const [em, nome] = par.split('|');
    const e = (em || '').trim().toLowerCase();
    if (e) out.set(e, (nome || '').trim() || e.split('@')[0]);
  }
  return out;
}
export function operadorPermitido(email, env) { return operadoresDe(env).has(String(email || '').trim().toLowerCase()); }
export function nomeOperador(email, env) { return operadoresDe(env).get(String(email || '').trim().toLowerCase()) || String(email || '').split('@')[0]; }

// --- Fases e fotos obrigatórias (Slice 1: só INÍCIO) ---
export const FASES = {
  inicio: {
    rotulo: 'Recepção / Integridade',
    fotos: [
      { id: 'vista_geral', rotulo: 'Vista geral do lote', obrig: true },
      { id: 'identificacao', rotulo: 'Etiqueta / identificação', obrig: true },
      { id: 'lacre', rotulo: 'Lacre de transporte (se houver)', obrig: false },
    ],
  },
  meio: {
    rotulo: 'Processamento / Descaracterização',
    fotos: [
      { id: 'material_maquina', rotulo: 'Material na máquina (em operação)', obrig: true },
      { id: 'inutilizacao', rotulo: 'Inutilização / fragmentação', obrig: true },
      { id: 'destruicao_dados', rotulo: 'Destruição de dados (R2/R3)', obrig: false, soPago: true },
    ],
  },
  fim: {
    rotulo: 'Inutilização concluída / Acondicionamento',
    fotos: [
      { id: 'residuo_final', rotulo: 'Resíduo final inutilizado', obrig: true },
      { id: 'acondicionamento', rotulo: 'Carregamento p/ o destino', obrig: true },
    ],
  },
};

// --- Persistência (KV) ---
async function lerIndice(env) { if (!env.PORTAL_KV) return []; const raw = await env.PORTAL_KV.get('op:index'); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
async function salvarIndice(env, lista) { if (env.PORTAL_KV) await env.PORTAL_KV.put('op:index', JSON.stringify(lista.slice(0, 300))); }
export async function lerOperacao(env, osId) { if (!env.PORTAL_KV) return null; const raw = await env.PORTAL_KV.get(`op:${osId}`); return raw ? JSON.parse(raw) : null; }
async function salvarOperacao(env, op) {
  if (!env.PORTAL_KV) return;
  op.atualizadoEm = agora();
  await env.PORTAL_KV.put(`op:${op.osId}`, JSON.stringify(op), { expirationTtl: 60 * 60 * 24 * 365 });
  const idx = await lerIndice(env);
  const resumo = { osId: op.osId, numero: op.numero, cliente: op.cliente, etapa: op.etapa, tipo: op.tipo, em: op.atualizadoEm };
  const i = idx.findIndex((x) => String(x.osId) === String(op.osId));
  if (i >= 0) idx[i] = resumo; else idx.unshift(resumo);
  await salvarIndice(env, idx);
}

export async function listarOperacoes(env) { return await lerIndice(env); }
// Usado por outros módulos (ex.: Engenharia Ambiental) para mudar a etapa/anexar um resultado.
export async function atualizarEtapaOperacao(env, osId, etapa, patch) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  if (etapa) op.etapa = etapa;
  if (patch) Object.assign(op, patch);
  await salvarOperacao(env, op); return op;
}

// Coletas que podem ser recebidas na doca: Vendas recentes do Ploomes (o operador escolhe o lote que chegou).
export async function listarColetasRecebiveis(env) {
  const { base, headers } = ploomesCfg(env);
  const r = await fetch(`${base}/Orders?$top=30&$orderby=Id%20desc&$select=Id,OrderNumber,ContactName,Date`, { headers });
  if (!r.ok) return [];
  return ((await r.json()).value || []).map((o) => ({ osId: o.Id, numero: o.OrderNumber, cliente: o.ContactName || '' }));
}

async function buscarColeta(env, osId) {
  const { base, headers } = ploomesCfg(env);
  const r = await fetch(`${base}/Orders?$filter=Id%20eq%20${Number(osId)}&$top=1&$select=Id,OrderNumber,ContactName`, { headers });
  if (!r.ok) return null;
  const o = ((await r.json()).value || [])[0]; if (!o) return null;
  return { osId: o.Id, numero: o.OrderNumber, cliente: o.ContactName || '' };
}

export async function iniciarOperacao(env, osId, operador) {
  let op = await lerOperacao(env, osId);
  if (op) return op; // já existe
  const c = await buscarColeta(env, osId);
  if (!c) return null;
  op = { osId: String(c.osId), numero: c.numero, cliente: c.cliente, tipo: 'padrao', etapa: 'recepcao', criadoEm: agora(), criadoPor: operador.email, entrada: null, fotos: {} };
  await salvarOperacao(env, op);
  return op;
}

export async function definirTipoOperacao(env, osId, tipo) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  op.tipo = tipo === 'pago' ? 'pago' : 'padrao';
  await salvarOperacao(env, op); return op;
}

export async function registrarPesoEntrada(env, osId, operador, kg) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  const peso = Math.max(0, Number(String(kg).replace(',', '.')) || 0);
  op.entrada = { pesoKg: peso, em: agora(), por: operador.email };
  await salvarOperacao(env, op); return op;
}

export async function registrarFotoOperacao(env, osId, operador, fase, categoria, b64, meta) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  const fdef = FASES[fase]; if (!fdef || !fdef.fotos.some((f) => f.id === categoria)) return null;
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`opfoto:${osId}:${fase}:${categoria}`, String(b64).slice(0, 3500000), { expirationTtl: 60 * 60 * 24 * 365 });
  op.fotos[fase] = op.fotos[fase] || {};
  op.fotos[fase][categoria] = { em: agora(), por: operador.email, geo: meta && meta.geo ? { lat: Number(meta.geo.lat), lon: Number(meta.geo.lon), acc: Math.round(Number(meta.geo.acc) || 0) } : null };
  await salvarOperacao(env, op); return op;
}

export async function servirFotoOperacao(env, osId, fase, categoria) {
  if (!env.PORTAL_KV) return new Response('sem foto', { status: 404 });
  const b64 = await env.PORTAL_KV.get(`opfoto:${osId}:${fase}:${categoria}`);
  if (!b64) return new Response('sem foto', { status: 404 });
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
}

// Trava: a Fase INÍCIO só está completa com peso de entrada + as fotos obrigatórias.
export function inicioCompleto(op) {
  if (!op || !op.entrada || !(op.entrada.pesoKg > 0)) return false;
  const fs = (op.fotos && op.fotos.inicio) || {};
  return FASES.inicio.fotos.filter((f) => f.obrig).every((f) => fs[f.id]);
}
export const triagemCompleta = (op) => !!(op && (op.materiais || []).length);
// Fase MEIO: fotos obrigatórias + (se Pago/laudo) a destruição de dados R2/R3.
export function meioCompleto(op) {
  if (!op) return false;
  const fs = (op.fotos && op.fotos.meio) || {};
  const req = FASES.meio.fotos.filter((f) => f.obrig || (f.soPago && op.tipo === 'pago'));
  return req.every((f) => fs[f.id]);
}
export async function concluirProcessamento(env, osId) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  if (meioCompleto(op)) { op.etapa = 'saida'; await salvarOperacao(env, op); }
  return op;
}
const TOL_BALANCO = 0.02; // tolerância do balanço de massa: 2%
export function balanco(op) {
  const entrada = op && op.entrada ? Number(op.entrada.pesoKg) || 0 : 0;
  const saida = op && op.saida ? Number(op.saida.pesoKg) || 0 : 0;
  const dif = Math.round((entrada - saida) * 100) / 100;
  const pct = entrada > 0 ? Math.abs(dif) / entrada : 1;
  const somaMat = somaMateriais(op);
  const base = saida || somaMat; // reparte pela proporção da triagem
  const porDestino = {};
  for (const m of (op.materiais || [])) {
    const frac = somaMat > 0 ? (Number(m.qtd) || 0) / somaMat : 0;
    porDestino[m.destino] = Math.round(((porDestino[m.destino] || 0) + frac * base) * 100) / 100;
  }
  return { entrada, saida, dif, pct, fecha: entrada > 0 && saida > 0 && pct <= TOL_BALANCO, porDestino };
}
export async function registrarSaida(env, osId, operador, d) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  const pesoKg = Math.max(0, Number(String(d && d.pesoKg).replace(',', '.')) || 0);
  op.saida = { pesoKg, justificativa: String((d && d.justificativa) || '').slice(0, 400), em: agora(), por: operador.email };
  await salvarOperacao(env, op); return op;
}
export function fimCompleto(op) {
  if (!op) return false;
  const fs = (op.fotos && op.fotos.fim) || {};
  const fotosOk = FASES.fim.fotos.filter((f) => f.obrig).every((f) => fs[f.id]);
  const b = balanco(op);
  const balancoOk = b.saida > 0 && (b.fecha || (op.saida && op.saida.justificativa));
  return fotosOk && balancoOk;
}
export async function concluirSaida(env, osId) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  if (fimCompleto(op)) { op.etapa = 'validacao'; op.concluidaEm = agora(); await salvarOperacao(env, op); }
  return op;
}
// Linha de navegação entre as etapas (usada no "hub" da operação).
function etapaLink(rotulo, href, desbloqueado, feito, nota) {
  const pill = feito
    ? `<span class="pill" style="background:#E4F3E6;color:#1E5B31">✓ feito</span>`
    : (desbloqueado ? `<span class="pill" style="background:#E3F0F3;color:#0B5B66">a fazer</span>` : `<span class="pill" style="background:#EEF1F0;color:#9aa7a4">${esc(nota || 'bloqueado')}</span>`);
  const inner = `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid #EEF1F0"><div style="font-size:13.5px;font-weight:700;color:${desbloqueado ? '#10262B' : '#9aa7a4'}">${esc(rotulo)}${desbloqueado && !feito ? ' →' : ''}</div>${pill}</div>`;
  return desbloqueado ? `<a href="${esc(href)}" style="text-decoration:none;display:block">${inner}</a>` : inner;
}

// --- Páginas ---
const CSS = `*{box-sizing:border-box}body{margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;-webkit-text-size-adjust:100%}
.wrap{max-width:560px;margin:0 auto;padding:16px 16px 44px}
.top{background:#00333B;padding:16px 18px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:16px;margin-bottom:14px}
.eyebrow{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px}
.btn{display:block;width:100%;border:none;border-radius:12px;padding:15px;font-size:14px;font-weight:800;text-align:center;cursor:pointer;margin-bottom:10px;text-decoration:none}
.primary{background:#92C430;color:#10262B}.dark{background:#00333B;color:#fff}.ghost{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}.muted{background:#EEF1F0;color:#9aa7a4}.done{background:#E4F3E6;color:#1E5B31}
label.fld{display:block;font-size:12px;font-weight:700;color:#4F6469;margin:0 0 6px}
input.txt{width:100%;border:1px solid #DDE1E6;border-radius:11px;padding:13px;font-size:16px;font-family:inherit}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}`;

function head(titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} — Ecobraz</title><style>${CSS}</style></head><body>`;
}

export function paginaLoginOperacao() {
  return `${head('Operação')}
<div style="min-height:100vh;display:flex;align-items:center;background:#00333B">
  <div style="max-width:400px;margin:0 auto;padding:32px 24px;width:100%">
    <div style="text-align:center;margin-bottom:26px"><span style="color:#fff;font-size:26px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">operação</span></div>
    <div style="background:#fff;border-radius:18px;padding:26px 22px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#00333B">Recepção na doca</h1>
      <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6">Digite seu e-mail. Enviamos um link de acesso (vale uma vez, 15 min).</p>
      <input id="e" type="email" inputmode="email" placeholder="seu e-mail" class="txt">
      <button id="b" class="btn primary" style="margin-top:12px">Entrar</button>
      <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px;line-height:1.5"></div>
    </div>
  </div>
</div>
<script>
  const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
  b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/operacao/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail estiver cadastrado, enviamos o link.';}catch{m.textContent='Tente de novo em instantes.';}b.disabled=false;};
  e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});
</script></body></html>`;
}

const etapaRotulo = (e) => ({ recepcao: 'Recepção', triagem: 'Triagem', processamento: 'Processamento', saida: 'Saída', concluida: 'Concluída' }[e] || e);

export function paginaAppOperacao(operador, operacoes) {
  const itens = operacoes.length ? operacoes.map((o) => `<a href="/operacao/lote?id=${esc(o.osId)}" style="display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:15px 16px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:14px;font-weight:800;color:#10262B">OS ${esc(o.numero)}</div><span class="pill" style="color:#0B5B66;background:#E3F0F3">${esc(etapaRotulo(o.etapa))}</span></div>
      <div style="font-size:13px;color:#4F6469;margin-top:7px">${esc(o.cliente || 'Cliente')}${o.tipo === 'pago' ? ' · <b style="color:#8A6A16">Pago/laudo</b>' : ''}</div>
      <div style="font-size:12px;color:#3f8f3a;font-weight:700;margin-top:10px">Abrir operação →</div>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhuma operação aberta.<br>Toque em “Receber novo lote” para começar.</div>`;
  return `${head('Operações')}
<div class="top"><div style="display:flex;justify-content:space-between;align-items:center">
  <div><span style="color:#fff;font-size:15px;font-weight:800">Olá, ${esc((operador.nome || '').split(/\s+/)[0] || 'equipe')} 👋</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">Ecobraz · Operação (doca)</div></div>
  <form method="post" action="/api/operacao/sair" style="margin:0"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700">Sair</button></form>
</div></div>
<div class="wrap">
  <a href="/operacao/receber" class="btn dark" style="margin-bottom:16px">➕ Receber novo lote</a>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:13px;font-weight:800">Operações em andamento</div><span class="pill" style="background:#E3F0F3;color:#0B5B66">${operacoes.length}</span></div>
  ${itens}
</div></body></html>`;
}

export function paginaReceberLote(coletas) {
  const itens = coletas.length ? coletas.map((c) => `<form method="post" action="/api/operacao/iniciar" style="margin:0 0 10px"><input type="hidden" name="osId" value="${esc(c.osId)}">
      <button style="width:100%;text-align:left;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 15px;cursor:pointer">
        <div style="font-size:14px;font-weight:800;color:#10262B">OS ${esc(c.numero)}</div>
        <div style="font-size:13px;color:#4F6469;margin-top:5px">${esc(c.cliente || 'Cliente')}</div>
      </button></form>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Não consegui listar as coletas agora.</div>`;
  return `${head('Receber lote')}
<div class="top"><a href="/operacao" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← RECEBER NOVO LOTE</a>
  <div style="color:#fff;font-size:18px;font-weight:800;margin-top:8px">Qual lote chegou na doca?</div></div>
<div class="wrap">
  <div style="font-size:12px;color:#7c8a87;margin-bottom:12px">Toque na coleta correspondente ao material que acabou de chegar.</div>
  ${itens}
</div></body></html>`;
}

export function paginaLoteDetalhe(operador, op) {
  const entrada = op.entrada;
  const fs = (op.fotos && op.fotos.inicio) || {};
  const okInicio = inicioCompleto(op);
  const linhaFotos = FASES.inicio.fotos.map((f) => {
    const feito = fs[f.id];
    const cls = feito ? 'done' : (f.obrig ? 'primary' : 'ghost');
    const marca = feito ? `✓ ${esc(f.rotulo)} — ${hhmm(feito.em)}` : `📷 ${esc(f.rotulo)}${f.obrig ? '' : ' (opcional)'}`;
    const img = feito ? `<img src="/operacao/foto?id=${esc(op.osId)}&fase=inicio&cat=${f.id}" style="width:100%;border-radius:10px;margin:6px 0 12px;border:1px solid #E4EBE9">` : '';
    return `<label class="btn ${cls}" style="position:relative">${marca}<input type="file" accept="image/*" capture="environment" data-cat="${f.id}" class="fp" style="display:none"></label>${img}`;
  }).join('');
  return `${head('OS ' + op.numero)}
<div class="top"><a href="/operacao" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← OPERAÇÃO OS ${esc(op.numero)}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px">${esc(op.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px">Recepção na doca · Fase 1 (Início)</div></div>
<div class="wrap">

  <div class="card">
    <div class="eyebrow">Tipo de atendimento</div>
    <div style="display:flex;gap:10px">
      <button class="btn ${op.tipo === 'padrao' ? 'dark' : 'ghost'}" style="margin:0" onclick="tipo('padrao')">Padrão</button>
      <button class="btn ${op.tipo === 'pago' ? 'dark' : 'ghost'}" style="margin:0" onclick="tipo('pago')">Pago / laudo</button>
    </div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:8px">“Pago/laudo” = destruição R2/R3, hospitalar (ANVISA) — gera laudo com assinaturas (próxima fatia).</div>
  </div>

  <div class="card">
    <div class="eyebrow">1. Pesagem de entrada (balança)</div>
    ${entrada ? `<div style="font-size:22px;font-weight:800;color:#00333B">${String(entrada.pesoKg).replace('.', ',')} kg <span style="font-size:12px;color:#8fa39f;font-weight:600">· ${hhmm(entrada.em)}</span></div>
      <div style="font-size:11px;color:#3f8f3a;font-weight:700;margin-top:4px">✓ peso registrado</div>
      <div style="margin-top:10px"><input class="txt" id="peso" inputmode="decimal" placeholder="corrigir peso (kg)" style="font-size:15px"><button class="btn ghost" style="margin-top:8px" onclick="salvarPeso()">Atualizar peso</button></div>`
      : `<label class="fld">Peso bruto recebido (kg)</label><input class="txt" id="peso" inputmode="decimal" placeholder="ex.: 660"><button class="btn primary" style="margin-top:10px" onclick="salvarPeso()">Salvar peso de entrada</button>`}
  </div>

  <div class="card">
    <div class="eyebrow">2. Fotos da recepção (marca d'água automática: OS · data/hora · GPS)</div>
    ${linhaFotos}
    <div style="font-size:11px;color:#9aa7a4">Obrigatórias: vista geral e identificação. O lacre é opcional.</div>
  </div>

  <div class="card" style="background:${okInicio ? '#F0F7EC' : '#FBFCFB'};border-color:${okInicio ? '#cfe6be' : '#E4EBE9'}">
    <div class="eyebrow">Conformidade da Fase 1</div>
    <div style="font-size:13px;font-weight:700;color:${okInicio ? '#2f6d12' : '#8A6A16'}">${okInicio ? '✓ Recepção completa — pronta para a triagem' : '⚠ Faltam o peso e/ou as fotos obrigatórias'}</div>
  </div>

  <div class="card">
    <div class="eyebrow">Etapas da operação</div>
    ${etapaLink('Triagem — classificação', `/operacao/lote/triagem?id=${esc(op.osId)}`, okInicio, triagemCompleta(op))}
    ${etapaLink('Processamento — Fase 2 (R2/R3)', `/operacao/lote/processamento?id=${esc(op.osId)}`, triagemCompleta(op), meioCompleto(op))}
    ${etapaLink('Saída + balanço de massa', `/operacao/lote/saida?id=${esc(op.osId)}`, meioCompleto(op), fimCompleto(op))}
    ${etapaLink('Validação (Eng. Ambiental)', '#', false, op.etapa === 'validacao' || op.etapa === 'concluida', op.etapa === 'validacao' ? 'na fila da eng.' : 'em breve')}
  </div>
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;margin-top:8px"></div>
</div>
<script>
  const OS=${JSON.stringify(String(op.osId))}, NUM=${JSON.stringify(String(op.numero))}, msg=document.getElementById('msg');
  async function post(url,body){ const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw 0; return r; }
  async function tipo(t){ try{ await post('/api/operacao/tipo',{osId:OS,tipo:t}); location.reload(); }catch{ msg.textContent='Falha ao salvar. Tente de novo.'; } }
  async function salvarPeso(){ const v=(document.getElementById('peso')||{}).value; if(!v){ msg.textContent='Digite o peso.'; return; } msg.textContent='Salvando…'; try{ await post('/api/operacao/peso',{osId:OS,kg:v}); location.reload(); }catch{ msg.textContent='Falha ao salvar. Tente de novo.'; } }
  function geo(){ return new Promise(res=>{ if(!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy}),()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:0}); }); }
  async function carimbar(file){
    const g=await geo();
    const img=await createImageBitmap(file); const max=1200; const sc=Math.min(1,max/Math.max(img.width,img.height));
    const w=Math.round(img.width*sc), h=Math.round(img.height*sc);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const ctx=cv.getContext('2d'); ctx.drawImage(img,0,0,w,h);
    const dt=new Date(); const linhas=['ECOBRAZ · OS '+NUM, dt.toLocaleString('pt-BR'), g?('GPS '+g.lat.toFixed(5)+', '+g.lon.toFixed(5)+' (±'+Math.round(g.acc)+'m)'):'GPS indisponível'];
    const fs=Math.max(12,Math.round(w*0.028)), pad=Math.round(w*0.02), lh=fs+6, barH=linhas.length*lh+pad;
    ctx.fillStyle='rgba(0,51,59,0.66)'; ctx.fillRect(0,h-barH,w,barH);
    ctx.fillStyle='#fff'; ctx.textBaseline='top'; ctx.font='700 '+fs+'px Arial';
    linhas.forEach((t,i)=>{ if(i===1) ctx.font='400 '+fs+'px Arial'; ctx.fillText(t,pad,h-barH+pad/2+i*lh); });
    return { dataUrl: cv.toDataURL('image/jpeg',0.65), geo: g };
  }
  document.querySelectorAll('.fp').forEach(inp=>{
    inp.onchange=async()=>{ const f=inp.files&&inp.files[0]; if(!f) return; const cat=inp.getAttribute('data-cat'); msg.textContent='Preparando a foto…';
      try{ const r=await carimbar(f); msg.textContent='Enviando…';
        await post('/api/operacao/foto',{osId:OS,fase:'inicio',cat:cat,foto:r.dataUrl.split(',')[1],geo:r.geo}); location.reload();
      }catch{ msg.textContent='Não consegui processar a foto. Tente de novo.'; } };
  });
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Slice 2: Triagem / Classificação (código IBAMA + classe + qtd + destino)
// ---------------------------------------------------------------------------
// Catálogo de materiais comuns de e-lixo — SUGESTÕES para agilizar; a classificação final
// (IBAMA/classe) é validada pela Engenharia Ambiental. O operador pode editar tudo.
export const MATERIAIS = [
  { id: 'pci', rotulo: 'Placa de circuito (PCI)', ibama: '16 02 16', classe: 'II-A', destino: 'reciclagem' },
  { id: 'computador', rotulo: 'Computador / gabinete', ibama: '16 02 14', classe: 'II-A', destino: 'reciclagem' },
  { id: 'monitor', rotulo: 'Monitor / tela', ibama: '16 02 14', classe: 'II-A', destino: 'reciclagem' },
  { id: 'cabos', rotulo: 'Cabos e fios', ibama: '17 04 11', classe: 'II-A', destino: 'reciclagem' },
  { id: 'fonte_bateria', rotulo: 'Fonte / no-break / bateria', ibama: '16 06 00', classe: 'I', destino: 'coprocessamento' },
  { id: 'componentes', rotulo: 'Componentes eletrônicos', ibama: '16 02 16', classe: 'II-A', destino: 'reciclagem' },
  { id: 'metal', rotulo: 'Sucata metálica', ibama: '19 12 02', classe: 'II-B', destino: 'reciclagem' },
  { id: 'plastico', rotulo: 'Plástico', ibama: '19 12 04', classe: 'II-B', destino: 'reciclagem' },
  { id: 'rejeito', rotulo: 'Rejeito (não reciclável)', ibama: '19 12 12', classe: 'II-A', destino: 'incineracao' },
  { id: 'outros', rotulo: 'Outros', ibama: '', classe: 'II-A', destino: 'reciclagem' },
];
export const DESTINOS = { reciclagem: 'Reciclagem', incineracao: 'Incineração', coprocessamento: 'Coprocessamento', reuso: 'Reúso' };
const CLASSES = ['I', 'II-A', 'II-B'];

export async function adicionarMaterial(env, osId, operador, d) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  op.materiais = op.materiais || [];
  if (op.materiais.length >= 40) return op;
  const qtd = Math.max(0, Number(String(d && d.qtd).replace(',', '.')) || 0);
  op.materiais.push({
    rotulo: String((d && d.rotulo) || 'Material').slice(0, 60),
    ibama: String((d && d.ibama) || '').slice(0, 20),
    classe: CLASSES.includes(d && d.classe) ? d.classe : 'II-A',
    qtd,
    destino: DESTINOS[d && d.destino] ? d.destino : 'reciclagem',
    por: operador.email, em: agora(),
  });
  if (op.etapa === 'recepcao' && inicioCompleto(op)) op.etapa = 'triagem';
  await salvarOperacao(env, op); return op;
}
export async function removerMaterial(env, osId, idx) {
  const op = await lerOperacao(env, osId); if (!op || !op.materiais) return null;
  const i = Number(idx); if (i >= 0 && i < op.materiais.length) op.materiais.splice(i, 1);
  await salvarOperacao(env, op); return op;
}
export const somaMateriais = (op) => (op && op.materiais || []).reduce((s, m) => s + (Number(m.qtd) || 0), 0);
export async function concluirTriagem(env, osId) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  if ((op.materiais || []).length) { op.etapa = 'processamento'; await salvarOperacao(env, op); }
  return op;
}

export function paginaTriagem(operador, op) {
  const entrada = op.entrada ? op.entrada.pesoKg : 0;
  const mats = op.materiais || [];
  const soma = somaMateriais(op);
  const dif = Math.round((entrada - soma) * 100) / 100;
  const linhas = mats.length ? mats.map((m, i) => `<div style="border-top:1px solid #EEF1F0;padding:11px 0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div><div style="font-size:13.5px;font-weight:700">${esc(m.rotulo)}</div>
        <div style="font-size:11px;color:#7c8a87;margin-top:3px">IBAMA ${esc(m.ibama || '—')} · Classe ${esc(m.classe)} · <b style="color:#0B5B66">${esc(DESTINOS[m.destino] || m.destino)}</b></div></div>
      <div style="text-align:right;white-space:nowrap"><div style="font-size:14px;font-weight:800">${String(m.qtd).replace('.', ',')} kg</div>
        <form method="post" action="/api/operacao/material/remover" style="margin:2px 0 0"><input type="hidden" name="osId" value="${esc(op.osId)}"><input type="hidden" name="idx" value="${i}"><button style="background:none;border:none;color:#B23A2E;font-size:11px;font-weight:700;cursor:pointer;padding:0">remover</button></form></div>
    </div>`).join('') : `<div style="color:#9aa7a4;font-size:13px;padding:10px 0">Nenhum material classificado ainda.</div>`;
  const opts = MATERIAIS.map((m) => `<option value="${m.id}" data-rotulo="${esc(m.rotulo)}" data-ibama="${esc(m.ibama)}" data-classe="${m.classe}" data-destino="${m.destino}">${esc(m.rotulo)}</option>`).join('');
  const optDest = Object.entries(DESTINOS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const podeConcluir = mats.length > 0;
  const corDif = Math.abs(dif) <= Math.max(1, entrada * 0.02) ? '#1E7A3D' : '#8A6A16';
  return `${head('Triagem OS ' + op.numero)}
<div class="top"><a href="/operacao/lote?id=${esc(op.osId)}" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← TRIAGEM OS ${esc(op.numero)}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px">${esc(op.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px">Triagem · classificação dos materiais</div></div>
<div class="wrap">

  <div class="card">
    <div class="eyebrow">Balanço (entrada × classificado)</div>
    <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#4F6469">Peso de entrada</span><b>${String(entrada).replace('.', ',')} kg</b></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:5px"><span style="color:#4F6469">Já classificado</span><b>${String(soma).replace('.', ',')} kg</b></div>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:5px;border-top:1px solid #EEF1F0;padding-top:8px"><span style="color:#4F6469">Falta classificar</span><b style="color:${corDif}">${String(dif).replace('.', ',')} kg</b></div>
  </div>

  <div class="card">
    <div class="eyebrow">Materiais do lote</div>
    ${linhas}
  </div>

  <div class="card">
    <div class="eyebrow">Adicionar material</div>
    <label class="fld">Tipo (preenche IBAMA/classe sugeridos)</label>
    <select id="tipo" class="txt">${opts}</select>
    <div style="display:flex;gap:10px;margin-top:10px">
      <div style="flex:1"><label class="fld">Código IBAMA</label><input id="ibama" class="txt"></div>
      <div style="width:110px"><label class="fld">Classe</label><select id="classe" class="txt"><option>I</option><option selected>II-A</option><option>II-B</option></select></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:10px">
      <div style="flex:1"><label class="fld">Quantidade (kg)</label><input id="qtd" class="txt" inputmode="decimal" placeholder="ex.: 120"></div>
      <div style="flex:1"><label class="fld">Destino</label><select id="destino" class="txt">${optDest}</select></div>
    </div>
    <button class="btn primary" style="margin-top:12px" onclick="add()">Adicionar material</button>
    <div style="font-size:11px;color:#9aa7a4;margin-top:6px">IBAMA e classe são sugestões — a classificação final é validada pela Engenharia Ambiental.</div>
  </div>

  ${podeConcluir
    ? `<form method="post" action="/api/operacao/triagem/concluir" style="margin:0"><input type="hidden" name="osId" value="${esc(op.osId)}"><button class="btn dark">✓ Concluir triagem → Processamento</button></form>`
    : `<button class="btn muted" disabled>✓ Concluir triagem</button>`}
  <div style="text-align:center;font-size:10px;color:#9aa7a4;margin-top:2px">Processamento (fotos Fase 2, R2/R3), saída e balanço de massa entram nas próximas fatias.</div>
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;margin-top:8px"></div>
</div>
<script>
  const OS=${JSON.stringify(String(op.osId))}, msg=document.getElementById('msg');
  const sel=document.getElementById('tipo'), ib=document.getElementById('ibama'), cl=document.getElementById('classe'), de=document.getElementById('destino');
  function preencher(){ const o=sel.options[sel.selectedIndex]; ib.value=o.getAttribute('data-ibama')||''; cl.value=o.getAttribute('data-classe')||'II-A'; de.value=o.getAttribute('data-destino')||'reciclagem'; }
  sel.onchange=preencher; preencher();
  async function add(){ const rotulo=sel.options[sel.selectedIndex].getAttribute('data-rotulo'); const qtd=document.getElementById('qtd').value;
    if(!qtd||Number(qtd.replace(',','.'))<=0){ msg.textContent='Digite a quantidade em kg.'; return; }
    msg.textContent='Salvando…';
    try{ const r=await fetch('/api/operacao/material',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({osId:OS,rotulo:rotulo,ibama:ib.value,classe:cl.value,qtd:qtd,destino:de.value})});
      if(r.ok) location.reload(); else msg.textContent='Falha ao salvar. Tente de novo.';
    }catch{ msg.textContent='Sem conexão. Tente de novo.'; } }
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Slice 3: Processamento / Descaracterização (fotos Fase 2 — MEIO; R2/R3 se Pago)
// ---------------------------------------------------------------------------
export function paginaProcessamento(operador, op) {
  const fs = (op.fotos && op.fotos.meio) || {};
  const pago = op.tipo === 'pago';
  const slots = FASES.meio.fotos.filter((f) => !f.soPago || pago);
  const ok = meioCompleto(op);
  const linhaFotos = slots.map((f) => {
    const feito = fs[f.id];
    const obrig = f.obrig || (f.soPago && pago);
    const cls = feito ? 'done' : (obrig ? 'primary' : 'ghost');
    const marca = feito ? `✓ ${esc(f.rotulo)} — ${hhmm(feito.em)}` : `📷 ${esc(f.rotulo)}${obrig ? '' : ' (opcional)'}`;
    const img = feito ? `<img src="/operacao/foto?id=${esc(op.osId)}&fase=meio&cat=${f.id}" style="width:100%;border-radius:10px;margin:6px 0 12px;border:1px solid #E4EBE9">` : '';
    return `<label class="btn ${cls}">${marca}<input type="file" accept="image/*" capture="environment" data-cat="${f.id}" class="fp" style="display:none"></label>${img}`;
  }).join('');
  return `${head('Processamento OS ' + op.numero)}
<div class="top"><a href="/operacao/lote?id=${esc(op.osId)}" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← PROCESSAMENTO OS ${esc(op.numero)}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px">${esc(op.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px">Processamento / descaracterização · Fase 2 (Meio)</div></div>
<div class="wrap">
  <div class="card" style="background:#FBFCFB">
    <div class="eyebrow">Objetivo</div>
    <div style="font-size:13px;color:#4F6469;line-height:1.6">Provar a <b>inutilização física irreversível</b> do material.${pago ? ' Como é <b>Pago/laudo</b>, inclua a foto da <b>destruição de dados (R2/R3)</b>.' : ''}</div>
  </div>
  <div class="card">
    <div class="eyebrow">Fotos do processamento (marca d'água automática: OS · data/hora · GPS)</div>
    ${linhaFotos}
    <div style="font-size:11px;color:#9aa7a4">Obrigatórias: material na máquina e inutilização${pago ? ' + destruição de dados' : ''}.</div>
  </div>
  <div class="card" style="background:${ok ? '#F0F7EC' : '#FBFCFB'};border-color:${ok ? '#cfe6be' : '#E4EBE9'}">
    <div class="eyebrow">Conformidade da Fase 2</div>
    <div style="font-size:13px;font-weight:700;color:${ok ? '#2f6d12' : '#8A6A16'}">${ok ? '✓ Processamento completo — pronto para a Saída' : '⚠ Faltam as fotos obrigatórias'}</div>
  </div>
  ${ok
    ? `<form method="post" action="/api/operacao/processamento/concluir" style="margin:0"><input type="hidden" name="osId" value="${esc(op.osId)}"><button class="btn dark">✓ Concluir processamento → Saída</button></form>`
    : `<button class="btn muted" disabled>✓ Concluir processamento</button>`}
  <div style="text-align:center;font-size:10px;color:#9aa7a4;margin-top:2px">A Saída (pesagem por destino + Fase 3) e o fechamento do balanço de massa entram na próxima fatia.</div>
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;margin-top:8px"></div>
</div>
<script>
  const OS=${JSON.stringify(String(op.osId))}, NUM=${JSON.stringify(String(op.numero))}, msg=document.getElementById('msg');
  async function post(url,body){ const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw 0; return r; }
  function geo(){ return new Promise(res=>{ if(!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy}),()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:0}); }); }
  async function carimbar(file){
    const g=await geo();
    const img=await createImageBitmap(file); const max=1200; const sc=Math.min(1,max/Math.max(img.width,img.height));
    const w=Math.round(img.width*sc), h=Math.round(img.height*sc);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const ctx=cv.getContext('2d'); ctx.drawImage(img,0,0,w,h);
    const dt=new Date(); const linhas=['ECOBRAZ · OS '+NUM, dt.toLocaleString('pt-BR'), g?('GPS '+g.lat.toFixed(5)+', '+g.lon.toFixed(5)+' (±'+Math.round(g.acc)+'m)'):'GPS indisponível'];
    const fz=Math.max(12,Math.round(w*0.028)), pad=Math.round(w*0.02), lh=fz+6, barH=linhas.length*lh+pad;
    ctx.fillStyle='rgba(0,51,59,0.66)'; ctx.fillRect(0,h-barH,w,barH);
    ctx.fillStyle='#fff'; ctx.textBaseline='top'; ctx.font='700 '+fz+'px Arial';
    linhas.forEach((t,i)=>{ if(i===1) ctx.font='400 '+fz+'px Arial'; ctx.fillText(t,pad,h-barH+pad/2+i*lh); });
    return { dataUrl: cv.toDataURL('image/jpeg',0.65), geo: g };
  }
  document.querySelectorAll('.fp').forEach(inp=>{
    inp.onchange=async()=>{ const f=inp.files&&inp.files[0]; if(!f) return; const cat=inp.getAttribute('data-cat'); msg.textContent='Preparando a foto…';
      try{ const r=await carimbar(f); msg.textContent='Enviando…';
        await post('/api/operacao/foto',{osId:OS,fase:'meio',cat:cat,foto:r.dataUrl.split(',')[1],geo:r.geo}); location.reload();
      }catch{ msg.textContent='Não consegui processar a foto. Tente de novo.'; } };
  });
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Slice 4: Saída — pesagem de saída + Fase 3 (FIM) + fechamento do balanço de massa
// ---------------------------------------------------------------------------
export function paginaSaida(operador, op) {
  const b = balanco(op);
  const fs = (op.fotos && op.fotos.fim) || {};
  const ok = fimCompleto(op);
  const temSaida = !!(op.saida && op.saida.pesoKg > 0);
  const foraTol = temSaida && !b.fecha;
  const corDif = b.fecha ? '#1E7A3D' : (temSaida ? '#B23A2E' : '#8A6A16');
  const destinoLinhas = Object.entries(b.porDestino).map(([k, v]) => `<div style="display:flex;justify-content:space-between;font-size:12.5px;color:#4F6469;padding:4px 0"><span>${esc(DESTINOS[k] || k)}</span><b>${String(v).replace('.', ',')} kg</b></div>`).join('') || '<div style="font-size:12px;color:#9aa7a4">Classifique na triagem para ver a repartição.</div>';
  const linhaFotos = FASES.fim.fotos.map((f) => {
    const feito = fs[f.id];
    const cls = feito ? 'done' : 'primary';
    const marca = feito ? `✓ ${esc(f.rotulo)} — ${hhmm(feito.em)}` : `📷 ${esc(f.rotulo)}`;
    const img = feito ? `<img src="/operacao/foto?id=${esc(op.osId)}&fase=fim&cat=${f.id}" style="width:100%;border-radius:10px;margin:6px 0 12px;border:1px solid #E4EBE9">` : '';
    return `<label class="btn ${cls}">${marca}<input type="file" accept="image/*" capture="environment" data-cat="${f.id}" class="fp" style="display:none"></label>${img}`;
  }).join('');
  return `${head('Saída OS ' + op.numero)}
<div class="top"><a href="/operacao/lote?id=${esc(op.osId)}" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← SAÍDA OS ${esc(op.numero)}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px">${esc(op.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px">Saída · pesagem + balanço de massa</div></div>
<div class="wrap">
  <div class="card">
    <div class="eyebrow">Balanço de massa</div>
    <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#4F6469">Entrada (pesada)</span><b>${String(b.entrada).replace('.', ',')} kg</b></div>
    <label class="fld" style="margin-top:12px">Peso de saída (balança)</label>
    <input class="txt" id="saida" inputmode="decimal" value="${temSaida ? String(op.saida.pesoKg) : ''}" placeholder="peso total que saiu (kg)">
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:12px;border-top:1px solid #EEF1F0;padding-top:9px"><span style="color:#4F6469">Diferença</span><b style="color:${corDif}">${temSaida ? String(b.dif).replace('.', ',') + ' kg (' + (Math.round(b.pct * 1000) / 10) + '%)' : '—'}</b></div>
    <div id="just" style="${foraTol ? '' : 'display:none;'}margin-top:10px">
      <label class="fld">Justificativa da diferença (obrigatória fora de ±2%)</label>
      <textarea class="txt" id="justtxt" rows="2" placeholder="ex.: perda de processo, umidade, resíduo retido…">${esc(op.saida && op.saida.justificativa || '')}</textarea>
    </div>
    <button class="btn primary" style="margin-top:12px" onclick="salvar()">Salvar saída</button>
  </div>
  <div class="card">
    <div class="eyebrow">Repartição por destino (proporção da triagem)</div>
    ${destinoLinhas}
  </div>
  <div class="card">
    <div class="eyebrow">Fotos da saída — Fase 3 (marca d'água automática)</div>
    ${linhaFotos}
    <div style="font-size:11px;color:#9aa7a4">Obrigatórias: resíduo final inutilizado e carregamento para o destino.</div>
  </div>
  <div class="card" style="background:${ok ? '#F0F7EC' : '#FBFCFB'};border-color:${ok ? '#cfe6be' : '#E4EBE9'}">
    <div class="eyebrow">Conformidade da Saída</div>
    <div style="font-size:13px;font-weight:700;color:${ok ? '#2f6d12' : '#8A6A16'}">${ok ? '✓ Saída completa — pronta para a validação da Engenharia' : '⚠ Faltam o peso de saída, a justificativa (se fora de ±2%) e/ou as fotos'}</div>
  </div>
  ${ok
    ? `<form method="post" action="/api/operacao/saida/concluir" style="margin:0"><input type="hidden" name="osId" value="${esc(op.osId)}"><button class="btn dark">✓ Concluir operação → Engenharia Ambiental</button></form>`
    : `<button class="btn muted" disabled>✓ Concluir operação</button>`}
  <div style="text-align:center;font-size:10px;color:#9aa7a4;margin-top:2px">Ao concluir, o lote entra na fila de validação do Engenheiro Ambiental.</div>
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;margin-top:8px"></div>
</div>
<script>
  const OS=${JSON.stringify(String(op.osId))}, NUM=${JSON.stringify(String(op.numero))}, ENTRADA=${Number(b.entrada) || 0}, msg=document.getElementById('msg');
  async function post(url,body){ const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); if(!r.ok) throw 0; return r; }
  const sIn=document.getElementById('saida'), just=document.getElementById('just');
  function chk(){ const v=Number((sIn.value||'').replace(',','.'))||0; const pct=ENTRADA>0?Math.abs(ENTRADA-v)/ENTRADA:1; just.style.display=(v>0&&pct>0.02)?'block':'none'; }
  sIn.addEventListener('input',chk); chk();
  async function salvar(){ if(!sIn.value){ msg.textContent='Digite o peso de saída.'; return; } msg.textContent='Salvando…';
    try{ await post('/api/operacao/saida',{osId:OS,pesoKg:sIn.value,justificativa:(document.getElementById('justtxt')||{}).value||''}); location.reload(); }catch{ msg.textContent='Falha ao salvar. Tente de novo.'; } }
  function geo(){ return new Promise(res=>{ if(!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy}),()=>res(null),{enableHighAccuracy:true,timeout:8000,maximumAge:0}); }); }
  async function carimbar(file){
    const g=await geo();
    const img=await createImageBitmap(file); const max=1200; const sc=Math.min(1,max/Math.max(img.width,img.height));
    const w=Math.round(img.width*sc), h=Math.round(img.height*sc);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const ctx=cv.getContext('2d'); ctx.drawImage(img,0,0,w,h);
    const dt=new Date(); const linhas=['ECOBRAZ · OS '+NUM, dt.toLocaleString('pt-BR'), g?('GPS '+g.lat.toFixed(5)+', '+g.lon.toFixed(5)+' (±'+Math.round(g.acc)+'m)'):'GPS indisponível'];
    const fz=Math.max(12,Math.round(w*0.028)), pad=Math.round(w*0.02), lh=fz+6, barH=linhas.length*lh+pad;
    ctx.fillStyle='rgba(0,51,59,0.66)'; ctx.fillRect(0,h-barH,w,barH);
    ctx.fillStyle='#fff'; ctx.textBaseline='top'; ctx.font='700 '+fz+'px Arial';
    linhas.forEach((t,i)=>{ if(i===1) ctx.font='400 '+fz+'px Arial'; ctx.fillText(t,pad,h-barH+pad/2+i*lh); });
    return { dataUrl: cv.toDataURL('image/jpeg',0.65), geo: g };
  }
  document.querySelectorAll('.fp').forEach(inp=>{
    inp.onchange=async()=>{ const f=inp.files&&inp.files[0]; if(!f) return; const cat=inp.getAttribute('data-cat'); msg.textContent='Preparando a foto…';
      try{ const r=await carimbar(f); msg.textContent='Enviando…';
        await post('/api/operacao/foto',{osId:OS,fase:'fim',cat:cat,foto:r.dataUrl.split(',')[1],geo:r.geo}); location.reload();
      }catch{ msg.textContent='Não consegui processar a foto. Tente de novo.'; } };
  });
</script></body></html>`;
}
