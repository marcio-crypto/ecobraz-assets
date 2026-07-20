// Diagnóstico SOMENTE-LEITURA da estrutura do Ploomes.
//
// OBJETIVO: descobrir, sem chutes, como o Ploomes da Ecobraz está montado
// (funis, etapas, campos personalizados, contagens) para construir o Portal do
// Cliente em cima da estrutura REAL — e não em cima de suposições.
//
// PRIVACIDADE / LGPD: este script NÃO baixa dados pessoais de clientes.
//   - De tabelas de CONFIGURAÇÃO (funis, etapas, campos, origens, status) ele lê
//     apenas metadados de estrutura (nomes, IDs e propriedades técnicas).
//   - De Contatos e Negócios (que contêm dados pessoais) ele lê APENAS CONTAGENS
//     agregadas — nunca registros individuais de pessoas/empresas.
//
// SEGURANÇA: a chave da API vem da variável de ambiente PLOOMES_USER_KEY
// (definida como segredo no GitHub, nunca no repositório). O script nunca
// imprime a chave.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';

if (!KEY) {
  console.error('ERRO: a variável PLOOMES_USER_KEY não está definida.');
  console.error('Adicione o segredo PLOOMES_USER_KEY no GitHub (Settings > Secrets and variables > Actions) e rode o diagnóstico de novo.');
  process.exit(1);
}

const HEADERS = { 'User-Key': KEY, 'Accept': 'application/json' };

// Só chaves de estrutura seguras entram na saída (nunca e-mail, telefone, nome de pessoa).
const SAFE_KEYS = new Set([
  'Id', 'Name', 'Key', 'Order', 'Ordination', 'PipelineId', 'StageId', 'EntityId',
  'TypeId', 'FieldId', 'OptionTableId', 'IsRequired', 'IsEditable', 'Color', 'Label',
  'ShortName', 'Alias', 'ParentId', 'Default', 'IsDefault', 'Sequence', 'Percentage',
]);

// Tabelas de CONFIGURAÇÃO das quais é seguro listar registros (não têm dado pessoal).
const CONFIG_PATTERNS = [/pipeline/i, /stage/i, /field/i, /source/i, /status/i, /optiontable/i, /optionitem/i, /lostreason/i, /tag/i, /origin/i, /category/i, /group/i, /role/i, /currency/i];

function isConfig(name) { return CONFIG_PATTERNS.some((re) => re.test(name)) && !/deal|contact/i.test(name); }

async function api(pathWithQuery) {
  const raw = pathWithQuery.startsWith('http') ? pathWithQuery : `${BASE}/${pathWithQuery.replace(/^\/+/, '')}`;
  const url = raw.replace(/ /g, '%20'); // OData $apply usa espaços ("as"); demais chars ficam intactos
  const r = await fetch(url, { headers: HEADERS });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
  try { return JSON.parse(text); } catch { throw new Error('resposta não-JSON'); }
}

function slimRow(row) {
  const o = {};
  for (const k of Object.keys(row || {})) if (SAFE_KEYS.has(k)) o[k] = row[k];
  if (Object.keys(o).length === 0) { if (row && 'Id' in row) o.Id = row.Id; if (row && 'Name' in row) o.Name = row.Name; }
  return o;
}

async function tryGroupby(out, entity, prop, label) {
  const q = `${entity}?$apply=groupby((${prop}),aggregate($count as Total))`;
  try {
    const data = await api(q);
    const rows = Array.isArray(data?.value) ? data.value : [];
    out.distribuicoes[label] = rows.map((r) => ({ [prop]: r[prop] ?? null, Total: r.Total ?? r['@odata.count'] ?? null }));
  } catch (e) {
    out.distribuicoes[label] = { indisponivel: true, motivo: String(e.message).slice(0, 140) };
  }
}

function firstMatch(map, re) {
  const key = Object.keys(map).find((k) => re.test(k));
  return key ? map[key] : null;
}

// Monta os mapas ID -> Nome de funis, etapas e situações — SEM dados pessoais:
// lê uma amostra de negócios trazendo os objetos de apoio (funil/etapa/situação)
// via $expand e guarda APENAS Id + Nome dessas tabelas — nunca título, contato
// ou qualquer dado pessoal. Tenta variações de sintaxe porque a API do Ploomes
// pode recusar $select junto de $expand.
async function mapNames(out) {
  const nomes = { funis: {}, etapas: {}, situacoes: {} };
  const absorve = (rows) => {
    for (const d of (Array.isArray(rows) ? rows : [])) {
      if (d.Pipeline && d.Pipeline.Id != null) nomes.funis[d.Pipeline.Id] = d.Pipeline.Name;
      if (d.Stage && d.Stage.Id != null) nomes.etapas[d.Stage.Id] = d.Stage.Name;
      if (d.Status && d.Status.Id != null) nomes.situacoes[d.Status.Id] = d.Status.Name;
    }
  };
  const tentativas = [
    'Deals?$top=300&$select=Id&$expand=Pipeline,Stage,Status',
    'Deals?$top=300&$expand=Pipeline,Stage,Status',
    'Deals?$top=300&$expand=Pipeline($select=Id,Name),Stage($select=Id,Name),Status($select=Id,Name)',
  ];
  for (const q of tentativas) {
    try {
      const data = await api(q);
      absorve(data && data.value);
      if (Object.keys(nomes.funis).length) break;
    } catch (e) {
      out.erros.push(`nomes: ${String(e.message).slice(0, 110)}`);
    }
  }
  out.nomes = nomes;
}

