// Read-only: pega o que falta pra criar o webhook do aviso:
//  - EntityId de "Negócio" (Deal) e os códigos de Ação (WebhooksActions: criar/atualizar).
//  - Id do cadastro do Marcio (contato de teste do canário) pelo e-mail.
// A chave nunca é impressa.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const EMAIL_TESTE = (process.env.EMAIL_TESTE || 'marcio@ecobraz.org.br').trim();
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

async function main() {
  L('\n===== IDs pra ligar o aviso =====\n');

  L('--- Entidades permitidas (achar "Negócio"/Deal) ---');
  for (const ent of ['AutomationsAllowedEntities', 'WebhooksActions', 'AutomationsTriggers']) {
    const d = await q(`${ent}?$top=60`);
    if (!d.ok) { L(`  [${ent}] HTTP ${d.status}`); continue; }
    const arr = Array.isArray(d.val) ? d.val : [];
    L(`  [${ent}] ${arr.length} itens:`);
    for (const it of arr) L(`     ${JSON.stringify(it).slice(0, 160)}`);
  }

  L(`\n--- Cadastro do Marcio (contato de teste) por e-mail: ${EMAIL_TESTE} ---`);
  const c = await q(`Contacts?$filter=Email eq '${EMAIL_TESTE}'&$top=5&$select=Id,Name,Email,TypeId`);
  const arr = Array.isArray(c.val) ? c.val : [];
  if (!arr.length) L('  (não achei por esse e-mail — me diga o e-mail do seu cadastro no Ploomes)');
  for (const x of arr) L(`  • Id=${x.Id} | ${x.Name} | ${x.Email} | TypeId=${x.TypeId}`);

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
