// Testa o aviso por e-mail de ponta a ponta, pela CADEIA REAL: cria um negócio de teste sob o
// contato do Marcio numa etapa gatilho ("Ordem de Serviço"), ATUALIZA (dispara o webhook do
// Ploomes → nosso Worker → e-mail), espera processar e APAGA. Canário garante que só o Marcio
// recebe. Deve chegar 1 e-mail "coleta agendada" em marcio@ecobraz.org.br.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const MARCIO = Number(process.env.MARCIO_CONTACT_ID || 24038683);
const PIPE = Number(process.env.PORTAL_OS_PIPELINE_ID || 44259);
const STAGE = Number(process.env.PORTAL_OS_STAGE_ID || 199543);
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, 'content-type': 'application/json', Accept: 'application/json' };
const api = async (p, opt) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H, ...opt }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  L('== Teste do aviso por e-mail (cadeia real) ==');
  const cr = await api('Deals', { method: 'POST', body: JSON.stringify({ Title: '[TESTE-AVISO — pode apagar]', ContactId: MARCIO, PipelineId: PIPE, StageId: STAGE }) });
  if (!cr.ok) { console.error('  falhou criar negócio de teste:', cr.status, String(cr.raw).slice(0, 200)); process.exit(1); }
  const id = cr.val?.[0]?.Id;
  L(`  negócio de teste criado: Id=${id} (etapa Ordem de Serviço, sob o contato do Marcio)`);

  await wait(3000);
  // ATUALIZA (PATCH) → dispara o webhook "Negócio editado".
  const up = await api(`Deals(${id})`, { method: 'PATCH', body: JSON.stringify({ Title: '[TESTE-AVISO — pode apagar] (movimentado)' }) });
  L(`  atualizei o negócio (dispara o webhook) -> HTTP ${up.status}`);

  L('  aguardando o webhook → Worker → e-mail (20s)...');
  await wait(20000);

  const del = await api(`Deals(${id})`, { method: 'DELETE' });
  L(`  apaguei o negócio de teste -> HTTP ${del.status} ${del.ok ? '(ok)' : '| ' + String(del.raw).slice(0, 120)}`);
  L('  → confira marcio@ecobraz.org.br: deve ter chegado 1 e-mail "Coleta agendada".');
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
