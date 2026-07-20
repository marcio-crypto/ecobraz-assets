// Inspeciona a DEFINIÇÃO de campos do Ploomes (somente leitura) para comparar por
// que um campo aparece no formulário e outro não. Não lê dados pessoais — só a
// configuração dos campos. IDs via env CAMPOS (padrão: o campo novo de data e o
// "Contrato Ativo?" que já aparece).

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };

async function api(path) {
  const r = await fetch(`${BASE}/${path}`.replace(/ /g, '%20'), { headers: H });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body: b, text: t };
}

async function main() {
  const ids = String(process.env.CAMPOS || '365984,277451').split(',').map((s) => s.trim()).filter(Boolean);
  const filtro = ids.map((id) => `Id eq ${id}`).join(' or ');
  const r = await api(`Fields?$filter=${filtro}`);
  const campos = Array.isArray(r.body?.value) ? r.body.value : [];
  const out = { comparacao: ids.join(' x '), status: r.status, encontrados: campos.length };
  for (const c of campos) out[`campo_${c.Id}`] = c;
  if (!campos.length) out.brutoTrecho = String(r.text).slice(0, 300);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
