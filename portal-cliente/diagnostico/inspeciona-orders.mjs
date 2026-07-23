// SOMENTE LEITURA. O funil de coleta está em VENDAS = entidade Orders (Pedidos), não em Deals.
// Confirma: os campos de um Order, as ETAPAS (Estágio) com IDs (achar "Em Transporte" e "Coleta
// Finalizada"), e os MARCADORES (Tags) — que é como a Débora vai marcar o agente. Nada é alterado.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

(async () => {
  L('== Orders (Vendas) — funil de coleta (somente leitura) ==');

  // 1) Estrutura de um Order (quais campos existem, inclusive o do estágio e como referenciar tags).
  const one = await api('Orders?$top=1&$orderby=Id%20desc');
  const o0 = Array.isArray(one.val) ? one.val[0] : null;
  L(`  Orders -> HTTP ${one.status}`);
  if (o0) L(`  campos de um Order:\n     ${Object.keys(o0).join(', ')}`);

  // 2) Etapas (Estágio) a partir de Orders recentes.
  const mapa = new Map(); let skip = 0, transStage = null, fimStage = null;
  for (let p = 0; p < 6; p++) {
    const r = await api(`Orders?$top=250&$skip=${skip}&$orderby=Id%20desc&$select=Id,Number,StageId&$expand=Stage($select=Id,Name)`);
    const arr = Array.isArray(r.val) ? r.val : [];
    if (p === 0) L(`  Orders?$expand=Stage -> HTTP ${r.status}`);
    if (!arr.length) break;
    for (const o of arr) {
      const sid = o.StageId ?? o.Stage?.Id; const nm = o.Stage?.Name;
      if (sid == null) continue;
      const c = mapa.get(sid) || { name: nm, n: 0 }; c.name = c.name || nm; c.n++; mapa.set(sid, c);
      if (/em transporte/i.test(nm || '')) transStage = sid;
      if (/coleta finalizada/i.test(nm || '')) fimStage = sid;
    }
    skip += arr.length; if (arr.length < 250) break;
  }
  L(`\n  Etapas (Estágio) dos Orders:`);
  for (const [sid, v] of [...mapa.entries()].sort((a, b) => a[0] - b[0])) L(`     [${sid}] "${v.name}" (${v.n})${sid === transStage ? '  <== EM TRANSPORTE (gatilho do app)' : ''}${sid === fimStage ? '  <== COLETA FINALIZADA (fim)' : ''}`);

  // 3) Marcadores (Tags) — consulta separada pra não quebrar se o expand falhar.
  const tags = new Map();
  const rt = await api('Orders?$top=250&$orderby=Id%20desc&$select=Id&$expand=Tags($select=Id,Name)');
  L(`\n  Orders?$expand=Tags -> HTTP ${rt.status}`);
  if (Array.isArray(rt.val)) for (const o of rt.val) for (const t of (o.Tags || [])) tags.set(t.Id, t.Name);
  L(`  Marcadores (Tags) já usados (${tags.size}) — é aqui que entra o "Coletor: <nome>":`);
  for (const [id, name] of tags) L(`     [${id}] "${name}"`);

  // 4) Amostra em "Em Transporte" com tags + cliente.
  if (transStage) {
    const r = await api(`Orders?$filter=StageId%20eq%20${transStage}&$top=3&$select=Id,Number,ContactId&$expand=Contact($select=Name),Tags($select=Id,Name)`);
    const arr = Array.isArray(r.val) ? r.val : [];
    L(`\n  Orders em "Em Transporte" (${transStage}) -> HTTP ${r.status}; ${arr.length}:`);
    for (const o of arr) L(`     #${o.Number} cliente="${o.Contact?.Name || '?'}" tags=[${(o.Tags || []).map((t) => t.Name).join(', ') || '(nenhuma)'}]`);
  } else L('\n  (não achei etapa "Em Transporte" nos Orders lidos)');
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
