// Sonda SOMENTE-LEITURA: replica a lógica da LISTA de anexos do endpoint (expand
// Stage,Attachments + classificaAnexo) contra a OS real da ENEL, pra PROVAR que só a NF
// aparece e as 11 fotos/termo internos ficam escondidos. ENEL. A chave nunca é impressa.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, '');
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j }; };
const semAcentoLc = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function classificaAnexo(fileName) {
  const s = semAcentoLc(fileName);
  if (/(^|[\s_.\-])nf([\s_.\-]|\d)/.test(s) || /nota.?fiscal/.test(s)) return { cliente: true, rotulo: 'Nota Fiscal' };
  return { cliente: false };
}

async function main() {
  L('\n===== PROVA: lista de anexos só mostra a NF =====\n');
  const emp = await q(`Contacts?$filter=Register eq '${CNPJ}'&$top=1&$select=Id`);
  const cid = emp.val?.[0]?.Id; if (!cid) { L('sem empresa'); return; }
  const deals = await q(`Deals?$filter=ContactId eq ${cid}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties`);
  const os = (deals.val || []).find((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero)); if (!os) { L('sem OS'); return; }

  // Query EXATA do endpoint (dono + etapa + anexos numa chamada só).
  const own = await q(`Deals?$filter=Id eq ${os.Id} and ContactId eq ${cid}&$top=1&$expand=Stage,Attachments`);
  const deal = (own.val || [])[0];
  if (!deal) { L('⚠️ expand combinado Stage,Attachments falhou'); return; }
  const anexos = deal.Attachments || [];
  L(`OS [${os.Id}] | etapa "${deal.Stage?.Name}" | ${anexos.length} anexos\n`);
  let mostrados = 0, escondidos = 0;
  for (const a of anexos) {
    if (a.IsSensitiveData || a.Listable === false) { L(`  ESCONDE (flag) "${a.FileName || a.Name}"`); escondidos++; continue; }
    const c = classificaAnexo(a.FileName || a.Name);
    if (c.cliente) { L(`  MOSTRA  "${a.FileName || a.Name}"  → ${c.rotulo}`); mostrados++; }
    else { L(`  esconde "${a.FileName || a.Name}"`); escondidos++; }
  }
  L(`\n  Resultado: ${mostrados} mostrado(s), ${escondidos} escondido(s).`);
  L(mostrados === 1 ? '  ✅ Só a NF aparece — as fotos/termo internos ficam escondidos.' : '  ⚠️ Revisar: esperava só a NF.');
  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
