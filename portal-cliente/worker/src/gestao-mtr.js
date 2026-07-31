// Módulo GESTÃO de MTR + DMR (pedido do Marcelo — prestação de contas aos órgãos).
//
// Diferença para o mtr.js: aquele é a INTEGRAÇÃO AO VIVO (SIGOR/SINIR — consulta por
// número, baixa PDF). ESTE é o REGISTRO GERENCIAL, a base de dados própria da Ecobraz:
//  - MTR de ENTRADA: resíduo que CHEGA (do gerador/cliente). Cadastro manual, upload do
//    PDF, status Pendente → Processado → Finalizado, vínculo opcional à OS.
//  - MTR de SAÍDA: resíduo que SAI para o destinador/reciclador final. Guarda destinador
//    (do cadastro da Engenharia), transportador, resíduo, quantidade, data e o VÍNCULO à
//    MTR de entrada que originou aquela saída — a rastreabilidade entrada→saída.
//  - DMR: relatório que CRUZA entrada × saída por período (mês/trimestre/semestre/ano),
//    com filtros por gerador e destinador. É a Declaração de Movimentação de Resíduos que
//    fecha o balanço para os órgãos ambientais.
//
// Segurança/robustez: tudo no KV (mtrg:index + mtrg:{id}); PDF no R2. Nada trava a
// operação — é registro/evidência. Sem segredos aqui.

import { listarDestinos } from './engenharia.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const hojeISO = () => { try { return new Date().toISOString().slice(0, 10); } catch { return ''; } };
// data (YYYY-MM-DD ou ISO) → dd/mm/aaaa
const dataBR = (v) => { const s = String(v || ''); if (!s) return ''; const d = new Date(s.includes('T') ? s : s + 'T00:00:00'); if (isNaN(d.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
// Lê número no padrão BR (1.500 = 1500; 1.234,56 = 1234.56). Mesmo tratamento do operacional.
function numBR(v) {
  let s = String(v == null ? '' : v).trim().replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  else if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
const kg = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
const soNum = (s) => String(s || '').replace(/\D/g, '');
const limpaId = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

export const STATUS_MTR = {
  pendente: { rotulo: 'Pendente', cor: '#8A6A16', bg: '#FFF4DE' },
  processado: { rotulo: 'Processado', cor: '#0B5B66', bg: '#E3F0F3' },
  finalizado: { rotulo: 'Finalizado', cor: '#1E5B31', bg: '#E4F3E6' },
};
const normalizarStatus = (v) => (STATUS_MTR[v] ? v : 'pendente');
const TIPOS_MTR = { entrada: 'Entrada', saida: 'Saída' };
const normalizarTipo = (v) => (v === 'saida' ? 'saida' : 'entrada');

// --- Persistência (KV) ---
async function lerIndice(env) { if (!env.PORTAL_KV) return []; const raw = await env.PORTAL_KV.get('mtrg:index'); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
async function salvarIndice(env, lista) { if (env.PORTAL_KV) await env.PORTAL_KV.put('mtrg:index', JSON.stringify(lista.slice(0, 2000))); }
export async function listarMtrs(env) { return await lerIndice(env); }
export async function lerMtr(env, id) { if (!env.PORTAL_KV) return null; const raw = await env.PORTAL_KV.get(`mtrg:${limpaId(id)}`); return raw ? JSON.parse(raw) : null; }

function resumoDe(m) {
  return {
    id: m.id, tipo: m.tipo, numero: m.numero, data: m.data, status: m.status,
    contraparte: m.tipo === 'saida' ? (m.destinador || '') : (m.gerador || ''),
    residuo: m.residuo || '', quantidade: Number(m.quantidade) || 0, osId: m.osId || '', temPdf: !!m.pdfKey,
  };
}

export async function salvarMtr(env, user, d) {
  const tipo = normalizarTipo(d.tipo);
  const id = d.id ? limpaId(d.id) : 'mtrg_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14));
  const anterior = d.id ? await lerMtr(env, id) : null;
  const m = {
    id, tipo,
    numero: String(d.numero || '').replace(/[^0-9A-Za-z/.-]/g, '').slice(0, 40),
    data: String(d.data || '').slice(0, 10) || hojeISO(),
    residuo: String(d.residuo || '').slice(0, 160),
    classe: String(d.classe || '').slice(0, 12),
    quantidade: Math.max(0, numBR(d.quantidade)),
    unidade: 'kg',
    // Entrada = quem gera (cliente/gerador). Saída = para quem vai (destinador).
    gerador: String(d.gerador || '').slice(0, 140), geradorCnpj: soNum(d.geradorCnpj).slice(0, 14),
    destinadorId: soNum(d.destinadorId).slice(0, 14), destinador: String(d.destinador || '').slice(0, 140), destinadorCnpj: soNum(d.destinadorCnpj).slice(0, 14),
    transportador: String(d.transportador || '').slice(0, 140),
    // Saída → MTR de entrada que a originou (rastreabilidade entrada→saída).
    mtrEntradaId: tipo === 'saida' ? limpaId(d.mtrEntradaId) : '',
    osId: limpaId(d.osId),
    status: normalizarStatus(d.status),
    obs: String(d.obs || '').slice(0, 1000),
    pdfKey: anterior ? (anterior.pdfKey || '') : '', pdfNome: anterior ? (anterior.pdfNome || '') : '',
    criadoEm: anterior ? anterior.criadoEm : agora(), criadoPor: anterior ? anterior.criadoPor : (user && user.email || ''),
    atualizadoEm: agora(), atualizadoPor: (user && user.email || ''),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`mtrg:${id}`, JSON.stringify(m), { expirationTtl: 60 * 60 * 24 * 1825 });
    const idx = await lerIndice(env);
    const r = resumoDe(m);
    const i = idx.findIndex((x) => x.id === id);
    if (i >= 0) idx[i] = r; else idx.unshift(r);
    await salvarIndice(env, idx);
  }
  return m;
}

export async function mudarStatusMtr(env, id, status) {
  const m = await lerMtr(env, id); if (!m) return null;
  m.status = normalizarStatus(status); m.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`mtrg:${m.id}`, JSON.stringify(m));
    const idx = await lerIndice(env); const i = idx.findIndex((x) => x.id === m.id);
    if (i >= 0) { idx[i].status = m.status; await salvarIndice(env, idx); }
  }
  return m;
}

export async function definirPdfMtr(env, id, meta) {
  const m = await lerMtr(env, id); if (!m) return null;
  m.pdfKey = meta ? String(meta.key || '') : ''; m.pdfNome = meta ? String(meta.nome || 'MTR.pdf').slice(0, 140) : '';
  m.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`mtrg:${m.id}`, JSON.stringify(m));
    const idx = await lerIndice(env); const i = idx.findIndex((x) => x.id === m.id);
    if (i >= 0) { idx[i].temPdf = !!m.pdfKey; await salvarIndice(env, idx); }
  }
  return m;
}

