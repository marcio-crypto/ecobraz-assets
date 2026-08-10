// Tarefas por cliente (pedido da Débora, 10/08): na ficha do cliente dá para
// criar tarefa com título + data; quando o dia chega (ou passa), a tarefa entra
// "em atenção" — destacada na ficha, no topo do Cadastro e na página de tarefas.
//
// Armazenamento em D1 (uma linha por tarefa): consistência forte — o KV tem
// leitura defasada (~60s) e já causou o bug do "some as alterações" nos
// documentos da empresa. Tabela criada sob demanda.

const DDL = `CREATE TABLE IF NOT EXISTS tarefas_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id TEXT NOT NULL,
  cliente_doc TEXT NOT NULL DEFAULT '',
  cliente_nome TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta',
  criado_por TEXT NOT NULL DEFAULT '',
  criado_email TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  concluido_por TEXT NOT NULL DEFAULT '',
  concluido_em TEXT NOT NULL DEFAULT ''
)`;

async function d1(env) {
  if (!env.DB_PLOOMES) throw new Error('sem_d1');
  await env.DB_PLOOMES.prepare(DDL).run();
  return env.DB_PLOOMES;
}

// Dia no fuso do Brasil (UTC−3, sem horário de verão) — mesmo critério do uso.js.
const hojeBrasil = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dataBR = (iso) => { const [a, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${a}` : '—'; };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function criarTarefa(env, { clienteId, clienteDoc, clienteNome, titulo, data, por, porEmail }) {
  const t = String(titulo || '').trim();
  if (t.length < 3) return { ok: false, error: 'Escreva o título da tarefa (mínimo 3 letras).' };
  if (t.length > 200) return { ok: false, error: 'Título muito longo (máximo 200 letras).' };
  const d = String(data || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) return { ok: false, error: 'Escolha a data em que a tarefa deve ser realizada.' };
  const db = await d1(env);
  await db.prepare('INSERT INTO tarefas_cliente (cliente_id, cliente_doc, cliente_nome, titulo, data, status, criado_por, criado_email, criado_em) VALUES (?1,?2,?3,?4,?5,\'aberta\',?6,?7,?8)')
    .bind(String(clienteId || ''), String(clienteDoc || '').replace(/\D/g, ''), String(clienteNome || '').slice(0, 200), t, d, String(por || '').slice(0, 120), String(porEmail || '').slice(0, 160), new Date().toISOString())
    .run();
  return { ok: true };
}

// Tarefas de UM cliente. Busca pelo id da ficha E pelo documento — assim a tarefa
// continua aparecendo mesmo se o registro migrar de id (Ploomes → cadastro novo).
export async function listarTarefasCliente(env, { clienteId, clienteDoc } = {}) {
  const db = await d1(env);
  const doc = String(clienteDoc || '').replace(/\D/g, '');
  const r = await db.prepare('SELECT * FROM tarefas_cliente WHERE cliente_id=?1 OR (?2<>\'\' AND cliente_doc=?2) ORDER BY (status=\'aberta\') DESC, CASE WHEN status=\'aberta\' THEN data ELSE concluido_em END')
    .bind(String(clienteId || ''), doc).all();
  const todas = r.results || [];
  const abertas = todas.filter((t) => t.status === 'aberta').sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const concluidas = todas.filter((t) => t.status !== 'aberta').sort((a, b) => String(b.concluido_em).localeCompare(String(a.concluido_em))).slice(0, 10);
  return { abertas, concluidas };
}

// Tarefas EM ATENÇÃO (para hoje ou atrasadas) — alimenta o aviso no topo do Cadastro.
export async function tarefasEmAtencao(env) {
  try {
    const db = await d1(env);
    const r = await db.prepare('SELECT * FROM tarefas_cliente WHERE status=\'aberta\' AND data<=?1 ORDER BY data, id').bind(hojeBrasil()).all();
    return r.results || [];
  } catch { return []; }
}

// Painel completo: em atenção + próximas + concluídas recentes.
export async function listarTarefasPainel(env) {
  const vazio = { atencao: [], proximas: [], concluidas: [] };
  try {
    const db = await d1(env);
    const hoje = hojeBrasil();
    const ab = await db.prepare('SELECT * FROM tarefas_cliente WHERE status=\'aberta\' ORDER BY data, id').all();
    const abertas = ab.results || [];
    const co = await db.prepare('SELECT * FROM tarefas_cliente WHERE status<>\'aberta\' ORDER BY concluido_em DESC LIMIT 15').all();
    return { atencao: abertas.filter((t) => t.data <= hoje), proximas: abertas.filter((t) => t.data > hoje), concluidas: co.results || [] };
  } catch { return vazio; }
}

export async function mudarStatusTarefa(env, id, acao, por) {
  const n = Number(id) || 0;
  if (!n) return { ok: false, error: 'Tarefa não encontrada.' };
  const db = await d1(env);
  const t = await db.prepare('SELECT id, status FROM tarefas_cliente WHERE id=?1').bind(n).first();
  if (!t) return { ok: false, error: 'Tarefa não encontrada.' };
  if (acao === 'concluir') {
    if (t.status !== 'aberta') return { ok: false, error: 'Essa tarefa já foi concluída.' };
    await db.prepare('UPDATE tarefas_cliente SET status=\'concluida\', concluido_por=?2, concluido_em=?3 WHERE id=?1').bind(n, String(por || '').slice(0, 120), new Date().toISOString()).run();
    return { ok: true };
  }
  if (acao === 'reabrir') {
    if (t.status === 'aberta') return { ok: false, error: 'Essa tarefa já está aberta.' };
    await db.prepare('UPDATE tarefas_cliente SET status=\'aberta\', concluido_por=\'\', concluido_em=\'\' WHERE id=?1').bind(n).run();
    return { ok: true };
  }
  return { ok: false, error: 'Ação desconhecida.' };
}

export async function excluirTarefa(env, id) {
  const n = Number(id) || 0;
  if (!n) return { ok: false, error: 'Tarefa não encontrada.' };
  const db = await d1(env);
  await db.prepare('DELETE FROM tarefas_cliente WHERE id=?1').bind(n).run();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pedaços de tela (HTML). O selo muda sozinho conforme a data:
//   atrasada (vermelho) · para hoje (laranja) · agendada (neutro) · concluída.

function selo(t, hoje) {
  if (t.status !== 'aberta') return '<span style="font-size:10px;font-weight:800;color:#5f6f6c;background:#EEF3F2;border-radius:999px;padding:3px 9px;white-space:nowrap">✓ CONCLUÍDA</span>';
  if (t.data < hoje) {
    const dias = Math.max(1, Math.round((Date.parse(hoje) - Date.parse(t.data)) / 86400e3));
    return `<span style="font-size:10px;font-weight:800;color:#fff;background:#B23A2E;border-radius:999px;padding:3px 9px;white-space:nowrap">⚠ ATRASADA — ${dias} dia(s)</span>`;
  }
  if (t.data === hoje) return '<span style="font-size:10px;font-weight:800;color:#10262B;background:#F5C33B;border-radius:999px;padding:3px 9px;white-space:nowrap">🔔 PARA HOJE</span>';
  return `<span style="font-size:10px;font-weight:800;color:#4F6469;background:#EEF3F2;border-radius:999px;padding:3px 9px;white-space:nowrap">📅 ${dataBR(t.data)}</span>`;
}

function linhaTarefa(t, hoje, { comCliente = false } = {}) {
  const atencao = t.status === 'aberta' && t.data <= hoje;
  const acoes = t.status === 'aberta'
    ? `<button type="button" onclick="tfStatus(${t.id},'concluir')" style="background:#0B5B66;color:#fff;border:none;border-radius:8px;padding:6px 11px;font-size:11.5px;font-weight:800;cursor:pointer">✓ Concluir</button>
       <button type="button" onclick="tfExcluir(${t.id})" style="background:none;border:none;color:#B23A2E;font-size:11px;font-weight:700;cursor:pointer">excluir</button>`
    : `<span style="font-size:11px;color:#8fa39f">${esc((t.concluido_por || '').split(' ')[0])} · ${dataBR(String(t.concluido_em).slice(0, 10))}</span>
       <button type="button" onclick="tfStatus(${t.id},'reabrir')" style="background:none;border:none;color:#0B5B66;font-size:11px;font-weight:700;cursor:pointer">reabrir</button>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid ${atencao ? (t.data < hoje ? '#EFC7C1' : '#F0DCA8') : '#EEF1F0'};border-radius:10px;padding:10px 12px;margin-bottom:7px;background:${atencao ? (t.data < hoje ? '#FDF3F1' : '#FFFAEC') : '#FBFDFC'}">
    <div style="min-width:0">
      <div style="font-size:13px;font-weight:700;color:#10262B;${t.status !== 'aberta' ? 'text-decoration:line-through;color:#8fa39f' : ''}">${esc(t.titulo)}</div>
      <div style="font-size:11px;color:#8fa39f;margin-top:3px">${comCliente && t.cliente_nome ? `<a href="/cadastro/cliente?id=${esc(t.cliente_id)}" style="color:#0B5B66;font-weight:700;text-decoration:none">${esc(t.cliente_nome)}</a> · ` : ''}para ${dataBR(t.data)}${t.criado_por ? ' · criada por ' + esc(String(t.criado_por).split(' ')[0]) : ''}</div>
    </div>
    <div style="flex:none;display:flex;align-items:center;gap:9px">${selo(t, hoje)}${acoes}</div>
  </div>`;
}

const SCRIPT_TAREFAS = `<script>
function tfPost(u,b){return fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json();});}
function tfStatus(id,acao){tfPost('/api/cadastro/tarefa-status',{id:id,acao:acao}).then(function(j){if(j&&j.ok){location.reload();}else{alert((j&&j.error)||'Não consegui. Tente de novo.');}}).catch(function(){alert('Sem conexão. Tente de novo.');});}
function tfExcluir(id){if(!confirm('Excluir esta tarefa? Isso não pode ser desfeito.'))return;tfPost('/api/cadastro/tarefa-excluir',{id:id}).then(function(j){if(j&&j.ok){location.reload();}else{alert((j&&j.error)||'Não consegui excluir.');}}).catch(function(){alert('Sem conexão. Tente de novo.');});}
function tfCriar(cliId){var t=document.getElementById('tfTitulo'),d=document.getElementById('tfData'),m=document.getElementById('tfMsg');
  m.style.color='#a06a62';
  if(!t.value.trim()||t.value.trim().length<3){m.textContent='Escreva o título da tarefa.';return;}
  if(!d.value){m.textContent='Escolha a data.';return;}
  m.style.color='#4F6469';m.textContent='Salvando…';
  tfPost('/api/cadastro/tarefa',{cliente:cliId,titulo:t.value.trim(),data:d.value}).then(function(j){
    if(j&&j.ok){m.style.color='#1E7A3D';m.textContent='✓ Tarefa criada! Atualizando…';setTimeout(function(){location.reload();},600);}
    else{m.style.color='#a06a62';m.textContent=(j&&j.error)||'Não consegui salvar.';}
  }).catch(function(){m.style.color='#a06a62';m.textContent='Sem conexão. Tente de novo.';});}
