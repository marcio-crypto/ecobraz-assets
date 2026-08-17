// Módulo Diretoria — painel executivo (visão macro). Só a diretoria (DIRETORIA_EMAILS).
// Lê os índices que os outros módulos já mantêm (operações + destinos) e resume: volume,
// toneladas, pipeline por etapa, conformidade e alertas. Sem chamadas externas (rápido).
//
// v1 usa os dados do NOSSO sistema. Volume de coletas/Ploomes e "falhas por pessoa" entram
// numa próxima fatia, conforme o operacional acumula histórico.

import { listarOperacoes } from './operacional.js';
import { listarDestinos, destinoStatus } from './engenharia.js';
import { botaoGoogle } from './google-auth.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const VERDE = '#3f8f3a', TEAL = '#00333B';

export function diretoresDe(env) {
  const out = new Map();
  for (const par of String(env.DIRETORIA_EMAILS || '').split(/[,;]+/)) {
    const [em, nome] = par.split('|');
    const e = (em || '').trim().toLowerCase();
    if (e) out.set(e, (nome || '').trim() || e.split('@')[0]);
  }
  return out;
}
export function diretorPermitido(email, env) { return diretoresDe(env).has(String(email || '').trim().toLowerCase()); }
export function nomeDiretor(email, env) { return diretoresDe(env).get(String(email || '').trim().toLowerCase()) || String(email || '').split('@')[0]; }

export async function reunirDados(env) {
  const ops = await listarOperacoes(env);
  const destinos = await listarDestinos(env);
  const et = { recepcao: 0, triagem: 0, processamento: 0, saida: 0, validacao: 0, concluida: 0 };
  let toneladas = 0, concluidas = 0, mesAtual = 0, mesAnterior = 0;
  let ym = '', ymPrev = '';
  try { const d = new Date(); ym = d.toISOString().slice(0, 7); ymPrev = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7); } catch { /* ok */ }
  for (const o of ops) {
    if (et[o.etapa] != null) et[o.etapa]++;
    toneladas += (Number(o.entradaKg) || 0) / 1000;
    if (o.etapa === 'concluida') concluidas++;
    const cym = String(o.criadoEm || o.em || '').slice(0, 7);
    if (cym && cym === ym) mesAtual++; else if (cym && cym === ymPrev) mesAnterior++;
  }
  const vencidas = destinos.filter((d) => destinoStatus(d) === 'vencido');
  const pendentes = destinos.filter((d) => destinoStatus(d) === 'pendente');
  return { ops, destinos, et, toneladas: Math.round(toneladas * 10) / 10, total: ops.length, concluidas, aguardando: et.validacao, emAndamento: ops.length - concluidas, mesAtual, mesAnterior, vencidas, pendentes };
}

const tile = (num, label, hint, cor) => `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px 16px">
  <div style="font-size:30px;font-weight:800;letter-spacing:-.03em;color:${cor || TEAL};line-height:1">${esc(num)}</div>
  <div style="font-size:12px;font-weight:800;color:#4F6469;margin-top:8px;text-transform:uppercase;letter-spacing:.04em">${esc(label)}</div>
  ${hint ? `<div style="font-size:11.5px;color:#8fa39f;margin-top:3px">${hint}</div>` : ''}</div>`;

const ETAPAS = [['recepcao', 'Recepção'], ['triagem', 'Triagem'], ['processamento', 'Processamento'], ['saida', 'Saída'], ['validacao', 'Aguardando validação'], ['concluida', 'Concluídas']];

export function paginaLoginDiretoria(googleOn) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Diretoria — Ecobraz</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;background:#00333B;font-family:Montserrat,'Segoe UI',Arial,sans-serif">
<div style="max-width:400px;margin:0 auto;padding:32px 24px;width:100%;box-sizing:border-box">
  <div style="text-align:center;margin-bottom:26px"><span style="color:#fff;font-size:26px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">diretoria</span></div>
  <div style="background:#fff;border-radius:18px;padding:26px 22px;color:#10262B">
    <h1 style="margin:0 0 8px;font-size:20px;color:#00333B">Painel da Diretoria</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6">Acesso restrito à diretoria.</p>
    ${googleOn ? botaoGoogle('diretoria') : ''}
    <input id="e" type="email" inputmode="email" placeholder="seu e-mail" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:11px;padding:14px;font-size:16px">
    <button id="b" style="width:100%;margin-top:12px;background:#92C430;color:#10262B;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:800">Entrar</button>
    <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px"></div>
  </div>
