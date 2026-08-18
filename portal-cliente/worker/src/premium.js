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
// Datas dos pedidos vêm em epoch (segundos/ms) ou ISO — normaliza para AAAA-MM-DD (Brasília).
const dataPedido = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) { const n = Number(v); const d = new Date(n < 1e12 ? n * 1000 : n); return new Date(d.getTime() - 3 * 3600e3).toISOString().slice(0, 10); }
  return String(v).slice(0, 10);
};

// O que é cada pedido, em linguagem de gente: cliente, assunto e link da OS quando houver.
// Honesto com o que cada produto GRAVA: carbono/ESG não guardam o nome do cliente
// no pedido — nesses cases o campo cliente sai vazio em vez de inventado.
const fmtDocPed = (d) => { const s = String(d || '').replace(/\D/g, ''); return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s; };
export function descreverPedido(ped) {
  const p = ped || {};
  const nome = String(p.clienteNome || p.clienteEmail || p.email || '').trim();
  const comDoc = p.doc ? `${nome ? nome + ' · ' : ''}${fmtDocPed(p.doc)}` : nome;
  if (p.produto === 'coleta') return { cliente: nome, sobre: `${p.expressa ? '⚡ Coleta EXPRESSA (taxa)' : 'Coleta pelo portal'}${p.itens ? ` · ${p.itens} item(ns)` : ''}${p.leadId ? ` · pedido ${p.leadId}` : ''}`, link: '' };
  if (p.produto === 'oscobranca') return { cliente: nome, sobre: `Cobrança da OS ${p.numero || p.osId || ''}`, link: p.osId ? `/coletas/os?id=${encodeURIComponent(p.osId)}` : '' };
  if (p.produto === 'adote') return { cliente: comDoc, sobre: `Adote um Bairro — ${p.kg ? p.kg + ' kg' : 'pacote'}${(p.tipo === 'recorrente' || p.evento === 'recarga') ? ' · recarga mensal' : ''}`, link: '' };
  if (p.produto === 'carbono') return { cliente: nome, sobre: `Calculadora de Carbono${p.nivel ? ' — nível ' + p.nivel : ''}${p.faixa ? ' · faixa ' + p.faixa : ''}`, link: '' };
  if (p.produto === 'esg') return { cliente: nome, sobre: `Relatório ESG${p.relatorio ? ' ' + p.relatorio : ''}${p.faixa ? ' · faixa ' + p.faixa : ''}`, link: '' };
  if (p.produto === 'teste') return { cliente: String(p.por || ''), sobre: 'Pagamento de TESTE (não conta como venda)', link: '' };
  return { cliente: nome, sobre: '', link: '' };
}

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
  const dataDe = dataPedido;
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
  // Marcadores do resgate (aviso à equipe já enviado): ref → data do aviso.
  const resgates = new Map();
  try {
    let cursor, guard = 0;
    do {
      const r = await env.PORTAL_KV.list({ prefix: 'resgate:avisado:', cursor, limit: 1000 });
      for (const k of (r.keys || [])) resgates.set(k.name.slice('resgate:avisado:'.length), '');
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor && ++guard < 5);
  } catch { /* segue sem os marcadores */ }
  for (const k of alvo) {
    let ped; try { ped = JSON.parse((await env.PORTAL_KV.get(k.name)) || '{}'); } catch { continue; }
    out.lidos++;
    const quem = descreverPedido(ped);
    const ref = k.name.replace(/^pedido:/, '');
    let resgateEm = '';
    if (resgates.has(ref)) { try { resgateEm = (await env.PORTAL_KV.get(`resgate:avisado:${ref}`)) || '1'; } catch { resgateEm = '1'; } }
    out.itens.push({
      ref,
      produto: ped.produto || 'outro',
      gateway: ped.gateway || (ped.pixId ? 'mercadopago' : (ped.sessionId ? 'stripe' : '—')),
      valor: Number(ped.valor) || 0,
      status: ped.status || 'pendente',
      criadoEm: ped.criadoEm || 0,
      pagoEm: ped.pagoEm || 0,
      cliente: quem.cliente, sobre: quem.sobre, link: quem.link,
      resgateEm,
    });
  }
  out.itens.sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
  // Os "gerados e não pagos" do MÊS — mesma regra do cartão da Diretoria
  // (fluxoDeVendas): sem os de teste, status diferente de pago, criados no mês.
  const mesAtual = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
  out.naoPagosMes = out.itens.filter((p) => p.produto !== 'teste' && p.status !== 'pago' && dataPedido(p.criadoEm).slice(0, 7) === mesAtual);
  out.naoPagosMesValor = Math.round(out.naoPagosMes.reduce((s, p) => s + (Number(p.valor) || 0), 0) * 100) / 100;
  out.itens = out.itens.slice(0, limite);
  return out;
}

