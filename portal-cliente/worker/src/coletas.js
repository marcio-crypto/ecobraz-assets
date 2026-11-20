// Módulo Ordem de Coleta (OS) — geração PRÓPRIA a partir do cliente cadastrado.
// Substitui o "gerar coleta" do Ploomes. A escritório/comercial (Débora) cria; o app do
// motorista lê pra executar; o operacional recebe. Guardado no KV (os:index + os:{id} + os:seq).
//
// Numeração: OS-AAAA-NNNN (sequencial no ano). Id interno: coleta_<uuid>.

import { botaoGoogle } from './google-auth.js';
import { lerCliente } from './cadastro.js';
import { abasEquipe } from './os-utils.js';
import { lerChavesKV } from './kv-lote.js';
import { situacaoPrazo, textoBR } from './atendimento.js';
import { COMO_OPCOES, COMO_OUTRO_MAX, comoValido, rotuloComo, lerComo } from './como-nos-achou.js';
import qrcode from 'qrcode-generator';

const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function hmacSHA(secret, data) { const k = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, TE.encode(data)))); }
export async function seloOS(id, env) { const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-os'; return (await hmacSHA(`${base}|os-selo-v1`, `os:${id}`)).slice(0, 12); }
function origemPortal(env, url) { return String(env.PORTAL_BASE_URL || env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const anoAtual = () => { try { return new Date().getFullYear(); } catch { return 2026; } };
// Valor em BRL: lê "1.234,56"/"1234.56"/"120,00" → número; formata número → "1.234,56".
// Pedido da Débora (2026-07-31): valor cobrado por item, discriminado no documento.
const numValor = (v) => { let s = String(v == null ? '' : v).trim().replace(/[^0-9.,-]/g, ''); if (!s) return 0; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, ''); const n = Number(s); return Number.isFinite(n) && n > 0 ? n : 0; };
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Tipos de certificado/laudo que o cliente pode solicitar na Ordem de Coleta
// (pedido da Débora). Lista fechada — o que a Ecobraz emite hoje.
const CERTIFICADOS_OS = ['Laudo fotográfico', 'Laudo de Sanitização', 'Certificado de Destinação', 'Certificado Detalhado'];
const normalizarCertificados = (v) => (Array.isArray(v) ? CERTIFICADOS_OS.filter((c) => v.includes(c)) : []);
// Tipos de laudo/documento que podem ser ANEXADOS a uma OS (pedido do Marcelo).
// Tipar o anexo organiza os documentos por natureza e deixa claro, na auditoria,
// o que cada arquivo comprova. Lista fechada + "Outro" para o que não se enquadra.
export const TIPOS_ANEXO = [
  'Foto do material / local',
  'Laudo de Descaracterização',
  'Laudo de Destruição de Dados',
  'Laudo de Análise Química',
  'Laudo fotográfico',
  'Laudo de Sanitização',
  'Certificado de Destinação',
  'Nota Fiscal',
  'MTR (PDF)',
  'Outro documento',
];
const normalizarTipoAnexo = (v) => (TIPOS_ANEXO.includes(v) ? v : '');
// Ícone por natureza do anexo — ajuda o olho a achar o documento certo na lista.
const iconeTipoAnexo = (tipo, ct) => {
  if (/Destruição de Dados/i.test(tipo)) return '🔒';
  if (/Descaracterização/i.test(tipo)) return '🧰';
  if (/Análise Química/i.test(tipo)) return '🧪';
  if (/Sanitização/i.test(tipo)) return '🧼';
  if (/Certificado/i.test(tipo)) return '🏅';
  if (/Nota Fiscal/i.test(tipo)) return '🧾';
  if (/MTR/i.test(tipo)) return '🏛️';
  if (/Laudo/i.test(tipo)) return '📋';
  return /image/.test(ct || '') ? '🖼️' : '📄';
};
// Fuso de Brasília (UTC-3, sem horário de verão). Datas com hora (ISO em UTC) são
// convertidas; datas só-dia (sem "T") ficam como estão.
const dataBR = (iso) => { const d = new Date(iso); if (!iso || isNaN(d.getTime())) return ''; if (String(iso).includes('T')) d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
const STATUS = { agendada: 'Agendada', em_transporte: 'Em transporte', na_unidade: 'Na unidade', concluida: 'Concluída', cancelada: 'Cancelada' };
const STATUS_COR = { agendada: '#8A6A16;background:#FFF4DE', em_transporte: '#0B5B66;background:#E3F0F3', na_unidade: '#6B3FA0;background:#EFE7FA', concluida: '#1E5B31;background:#E4F3E6', cancelada: '#8a4b45;background:#FBE9E7' };

// --- Índice de OS (os:index) + ARQUIVO das OS que saem dele (pedido do Marcio, 20/11/2026) -------
// O índice tem teto de tamanho (LIMITE_INDICE_OS). Perto do teto, as OS fechadas mais antigas saem
// do índice — mas ANTES ficam guardadas à parte, inteiras: a entrada do índice e o registro completo
// os:{id}, na tabela os_arquivo do D1 (sem teto prático). A poda roda de madrugada (agendamento das
// 06:00 UTC, podarIndiceAgendado: acima de 95% do teto, volta a 90%), longe do horário em que a
// equipe grava OS; durante o dia só acontece se o índice passar do teto (e aí volta só a 97%; o
// resto fica para a madrugada). OS aberta e OS fechada nos últimos 30 dias NUNCA saem do índice na
// poda (só no último caso: índice acima do teto sem nenhuma outra fechada para tirar). Quem só LÊ
// a lista (listarColetasOS: telas, busca, portal do cliente, documentos, conector, relatórios)
// recebe índice + arquivo, sem repetir. Quem GRAVA o índice usa lerIndiceOS (só o índice); senão as
// OS guardadas voltariam para o índice a cada gravação. As filas de trabalho do dia (recepção/doca,
// nova carga, frota ao vivo) continuam lendo só o índice (listarIndiceOS), como antes: elas usam
// coletas em andamento ou fechadas há pouco, que ficam no índice pela regra acima.
const CHAVE_ARQUIVO_INFO = 'os:arquivo:info'; // sinal: já houve OS guardada à parte ({ desde, ultimo, n })
async function lerIndiceOS(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('os:index') : null;
  return raw ? JSON.parse(raw) : [];
}
// Só o índice, sem as OS guardadas à parte — para as filas de trabalho do dia (ver acima).
export async function listarIndiceOS(env) { return lerIndiceOS(env); }
let tabelaArquivoOk = false;
async function prepararArquivoOS(db) {
  if (tabelaArquivoOk) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS os_arquivo (id TEXT PRIMARY KEY, numero TEXT, criado_em TEXT, status TEXT, cliente_id TEXT, indice TEXT NOT NULL, registro TEXT, arquivado_em TEXT NOT NULL, atualizado_em TEXT)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS os_arquivo_criado ON os_arquivo (criado_em)').run();
  tabelaArquivoOk = true;
}
const semTabelaArquivo = (e) => /no such table/i.test(String((e && e.message) || e));
// Consulta o arquivo quando ele pode ter OS: já houve arquivamento (sinal no KV, ou o sinal não pôde
// ser lido) OU o índice está a partir de 85% do teto (depois de uma poda ele fica em ~90%: cobre o
// sinal que ainda não chegou a todas as regiões do KV). Antes disso — o caso até o índice encher —,
// nenhuma consulta ao D1: a lista sai exatamente como antes (só 1 leitura a mais no KV, a do sinal).
const arquivoNaLeitura = (raw, info) => !!info || String(raw || '').length >= Math.floor(0.85 * LIMITE_INDICE_OS);
// Entradas guardadas à parte (o texto JSON da entrada do índice de cada OS). Lança erro se o D1 falhar.
async function lerArquivoOS(env) {
  const db = env.DB_PLOOMES; if (!db) return { textos: [], ids: [], ilegiveis: 0 };
  let r;
  try { r = await db.prepare('SELECT indice FROM os_arquivo ORDER BY criado_em DESC, id DESC').all(); }
  catch (e) { if (semTabelaArquivo(e)) return { textos: [], ids: [], ilegiveis: 0 }; throw e; }
  const textos = [], ids = []; let ilegiveis = 0;
  for (const row of (r && r.results) || []) { try { const x = JSON.parse(row.indice); if (x && x.id) { textos.push(row.indice); ids.push(String(x.id)); } else ilegiveis++; } catch { ilegiveis++; } }
  return { textos, ids, ilegiveis };
}
// Memória curta da leitura do arquivo (por isolado do Worker): as telas que se atualizam sozinhas e o
// /health (público) não consultam o D1 a cada chamada. Vale até 60 s e enquanto o sinal não mudar (ele
// muda a cada arquivamento e a cada alteração numa OS guardada; a alteração também apaga a memória
// deste isolado na hora). Se uma OS que estava no índice quando a memória foi feita sumiu dele e não
// está na memória, ela acabou de ser guardada (o sinal novo pode ainda não ter chegado a esta região
// do KV): relê o D1. Cada chamada recebe objetos novos (o JSON é relido), então quem mexe na lista
// não mexe na memória.
const MEMORIA_ARQUIVO_MS = 60e3;
const memoriaArquivo = new WeakMap(); // env.DB_PLOOMES → { chave, em, json, ids, idsArquivo, idsIndice, ilegiveis }
function esquecerArquivoLido(env) { if (env && env.DB_PLOOMES) memoriaArquivo.delete(env.DB_PLOOMES); }
async function lerArquivoOSComMemoria(env, chave, idsIndice) {
  const t = Date.now(); const m = memoriaArquivo.get(env.DB_PLOOMES);
  if (m && m.chave === chave && t >= m.em && t - m.em < MEMORIA_ARQUIVO_MS) {
    let saiu = false; for (const id of m.idsIndice) if (!idsIndice.has(id) && !m.idsArquivo.has(id)) { saiu = true; break; }
    if (!saiu) return m;
  }
  const r = await lerArquivoOS(env);
  const novo = { chave, em: t, json: '[' + r.textos.join(',') + ']', ids: r.ids, idsArquivo: new Set(r.ids), idsIndice: new Set(idsIndice), ilegiveis: r.ilegiveis };
  memoriaArquivo.set(env.DB_PLOOMES, novo);
  return novo;
}
const novoSinal = () => Math.random().toString(36).slice(2, 10);
// Lista para LEITURA: índice + OS guardadas à parte (a entrada do índice vale quando a OS está nos
// dois — ela voltou ao índice ao ser alterada). `erroArquivo` = o arquivo não pôde ser lido agora (a
// lista sai só com o índice; a lista de OS do escritório e o conector avisam); `ilegiveis` = linhas
// do arquivo que não deu para ler (ficam de fora; também avisado).
export async function listarColetasOSCompleta(env) {
  const [raw, info] = await Promise.all([
    env.PORTAL_KV ? env.PORTAL_KV.get('os:index') : null,
    env.PORTAL_KV ? Promise.resolve().then(() => env.PORTAL_KV.get(CHAVE_ARQUIVO_INFO)).catch(() => 'erro') : null,
  ]);
  const idx = raw ? JSON.parse(raw) : [];
  const out = { lista: idx, noIndice: idx.length, guardadas: 0, erroArquivo: '', ilegiveis: 0 };
  if (!env.DB_PLOOMES || !arquivoNaLeitura(raw, info)) return out;
  try {
    const ids = new Set(idx.map((x) => x && String(x.id)));
    const m = await lerArquivoOSComMemoria(env, String(info || ''), ids);
    out.ilegiveis = m.ilegiveis;
    if (m.ids.some((id) => !ids.has(id))) {
      const fora = JSON.parse(m.json).filter((x) => !ids.has(String(x.id)));
      out.lista = idx.concat(fora); out.guardadas = fora.length;
    }
  } catch (e) { out.erroArquivo = 'leitura'; console.error('os_arquivo_leitura', String((e && e.message) || e).slice(0, 120)); }
  if (out.ilegiveis) console.error('os_arquivo_ilegiveis', out.ilegiveis);
  return out;
}
export async function listarColetasOS(env) {
  return (await listarColetasOSCompleta(env)).lista;
}
export async function lerColetaOS(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`os:${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
// Materiais da OS em texto NORMALIZADO (sem acento, minúsculo) para o índice, sempre
// em 3 partes: "quantidade | material | qtd item; qtd item" ('' quando não há nada).
// Com isso o filtro por material, os materiais mais coletados e a estimativa de peso
// da agenda saem do índice, sem abrir OS por OS (consultas do Claude, 17/11).
const semAcentoMin = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Até 200 caracteres (o índice tem teto de tamanho); o corte cai entre palavras, para
// nunca deixar um número pela metade.
export function materialIndiceOS(rec) {
  const n = (s) => semAcentoMin(s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const itens = (Array.isArray(rec && rec.itens) ? rec.itens : []).map((it) => `${String((it && it.qtd) || '1').trim()} ${String((it && it.nome) || '').trim()}`).filter((s) => s.trim()).join('; ');
  const partes = [n(rec && rec.quantidade), n(rec && rec.material), n(itens)];
  if (!partes.some(Boolean)) return '';
  const s = partes.join(' | ');
  if (s.length <= 200) return s;
  const corte = s.slice(0, 201);
  const fimItem = corte.lastIndexOf('; ');
  return (fimItem > 120 ? corte.slice(0, fimItem) : s.slice(0, 200).replace(/[\s;,][^\s;,]*$/, '')).trim();
}
const placaDaOS = (rec) => String((rec && rec.transportadora && rec.transportadora.placa) || (rec && rec.veiculoPlaca) || '').trim().toUpperCase();
const isoValido = (v) => { const s = String(v || ''); return s && !isNaN(Date.parse(s)) ? s : ''; };
// Entrada do índice (os:index) reconstruída a partir do registro completo — usada
// quando uma OS existe em os:{id} mas sumiu do índice (ex.: gravações concorrentes
// se atropelaram): em vez de divergir para sempre, a OS re-entra no índice.
function resumoIndiceOS(rec) {
  const r = { id: rec.id, numero: rec.numero, status: rec.status, clienteId: rec.clienteId || '', clienteDoc: rec.clienteDoc || '', clienteNome: rec.clienteNome || '', cidade: cidadeDoEndereco(rec.endereco), dataAgendada: rec.dataAgendada || '', agenteNome: rec.agenteNome || '', agenteEmail: rec.agenteEmail || '', criadoEm: rec.criadoEm || '' };
  if (rec.transportadora) r.transp = rec.transportadora.nome;
  if (rec.reagendar) r.reagendar = 1;
  if (rec.mtr && rec.mtr.numero) r.mtr = rec.mtr.numero;
  if (rec.cobranca) r.cobranca = { valor: rec.cobranca.valor, status: rec.cobranca.status, link: rec.cobranca.link };
  r.mat = materialIndiceOS(rec);
  const placa = placaDaOS(rec); if (placa) r.placa = placa;
  if (rec.concluidaEm) r.concluidaEm = rec.concluidaEm;
  if (rec.canceladaEm) r.canceladaEm = rec.canceladaEm;
  if (rec.leadId) r.leadId = rec.leadId;
  if (rec.prazoAlvoEm) r.prazoAlvoEm = rec.prazoAlvoEm;
  if (rec.comoNosAchou) r.como = rec.comoNosAchou; // "Como nos achou?" (código); sem ele = não informado
  return r;
}
// Grava o índice de OS. O antigo `.slice(0, 900000)` CORTAVA O JSON NO MEIO quando o
// índice crescesse além do limite — o texto viraria JSON inválido e TODAS as listas
// (escritório, app do motorista, recepção) quebrariam de uma vez. Aqui, se passar do
// limite, PODAMOS entradas inteiras: primeiro as mais antigas já fechadas (concluída/
// cancelada), e só em último caso as mais antigas restantes. O texto gravado é sempre JSON
// válido. Desde 20/11/2026, NADA sai do índice sem antes estar guardado no arquivo
// (arquivarOS); o que não pôde ser guardado fica no índice (mesmo passando um pouco do teto)
// e sai numa próxima gravação. Durante o dia a poda leva o índice a 97% do teto (não só "até
// caber", para não podar a cada gravação; e não mais que isso, para a gravação de quem está
// trabalhando não demorar); o resto fica para a poda da madrugada, que o leva a 90%.
export const LIMITE_INDICE_OS = 900000;
const PODA_ALVO_DIA = 0.97;       // poda durante o dia (só acima do teto): até 97% do teto
const PODA_ALVO_MADRUGADA = 0.9;  // poda da madrugada: até 90% do teto
const PODA_MADRUGADA = 0.95;      // a poda da madrugada começa quando o índice passa de 95% do teto
const FECHADA_RECENTE_DIAS = 30;  // OS fechada há menos que isso não sai do índice (filas da doca e de cargas)
const fechadaOS = (x) => !!(x && (x.status === 'concluida' || x.status === 'cancelada'));
const fechadaRecente = (x, corte) => Math.max(Date.parse((x && x.concluidaEm) || '') || 0, Date.parse((x && x.canceladaEm) || '') || 0) >= corte;
// Escolhe o que sai (as fechadas do fim do índice — as inseridas há mais tempo — e que não foram
// fechadas nos últimos 30 dias), guarda à parte e devolve o índice que fica (JSON) e as entradas que
// saíram. soFechadas: nunca tira OS aberta nem recente (poda da madrugada); sem isso vale o último
// caso de antes (índice ainda acima do TETO: saem as mais antigas restantes, quaisquer que sejam).
async function podarIndice(env, arr, opcoes) {
  const o = opcoes || {};
  let excesso = JSON.stringify(arr).length - Math.floor((o.alvo || PODA_ALVO_DIA) * LIMITE_INDICE_OS);
  const corte = Date.now() - FECHADA_RECENTE_DIAS * 86400e3;
  const sai = new Set(); const exigeFechada = new Set();
  for (let i = arr.length - 1; i >= 0 && excesso > 0; i--) {
    const x = arr[i];
    if (fechadaOS(x) && !fechadaRecente(x, corte)) { sai.add(x); if (x.id) exigeFechada.add(String(x.id)); excesso -= JSON.stringify(x).length + 1; }
  }
  if (!o.soFechadas) {
    let resto = sai.size ? arr.filter((x) => !sai.has(x)) : arr;
    let jsonResto = JSON.stringify(resto);
    while (jsonResto.length > LIMITE_INDICE_OS && resto.length) {
      const fica = resto.slice(0, Math.max(1, Math.floor(resto.length * 0.9)) - 1);
      for (const x of resto.slice(fica.length)) sai.add(x);
      resto = fica; jsonResto = JSON.stringify(resto);
    }
  }
  const guardadas = await arquivarOS(env, [...sai], exigeFechada);
  // Sai do índice só o que ficou guardado (entrada sem id não é OS: sai sem guardar).
  const podeSair = (x) => sai.has(x) && (!x || !x.id || guardadas.has(String(x.id)));
  const saiu = [...sai].filter(podeSair);
  const ficaram = sai.size - saiu.length;
  if (ficaram) console.error('os_arquivo_nao_podou', { ficaram, guardadas: guardadas.size });
  return { json: JSON.stringify(arr.filter((x) => !podeSair(x))), saiu, ficaram };
}
async function salvarIndiceOS(env, idx) {
  if (!env.PORTAL_KV) return;
  const arr = Array.isArray(idx) ? idx : [];
  let json = JSON.stringify(arr);
  if (json.length > LIMITE_INDICE_OS) json = (await podarIndice(env, arr)).json;
  await env.PORTAL_KV.put('os:index', json);
}
// Poda da MADRUGADA (agendamento das 06:00 UTC = 03:00 de Brasília): acima de 95% do teto, guarda à
// parte as OS fechadas mais antigas (fechadas há mais de 30 dias) até o índice ficar em 90% — longe do horário em que a equipe e
// os motoristas gravam OS (a gravação do índice não é atômica: duas ao mesmo tempo podem se
// atropelar, e guardar à parte demora mais do que uma gravação comum). Relê o índice logo antes de
// gravar e só tira as entradas que não mudaram nesse meio tempo (a que mudou fica e sai depois).
export async function podarIndiceAgendado(env) {
  if (!env || !env.PORTAL_KV || !env.DB_PLOOMES) return { podou: 0 };
  const pctDe = (n) => Math.round((n / LIMITE_INDICE_OS) * 1000) / 10;
  const idx = await lerIndiceOS(env);
  const antes = JSON.stringify(idx).length;
  if (antes <= Math.floor(PODA_MADRUGADA * LIMITE_INDICE_OS)) return { podou: 0, pct: pctDe(antes) };
  const r = await podarIndice(env, idx, { soFechadas: true, alvo: PODA_ALVO_MADRUGADA });
  const sairam = new Map(r.saiu.filter((x) => x && x.id).map((x) => [String(x.id), JSON.stringify(x)]));
  if (!sairam.size) return { podou: 0, ficaram: r.ficaram, pct: pctDe(antes) };
  const fresco = await lerIndiceOS(env);
  const fica = fresco.filter((x) => !(x && x.id && sairam.get(String(x.id)) === JSON.stringify(x)));
  const json = JSON.stringify(fica);
  await env.PORTAL_KV.put('os:index', json);
  return { podou: fresco.length - fica.length, ficaram: r.ficaram, pct: pctDe(antes), pctDepois: pctDe(json.length) };
}
// Entrada guardada à parte, refeita a partir do registro completo (a mesma de resumoIndiceOS): assim
// a cópia guardada acompanha o registro, em vez de só receber remendos. Da entrada anterior fica só
// o que não existe no registro: a hora de conclusão estimada pelo app do motorista e a marca de
// conclusão sem registro (completarIndiceOS).
function entradaDoArquivo(rec, antiga) {
  const e = resumoIndiceOS(rec);
  if (antiga && e.status === 'concluida' && !e.concluidaEm) {
    if (antiga.concluidaEm) e.concluidaEm = antiga.concluidaEm;
    else if (antiga.conclSemReg) e.conclSemReg = antiga.conclSemReg;
  }
  return e;
}
// Fichas os:{id} de várias OS: Map id → { lido: true, v } (v = null se não existe) ou { lido: false }
// (não deu para ler agora). Leitura em lote (100 por vez); se o lote falhar, uma a uma.
async function lerRegistrosOS(env, ids) {
  const out = new Map(); const kv = env.PORTAL_KV;
  for (let i = 0; i < ids.length; i += 100) {
    const parte = ids.slice(i, i + 100); const chaves = parte.map((id) => `os:${id}`);
    let m = null;
    try { const r = await kv.get(chaves); if (r instanceof Map) m = r; } catch { m = null; }
    if (m) { parte.forEach((id, k) => out.set(id, { lido: true, v: m.has(chaves[k]) ? m.get(chaves[k]) : null })); continue; }
    const vals = await Promise.all(chaves.map((c) => Promise.resolve().then(() => kv.get(c)).then((v) => ({ lido: true, v }), () => ({ lido: false }))));
    parte.forEach((id, k) => out.set(id, vals[k]));
  }
  return out;
}
// Guarda à parte, INTEIRAS, as OS que vão sair do índice: a entrada (refeita a partir do registro,
// ver entradaDoArquivo) e o registro completo os:{id} (que também continua no KV). Devolve os ids
// guardados. Registro que não pôde ser lido agora: essa OS não é guardada nem sai do índice (tenta de
// novo na próxima poda). Registro que não existe (só a entrada do índice): guarda a entrada como está.
// `exigeFechada` (ids): escolhidas por estarem fechadas — se a ficha diz que a OS está ABERTA (a
// entrada do índice estava desatualizada), ela não é guardada nem sai do índice. O D1 grava em lotes
// de 25; lote recusado é tentado linha a linha (uma linha com problema não trava as outras); 3
// recusas sem nenhum acerto, ou 5 seguidas, = D1 fora do ar: para (o que faltou fica no índice).
// Tabela ausente (banco novo ou tabela apagada): recria e tenta de novo, uma vez. O sinal
// os:arquivo:info liga a consulta ao arquivo nas leituras; se ele não puder ser gravado, nada sai.
const LOTE_ARQUIVO = 25;
async function arquivarOS(env, entradas, exigeFechada) {
  const lista = (entradas || []).filter((x) => x && x.id);
  if (!lista.length || !env.DB_PLOOMES || !env.PORTAL_KV) return new Set();
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try { return await gravarNoArquivo(env, lista, exigeFechada || new Set()); }
    catch (e) {
      const semTabela = semTabelaArquivo(e);
      if (semTabela) tabelaArquivoOk = false; // a tabela sumiu (ou o banco é novo): recria e tenta de novo, uma vez
      if (!semTabela || tentativa) { console.error('os_arquivo_gravacao', String((e && e.message) || e).slice(0, 160)); return new Set(); }
    }
  }
  return new Set();
}
async function gravarNoArquivo(env, lista, exigeFechada) {
  const ok = new Set();
  const db = env.DB_PLOOMES;
  await prepararArquivoOS(db);
  const regs = await lerRegistrosOS(env, lista.map((x) => String(x.id)));
  const prontas = [];
  for (const x of lista) {
    const r = regs.get(String(x.id));
    if (!r || !r.lido) continue;
    let rec = null; if (r.v != null) { try { rec = JSON.parse(r.v); } catch { rec = null; } }
    const e = rec && rec.id ? entradaDoArquivo(rec, x) : x;
    if (exigeFechada.has(String(x.id)) && !fechadaOS(e)) { console.error('os_arquivo_entrada_desatualizada', String(x.id)); continue; }
    prontas.push({ id: String(x.id), e, v: r.v });
  }
  if (!prontas.length) return ok;
  const em = agora();
  const sql = 'INSERT INTO os_arquivo (id, numero, criado_em, status, cliente_id, indice, registro, arquivado_em, atualizado_em) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) ON CONFLICT(id) DO UPDATE SET numero = excluded.numero, criado_em = excluded.criado_em, status = excluded.status, cliente_id = excluded.cliente_id, indice = excluded.indice, registro = COALESCE(excluded.registro, os_arquivo.registro), arquivado_em = excluded.arquivado_em, atualizado_em = excluded.atualizado_em';
  const linha = (p) => db.prepare(sql).bind(p.id, String(p.e.numero || ''), String(p.e.criadoEm || ''), String(p.e.status || ''), String(p.e.clienteId || ''), JSON.stringify(p.e), p.v == null ? null : String(p.v), em);
  const gravadas = []; let recusas = 0, seguidas = 0;
  const parar = () => (!gravadas.length && recusas >= 3) || seguidas >= 5; // D1 fora do ar: não insiste
  for (let k = 0; k < prontas.length && !parar(); k += LOTE_ARQUIVO) {
    const parte = prontas.slice(k, k + LOTE_ARQUIVO);
    try { await db.batch(parte.map(linha)); gravadas.push(...parte); seguidas = 0; continue; }
    catch (e) { if (semTabelaArquivo(e)) throw e; console.error('os_arquivo_lote', String((e && e.message) || e).slice(0, 160)); }
    for (const p of parte) {
      if (parar()) break;
      try { await linha(p).run(); gravadas.push(p); seguidas = 0; }
      catch (e) { if (semTabelaArquivo(e)) throw e; recusas++; seguidas++; console.error('os_arquivo_gravacao_os', p.id, String((e && e.message) || e).slice(0, 120)); }
    }
  }
  if (!gravadas.length) return ok;
  let info = null; try { info = JSON.parse((await env.PORTAL_KV.get(CHAVE_ARQUIVO_INFO)) || 'null'); } catch { info = null; }
  await env.PORTAL_KV.put(CHAVE_ARQUIVO_INFO, JSON.stringify({ desde: (info && info.desde) || em, ultimo: em, n: novoSinal() }));
  esquecerArquivoLido(env);
  for (const p of gravadas) ok.add(p.id);
  return ok;
}
// OS que está no arquivo foi alterada (status, MTR, cobrança, edição, reagendamento): a cópia
// guardada é refeita a partir do registro novo (entradaDoArquivo) e o registro completo é trocado; o
// sinal ganha um valor novo, para os outros isolados relerem o arquivo. Devolve a entrada nova — ou
// null: a OS não está no arquivo (ou ainda não há arquivo).
async function atualizarArquivadaOS(env, rec) {
  const db = env.DB_PLOOMES; if (!db || !rec || !rec.id) return null;
  try {
    const row = await db.prepare('SELECT indice FROM os_arquivo WHERE id = ?1').bind(String(rec.id)).first();
    if (!row) return null;
    let antiga = null; try { antiga = JSON.parse(row.indice); } catch { antiga = null; }
    const e = entradaDoArquivo(rec, antiga);
    await db.prepare('UPDATE os_arquivo SET indice = ?2, status = ?3, registro = ?4, atualizado_em = ?5 WHERE id = ?1').bind(String(rec.id), JSON.stringify(e), String(e.status || ''), JSON.stringify(rec), agora()).run();
    esquecerArquivoLido(env);
    try { const i = JSON.parse((await env.PORTAL_KV.get(CHAVE_ARQUIVO_INFO)) || 'null'); if (i) await env.PORTAL_KV.put(CHAVE_ARQUIVO_INFO, JSON.stringify({ ...i, n: novoSinal() })); }
    catch { /* sem o sinal novo, os outros isolados veem a mudança em até 60 s */ }
    return e;
  } catch (e) { if (!semTabelaArquivo(e)) console.error('os_arquivo_atualizacao', String((e && e.message) || e).slice(0, 160)); return null; }
}
// Situação do índice e do arquivo para o /health (público) — só contagens e tamanho, nunca dados nem
// mensagem de erro. bytes = caracteres do índice (o teto também é contado em caracteres).
// guardadas = OS no arquivo; foraDoIndice = as que só aparecem pelo arquivo (as demais voltaram ao
// índice ao mudar de status). Usa a memória curta da leitura do arquivo (lerArquivoOSComMemoria).
export const NIVEIS_AVISO_INDICE = [100, 85, 70];
const textoAvisoIndice = (pct) => (pct > 100
  ? 'passou do teto: as OS fechadas mais antigas ainda não puderam ser guardadas à parte (nada foi apagado: elas continuam no índice e o sistema tenta de novo)'
  : `passou de ${pct >= 85 ? 85 : 70}% do teto — perto do teto (a partir de 95%), as OS fechadas mais antigas saem do índice de madrugada e ficam guardadas à parte, inteiras`);
export async function saudeIndiceOS(env) {
  const osIndex = { ok: true, qtd: 0, bytes: 0, teto: LIMITE_INDICE_OS, percentualDoTeto: 0, aviso: '' };
  const osArquivo = { ok: true, guardadas: 0, foraDoIndice: 0 };
  let raw = null, info = null, idx = [];
  try {
    [raw, info] = await Promise.all([env.PORTAL_KV ? env.PORTAL_KV.get('os:index') : null, env.PORTAL_KV ? Promise.resolve().then(() => env.PORTAL_KV.get(CHAVE_ARQUIVO_INFO)).catch(() => 'erro') : null]);
  } catch { return { osIndex: { ok: false, erro: 'kv_indisponivel', teto: LIMITE_INDICE_OS }, osArquivo: { ok: false, erro: 'kv_indisponivel' } }; }
  osIndex.bytes = raw ? raw.length : 0;
  const pct = (osIndex.bytes / LIMITE_INDICE_OS) * 100;
  osIndex.percentualDoTeto = Math.round(pct * 10) / 10;
  if (pct >= 70) osIndex.aviso = textoAvisoIndice(pct);
  try { idx = raw ? JSON.parse(raw) : []; osIndex.qtd = idx.length; }
  catch { osIndex.ok = false; osIndex.erro = 'indice_ilegivel'; return { osIndex, osArquivo }; }
  if (env.DB_PLOOMES && arquivoNaLeitura(raw, info)) {
    try {
      const noIdx = new Set(idx.map((x) => x && String(x.id)));
      const m = await lerArquivoOSComMemoria(env, String(info || ''), noIdx);
      osArquivo.guardadas = m.ids.length; osArquivo.foraDoIndice = m.ids.filter((id) => !noIdx.has(id)).length;
      if (m.ilegiveis) osArquivo.ilegiveis = m.ilegiveis;
    } catch { osArquivo.ok = false; osArquivo.erro = 'd1_indisponivel'; }
  }
  if (info && info !== 'erro') { try { const i = JSON.parse(info); osArquivo.desde = i.desde || ''; osArquivo.ultimo = i.ultimo || ''; } catch { /* sem datas */ } }
  return { osIndex, osArquivo };
}
// Aviso por e-mail quando o índice passa de 70% e de 85% do teto (pedido do Marcio, 20/11/2026):
// UMA vez por nível (marca no KV, junto com o teto: se o teto mudar, os avisos voltam a valer). Se
// pular de menos de 70% direto para 85%+, sai um e-mail só (o de 85%). Acima de 100% = a poda não
// conseguiu guardar as OS (D1 com problema): sai o aviso de 100%, que volta a valer quando o índice
// fica de novo abaixo do teto. `para` = lista de e-mails (quem chama decide). Roda no agendamento
// diário das 11:00 UTC.
const marcaAvisoIndice = (nivel) => `notif:indiceos:${LIMITE_INDICE_OS}:${nivel}`;
export async function avisoTetoIndiceOS(env, para) {
  if (!env || !env.PORTAL_KV) return { enviado: false, motivo: 'sem_kv' };
  const raw = await env.PORTAL_KV.get('os:index');
  const bytes = raw ? raw.length : 0;
  const pct = (bytes / LIMITE_INDICE_OS) * 100;
  const pct1 = Math.round(pct * 10) / 10;
  if (pct <= 100 && await env.PORTAL_KV.get(marcaAvisoIndice(100))) await env.PORTAL_KV.delete(marcaAvisoIndice(100));
  const nivel = NIVEIS_AVISO_INDICE.find((n) => (n === 100 ? pct > 100 : pct >= n));
  if (!nivel) return { enviado: false, motivo: 'abaixo_de_70', pct: pct1 };
  if (await env.PORTAL_KV.get(marcaAvisoIndice(nivel))) return { enviado: false, motivo: 'ja_avisado', nivel };
  const dest = [...new Set((Array.isArray(para) ? para : []).map((s) => String(s || '').split('|')[0].trim().toLowerCase()).filter((s) => /^\S+@\S+\.\S+$/.test(s)))].slice(0, 10);
  if (!dest.length) return { enviado: false, motivo: 'sem_destinatario', nivel };
  if (!env.RESEND_API_KEY) return { enviado: false, motivo: 'sem_chave_email', nivel };
  let qtd = 0; try { qtd = raw ? JSON.parse(raw).length : 0; } catch { qtd = 0; }
  const situacao = `A lista de Ordens de Coleta (o índice que o sistema usa para montar as telas e as contagens) está em ${pct1.toLocaleString('pt-BR')}% do teto de tamanho: ${bytes.toLocaleString('pt-BR')} de ${LIMITE_INDICE_OS.toLocaleString('pt-BR')} caracteres, com ${qtd.toLocaleString('pt-BR')} OS.`;
  const rodape = 'Situação a qualquer momento: https://sistema.ecobraz.org/health (osIndex e osArquivo).\n\nEcobraz · sistema';
  const assunto = nivel === 100 ? 'Sistema Ecobraz: a lista de OS passou do teto e a poda não andou (verificar)' : `Sistema Ecobraz: a lista de OS passou de ${nivel}% do teto (nada a fazer agora)`;
  const texto = nivel === 100
    ? `${situacao}\n\nO que isso quer dizer: as OS fechadas mais antigas deveriam ter saído dessa lista e ficado guardadas à parte, mas a gravação no banco (D1) não aconteceu. Nada foi apagado: enquanto não forem guardadas, elas continuam na lista, e o sistema tenta de novo a cada gravação e toda madrugada.\n\nO que fazer: pedir a quem cuida do sistema para conferir o /health e o registro de erros (os_arquivo_gravacao). Este aviso volta a sair se acontecer de novo depois de normalizar.\n\n${rodape}`
    : `${situacao}\n\nO que isso quer dizer: perto do teto (a partir de 95%), as OS fechadas há mais de 30 dias e mais antigas saem dessa lista de madrugada — e, antes de sair, cada uma é guardada à parte, inteira. A lista e a busca de OS, a tela da OS, o portal do cliente, os documentos e as consultas do Claude continuam enxergando também as guardadas; as filas do dia (recepção, nova carga, frota ao vivo) usam as coletas em andamento e as fechadas há pouco, como antes.\n\nNada a fazer agora. Este aviso sai uma vez quando a lista passa de 70% e outra quando passa de 85%.\n\n${rodape}`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: dest, subject: assunto, text: texto };
  const idem = nivel === 100 ? `indice-os-100-${agora().slice(0, 10)}` : `indice-os-${nivel}`;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}`, 'Idempotency-Key': idem }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_indice_os_' + r.status);
  const em = agora();
  for (const n of NIVEIS_AVISO_INDICE) if (n <= nivel) await env.PORTAL_KV.put(marcaAvisoIndice(n), em);
  return { enviado: true, nivel, pct: pct1, para: dest.length };
}
async function proximoNumero(env) {
  const ano = anoAtual();
  let seq = 1;
  if (env.PORTAL_KV) {
    const raw = await env.PORTAL_KV.get('os:seq');
    const obj = raw ? JSON.parse(raw) : {};
    seq = (obj[ano] || 0) + 1; obj[ano] = seq;
    await env.PORTAL_KV.put('os:seq', JSON.stringify(obj));
  }
  return `OS-${ano}-${String(seq).padStart(4, '0')}`;
}
// Lista de equipamentos item a item, a partir de texto colado (um por linha:
// "Nome ; quantidade"). Alimenta a tabela da Carta, do Manifesto e do CDF.
export function parseItensColeta(texto) {
  return String(texto || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 80).map((l) => {
    const p = l.split(/\s*[;|\t]\s*/);
    const it = { nome: String(p[0] || '').slice(0, 140), qtd: String(p[1] || '1').replace(/[^0-9.,]/g, '').slice(0, 12) || '1' };
    const v = numValor(p[2]); if (v > 0) it.valor = v; // 3º campo opcional = valor cobrado do item
    return it;
  }).filter((it) => it.nome);
}

// TRANSPORTADORA terceirizada (pedido da Débora, 28/09): quando a coleta não é
// feita por motorista da Ecobraz, a OS guarda quem transporta. Ela NÃO entra no
// app dos motoristas (não tem agenteEmail) e o Manifesto passa a apontar a
// transportadora como Transportador (não a Ecobraz).
function limparTransportadora(t) {
  if (!t || !String(t.nome || '').trim()) return null;
  return {
    nome: String(t.nome).trim().slice(0, 120),
    cnpj: String(t.cnpj || '').trim().slice(0, 20),
    placa: String(t.placa || '').trim().toUpperCase().slice(0, 12),
    motorista: String(t.motorista || '').trim().slice(0, 100),
    fone: String(t.fone || '').trim().slice(0, 30),
  };
}

// `origem` (opcional) = { lead, comoSugerido }: o pedido (lead) de onde a coleta nasceu, JÁ
// CONFERIDO pela rota — nunca vem do corpo da requisição. Grava o vínculo EXATO lead → OS e, se o
// pedido for lote grande, o prazo-alvo (hora do pedido + 72h). `comoSugerido` = a opção de "Como
// nos achou?" que o canal do pedido indicava (só para conferir depois se a sugestão foi mantida).
// "Como nos achou?" (dados.comoNosAchou / comoNosAchouOutro) já vem conferido pela rota.
export async function criarColetaOS(env, dados, criadoPor, origem) {
  const d = dados || {};
  const numero = await proximoNumero(env);
  const id = 'coleta_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14));
  const rec = {
    id, numero, status: 'agendada',
    clienteId: d.clienteId || '', clienteNome: d.clienteNome || '', clienteDoc: d.clienteDoc || '',
    patrocinadorId: String(d.patrocinadorId || '').slice(0, 40), patrocinadorNome: String(d.patrocinadorNome || '').slice(0, 120),
    endereco: String(d.endereco || '').slice(0, 400),
    dataAgendada: String(d.dataAgendada || '').slice(0, 10), janela: String(d.janela || '').slice(0, 40),
    agenteEmail: String(d.agenteEmail || '').trim().toLowerCase(), agenteNome: d.agenteNome || '',
    veiculoPlaca: String(d.veiculoPlaca || '').slice(0, 12),
    transportadora: limparTransportadora(d.transportadora),
    material: String(d.material || '').slice(0, 500), quantidade: String(d.quantidade || '').slice(0, 100),
    itens: Array.isArray(d.itens) ? d.itens.slice(0, 80).map((it) => { const o = { nome: String(it.nome || '').slice(0, 140), qtd: String(it.qtd || '1').slice(0, 12) }; const v = numValor(it.valor); if (v > 0) o.valor = v; return o; }).filter((it) => it.nome) : parseItensColeta(d.itensTexto),
    acondicionamento: String(d.acondicionamento || '').slice(0, 120), obs: String(d.obs || '').slice(0, 4000),
    obsInterna: String(d.obsInterna || '').slice(0, 4000), // só equipe — NUNCA vai para o cliente nem para o documento da OS
    contato: String(d.contato || '').slice(0, 200),
    certificados: normalizarCertificados(d.certificados),
    criadoEm: agora(), criadoPor: criadoPor || '',
  };
  // Transportadora e motorista próprio são excludentes: com transportadora, a OS
  // não pertence à rota de nenhum motorista (e não aparece no app de ninguém).
  if (rec.transportadora) { rec.agenteEmail = ''; rec.agenteNome = ''; }
  const como = lerComo(d.comoNosAchou, d.comoNosAchouOutro);
  if (como) { rec.comoNosAchou = como.codigo; if (como.outro) rec.comoNosAchouOutro = como.outro; }
  const sug = String((origem && origem.comoSugerido) || '');
  if (comoValido(sug) && sug !== 'outro') rec.comoNosAchouSugerido = sug;
  const lo = origem && origem.lead;
  if (lo && lo.id) {
    rec.leadId = String(lo.id).slice(0, 60);
    const lc = isoValido(lo.criadoEm); if (lc) rec.leadCriadoEm = lc;
    if (lo.loteGrande) {
      rec.loteGrande = true;
      const pa = isoValido(lo.prazoAlvoEm); if (pa) rec.prazoAlvoEm = pa;
      rec.prazoHoras = Number(lo.prazoHoras) || 72;
    }
  }
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env);
    const resumo = { id, numero, status: 'agendada', clienteId: rec.clienteId || '', clienteDoc: rec.clienteDoc || '', clienteNome: rec.clienteNome, cidade: cidadeDoEndereco(rec.endereco), dataAgendada: rec.dataAgendada, agenteNome: rec.agenteNome, agenteEmail: rec.agenteEmail, criadoEm: rec.criadoEm, mat: materialIndiceOS(rec) };
    if (rec.transportadora) resumo.transp = rec.transportadora.nome;
    { const placa = placaDaOS(rec); if (placa) resumo.placa = placa; }
    if (rec.leadId) resumo.leadId = rec.leadId;
    if (rec.prazoAlvoEm) resumo.prazoAlvoEm = rec.prazoAlvoEm;
    if (rec.comoNosAchou) resumo.como = rec.comoNosAchou;
    idx.unshift(resumo);
    await salvarIndiceOS(env, idx);
  }
  return rec;
}
// Destinatário dos avisos da coleta ("a caminho"/"chegou"): o CONTATO DA ORDEM DE
// SERVIÇO vem primeiro — é quem está no local esperando o caminhão; o cadastro da
// empresa entra só como reserva, porque o 1º contato de lá muitas vezes nem trabalha
// mais no lugar (pedido da Débora, 07/10, caso OS-2026-0229 Votorantim).
// os.contato é texto livre ("Alyne Rakoer · 11 98868-7256"): extraímos nome/fone/e-mail.
export function alvoAvisoColeta(os, cli) {
  const txt = String((os && os.contato) || '');
  const telBruto = ((txt.match(/\+?\d[\d() .\-\/]{7,}\d/) || [''])[0]).replace(/\D/g, '');
  const telOs = (telBruto.length >= 10 && telBruto.length <= 13) ? telBruto : '';
  const emailOs = (((txt.match(/[^\s·;,|]+@[^\s·;,|]+\.[^\s·;,|]+/) || [''])[0]) || '').toLowerCase();
  let nomeOs = txt.split(/[·|,;]/)[0].replace(/[^\p{L} .'’-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (nomeOs.length < 2) nomeOs = '';
  const emailCad = (cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email))) || '';
  const foneCad = (cli && (cli.fone || cli.telefone || cli.celular || (Array.isArray(cli.contatos) && cli.contatos[0] && (cli.contatos[0].fone || cli.contatos[0].telefone)))) || (os && (os.clienteFone || os.telefone)) || '';
  const usouOs = !!(telOs || emailOs);
  return {
    telefone: telOs || String(foneCad || ''),
    email: emailOs || String(emailCad || ''),
    nome: (usouOs && nomeOs) ? nomeOs : ((os && os.clienteNome) || nomeOs || ''),
    origem: usouOs ? 'contato-da-os' : 'cadastro',
    // "quem" aparece na tela da OS para a equipe CONFERIR o destinatário do aviso.
    quem: usouOs ? [nomeOs || 'contato da OS', telOs ? '…' + telOs.slice(-4) : ''].filter(Boolean).join(' ') : '',
  };
}

