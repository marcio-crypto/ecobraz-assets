// SOMENTE LEITURA. Lista as etapas (Stages) do funil de VENDAS (44259) com Id/Nome/Ordem e mostra,
// para cada uma, qual aviso por e-mail ela dispara — usando EXATAMENTE a mesma lógica do Worker
// (tipoNotificacao). Serve para confirmar que os 3 gatilhos ("coleta agendada", "coleta realizada",
// "certificado liberado") casam com os nomes REAIS das etapas — sem depender de suposição.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const PIPE = Number(process.env.PORTAL_OS_PIPELINE_ID || 44259);
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

// Mesma normalização e regras do Worker (index.js) — mantidas em sincronia manualmente.
const semAcentoLc = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function tipoNotificacao(nomeEtapa) {
  const s = semAcentoLc(nomeEtapa);
  if (/certificado liberado/.test(s)) return 'certificado_liberado';
  if (/coleta finalizada/.test(s)) return 'coleta_realizada';
  if (/ordem de servico/.test(s)) return 'coleta_agendada';
  return null;
}

(async () => {
  L(`== Etapas do funil ${PIPE} (somente leitura) ==`);
  // Busca as etapas. Tento pelo filtro; se falhar, pego todas e filtro no cliente.
  let r = await api(`Stages?$filter=PipelineId%20eq%20${PIPE}&$top=200&$select=Id,Name,PipelineId,Order&$orderby=Order`);
  let etapas = Array.isArray(r.val) ? r.val : [];
  if (!r.ok || etapas.length === 0) {
    L(`  (filtro por PipelineId falhou: HTTP ${r.status}; buscando todas e filtrando aqui)`);
    r = await api('Stages?$top=500&$select=Id,Name,PipelineId,Order');
    etapas = (Array.isArray(r.val) ? r.val : []).filter((e) => Number(e.PipelineId) === PIPE);
  }
  etapas.sort((a, b) => (a.Order || 0) - (b.Order || 0));
  L(`  ${etapas.length} etapas encontradas:\n`);
  const gatilhos = { coleta_agendada: [], coleta_realizada: [], certificado_liberado: [] };
  for (const e of etapas) {
    const tipo = tipoNotificacao(e.Name);
    if (tipo) gatilhos[tipo].push(e.Name);
    L(`   [${String(e.Id).padStart(6)}] ordem ${String(e.Order ?? '?').padStart(3)}  "${e.Name}"  ${tipo ? '→ AVISO: ' + tipo : ''}`);
  }
  L('\n== Resumo dos 3 gatilhos ==');
  for (const [tipo, nomes] of Object.entries(gatilhos)) {
    if (nomes.length === 1) L(`  ✅ ${tipo}: dispara na etapa "${nomes[0]}"`);
    else if (nomes.length === 0) L(`  ⚠️ ${tipo}: NENHUMA etapa casa com a regra atual — esse aviso NÃO vai disparar! (ajustar a regex)`);
    else L(`  ⚠️ ${tipo}: casa com MAIS de uma etapa (${nomes.map((n) => `"${n}"`).join(', ')}) — pode disparar em momento errado.`);
  }
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
