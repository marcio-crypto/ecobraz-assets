// Inspeção SOMENTE-LEITURA: descobrir se dá pra CRIAR o aviso automático pela API do Ploomes
// (entidade Webhooks / Automations) — schema, exemplos existentes e eventos suportados.
// Sem isso não dá pra "ligar" o e-mail de aviso por fora. A chave nunca é impressa.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {} return { ok: r.ok, status: r.status, val: j?.value ?? j, raw: t }; };

async function main() {
  L('\n===== PLOOMES: dá pra criar o aviso (webhook) pela API? =====\n');

  // 1) $metadata: entidades e tipos ligados a webhook/automation/notification.
  L('--- 1) $metadata: entidades relacionadas ---');
  try {
    const xml = await (await fetch(`${BASE}/$metadata`, { headers: H })).text();
    const sets = [...new Set([...xml.matchAll(/EntitySet Name="([^"]+)"/g)].map((m) => m[1]))];
    const rel = sets.filter((n) => /webhook|hook|automation|automa|notif|trigger|subscription/i.test(n));
    L('  EntitySets relacionados:', rel.join(', ') || '(nenhum óbvio)');
    // schema do tipo Webhook (campos que a gente precisa preencher)
    for (const nome of ['WebhookSimpleView', 'Webhook', 'WebHook', 'AutomationSimpleView', 'Automation']) {
      const re = new RegExp(`<EntityType Name="${nome}"[\\s\\S]*?<\\/EntityType>`);
      const m = xml.match(re);
      if (m) { const props = [...m[0].matchAll(/<Property Name="([^"]+)" Type="([^"]+)"/g)].map((x) => `${x[1]}:${x[2].replace('Edm.', '')}`); L(`\n  Campos de ${nome}: ${props.join(', ')}`); }
    }
  } catch (e) { L('  $metadata falhou:', String(e.message).slice(0, 90)); }

  // 2) Webhooks já existentes (formato real + se a leitura é permitida).
  L('\n--- 2) Webhooks existentes ---');
  for (const ent of ['Webhooks', 'WebHooks']) {
    const d = await q(`${ent}?$top=5`);
    if (d.ok) {
      const arr = Array.isArray(d.val) ? d.val : [];
      L(`  [${ent}] OK — ${arr.length} webhook(s).`);
      for (const w of arr) L(`     • ${JSON.stringify(w).slice(0, 300)}`);
      if (!arr.length) L('     (nenhum cadastrado ainda)');
      break;
    } else L(`  [${ent}] -> HTTP ${d.status} ${String(d.raw).slice(0, 80)}`);
  }

  // 3) Existe "Automations"? (alternativa)
  L('\n--- 3) Automations (alternativa) ---');
  for (const ent of ['Automations', 'Automation']) {
    const d = await q(`${ent}?$top=3`);
    L(`  [${ent}] -> HTTP ${d.status}${d.ok ? ' (existe)' : ''}`);
    if (d.ok) break;
  }

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha:', e?.message || e); process.exit(1); });