// `extra` (opcional): { em } = quando a coleta foi de fato concluída (ex.: hora em que o
// motorista encerrou no app) e { motivo } do cancelamento. A data é gravada só na
// TRANSIÇÃO: receber na doca uma OS que já estava concluída não muda a data.
export async function atualizarStatusOS(env, id, status, extra) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  const x = extra || {};
  if (status === 'concluida' && rec.status !== 'concluida') rec.concluidaEm = isoValido(x.em) || agora();
  if (status === 'cancelada' && rec.status !== 'cancelada') {
    rec.canceladaEm = agora();
    let motivo = String(x.motivo || '').trim();
    if (motivo.length > 300) motivo = motivo.slice(0, 300).replace(/\s+\S*$/, ''); // corta entre palavras
    if (motivo) rec.motivoCancelamento = motivo; else delete rec.motivoCancelamento;
  }
  rec.status = status; rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === id);
    if (i >= 0) {
      idx[i].status = status; if (!idx[i].clienteDoc && rec.clienteDoc) idx[i].clienteDoc = rec.clienteDoc;
      if (rec.concluidaEm) idx[i].concluidaEm = rec.concluidaEm;
      if (rec.canceladaEm) idx[i].canceladaEm = rec.canceladaEm;
    } else { // sumiu do índice (ou está guardada à parte)? re-entra, em vez de ficar invisível para as listas; a cópia guardada acompanha
      const guardada = await atualizarArquivadaOS(env, rec);
      idx.unshift(guardada ? { ...guardada } : resumoIndiceOS(rec));
    }
    await salvarIndiceOS(env, idx);
  }
  return rec;
}

