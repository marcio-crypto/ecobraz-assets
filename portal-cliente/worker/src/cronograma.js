// Módulo CRONOGRAMA / KANBAN (pedido do Marcelo) — visão de acompanhamento do fluxo
// operacional em um só lugar: cada lote (operação da doca) aparece numa coluna do
// Kanban conforme a etapa, e a linha do tempo destaca por prazo (🟢 no prazo,
// 🟡 atenção, 🔴 atrasado). Lê a base própria (operações da doca + coletas), não o
// Ploomes. NÃO altera nada — é só leitura/visão.
//
// Prazos (SLA): padrão 7 dias para "atenção" e 15 para "atrasado", contados desde a
// recepção na doca. Ajustáveis pelo cofre (env SLA_DIAS_ATENCAO / SLA_DIAS_ATRASO) —
// e a tela deixa claro que é um prazo padrão, para não passar falsa precisão.

import { listarOperacoes } from './operacional.js';
import { listarColetasOS } from './coletas.js';
import { listarLotesComCarga, DESTINOS } from './cargas.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kg = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg`;
const dataBR = (iso) => { const d = new Date(iso); if (!iso || isNaN(d.getTime())) return ''; if (String(iso).includes('T')) d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`; };
function diasDesde(iso) { const d = new Date(iso); if (!iso || isNaN(d.getTime())) return null; let now; try { now = Date.now(); } catch { return null; } return Math.max(0, Math.floor((now - d.getTime()) / 86400000)); }

// Colunas do Kanban ← etapas da operação (operacional.js).
export const COLUNAS = [
  { id: 'recebido', rotulo: 'Recebido', etapas: ['recepcao', 'triagem'], cor: '#0B5B66', bg: '#E3F0F3' },
  { id: 'tratamento', rotulo: 'Tratamento', etapas: ['processamento', 'saida'], cor: '#8A6A16', bg: '#FFF4DE' },
  { id: 'laudo', rotulo: 'Laudo / Validação', etapas: ['validacao'], cor: '#6B3FA0', bg: '#EFE7FA' },
  { id: 'concluido', rotulo: 'Concluído', etapas: ['concluida'], cor: '#1E5B31', bg: '#E4F3E6' },
];
const COLUNA_DE = {};
for (const c of COLUNAS) for (const e of c.etapas) COLUNA_DE[e] = c.id;

// Prazos (SLA) ajustáveis pela própria tela → KV (cfg:sla). Fallback: env, depois 7/15.
export async function lerSla(env) {
  let cfg = null;
  try { if (env.PORTAL_KV) { const raw = await env.PORTAL_KV.get('cfg:sla'); cfg = raw ? JSON.parse(raw) : null; } } catch { cfg = null; }
  const at = Math.max(1, Math.floor(Number(cfg && cfg.atencao) || Number(env && env.SLA_DIAS_ATENCAO) || 7));
  const atr = Math.max(at + 1, Math.floor(Number(cfg && cfg.atraso) || Number(env && env.SLA_DIAS_ATRASO) || 15));
  return { atencao: at, atraso: atr };
}
export async function salvarSla(env, atencao, atraso) {
  const at = Math.max(1, Math.floor(Number(atencao) || 7));
  const atr = Math.max(at + 1, Math.floor(Number(atraso) || 15));
  if (env.PORTAL_KV) await env.PORTAL_KV.put('cfg:sla', JSON.stringify({ atencao: at, atraso: atr }));
  return { atencao: at, atraso: atr };
}
export function alertaPrazo(dias, sla) {
  if (dias == null) return { dot: '⚪', cor: '#9aa7a4', rotulo: 'sem data', nivel: 0 };
  if (dias > sla.atraso) return { dot: '🔴', cor: '#B23A2E', rotulo: 'atrasado', nivel: 3 };
  if (dias > sla.atencao) return { dot: '🟡', cor: '#8A6A16', rotulo: 'atenção', nivel: 2 };
  return { dot: '🟢', cor: '#1E5B31', rotulo: 'no prazo', nivel: 1 };
}

// Monta os dados do cronograma: operações agrupadas por coluna + resumo de prazos.
export async function dadosCronograma(env) {
  const sla = await lerSla(env);
  const [ops, coletas] = await Promise.all([listarOperacoes(env), listarColetasOS(env)]);
  const cols = {}; for (const c of COLUNAS) cols[c.id] = [];
  const ativos = []; // tudo que não está concluído — para a linha do tempo por prazo
  for (const o of ops) {
    const colId = COLUNA_DE[o.etapa] || 'recebido';
    const dias = diasDesde(o.criadoEm);
    const parado = diasDesde(o.em);
    const alerta = colId === 'concluido' ? { dot: '✅', cor: '#1E5B31', rotulo: 'concluído', nivel: 0 } : alertaPrazo(dias, sla);
    const card = { osId: o.osId, numero: o.numero, cliente: o.cliente, etapa: o.etapa, tipo: o.tipo, dias, parado, alerta, entradaKg: o.entradaKg || 0, criadoEm: o.criadoEm, em: o.em };
    cols[colId].push(card);
    if (colId !== 'concluido') ativos.push(card);
  }
  // Ordena cada coluna: mais urgente (mais dias) primeiro; concluído por mais recente.
  for (const c of COLUNAS) {
    if (c.id === 'concluido') cols[c.id].sort((a, b) => (a.em < b.em ? 1 : -1));
    else cols[c.id].sort((a, b) => (b.dias || 0) - (a.dias || 0));
  }
  ativos.sort((a, b) => (b.alerta.nivel - a.alerta.nivel) || ((b.dias || 0) - (a.dias || 0)));
  // Contexto: coletas ainda a caminho (não chegaram na doca).
  const aCaminho = coletas.filter((c) => c.status === 'agendada' || c.status === 'em_transporte').length;
  const resumo = {
    emAndamento: ativos.length,
    noPrazo: ativos.filter((a) => a.alerta.nivel === 1).length,
    atencao: ativos.filter((a) => a.alerta.nivel === 2).length,
    atrasados: ativos.filter((a) => a.alerta.nivel === 3).length,
    concluidos: cols.concluido.length,
    aCaminho,
  };
  // Lotes da ENTRADA POR CARGAS (pedido do Marcelo 12/08): aparecem aqui para
  // acompanhamento e destino, com o mesmo alerta de prazo (desde a criação).
  let todosLotes = []; try { todosLotes = await listarLotesComCarga(env); } catch { todosLotes = []; }
  const lotes = { aguardando: [], processando: [], finalizado: [] };
  for (const l of todosLotes) {
    if (l.cargaStatus === 'cancelada') continue; // carga cancelada = lote fora do fluxo
    const dias = diasDesde(l.criadoEm);
    // "expedido" (saída registrada) mora na coluna Finalizado, com o selo da saída.
    const balde = l.status === 'expedido' ? 'finalizado' : l.status;
    const alerta = l.status === 'expedido'
      ? { dot: '🚚', cor: '#1E5B31', rotulo: 'expedido', nivel: 0 }
      : l.status === 'finalizado'
        ? { dot: '✅', cor: '#8A6A16', rotulo: 'aguarda saída', nivel: 0 }
        : alertaPrazo(dias, sla);
    (lotes[balde] || lotes.aguardando).push({ ...l, dias, alerta });
  }
  lotes.aguardando.sort((a, b) => (b.dias || 0) - (a.dias || 0));
  lotes.processando.sort((a, b) => (b.dias || 0) - (a.dias || 0));
  const resumoLotes = { aguardando: lotes.aguardando.length, processando: lotes.processando.length, finalizado: lotes.finalizado.length };
  return { cols, ativos, resumo, sla, lotes, resumoLotes };
}

// --- Página ---
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:1180px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px}
.kb{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
.col{background:#F7FAF9;border:1px solid #E4EBE9;border-radius:14px;padding:10px;min-height:120px}
.colh{display:flex;justify-content:space-between;align-items:center;padding:4px 6px 10px}
.lote{display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:11px;padding:11px 12px;margin-bottom:9px}
.pill{font-size:9.5px;font-weight:800;padding:2px 8px;border-radius:20px}
.tile{background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:14px;text-align:center}
.tile b{font-size:22px;font-weight:800;display:block}
@media(max-width:920px){.kb{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.kb{grid-template-columns:1fr}.wrap{padding:16px 12px 48px}}`;

function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title><style>${CSS}</style></head><body>`;
}
function topo(sub, user) {
  const eng = user && user.role === 'engenharia';
  const home = eng ? '/eng' : '/inicio';
  const sair = eng ? '/api/eng/sair' : '/api/cadastro/sair';
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:1180px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="${home}" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'cronograma')}</span></a>
    <form method="post" action="${sair}" style="margin:0"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700">Sair</button></form>
  </div></div>`;
}
const etapaRotulo = (e) => ({ recepcao: 'Recepção', triagem: 'Triagem', processamento: 'Processamento', saida: 'Saída', validacao: 'Validação (Eng.)', concluida: 'Concluída' }[e] || e);

