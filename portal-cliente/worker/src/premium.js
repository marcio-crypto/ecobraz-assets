// Segmentação de clientes: Premium / Plus / Tradicional (pedido do Marcio, 2026-07-29).
// Desenho aprovado: porte AUTOMÁTICO pelo volume real de coletas + SELO MANUAL
// (a equipe crava e sobrepõe o automático). Sem faturamento (não é dado público).
//
// Armazenamento: KV `segmento:{doc}` guarda só o override manual. O automático é
// calculado na hora a partir do índice de OS (nº de coletas do cliente). Chaveado
// pelo documento (CNPJ/CPF só dígitos) — funciona para cliente D1 ou KV, PF ou PJ.

export const SEGMENTOS = { premium: 'Premium', plus: 'Plus', tradicional: 'Tradicional' };
const soDoc = (s) => String(s || '').replace(/\D/g, '');

export async function segmentoManual(env, doc) {
  const d = soDoc(doc);
  if (!env.PORTAL_KV || !d) return '';
  try { const v = await env.PORTAL_KV.get(`segmento:${d}`); return SEGMENTOS[v] ? v : ''; } catch { return ''; }
}
export async function definirSegmento(env, doc, seg) {
  const d = soDoc(doc);
  if (!env.PORTAL_KV || !d) return false;
  try {
    if (seg && SEGMENTOS[seg]) await env.PORTAL_KV.put(`segmento:${d}`, seg);
    else await env.PORTAL_KV.delete(`segmento:${d}`); // vazio = volta ao automático
    return true;
  } catch { return false; }
}

// Nº de coletas do cliente (índice de OS). Barato: 1 leitura + filtro.
export async function estatisticasCliente(env, doc) {
  const d = soDoc(doc);
  const out = { coletas: 0 };
  if (!env.PORTAL_KV || !d) return out;
  try {
    const raw = await env.PORTAL_KV.get('os:index');
    if (raw) { const idx = JSON.parse(raw); out.coletas = idx.filter((o) => soDoc(o.clienteDoc) === d && o.status !== 'cancelada').length; }
  } catch { /* segue com 0 */ }
  return out;
}

// Faixas automáticas (ajustáveis por env). São um ponto de partida honesto: quando
// a base de coletas crescer, dá para calibrar por percentil de verdade.
export function segmentoAuto(stats, env) {
  const c = (stats && stats.coletas) || 0;
  const pMin = Math.max(1, Number(env && env.SEG_PREMIUM_MIN) || 12);
  const plMin = Math.max(1, Number(env && env.SEG_PLUS_MIN) || 4);
  if (c >= pMin) return 'premium';
  if (c >= plMin) return 'plus';
  return 'tradicional';
}

