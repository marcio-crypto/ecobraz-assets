// Sonda SOMENTE-LEITURA: achar o caminho de DOWNLOAD de um anexo (a NF). Dumpa o registro
// completo do anexo (link) e do item (AttachmentsItems) pra achar o campo com a URL/arquivo,
// e tenta baixar. ENEL. A chave nunca é impressa.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, '');
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };
const dump = (obj, pre = '     ') => { for (const k of Object.keys(obj || {})) { const v = obj[k]; if (v == null || v === '' || typeof v === 'object') continue; L(`${pre}${k} = ${String(v).slice(0, 95)}`); } };
const achaNome = (o) => o?.Name || o?.FileName || o?.Title || o?.Description || o?.OriginalName || '';

async function main() {
  L('\n===== CAMINHO DE DOWNLOAD DO ANEXO (NF) =====\n');
  const emp = await q(`Contacts?$filter=Register eq '${CNPJ}'&$top=1&$select=Id`);
  const cid = emp.val?.[0]?.Id; if (!cid) { L('sem empresa'); return; }
  const deals = await q(`Deals?$filter=ContactId eq ${cid}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties`);
  const os = (deals.val || []).find((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero)); if (!os) { L('sem OS'); return; }
  L(`OS [${os.Id}] Nº ${valorProp(os.OtherProperties, CAMPOS_OS.numero)}\n`);

  const da = await q(`Deals?$filter=Id eq ${os.Id}&$expand=Attachments`);
  const anexos = da.val?.[0]?.Attachments || [];
  L(`${anexos.length} anexos. Procurando a NF...\n`);
  const nf = anexos.find((a) => /(^|[\s_\-])nf|nota.?fiscal/i.test(achaNome(a))) || anexos[0];
  L(`Anexo escolhido: "${achaNome(nf)}"`);
  L('  REGISTRO COMPLETO (link):');
  dump(nf);

  // O arquivo em si costuma estar em AttachmentsItems (por ItemId). Dumpa e procura URL.
  const itemId = nf.ItemId;
  L(`\n  AttachmentsItems(${itemId}):`);
  for (const p of [`AttachmentsItems(${itemId})`, `AttachmentsItems?$filter=Id eq ${itemId}&$top=1`]) {
    const d = await q(p);
    const obj = Array.isArray(d.val) ? d.val[0] : d.val;
    L(`   [${p.split('?')[0]}] -> HTTP ${d.status}`);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) { dump(obj);
      const url = obj.DocumentUrl || obj.Url || obj.FileUrl || obj.Path || null;
      if (url) { const r = await fetch(url); const b = await r.arrayBuffer(); L(`     ↳ baixar URL -> HTTP ${r.status} | ${r.headers.get('content-type')} | ${b.byteLength} bytes ${r.ok && b.byteLength > 500 ? '✅' : ''}`); }
      break;
    }
  }

  // Alternativas: endpoints diretos de download por Id do anexo.
  L('\n  Endpoints diretos:');
  for (const p of [`Attachments(${nf.Id})/GetById`, `Attachments(${nf.Id})`, `Attachments(${nf.Id})/Base64`]) {
    const d = await q(p);
    const obj = Array.isArray(d.val) ? d.val[0] : d.val;
    const url = obj && typeof obj === 'object' ? (obj.DocumentUrl || obj.Url || obj.FileUrl) : null;
    const temB64 = typeof d.raw === 'string' && /[A-Za-z0-9+/]{300,}={0,2}/.test(d.raw);
    L(`   [${p}] -> HTTP ${d.status}${obj && typeof obj === 'object' && !Array.isArray(obj) ? ' | campos: ' + Object.keys(obj).slice(0, 16).join(',') : ''}${url ? ' | URL!' : ''}${temB64 ? ' | parece Base64 do arquivo' : ''}`);
    if (url) { const r = await fetch(url); const b = await r.arrayBuffer(); L(`     ↳ baixar -> HTTP ${r.status} | ${b.byteLength} bytes`); }
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