export async function removerMtr(env, id) {
  const m = await lerMtr(env, id); if (!m) return null;
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.delete(`mtrg:${m.id}`);
    const idx = (await lerIndice(env)).filter((x) => x.id !== m.id);
    await salvarIndice(env, idx);
  }
  return m;
}

// --- DMR: cruzamento entrada × saída por período ---
// Presets de período resolvidos para [de, até] (YYYY-MM-DD). "custom" usa de/ate dados.
export function intervaloPeriodo(preset, de, ate) {
  let hoje; try { hoje = new Date(); } catch { hoje = new Date(0); }
  const y = hoje.getUTCFullYear(), mth = hoje.getUTCMonth();
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const ini = (yy, mm) => iso(new Date(Date.UTC(yy, mm, 1)));
  const fim = (yy, mm) => iso(new Date(Date.UTC(yy, mm + 1, 0)));
  switch (preset) {
    case 'mes': return { de: ini(y, mth), ate: fim(y, mth), rotulo: 'Mês atual' };
    case 'trimestre': { const q = Math.floor(mth / 3) * 3; return { de: ini(y, q), ate: fim(y, q + 2), rotulo: 'Trimestre atual' }; }
    case 'semestre': { const h = mth < 6 ? 0 : 6; return { de: ini(y, h), ate: fim(y, h + 5), rotulo: 'Semestre atual' }; }
    case 'ano': return { de: ini(y, 0), ate: fim(y, 11), rotulo: 'Ano atual' };
    case 'custom': return { de: String(de || '').slice(0, 10), ate: String(ate || '').slice(0, 10), rotulo: 'Período personalizado' };
    default: return { de: ini(y, mth), ate: fim(y, mth), rotulo: 'Mês atual' };
  }
}

