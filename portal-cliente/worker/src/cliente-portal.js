// Portal de Grandes Contas — Área do Cliente (pedido do Marcelo).
// Página "Acompanhamento": Kanban dos lotes do cliente (do agendamento ao CDF),
// linha do tempo com prazo por OS e central de downloads com filtros. SÓ LEITURA —
// mostra apenas as OS do CNPJ do cliente logado. Os dados vêm montados pela rota
// (que já tem acesso a coletas + operação + validação), esta é a camada de tela.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dataBR = (v) => { const s = String(v || ''); if (!s) return '—'; const d = new Date(s.includes('T') ? s : s + 'T00:00:00'); if (isNaN(d.getTime())) return '—'; const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };

// Colunas do Kanban do cliente (rótulos exatamente como o Marcelo pediu).
export const COLUNAS_CLIENTE = [
  { id: 'aguardando', rotulo: 'Aguardando Coleta', icone: '📥', cor: '#8A6A16', bg: '#FFF4DE' },
  { id: 'transporte', rotulo: 'Em Transporte / Recebido', icone: '🚚', cor: '#0B5B66', bg: '#E3F0F3' },
  { id: 'processamento', rotulo: 'Em Processamento', icone: '🛠️', cor: '#6B3FA0', bg: '#EFE7FA' },
  { id: 'finalizado', rotulo: 'Finalizado — aguard. documentação', icone: '✅', cor: '#8A4B00', bg: '#FFF6EC' },
  { id: 'concluido', rotulo: 'Concluído · Laudo & CDF', icone: '📑', cor: '#1E5B31', bg: '#E4F3E6' },
];

// Mapeia (status da coleta + etapa da operação + validação) → coluna do Kanban.
export function colunaClienteDe(status, etapaOp, validado) {
  if (status === 'agendada') return 'aguardando';
  if (etapaOp === 'concluida' || status === 'concluida') return validado ? 'concluido' : 'finalizado';
  if (etapaOp === 'validacao') return 'finalizado';
  if (etapaOp === 'processamento' || etapaOp === 'saida') return 'processamento';
  if (etapaOp === 'recepcao' || etapaOp === 'triagem') return 'transporte';
  return 'transporte'; // em_transporte / na_unidade sem operação registrada ainda
}

// ===== Multi-usuário por cliente (gestores) com níveis de acesso =====
// Cada CNPJ pode ter vários gestores. O login principal do cliente (resolvido pela
// base) é ADMIN; gestores cadastrados têm o nível gravado. Additivo: só entra em cena
// quando o e-mail NÃO é da base — a base sempre tem precedência (sem sequestro de conta).
export const NIVEIS = {
  ver: { rotulo: 'Somente visualizar', desc: 'Vê o quadro e a linha do tempo. Não baixa documentos.' },
  baixar: { rotulo: 'Visualizar e baixar', desc: 'Vê tudo e baixa Carta, MTR, CDF e laudos.' },
  admin: { rotulo: 'Administrador', desc: 'Tudo acima + cadastra e remove os gestores do cliente.' },
};
const normalizarNivel = (v) => (NIVEIS[v] ? v : 'ver');
const soDoc = (s) => String(s || '').replace(/\D/g, '');

