// SOMENTE LEITURA. Descobre o FUNIL DE COLETA (o do print: Moagem, Doação, OS Recebida, Stand By,
// Aguardando, Em Transporte, Correios, Coletor, Coleta Finalizada, Cancelado) e como a Débora marca o
// AGENTE numa coleta. Enumera os pipelines pelas etapas dos negócios (as entidades Pipelines/Stages
// dão 404) e, no pipeline que tem "Em Transporte", pega um negócio de exemplo e lista os campos
// personalizados + o responsável (Owner) — pra achar o campo do coletor/agente. Nada é alterado.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

(async () => {
  L('== Funil de coleta (somente leitura) ==');
  // 1) Enumera pipelines + etapas a partir dos negócios (ordenados por Id desc = mais recentes).
  const mapa = new Map(); // pipelineId -> Map(stageId -> {name, n})
  let skip = 0;
  for (let p = 0; p < 10; p++) { // até 2500 negócios
    const d = await api(`Deals?$top=250&$skip=${skip}&$orderby=Id%20desc&$select=Id,PipelineId,StageId&$expand=Stage($select=Id,Name,PipelineId)`);
    const arr = Array.isArray(d.val) ? d.val : [];
    if (p === 0) L(`  Deals?$expand=Stage -> HTTP ${d.status}`);
    if (!arr.length) break;
    for (const dl of arr) {
      const pid = dl.PipelineId ?? dl.Stage?.PipelineId; if (pid == null) continue;
      if (!mapa.has(pid)) mapa.set(pid, new Map());
      const sm = mapa.get(pid); const cur = sm.get(dl.StageId) || { name: dl.Stage?.Name, n: 0 };
      cur.name = cur.name || dl.Stage?.Name; cur.n++; sm.set(dl.StageId, cur);
    }
    skip += arr.length; if (arr.length < 250) break;
  }
  let transStage = null, transPipe = null;
  for (const [pid, sm] of mapa) {
    const eColeta = [...sm.values()].some((v) => /em transporte/i.test(v.name || ''));
    L(`\n  Pipeline ${pid}${eColeta ? '  <<< tem "Em Transporte" (provável FUNIL DE COLETA)' : ''} — ${sm.size} etapas:`);
    for (const [sid, v] of [...sm.entries()].sort((a, b) => a[0] - b[0])) {
      L(`     [${String(sid).padStart(6)}] "${v.name}" (${v.n})`);
      if (/em transporte/i.test(v.name || '')) { transStage = sid; transPipe = pid; }
    }
  }

  // 2) Um negócio em "Em Transporte" -> campos personalizados + responsável (achar o campo do agente).
  if (transStage) {
    L(`\n  Etapa "Em Transporte" = ${transStage} (pipeline ${transPipe}). Buscando um negócio nela…`);
    let dd = await api(`Deals?$filter=StageId%20eq%20${transStage}&$top=1&$expand=OtherProperties,Owner($select=Id,Name)`);
    let deal = Array.isArray(dd.val) ? dd.val[0] : null;
    if (!deal) { dd = await api(`Deals?$filter=StageId%20eq%20${transStage}&$top=1&$expand=OtherProperties`); deal = Array.isArray(dd.val) ? dd.val[0] : null; }
    if (deal) {
      L(`  negócio exemplo: Id=${deal.Id} Title="${deal.Title || ''}" OwnerId=${deal.OwnerId ?? '—'} Owner="${deal.Owner?.Name || '?'}"`);
      const props = Array.isArray(deal.OtherProperties) ? deal.OtherProperties : [];
      L(`  campos personalizados (${props.length}) — procurar aqui o campo do COLETOR/AGENTE:`);
      for (const pr of props) {
        const val = pr.StringValue ?? pr.IntegerValue ?? pr.DecimalValue ?? pr.BigStringValue ?? pr.ObjectValueName ?? (pr.ContactValueName) ?? (pr.UserValueName) ?? '';
        if (val !== '' && val != null) L(`     ${pr.FieldKey} = ${String(val).slice(0, 70)}`);
      }
    } else L('  (nenhum negócio em "Em Transporte" agora — mover um no Ploomes e rodar de novo)');
  } else L('\n  (não achei etapa "Em Transporte" nos negócios lidos)');

  // 3) CIRÚRGICO: o negócio EXATO do print (do Marcio) — /order/4209045. Revela o funil e o campo do agente.
  const ALVO = Number(process.env.COLETA_DEAL_ID || 4209045);
  L(`\n  == Negócio do print (Id ${ALVO}) ==`);
  let alvo = null, via = '';
  let r1 = await api(`Deals(${ALVO})?$expand=Stage($select=Id,Name,PipelineId),OtherProperties,Owner($select=Id,Name)`);
  if (r1.ok && r1.val && r1.val.Id) { alvo = r1.val; via = 'Deals'; }
  else {
    const r2 = await api(`Orders(${ALVO})?$select=Id,DealId,Number`);
    const ord = r2.ok ? (Array.isArray(r2.val) ? r2.val[0] : r2.val) : null;
    L(`  (não era Deal direto; via Orders -> HTTP ${r2.status} DealId=${ord?.DealId ?? '—'})`);
    if (ord?.DealId) { const r3 = await api(`Deals(${ord.DealId})?$expand=Stage($select=Id,Name,PipelineId),OtherProperties,Owner($select=Id,Name)`); if (r3.ok && r3.val?.Id) { alvo = r3.val; via = 'Orders->Deal'; } }
  }
  if (alvo) {
    L(`  achado via ${via}: DealId=${alvo.Id} Title="${alvo.Title || ''}"`);
    L(`  PipelineId=${alvo.PipelineId} StageId=${alvo.StageId} Stage="${alvo.Stage?.Name || '?'}"`);
    L(`  Responsável (Owner): Id=${alvo.OwnerId ?? '—'} Nome="${alvo.Owner?.Name || '?'}"  <== pode ser o AGENTE`);
    const props = Array.isArray(alvo.OtherProperties) ? alvo.OtherProperties : [];
    L(`  campos personalizados (${props.length}) — procurar o campo do COLETOR/AGENTE:`);
    for (const pr of props) {
      const val = pr.StringValue ?? pr.IntegerValue ?? pr.DecimalValue ?? pr.BigStringValue ?? pr.ObjectValueName ?? pr.ContactValueName ?? pr.UserValueName ?? '';
      if (val !== '' && val != null) L(`     ${pr.FieldKey} = ${String(val).replace(/\s+/g, ' ').slice(0, 70)}`);
    }
    // Lista TODAS as etapas do funil desse negócio (o funil de coleta de verdade).
    const pid = alvo.PipelineId;
    const sm = new Map(); let skip2 = 0;
    for (let p = 0; p < 8; p++) {
      const d = await api(`Deals?$filter=PipelineId%20eq%20${pid}&$top=250&$skip=${skip2}&$orderby=StageId&$select=Id,StageId&$expand=Stage($select=Id,Name)`);
      const arr = Array.isArray(d.val) ? d.val : []; if (!arr.length) break;
      for (const dl of arr) { const c = sm.get(dl.StageId) || { name: dl.Stage?.Name, n: 0 }; c.name = c.name || dl.Stage?.Name; c.n++; sm.set(dl.StageId, c); }
      skip2 += arr.length; if (arr.length < 250) break;
    }
    L(`\n  Etapas do funil ${pid} (o FUNIL DE COLETA):`);
    for (const [sid, v] of [...sm.entries()].sort((a, b) => a[0] - b[0])) L(`     [${sid}] "${v.name}" (${v.n})`);
  } else L('  (não consegui abrir o negócio do print)');
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