// ---------------------------------------------------------------------------
// RESGATE DE VENDAS (pedido do Marcio 17/08): cliente gerou a cobrança e NÃO
// pagou em 7 dias → a equipe comercial (Débora) recebe UM e-mail por pedido
// para tentar reverter. Roda no cron diário das 08:00 (Brasília). O marcador
// resgate:avisado:{ref} garante que nunca repete. Best-effort: nunca derruba o cron.
export const RESGATE_DIAS = 7;
export async function avisoResgatePendentes(env) {
  const out = { ok: false, elegiveis: 0, avisados: 0, motivo: '' };
  if (!env.PORTAL_KV) { out.motivo = 'sem_kv'; return out; }
  if (!env.RESEND_API_KEY) { out.motivo = 'sem_chave_email'; return out; }
  const ped = await ultimosPedidos(env, 300);
  const corte = new Date(Date.now() - 3 * 3600e3 - RESGATE_DIAS * 86400e3).toISOString().slice(0, 10);
  const alvo = (ped.itens || []).filter((p) => p.produto !== 'teste' && p.status !== 'pago' && p.status !== 'cancelada'
    && !p.resgateEm && dataPedido(p.criadoEm) && dataPedido(p.criadoEm) <= corte);
  out.elegiveis = alvo.length;
  if (!alvo.length) { out.ok = true; return out; }
  // Destinatário: mesma regra do aviso de OS paga — a Débora, sobrescrevível por env.
  const listaEnv = env.COBRANCA_NOTIFY_EMAILS
    ? String(env.COBRANCA_NOTIFY_EMAILS).split(/[,;]+/).map((s) => s.split('|')[0].trim().toLowerCase()).filter(Boolean)
    : ['debora.villanova@ecobraz.org.br'];
  const dest = [...new Set(listaEnv)].filter((x) => /^\S+@\S+\.\S+$/.test(x)).slice(0, 25);
  if (!dest.length) { out.motivo = 'sem_destinatario'; return out; }
  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fmtD = (v) => { const d = dataPedido(v); return d ? d.split('-').reverse().join('/') : '—'; };
  const total = alvo.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const linhas = alvo.map((p) => `<div style="border:1px solid #F0E4C8;background:#FDFAF1;border-radius:10px;padding:11px 13px;margin-bottom:8px">
      <b style="font-size:15px">${brl(p.valor)}</b> · <b>${e(ROTULO_PRODUTO[p.produto] || p.produto)}</b>${p.sobre ? ' — ' + e(p.sobre) : ''}
      <span style="display:block;font-size:12.5px;color:#5b716e;margin-top:3px">👤 ${p.cliente ? e(p.cliente) : '<i>cliente não identificado no pedido</i>'} · gerado em ${e(fmtD(p.criadoEm))}</span>
      <span style="display:block;font-size:12px;margin-top:4px">🔗 Link de pagamento (Pix na hora, cartão ou boleto) para mandar ao cliente:<br><a href="https://sistema.ecobraz.org/pagar?pedido=${encodeURIComponent(p.ref)}" style="color:#0B5B66;font-weight:700;word-break:break-all">https://sistema.ecobraz.org/pagar?pedido=${e(p.ref)}</a></span>
      ${p.link ? `<a href="https://sistema.ecobraz.org${e(p.link)}" style="font-size:12px;color:#0B5B66;font-weight:700">Abrir a OS →</a>` : ''}
    </div>`).join('');
  const linhasTexto = alvo.map((p) => `- ${brl(p.valor)} · ${ROTULO_PRODUTO[p.produto] || p.produto}${p.sobre ? ' — ' + p.sobre : ''} · ${p.cliente || 'cliente não identificado'} · gerado em ${fmtD(p.criadoEm)}\n  Pagar (Pix/cartão/boleto): https://sistema.ecobraz.org/pagar?pedido=${p.ref}`).join('\n');
  const assunto = `⏰ ${alvo.length} cobrança(s) sem pagamento há ${RESGATE_DIAS}+ dias — vale retomar o contato`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#10262B">
    <div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#FFD46B;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">RESGATE DE VENDAS</span></div>
    <div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:22px">
      <p style="font-size:14px;line-height:1.6;margin:0 0 14px">Estes clientes <b>geraram a cobrança e não pagaram em ${RESGATE_DIAS} dias</b> — a intenção de compra existiu. Um contato agora pode reverter <b>${brl(total)}</b>:</p>
      ${linhas}
      <a href="https://sistema.ecobraz.org/diretoria/pagamentos" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:13px;text-align:center;font-weight:800;font-size:14px;margin:14px 0 6px">Ver todos os pedidos →</a>
      <p style="font-size:11px;color:#9aa7a4;margin:10px 0 0;line-height:1.5">Aviso automático do sistema (um por pedido, no dia em que completa ${RESGATE_DIAS} dias sem pagamento).</p>
    </div></div>`;
  const texto = `Cobranças geradas e não pagas há ${RESGATE_DIAS}+ dias (total ${brl(total)}):\n\n${linhasTexto}\n\nVer todos: https://sistema.ecobraz.org/diretoria/pagamentos\n\nAviso automático — um por pedido.`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: dest, subject: assunto, html, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) { out.motivo = 'resend_' + r.status; return out; }
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  for (const p of alvo) {
    try { await env.PORTAL_KV.put(`resgate:avisado:${p.ref}`, hoje, { expirationTtl: 120 * 86400 }); } catch { /* segue */ }
  }
  out.ok = true; out.avisados = alvo.length; out.para = dest.length;
  return out;
}

