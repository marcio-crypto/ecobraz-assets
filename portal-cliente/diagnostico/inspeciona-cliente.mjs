// Inspeção SOMENTE-LEITURA de UM cliente-exemplo AUTORIZADO (passado pela Débora),
// para descobrir onde vivem as OS e os documentos no Ploomes e apontar o Portal ao
// lugar CERTO — sem chute.
//
// LGPD: cliente PJ autorizado como exemplo de teste; o foco é ESTRUTURA + campos
// OPERACIONAIS (nº da OS, datas, peso, tipos de documento). Read-only: não cria,
// não altera, não apaga. A chave nunca é impressa. Saída vai só para o log da CI
// (privado). CNPJ vem por variável de ambiente (não fica no repositório).

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '').replace(/\D/g, '');
const L = (...a) => console.log(...a);

if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
if (CNPJ.length !== 14) { console.error('ERRO: CNPJ_ALVO precisa ter 14 dígitos.'); process.exit(1); }

const HEADERS = { 'User-Key': KEY, Accept: 'application/json' };
const fmt = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

async function api(pathQ) {
  const raw = pathQ.startsWith('http') ? pathQ : `${BASE}/${pathQ.replace(/^\/+/, '')}`;
  const r = await fetch(raw.replace(/ /g, '%20'), { headers: HEADERS });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`); e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { throw new Error('resposta não-JSON'); }
}
async function tryApi(pathQ) { try { return await api(pathQ); } catch (e) { return { __erro: e.message }; } }
function valProp(p) { return p.StringValue ?? p.DateTimeValue ?? p.DateValue ?? p.DecimalValue ?? p.IntegerValue ?? p.BoolValue ?? p.BigStringValue ?? null; }
function campos(props, n = 16) {
  return (props || []).map((p) => { const v = valProp(p); return v == null ? null : `${p.FieldKey || p.FieldId}=${String(v).slice(0, 40)}`; }).filter(Boolean).slice(0, n).join(' | ');
}

async function main() {
  L('\n===== INSPEÇÃO DE CLIENTE-EXEMPLO (somente leitura) =====\n');
  L('Base:', BASE, '| CNPJ alvo:', fmt(CNPJ));

  // 1) Catálogo de entidades — achar a de "Documentos"
  const svc = await tryApi('');
  const cat = Array.isArray(svc?.value) ? svc.value.map((s) => s.name || s.url).filter(Boolean).sort() : [];
  L('\nEntidades visíveis:', cat.length ? cat.join(', ') : '(catálogo indisponível)');

  // 2) Achar a empresa pelo CNPJ (Register formatado/não; ou campo custom)
  L('\n--- Buscando a empresa pelo CNPJ ---');
  const tent = [
    `Contacts?$filter=Register eq '${CNPJ}'&$top=3&$expand=OtherProperties`,
    `Contacts?$filter=Register eq '${fmt(CNPJ)}'&$top=3&$expand=OtherProperties`,
    `Contacts?$filter=CNPJ eq '${CNPJ}'&$top=3`,
  ];
  let empresa = null;
  for (const q of tent) {
    const d = await tryApi(q);
    if (d.__erro) { L(`  (falhou: ${q.split('?')[1].split('&')[0]} -> ${d.__erro.slice(0, 70)})`); continue; }
    const v = d.value || [];
    if (v.length) { empresa = v[0]; L(`  ✓ ACHEI via ${q.split('&')[0].split('=')[0]}: Id=${empresa.Id} Name="${empresa.Name}" TypeId=${empresa.TypeId} CompanyId=${empresa.CompanyId ?? '-'}`); break; }
    L(`  (0 resultados: ${q.split('&')[0]})`);
  }

  const ids = [];
  if (empresa) { ids.push(empresa.Id); if (empresa.CompanyId) ids.push(empresa.CompanyId); }

  // 2b) Se não achou por Register, tenta negócios pelo campo custom "CNPJ"
  if (!empresa) {
    L('\n  Não achei por Register. Tentando negócios pelo campo custom CNPJ (OtherProperties)...');
    const q = `Deals?$filter=OtherProperties/any(p: p/StringValue eq '${CNPJ}')&$top=5&$expand=OtherProperties`;
    const d = await tryApi(q);
    if (!d.__erro && (d.value || []).length) {
      L(`  ✓ achei ${d.value.length} negócio(s) por CNPJ custom. Amostra:`);
      for (const deal of d.value.slice(0, 5)) L(`     • negócio [${deal.Id}] ContactId=${deal.ContactId} "${deal.Title}"`);
      const cid = d.value[0].ContactId; if (cid) ids.push(cid);
    } else L(`  (sem resultado por campo custom: ${d.__erro || '0'})`);
  }

  if (!ids.length) {
    L('\n⚠️ Não localizei a empresa por esse CNPJ (nem Register nem campo custom).');
    L('   Pode ser que o CNPJ esteja em outro campo, ou o cliente esteja como pessoa. Ver catálogo/erros acima.');
    L('\n===== FIM ====='); return;
  }

  // 3) Negócios (candidatos a OS/atendimento) do cliente
  const dealsAmostra = [];
  const funisVistos = new Map();
  for (const id of [...new Set(ids)]) {
    const d = await tryApi(`Deals?$filter=ContactId eq ${id}&$top=25&$orderby=CreateDate desc&$expand=OtherProperties,Pipeline,Stage,Status`);
    if (d.__erro) { L(`\nNegócios (ContactId ${id}): erro ${d.__erro.slice(0, 90)}`); continue; }
    const v = d.value || [];
    L(`\n--- Negócios do cliente (ContactId ${id}): ${v.length} ---`);
    for (const deal of v.slice(0, 12)) {
      const fn = deal.Pipeline?.Name || `funil ${deal.PipelineId}`;
      funisVistos.set(deal.PipelineId, fn);
      L(`  • [${deal.Id}] "${String(deal.Title).slice(0, 50)}" | ${fn} / ${deal.Stage?.Name || deal.StageId} / ${deal.Status?.Name || deal.StatusId} | criado ${(deal.CreateDate || '').slice(0, 10)} fim ${(deal.FinishDate || '').slice(0, 10)}`);
      const c = campos(deal.OtherProperties);
      if (c) L(`      campos: ${c}`);
      dealsAmostra.push(deal.Id);
    }
  }
  if (funisVistos.size) { L('\nFunis desse cliente:'); for (const [id, nome] of funisVistos) L(`  - [${id}] ${nome}`); }

  // 4) DOCUMENTOS ligados — achar a entidade e os campos (nº OS, peso, datas)
  L('\n--- Procurando os DOCUMENTOS ligados (nº da OS, peso, datas) ---');
  let candidatas = cat.filter((n) => /order|quote|document|proposal/i.test(n));
  if (!candidatas.length) candidatas = ['Orders', 'Quotes'];
  L('  Candidatas a "Documentos":', candidatas.join(', '));
  const sample = dealsAmostra[0];
  for (const ent of candidatas) {
    const shape = await tryApi(`${ent}?$top=1&$expand=OtherProperties`);
    if (shape.__erro) { L(`  ${ent}: indisponível (${shape.__erro.slice(0, 60)})`); continue; }
    const ex = (shape.value || [])[0];
    L(`  ${ent}: OK — campos base: ${ex ? Object.keys(ex).filter((k) => k !== 'OtherProperties').slice(0, 18).join(',') : '(vazio)'}`);
    if (sample) {
      const lig = await tryApi(`${ent}?$filter=DealId eq ${sample}&$top=5&$expand=OtherProperties`);
      if (lig.__erro) { L(`     (filtro DealId não suportado: ${lig.__erro.slice(0, 60)})`); continue; }
      const v = lig.value || [];
      L(`     ligados ao negócio ${sample}: ${v.length}`);
      for (const doc of v.slice(0, 3)) L(`       • doc [${doc.Id}] ${campos(doc.OtherProperties)}`);
    }
  }

  L('\n===== FIM DA INSPEÇÃO =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
