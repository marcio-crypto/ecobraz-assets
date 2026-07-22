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

  // 2) Abre o modelo do CDF com o CÓDIGO-FONTE explícito (sem $select ele vem null) e procura o
  //    corpo/merge fields. Uso o modelo real dos certificados (224095) se estiver na lista, senão o 1º.
  const alvo = cdfModelos.find((m) => Number(m.Id) === Number(process.env.CDF_TEMPLATE_ID || 224095)) || cdfModelos[0];
  if (alvo) {
    const full = await api(`DocumentTemplates?$filter=Id%20eq%20${alvo.Id}&$top=1&$select=Id,Name,HeaderSourceCode,BodySourceCode,FooterSourceCode,CoverSourceCode,NewFormat,Editable`);
    const obj = (Array.isArray(full.val) ? full.val[0] : full.val) || {};
    L(`\n  Campos do modelo [${alvo.Id}] "${alvo.Name}" (HTTP ${full.status}):`);
    for (const [k, v] of Object.entries(obj)) {
      const tipo = typeof v;
      const tam = tipo === 'string' ? ` (len ${v.length})` : '';
      L(`     - ${k}: ${tipo}${tam}`);
    }
    // Examina CADA seção de código-fonte (Header/Body/Footer/Cover) procurando merge fields, <img> e
    // como o NÚMERO do certificado/OS é referenciado (é o campo que vamos usar no src do QR).
    const padroes = [/\{\{[^}]{1,40}\}\}/g, /\[\[[^\]]{1,40}\]\]/g, /\{[A-Za-z][\w.]{1,40}\}/g, /%[A-Za-z][\w.]{1,40}%/g, /\$\{[^}]{1,40}\}/g, /#\{[^}]{1,40}\}/g, /@[A-Za-z][\w.]{1,40}@/g];
    for (const sec of ['HeaderSourceCode', 'BodySourceCode', 'FooterSourceCode', 'CoverSourceCode']) {
      const corpo = typeof obj[sec] === 'string' ? obj[sec] : '';
      if (!corpo) { L(`\n  >> ${sec}: (vazio/null)`); continue; }
      L(`\n  >> ${sec} (len ${corpo.length}) — tem <img>? ${/<img/i.test(corpo) ? 'SIM' : 'não'}`);
      const campos = new Set();
      for (const p of padroes) for (const m of corpo.matchAll(p)) campos.add(m[0]);
      if (campos.size) L(`     campos de mesclagem: ${[...campos].slice(0, 30).join('  ')}`);
      // Onde aparece "numero"/"number"/"os"/"documento" (candidatos ao número do certificado)?
      const numTok = [...campos].filter((c) => /numer|number|\bos\b|document|codigo|nº|proposal/i.test(c));
      if (numTok.length) L(`     >> candidatos a NÚMERO: ${numTok.join('  ')}`);
      // Amostra em torno da 1ª imagem (pra ver como imagens são declaradas no modelo).
      const iImg = corpo.search(/<img/i);
      if (iImg >= 0) L(`     amostra <img>: ${corpo.slice(iImg, iImg + 160).replace(/\s+/g, ' ')}`);
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