const ROTULO_PRODUTO = { coleta: 'Coleta', oscobranca: 'Cobrança de OS', adote: 'Adote um Bairro', carbono: 'Calculadora de Carbono', esg: 'Relatório ESG', teste: 'Teste', outro: 'Pedido' };
export function paginaPagamentos(dados, base) {
  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const b0 = String(base || 'https://sistema.ecobraz.org').replace(/\/+$/, '');
  const linkPagar = (p) => p.status !== 'pago' && p.status !== 'cancelada' ? ` · <button data-l="${e(b0)}/pagar?pedido=${encodeURIComponent(p.ref)}" onclick="copiarLink(this)" style="background:none;border:none;color:#0B5B66;font-weight:800;font-size:11px;cursor:pointer;padding:0">🔗 copiar link de pagamento (Pix/cartão/boleto)</button>` : '';
  const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fmt = (v) => { const n = Number(v); if (!n) return '—'; const ms = n < 1e12 ? n * 1000 : n; try { const s = new Date(ms - 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); return s.slice(8, 10) + '/' + s.slice(5, 7) + ' ' + s.slice(11); } catch { return '—'; } };
  const chip = (p) => p.status === 'pago' ? '<span style="color:#1d8a4e;font-weight:800">✅ pago</span>' : (p.status === 'cancelada' ? '<span style="color:#b23;font-weight:800">✖ cancelada</span>' : '<span style="color:#b8860b;font-weight:800">⏳ aguardando pagamento</span>');
  // Seção 1: os GERADOS E NÃO PAGOS do mês — a resposta ao "quais são os 7 pedidos?".
  const np = dados.naoPagosMes || [];
  const npHtml = np.map((p) => `<div style="border:1px solid #F0E4C8;background:#FDFAF1;border-radius:12px;padding:12px 14px;margin-bottom:9px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <b style="font-size:15px;color:#173A38">${brl(p.valor)}</b>
        <span style="font-size:12px">${chip(p)}</span>
      </div>
      <div style="font-size:13px;color:#173A38;margin-top:5px"><b>${e(ROTULO_PRODUTO[p.produto] || p.produto)}</b>${p.sobre ? ' — ' + e(p.sobre) : ''}</div>
      <div style="font-size:12.5px;color:#5b716e;margin-top:3px">👤 ${p.cliente ? e(p.cliente) : '<i>cliente não identificado no pedido</i>'}</div>
      <div style="font-size:11.5px;color:#8fa39f;margin-top:5px">gerado em ${fmt(p.criadoEm)} · forma: ${e(p.gateway)} · ref <code style="font-size:10px">${e(String(p.ref).slice(0, 26))}</code>${p.link ? ` · <a href="${e(p.link)}" style="color:#0B5B66;font-weight:700">abrir a OS →</a>` : ''}${linkPagar(p)}</div>
      ${p.resgateEm ? `<div style="font-size:11.5px;color:#0B5B66;font-weight:700;margin-top:4px">📣 Equipe avisada${/^\d{4}-\d{2}-\d{2}$/.test(p.resgateEm) ? ' em ' + e(p.resgateEm.split('-').reverse().join('/')) : ''} para tentar reverter</div>` : ''}
    </div>`).join('');
  const npTotal = Number(dados.naoPagosMesValor) || 0;
  const linhas = (dados.itens || []).map((p) => {
    return `<tr><td style="white-space:nowrap">${fmt(p.criadoEm)}</td><td><b>${e(ROTULO_PRODUTO[p.produto] || p.produto)}</b>${p.sobre ? `<span style="display:block;font-size:11px;color:#8fa39f">${e(p.sobre)}</span>` : ''}${p.cliente ? `<span style="display:block;font-size:11px;color:#5b716e">👤 ${e(p.cliente)}</span>` : ''}${p.link ? `<a href="${e(p.link)}" style="font-size:11px;color:#0B5B66;font-weight:700">abrir a OS →</a>` : ''}<span style="display:block">${linkPagar(p).replace(/^ · /, '')}</span></td><td>${e(p.gateway)}</td><td style="text-align:right;white-space:nowrap">${brl(p.valor)}</td><td style="font-size:12px">${chip(p)}</td></tr>`;
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
  ${np.length ? `<div class="card" style="margin-bottom:16px;border:1px solid #efe1b5">
    <h1 style="color:#8a6a16">⚠️ Gerados e NÃO pagos neste mês</h1>
    <p class="sub">As vendas que ainda não se concretizaram: <b>${np.length} pedido(s) · ${brl(npTotal)}</b> — o mesmo número do cartão da Diretoria.</p>
    ${npHtml}
    <div class="obs">O que significa "aguardando pagamento": o cliente <b>gerou a cobrança</b> (cartão, Pix ou link) e o pagamento <b>ainda não foi confirmado</b>. ⏰ <b>Automático:</b> quando um pedido completa ${RESGATE_DIAS} dias sem pagamento, a equipe comercial recebe <b>um</b> e-mail (no cron das 08:00) para tentar reverter — aqui aparece "📣 Equipe avisada". Pedidos pendentes <b>expiram sozinhos</b> do registro depois de um tempo; por isso a lista e o cartão cobrem o mês corrente.</div>
  </div>` : ''}
  <div class="card">
    <h1>Todos os pagamentos registrados</h1>
    <p class="sub">Status real que o sistema tem de cada pedido${dados.truncado ? ' (mostrando os mais recentes)' : ''}.</p>
    ${vazio ? '<div class="vazio">Nenhum pedido registrado ainda.</div>' : `<div style="overflow-x:auto"><table><thead><tr><th>Quando</th><th>Pedido</th><th>Forma</th><th>Valor</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table></div>`}
    <div class="obs">💡 <b>Cartão (Stripe)</b> fica ✅ pago automaticamente. O <b>Pix "copia e cola"</b> de hoje fica ⏳ pendente até alguém dar a baixa — o código estático não avisa o sistema. Para o Pix ficar automático, é preciso um Pix com API (gateway).</div>
    <a class="voltar" href="/diretoria">← Voltar</a>
  </div>
</div>
<script>function copiarLink(b){var v=b.dataset.l;(navigator.clipboard?navigator.clipboard.writeText(v):Promise.reject()).then(function(){b.textContent='✓ link copiado — mande ao cliente!';}).catch(function(){prompt('Copie o link:',v);});}</script>
</body></html>`;
}

// Segmento EFETIVO = manual (se houver) senão automático.
export async function segmentoDoCliente(env, doc) {
  const manual = await segmentoManual(env, doc);
  const stats = await estatisticasCliente(env, doc);
  const auto = segmentoAuto(stats, env);
  const efetivo = manual || auto;
  return { efetivo, manual, auto, stats, rotulo: SEGMENTOS[efetivo] || 'Tradicional', prioritario: efetivo === 'premium' || efetivo === 'plus' };
}
