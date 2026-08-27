// Campanhas de WhatsApp da DIRETORIA (pedido do Marcio, 12/08): divulgar novidades
// e oferecer coleta para a base de clientes — SEMPRE pelo canal oficial (Gupshup /
// WhatsApp Business API) e SEMPRE por template aprovado pela Meta. Texto livre em
// massa não existe no WhatsApp oficial — e caminhos não-oficiais derrubam o número.
//
// Guarda-corpos deste módulo:
//  - só templates APROVADOS (a tela lista direto do Gupshup);
//  - lista de supressão (opt-out): quem pediu para sair nunca mais entra em campanha;
//  - deduplicação por telefone + limite de 500 destinatários por campanha;
//  - envio em lotes pequenos com registro individual (enviado/falha + motivo);
//  - envio de TESTE para um número antes do disparo real.
// Armazenamento em D1 (consistência forte, uma linha por destinatário).

import { enviarWhatsAppInfo, telWhatsApp } from './whatsapp.js';
import { listarColetasOS } from './coletas.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// Linha FIXA brasileira (55 + DDD + 8 dígitos começando em 2–5) quase nunca tem
// WhatsApp — cadastro antigo costuma guardar o número do PABX da empresa.
// Celular tem 9 dígitos começando em 9. É "provável": serve para avisar e para
// preferir o celular, nunca para barrar sozinho.
export function ehFixoBR(tel) {
  const m = String(tel || '').match(/^55\d{2}(\d{8,9})$/);
  return !!m && m[1].length === 8 && /^[2-5]/.test(m[1]);
}

let migrouWa = false;
async function db(env) {
  if (!env.DB_PLOOMES) return null;
  try {
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_campanhas (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT, template_nome TEXT, template_id TEXT, template_lang TEXT, params_json TEXT, publico TEXT, criado_por TEXT, criado_em TEXT, status TEXT, total INTEGER DEFAULT 0, enviados INTEGER DEFAULT 0, falhas INTEGER DEFAULT 0)').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_destinatarios (id INTEGER PRIMARY KEY AUTOINCREMENT, campanha_id INTEGER, tel TEXT, nome TEXT, doc TEXT, status TEXT, detalhe TEXT, em TEXT, msg_id TEXT DEFAULT \'\', entrega TEXT DEFAULT \'\', respondeu INTEGER DEFAULT 0)').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_optout (tel TEXT PRIMARY KEY, motivo TEXT, em TEXT)').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_excluidos (doc TEXT PRIMARY KEY, nome TEXT, por TEXT, em TEXT)').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_tel_invalido (tel TEXT PRIMARY KEY, motivo TEXT, em TEXT)').run();
  } catch { return null; }
  // Medição (13/08): colunas novas nas tabelas que já existem em produção.
  if (!migrouWa) {
    for (const sql of [
      'ALTER TABLE wa_destinatarios ADD COLUMN msg_id TEXT DEFAULT \'\'',
      'ALTER TABLE wa_destinatarios ADD COLUMN entrega TEXT DEFAULT \'\'',
      'ALTER TABLE wa_destinatarios ADD COLUMN respondeu INTEGER DEFAULT 0',
    ]) {
      try { await env.DB_PLOOMES.prepare(sql).run(); } catch { /* coluna já existe */ }
    }
    migrouWa = true;
  }
  return env.DB_PLOOMES;
}

export const TOP_N = 450;
export const MESES_REATIVACAO = 12;
export const PUBLICOS_WA = {
  'teste': 'Teste — só o número que você digitar',
  'top-450': `Top ${TOP_N} — empresas mais relevantes (negócios concluídos + coletas recentes)`,
  'top-500-novos': 'Top 500 INÉDITOS — os próximos 500 mais relevantes que NUNCA receberam campanha',
  'frios-500': 'BASE FRIA — 500 mais contatáveis que nunca receberam (sem histórico; celular primeiro)',
  'melhores-1000': 'MELHORES 1000 — quem mais descarta primeiro (inéditos com histórico), completando com a base fria mais contatável',
  'reativacao-200': `Top 200 para REATIVAR — já descartaram com a Ecobraz, mas estão paradas há ${MESES_REATIVACAO}+ meses`,
  'clientes-os': 'Clientes que já têm OS no sistema (com telefone)',
  'sem-coleta-6m': 'Clientes com OS, mas SEM coleta nos últimos 6 meses (oferecer coleta)',
  'base-pj': 'Base de empresas (PJ) com telefone — os primeiros 500 em ordem alfabética',
};
const LIMITE_CAMPANHA = 500;

// Empresas REMOVIDAS das campanhas pela Diretoria (ex.: "tire a PHX da lista").
// Por CNPJ — some de todos os públicos até ser reincluída; a vaga no Top é
// preenchida automaticamente pela próxima da fila.
export async function mudarExclusaoEmpresaWA(env, doc, nome, acao, por) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const dd = String(doc || '').replace(/\D/g, '');
  if (!dd) return { ok: false, message: 'Documento inválido.' };
  if (acao === 'del') { await d.prepare('DELETE FROM wa_excluidos WHERE doc=?1').bind(dd).run(); return { ok: true }; }
  try { await d.prepare('INSERT INTO wa_excluidos (doc, nome, por, em) VALUES (?1,?2,?3,?4)').bind(dd, limpar(nome).slice(0, 160), String(por || '').slice(0, 160), new Date().toISOString()).run(); } catch { /* já existe */ }
  return { ok: true };
}
export async function listarExcluidasWA(env) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT doc, nome, por, em FROM wa_excluidos ORDER BY em DESC LIMIT 200').all(); return r.results || []; } catch { return []; }
}
async function docsExcluidos(env) {
  return new Set((await listarExcluidasWA(env)).map((x) => String(x.doc || '').replace(/\D/g, '')));
}

// TOP N (pedido do Marcio 13/08; N=450 desde 13/08): as empresas mais relevantes,
// por CRITÉRIO ABERTO (mostrado na lista): negócios CONCLUÍDOS no histórico (peso
// 3), volume total de negócios (até 20), OS no sistema novo (peso 5 — relação
// ativa) e atividade recente (+10 em 12 meses, +5 em 24). Desempate por valor.
// SEM REPETIÇÃO ENTRE LISTAS (regra do Marcio 17/08): empresa parada pertence à
// lista de REATIVAÇÃO — e por isso sai do Top. A próxima da fila entra no lugar.
export async function publicoTop200(env, n = TOP_N) {
  let docsReativacao = new Set();
  try { docsReativacao = new Set((await publicoReativacao(env, 200)).map((c) => c.doc).filter(Boolean)); } catch { docsReativacao = new Set(); }
  return publicoTopBruto(env, n, docsReativacao);
}

// TOP 500 INÉDITOS (pedido do Marcio 18/08): os PRÓXIMOS mais relevantes que
// NUNCA receberam campanha — regra rígida: qualquer tentativa anterior conta
// como "já enviado" (mesmo as que falharam; número morto já sai sozinho pela
// wa_tel_invalido, então esta lista nasce limpa). Mesma pontuação aberta do Top.
export async function publicoTopNovos(env, n = 500) {
  let docsReativacao = new Set();
  try { docsReativacao = new Set((await publicoReativacao(env, 200)).map((c) => c.doc).filter(Boolean)); } catch { docsReativacao = new Set(); }
  let jaTentados = new Set();
  try {
    const d = await db(env);
    if (d) { const r = await d.prepare('SELECT DISTINCT tel FROM wa_destinatarios').all(); jaTentados = new Set((r.results || []).map((x) => x.tel)); }
  } catch { jaTentados = new Set(); }
  const bruto = await publicoTopBruto(env, Math.max(n * 4, 2000), docsReativacao, 3000);
  return bruto.filter((c) => !jaTentados.has(c.tel)).slice(0, n)
    .map((c) => ({ ...c, motivo: `${c.motivo ? c.motivo + ' · ' : ''}inédito — nunca recebeu campanha` }));
}
// BASE FRIA (pedido do Marcio 18/08, quando os inéditos COM histórico acabaram):
// os contatos PJ que nunca receberam campanha, ranqueados pela CONTATABILIDADE
// (critério aberto): celular vale 10 (fixo quase não tem WhatsApp), ter e-mail
// vale 3. Mesmo CNPJ com fixo e celular fica com o celular. Sem histórico de
// negócio não há pontuação de relacionamento — e a lista diz isso com clareza.
export async function publicoBaseFria(env, n = 500) {
  const d = await db(env); if (!d) return [];
  let jaTentados = new Set();
  try { const r = await d.prepare('SELECT DISTINCT tel FROM wa_destinatarios').all(); jaTentados = new Set((r.results || []).map((x) => x.tel)); } catch { jaTentados = new Set(); }
  let linhas = [];
  try {
    const r = await d.prepare("SELECT nome, telefone, documento, email FROM contatos WHERE tipo='PJ' AND COALESCE(telefone,'')<>'' LIMIT 10000").all();
    linhas = r.results || [];
  } catch { linhas = []; }
  const temEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || '').trim());
  const vistosDoc = new Set(); const porDoc = new Map(); const itens = [];
  for (const l of linhas) {
    const tel = telWhatsApp(l.telefone);
    if (!tel || jaTentados.has(tel)) continue;
    const doc = String(l.documento || '').replace(/\D/g, '');
    if (doc && vistosDoc.has(doc)) {
      const p0 = porDoc.get(doc);
      if (p0 && ehFixoBR(p0.tel) && !ehFixoBR(tel)) p0.tel = tel; // celular vence o fixo
      continue;
    }
    if (doc) vistosDoc.add(doc);
    const fixo = ehFixoBR(tel);
    const pontos = (fixo ? 0 : 10) + (temEmail(l.email) ? 3 : 0);
    const item = { tel, nome: limpar(l.nome), doc, pontos, motivo: `base fria · ${fixo ? '☎️ só fixo no cadastro' : '📱 celular'}${temEmail(l.email) ? ' · com e-mail' : ''} · nunca recebeu campanha` };
    itens.push(item);
    if (doc) porDoc.set(doc, item);
  }
  itens.sort((a, b) => (b.pontos - a.pontos) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  return itens.slice(0, n);
}

