// Sonda: (A) confirmar que dá pra GRAVAR o "endereço de coleta" no campo certo do Ploomes
// (deal_F4BF490C...), pros documentos saírem corretos; e (B) confirmar como BAIXAR o PDF de
// um documento (DocumentUrl direto? precisa da chave? precisa de Share?).
// Cria/【lê】/apaga UM negócio de teste (parte A) e só LÊ na parte B. A chave nunca é impressa.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, '');
const CAMPO_END = process.env.PLOOMES_FIELD_OS_ENDERECO || 'deal_F4BF490C-707A-434A-BB3A-E187CBFD8638';
const PIPE = Number(process.env.PORTAL_OS_PIPELINE_ID || 44259);
const STAGE = Number(process.env.PORTAL_OS_STAGE_ID || 199543);
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const HKEY = { 'User-Key': KEY };
const HJSON = { ...HKEY, 'content-type': 'application/json', Accept: 'application/json' };
const tryJson = async (q, opt) => { try { const r = await fetch(q.startsWith('http') ? q : `${BASE}/${q}`.replace(/ /g, '%20'), opt || { headers: HKEY }); const t = await r.text(); return { ok: r.ok, status: r.status, body: (() => { try { return JSON.parse(t); } catch { return t; } })() }; } catch (e) { return { ok: false, status: 0, body: String(e.message) }; } };

async function main() {
  L('\n===== SONDA: gravar endereço no campo certo + baixar documento =====\n');

  // ---- Parte A: gravar o endereço no campo deal_F4BF490C... ----
  L('--- A) Gravar "endereço de coleta" no campo do Ploomes ---');
  const alvoTxt = 'R. Teste do Portal, 100 - Centro - São Paulo/SP - CEP 01000-000';
  const cr = await tryJson('Deals', { method: 'POST', headers: HJSON, body: JSON.stringify({
    Title: '[TESTE-PORTAL-CAMPO — pode apagar]', PipelineId: PIPE, StageId: STAGE,
    OtherProperties: [{ FieldKey: CAMPO_END, StringValue: alvoTxt }],
  }) });
  if (!cr.ok) { L('  falhou ao criar:', cr.status, JSON.stringify(cr.body).slice(0, 200)); }
  else {
    const id = cr.body?.value?.[0]?.Id;
    L('  negócio de teste criado: Id =', id);
    const rd = await tryJson(`Deals?$filter=Id eq ${id}&$expand=OtherProperties`);
    const lido = rd.body?.value?.[0];
    const val = valorProp(lido?.OtherProperties, CAMPO_END);
    L(`  campo lido de volta: ${val ? '"' + val + '"' : '(vazio)'}`);
    L(val === alvoTxt ? '  ✅ Gravou certo — o Portal pode preencher o endereço no campo que os documentos usam.'
                      : '  ⚠️ Não bateu (ver acima).');
    const del = await tryJson(`Deals(${id})`, { method: 'DELETE', headers: HKEY });
    L(`  DELETE -> HTTP ${del.status} ${del.ok ? '(apagado)' : '(NÃO apagou — avisar)'}`);
  }

  // ---- Parte B: baixar o PDF de um documento real ----
  L('\n--- B) Baixar o PDF de um documento (OS finalizada da ENEL) ---');
  const emp = await tryJson(`Contacts?$filter=Register eq '${CNPJ}'&$top=1`);
  const empId = emp.body?.value?.[0]?.Id;
  if (!empId) { L('  não achei a empresa; fim.'); return; }
  const deals = await tryJson(`Deals?$filter=ContactId eq ${empId}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties`);
  const osFin = (deals.body?.value || []).find((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero));
  if (!osFin) { L('  não achei OS finalizada; fim.'); return; }
  const docs = await tryJson(`Documents?$filter=DealId eq ${osFin.Id}&$top=1`);
  const doc = docs.body?.value?.[0];
  if (!doc) { L('  OS sem documento; fim.'); return; }
  L(`  Documento: [${doc.Id}] "${doc.Name}" | Key ${doc.Key} | Shared ${doc.Shared}`);
  L(`  DocumentUrl (completa): ${doc.DocumentUrl}`);

  // B1) GET direto na DocumentUrl (sem auth)
  for (const [rot, opt] of [['sem auth', {}], ['com User-Key', { headers: HKEY }]]) {
    try {
      const r = await fetch(doc.DocumentUrl, opt);
      const buf = await r.arrayBuffer();
      L(`  [DocumentUrl ${rot}] -> HTTP ${r.status} | tipo ${r.headers.get('content-type')} | ${buf.byteLength} bytes`);
    } catch (e) { L(`  [DocumentUrl ${rot}] -> erro ${String(e.message).slice(0, 80)}`); }
  }
  // B2) Endpoint Share (às vezes gera link público/atual)
  for (const q of [`Documents(${doc.Id})/Share`, `Documents(${doc.Id})/Download`]) {
    const s = await tryJson(q);
    L(`  [${q}] -> HTTP ${s.status} | ${typeof s.body === 'string' ? s.body.slice(0, 90) : JSON.stringify(s.body).slice(0, 120)}`);
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
