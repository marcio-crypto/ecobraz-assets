// Integração com o Mercado Pago (Checkout Pro).
//  - criarPreferencia: gera a cobrança e devolve o link de pagamento (init_point).
//  - consultarPagamento: confere o status REAL de um pagamento pela API (não confia
//    só no que o webhook manda — busca a fonte da verdade com a nossa chave).
//
// SEGURANÇA: a chave (MERCADOPAGO_ACCESS_TOKEN) vive só na Cloudflare (Secret).
// Nunca é impressa nem exposta.

const MP_API = 'https://api.mercadopago.com';

export async function criarPreferencia({ valor, descricao, externalReference, baseUrl }, env) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error('sem_token_mp');
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const retorno = `${base}/calculo-detalhado?pedido=${encodeURIComponent(externalReference)}`;
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

export async function consultarPagamento(paymentId, env) {
  const token = env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token || !paymentId) return null;
  const r = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  try {
    const d = await r.json();
    return { id: d.id, status: d.status, externalReference: d.external_reference, valor: d.transaction_amount };
  } catch { return null; }
}
