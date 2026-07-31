// Monitoramento de falhas na jornada do cliente (pedido do Marcio, 2026-07-29):
// se algo quebrar — principalmente no processo de compra — a falha fica
// registrada MESMO que o cliente não reclame, para a equipe ver e corrigir.
//  - registrarFalha(env, onde, detalhe, extra): usada pelo SERVIDOR nos pontos
//    críticos (criação de cobrança, webhook de pagamento). Grava no D1
//    (diagnosticos, tipo 'falha-sistema') e no log do Worker.
//  - receberErroCliente: o NAVEGADOR do cliente reporta erros de JavaScript
//    (window.onerror / unhandledrejection / falha no envio) — tipo 'erro-cliente'.
//  - listarFalhas(env, limite): últimas falhas, para a tela de manutenção.
// PRIVACIDADE: nunca grava senha/segredo/chave; corta tamanhos; e-mail do
// cliente só entra se houver sessão (para conseguirmos socorrer a compra dele).

const criaTabela = (env) => env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();

export async function registrarFalha(env, onde, detalhe, extra) {
  // detalhe pode vir como objeto (ex.: safeError = {name, message}); serializa direito
  // em vez de virar "[object Object]", senão o diagnóstico não serve para nada.
  const detStr = (detalhe && typeof detalhe === 'object')
    ? (detalhe.message ? `${detalhe.name || 'Error'}: ${detalhe.message}` : (() => { try { return JSON.stringify(detalhe); } catch { return String(detalhe); } })())
    : String(detalhe || '');
  const rec = { onde: String(onde || '').slice(0, 80), detalhe: detStr.slice(0, 800) };
  if (extra && typeof extra === 'object') { try { rec.extra = JSON.stringify(extra).slice(0, 800); } catch { /* segue */ } }
  console.error('falha_monitorada', rec.onde, rec.detalhe.slice(0, 200));
  try {
    if (!env.DB_PLOOMES) return;
    await criaTabela(env);
    await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
      .bind('falha-sistema', new Date().toISOString(), JSON.stringify(rec).slice(0, 8000)).run();
  } catch { /* o monitor nunca derruba o fluxo principal */ }
}

// Erro vindo do navegador. Aberto (erros acontecem antes do login também),
// com teto de tamanho e freio por IP (30 relatos/hora) para ninguém entupir.
export async function receberErroCliente(request, env, sessao) {
  let b = {};
  try { b = await request.json(); } catch { return new Response('{"ok":false}', { status: 400, headers: { 'content-type': 'application/json' } }); }
  try {
    const ip = request.headers.get('cf-connecting-ip') || 'x';
    if (env.PORTAL_KV) {
      const k = `monerr:${ip}:${new Date().toISOString().slice(0, 13)}`;
      const n = Number(await env.PORTAL_KV.get(k)) || 0;
      if (n >= 30) return new Response('{"ok":false}', { status: 429, headers: { 'content-type': 'application/json' } });
      await env.PORTAL_KV.put(k, String(n + 1), { expirationTtl: 3900 });
    }
    const rec = {
      pagina: String(b.pagina || '').slice(0, 200),
      onde: String(b.onde || 'js').slice(0, 60),
      mensagem: String(b.mensagem || '').slice(0, 600),
      stack: String(b.stack || '').slice(0, 900),
      navegador: String(request.headers.get('user-agent') || '').slice(0, 160),
      cliente: sessao && sessao.email ? String(sessao.email).slice(0, 120) : '',
    };
    if (env.DB_PLOOMES) {
      await criaTabela(env);
      await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
        .bind('erro-cliente', new Date().toISOString(), JSON.stringify(rec).slice(0, 8000)).run();
    }
    console.error('erro_cliente', rec.onde, rec.mensagem.slice(0, 160));
  } catch { /* best-effort */ }
  return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
}

export async function listarFalhas(env, limite) {
  try {
    if (!env.DB_PLOOMES) return [];
    const r = await env.DB_PLOOMES.prepare("SELECT id, tipo, criado_em, dados FROM diagnosticos WHERE tipo IN ('falha-sistema','erro-cliente') ORDER BY id DESC LIMIT ?1")
      .bind(Math.min(Math.max(Number(limite) || 20, 1), 50)).all();
    return (r.results || []).map((x) => { let d = {}; try { d = JSON.parse(x.dados); } catch { /* segue */ } return { id: x.id, tipo: x.tipo, em: x.criado_em, ...d }; });
  } catch { return []; }
}