function cardLote(c) {
  const badge = `<span class="pill" style="background:${c.alerta.cor}1A;color:${c.alerta.cor}">${c.alerta.dot} ${esc(c.alerta.rotulo)}</span>`;
  const diasTxt = c.dias != null ? `${c.dias}d na operação` : 'sem data';
  const paradoTxt = (c.parado != null && c.parado >= 2 && c.alerta.nivel !== 0) ? ` · ⏳ ${c.parado}d parado` : '';
  return `<a href="/coletas/os?id=${esc(c.osId)}" class="lote">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="font-size:13.5px;font-weight:800;color:#10262B">OS ${esc(c.numero)}</div>${badge}</div>
    <div style="font-size:12px;color:#4F6469;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.cliente || 'Cliente')}${c.tipo === 'pago' ? ' · <b style="color:#8A6A16">Pago</b>' : ''}</div>
    <div style="font-size:11px;color:#8fa39f;margin-top:6px">${esc(etapaRotulo(c.etapa))} · ${c.entradaKg ? esc(kg(c.entradaKg)) + ' · ' : ''}${esc(diasTxt)}${paradoTxt}</div>
  </a>`;
}

// Card de um lote da Entrada por Cargas, com ação de status direto no Kanban.
function cardLoteCarga(l) {
  const badge = `<span class="pill" style="background:${l.alerta.cor}1A;color:${l.alerta.cor}">${l.alerta.dot} ${esc(l.alerta.rotulo)}</span>`;
  const destinoRot = (DESTINOS[l.destino] || {}).rot || l.destino;
  const acao = l.status === 'aguardando'
    ? `<button onclick="mudarLoteSt('${esc(l.id)}','processando')" style="background:#92C430;color:#10262B;border:none;border-radius:8px;padding:6px 11px;font-size:11px;font-weight:800;cursor:pointer">▶ Iniciar</button>`
    : l.status === 'processando'
      ? `<button onclick="mudarLoteSt('${esc(l.id)}','finalizado')" style="background:#00333B;color:#fff;border:none;border-radius:8px;padding:6px 11px;font-size:11px;font-weight:800;cursor:pointer">✔ Finalizar</button>`
      : l.status === 'finalizado'
        ? `<a href="/cargas/expedir?id=${esc(l.id)}" style="background:#92C430;color:#10262B;border-radius:8px;padding:6px 11px;font-size:11px;font-weight:800;text-decoration:none;white-space:nowrap">🚚 Registrar saída</a>`
        : '';
  const saida = l.status === 'expedido' && l.expedicao
    ? `<div style="font-size:11px;color:#1E5B31;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🚚 ${esc(l.expedicao.fornecedor)}${l.expedicao.mtr ? ' · MTR ' + esc(l.expedicao.mtr) : ''}</div>`
    : '';
  return `<div class="lote">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><a href="/cargas/carga?id=${esc(l.cargaId)}" style="font-size:13.5px;font-weight:800;color:#10262B;text-decoration:none">${esc(l.id)}</a>${badge}</div>
    <div style="font-size:12px;color:#4F6469;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.categoria)} · ${esc(kg(l.peso))}${l.qtd ? ' · ' + esc(l.qtd) : ''}</div>
    <div style="font-size:11px;color:#8fa39f;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🎯 ${esc(destinoRot)} · ${esc(l.cargaCliente || l.cargaId)}</div>
    ${saida}
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px">
      <span style="font-size:11px;color:#8fa39f">${l.dias != null ? l.dias + 'd desde a criação' : ''}</span>${acao}
    </div>
  </div>`;
}

