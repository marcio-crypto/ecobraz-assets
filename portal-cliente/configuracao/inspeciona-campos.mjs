// Lista (SOMENTE LEITURA) os campos do cadastro de CONTATO/EMPRESA do Ploomes cujo
// nome fala de contrato/vigência, com Id, Nome e TypeId. Serve para achar o campo
// certo de "fim do contrato" (ex.: "Termino de Contrato") e apontar o Portal para ele.
// Não lê dados pessoais — só a definição dos campos.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const PADRAO = new RegExp(process.env.PADRAO || 'contrato|termino|térmi|encerr|vig[êe]ncia|pagante', 'i');

async function api(path) {
  const r = await fetch(`${BASE}/${path}`.replace(/ /g, '%20'), { headers: H });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body: b, text: t };
}

async function main() {
  // EntityId 1 = Contatos (pessoas e empresas). Traz todos os campos e filtra por nome.
  const r = await api('Fields?$filter=EntityId eq 1&$top=500');
  const campos = Array.isArray(r.body?.value) ? r.body.value : [];
  const out = { status: r.status, totalCamposContato: campos.length };
  out.relacionadosAContrato = campos
    .filter((f) => PADRAO.test(String(f.Name || '')))
    .map((f) => ({ Id: f.Id, Name: f.Name, TypeId: f.TypeId }));
  if (!campos.length) out.brutoTrecho = String(r.text).slice(0, 300);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
