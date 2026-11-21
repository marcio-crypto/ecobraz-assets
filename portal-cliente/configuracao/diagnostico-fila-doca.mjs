// DIAGNÓSTICO (SOMENTE LEITURA) — fila "Receber lote" da doca e lista "Montar carga".
//
// Mede, com os dados REAIS de produção, quantas operações de KV um acesso à tela "Receber lote"
// faz hoje e como isso cresce; e, quando o código do ramo tem a correção, prova que a fila sai
// EXATAMENTE igual (mesmos itens, mesma ordem, mesmos campos) e quantas leituras sobram.
//
// Como: lê do KV de produção, só com GET pela API da Cloudflare, as chaves que a tela usa, e roda
// o PRÓPRIO código da tela (o publicado e o do ramo) sobre uma cópia em memória desses dados.
// - Nada é gravado na produção: as gravações que a tela faz (conserto de OS presa "em transporte")
//   vão só para a cópia em memória.
// - Chamadas externas ficam bloqueadas.
// - O relógio fica congelado, para as duas versões gravarem o mesmo horário.
//
// PRIVACIDADE: o registro do GitHub deste repositório é PÚBLICO. Este script imprime só contagens,
// datas, números de OS e uma impressão digital (SHA-256) da lista inteira. Nenhum nome, documento,
// e-mail, telefone ou endereço é impresso.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID; const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const NS = 'edd3746ffe5a49d585c60d99c18a25c7';   // PORTAL_KV (wrangler.toml)
const D1 = 'acd75607-389c-42c3-b50b-24f607350dd9'; // DB_PLOOMES (wrangler.toml)
const SRC_ANTES = process.env.SRC_ANTES; const SRC_DEPOIS = process.env.SRC_DEPOIS;
if (!ACC || !TOKEN || !SRC_ANTES) { console.log('Faltam CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN/SRC_ANTES.'); process.exit(1); }
const API = `https://api.cloudflare.com/client/v4/accounts/${ACC}`;
const fetchReal = globalThis.fetch;

