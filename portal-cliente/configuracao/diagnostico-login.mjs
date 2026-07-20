// Diagnóstico do fluxo de login (somente leitura). Dado um e-mail, faz o caminho
// PESSOA -> EMPRESA vinculada -> campos de contrato da empresa, e mostra a
// ESTRUTURA (Ids, tipos, e como o "Contrato Ativo?" guarda o valor) para acertar
// a lógica do Portal. Minimiza dados pessoais: não imprime nome/telefone.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const EMAIL = String(process.env.EMAIL || 'debora.villanova@ecobraz.org.br').trim().toLowerCase();
const F_ATIVO = 277451; // "Contrato Ativo?"
const F_FIM = 365984;   // "Data de encerramento do contrato"

if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };

async function api(p) {
  const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body: b, text: t };
}
function prop(c, id) { return (c?.OtherProperties || []).find((p) => Number(p.FieldId) === id) || null; }

async function main() {
  const out = { emailTestado: EMAIL };
  const esc = EMAIL.replaceAll("'", "''");
  const rp = await api(`Contacts?$filter=Email eq '${encodeURIComponent(esc)}'&$top=1&$expand=OtherProperties`);
  const pessoa = rp.body?.value?.[0];
  if (!pessoa) { out.pessoa = { encontrada: false, status: rp.status }; return console.log(JSON.stringify(out, null, 2)); }

  // Mostra quais chaves da pessoa podem ligar à empresa (CompanyId? outra?).
  out.pessoa = {
    Id: pessoa.Id,
    TypeId: pessoa.TypeId,
    temEmail: !!pessoa.Email,
    CompanyId: pessoa.CompanyId ?? null,
    chavesQuePodemLigarAEmpresa: Object.keys(pessoa).filter((k) => /compan|empres|parent|matriz|holding/i.test(k)),
  };

  let empresa = null;
  if (Number(pessoa.TypeId) === 2) { empresa = pessoa; out.observacao = 'o proprio e-mail ja e de uma empresa'; }
  else if (pessoa.CompanyId) {
    const re = await api(`Contacts?$filter=Id eq ${Number(pessoa.CompanyId)}&$top=1&$expand=OtherProperties`);
    empresa = re.body?.value?.[0] || null;
    if (!empresa) out.observacao = `nao achei empresa por CompanyId=${pessoa.CompanyId} (status ${re.status})`;
  } else {
    out.observacao = 'pessoa sem CompanyId — ver chavesQuePodemLigarAEmpresa acima';
  }

  if (empresa) {
    out.empresa = {
      Id: empresa.Id,
      TypeId: empresa.TypeId,
      contratoAtivo_raw: prop(empresa, F_ATIVO),   // objeto completo -> mostra BoolValue / StringValue / opção
      dataEncerramento_raw: prop(empresa, F_FIM),
    };
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
