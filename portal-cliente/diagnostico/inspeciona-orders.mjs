// SOMENTE LEITURA. Resolve o funil de coleta (entidade Orders/Vendas): amarra os IDs das ETAPAS
// (usando números conhecidos do print — 17073/17066 estavam em "Em Transporte"; 17074 em "Aguardando
// Roteiro"), verifica se Vendas aceita CAMPO PERSONALIZADO (OtherProperties) pro "Coletor", e lista os
// StageIds com contagem + um exemplo pra decodificar. Nada é alterado.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

(async () => {
  L('== Orders (Vendas): etapas + campo do coletor (somente leitura) ==');

  // 1) Números conhecidos do print -> StageId (decodifica "Em Transporte" e "Aguardando Roteiro").
  const nums = [17073, 17066, 17074, 17075];
  const r1 = await api(`Orders?$filter=${nums.map((n) => `OrderNumber%20eq%20${n}`).join('%20or%20')}&$top=20&$select=Id,OrderNumber,StageId,ContactName`);
  L(`  Números do print -> StageId (HTTP ${r1.status}):`);
  for (const o of (Array.isArray(r1.val) ? r1.val : [])) L(`     #${o.OrderNumber} "${o.ContactName}" StageId=${o.StageId}`);

  // 2) Vendas aceita CAMPO PERSONALIZADO (OtherProperties)? É onde entraria o "Coletor".
  const r2 = await api('Orders?$top=1&$orderby=Id%20desc&$expand=OtherProperties');
  L(`\n  Orders?$expand=OtherProperties -> HTTP ${r2.status}`);
  const o2 = Array.isArray(r2.val) ? r2.val[0] : null;
  if (o2) {
    const temCampos = Array.isArray(o2.OtherProperties);
    L(`  Vendas aceita campo personalizado? ${temCampos ? 'SIM' : 'NÃO (OtherProperties ausente)'} ${temCampos ? `(${o2.OtherProperties.length} campos)` : ''}`);
    if (temCampos) for (const pr of o2.OtherProperties.slice(0, 20)) L(`     ${pr.FieldKey}`);
  }

  // 3) StageIds distintos com contagem + exemplo (pra decodificar todas as etapas).
  const stages = new Map(); let skip = 0;
  for (let p = 0; p < 8; p++) {
    const r = await api(`Orders?$top=250&$skip=${skip}&$orderby=Id%20desc&$select=Id,OrderNumber,StageId,ContactName`);
    const arr = Array.isArray(r.val) ? r.val : []; if (!arr.length) break;
    for (const o of arr) { const c = stages.get(o.StageId) || { n: 0, ex: `#${o.OrderNumber} ${o.ContactName || ''}` }; c.n++; stages.set(o.StageId, c); }
    skip += arr.length; if (arr.length < 250) break;
  }
  L(`\n  StageIds distintos nas Vendas (${stages.size}) — ordenado por volume, com exemplo:`);
  for (const [sid, v] of [...stages.entries()].sort((a, b) => b[1].n - a[1].n)) L(`     StageId=${sid} (${v.n})  ex: ${v.ex}`);
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
