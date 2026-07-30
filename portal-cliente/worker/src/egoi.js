// Sincronização de clientes → e-Goi (marketing). Pedido do Marcio (2026-07-29):
// todo e-mail de cliente cadastrado na base entra automaticamente na lista de
// marketing do e-Goi ("Clientes Ativos"). Duas vias:
//   1) AUTOMÁTICA: ao salvar um cliente (salvarCliente), os e-mails dele são
//      enviados à lista — best-effort, nunca trava o cadastro.
//   2) CARGA INICIAL: botão em /cadastro/manutencao percorre a base D1 em lotes
//      retomáveis e envia todo mundo que tem e-mail.
// SEGURANÇA: usa a chave já existente no cofre (EGOI_TRANSACTIONAL_API_KEY ou
// EGOI_API_KEY). Nunca loga e-mail nem chave — só contagens.
// LISTA: env EGOI_LISTA_MARKETING (padrão: 2 — "Clientes Ativos").

const chaveEgoi = (env) => env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY || '';
const listaEgoi = (env) => String(env.EGOI_LISTA_MARKETING || '2').replace(/\D/g, '') || '2';
export const egoiConfigurado = (env) => !!chaveEgoi(env);

// Envia UM contato para a lista. Devolve 'criado' | 'ja_existe' | 'erro' | 'sem_chave'.
export async function sincronizarContatoEgoi(env, { email, nome }) {
  try {
    const key = chaveEgoi(env);
    const em = String(email || '').trim().toLowerCase();
    if (!key) return 'sem_chave';
    if (!/^\S+@\S+\.\S+$/.test(em)) return 'erro';
    const base = { email: em, status: 'active' };
    const n = String(nome || '').trim();
    if (n) { base.first_name = n.split(/\s+/)[0].slice(0, 60); const resto = n.split(/\s+/).slice(1).join(' ').slice(0, 100); if (resto) base.last_name = resto; }
    const r = await fetch(`https://api.egoiapp.com/lists/${listaEgoi(env)}/contacts`, {
      method: 'POST',
      headers: { Apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify({ base }),
      signal: AbortSignal.timeout(6000),
    });
    if (r.status === 201) return 'criado';
    if (r.status === 409) return 'ja_existe'; // já está na lista — objetivo cumprido
    console.error('egoi_sync_status', r.status); // só o status — nunca o e-mail
    return 'erro';
  } catch { return 'erro'; }
}

// Sincroniza os e-mails de um CLIENTE do sistema (principal + contatos, até 3).
// Fire-and-safe: qualquer falha é engolida — o cadastro nunca depende disso.
export async function sincronizarClienteEgoi(env, cli) {
  try {
    if (!cli || !egoiConfigurado(env)) return;
    const nomeEmpresa = cli.tipo === 'PJ' ? (cli.razaoSocial || cli.nomeFantasia || '') : (cli.nome || '');
    const vistos = new Set();
    const alvos = [];
    const poe = (email, nome) => { const e = String(email || '').trim().toLowerCase(); if (e && !vistos.has(e)) { vistos.add(e); alvos.push({ email: e, nome: nome || nomeEmpresa }); } };
    poe(cli.email, nomeEmpresa);
    for (const c of (Array.isArray(cli.contatos) ? cli.contatos : [])) poe(c && c.email, (c && c.nome) || nomeEmpresa);
    for (const a of alvos.slice(0, 3)) await sincronizarContatoEgoi(env, a);
  } catch { /* nunca propaga */ }
}

// CARGA INICIAL: percorre a base D1 (contatos com e-mail) em lotes retomáveis.
// Guarda o progresso no KV (egoi:backfill:desde) — pode rodar quantas vezes precisar.
export async function backfillEgoi(env, desdeParam, limite) {
  if (!egoiConfigurado(env)) return { ok: false, error: 'Chave do e-Goi não configurada no cofre.' };
  if (!env.DB_PLOOMES) return { ok: false, error: 'Base D1 indisponível.' };
  const lote = Math.min(Math.max(Number(limite) || 40, 1), 40); // limite de subrequests do Worker
  // null/undefined/'' NÃO viram 0 (Number(null)===0!) — retomam do progresso salvo.
  let desde = (desdeParam == null || desdeParam === '') ? NaN : Number(desdeParam);
  if (!Number.isFinite(desde) || desde < 0) {
    const salvo = env.PORTAL_KV ? await env.PORTAL_KV.get('egoi:backfill:desde') : null;
    desde = Number(salvo) || 0;
  }
  let rows = [];
  try {
    const r = await env.DB_PLOOMES.prepare("SELECT ploomes_id, nome, email FROM contatos WHERE ploomes_id > ?1 AND COALESCE(email,'') <> '' ORDER BY ploomes_id LIMIT ?2").bind(desde, lote).all();
    rows = r.results || [];
  } catch (e) { return { ok: false, error: 'Falha ao ler a base: ' + String(e && e.message || e).slice(0, 80) }; }
  let criados = 0, jaExistiam = 0, erros = 0, ultimoId = desde;
  for (const c of rows) {
    const res = await sincronizarContatoEgoi(env, { email: c.email, nome: c.nome });
    if (res === 'criado') criados++; else if (res === 'ja_existe') jaExistiam++; else erros++;
    ultimoId = Number(c.ploomes_id) || ultimoId;
  }
  // O progresso no KV é conveniência: se a gravação falhar (ex.: limite diário
  // de gravações), o lote NÃO é perdido — a tela passa o "desde" adiante e o
  // e-Goi ignora duplicados (409). Nunca deixa o erro derrubar a carga.
  if (env.PORTAL_KV && rows.length) { try { await env.PORTAL_KV.put('egoi:backfill:desde', String(ultimoId)); } catch { /* segue com o desde da resposta */ } }
  return { ok: true, processados: rows.length, criados, jaExistiam, erros, ultimoId, terminou: rows.length < lote };
}