async function publicoTopBruto(env, n, docsFora, poolLimite = 1000) {
  const d = await db(env); if (!d) return [];
  let linhas = [];
  try {
    const r = await d.prepare(`SELECT c.nome, c.telefone, c.documento,
        COUNT(n.ploomes_id) AS total,
        SUM(CASE WHEN n.status_id=2 THEN 1 ELSE 0 END) AS concluidos,
        SUM(CASE WHEN n.status_id=2 THEN COALESCE(n.amount,0) ELSE 0 END) AS valor,
        MAX(n.criado_em) AS ultimo
      FROM contatos c JOIN negocios n ON n.contact_id = c.ploomes_id
      WHERE c.tipo='PJ' AND COALESCE(c.telefone,'')<>''
      GROUP BY c.ploomes_id, c.nome, c.telefone, c.documento
      ORDER BY concluidos DESC, total DESC LIMIT ${Math.max(1000, Number(poolLimite) || 1000)}`).all();
    linhas = r.results || [];
  } catch { linhas = []; }
  // Junta as OS do sistema novo (clientes ativos AGORA contam mais).
  let coletas = []; try { coletas = await listarColetasOS(env); } catch { coletas = []; }
  const osPorDoc = new Map();
  for (const c of coletas.filter((x) => x && x.status !== 'cancelada')) {
    const doc = String(c.clienteDoc || '').replace(/\D/g, '');
    if (!doc) continue;
    const atual = osPorDoc.get(doc) || { qtd: 0, ultimo: '' };
    atual.qtd++; if (String(c.criadoEm || '') > atual.ultimo) atual.ultimo = String(c.criadoEm || '');
    osPorDoc.set(doc, atual);
  }
  // Clientes com OS novas que não estão na lista de negócios entram também.
  const docsNaLista = new Set(linhas.map((l) => String(l.documento || '').replace(/\D/g, '')));
  const docsSoOS = [...osPorDoc.keys()].filter((doc) => doc && !docsNaLista.has(doc));
  for (const c of await contatosPorDocs(env, docsSoOS)) {
    linhas.push({ nome: c.nome, telefone: c.telefone, documento: c.documento, total: 0, concluidos: 0, valor: 0, ultimo: '' });
  }
  const ANO = 365 * 86400e3;
  const agora = Date.now();
  const pontuadas = [];
  const vistosDoc = new Set();
  const porDoc = new Map();
  for (const l of linhas) {
    const tel = telWhatsApp(l.telefone);
    const doc = String(l.documento || '').replace(/\D/g, '');
    if (!tel) continue;
    if (doc && vistosDoc.has(doc)) {
      // Mesmo CNPJ, outro contato: se o escolhido ficou com o FIXO da empresa e
      // este contato tem celular, o celular assume (fixo não recebe WhatsApp).
      const p0 = porDoc.get(doc);
      if (p0 && ehFixoBR(p0.tel) && !ehFixoBR(tel)) p0.tel = tel;
      continue;
    }
    if (doc && docsFora && docsFora.has(doc)) continue; // pertence à lista de reativação
    if (doc) vistosDoc.add(doc);
    const os = (doc && osPorDoc.get(doc)) || { qtd: 0, ultimo: '' };
    const ultimaAtv = [String(l.ultimo || ''), os.ultimo].sort().pop() || '';
    let recencia = 0;
    const t = Date.parse(String(ultimaAtv).slice(0, 10));
    if (Number.isFinite(t)) { const idade = agora - t; recencia = idade <= ANO ? 10 : (idade <= 2 * ANO ? 5 : 0); }
    const pontos = (Number(l.concluidos) || 0) * 3 + Math.min(20, Number(l.total) || 0) + os.qtd * 5 + recencia;
    const valorMil = Math.round((Number(l.valor) || 0) / 1000);
    const item = {
      tel, nome: limpar(l.nome), doc, pontos, valor: Number(l.valor) || 0,
      motivo: `${l.concluidos || 0} concluída(s) · ${l.total || 0} negócio(s)${valorMil ? ` · R$ ${valorMil} mil` : ''}${os.qtd ? ` · ${os.qtd} OS no sistema novo` : ''}${ultimaAtv ? ` · última ${String(ultimaAtv).slice(0, 7)}` : ''}`,
    };
    pontuadas.push(item);
    if (doc) porDoc.set(doc, item);
  }
  pontuadas.sort((a, b) => (b.pontos - a.pontos) || (b.valor - a.valor));
  return pontuadas.slice(0, n);
}

// REATIVAÇÃO (pedido do Marcio 17/08): empresas ESTRATÉGICAS que pararam.
// Critério aberto: precisa ter pelo menos 1 descarte CONCLUÍDO no histórico
// (isso é o "estratégica" — relação real, não lead frio) e NENHUMA atividade
// (negócio ou OS no sistema novo) nos últimos MESES_REATIVACAO meses.
// Ranking pela força do histórico: concluídos ×3 + volume (até 20), desempate
// pelo valor concluído. Mostra desde quando está parada.
export async function publicoReativacao(env, n = 200, meses = MESES_REATIVACAO) {
  const d = await db(env); if (!d) return [];
  let linhas = [];
  try {
    const r = await d.prepare(`SELECT c.nome, c.telefone, c.documento,
        COUNT(n.ploomes_id) AS total,
        SUM(CASE WHEN n.status_id=2 THEN 1 ELSE 0 END) AS concluidos,
        SUM(CASE WHEN n.status_id=2 THEN COALESCE(n.amount,0) ELSE 0 END) AS valor,
        MAX(n.criado_em) AS ultimo
      FROM contatos c JOIN negocios n ON n.contact_id = c.ploomes_id
      WHERE c.tipo='PJ' AND COALESCE(c.telefone,'')<>''
      GROUP BY c.ploomes_id, c.nome, c.telefone, c.documento
      HAVING concluidos >= 1
      ORDER BY concluidos DESC, total DESC LIMIT 1500`).all();
    linhas = r.results || [];
  } catch { linhas = []; }
  // Atividade no sistema novo também conta como "não está parada".
  let coletas = []; try { coletas = await listarColetasOS(env); } catch { coletas = []; }
  const osUltimoPorDoc = new Map();
  for (const c of coletas.filter((x) => x && x.status !== 'cancelada')) {
    const doc = String(c.clienteDoc || '').replace(/\D/g, '');
    if (!doc) continue;
    const em = String(c.criadoEm || '');
    if (em > (osUltimoPorDoc.get(doc) || '')) osUltimoPorDoc.set(doc, em);
  }
  const corte = new Date(Date.now() - meses * 30.44 * 86400e3).toISOString().slice(0, 10);
  const agora = Date.now();
  const paradas = [];
  const vistosDoc = new Set();
  const porDoc = new Map();
  for (const l of linhas) {
    const tel = telWhatsApp(l.telefone);
    const doc = String(l.documento || '').replace(/\D/g, '');
    if (!tel) continue;
    if (doc && vistosDoc.has(doc)) {
      // Mesmo CNPJ, outro contato: celular assume o lugar de um fixo escolhido.
      const p0 = porDoc.get(doc);
      if (p0 && ehFixoBR(p0.tel) && !ehFixoBR(tel)) p0.tel = tel;
      continue;
    }
    if (doc) vistosDoc.add(doc);
    const ultimaAtv = [String(l.ultimo || '').slice(0, 10), (doc && String(osUltimoPorDoc.get(doc) || '').slice(0, 10)) || ''].sort().pop() || '';
    if (!ultimaAtv || ultimaAtv >= corte) continue; // ativa (ou sem data) → fora
    const t = Date.parse(ultimaAtv);
    const mesesParada = Number.isFinite(t) ? Math.floor((agora - t) / (30.44 * 86400e3)) : null;
    const pontos = (Number(l.concluidos) || 0) * 3 + Math.min(20, Number(l.total) || 0);
    const valorMil = Math.round((Number(l.valor) || 0) / 1000);
    const item = {
      tel, nome: limpar(l.nome), doc, pontos, valor: Number(l.valor) || 0,
      motivo: `${l.concluidos} concluída(s) · ${l.total} negócio(s)${valorMil ? ` · R$ ${valorMil} mil` : ''} · parada desde ${ultimaAtv.slice(0, 7)}${mesesParada != null ? ` (há ${mesesParada} meses)` : ''}`,
    };
    paradas.push(item);
    if (doc) porDoc.set(doc, item);
  }
  paradas.sort((a, b) => (b.pontos - a.pontos) || (b.valor - a.valor));
  return paradas.slice(0, n);
}

// Busca contatos por documento no D1, em blocos (IN limitado).
async function contatosPorDocs(env, docs) {
  const d = await db(env); if (!d || !docs.length) return [];
  const out = [];
  const lista = [...docs];
  while (lista.length) {
    const bloco = lista.splice(0, 40);
    const marcas = bloco.map((_, i) => `?${i + 1}`).join(',');
    try {
      const r = await d.prepare(`SELECT nome, telefone, documento FROM contatos WHERE COALESCE(telefone,'')<>'' AND REPLACE(REPLACE(REPLACE(REPLACE(documento,'.',''),'-',''),'/',''),' ','') IN (${marcas})`).bind(...bloco).all();
      out.push(...(r.results || []));
    } catch { /* segue com o que achou */ }
  }
  return out;
}

// Tamanho-alvo dos públicos RANQUEADOS. Ao preparar a campanha, quem já recebeu
// o template sai e a PRÓXIMA empresa da fila entra — a campanha tenta completar
// todas as vagas (regra do Marcio 17/08: "lista de 200 sem repetir quem já recebeu").
// MELHORES 1000 (pedido do Marcio 25/08): "só os melhores e que mais descartam,
// sem repetir para quem já enviamos". Verdade da base: os grandes descartadores
// inéditos praticamente acabaram nas ondas anteriores — então a fila é: (1º)
// QUALQUER empresa com histórico de negócio que ainda não recebeu (inclui quem
// entrou na base depois das outras ondas), na ordem de quem mais descarta;
// (2º) as vagas restantes vêm da base fria mais contatável. Ninguém repetido.
export async function publicoMelhores1000(env, n = 1000) {
  const ranqueados = await publicoTopNovos(env, n);
  if (ranqueados.length >= n) return ranqueados.slice(0, n);
  const tels = new Set(ranqueados.map((c) => c.tel));
  const docs = new Set(ranqueados.map((c) => c.doc).filter(Boolean));
  const frios = await publicoBaseFria(env, n);
  const extra = frios.filter((c) => c.tel && !tels.has(c.tel) && !(c.doc && docs.has(c.doc)));
  return [...ranqueados, ...extra].slice(0, n);
}