// Completa as entradas ANTIGAS do índice (de antes de 18/11) com os campos novos:
// materiais (mat), placa e a hora real da conclusão (encerramento no app do motorista,
// que fica guardado 120 dias; sem esse registro marca conclSemReg e a leitura estima).
// Roda no agendamento diário, em lotes. Relê o índice logo antes de gravar para não
// atropelar OS criadas ou alteradas enquanto as leituras aconteciam.
export async function completarIndiceOS(env, limite) {
  const max = Math.max(1, Number(limite) || 450);
  if (!env.PORTAL_KV) return { lidas: 0, completadas: 0 };
  const idx = await lerIndiceOS(env);
  const semMat = idx.filter((x) => x && x.id && x.mat === undefined).slice(0, max).map((x) => x.id);
  const semConcl = idx.filter((x) => x && x.id && x.status === 'concluida' && !x.concluidaEm && !x.conclSemReg).slice(0, Math.max(0, max - semMat.length)).map((x) => x.id);
  if (!semMat.length && !semConcl.length) return { lidas: 0, completadas: 0 };
  const regs = await lerChavesKV(env.PORTAL_KV, semMat.map((id) => `os:${id}`));
  const ests = await lerChavesKV(env.PORTAL_KV, semConcl.map((id) => `coleta:${id}`));
  const mats = new Map();
  for (const id of semMat) {
    let rec = null; try { const raw = regs.get(`os:${id}`); rec = raw ? JSON.parse(raw) : null; } catch { rec = null; }
    mats.set(id, rec ? { mat: materialIndiceOS(rec), placa: placaDaOS(rec) } : { mat: '', placa: '' });
  }
  const concl = new Map();
  for (const id of semConcl) {
    let em = ''; try { const raw = ests.get(`coleta:${id}`); const e = raw ? JSON.parse(raw) : null; em = isoValido(e && e.encerramento && e.encerramento.em); } catch { em = ''; }
    concl.set(id, em);
  }
  const fresco = await lerIndiceOS(env);
  let completadas = 0;
  for (const x of fresco) {
    if (!x || !x.id) continue;
    const m = mats.get(x.id);
    if (m && x.mat === undefined) { x.mat = m.mat; if (m.placa && !x.placa) x.placa = m.placa; completadas++; }
    if (concl.has(x.id) && x.status === 'concluida' && !x.concluidaEm && !x.conclSemReg) { const em = concl.get(x.id); if (em) x.concluidaEm = em; else x.conclSemReg = 1; completadas++; }
  }
  if (completadas) await salvarIndiceOS(env, fresco);
  return { lidas: semMat.length + semConcl.length, completadas };
}

// Reagendamento pedido pelo MOTORISTA (pedido da equipe 18/08: "preciso que
// fique à mostra"): a OS volta para AGENDADA (precisa de nova data), guarda o
// motivo à vista e a listagem ganha o selo ↩︎ REAGENDAR. O selo some quando o
// motorista sai para a nova tentativa ("estou indo") ou encerra a coleta.
export async function marcarReagendarOS(env, id, info) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  rec.reagendar = {
    em: (info && info.em) || agora(),
    motivo: String((info && info.motivo) || '').slice(0, 300),
    agente: String((info && info.agente) || '').slice(0, 120),
    agenteNome: String((info && info.agenteNome) || '').slice(0, 120),
    foto: !!(info && info.foto),
  };
  rec.status = 'agendada'; rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === id);
    if (i >= 0) { idx[i].status = 'agendada'; idx[i].reagendar = 1; await salvarIndiceOS(env, idx); }
    else await atualizarArquivadaOS(env, rec); // guardada à parte: a cópia guardada acompanha
  }
  return rec;
}
export async function limparReagendarOS(env, id) {
  const rec = await lerColetaOS(env, id); if (!rec || !rec.reagendar) return rec;
  delete rec.reagendar; rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === id);
    if (i >= 0 && idx[i].reagendar) { delete idx[i].reagendar; await salvarIndiceOS(env, idx); }
    else if (i < 0) await atualizarArquivadaOS(env, rec);
  }
  return rec;
}
// Anexa um registro de TELEMETRIA (posição do rastreador no momento de um evento)
// à coleta — vira prova de rastreabilidade incontestável no dossiê. Best-effort.
export async function anexarTelemetriaOS(env, id, registro) {
  if (!registro) return null;
  const rec = await lerColetaOS(env, id);
  if (!rec) return null;
  rec.telemetria = Array.isArray(rec.telemetria) ? rec.telemetria : [];
  rec.telemetria.push(registro);
  if (rec.telemetria.length > 60) rec.telemetria = rec.telemetria.slice(-60);
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`os:${rec.id}`, JSON.stringify(rec));
  return rec;
}

// COBRANÇA NA OS (OS paga — Marcio/Debora, 2026-07-29): a equipe define o
// valor, o link do Mercado Pago (Pix/cartão/boleto) fica ANEXADO à OS e o
// cliente paga pelo portal. REGRA: a cobrança nunca trava a operação — é um
// status visível; o webhook marca "pago" sozinho.
export async function definirCobrancaOS(env, id, cobranca) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  if (cobranca) {
    rec.cobranca = { valor: Number(cobranca.valor) || 0, descricao: String(cobranca.descricao || '').slice(0, 200), ref: String(cobranca.ref || ''), link: String(cobranca.link || ''), status: 'aguardando', criadoEm: agora(), criadoPor: String(cobranca.criadoPor || '') };
    // Prazo do boleto escolhido pela equipe para ESTA cobrança (1–60 dias; vazio = padrão).
    const dd = Math.floor(Number(cobranca.boletoDias)); if (dd >= 1) rec.cobranca.boletoDias = Math.min(60, dd);
  } else { delete rec.cobranca; }
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${rec.id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === rec.id);
    if (i >= 0) {
      if (rec.cobranca) idx[i].cobranca = { valor: rec.cobranca.valor, status: rec.cobranca.status, link: rec.cobranca.link };
      else delete idx[i].cobranca;
      await salvarIndiceOS(env, idx);
    }
    else await atualizarArquivadaOS(env, rec);
  }
  return rec;
}
// BOLETO EMITIDO (caso AG Automação, 28/10): quando o cliente clica em "Boleto" no
// link de pagamento, a Stripe emite o boleto e avisa pelo webhook — aqui ele fica
// ANEXADO à cobrança da OS, para a equipe VER o boleto (link + vencimento) sem depender
// de print do cliente. Se o cliente gerar outro boleto pelo mesmo link, o novo
// substitui o anterior aqui; boleto não pago não precisa ser cancelado — expira sozinho.
export async function anexarBoletoCobrancaOS(env, id, boleto) {
  const rec = await lerColetaOS(env, id); if (!rec || !rec.cobranca) return null;
  if (rec.cobranca.status === 'pago') return rec;
  rec.cobranca.boleto = { url: String((boleto && boleto.url) || '').slice(0, 500), vence: String((boleto && boleto.vence) || ''), em: agora() };
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`os:${rec.id}`, JSON.stringify(rec));
  return rec;
}
export async function marcarCobrancaPagaOS(env, id, pagamento) {
  const rec = await lerColetaOS(env, id); if (!rec || !rec.cobranca) return null;
  rec.cobranca.status = 'pago'; rec.cobranca.paymentId = String((pagamento && pagamento.id) || ''); rec.cobranca.pagoEm = agora();
  // Liberar a OS como paga (pedido do Marcio, 2026-07-31): marca LIBERADA e, se ela
  // estava "agendada" E já tem motorista, coloca "em transporte" (libera para o app
  // do motorista). SEM motorista, mantém "agendada" de propósito — senão a coleta
  // sumiria do app de todos os motoristas; o aviso à equipe pede para escolher.
  rec.liberada = true; rec.liberadaEm = agora(); rec.liberadaPor = 'pagamento';
  let liberouEmTransporte = false;
  if (rec.status === 'agendada' && rec.agenteEmail) { rec.status = 'em_transporte'; liberouEmTransporte = true; }
  rec.cobranca.liberouEmTransporte = liberouEmTransporte;
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${rec.id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === rec.id);
    if (i >= 0) { if (idx[i].cobranca) idx[i].cobranca.status = 'pago'; idx[i].status = rec.status; await salvarIndiceOS(env, idx); }
    else await atualizarArquivadaOS(env, rec);
  }
  return rec;
}

// MTR vinculada à OS (SIGOR/SINIR). Guarda os dados oficiais puxados do órgão +
// referência do PDF no R2 (quando baixado). Não trava nada — é evidência.
export async function definirMtrOS(env, id, mtr) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  rec.mtr = mtr || null;
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${rec.id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === rec.id);
    if (i >= 0) { if (mtr && mtr.numero) idx[i].mtr = mtr.numero; else delete idx[i].mtr; await salvarIndiceOS(env, idx); }
    else await atualizarArquivadaOS(env, rec);
  }
  return rec;
}

// Persiste um registro de OS já existente sem mexer no status (ex.: anexar as
// notas fiscais vinculadas em os.notas). O índice não guarda notas, então basta
// regravar o registro completo.
export async function salvarColetaOSDireto(env, os) {
  if (!env.PORTAL_KV || !os || !os.id) return null;
  os.atualizadoEm = agora();
  await env.PORTAL_KV.put(`os:${os.id}`, JSON.stringify(os));
  return os;
}
// Edita os campos de uma coleta existente (mantém número, status e histórico).
export async function atualizarColetaOS(env, id, dados) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  const d = dados || {};
  const setStr = (campo, max) => { if (d[campo] != null) rec[campo] = String(d[campo]).slice(0, max); };
  setStr('endereco', 400); setStr('dataAgendada', 10); setStr('janela', 40); setStr('contato', 200);
  setStr('material', 500); setStr('quantidade', 100); setStr('acondicionamento', 120); setStr('obs', 4000); setStr('obsInterna', 4000); setStr('veiculoPlaca', 12);
  if (d.itensTexto != null) rec.itens = parseItensColeta(d.itensTexto);
  if (d.certificados != null) rec.certificados = normalizarCertificados(d.certificados);
  if (d.agenteEmail != null) { rec.agenteEmail = String(d.agenteEmail || '').trim().toLowerCase(); rec.agenteNome = d.agenteNome || ''; }
  // Transportadora: presente no payload → define/troca (e tira o motorista); null → volta a motorista próprio.
  if (d.transportadora !== undefined) {
    rec.transportadora = limparTransportadora(d.transportadora);
    if (rec.transportadora) { rec.agenteEmail = ''; rec.agenteNome = ''; }
    else delete rec.transportadora;
  }
  // "Como nos achou?": correção pela equipe (a rota já recusou valor inválido). Sem o campo no
  // pedido de edição, fica como está — OS antiga continua "não informado" até alguém escolher.
  const como = d.comoNosAchou != null && String(d.comoNosAchou).trim() ? lerComo(d.comoNosAchou, d.comoNosAchouOutro) : null;
  if (como) { rec.comoNosAchou = como.codigo; if (como.outro) rec.comoNosAchouOutro = como.outro; else delete rec.comoNosAchouOutro; }
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await lerIndiceOS(env); const i = idx.findIndex((x) => x.id === id);
    if (i >= 0) { if (rec.comoNosAchou) idx[i].como = rec.comoNosAchou; idx[i].cidade = cidadeDoEndereco(rec.endereco); idx[i].dataAgendada = rec.dataAgendada; idx[i].agenteNome = rec.agenteNome; idx[i].agenteEmail = rec.agenteEmail; if (rec.transportadora) idx[i].transp = rec.transportadora.nome; else delete idx[i].transp; if (!idx[i].clienteDoc && rec.clienteDoc) idx[i].clienteDoc = rec.clienteDoc; idx[i].mat = materialIndiceOS(rec); const placa = placaDaOS(rec); if (placa) idx[i].placa = placa; else delete idx[i].placa; await salvarIndiceOS(env, idx); }
    else await atualizarArquivadaOS(env, rec);
  }
  return rec;
}
function cidadeDoEndereco(e) { const m = String(e || '').match(/·\s*([^·]+?)\/[A-Z]{2}/); return m ? m[1].trim() : ''; }

// Anexos da coleta (fotos/arquivos enviados pela equipe) — guardados no R2 e
// referenciados em os.anexos. O upload em si (R2.put) é feito na rota.
export async function registrarAnexoColeta(env, id, meta) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  if (!Array.isArray(rec.anexos)) rec.anexos = [];
  rec.anexos.push({ key: meta.key, nome: String(meta.nome || 'arquivo').slice(0, 140), tipo: normalizarTipoAnexo(meta.tipo), content_type: String(meta.content_type || '').slice(0, 100), tamanho: Number(meta.tamanho || 0), quando: agora() });
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
  return rec;
}
export async function removerAnexoColeta(env, id, key) {
  const rec = await lerColetaOS(env, id); if (!rec || !Array.isArray(rec.anexos)) return null;
  rec.anexos = rec.anexos.filter((a) => a.key !== key);
  rec.atualizadoEm = agora();
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
  return rec;
}

// --- Páginas (escritório) ---
function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
textarea{resize:vertical}.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:22px 0 4px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
@media(max-width:640px){.g2{grid-template-columns:1fr}}</style></head>`;
}
function topo(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'coletas')}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}
// Rótulo de EXIBIÇÃO do status: OS "agendada" SEM data ainda está na fila do roteiro —
// mostrar "Agendada" fazia parecer que já tinha dia marcado e o cliente cobrava a
// equipe dentro do prazo (pedido da Débora, 29/10). Com data marcada, segue "Agendada".
const rotuloStatus = (status, dataAgendada) => (status === 'agendada' && !dataAgendada) ? 'Aguardando roteiro' : (STATUS[status] || status);
const pill = (status, dataAgendada) => `<span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;color:${STATUS_COR[status] || '#7c8a87;background:#EEF1F0'}">${esc(rotuloStatus(status, dataAgendada).toUpperCase())}</span>`;