</script>`;

// Cartão "Tarefas" da ficha do cliente (form + lista). Pré-renderizado no index.js.
export function cardTarefasCliente(clienteId, tarefas) {
  const hoje = hojeBrasil();
  const { abertas = [], concluidas = [] } = tarefas || {};
  const emAtencao = abertas.filter((t) => t.data <= hoje).length;
  const rows = abertas.map((t) => linhaTarefa(t, hoje)).join('')
    || '<div style="font-size:12.5px;color:#8fa39f">Nenhuma tarefa aberta para este cliente.</div>';
  const feitas = concluidas.length ? `<div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9aa7a4;margin:12px 0 8px">Concluídas recentes</div>${concluidas.map((t) => linhaTarefa(t, hoje)).join('')}` : '';
  return `<div class="card" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><div class="sec" style="margin-top:0">📌 Tarefas deste cliente</div>${emAtencao ? `<span style="font-size:11px;background:#FDF3F1;color:#B23A2E;font-weight:800;padding:3px 9px;border-radius:20px">${emAtencao} em atenção</span>` : ''}</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin:-2px 0 12px">Escreva o que precisa ser feito e a data. Quando o dia chegar, a tarefa fica destacada aqui e no topo do Cadastro.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input id="tfTitulo" placeholder="ex.: Ligar para renovar o contrato" maxlength="200" style="flex:1;min-width:220px">
      <input id="tfData" type="date" style="flex:none;width:auto">
      <button type="button" class="btn btn-d" style="padding:9px 14px;font-size:13px" data-cli="${esc(String(clienteId))}" onclick="tfCriar(this.dataset.cli)">＋ Criar tarefa</button>
    </div>
    <div id="tfMsg" style="font-size:12px;color:#4F6469;margin:-6px 0 10px"></div>
    ${rows}
    ${feitas}
  </div>${SCRIPT_TAREFAS}`;
}

