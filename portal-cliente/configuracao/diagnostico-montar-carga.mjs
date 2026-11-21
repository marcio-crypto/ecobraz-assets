// DIAGNÓSTICO (SOMENTE LEITURA) — tela "Montar carga" (/cargas/nova). Pedido de 21/11/2026 (decisão 1a).
//
// Mede, com os dados REAIS de produção, quantas leituras a tela faz por acesso e qual lista de OS ela
// mostra; quando o ramo tem a correção, prova que a lista sai EXATAMENTE igual (mesmos itens, mesma
// ordem, mesmos campos) com o código publicado e com o do ramo.
//
// Como:
// - KV de produção: lido só com GET pela API da Cloudflare (o índice de OS e a ficha de operação
//   op:{id} de cada OS concluída). Nada é gravado.
// - Cargas: a chave da Cloudflare do GitHub não lê o D1 (HTTP 403). As cargas vêm de uma CÓPIA lida
//   do D1 em modo só leitura (portal-cliente/configuracao/dados/montar-carga-cargas-*.json): data de
//   criação, status e as OS de cada carga, com o id da OS trocado por uma impressão digital. Para a
//   comparação valer, os ids do índice de OS recebem a MESMA impressão digital aqui dentro; as duas
//   versões rodam sobre os mesmos dados.
// - O banco das cargas roda num SQLite em memória (o mesmo motor do D1), com o próprio código da tela:
//   o publicado ("antes") e o do ramo ("depois"). Chamadas externas bloqueadas.
//
// PRIVACIDADE: o registro do GitHub deste repositório é PÚBLICO. O script imprime só contagens, datas,
// números de OS e impressões digitais (SHA-256). Nenhum nome, documento, e-mail ou endereço.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID; const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const NS = 'edd3746ffe5a49d585c60d99c18a25c7'; // PORTAL_KV (wrangler.toml)
const SRC_ANTES = process.env.SRC_ANTES; const SRC_DEPOIS = process.env.SRC_DEPOIS;
const COPIA = process.env.COPIA_CARGAS || 'portal-cliente/configuracao/dados/montar-carga-cargas-2026-11-21.json';
if (!ACC || !TOKEN || !SRC_ANTES) { console.log('Faltam CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN/SRC_ANTES.'); process.exit(1); }
const API = `https://api.cloudflare.com/client/v4/accounts/${ACC}`;
const fetchReal = globalThis.fetch;
const sha = (x) => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const pseudo = (id) => createHash('sha256').update('ecobraz-carga|' + String(id)).digest('hex').slice(0, 16);

// ---- leitura da produção (só GET no KV) ----
let leiturasProducao = 0;
async function kvProducao(chave) {
  for (let t = 0; t < 5; t++) {
    leiturasProducao++;
    const r = await fetchReal(`${API}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(chave)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status === 200) return await r.text();
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1500 * (t + 1))); continue; }
    throw new Error(`leitura do KV recusada (HTTP ${r.status})`);
  }
  throw new Error('leitura do KV falhou depois de 5 tentativas');
}
async function lerVarios(chaves, paralelo = 8) { const out = new Map(); for (let i = 0; i < chaves.length; i += paralelo) { const p = chaves.slice(i, i + paralelo); const v = await Promise.all(p.map(kvProducao)); p.forEach((k, j) => out.set(k, v[j])); } return out; }

// ---- cópia em memória do KV (conta as operações como a plataforma conta: lote = 1) ----
function kvCopia(base) {
  const m = new Map(base); const ops = { get: 0, getLote: 0, put: 0, delete: 0, list: 0, foraDaCopia: 0 };
  const val = (k) => { if (m.has(k)) return m.get(k); ops.foraDaCopia++; return null; };
  const conv = (v, o) => (v == null ? null : ((o === 'json' || (o && o.type === 'json')) ? JSON.parse(v) : v));
  return { ops, m,
    async get(k, o) { if (Array.isArray(k)) { ops.getLote++; const r = new Map(); for (const x of k) r.set(x, conv(val(x), o)); return r; } ops.get++; return conv(val(k), o); },
    async put(k, v) { ops.put++; m.set(k, String(v)); }, async delete(k) { ops.delete++; m.delete(k); },
    async list() { ops.list++; return { keys: [], list_complete: true }; } };
}

// ---- banco das cargas: SQLite em memória (mesmo motor do D1), com a cópia lida do D1 ----
const COLUNAS = 'id TEXT PRIMARY KEY, criado_em TEXT, criado_por TEXT, cliente_nome TEXT, cliente_doc TEXT, os_json TEXT, exclusiva_laudo INTEGER DEFAULT 0, peso_bruto REAL, tara REAL, peso_liquido REAL, fotos_json TEXT, status TEXT, cancelada_json TEXT DEFAULT \'\', edicoes_json TEXT DEFAULT \'\', especial INTEGER DEFAULT 0, especial_obs TEXT DEFAULT \'\', validacao_enviada INTEGER DEFAULT 0';
function d1Copia(cargas) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE op_cargas (${COLUNAS})`);
  const ins = db.prepare('INSERT INTO op_cargas (id, criado_em, status, os_json, fotos_json) VALUES (?, ?, ?, ?, ?)');
  cargas.forEach((c, n) => ins.run(`CG-COPIA-${String(n + 1).padStart(4, '0')}`, c.criadoEm, c.status, JSON.stringify(c.os.map((h) => ({ id: h }))), '[]'));
  const uso = { consultas: 0, preparo: 0 };
  const conta = (sql) => { if (/^\s*(CREATE|ALTER)\b/i.test(sql)) uso.preparo++; else uso.consultas++; };
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => { conta(sql); return { success: true, results: db.prepare(sql).all(...(args || [])).map((r) => ({ ...r })) }; },
    first: async (col) => { conta(sql); const r = db.prepare(sql).get(...(args || [])); return r ? (col ? r[col] : { ...r }) : null; },
    run: async () => { conta(sql); const i = db.prepare(sql).run(...(args || [])); return { success: true, meta: { changes: i.changes } }; },
  });
  return { prepare: (sql) => stmt(sql, []), batch: async (l) => Promise.all(l.map((s) => s.run())), uso };
}

