// Integração com o Mercado Pago (Checkout Pro).
//  - criarPreferencia: gera a cobrança e devolve o link de pagamento (init_point).
//  - consultarPagamento: confere o status REAL de um pagamento pela API (não confia
//    só no que o webhook manda — busca a fonte da verdade com a nossa chave).
//
// SEGURANÇA: a chave (MERCADOPAGO_ACCESS_TOKEN) vive só na Cloudflare (Secret).
// Nunca é impressa nem exposta.

const MP_API = 'https://api.mercadopago.com';

export async function criarPreferencia({ valor, descricao, externalReference, baseUrl, backPath }, env) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('sem_token_mp');
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const caminho = (backPath || '/calculo-detalhado').replace(/^\/?/, '/');
  const retorno = `${base}${caminho}?pedido=${encodeURIComponent(externalReference)}`;
  const body = {
    items: [{
      title: descricao || 'Cálculo detalhado de pegada de carbono — GHG Protocol',
      quantity: 1,
      unit_price: Number(valor),
      currency_id: 'BRL',
    }],
    external_reference: externalReference,
    notification_url: `${base}/api/mp/webhook`,
    back_urls: { success: retorno, pending: retorno, failure: retorno },
    auto_return: 'approved',
  };
  const r = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`mp_pref_${r.status}:${txt.slice(0, 160)}`);
  const data = JSON.parse(txt);
  // init_point = checkout real; sandbox_init_point = ambiente de teste.
  return { id: data.id, initPoint: data.init_point || data.sandbox_init_point };
}

// PIX NATIVO: cria uma cobrança Pix direta (sem a tela do Checkout Pro) e devolve
// o QR Code (imagem) + o "copia e cola". Pedido do Marcio (2026-07-29): eliminar a
// fricção de "entrar na conta". Quando pago, o webhook padrão (notification_url) faz
// a baixa igual aos demais. Se o Pix NÃO estiver habilitado na conta, o Mercado Pago
// devolve um erro claro — que a gente mostra para saber o que ativar.
export async function criarPixDireto({ valor, descricao, externalReference, payerEmail, baseUrl }, env) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('sem_token_mp');
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const email = String(payerEmail || '').trim() || 'pagador+ecobraz@ecobraz.org.br';
  const body = {
    transaction_amount: Number(valor),
    description: descricao || 'Cobrança Ecobraz',
    payment_method_id: 'pix',
    external_reference: externalReference,
    notification_url: `${base}/api/mp/webhook`,
    payer: { email },
  };
  const r = await fetch(`${MP_API}/v1/payments`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'X-Idempotency-Key': (crypto.randomUUID ? crypto.randomUUID() : String(externalReference)) },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let d = {}; try { d = JSON.parse(txt); } catch { /* não-JSON */ }
  if (!r.ok) {
    // Erro do MP: mensagem + causa (ex.: Pix não habilitado). Nunca vaza token.
    const causa = (d && (d.message || (Array.isArray(d.cause) && d.cause[0] && (d.cause[0].description || d.cause[0].code)))) || `HTTP ${r.status}`;
    const err = new Error('mp_pix_' + r.status + ': ' + String(causa).slice(0, 160));
    err.mpStatus = r.status; err.mpDetalhe = String(causa).slice(0, 200);
    throw err;
  }
  const tx = (d.point_of_interaction && d.point_of_interaction.transaction_data) || {};
  return {
    id: d.id, status: d.status, // 'pending' até pagar
    copiaECola: tx.qr_code || '',
    qrCodeBase64: tx.qr_code_base64 || '', // PNG em base64 (sem prefixo data:)
    ticketUrl: tx.ticket_url || '',
    expira: d.date_of_expiration || '',
  };
}

// Diagnóstico: lista as formas de pagamento que a CONTA aceita (GET
// /v1/payment_methods). Responde de vez se o Pix está habilitado no checkout.
export async function consultarMeiosPagamento(env) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) return { ok: false, erro: 'sem_token' };
  try {
    const r = await fetch(`${MP_API}/v1/payment_methods`, { headers: { authorization: `Bearer ${token}` } });
    const txt = await r.text();
    if (!r.ok) return { ok: false, status: r.status, erro: txt.slice(0, 200) };
    const lista = JSON.parse(txt);
    const ativos = (Array.isArray(lista) ? lista : []).filter((m) => m && m.status === 'active');
    const nomes = ativos.map((m) => `${m.id} (${m.name || m.payment_type_id})`);
    const pix = ativos.find((m) => m.id === 'pix' || m.payment_type_id === 'bank_transfer');
    return { ok: true, temPix: !!pix, tipos: [...new Set(ativos.map((m) => m.payment_type_id))], nomes: nomes.slice(0, 40), total: ativos.length };
  } catch (e) { return { ok: false, erro: String(e && e.message || e).slice(0, 160) }; }
}

export async function consultarPagamento(paymentId, env) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token || !paymentId) return null;
  const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  try {
    const d = await r.json();
    return { id: d.id, status: d.status, externalReference: d.external_reference, valor: d.transaction_amount, payerEmail: (d.payer && d.payer.email) || '' };
  } catch { return null; }
}
