// MIGRAÇÃO DE CLIENTES: Ploomes -> base própria (KV). SOMENTE LEITURA no Ploomes.
//
// Regras de limpeza ("só dados concretos"):
//  - Empresa (PJ): precisa de CNPJ + endereço + e-mail (na empresa OU em algum contato).
//  - CNPJ duplicado: unificado num registro só (une os contatos).
//  - Pessoa física (PF): precisa de CPF + endereço + e-mail.
//  - Pessoas vinculadas a empresa: viram CONTATO embutido na empresa (sem cadastro separado).
//  - Sem documento / indefinidos: descartados.
//
// Id determinístico ligado ao Ploomes (emp_plm{Id} / pf_plm{Id}) -> re-executável SEM duplicar.
//
// MODOS: DRY (padrão) = só relatório, não gera carga. LIVE (MIGRA_LIVE=1) = gera o arquivo
// de carga migracao-bulk.json (o passo do wrangler kv:bulk put é separado, no workflow).

import { writeFileSync } from 'node:fs';
const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const LIVE = process.env.MIGRA_LIVE === '1';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const HEADERS = { 'User-Key': KEY, Accept: 'application/json' };
const digits = (s) => String(s || '').replace(/\D/g, '');
const nowIso = new Date().toISOString();

async function api(pathQ) {
  const raw = pathQ.startsWith('http') ? pathQ : `${BASE}/${pathQ.replace(/^\/+/, '')}`;
  const r = await fetch(raw.replace(/ /g, '%20'), { headers: HEADERS });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`); e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { throw new Error('resposta não-JSON'); }
}
const temEndereco = (c) => !!(c.StreetAddress || c.City || c.ZipCode);
const endereco = (c) => ({ cep: String(c.ZipCode || ''), logradouro: c.StreetAddress || '', numero: c.StreetAddressNumber != null ? String(c.StreetAddressNumber) : '', complemento: c.StreetAddressLine2 || '', bairro: c.Neighborhood || '', cidade: c.City || '', uf: c.StateName || '' });
const email = (c) => String(c.Email || '').trim();
const fone = (c) => { const p = Array.isArray(c.Phones) && c.Phones[0]; return p ? String(p.PhoneNumber || '') : ''; };

async function main() {
  L('\n===== MIGRAÇÃO DE CLIENTES — ' + (LIVE ? 'GERANDO CARGA (LIVE)' : 'SIMULAÇÃO (DRY, não grava)') + ' =====\n');
  L('Base:', BASE);

  const contatos = [];
  let skip = 0; const TOP = 300; let guard = 0;
  while (guard++ < 400) {
    let d;
    try { d = await api(`Contacts?$top=${TOP}&$skip=${skip}&$expand=Phones&$orderby=Id`); }
    catch (e) { L(`  (parou na página skip=${skip}: ${String(e.message).slice(0, 90)})`); break; }
    const v = d.value || [];
    for (const c of v) contatos.push(c);
    if (v.length < TOP) break;
    skip += TOP;
  }
  L('Contacts lidos:', contatos.length);

  const empresasRaw = new Map(); const vinc = []; const pfRaw = []; let indef = 0;
  for (const c of contatos) {
    const reg = digits(c.Register);
    if (reg.length === 14) empresasRaw.set(c.Id, c);
    else if (c.CompanyId) vinc.push(c);
    else if (reg.length === 11) pfRaw.push(c);
    else indef++;
  }
  const ctPorEmp = new Map();
  for (const p of vinc) { if (!ctPorEmp.has(p.CompanyId)) ctPorEmp.set(p.CompanyId, []); ctPorEmp.get(p.CompanyId).push(p); }

  let dEnd = 0, dEmail = 0;
  const okList = [];
  for (const [id, c] of empresasRaw) {
    const cts = (ctPorEmp.get(id) || []).map((p) => ({ nome: p.Name || '', cargo: '', fone: fone(p), email: email(p) }));
    if (!temEndereco(c)) { dEnd++; continue; }
    if (!(email(c) || cts.some((x) => x.email))) { dEmail++; continue; }
    okList.push({ ploomesId: id, tipo: 'PJ', razaoSocial: c.Name || '', cnpj: digits(c.Register), ie: '', email: email(c), fone: fone(c), endereco: endereco(c), contatos: cts });
  }
  // Unifica CNPJ duplicado (une contatos, completa campos vazios).
  const byCNPJ = new Map();
  for (const e of okList) {
    if (!byCNPJ.has(e.cnpj)) byCNPJ.set(e.cnpj, e);
    else { const x = byCNPJ.get(e.cnpj); x.contatos = x.contatos.concat(e.contatos); if (!x.email) x.email = e.email; if (!x.endereco.logradouro && e.endereco.logradouro) x.endereco = e.endereco; }
  }
  const empresas = [...byCNPJ.values()];
  const unif = okList.length - empresas.length;

  let pEnd = 0, pEmail = 0; const pf = [];
  for (const c of pfRaw) {
    if (!temEndereco(c)) { pEnd++; continue; }
    if (!email(c)) { pEmail++; continue; }
    pf.push({ ploomesId: c.Id, tipo: 'PF', nome: c.Name || '', cpf: digits(c.Register), email: email(c), fone: fone(c), endereco: endereco(c) });
  }

  const totalContatos = empresas.reduce((s, e) => s + e.contatos.length, 0);
  L('\n--- REGRAS: só dados concretos (endereço + e-mail), CNPJ duplicado unificado ---');
  L(`Empresas no Ploomes: ${empresasRaw.size}`);
  L(`  ✗ descartadas sem endereço: ${dEnd}`);
  L(`  ✗ descartadas sem e-mail (nem na empresa nem em nenhum contato): ${dEmail}`);
  L(`  ⤳ CNPJs duplicados unificados: ${unif}`);
  L(`  ✓ EMPRESAS QUE MIGRAM: ${empresas.length}  (com ${totalContatos} contatos embutidos)`);
  L(`\nPessoas físicas avulsas no Ploomes: ${pfRaw.length}`);
  L(`  ✗ descartadas sem endereço: ${pEnd}`);
  L(`  ✗ descartadas sem e-mail: ${pEmail}`);
  L(`  ✓ PF QUE MIGRAM: ${pf.length}`);
  L(`\nIndefinidos (sem documento) descartados: ${indef}`);
  L(`\n>>> TOTAL QUE MIGRA: ${empresas.length + pf.length} clientes (${empresas.length} empresas + ${pf.length} PF)`);

  // Monta a carga do KV (sempre calcula; só grava arquivo em LIVE).
  const idx = []; const bulk = [];
  const push = (rec) => {
    const id = (rec.tipo === 'PJ' ? 'emp_plm' : 'pf_plm') + rec.ploomesId;
    rec.id = id; rec.origem = 'ploomes:' + rec.ploomesId; rec.criadoEm = nowIso; rec.atualizadoEm = nowIso;
    bulk.push({ key: `cli:${id}`, value: JSON.stringify(rec) });
    idx.push({ id, tipo: rec.tipo, nome: rec.tipo === 'PJ' ? rec.razaoSocial : rec.nome, doc: rec.tipo === 'PJ' ? rec.cnpj : rec.cpf, cidade: rec.endereco.cidade || '', criadoEm: nowIso });
  };
  empresas.forEach(push); pf.forEach(push);
  bulk.push({ key: 'cli:index', value: JSON.stringify(idx) });
  L(`\nCarga do KV: ${bulk.length} chaves (inclui o índice).`);

  writeFileSync(new URL('./resultado-ploomes.json', import.meta.url), JSON.stringify({ modo: LIVE ? 'LIVE' : 'DRY', migram: { empresas: empresas.length, pf: pf.length, contatosEmbutidos: totalContatos, chavesKV: bulk.length }, descartes: { empresaSemEndereco: dEnd, empresaSemEmail: dEmail, cnpjUnificados: unif, pfSemEndereco: pEnd, pfSemEmail: pEmail, indefinidos: indef } }, null, 2));
  if (LIVE) { writeFileSync(new URL('./migracao-bulk.json', import.meta.url), JSON.stringify(bulk)); L('\n✓ Arquivo de carga gerado: migracao-bulk.json (pronto pro wrangler kv:bulk put).'); }
  else L('\n(DRY: nenhuma gravação. Rode LIVE pra gerar a carga e carregar no KV.)');
  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
