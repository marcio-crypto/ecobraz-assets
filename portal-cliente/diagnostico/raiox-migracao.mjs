// RAIO-X DA MIGRAÇÃO — SOMENTE LEITURA do Ploomes. Passo 1 (simulação) antes de migrar.
//
// Lê todos os Contacts do Ploomes, classifica em: empresas (CNPJ), pessoas vinculadas
// a uma empresa (que na nossa base viram CONTATO embutido) e pessoas físicas avulsas
// (que viram CLIENTE PF). Mede a QUALIDADE da base (duplicados, órfãos, faltas) para
// decidirmos as regras de limpeza. NÃO grava nada — nem no Ploomes, nem na nossa base.
//
// A chave vem do segredo PLOOMES_USER_KEY (nunca impressa). Saída só no log privado da CI
// + um resumo agregado em resultado-ploomes.json (sem listar todo mundo).

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const HEADERS = { 'User-Key': KEY, Accept: 'application/json' };
const digits = (s) => String(s || '').replace(/\D/g, '');

async function api(pathQ) {
  const raw = pathQ.startsWith('http') ? pathQ : `${BASE}/${pathQ.replace(/^\/+/, '')}`;
  const r = await fetch(raw.replace(/ /g, '%20'), { headers: HEADERS });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`); e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { throw new Error('resposta não-JSON'); }
}

async function main() {
  L('\n===== RAIO-X DA MIGRAÇÃO (somente leitura — não grava nada) =====\n');
  L('Base:', BASE);

  let total = null;
  try { const d = await api('Contacts?$top=0&$count=true'); total = d['@odata.count'] ?? null; } catch (e) { L('  (contagem falhou:', e.message.slice(0, 80) + ')'); }
  L('Total de Contacts no Ploomes:', total ?? '(desconhecido)');

  // Paginação (top 300 + skip) — lê todos os contatos.
  const contatos = [];
  let skip = 0; const TOP = 300; let guard = 0;
  while (guard++ < 400) {
    let d;
    try { d = await api(`Contacts?$top=${TOP}&$skip=${skip}&$orderby=Id`); }
    catch (e) { L(`  (parou na página skip=${skip}: ${String(e.message).slice(0, 90)})`); break; }
    const v = d.value || [];
    for (const c of v) contatos.push(c);
    if (v.length < TOP) break;
    skip += TOP;
  }
  L('Contacts lidos:', contatos.length);

  const empresas = new Map();   // Id -> empresa (Register com 14 dígitos)
  const pessoasVinc = [];       // têm CompanyId (viram contato embutido)
  const pfAvulsas = [];         // CPF (11 díg.) e sem CompanyId -> cliente PF
  const indef = [];             // sem doc e sem CompanyId -> precisam de regra
  const tipoDist = new Map();
  for (const c of contatos) {
    tipoDist.set(c.TypeId, (tipoDist.get(c.TypeId) || 0) + 1);
    const reg = digits(c.Register);
    if (reg.length === 14) empresas.set(c.Id, c);
    else if (c.CompanyId) pessoasVinc.push(c);
    else if (reg.length === 11) pfAvulsas.push(c);
    else indef.push(c);
  }

  const porCNPJ = new Map();
  for (const c of empresas.values()) { const k = digits(c.Register); porCNPJ.set(k, (porCNPJ.get(k) || []).concat(c.Id)); }
  const dupCNPJ = [...porCNPJ.entries()].filter(([, ids]) => ids.length > 1);

  const contatosPorEmpresa = new Map();
  for (const p of pessoasVinc) if (empresas.has(p.CompanyId)) contatosPorEmpresa.set(p.CompanyId, (contatosPorEmpresa.get(p.CompanyId) || 0) + 1);
  const orfaos = pessoasVinc.filter((p) => !empresas.has(p.CompanyId));

  let semEndereco = 0, semEmail = 0, semContato = 0;
  for (const [id, c] of empresas) {
    if (!(c.StreetAddress || c.City || c.ZipCode)) semEndereco++;
    if (!c.Email) semEmail++;
    if (!contatosPorEmpresa.get(id)) semContato++;
  }

  L('\n--- CLASSIFICAÇÃO ---');
  L(`Empresas (CNPJ 14 díg.): ${empresas.size}`);
  L(`Pessoas vinculadas a empresa (viram CONTATO embutido): ${pessoasVinc.length}`);
  L(`  → dessas, ÓRFÃS (empresa não encontrada na base): ${orfaos.length}`);
  L(`Pessoas físicas avulsas (CPF, sem empresa) → viram CLIENTE PF: ${pfAvulsas.length}`);
  L(`Indefinidos (sem documento e sem empresa) — precisam de regra: ${indef.length}`);
  L('\nDistribuição por TypeId (pra entendermos o que é o quê no seu Ploomes):');
  for (const [t, n] of [...tipoDist.entries()].sort((a, b) => b[1] - a[1])) L(`  TypeId ${t}: ${n}`);

  L('\n--- QUALIDADE (o que vamos "arredondar") ---');
  L(`CNPJs duplicados: ${dupCNPJ.length}${dupCNPJ.length ? ' (ex.: ' + dupCNPJ.slice(0, 5).map(([k]) => k).join(', ') + ')' : ''}`);
  L(`Empresas sem endereço: ${semEndereco}/${empresas.size}`);
  L(`Empresas sem e-mail: ${semEmail}/${empresas.size}`);
  L(`Empresas sem nenhum contato vinculado: ${semContato}/${empresas.size}`);

  L('\n--- AMOSTRA (até 5 empresas) ---');
  let i = 0; for (const [id, c] of empresas) { if (i++ >= 5) break; L(`  • ${c.Name} | CNPJ ${digits(c.Register)} | contatos: ${contatosPorEmpresa.get(id) || 0} | ${c.City || '—'}`); }
  if (pfAvulsas.length) { L('\n--- AMOSTRA (até 5 pessoas físicas avulsas) ---'); for (const c of pfAvulsas.slice(0, 5)) L(`  • ${c.Name} | CPF ${digits(c.Register) || '—'} | ${c.City || '—'}`); }
  if (indef.length) { L('\n--- AMOSTRA (até 5 indefinidos, pra criarmos regra) ---'); for (const c of indef.slice(0, 5)) L(`  • ${c.Name} | TypeId ${c.TypeId} | CompanyId ${c.CompanyId || '—'} | reg ${digits(c.Register) || '—'}`); }

  const fs = await import('node:fs');
  const resumo = { geradoEm: new Date().toISOString(), total, lidos: contatos.length, empresas: empresas.size, pessoasVinculadas: pessoasVinc.length, orfaos: orfaos.length, pfAvulsas: pfAvulsas.length, indefinidos: indef.length, cnpjDuplicados: dupCNPJ.length, semEndereco, semEmail, semContato, tipoDist: [...tipoDist.entries()] };
  fs.writeFileSync(new URL('./resultado-ploomes.json', import.meta.url), JSON.stringify(resumo, null, 2));
  L('\n===== FIM DO RAIO-X =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