const ALVO_PUBLICO = { 'top-450': TOP_N, 'top-200': TOP_N, 'top-500-novos': 500, 'frios-500': 500, 'melhores-1000': 1000, 'reativacao-200': 200 };

// Monta o público (antes de dedupe/supressão). Devolve [{tel, nome, doc}].
// nMaior: pede uma fila maior que o alvo (usado na preparação, para repor vagas).
export async function montarPublicoWA(env, publico, telTeste, nMaior) {
  if (publico === 'teste') {
    const t = telWhatsApp(telTeste);
    return t ? [{ tel: t, nome: 'Teste', doc: '' }] : [];
  }
  if (publico === 'top-450' || publico === 'top-200') return publicoTop200(env, nMaior || TOP_N);
  if (publico === 'top-500-novos') return publicoTopNovos(env, nMaior || 500);
  if (publico === 'frios-500') return publicoBaseFria(env, nMaior || 500);
  if (publico === 'melhores-1000') return publicoMelhores1000(env, nMaior || 1000);
  if (publico === 'reativacao-200') return publicoReativacao(env, nMaior || 200);
  if (publico === 'base-pj') {
    const d = await db(env); if (!d) return [];
    try {
      const r = await d.prepare("SELECT nome, telefone, documento FROM contatos WHERE tipo='PJ' AND COALESCE(telefone,'')<>'' ORDER BY TRIM(nome) COLLATE NOCASE LIMIT 800").all();
      return (r.results || []).map((c) => ({ tel: telWhatsApp(c.telefone), nome: limpar(c.nome), doc: String(c.documento || '').replace(/\D/g, '') })).filter((c) => c.tel);
    } catch { return []; }
  }
  // Públicos baseados nas OS do sistema.
  let coletas = []; try { coletas = await listarColetasOS(env); } catch { coletas = []; }
  const validas = coletas.filter((c) => c && c.status !== 'cancelada');
  const docsComOS = new Set(validas.map((c) => String(c.clienteDoc || '').replace(/\D/g, '')).filter(Boolean));
  let docsAlvo = [...docsComOS];
  if (publico === 'sem-coleta-6m') {
    const corte = new Date(Date.now() - 180 * 86400e3).toISOString();
    const recentes = new Set(validas.filter((c) => String(c.criadoEm || '') >= corte).map((c) => String(c.clienteDoc || '').replace(/\D/g, '')));
    docsAlvo = docsAlvo.filter((doc) => !recentes.has(doc));
  }
  const contatos = await contatosPorDocs(env, docsAlvo);
  // Uma mensagem por empresa: com vários contatos no mesmo CNPJ, o celular
  // vence o fixo (fixo não recebe WhatsApp).
  const porDoc = new Map(); const saida = [];
  for (const c of contatos) {
    const e = { tel: telWhatsApp(c.telefone), nome: limpar(c.nome), doc: String(c.documento || '').replace(/\D/g, '') };
    if (!e.tel) continue;
    if (!e.doc) { saida.push(e); continue; }
    const p0 = porDoc.get(e.doc);
    if (!p0) { porDoc.set(e.doc, e); saida.push(e); }
    else if (ehFixoBR(p0.tel) && !ehFixoBR(e.tel)) p0.tel = e.tel;
  }
  return saida;
}

// Prévia: contagem + exemplos, já sem duplicados e sem opt-outs.
// nMaior (só na preparação): busca uma fila maior e devolve a lista sem o corte
// de 500 — o corte final é feito depois da trava, para repor as vagas.
export async function previaPublicoWA(env, publico, telTeste, nMaior) {
  const brutos = await montarPublicoWA(env, publico, telTeste, nMaior);
  const d = await db(env);
  let optouts = new Set();
  try { if (d) { const r = await d.prepare('SELECT tel FROM wa_optout').all(); optouts = new Set((r.results || []).map((x) => x.tel)); } } catch { /* segue */ }
  let excluidas = new Set();
  try { if (publico !== 'teste') excluidas = await docsExcluidos(env); } catch { /* segue */ }
  // Números que a Meta já devolveu como "sem WhatsApp" saem sozinhos (menos no
  // público de teste, para nunca travar um teste do próprio Marcio).
  let telsSemZap = new Set();
  try { if (d && publico !== 'teste') { const r = await d.prepare('SELECT tel FROM wa_tel_invalido').all(); telsSemZap = new Set((r.results || []).map((x) => x.tel)); } } catch { /* segue */ }
  const vistos = new Set(); const finais = []; let semZap = 0;
  for (const c of brutos) {
    if (vistos.has(c.tel) || optouts.has(c.tel)) continue;
    if (c.doc && excluidas.has(String(c.doc).replace(/\D/g, ''))) continue;
    if (telsSemZap.has(c.tel)) { semZap++; continue; }
    vistos.add(c.tel); finais.push(c);
  }
  const teto = nMaior ? Math.max(nMaior, LIMITE_CAMPANHA) : LIMITE_CAMPANHA;
  const cortados = Math.max(0, finais.length - teto);
  return { total: Math.min(finais.length, teto), cortados, semZap, exemplos: finais.slice(0, 5).map((c) => c.nome || c.tel.slice(0, 6) + '…'), lista: finais.slice(0, teto) };
}

export async function prepararCampanhaWA(env, user, dados) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const titulo = limpar(dados && dados.titulo).slice(0, 120);
  if (titulo.length < 3) return { ok: false, message: 'Dê um título para a campanha (ex.: Oferta de coleta — agosto).' };
  const tpl = (dados && dados.template) || {};
  if (!tpl.nome && !tpl.id) return { ok: false, message: 'Escolha o template aprovado.' };
  // Template com variáveis conhecidas: TODAS precisam vir preenchidas — variável
  // faltando faz o Gupshup aceitar ("submitted") e a Meta descartar sem entregar.
  const nvars = tpl.nvars != null ? Number(tpl.nvars) : null;
  if (nvars != null && nvars > 0) {
    const ps = Array.isArray(dados && dados.params) ? dados.params : [];
    if (ps.length < nvars || ps.slice(0, nvars).some((p) => !String(p || '').trim())) {
      return { ok: false, message: `Este template tem ${nvars} variável(is) — preencha todas antes de preparar.` };
    }
  }
  const publico = String((dados && dados.publico) || '');
  if (!PUBLICOS_WA[publico]) return { ok: false, message: 'Escolha o público.' };
  const params = Array.isArray(dados && dados.params) ? dados.params.map((p) => String(p).slice(0, 200)).slice(0, 10) : [];
  // Público ranqueado: busca uma fila MAIOR que o alvo, para que as vagas de
  // quem já recebeu o template sejam repostas pelas próximas empresas da fila.
  const alvo = ALVO_PUBLICO[publico] || 0;
  const previa = await previaPublicoWA(env, publico, dados && dados.telTeste, alvo ? alvo + 400 : undefined);
  if (!previa.lista.length) return { ok: false, message: publico === 'teste' ? 'Digite um número de WhatsApp válido para o teste.' : 'Nenhum destinatário nesse público (com telefone e fora da lista de saída).' };
  // TRAVA ANTI-REPETIÇÃO (regra do Marcio): quem JÁ RECEBEU este template em
  // qualquer campanha anterior fica de fora — não importa por qual lista veio.
  // O público "teste" é isento (teste tem que sempre enviar).
  let lista = previa.lista;
  let jaReceberam = 0;
  if (publico !== 'teste') {
    try {
      // "Já recebeu" = aceito E não devolvido como falha de entrega. Quem teve
      // entrega FALHADA nunca viu a mensagem — pode entrar de novo (número morto
      // de verdade já fica fora sozinho pela wa_tel_invalido).
      const r0 = await d.prepare('SELECT DISTINCT d0.tel AS tel FROM wa_destinatarios d0 JOIN wa_campanhas c0 ON c0.id = d0.campanha_id WHERE d0.status=\'enviado\' AND IFNULL(d0.entrega,\'\') <> \'falhou\' AND ((c0.template_nome <> \'\' AND c0.template_nome = ?1) OR (?2 <> \'\' AND c0.template_id = ?2))')
        .bind(String(tpl.nome || ''), String(tpl.id || '')).all();
      const jaTel = new Set((r0.results || []).map((x) => x.tel));
      const antes = lista.length;
      lista = lista.filter((c) => !jaTel.has(c.tel));
      jaReceberam = antes - lista.length;
    } catch { /* trava é best-effort — nunca derruba a preparação */ }
    if (!lista.length) return { ok: false, message: `Todos os destinatários desse público (${jaReceberam}) já receberam este template em campanhas anteriores — nada novo a enviar. Use outro template ou outro público.` };
  }
  // Corte final no tamanho do público (as vagas já foram repostas acima).
  // O alvo do público manda — públicos maiores (ex.: melhores-1000) passam de 500.
  lista = lista.slice(0, alvo || LIMITE_CAMPANHA);
  const agora = new Date().toISOString();
  await d.prepare('INSERT INTO wa_campanhas (titulo, template_nome, template_id, template_lang, params_json, publico, criado_por, criado_em, status, total) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,\'preparada\',?9)')
    .bind(titulo, String(tpl.nome || ''), String(tpl.id || ''), String(tpl.lang || 'pt_BR'), JSON.stringify(params), publico, (user && user.email) || '', agora, lista.length).run();
  const row = await d.prepare('SELECT id FROM wa_campanhas ORDER BY id DESC LIMIT 1').first();
  const cid = Number(row && row.id);
  for (const c of lista) {
    await d.prepare('INSERT INTO wa_destinatarios (campanha_id, tel, nome, doc, status) VALUES (?1,?2,?3,?4,\'pendente\')').bind(cid, c.tel, c.nome.slice(0, 160), c.doc).run();
  }
  return { ok: true, id: cid, total: lista.length, cortados: alvo ? 0 : previa.cortados, jaReceberam, vagasRepostas: !!alvo };
}