// ---- a tela, nas duas versões ----
// ANTES: cópia LITERAL do trecho da rota GET /cargas/nova publicado (src/index.js, igual em d19759a e
// 41f8258), com as funções do código publicado.
async function livresAntes(env, m) {
  const { listarIndiceOS, listarCargas, lerOperacao } = m;
  const [todasOS, cargasTodas] = await Promise.all([listarIndiceOS(env), listarCargas(env)]);
  const emCargas = new Set();
  // Carga CANCELADA devolve as OSs para cá (não trava mais ninguém).
  cargasTodas.forEach((cg) => { if (cg.status === 'cancelada') return; (cg.oss || []).forEach((o) => emCargas.add(o.id)); });
  // Conferência do fluxo antigo da doca em PARALELO (antes: uma ida ao KV por OS, em série).
  const candidatas = todasOS.filter((x) => x.status === 'concluida' && !emCargas.has(x.id));
  const livres = (await Promise.all(candidatas.map(async (c) => {
    let opAntiga = null; try { opAntiga = await lerOperacao(env, c.id); } catch { opAntiga = null; }
    if (opAntiga && (opAntiga.entrada || (opAntiga.fotos && Object.keys(opAntiga.fotos).length) || (opAntiga.etapa && opAntiga.etapa !== 'recepcao'))) return null;
    return c;
  }))).filter(Boolean);
  return livres;
}
// DEPOIS: as mesmas linhas da rota do ramo, com as funções do ramo.
async function livresDepois(env, m) {
  const { listarIndiceOS, cargasParaMontar, osEmCargas, osLivresParaCarga } = m;
  const [todasOS, cargasTodas] = await Promise.all([listarIndiceOS(env), cargasParaMontar(env)]);
  return await osLivresParaCarga(env, todasOS, osEmCargas(cargasTodas));
}
let tentativasDeRede = 0;
async function simular(tipo, src, base, cargas) {
  const imp = (f) => import(pathToFileURL(`${src}/${f}`).href);
  const [col, car, ope] = await Promise.all([imp('coletas.js'), imp('cargas.js'), imp('operacional.js')]);
  const kv = kvCopia(base); const d1 = d1Copia(cargas);
  const env = { PORTAL_KV: kv, DB_PLOOMES: d1 };
  const livres = tipo === 'antes'
    ? await livresAntes(env, { listarIndiceOS: col.listarIndiceOS, listarCargas: car.listarCargas, lerOperacao: ope.lerOperacao })
    : await livresDepois(env, { listarIndiceOS: col.listarIndiceOS, cargasParaMontar: car.cargasParaMontar, osEmCargas: car.osEmCargas, osLivresParaCarga: car.osLivresParaCarga });
  const kvOps = kv.ops.get + kv.ops.getLote + kv.ops.put + kv.ops.delete + kv.ops.list;
  return { livres, kv: kv.ops, kvOps, d1: d1.uso };
}

