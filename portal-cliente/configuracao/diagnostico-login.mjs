// AUTOTESTE do portão de acesso do Portal (SOMENTE LEITURA).
//
// Prova, em dados REAIS e sem enviar e-mail nenhum, que a regra de acesso do
// Worker funciona de ponta a ponta:
//   1) confirma o formato dos campos de contrato (277451 Sim/Não, 365984 data);
//   2) acha um CLIENTE REAL com "Contrato Ativo? = Sim";
//   3) descobre a PESSOA vinculada (e o e-mail dela) — como no login de verdade;
//   4) roda a MESMA lógica do Worker (achar contato -> candidatos -> contrato)
//      e diz se LIBERARIA o acesso.
//
// PRIVACIDADE: não imprime nome/telefone; e-mails saem SEMPRE mascarados. Os
// valores de contrato são configuração da empresa (não são dado pessoal).
//
// Opcional: env EMAIL testa um e-mail específico em vez de escolher automático.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const EMAIL = String(process.env.EMAIL || '').trim().toLowerCase();
const F_ATIVO = Number(process.env.F_ATIVO || 277451); // "Contrato Ativo?" (Sim/Não)
const F_FIM = Number(process.env.F_FIM || 366005);     // "Termino de Contrato" (data no formulário)
const HOJE = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

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
  const e = String(email || ''); const at = e.indexOf('@');
  if (at < 1) return e ? '***' : '';
  const u = e.slice(0, at), d = e.slice(at);
  return (u.length <= 2 ? u[0] + '***' : u.slice(0, 2) + '***') + d;
}
async function contatoPorId(id) {
  const r = await api(`Contacts?$filter=Id eq ${Number(id)}&$top=1&$expand=OtherProperties`);
  return r.body?.value?.[0] || null;
}
async function contatoPorEmail(email) {
  const esc = email.replaceAll("'", "''");
  const r = await api(`Contacts?$filter=Email eq '${encodeURIComponent(esc)}'&$top=5&$expand=OtherProperties`);
  return Array.isArray(r.body?.value) ? r.body.value : [];
}

// RÉPLICA FIEL da decisão do Worker (buscarClienteAtivo): dado o e-mail, monta os
// candidatos (o próprio contato + empresa vinculada) e decide "liberado".
async function decidirComoWorker(email) {
  const encontrados = await contatoPorEmail(email);
  if (!encontrados.length) return { encontrada: false };
  const registros = new Map();
  const idsCandidatos = [];
  for (const c of encontrados) {
    registros.set(Number(c.Id), c);
    for (const id of [c.Id, c.CompanyId, c.LastCompanyId]) {
      const n = id == null ? null : Number(id);
      if (n != null && !idsCandidatos.includes(n)) idsCandidatos.push(n);
    }
  }
  const pessoa = encontrados[0];
  let ativoValido = null, ativoExpirado = null, empresaBase = null;
  const trilha = [];
  for (const id of idsCandidatos) {
    let reg = registros.get(id) || await contatoPorId(id);
    if (reg) registros.set(id, reg); else { trilha.push({ id, achado: false }); continue; }
    const pa = prop(reg, F_ATIVO);
    trilha.push({ id, temCampo: !!pa, boolValue: pa ? pa.BoolValue : null });
    if (!pa) continue;
    empresaBase = empresaBase || reg;
    if (pa.BoolValue !== true) continue;
    const pf = prop(reg, F_FIM);
    const dataFim = pf?.DateTimeValue || pf?.DateValue || null;
    const naValidade = !dataFim || new Date(dataFim) >= HOJE;
    if (naValidade) { ativoValido = { reg, dataFim }; break; }
    ativoExpirado = ativoExpirado || { reg, dataFim };
  }
  const empresa = ativoValido?.reg || ativoExpirado?.reg || empresaBase || pessoa;
  return {
    encontrada: true,
    emailMascarado: mascara(pessoa.Email || email),
    pessoaId: pessoa.Id,
    empresaId: empresa?.Id ?? null,
    candidatosAvaliados: trilha,
    dataFim: ativoValido?.dataFim || ativoExpirado?.dataFim || null,
    liberado: !!ativoValido,
  };
}