</div>
<script>const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/diretoria/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail estiver cadastrado, enviamos o link.';}catch{m.textContent='Tente de novo.';}b.disabled=false;};
e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});</script></body></html>`;
}

// Trio de números hoje / 7 dias / 30 dias.
const trio = (t, hoje, semana, mes, corHoje) => `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:16px 18px">
  <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px">${esc(t)}</div>
  <div style="display:flex;gap:14px;text-align:center">
    <div style="flex:1"><div style="font-size:26px;font-weight:800;color:${corHoje || TEAL};line-height:1">${esc(String(hoje))}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">HOJE</div></div>
    <div style="flex:1;border-left:1px solid #EEF1F0"><div style="font-size:26px;font-weight:800;color:${TEAL};line-height:1">${esc(String(semana))}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">7 DIAS</div></div>
    <div style="flex:1;border-left:1px solid #EEF1F0"><div style="font-size:26px;font-weight:800;color:${TEAL};line-height:1">${esc(String(mes))}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">30 DIAS</div></div>
  </div>`;
// Mini gráfico de barras dos últimos 14 dias.
const spark = (serie) => {
  const s = Array.isArray(serie) ? serie : [];
  const mx = Math.max(1, ...s.map((x) => x.n));
  return `<div style="display:flex;align-items:flex-end;gap:3px;height:36px;margin-top:12px">${s.map((x) => `<div title="${esc(x.d)}: ${x.n}" style="flex:1;background:${x.n ? '#7FB03C' : '#E9EFEC'};height:${x.n ? Math.max(12, Math.round((x.n / mx) * 100)) : 8}%;border-radius:3px"></div>`).join('')}</div><div style="font-size:9.5px;color:#9aa7a4;margin-top:5px;text-align:right">últimos 14 dias</div></div>`;
};
// Lista com barra proporcional (top 5 clientes / equipe).
const barraLista = (itens, unidade) => {
  const l = Array.isArray(itens) ? itens : [];
  if (!l.length) return '<div style="font-size:12.5px;color:#8fa39f">Ainda sem registros — a medição começa a contar a partir de agora.</div>';
  const mx = Math.max(1, ...l.map((x) => x.dias));
  return l.map((x) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;margin-bottom:4px"><span style="min-width:0;color:#28413f;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.nome)}${x.papel ? ` <span style="font-weight:600;color:#8fa39f">· ${esc(x.papel)}</span>` : ''}${x.ativoHoje ? ' <span style="font-size:9px;font-weight:800;color:#1E7A3D;background:#E4F3E6;border-radius:999px;padding:1px 7px;vertical-align:middle">ativo hoje</span>' : ''}</span><b style="flex:none">${x.dias} ${esc(unidade)}</b></div>
    <div style="background:#EEF3F1;border-radius:5px;height:9px;overflow:hidden"><div style="width:${Math.round((x.dias / mx) * 100)}%;height:100%;background:#7FB03C;border-radius:5px"></div></div></div>`).join('');
};