// ---------------------------------------------------------------------------
// FLUXO DE VENDAS (só para o dono, marcio@ecobraz.org.br). Lê os pedidos de
// pagamento (KV pedido:*) e resume: vendas concretizadas (pagas) hoje / 7d / 30d
// e as NÃO concretizadas no mês (geradas mas não pagas). Valores em reais.
// Direto do KV (sem índice dedicado): honesto para o volume atual; se um dia a
// base crescer muito, dá para trocar por um índice de vendas.
export async function fluxoDeVendas(env) {
  const out = { dia: 0, semana: 0, mes: 0, naoConcretizadasValor: 0, naoConcretizadasQtd: 0, lidos: 0, truncado: false, porProduto: {} };
  if (!env.PORTAL_KV) return out;
  const keys = [];
  try {
    let cursor, guard = 0;
    do {
      const r = await env.PORTAL_KV.list({ prefix: 'pedido:', cursor, limit: 1000 });
      keys.push(...(r.keys || []));
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor && ++guard < 3);
    if (keys.length > 800) out.truncado = true;
  } catch { return out; }
  const bras = new Date(Date.now() - 3 * 3600e3);
  const hoje = bras.toISOString().slice(0, 10);
  const ini7 = new Date(bras.getTime() - 7 * 86400e3).toISOString().slice(0, 10);
  const ini30 = new Date(bras.getTime() - 30 * 86400e3).toISOString().slice(0, 10);
  const mesAtual = bras.toISOString().slice(0, 7);
  const dataDe = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) { const n = Number(v); const d = new Date(n < 1e12 ? n * 1000 : n); return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10); }
    return String(v).slice(0, 10);
  };
  for (const k of keys.slice(0, 800)) {
    let ped; try { ped = JSON.parse((await env.PORTAL_KV.get(k.name)) || '{}'); } catch { continue; }
    if (ped.produto === 'teste') continue; // pagamentos de teste não contam como venda
    out.lidos++;
    const valor = Number(ped.valor) || 0;
    const prod = ped.produto || 'outro';
    if (ped.status === 'pago') {
      const dp = dataDe(ped.pagoEm || ped.criadoEm);
      if (dp && dp === hoje) out.dia += valor;
      if (dp && dp >= ini7) out.semana += valor;
      if (dp && dp >= ini30) { out.mes += valor; out.porProduto[prod] = (out.porProduto[prod] || 0) + valor; }
    } else {
      const dc = dataDe(ped.criadoEm);
      if (dc && dc.slice(0, 7) === mesAtual) { out.naoConcretizadasValor += valor; out.naoConcretizadasQtd++; }
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  out.dia = r2(out.dia); out.semana = r2(out.semana); out.mes = r2(out.mes); out.naoConcretizadasValor = r2(out.naoConcretizadasValor);
  return out;
}

// ---------------------------------------------------------------------------
// LOG DE PAGAMENTOS (diretoria): últimos pedidos (KV pedido:*) com o status
// REAL que o sistema tem — pago (confirmado) ou pendente. Prova visível de que
// o cartão (Stripe) confirma sozinho e o Pix estático fica pendente até a baixa.
export async function ultimosPedidos(env, limite = 40) {
  const out = { itens: [], lidos: 0, truncado: false };
  if (!env.PORTAL_KV) return out;
  const keys = [];
  try {
    let cursor, guard = 0;
    do {
      const r = await env.PORTAL_KV.list({ prefix: 'pedido:', cursor, limit: 1000 });
      keys.push(...(r.keys || []));
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor && ++guard < 5);
  } catch { return out; }
  const alvo = keys.slice(0, 300);
  if (keys.length > 300) out.truncado = true;
  for (const k of alvo) {
    let ped; try { ped = JSON.parse((await env.PORTAL_KV.get(k.name)) || '{}'); } catch { continue; }
    out.lidos++;
    out.itens.push({
      ref: k.name.replace(/^pedido:/, ''),
      produto: ped.produto || 'outro',
      gateway: ped.gateway || (ped.pixId ? 'mercadopago' : (ped.sessionId ? 'stripe' : '—')),
      valor: Number(ped.valor) || 0,
      status: ped.status || 'pendente',
      criadoEm: ped.criadoEm || 0,
      pagoEm: ped.pagoEm || 0,
    });
  }
  out.itens.sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
  out.itens = out.itens.slice(0, limite);
  return out;
}

export function paginaPagamentos(dados) {
  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
  const fmt = (v) => { const n = Number(v); if (!n) return '—'; const ms = n < 1e12 ? n * 1000 : n; try { return new Date(ms - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); } catch { return '—'; } };
  const linhas = (dados.itens || []).map((p) => {
    const pago = p.status === 'pago';
    const cor = pago ? '#1d8a4e' : (p.status === 'cancelada' ? '#b23' : '#b8860b');
    const rot = pago ? '✅ pago' : (p.status === 'cancelada' ? 'cancelada' : '⏳ pendente');
    return `<tr><td>${fmt(p.criadoEm)}</td><td>${e(p.produto)}</td><td>${e(p.gateway)}</td><td style="text-align:right">${brl(p.valor)}</td><td style="color:${cor};font-weight:700">${rot}</td></tr>`;
  }).join('');
  const vazio = !(dados.itens && dados.itens.length);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Pagamentos — Ecobraz</title><link rel="icon" href="/assets/logo.png">
<style>
  *{box-sizing:border-box} body{margin:0;font-family:'Montserrat',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F7F6;color:#173A38;padding:24px 14px}
  .wrap{max-width:760px;margin:0 auto} .logo{width:130px;display:block;margin:0 auto 16px}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(11,91,102,.08);padding:20px}
  h1{color:#0B5B66;font-size:20px;margin:0 0 4px;text-align:center} .sub{color:#5b716e;font-size:13px;text-align:center;margin:0 0 18px}
  table{width:100%;border-collapse:collapse;font-size:13px} th,td{padding:9px 8px;border-bottom:1px solid #eef2f1;text-align:left}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8fa39f}
  .voltar{display:block;text-align:center;margin-top:18px;color:#0B5B66;font-weight:700;text-decoration:none;font-size:13px}
  .obs{font-size:12px;color:#7a6a3a;background:#FBF6E6;border:1px solid #efe1b5;border-radius:10px;padding:10px 12px;margin-top:14px;line-height:1.5}
  .vazio{text-align:center;color:#8fa39f;padding:24px}
</style></head><body>
<div class="wrap">
  <img class="logo" src="/assets/logo.png" alt="Ecobraz">
  <div class="card">
    <h1>Pagamentos registrados</h1>
    <p class="sub">Status real que o sistema tem de cada pedido${dados.truncado ? ' (mostrando os mais recentes)' : ''}.</p>
    ${vazio ? '<div class="vazio">Nenhum pedido registrado ainda.</div>' : `<div style="overflow-x:auto"><table><thead><tr><th>Quando</th><th>Produto</th><th>Forma</th><th>Valor</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table></div>`}
    <div class="obs">💡 <b>Cartão (Stripe)</b> fica ✅ pago automaticamente. O <b>Pix "copia e cola"</b> de hoje fica ⏳ pendente até alguém dar a baixa — o código estático não avisa o sistema. Para o Pix ficar automático, é preciso um Pix com API (gateway).</div>
    <a class="voltar" href="/diretoria">← Voltar</a>
  </div>
</div></body></html>`;
}

// Segmento EFETIVO = manual (se houver) senão automático.
export async function segmentoDoCliente(env, doc) {
  const manual = await segmentoManual(env, doc);
  const stats = await estatisticasCliente(env, doc);
  const auto = segmentoAuto(stats, env);
  const efetivo = manual || auto;
  return { efetivo, manual, auto, stats, rotulo: SEGMENTOS[efetivo] || 'Tradicional', prioritario: efetivo === 'premium' || efetivo === 'plus' };
}