export function paginaCronograma(user, dados) {
  const { cols, ativos, resumo, sla } = dados;
  const lotes = dados.lotes || { aguardando: [], processando: [], finalizado: [] };
  const resumoLotes = dados.resumoLotes || { aguardando: 0, processando: 0, finalizado: 0 };
  const COLS_LOTE = [
    { id: 'aguardando', rotulo: 'Aguardando processamento', cor: '#8A6A16', bg: '#FFF4DE' },
    { id: 'processando', rotulo: 'Em processamento', cor: '#0B5B66', bg: '#E3F0F3' },
    { id: 'finalizado', rotulo: 'Finalizado', cor: '#1E5B31', bg: '#E4F3E6' },
  ];
  const totalLotes = resumoLotes.aguardando + resumoLotes.processando + resumoLotes.finalizado;
  const lotesHTML = COLS_LOTE.map((cCol) => {
    const itens = lotes[cCol.id] || [];
    const mostra = cCol.id === 'finalizado' ? itens.slice(0, 10) : itens;
    const corpo = mostra.length ? mostra.map(cardLoteCarga).join('') : '<div style="font-size:12px;color:#9aa7a4;text-align:center;padding:14px 6px">—</div>';
    const extra = (cCol.id === 'finalizado' && itens.length > 10) ? `<div style="font-size:11px;color:#9aa7a4;text-align:center;padding:4px">+ ${itens.length - 10} finalizados anteriores</div>` : '';
    return `<div class="col">
      <div class="colh"><span style="font-size:12.5px;font-weight:800;color:${cCol.cor}">${esc(cCol.rotulo)}</span><span class="pill" style="background:${cCol.bg};color:${cCol.cor}">${itens.length}</span></div>
      ${corpo}${extra}
    </div>`;
  }).join('');
  const colunasHTML = COLUNAS.map((c) => {
    const itens = cols[c.id] || [];
    const mostra = c.id === 'concluido' ? itens.slice(0, 12) : itens;
    const corpo = mostra.length ? mostra.map(cardLote).join('') : `<div style="font-size:12px;color:#9aa7a4;text-align:center;padding:14px 6px">—</div>`;
    const extra = (c.id === 'concluido' && itens.length > 12) ? `<div style="font-size:11px;color:#9aa7a4;text-align:center;padding:4px">+ ${itens.length - 12} concluídos anteriores</div>` : '';
    return `<div class="col">
      <div class="colh"><span style="font-size:12.5px;font-weight:800;color:${c.cor}">${esc(c.rotulo)}</span><span class="pill" style="background:${c.bg};color:${c.cor}">${itens.length}</span></div>
      ${corpo}${extra}
    </div>`;
  }).join('');
  const tl = ativos.length ? ativos.map((c) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border-top:1px solid #EEF1F0;padding:10px 2px">
      <div style="min-width:0"><a href="/coletas/os?id=${esc(c.osId)}" style="font-size:13px;font-weight:800;text-decoration:none;color:#10262B">OS ${esc(c.numero)}</a> <span style="font-size:12px;color:#7c8a87">· ${esc(c.cliente || '')}</span>
        <div style="font-size:11.5px;color:#8fa39f;margin-top:2px">${esc(etapaRotulo(c.etapa))} · recebido ${c.criadoEm ? 'em ' + esc(dataBR(c.criadoEm)) : '—'} · ${c.dias != null ? c.dias + ' dias' : 's/ data'}</div></div>
      <span class="pill" style="flex:none;background:${c.alerta.cor}1A;color:${c.alerta.cor}">${c.alerta.dot} ${esc(c.alerta.rotulo)}</span>
    </div>`).join('') : `<div style="font-size:13px;color:#9aa7a4;text-align:center;padding:16px">Nenhum lote em andamento no momento.</div>`;
  return `${head('Cronograma')}${topo('Cronograma', user)}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:16px">
    <div><h1 style="font-size:22px;margin:0">Cronograma & Kanban</h1>
    <p style="font-size:13px;color:#7c8a87;margin:4px 0 0">Acompanhe cada lote da doca até o destino. Prazo contado desde a recepção.</p></div>
    <div style="display:flex;gap:8px"><a href="/operacao" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#0B5B66;background:#fff;border:1.5px solid #cfe0dd;border-radius:11px;padding:10px 14px">🏭 Abrir Operação</a></div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:18px" class="tiles">
    <div class="tile"><b style="color:#00333B">${resumo.emAndamento}</b><span style="font-size:11px;color:#7c8a87">em andamento</span></div>
    <div class="tile"><b style="color:#1E5B31">🟢 ${resumo.noPrazo}</b><span style="font-size:11px;color:#7c8a87">no prazo</span></div>
    <div class="tile"><b style="color:#8A6A16">🟡 ${resumo.atencao}</b><span style="font-size:11px;color:#7c8a87">atenção</span></div>
    <div class="tile"><b style="color:#B23A2E">🔴 ${resumo.atrasados}</b><span style="font-size:11px;color:#7c8a87">atrasados</span></div>
    <div class="tile"><b style="color:#0B5B66">🚚 ${resumo.aCaminho}</b><span style="font-size:11px;color:#7c8a87">a caminho da doca</span></div>
  </div>

  <div class="kb">${colunasHTML}</div>

  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:22px 0 10px;flex-wrap:wrap">
    <div><div style="font-size:16px;font-weight:800;color:#00333B">📦 Lotes — Entrada por Cargas</div>
    <div style="font-size:12px;color:#7c8a87;margin-top:2px">Cada lote pesado e etiquetado na doca, do fracionamento ao destino. Prazo contado desde a criação do lote.</div></div>
    <div style="display:flex;gap:8px"><a href="/cargas" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#0B5B66;background:#fff;border:1.5px solid #cfe0dd;border-radius:11px;padding:9px 13px">🚛 Abrir Cargas</a><a href="/cargas/filas" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#0B5B66;background:#fff;border:1.5px solid #cfe0dd;border-radius:11px;padding:9px 13px">Filas por destino</a></div>
  </div>
  ${totalLotes ? `<div class="kb" style="grid-template-columns:repeat(3,1fr)">${lotesHTML}</div>` : '<div class="card" style="font-size:12.5px;color:#8fa39f">Nenhum lote criado na Entrada por Cargas ainda. Quando a doca pesar e fracionar uma carga, os lotes aparecem aqui.</div>'}

  <div class="card" style="margin-top:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">
      <div style="font-size:13px;font-weight:800;color:#00333B">⏱️ Linha do tempo por prazo (mais urgente primeiro)</div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:#7c8a87;flex-wrap:wrap">Alerta: 🟡 acima de <input id="slaAt" type="number" min="1" value="${sla.atencao}" style="width:52px;border:1px solid #DDE1E6;border-radius:8px;padding:4px 6px;font-size:12px"> 🔴 acima de <input id="slaAtr" type="number" min="2" value="${sla.atraso}" style="width:52px;border:1px solid #DDE1E6;border-radius:8px;padding:4px 6px;font-size:12px"> dias <button type="button" onclick="salvarSla()" style="background:#00333B;color:#fff;border:none;border-radius:8px;padding:5px 11px;font-size:11px;font-weight:800;cursor:pointer">salvar</button> <span id="slaMsg" style="color:#3f8f3a;font-weight:700"></span></div>
    </div>
    ${tl}
  </div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:14px;line-height:1.6">Os prazos são um <b>alerta operacional ajustável</b> (edite acima), contados da recepção na doca — servem de aviso, não de garantia contratual. “Parado” = dias sem nenhuma atualização no lote.</div>
</div>
<script>
  function salvarSla(){var at=document.getElementById('slaAt').value,atr=document.getElementById('slaAtr').value,m=document.getElementById('slaMsg');if(m)m.textContent='salvando…';
    fetch('/api/cronograma/sla',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({atencao:at,atraso:atr})}).then(function(r){return r.json();}).then(function(j){
      if(j.ok){if(m)m.textContent='✓ salvo';setTimeout(function(){location.reload();},700);}else if(m){m.textContent='falha';}
    }).catch(function(){if(m)m.textContent='sem conexão';});}
  function mudarLoteSt(id,novo){
    if(novo==='finalizado'&&!confirm('Finalizar o lote '+id+'?'))return;
    fetch('/api/cargas/lote-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,novo:novo})}).then(function(r){return r.json();}).then(function(j){
      if(j.ok){location.reload();}else{alert(j.message||'Não deu certo.');}
    }).catch(function(){alert('Sem conexão. Tente de novo.');});}
</script>
<style>@media(max-width:920px){.tiles{grid-template-columns:repeat(3,1fr)!important}}@media(max-width:560px){.tiles{grid-template-columns:1fr 1fr!important}}</style>
</body></html>`;
}