async function acharClienteAtivo() {
  // Tenta filtro composto; se o Ploomes não aceitar, varre e filtra no cliente.
  let r = await api(`Contacts?$filter=OtherProperties/any(o: o/FieldId eq ${F_ATIVO} and o/BoolValue eq true)&$top=3&$expand=OtherProperties`);
  if (r.ok && r.body?.value?.length) return { modo: 'any-composto', empresas: r.body.value };
  const modo = `varredura (any-composto status ${r.status})`;
  const rs = await api(`Contacts?$filter=OtherProperties/any(o: o/FieldId eq ${F_ATIVO})&$top=100&$expand=OtherProperties`);
  const lista = Array.isArray(rs.body?.value) ? rs.body.value : [];
  const ativos = lista.filter((c) => prop(c, F_ATIVO)?.BoolValue === true).slice(0, 3);
  return { modo, empresas: ativos };
}

async function main() {
  const out = {};
  // (1) Definições dos campos (confirma o formato).
  const d1 = await api(`Fields?$filter=Id eq ${F_ATIVO}`);
  const d2 = await api(`Fields?$filter=Id eq ${F_FIM}`);
  out.definicoes = {
    contratoAtivo: (({ Id, Name, TypeId } = {}) => ({ Id, Name, TypeId }))(d1.body?.value?.[0]),
    dataEncerramento: (({ Id, Name, TypeId } = {}) => ({ Id, Name, TypeId }))(d2.body?.value?.[0]),
  };

  // (2) Escolhe o e-mail de teste: o pedido (EMAIL) ou, automático, o de uma
  //     PESSOA vinculada (Id != empresa) a um cliente ATIVO real — de propósito,
  //     para exercer o "pulo" pessoa->empresa que o Marcio destacou.
  let emailTeste = EMAIL;
  if (!emailTeste) {
    const ativo = await acharClienteAtivo();
    out.buscaClienteAtivo = { modo: ativo.modo, encontrados: ativo.empresas.length };
    let escolha = null;
    for (const empresa of ativo.empresas) {
      const rp = await api(`Contacts?$filter=CompanyId eq ${Number(empresa.Id)}&$top=20&$select=Id,TypeId,Email,CompanyId`);
      const distintas = (rp.body?.value || []).filter((p) => p.Email && Number(p.Id) !== Number(empresa.Id));
      if (distintas.length) { escolha = { empresa, email: String(distintas[0].Email).toLowerCase(), origem: 'pessoa vinculada (Id != empresa) — exerce o pulo pessoa→empresa' }; break; }
      if (!escolha && empresa.Email) escolha = { empresa, email: String(empresa.Email).toLowerCase(), origem: 'e-mail da própria empresa (não achei pessoa distinta)' };
    }
    if (!escolha) { out.aviso = 'Nenhum cliente ativo com e-mail testável foi encontrado agora.'; return console.log(JSON.stringify(out, null, 2)); }
    out.clienteAtivoEscolhido = { empresaId: escolha.empresa.Id, dataEncerramento_raw: prop(escolha.empresa, F_FIM) || null };
    out.origemEmailTeste = escolha.origem;
    emailTeste = escolha.email;
  } else {
    out.origemEmailTeste = 'informado via env EMAIL';
  }
  out.emailTesteMascarado = mascara(emailTeste);

  // (3) Roda a decisão exatamente como o Worker faria.
  out.decisaoDoPortao = await decidirComoWorker(emailTeste);

  // Veredito legível.
  out.VEREDITO = out.decisaoDoPortao?.liberado
    ? 'PASSOU ✅ — com este e-mail o Portal LIBERARIA o acesso (achou a empresa e o contrato ativo).'
    : 'NÃO liberou — ver candidatosAvaliados para entender (contrato "Não", vencido, ou e-mail sem empresa vinculada).';

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