export async function lerGestores(env, doc) {
  const d = soDoc(doc);
  if (!env || !env.PORTAL_KV || !d) return { doc: d, empresaNome: '', gestores: [] };
  try { const raw = await env.PORTAL_KV.get(`cligest:${d}`); const o = raw ? JSON.parse(raw) : null; return (o && Array.isArray(o.gestores)) ? { doc: d, empresaNome: o.empresaNome || '', gestores: o.gestores } : { doc: d, empresaNome: '', gestores: [] }; } catch { return { doc: d, empresaNome: '', gestores: [] }; }
}
// Login: dado um e-mail, devolve o cliente (CNPJ) do qual ele é gestor + o nível.
export async function gestorPorEmail(env, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!env || !env.PORTAL_KV || !em) return null;
  let d = ''; try { d = await env.PORTAL_KV.get(`cligestmail:${em}`); } catch { d = ''; }
  if (!d) return null;
  const g = await lerGestores(env, d);
  const found = (g.gestores || []).find((x) => x.email === em);
  return found ? { doc: g.doc, empresaNome: g.empresaNome, gestor: found } : null;
}
export async function salvarGestor(env, doc, empresaNome, dados) {
  const d = soDoc(doc);
  if (!env.PORTAL_KV || !d) return { erro: 'Indisponível.' };
  const email = String((dados && dados.email) || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: 'Informe um e-mail válido.' };
  const g = await lerGestores(env, d);
  const rec = { email, nome: String((dados && dados.nome) || '').replace(/[<>]/g, '').slice(0, 100), papel: String((dados && dados.papel) || '').slice(0, 60), nivel: normalizarNivel(dados && dados.nivel) };
  const i = g.gestores.findIndex((x) => x.email === email);
  if (i >= 0) g.gestores[i] = rec; else g.gestores.push(rec);
  if (g.gestores.length > 30) return { erro: 'Limite de 30 gestores por cliente.' };
  await env.PORTAL_KV.put(`cligest:${d}`, JSON.stringify({ doc: d, empresaNome: empresaNome || g.empresaNome || '', gestores: g.gestores }), { expirationTtl: 60 * 60 * 24 * 1825 });
  await env.PORTAL_KV.put(`cligestmail:${email}`, d, { expirationTtl: 60 * 60 * 24 * 1825 });
  return { ok: true };
}
export async function removerGestor(env, doc, email) {
  const d = soDoc(doc), em = String(email || '').trim().toLowerCase();
  if (!env.PORTAL_KV || !d) return { erro: 'Indisponível.' };
  const g = await lerGestores(env, d);
  g.gestores = g.gestores.filter((x) => x.email !== em);
  await env.PORTAL_KV.put(`cligest:${d}`, JSON.stringify({ doc: d, empresaNome: g.empresaNome, gestores: g.gestores }));
  try { await env.PORTAL_KV.delete(`cligestmail:${em}`); } catch { /* ok */ }
  return { ok: true };
}

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:'Helvetica Neue',Arial,'Segoe UI',sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}
.appbar{background:#00333B;padding:14px 20px}
.appbar-in{max-width:1180px;margin:0 auto;display:flex;justify-content:space-between;align-items:center}
.lg{color:#fff;font-size:17px;font-weight:800}.lg .dot{color:#92C430}
.tg{color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px}
.wrap{max-width:1180px;margin:0 auto;padding:22px 18px 60px}
.h1{font-size:22px;font-weight:800;margin:0;color:#00333B}
.muted{color:#6B7B78}
.btn{display:inline-block;border:none;border-radius:11px;padding:11px 16px;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:16px 0}
.tile{background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:11px;text-align:center}
.tile b{font-size:20px;font-weight:800;display:block;color:#00333B}.tile span{font-size:10px;color:#6B7B78}
.kb{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;align-items:start}
.col{background:#F7FAF9;border:1px solid #E4EBE9;border-radius:14px;padding:9px;min-height:90px}
.colh{display:flex;justify-content:space-between;align-items:center;padding:5px 6px 9px}
.colh .t{font-size:11px;font-weight:800}
.pill{font-size:9.5px;font-weight:800;padding:2px 8px;border-radius:20px}
.card{display:block;width:100%;text-align:left;background:#fff;border:1px solid #E4EBE9;border-radius:11px;padding:11px 12px;margin-bottom:9px;cursor:pointer}
.card:hover{border-color:#92C430}
.card .num{font-size:12.5px;font-weight:800;color:#00333B}
.card .cli{font-size:10.5px;color:#6B7B78;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .meta{font-size:10px;color:#8fa39f;margin-top:7px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:3px;vertical-align:middle}
.filtros{display:flex;gap:9px;flex-wrap:wrap;align-items:end;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:12px 14px;margin:14px 0}
.filtros label{display:block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#8fa39f;margin-bottom:4px}
.filtros input,.filtros select{border:1px solid #DDE1E6;border-radius:9px;padding:8px 10px;font-size:12.5px;font-family:inherit;color:#10262B}
/* modal */
.ov{position:fixed;inset:0;background:rgba(15,42,47,.5);display:none;align-items:flex-start;justify-content:center;padding:26px 16px;overflow:auto;z-index:20}
.ov.on{display:flex}
.sheet{background:#fff;border-radius:16px;max-width:560px;width:100%;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.25)}
.sheet .sh{background:#00333B;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center}
.sheet .sb{padding:18px 20px}
.tl{position:relative;margin:6px 0 4px;padding-left:20px}
.tl .step{position:relative;padding:0 0 14px 0}
.tl .step::before{content:"";position:absolute;left:-14px;top:2px;width:11px;height:11px;border-radius:50%;background:#fff;border:2px solid #cfe0dd}
.tl .step.done::before{background:#92C430;border-color:#92C430}
.tl .step.now::before{background:#0B5B66;border-color:#0B5B66}
.tl::before{content:"";position:absolute;left:-9px;top:4px;bottom:12px;width:2px;background:#E4EBE9}
.tl .st{font-size:12.5px;font-weight:700;color:#10262B}.tl .sd{font-size:11px;color:#8fa39f}
.dl{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #EEF1F0;border-radius:10px;padding:9px 12px;margin-bottom:7px;background:#FBFDFC;text-decoration:none}
.dl .nm{font-size:12.5px;font-weight:700;color:#10262B}
.dl .go{font-size:11px;font-weight:800;color:#0B5B66}
@media(max-width:1000px){.kb{grid-template-columns:1fr 1fr 1fr;overflow-x:visible}.tiles{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.kb{grid-template-columns:1fr 1fr}.tiles{grid-template-columns:1fr 1fr}}`;

const prazoDot = (p) => p ? `<span class="dot" style="background:${p.cor}"></span>${esc(p.rotulo)}` : '';

function cardHTML(c) {
  return `<button class="card" onclick='abrir(${c.j})'>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><span class="num">${esc(c.numero || 'OS')}</span>${c.prazo ? `<span class="pill" style="background:${c.prazo.cor}1A;color:${c.prazo.cor}">${c.prazo.dot}</span>` : ''}</div>
    <div class="cli">${esc(c.local || c.etapaRot || '')}</div>
    <div class="meta">${c.dataColeta ? '📅 ' + esc(dataBR(c.dataColeta)) : (c.criadoEm ? '📅 ' + esc(dataBR(c.criadoEm)) : '')}${c.docs && c.docs.length ? ' · 📄 ' + c.docs.length + ' doc(s)' : ''}</div>
  </button>`;
}

export function paginaAcompanhamento(dados) {
  const d = dados || {};
  const cards = d.cards || [];
  // injeta índice para o onclick (dados embutidos, sem novo fetch)
  cards.forEach((c, i) => { c.j = i; });
  const porColuna = {};
  for (const col of COLUNAS_CLIENTE) porColuna[col.id] = [];
  for (const c of cards) (porColuna[c.coluna] || porColuna.transporte).push(c);

  const colunasHTML = COLUNAS_CLIENTE.map((col) => {
    const itens = porColuna[col.id] || [];
    const corpo = itens.length ? itens.map(cardHTML).join('') : `<div style="font-size:11px;color:#b7c3bf;text-align:center;padding:12px 4px">—</div>`;
    return `<div class="col"><div class="colh"><span class="t" style="color:${col.cor}">${col.icone} ${esc(col.rotulo)}</span><span class="pill" style="background:${col.bg};color:${col.cor}">${itens.length}</span></div>${corpo}</div>`;
  }).join('');

  const r = d.resumo || {};
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Acompanhamento — Ecobraz</title><style>${CSS}</style></head><body>
<div class="appbar"><div class="appbar-in"><div><a href="/painel" style="text-decoration:none"><span class="lg">ecobraz<span class="dot">.</span></span></a><span class="tg">Portal do Cliente</span></div>
  <div style="display:flex;gap:10px;align-items:center"><span style="color:#cfe3e0;font-size:12px">${esc(d.empresa || '')}</span><form method="post" action="/api/auth/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form></div>
</div></div>
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px">
    <div><a href="/painel" style="font-size:12.5px;font-weight:800;text-decoration:none;color:#4F6469">← Painel</a>
      <h1 class="h1" style="margin-top:8px">Acompanhamento dos seus serviços</h1>
      <p class="muted" style="font-size:13px;margin:4px 0 0">Do agendamento ao Certificado de Destinação Final — em tempo real, só as OS do seu CNPJ.</p></div>
    <a href="/painel#solicitar" class="btn btn-p">➕ Solicitar nova coleta</a>
  </div>

  <div class="tiles">
    <div class="tile"><b>${r.total || 0}</b><span>total de OS</span></div>
    <div class="tile"><b style="color:#8A6A16">${r.aguardando || 0}</b><span>aguardando</span></div>
    <div class="tile"><b style="color:#0B5B66">${r.transporte || 0}</b><span>em transporte</span></div>
    <div class="tile"><b style="color:#6B3FA0">${r.processamento || 0}</b><span>processamento</span></div>
    <div class="tile"><b style="color:#8A4B00">${r.finalizado || 0}</b><span>aguard. doc.</span></div>
    <div class="tile"><b style="color:#1E5B31">${r.concluido || 0}</b><span>concluído + CDF</span></div>
  </div>

  <div class="filtros">
    <div><label>Buscar (nº da OS)</label><input id="fBusca" oninput="filtrar()" placeholder="OS-2026-…" style="width:150px"></div>
    <div><label>De</label><input type="date" id="fDe" onchange="filtrar()"></div>
    <div><label>Até</label><input type="date" id="fAte" onchange="filtrar()"></div>
    <div><label>Só com documento</label><select id="fDoc" onchange="filtrar()"><option value="">Todas</option><option value="1">Com documentos</option></select></div>
    <button type="button" class="btn btn-g" style="padding:8px 12px" onclick="limpar()">Limpar</button>
  </div>

  <div class="kb" id="kb">${colunasHTML}</div>
  ${cards.length ? '' : '<div style="text-align:center;color:#8fa39f;font-size:13.5px;padding:30px">Nenhuma ordem de serviço encontrada para o seu CNPJ ainda.</div>'}

  <div style="font-size:11px;color:#9aa7a4;margin-top:16px;line-height:1.6">Clique num cartão para ver a linha do tempo e baixar os documentos. Você vê apenas as OS vinculadas ao seu CNPJ.</div>
</div>

<div class="ov" id="ov" onclick="if(event.target===this)fechar()"><div class="sheet" id="sheet"></div></div>

<script>
  var CARDS = ${JSON.stringify(cards).replace(/</g, '\\u003c')};
  function dataBR(v){if(!v)return '—';var s=String(v);var d=new Date(s.indexOf('T')>=0?s:s+'T00:00:00');if(isNaN(d.getTime()))return '—';function p(n){return String(n).padStart(2,'0');}return p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear();}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function abrir(i){var c=CARDS[i];if(!c)return;
    var etapas=[
      {k:'Coleta agendada',d:c.dataColeta,done:true},
      {k:'Recebido no galpão',d:c.recebidoEm,done:!!c.recebidoEm},
      {k:'Em processamento / destruição',d:c.processadoEm,done:!!c.processadoEm},
      {k:'Finalizado — aguardando documentação',d:c.finalizadoEm,done:c.coluna==='finalizado'||c.coluna==='concluido'},
      {k:'Concluído · Laudo & CDF',d:c.cdfEm,done:c.coluna==='concluido'}
    ];
    var atual=-1;for(var e=0;e<etapas.length;e++){if(etapas[e].done)atual=e;}
    var tl=etapas.map(function(s,idx){var cls=s.done?(idx===atual?'now':'done'):'';return '<div class="step '+cls+'"><div class="st">'+esc(s.k)+'</div><div class="sd">'+(s.d?dataBR(s.d):(s.done?'realizado':'previsto'))+'</div></div>';}).join('');
    var docs=(c.docs||[]).map(function(x){return '<a class="dl" href="'+x.href+'" target="_blank" rel="noopener"><span class="nm">'+esc(x.icone||'📄')+' '+esc(x.nome)+'</span><span class="go">baixar ⬇</span></a>';}).join('')||'<div style="font-size:12px;color:#8fa39f">Os documentos ficam disponíveis a partir do transporte / recebimento.</div>';
    document.getElementById('sheet').innerHTML=
      '<div class="sh"><div><div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#9FC6C1">Ordem de Serviço</div><div style="font-size:17px;font-weight:800">'+esc(c.numero||'OS')+'</div></div><button onclick="fechar()" style="background:none;border:0;color:#9FC6C1;font-size:22px;cursor:pointer;line-height:1">×</button></div>'+
      '<div class="sb">'+
        (c.local?'<div style="font-size:12.5px;color:#4F6469;margin-bottom:12px">📍 '+esc(c.local)+'</div>':'')+
        '<div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8fa39f;margin-bottom:10px">Linha do tempo</div>'+
        '<div class="tl">'+tl+'</div>'+
        '<div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8fa39f;margin:16px 0 10px">Documentos e laudos</div>'+
        docs+
      '</div>';
    document.getElementById('ov').classList.add('on');
  }
  function fechar(){document.getElementById('ov').classList.remove('on');}
  document.addEventListener('keydown',function(e){if(e.key==='Escape')fechar();});
  function filtrar(){
    var q=(document.getElementById('fBusca').value||'').toLowerCase();
    var de=document.getElementById('fDe').value, ate=document.getElementById('fAte').value, soDoc=document.getElementById('fDoc').value;
    document.querySelectorAll('.card').forEach(function(btn){
      var i=Number(btn.getAttribute('onclick').replace(/\\D/g,''));var c=CARDS[i]||{};
      var ok=true;
      if(q && String(c.numero||'').toLowerCase().indexOf(q)<0) ok=false;
      var dref=(c.dataColeta||c.criadoEm||'').slice(0,10);
      if(de && dref && dref<de) ok=false;
      if(ate && dref && dref>ate) ok=false;
      if(soDoc==='1' && !(c.docs&&c.docs.length)) ok=false;
      btn.style.display=ok?'':'none';
    });
  }
  function limpar(){document.getElementById('fBusca').value='';document.getElementById('fDe').value='';document.getElementById('fAte').value='';document.getElementById('fDoc').value='';filtrar();}
</script>
</body></html>`;
}
