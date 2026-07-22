// Sonda SOMENTE-LEITURA que replica a LÓGICA dos endpoints /api/os/docs e /api/os/doc
// contra uma OS finalizada REAL (ENEL) — pra provar que o download funciona quando existe
// documento, E que a trava de segurança (ContactId) barra cliente de ver OS de outro.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, '');
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); return { ok: r.ok, status: r.status, val: (() => { try { return JSON.parse(t).value; } catch { return null; } })() }; };

async function main() {
  L('\n===== SONDA: endpoints de documentos (lógica real) =====\n');
  const emp = await q(`Contacts?$filter=Register eq '${CNPJ}'&$top=1&$select=Id,Name`);
  const cliente = emp.val?.[0]; if (!cliente) { L('não achei a empresa; fim.'); return; }
  const clienteId = cliente.Id;
  L(`Cliente (dono): [${clienteId}] ${cliente.Name}`);

  const deals = await q(`Deals?$filter=ContactId eq ${clienteId}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties`);
  const os = (deals.val || []).find((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero));
  if (!os) { L('sem OS finalizada; fim.'); return; }
  L(`OS finalizada: [${os.Id}] Nº ${valorProp(os.OtherProperties, CAMPOS_OS.numero)}\n`);

  // 1) Trava de segurança: dono vê, estranho não vê. (exatamente o filtro dos endpoints)
  L('--- 1) Trava de segurança (Id eq OS and ContactId eq X) ---');
  const dono = await q(`Deals?$filter=Id eq ${os.Id} and ContactId eq ${clienteId}&$top=1&$select=Id`);
  const estranho = await q(`Deals?$filter=Id eq ${os.Id} and ContactId eq ${clienteId + 999999}&$top=1&$select=Id`);
  L(`  dono   -> ${dono.val?.length ? '1 (✅ vê a própria OS)' : '0 (⚠️ deveria ver)'}`);
  L(`  estranho -> ${estranho.val?.length ? '⚠️ ' + estranho.val.length + ' (FALHA: veria OS de outro!)' : '0 (✅ bloqueado)'}`);

  // 2) /api/os/docs — lista os documentos da OS
  L('\n--- 2) Lista de documentos da OS (/api/os/docs) ---');
  const docs = await q(`Documents?$filter=DealId eq ${os.Id}&$top=50&$select=Id,Name,DocumentNumber,FileName`);
  const lista = (docs.val || []).map((d) => ({ id: d.Id, nome: d.Name || d.FileName || `Documento ${d.DocumentNumber || d.Id}` }));
  L(`  ${lista.length} documento(s): ${lista.map((x) => '"' + x.nome + '" (id ' + x.id + ')').join(', ') || '(nenhum)'}`);

  // 3) /api/os/doc — baixa o 1º (o Worker busca a URL e entrega)
  L('\n--- 3) Download do 1º documento (/api/os/doc) ---');
  if (lista[0]) {
    const d1 = await q(`Documents?$filter=Id eq ${lista[0].id}&$top=1&$select=Id,Name,FileName,DealId,DocumentUrl`);
    const doc = d1.val?.[0];
    if (doc?.DocumentUrl) {
      const pdf = await fetch(doc.DocumentUrl);
      const buf = await pdf.arrayBuffer();
      L(`  "${doc.Name}" -> HTTP ${pdf.status} | ${pdf.headers.get('content-type')} | ${buf.byteLength} bytes ${pdf.ok && buf.byteLength > 1000 ? '✅ baixou' : '⚠️'}`);
    } else L('  documento sem DocumentUrl.');
  } else L('  (sem documento pra baixar)');

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
