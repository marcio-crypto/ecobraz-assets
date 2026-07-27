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

export function paginaPainelDiretoria(diretor, d) {
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
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Painel da Diretoria — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div style="background:#00333B;padding:16px 20px"><div style="max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <div><span style="color:#fff;font-size:16px;font-weight:800">Painel da Diretoria</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">Ecobraz · visão macro</div></div>
  <form method="post" action="/api/diretoria/sair" style="margin:0"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700">Sair</button></form>
</div></div>
<div style="max-width:900px;margin:0 auto;padding:20px 18px 48px">

  <a href="/diretoria/prevencao" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#062f36;border:1px solid #12525d;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#eaf5f3">
    <div><div style="font-size:14px;font-weight:800">🛡️ Prevenção de perdas</div><div style="font-size:12px;color:#9FC6C1;margin-top:2px">Reconciliação por peso, valor estimado e conferência das fotos por IA.</div></div>
    <span style="font-size:12px;font-weight:800;color:#92C430">Abrir →</span>
  </a>

  <a href="/diretoria/migrar-ploomes" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#10262B">
    <div><div style="font-size:14px;font-weight:800">👥 Base de contatos</div><div style="font-size:12px;color:#6b7c79;margin-top:2px">Empresas e pessoas migradas do Ploomes. Busque e navegue entre empresa ↔ contatos ligados.</div></div>
    <span style="font-size:12px;font-weight:800;color:#0B7A66">Abrir →</span>
  </a>

  <a href="/diretoria/migrar-arquivos" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:12px;color:#10262B">
    <div><div style="font-size:14px;font-weight:800">📎 Arquivos do Ploomes</div><div style="font-size:12px;color:#6b7c79;margin-top:2px">Traz NF, certificados, MTR e propostas do Ploomes para o depósito próprio (R2), amarrados à coleta.</div></div>
    <span style="font-size:12px;font-weight:800;color:#0B7A66">Abrir →</span>
  </a>

  <a href="/diretoria/migrar-negocios" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:16px;color:#10262B">
    <div><div style="font-size:14px;font-weight:800">📋 Negócios / OS do Ploomes</div><div style="font-size:12px;color:#6b7c79;margin-top:2px">Traz os negócios (ordens de serviço/coletas) do Ploomes para o banco próprio, com o registro completo e a ligação ao cliente. Essencial antes de desligar o Ploomes.</div></div>
    <span style="font-size:12px;font-weight:800;color:#0B7A66">Abrir →</span>
  </a>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
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

  <div style="font-size:10.5px;color:#9aa7a4;text-align:center;margin-top:16px">Painel v1 — dados do módulo operacional. Volume de coletas (Ploomes), qualidade por pessoa e pegada de carbono entram nas próximas fatias.</div>
</div>
<style>@media(max-width:680px){body [style*="grid-template-columns:repeat(4"]{grid-template-columns:repeat(2,1fr)!important}.g2{grid-template-columns:1fr!important}}</style>
</body></html>`;
}