// `extra.arquivoIndisponivel`: as OS guardadas à parte (as fechadas mais antigas) não puderam ser
// lidas agora; `extra.linhasIlegiveis`: algumas delas estão ilegíveis no banco. A página avisa, para
// ninguém recriar uma OS antiga que a busca não achou.
export function paginaColetasLista(user, coletas, q, cliCtx, negocios, aba, extra) {
  q = q || '';
  const filtroCli = cliCtx && cliCtx.nome ? cliCtx : null;
  const negs = (filtroCli && Array.isArray(negocios)) ? negocios : [];
  const histBlock = negs.length ? `<div style="margin-top:20px"><div style="font-size:12px;font-weight:800;color:#7c8a87;text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">Histórico anterior — migrado do Ploomes · ${negs.length}</div>${negs.map((n) => { const docs = n.arquivos || []; return `<a href="/cadastro/os-ploomes?id=${esc(String(n.id))}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;text-decoration:none;border:1px solid #E4EBE9;border-radius:12px;padding:12px 15px;margin-bottom:8px;background:#FBFDFC"><span style="min-width:0"><span style="font-size:13px;font-weight:700;color:#10262B">${esc(n.titulo)}</span><span style="display:block;font-size:11.5px;color:#8fa39f">${esc(dataBR(n.data))}${docs.length ? ` · ${docs.length} documento(s)` : ''}</span></span><span style="flex:none;text-align:right"><span style="display:block;font-size:10px;font-weight:800;color:${n.cor || '#8A6A16'}">${esc(String(n.status || '').toUpperCase())}</span><span style="font-size:10.5px;color:#0B5B66;font-weight:700">abrir OS ↗</span></span></a>`; }).join('')}</div>` : '';
  // Abas por status (pedido do Marcio): separa Agendadas / Em transporte / Concluídas /
  // Canceladas para não misturar tudo quando o volume crescer. Aparecem na lista geral
  // (com ou sem busca); na ficha do cliente mostramos tudo junto. A busca respeita a aba.
  const grupoDe = (c) => {
    if (c.status === 'concluida') return 'concluida';
    if (c.status === 'cancelada') return 'cancelada';
    if (c.status === 'em_transporte' || c.status === 'na_unidade') return 'em_transporte';
    return 'agendada';
  };
  const comAbas = !filtroCli;
  const nAg = coletas.filter((c) => grupoDe(c) === 'agendada').length;
  const nEt = coletas.filter((c) => grupoDe(c) === 'em_transporte').length;
  const nCo = coletas.filter((c) => grupoDe(c) === 'concluida').length;
  const nCa = coletas.filter((c) => grupoDe(c) === 'cancelada').length;
  const abaAtiva = ['agendada', 'em_transporte', 'concluida', 'cancelada'].includes(aba) ? aba : 'agendada';
  const abertas = nAg + nEt;
  const lista = comAbas ? coletas.filter((c) => grupoDe(c) === abaAtiva) : coletas;
  const qs = q ? '&q=' + encodeURIComponent(q) : '';
  const tabBtn = (id, rotulo, n) => `<a href="/coletas?aba=${id}${qs}" style="flex:1 1 auto;white-space:nowrap;text-align:center;text-decoration:none;font-size:12.5px;font-weight:800;padding:9px 10px;border-radius:10px;border:1px solid ${id === abaAtiva ? '#0B5B66' : '#E4EBE9'};background:${id === abaAtiva ? '#0B5B66' : '#fff'};color:${id === abaAtiva ? '#fff' : '#4F6469'}">${rotulo}<span style="display:inline-block;margin-left:5px;font-size:11px;padding:1px 7px;border-radius:20px;background:${id === abaAtiva ? 'rgba(255,255,255,.22)' : '#EEF1F0'};color:${id === abaAtiva ? '#fff' : '#7c8a87'}">${n}</span></a>`;
  const abasHTML = comAbas ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${tabBtn('agendada', 'Agendadas', nAg)}${tabBtn('em_transporte', 'Em transporte', nEt)}${tabBtn('concluida', 'Concluídas', nCo)}${tabBtn('cancelada', 'Canceladas', nCa)}</div>` : '';
  const rotuloAba = abaAtiva === 'concluida' ? 'concluída' : abaAtiva === 'cancelada' ? 'cancelada' : abaAtiva === 'em_transporte' ? 'em transporte' : 'agendada';
  const vazioMsg = comAbas ? (q ? `Nenhuma coleta ${rotuloAba} encontrada para “${esc(q)}”.` : `Nenhuma coleta ${rotuloAba} no momento.`) : (q ? 'Nenhuma coleta encontrada para essa busca.' : 'Nenhuma coleta ainda.<br>Abra uma coleta a partir de um cliente no Cadastro.');
  const linhas = lista.length ? lista.map((c) => `<a href="/coletas/os?id=${esc(c.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#10262B">${esc(c.numero)} <span style="font-weight:600;color:#7c8a87">· ${esc(c.clienteNome || '')}</span></div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${c.dataAgendada ? '📅 ' + esc(dataBR(c.dataAgendada)) : 'sem data'}${c.agenteNome ? ' · 🚚 ' + esc(c.agenteNome) : ''}${c.transp ? ' · 🚛 ' + esc(c.transp) : ''}${c.cidade ? ' · ' + esc(c.cidade) : ''}</div></div>
      <span style="flex:none;display:flex;align-items:center;gap:6px">${c.prazoAlvoEm && c.status !== 'concluida' && c.status !== 'cancelada' ? `<span style="font-size:10px;font-weight:800;color:#8A4B00;background:#FFE9C7;border-radius:20px;padding:3px 9px">🏭 até ${esc(textoBR(c.prazoAlvoEm).slice(0, 13))}h</span>` : ''}${c.reagendar ? '<span style="font-size:10px;font-weight:800;color:#8A6A16;background:#FFF4DE;border-radius:20px;padding:3px 9px">↩︎ REAGENDAR</span>' : ''}${pill(c.status, c.dataAgendada)}</span>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">${vazioMsg}</div>`;
  return `${head('Coletas')}<body>${topo('coletas')}
<div class="wrap">
  ${filtroCli ? '' : abasEquipe('coletas')}
  <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 12px"><h1 style="font-size:20px;margin:0">${filtroCli ? 'Coletas do cliente' : 'Ordens de Coleta'}</h1>${comAbas ? '' : `<span style="font-size:11px;background:#FFF4DE;color:#8A6A16;font-weight:800;padding:3px 9px;border-radius:20px">${abertas} em aberto</span>`}</div>
  ${filtroCli ? `<div style="background:#EAF2E6;border:1px solid #cfe6b8;border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;color:#28413f;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><span>Mostrando as coletas de <b>${esc(filtroCli.nome)}</b></span><a href="/coletas" style="color:#0B5B66;font-weight:800;text-decoration:none;white-space:nowrap">ver todas as coletas →</a></div>
  <a href="/coletas/nova?cliente=${esc(filtroCli.id)}" class="btn btn-p" style="margin-bottom:14px">＋ Nova coleta para este cliente</a>` : `<form method="get" action="/coletas" style="margin:0 0 12px"><input type="hidden" name="aba" value="${esc(abaAtiva)}"><input name="q" value="${esc(q)}" placeholder="🔎 Buscar por número (ex.: OS-2026-0001) ou cliente… e aperte Enter" autocomplete="off" style="width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit"></form>
  <a href="/cadastro" class="btn btn-g" style="margin-bottom:14px">Abrir coleta a partir de um cliente →</a>`}
  ${extra && extra.arquivoIndisponivel ? '<div style="background:#FFF4DE;border:1px solid #f0dca8;border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;color:#6b5312;line-height:1.5">⚠️ As OS mais antigas (guardadas à parte) não puderam ser lidas agora: esta lista e a busca podem estar <b>sem elas</b>. Antes de criar uma OS que você não achou, recarregue a página em alguns minutos.</div>' : ''}
  ${extra && !extra.arquivoIndisponivel && extra.linhasIlegiveis ? `<div style="background:#FFF4DE;border:1px solid #f0dca8;border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:12.5px;color:#6b5312;line-height:1.5">⚠️ ${Number(extra.linhasIlegiveis)} OS antiga(s) guardada(s) à parte está(ão) ilegível(is) no banco e não aparece(m) nesta lista nem na busca. Avise quem cuida do sistema; antes de criar uma OS que você não achou, confira pelo número.</div>` : ''}
  ${abasHTML}
  <div>${linhas}</div>
  ${histBlock}
</div></body></html>`;
}

// `pedidosCtx` (opcional) = { pedidos, leadSel }: pedidos (leads) em aberto deste cliente
// e o já escolhido — a coleta nasce ligada ao pedido certo (vínculo exato lead → OS).
// Bloco "Como nos achou?" (criação e edição da OS): uma fileira de botões — um clique escolhe.
// `sel` = código já escolhido (edição) ou ''; o script da página põe a sugestão do pedido.
function blocoComoNosAchou(sel, outro, { obrigatorio, primeiro, semTitulo } = {}) {
  const s = comoValido(sel) ? sel : '';
  return `<style>.como{display:inline-block;width:auto;border:1.5px solid #cfe0dd;background:#fff;color:#00333B;border-radius:999px;padding:8px 13px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin:0;line-height:1.2}.como.on{background:#00333B;color:#fff;border-color:#00333B}</style>
    ${semTitulo ? '' : `<div class="sec"${primeiro ? ' style="margin-top:0"' : ''}>Como nos achou?${obrigatorio ? ' <span style="color:#B23A2E">*</span>' : ''}</div>`}
    <div id="comoBox" style="display:flex;flex-wrap:wrap;gap:7px;margin-top:6px">${COMO_OPCOES.map(([c, r]) => `<button type="button" class="como${c === s ? ' on' : ''}" data-v="${esc(c)}" onclick="escolherComo('${esc(c)}',true)">${esc(r)}</button>`).join('')}</div>
    <input id="comoOutro" maxlength="${COMO_OUTRO_MAX}" value="${esc(s === 'outro' ? (outro || '') : '')}" placeholder="Qual? (ex.: feira, panfleto, placa na rua — sem telefone nem e-mail)" style="margin-top:8px;${s === 'outro' ? '' : 'display:none'}">
    <div id="comoDica" style="font-size:11px;color:#9aa7a4;margin:6px 0 2px"></div>`;
}
// `comoAviso(txt)` = aviso em vermelho LOGO ABAIXO das opções (o aviso do botão fica longe, no
// fim da página — no celular a Debora não o veria).
const scriptComoNosAchou = (sel) => `var comoSel=${JSON.stringify(comoValido(sel) ? sel : '')},comoManual=false;
function comoAviso(t){var d=document.getElementById('comoDica');d.textContent=t||'';d.style.color=t?'#B23A2E':'#9aa7a4';d.style.fontWeight=t?'700':'400';}
function escolherComo(v,manual){comoSel=v;if(manual)comoManual=true;[].forEach.call(document.querySelectorAll('.como'),function(b){b.className='como'+(b.getAttribute('data-v')===v?' on':'');});var o=document.getElementById('comoOutro');o.style.display=v==='outro'?'block':'none';if(v==='outro'&&manual)o.focus();if(manual)comoAviso('');}`;

export function paginaGerarColeta(user, cliente, agentes, patrocinadores, veiculos, pedidosCtx) {
  const pc = pedidosCtx || {};
  const pedidos = Array.isArray(pc.pedidos) ? pc.pedidos : [];
  const leadSel = String(pc.leadSel || '');
  // Sugestão de "Como nos achou?" de cada pedido (calculada pela rota a partir do canal do pedido).
  const sugestoes = {};
  for (const p of pedidos) if (p && p.id && comoValido(p.comoSugerido) && p.comoSugerido !== 'outro') sugestoes[String(p.id).replace(/[^a-zA-Z0-9_]/g, '')] = { codigo: p.comoSugerido, rotulo: rotuloComo(p.comoSugerido) };
  const rotuloPedido = (p) => [textoBR(p.criadoEm) || '', p.nome || p.empresa || '', p.origem ? `via ${p.origem}` : '', p.loteGrande ? `🏭 LOTE GRANDE — coletar até ${textoBR(p.prazoAlvoEm)}` : (p.prioridade === 'alta' ? '🌟 prioritária' : '')].filter(Boolean).join(' · ');
  const blocoPedido = pedidos.length ? `<div class="sec" style="margin-top:0">Pedido de origem</div>
    <select id="leadId" onchange="sugerirComo()">
      <option value="">— coleta sem pedido registrado —</option>
      ${pedidos.map((p) => `<option value="${esc(p.id)}"${p.id === leadSel ? ' selected' : ''}>${esc(rotuloPedido(p))}</option>`).join('')}
    </select>
    <div style="font-size:11px;color:#9aa7a4;margin:6px 0 4px">Ligar a coleta ao pedido mede o tempo do pedido até a coleta${pedidos.some((p) => p.loteGrande) ? ' e, no lote grande, o prazo de 72h' : ''}. Se esta coleta não veio de nenhum desses pedidos, escolha “coleta sem pedido registrado”.</div>` : '';
  const fmtEnd = (x) => [[x.logradouro, x.numero].filter(Boolean).join(', '), x.complemento, x.bairro, [x.cidade, x.uf].filter(Boolean).join('/'), x.cep].filter(Boolean).join(' · ');
  const rotEnd = (x, n) => x.rotulo || x.bairro || x.cidade || ('Endereço ' + n);
  const e = cliente.endereco || {};
  const e2 = cliente.endereco2 || {};
  const endPadrao = fmtEnd(e);
  const endPadrao2 = fmtEnd(e2);
  const temEnd2 = !!(e2.logradouro || e2.cep || e2.bairro);
  const nome = cliente.tipo === 'PJ' ? (cliente.razaoSocial || cliente.nomeFantasia || '') : (cliente.nome || '');
  const contatoPadrao = cliente.tipo === 'PJ' ? ((cliente.contatos || [])[0] || {}) : { nome: cliente.nome, fone: cliente.fone, email: cliente.email };
  const contatoStr = [contatoPadrao.nome, contatoPadrao.fone].filter(Boolean).join(' · ');
  const contatosCli = (cliente.tipo === 'PJ' ? (cliente.contatos || []) : [{ nome: cliente.nome, fone: cliente.fone, email: cliente.email }]).filter((c) => c && (c.nome || c.fone || c.email));
  const optContatos = contatosCli.length ? ['<option value="">— escolher um contato do cliente —</option>'].concat(contatosCli.map((c) => `<option value="${esc([c.nome, c.fone].filter(Boolean).join(' · '))}">${esc(c.nome || '(sem nome)')}${c.cargo ? ' — ' + esc(c.cargo) : ''}</option>`)).join('') : '';
  const optAgentes = ['<option value="">— escolher motorista —</option>'].concat((agentes || []).map((a) => `<option value="${esc(a.email)}|${esc(a.nome)}">${esc(a.nome)}</option>`)).join('');
  const veics = (veiculos || []).filter((v) => v && v.placa && v.ativo !== false);
  const optVeiculos = ['<option value="">— escolher veículo —</option>'].concat(veics.map((v) => `<option value="${esc(v.placa)}">${esc(v.placa)}${v.apelido ? ' — ' + esc(v.apelido) : ''}</option>`)).join('');
  const patros = patrocinadores || [];
  const optPatro = ['<option value="">— escolher empresa —</option>'].concat(patros.map((p) => `<option value="${esc(p.clienteId)}|${esc(p.nome)}">${esc(p.nome)} — ${(Number(p.saldoKg) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t disponíveis</option>`)).join('');
  return `${head('Nova coleta')}<body>${topo('coletas')}
<div class="wrap">
  <a href="/cadastro/cliente?id=${esc(cliente.id)}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cliente</a>
  <h1 style="font-size:20px;margin:10px 0 2px">Nova coleta</h1>
  <p style="font-size:12.5px;color:#8fa39f;margin:0 0 14px">Gerando a Ordem de Coleta para <b>${esc(nome)}</b>.</p>
  <div class="card">
    ${blocoPedido}
    ${blocoComoNosAchou('', '', { obrigatorio: true, primeiro: !blocoPedido })}
    <div class="sec">Local &amp; agendamento</div>
    <label>Endereço da coleta</label>
    ${temEnd2 ? `<div style="font-size:11.5px;color:#0B5B66;font-weight:700;margin:-2px 0 6px">Este cliente tem 2 endereços — escolha o correto:</div>
    <select id="endSel" onchange="if(this.value)document.getElementById('endereco').value=this.value" style="margin-bottom:8px">
      <option value="${esc(endPadrao)}">📍 ${esc(rotEnd(e, '1'))} — ${esc(endPadrao)}</option>
      <option value="${esc(endPadrao2)}">📍 ${esc(rotEnd(e2, '2'))} — ${esc(endPadrao2)}</option>
    </select>` : ''}
    <textarea id="endereco" rows="2">${esc(endPadrao)}</textarea>
    <div class="g2"><div><label>Data</label><input id="data" type="date"></div><div><label>Janela (opcional)</label><input id="janela" placeholder="ex.: 09h–12h"></div></div>
    <label>Contato no local</label>${optContatos ? `<select id="contatoSel" onchange="if(this.value)document.getElementById('contato').value=this.value" style="margin-bottom:8px">${optContatos}</select>` : ''}<input id="contato" value="${esc(contatoStr)}">
    <div class="sec">Material &amp; motorista</div>
    <label>Material declarado</label><textarea id="material" rows="2" placeholder="ex.: CPUs, monitores, cabos e placas (REEE)"></textarea>
    <label>Equipamentos item a item <span style="color:#9aa7a4;font-weight:400">(um por linha — ex.: Monitor LCD ; 5 ; 120,00)</span></label><textarea id="itens" rows="4" placeholder="Monitor LCD ; 5 ; 120,00&#10;CPU Dell ; 12&#10;No-break ; 3"></textarea>
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 4px">Aparece item a item na Carta de Descarte e no Manifesto. Formato: <b>nome ; quantidade ; valor</b> — o <b>valor (R$) é opcional</b> e sai discriminado no documento (ex.: <i>Pilhas ; 50 ; 120,00</i>). Se deixar em branco, usa o material declarado.</div>
    <div class="g2"><div><label>Quantidade estimada</label><input id="quantidade" placeholder="ex.: ~500 kg (3 pallets)"></div>
    <div><label>Acondicionamento</label><input id="acondicionamento" placeholder="ex.: paletizado / caixas"></div></div>
    <label>Quem faz a coleta?</label>
    <select id="quemColeta" onchange="toggleTransp()">
      <option value="motorista">🚚 Motorista da Ecobraz</option>
      <option value="transportadora">🚛 Transportadora (terceirizada)</option>
    </select>
    <div id="boxMotorista" class="g2" style="margin-top:8px"><div><label>Motorista</label><select id="agente">${optAgentes}</select></div><div><label>Veículo</label><select id="veiculo">${optVeiculos}</select></div></div>
    <div id="boxTransp" style="display:none;margin-top:8px;border:1px solid #cfe0dd;border-radius:12px;padding:12px 14px;background:#FBFDFC">
      <div class="g2"><div><label>Transportadora *</label><input id="tNome" placeholder="Razão social da transportadora"></div><div><label>CNPJ (opcional)</label><input id="tCnpj" placeholder="00.000.000/0000-00"></div></div>
      <div class="g2"><div><label>Placa do veículo (opcional)</label><input id="tPlaca" placeholder="ABC-1D23"></div><div><label>Motorista da transportadora (opcional)</label><input id="tMot" placeholder="Nome de quem dirige"></div></div>
      <label>Telefone (opcional)</label><input id="tFone" placeholder="(11) 90000-0000">
      <div style="font-size:11px;color:#9aa7a4;margin-top:6px">Coleta por transportadora <b>não aparece no app dos motoristas</b>. Nos documentos (Manifesto), o <b>Transportador</b> sai com os dados dela.</div>
    </div>
    <label>Observações / instruções de acesso</label><textarea id="obs" rows="5">${esc(cliente.obsColeta || '')}</textarea>
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 4px">Pode colar texto longo (até 4.000 caracteres) — as quebras de linha são preservadas no documento da OS. Planilha/PDF do cliente: anexe na tela da OS depois de criar (aparece no documento).</div>
    <label style="color:#8a6a16">🔒 Observação interna (só a equipe vê)</label><textarea id="obsInterna" rows="3" style="border-color:#eadfb0;background:#FFFDF5"></textarea>
    <div style="font-size:11px;color:#8a6a16;margin:-4px 0 4px">Comunicação entre funcionários sobre esta OS — NÃO aparece para o cliente nem no documento da OS.</div>
    <div class="sec">Certificados solicitados pelo cliente</div>
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 8px">Marque o que o cliente precisa. Fica registrado na Ordem de Coleta e orienta a emissão dos documentos.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 16px">${CERTIFICADOS_OS.map((c) => `<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer"><input type="checkbox" class="cert" value="${esc(c)}" style="width:17px;height:17px;flex:none"> ${esc(c)}</label>`).join('')}</div>
    <div class="sec">Patrocínio · Adote um Bairro</div>
    ${patros.length ? `<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;cursor:pointer"><input type="checkbox" id="patroOn" onchange="togglePatro()" style="width:18px;height:18px"> Esta coleta é patrocinada por uma empresa</label>
    <div id="patroBox" style="display:none;margin-top:10px">
      <label>Empresa patrocinadora</label><select id="patro">${optPatro}</select>
      <div style="font-size:11.5px;color:#8fa39f;margin-top:6px">O peso pesado na doca será descontado do crédito dessa empresa. Os documentos da coleta vão informar o patrocínio e a autorização do cliente para compartilhar os dados desta coleta com o parceiro.</div>
    </div>` : `<div style="font-size:12.5px;color:#8fa39f">Nenhuma empresa com crédito de patrocínio disponível no momento.</div>`}
    <div style="display:flex;gap:10px;align-items:center;margin-top:22px">
      <button class="btn btn-p" onclick="gerar()">Gerar coleta</button>
      <span id="m" style="font-size:13px;color:#4F6469"></span>
    </div>
  </div>
</div>
<script>
function g(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function togglePatro(){var on=document.getElementById('patroOn').checked;document.getElementById('patroBox').style.display=on?'block':'none';}
function toggleTransp(){var t=g('quemColeta')==='transportadora';document.getElementById('boxMotorista').style.display=t?'none':'grid';document.getElementById('boxTransp').style.display=t?'block':'none';}
${scriptComoNosAchou('')}
var COMO_SUG=${JSON.stringify(sugestoes)};
// Pedido do site com canal claro: a opção já vem marcada (até a Debora clicar em outra).
function sugerirComo(){if(comoManual)return;var l=document.getElementById('leadId');var s=l&&COMO_SUG[l.value];escolherComo(s?s.codigo:'',false);comoAviso('');document.getElementById('comoDica').textContent=s?'Marcado pelo canal do pedido do site ('+s.rotulo+'). Se não for isso, é só clicar em outra opção.':'';}
sugerirComo();
function gerar(){var ag=g('agente').split('|');var ehTransp=g('quemColeta')==='transportadora';
  if(!comoSel){document.getElementById('m').textContent='Escolha “Como nos achou?” (no começo da página).';comoAviso('Escolha uma opção para gerar a coleta.');document.getElementById('comoBox').scrollIntoView({block:'center'});return;}
  if(comoSel==='outro'&&!/[A-Za-z0-9À-ÿ]/.test(g('comoOutro'))){document.getElementById('m').textContent='Em “Outro”, escreva em poucas palavras como o cliente nos achou.';comoAviso('Em “Outro”, escreva em poucas palavras como o cliente nos achou.');document.getElementById('comoOutro').focus();return;}
  if(ehTransp&&!g('tNome')){document.getElementById('m').textContent='Informe o nome da transportadora.';return;}
  var certs=[].slice.call(document.querySelectorAll('.cert:checked')).map(function(c){return c.value;});
  var rec={clienteId:'${esc(cliente.id)}',clienteNome:${JSON.stringify(nome)},clienteDoc:${JSON.stringify(cliente.tipo === 'PJ' ? (cliente.cnpj || '') : (cliente.cpf || ''))},
    endereco:g('endereco'),dataAgendada:g('data'),janela:g('janela'),contato:g('contato'),
    material:g('material'),quantidade:g('quantidade'),acondicionamento:g('acondicionamento'),obs:g('obs'),obsInterna:g('obsInterna'),
    itensTexto:g('itens'),veiculoPlaca:ehTransp?'':g('veiculo'),certificados:certs,
    agenteEmail:ehTransp?'':(ag[0]||''),agenteNome:ehTransp?'':(ag[1]||''),
    transportadora:ehTransp?{nome:g('tNome'),cnpj:g('tCnpj'),placa:g('tPlaca'),motorista:g('tMot'),fone:g('tFone')}:null,
    leadId:g('leadId'),comoNosAchou:comoSel,comoNosAchouOutro:comoSel==='outro'?g('comoOutro'):''};
  var pOn=document.getElementById('patroOn');
  if(pOn&&pOn.checked){var pp=g('patro').split('|');if(!pp[0]){document.getElementById('m').textContent='Escolha a empresa patrocinadora ou desmarque o patrocínio.';return;}rec.patrocinadorId=pp[0];rec.patrocinadorNome=pp[1]||'';}
  if(!rec.endereco){document.getElementById('m').textContent='Informe o endereço da coleta.';return;}
  if(window.__gerando)return;window.__gerando=true; // clique duplo não gera 2 coletas
  document.getElementById('m').textContent='Gerando…';
  fetch('/api/coletas/criar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/coletas/os?id='+j.id;}else{window.__gerando=false;document.getElementById('m').textContent=j.error||'Erro ao gerar.';}}).catch(()=>{window.__gerando=false;document.getElementById('m').textContent='Sem conexão.';});}
