// Cria (se ainda não existir) a "marcação de contrato" no cadastro de EMPRESA do
// Ploomes, para o portão de acesso do Portal:
//   - "Contrato ativo?"                 (Sim/Não  -> TypeId 10)
//   - "Data de encerramento do contrato" (data     -> TypeId 8)
//
// SEGURANÇA: 2 etapas. Por padrão roda em SIMULAÇÃO (dry-run) — só LÊ e diz o que
// faria. Só cria de fato quando APLICAR=1. É idempotente: se o campo já existir
// (por nome), não recria. A chave vem do segredo PLOOMES_USER_KEY; nunca é impressa.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const APLICAR = process.env.APLICAR === '1';

if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function api(path, opts = {}) {
  const url = `${BASE}/${path.replace(/^\/+/, '')}`.replace(/ /g, '%20');
  const r = await fetch(url, { headers: H, ...opts });
  const t = await r.text();
  let body = null; try { body = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body, text: t };
}

async function main() {
  const out = { modo: APLICAR ? 'APLICAR (cria de fato)' : 'SIMULAÇÃO (dry-run, só leitura)', contatoEntityId: null, acoes: [] };

  // 1) Descobrir o EntityId do cadastro de contato/empresa a partir de um campo "contact_*".
  let sample = null;
  let s = await api("Fields?$filter=startswith(Key,'contact')&$top=1");
  if (s.ok && s.body?.value?.length) {
    sample = s.body.value[0];
  } else {
    const all = await api('Fields?$top=2000');
    sample = (all.body?.value || []).find((f) => String(f.Key || '').startsWith('contact')) || null;
    if (!all.ok) out.avisoFields = `Fields status ${all.status}: ${String(all.text).slice(0, 160)}`;
  }
  out.contatoEntityId = sample?.EntityId ?? null;
  out.amostraCampoContato = sample; // objeto completo — mostra o "molde" de um campo

  if (out.contatoEntityId == null) {
    out.erro = 'Não consegui descobrir o EntityId do cadastro de contato/empresa.';
    return console.log(JSON.stringify(out, null, 2));
  }

  // 2) Campos existentes desse cadastro (para não duplicar).
  const existing = await api(`Fields?$filter=EntityId eq ${out.contatoEntityId}&$top=500`);
  const campos = existing.body?.value || [];
  out.totalCamposDoContato = campos.length;
  out.jaComContrato = campos.filter((f) => /contrato/i.test(f.Name || '')).map((f) => ({ Id: f.Id, Name: f.Name, TypeId: f.TypeId }));
  const nomesExistentes = new Set(campos.map((f) => String(f.Name || '').trim().toLowerCase()));

  // 3) Criar os que faltam.
  const alvo = [
    { Name: 'Contrato ativo?', TypeId: 10 },              // 10 = Sim/Não (checkbox)
    { Name: 'Data de encerramento do contrato', TypeId: 8 }, // 8 = data
  ];
  for (const c of alvo) {
    if (nomesExistentes.has(c.Name.toLowerCase())) { out.acoes.push({ campo: c.Name, resultado: 'já existe' }); continue; }
    if (!APLICAR) { out.acoes.push({ campo: c.Name, resultado: 'criaria (simulação)', payload: { Name: c.Name, EntityId: out.contatoEntityId, TypeId: c.TypeId } }); continue; }
    const cr = await api('Fields', { method: 'POST', body: JSON.stringify({ Name: c.Name, EntityId: out.contatoEntityId, TypeId: c.TypeId }) });
    out.acoes.push({ campo: c.Name, resultado: cr.ok ? 'CRIADO' : `ERRO ${cr.status}`, detalhe: cr.ok ? (cr.body?.value?.[0]?.Id ?? 'ok') : String(cr.text).slice(0, 250) });
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
