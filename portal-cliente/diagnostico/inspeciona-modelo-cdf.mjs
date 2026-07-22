// SOMENTE LEITURA. Investiga como o CDF (Certificado de Destinação Final) é montado no Ploomes,
// para saber COMO embutir o QR de validação:
//   1) lista os DocumentTemplates e acha o(s) do CDF (nome com "cdf"/"certificad"/"destinaç");
//   2) abre o modelo do CDF COM TODOS os campos, procurando um corpo HTML e a sintaxe de campos de
//      mesclagem (merge fields) — pra ver se dá pra colocar <img src="...{campo}..."> no modelo;
//   3) pega um CDF real (Documents) pra saber os dados disponíveis pra mostrar na página de validação.
// Nada é criado/alterado.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: faltou PLOOMES_USER_KEY.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const api = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };
const eCDF = (nome) => /cdf|certificad|destina/i.test(String(nome || ''));

(async () => {
  L('== Investigação do modelo do CDF (somente leitura) ==\n');

  // 1) Modelos
  const tpl = await api('DocumentTemplates?$top=200&$select=Id,Name');
  const modelos = Array.isArray(tpl.val) ? tpl.val : [];
  L(`  DocumentTemplates -> HTTP ${tpl.status}; ${modelos.length} modelos.`);
  const cdfModelos = modelos.filter((m) => eCDF(m.Name));
  L(`  Modelos que parecem CDF/Certificado (${cdfModelos.length}):`);
  for (const m of cdfModelos) L(`     [${m.Id}] "${m.Name}"`);
  if (cdfModelos.length === 0) { L('  (nenhum pelo nome — listo todos p/ referência):'); for (const m of modelos.slice(0, 40)) L(`     [${m.Id}] "${m.Name}"`); }

  // 2) Abre o 1º modelo de CDF com TODOS os campos, e procura corpo/merge fields.
  const alvo = cdfModelos[0];
  if (alvo) {
    const full = await api(`DocumentTemplates?$filter=Id%20eq%20${alvo.Id}&$top=1`);
    const obj = (Array.isArray(full.val) ? full.val[0] : full.val) || {};
    L(`\n  Campos do modelo [${alvo.Id}] "${alvo.Name}" (HTTP ${full.status}):`);
    for (const [k, v] of Object.entries(obj)) {
      const tipo = typeof v;
      const tam = tipo === 'string' ? ` (len ${v.length})` : '';
      L(`     - ${k}: ${tipo}${tam}`);
    }
    // Procura um campo que pareça o corpo (HTML) do modelo.
    const corpoKey = Object.keys(obj).find((k) => typeof obj[k] === 'string' && obj[k].length > 200 && /<|\{\{|\[\[|\}\}/.test(obj[k]));
    if (corpoKey) {
      const corpo = obj[corpoKey];
      L(`\n  >> Corpo provável no campo "${corpoKey}" (len ${corpo.length}). Amostra:`);
      L('     ' + corpo.slice(0, 700).replace(/\n/g, '\n     '));
      // Detecta a sintaxe de merge field usada.
      const padroes = [/\{\{[^}]+\}\}/g, /\[\[[^\]]+\]\]/g, /\{[A-Za-z][\w.]+\}/g, /%[A-Za-z][\w.]+%/g, /\$\{[^}]+\}/g];
      L('\n  >> Campos de mesclagem detectados no corpo:');
      for (const p of padroes) { const ms = [...corpo.matchAll(p)].slice(0, 12).map((x) => x[0]); if (ms.length) L(`     ${p} -> ${[...new Set(ms)].join('  ')}`); }
      L(`  >> Tem <img ...>? ${/<img/i.test(corpo) ? 'SIM' : 'não'}`);
    } else {
      L('\n  (não achei um campo de corpo HTML óbvio; ver a lista de campos acima)');
    }
  }

  // 3) Um CDF real (Documents) — dados p/ a página de validação.
  const docs = await api('Documents?$top=300&$select=Id,Name,DocumentNumber,DealId,Date,TemplateId&$orderby=Id%20desc');
  const arr = Array.isArray(docs.val) ? docs.val : [];
  const cdfsReais = arr.filter((d) => eCDF(d.Name)).slice(0, 5);
  L(`\n  Documents recentes -> HTTP ${docs.status}; ${arr.length} lidos; CDFs reais (amostra ${cdfsReais.length}):`);
  for (const d of cdfsReais) L(`     Doc[${d.Id}] "${d.Name}" nº=${d.DocumentNumber ?? '—'} DealId=${d.DealId} Date=${d.Date ?? '—'} TemplateId=${d.TemplateId ?? '—'}`);
  L('\n== FIM ==');
})().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
