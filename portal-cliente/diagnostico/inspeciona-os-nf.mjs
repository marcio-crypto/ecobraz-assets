// Inspeção SOMENTE-LEITURA pra incluir com SEGURANÇA a OS e a NF no download:
//  - OS: fica na entidade `Orders` — mas ali também pode ter PROPOSTA (com preço). Preciso ver
//    como distinguir a OS da proposta (TemplateId? Nome? campo de tipo?).
//  - NF: fica nos ANEXOS — junto com imagens de controle interno. Preciso ver os nomes/tipos
//    dos anexos pra mostrar só a NF (e nunca imagem interna).
// Cliente-exemplo autorizado (ENEL). Read-only. A chave nunca é impressa.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, '');
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); return { ok: r.ok, status: r.status, val: (() => { try { return JSON.parse(t).value; } catch { return null; } })(), raw: t }; };

async function main() {
  L('\n===== OS (Orders) + NF (anexos): como separar do interno =====\n');
  const emp = await q(`Contacts?$filter=Register eq '${CNPJ}'&$top=1&$select=Id,Name`);
  const cliente = (emp.val || [])[0]; if (!cliente) { L('não achei a empresa; fim.'); return; }
  const deals = await q(`Deals?$filter=ContactId eq ${cliente.Id}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties`);
  const os = (deals.val || []).find((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero)) || (deals.val || [])[0];
  if (!os) { L('sem OS; fim.'); return; }
  L(`OS alvo: [${os.Id}] Nº ${valorProp(os.OtherProperties, CAMPOS_OS.numero) || '-'}\n`);

  // 1) ORDERS do negócio — ver todos e os campos que distinguem OS x Proposta.
  L('--- 1) Orders do negócio (achar como separar OS de PROPOSTA) ---');
  const ords = await q(`Orders?$filter=DealId eq ${os.Id}&$top=20&$expand=OtherProperties`);
  if (ords.__erro || !ords.val) L(`  (erro: ${ords.status} ${String(ords.raw).slice(0, 80)})`);
  else {
    L(`  ${ords.val.length} order(s):`);
    for (const o of ords.val) {
      L(`   • [${o.Id}] OrderNumber=${o.OrderNumber ?? '-'} | TemplateId=${o.TemplateId ?? '-'} | StageId=${o.StageId ?? '-'} | Amount=${o.Amount ?? '-'} | IsTemplate=${o.IsTemplate ?? '-'} | tem DocumentUrl=${o.DocumentUrl ? 'sim' : 'não'}`);
      const nomeCampos = (o.OtherProperties || []).map((p) => p.FieldKey).slice(0, 6).join(',');
      if (nomeCampos) L(`       OtherProperties: ${nomeCampos}`);
    }
    // Os templates existem? Ver nomes dos DocumentTemplates pra rotular OS vs Proposta.
    const tids = [...new Set((ords.val || []).map((o) => o.TemplateId).filter(Boolean))];
    for (const tid of tids.slice(0, 6)) {
      const t = await q(`DocumentTemplates?$filter=Id eq ${tid}&$top=1&$select=Id,Name`);
      L(`   template [${tid}] = "${(t.val || [])[0]?.Name || '?'}"`);
    }
  }

  // 2) ANEXOS do negócio — nomes/tipos, pra achar a NF e separar de imagem interna.
  L('\n--- 2) Anexos do negócio (achar a NF, separar de imagens internas) ---');
  const tent = [
    `Deals?$filter=Id eq ${os.Id}&$expand=AttachmentsItems`,
    `AttachmentsItems?$filter=DealId eq ${os.Id}&$top=30`,
    `Deals?$filter=Id eq ${os.Id}&$expand=Attachments`,
  ];
  for (const t of tent) {
    const d = await q(t);
    if (!d.ok) { L(`  [${t.split('?')[0]} ${t.includes('expand') ? t.split('expand=')[1] : ''}] -> HTTP ${d.status} ${String(d.raw).slice(0, 60)}`); continue; }
    let itens = d.val || [];
    if (itens[0] && (itens[0].AttachmentsItems || itens[0].Attachments)) itens = itens[0].AttachmentsItems || itens[0].Attachments || [];
    L(`  [${t.split('?')[0]} ${t.includes('expand') ? '$expand=' + t.split('expand=')[1] : ''}] -> ${Array.isArray(itens) ? itens.length : '?'} item(ns)`);
    for (const it of (Array.isArray(itens) ? itens : []).slice(0, 15)) {
      const nome = it.Name || it.FileName || it.Title || it.Description || '(sem nome)';
      const campos = Object.keys(it).slice(0, 12).join(',');
      L(`     • ${String(nome).slice(0, 45)}  | campos: ${campos}`);
    }
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
