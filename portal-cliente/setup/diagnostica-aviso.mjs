// Diagnóstico do aviso por e-mail: recria o webhook com o segredo atual, cria um negócio de
// teste numa etapa NÃO-gatilho e o MOVE para "Ordem de Serviço" (simula a Débora), mantendo o
// negócio VIVO enquanto fica CHECANDO o registro do último payload no Worker — pra saber se o
// Ploomes realmente chamou a gente (e se o e-mail deve ter saído). Apaga o negócio no fim.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const SECRET = process.env.PLOOMES_WEBHOOK_SECRET || '';
const WORKER = (process.env.WORKER_URL || 'https://ecobraz-portal.ti-0ab.workers.dev').replace(/\/+$/, '');
const MARCIO = Number(process.env.MARCIO_CONTACT_ID || 24038683);
const PIPE = Number(process.env.PORTAL_OS_PIPELINE_ID || 44259);
const STAGE_TRIGGER = Number(process.env.PORTAL_OS_STAGE_ID || 199543); // Ordem de Serviço
const STAGE_ANTES = Number(process.env.STAGE_ANTES || 208582);          // Proposta Comercial (não-gatilho)
const L = (...a) => console.log(...a);
if (!KEY || !SECRET) { console.error('ERRO: faltou PLOOMES_USER_KEY ou PLOOMES_WEBHOOK_SECRET.'); process.exit(1); }
const H = { 'User-Key': KEY, 'content-type': 'application/json', Accept: 'application/json' };
const api = async (p, opt) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H, ...opt }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };
const dbg = async () => { try { const r = await fetch(`${WORKER}/api/ploomes/webhook?t=${SECRET}`); return await r.json(); } catch { return null; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  L('== Diagnóstico do aviso por e-mail ==');

  // 1) Recria o webhook com o segredo ATUAL (garante que Ploomes chama com o token certo).
  const ex = await api('Webhooks?$top=100');
  for (const w of (Array.isArray(ex.val) ? ex.val : [])) if (String(w.CallbackUrl || '').includes('/api/ploomes/webhook')) await api(`Webhooks(${w.Id})`, { method: 'DELETE' });
  const cr = await api('Webhooks', { method: 'POST', body: JSON.stringify({ EntityId: 2, ActionId: 2, CallbackUrl: `${WORKER}/api/ploomes/webhook?t=${SECRET}`, Active: true }) });
  const wh = Array.isArray(cr.val) ? cr.val[0] : cr.val;
  L(`  webhook: Id=${wh?.Id} Active=${wh?.Active} (HTTP ${cr.status})`);

  // Mostra PARA ONDE o aviso vai: o e-mail cadastrado no contato de teste no Ploomes.
  // (É o que o cliente recebe — se estiver errado/vazio, o e-mail não chega.)
  // Uso a forma de COLEÇÃO (?$filter=Id eq X) que retorna value:[...] de forma confiável.
  const ct = await api(`Contacts?$filter=Id%20eq%20${MARCIO}&$top=1&$select=Id,Name,Email`);
  const contato = Array.isArray(ct.val) ? ct.val[0] : ct.val;
  L(`  contato de teste: Id=${MARCIO} Nome="${contato?.Name || '?'}" Email=${contato?.Email || '(VAZIO — sem e-mail no cadastro; o e-mail do aviso não teria para onde ir)'} (HTTP ${ct.status})`);

  // baseline do registro
  await wait(3000);
  const base0 = await dbg();
  L(`  registro antes: ${base0?.ultimo ? JSON.stringify(base0.ultimo).slice(0, 80) : '(vazio/sem acesso: ' + JSON.stringify(base0).slice(0, 60) + ')'}`);

  // 2) cria numa etapa não-gatilho e MOVE para "Ordem de Serviço" (simula a Débora).
  const dc = await api('Deals', { method: 'POST', body: JSON.stringify({ Title: '[TESTE-AVISO-DIAG — apagar]', ContactId: MARCIO, PipelineId: PIPE, StageId: STAGE_ANTES }) });
  const id = dc.val?.[0]?.Id;
  L(`  negócio criado: Id=${id} (etapa não-gatilho)`);
  await wait(2000);
  const mv = await api(`Deals(${id})`, { method: 'PATCH', body: JSON.stringify({ StageId: STAGE_TRIGGER }) });
  L(`  MOVIDO para "Ordem de Serviço" -> HTTP ${mv.status}`);

  // 3) fica checando o registro por ~160s. Agora olho DUAS coisas:
  //    - ultimo  = payload cru que o Ploomes mandou (prova que o webhook chegou)
  //    - notif   = RESULTADO do nosso processamento (prova que o e-mail saiu, com o id do Resend,
  //                ou o motivo exato de não ter saído).
  let fired = null;
  let notif = null;
  for (let i = 0; i < 18; i++) { // ~180s: o webhook do Ploomes chega com ~1-2 min de atraso
    await wait(10000);
    const d = await dbg();
    const u = d?.ultimo;
    const n = d?.notif;
    const marca = `${(i + 1) * 10}s`;
    if (u) { const s = JSON.stringify(u); L(`   ${marca}: ultimo= ${s.slice(0, 500)}`); if (s.includes(String(id))) fired = u; }
    else L(`   ${marca}: (registro vazio / sem acesso)`);
    if (n) { L(`   ${marca}: notif = ${JSON.stringify(n)}`); }
    // Para quando o NOSSO negócio já foi processado (resultado registrado para este dealId).
    if (n && String(n.dealId) === String(id)) { notif = n; L(`       ^^ resultado do NOSSO negócio ${id}: ${n.resultado}`); break; }
    if (fired && n) break;
  }

  // 4) veredito honesto, baseado no RESULTADO real do processamento
  if (notif && notif.resultado === 'enviado') L(`\n  ✅ E-MAIL ENVIADO para ${notif.para} — o Resend aceitou (id=${notif.resendId || 'sem-id'}). Etapa: ${notif.etapa}.`);
  else if (notif) L(`\n  ⚠️ O Worker processou o negócio ${id}, mas NÃO enviou: resultado="${notif.resultado}"${notif.erro ? ' erro=' + notif.erro : ''} etapa="${notif.etapa || '?'}". (Sem e-mail — corrigir isto.)`);
  else if (fired) L(`\n  ⚠️ O webhook chegou (payload do negócio ${id} capturado), mas não vi o registro de processamento nessa janela. Rode de novo ou aumente a espera.`);
  else L('\n  ℹ️ Não peguei nem o payload nem o resultado do nosso negócio nessa janela (webhook do Ploomes atrasa 1-2 min).');

  // 5) limpeza
  const del = await api(`Deals(${id})`, { method: 'DELETE' });
  L(`  apaguei o negócio de teste -> HTTP ${del.status}`);
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
