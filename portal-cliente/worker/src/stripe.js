// Integração com a Stripe (pagamentos) — escolhida pelo Marcio (2026-07-29) por
// suportar Pix no Brasil com API limpa. Usa Stripe Checkout (página hospedada da
// Stripe) com Pix + cartão. Quando pago, o webhook (assinado) libera o pedido.
//
// SEGURANÇA: a chave secreta (STRIPE_SECRET_KEY = sk_live_…) e o segredo do
// webhook (STRIPE_WEBHOOK_SECRET = whsec_…) vivem SÓ no cofre do Cloudflare.
// Nunca são impressos nem expostos. A API da Stripe usa form-urlencoded.

const STRIPE_API = 'https://api.stripe.com/v1';

export const stripeConfigurado = (env) => !!env.STRIPE_SECRET_KEY;

// Cria uma sessão de Checkout (Pix + cartão) e devolve a URL hospedada da Stripe.
export async function criarCheckoutStripe({ valor, descricao, externalReference, baseUrl, backPath, metodos, clienteEmail }, env) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('sem_stripe_key');
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const caminho = (backPath || '/painel').replace(/^\/?/, '/');
  const centavos = Math.round(Number(valor) * 100);
  const mm = (Array.isArray(metodos) && metodos.length) ? metodos : ['card', 'pix'];
  // Monta os parâmetros do Checkout. `comBoleto` liga o vencimento do boleto (10 DDL),
  // que é uma OPÇÃO extra — se a Stripe recusar só essa opção, refazemos sem ela.
  const montar = (comBoleto) => {
    const p = new URLSearchParams();
    p.set('mode', 'payment');
    p.set('success_url', `${base}${caminho}?stripe={CHECKOUT_SESSION_ID}`);
    p.set('cancel_url', `${base}${caminho}?stripe_cancel=1`);
    p.set('client_reference_id', externalReference);
    p.set('metadata[ref]', externalReference);
    p.set('line_items[0][quantity]', '1');
    p.set('line_items[0][price_data][currency]', 'brl');
    p.set('line_items[0][price_data][unit_amount]', String(centavos));
    p.set('line_items[0][price_data][product_data][name]', String(descricao || 'Cobrança Ecobraz').slice(0, 250));
    mm.forEach((m, i) => p.set(`payment_method_types[${i}]`, m));
    if (comBoleto && mm.includes('boleto')) {
      const diasBoleto = Math.min(60, Math.max(0, Math.floor(Number(env.BOLETO_EXPIRES_DAYS) || 10)));
      p.set('payment_method_options[boleto][expires_after_days]', String(diasBoleto));
    }
    // O campo de e-mail do cliente pode ter VÁRIOS e-mails (ex.: "a@x.com, b@y.com").
    // A Stripe recusa isso. Usa só o PRIMEIRO e-mail válido; se não houver, omite.
    if (clienteEmail) {
      const em = String(clienteEmail).split(/[,;\s]+/).map((s) => s.trim()).find((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
      if (em) p.set('customer_email', em.slice(0, 200));
    }
    return p;
  };
  const enviar = async (p) => {
    const r = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: p.toString(),
    });
    const txt = await r.text();
    let d = {}; try { d = JSON.parse(txt); } catch { /* não-JSON */ }
    return { r, d };
  };
  // 1ª tentativa COM o vencimento do boleto; se a Stripe recusar por causa dessa opção,
  // registra o motivo (D1, para eu corrigir) e refaz SEM ela — o link nunca deixa de sair.
  let { r, d } = await enviar(montar(true));
  if (!r.ok && mm.includes('boleto')) {
    const motivo = (d && d.error && (d.error.message || d.error.code)) || `HTTP ${r.status}`;
    try {
      if (env.DB_PLOOMES) {
        await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
        await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)').bind('stripe-boleto-opt', new Date().toISOString(), String(motivo).slice(0, 500)).run();
      }
    } catch { /* diagnóstico é best-effort */ }
    ({ r, d } = await enviar(montar(false)));
  }
  if (!r.ok) {
    const msg = (d && d.error && (d.error.message || d.error.code)) || `HTTP ${r.status}`;
    const e = new Error('stripe_' + r.status + ': ' + String(msg).slice(0, 180));
    e.detalhe = String(msg).slice(0, 220); e.stripeStatus = r.status;
    throw e;
  }
  return { id: d.id, url: d.url };
}

// Confere o status REAL de uma sessão pela API (fonte da verdade, não só o webhook).
export async function consultarCheckoutStripe(sessionId, env) {
  const key = env.STRIPE_SECRET_KEY;
  if (!key || !sessionId) return null;
  const r = await fetch(`${STRIPE_API}/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { authorization: `Bearer ${key}` } });
  if (!r.ok) return null;
  try {
    const d = await r.json();
    return {
      id: d.id, pago: d.payment_status === 'paid', status: d.payment_status,
      ref: d.client_reference_id || (d.metadata && d.metadata.ref) || '',
      valor: (Number(d.amount_total) || 0) / 100,
      email: (d.customer_details && d.customer_details.email) || '',
      paymentIntent: d.payment_intent || '',
    };
  } catch { return null; }
}

// Verifica a assinatura do webhook da Stripe (header Stripe-Signature) via HMAC.
// Devolve { evento, verificado }. Sem STRIPE_WEBHOOK_SECRET, verificado=false
// (o chamador então confirma pela API antes de confiar).
export async function verificarEventoStripe(rawBody, assinatura, env) {
  let evento = null; try { evento = JSON.parse(rawBody); } catch { /* corpo inválido */ }
  const secret = env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret || !assinatura) return { evento, verificado: false };
  try {
    const partes = Object.fromEntries(String(assinatura).split(',').map((kv) => kv.split('=')));
    const t = partes.t, v1 = partes.v1;
    if (!t || !v1) return { evento, verificado: false };
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', k, enc.encode(`${t}.${rawBody}`));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    // Comparação de tamanho fixo.
    let ok = hex.length === v1.length; for (let i = 0; i < hex.length && i < v1.length; i++) ok = ok && hex[i] === v1[i];
    return { evento, verificado: ok };
  } catch { return { evento, verificado: false }; }
}

// Diagnóstico: a conta Stripe aceita Pix? (tenta criar uma sessão só-Pix de teste).
// Não cobra nada — se a Stripe aceitar a criação, o Pix está disponível.
export async function stripeTemPix(env, baseUrl) {
  try {
    const s = await criarCheckoutStripe({ valor: 1, descricao: 'Verificação Pix', externalReference: 'probe-pix', baseUrl, backPath: '/diretoria', metodos: ['pix'] }, env);
    return { ok: true, temPix: !!s.url };
  } catch (e) { return { ok: false, temPix: false, detalhe: (e && e.detalhe) || String(e && e.message || e).slice(0, 200) }; }
}
