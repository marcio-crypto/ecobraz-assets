// Inspeção SOMENTE-LEITURA para destravar (1) DOWNLOAD dos documentos e (3) OS/documentos
// PREENCHIDOS CORRETAMENTE. Usa uma OS REAL já finalizada de um cliente-exemplo autorizado
// (ENEL, passado pela Débora) para descobrir, com FATO:
//   a) Como os DOCUMENTOS (CDF, NF, MTR, Carta) ficam ligados à OS (qual nav/rota funciona)
//      e como se baixa (DocumentUrl / Key / Share / Base64).
//   b) TODOS os campos (OtherProperties) que uma OS carrega — para o Portal preencher os
//      certos (endereço de coleta, etc.), e os documentos saírem corretos.
// Read-only: não cria, não altera, não apaga. A chave nunca é impressa.

import { valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const CNPJ = (process.env.CNPJ_ALVO || '61695227000193').replace(/\D/g, ''); // ENEL (autorizado)
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const fmt = (d) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

async function api(pathQ) {
  const raw = pathQ.startsWith('http') ? pathQ : `${BASE}/${pathQ.replace(/^\/+/, '')}`;
  const r = await fetch(raw.replace(/ /g, '%20'), { headers: H });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${t.slice(0, 120)}`); e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { throw new Error('não-JSON'); }
}
const tryApi = async (q) => { try { return await api(q); } catch (e) { return { __erro: e.message }; } };

async function main() {
  L('\n===== DOCUMENTOS + CAMPOS DA OS (somente leitura) =====');
  L('Base:', BASE, '| CNPJ exemplo:', fmt(CNPJ), '\n');

  // 0) $metadata: navegações de DealSimpleView (o que dá pra $expand) + sets de documento/anexo.
  L('--- 0) $metadata: navegações da OS (Deal) e entidades de documento/anexo ---');
  try {
    const xml = await (await fetch(`${BASE}/$metadata`, { headers: H })).text();
    const bloco = xml.match(/<EntityType Name="DealSimpleView"[\s\S]*?<\/EntityType>/);
    const navs = bloco ? [...bloco[0].matchAll(/<NavigationProperty Name="([^"]+)"/g)].map((m) => m[1]) : [];
    L('  navegações do Deal:', navs.join(', ') || '(não achei)');
    const navsDoc = navs.filter((n) => /doc|order|attach|anexo|file|arquivo|quote/i.test(n));
    L('  → candidatas a documentos/anexos:', navsDoc.join(', ') || '(nenhuma óbvia)');
  } catch (e) { L('  $metadata falhou:', String(e.message).slice(0, 80)); }

  // 1) Achar a empresa e UMA OS finalizada (com número).
  const emp = await tryApi(`Contacts?$filter=Register eq '${CNPJ}'&$top=1`);
  const empresa = (emp.value || [])[0];
  if (!empresa) { L('\n⚠️ não achei a empresa por Register. Fim.'); return; }
  L(`\n--- 1) Empresa: [${empresa.Id}] ${empresa.Name} ---`);
  const deals = await tryApi(`Deals?$filter=ContactId eq ${empresa.Id}&$top=40&$orderby=CreateDate desc&$expand=OtherProperties,Stage`);
  const finalizadas = (deals.value || []).filter((d) => valorProp(d.OtherProperties, CAMPOS_OS.numero));
  const alvo = finalizadas[0] || (deals.value || [])[0];
  if (!alvo) { L('  (sem negócios)'); return; }
  L(`  OS alvo: [${alvo.Id}] "${String(alvo.Title).slice(0, 45)}" | etapa "${alvo.Stage?.Name}" | Nº ${valorProp(alvo.OtherProperties, CAMPOS_OS.numero) || '-'}`);

  // 2) TODOS os campos da OS (pra preencher os certos a partir do Portal).
  L('\n--- 2) Campos (OtherProperties) da OS — nome do campo e valor ---');
  for (const p of (alvo.OtherProperties || [])) {
    const v = p.StringValue ?? p.DateTimeValue ?? p.DateValue ?? p.DecimalValue ?? p.IntegerValue ?? p.BoolValue ?? p.BigStringValue;
    if (v == null || v === '') continue;
    L(`   ${p.FieldKey || p.FieldId} = ${String(v).slice(0, 50)}`);
  }

  // 3) DOCUMENTOS ligados à OS — qual caminho funciona + como baixar.
  L('\n--- 3) Documentos ligados à OS (tentativas) ---');
  const tentDoc = [
    `Documents?$filter=DealId eq ${alvo.Id}&$top=5`,
    `Documents?$filter=Deal/Id eq ${alvo.Id}&$top=5`,
    `Deals?$filter=Id eq ${alvo.Id}&$expand=Documents`,
    `Deals?$filter=Id eq ${alvo.Id}&$expand=Orders`,
    `Orders?$filter=DealId eq ${alvo.Id}&$top=5`,
  ];
  for (const q of tentDoc) {
    const d = await tryApi(q);
    if (d.__erro) { L(`  [${q.split('?')[0]} ${q.includes('expand') ? q.split('expand=')[1] : ''}] -> ${d.__erro.slice(0, 55)}`); continue; }
    let docs = d.value || [];
    if (docs[0] && (docs[0].Documents || docs[0].Orders)) docs = docs[0].Documents || docs[0].Orders || [];
    L(`  [${q.split('?')[0]} ${q.includes('expand') ? '$expand=' + q.split('expand=')[1] : ''}] -> ${Array.isArray(docs) ? docs.length : '?'} doc(s)`);
    const ex = Array.isArray(docs) ? docs[0] : null;
    if (ex) {
      L(`     campos do doc: ${Object.keys(ex).filter((k) => k !== 'OtherProperties').slice(0, 20).join(', ')}`);
      for (const k of ['Id', 'Name', 'DocumentUrl', 'Key', 'Shared', 'TypeId', 'DocumentTypeId']) if (ex[k] != null) L(`       ${k}: ${String(ex[k]).slice(0, 70)}`);
    }
  }

  // 4) ANEXOS (NF/MTR) ligados — AttachmentsItems / pastas.
  L('\n--- 4) Anexos (NF/MTR) ligados à OS (tentativas) ---');
  for (const q of [
    `AttachmentsItems?$filter=DealId eq ${alvo.Id}&$top=5`,
    `AttachmentsFolders?$filter=DealId eq ${alvo.Id}&$top=5`,
    `Deals?$filter=Id eq ${alvo.Id}&$expand=Attachments`,
  ]) {
    const d = await tryApi(q);
    if (d.__erro) { L(`  [${q.split('?')[0]}] -> ${d.__erro.slice(0, 55)}`); continue; }
    let it = d.value || [];
    if (it[0] && it[0].Attachments) it = it[0].Attachments;
    L(`  [${q.split('?')[0]}] -> ${Array.isArray(it) ? it.length : '?'} item(ns)${it[0] ? ' | campos: ' + Object.keys(it[0]).slice(0, 14).join(',') : ''}`);
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
