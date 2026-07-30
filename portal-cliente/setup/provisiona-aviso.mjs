// LIGA o aviso por e-mail: cria o webhook no Ploomes (Negócio EntityId=2, ação Update=2 →
// chama nosso Worker). Idempotente (remove o webhook nosso anterior antes de recriar).
// Modo teste garantido pelo canário no Worker (NOTIF_TESTE_CONTACT_ID) → só o Marcio recebe.
// NUNCA imprime o segredo. Ao final, dispara 1 e-mail de teste real (se houver OS do Marcio
// numa etapa gatilho).

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const SECRET = process.env.PLOOMES_WEBHOOK_SECRET || '';
const WORKER = (process.env.WORKER_URL || 'https://ecobraz-portal.ti-0ab.workers.dev').replace(/\/+$/, '');
const MARCIO = process.env.MARCIO_CONTACT_ID || '24038683';
const CB = `${WORKER}/api/ploomes/webhook?t=${SECRET}`;
const CB_MASK = `${WORKER}/api/ploomes/webhook?t=***`;
const L = (...a) => console.log(...a);
if (!KEY || !SECRET) { console.error('ERRO: faltou PLOOMES_USER_KEY ou PLOOMES_WEBHOOK_SECRET.'); process.exit(1); }
const H = { 'User-Key': KEY, 'content-type': 'application/json', Accept: 'application/json' };
const api = async (p, opt) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H, ...opt }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };
const semAcento = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  L('== Ligar aviso por e-mail (webhook Ploomes) ==');

  // 1) Idempotência: remove qualquer webhook nosso anterior.
  const ex = await api('Webhooks?$top=100');
  for (const w of (Array.isArray(ex.val) ? ex.val : [])) {
    if (String(w.CallbackUrl || '').includes('/api/ploomes/webhook')) {
      const d = await api(`Webhooks(${w.Id})`, { method: 'DELETE' });
      L(`  removi webhook anterior ${w.Id} -> HTTP ${d.status}`);
    }
  }

  // 2) Cria o webhook: Negócio (2) editado (2) → nosso Worker.
  const cr = await api('Webhooks', { method: 'POST', body: JSON.stringify({ EntityId: 2, ActionId: 2, CallbackUrl: CB, Active: true }) });
  if (!cr.ok) { console.error(`  ❌ FALHOU criar webhook: HTTP ${cr.status} ${String(cr.raw).slice(0, 220)}`); process.exit(1); }
  const w = Array.isArray(cr.val) ? cr.val[0] : cr.val;
  L(`  ✅ webhook criado: Id=${w?.Id} Active=${w?.Active} EntityId=${w?.EntityId} ActionId=${w?.ActionId}`);
  L(`     url: ${CB_MASK}`);

  // 3) Teste canário: dispara 1 e-mail REAL pro Marcio, se ele tiver OS em etapa gatilho.
  await wait(5000); // deixa o segredo do Cloudflare propagar
  const md = await api(`Deals?$filter=ContactId eq ${MARCIO}&$top=25&$orderby=CreateDate desc&$expand=Stage`);
  const trig = (Array.isArray(md.val) ? md.val : []).find((d) => /ordem de servico|coleta finalizada|certificado liberado/.test(semAcento(d.Stage?.Name)));
  if (trig) {
    let st = 0;
    for (let i = 0; i < 3; i++) { const r = await fetch(CB, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Id: trig.Id }) }); st = r.status; if (r.ok) break; await wait(4000); }
    L(`  📧 teste canário: simulei o evento da sua OS [${trig.Id}] (etapa "${trig.Stage?.Name}") -> Worker HTTP ${st}.`);
    L('     Deve chegar 1 e-mail em marcio@ecobraz.org.br em instantes.');
  } else {
    L('  (você não tem OS em etapa gatilho agora — mova uma OS no Ploomes p/ "Ordem de Serviço" e você recebe o e-mail).');
  }
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