const primeiroNome = (n) => { const p = limpar(n).split(' ')[0] || ''; return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : 'cliente'; };
const aplicarTokens = (texto, dest) => String(texto).split('{nome}').join(primeiroNome(dest.nome)).split('{empresa}').join(limpar(dest.nome) || 'sua empresa');

// Envia um LOTE (até `tamanho`) de pendentes. A tela chama em sequência até acabar.
export async function enviarLoteWA(env, campanhaId, tamanho = 15) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const cid = Number(campanhaId) || 0;
  const camp = await d.prepare('SELECT * FROM wa_campanhas WHERE id=?1').bind(cid).first();
  if (!camp) return { ok: false, message: 'Campanha não encontrada.' };
  const pend = await d.prepare('SELECT * FROM wa_destinatarios WHERE campanha_id=?1 AND status=\'pendente\' ORDER BY id LIMIT ?2').bind(cid, Math.max(1, Math.min(25, tamanho))).all();
  const fila = pend.results || [];
  let params = []; try { params = JSON.parse(camp.params_json || '[]'); } catch { params = []; }
  const info = { nome: camp.template_nome, id: camp.template_id, lang: camp.template_lang };
  let enviados = 0, falhas = 0;
  for (const dest of fila) {
    const pDest = params.map((p) => aplicarTokens(p, dest));
    let r;
    try { r = await enviarWhatsAppInfo(env, dest.tel, info, pDest); } catch { r = { ok: false, motivo: 'excecao' }; }
    const okEnvio = !!(r && r.ok);
    if (okEnvio) enviados++; else falhas++;
    // No sucesso, guarda também o começo da resposta do Gupshup e o ID da
    // mensagem — é com ele que o retorno de entrega (webhook) casa depois.
    const tent = (r && r.tentativas) || [];
    const vencedora = tent.find((t) => t.ok) || {};
    let msgId = '';
    try { const j = JSON.parse(vencedora.corpo || '{}'); msgId = String(j.messageId || j.messageid || (j.message && j.message.id) || '').slice(0, 80); } catch { msgId = ''; }
    const detalheOk = `${r && r.vencedor ? r.vencedor : ''} · ${String(vencedora.corpo || '').slice(0, 120)}`;
    await d.prepare('UPDATE wa_destinatarios SET status=?2, detalhe=?3, em=?4, msg_id=?5, entrega=?6 WHERE id=?1')
      .bind(dest.id, okEnvio ? 'enviado' : 'falha', okEnvio ? detalheOk.slice(0, 200) : String((r && (r.motivo || '')) + ' ' + ((r && r.detalhe) || '')).slice(0, 200), new Date().toISOString(), msgId, okEnvio ? 'enviada' : '').run();
  }
  const resta = await d.prepare('SELECT COUNT(*) AS n FROM wa_destinatarios WHERE campanha_id=?1 AND status=\'pendente\'').bind(cid).first();
  const restantes = Number(resta && resta.n) || 0;
  await d.prepare('UPDATE wa_campanhas SET enviados=enviados+?2, falhas=falhas+?3, status=?4 WHERE id=?1')
    .bind(cid, enviados, falhas, restantes ? 'enviando' : 'concluida').run();
  return { ok: true, enviados, falhas, restantes };
}

export async function listarCampanhasWA(env) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT * FROM wa_campanhas ORDER BY id DESC LIMIT 40').all(); return r.results || []; } catch { return []; }
}
export async function falhasDaCampanhaWA(env, id) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT nome, tel, detalhe FROM wa_destinatarios WHERE campanha_id=?1 AND status=\'falha\' LIMIT 50').bind(Number(id) || 0).all(); return r.results || []; } catch { return []; }
}
export async function mudarOptoutWA(env, tel, acao, motivo) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const t = telWhatsApp(tel);
  if (!t) return { ok: false, message: 'Número inválido.' };
  if (acao === 'del') { await d.prepare('DELETE FROM wa_optout WHERE tel=?1').bind(t).run(); return { ok: true }; }
  try { await d.prepare('INSERT INTO wa_optout (tel, motivo, em) VALUES (?1,?2,?3)').bind(t, limpar(motivo).slice(0, 120), new Date().toISOString()).run(); } catch { /* já existe */ }
  return { ok: true };
}
export async function listarOptoutWA(env) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT tel, motivo, em FROM wa_optout ORDER BY em DESC LIMIT 200').all(); return r.results || []; } catch { return []; }
}

// --- MEDIÇÃO (pedido do Marcio 13/08) ---------------------------------------------
// 1) RETORNO DO CANAL (webhook do Gupshup): entregue / lida / falhou + respostas.
//    O Gupshup chama nossa URL a cada evento. Quem responder SAIR entra sozinho
//    na lista de saída. A URL leva uma chave derivada do segredo do cofre.
export async function chaveWebhookWA(env) {
  const base = `${env.PORTAL_SESSION_SECRET || 'ecobraz'}|wa-webhook`;
  const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base));
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}
const RANK_ENTREGA = { '': 0, 'enviada': 1, 'entregue': 2, 'lida': 3, 'falhou': 9 };
// Motivos que significam "este número não recebe WhatsApp" (código 1002 do
// Gupshup / 131026 da Meta): o número entra sozinho em wa_tel_invalido e some
// das próximas listas — não adianta gastar disparo com número morto.
const SEM_ZAP_RE = /\b(1002|131026)\b|not exist|undeliverable|(no|not|sem|nao|não)[^a-z0-9]{0,3}whatsapp|invalid[^a-z0-9]{0,3}(number|destination|phone)/i;
export async function processarWebhookWA(env, corpo) {
  const d = await db(env); if (!d) return { ok: false };
  const b = corpo || {};
  const tipo = String(b.type || '');
  try {
    if (tipo === 'message-event') {
      const p = b.payload || {};
      const evento = String(p.type || '').toLowerCase();
      const mapa = { sent: 'enviada', enqueued: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };
      const novo = mapa[evento];
      if (!novo) return { ok: true, ignorado: evento };
      const mid = String(p.gsId || p.id || '').slice(0, 80);
      const tel = String(p.destination || '').replace(/\D/g, '');
      // Casa pelo id da mensagem; sem id, pelo telefone (último envio para ele).
      let dest = mid ? await d.prepare('SELECT id, entrega, tel FROM wa_destinatarios WHERE msg_id=?1 ORDER BY id DESC LIMIT 1').bind(mid).first() : null;
      if (!dest && tel) dest = await d.prepare('SELECT id, entrega, tel FROM wa_destinatarios WHERE tel=?1 AND status=\'enviado\' ORDER BY id DESC LIMIT 1').bind(tel).first();
      if (!dest) return { ok: true, sem_destinatario: true };
      // Nunca rebaixa (lida não volta para entregue); falha sempre registra.
      const atual = RANK_ENTREGA[String(dest.entrega || '')] || 0;
      if (novo !== 'falhou' && RANK_ENTREGA[novo] <= atual) return { ok: true };
      if (novo === 'falhou') {
        // O evento "failed" traz o PORQUÊ (code + reason) — guarda para mostrar
        // nos Resultados em vez de jogar fora (lição da Reativação de 17/08).
        const pp = (p.payload && typeof p.payload === 'object') ? p.payload : {};
        const motivo = limpar([pp.code, pp.reason || pp.message].filter((x) => x != null && x !== '').join(' ')).slice(0, 160);
        await d.prepare('UPDATE wa_destinatarios SET entrega=?2, detalhe=?3 WHERE id=?1')
          .bind(dest.id, novo, ('entrega falhou: ' + (motivo || 'canal não informou o motivo')).slice(0, 200)).run();
        const telDest = String(dest.tel || tel || '');
        if (telDest && SEM_ZAP_RE.test(motivo)) {
          try { await d.prepare('INSERT OR REPLACE INTO wa_tel_invalido (tel, motivo, em) VALUES (?1,?2,?3)').bind(telDest, motivo, new Date().toISOString()).run(); } catch { /* segue */ }
        }
        return { ok: true, entrega: novo };
      }
      await d.prepare('UPDATE wa_destinatarios SET entrega=?2 WHERE id=?1').bind(dest.id, novo).run();
      return { ok: true, entrega: novo };
    }
    if (tipo === 'message') {
      const p = b.payload || {};
      const tel = String(p.source || (p.sender && p.sender.phone) || '').replace(/\D/g, '');
      if (!tel) return { ok: true };
      const texto = limpar((p.payload && (p.payload.text || p.payload.title)) || p.text || '').slice(0, 200);
      const dest = await d.prepare('SELECT id FROM wa_destinatarios WHERE tel=?1 ORDER BY id DESC LIMIT 1').bind(tel).first();
      if (dest) await d.prepare('UPDATE wa_destinatarios SET respondeu=1 WHERE id=?1').bind(dest.id).run();
      // SAIR → entra sozinho na lista de saída (nunca mais recebe campanha).
      if (/^\s*sair\s*[.!]?\s*$/i.test(texto)) {
        try { await d.prepare('INSERT INTO wa_optout (tel, motivo, em) VALUES (?1,?2,?3)').bind(tel, 'respondeu SAIR no WhatsApp', new Date().toISOString()).run(); } catch { /* já está */ }
        return { ok: true, optout: true };
      }
      return { ok: true, resposta: true };
    }
  } catch { /* webhook nunca devolve erro para o Gupshup ficar reenviando */ }
  return { ok: true, ignorado: tipo || 'sem_tipo' };
}