export function paginaPainelDiretoria(diretor, d, x) {
  x = x || {};
  const leads = x.leads || { dia: 0, semana: 0, mes: 0, serie: [] };
  const os = x.os || { dia: 0, semana: 0, mes: 0, serie: [] };
  const uso = x.uso || { clientes: { hoje: 0, semana: 0, mes: 0, top5: [] }, equipe: { hoje: 0, semana: 0, mes: 0, pessoas: [] } };
  const pend = Array.isArray(x.pend) ? x.pend : [];
  const frota = x.frota || null;
  const frotaRows = frota && Array.isArray(frota.frota) && frota.frota.length ? frota.frota.map((v) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid #E4EBE9;border-radius:12px;padding:11px 14px;margin-bottom:8px;flex-wrap:wrap">
      <div style="min-width:0"><div style="font-size:13.5px;font-weight:800">🚛 ${esc(v.placa || '—')}${v.apelido ? ` <span style="font-weight:600;color:#7c8a87">· ${esc(v.apelido)}</span>` : ''}${v.motorista ? ` <span style="font-weight:700;color:#0B5B66">· ${esc(v.motorista)}</span>` : ''}</div>
        <div style="font-size:12px;color:#4F6469;margin-top:3px">Indo para: ${v.coletaAtual ? `<b>${esc(v.coletaAtual.numero || '')}</b> · ${esc(v.coletaAtual.cliente || '')}` : '<span style="color:#8fa39f">nenhuma coleta em andamento</span>'}</div>
        ${v.proxima ? `<div style="font-size:12px;color:#4F6469;margin-top:2px">Próxima: ${esc(v.proxima.numero || '')} · ${esc(v.proxima.cliente || '')}</div>` : ''}</div>
      <div style="flex:none;text-align:right"><div style="font-size:12px;color:#28413f">Concluídas hoje: <b>${v.concluidasHoje || 0}</b></div>
        ${v.pos ? `<a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(v.pos.lat)}&mlon=${encodeURIComponent(v.pos.lng)}#map=15/${encodeURIComponent(v.pos.lat)}/${encodeURIComponent(v.pos.lng)}" target="_blank" rel="noopener" style="font-size:11.5px;color:#0B5B66;font-weight:800;text-decoration:none">🗺️ localização ao vivo ↗</a>` : '<span style="font-size:11px;color:#9aa7a4">posição: em ativação</span>'}</div>
    </div>`).join('') : '<div style="font-size:12.5px;color:#8fa39f">Nenhum veículo cadastrado na Frota.</div>';
  const frotaAviso = frota && !frota.posOk ? '<div style="font-size:11px;color:#8A6A16;background:#FFFBEB;border:1px solid #F0DCA6;border-radius:8px;padding:8px 11px;margin-bottom:10px">🛰️ Posições ao vivo em ativação (RotaExata). As coletas por veículo já são reais.</div>' : '';
  const totalPend = pend.reduce((a, p) => a + (Number(p.qtd) || 0), 0);
  const pendRows = pend.length ? pend.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid #F0E6D2;background:#FFFBEF;border-radius:12px;padding:11px 14px;margin-bottom:8px">
      <div style="min-width:0"><div style="font-size:13px;font-weight:800;color:#10262B">${esc(p.rotulo)}</div>
      <div style="font-size:11.5px;color:#8A6A16;margin-top:2px">Responsável: <b>${esc(p.quem)}</b>${p.maisAntigaDias != null ? ` · mais antiga: ${p.maisAntigaDias === 0 ? 'hoje' : p.maisAntigaDias + ' dia(s)'}` : ''}${(p.hoje || p.semana || p.mes || p.antigas) ? ` · hoje ${p.hoje} / 7d ${p.hoje + p.semana} / 30d ${p.hoje + p.semana + p.mes}${p.antigas ? ` / +antigas ${p.antigas}` : ''}` : ''}</div></div>
      <span style="flex:none;font-size:18px;font-weight:800;color:#8A6A16">${p.qtd}</span>
    </div>`).join('') : '<div style="font-size:13px;color:#1E7A3D;font-weight:700">✓ Nenhuma pendência aberta. Tudo em dia.</div>';

  const maxEt = Math.max(1, ...ETAPAS.map(([k]) => d.et[k] || 0));
  const barras = ETAPAS.map(([k, rot]) => {
    const n = d.et[k] || 0; const w = Math.round((n / maxEt) * 100);
    return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px"><span style="color:#4F6469">${esc(rot)}</span><b>${n}</b></div>
      <div style="background:#EEF3F1;border-radius:6px;height:10px;overflow:hidden"><div style="width:${w}%;height:100%;background:${k === 'concluida' ? VERDE : '#7FB03C'};border-radius:6px"></div></div></div>`;
  }).join('');
  const tend = d.mesAtual === d.mesAnterior ? 'estável' : (d.mesAtual > d.mesAnterior ? `▲ subiu (${d.mesAnterior}→${d.mesAtual})` : `▼ caiu (${d.mesAnterior}→${d.mesAtual})`);
  const tendCor = d.mesAtual >= d.mesAnterior ? '#1E7A3D' : '#B23A2E';
  const alertas = [];
  d.vencidas.forEach((x) => alertas.push(`<div style="color:#B23A2E">⚠ Destino com <b>licença vencida</b>: ${esc(x.razaoSocial || x.cnpj)}</div>`));
  if (d.aguardando > 0) alertas.push(`<div style="color:#8A6A16">⏳ <b>${d.aguardando}</b> operação(ões) aguardando validação da Engenharia.</div>`);
  d.pendentes.forEach((x) => alertas.push(`<div style="color:#8A6A16">• Destino sem homologação: ${esc(x.razaoSocial || x.cnpj)}</div>`));
  const alertasHtml = alertas.length ? alertas.join('') : '<div style="color:#1E7A3D">✓ Sem alertas críticos no momento.</div>';
  // Fluxo de vendas — só chega preenchido no acesso do dono (gate no index.js).
  const brl = (v) => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const vv = x.vendas;
  const vendasHtml = vv ? `<div style="background:linear-gradient(90deg,#00333B,#0B5B66);border-radius:16px;padding:18px;margin-bottom:14px;color:#fff">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#FFD46B;margin-bottom:12px">💰 Fluxo de vendas — pagamentos confirmados</div>
    <div style="display:flex;gap:14px;text-align:center">
      <div style="flex:1"><div style="font-size:22px;font-weight:800;line-height:1.05">${esc(brl(vv.dia))}</div><div style="font-size:10px;color:#9FC6C1;font-weight:700;margin-top:5px">HOJE</div></div>
      <div style="flex:1;border-left:1px solid rgba(255,255,255,.18)"><div style="font-size:22px;font-weight:800;line-height:1.05">${esc(brl(vv.semana))}</div><div style="font-size:10px;color:#9FC6C1;font-weight:700;margin-top:5px">7 DIAS</div></div>
      <div style="flex:1;border-left:1px solid rgba(255,255,255,.18)"><div style="font-size:22px;font-weight:800;line-height:1.05">${esc(brl(vv.mes))}</div><div style="font-size:10px;color:#9FC6C1;font-weight:700;margin-top:5px">30 DIAS</div></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;border-top:1px solid rgba(255,255,255,.18);padding-top:12px;flex-wrap:wrap">
      <span style="font-size:12.5px;color:#EAF3F1">⚠️ Não concretizadas no mês (geradas e não pagas)</span>
      <a href="/diretoria/pagamentos" style="font-weight:800;font-size:15px;color:#FFD46B;text-decoration:underline">${esc(brl(vv.naoConcretizadasValor))} · ${esc(String(vv.naoConcretizadasQtd))} pedido(s)</a>
    </div>
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px"><span style="font-size:10px;color:#9FC6C1">Soma dos pagamentos aprovados (coleta expressa, OS paga, Adote, carbono, ESG).${vv.truncado ? ' Mostrando os primeiros 800 pedidos.' : ''}</span><span style="display:flex;gap:14px"><a href="/diretoria/pagamentos" style="font-size:11px;font-weight:800;color:#FFD46B;text-decoration:none">Ver os pedidos, um a um →</a><a href="/diretoria/google-ads" style="font-size:11px;font-weight:800;color:#9FC6C1;text-decoration:none">🎯 Lista p/ Google Ads →</a></span></div>
  </div>` : '';
  // Saldo do WhatsApp (Gupshup) — só chega preenchido no acesso do Marcio (gate no index.js).
  const ws = x.waSaldo;
  let waSaldoHtml = '';
  if (ws) {
    if (ws.ok) {
      const farol = ws.saldo < 10
        ? { cor: '#FF9B8E', rotulo: '🔴 RECARREGAR — está acabando' }
        : ws.saldo < 25
          ? { cor: '#FFD46B', rotulo: '🟡 Atenção — saldo baixo' }
          : { cor: '#92C430', rotulo: '🟢 Saldo ok' };
      const dtA = new Date(ws.em); dtA.setUTCHours(dtA.getUTCHours() - 3);
      const p2 = (n) => String(n).padStart(2, '0');
      const hora = Number.isNaN(dtA.getTime()) ? '' : ` · lido às ${p2(dtA.getUTCHours())}:${p2(dtA.getUTCMinutes())}`;
      const valor = (ws.moeda === 'USD' ? 'US$ ' : esc(ws.moeda) + ' ') + (Number(ws.saldo) || 0).toFixed(2).replace('.', ',');
      const baseTxt = ws.estimado && ws.base
        ? `Estimado: base de US$ ${Number(ws.base.valor).toFixed(2)} informada em ${esc(String(ws.base.em).slice(0, 10).split('-').reverse().join('/'))} − ${Number(ws.enviadas) || 0} msg × US$ ${Number(ws.base.custoMsg).toFixed(2)}. Atualize a base nas Campanhas ao recarregar.`
        : `Crédito das campanhas e avisos de coleta — alerta abaixo de US$ 25, urgente abaixo de US$ 10${hora}. Recarga: painel do Gupshup.`;
      waSaldoHtml = `<a href="/diretoria/whatsapp" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#062f36;border:1px solid #12525d;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#eaf5f3">
    <div><div style="font-size:14px;font-weight:800">💬 Saldo do WhatsApp${ws.estimado ? ' (estimado)' : ' (Gupshup)'}: ${valor}</div>
    <div style="font-size:12px;color:#9FC6C1;margin-top:2px">${baseTxt}</div></div>
    <span style="flex:none;font-size:12px;font-weight:800;color:${farol.cor}">${farol.rotulo}</span>
  </a>`;
    } else if (ws.motivo !== 'nao_configurado') {
      waSaldoHtml = `<a href="/diretoria/whatsapp" style="display:block;text-decoration:none;background:#062f36;border:1px solid #12525d;border-radius:14px;padding:12px 16px;margin-bottom:12px;color:#9FC6C1;font-size:12px">💬 Saldo do WhatsApp: a API desta conta não deixa ler a carteira. <b style="color:#FFD46B">Informe o saldo uma vez na tela de Campanhas</b> e o painel passa a mostrar o saldo estimado (desconta cada disparo sozinho). (Detalhe: ${esc((ws.tentativas || []).map((t) => `${t.via} HTTP ${t.status}`).join(' · ') || ws.motivo)})</a>`;
    }
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Painel da Diretoria — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div style="background:#00333B;padding:16px 20px"><div style="max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <div><span style="color:#fff;font-size:16px;font-weight:800">Painel da Diretoria</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">Ecobraz · visão macro</div></div>
  <form method="post" action="/api/diretoria/sair" style="margin:0"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700">Sair</button></form>
</div></div>
<div style="max-width:900px;margin:0 auto;padding:20px 18px 48px">

  ${vendasHtml}
  ${waSaldoHtml}
  <a href="/diretoria/prevencao" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#062f36;border:1px solid #12525d;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#eaf5f3">
    <div><div style="font-size:14px;font-weight:800">🛡️ Prevenção de perdas</div><div style="font-size:12px;color:#9FC6C1;margin-top:2px">Reconciliação por peso, valor estimado e conferência das fotos por IA.</div></div>
    <span style="font-size:12px;font-weight:800;color:#92C430">Abrir →</span>
  </a>
  <a href="/diretoria/whatsapp" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#062f36;border:1px solid #12525d;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#eaf5f3">
    <div><div style="font-size:14px;font-weight:800">📣 Campanhas de WhatsApp</div><div style="font-size:12px;color:#9FC6C1;margin-top:2px">Divulgação e oferta de coleta para a base — canal oficial, com template aprovado e opt-out.</div></div>
    <span style="font-size:12px;font-weight:800;color:#92C430">Abrir →</span>
  </a>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px" class="g2">
    ${trio('📥 Leads que chegam', leads.dia, leads.semana, leads.mes, leads.dia ? '#0B7A66' : TEAL)}${spark(leads.serie)}
    ${trio('📋 OS geradas', os.dia, os.semana, os.mes, os.dia ? '#0B7A66' : TEAL)}${spark(os.serie)}
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px" class="g2">
    <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87">🏢 Uso do sistema — clientes</div><a href="/diretoria/acessos-clientes" style="font-size:11px;font-weight:800;color:#0B5B66;text-decoration:none;white-space:nowrap">Ver todos →</a></div>
      <div style="display:flex;gap:14px;text-align:center;margin-bottom:14px">
        <div style="flex:1"><div style="font-size:24px;font-weight:800;color:${TEAL};line-height:1">${uso.clientes.hoje}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">HOJE</div></div>
        <div style="flex:1;border-left:1px solid #EEF1F0"><div style="font-size:24px;font-weight:800;color:${TEAL};line-height:1">${uso.clientes.semana}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">7 DIAS</div></div>
        <div style="flex:1;border-left:1px solid #EEF1F0"><div style="font-size:24px;font-weight:800;color:${TEAL};line-height:1">${uso.clientes.mes}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">30 DIAS</div></div>
      </div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px;border-top:1px solid #EEF1F0;padding-top:12px">Top 5 — clientes que mais usam (dias ativos em 30d)</div>
      ${barraLista(uso.clientes.top5, 'dia(s)')}
    </div>
    <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px">👷 Uso do sistema — funcionários</div>
      <div style="display:flex;gap:14px;text-align:center;margin-bottom:14px">
        <div style="flex:1"><div style="font-size:24px;font-weight:800;color:${TEAL};line-height:1">${uso.equipe.hoje}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">HOJE</div></div>
        <div style="flex:1;border-left:1px solid #EEF1F0"><div style="font-size:24px;font-weight:800;color:${TEAL};line-height:1">${uso.equipe.semana}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">7 DIAS</div></div>
        <div style="flex:1;border-left:1px solid #EEF1F0"><div style="font-size:24px;font-weight:800;color:${TEAL};line-height:1">${uso.equipe.mes}</div><div style="font-size:10px;color:#8fa39f;font-weight:700;margin-top:4px">30 DIAS</div></div>
      </div>
      <div style="font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px;border-top:1px solid #EEF1F0;padding-top:12px">Pessoa a pessoa (dias ativos em 30d)</div>
      ${barraLista(uso.equipe.pessoas, 'dia(s)')}
    </div>
  </div>
  <div style="font-size:10.5px;color:#9aa7a4;margin-top:8px">A medição de acessos passa a contar a partir de 28/07/2026 — não existe registro retroativo. "7 dias" e "30 dias" são janelas móveis. Leads e OS usam o histórico real do sistema.</div>

  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px;margin-top:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87">⏳ Pendências e responsáveis</div>${totalPend ? `<span style="font-size:11px;background:#FFF4DE;color:#8A6A16;font-weight:800;padding:3px 10px;border-radius:20px">${totalPend} em aberto</span>` : ''}</div>
    ${pendRows}
  </div>

  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px;margin-top:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87">🚚 Frota — carros de coleta</div><a href="/frota/aovivo" style="font-size:11.5px;font-weight:800;color:#0B7A66;text-decoration:none">acompanhar ao vivo →</a></div>
    ${frotaAviso}
    ${frotaRows}
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px">
    ${tile(d.total, 'Operações', 'no total registrado')}
    ${tile(d.toneladas.toString().replace('.', ',') + ' t', 'Processado', 'peso de entrada')}
    ${tile(d.aguardando, 'A validar', 'na fila da Engenharia', d.aguardando ? '#8A6A16' : TEAL)}
    ${tile(d.vencidas.length, 'Licenças vencidas', 'destinos', d.vencidas.length ? '#B23A2E' : VERDE)}
  </div>

  <div style="display:grid;grid-template-columns:1.3fr .7fr;gap:14px;margin-top:14px" class="g2">
    <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:14px">Pipeline — operações por etapa</div>
      ${barras}
    </div>
    <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:14px">Volume no mês</div>
      <div style="font-size:34px;font-weight:800;color:${TEAL};line-height:1">${d.mesAtual}</div>
      <div style="font-size:12px;color:${tendCor};font-weight:700;margin-top:8px">${esc(tend)}</div>
      <div style="font-size:11px;color:#8fa39f;margin-top:4px">vs. mês anterior (${d.mesAnterior})</div>
      <div style="border-top:1px solid #EEF1F0;margin-top:16px;padding-top:14px">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span style="color:#4F6469">Concluídas</span><b style="color:${VERDE}">${d.concluidas}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:12.5px"><span style="color:#4F6469">Em andamento</span><b>${d.emAndamento}</b></div>
      </div>
    </div>
  </div>

  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px;margin-top:14px">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:12px">Alertas que pedem atenção</div>
    <div style="font-size:13px;line-height:1.9">${alertasHtml}</div>
  </div>

  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:16px 18px;margin-top:14px">
    <div style="font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:10px">Ferramentas — base migrada do Ploomes</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="/diretoria/migrar-ploomes" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#00333B;border:1px solid #cfe0dd;border-radius:10px;padding:9px 13px;background:#F7FAF9">👥 Base de contatos</a>
      <a href="/diretoria/migrar-arquivos" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#00333B;border:1px solid #cfe0dd;border-radius:10px;padding:9px 13px;background:#F7FAF9">📎 Arquivos do Ploomes</a>
      <a href="/diretoria/migrar-negocios" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#00333B;border:1px solid #cfe0dd;border-radius:10px;padding:9px 13px;background:#F7FAF9">📋 Negócios / OS do Ploomes</a>
      <a href="/diretoria/rotaexata" style="text-decoration:none;font-size:12.5px;font-weight:800;color:#00333B;border:1px solid #cfe0dd;border-radius:10px;padding:9px 13px;background:#F7FAF9">🛰️ RotaExata (rastreamento)</a>
    </div>
  </div>

  <div style="font-size:10.5px;color:#9aa7a4;text-align:center;margin-top:16px">Painel da Diretoria — leads e OS vêm do histórico real do sistema; acessos são medidos a partir de 28/07/2026.</div>
</div>
<style>@media(max-width:680px){body [style*="grid-template-columns:repeat(4"]{grid-template-columns:repeat(2,1fr)!important}.g2{grid-template-columns:1fr!important}}</style>
</body></html>`;
}