</script></body></html>`;
}

// Bloco reutilizável: o que o MOTORISTA registrou na coleta (foto da carga, GPS do
// check-in, volumes/obs, encerramento). Estilo embutido para servir no comercial, na doca
// e no documento. reg = { checkin, foto, encerramento }; fotoUrl = src da imagem da carga.
export function blocoRegistroMotorista(reg, fotoUrl, assinaturaUrl) {
  const r = reg || {};
  if (!r.checkin && !r.foto && !r.encerramento && !r.assinatura) return '';
  // Hora no fuso de Brasília (UTC-3, sem horário de verão).
  const hh = (x) => { const d = new Date(x); if (!x || isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
  const linhas = [];
  if (r.encerramento) linhas.push(`<div style="font-size:13px;color:#1E5B31;font-weight:700">✓ Coleta concluída pelo motorista${r.encerramento.agenteNome ? ` — ${esc(r.encerramento.agenteNome)}` : ''}${r.encerramento.em ? ` · ${hh(r.encerramento.em)} ${dataBR(r.encerramento.em)}` : ''}</div>`);
  if (r.encerramento && r.encerramento.volumes) linhas.push(`<div style="font-size:13px;color:#4F6469;margin-top:4px"><b>Volumes/quantidade:</b> ${esc(r.encerramento.volumes)}</div>`);
  if (r.encerramento && r.encerramento.obs) linhas.push(`<div style="font-size:13px;color:#4F6469;margin-top:4px"><b>Observações do motorista:</b> ${esc(r.encerramento.obs)}</div>`);
  if (r.checkin) linhas.push(`<div style="font-size:12.5px;color:#4F6469;margin-top:4px">📍 Check-in por GPS no cliente${r.checkin.em ? ` às ${hh(r.checkin.em)}` : ''}${(r.checkin.lat != null && r.checkin.lon != null) ? ` · <a href="https://www.google.com/maps/search/?api=1&query=${r.checkin.lat},${r.checkin.lon}" target="_blank" rel="noopener" style="color:#0B5B66;font-weight:700;text-decoration:none">ver no mapa ↗</a>` : ''}</div>`);
  if (r.assinatura) linhas.push(`<div style="font-size:12.5px;color:#1E5B31;font-weight:700;margin-top:4px">✍️ Assinatura do cliente${r.assinatura.doc ? ` · RG/CPF ${esc(r.assinatura.doc)}` : ''}${r.assinatura.nome ? ` · ${esc(r.assinatura.nome)}` : ''}${r.assinatura.em ? ` · ${hh(r.assinatura.em)}` : ''}</div>`);
  const img = (r.foto && fotoUrl) ? `<img src="${esc(fotoUrl)}" alt="Foto da carga registrada pelo motorista" style="width:100%;max-width:420px;border-radius:12px;margin-top:10px;border:1px solid #E4EBE9">` : (r.foto ? '' : `<div style="font-size:12.5px;color:#8fa39f;margin-top:6px">Sem foto da carga registrada pelo motorista.</div>`);
  const assImg = (r.assinatura && assinaturaUrl) ? `<img src="${esc(assinaturaUrl)}" alt="Assinatura do cliente" style="width:100%;max-width:360px;border-radius:10px;margin-top:10px;border:1px solid #E4EBE9;background:#fff">` : '';
  return `<div style="background:#fff;border:1px solid #E4EBE9;border-left:4px solid #0B5B66;border-radius:14px;padding:16px 18px;margin-bottom:14px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#0B5B66;margin-bottom:8px">📸 Registro da coleta (motorista)</div>
    ${linhas.join('')}
    ${img}
    ${assImg}
  </div>`;
}

export function paginaColetaOSDetalhe(user, os, acomp, extras) {
  // extras (24/08): somenteLeitura = sessão de engenharia (vê tudo, muda nada);
  // op/val/cdfApto ligam a OS à operação da doca (peso real + gate do certificado).
  const ro = !!(extras && extras.somenteLeitura);
  const opDoca = (extras && extras.op) || null;
  const cdfApto = !!(extras && extras.cdfApto);
  const linha = (l, v) => v ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#6B7B78;width:38%">${esc(l)}</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600;white-space:pre-wrap;word-break:break-word">${esc(v)}</td></tr>` : '';
  const hhmm = (x) => { const d = new Date(x); if (!x || isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
  const canalAviso = (a) => { const c = (a && a.via === 'whatsapp') ? 'WhatsApp' : ((a && a.via === 'sms') ? 'SMS' : ((a && a.via === 'email') ? 'e-mail' : '')); return c ? ` (${c}${a && a.quem ? ' → ' + esc(a.quem) : ''})` : ''; };
  const acompHTML = (() => {
    const a = acomp || {};
    if (!a.saiu && !a.chegou) return '';
    const rows = [];
    if (a.saiu) rows.push(a.avisoACaminho
      ? `<div style="font-size:12.5px;font-weight:700;color:#1E5B31;margin-top:4px">🔔 Cliente avisado que está a caminho${canalAviso(a.avisoACaminho)}${a.saiuEm ? ` · ${hhmm(a.saiuEm)}` : ''}</div>`
      : `<div style="font-size:12.5px;font-weight:700;color:#8A4B00;margin-top:4px">⚠️ Motorista saiu${a.saiuEm ? ` (${hhmm(a.saiuEm)})` : ''} — cliente NÃO avisado (confira e-mail/telefone no cadastro)</div>`);
    if (a.chegou) rows.push(a.avisoChegou
      ? `<div style="font-size:12.5px;font-weight:700;color:#1E5B31;margin-top:4px">🔔 Cliente avisado que o motorista chegou${canalAviso(a.avisoChegou)}${a.chegouEm ? ` · ${hhmm(a.chegouEm)}` : ''}</div>`
      : `<div style="font-size:12.5px;font-weight:700;color:#8A4B00;margin-top:4px">⚠️ Motorista chegou${a.chegouEm ? ` (${hhmm(a.chegouEm)})` : ''} — cliente NÃO avisado</div>`);
    if (a.chegou) rows.push(`<div style="font-size:12.5px;color:#0B5B66;font-weight:700;margin-top:6px">📍 Motorista no local do cliente</div>`);
    else if (a.km != null) rows.push(`<div style="font-size:12.5px;color:#0B5B66;font-weight:700;margin-top:6px">🚚 ~${Number(a.km).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km do local · última posição do rastreador${a.kmEm ? ' às ' + hhmm(a.kmEm) : ''} (linha reta)</div>`);
    else if (a.saiu) rows.push(`<div style="font-size:12px;color:#8fa39f;margin-top:6px">Distância indisponível (sem posição do rastreador ou sem CEP no endereço).</div>`);
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid #92C430">
      <div class="sec" style="margin-top:0">🚚 Acompanhamento da coleta</div>
      ${rows.join('')}
    </div>`;
  })();
  // Reagendamento à mostra (pedido da equipe 18/08): vale o que está na OS
  // (fluxo novo) OU o estado do app do motorista (casos de antes do ajuste).
  const rea = os.reagendar || (acomp && acomp.reagendar) || null;
  const reaHTML = (rea && os.status !== 'concluida' && os.status !== 'cancelada') ? `<div class="card" style="margin-bottom:14px;border-left:4px solid #E0A800;background:#FFF9EC">
    <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8A6A16">↩︎ O motorista pediu REAGENDAMENTO — coleta NÃO realizada</div>
    <div style="font-size:15px;font-weight:800;color:#10262B;margin-top:8px">${esc(rea.motivo || 'Sem motivo informado')}</div>
    <div style="font-size:12.5px;color:#8A6A16;margin-top:6px">${(rea.agenteNome || rea.agente) ? '🚚 ' + esc(rea.agenteNome || rea.agente) + ' · ' : ''}${esc(dataBR(rea.em))}${hhmm(rea.em) ? ' às ' + hhmm(rea.em) : ''}</div>
    ${rea.foto ? `<div style="font-size:11.5px;font-weight:800;color:#8A6A16;margin-top:10px">📷 Foto do motivo, enviada pelo motorista:</div><img src="/coletas/foto-reagendar?id=${esc(os.id)}" alt="Foto do motivo do reagendamento" style="width:100%;max-width:420px;border-radius:12px;margin-top:6px;border:1px solid #E8D9A8">` : ''}
    <div style="font-size:12px;color:#4F6469;margin-top:8px">O que fazer: <b>1)</b> combine a nova data com o cliente e ajuste em <b>✏️ Editar</b>; <b>2)</b> toque no botão abaixo para a coleta <b>voltar ao app do motorista</b> — sem isso ela fica invisível para ele. Este aviso some sozinho quando o motorista sair para a nova tentativa.</div>
    ${!ro && os.status === 'agendada' ? (os.agenteEmail
      ? `<button class="btn btn-p" style="margin-top:10px;padding:12px 16px" onclick="setStatus('em_transporte')">🚚 Nova data combinada — devolver para a rota${os.agenteNome ? ' de ' + esc(os.agenteNome) : ' do motorista'}</button>`
      : `<div style="font-size:12px;font-weight:800;color:#8A6A16;margin-top:10px">⚠️ Sem motorista escolhido — <a href="/coletas/editar?id=${esc(os.id)}" style="color:#0B5B66">escolha em Editar</a> antes de devolver para a rota.</div>`) : ''}
    ${!ro && os.status === 'em_transporte' ? `<div style="font-size:12px;font-weight:800;color:#1E5B31;margin-top:10px">✓ Já está na rota do motorista — vai aparecer no app dele${os.agenteNome ? ` (${esc(os.agenteNome)})` : ''}.</div>` : ''}
  </div>` : '';
  const registroHTML = blocoRegistroMotorista(acomp && acomp.registro, `/coletas/foto-motorista?id=${esc(os.id)}`, `/coletas/assinatura-motorista?id=${esc(os.id)}`);
  const anexosArr = Array.isArray(os.anexos) ? os.anexos : [];
  const badgeTipo = (t) => t ? `<span style="flex:none;font-size:9px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:20px;background:#E8F0EE;color:#3B5B57;white-space:nowrap">${esc(t)}</span>` : `<span style="flex:none;font-size:9px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:2px 8px;border-radius:20px;background:#FFF4DE;color:#8A6A16;white-space:nowrap">sem tipo</span>`;
  const anexosHTML = anexosArr.length ? anexosArr.map((a) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #EEF1F0;border-radius:10px;padding:9px 12px;margin-bottom:7px;background:#FBFDFC">
      <a href="/coletas/anexo?key=${encodeURIComponent(a.key)}" target="_blank" rel="noopener" style="text-decoration:none;color:#10262B;font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0">${iconeTipoAnexo(a.tipo, a.content_type)} ${esc(a.nome || 'arquivo')} ↗</a>
      <div style="display:flex;align-items:center;gap:9px;flex:none">${badgeTipo(a.tipo)}<button onclick="removerAnexo('${esc(a.key)}')" style="flex:none;background:none;border:none;color:#B23A2E;font-size:11.5px;font-weight:700;cursor:pointer">remover</button></div>
    </div>`).join('') : '<div style="font-size:12.5px;color:#8fa39f">Nenhum anexo ainda.</div>';
  return `${head(os.numero)}<body>${topo('coletas')}
<div class="wrap">
  <a href="/coletas" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Todas as coletas</a>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 16px">
    <div>${pill(os.status, os.dataAgendada)}${os.prazoAlvoEm && os.status !== 'cancelada' ? ` <span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:#FFE9C7;color:#8A4B00">🏭 LOTE GRANDE · ${esc((situacaoPrazo(os.prazoAlvoEm, { status: os.status, concluidaEm: os.concluidaEm }) || {}).texto || '')}</span>` : ''}<h1 style="font-size:22px;margin:8px 0 0">${esc(os.numero)}</h1>
    <div style="font-size:13px;color:#7c8a87;margin-top:2px">${os.clienteId ? `<a href="/cadastro/cliente?id=${esc(os.clienteId)}" style="color:#0B5B66;font-weight:700;text-decoration:none">${esc(os.clienteNome || 'Cliente')} ↗</a>` : esc(os.clienteNome || '')}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;flex:none;justify-content:flex-end">
      ${os.clienteId && !ro ? `<a href="/cadastro/cliente?id=${esc(os.clienteId)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">👤 Abrir cliente</a>` : ''}
      ${ro ? '' : `<a href="/coletas/editar?id=${esc(os.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">✏️ Editar</a>`}
      <a href="/coletas/os/carta?id=${esc(os.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">📄 Carta de Descarte</a>
      <a href="/coletas/os/manifesto?id=${esc(os.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">📄 Manifesto de Carga</a>
      ${cdfApto ? `<a href="/coletas/os/cdf?id=${esc(os.id)}" class="btn" style="padding:9px 12px;font-size:12.5px;background:#E4F3E6;color:#1E5B31">🏅 Certificado (CDF) ✓</a>` : `<a href="/coletas/os/cdf?id=${esc(os.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px;opacity:.55" title="Só fica apto quando a operação é FINALIZADA e validada pela engenharia">🏅 CDF — ainda não apto</a>`}
      <a href="/coletas/os/comprovante?id=${esc(os.id)}" class="btn btn-d" style="padding:9px 12px;font-size:12.5px">✅ Comprovante (QR)</a>
    </div>
  </div>
  ${reaHTML}
  ${acompHTML}
  ${registroHTML}
  ${(extras && extras.avaliacaoHTML) || ''}
  <div class="card">
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px">
      ${linha('Cliente', os.clienteNome)}${linha('Documento', os.clienteDoc)}
      ${linha('Endereço da coleta', os.endereco)}
      ${linha('Data da coleta', [dataBR(os.dataAgendada), os.janela].filter(Boolean).join(' · '))}
      ${ro ? '' : linha('Como nos achou?', `${rotuloComo(os.comoNosAchou)}${os.comoNosAchou === 'outro' && os.comoNosAchouOutro ? ` — ${os.comoNosAchouOutro}` : ''}`)}
      ${linha('Contato no local', os.contato)}
      ${os.transportadora
        ? linha('Transportadora', [os.transportadora.nome, os.transportadora.cnpj ? 'CNPJ ' + os.transportadora.cnpj : '', os.transportadora.placa ? 'placa ' + os.transportadora.placa : '', os.transportadora.motorista ? 'motorista ' + os.transportadora.motorista : '', os.transportadora.fone].filter(Boolean).join(' · '))
        : linha('Motorista', os.agenteNome)}
      ${linha('Material', os.material)}${(os.itens && os.itens.length) ? linha('Equipamentos', os.itens.map((i) => `${i.nome} (${i.qtd})${Number(i.valor) > 0 ? ' — R$ ' + brl(i.valor) : ''}`).join(' · ')) : ''}${linha('Quantidade', os.quantidade)}${linha('Acondicionamento', os.acondicionamento)}
      ${linha('Observações', os.obs)}
      ${os.obsInterna ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#8a6a16;width:38%;font-weight:700">🔒 Interna (equipe)</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600;white-space:pre-wrap;word-break:break-word;color:#7a5f13">${esc(os.obsInterna)}</td></tr>` : ''}
      ${linha('Certificados solicitados', (os.certificados || []).join(' · '))}
      ${linha('Aberta em', textoBR(os.criadoEm) || dataBR(os.criadoEm))}
      ${os.leadId ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#6B7B78;width:38%">Pedido de origem</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600">${ro ? `pedido de ${esc(textoBR(os.leadCriadoEm) || '—')}` : `<a href="/leads/lead?id=${esc(os.leadId)}" style="color:#0B5B66;font-weight:700;text-decoration:none">pedido de ${esc(textoBR(os.leadCriadoEm) || '—')} ↗</a>`}</td></tr>` : ''}
      ${os.prazoAlvoEm ? linha('Prazo-alvo (lote grande)', `${textoBR(os.prazoAlvoEm)} (${os.prazoHoras || 72}h do pedido) — ${(situacaoPrazo(os.prazoAlvoEm, { status: os.status, concluidaEm: os.concluidaEm }) || {}).texto || ''}`) : ''}
      ${os.status === 'concluida' && os.concluidaEm ? linha('Concluída em', dataBR(os.concluidaEm)) : ''}
      ${os.status === 'cancelada' && os.canceladaEm ? linha('Cancelada em', dataBR(os.canceladaEm) + (os.motivoCancelamento ? ' — motivo: ' + os.motivoCancelamento : '')) : ''}
    </table>
    ${os.endereco ? `<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <a href="https://waze.com/ul?q=${encodeURIComponent(os.endereco)}&navigate=yes" target="_blank" rel="noopener" class="btn" style="flex:1;min-width:150px;background:#33ccff;color:#083b47;padding:11px 12px;font-size:13px">🧭 Abrir no Waze</a>
      <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(os.endereco)}" target="_blank" rel="noopener" class="btn btn-g" style="flex:1;min-width:150px;padding:11px 12px;font-size:13px">📍 Google Maps (rota)</a>
    </div>` : ''}
    ${os.cobranca ? `<div style="margin-top:14px;border:1px solid ${os.cobranca.status === 'pago' ? '#CBE7CB;background:#F0FAF0' : '#F2C173;background:#FFF9EE'};border-radius:12px;padding:13px 15px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${os.cobranca.status === 'pago' ? '#1E7A1E' : '#8A4B00'}">💰 Cobrança: R$ ${esc(String(os.cobranca.valor).replace('.', ','))} — ${os.cobranca.status === 'pago' ? '✅ PAGA' : 'aguardando pagamento'}</div>
      <div style="font-size:13px;color:#4F6469;margin-top:5px">${esc(os.cobranca.descricao || '')}${os.cobranca.status === 'pago' && os.cobranca.pagoEm ? ` · paga em ${esc(dataBR(os.cobranca.pagoEm))}` : ''}</div>
      ${os.cobranca.status === 'pago' && os.liberada ? `<div style="font-size:12.5px;color:#1E7A1E;font-weight:700;margin-top:5px">🔓 OS liberada${os.cobranca.liberouEmTransporte ? ' — colocada em transporte automaticamente' : (os.status === 'agendada' && !os.agenteEmail ? ' — escolha o motorista para liberar no app' : '')}</div>` : ''}
      ${os.cobranca.status !== 'pago' && os.cobranca.boleto && os.cobranca.boleto.url ? `<div style="margin-top:8px;background:#fff;border:1px dashed #D8B46A;border-radius:8px;padding:9px 11px;font-size:12.5px;color:#4F6469">📄 <b>Boleto emitido pelo cliente</b>${os.cobranca.boleto.vence ? ` · vence em <b>${esc(dataBR(os.cobranca.boleto.vence))}</b>` : ''} — <a href="${esc(os.cobranca.boleto.url)}" target="_blank" rel="noopener" style="color:#0B5B66;font-weight:700">abrir boleto</a>
      <div style="font-size:11px;color:#8a6a16;margin-top:3px">Precisa de outra data? O cliente abre o mesmo link de pagamento e clica em Boleto de novo — sai um boleto novo (o antigo expira sozinho, não precisa cancelar; só não pagar os dois).</div></div>` : ''}
      ${os.cobranca.status !== 'pago' && os.cobranca.link ? `<input readonly value="${esc(os.cobranca.link)}" onclick="this.select()" style="width:100%;font-size:12px;margin-top:8px;border:1px solid #DDE1E6;border-radius:8px;padding:8px 10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <a href="https://wa.me/?text=${encodeURIComponent('Olá! Segue o link para pagamento da sua coleta Ecobraz (OS ' + os.numero + ') — R$ ' + String(os.cobranca.valor).replace('.', ',') + ': ' + os.cobranca.link)}" target="_blank" rel="noopener" class="btn" style="background:#25D366;color:#0b3d1e;padding:8px 12px;font-size:12.5px">📱 Enviar por WhatsApp</a>
        <a href="mailto:?subject=${encodeURIComponent('Link de pagamento — Coleta Ecobraz ' + os.numero)}&body=${encodeURIComponent('Olá!\n\nSegue o link para pagamento da sua coleta Ecobraz (OS ' + os.numero + ') — R$ ' + String(os.cobranca.valor).replace('.', ',') + (os.cobranca.descricao ? ' (' + os.cobranca.descricao + ')' : '') + ':\n' + os.cobranca.link + '\n\nQualquer dúvida, estamos à disposição.\nEquipe Ecobraz')}" class="btn btn-g" style="padding:8px 12px;font-size:12.5px">✉️ Enviar por e-mail</a>
      </div>` : ''}
    </div>` : ''}
    ${os.mtr && os.mtr.numero ? `<div style="margin-top:14px;border:1px solid #CBE7E3;background:#F0FAF9;border-radius:12px;padding:13px 15px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#1F4348">🏛️ MTR ${esc(os.mtr.numero)} · ${esc(os.mtr.situacao || '—')}${os.mtr.cdf ? ' · CDF ' + esc(String(os.mtr.cdf)) : ''}</div>
      <div style="font-size:13px;color:#4F6469;margin-top:5px">Gerador: ${esc(os.mtr.gerador || '—')}${os.mtr.emissao ? ' · emitida em ' + esc(os.mtr.emissao) : ''}${os.mtr.pdfAnexado ? ' · 📎 PDF nos documentos' : ''}</div>
      ${os.mtr.divergenciaGerador ? '<div style="font-size:12px;color:#9B1C1C;font-weight:700;margin-top:5px">⚠️ CNPJ do gerador diverge do cliente desta OS.</div>' : ''}
    </div>` : ''}
    ${os.patrocinadorNome ? `<div style="margin-top:14px;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:12px;padding:14px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#3f6b1e">🤝 Coleta patrocinada · Adote um Bairro</div>
      <div style="font-size:13.5px;color:#28413f;margin-top:6px">Esta coleta é <b>financiada por ${esc(os.patrocinadorNome)}</b>.</div>
      <div style="font-size:12px;color:#4F6469;margin-top:8px;line-height:1.55">Ao realizar a coleta, o cliente <b>autoriza o compartilhamento das informações desta coleta</b> (materiais, peso e comprovantes de destinação) com o patrocinador <b>${esc(os.patrocinadorNome)}</b>, para fins de comprovação e relatório socioambiental, nos termos da LGPD (Lei 13.709/2018).</div>
    </div>` : ''}
    ${Array.isArray(os.telemetria) && os.telemetria.length ? `<div class="sec">🛰️ Telemetria do veículo (RotaExata) — prova de rastreabilidade</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin:-2px 0 8px">Posição do rastreador do caminhão registrada automaticamente em cada evento da coleta — dado independente e incontestável.</div>
    ${os.telemetria.map((t) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #EEF1F0;border-radius:10px;padding:9px 12px;margin-bottom:6px;background:#FBFDFC">
      <div style="min-width:0;font-size:12.5px"><b>${esc({ a_caminho: '🚗 A caminho', checkin: '📍 Chegou no cliente', encerramento: '🏭 Encerrou na Ecobraz' }[t.evento] || t.evento)}</b><span style="color:#7c8a87"> · ${esc(hhmm(t.em))} · ${esc(dataBR(t.em))}${t.velocidade != null ? ` · ${Math.round(Number(t.velocidade) || 0)} km/h` : ''} · ${esc(t.placa || '')}</span></div>
      <a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(t.lat)}&mlon=${encodeURIComponent(t.lng)}#map=16/${encodeURIComponent(t.lat)}/${encodeURIComponent(t.lng)}" target="_blank" rel="noopener" style="flex:none;font-size:11.5px;color:#0B5B66;font-weight:700;text-decoration:none">🗺️ ver ponto ↗</a>
    </div>`).join('')}` : ''}
    ${opDoca ? `<div class="sec">🏭 Operação na doca — elo do certificado</div>
    <div style="border:1px solid #DDE7E4;border-radius:12px;padding:13px 15px;background:#F7FAF9;margin-bottom:4px">
      <div style="font-size:13px">Etapa atual: <b>${esc(({ recepcao: 'Recepção', triagem: 'Triagem', processamento: 'Processamento', saida: 'Saída', validacao: 'Validação (Eng.)', concluida: 'FINALIZADA ✓' })[opDoca.etapa] || opDoca.etapa)}</b> · certificado ${cdfApto ? '<b style="color:#1E5B31">APTO ✓</b>' : '<b style="color:#8A6A16">ainda não apto</b> (precisa estar FINALIZADA e validada pela engenharia)'}</div>
      <div style="display:flex;align-items:center;gap:9px;margin-top:10px;flex-wrap:wrap">
        <span style="font-size:12.5px;font-weight:800;color:#4F6469">⚖️ Peso REAL (vai no certificado):</span>
        ${ro ? `<b style="font-size:14px">${opDoca.entrada && opDoca.entrada.pesoKg != null ? esc(String(opDoca.entrada.pesoKg).replace('.', ',')) + ' kg' : 'ainda não pesado'}</b>`
    : `<input id="pesoReal" value="${opDoca.entrada && opDoca.entrada.pesoKg != null ? esc(String(opDoca.entrada.pesoKg).replace('.', ',')) : ''}" placeholder="kg" inputmode="decimal" style="width:120px;border:1px solid #DDE1E6;border-radius:9px;padding:9px 10px;font-size:14px">
        <span style="font-size:12px;color:#7c8a87">kg</span>
        <button class="btn btn-d" style="padding:8px 13px;font-size:12px" onclick="salvarPesoReal()">Salvar peso</button>
        <span id="pesoMsg" style="font-size:12px;color:#4F6469"></span>`}
      </div>
      ${opDoca.entrada && opDoca.entrada.rateado ? '<div style="font-size:11px;color:#B26A16;font-weight:700;margin-top:7px">⚠️ Peso RATEADO em partes iguais entre as OSs da mesma carga — confira e ajuste antes de emitir o certificado.</div>' : ''}
      ${Array.isArray(opDoca.pesoAjustes) && opDoca.pesoAjustes.length ? `<div style="font-size:11px;color:#8A6A16;margin-top:7px">✎ ajustado ${opDoca.pesoAjustes.length}× — último: ${esc(String(opDoca.pesoAjustes[opDoca.pesoAjustes.length - 1].de).replace('.', ','))} → ${esc(String(opDoca.pesoAjustes[opDoca.pesoAjustes.length - 1].para).replace('.', ','))} kg por ${esc(opDoca.pesoAjustes[opDoca.pesoAjustes.length - 1].por || '—')}</div>` : ''}
      ${ro ? '' : '<div style="font-size:11px;color:#9aa7a4;margin-top:6px">Confira e ajuste o peso real ANTES de emitir o certificado — o valor salvo aqui é o que vale no CDF e no balanço de massa.</div>'}
    </div>` : `<div class="sec">🏭 Operação na doca</div>
    <div style="font-size:12.5px;color:#8fa39f;margin-bottom:4px">A doca ainda não recebeu esta coleta — a operação (pesagem real, processamento e certificado) começa quando ela chega lá.</div>`}
    <div class="sec">📎 Anexos da coleta</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin:-2px 0 8px">Fotos do material/local e arquivos (PDF) desta coleta — guardados no depósito próprio. Laudos entram aqui, com o tipo escolhido.</div>
    <div id="anexosLista">${anexosHTML}</div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
      <select id="arqTipo" style="font-size:12.5px;max-width:230px;border:1px solid #DDE1E6;border-radius:9px;padding:9px 10px;background:#fff;color:#10262B">
        <option value="">— tipo do documento —</option>
        ${TIPOS_ANEXO.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
      </select>
      <input type="file" id="arqFile" accept="image/*,application/pdf,.pdf" style="font-size:12.5px;max-width:230px">
      <button class="btn btn-g" style="padding:8px 12px;font-size:12.5px" onclick="enviarAnexo()">⬆ Anexar</button>
      <span id="anexoMsg" style="font-size:12px;color:#4F6469"></span>
    </div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:5px">Escolha o <b>tipo</b> (laudo de descaracterização, destruição de dados, análise química…) antes de anexar — assim o documento fica identificado na auditoria.</div>
    ${ro ? '<div class="sec">Situação</div><div style="font-size:12.5px;color:#8fa39f">👁 Modo consulta (engenharia): você vê tudo desta OS e pode anexar laudos — mudanças de status e edição ficam com o escritório.</div>' : `<div class="sec">Situação</div>
    ${os.status === 'agendada' && os.transportadora ? `<div style="background:#EAF2E6;border:1px solid #cfe6b8;border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="font-size:13.5px;font-weight:800;color:#28413f">🚛 Coleta por transportadora — ${esc(os.transportadora.nome)}</div>
      <div style="font-size:12.5px;color:#4F6469;margin:5px 0 11px">Ela <b>não aparece</b> no app dos motoristas. Quando a transportadora <b>sair para coletar</b>, coloque <b>Em transporte</b>; quando o material <b>chegar na Ecobraz</b>, marque <b>Concluída</b> — aí ela entra sozinha na fila da doca (Receber lote).</div>
      <button class="btn btn-p" style="padding:11px 16px" onclick="setStatus('em_transporte')">Colocar em transporte →</button>
    </div>` : ''}
    ${os.status === 'agendada' && !os.transportadora ? (os.agenteEmail ? `<div style="background:#EAF2E6;border:1px solid #cfe6b8;border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="font-size:13.5px;font-weight:800;color:#28413f">🚚 Liberar para o motorista${os.agenteNome ? ` — ${esc(os.agenteNome)}` : ''}</div>
      <div style="font-size:12.5px;color:#4F6469;margin:5px 0 11px">Enquanto está <b>Agendada</b>, esta coleta <b>não aparece</b> no app do motorista. Coloque <b>Em transporte</b> para ela entrar só na tela dele.</div>
      <button class="btn btn-p" style="padding:11px 16px" onclick="setStatus('em_transporte')">Colocar em transporte →</button>
    </div>` : `<div style="background:#FFF4DE;border:1px solid #f0d79a;border-radius:12px;padding:14px 16px;margin-bottom:10px">
      <div style="font-size:13.5px;font-weight:800;color:#8A6A16">⚠️ Nenhum motorista escolhido</div>
      <div style="font-size:12.5px;color:#7a5f1c;margin:5px 0 11px">Escolha o <b>motorista</b> desta coleta antes de liberar — senão ela <b>não aparece para nenhum motorista</b>.</div>
      <a href="/coletas/editar?id=${esc(os.id)}" class="btn btn-p" style="padding:11px 16px;text-decoration:none">Escolher motorista →</a>
    </div>`) : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${Object.keys(STATUS).filter((s) => s !== 'na_unidade').map((s) => `<button class="btn ${s === os.status ? 'btn-d' : 'btn-g'}" style="padding:8px 12px;font-size:12.5px" onclick="setStatus('${s}')" ${s === os.status ? 'disabled' : ''}>${esc(STATUS[s])}</button>`).join('')}
    </div>
    <div style="font-size:11.5px;color:#9aa7a4;margin-top:6px">Fluxo normal: a OS nasce <b>Agendada</b> → o comercial <b>escolhe o motorista</b> e coloca <b>Em transporte</b> (aí ela aparece só no app daquele motorista) → o <b>motorista</b> toca a caminho → chegou → <b>Concluída</b>. Ao ficar <b>Concluída</b>, vai <b>automaticamente para a doca</b>. Os outros botões são só para ajuste manual.</div>
    <div id="m" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>`}
  </div>
</div>
<script>var TEM_MOTORISTA=${os.agenteEmail ? 'true' : 'false'};var TEM_TRANSP=${os.transportadora ? 'true' : 'false'};
function salvarPesoReal(){var i=document.getElementById('pesoReal'),m=document.getElementById('pesoMsg');if(!i)return;if(!i.value.trim()){if(m)m.textContent='Digite o peso.';return;}if(m)m.textContent='Salvando…';
  fetch('/api/coletas/peso-real',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({osId:'${esc(os.id)}',kg:i.value})}).then(function(r){return r.json();}).then(function(j){if(j.ok){if(m)m.textContent='✓ salvo';setTimeout(function(){location.reload();},600);}else{if(m)m.textContent=j.message||'Falha ao salvar.';}}).catch(function(){if(m)m.textContent='Sem conexão.';});}function setStatus(s){if(s==='em_transporte'&&!TEM_MOTORISTA&&!TEM_TRANSP&&!confirm('Esta coleta não tem motorista escolhido. Se colocar em transporte assim, ela NÃO vai aparecer para nenhum motorista. O ideal é Editar e escolher o motorista (ou marcar a transportadora) antes. Continuar mesmo assim?'))return;var motivo='';if(s==='cancelada'){motivo=prompt('Cancelar esta coleta? Ela sai da lista principal, mas fica guardada no histórico (dá pra reativar depois).\\n\\nMotivo do cancelamento (opcional — ex.: cliente desistiu, OS duplicada, endereço errado):','');if(motivo===null)return;}document.getElementById('m').textContent='Salvando…';fetch('/api/coletas/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(os.id)}',status:s,motivo:motivo||''})}).then(r=>r.json()).then(j=>{if(j.ok){location.reload();}else{document.getElementById('m').textContent='Falha.';}}).catch(()=>document.getElementById('m').textContent='Sem conexão.');}
function enviarAnexo(){var f=document.getElementById('arqFile'),tp=document.getElementById('arqTipo'),msg=document.getElementById('anexoMsg');if(!f.files||!f.files[0]){msg.textContent='Escolha um arquivo.';return;}if(f.files[0].size>15728640){msg.textContent='Arquivo muito grande (máx. 15 MB).';return;}if(!tp.value){msg.textContent='Escolha o tipo do documento.';return;}var fd=new FormData();fd.append('arquivo',f.files[0]);msg.textContent='Enviando…';fetch('/api/coletas/anexo?id=${esc(os.id)}&tipo='+encodeURIComponent(tp.value),{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){if(j.ok){location.reload();}else{msg.textContent=j.error||'Falha ao enviar.';}}).catch(function(){msg.textContent='Sem conexão.';});}
function removerAnexo(k){if(!confirm('Remover este anexo?'))return;fetch('/api/coletas/anexo-remover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(os.id)}',key:k})}).then(function(r){return r.json();}).then(function(j){if(j.ok)location.reload();}).catch(function(){});}</script>
</body></html>`;
}

// Editar uma coleta existente (mesmos campos da criação; número e status ficam).
export function paginaEditarColeta(user, os, contatos, agentes, veiculos) {
  const optAgentes = ['<option value="">— escolher motorista —</option>'].concat((agentes || []).map((a) => `<option value="${esc(a.email)}|${esc(a.nome)}" ${a.email === os.agenteEmail ? 'selected' : ''}>${esc(a.nome)}</option>`)).join('');
  const veics = (veiculos || []).filter((v) => v && v.placa && v.ativo !== false);
  const optVeiculos = ['<option value="">— escolher veículo —</option>'].concat(veics.map((v) => `<option value="${esc(v.placa)}" ${v.placa === os.veiculoPlaca ? 'selected' : ''}>${esc(v.placa)}${v.apelido ? ' — ' + esc(v.apelido) : ''}</option>`)).join('');
  const cts = (contatos || []).filter((c) => c && (c.nome || c.fone || c.email));
  const optContatos = cts.length ? ['<option value="">— escolher um contato do cliente —</option>'].concat(cts.map((c) => `<option value="${esc([c.nome, c.fone].filter(Boolean).join(' · '))}">${esc(c.nome || '(sem nome)')}${c.cargo ? ' — ' + esc(c.cargo) : ''}</option>`)).join('') : '';
  const itensTxt = (os.itens || []).map((i) => `${i.nome} ; ${i.qtd}${Number(i.valor) > 0 ? ' ; ' + brl(i.valor) : ''}`).join('\n');
  return `${head('Editar coleta')}<body>${topo('coletas')}
<div class="wrap">
  <a href="/coletas/os?id=${esc(os.id)}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Voltar para a coleta</a>
  <h1 style="font-size:20px;margin:10px 0 2px">Editar coleta</h1>
  <p style="font-size:12.5px;color:#8fa39f;margin:0 0 14px">${esc(os.numero)} · ${esc(os.clienteNome || '')}</p>
  <div class="card">
    ${comoValido(os.comoNosAchou) ? blocoComoNosAchou(os.comoNosAchou, os.comoNosAchouOutro, { primeiro: true }) : `<div class="sec" style="margin-top:0">Como nos achou?</div>
    <div id="comoFechado" style="font-size:12.5px;color:#4F6469;margin:6px 0 4px;line-height:1.5"><b>Não informado</b> (coleta criada antes deste campo existir). <button type="button" onclick="abrirComo()" style="display:inline-block;width:auto;margin:0 0 0 4px;padding:5px 11px;font-size:12px;font-weight:700;border-radius:999px;border:1.5px solid #cfe0dd;background:#fff;color:#00333B;cursor:pointer;font-family:inherit">Informar</button></div>
    <div id="comoAberto" style="display:none">
      <div style="font-size:11.5px;color:#8a6a16;margin:2px 0 4px">Só escolha se souber de verdade como o cliente nos achou.</div>
      ${blocoComoNosAchou('', '', { semTitulo: true })}
      <button type="button" onclick="fecharComo()" style="display:inline-block;width:auto;margin:2px 0 6px;padding:5px 11px;font-size:12px;font-weight:700;border-radius:999px;border:1.5px solid #cfe0dd;background:#fff;color:#4F6469;cursor:pointer;font-family:inherit">Cancelar — continua não informado</button>
    </div>`}
    <div class="sec">Local &amp; agendamento</div>
    <label>Endereço da coleta</label><textarea id="endereco" rows="2">${esc(os.endereco || '')}</textarea>
    <div class="g2"><div><label>Data</label><input id="data" type="date" value="${esc(os.dataAgendada || '')}"></div><div><label>Janela (opcional)</label><input id="janela" value="${esc(os.janela || '')}" placeholder="ex.: 09h–12h"></div></div>
    <label>Contato no local</label>
    ${optContatos ? `<select id="contatoSel" onchange="if(this.value)document.getElementById('contato').value=this.value" style="margin-bottom:8px">${optContatos}</select>` : ''}
    <input id="contato" value="${esc(os.contato || '')}" placeholder="nome · telefone">
    <div class="sec">Material &amp; motorista</div>
    <label>Material declarado</label><textarea id="material" rows="2">${esc(os.material || '')}</textarea>
    <label>Equipamentos item a item <span style="color:#9aa7a4;font-weight:400">(um por linha — ex.: Monitor LCD ; 5 ; 120,00)</span></label><textarea id="itens" rows="4">${esc(itensTxt)}</textarea>
    <div class="g2"><div><label>Quantidade estimada</label><input id="quantidade" value="${esc(os.quantidade || '')}"></div><div><label>Acondicionamento</label><input id="acondicionamento" value="${esc(os.acondicionamento || '')}"></div></div>
    <label>Quem faz a coleta?</label>
    <select id="quemColeta" onchange="toggleTransp()">
      <option value="motorista"${os.transportadora ? '' : ' selected'}>🚚 Motorista da Ecobraz</option>
      <option value="transportadora"${os.transportadora ? ' selected' : ''}>🚛 Transportadora (terceirizada)</option>
    </select>
    <div id="boxMotorista" class="g2" style="margin-top:8px;${os.transportadora ? 'display:none' : ''}"><div><label>Motorista</label><select id="agente">${optAgentes}</select></div><div><label>Veículo</label><select id="veiculo">${optVeiculos}</select></div></div>
    <div id="boxTransp" style="${os.transportadora ? '' : 'display:none;'}margin-top:8px;border:1px solid #cfe0dd;border-radius:12px;padding:12px 14px;background:#FBFDFC">
      <div class="g2"><div><label>Transportadora *</label><input id="tNome" value="${esc((os.transportadora && os.transportadora.nome) || '')}" placeholder="Razão social da transportadora"></div><div><label>CNPJ (opcional)</label><input id="tCnpj" value="${esc((os.transportadora && os.transportadora.cnpj) || '')}" placeholder="00.000.000/0000-00"></div></div>
      <div class="g2"><div><label>Placa do veículo (opcional)</label><input id="tPlaca" value="${esc((os.transportadora && os.transportadora.placa) || '')}" placeholder="ABC-1D23"></div><div><label>Motorista da transportadora (opcional)</label><input id="tMot" value="${esc((os.transportadora && os.transportadora.motorista) || '')}" placeholder="Nome de quem dirige"></div></div>
      <label>Telefone (opcional)</label><input id="tFone" value="${esc((os.transportadora && os.transportadora.fone) || '')}" placeholder="(11) 90000-0000">
      <div style="font-size:11px;color:#9aa7a4;margin-top:6px">Coleta por transportadora <b>não aparece no app dos motoristas</b>. Nos documentos (Manifesto), o <b>Transportador</b> sai com os dados dela.</div>
    </div>
    <label>Observações / instruções de acesso</label><textarea id="obs" rows="5">${esc(os.obs || '')}</textarea>
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 4px">Pode colar texto longo (até 4.000 caracteres) — as quebras de linha são preservadas no documento da OS.</div>
    <label style="color:#8a6a16">🔒 Observação interna (só a equipe vê)</label><textarea id="obsInterna" rows="3" style="border-color:#eadfb0;background:#FFFDF5">${esc(os.obsInterna || '')}</textarea>
    <div style="font-size:11px;color:#8a6a16;margin:-4px 0 4px">Comunicação entre funcionários — NÃO aparece para o cliente nem no documento da OS.</div>
    <div class="sec">Certificados solicitados pelo cliente</div>
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 8px">Marque o que o cliente precisa. Fica registrado na Ordem de Coleta.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px 16px">${CERTIFICADOS_OS.map((c) => `<label style="display:flex;align-items:center;gap:8px;font-size:13.5px;cursor:pointer"><input type="checkbox" class="cert" value="${esc(c)}"${(os.certificados || []).includes(c) ? ' checked' : ''} style="width:17px;height:17px;flex:none"> ${esc(c)}</label>`).join('')}</div>
    <div class="sec">💰 Cobrança desta coleta (opcional)</div>
    ${os.cobranca ? `
    <div style="border:1px solid ${os.cobranca.status === 'pago' ? '#CBE7CB;background:#F0FAF0' : '#F2C173;background:#FFF9EE'};border-radius:10px;padding:12px 14px;font-size:13.5px">
      <b>R$ ${esc(String(os.cobranca.valor).replace('.', ','))}</b> — ${esc(os.cobranca.descricao || 'cobrança da coleta')} ·
      <b>${os.cobranca.status === 'pago' ? '✅ PAGO' : '💳 aguardando pagamento'}</b>
      ${os.cobranca.status !== 'pago' && os.cobranca.boleto && os.cobranca.boleto.url ? `<div style="margin-top:8px;background:#fff;border:1px dashed #D8B46A;border-radius:8px;padding:9px 11px;font-size:12.5px;color:#4F6469">📄 <b>Boleto emitido pelo cliente</b>${os.cobranca.boleto.vence ? ` · vence em <b>${esc(dataBR(os.cobranca.boleto.vence))}</b>` : ''} — <a href="${esc(os.cobranca.boleto.url)}" target="_blank" rel="noopener" style="color:#0B5B66;font-weight:700">abrir boleto</a></div>` : ''}
      ${os.cobranca.status !== 'pago' && os.cobranca.link ? `<div style="margin-top:8px"><input readonly value="${esc(os.cobranca.link)}" onclick="this.select()" style="font-size:12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <a href="https://wa.me/?text=${encodeURIComponent('Olá! Segue o link para pagamento da sua coleta Ecobraz (OS ' + os.numero + ') — R$ ' + String(os.cobranca.valor).replace('.', ',') + ': ' + os.cobranca.link)}" target="_blank" rel="noopener" class="btn" style="background:#25D366;color:#0b3d1e;padding:8px 12px;font-size:12.5px">📱 Enviar por WhatsApp</a>
          <a href="mailto:?subject=${encodeURIComponent('Link de pagamento — Coleta Ecobraz ' + os.numero)}&body=${encodeURIComponent('Olá!\n\nSegue o link para pagamento da sua coleta Ecobraz (OS ' + os.numero + ') — R$ ' + String(os.cobranca.valor).replace('.', ',') + (os.cobranca.descricao ? ' (' + os.cobranca.descricao + ')' : '') + ':\n' + os.cobranca.link + '\n\nQualquer dúvida, estamos à disposição.\nEquipe Ecobraz')}" class="btn btn-g" style="padding:8px 12px;font-size:12.5px">✉️ Enviar por e-mail</a>
        </div>
        <div style="font-size:11.5px;color:#8a6a16;margin-top:6px">Abre o WhatsApp/e-mail com a mensagem e o link prontos — é só escolher o cliente e enviar. O cliente também vê o botão “Pagar” no portal dele.</div></div>` : ''}
      ${os.cobranca.status !== 'pago' ? `<div style="margin-top:9px"><button type="button" class="btn btn-g" style="padding:8px 12px;font-size:12px" onclick="removerCobranca()">Remover cobrança</button></div>` : ''}
    </div>` : `
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 8px">Se esta coleta for cobrada, informe o valor e gere o link — ele fica anexado à OS e aparece para o cliente no portal (cartão, Apple/Google Pay e boleto). O pagamento marca “PAGO” sozinho e não trava a operação.</div>
    <div class="g2">
      <div><label>Valor (R$)</label><input id="cobValor" inputmode="decimal" placeholder="ex.: 150,00"></div>
      <div><label>Descrição (aparece para o cliente)</label><input id="cobDesc" maxlength="200" placeholder="ex.: Taxa de coleta — itens perigosos"></div>
    </div>
    <div class="g2" style="margin-top:8px">
      <div><label>Boleto: vence em quantos dias? (opcional)</label><input id="cobBoletoDias" inputmode="numeric" maxlength="2" placeholder="vazio = 10 dias"></div>
      <div style="align-self:center;font-size:11px;color:#9aa7a4">Vale para o boleto que o cliente gerar por este link (de 1 a 60 dias). Cartão e Pix não mudam.</div>
    </div>
    <div style="margin-top:10px"><button type="button" class="btn btn-d" onclick="gerarCobranca()">Gerar link de cobrança</button> <span id="mCob" style="font-size:13px;color:#4F6469"></span></div>`}
    <div class="sec">🏛️ MTR — Manifesto de Transporte de Resíduos (SIGOR/CETESB)</div>
    ${os.patrocinadorNome ? `<div style="font-size:12px;color:#3f6b1e;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:8px;padding:8px 11px;margin-bottom:8px">🤝 Coleta patrocinada por <b>${esc(os.patrocinadorNome)}</b>. A MTR sai no nome do <b>gerador do resíduo</b> (o cliente desta OS), não do patrocinador — o patrocinador aparece no relatório do Adote um Bairro.</div>` : ''}
    ${os.mtr && os.mtr.numero ? `
    <div style="border:1px solid #CBE7E3;background:#F0FAF9;border-radius:10px;padding:12px 14px;font-size:13.5px">
      <b>MTR ${esc(os.mtr.numero)}</b> · situação: <b>${esc(os.mtr.situacao || '—')}</b>${os.mtr.cdf ? ` · CDF ${esc(String(os.mtr.cdf))}` : ''}
      <div style="font-size:12.5px;color:#4F6469;margin-top:5px">Gerador: ${esc(os.mtr.gerador || '—')}${os.mtr.geradorCnpj ? ' (' + esc(os.mtr.geradorCnpj) + ')' : ''}${os.mtr.emissao ? ' · emitida em ' + esc(os.mtr.emissao) : ''}</div>
      ${os.mtr.divergenciaGerador ? '<div style="font-size:12px;color:#9B1C1C;font-weight:700;margin-top:5px">⚠️ O CNPJ do gerador da MTR NÃO bate com o cliente desta OS — confira.</div>' : ''}
      <div style="font-size:12px;color:#4F6469;margin-top:5px">${os.mtr.pdfAnexado ? '📎 PDF oficial anexado nos documentos da OS.' : 'PDF não pôde ser baixado do órgão (o número e os dados valem mesmo assim).'}</div>
      <div style="margin-top:9px"><button type="button" class="btn btn-g" style="padding:7px 11px;font-size:12px" onclick="desvincularMtr()">Remover vínculo</button></div>
    </div>` : `
    <div style="font-size:11px;color:#9aa7a4;margin:-4px 0 8px">Se o cliente já emitiu a MTR, informe o número: o sistema puxa os dados oficiais do órgão e anexa o PDF. (Emissão automática quando o cliente não gera vem na próxima etapa.)</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input id="mtrNumero" placeholder="nº da MTR" maxlength="40" style="max-width:220px">
      <button type="button" class="btn btn-d" onclick="vincularMtr()">Puxar MTR do órgão</button>
      <span id="mMtr" style="font-size:13px;color:#4F6469"></span>
    </div>`}
    <div style="display:flex;gap:10px;align-items:center;margin-top:22px">
      <button class="btn btn-p" onclick="salvar()">Salvar alterações</button>
      <a href="/coletas/os?id=${esc(os.id)}" class="btn btn-g" style="text-decoration:none">Cancelar</a>
      <span id="m" style="font-size:13px;color:#4F6469"></span>
    </div>
  </div>
</div>
<script>
function g(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function toggleTransp(){var t=g('quemColeta')==='transportadora';document.getElementById('boxMotorista').style.display=t?'none':'grid';document.getElementById('boxTransp').style.display=t?'block':'none';}
${scriptComoNosAchou(os.comoNosAchou)}
// OS "não informado": as opções ficam fechadas (um toque sem querer no celular não grava origem).
function abrirComo(){document.getElementById('comoFechado').style.display='none';document.getElementById('comoAberto').style.display='block';}
function fecharComo(){escolherComo('',false);comoAviso('');var o=document.getElementById('comoOutro');if(o)o.value='';document.getElementById('comoAberto').style.display='none';document.getElementById('comoFechado').style.display='block';}
function salvar(){var ag=g('agente').split('|');
  var certs=[].slice.call(document.querySelectorAll('.cert:checked')).map(function(c){return c.value;});
  var ehTransp=g('quemColeta')==='transportadora';
  if(comoSel==='outro'&&!/[A-Za-z0-9À-ÿ]/.test(g('comoOutro'))){document.getElementById('m').textContent='Em “Outro”, escreva em poucas palavras como o cliente nos achou.';comoAviso('Em “Outro”, escreva em poucas palavras como o cliente nos achou.');document.getElementById('comoOutro').focus();return;}
  if(ehTransp&&!g('tNome')){document.getElementById('m').textContent='Informe o nome da transportadora.';return;}
  var rec={id:'${esc(os.id)}',endereco:g('endereco'),dataAgendada:g('data'),janela:g('janela'),contato:g('contato'),material:g('material'),quantidade:g('quantidade'),acondicionamento:g('acondicionamento'),obs:g('obs'),obsInterna:g('obsInterna'),itensTexto:g('itens'),veiculoPlaca:ehTransp?'':g('veiculo'),certificados:certs,agenteEmail:ehTransp?'':(ag[0]||''),agenteNome:ehTransp?'':(ag[1]||''),
    transportadora:ehTransp?{nome:g('tNome'),cnpj:g('tCnpj'),placa:g('tPlaca'),motorista:g('tMot'),fone:g('tFone')}:null};
  if(comoSel){rec.comoNosAchou=comoSel;rec.comoNosAchouOutro=comoSel==='outro'?g('comoOutro'):'';}
  if(!rec.endereco){document.getElementById('m').textContent='Informe o endereço da coleta.';return;}
  document.getElementById('m').textContent='Salvando…';
  fetch('/api/coletas/editar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(function(r){return r.json();}).then(function(j){if(j.ok){location.href='/coletas/os?id=${esc(os.id)}';}else{document.getElementById('m').textContent=j.message||j.error||'Erro ao salvar.';}}).catch(function(){document.getElementById('m').textContent='Sem conexão.';});}
function gerarCobranca(){
  var m=document.getElementById('mCob'); m.textContent='Gerando link…';
  fetch('/api/coletas/cobranca',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(os.id)}',valor:g('cobValor'),descricao:g('cobDesc'),boletoDias:g('cobBoletoDias')})})
    .then(function(r){return r.json();}).then(function(j){
      if(j.ok){ m.textContent='✅ Link gerado!'; location.reload(); }
      else if(j.error==='valor_invalido'){ m.textContent='Informe um valor válido (ex.: 150,00).'; }
      else { m.textContent='Não consegui gerar o link agora ('+(j.error||'erro')+').'; }
    }).catch(function(){ m.textContent='Sem conexão.'; });
}
function removerCobranca(){
  if(!confirm('Remover a cobrança desta coleta?')) return;
  fetch('/api/coletas/cobranca-remover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(os.id)}'})})
    .then(function(r){return r.json();}).then(function(j){ if(j.ok){ location.reload(); } else { alert(j.error==='ja_paga'?'Essa cobrança já foi paga — não dá para remover.':'Não consegui remover agora.'); } })
    .catch(function(){ alert('Sem conexão.'); });
}
function vincularMtr(){
  var num=(document.getElementById('mtrNumero')||{}).value||'';
  var m=document.getElementById('mMtr');
  if(!num.trim()){ if(m) m.textContent='Informe o número da MTR.'; return; }
  if(m) m.textContent='Puxando do órgão…';
  fetch('/api/mtr/vincular',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({osId:'${esc(os.id)}',numero:num})})
    .then(function(r){return r.json();}).then(function(j){
      if(j.ok){ location.reload(); }
      else if(m){ m.textContent=j.message||'Não consegui puxar essa MTR.'; }
    }).catch(function(){ if(m) m.textContent='Sem conexão.'; });
}
function desvincularMtr(){
  if(!confirm('Remover o vínculo da MTR com esta coleta?')) return;
  fetch('/api/mtr/desvincular',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({osId:'${esc(os.id)}'})})
    .then(function(r){return r.json();}).then(function(j){ if(j.ok){ location.reload(); } else { alert('Não consegui remover agora.'); } })
    .catch(function(){ alert('Sem conexão.'); });
}
</script></body></html>`;
}

// ---------------------------------------------------------------------------
// Documentos que acompanham a OS na coleta: Carta de Descarte e Manifesto de Carga.
// Gerados AUTOMATICAMENTE a partir da OS (a Débora não redigita nada), padronizados,
// com QR de autenticidade. O texto jurídico da declaração é mantido LITERAL.
// ---------------------------------------------------------------------------
const EMPRESA = {
  razao: 'ASSOCIAÇÃO AUXÍLIO À RECICLAGEM DE ELETRÔNICOS E INCLUSÃO DIGITAL — ECOBRAZ',
  cnpj: '14.197.457/0001-42',
  lo: '30011495',
  endereco: 'Rua Dona Maria Quedas, 230 — Jardim Andaraí — 02175-010 — São Paulo/SP',
  fone: '(11) 4329-2001',
  email: 'contato@ecobraz.org.br',
};
// Declaração LITERAL do modelo (não alterar — texto jurídico).
const DECLARACAO_CARTA = 'A Ecobraz declara que está dispensada de emissão de nota fiscal de circulação de mercadorias, tendo em vista o que dispõe o ART. 19 do decreto Nº 45.490 de 30/11/2000 na resposta consulta 499/87 e no ART. 1 da lei complementar Nº 116/03 e suas alterações. Mediante o exposto, emite esta declaração para fins de circulação das mercadorias abaixo relacionadas.';

const tdDoc = 'padding:9px 10px;border:1px solid #E4EBE9';
function tabelaItens(os) {
  const itens = (os.itens && os.itens.length) ? os.itens : [{ nome: os.material || 'Sucata Eletrônica — Diversa', qtd: os.quantidade || '1,000' }];
  const total = itens.reduce((s, it) => s + (Number(it.valor) || 0), 0);
  const linhas = itens.map((it, i) => `<tr><td style="${tdDoc}">${i + 1}</td><td style="${tdDoc}">${esc(it.nome)}</td><td style="${tdDoc};text-align:right">${esc(it.qtd)}</td><td style="${tdDoc};text-align:right">${Number(it.valor) > 0 ? 'R$ ' + brl(it.valor) : '—'}</td></tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px">
    <thead><tr style="background:#F2F6F4;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#5c6f6b">
      <th style="${tdDoc};text-align:left;width:40px">Item</th><th style="${tdDoc};text-align:left">Nome</th>
      <th style="${tdDoc};text-align:right">Quantidade</th><th style="${tdDoc};text-align:right">Valor (R$)</th>
    </tr></thead>
    <tbody>
      ${linhas}
      <tr><td colspan="3" style="${tdDoc};text-align:right;font-weight:800">Total</td><td style="${tdDoc};text-align:right;font-weight:800">R$ ${brl(total)}</td></tr>
    </tbody></table>`;
}
const eyebrowDoc = (t) => `<div style="display:flex;align-items:center;gap:9px;margin:22px 0 8px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">${esc(t)}</span></div>`;
const campoDoc = (rot, val, span) => `<div style="${span ? 'grid-column:1/-1;' : ''}"><div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#93a6a2">${esc(rot)}</div><div style="font-size:13px;font-weight:600;color:#10262B;margin-top:2px;line-height:1.5">${esc(val || '—')}</div></div>`;
function blocoGerador(os) {
  return `${eyebrowDoc('Gerador')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px 26px">
    ${campoDoc('Razão social / Nome', os.clienteNome, true)}
    ${campoDoc('CNPJ / CPF', os.clienteDoc)}${campoDoc('Data da coleta', dataBR(os.dataAgendada))}
    ${campoDoc('Endereço', os.endereco, true)}</div>`;
}
function blocoPatrocinioDoc(os) {
  return `<div style="margin-top:18px;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:10px;padding:12px 14px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#3f6b1e">Coleta patrocinada · Adote um Bairro</div>
    <div style="font-size:11.5px;color:#28413f;margin-top:5px;line-height:1.5">Coleta financiada por <b>${esc(os.patrocinadorNome)}</b>. O cliente autoriza o compartilhamento das informações desta coleta com o patrocinador, para fins de comprovação e relatório socioambiental (LGPD, Lei nº 13.709/2018).</div></div>`;
}
// Cada assinatura recebe um QR de autenticidade (identifica o papel e valida o
// documento contra a OS no site da Ecobraz). Substitui a linha de assinatura manual.
const assinaturasDoc = (os, papeis) => `<div style="display:flex;gap:20px;margin-top:30px;text-align:center;flex-wrap:wrap">${papeis.map((p) => `<div style="flex:1;min-width:150px">
    <img src="/qr-os?id=${esc(os.id)}&p=${encodeURIComponent(p.slug)}" alt="QR ${esc(p.label)}" style="width:78px;height:78px;border:1px solid #E4EBE9;border-radius:8px;background:#fff">
    <div style="border-top:1px solid #10262B;margin-top:8px;padding-top:6px;font-size:10.5px;font-weight:800;letter-spacing:.03em;color:#4F6469">${esc(p.label)}</div>
    <div style="font-size:8.5px;color:#9aa7a4;margin-top:2px;text-transform:uppercase;letter-spacing:.05em">Verificar autenticidade</div>
  </div>`).join('')}</div>`;

// Nome sugerido do arquivo ao "Salvar como PDF": o navegador usa o <title> da
// página. A Débora precisa que o arquivo saia com o nome do CLIENTE (e não
// "Ecobraz") para localizar fácil na pasta de Downloads. Formato: Cliente - Documento - Nº.
function tituloDoc(os, rotulo) {
  const cli = String(os.clienteNome || '').replace(/\s+/g, ' ').trim();
  return [cli, rotulo, os.numero].filter(Boolean).join(' - ');
}

function docHTML(titulo, os, seloUrl, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(tituloDoc(os, titulo))}</title>
<style>@page{size:A4;margin:11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.noprint{display:none!important}html,body{background:#fff!important;margin:0!important}.doc-wrap{max-width:100%!important;margin:0!important;padding:0!important}.doc-card{border:none!important;border-radius:0!important;box-shadow:none!important}table,tr,img{page-break-inside:avoid}}</style></head>
<body style="margin:0;background:#EDF1EF;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div class="doc-wrap" style="max-width:820px;margin:0 auto;padding:18px">
  <div class="noprint" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <a href="/coletas/os?id=${esc(os.id)}" style="color:#4F6469;font-size:13px;font-weight:800;text-decoration:none">← Voltar</a>
    <button onclick="window.print()" style="background:#00333B;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:800">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div class="doc-card" style="background:#fff;border:1px solid #E1E8E5;border-radius:14px;overflow:hidden">
    <div style="background:#00333B;padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><div style="font-size:27px;font-weight:800;color:#fff">ecobraz<span style="color:#92C430">.</span></div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#92C430;margin-top:7px">${esc(titulo)}</div></div>
      <div style="text-align:right"><div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7fa6a3">Ordem de Serviço</div><div style="font-size:21px;font-weight:800;color:#fff">${esc(os.numero)}</div><div style="font-size:11.5px;color:#cfe3e0;margin-top:7px">Emissão: <b style="color:#fff">${esc(dataBR(os.criadoEm) || '—')}</b></div></div>
    </div>
    <div style="background:#F2F6F4;border-bottom:1px solid #E4EBE9;padding:11px 28px;font-size:11px;color:#4F6469;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <span><b style="color:#10262B">${esc(EMPRESA.razao)}</b></span><span>CNPJ ${esc(EMPRESA.cnpj)} · LO ${esc(EMPRESA.lo)}</span>
    </div>
    <div style="padding:20px 28px 22px">${corpo}</div>
    <div style="padding:0 28px 22px">
      <div style="font-size:11px;color:#4F6469;text-align:center;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:10px;padding:11px 14px;line-height:1.55">🔒 Cada assinatura acima traz um <b>QR de autenticidade</b>. Aponte a câmera para conferir, no site da Ecobraz, que este documento é autêntico e vinculado à OS <b>${esc(os.numero)}</b>.</div>
    </div>
    <div style="background:#00333B;padding:13px 28px;font-size:10px;color:#9FC6C1;line-height:1.7">
      ${esc(EMPRESA.endereco)} · ${esc(EMPRESA.fone)} · ${esc(EMPRESA.email)}. Documento emitido eletronicamente e verificável pelo QR.
    </div>
  </div>
</div></body></html>`;
}

// Aviso: antes de "Em transporte", o documento é rascunho e NÃO deve ser
// liberado ao cliente (regra definida com o Marcio/Débora).
const avisoRascunho = (os) => (!os.status || os.status === 'agendada') ? `<div style="background:#FFF4DE;border:1px solid #f0dca6;border-radius:10px;padding:11px 14px;margin-bottom:10px;font-size:12px;color:#7a5a12;line-height:1.5"><b>⚠ Rascunho — não liberar ao cliente.</b> Este documento só deve ser entregue ao cliente quando a coleta estiver <b>“Em transporte”</b>.</div>` : '';

export function paginaCartaDescarte(os, seloUrl, registro, fotoUrl, assinaturaUrl) {
  const tp = os.transportadora;
  const veic = tp
    ? `Transportadora: ${esc(tp.nome)}${tp.cnpj ? ` (CNPJ ${esc(tp.cnpj)})` : ''}   ·   Placa: ${esc(tp.placa || os.veiculoPlaca || '________________')}   ·   Motorista: ${esc(tp.motorista || '________________')}`
    : `Placa: ${esc(os.veiculoPlaca || '________________')}   ·   Motorista: ${esc(os.agenteNome || '________________')}`;
  const r = registro || {};
  // Hora no fuso de Brasília (UTC-3, sem horário de verão).
  const hhd = (x) => { const d = new Date(x); if (!x || isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
  const evidencias = (r.checkin || r.foto || r.encerramento || r.assinatura) ? `${eyebrowDoc('Evidências da coleta')}
    <div style="font-size:12.5px;color:#28413f;line-height:1.7">
      ${r.encerramento ? `<div><b>Coleta realizada por:</b> ${esc(r.encerramento.agenteNome || os.agenteNome || '—')}${r.encerramento.em ? ` — ${hhd(r.encerramento.em)} de ${esc(dataBR(r.encerramento.em))}` : ''}</div>` : ''}
      ${r.encerramento && r.encerramento.volumes ? `<div><b>Volume/quantidade coletada:</b> ${esc(r.encerramento.volumes)}</div>` : ''}
      ${r.checkin && r.checkin.lat != null ? `<div><b>Confirmação de presença (GPS):</b> ${Number(r.checkin.lat).toFixed(5)}, ${Number(r.checkin.lon).toFixed(5)}${r.checkin.em ? ` às ${hhd(r.checkin.em)}` : ''}</div>` : ''}
    </div>
    ${r.foto && fotoUrl ? `<div style="margin-top:10px"><img src="${esc(fotoUrl)}" alt="Foto do material coletado" style="width:100%;max-width:360px;border-radius:8px;border:1px solid #E4EBE9"><div style="font-size:10.5px;color:#93a6a2;margin-top:4px">Foto do material registrada no momento da coleta.</div></div>` : ''}
    ${r.assinatura ? `<div style="margin-top:10px;font-size:12.5px;color:#28413f"><b>Assinatura do cliente:</b> ${esc(r.assinatura.nome || '—')}${r.assinatura.doc ? ` — RG/CPF ${esc(r.assinatura.doc)}` : ''}${r.assinatura.em ? ` · ${hhd(r.assinatura.em)} de ${esc(dataBR(r.assinatura.em))}` : ''}</div>` : ''}
    ${r.assinatura && assinaturaUrl ? `<div style="margin-top:6px"><img src="${esc(assinaturaUrl)}" alt="Assinatura do cliente" style="width:100%;max-width:320px;border:1px solid #E4EBE9;border-radius:8px;background:#fff"><div style="font-size:10.5px;color:#93a6a2;margin-top:4px">Assinatura colhida no momento da coleta.</div></div>` : ''}` : '';
  const corpo = `${avisoRascunho(os)}${blocoGerador(os)}
    <div style="margin-top:16px;font-size:12.5px;color:#28413f;line-height:1.55"><b>Recebido por:</b> ${esc(EMPRESA.razao)}, inscrita no CNPJ ${esc(EMPRESA.cnpj)}, LO ${esc(EMPRESA.lo)}, com sede na Rua Dona Maria Quedas, 230.</div>
    <div style="margin-top:10px;font-size:12.5px;color:#28413f"><b>Dados do veículo:</b> ${veic}</div>
    ${eyebrowDoc('Declaração')}
    <div style="font-size:12px;color:#4F6469;line-height:1.65;text-align:justify;background:#FBFDFC;border:1px solid #EEF1F0;border-radius:10px;padding:12px 14px">${esc(DECLARACAO_CARTA)}</div>
    ${eyebrowDoc('Mercadorias')}${tabelaItens(os)}
    ${evidencias}
    ${os.patrocinadorNome ? blocoPatrocinioDoc(os) : ''}
    ${assinaturasDoc(os, [{ label: 'Doador', slug: 'doador' }, { label: 'Coletor', slug: 'coletor' }, { label: 'Responsável Comercial', slug: 'resp-comercial' }])}`;
  return docHTML('Carta de Descarte', os, seloUrl, corpo);
}

export function paginaManifestoCarga(os, seloUrl) {
  const parte = (rot) => `<div style="flex:1;min-width:230px"><div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#93a6a2;margin-bottom:4px">${esc(rot)}</div><div style="font-size:12px;color:#28413f;line-height:1.5"><b>${esc(EMPRESA.razao)}</b><br>CNPJ ${esc(EMPRESA.cnpj)} · ${esc(EMPRESA.fone)}<br>${esc(EMPRESA.endereco)}</div></div>`;
  // Com TRANSPORTADORA terceirizada, o Transportador do Manifesto é ELA (não a Ecobraz).
  const tp = os.transportadora;
  const parteTransp = tp
    ? `<div style="flex:1;min-width:230px"><div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#93a6a2;margin-bottom:4px">Transportador</div><div style="font-size:12px;color:#28413f;line-height:1.5"><b>${esc(tp.nome)}</b>${tp.cnpj ? `<br>CNPJ ${esc(tp.cnpj)}` : ''}${tp.fone ? ` · ${esc(tp.fone)}` : ''}${tp.motorista ? `<br>Motorista: ${esc(tp.motorista)}` : ''}</div></div>`
    : parte('Transportador');
  const corpo = `${avisoRascunho(os)}${blocoGerador(os)}
    ${eyebrowDoc('Descrição do material')}${tabelaItens(os)}
    ${eyebrowDoc('Transporte')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px 26px">${campoDoc('Veículo (placa)', tp ? (tp.placa || os.veiculoPlaca) : os.veiculoPlaca)}${campoDoc('Motorista', tp ? tp.motorista : os.agenteNome)}</div>
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:18px">${parteTransp}${parte('Receptor')}</div>
    ${os.patrocinadorNome ? blocoPatrocinioDoc(os) : ''}
    ${assinaturasDoc(os, [{ label: 'Gerador', slug: 'gerador' }, { label: 'Transportador', slug: 'transportador' }, { label: 'Receptor', slug: 'receptor' }])}`;
  return docHTML('Manifesto de Carga', os, seloUrl, corpo);
}

// QR público da OS (aponta para /validar-os).
export async function qrOS(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!id) return new Response('faltou id', { status: 400 });
  const papel = (url.searchParams.get('p') || '').replace(/[^a-z-]/g, '').slice(0, 20);
  const code = await seloOS(id, env);
  const alvo = `${origemPortal(env, url)}/validar-os?id=${encodeURIComponent(id)}&c=${code}${papel ? `&p=${encodeURIComponent(papel)}` : ''}`;
  if ((url.searchParams.get('fmt') || '') === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=3600' } });
}

// Validação pública da Ordem de Coleta.
export async function validarOSPublico(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const PAPEIS = { doador: 'Doador', coletor: 'Coletor', 'resp-comercial': 'Responsável Comercial', gerador: 'Gerador', transportador: 'Transportador', receptor: 'Receptor' };
  const papel = PAPEIS[(url.searchParams.get('p') || '').replace(/[^a-z-]/g, '').slice(0, 20)] || '';
  const esperado = id ? await seloOS(id, env) : '';
  const ok = !!(id && c && esperado && c === esperado);
  let os = null; if (ok) os = await lerColetaOS(env, id);
  const valido = ok && os;
  const cor = valido ? '#1E7A3D' : '#B23A2E';
  const linhas = valido ? `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Ordem de Coleta</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800">${esc(os.numero)}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Cliente</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(os.clienteNome || '—')}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Situação</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(rotuloStatus(os.status, os.dataAgendada))}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Data</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(dataBR(os.dataAgendada) || dataBR(os.criadoEm))}</td></tr>
      ${papel ? `<tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Assinatura verificada</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(papel)}</td></tr>` : ''}
    </table>` : '';
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;display:flex;align-items:center;justify-content:center">
<div style="max-width:440px;margin:0 auto;padding:28px 22px;width:100%;box-sizing:border-box">
  <div style="background:#fff;border-radius:18px;padding:28px 24px;border:1px solid #E4EBE9">
    <div style="text-align:center"><span style="font-size:22px;font-weight:800;color:#00333B">ecobraz</span></div>
    <div style="text-align:center;margin-top:18px"><div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:${valido ? '#E4F3E6' : '#FBE9E7'};line-height:56px;font-size:28px">${valido ? '✓' : '✕'}</div></div>
    <h1 style="margin:14px 0 6px;text-align:center;font-size:19px;color:${cor}">${valido ? 'Ordem de Coleta autêntica' : 'Documento não confere'}</h1>
    <p style="margin:0;text-align:center;font-size:13px;color:#6B7B78;line-height:1.6">${valido ? 'Emitida pela Ecobraz.' : 'Código inválido ou adulterado.'}</p>
    ${linhas}
    <div style="margin-top:22px;font-size:11px;color:#9aa7a4;text-align:center;line-height:1.6">A destinação final é comprovada pelo Certificado de Destinação Final (CDF), emitido ao término do processamento.</div>
  </div>
</div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// Comprovante/Ordem de Coleta imprimível (documento com a cara da Ecobraz + QR).
export function paginaComprovanteOS(os, seloUrl) {
  const passos = ['Coleta', 'MTR', 'Pesagem', 'Triagem', 'Processamento', 'Destinação', 'CDF'];
  const stepper = passos.map((p, i) => `<span style="display:inline-flex;align-items:center"><span style="background:${i === 0 ? '#92C430' : '#E7EDEA'};color:${i === 0 ? '#10262B' : '#7c8a87'};font-size:10.5px;font-weight:800;padding:5px 11px;border-radius:20px">${p}</span>${i < passos.length - 1 ? '<span style="color:#c2cdc9;margin:0 3px;font-weight:800">›</span>' : ''}</span>`).join('');
  const f = (l, v, span, pre) => `<div style="${span ? 'grid-column:1/-1;' : ''}"><div style="font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#93a6a2">${esc(l)}</div><div style="font-size:13px;color:#10262B;font-weight:600;margin-top:3px;line-height:1.5;${pre ? 'white-space:pre-wrap;word-break:break-word;' : ''}">${esc(v || '—')}</div></div>`;
  // Tabela de equipamentos item a item (pedido da Débora, 2026-07-28: "igual tem
  // na carta de descarte e na MTR" — dá noção de volume no próprio documento).
  const tdOS = 'padding:7px 10px;border:1px solid #E4EBE9;font-size:12px;color:#10262B';
  const cartaTemValor = (os.itens || []).some((it) => Number(it.valor) > 0);
  const cartaTotal = (os.itens || []).reduce((s, it) => s + (Number(it.valor) || 0), 0);
  const equipsHTML = (os.itens && os.itens.length) ? `<div style="margin-top:16px">
      <div style="font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#93a6a2;margin-bottom:6px">Equipamentos — item a item</div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${tdOS};background:#F2F6F4;text-align:left;width:34px;font-size:10px;text-transform:uppercase;color:#5B6570">#</th>
          <th style="${tdOS};background:#F2F6F4;text-align:left;font-size:10px;text-transform:uppercase;color:#5B6570">Equipamento / material</th>
          <th style="${tdOS};background:#F2F6F4;text-align:right;width:90px;font-size:10px;text-transform:uppercase;color:#5B6570">Qtde</th>
          ${cartaTemValor ? `<th style="${tdOS};background:#F2F6F4;text-align:right;width:110px;font-size:10px;text-transform:uppercase;color:#5B6570">Valor (R$)</th>` : ''}
        </tr></thead>
        <tbody>${os.itens.map((it, i) => `<tr><td style="${tdOS}">${i + 1}</td><td style="${tdOS};font-weight:600">${esc(it.nome)}</td><td style="${tdOS};text-align:right;font-weight:700">${esc(it.qtd)}</td>${cartaTemValor ? `<td style="${tdOS};text-align:right;font-weight:700">${Number(it.valor) > 0 ? 'R$ ' + brl(it.valor) : '—'}</td>` : ''}</tr>`).join('')}${cartaTemValor ? `<tr><td style="${tdOS};text-align:right;font-weight:800" colspan="3">Total</td><td style="${tdOS};text-align:right;font-weight:800">R$ ${brl(cartaTotal)}</td></tr>` : ''}</tbody>
      </table></div>` : '';
  // Anexos NÃO-imagem (planilha do cliente, PDF etc.) — exigência de clientes
  // corporativos: o arquivo precisa constar NO documento da OS, não só na edição.
  const arquivosDoc = (Array.isArray(os.anexos) ? os.anexos : []).filter((a) => !/image/.test(a.content_type || ''));
  const anexosDocHTML = arquivosDoc.length ? `<div style="margin-top:22px"><div style="display:flex;align-items:center;gap:9px;margin:0 0 12px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">Anexos da coleta</span></div>
      ${arquivosDoc.map((a) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #E4EBE9;border-radius:10px;padding:9px 13px;margin-bottom:7px;background:#FBFDFC">
        <a href="/coletas/anexo?key=${encodeURIComponent(a.key)}" target="_blank" rel="noopener" style="text-decoration:none;color:#10262B;font-weight:600;font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 ${esc(a.nome || 'arquivo')}</a>
        <span style="flex:none;font-size:11px;color:#8fa39f">${a.tamanho ? Math.max(1, Math.round(a.tamanho / 1024)) + ' KB · ' : ''}parte integrante desta OS</span>
      </div>`).join('')}</div>` : '';
  const fotos = (Array.isArray(os.anexos) ? os.anexos : []).filter((a) => /image/.test(a.content_type || ''));
  const fotosHTML = fotos.length ? `<div style="margin-top:22px"><div style="display:flex;align-items:center;gap:9px;margin:0 0 12px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">Registro fotográfico</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:10px">${fotos.map((a) => `<img src="/coletas/anexo?key=${encodeURIComponent(a.key)}" alt="${esc(a.nome || 'foto')}" style="width:160px;height:120px;object-fit:cover;border:1px solid #E4EBE9;border-radius:8px;background:#fff">`).join('')}</div></div>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(tituloDoc(os, 'Ordem de Coleta'))}</title>
<style>@page{size:A4;margin:11mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.noprint{display:none!important}html,body{background:#fff!important;margin:0!important}.doc-wrap{max-width:100%!important;margin:0!important;padding:0!important}.doc-card{border:none!important;border-radius:0!important;box-shadow:none!important}table,tr,img{page-break-inside:avoid}}</style></head>
<body style="margin:0;background:#EDF1EF;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div class="doc-wrap" style="max-width:820px;margin:0 auto;padding:18px">
  <div class="noprint" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <a href="/coletas/os?id=${esc(os.id)}" style="color:#4F6469;font-size:13px;font-weight:800;text-decoration:none">← Voltar</a>
    <button onclick="window.print()" style="background:#00333B;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:800">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div class="doc-card" style="background:#fff;border:1px solid #E1E8E5;border-radius:14px;overflow:hidden">
    <div style="background:#00333B;padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start">
      <div><div style="font-size:27px;font-weight:800;color:#fff">ecobraz<span style="color:#92C430">.</span></div><div style="font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#92C430;margin-top:7px">Ordem de Coleta</div></div>
      <div style="text-align:right"><div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7fa6a3">Nº da OS</div><div style="font-size:21px;font-weight:800;color:#fff">${esc(os.numero)}</div><div style="font-size:11.5px;color:#cfe3e0;margin-top:7px">Emissão: <b style="color:#fff">${esc(dataBR(os.criadoEm))}</b></div></div>
    </div>
    <div style="background:#F2F6F4;border-bottom:1px solid #E4EBE9;padding:11px 28px;font-size:11px;color:#4F6469;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <span><b style="color:#10262B">${esc(EMPRESA.razao)}</b></span>
      <span>CNPJ ${esc(EMPRESA.cnpj)} · LO ${esc(EMPRESA.lo)}</span>
    </div>
    <div style="padding:12px 28px;border-bottom:1px solid #EEF1F0;background:#FBFDFC">
      <div style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#93a6a2;margin-bottom:8px">Cadeia de custódia rastreável</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px 0;align-items:center">${stepper}</div>
    </div>
    <div style="padding:6px 28px 26px">
      <div style="display:flex;align-items:center;gap:9px;margin:20px 0 12px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">Gerador / Cliente</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px 26px">
        ${f('Cliente', os.clienteNome)}${f('Documento', os.clienteDoc)}
        ${f('Endereço da coleta', os.endereco, true)}
        ${f('Contato no local', os.contato)}${os.transportadora ? f('Transportadora', os.transportadora.nome + (os.transportadora.cnpj ? ' · CNPJ ' + os.transportadora.cnpj : '') + (os.transportadora.motorista ? ' · ' + os.transportadora.motorista : '')) : f('Motorista', os.agenteNome)}
      </div>
      <div style="display:flex;align-items:center;gap:9px;margin:22px 0 12px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">Coleta</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px 26px">
        ${f('Data da coleta', [dataBR(os.dataAgendada), os.janela].filter(Boolean).join(' · '))}${f('Quantidade estimada', os.quantidade)}
        ${f('Material declarado', os.material, true)}
        ${f('Acondicionamento', os.acondicionamento)}${f('Situação', rotuloStatus(os.status, os.dataAgendada))}
        ${os.obs ? f('Observações', os.obs, true, true) : ''}
        ${(os.certificados && os.certificados.length) ? f('Certificados solicitados', os.certificados.join(' · '), true) : ''}
      </div>
      ${equipsHTML}
      ${anexosDocHTML}
      ${os.patrocinadorNome ? `<div style="margin-top:22px;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:12px;padding:16px 18px">
        <div style="font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#3f6b1e">🤝 Coleta patrocinada · Adote um Bairro</div>
        <div style="font-size:13px;color:#28413f;margin-top:6px;line-height:1.55">Esta coleta é <b>financiada por ${esc(os.patrocinadorNome)}</b>. Ao receber este documento, o cliente <b>autoriza o compartilhamento das informações desta coleta</b> (materiais, peso e comprovantes de destinação) com o patrocinador, para fins de comprovação e relatório socioambiental — nos termos da LGPD (Lei 13.709/2018).</div>
      </div>` : ''}
      ${fotosHTML}
      <div style="display:flex;gap:18px;align-items:center;margin-top:22px;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:12px;padding:16px 18px">
        <img src="${esc(seloUrl)}" alt="QR" style="width:100px;height:100px;flex:none;border:1px solid #E4EBE9;border-radius:8px;background:#fff">
        <div><div style="font-size:13px;font-weight:800;color:#00333B">Rastreabilidade &amp; autenticidade</div>
          <div style="font-size:11.5px;color:#4F6469;line-height:1.6;margin-top:4px">Acompanhe a coleta da origem à destinação final e confira a autenticidade deste documento.</div></div>
      </div>
      <div style="margin-top:18px;border-top:1px dashed #E1E8E5;padding-top:12px;font-size:11px;color:#4F6469"><b style="color:#10262B">Aceite eletrônico:</b> registrado no sistema no momento da coleta (motorista) e do recebimento (Ecobraz), com data/hora e verificação por QR.</div>
    </div>
    <div style="background:#00333B;padding:13px 28px;font-size:10px;color:#9FC6C1;line-height:1.7">
      <b style="color:#cfe3e0">Base legal:</b> Lei nº 12.305/2010 (PNRS) · Decreto nº 10.240/2020 (logística reversa de eletroeletrônicos) · classificação conforme ABNT NBR 10004:2004 · transporte manifestado (MTR/SINIR e SIGOR-CETESB) · destinação comprovada por CDF. <b style="color:#cfe3e0">Emitente:</b> ${esc(EMPRESA.endereco)} · ${esc(EMPRESA.fone)} · ${esc(EMPRESA.email)}. Documento emitido eletronicamente e verificável pelo QR.
    </div>
  </div>
</div></body></html>`;
}