// 2) CONVERSÃO DE VERDADE (sem depender de webhook): dos destinatários da
//    campanha, quantos ENTRARAM NO PORTAL depois do disparo (medição de uso por
//    CNPJ que já existe), quantos criaram SOLICITAÇÃO de coleta e quantos
//    ganharam OS nova. Correlação honesta: entrou depois ≠ certeza de que foi
//    por causa da mensagem — mas é o termômetro real de "está funcionando?".
export async function metricasCampanhaWA(env, campanhaId) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const cid = Number(campanhaId) || 0;
  const camp = await d.prepare('SELECT * FROM wa_campanhas WHERE id=?1').bind(cid).first();
  if (!camp) return { ok: false, message: 'Campanha não encontrada.' };
  const dataCorte = String(camp.criado_em || '').slice(0, 10);
  const dest = await d.prepare('SELECT nome, doc, tel, entrega, respondeu, detalhe FROM wa_destinatarios WHERE campanha_id=?1 AND status=\'enviado\'').bind(cid).all();
  const rows = dest.results || [];
  const docs = new Set(rows.map((x) => String(x.doc || '').replace(/\D/g, '')).filter(Boolean));
  const canal = { entregues: 0, lidas: 0, falharam: 0, responderam: 0, comRetorno: 0 };
  const falhouLista = [];
  for (const x of rows) {
    const e = String(x.entrega || '');
    if (e && e !== 'enviada') canal.comRetorno++;
    if (e === 'entregue' || e === 'lida') canal.entregues++;
    if (e === 'lida') canal.lidas++;
    if (e === 'falhou') {
      canal.falharam++;
      // O motivo só existe se veio do webhook (prefixo "entrega falhou:");
      // o detalhe de ENVIO (aceite do Gupshup) não é motivo de falha.
      const det = String(x.detalhe || '');
      const motivoBruto = det.startsWith('entrega falhou') ? det.replace(/^entrega falhou:?\s*/, '') : '';
      const semInfo = !motivoBruto || /^canal não informou/.test(motivoBruto);
      // Sem motivo gravado, o formato do número ainda explica muito: linha fixa
      // não recebe WhatsApp (foi o caso de boa parte da Reativação de 17/08).
      const motivoTexto = !semInfo ? traduzirFalhaWA(motivoBruto)
        : (ehFixoBR(String(x.tel || '')) ? 'provável telefone FIXO — linha fixa não recebe WhatsApp (visto pelo formato do número)'
          : (motivoBruto ? 'o canal não informou o motivo' : traduzirFalhaWA('')));
      falhouLista.push({ nome: String(x.nome || ''), tel: String(x.tel || ''), motivoTexto });
    }
    if (Number(x.respondeu)) canal.responderam++;
  }
  const porMotivo = new Map();
  for (const f of falhouLista) porMotivo.set(f.motivoTexto, (porMotivo.get(f.motivoTexto) || 0) + 1);
  const falhouResumo = [...porMotivo.entries()].map(([motivo, n]) => ({ motivo, n })).sort((a, b) => b.n - a.n);
  let sairam = 0;
  try {
    const tels = new Set(rows.map((x) => x.tel));
    sairam = (await listarOptoutWA(env)).filter((o) => tels.has(o.tel) && String(o.em || '') >= dataCorte).length;
  } catch { sairam = 0; }
  // Portal: dias de uso (uso:c:{dia}:{doc}) a partir do dia do disparo.
  const portal = new Set();
  try {
    if (env.PORTAL_KV && docs.size) {
      let cursor;
      do {
        const r = await env.PORTAL_KV.list({ prefix: 'uso:c:', cursor, limit: 1000 });
        for (const k of (r.keys || [])) {
          const m = k.name.match(/^uso:c:(\d{4}-\d{2}-\d{2}):(.+)$/);
          if (m && m[1] >= dataCorte && docs.has(m[2])) portal.add(m[2]);
        }
        cursor = r.list_complete ? null : r.cursor;
      } while (cursor);
    }
  } catch { /* segue com o que tiver */ }
  // Solicitações (leads) e OS novas dos destinatários após o disparo.
  let solicitacoes = 0, novasOS = 0;
  try {
    const { listarLeads } = await import('./cadastro.js');
    solicitacoes = (await listarLeads(env)).filter((l) => l && String(l.criadoEm || '') >= dataCorte && docs.has(String(l.documento || '').replace(/\D/g, ''))).length;
  } catch { solicitacoes = 0; }
  try {
    novasOS = (await listarColetasOS(env)).filter((c) => c && c.status !== 'cancelada' && String(c.criadoEm || '') >= dataCorte && docs.has(String(c.clienteDoc || '').replace(/\D/g, ''))).length;
  } catch { novasOS = 0; }
  return {
    ok: true, titulo: camp.titulo, desde: dataCorte,
    enviadas: Number(camp.enviados) || 0, falhasEnvio: Number(camp.falhas) || 0,
    canal, sairam, falhouResumo, falhouLista: falhouLista.slice(0, 300),
    conversao: { portal: portal.size, solicitacoes, novasOS },
  };
}

// Traduz o motivo técnico da falha de entrega para o time (código Meta/Gupshup → português).
export function traduzirFalhaWA(motivo) {
  const m = String(motivo || '');
  if (!m) return 'motivo não registrado (falha anterior a 17/08 — desde então o porquê fica gravado)';
  if (SEM_ZAP_RE.test(m)) return 'número não tem WhatsApp (ou não existe mais)';
  if (/\b131048\b|spam/i.test(m)) return 'trava de qualidade da Meta (risco de spam) — pausar disparos por alguns dias';
  if (/\b130429\b|rate limit|too many/i.test(m)) return 'limite de velocidade do canal — dá para tentar de novo mais tarde';
  if (/\b(131049|131050)\b|healthy|ecosystem|frequency/i.test(m)) return 'a própria Meta segurou marketing para este contato agora (limite por pessoa)';
  return m.slice(0, 120);
}

