// Sonda: confirmar que criar o negócio com PipelineId + StageId cai na etapa
// "📄 Ordem de Serviço" (o que o Portal passa a fazer). Cria UM negócio de teste
// bem rotulado, lê a etapa de volta, e APAGA. A chave nunca é impressa.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const PIPE = Number(process.env.PORTAL_OS_PIPELINE_ID || 44259);
const STAGE = Number(process.env.PORTAL_OS_STAGE_ID || 199543);
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const HKEY = { 'User-Key': KEY };
const HJSON = { ...HKEY, 'content-type': 'application/json', Accept: 'application/json' };

async function main() {
  L('\n===== SONDA: criar OS na etapa certa =====');
  L(`Base: ${BASE} | PipelineId: ${PIPE} | StageId: ${STAGE}\n`);

  const cr = await fetch(`${BASE}/Deals`, {
    method: 'POST', headers: HJSON,
    body: JSON.stringify({ Title: '[TESTE-PORTAL-OS — pode apagar]', PipelineId: PIPE, StageId: STAGE }),
  });
  const crBody = await cr.text();
  if (!cr.ok) { L('  falhou ao criar:', cr.status, crBody.slice(0, 200)); L('\n===== FIM ====='); return; }
  let id = null; try { id = JSON.parse(crBody).value?.[0]?.Id ?? null; } catch {}
  L('  negócio de teste criado: Id =', id);
  if (!id) { L('  sem Id — aborta.'); return; }

  // Lê de volta pra confirmar em qual etapa/funil caiu.
  const rd = await fetch(`${BASE}/Deals(${id})?$expand=Stage,Pipeline`, { headers: HKEY });
  const rdBody = await rd.text();
  let dealLido = null; try { dealLido = JSON.parse(rdBody).value?.[0] ?? null; } catch {}
  if (dealLido) {
    L(`  → caiu em: funil "${dealLido.Pipeline?.Name || dealLido.PipelineId}" | etapa "${dealLido.Stage?.Name || dealLido.StageId}" (StageId ${dealLido.StageId})`);
    const ok = Number(dealLido.StageId) === STAGE;
    L(ok ? '  ✅ Etapa correta — a solicitação do Portal vira OS "Em atendimento" na hora.'
         : `  ⚠️ Caiu em outra etapa (esperado StageId ${STAGE}). Ver acima.`);
  } else L('  não consegui reler o negócio:', rd.status, rdBody.slice(0, 160));

  // Limpeza.
  const del = await fetch(`${BASE}/Deals(${id})`, { method: 'DELETE', headers: HKEY });
  L(`\n  DELETE Deals(${id}) -> HTTP ${del.status} ${del.ok ? '(apagado)' : '(NÃO apagou — peça pra Débora apagar "[TESTE-PORTAL-OS]")'}`);
  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
