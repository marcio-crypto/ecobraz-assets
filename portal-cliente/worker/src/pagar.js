// Tela de ESCOLHA de pagamento (pedido do Marcio 18/08, logo após homologar o
// Pix): o cliente escolhe ⚡ Pix (Mercado Pago nativo, aprovação na hora),
// 💳 Cartão ou 🧾 Boleto (Stripe). Os fluxos de cobrança continuam intactos —
// eles só passam a entregar o link /pagar?pedido=… em vez de ir direto à Stripe.
// Vale RETROATIVO: qualquer pedido pendente antigo ganha essa tela de graça.
import { criarPixDireto, consultarPagamento } from './mercadopago.js';
import { criarCheckoutStripe, stripeConfigurado } from './stripe.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const brl = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const refLimpa = (v) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);

// Substituto 1-para-1 do criarCheckoutStripe nos fluxos: devolve { url } apontando
// para a tela de escolha e guarda a descrição/e-mail num registro auxiliar
// (pagar:{ref}) para a tela usar depois. Nunca falha por causa do gateway.
export async function criarPagamentoEscolha({ valor, descricao, externalReference, baseUrl, clienteEmail }, env) {
  const ref = refLimpa(externalReference);
  const base = String(baseUrl || '').replace(/\/+$/, '');
  try {
    if (env.PORTAL_KV) await env.PORTAL_KV.put(`pagar:${ref}`, JSON.stringify({ descricao: String(descricao || '').slice(0, 250), clienteEmail: String(clienteEmail || '').slice(0, 200), valor: Number(valor) || 0 }), { expirationTtl: 90 * 86400 });
  } catch { /* a tela deriva a descrição do próprio pedido */ }
  return { id: 'escolha-' + ref, url: `${base}/pagar?pedido=${encodeURIComponent(ref)}` };
}

export async function lerAuxPagar(env, ref) {
  try { if (env.PORTAL_KV) { const raw = await env.PORTAL_KV.get(`pagar:${refLimpa(ref)}`); if (raw) return JSON.parse(raw); } } catch { /* segue */ }
  return null;
}

// Descrição amigável quando o registro auxiliar não existe (pedidos antigos).
export function descricaoDoPedido(ped, aux) {
  if (aux && aux.descricao) return aux.descricao;
  const p = ped || {};
  if (p.produto === 'coleta') return p.expressa ? 'Coleta Expressa Ecobraz — até 24h' : 'Taxa de coleta Ecobraz';
  if (p.produto === 'oscobranca') return `Coleta ${p.numero || ''} — Ecobraz`.trim();
  if (p.produto === 'adote') return `Adote um Bairro${p.kg ? ` — ${p.kg} kg` : ''}${(p.tipo === 'recorrente' || p.evento === 'recarga') ? ' (renovação)' : ''}`;
  if (p.produto === 'carbono') return 'Inventário de carbono — Ecobraz';
  if (p.produto === 'esg') return 'Relatório ESG — Ecobraz';
  return 'Cobrança Ecobraz';
}

const CASCA = (titulo, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} — Ecobraz</title>
<style>body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}.wrap{max-width:460px;margin:0 auto;padding:26px 18px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:24px;text-align:center}
input{width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:11px;font-size:12px;margin-top:8px}</style></head>
<body><div class="wrap">
  <div style="text-align:center;margin-bottom:14px"><span style="font-size:24px;font-weight:800;color:#00333B">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">pagamento</span></div>
  ${corpo}
  <p style="text-align:center;font-size:11px;color:#9aa7a4;margin-top:16px">Pagamento processado por Mercado Pago e Stripe. A Ecobraz não vê os dados do seu cartão.</p>