// Monta os dados do DMR aplicando período + filtros (gerador/destinador por texto).
export async function dadosDMR(env, filtros) {
  const f = filtros || {};
  const per = intervaloPeriodo(f.periodo, f.de, f.ate);
  const idx = await lerIndice(env);
  const noPeriodo = (m) => (!per.de || m.data >= per.de) && (!per.ate || m.data <= per.ate);
  const casaTexto = (v, q) => !q || String(v || '').toLowerCase().includes(String(q).toLowerCase());
  const entradas = idx.filter((m) => m.tipo === 'entrada' && noPeriodo(m) && casaTexto(m.contraparte, f.gerador));
  const saidas = idx.filter((m) => m.tipo === 'saida' && noPeriodo(m) && casaTexto(m.contraparte, f.destinador));
  const soma = (arr) => Math.round(arr.reduce((s, m) => s + (Number(m.quantidade) || 0), 0) * 100) / 100;
  const totalEntrada = soma(entradas), totalSaida = soma(saidas);
  // Agrupa saída por destinador e entrada por gerador (para o resumo do relatório).
  const agrupa = (arr) => {
    const map = new Map();
    for (const m of arr) { const k = m.contraparte || '(não informado)'; const cur = map.get(k) || { nome: k, qtd: 0, n: 0 }; cur.qtd += Number(m.quantidade) || 0; cur.n += 1; map.set(k, cur); }
    return [...map.values()].map((x) => ({ ...x, qtd: Math.round(x.qtd * 100) / 100 })).sort((a, b) => b.qtd - a.qtd);
  };
  return {
    periodo: per,
    filtros: { gerador: f.gerador || '', destinador: f.destinador || '' },
    entradas: entradas.sort((a, b) => (a.data < b.data ? 1 : -1)),
    saidas: saidas.sort((a, b) => (a.data < b.data ? 1 : -1)),
    totalEntrada, totalSaida, saldo: Math.round((totalEntrada - totalSaida) * 100) / 100,
    porGerador: agrupa(entradas), porDestinador: agrupa(saidas),
  };
}

