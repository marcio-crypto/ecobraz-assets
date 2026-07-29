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

// Segmento EFETIVO = manual (se houver) senão automático.
export async function segmentoDoCliente(env, doc) {
  const manual = await segmentoManual(env, doc);
  const stats = await estatisticasCliente(env, doc);
  const auto = segmentoAuto(stats, env);
  const efetivo = manual || auto;
  return { efetivo, manual, auto, stats, rotulo: SEGMENTOS[efetivo] || 'Tradicional', prioritario: efetivo === 'premium' || efetivo === 'plus' };
}