</div></body></html>`;

// Tela de escolha: Pix em destaque (aprovação na hora), cartão e boleto.
export function paginaEscolherPagamento({ ref, valor, descricao, pixDisponivel, cartaoDisponivel }) {
  const btn = (href, cor, corTxt, titulo, sub) => `<a href="${esc(href)}" style="display:block;background:${cor};color:${corTxt};text-decoration:none;border-radius:14px;padding:16px;margin-top:10px;text-align:center">
      <span style="display:block;font-size:16px;font-weight:800">${titulo}</span>
      <span style="display:block;font-size:11.5px;margin-top:3px;opacity:.85">${sub}</span>
    </a>`;
  const opcoes = [
    pixDisponivel ? btn(`/pagar/pix?pedido=${encodeURIComponent(ref)}`, '#92C430', '#10262B', '⚡ Pagar com Pix', 'QR Code na tela · aprovação na hora') : '',
    cartaoDisponivel ? btn(`/pagar/cartao?pedido=${encodeURIComponent(ref)}`, '#00333B', '#fff', '💳 Pagar com cartão', 'crédito · aprovação imediata') : '',
    cartaoDisponivel ? btn(`/pagar/boleto?pedido=${encodeURIComponent(ref)}`, '#EEF1F0', '#10262B', '🧾 Gerar boleto', 'compensa em 1 a 3 dias úteis') : '',
  ].join('');
  return CASCA('Pagamento', `<div class="card">
    <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7c8a87">Como você prefere pagar?</div>
    <h1 style="font-size:30px;margin:10px 0 2px">${esc(brl(valor))}</h1>
    <div style="font-size:13px;color:#4F6469;margin-bottom:14px">${esc(descricao)}</div>
    ${opcoes || '<div style="color:#a06a62;font-size:13px">Nenhuma forma de pagamento disponível agora — fale com a equipe.</div>'}
  </div>`);
}

// Tela do Pix para o CLIENTE: QR + copia e cola + confirmação automática.
export function paginaPixPagamento({ ref, valor, descricao, pix }) {
  const img = pix.qrCodeBase64 ? `<img src="data:image/png;base64,${esc(pix.qrCodeBase64)}" alt="QR Code Pix" style="width:230px;height:230px;border:1px solid #E4EBE9;border-radius:12px;background:#fff;padding:8px">` : '<div style="color:#8fa39f;font-size:13px">Use o código copia-e-cola abaixo.</div>';
  return CASCA('Pix', `<div class="card">
    <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0B7A66">⚡ Pix · aprovação na hora</div>
    <h1 style="font-size:26px;margin:8px 0 2px">${esc(brl(valor))}</h1>
    <div style="font-size:12.5px;color:#4F6469;margin-bottom:12px">${esc(descricao)}</div>
    <p style="font-size:13px;color:#4F6469;margin:0 0 14px">Abra o app do seu banco, escolha <b>Pix › Pagar com QR Code</b> — ou use o <b>copia e cola</b>.</p>
    ${img}
    <div style="margin-top:14px;text-align:left"><label style="font-size:11px;font-weight:800;color:#7c8a87">Pix copia e cola</label>
      <input id="cec" readonly value="${esc(pix.copiaECola)}" onclick="this.select()">
      <button style="display:block;width:100%;background:#EEF1F0;color:#10262B;border:none;border-radius:11px;padding:12px;font-size:14px;font-weight:800;cursor:pointer;margin-top:8px" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('cec').value);this.textContent='✓ Copiado!'">Copiar código</button>
    </div>
    <div id="st" style="margin-top:16px;font-size:14px;font-weight:800;color:#8A6A16">⏳ Aguardando pagamento…</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin-top:6px">A confirmação é automática — pode deixar esta tela aberta.</div>
    <a href="/pagar?pedido=${encodeURIComponent(ref)}" style="display:inline-block;margin-top:14px;font-size:12.5px;color:#0B5B66;font-weight:700;text-decoration:none">← outras formas de pagamento</a>
  </div>