// --- Páginas (escritório) ---
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:920px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;margin-bottom:14px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
textarea{resize:vertical}.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px}
.btn{display:inline-block;border:none;border-radius:11px;padding:12px 17px;font-size:13.5px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:20px 0 8px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
.pill{font-size:10px;font-weight:800;padding:3px 10px;border-radius:20px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#5c6f6b;background:#F2F6F4}
td,th{padding:8px 10px;border:1px solid #E9EEEC}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
@media(max-width:640px){.g2,.g3{grid-template-columns:1fr}.wrap{padding:16px 12px 48px}}
@media print{.noprint{display:none!important}body{background:#fff}.wrap{max-width:100%}}`;

function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title><style>${CSS}</style></head><body>`;
}
function topo(sub) {
  return `<div class="noprint" style="background:#00333B;padding:15px 20px"><div style="max-width:920px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'MTR & DMR')}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}
const pillStatus = (st) => { const s = STATUS_MTR[st] || STATUS_MTR.pendente; return `<span class="pill" style="background:${s.bg};color:${s.cor}">${esc(s.rotulo)}</span>`; };

export function paginaMtrLista(user, mtrs, aba, q) {
  const abaAtiva = ['entrada', 'saida'].includes(aba) ? aba : 'entrada';
  q = String(q || '').trim();
  const casa = (m) => !q || [m.numero, m.contraparte, m.residuo].some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()));
  const nEnt = mtrs.filter((m) => m.tipo === 'entrada').length;
  const nSai = mtrs.filter((m) => m.tipo === 'saida').length;
  const lista = mtrs.filter((m) => m.tipo === abaAtiva && casa(m));
  const qs = q ? '&q=' + encodeURIComponent(q) : '';
  const tab = (id, rot, n) => `<a href="/mtr?aba=${id}${qs}" style="flex:1 1 auto;white-space:nowrap;text-align:center;text-decoration:none;font-size:13px;font-weight:800;padding:10px 12px;border-radius:10px;border:1px solid ${id === abaAtiva ? '#0B5B66' : '#E4EBE9'};background:${id === abaAtiva ? '#0B5B66' : '#fff'};color:${id === abaAtiva ? '#fff' : '#4F6469'}">${rot}<span style="display:inline-block;margin-left:6px;font-size:11px;padding:1px 8px;border-radius:20px;background:${id === abaAtiva ? 'rgba(255,255,255,.22)' : '#EEF1F0'};color:${id === abaAtiva ? '#fff' : '#7c8a87'}">${n}</span></a>`;
  const rotContraparte = abaAtiva === 'saida' ? 'Destinador' : 'Gerador';
  const linhas = lista.length ? lista.map((m) => `<a href="/mtr/item?id=${esc(m.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#10262B">MTR ${esc(m.numero || '—')} <span style="font-weight:600;color:#7c8a87">· ${esc(m.contraparte || '(sem ' + rotContraparte.toLowerCase() + ')')}</span></div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${m.data ? '📅 ' + esc(dataBR(m.data)) : 'sem data'}${m.residuo ? ' · ' + esc(m.residuo) : ''} · <b>${esc(kg(m.quantidade))}</b>${m.temPdf ? ' · 📎 PDF' : ''}</div></div>
      <div style="flex:none">${pillStatus(m.status)}</div>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhuma MTR de ${abaAtiva === 'saida' ? 'saída' : 'entrada'}${q ? ' para “' + esc(q) + '”' : ''} ainda.</div>`;
  return `${head('MTR & DMR')}${topo('MTR & DMR')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px">
    <div><h1 style="font-size:22px;margin:0">MTR — Manifestos de Resíduos</h1>
    <p style="font-size:13px;color:#7c8a87;margin:4px 0 0">Entrada (o que chega) e saída (o que vai ao destinador). O DMR cruza os dois por período.</p></div>
    <a href="/mtr/dmr" class="btn btn-d">📊 Gerar DMR</a>
  </div>
  <div class="tabs" style="margin-top:14px">${tab('entrada', 'Entrada', nEnt)}${tab('saida', 'Saída', nSai)}</div>
  <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
    <form method="get" action="/mtr" style="display:flex;gap:8px;flex:1;min-width:220px;margin:0"><input type="hidden" name="aba" value="${abaAtiva}"><input name="q" value="${esc(q)}" placeholder="buscar por número, ${rotContraparte.toLowerCase()} ou resíduo" style="flex:1"><button class="btn btn-g">Buscar</button></form>
    <a href="/mtr/novo?tipo=${abaAtiva}" class="btn btn-p">➕ Nova MTR de ${abaAtiva === 'saida' ? 'saída' : 'entrada'}</a>
  </div>
  ${linhas}
</div></body></html>`;
}

export function paginaMtrForm(user, mtr, destinos, entradas) {
  const m = mtr || {};
  const tipo = normalizarTipo(m.tipo);
  const novo = !m.id;
  const optDest = ['<option value="">— escolher destinador cadastrado —</option>'].concat((destinos || []).map((d) => `<option value="${esc(d.id)}|${esc(d.razaoSocial || d.cnpj)}|${esc(d.cnpj)}"${m.destinadorId && soNum(m.destinadorId) === soNum(d.id) ? ' selected' : ''}>${esc(d.razaoSocial || d.cnpj)}</option>`)).join('');
  const optEnt = ['<option value="">— vincular à MTR de entrada (opcional) —</option>'].concat((entradas || []).map((e) => `<option value="${esc(e.id)}"${m.mtrEntradaId === e.id ? ' selected' : ''}>MTR ${esc(e.numero || e.id)} · ${esc(e.contraparte || '')} · ${esc(kg(e.quantidade))}</option>`)).join('');
  const optStatus = Object.entries(STATUS_MTR).map(([k, v]) => `<option value="${k}"${(m.status || 'pendente') === k ? ' selected' : ''}>${esc(v.rotulo)}</option>`).join('');
  return `${head(novo ? 'Nova MTR' : 'Editar MTR')}${topo('MTR & DMR')}
<div class="wrap">
  <a href="/mtr?aba=${tipo}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Voltar</a>
  <h1 style="font-size:21px;margin:12px 0 2px">${novo ? 'Nova' : 'Editar'} MTR de ${tipo === 'saida' ? 'saída' : 'entrada'}</h1>
  <p style="font-size:13px;color:#7c8a87;margin:0 0 14px">${tipo === 'saida' ? 'Resíduo que SAI da Ecobraz para o destinador/reciclador final.' : 'Resíduo que CHEGA à Ecobraz, vindo do gerador (cliente).'}</p>
  <form id="frm" class="card" onsubmit="return false">
    <input type="hidden" name="id" value="${esc(m.id || '')}">
    <input type="hidden" name="tipo" value="${tipo}">
    <div class="g2">
      <div><label>Número da MTR</label><input name="numero" value="${esc(m.numero || '')}" placeholder="nº do manifesto" maxlength="40"></div>
      <div><label>Data</label><input type="date" name="data" value="${esc(m.data || hojeISO())}"></div>
    </div>
    <div class="noprint" style="margin-top:8px"><button type="button" class="btn btn-g" style="padding:9px 13px;font-size:12.5px" onclick="puxar()">🏛️ Puxar dados do órgão pelo número</button> <span id="puxMsg" style="font-size:12px;color:#4F6469"></span></div>
    ${tipo === 'entrada' ? `
    <div class="g2">
      <div><label>Gerador (cliente)</label><input name="gerador" value="${esc(m.gerador || '')}" placeholder="razão social do gerador"></div>
      <div><label>CNPJ do gerador</label><input name="geradorCnpj" value="${esc(m.geradorCnpj || '')}" placeholder="só números"></div>
    </div>` : `
    <label>Destinador / reciclador final</label>
    <select name="destinadorSel" onchange="preencheDest(this)">${optDest}</select>
    <div class="g2" style="margin-top:8px">
      <div><label>Nome do destinador</label><input name="destinador" value="${esc(m.destinador || '')}" placeholder="razão social do destino"></div>
      <div><label>CNPJ do destinador</label><input name="destinadorCnpj" value="${esc(m.destinadorCnpj || '')}" placeholder="só números"></div>
    </div>
    <input type="hidden" name="destinadorId" value="${esc(m.destinadorId || '')}">
    <label>Transportador</label><input name="transportador" value="${esc(m.transportador || '')}" placeholder="quem transportou">
    <label>Vincular à MTR de entrada (rastreabilidade)</label><select name="mtrEntradaId">${optEnt}</select>`}
    <div class="g3">
      <div><label>Resíduo</label><input name="residuo" value="${esc(m.residuo || '')}" placeholder="ex.: REEE / sucata eletrônica"></div>
      <div><label>Classe</label><input name="classe" value="${esc(m.classe || '')}" placeholder="ex.: II-A"></div>
      <div><label>Quantidade (kg)</label><input name="quantidade" inputmode="decimal" value="${m.quantidade ? esc(String(m.quantidade).replace('.', ',')) : ''}" placeholder="ex.: 1.200"></div>
    </div>
    <div class="g2">
      <div><label>Status</label><select name="status">${optStatus}</select></div>
      <div><label>OS vinculada (opcional)</label><input name="osId" value="${esc(m.osId || '')}" placeholder="id/nº da OS"></div>
    </div>
    <label>Observações</label><textarea name="obs" rows="2" placeholder="anotações internas">${esc(m.obs || '')}</textarea>
    <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
      <button class="btn btn-d" onclick="salvar()">💾 Salvar MTR</button>
      <a href="/mtr?aba=${tipo}" class="btn btn-g">Cancelar</a>
    </div>
    <div id="msg" style="font-size:13px;color:#4F6469;margin-top:10px;min-height:16px"></div>
  </form>
  <div style="font-size:11px;color:#9aa7a4;text-align:center">Depois de salvar, você pode anexar o PDF da MTR na ficha dela.</div>
</div>
<script>
  var TIPO=${JSON.stringify(tipo)};
  function val(n){var e=document.querySelector('[name="'+n+'"]');return e?e.value:'';}
  function preencheDest(sel){var v=(sel.value||'').split('|');document.querySelector('[name=destinadorId]').value=v[0]||'';if(v[1])document.querySelector('[name=destinador]').value=v[1];if(v[2])document.querySelector('[name=destinadorCnpj]').value=v[2];}
  function coleta(){var o={};['id','tipo','numero','data','gerador','geradorCnpj','destinador','destinadorCnpj','destinadorId','transportador','mtrEntradaId','residuo','classe','quantidade','status','osId','obs'].forEach(function(n){o[n]=val(n);});return o;}
  function salvar(){var msg=document.getElementById('msg');var o=coleta();if(!o.numero&&!o.quantidade){msg.textContent='Informe ao menos o número ou a quantidade.';return;}msg.textContent='Salvando…';
    fetch('/api/mtr-gestao/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json();}).then(function(j){if(j.ok){location.href='/mtr/item?id='+encodeURIComponent(j.id);}else{msg.textContent=j.error||'Falha ao salvar.';}}).catch(function(){msg.textContent='Sem conexão.';});}
  function puxar(){var num=val('numero');var pm=document.getElementById('puxMsg');if(!num){pm.textContent='Digite o número da MTR primeiro.';return;}pm.textContent='Consultando o órgão…';
    fetch('/api/mtr/consultar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({numero:num})}).then(function(r){return r.json();}).then(function(j){
      if(!j.ok||!j.resumo){pm.textContent=(j.message||'Não consegui ler essa MTR no órgão.');return;}
      var r=j.resumo;
      if(TIPO==='entrada'){if(r.gerador)document.querySelector('[name=gerador]').value=r.gerador;if(r.geradorCnpj)document.querySelector('[name=geradorCnpj]').value=r.geradorCnpj;}
      else{if(r.destinador)document.querySelector('[name=destinador]').value=r.destinador;if(r.destinadorCnpj)document.querySelector('[name=destinadorCnpj]').value=r.destinadorCnpj;if(r.transportador)document.querySelector('[name=transportador]').value=r.transportador;}
      pm.textContent='✓ Dados preenchidos do órgão — confira e salve.';
    }).catch(function(){pm.textContent='Sem conexão com o órgão.';});}
</script>
</body></html>`;
}

export function paginaMtrDetalhe(user, m, entradaVinc) {
  const tipo = normalizarTipo(m.tipo);
  const linha = (r, v) => v ? `<tr><td style="width:38%;color:#5c6f6b;font-weight:700">${esc(r)}</td><td style="font-weight:600">${esc(v)}</td></tr>` : '';
  const btnStatus = (k) => { const s = STATUS_MTR[k]; const ativo = m.status === k; return `<button class="btn" style="flex:1;min-width:120px;background:${ativo ? s.cor : '#fff'};color:${ativo ? '#fff' : s.cor};border:1.5px solid ${s.cor}" onclick="setStatus('${k}')">${ativo ? '✓ ' : ''}${esc(s.rotulo)}</button>`; };
  return `${head('MTR ' + (m.numero || ''))}${topo('MTR & DMR')}
<div class="wrap">
  <a href="/mtr?aba=${tipo}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Todas as MTRs</a>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 16px">
    <div>${pillStatus(m.status)}<h1 style="font-size:22px;margin:8px 0 0">MTR ${esc(m.numero || '—')}</h1>
    <div style="font-size:13px;color:#7c8a87;margin-top:2px">${esc(TIPOS_MTR[tipo])} · ${esc(m.contraparte || (tipo === 'saida' ? m.destinador : m.gerador) || '')}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;flex:none;justify-content:flex-end">
      <a href="/mtr/novo?id=${esc(m.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">✏️ Editar</a>
    </div>
  </div>
  <div class="card">
    <table role="presentation">
      ${linha('Tipo', TIPOS_MTR[tipo])}
      ${linha('Número', m.numero)}
      ${linha('Data', dataBR(m.data))}
      ${tipo === 'entrada' ? linha('Gerador', m.gerador + (m.geradorCnpj ? ' (' + m.geradorCnpj + ')' : '')) : linha('Destinador', (m.destinador || '') + (m.destinadorCnpj ? ' (' + m.destinadorCnpj + ')' : ''))}
      ${tipo === 'saida' ? linha('Transportador', m.transportador) : ''}
      ${linha('Resíduo', (m.residuo || '') + (m.classe ? ' · Classe ' + m.classe : ''))}
      ${linha('Quantidade', kg(m.quantidade))}
      ${linha('OS vinculada', m.osId)}
      ${tipo === 'saida' && entradaVinc ? linha('MTR de entrada de origem', 'MTR ' + (entradaVinc.numero || entradaVinc.id) + ' · ' + (entradaVinc.contraparte || '') + ' · ' + kg(entradaVinc.quantidade)) : ''}
      ${linha('Observações', m.obs)}
    </table>
    ${tipo === 'saida' && m.mtrEntradaId && entradaVinc ? `<div style="margin-top:12px"><a href="/mtr/item?id=${esc(entradaVinc.id)}" class="btn btn-g" style="padding:8px 12px;font-size:12.5px">↩︎ Abrir MTR de entrada de origem</a></div>` : ''}
  </div>

  <div class="card">
    <div class="sec" style="margin-top:0">Status do ciclo</div>
    <div style="display:flex;gap:9px;flex-wrap:wrap">${btnStatus('pendente')}${btnStatus('processado')}${btnStatus('finalizado')}</div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:8px">Pendente = registrada · Processado = resíduo movimentado/tratado · Finalizado = ciclo encerrado (destinação comprovada).</div>
  </div>

  <div class="card">
    <div class="sec" style="margin-top:0">📎 PDF da MTR</div>
    ${m.pdfKey ? `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #EEF1F0;border-radius:10px;padding:10px 13px;background:#FBFDFC">
      <a href="/mtr-gestao/pdf?key=${encodeURIComponent(m.pdfKey)}" target="_blank" rel="noopener" style="text-decoration:none;color:#10262B;font-weight:600;font-size:13px">📄 ${esc(m.pdfNome || 'MTR.pdf')} ↗</a>
      <button onclick="remPdf()" style="flex:none;background:none;border:none;color:#B23A2E;font-size:11.5px;font-weight:700;cursor:pointer">remover</button>
    </div>` : '<div style="font-size:12.5px;color:#8fa39f">Nenhum PDF anexado.</div>'}
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
      <input type="file" id="pdfFile" accept="application/pdf,.pdf,image/*" style="font-size:12.5px;max-width:240px">
      <button class="btn btn-g" style="padding:8px 12px;font-size:12.5px" onclick="enviarPdf()">⬆ Anexar PDF</button>
      <span id="pdfMsg" style="font-size:12px;color:#4F6469"></span>
    </div>
  </div>

  <div style="text-align:center;margin-top:8px"><button class="btn btn-g" style="color:#B23A2E;border-color:#f0c9c3" onclick="remover()">🗑️ Excluir MTR</button></div>
  <div id="msg" style="text-align:center;font-size:12px;color:#4F6469;min-height:16px;margin-top:8px"></div>
</div>
<script>
  var ID=${JSON.stringify(String(m.id))};
  function setStatus(s){var msg=document.getElementById('msg');msg.textContent='Salvando…';fetch('/api/mtr-gestao/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID,status:s})}).then(function(r){return r.json();}).then(function(j){if(j.ok)location.reload();else msg.textContent='Falha.';}).catch(function(){msg.textContent='Sem conexão.';});}
  function enviarPdf(){var f=document.getElementById('pdfFile'),msg=document.getElementById('pdfMsg');if(!f.files||!f.files[0]){msg.textContent='Escolha um arquivo.';return;}if(f.files[0].size>15728640){msg.textContent='Arquivo muito grande (máx. 15 MB).';return;}var fd=new FormData();fd.append('arquivo',f.files[0]);msg.textContent='Enviando…';fetch('/api/mtr-gestao/pdf?id='+encodeURIComponent(ID),{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){if(j.ok)location.reload();else msg.textContent=j.error||'Falha.';}).catch(function(){msg.textContent='Sem conexão.';});}
  function remPdf(){if(!confirm('Remover o PDF desta MTR?'))return;fetch('/api/mtr-gestao/pdf-remover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID})}).then(function(r){return r.json();}).then(function(j){if(j.ok)location.reload();}).catch(function(){});}
  function remover(){if(!confirm('Excluir esta MTR do sistema? Esta ação não pode ser desfeita.'))return;fetch('/api/mtr-gestao/remover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:ID})}).then(function(r){return r.json();}).then(function(j){if(j.ok)location.href='/mtr?aba=${tipo}';}).catch(function(){});}
</script>
</body></html>`;
}

// DMR — documento imprimível que cruza entrada × saída no período.
export function paginaDMR(user, dmr) {
  const per = dmr.periodo;
  const optPer = [['mes', 'Mês atual'], ['trimestre', 'Trimestre'], ['semestre', 'Semestre'], ['ano', 'Ano'], ['custom', 'Personalizado']].map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  const linhasEnt = dmr.entradas.length ? dmr.entradas.map((m) => `<tr><td>${esc(dataBR(m.data))}</td><td>${esc(m.numero || '—')}</td><td>${esc(m.contraparte || '—')}</td><td>${esc(m.residuo || '—')}</td><td style="text-align:right">${esc(kg(m.quantidade))}</td><td>${esc((STATUS_MTR[m.status] || {}).rotulo || '')}</td></tr>`).join('') : `<tr><td colspan="6" style="color:#8fa39f;text-align:center">Nenhuma entrada no período.</td></tr>`;
  const linhasSai = dmr.saidas.length ? dmr.saidas.map((m) => `<tr><td>${esc(dataBR(m.data))}</td><td>${esc(m.numero || '—')}</td><td>${esc(m.contraparte || '—')}</td><td>${esc(m.residuo || '—')}</td><td style="text-align:right">${esc(kg(m.quantidade))}</td><td>${esc((STATUS_MTR[m.status] || {}).rotulo || '')}</td></tr>`).join('') : `<tr><td colspan="6" style="color:#8fa39f;text-align:center">Nenhuma saída no período.</td></tr>`;
  const resumoGer = dmr.porGerador.length ? dmr.porGerador.map((g) => `<tr><td>${esc(g.nome)}</td><td style="text-align:center">${g.n}</td><td style="text-align:right">${esc(kg(g.qtd))}</td></tr>`).join('') : `<tr><td colspan="3" style="color:#8fa39f;text-align:center">—</td></tr>`;
  const resumoDest = dmr.porDestinador.length ? dmr.porDestinador.map((g) => `<tr><td>${esc(g.nome)}</td><td style="text-align:center">${g.n}</td><td style="text-align:right">${esc(kg(g.qtd))}</td></tr>`).join('') : `<tr><td colspan="3" style="color:#8fa39f;text-align:center">—</td></tr>`;
  const saldoCor = dmr.saldo > 0 ? '#8A6A16' : (dmr.saldo < 0 ? '#B23A2E' : '#1E5B31');
  return `${head('DMR')}${topo('MTR & DMR')}
<div class="wrap">
  <a href="/mtr" class="noprint" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← MTRs</a>
  <div class="card noprint" style="margin-top:12px">
    <div class="sec" style="margin-top:0">Filtros do relatório</div>
    <form method="get" action="/mtr/dmr" class="g3">
      <div><label>Período</label><select name="periodo" id="periodo" onchange="toggleCustom()">${optPer}</select></div>
      <div id="deWrap" style="display:none"><label>De</label><input type="date" name="de" value="${esc(per.de || '')}"></div>
      <div id="ateWrap" style="display:none"><label>Até</label><input type="date" name="ate" value="${esc(per.ate || '')}"></div>
      <div><label>Gerador (contém)</label><input name="gerador" value="${esc(dmr.filtros.gerador)}" placeholder="filtrar entrada"></div>
      <div><label>Destinador (contém)</label><input name="destinador" value="${esc(dmr.filtros.destinador)}" placeholder="filtrar saída"></div>
      <div style="display:flex;align-items:flex-end;gap:8px"><button class="btn btn-d" style="flex:1">Aplicar</button><button type="button" class="btn btn-g" onclick="window.print()">🖨️ Imprimir</button></div>
    </form>
  </div>

  <div class="card">
    <div style="text-align:center;border-bottom:2px solid #00333B;padding-bottom:12px;margin-bottom:14px">
      <div style="font-size:19px;font-weight:800;color:#00333B">Declaração de Movimentação de Resíduos (DMR)</div>
      <div style="font-size:12.5px;color:#4F6469;margin-top:4px">Período: <b>${esc(per.rotulo)}</b>${per.de || per.ate ? ` · ${esc(dataBR(per.de))} a ${esc(dataBR(per.ate))}` : ''}</div>
      <div style="font-size:11px;color:#9aa7a4;margin-top:2px">ASSOCIAÇÃO AUXÍLIO À RECICLAGEM DE ELETRÔNICOS E INCLUSÃO DIGITAL — ECOBRAZ · CNPJ 14.197.457/0001-42</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center">
      <div style="background:#E3F0F3;border-radius:12px;padding:14px"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#0B5B66">Entrada</div><div style="font-size:20px;font-weight:800;color:#00333B;margin-top:4px">${esc(kg(dmr.totalEntrada))}</div><div style="font-size:11px;color:#4F6469">${dmr.entradas.length} manifesto(s)</div></div>
      <div style="background:#E4F3E6;border-radius:12px;padding:14px"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#1E5B31">Saída</div><div style="font-size:20px;font-weight:800;color:#00333B;margin-top:4px">${esc(kg(dmr.totalSaida))}</div><div style="font-size:11px;color:#4F6469">${dmr.saidas.length} manifesto(s)</div></div>
      <div style="background:#FBFCFB;border:1px solid #E4EBE9;border-radius:12px;padding:14px"><div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${saldoCor}">Saldo (entrada − saída)</div><div style="font-size:20px;font-weight:800;color:${saldoCor};margin-top:4px">${esc(kg(dmr.saldo))}</div><div style="font-size:11px;color:#4F6469">em estoque / a destinar</div></div>
    </div>
  </div>

  <div class="card">
    <div class="sec" style="margin-top:0">Entradas no período</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>MTR</th><th>Gerador</th><th>Resíduo</th><th style="text-align:right">Qtd</th><th>Status</th></tr></thead><tbody>${linhasEnt}</tbody></table></div>
  </div>
  <div class="card">
    <div class="sec" style="margin-top:0">Saídas no período</div>
    <div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>MTR</th><th>Destinador</th><th>Resíduo</th><th style="text-align:right">Qtd</th><th>Status</th></tr></thead><tbody>${linhasSai}</tbody></table></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px" class="g2">
    <div class="card" style="margin:0"><div class="sec" style="margin-top:0">Entrada por gerador</div><div style="overflow-x:auto"><table><thead><tr><th>Gerador</th><th style="text-align:center">MTRs</th><th style="text-align:right">Total</th></tr></thead><tbody>${resumoGer}</tbody></table></div></div>
    <div class="card" style="margin:0"><div class="sec" style="margin-top:0">Saída por destinador</div><div style="overflow-x:auto"><table><thead><tr><th>Destinador</th><th style="text-align:center">MTRs</th><th style="text-align:right">Total</th></tr></thead><tbody>${resumoDest}</tbody></table></div></div>
  </div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:16px;line-height:1.6">Documento gerado eletronicamente pelo sistema Ecobraz em ${esc(dataBR(hojeISO()))}. Base legal: Lei nº 12.305/2010 (PNRS) · transporte manifestado (SINIR / SIGOR-CETESB). Confira sempre com os manifestos oficiais dos órgãos.</div>
</div>
<script>
  var P=${JSON.stringify(String((dmr.filtros && dmr.periodoPreset) || ''))};
  var sel=document.getElementById('periodo');
  // Reconstitui a seleção do período a partir do rótulo atual.
  (function(){var rot=${JSON.stringify(per.rotulo)};var map={'Mês atual':'mes','Trimestre atual':'trimestre','Semestre atual':'semestre','Ano atual':'ano','Período personalizado':'custom'};if(map[rot])sel.value=map[rot];toggleCustom();})();
  function toggleCustom(){var c=sel.value==='custom';document.getElementById('deWrap').style.display=c?'block':'none';document.getElementById('ateWrap').style.display=c?'block':'none';}
</script>
</body></html>`;
}
