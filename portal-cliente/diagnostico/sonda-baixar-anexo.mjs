// Sonda SOMENTE-LEITURA: confirmar como BAIXAR (A) o documento da OS (Orders) e (B) a NF
// (anexo). Sem isso não dá pra incluir OS/NF no download com segurança. ENEL. A chave nunca
// é impressa.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, '');
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); return { ok: r.ok, status: r.status, val: (() => { try { return JSON.parse(t).value ?? JSON.parse(t); } catch { return null; } })(), raw: t }; };
async function baixa(rot, urlOuBytesLen) { L('  ', rot, urlOuBytesLen); }

async function main() {
  L('\n===== BAIXAR OS (Orders) + NF (anexo) =====\n');
  const emp = await q(`Contacts?$filter=Register eq '${CNPJ}'&$top=1&$select=Id`);
  const cid = emp.val?.[0]?.Id; if (!cid) { L('sem empresa'); return; }
  const deals = await q(`Deals?$filter=ContactId eq ${cid}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties`);
  const os = (deals.val || []).find((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero)); if (!os) { L('sem OS'); return; }
  L(`OS [${os.Id}] Nº ${valorProp(os.OtherProperties, CAMPOS_OS.numero)}\n`);

  // A) Order (documento da OS) — baixar pela DocumentUrl.
  L('--- A) Documento da OS (Orders) ---');
  const ord = await q(`Orders?$filter=DealId eq ${os.Id}&$top=1&$select=Id,OrderNumber,DocumentUrl`);
  const o = ord.val?.[0];
  if (o?.DocumentUrl) {
    const r = await fetch(o.DocumentUrl); const b = await r.arrayBuffer();
    L(`  Order [${o.Id}] nº ${o.OrderNumber} -> HTTP ${r.status} | ${r.headers.get('content-type')} | ${b.byteLength} bytes ${r.ok && b.byteLength > 1000 ? '✅' : '⚠️'}`);
  } else L('  (Order sem DocumentUrl)');

  // B) NF (anexo) — achar o registro e descobrir como baixar.
  L('\n--- B) NF (anexo) — registro completo + tentativas de download ---');
  const da = await q(`Deals?$filter=Id eq ${os.Id}&$expand=Attachments`);
  const anexos = da.val?.[0]?.Attachments || [];
  const nf = anexos.find((x) => /(^|[\s_\-])nf([\s_\-.]|\d)/i.test(x.Name || '') || /nota.?fiscal/i.test(x.Name || ''));
  if (!nf) { L('  não achei a NF nos anexos.'); return; }
  L(`  NF: "${nf.Name}" | Id=${nf.Id} ItemId=${nf.ItemId} OrderId=${nf.OrderId ?? '-'} DocumentId=${nf.DocumentId ?? '-'}`);
  L('  todos os campos do registro:');
  for (const k of Object.keys(nf)) { const v = nf[k]; if (v != null && v !== '') L(`     ${k} = ${String(v).slice(0, 90)}`); }

  // tentativas de baixar o arquivo do anexo
  const tent = [
    ['Attachments(Id)/GetById', `Attachments(${nf.Id})/GetById`],
    ['AttachmentsItems(ItemId)', `AttachmentsItems(${nf.ItemId})`],
    ['AttachmentsItems?$filter=Id', `AttachmentsItems?$filter=Id eq ${nf.ItemId}&$top=1`],
    ['Attachments(Id)', `Attachments(${nf.Id})`],
  ];
  L('\n  tentativas:');
  for (const [rot, p] of tent) {
    const d = await q(p);
    let url = null; const obj = Array.isArray(d.val) ? d.val[0] : d.val;
    if (obj && typeof obj === 'object') url = obj.DocumentUrl || obj.Url || obj.FileUrl || null;
    L(`   [${rot}] -> HTTP ${d.status}${obj && typeof obj === 'object' ? ' | campos: ' + Object.keys(obj).slice(0, 16).join(',') : ''}${url ? ' | URL achada' : ''}`);
    if (url) { const r = await fetch(url); const b = await r.arrayBuffer(); L(`       baixar URL -> HTTP ${r.status} | ${r.headers.get('content-type')} | ${b.byteLength} bytes ${r.ok && b.byteLength > 500 ? '✅' : ''}`); break; }
    if (typeof d.raw === 'string' && /base64|"[A-Za-z0-9+/]{200,}"/.test(d.raw)) L('       (resposta parece conter Base64 do arquivo)');
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