// ---- leitura da produção (só GET no KV; só SELECT no D1) ----
let leiturasProducao = 0;
async function kvProducao(chave) {
  for (let t = 0; t < 4; t++) {
    leiturasProducao++;
    const r = await fetchReal(`${API}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(chave)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status === 200) return await r.text();
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 1500 * (t + 1))); continue; }
    throw new Error(`leitura do KV recusada (HTTP ${r.status})`);
  }
  throw new Error('leitura do KV falhou depois de 4 tentativas');
}
async function d1Producao(sql) {
  if (!/^\s*SELECT\b/i.test(sql)) throw new Error('só SELECT');
  const r = await fetchReal(`${API}/d1/database/${D1}/query`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.success) throw new Error(`consulta ao D1 recusada (HTTP ${r.status})`);
  return (j.result && j.result[0] && j.result[0].results) || [];
}
const cache = new Map(); // chave → valor da produção (lido uma vez só)
async function daProducao(chave) { if (!cache.has(chave)) cache.set(chave, await kvProducao(chave)); return cache.get(chave); }
async function preCarregar(chaves, paralelo = 8) { const lista = [...new Set(chaves)].filter((k) => !cache.has(k)); for (let i = 0; i < lista.length; i += paralelo) await Promise.all(lista.slice(i, i + paralelo).map(daProducao)); }

// ---- cópia em memória do KV (conta as operações como a plataforma conta) ----
function kvCopia() {
  const escritos = new Map(); const ops = { get: 0, getLote: 0, chavesLidas: 0, put: 0, delete: 0, list: 0 };
  const valor = async (k) => (escritos.has(k) ? escritos.get(k) : await daProducao(k)); // chave nunca lida: busca na produção (só leitura)
  const tipo = (o) => (typeof o === 'string' ? o : (o && o.type) || 'text');
  const conv = (v, t) => (v == null ? null : (t === 'json' ? JSON.parse(v) : v));
  return {
    ops, escritos,
    async get(k, o) { if (Array.isArray(k)) { ops.getLote++; ops.chavesLidas += k.length; const m = new Map(); for (const x of k) m.set(x, conv(await valor(x), tipo(o))); return m; } ops.get++; ops.chavesLidas++; return conv(await valor(k), tipo(o)); },
    async put(k, v) { ops.put++; escritos.set(k, String(v)); },
    async delete(k) { ops.delete++; escritos.set(k, null); },
    async list() { ops.list++; throw new Error('list não simulado no diagnóstico'); },
  };
}
const usosD1 = [];
const d1Bloqueado = { prepare(sql) { usosD1.push(String(sql).slice(0, 40)); throw new Error('D1 não simulado neste diagnóstico'); }, batch() { usosD1.push('batch'); throw new Error('D1 não simulado'); } };
const operacoesDe = (o) => o.get + o.getLote + o.put + o.delete + o.list;

// ---- relógio congelado e rede bloqueada durante as simulações ----
const DataReal = Date; const AGORA = DataReal.now();
class DataFixa extends DataReal { constructor(...a) { if (!a.length) super(AGORA); else super(...a); } static now() { return AGORA; } }
globalThis.Date = DataFixa;
let tentativasDeRede = 0;
globalThis.fetch = async () => { tentativasDeRede++; throw new Error('rede bloqueada no diagnóstico'); };

const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

async function simular(src) {
  const mod = await import(pathToFileURL(`${src}/operacional.js`).href + `?v=${encodeURIComponent(src)}`);
  const kv = kvCopia(); const env = { PORTAL_KV: kv, DB_PLOOMES: d1Bloqueado };
  const fila = await mod.listarColetasRecebiveis(env);
  return { fila, ops: { ...kv.ops }, total: operacoesDe(kv.ops), escritos: [...kv.escritos.entries()].sort(([a], [b]) => (a < b ? -1 : 1)) };
}

// ===================================================================================
console.log('DIAGNÓSTICO DA FILA DA DOCA — somente leitura (nada é gravado na produção)');
console.log(`Horário da leitura (UTC): ${new DataReal(AGORA).toISOString()}`);
globalThis.fetch = fetchReal; // a leitura da produção usa a rede; as simulações não
const osIndice = JSON.parse((await daProducao('os:index')) || '[]');
const opIndice = JSON.parse((await daProducao('op:index')) || '[]');
const naDoca = new Set(opIndice.map((o) => String(o && o.osId)));
const concluidas = osIndice.filter((c) => c && c.status === 'concluida');
const emTransporte = osIndice.filter((c) => c && c.status === 'em_transporte');
const candidatas = concluidas.filter((c) => !naDoca.has(String(c.id)));
// Pré-carrega (só leitura) o que a tela vai ler, para a simulação não depender da rede.
await preCarregar(emTransporte.map((c) => `coleta:${c.id}`));
await preCarregar(candidatas.map((c) => `op:${c.id}`));
const presas = emTransporte.filter((c) => { try { const e = JSON.parse(cache.get(`coleta:${c.id}`) || 'null'); return e && e.status === 'encerrada'; } catch { return false; } });
await preCarregar(presas.map((c) => `os:${c.id}`));
const temOperacao = (raw) => { if (raw == null || raw === '') return false; try { return !!JSON.parse(raw); } catch { return false; } }; // como a tela: valor ilegível ou "null" = sem operação
const comOperacao = candidatas.filter((c) => temOperacao(cache.get(`op:${c.id}`))).length;
globalThis.fetch = async () => { tentativasDeRede++; throw new Error('rede bloqueada no diagnóstico'); };

console.log('\n== Produção agora ==');
console.log(`Índice de OS: ${osIndice.length} OS — ${concluidas.length} concluídas, ${emTransporte.length} em transporte (${presas.length} delas já encerradas pelo motorista: a tela as conserta ao abrir).`);
console.log(`Índice da doca (op:index, guarda as 300 operações mais recentes): ${opIndice.length} operações.`);
console.log(`Concluídas FORA do índice da doca (cada uma = 1 leitura individual por acesso hoje): ${candidatas.length} — ${comOperacao} já recebidas antes (operação antiga) e ${candidatas.length - comOperacao} sem operação (estas formam a fila).`);
// Validade das fichas de operação (já existia; nada muda com a correção): salvarOperacao grava op:{id}
// com validade de 1 ano a partir da última gravação. Para as já recebidas que estão FORA do índice da
// doca, é a ficha que as segura fora da fila; quando ela vencer, a OS volta a aparecer em "Receber lote".
const vencimentos = candidatas.filter((c) => temOperacao(cache.get(`op:${c.id}`))).map((c) => {
  let op = null; try { op = JSON.parse(cache.get(`op:${c.id}`)); } catch { op = null; }
  const t = DataReal.parse(String((op && (op.atualizadoEm || op.em || op.criadoEm)) || ''));
  return { numero: c.numero, vence: Number.isFinite(t) ? new DataReal(t + 365 * 86400e3).toISOString().slice(0, 10) : 'sem data na ficha' };
}).sort((a, b) => (a.vence < b.vence ? -1 : a.vence > b.vence ? 1 : 0));
if (vencimentos.length) console.log(`Validade dessas ${vencimentos.length} fichas (1 ano após a última gravação; quando vencer, a OS volta para a fila — já era assim): ${vencimentos.map((v) => `${v.numero} em ${v.vence}`).join(', ')}.`);
const datasOp = opIndice.map((o) => String((o && o.criadoEm) || '')).filter(Boolean).sort();
if (datasOp.length) console.log(`Operação mais antiga ainda no índice da doca: ${datasOp[0].slice(0, 10)}; mais nova: ${datasOp[datasOp.length - 1].slice(0, 10)}.`);

// Ritmo medido: conclusões e criações por dia útil nas últimas 4 semanas completas.
const DIA = 86400e3; const hojeBR = new DataReal(AGORA - 3 * 3600e3).toISOString().slice(0, 10);
const diasUteis = []; for (let d = 1; diasUteis.length < 20; d++) { const s = new DataReal(DataReal.parse(hojeBR + 'T12:00:00Z') - d * DIA); const w = s.getUTCDay(); if (w >= 1 && w <= 5) diasUteis.push(s.toISOString().slice(0, 10)); }
const janela = new Set(diasUteis); const diaBR = (iso) => (iso ? new DataReal(DataReal.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10) : '');
const concl20 = concluidas.filter((c) => janela.has(diaBR(c.concluidaEm))).length;
const criadas20 = osIndice.filter((c) => janela.has(diaBR(c.criadoEm))).length;
console.log(`Ritmo medido (últimos 20 dias úteis, ${diasUteis[diasUteis.length - 1]} a ${diasUteis[0]}): ${criadas20} OS criadas (${Math.round((criadas20 / 20) * 10) / 10}/dia útil), ${concl20} concluídas (${Math.round((concl20 / 20) * 10) / 10}/dia útil).`);

console.log('\n== "Receber lote": simulação com o código PUBLICADO (antes) ==');
const A = await simular(SRC_ANTES);
console.log(`Operações de KV em UM acesso: ${A.total} (leituras individuais ${A.ops.get}, leituras em lote ${A.ops.getLote}, gravações ${A.ops.put}).`);
console.log(`Fila mostrada: ${A.fila.length} OS. Números, na ordem da tela: ${A.fila.map((x) => x.numero).join(', ') || '(vazia)'}`);
console.log(`Impressão digital da fila (SHA-256 de itens, ordem e campos): ${sha(A.fila)}`);
const fixas = A.total - candidatas.length;
console.log(`Composição: ${fixas} operações fixas/pequenas (índices, OS em transporte e consertos) + ${candidatas.length} leituras que crescem com as concluídas fora do índice da doca.`);
// Crescimento: cada OS concluída vira candidata; quando a doca a recebe, entra no índice da doca e,
// se ele já tem 300 operações, empurra a mais antiga para fora (que vira candidata). Com o índice
// cheio: +1 leitura por OS concluída. Enquanto não enche, a recepção compensa (sem crescimento).
const ritmoMedido = concl20 / 20; const vagas = Math.max(0, 300 - opIndice.length);
const diasAte = (limite, porDia) => { const falta = limite - A.total; if (falta <= 0) return 0; return porDia > 0 ? Math.ceil((vagas + falta) / porDia) : null; };
console.log(`Crescimento: +1 leitura por acesso para cada OS concluída a mais${vagas ? ` (depois que o índice da doca encher: faltam ${vagas} operações para as 300)` : ' (o índice da doca já está cheio, com 300 operações)'}.`);
const bytesPorOS = osIndice.length ? JSON.stringify(osIndice).length / osIndice.length : 0;
const tetoOS = bytesPorOS ? Math.floor((0.95 * 900000) / bytesPorOS) : 0;
console.log(`Teto prático: a poda da madrugada (publicação 369) segura o índice de OS em ~${tetoOS} OS (${Math.round(bytesPorOS)} caracteres por OS hoje); as leituras individuais param de crescer perto de ${tetoOS} − 300 + as fixas, ou seja, ~${Math.max(0, tetoOS - 300 + fixas)} por acesso.`);
for (const limite of [1000, 10000]) console.log(`Até ${limite} operações por acesso (faltam ${Math.max(0, limite - A.total)}): ~${diasAte(limite, ritmoMedido)} dias úteis no ritmo medido (${Math.round(ritmoMedido * 10) / 10} conclusões/dia útil); ~${diasAte(limite, 8)} a 8 por dia útil; ~${diasAte(limite, 25)} a 25 por dia útil.`);

if (SRC_DEPOIS) {
  console.log('\n== "Receber lote": simulação com o código do RAMO (depois) ==');
  const B = await simular(SRC_DEPOIS);
  const filaIgual = JSON.stringify(A.fila) === JSON.stringify(B.fila);
  const gravacoesIguais = JSON.stringify(A.escritos) === JSON.stringify(B.escritos);
  console.log(`Operações de KV em UM acesso: ${B.total} (leituras individuais ${B.ops.get}, leituras em lote ${B.ops.getLote}, gravações ${B.ops.put}).`);
  console.log(`Fila mostrada: ${B.fila.length} OS. Impressão digital: ${sha(B.fila)}`);
  console.log(`COMPARAÇÃO RÍGIDA (mesmos itens, mesma ordem, mesmos campos): ${filaIgual ? 'IDÊNTICA' : 'DIFERENTE'}; gravações da tela (consertos) ${gravacoesIguais ? 'idênticas' : 'DIFERENTES'}.`);
  if (!filaIgual) { const n = Math.max(A.fila.length, B.fila.length); for (let i = 0; i < n; i++) if (JSON.stringify(A.fila[i]) !== JSON.stringify(B.fila[i])) { console.log(`  primeira diferença na posição ${i + 1}: ${(A.fila[i] || {}).numero || '-'} × ${(B.fila[i] || {}).numero || '-'}`); break; } }
}

// "Montar carga" (/cargas/nova): MESMO defeito — só medição (sem simulação: a lógica está na rota).
console.log('\n== "Montar carga" (/cargas/nova): só medição ==');
try {
  const cargas = await d1Producao('SELECT status, os_json FROM op_cargas ORDER BY criado_em DESC LIMIT 200');
  const total = await d1Producao('SELECT COUNT(*) AS n FROM op_cargas');
  const emCargas = new Set(); for (const cg of cargas) { if (cg.status === 'cancelada') continue; let l = []; try { l = JSON.parse(cg.os_json || '[]'); } catch { l = []; } for (const o of (Array.isArray(l) ? l : [])) if (o && o.id) emCargas.add(String(o.id)); }
  const candCarga = concluidas.filter((c) => !emCargas.has(String(c.id)));
  console.log(`Cargas no banco: ${(total[0] && total[0].n) || 0} (a tela olha as 200 mais recentes). Concluídas fora de carga: ${candCarga.length} → ${candCarga.length} leituras individuais por acesso hoje (+2 fixas). Cresce +1 por OS concluída que ainda não entrou em carga.`);
} catch (e) { console.log(`Não deu para ler as cargas no D1 (${e.message}).`); }

console.log('\n== Controle ==');
console.log(`Leituras feitas na produção por este diagnóstico: ${leiturasProducao} (todas só leitura). Tentativas de rede durante as simulações: ${tentativasDeRede} (bloqueadas). Usos do D1 durante as simulações: ${usosD1.length}${usosD1.length ? ' — ' + usosD1.join(' | ') : ''}.`);