// Aviso no topo do Cadastro: só aparece quando existe tarefa para hoje ou atrasada.
export function bannerTarefasAtencao(tarefas) {
  const lista = tarefas || [];
  if (!lista.length) return '';
  const hoje = hojeBrasil();
  return `<div style="background:#FFFAEC;border:1.5px solid #E8C87A;border-radius:14px;padding:14px 16px;margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:10px">
      <div style="font-size:13.5px;font-weight:800;color:#10262B">🔔 Tarefas em atenção — ${lista.length} para hoje ou atrasada(s)</div>
      <a href="/cadastro/tarefas" style="font-size:11.5px;font-weight:800;color:#0B5B66;text-decoration:none;white-space:nowrap">Ver todas →</a>
    </div>
    ${lista.slice(0, 6).map((t) => linhaTarefa(t, hoje, { comCliente: true })).join('')}
    ${lista.length > 6 ? `<a href="/cadastro/tarefas" style="display:block;font-size:12px;font-weight:700;color:#0B5B66;text-decoration:none;margin-top:4px">… e mais ${lista.length - 6} — ver todas →</a>` : ''}
  </div>${SCRIPT_TAREFAS}`;
}

// Página completa de tarefas (autossuficiente, mesmo padrão da tela de acessos).
export function paginaTarefas(user, dados) {
  const hoje = hojeBrasil();
  const d = dados || { atencao: [], proximas: [], concluidas: [] };
  const bloco = (titulo, itens, vazioMsg) => `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px">${titulo}</div>
    ${itens.map((t) => linhaTarefa(t, hoje, { comCliente: true })).join('') || `<div style="font-size:12.5px;color:#8fa39f">${vazioMsg}</div>`}
  </div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Tarefas — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:760px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/cadastro" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">tarefas</span></a>
  <a href="/cadastro" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Cadastro</a>
</div></div>
<div style="max-width:760px;margin:0 auto;padding:20px 18px 56px">
  <h1 style="font-size:21px;margin:0 0 4px">📌 Tarefas dos clientes</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 16px">Criadas na ficha de cada cliente. Quando a data chega, a tarefa entra "em atenção" aqui e no topo do Cadastro.</p>
  ${bloco('🔔 Em atenção — para hoje ou atrasadas', d.atencao, 'Nada para hoje. Tudo em dia! ✓')}
  ${bloco('📅 Próximas (agendadas)', d.proximas, 'Nenhuma tarefa futura agendada.')}
  ${bloco('✓ Concluídas recentes', d.concluidas, 'Nenhuma tarefa concluída ainda.')}
</div>${SCRIPT_TAREFAS}</body></html>`;
}