// Lista completa de um público, para conferência ANTES do disparo (transparência:
// mostra o critério e a pontuação de cada empresa — nada de lista mágica).
export async function listaDetalhadaPublicoWA(env, publico, telTeste) {
  const previa = await previaPublicoWA(env, publico, telTeste);
  return previa.lista;
}
const fmtDocWA = (v) => { const d0 = String(v || '').replace(/\D/g, ''); if (d0.length === 14) return d0.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); if (d0.length === 11) return d0.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); return v || '—'; };
export function paginaListaPublicoWA(publico, itens, excluidas) {
  const rotulo = PUBLICOS_WA[publico] || publico;
  const rows = (itens || []).map((c, i) => `<tr>
    <td style="color:#8fa39f">${i + 1}</td>
    <td><b>${esc(c.nome || '—')}</b>${c.motivo ? `<span style="display:block;font-size:11px;color:#8fa39f;margin-top:2px">${esc(c.motivo)}</span>` : ''}</td>
    <td style="white-space:nowrap">${esc(fmtDocWA(c.doc))}</td>
    <td style="white-space:nowrap">${esc(c.tel)}${ehFixoBR(c.tel) ? '<span style="display:block;font-size:10px;color:#8A6A16;font-weight:700">☎️ provável fixo</span>' : ''}</td>
    ${c.pontos != null ? `<td style="text-align:center"><b>${c.pontos}</b></td>` : '<td style="text-align:center;color:#8fa39f">—</td>'}
    <td style="text-align:right">${c.doc ? `<button data-doc="${esc(c.doc)}" data-nome="${esc(c.nome || '')}" onclick="excluir(this)" style="background:none;border:1px solid #E8B9B2;color:#B23A2E;border-radius:8px;padding:4px 9px;font-size:11px;font-weight:800;cursor:pointer">✕ Tirar da lista</button>` : ''}</td>
  </tr>`).join('') || '<tr><td colspan="6" style="color:#8fa39f">Nenhuma empresa nesse público.</td></tr>';
  const exRows = (excluidas || []).map((x) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #EEF1F0;padding:7px 2px;font-size:12px">
    <span><b>${esc(x.nome || '—')}</b> · ${esc(fmtDocWA(x.doc))}<span style="color:#9aa7a4"> · removida em ${esc(String(x.em || '').slice(0, 10).split('-').reverse().join('/'))}</span></span>
    <button data-doc="${esc(x.doc)}" onclick="reincluir(this)" style="background:none;border:none;color:#0B5B66;font-size:11px;font-weight:700;cursor:pointer">↩ devolver para a lista</button>
  </div>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Público da campanha — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}
th{text-align:left;color:#7c8a87;font-weight:800;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;border-bottom:2px solid #E4EBE9;background:#fff;position:sticky;top:0}
td{padding:9px 10px;border-bottom:1px solid #EEF1F0;vertical-align:top}
</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:940px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/diretoria/whatsapp" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">público · campanha</span></a>
  <a href="/diretoria/whatsapp" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Campanhas</a>
</div></div>
<div style="max-width:940px;margin:0 auto;padding:20px 18px 56px">
  <h1 style="font-size:19px;margin:0 0 4px">📋 ${esc(rotulo)}</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 6px"><b>${(itens || []).length}</b> empresa(s), já sem repetidos, sem quem pediu para sair, sem números que a Meta devolveu como "sem WhatsApp" e sem as removidas. Ao tirar uma, a próxima da fila entra no lugar. <b>☎️ provável fixo</b> = o cadastro só tem telefone de linha fixa (dificilmente recebe WhatsApp) — vale a equipe atualizar o contato dessa empresa.</p>
  ${publico === 'melhores-1000' ? `<p style="font-size:11.5px;color:#9aa7a4;margin:0 0 14px">Critério (aberto): <b>quem mais descarta primeiro</b> — empresas com histórico de negócio que <b>nunca receberam campanha</b> entram na frente (pontuação do Top: concluídas ×3 · volume · OS ×5 · recência); as vagas restantes vêm da <b>base fria</b> mais contatável (📱 celular vale 10, e-mail vale 3). Qualquer tentativa anterior (mesmo falha aceita) deixa a empresa de fora; números "sem WhatsApp", SAIR e removidas idem. Honestidade: os grandes descartadores inéditos são poucos — a maior parte desta lista vem da base fria, que responde menos.</p>` : publico === 'frios-500' ? `<p style="font-size:11.5px;color:#9aa7a4;margin:0 0 14px">Critério (aberto): contatos PJ <b>sem histórico de negócio</b> que <b>nunca receberam campanha</b> — ranqueados pela contatabilidade: 📱 celular vale 10 (fixo quase nunca tem WhatsApp), ter e-mail vale 3; mesmo CNPJ com fixo e celular fica com o celular. Já enviados, números devolvidos pela Meta, SAIR e removidas ficam de fora. É base fria: espere resposta menor que a dos clientes com histórico.</p>` : publico === 'top-500-novos' ? `<p style="font-size:11.5px;color:#9aa7a4;margin:0 0 14px">Critério (aberto): mesma pontuação do Top (concluídas ×3 · volume até 20 · OS ×5 · recência) — mas <b>só entra quem NUNCA recebeu campanha</b>: qualquer tentativa anterior (mesmo as que falharam) deixa a empresa de fora. Números que a Meta devolveu como "sem WhatsApp", quem pediu SAIR e as removidas também ficam de fora. Empresa parada há ${MESES_REATIVACAO}+ meses pertence à lista de Reativação. Se a base tiver menos de 500 empresas inéditas com histórico, a lista vem com o que existe de verdade.</p>` : String(publico).startsWith('top-') ? `<p style="font-size:11.5px;color:#9aa7a4;margin:0 0 14px">Critério da pontuação (aberto): negócio concluído ×3 · volume de negócios (até 20) · OS no sistema novo ×5 · atividade nos últimos 12 meses +10 (24 meses +5). Desempate por valor concluído. <b>Sem repetição entre listas:</b> empresa parada há ${MESES_REATIVACAO}+ meses pertence à lista de Reativação e fica fora daqui.</p>` : publico === 'reativacao-200' ? `<p style="font-size:11.5px;color:#9aa7a4;margin:0 0 14px">Critério (aberto): entra quem tem pelo menos 1 descarte CONCLUÍDO no histórico e NENHUMA atividade (negócio ou OS) nos últimos ${MESES_REATIVACAO} meses. Pontos: concluídas ×3 + volume (até 20), desempate por valor. Cada linha mostra desde quando a empresa está parada. <b>Sem repetição entre listas:</b> quem está aqui fica fora do Top ${TOP_N} — e, ao preparar a campanha, quem já recebeu o template escolhido em qualquer disparo anterior fica de fora automaticamente e a próxima empresa da fila entra no lugar (a campanha tenta completar as 200 vagas). Quem teve FALHA de entrega não conta como "recebeu" e pode entrar de novo.</p>` : '<div style="margin-bottom:14px"></div>'}
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;overflow:auto;max-height:70vh">
  <table><thead><tr><th>#</th><th>Empresa</th><th>CNPJ/CPF</th><th>WhatsApp</th><th style="text-align:center">Pontos</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  ${exRows ? `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-top:14px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87;margin-bottom:4px">🚫 Removidas das campanhas (${(excluidas || []).length})</div>
    ${exRows}
  </div>` : ''}
</div>
<script>
async function excluir(btn){
  if(!confirm('Tirar "'+(btn.dataset.nome||btn.dataset.doc)+'" das campanhas? A próxima empresa da fila entra no lugar. Dá para devolver depois.'))return;
  try{const r=await fetch('/api/diretoria/wa/excluir-empresa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({doc:btn.dataset.doc,nome:btn.dataset.nome,acao:'add'})});
    const j=await r.json(); if(j.ok)location.reload(); else alert(j.message||'Não deu.');}
  catch(e){alert('Sem conexão.');}
}
async function reincluir(btn){
  try{const r=await fetch('/api/diretoria/wa/excluir-empresa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({doc:btn.dataset.doc,acao:'del'})});
    const j=await r.json(); if(j.ok)location.reload(); else alert(j.message||'Não deu.');}
  catch(e){alert('Sem conexão.');}
}
</script></body></html>`;
}

// --- SALDO ESTIMADO (plano B quando a carteira do Gupshup não é legível pela API) --
// O Marcio informa o saldo que vê no painel do Gupshup UMA vez; daí em diante o
// sistema desconta o custo estimado de cada mensagem DISPARADA POR AQUI. Estimativa
// declarada como estimativa — avisos transacionais de coleta não entram na conta.
export async function salvarSaldoBaseWA(env, valor, custoMsg, por) {
  const v = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return { ok: false, message: 'Informe o saldo em dólares como aparece no painel do Gupshup (ex.: 42.50).' };
  let c = Number(String(custoMsg == null || custoMsg === '' ? '0.07' : custoMsg).replace(',', '.'));
  if (!Number.isFinite(c) || c <= 0 || c > 5) c = 0.07;
  const base = { valor: Math.round(v * 100) / 100, custoMsg: Math.round(c * 10000) / 10000, em: new Date().toISOString(), por: String(por || '').slice(0, 160) };
  if (!env.PORTAL_KV) return { ok: false, message: 'Armazenamento indisponível.' };
  await env.PORTAL_KV.put('wa:saldo-base', JSON.stringify(base));
  return { ok: true, base };
}
export async function lerSaldoBaseWA(env) {
  try { if (env.PORTAL_KV) { const raw = await env.PORTAL_KV.get('wa:saldo-base'); if (raw) return JSON.parse(raw); } } catch { /* sem base */ }
  return null;
}
export async function saldoEstimadoWA(env) {
  const base = await lerSaldoBaseWA(env);
  if (!base) return null;
  const d = await db(env); if (!d) return null;
  let enviadas = 0;
  try {
    // Falha de entrega não é cobrada pela Meta — não desconta do saldo estimado.
    const r = await d.prepare('SELECT COUNT(*) AS n FROM wa_destinatarios WHERE status=\'enviado\' AND IFNULL(entrega,\'\') <> \'falhou\' AND em >= ?1').bind(String(base.em)).first();
    enviadas = Number(r && r.n) || 0;
  } catch { enviadas = 0; }
  const estimado = Math.round((base.valor - enviadas * base.custoMsg) * 100) / 100;
  return { ok: true, saldo: estimado, moeda: 'USD', em: new Date().toISOString(), estimado: true, base, enviadas };
}

// --- Página (Diretoria) -----------------------------------------------------------
export function paginaCampanhasWA(user, campanhas, optouts, urlWebhook, saldoBase) {
  const fmtDt = (iso) => { const d0 = new Date(iso); if (!iso || isNaN(d0.getTime())) return '—'; d0.setUTCHours(d0.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d0.getUTCDate())}/${p(d0.getUTCMonth() + 1)} ${p(d0.getUTCHours())}:${p(d0.getUTCMinutes())}`; };
  const rows = (campanhas || []).map((c) => {
    const pct = c.total ? Math.round(((c.enviados + c.falhas) / c.total) * 100) : 0;
    return `<div style="border:1px solid #EEF1F0;border-radius:12px;padding:13px 15px;margin-bottom:10px" data-camp="${c.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="min-width:0"><b style="font-size:13.5px">${esc(c.titulo)}</b>
          <span style="display:block;font-size:11px;color:#8fa39f;margin-top:2px">${esc(fmtDt(c.criado_em))} · template ${esc(c.template_nome || c.template_id)} · ${esc(PUBLICOS_WA[c.publico] || (c.publico === 'top-200' ? 'Top 200 — empresas mais relevantes (antigo)' : c.publico))}</span></div>
        <div style="flex:none;display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;font-weight:800;color:${c.status === 'concluida' ? '#1E5B31' : '#8A6A16'}">${c.enviados}/${c.total} enviados${c.falhas ? ` · <b style="color:#B23A2E">${c.falhas} falhas</b>` : ''}</span>
          ${c.status !== 'concluida' ? `<button class="btn btn-p" style="padding:8px 13px;font-size:12px" onclick="enviarTudo(${c.id},this)">▶ ${c.enviados + c.falhas ? 'Continuar envio' : 'Iniciar envio'}</button>` : '<span style="font-size:10.5px;font-weight:800;color:#1E5B31;background:#E4F3E6;border-radius:999px;padding:3px 9px">✓ CONCLUÍDA</span>'}
          <button class="btn btn-g" style="padding:8px 11px;font-size:12px" onclick="verResultados(${c.id})">📈 Resultados</button>
          ${c.falhas ? `<button class="btn btn-g" style="padding:8px 11px;font-size:12px" onclick="verFalhas(${c.id})">falhas</button>` : ''}
        </div>
      </div>
      <div style="background:#EEF3F2;border-radius:99px;height:7px;margin-top:9px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:#92C430"></i></div>
      <div class="lote-msg" style="font-size:11.5px;color:#4F6469;margin-top:5px"></div>
      <div class="resultados-box" style="display:none;margin-top:8px"></div>
      <div class="falhas-box" style="display:none;font-size:11.5px;color:#a05a52;margin-top:6px"></div>
    </div>`;
  }).join('') || '<div style="font-size:12.5px;color:#8fa39f">Nenhuma campanha ainda. Monte a primeira acima.</div>';
  const outs = (optouts || []).map((o) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid #EEF1F0;padding:7px 2px;font-size:12px">
    <span>${esc(o.tel)}${o.motivo ? ' · <span style="color:#8fa39f">' + esc(o.motivo) + '</span>' : ''}</span>
    <button style="background:none;border:none;color:#0B5B66;font-size:11px;font-weight:700;cursor:pointer" onclick="optout('${esc(o.tel)}','del')">remover da lista</button>
  </div>`).join('') || '<div style="font-size:12px;color:#8fa39f">Ninguém pediu para sair ainda.</div>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Campanhas de WhatsApp — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:760px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;margin-bottom:14px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:12px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
.btn{display:inline-block;border:none;border-radius:11px;padding:12px 16px;font-size:13.5px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:0 0 6px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:760px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/diretoria" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">campanhas · whatsapp</span></a>
  <a href="/diretoria" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Painel</a>
</div></div>
<div class="wrap">
  <h1 style="font-size:21px;margin:0 0 4px">📣 Campanhas de WhatsApp</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 14px">Divulgação e oferta de coleta pelo canal <b>oficial</b> (WhatsApp Business API / Gupshup), sempre com template aprovado pela Meta.</p>

  <div style="background:#FFFAEC;border:1.5px solid #E8C87A;border-radius:14px;padding:13px 16px;margin-bottom:14px;font-size:12px;color:#6b6046;line-height:1.7">
    <b>Regras do canal (importante):</b> ① só é possível enviar <b>texto pré-aprovado pela Meta</b> (template criado no painel do Gupshup — aprovação costuma sair em minutos/horas); ② cada mensagem de marketing é <b>cobrada</b> (Brasil: tipicamente entre R$ 0,30 e R$ 0,50 — confirme o valor do contrato no painel do Gupshup); ③ se muita gente bloquear, a Meta <b>reduz a qualidade do número</b> e limita envios — por isso o limite de ${LIMITE_CAMPANHA} por campanha, a lista de saída e a dica: comece pequeno; ④ inclua no texto do template a frase para sair (ex.: "responda SAIR para não receber avisos").
  </div>

  <div class="card">
    <div class="sec">1 · Nova campanha</div>
    <label>Título (interno)</label><input id="c-titulo" placeholder="ex.: Oferta de coleta — agosto" maxlength="120">
    <label>Template aprovado</label>
    <div style="display:flex;gap:8px"><select id="c-tpl"><option value="">Carregando templates…</option></select><button type="button" class="btn btn-g" style="flex:none;padding:9px 12px;font-size:12px" onclick="carregarTemplates()">↻</button></div>
    <div id="c-aviso-tpl" style="display:none;font-size:11.5px;color:#8A6A16;background:#FFF4DE;border-radius:10px;padding:8px 11px;margin-top:8px"></div>
    <div id="c-manual" style="display:none;border:1.5px dashed #cfe0dd;border-radius:10px;padding:10px 12px;margin-top:8px">
      <div style="font-size:11px;color:#7c8a87;margin-bottom:4px">Copie do painel do Gupshup (aba Templates):</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 90px;gap:8px">
        <div><label style="margin-top:0">Nome do template</label><input id="m-nome" placeholder="ex.: ecobraz_oferta"></div>
        <div><label style="margin-top:0">ID do template</label><input id="m-id" placeholder="com hífens"></div>
        <div><label style="margin-top:0">Idioma</label><input id="m-lang" value="pt_BR"></div>
      </div>
      <div style="margin-top:6px"><label style="margin-top:0">Quantas variáveis {{n}} tem o texto?</label><input id="m-nvars" inputmode="numeric" value="0" style="width:90px" onchange="paramsManuais()"></div>
    </div>
    <div id="c-corpo" style="display:none;background:#F7FAF9;border:1px dashed #cfe0dd;border-radius:10px;padding:10px 12px;font-size:12px;color:#374b48;margin-top:8px;white-space:pre-wrap"></div>
    <div id="c-params"></div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:6px">Nas variáveis você pode usar <b>{nome}</b> (primeiro nome do contato) e <b>{empresa}</b> (nome completo) — o sistema troca para cada destinatário.</div>
    <label>Público</label>
    <select id="c-pub">${Object.entries(PUBLICOS_WA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
    <div id="c-teste-wrap"><label>Número para o teste (com DDD)</label><input id="c-tel" inputmode="tel" placeholder="ex.: 11 99999-9999"></div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
      <button type="button" class="btn btn-g" onclick="previa()">👀 Ver contagem do público</button>
      <button type="button" class="btn btn-g" onclick="window.open('/diretoria/whatsapp/lista?publico='+encodeURIComponent(el('c-pub').value),'_blank')">📋 Ver a lista completa</button>
      <button type="button" class="btn btn-d" onclick="preparar()">Preparar campanha</button>
      <span id="c-msg" style="font-size:12.5px;color:#4F6469"></span>
    </div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:8px">Preparar <b>não envia nada</b>: monta a lista (sem repetidos, sem quem pediu para sair) e mostra a campanha abaixo para você iniciar o envio quando quiser.</div>
  </div>

  <div class="card">
    <div class="sec">2 · Campanhas</div>
    ${rows}
  </div>

  <div class="card">
    <div class="sec">💰 Saldo para o painel do Marcio</div>
    <div style="font-size:12px;color:#4F6469;line-height:1.7">A API do Gupshup desta conta não deixa ler a carteira (app gerido pelo parceiro). Plano B: informe aqui o saldo que aparece no <b>painel do Gupshup</b> — o sistema desconta sozinho o custo estimado de cada mensagem disparada por aqui e mostra o <b>saldo estimado</b> no painel da Diretoria. Atualize este valor sempre que recarregar ou conferir no Gupshup.</div>
    ${saldoBase ? `<div style="font-size:12px;color:#1E7A3D;font-weight:700;margin-top:8px">Base atual: US$ ${Number(saldoBase.valor).toFixed(2)} informada em ${esc(String(saldoBase.em).slice(0, 10).split('-').reverse().join('/'))} · custo por mensagem US$ ${Number(saldoBase.custoMsg).toFixed(4)}</div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
      <div style="flex:1;min-width:140px"><label>Saldo no Gupshup (US$)</label><input id="sb-valor" inputmode="decimal" placeholder="ex.: 42.50"></div>
      <div style="flex:1;min-width:140px"><label>Custo por mensagem (US$)</label><input id="sb-custo" inputmode="decimal" value="${saldoBase ? Number(saldoBase.custoMsg).toFixed(4) : '0.07'}"></div>
      <button class="btn btn-d" style="flex:none" onclick="salvarSaldoBase()">Salvar</button>
      <span id="sb-msg" style="font-size:12px;color:#4F6469"></span>
    </div>
    <div style="font-size:10.5px;color:#9aa7a4;margin-top:6px">O custo real por mensagem de marketing aparece na fatura do Gupshup — ajuste o valor acima quando souber o exato. A estimativa considera só os disparos feitos por esta tela.</div>
  </div>

  <div class="card">
    <div class="sec">📡 Medição de entrega e respostas (configurar 1 vez)</div>
    <div style="font-size:12px;color:#4F6469;line-height:1.7">Para o sistema saber quem <b>recebeu</b>, quem <b>leu</b>, quem <b>respondeu</b> (e registrar o SAIR sozinho), o Gupshup precisa avisar o portal a cada evento. No painel do Gupshup → app ECOBRAZAPP → <b>Webhooks / Callback URL</b>, cole esta URL e marque os eventos de mensagem (sent, delivered, read, failed) e mensagens recebidas:</div>
    ${urlWebhook ? `<div style="font-family:monospace;font-size:11.5px;background:#F7FAF9;border:1px dashed #cfe0dd;border-radius:10px;padding:10px 12px;margin-top:8px;word-break:break-all" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent)">${esc(urlWebhook)}</div>
    <div style="font-size:10.5px;color:#9aa7a4;margin-top:4px">Toque na URL para copiar. Sem isso, o painel mostra só aceites e a conversão no portal (que já funciona sozinha).</div>` : ''}
  </div>

  <div class="card">
    <div class="sec">🚪 Lista de saída (opt-out)</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin-bottom:8px">Quem pediu para não receber mais (ex.: respondeu SAIR no WhatsApp do atendimento). Estes números nunca entram em campanha.</div>
    <div style="display:flex;gap:8px"><input id="o-tel" inputmode="tel" placeholder="telefone com DDD"><button class="btn btn-g" style="flex:none" onclick="optout(document.getElementById('o-tel').value,'add')">＋ Adicionar</button></div>
    <div style="margin-top:8px">${outs}</div>
  </div>
</div>
<script>
var TPLS=[];
function el(id){return document.getElementById(id);}
function msg(t,cor){var m=el('c-msg');m.style.color=cor||'#4F6469';m.textContent=t;}
async function carregarTemplates(){
  var s=el('c-tpl');s.innerHTML='<option value="">Carregando…</option>';
  var aviso=el('c-aviso-tpl');aviso.style.display='none';
  try{var r=await fetch('/api/diretoria/wa/templates');var j=await r.json();
    TPLS=j.templates||[];
    if(j.aviso){aviso.style.display='block';aviso.textContent=j.aviso;
      if(j.tentativas&&j.tentativas.length){
        var det=document.createElement('div');
        det.style.cssText='margin-top:6px;font-family:monospace;font-size:10.5px;color:#6b6046;white-space:pre-wrap';
        det.textContent='Diagnóstico (mande um print disto):\\n'+j.tentativas.map(function(t){return '• '+t.via+' → HTTP '+t.status+' · '+String(t.corpoInicio||'').slice(0,90);}).join('\\n');
        aviso.appendChild(det);
      }}
    var apr=TPLS.filter(function(t){return /approved|enabled/i.test(t.status||'');});
    s.innerHTML='<option value="">— escolha —</option>'+apr.map(function(t,i){return '<option value="'+i+'">'+t.nome+' ('+(t.idioma||'?')+')</option>';}).join('')+'<option value="manual">✍️ Digitar manualmente (nome + id do painel do Gupshup)</option>';
    window.__APR=apr;
  }catch(e){s.innerHTML='<option value="">Sem conexão</option><option value="manual">✍️ Digitar manualmente</option>';}
}
function paramsManuais(){
  var pw=el('c-params');pw.innerHTML='';
  var n=Number(el('m-nvars').value)||0;
  for(var i=1;i<=n;i++){pw.innerHTML+='<label>Variável {{'+i+'}}</label><input class="c-par" placeholder="ex.: {nome}">';}
}
el('c-tpl').addEventListener('change',function(){
  var box=el('c-corpo'),pw=el('c-params'),man=el('c-manual');pw.innerHTML='';
  if(this.value==='manual'){man.style.display='block';box.style.display='none';paramsManuais();return;}
  man.style.display='none';
  var t=(window.__APR||[])[Number(this.value)];
  if(!t){box.style.display='none';return;}
  if(t.corpo){box.style.display='block';box.textContent=t.corpo;}else{box.style.display='none';}
  var n;
  if(t.nvars!=null){n=Number(t.nvars)||0;}
  else{n=0;var m=(t.corpo||'').match(/\\{\\{\\d+\\}\\}/g);if(m){var mx=0;m.forEach(function(x){var v=Number(x.replace(/\\D/g,''));if(v>mx)mx=v;});n=mx;}
    if(!t.corpo){n=Number(prompt('Quantas variáveis {{n}} esse template tem? (0 se nenhuma)','0'))||0;}}
  for(var i=1;i<=n;i++){
    // {{1}} quase sempre é o nome — já vem preenchida com {nome} (editável).
    var sug=(t.sugestoes&&t.sugestoes[i-1])||(i===1?'{nome}':'');
    pw.innerHTML+='<label>Variável {{'+i+'}}</label><input class="c-par" placeholder="ex.: {nome}" value="'+String(sug).replace(/"/g,'&quot;')+'">';
  }
});
el('c-pub').addEventListener('change',function(){el('c-teste-wrap').style.display=this.value==='teste'?'block':'none';});
el('c-teste-wrap').style.display='block';
function dadosCampanha(){
  var sel=el('c-tpl').value, t=null;
  if(sel==='manual'){
    var nm=el('m-nome').value.trim(), idm=el('m-id').value.trim();
    if(nm||idm)t={nome:nm.replace(/ \\(aviso de coleta.*$/,''),id:idm,lang:el('m-lang').value.trim()||'pt_BR',nvars:Number(el('m-nvars').value)||0};
  }else{
    var x=(window.__APR||[])[Number(sel)];
    if(x)t={nome:String(x.nome).replace(/ \\(aviso de coleta.*$/,''),id:x.id,lang:x.idioma||'pt_BR',nvars:x.nvars!=null?Number(x.nvars):null};
  }
  return {titulo:el('c-titulo').value,template:t,
    params:[].map.call(document.querySelectorAll('.c-par'),function(x2){return x2.value;}),
    publico:el('c-pub').value,telTeste:el('c-tel').value};
}
function paramsOk(d){
  if(!d.template)return 'Escolha o template.';
  var n=d.template.nvars;
  if(n!=null&&n>0){
    if(d.params.length<n)return 'Este template tem '+n+' variável(is) — preencha todas.';
    for(var i=0;i<n;i++){if(!String(d.params[i]||'').trim())return 'Preencha a variável {{'+(i+1)+'}} — enviar sem ela faz a Meta descartar a mensagem em silêncio.';}
  }
  return '';
}
async function previa(){
  msg('Contando…');
  try{var r=await fetch('/api/diretoria/wa/previa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(dadosCampanha())});
    var j=await r.json();
    if(j.ok){msg('Público: '+j.total+' destinatário(s)'+(j.cortados?' (+'+j.cortados+' acima do limite, fora desta campanha)':'')+(j.semZap?' · '+j.semZap+' fora por não ter WhatsApp (detectado em campanha anterior)':'')+(j.exemplos&&j.exemplos.length?' · ex.: '+j.exemplos.join(', '):''));}
    else{msg(j.message||'Não deu.', '#a06a62');}}
  catch(e){msg('Sem conexão.','#a06a62');}
}
async function preparar(){
  var d=dadosCampanha();
  var erro=paramsOk(d);
  if(erro){msg(erro,'#a06a62');return;}
  msg('Preparando…');
  try{var r=await fetch('/api/diretoria/wa/preparar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j.ok){msg('✓ Campanha preparada com '+j.total+' destinatário(s)'+(j.jaReceberam?(' · '+j.jaReceberam+' já tinham recebido este template e ficaram de fora'+(j.vagasRepostas?' — as próximas empresas da fila entraram no lugar':'')):'')+'. Atualizando…','#1E7A3D');setTimeout(function(){location.reload();},900);}
    else{msg(j.message||'Não deu.','#a06a62');}}
  catch(e){msg('Sem conexão.','#a06a62');}
}
async function enviarTudo(id,btn){
  var box=btn.closest('[data-camp]');var m=box.querySelector('.lote-msg');
  if(!confirm('Iniciar/continuar o ENVIO REAL desta campanha? Cada mensagem é cobrada pelo canal oficial.'))return;
  btn.disabled=true;btn.textContent='Enviando…';
  var total=0;
  while(true){
    var j;
    try{var r=await fetch('/api/diretoria/wa/enviar-lote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id})});j=await r.json();}
    catch(e){m.textContent='Conexão caiu — clique de novo para continuar de onde parou.';btn.disabled=false;btn.textContent='▶ Continuar envio';return;}
    if(!j.ok){m.textContent=j.message||'Falha no lote.';btn.disabled=false;btn.textContent='▶ Continuar envio';return;}
    total+=j.enviados;
    m.textContent='Enviados nesta sessão: '+total+(j.falhas?' · falhas no lote: '+j.falhas:'')+' · restantes: '+j.restantes;
    if(!j.restantes){m.textContent+=' — ✅ campanha concluída!';setTimeout(function(){location.reload();},1200);return;}
  }
}
async function verResultados(id){
  var box=document.querySelector('[data-camp="'+id+'"] .resultados-box');
  if(box.style.display==='block'){box.style.display='none';return;}
  box.style.display='block';box.innerHTML='<span style="font-size:12px;color:#4F6469">Calculando…</span>';
  try{var r=await fetch('/api/diretoria/wa/metricas?id='+id);var j=await r.json();
    if(!j.ok){box.innerHTML='<span style="font-size:12px;color:#a06a62">'+(j.message||'Não deu.')+'</span>';return;}
    var c=j.canal||{},v=j.conversao||{};
    var tile=function(n,rot,cor){return '<div style="flex:1;min-width:90px;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:10px;padding:9px;text-align:center"><b style="font-size:18px;color:'+(cor||'#00333B')+';display:block">'+n+'</b><span style="font-size:10px;color:#7c8a87;font-weight:700">'+rot+'</span></div>';};
    var eh=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
    var semRetorno=!c.comRetorno;
    var blocoFalhas='';
    if(j.falhouResumo&&j.falhouResumo.length){
      var fl=j.falhouLista||[];
      blocoFalhas='<div style="background:#FDF3F1;border:1px solid #F0D8D3;border-radius:10px;padding:9px 11px;margin-top:8px">'
        +'<div style="font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#B23A2E;margin-bottom:4px">Por que falharam</div>'
        +j.falhouResumo.map(function(x){return '<div style="font-size:12px;color:#5b4340"><b>'+x.n+'</b> × '+eh(x.motivo)+'</div>';}).join('')
        +'<details style="margin-top:6px"><summary style="font-size:11.5px;font-weight:700;color:#8a5a52;cursor:pointer">📄 Ver as empresas que não receberam ('+fl.length+')</summary>'
        +'<div style="max-height:220px;overflow:auto;margin-top:6px">'+fl.map(function(f){return '<div style="font-size:11.5px;color:#5b4340;border-top:1px solid #F0D8D3;padding:4px 0"><b>'+eh(f.nome||f.tel)+'</b> <span style="color:#9aa7a4">· '+eh(f.tel)+'</span><span style="display:block;font-size:10.5px;color:#a06a62">'+eh(f.motivoTexto||'')+'</span></div>';}).join('')+'</div></details>'
        +'<div style="font-size:10.5px;color:#8a5a52;margin-top:6px">Falha de entrega não é cobrada pela Meta. Número que a Meta devolve como "sem WhatsApp" sai sozinho das próximas listas (a vaga vai para a próxima empresa da fila) — e quem falhou pode receber numa próxima campanha, porque nunca viu a mensagem.</div>'
        +'</div>';
    }
    box.innerHTML=
      '<div style="font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87;margin-bottom:6px">Canal (WhatsApp)'+(semRetorno?' — <span style="color:#8A6A16">sem retorno ainda: configure o webhook abaixo</span>':'')+'</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'+tile(j.enviadas,'aceitas')+tile(c.entregues,'entregues','#0B5B66')+tile(c.lidas,'lidas','#1E5B31')+tile(c.responderam,'responderam','#1E5B31')+tile(c.falharam,'falhou entrega','#B23A2E')+tile(Math.max(0,(j.enviadas||0)-((c&&c.comRetorno)||0)),'sem confirmação ainda','#6B7B78')+tile(j.sairam,'pediram SAIR','#8A6A16')+'</div>'
      +((j.enviadas||0)-((c&&c.comRetorno)||0)>0?'<div style="font-size:10.5px;color:#7c8a87;margin-top:6px">"Sem confirmação ainda" = a Meta aceitou e ainda não devolveu o recibo de entrega — as falhas de número morto voltam na hora, mas as entregas podem levar horas para confirmar. O número cai sozinho conforme os recibos chegam.</div>':'')
      +blocoFalhas
      +'<div style="font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87;margin:10px 0 6px">Conversão no portal (desde '+j.desde.split('-').reverse().join('/')+')</div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap">'+tile(v.portal,'entraram no portal','#0B5B66')+tile(v.solicitacoes,'pediram coleta','#1E5B31')+tile(v.novasOS,'viraram OS','#1E5B31')+'</div>'
      +'<div style="font-size:10.5px;color:#9aa7a4;margin-top:6px">Honestidade da medição: "entrou no portal depois do disparo" é correlação (a pessoa pode ter entrado por outro motivo) — mas é o termômetro real de resultado. Entregas/leituras dependem do webhook configurado e do WhatsApp do cliente (recibo de leitura desligado não conta "lida").</div>';
  }catch(e){box.innerHTML='<span style="font-size:12px;color:#a06a62">Sem conexão.</span>';}
}
async function verFalhas(id){
  var box=document.querySelector('[data-camp="'+id+'"] .falhas-box');
  if(box.style.display==='block'){box.style.display='none';return;}
  box.style.display='block';box.textContent='Carregando falhas…';
  try{var r=await fetch('/api/diretoria/wa/falhas?id='+id);var j=await r.json();
    box.innerHTML=(j.falhas||[]).map(function(f){return '• '+(f.nome||f.tel)+' — '+(f.detalhe||'sem detalhe');}).join('<br>')||'Nenhuma falha registrada.';}
  catch(e){box.textContent='Não consegui carregar.';}
}
async function salvarSaldoBase(){
  var m=el('sb-msg');m.style.color='#4F6469';m.textContent='Salvando…';
  try{var r=await fetch('/api/diretoria/wa/saldo-base',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({valor:el('sb-valor').value,custoMsg:el('sb-custo').value})});
    var j=await r.json(); if(j.ok){m.style.color='#1E7A3D';m.textContent='✓ Salvo! O painel da Diretoria já mostra o saldo estimado.';setTimeout(function(){location.reload();},900);}
    else{m.style.color='#a06a62';m.textContent=j.message||'Não deu.';}}
  catch(e){m.style.color='#a06a62';m.textContent='Sem conexão.';}
}
async function optout(tel,acao){
  try{var r=await fetch('/api/diretoria/wa/optout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tel:tel,acao:acao})});
    var j=await r.json(); if(j.ok)location.reload(); else alert(j.message||'Não deu.');}
  catch(e){alert('Sem conexão.');}
}
carregarTemplates();
</script></body></html>`;
}