// ===================================================================================
console.log('DIAGNÓSTICO DA TELA "MONTAR CARGA" — somente leitura (nada é gravado na produção)');
console.log(`Horário da leitura (UTC): ${new Date().toISOString()}`);
const copia = JSON.parse(readFileSync(COPIA, 'utf8'));
const cargas = copia.cargas || [];
const indiceBruto = (await kvProducao('os:index')) || '[]';
const indice = JSON.parse(indiceBruto);
const concluidas = indice.filter((x) => x && x.status === 'concluida');
const fichas = await lerVarios(concluidas.map((x) => `op:${x.id}`));
// Base da cópia: ids trocados pela impressão digital (igual à da cópia das cargas).
const base = new Map();
base.set('os:index', JSON.stringify(indice.map((x) => (x && x.id ? { ...x, id: pseudo(x.id) } : x))));
for (const x of concluidas) base.set(`op:${pseudo(x.id)}`, fichas.get(`op:${x.id}`) ?? null); // sem ficha = null (lida da produção)
globalThis.fetch = async () => { tentativasDeRede++; throw new Error('rede bloqueada no diagnóstico'); };

console.log('\n== Produção agora ==');
const canceladas = cargas.filter((c) => c.status === 'cancelada').length;
const emAtivas = new Set(cargas.filter((c) => c.status !== 'cancelada').flatMap((c) => c.os));
const nas200 = new Set(cargas.slice().sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1)).slice(0, 200).filter((c) => c.status !== 'cancelada').flatMap((c) => c.os));
console.log(`Índice de OS: ${indice.length} OS, ${concluidas.length} concluídas. Fichas de operação lidas: ${[...fichas.values()].filter((v) => v != null).length} de ${concluidas.length}.`);
console.log(`Cargas (cópia do D1 lida em ${copia.lidoEm}): ${cargas.length}, das quais ${canceladas} canceladas. OS em carga não cancelada: ${emAtivas.size} (contando todas as cargas) e ${nas200.size} (só as 200 mais recentes, como a tela publicada).`);
const ult30 = cargas.filter((c) => Date.parse(c.criadoEm) >= Date.parse(copia.lidoEm + 'T23:59:59Z') - 30 * 86400e3).length;
console.log(`Ritmo: ${ult30} cargas nos últimos 30 dias. Com esse ritmo, a 201ª carga chega em ~${ult30 ? Math.ceil((200 - cargas.length) / ult30 * 30) : '?'} dias (a partir dela a tela publicada deixa de enxergar as cargas mais antigas).`);

console.log('\n== "Montar carga": código PUBLICADO (antes) ==');
const A = await simular('antes', SRC_ANTES, base, cargas);
console.log(`Leituras do KV em UM acesso: ${A.kvOps} (individuais ${A.kv.get}, em lote ${A.kv.getLote}); consultas ao banco das cargas: ${A.d1.consultas}.`);
console.log(`Lista mostrada: ${A.livres.length} OS, na ordem da tela: ${A.livres.map((x) => x.numero).join(', ') || '(vazia)'}.`);
console.log(`Impressão digital da lista (SHA-256 de itens, ordem e campos): ${sha(A.livres)}`);
console.log(`Composição: 1 leitura do índice + ${A.kv.get - 1} leituras de ficha (uma por OS concluída fora de carga). Cresce +1 por OS concluída que não entra em carga; e, passando de 200 cargas, cada OS das cargas que saem da janela volta a ser lida e a aparecer como disponível.`);
if (A.kv.foraDaCopia) console.log(`Atenção: ${A.kv.foraDaCopia} leituras de chave que não estava na cópia (tratadas como vazias).`);

if (SRC_DEPOIS) {
  console.log('\n== "Montar carga": código do RAMO (depois) ==');
  const B = await simular('depois', SRC_DEPOIS, base, cargas);
  console.log(`Leituras do KV em UM acesso: ${B.kvOps} (individuais ${B.kv.get}, em lote ${B.kv.getLote}); consultas ao banco das cargas: ${B.d1.consultas}.`);
  console.log(`Lista mostrada: ${B.livres.length} OS. Impressão digital: ${sha(B.livres)}`);
  const igual = JSON.stringify(A.livres) === JSON.stringify(B.livres);
  console.log(`COMPARAÇÃO RÍGIDA (mesmos itens, mesma ordem, mesmos campos): ${igual ? 'IDÊNTICA' : 'DIFERENTE'}.`);
  if (!igual) { const n = Math.max(A.livres.length, B.livres.length); for (let i = 0; i < n; i++) if (JSON.stringify(A.livres[i]) !== JSON.stringify(B.livres[i])) { console.log(`  primeira diferença na posição ${i + 1}: ${(A.livres[i] || {}).numero || '-'} × ${(B.livres[i] || {}).numero || '-'}`); break; } }
  if (B.kv.foraDaCopia) console.log(`Atenção: ${B.kv.foraDaCopia} leituras de chave que não estava na cópia (tratadas como vazias).`);
}

console.log('\n== Controle ==');
console.log(`Leituras feitas na produção: ${leiturasProducao} (todas só leitura, GET). Tentativas de rede durante as simulações: ${tentativasDeRede} (bloqueadas). Nada foi gravado na produção.`);