async function main() {
  const out = { base: BASE, geradoEm: new Date().toISOString(), viaFallback: false, catalogo: [], configuracao: {}, contagens: {}, distribuicoes: {}, erros: [] };

  // 1) Documento de serviço OData: lista TODAS as entidades que esta chave enxerga.
  let service = null;
  try { service = await api(''); }
  catch (e) { out.erros.push(`catálogo: ${e.message}`); }
  let sets = Array.isArray(service?.value) ? service.value : [];

  // Fallback: se o catálogo não veio, tenta as tabelas de configuração mais comuns.
  if (sets.length === 0) {
    out.viaFallback = true;
    sets = ['Pipelines', 'Stages', 'Fields', 'Sources', 'LostReasons', 'OptionTables', 'Tags'].map((name) => ({ name }));
  }
  out.catalogo = sets.map((s) => s.name || s.url).filter(Boolean).sort();

  // 2) Tabelas de CONFIGURAÇÃO: listar registros (só estrutura, sem dado pessoal).
  let count = 0;
  for (const s of sets) {
    const name = s.name || s.url;
    if (!name || !isConfig(name)) continue;
    if (count++ > 40) break;
    try {
      const data = await api(`${name}?$top=300`);
      const rows = Array.isArray(data?.value) ? data.value : [];
      out.configuracao[name] = rows.map(slimRow);
    } catch (e) {
      out.erros.push(`${name}: ${e.message}`);
    }
  }

  // 3) Contatos e Negócios: SOMENTE contagem agregada (nenhum registro pessoal).
  for (const target of ['Contacts', 'Deals']) {
    try {
      const data = await api(`${target}?$top=0&$count=true`);
      out.contagens[target] = data['@odata.count'] ?? null;
    } catch (e) {
      out.erros.push(`contagem ${target}: ${e.message}`);
    }
  }

  // 4) Distribuições agregadas (sem PII): tipos de contato e negócios por etapa/funil/status.
  await tryGroupby(out, 'Contacts', 'TypeId', 'contatosPorTipo');
  await tryGroupby(out, 'Deals', 'PipelineId', 'negociosPorFunil');
  await tryGroupby(out, 'Deals', 'StageId', 'negociosPorEtapa');
  await tryGroupby(out, 'Deals', 'StatusId', 'negociosPorStatus');

  // Nomes amigáveis de funis/etapas/situações — sem dados pessoais (lê apenas os
  // IDs e os NOMES das tabelas de apoio, nunca título de negócio ou dados de pessoa).
  await mapNames(out);

  // Saída: arquivo completo + resumo legível no log.
  const fs = await import('node:fs');
  const file = new URL('./resultado-ploomes.json', import.meta.url);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  printResumo(out);
}

function printResumo(out) {
  const L = (...a) => console.log(...a);
  L('\n=============== DIAGNÓSTICO PLOOMES (somente leitura) ===============\n');
  L(`Base: ${out.base}`);
  if (out.viaFallback) L('(catálogo OData não disponível — usei a lista de tabelas mais comuns como plano B)');
  L(`\nEntidades visíveis para esta chave (${out.catalogo.length}):`);
  L('  ' + (out.catalogo.join(', ') || '(nenhuma)'));

  const funis = firstMatch(out.configuracao, /pipeline/i);
  if (funis?.length) { L('\nFunis / Pipelines:'); for (const f of funis) L(`  - [${f.Id}] ${f.Name}`); }
  const etapas = firstMatch(out.configuracao, /stage/i);
  if (etapas?.length) { L('\nEtapas / Stages:'); for (const s of etapas) L(`  - [${s.Id}] ${s.Name}  (funil ${s.PipelineId ?? '?'}, ordem ${s.Order ?? s.Ordination ?? '?'})`); }
  const campos = firstMatch(out.configuracao, /field/i);
  if (campos?.length) { L(`\nCampos personalizados (${campos.length}):`); for (const c of campos) L(`  - [${c.Id}] ${c.Name}  (entidade ${c.EntityId ?? '?'}, tipo ${c.TypeId ?? '?'}${c.Key ? ', key ' + c.Key : ''})`); }

  L('\nContagens (sem dados pessoais):');
  for (const [k, v] of Object.entries(out.contagens)) L(`  - ${k}: ${v}`);
  L('\nDistribuições agregadas (sem dados pessoais):');
  for (const [k, v] of Object.entries(out.distribuicoes)) L(`  - ${k}: ${JSON.stringify(v)}`);

  if (out.nomes) {
    const funil = out.distribuicoes.negociosPorFunil;
    if (Array.isArray(funil)) {
      L('\nFunis (nome + nº de negócios, do maior para o menor):');
      for (const f of [...funil].sort((a, b) => (b.Total || 0) - (a.Total || 0))) {
        L(`  - [${f.PipelineId}] ${out.nomes.funis[f.PipelineId] || '(nome n/d)'} — ${f.Total}`);
      }
    }
    if (out.nomes.situacoes && Object.keys(out.nomes.situacoes).length) {
      L('\nSituações (StatusId -> nome): ' + JSON.stringify(out.nomes.situacoes));
    }
  }

  if (out.erros.length) { L('\nAvisos/erros (não fatais):'); for (const e of out.erros) L('  - ' + e); }
  L('\nArquivo completo: portal-cliente/diagnostico/resultado-ploomes.json');
  L('\n====================================================================\n');
}

main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
