// SOMENTE LEITURA. Descobre os nomes REAIS de TODAS as etapas com negócios no funil 44259 e mostra
// qual aviso por e-mail cada uma dispara (mesma lógica do Worker: tipoNotificacao). Confirma, sem
// suposição, se os 3 gatilhos ("coleta agendada", "coleta realizada", "certificado liberado") casam.
//
// A entidade raiz de etapas do Ploomes não é óbvia (Stages/Pipelines deram 404), então:
//   1) testo alguns nomes de entidade candidatos (pra achar a lista autoritativa, se existir);
//   2) de qualquer forma, paginando os negócios ORDENADOS por StageId (cobertura completa), coleto
//      todas as etapas com negócio — inclusive as de baixo volume (ex.: Ordem de Serviço).

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const PIPE = Number(process.env.PORTAL_OS_PIPELINE_ID || 44259);
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

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

  // 1) tenta achar a entidade autoritativa de etapas.
  for (const ent of ['Stages', 'Pipelines', 'Funnels', 'DealStages', 'DealPipelines', 'PipelineStages']) {
    const r = await api(`${ent}?$top=1`);
    L(`  [entidade] ${ent}?$top=1 -> HTTP ${r.status}${r.ok && Array.isArray(r.val) && r.val[0] ? '  keys=' + Object.keys(r.val[0]).slice(0, 8).join(',') : ''}`);
  }

  // 2) cobertura completa via negócios ORDENADOS por StageId (pega toda etapa com ≥1 negócio).
  const mapa = new Map(); // StageId -> { Name, PipelineId, n }
  let skip = 0;
  for (let pag = 0; pag < 15; pag++) { // até 4500 negócios
    const d = await api(`Deals?$filter=PipelineId%20eq%20${PIPE}&$top=300&$skip=${skip}&$orderby=StageId&$select=Id,StageId&$expand=Stage($select=Id,Name,PipelineId)`);
    const arr = Array.isArray(d.val) ? d.val : [];
    if (pag === 0) L(`\n  Deals?$orderby=StageId -> HTTP ${d.status}`);
    if (arr.length === 0) break;
    for (const dl of arr) {
      const id = dl.StageId ?? dl.Stage?.Id;
      if (id == null) continue;
      const cur = mapa.get(id) || { Name: dl.Stage?.Name, PipelineId: dl.Stage?.PipelineId, n: 0 };
      if (!cur.Name && dl.Stage?.Name) cur.Name = dl.Stage.Name;
      cur.n += 1;
      mapa.set(id, cur);
    }
    skip += arr.length;
    if (arr.length < 300) break;
  }

  const etapas = [...mapa.entries()].map(([Id, v]) => ({ Id, ...v })).sort((a, b) => a.Id - b.Id);
  L(`\n  ${etapas.length} etapas COM NEGÓCIO no funil ${PIPE}:\n`);
  const gatilhos = { coleta_agendada: [], coleta_realizada: [], certificado_liberado: [] };
  for (const e of etapas) {
    const tipo = tipoNotificacao(e.Name);
    if (tipo) gatilhos[tipo].push(e.Name);
    const alerta = e.PipelineId != null && Number(e.PipelineId) !== PIPE ? `  ⚠️ PipelineId=${e.PipelineId} (≠ ${PIPE}!)` : '';
    L(`   [${String(e.Id).padStart(6)}] "${e.Name}" (${e.n} neg.)  ${tipo ? '→ AVISO: ' + tipo : ''}${alerta}`);
  }
  L('\n== Resumo dos 3 gatilhos (o Worker avisa exatamente nestes) ==');
  for (const tipo of ['coleta_agendada', 'coleta_realizada', 'certificado_liberado']) {
    const nomes = gatilhos[tipo];
    if (nomes.length === 1) L(`  ✅ ${tipo}: dispara em "${nomes[0]}"`);
    else if (nomes.length === 0) L(`  ⚠️ ${tipo}: NENHUMA etapa (com negócio) casa — ver a lista acima; pode faltar ajustar a regex OU a etapa não tem negócio agora.`);
    else L(`  ⚠️ ${tipo}: casa com VÁRIAS (${nomes.map((n) => `"${n}"`).join(', ')}).`);
  }
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