<script>
var ref=${JSON.stringify(String(ref))};
var timer=setInterval(check,4000);
async function check(){
  try{ var r=await fetch('/api/pagar/pix-status?pedido='+encodeURIComponent(ref)); var d=await r.json();
    if(d.ok&&d.status==='pago'){ clearInterval(timer); var s=document.getElementById('st'); s.textContent='✅ Pagamento confirmado! Obrigado.'; s.style.color='#1E7A3D';
      setTimeout(function(){ location.href='/pagamento/ok?pedido='+encodeURIComponent(ref); }, 1600); }
  }catch(_){}
}
</script>`);
}

// Status do Pix para a tela do cliente: LÊ apenas (a baixa oficial é do webhook,
// que confere na API e credita cada produto — este endpoint nunca grava).
export async function statusPixPedido(env, ref) {
  const r = refLimpa(ref);
  if (!env.PORTAL_KV || !r) return { ok: false };
  let ped = null;
  try { const raw = await env.PORTAL_KV.get(`pedido:${r}`); ped = raw ? JSON.parse(raw) : null; } catch { ped = null; }
  if (!ped) return { ok: false };
  if (ped.status === 'pago') return { ok: true, status: 'pago' };
  if (ped.pixId) {
    try { const pg = await consultarPagamento(ped.pixId, env); if (pg && pg.status === 'approved') return { ok: true, status: 'pago' }; } catch { /* segue pendente */ }
  }
  return { ok: true, status: 'pendente' };
}

// Quem paga, para o banco: e-mail (obrigatório no MP), CPF/CNPJ e nome quando o
// pedido tem. O que o cliente digitar no formulário fica no pedido (ped vence o aux).
export function dadosPagadorDoPedido(ped, aux) {
  const p = ped || {};
  const email = String(p.clienteEmail || p.email || (aux && aux.clienteEmail) || '').trim();
  const doc = String(p.doc || p.documento || p.cnpj || p.cpf || '').replace(/\D/g, '');
  const nome = String(p.clienteNome || p.nome || '').trim();
  return { email, doc, nome };
}

// Cria o Pix para um pedido existente e grava o pixId nele (o webhook usa o
// external_reference; o pixId serve para a tela conferir o status). `extra` traz
// e-mail/CPF-CNPJ digitados na tela quando o pedido não tinha — e ficam salvos
// no pedido (mesmo se o MP falhar, para não pedir de novo).
export async function abrirPixDoPedido(env, ref, ped, aux, baseUrl, extra) {
  const descricao = descricaoDoPedido(ped, aux);
  if (extra && (extra.email || extra.doc)) {
    if (extra.email) ped.clienteEmail = String(extra.email).slice(0, 200);
    if (extra.doc && !String(ped.doc || '').trim()) ped.doc = String(extra.doc).replace(/\D/g, '').slice(0, 14);
    try { await env.PORTAL_KV.put(`pedido:${refLimpa(ref)}`, JSON.stringify(ped), { expirationTtl: 90 * 86400 }); } catch { /* segue */ }
  }
  const pagador = dadosPagadorDoPedido(ped, aux);
  const pix = await criarPixDireto({ valor: Number(ped.valor) || 0, descricao, externalReference: refLimpa(ref), payerEmail: pagador.email, payerDoc: pagador.doc, payerNome: pagador.nome, baseUrl }, env);
  try {
    ped.pixId = pix.id; ped.gateway = 'mercadopago';
    await env.PORTAL_KV.put(`pedido:${refLimpa(ref)}`, JSON.stringify(ped), { expirationTtl: 90 * 86400 });
  } catch { /* status ainda funciona pelo webhook */ }
  return { pix, descricao };
}

// Cria a sessão Stripe (cartão OU boleto) para um pedido existente.
export async function abrirStripeDoPedido(env, ref, ped, aux, baseUrl, metodo) {
  const descricao = descricaoDoPedido(ped, aux);
  const clienteEmail = (aux && aux.clienteEmail) || ped.clienteEmail || ped.email || '';
  const s = await criarCheckoutStripe({ valor: Number(ped.valor) || 0, descricao, externalReference: refLimpa(ref), baseUrl, backPath: '/pagamento/ok', clienteEmail, metodos: [metodo] }, env);
  try {
    ped.sessionId = s.id; ped.gateway = 'stripe';
    await env.PORTAL_KV.put(`pedido:${refLimpa(ref)}`, JSON.stringify(ped), { expirationTtl: 90 * 86400 });
  } catch { /* segue */ }
  return { s, descricao };
}

export const pagamentosDisponiveis = (env) => ({ pixDisponivel: !!env.MERCADOPAGO_ACCESS_TOKEN, cartaoDisponivel: stripeConfigurado(env) });

// Pedido antigo sem e-mail do cliente: o banco exige saber quem paga, então a
// tela pede antes de gerar o QR (e o pedido ganha dono de quebra).
export function paginaDadosPix({ ref, valor, descricao, erro }) {
  return CASCA('Pix — quem paga', `<div class="card" style="text-align:left">
    <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0B7A66;text-align:center">⚡ Pix · falta só um passo</div>
    <h1 style="font-size:26px;margin:8px 0 2px;text-align:center">${esc(brl(valor))}</h1>
    <div style="font-size:12.5px;color:#4F6469;margin-bottom:14px;text-align:center">${esc(descricao)}</div>
    <p style="font-size:13px;color:#4F6469;margin:0 0 6px">Para gerar o Pix, o banco precisa saber <b>quem paga</b>:</p>
    ${erro ? `<div style="background:#FBEFEA;border:1px solid #E8C9BE;border-radius:10px;padding:9px 11px;font-size:12.5px;color:#7A3B2E;margin-bottom:6px">${esc(erro)}</div>` : ''}
    <form method="post" action="/pagar/pix?pedido=${encodeURIComponent(ref)}">
      <label style="font-size:11px;font-weight:800;color:#7c8a87">Seu e-mail</label>
      <input name="email" type="email" required placeholder="voce@empresa.com.br" autocomplete="email">
      <label style="font-size:11px;font-weight:800;color:#7c8a87;display:block;margin-top:10px">CPF ou CNPJ (opcional, ajuda na aprovação)</label>
      <input name="doc" inputmode="numeric" placeholder="somente números" autocomplete="off">
      <button type="submit" style="display:block;width:100%;background:#92C430;color:#10262B;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;margin-top:14px">Gerar o Pix →</button>
    </form>
    <div style="font-size:11px;color:#9aa7a4;margin-top:10px">Usamos esses dados só para registrar o pagamento.</div>
    <div style="text-align:center"><a href="/pagar?pedido=${encodeURIComponent(ref)}" style="display:inline-block;margin-top:12px;font-size:12.5px;color:#0B5B66;font-weight:700;text-decoration:none">← outras formas de pagamento</a></div>
  </div>`);
}

// Tradução honesta dos erros do provedor para o cliente (sem tags HTML cruas).
export function traduzirErroPagamento(det) {
  const t = String(det || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/policy|unauthorized/i.test(t)) return 'O provedor do Pix recusou esta cobrança por uma regra de segurança da conta recebedora. Não é um problema com você nem com o seu banco.';
  if (/sem_email_pagador/.test(t)) return 'Faltou o e-mail de quem paga.';
  return t.slice(0, 180) || 'o provedor não informou o motivo';
}

// Uma forma falhou ≠ beco sem saída: a tela já oferece as outras na hora.
export function paginaPagamentoFalhou({ ref, metodo, motivo, pixDisponivel, cartaoDisponivel }) {
  const NOME = { pix: '⚡ Pix', cartao: '💳 cartão', boleto: '🧾 boleto' };
  const btn = (href, cor, corTxt, titulo, sub) => `<a href="${esc(href)}" style="display:block;background:${cor};color:${corTxt};text-decoration:none;border-radius:14px;padding:15px;margin-top:10px;text-align:center">
      <span style="display:block;font-size:15px;font-weight:800">${titulo}</span>
      <span style="display:block;font-size:11.5px;margin-top:3px;opacity:.85">${sub}</span>
    </a>`;
  const alternativas = [
    metodo !== 'pix' && pixDisponivel ? btn(`/pagar/pix?pedido=${encodeURIComponent(ref)}`, '#92C430', '#10262B', '⚡ Pagar com Pix', 'QR Code na tela · aprovação na hora') : '',
    metodo !== 'cartao' && cartaoDisponivel ? btn(`/pagar/cartao?pedido=${encodeURIComponent(ref)}`, '#00333B', '#fff', '💳 Pagar com cartão', 'crédito · aprovação imediata') : '',
    metodo !== 'boleto' && cartaoDisponivel ? btn(`/pagar/boleto?pedido=${encodeURIComponent(ref)}`, '#EEF1F0', '#10262B', '🧾 Gerar boleto', 'compensa em 1 a 3 dias úteis') : '',
  ].join('');
  return CASCA('Pagamento', `<div class="card">
    <h2 style="font-size:19px;margin:0 0 8px;color:#7A3B2E">O ${NOME[metodo] || metodo} falhou agora</h2>
    <p style="font-size:13px;color:#4F6469;margin:0">${esc(traduzirErroPagamento(motivo))}</p>
    ${alternativas ? `<p style="font-size:13px;color:#10262B;font-weight:700;margin:16px 0 2px">Você pode concluir por outra forma:</p>${alternativas}` : ''}
    <a href="/pagar?pedido=${encodeURIComponent(ref)}" style="display:inline-block;margin-top:14px;font-size:12.5px;color:#0B5B66;font-weight:700;text-decoration:none">← voltar e tentar de novo</a>
    <div style="font-size:10.5px;color:#b3bdba;margin-top:12px">detalhe técnico: ${esc(String(motivo || '').replace(/<[^>]*>/g, ' ').slice(0, 140))}</div>
  </div>`);
}
