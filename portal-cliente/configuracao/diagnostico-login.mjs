// Diagnóstico do login (SOMENTE LEITURA). Descobre, sem adivinhar e sem depender
// de ninguém, as 3 coisas que faltam para acertar o portão de acesso do Portal:
//
//   (1) A DEFINIÇÃO dos campos de contrato (277451 "Contrato Ativo?" e 365984
//       "Data de encerramento") — tipo do campo e, se for lista, as opções.
//   (2) Um CLIENTE REAL que tenha o "Contrato Ativo?" marcado, mostrando o
//       formato do valor (BoolValue? StringValue? OptionId?).
//   (3) A CADEIA pessoa -> empresa -> e-mail: como o e-mail de uma pessoa se liga
//       à empresa que guarda o contrato.
//
// PRIVACIDADE: minimiza dados pessoais. Não imprime nome/telefone. E-mails saem
// SEMPRE mascarados (ex.: "ab***@dominio.com"). Os valores de contrato são
// configuração da empresa (não são dado pessoal) e saem crus para eu ler o formato.
//
// Opcional: se a env EMAIL vier preenchida, também traça aquele e-mail específico.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const EMAIL = String(process.env.EMAIL || '').trim().toLowerCase();
const F_ATIVO = Number(process.env.F_ATIVO || 277451); // "Contrato Ativo?"
const F_FIM = Number(process.env.F_FIM || 365984);     // "Data de encerramento do contrato"

if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };

async function api(p) {
  const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H });
  const t = await r.text();
  let b = null; try { b = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body: b, text: t };
}
function prop(c, id) { return (c?.OtherProperties || []).find((p) => Number(p.FieldId) === id) || null; }
function mascara(email) {
  const e = String(email || '');
  const at = e.indexOf('@');
  if (at < 1) return e ? '***' : '';
  const u = e.slice(0, at), d = e.slice(at);
  return (u.length <= 2 ? u[0] + '***' : u.slice(0, 2) + '***') + d;
}
// Resume um valor de OtherProperty a todos os "slots" preenchidos, para eu ver o formato.
function slots(p) {
  if (!p) return null;
  const s = {};
  for (const k of Object.keys(p)) {
    if (/Value$/.test(k) || k === 'OptionId' || k === 'FieldId') {
      if (p[k] !== null && p[k] !== undefined) s[k] = p[k];
    }
  }
  return s;
}

async function definicaoCampo(id) {
  const r = await api(`Fields?$filter=Id eq ${id}`);
  const f = r.body?.value?.[0];
  if (!f) return { Id: id, encontrado: false, status: r.status };
  const out = { Id: f.Id, Name: f.Name, TypeId: f.TypeId, EntityId: f.EntityId };
  // Se for lista de opções, traz as opções (revela qual OptionId é "Sim").
  const opt = await api(`Fields?$filter=Id eq ${id}&$expand=Options`);
  const options = opt.body?.value?.[0]?.Options;
  if (Array.isArray(options) && options.length) {
    out.opcoes = options.map((o) => ({ Id: o.Id, Name: o.Name ?? o.StringValue ?? null }));
  }
  return out;
}

async function main() {
  const out = {};

  // (1) DEFINIÇÃO dos dois campos de contrato.
  out.definicoes = {
    contratoAtivo: await definicaoCampo(F_ATIVO),
    dataEncerramento: await definicaoCampo(F_FIM),
  };

  // (2) CLIENTE REAL com o "Contrato Ativo?" preenchido. Tenta filtro server-side;
  //     se o Ploomes não aceitar 'any' em OtherProperties, cai para varredura.
  let exemplos = [];
  let modoBusca = 'any';
  const rAny = await api(`Contacts?$filter=OtherProperties/any(o: o/FieldId eq ${F_ATIVO})&$top=5&$expand=OtherProperties`);
  if (rAny.ok && Array.isArray(rAny.body?.value)) {
    exemplos = rAny.body.value;
  } else {
    modoBusca = `varredura (any falhou: status ${rAny.status})`;
    const rScan = await api(`Contacts?$filter=TypeId eq 2&$top=300&$expand=OtherProperties`);
    const lista = Array.isArray(rScan.body?.value) ? rScan.body.value : [];
    exemplos = lista.filter((c) => prop(c, F_ATIVO)).slice(0, 5);
    out.varreduraStatus = rScan.status;
  }
  out.buscaExemplos = { modo: modoBusca, encontrados: exemplos.length };
  out.exemplos = exemplos.map((c) => ({
    Id: c.Id,
    TypeId: c.TypeId,
    temEmailProprio: !!c.Email,
    contratoAtivo_slots: slots(prop(c, F_ATIVO)),   // <- revela BoolValue / StringValue / OptionId
    dataEncerramento_slots: slots(prop(c, F_FIM)),
  }));

  // (3) CADEIA pessoa -> empresa -> e-mail, a partir do 1º exemplo que seja empresa.
  const empresa = exemplos.find((c) => Number(c.TypeId) === 2) || exemplos[0];
  if (empresa) {
    const rp = await api(`Contacts?$filter=CompanyId eq ${Number(empresa.Id)}&$top=5&$select=Id,TypeId,Email,CompanyId`);
    const pessoas = Array.isArray(rp.body?.value) ? rp.body.value : [];
    out.cadeia = {
      empresaId: empresa.Id,
      empresaTemEmailProprio: !!empresa.Email,
      empresaEmailMascarado: mascara(empresa.Email),
      pessoasVinculadas: pessoas.length,
      status: rp.status,
      amostraPessoas: pessoas.map((p) => ({ Id: p.Id, TypeId: p.TypeId, temEmail: !!p.Email, emailMascarado: mascara(p.Email) })),
    };
  } else {
    out.cadeia = { aviso: 'nenhum exemplo de empresa com contrato encontrado' };
  }

  // (Opcional) Traço de um e-mail específico, se pedido — corrige o caso TypeId 2 + CompanyId.
  if (EMAIL) {
    const esc = EMAIL.replaceAll("'", "''");
    const rE = await api(`Contacts?$filter=Email eq '${encodeURIComponent(esc)}'&$top=1&$expand=OtherProperties`);
    const pessoa = rE.body?.value?.[0];
    if (!pessoa) {
      out.emailTracado = { email: mascara(EMAIL), encontrada: false, status: rE.status };
    } else {
      const candidatosIds = [pessoa.CompanyId, Number(pessoa.TypeId) === 2 ? pessoa.Id : null, pessoa.LastCompanyId]
        .filter((x) => x != null).filter((v, i, a) => a.indexOf(v) === i);
      const candidatos = [];
      for (const id of candidatosIds) {
        const rc = await api(`Contacts?$filter=Id eq ${Number(id)}&$top=1&$expand=OtherProperties`);
        const emp = rc.body?.value?.[0];
        if (emp) candidatos.push({ Id: emp.Id, TypeId: emp.TypeId, contratoAtivo_slots: slots(prop(emp, F_ATIVO)), dataEncerramento_slots: slots(prop(emp, F_FIM)) });
      }
      out.emailTracado = {
        email: mascara(EMAIL),
        pessoa: { Id: pessoa.Id, TypeId: pessoa.TypeId, CompanyId: pessoa.CompanyId ?? null, LastCompanyId: pessoa.LastCompanyId ?? null },
        empresasCandidatas: candidatos,
      };
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
