// Inspeção SOMENTE-LEITURA do que uma "Solicitação de coleta" do Portal virou no
// Ploomes — para acertar o fluxo "abrir OS → aparece sozinha pro cliente".
//
// Responde, com FATO (não chute):
//   1) O(s) negócio(s) criados pelo Portal ("[Portal] Solicitação de coleta") — em
//      qual funil/etapa caíram, se ganharam Número de OS e se têm documento ligado.
//   2) As etapas (com IDs) de cada funil — pra sabermos a StageId da "Ordem de Serviço".
//   3) Uma OS real já existente (com número) — em que etapa está e se tem documento,
//      pra entender ONDE o número/documentos aparecem.
//
// Read-only: não cria, não altera, não apaga. A chave nunca é impressa.

import { statusDaEtapa, valorProp, CAMPOS_OS } from '../worker/src/os-utils.js';

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };

async function api(pathQ) {
  const raw = pathQ.startsWith('http') ? pathQ : `${BASE}/${pathQ.replace(/^\/+/, '')}`;
  const r = await fetch(raw.replace(/ /g, '%20'), { headers: H });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`); e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { throw new Error('resposta não-JSON'); }
}
const tryApi = async (q) => { try { return await api(q); } catch (e) { return { __erro: e.message }; } };

async function main() {
  L('\n===== O QUE A "SOLICITAÇÃO DE COLETA" VIROU NO PLOOMES (somente leitura) =====\n');

  // 1) Negócios criados pelo Portal.
  L('--- 1) Negócios "[Portal] Solicitação de coleta" (mais recentes) ---');
  let portalDeals = [];
  const c = await tryApi(`Deals?$filter=contains(Title,'[Portal]')&$orderby=CreateDate desc&$top=8&$expand=OtherProperties,Pipeline,Stage,Status`);
  if (!c.__erro) portalDeals = c.value || [];
  else {
    L(`  (contains falhou: ${c.__erro.slice(0, 70)} — pegando os mais recentes e filtrando aqui)`);
    const r = await tryApi(`Deals?$orderby=CreateDate desc&$top=40&$expand=OtherProperties,Pipeline,Stage,Status`);
    portalDeals = (r.value || []).filter((d) => String(d.Title || '').includes('[Portal]'));
  }
  if (!portalDeals.length) L('  (nenhum negócio do Portal encontrado)');
  for (const d of portalDeals.slice(0, 8)) {
    L(`\n  • [${d.Id}] "${String(d.Title).slice(0, 55)}"`);
    L(`     funil: ${d.Pipeline?.Name || d.PipelineId} | etapa: ${d.Stage?.Name || d.StageId} | status Ploomes: ${d.Status?.Name || d.StatusId} | criado ${(d.CreateDate || '').slice(0, 16)}`);
    L(`     → no PAINEL: status "${statusDaEtapa(d.Stage?.Name)}" | Nº OS: ${valorProp(d.OtherProperties, CAMPOS_OS.numero) || '(sem número)'}`);
    const ord = await tryApi(`Orders?$filter=DealId eq ${d.Id}&$top=3&$select=Id,Name`);
    L(`     documentos (Orders) ligados: ${ord.__erro ? 'erro/' + ord.__erro.slice(0, 40) : (ord.value || []).length}`);
  }

  // 2) Funis e etapas (IDs) — pra saber a StageId da "Ordem de Serviço".
  L('\n\n--- 2) Funis e etapas (IDs) ---');
  const pipes = await tryApi(`Pipelines?$expand=Stages&$top=20`);
  if (pipes.__erro) L('  (Pipelines indisponível: ' + pipes.__erro.slice(0, 70) + ')');
  else for (const p of pipes.value || []) {
    const stages = (p.Stages || []).slice().sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));
    L(`\n  Funil [${p.Id}] ${p.Name}:`);
    for (const s of stages) L(`     - etapa [${s.Id}] "${s.Name}"  → painel: ${statusDaEtapa(s.Name)}`);
  }

  // 3) Uma OS real com número — onde vive o número e se tem documento.
  L('\n\n--- 3) Uma OS real já existente (com número) ---');
  const comNum = await tryApi(`Deals?$filter=OtherProperties/any(p: p/FieldKey eq '${CAMPOS_OS.numero}' and p/StringValue ne null)&$orderby=CreateDate desc&$top=3&$expand=OtherProperties,Pipeline,Stage`);
  if (comNum.__erro) L('  (filtro por número falhou: ' + comNum.__erro.slice(0, 80) + ')');
  else for (const d of (comNum.value || [])) {
    L(`  • [${d.Id}] Nº OS ${valorProp(d.OtherProperties, CAMPOS_OS.numero)} | funil ${d.Pipeline?.Name} | etapa "${d.Stage?.Name}"`);
    const ord = await tryApi(`Orders?$filter=DealId eq ${d.Id}&$top=5&$select=Id,Name`);
    L(`     documentos (Orders): ${ord.__erro ? 'erro' : (ord.value || []).length}${!ord.__erro && (ord.value || [])[0] ? ' (ex.: ' + (ord.value[0].Name || ord.value[0].Id) + ')' : ''}`);
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
