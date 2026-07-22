// SOMENTE LEITURA. Descobre os nomes REAIS das etapas do funil de VENDAS (44259) e mostra qual
// aviso por e-mail cada uma dispara — usando EXATAMENTE a mesma lógica do Worker (tipoNotificacao).
// Serve para confirmar que os 3 gatilhos ("coleta agendada", "coleta realizada", "certificado
// liberado") casam com os nomes reais das etapas — sem suposição.
//
// A entidade raiz "Stages" do Ploomes deu 404, então uso caminhos comprovados:
//   1) Pipelines?$expand=Stages  (pega TODAS as etapas do funil, mesmo as vazias)
//   2) fallback: Deals?$expand=Stage  (pega as etapas que têm negócios) — comprovadamente funciona.

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
  const mapa = new Map(); // StageId -> { Name, Order, n }

  // 1) Caminho preferido: Pipelines com as Stages embutidas (traz até as etapas sem negócio).
  const p1 = await api(`Pipelines?$filter=Id%20eq%20${PIPE}&$expand=Stages`);
  const pipe = Array.isArray(p1.val) ? p1.val[0] : p1.val;
  const stagesEmb = pipe && Array.isArray(pipe.Stages) ? pipe.Stages : [];
  L(`  Pipelines?$expand=Stages -> HTTP ${p1.status}; etapas embutidas: ${stagesEmb.length}`);
  for (const s of stagesEmb) if (s && s.Id != null) mapa.set(s.Id, { Name: s.Name, Order: s.Order ?? null, n: null });

  // 2) Sempre complementa com as etapas que aparecem nos negócios (comprovadamente funciona).
  let skip = 0;
  for (let pag = 0; pag < 6; pag++) { // até ~1200 negócios
    const d = await api(`Deals?$filter=PipelineId%20eq%20${PIPE}&$top=200&$skip=${skip}&$select=Id,StageId&$expand=Stage($select=Id,Name)`);
    const arr = Array.isArray(d.val) ? d.val : [];
    if (pag === 0) L(`  Deals?$expand=Stage -> HTTP ${d.status}; 1ª página: ${arr.length} negócios`);
    if (arr.length === 0) break;
    for (const dl of arr) {
      const id = dl.StageId ?? dl.Stage?.Id;
      const nome = dl.Stage?.Name;
      if (id == null) continue;
      const cur = mapa.get(id) || { Name: nome, Order: null, n: 0 };
      cur.Name = cur.Name || nome;
      cur.n = (cur.n || 0) + 1;
      mapa.set(id, cur);
    }
    skip += arr.length;
    if (arr.length < 200) break;
  }

  const etapas = [...mapa.entries()].map(([Id, v]) => ({ Id, ...v }));
  etapas.sort((a, b) => (a.Order ?? 9999) - (b.Order ?? 9999) || a.Id - b.Id);
  L(`\n  ${etapas.length} etapas no funil:\n`);
  const gatilhos = { coleta_agendada: [], coleta_realizada: [], certificado_liberado: [] };
  for (const e of etapas) {
    const tipo = tipoNotificacao(e.Name);
    if (tipo) gatilhos[tipo].push(e.Name);
    const qtd = e.n == null ? '' : `(${e.n} neg.)`;
    L(`   [${String(e.Id).padStart(6)}] ordem ${String(e.Order ?? '?').padStart(3)}  "${e.Name}" ${qtd}  ${tipo ? '→ AVISO: ' + tipo : ''}`);
  }
  L('\n== Resumo dos 3 gatilhos (o Worker avisa exatamente nestes) ==');
  for (const tipo of ['coleta_agendada', 'coleta_realizada', 'certificado_liberado']) {
    const nomes = gatilhos[tipo];
    if (nomes.length === 1) L(`  ✅ ${tipo}: dispara em "${nomes[0]}"`);
    else if (nomes.length === 0) L(`  ⚠️ ${tipo}: NENHUMA etapa casa — esse aviso NÃO dispara! Ver a lista acima e ajustar a regex.`);
    else L(`  ⚠️ ${tipo}: casa com VÁRIAS (${nomes.map((n) => `"${n}"`).join(', ')}) — pode disparar no momento errado.`);
  }
  L('== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
