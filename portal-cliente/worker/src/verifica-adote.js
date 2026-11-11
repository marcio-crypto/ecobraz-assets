// Verificação SÓ LEITURA (diretoria) — fichas criadas pela compra PÚBLICA do
// "Adote um Bairro".
//
// Por que existe: até 11/11/2026 a rota pública POST /api/adote/contratar criava a
// ficha do cliente com os dados DIGITADOS no formulário quando o CNPJ existia na
// base (D1) mas ainda não tinha ficha (KV). O espelhamento sobrescrevia a linha da
// empresa na base e o e-mail digitado passava a entrar no portal como a empresa.
// A falha foi corrigida; esta tela responde "ela chegou a ser usada?".
//
// Como responde: toda ficha criada por aquela rota carrega origem:'adote' — desde
// a 1ª versão da loja (24/07/2026); o "Editar" da equipe preserva a marca e o
// sistema nunca apaga fichas. A verificação acha essas fichas e, para cada uma,
// confere se o CNPJ JÁ TINHA histórico ANTES de a ficha existir. É esse o caso
// suspeito: aí o e-mail da ficha pode ser de um terceiro.
//
// REGRAS DESTE MÓDULO
//  • Só lê: KV.get / KV.list e SELECT no D1. Nada de put/delete/UPDATE/INSERT.
//    (Por isso NÃO usa materializarClienteKV nem curarContatosKV, que gravam.)
//  • Não remove acesso de ninguém: mostra o caso e aponta o botão "Remover acesso"
//    da ficha. A decisão é da equipe.
//  • Em lotes: a varredura lê LOTE_VARREDURA fichas por chamada (o navegador
//    repete até o fim) e a análise é UMA ficha por chamada — o custo de cada
//    chamada é limitado, seja qual for o tamanho da base.
//  • Falha de leitura nunca vira "está tudo certo": o que não deu para conferir
//    volta como "não conferido".

import { lerCliente, listarClientes, emailsDoCliente } from './cadastro.js';
import { listarColetasOS } from './coletas.js';
import { lerCredito } from './adote.js';
import { lerGestores } from './cliente-portal.js';

export const LOTE_VARREDURA = 200;
// espelharClienteD1 numera os cadastros criados pelo sistema a partir daqui; abaixo
// disso o número veio do Ploomes (cadastro migrado).
const ID_NOVO_MIN = 900000000;
const DIAS_USO = 60; // janela das marcas de acesso (uso:c:{dia}:{doc})

const digits = (s) => String(s || '').replace(/\D/g, '');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const chaveNome = (s) => limpar(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const emailLimpo = (s) => String(s || '').trim().toLowerCase();
const DOC_SQL = "REPLACE(REPLACE(REPLACE(REPLACE(documento,'.',''),'-',''),'/',''),' ','')";
const fmtCNPJ = (v) => { const d = digits(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : String(v || '')); };
const ms = (v) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : null; };
// true = antes da ficha · false = no mesmo instante ou depois · null = sem data legível.
const antesDe = (quando, T) => { const t = ms(quando); return (t == null || T == null) ? null : t < T; };
// Data em Brasília (UTC−3), só para as frases prontas.
const dataBR = (v) => { const t = ms(v); if (t == null) return ''; const d = new Date(t - 3 * 3600e3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
const ehAdote = (rec) => !!rec && String(rec.origem || '').trim().toLowerCase() === 'adote';

// Roda `fn` sobre os itens com no máximo `n` leituras ao mesmo tempo.
async function emParalelo(itens, n, fn) {
  const out = new Array(itens.length);
  let i = 0;
  const fila = async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k], k); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, itens.length)) }, fila));
  return out;
}

// O que a tela precisa da ficha (nada além disso sai do armazenamento).
function resumoFicha(rec, idChave) {
  const pj = rec.tipo !== 'PF';
  return {
    id: String(idChave || rec.id || ''),
    tipo: pj ? 'PJ' : 'PF',
    nome: limpar(pj ? (rec.razaoSocial || rec.nomeFantasia) : rec.nome).slice(0, 200),
    doc: digits(pj ? rec.cnpj : rec.cpf),
    emails: emailsDoCliente(rec).slice(0, 12),
    totalEmails: emailsDoCliente(rec).length,
    // O e-mail do TOPO da ficha é o que foi digitado na compra pública: o formulário
    // de edição de empresa não tem campo para ele (a equipe só mexe nos contatos).
    emailFormulario: emailLimpo(rec.email),
    criadoEm: String(rec.criadoEm || ''),
    atualizadoEm: String(rec.atualizadoEm || ''),
    atualizadoPor: String(rec.atualizadoPor || ''),
  };
}

// ---------------------------------------------------------------------------
// FASE 1 — VARREDURA. Lista as chaves cli:* do armazenamento (pega TODA ficha,
// inclusive alguma que tenha caído do índice cli:index) e lê cada uma. Devolve as
// que têm origem 'adote', quantas leu e o cursor para a próxima chamada.
// ---------------------------------------------------------------------------
export async function varrerFichasAdote(env, cursor) {
  const out = { ok: false, lidas: 0, semLeitura: [], achados: [], proximo: '', fim: false, totalIndice: null, erro: '' };
  const kv = env.PORTAL_KV;
  if (!kv || typeof kv.list !== 'function') { out.erro = 'Armazenamento das fichas indisponível.'; return out; }
  const c = String(cursor || '').slice(0, 1024);
  let pagina;
  try { pagina = await kv.list({ prefix: 'cli:', limit: LOTE_VARREDURA, ...(c ? { cursor: c } : {}) }); }
  catch { out.erro = 'Não consegui listar as fichas agora.'; return out; }
  const nomes = (pagina.keys || []).map((k) => k.name).filter((n) => n !== 'cli:index');
  const lidos = await emParalelo(nomes, 6, async (nome) => {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try { const raw = await kv.get(nome); return raw ? JSON.parse(raw) : null; } catch { /* tenta mais uma vez */ }
    }
    return null;
  });
  nomes.forEach((nome, i) => {
    const rec = lidos[i];
    const id = nome.slice(4);
    if (!rec || typeof rec !== 'object') { out.semLeitura.push(id); return; }
    out.lidas++;
    if (ehAdote(rec)) out.achados.push(resumoFicha(rec, id));
  });
  // Só na 1ª chamada: tamanho do índice, para a barra de progresso e a conferência final.
  if (!c) { try { out.totalIndice = (await listarClientes(env)).length; } catch { out.totalIndice = null; } }
  out.fim = !!pagina.list_complete || !pagina.cursor;
  out.proximo = out.fim ? '' : String(pagina.cursor);
  out.ok = true;
  return out;
}

// Nome e e-mail ORIGINAIS de um cadastro migrado: o registro completo do Ploomes
// fica em dados_json e a sobrescrita da compra pública não tocava nessa coluna.
function originalDoPloomes(dadosJson) {
  const txt = String(dadosJson || '');
  if (!txt) return null;
  try {
    const o = JSON.parse(txt);
    if (!o || typeof o !== 'object') return null;
    const email = (Array.isArray(o.Emails) && o.Emails[0] && o.Emails[0].Email) || o.Email || '';
    return { nome: limpar(o.LegalName || o.Name || ''), email: emailLimpo(email) };
  } catch {
    // O registro é guardado cortado em 24 mil caracteres: se o corte quebrou o JSON,
    // os campos do topo (os primeiros do texto) ainda são legíveis.
    const pega = (campo) => { const m = txt.match(new RegExp(`"${campo}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)); if (!m) return ''; try { return JSON.parse(`"${m[1]}"`); } catch { return m[1]; } };
    const nome = limpar(pega('LegalName') || pega('Name'));
    const email = emailLimpo(pega('Email'));
    return (nome || email) ? { nome, email } : null;
  }
}

// Em quantos dos últimos 60 dias este CNPJ acessou o portal. O registro é por
// CNPJ/dia — não guarda QUAL e-mail entrou.
async function diasDeUso(env, doc) {
  const dias = Array.from({ length: DIAS_USO }, (_, i) => new Date(Date.now() - 3 * 3600e3 - i * 86400e3).toISOString().slice(0, 10));
  const marcas = await emParalelo(dias, 6, async (d) => ((await env.PORTAL_KV.get(`uso:c:${d}:${doc}`)) ? d : ''));
  const ok = marcas.filter(Boolean).sort();
  return { janelaDias: DIAS_USO, dias: ok.length, primeiro: ok[0] || '', ultimo: ok[ok.length - 1] || '' };
}

// ---------------------------------------------------------------------------
// FASE 2 — ANÁLISE de UMA ficha. Relê a ficha pelo id (nunca confia em dado vindo
// do navegador) e cruza com a base, as ordens de coleta, o pagamento e o login.
// `reconhecerLogin` = a MESMA função que o login do portal usa (buscarClienteBase).
// ---------------------------------------------------------------------------
export async function analisarFichaAdote(env, id, { reconhecerLogin } = {}) {
  const idLimpo = String(id || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
  if (!env.PORTAL_KV || !idLimpo) return { ok: false, erro: 'Ficha não encontrada.' };
  const rec = await lerCliente(env, idLimpo);
  if (!rec) return { ok: false, erro: 'Ficha não encontrada.' };
  if (!ehAdote(rec)) return { ok: false, erro: 'Esta ficha não foi criada pela compra pública do Adote.' };

  const ficha = resumoFicha(rec, idLimpo);
  const T = ms(ficha.criadoEm);
  const cnpjOk = ficha.tipo === 'PJ' && ficha.doc.length === 14;
  const motivos = []; // por que é suspeita (frases prontas, em linguagem simples)
  const duvidas = []; // o que impediu concluir
  const avisos = [];  // consultas acessórias que falharam (não mudam o veredito)

  if (T == null) duvidas.push('A ficha está sem data de criação — não dá para saber o que veio antes dela.');
  if (!cnpjOk) duvidas.push('A ficha está sem um CNPJ válido — não dá para cruzar com a base de clientes.');

  // --- 1) Base de clientes (D1): o CNPJ já existia antes desta ficha? -------------
  const base = { conferida: false, linhas: [], negocios: { n: 0, antes: 0, semData: 0, maisAntigo: '', maisRecente: '', limite: false }, pessoas: { n: 0, comEmail: 0, antes: 0 } };
  // E-mails que já eram do cliente ANTES da ficha: o e-mail original da empresa
  // (registro do Ploomes) e os das pessoas de contato vinculadas. Servem para não
  // tratar como "terceiro" quem já era contato do cliente.
  const emailsAntigos = new Set();
  // Custo: 3 consultas por ficha (cadastros do CNPJ, pessoas vinculadas, atendimentos
  // antigos). A comparação do CNPJ sem pontuação varre a tabela de contatos — mesmo
  // preço da checagem da própria rota de compra — por isso a tela confere poucas
  // fichas por rodada.
  if (cnpjOk) {
    if (!env.DB_PLOOMES) duvidas.push('A base de clientes não respondeu nesta consulta.');
    else {
      try {
        const q = await env.DB_PLOOMES.prepare(`SELECT ploomes_id, nome, email, criado_em, dados_json FROM contatos WHERE ${DOC_SQL}=?1 ORDER BY ploomes_id LIMIT 20`).bind(ficha.doc).all();
        for (const l of (q.results || [])) {
          const idNum = Number(l.ploomes_id) || 0;
          const original = originalDoPloomes(l.dados_json);
          const emailAtual = emailLimpo(l.email);
          const nomeAtual = limpar(l.nome);
          if (original && original.email && antesDe(l.criado_em, T) !== false) emailsAntigos.add(original.email);
          base.linhas.push({
            id: idNum,
            migrado: idNum > 0 && idNum < ID_NOVO_MIN,
            criadoEm: String(l.criado_em || ''),
            antes: antesDe(l.criado_em, T),
            nomeAtual, emailAtual,
            emailEhDaFicha: !!emailAtual && ficha.emails.includes(emailAtual),
            original, // null = sem registro original guardado
            nomeMudou: !!(original && original.nome && nomeAtual && chaveNome(original.nome) !== chaveNome(nomeAtual)),
            emailMudou: !!(original && emailAtual !== original.email),
          });
        }
        const ids = base.linhas.map((l) => l.id).filter((n) => n > 0);
        if (ids.length) {
          const ph = ids.map((_, i) => '?' + (i + 1)).join(',');
          const [neg, pes] = await env.DB_PLOOMES.batch([
            env.DB_PLOOMES.prepare(`SELECT criado_em FROM negocios WHERE contact_id IN (${ph}) LIMIT 2000`).bind(...ids),
            env.DB_PLOOMES.prepare(`SELECT ploomes_id, email, criado_em FROM contatos WHERE company_id IN (${ph}) LIMIT 500`).bind(...ids),
          ]);
          const datasNeg = [];
          for (const n of ((neg && neg.results) || [])) {
            base.negocios.n++;
            const a = antesDe(n.criado_em, T);
            if (a === true) base.negocios.antes++; else if (a === null) base.negocios.semData++;
            const t = ms(n.criado_em); if (t != null) datasNeg.push(t);
          }
          base.negocios.limite = base.negocios.n >= 2000;
          if (datasNeg.length) { base.negocios.maisAntigo = new Date(Math.min(...datasNeg)).toISOString(); base.negocios.maisRecente = new Date(Math.max(...datasNeg)).toISOString(); }
          for (const p of ((pes && pes.results) || [])) {
            base.pessoas.n++;
            const emP = emailLimpo(p.email);
            if (emP) base.pessoas.comEmail++;
            const aP = antesDe(p.criado_em, T);
            if (aP === true) base.pessoas.antes++;
            // Pessoa vinda do Ploomes sem data legível conta como anterior (já estava lá).
            if (emP && (aP === true || (aP === null && Number(p.ploomes_id) < ID_NOVO_MIN))) emailsAntigos.add(emP);
          }
        }
        base.conferida = true;
      } catch { duvidas.push('A consulta à base de clientes falhou — rode a verificação de novo.'); }
    }
  }

  // --- 2) Ordens de coleta do sistema (os:index) deste CNPJ ----------------------
  const os = { conferida: false, antes: 0, depois: 0, semData: 0, numeros: [] };
  try {
    for (const o of (await listarColetasOS(env))) {
      if (!o) continue;
      const mesmoDoc = cnpjOk && digits(o.clienteDoc) === ficha.doc;
      const mesmaFicha = !!o.clienteId && String(o.clienteId) === ficha.id;
      if (!mesmoDoc && !mesmaFicha) continue;
      const a = antesDe(o.criadoEm, T);
      if (a === true) os.antes++; else if (a === false) os.depois++; else os.semData++;
      if (os.numeros.length < 6) os.numeros.push(String(o.numero || o.id || '').slice(0, 30));
    }
    os.conferida = true;
  } catch { duvidas.push('Não consegui ler a lista de ordens de coleta — rode a verificação de novo.'); }

  // --- 3) Houve pagamento? (crédito do Adote só nasce de compra PAGA) -------------
  const compra = { conferida: false, paga: false, compradoKg: 0, saldoKg: 0, desde: '' };
  try {
    const c = await lerCredito(env, ficha.id);
    compra.conferida = true;
    if (c) {
      compra.compradoKg = Number(c.compradoKg) || 0;
      compra.saldoKg = Number(c.saldoKg) || 0;
      compra.desde = String(c.criadoEm || '');
      compra.paga = compra.compradoKg > 0 || (Array.isArray(c.historico) && c.historico.some((h) => h && (h.evento === 'compra' || h.evento === 'recarga')));
    }
  } catch { avisos.push('Não consegui conferir se houve pagamento.'); }

  // --- 4) Gestores criados DENTRO do portal deste CNPJ ---------------------------
  // Quem entra como administrador do cliente pode cadastrar outros e-mails; eles
  // continuam entrando mesmo depois de o e-mail da ficha ser removido.
  let gestores = [];
  if (cnpjOk) {
    try { gestores = ((await lerGestores(env, ficha.doc)).gestores || []).slice(0, 30).map((g) => ({ email: emailLimpo(g && g.email), nome: limpar(g && g.nome).slice(0, 100), nivel: String((g && g.nivel) || '') })).filter((g) => g.email); }
    catch { avisos.push('Não consegui ler os gestores cadastrados no portal deste cliente.'); }
  }

  // --- 5) Cada e-mail da ficha: entra hoje no portal como este CNPJ? -------------
  const emails = [];
  for (const em of ficha.emails) {
    const item = {
      email: em, situacao: 'nao_conferido', como: '', removido: null,
      origem: em === ficha.emailFormulario ? 'formulario' : 'contato',
      jaEraDoCliente: base.conferida ? emailsAntigos.has(em) : null, // null = não deu para saber
    };
    if (cnpjOk) {
      try {
        const raw = await env.PORTAL_KV.get(`clirev:${ficha.doc}:${em}`);
        if (raw) { const v = JSON.parse(raw); item.removido = { em: String(v.em || ''), por: String(v.por || ''), motivo: String(v.motivo || '') }; }
      } catch { /* a trilha é informativa; o teste de login abaixo é o que vale */ }
    }
    // Contato que já era do cliente antes da ficha não está em questão: não gasta consulta.
    if (item.origem !== 'formulario' && item.jaEraDoCliente === true) { item.situacao = 'nao_testado'; emails.push(item); continue; }
    if (typeof reconhecerLogin === 'function') {
      try {
        const cli = await reconhecerLogin(em, env);
        if (cli && cli.liberado) {
          const docLogin = digits(cli.documento);
          if (cnpjOk && docLogin === ficha.doc) {
            item.situacao = 'entra';
            item.como = cli.contactId ? 'pelo cadastro da base (o e-mail está gravado na linha da empresa ou de um contato)' : (gestores.some((g) => g.email === em) ? 'como gestor cadastrado no portal do cliente' : 'pela ficha do sistema');
          } else {
            item.situacao = 'entra_outro';
            item.como = [limpar(cli.nome), docLogin ? fmtCNPJ(docLogin) : ''].filter(Boolean).join(' · ');
          }
        } else item.situacao = item.removido ? 'removido' : 'nao_entra';
      } catch { item.situacao = 'nao_conferido'; }
    }
    emails.push(item);
  }
  // O reconhecimento do login segue adiante quando a base falha (para não trancar
  // cliente por um soluço). Aqui isso não serve: sem a base, "não entra" não é prova.
  if (cnpjOk && !base.conferida) for (const e of emails) if (e.situacao === 'nao_entra') e.situacao = 'nao_conferido';

  // Acessos que a equipe JÁ removeu deste CNPJ — inclusive de e-mail que não está
  // mais na ficha (a ficha pode ter sido corrigida antes desta verificação).
  const removidos = [];
  if (cnpjOk && typeof env.PORTAL_KV.list === 'function') {
    try {
      const l = await env.PORTAL_KV.list({ prefix: `clirev:${ficha.doc}:`, limit: 30 });
      for (const k of (l.keys || [])) {
        try { const v = JSON.parse((await env.PORTAL_KV.get(k.name)) || 'null'); if (v && v.email) removidos.push({ email: emailLimpo(v.email), em: String(v.em || ''), por: String(v.por || ''), motivo: String(v.motivo || '') }); } catch { /* segue */ }
      }
    } catch { avisos.push('Não consegui ler a trilha de acessos removidos deste cliente.'); }
  }

  // --- 6) Outras fichas com o mesmo CNPJ (informativo) ---------------------------
  const indice = { conferido: false, noIndice: false, outras: [] };
  try {
    const idx = await listarClientes(env);
    indice.noIndice = idx.some((c) => c && String(c.id) === ficha.id);
    if (cnpjOk) indice.outras = idx.filter((c) => c && digits(c.doc) === ficha.doc && String(c.id) !== ficha.id).map((c) => String(c.id)).slice(0, 5);
    indice.conferido = true;
  } catch { avisos.push('Não consegui conferir o índice de clientes.'); }

  // --- Veredito -----------------------------------------------------------------
  const antigas = base.linhas.filter((l) => l.antes === true);
  if (antigas.length) {
    const maisVelha = antigas.slice().sort((a, b) => (ms(a.criadoEm) || 0) - (ms(b.criadoEm) || 0))[0];
    motivos.push(`O CNPJ já tinha cadastro na base desde ${dataBR(maisVelha.criadoEm)}${maisVelha.migrado ? ' (cadastro vindo do Ploomes)' : ''} — antes de esta ficha existir.`);
  }
  const migradasSemData = base.linhas.filter((l) => l.antes === null && l.migrado);
  if (migradasSemData.length) motivos.push('O CNPJ tem cadastro vindo do Ploomes sem data de criação legível — tratado como anterior à ficha.');
  if (base.negocios.antes > 0) motivos.push(`${base.negocios.antes}${base.negocios.limite ? '+' : ''} atendimento(s) antigo(s) do Ploomes ligados a este CNPJ, anteriores à ficha (o mais antigo de ${dataBR(base.negocios.maisAntigo)}).`);
  if (base.negocios.semData > 0) motivos.push(`${base.negocios.semData} atendimento(s) do Ploomes ligados a este CNPJ, sem data legível — tratados como anteriores à ficha.`);
  if (base.pessoas.antes > 0) motivos.push(`${base.pessoas.antes} pessoa(s) de contato já vinculada(s) à empresa antes da ficha.`);
  if (os.antes > 0) motivos.push(`${os.antes} ordem(ns) de coleta do sistema para este CNPJ criada(s) antes da ficha.`);

  if (base.linhas.some((l) => l.antes === null && !l.migrado)) duvidas.push('Há cadastro deste CNPJ na base sem data de criação — não dá para saber se é anterior à ficha.');
  if (os.semData > 0) duvidas.push(`${os.semData} ordem(ns) de coleta deste CNPJ sem data — não dá para saber se são anteriores à ficha.`);

  // 'suspeita'        — CNPJ com histórico anterior e o e-mail da compra NÃO era do cliente
  //                     (ou a ficha já não guarda o e-mail digitado: não dá para descartar);
  // 'email_do_cliente'— CNPJ com histórico anterior, mas o e-mail digitado já estava na base
  //                     do cliente antes da ficha: não há terceiro (só o cadastro pode ter
  //                     sido sobrescrito);
  // 'sem_historico'   — empresa que chegou pela própria compra;
  // 'nao_conferido'   — alguma consulta falhou.
  let veredito = 'nao_conferido';
  if (motivos.length) veredito = (base.conferida && ficha.emailFormulario && emailsAntigos.has(ficha.emailFormulario)) ? 'email_do_cliente' : 'suspeita';
  else if (!duvidas.length && base.conferida && os.conferida) veredito = 'sem_historico';

  // Acessos ao portal nos últimos 60 dias — só onde isso pesa (suspeita ou dúvida).
  let uso = null;
  if (cnpjOk && veredito !== 'sem_historico') {
    try { uso = await diasDeUso(env, ficha.doc); } catch { avisos.push('Não consegui ler o registro de acessos ao portal.'); }
  }

  return { ok: true, ficha, veredito, motivos, duvidas, avisos, base, os, compra, emails, removidos, gestores, uso, indice };
}

// ---------------------------------------------------------------------------
// TELA (diretoria). O navegador chama a varredura em lotes e depois a análise de
// cada ficha achada. Todo texto vindo dos dados passa por esc() antes de ir para
// a página — o nome e o e-mail de uma ficha destas foram digitados por um
// visitante num formulário público.
// ---------------------------------------------------------------------------
export function paginaVerificaAdote() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Verificação — compra pública do Adote — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:900px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;margin-bottom:14px}
h1{font-size:20px;margin:0 0 6px;color:#00333B}h2{font-size:15px;margin:0 0 4px;color:#00333B}
p{font-size:13.5px;line-height:1.65;color:#28413f;margin:0 0 10px}
.mut{color:#7c8a87;font-size:12px;line-height:1.6}
.rot{font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7c8a87;margin:14px 0 6px}
.chip{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:4px 11px;white-space:nowrap}
.c-sus{background:#FBE9E6;color:#A12B1F;border:1px solid #F0C4BD}
.c-ok{background:#E4F3E6;color:#1E6B34;border:1px solid #BFE0C5}
.c-nc{background:#EEF1F0;color:#4F6469;border:1px solid #D5DDDB}
.c-av{background:#FFF4DE;color:#8A6A16;border:1px solid #F0DCA6}
.kpi{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 2px}
.kpi>div{flex:1;min-width:120px;border:1px solid #E4EBE9;border-radius:12px;padding:12px;text-align:center;background:#FBFDFC}
.kpi b{display:block;font-size:24px;line-height:1;color:#0B5B66}.kpi span{font-size:10px;font-weight:800;letter-spacing:.05em;color:#7c8a87;text-transform:uppercase}
.linha{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;border:1px solid #EEF1F0;border-radius:10px;padding:9px 12px;margin-bottom:7px;font-size:13px}
.linha b{word-break:break-all}
ul{margin:4px 0 8px;padding-left:20px}li{font-size:13px;line-height:1.6;color:#28413f;margin-bottom:3px}
.btn{display:inline-block;background:#00333B;color:#fff;border:none;border-radius:10px;padding:11px 16px;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer;font-family:inherit}
.btn.sec{background:#fff;color:#00333B;border:1px solid #cfe0dd}
.barra{background:#EEF3F1;border-radius:6px;height:10px;overflow:hidden;margin:10px 0 6px}.barra>div{height:100%;background:#7FB03C;width:0;transition:width .3s}
.passo{background:#FFFBEF;border:1px solid #F0E6D2;border-radius:10px;padding:11px 14px;margin-top:10px}
.passo ol{margin:6px 0 0;padding-left:20px}.passo li{color:#5d4a12}
table{width:100%;border-collapse:collapse;font-size:12.5px}td{padding:6px 0;border-top:1px solid #EEF1F0;vertical-align:top}td:first-child{color:#6B7B78;width:38%;padding-right:10px}
</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:10px">
  <a href="/diretoria" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">diretoria · verificação</span></a>
  <a href="/diretoria" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Painel</a>
</div></div>
<div class="wrap">
  <div class="card">
    <h1>Compra pública do Adote um Bairro — alguém recebeu acesso indevido?</h1>
    <p>Até <b>11/11/2026</b>, quem comprava o Adote um Bairro pelo site (sem login) e digitava o CNPJ de uma empresa que <b>já era cliente</b> tinha os dados digitados gravados por cima do cadastro dessa empresa — inclusive o e-mail, que passava a <b>entrar no portal como se fosse o cliente</b>. A falha foi corrigida. Esta tela mostra se ela chegou a ser usada.</p>
    <p class="mut" style="margin:0"><b>Como ler:</b> <span class="chip c-sus">🔴 Suspeita</span> o CNPJ já tinha histórico na base antes de a ficha ser criada — o e-mail da ficha pode ser de um terceiro. <span class="chip c-av">🟡 E-mail já era do cliente</span> o CNPJ tinha histórico, mas o e-mail usado na compra já estava no cadastro do cliente — não há terceiro. <span class="chip c-ok">🟢 Sem histórico anterior</span> empresa que chegou pela própria compra. <span class="chip c-nc">⚪ Não conferida</span> alguma consulta falhou — rode de novo.<br><b>Esta tela só lê.</b> Não altera ficha, acesso nem a base. Remover um acesso é decisão da equipe, na ficha do cliente.</p>
  </div>

  <div class="card" id="andamento">
    <h2 id="andTitulo">Lendo as fichas…</h2>
    <div class="barra"><div id="barra"></div></div>
    <div class="mut" id="andTexto">Começando.</div>
    <div id="andAcao" style="margin-top:12px;display:none"><button class="btn" onclick="iniciar()">Tentar de novo</button></div>
  </div>

  <div id="resumo"></div>
  <div id="lista"></div>

  <div class="card" id="limites" style="display:none">
    <h2>O que esta verificação cobre — e o que não cobre</h2>
    <ul>
      <li><b>Cobre:</b> todas as fichas guardadas no sistema, uma a uma. Toda compra pública do Adote grava a marca de origem na ficha desde a primeira versão da loja (24/07/2026), a edição pela equipe mantém a marca e o sistema não apaga fichas.</li>
      <li><b>"Entra no portal hoje"</b> é o mesmo teste que o login faz, no momento em que você abriu esta tela.</li>
      <li><b>Não cobre:</b> quem de fato entrou. O registro de acessos guarda 60 dias e é por CNPJ — não diz qual e-mail entrou.</li>
      <li><b>Não cobre:</b> pedidos do Adote que não foram pagos e têm mais de 35 dias — eles expiram do registro. A ficha criada por eles continua aparecendo aqui.</li>
    </ul>
  </div>
</div>
<script>
var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');};
var el=function(id){return document.getElementById(id);};
var fmtDoc=function(v){var d=String(v||'').replace(/\\D/g,'');if(d.length===14)return d.replace(/^(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})$/,'$1.$2.$3/$4-$5');if(d.length===11)return d.replace(/^(\\d{3})(\\d{3})(\\d{3})(\\d{2})$/,'$1.$2.$3-$4');return v||'(sem documento)';};
var fmtData=function(v,comHora){var t=Date.parse(String(v||''));if(!isFinite(t))return '';var d=new Date(t-3*3600e3);var p=function(n){return String(n).padStart(2,'0');};var s=p(d.getUTCDate())+'/'+p(d.getUTCMonth()+1)+'/'+d.getUTCFullYear();return comHora?s+' às '+p(d.getUTCHours())+':'+p(d.getUTCMinutes()):s;};
var fmtDia=function(v){var a=String(v||'').split('-');return a.length===3?a[2]+'/'+a[1]+'/'+a[0]:'';};
var espera=function(msv){return new Promise(function(r){setTimeout(r,msv);});};

// Busca JSON com até 3 tentativas. Sessão vencida ou falha repetida interrompe —
// uma varredura pela metade nunca é apresentada como resultado.
async function buscar(url){
  var ultimo='';
  for(var t=0;t<3;t++){
    try{
      var r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store'});
      if(r.status===401)throw {parar:true,sessao:true,msg:'Sua sessão da diretoria expirou. Recarregue a página e entre de novo.'};
      var j=await r.json();
      if(j&&j.ok)return j;
      ultimo=(j&&j.erro)||('erro '+r.status);
      if(j&&j.definitivo)throw {parar:true,msg:ultimo};
    }catch(e){if(e&&e.parar)throw e;ultimo=(e&&e.message)||'falha de conexão';}
    await espera(700*(t+1));
  }
  throw {parar:true,msg:ultimo||'falha'};
}

var CHIP={suspeita:'<span class="chip c-sus">🔴 Suspeita</span>',email_do_cliente:'<span class="chip c-av">🟡 E-mail já era do cliente</span>',sem_historico:'<span class="chip c-ok">🟢 Sem histórico anterior</span>',nao_conferido:'<span class="chip c-nc">⚪ Não conferida</span>'};
var ORDEM={suspeita:0,nao_conferido:1,email_do_cliente:2,sem_historico:3};

// É este o e-mail que a tela pede para conferir: digitado na compra pública, numa
// ficha suspeita, e que não era do cliente antes.
function ehAlvo(e,a){return a.veredito==='suspeita'&&e.origem==='formulario'&&e.jaEraDoCliente!==true;}
function linhaEmail(e,a){
  var alvo=ehAlvo(e,a),s='';
  var de=e.origem==='formulario'?'digitado na compra pública':(e.jaEraDoCliente===true?'já era contato do cliente antes da ficha':'contato incluído na ficha depois');
  if(e.origem==='formulario'&&e.jaEraDoCliente===true)de+=' · já era do cliente antes da ficha';
  if(e.situacao==='entra')s=(alvo?'<span class="chip c-sus">ENTRA no portal como este CNPJ</span>':'<span class="chip c-nc">Entra no portal como este CNPJ</span>')+' <span class="mut">'+esc(e.como)+'</span>';
  else if(e.situacao==='removido')s='<span class="chip c-ok">Acesso já removido</span> <span class="mut">'+esc([e.removido&&e.removido.em?'em '+fmtData(e.removido.em):'',e.removido&&e.removido.motivo,e.removido&&e.removido.por?'por '+e.removido.por:''].filter(Boolean).join(' · '))+'</span>';
  else if(e.situacao==='nao_entra')s='<span class="chip c-ok">Não entra no portal</span>';
  else if(e.situacao==='entra_outro')s='<span class="chip c-av">Entra, mas como outro cadastro</span> <span class="mut">'+esc(e.como)+'</span>';
  else if(e.situacao==='nao_testado')s='<span class="mut">contato antigo do cliente — não está em questão</span>';
  else s='<span class="chip c-nc">Não conferido</span>';
  return '<div class="linha"'+(alvo?' style="border-color:#F0C4BD;background:#FFFAF9"':'')+'><div style="flex:1;min-width:190px"><b>'+esc(e.email)+'</b><div class="mut">'+esc(de)+'</div></div><span>'+s+'</span></div>';
}

function cartao(a){
  var f=a.ficha,h='';
  h+='<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div style="min-width:0"><h2 style="word-break:break-word">'+esc(f.nome||'(sem razão social)')+'</h2><div class="mut">CNPJ '+esc(fmtDoc(f.doc))+' · ficha '+esc(f.id)+'</div></div><div>'+(CHIP[a.veredito]||CHIP.nao_conferido)+'</div></div>';
  h+='<table style="margin-top:10px"><tr><td>Ficha criada pela compra pública em</td><td><b>'+esc(fmtData(f.criadoEm,true)||'sem data')+'</b></td></tr>';
  if(f.atualizadoEm&&f.atualizadoEm!==f.criadoEm)h+='<tr><td>Última alteração da ficha</td><td>'+esc(fmtData(f.atualizadoEm,true))+(f.atualizadoPor?' · por '+esc(f.atualizadoPor):' · pelo sistema')+'</td></tr>';
  h+='<tr><td>Houve pagamento?</td><td>'+(!a.compra.conferida?'não conferido':(a.compra.paga?'<b>Sim</b> — '+esc(String(a.compra.compradoKg))+' kg comprados (saldo '+esc(String(a.compra.saldoKg))+' kg)':'<b>Não</b> — nenhum pagamento do Adote confirmado para esta ficha'))+'</td></tr></table>';

  if(a.veredito==='suspeita'){
    var alv=a.emails.filter(function(e){return ehAlvo(e,a);});
    var ent=alv.filter(function(e){return e.situacao==='entra';}).length,inc=alv.filter(function(e){return e.situacao==='nao_conferido';}).length;
    h+='<p style="margin:10px 0 0;font-weight:700;color:'+(ent?'#A12B1F':(inc||!alv.length?'#8A6A16':'#1E6B34'))+'">Situação hoje: '+(ent?'o e-mail digitado na compra pública ainda entra no portal como este cliente.':(inc?'não deu para conferir se o e-mail digitado na compra pública entra no portal.':(alv.length?'o e-mail digitado na compra pública não entra mais no portal.':'a ficha não guarda mais o e-mail digitado na compra pública.')))+'</p>';
  }
  h+='<div class="rot">O CNPJ já existia na base antes desta ficha?</div>';
  if(a.veredito==='suspeita'||a.veredito==='email_do_cliente'){h+='<p style="margin-bottom:4px"><b>Sim.</b></p><ul>'+a.motivos.map(function(m){return '<li>'+esc(m)+'</li>';}).join('')+'</ul>';}
  else if(a.veredito==='sem_historico'){h+='<p><b>Não.</b> Nenhum cadastro, atendimento antigo ou ordem de coleta deste CNPJ é anterior à ficha.</p>';}
  if(a.duvidas.length)h+='<p style="margin-bottom:4px"><b>Não deu para concluir:</b></p><ul>'+a.duvidas.map(function(m){return '<li>'+esc(m)+'</li>';}).join('')+'</ul>';

  var b=a.base,det=[];
  if(b.conferida){
    if(!b.linhas.length)det.push('Nenhum cadastro deste CNPJ na base de clientes.');
    b.linhas.forEach(function(l){
      var t='Cadastro nº '+esc(String(l.id))+(l.migrado?' (vindo do Ploomes)':' (criado pelo sistema)')+(l.criadoEm?' · desde '+esc(fmtData(l.criadoEm)):' · sem data');
      if(l.original&&(l.nomeMudou||l.emailMudou)){
        t+='<br><span style="color:#A12B1F"><b>Dados diferentes do registro original:</b>';
        if(l.nomeMudou)t+=' nome hoje "'+esc(l.nomeAtual)+'" — original "'+esc(l.original.nome)+'".';
        if(l.emailMudou)t+=' e-mail hoje "'+esc(l.emailAtual||'(vazio)')+'"'+(l.emailEhDaFicha?' (o desta ficha)':'')+' — original "'+esc(l.original.email||'(sem e-mail)')+'".';
        t+='</span> <span class="mut">Pode ter sido a compra pública ou uma edição da equipe.</span>';
      }
      det.push(t);
    });
    if(b.negocios.n)det.push(esc(String(b.negocios.n))+(b.negocios.limite?'+':'')+' atendimento(s) antigo(s) do Ploomes'+(b.negocios.maisAntigo?' (de '+esc(fmtData(b.negocios.maisAntigo))+' a '+esc(fmtData(b.negocios.maisRecente))+')':''));
    if(b.pessoas.n)det.push(esc(String(b.pessoas.n))+' pessoa(s) de contato vinculada(s), '+esc(String(b.pessoas.comEmail))+' com e-mail');
  }
  if(a.os.conferida&&(a.os.antes+a.os.depois+a.os.semData))det.push('Ordens de coleta do sistema: '+esc(String(a.os.antes))+' antes da ficha · '+esc(String(a.os.depois))+' depois'+(a.os.semData?' · '+esc(String(a.os.semData))+' sem data':'')+(a.os.numeros.length?' ('+esc(a.os.numeros.join(', '))+')':''));
  if(a.indice.conferido&&a.indice.outras.length)det.push('Há outra(s) ficha(s) com este mesmo CNPJ: '+esc(a.indice.outras.join(', ')));
  if(det.length)h+='<div class="rot">O que existe deste CNPJ no sistema</div><ul>'+det.map(function(d){return '<li>'+d+'</li>';}).join('')+'</ul>';

  h+='<div class="rot">E-mail(s) da ficha</div>'+(a.emails.length?a.emails.map(function(e){return linhaEmail(e,a);}).join(''):'<p class="mut">A ficha não tem e-mail.</p>');
  if(f.totalEmails>a.emails.length)h+='<p class="mut">+ '+esc(String(f.totalEmails-a.emails.length))+' e-mail(s) de contato da ficha não listados aqui.</p>';
  if(a.veredito==='suspeita'&&!f.emailFormulario)h+='<p class="mut">A ficha não guarda mais o e-mail digitado na compra pública (foi removido ou trocado).</p>';
  var jaFora=(a.removidos||[]).filter(function(r){return !a.emails.some(function(e){return e.email===r.email;});});
  if(jaFora.length)h+='<p class="mut">Acessos já removidos pela equipe neste CNPJ: '+jaFora.map(function(r){return '<b>'+esc(r.email)+'</b> ('+esc([r.em?fmtData(r.em):'',r.motivo,r.por?'por '+r.por:''].filter(Boolean).join(' · '))+')';}).join(' · ')+'</p>';
  if(a.gestores.length)h+='<div class="rot">Também entram — gestores cadastrados dentro do portal deste CNPJ</div><p class="mut" style="margin-bottom:6px">Quem entra como administrador do cliente pode cadastrar outros e-mails. Confira se todos são do cliente.</p>'+a.gestores.map(function(g){return '<div class="linha"><b style="flex:1;min-width:190px">'+esc(g.email)+'</b><span class="mut">'+esc([g.nome,g.nivel].filter(Boolean).join(' · '))+'</span></div>';}).join('');
  if(a.uso)h+='<p class="mut" style="margin-top:8px">Acessos ao portal com este CNPJ nos últimos '+esc(String(a.uso.janelaDias))+' dias: <b>'+esc(String(a.uso.dias))+' dia(s)</b>'+(a.uso.dias?' (primeiro em '+esc(fmtDia(a.uso.primeiro))+', último em '+esc(fmtDia(a.uso.ultimo))+')':'')+'. O registro não diz qual e-mail entrou.</p>';
  if(a.avisos.length)h+='<p class="mut">'+a.avisos.map(esc).join(' ')+'</p>';

  var link='/cadastro/cliente?id='+encodeURIComponent(f.id);
  if(a.veredito==='suspeita'){
    var alvos=a.emails.filter(function(e){return ehAlvo(e,a);});
    var entram=alvos.filter(function(e){return e.situacao==='entra';});
    h+='<div class="passo"><b style="font-size:13px;color:#5d4a12">O que fazer</b><ol>'
      +(alvos.length
        ?'<li>Confirme com o cliente, por um contato que você já conhecia, se o e-mail <b>'+esc(alvos.map(function(e){return e.email;}).join(', '))+'</b> (digitado na compra pública) é dele.</li>'
         +'<li>Se <b>não</b> for: abra a ficha, vá ao cartão <b>🔑 Acesso ao portal</b> e clique em <b>Remover acesso</b> ao lado desse e-mail.'+(entram.length?'':' <span class="mut">Hoje ele não está entrando no portal.</span>')+'</li>'
        :'<li>A ficha não guarda mais o e-mail digitado na compra pública. Confira no cartão <b>🔑 Acesso ao portal</b> da ficha se todos os e-mails que entram são do cliente.</li>')
      +'<li>Se o nome, o e-mail ou o telefone da empresa foram trocados, corrija em <b>✏️ Editar</b> na mesma ficha.</li>'
      +(a.gestores.length?'<li>Há gestores cadastrados dentro do portal deste CNPJ. Se algum não for do cliente, avise o suporte técnico: hoje só o próprio cliente consegue remover gestor.</li>':'')
      +'</ol></div>';
  }else if(a.veredito==='email_do_cliente'){
    h+='<div class="passo"><b style="font-size:13px;color:#5d4a12">O que fazer</b><ol><li>Não há e-mail de terceiro: o e-mail usado na compra já era do cliente.</li><li>A compra pode ter trocado o nome, o telefone ou o endereço da empresa. Confira e corrija em <b>✏️ Editar</b>, se precisar.</li></ol></div>';
  }
  h+='<div style="margin-top:12px"><a class="btn sec" href="'+esc(link)+'" target="_blank" rel="noopener">Abrir a ficha no Cadastro ↗</a> <span class="mut">pede o login do escritório</span></div>';
  return '<div class="card" style="border-left:5px solid '+(a.veredito==='suspeita'?'#C0392B':(a.veredito==='sem_historico'?'#3f8f3a':(a.veredito==='email_do_cliente'?'#D4A017':'#9aa7a4')))+'">'+h+'</div>';
}

function falhou(msg,lidas){
  el('andTitulo').textContent='A verificação parou antes do fim';
  el('andTexto').innerHTML='<b style="color:#A12B1F">'+esc(msg)+'</b><br>'+(lidas?esc(String(lidas))+' ficha(s) tinham sido lidas. ':'')+'Sem a leitura completa <b>não há resultado</b> — nada do que apareceu antes vale como conclusão.';
  el('andAcao').style.display='block';
  el('resumo').innerHTML='';el('lista').innerHTML='';el('limites').style.display='none';
}

// Quantas fichas a tela confere sozinha por rodada. Cada conferência consulta a base
// de clientes; o teto evita que uma base com muitas compras públicas gere uma rajada
// de consultas. As demais ficam a um clique.
var POR_RODADA=15;
var E=null; // estado da verificação em andamento

function pendente(f){
  return {ok:true,pendente:true,ficha:f,veredito:'nao_conferido',motivos:[],duvidas:['Ainda não conferida nesta rodada.'],avisos:[],base:{conferida:false,linhas:[],negocios:{n:0},pessoas:{n:0}},os:{conferida:false,antes:0,depois:0,semData:0,numeros:[]},compra:{conferida:false},emails:(f.emails||[]).map(function(m){return {email:m,situacao:'nao_conferido',como:'',removido:null,origem:m===f.emailFormulario?'formulario':'contato',jaEraDoCliente:null};}),removidos:[],gestores:[],uso:null,indice:{conferido:false,outras:[]}};
}

async function iniciar(){
  el('andamento').style.display='block';el('andAcao').style.display='none';
  el('andTitulo').textContent='Lendo as fichas…';el('andTexto').textContent='Começando.';el('barra').style.width='0';
  el('resumo').innerHTML='';el('lista').innerHTML='';el('limites').style.display='none';
  var cursor='',lidas=0,total=null,achados=[],semLeitura=[],voltas=0;
  try{
    do{
      var j=await buscar('/api/diretoria/verificar-adote/varrer'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
      if(j.totalIndice!=null)total=j.totalIndice;
      lidas+=j.lidas;achados=achados.concat(j.achados||[]);semLeitura=semLeitura.concat(j.semLeitura||[]);
      cursor=j.fim?'':j.proximo;
      el('andTexto').textContent=lidas+' ficha(s) lidas'+(total?' de cerca de '+total:'')+' · '+achados.length+' criada(s) pela compra pública do Adote até agora.';
      if(total)el('barra').style.width=Math.min(100,Math.round(lidas/total*100))+'%';
      if(++voltas>2000)throw {parar:true,msg:'A leitura não terminou (voltas demais).'};
    }while(cursor);
  }catch(e){return falhou((e&&e.msg)||'Falha ao ler as fichas.',lidas);}
  el('barra').style.width='100%';
  E={lidas:lidas,total:total,semLeitura:semLeitura,achados:achados,feitas:{}};
  await conferir();
}

// Confere a próxima rodada de fichas ainda não conferidas e redesenha o resultado.
async function conferir(){
  var fila=E.achados.filter(function(f){return !E.feitas[f.id];}).slice(0,POR_RODADA);
  el('andamento').style.display='block';el('andAcao').style.display='none';
  for(var i=0;i<fila.length;i++){
    el('andTitulo').textContent='Conferindo cada ficha do Adote…';
    el('andTexto').textContent='Ficha '+(i+1)+' de '+fila.length+' desta rodada.';
    try{E.feitas[fila[i].id]=await buscar('/api/diretoria/verificar-adote/ficha?id='+encodeURIComponent(fila[i].id));}
    catch(e){
      if(e&&e.sessao)return falhou(e.msg,E.lidas);
      var p=pendente(fila[i]);p.pendente=false;p.duvidas=['A conferência desta ficha falhou ('+((e&&e.msg)||'erro')+') — rode a verificação de novo.'];
      E.feitas[fila[i].id]=p;
    }
  }
  desenhar();
}

function desenhar(){
  var lidas=E.lidas,total=E.total,semLeitura=E.semLeitura;
  var analises=E.achados.map(function(f){return E.feitas[f.id]||pendente(f);});
  var faltam=analises.filter(function(a){return a.pendente;}).length;
  analises.sort(function(x,y){return (ORDEM[x.veredito]-ORDEM[y.veredito])||String(y.ficha.criadoEm).localeCompare(String(x.ficha.criadoEm));});
  var n={suspeita:0,email_do_cliente:0,sem_historico:0,nao_conferido:0};analises.forEach(function(a){n[a.veredito]=(n[a.veredito]||0)+1;});
  var entram=0;analises.forEach(function(a){a.emails.forEach(function(e){if(ehAlvo(e,a)&&e.situacao==='entra')entram++;});});

  el('andamento').style.display='none';
  var agora=fmtData(new Date().toISOString(),true);
  var r='<div class="card"><h2>Resultado — verificação feita em '+esc(agora)+'</h2>';
  r+='<div class="kpi"><div><b>'+lidas+'</b><span>fichas lidas</span></div><div><b>'+analises.length+'</b><span>criadas pela compra pública</span></div><div><b style="color:'+(n.suspeita?'#A12B1F':'#0B5B66')+'">'+n.suspeita+'</b><span>🔴 suspeitas</span></div><div><b>'+n.email_do_cliente+'</b><span>🟡 e-mail já era do cliente</span></div><div><b>'+n.sem_historico+'</b><span>🟢 sem histórico anterior</span></div><div><b>'+n.nao_conferido+'</b><span>⚪ não conferidas</span></div></div>';
  var completa=!semLeitura.length;
  if(!completa)r+='<p style="margin-top:14px;color:#A12B1F"><b>Verificação incompleta:</b> '+semLeitura.length+' ficha(s) não puderam ser lidas e <b>ficaram fora</b>: '+esc(semLeitura.slice(0,20).join(', '))+(semLeitura.length>20?'…':'')+'. O que aparece abaixo vale só para as fichas lidas. Rode de novo; se repetir, avise o suporte técnico.</p>';
  if(faltam)r+='<p style="margin-top:14px;color:#8A6A16"><b>Faltam '+faltam+' ficha(s) para conferir.</b> A tela confere '+POR_RODADA+' por vez para não pesar no sistema. <button class="btn" style="margin-left:6px" onclick="conferir()">Conferir as próximas</button></p>';
  if(!analises.length){
    r+='<p style="margin-top:14px;font-size:15px"><b>Nenhuma ficha criada pela compra pública do Adote'+(completa?'.':' entre as fichas lidas.')+'</b></p>';
    if(completa)r+='<p>Nenhuma das '+lidas+' fichas tem a marca da compra pública. Como a falha só agia criando uma ficha com essa marca, este é um forte indício de que ela <b>não chegou a ser usada</b>. Não há e-mail a remover por este motivo.</p>';
  }
  else if(n.suspeita)r+='<p style="margin-top:14px"><b>'+n.suspeita+' ficha(s) pedem conferência</b> — '+(entram?'<b style="color:#A12B1F">'+entram+' e-mail(s) digitado(s) na compra pública ainda entram no portal</b> como o cliente.':'nenhum e-mail digitado na compra pública está entrando no portal hoje.')+' Veja caso a caso abaixo.</p>';
  else if(n.nao_conferido)r+='<p style="margin-top:14px">Nenhuma suspeita até aqui, mas <b>'+n.nao_conferido+' ficha(s) não foram conferidas</b>. '+(faltam?'Confira as próximas':'Rode a verificação de novo')+' antes de concluir.</p>';
  else if(completa)r+='<p style="margin-top:14px"><b>Nenhuma suspeita.</b> '+(n.email_do_cliente?n.email_do_cliente+' ficha(s) são de clientes antigos que compraram com um e-mail que já era deles; as demais':'As '+analises.length+' ficha(s) criadas pela compra pública')+' são de empresas que não tinham histórico na base antes — chegaram pela própria compra. Não há e-mail a remover por este motivo.</p>';
  else r+='<p style="margin-top:14px">Nenhuma suspeita entre as fichas lidas.</p>';
  if(total!=null&&total!==lidas+semLeitura.length)r+='<p class="mut">O índice de clientes lista '+total+' ficha(s) e o armazenamento tem '+(lidas+semLeitura.length)+'. A verificação percorre o armazenamento, não o índice — por isso essa diferença não deixa ficha de fora.</p>';
  r+='<div style="margin-top:6px"><button class="btn sec" onclick="iniciar()">Refazer a verificação</button></div></div>';
  el('resumo').innerHTML=r;
  el('lista').innerHTML=analises.map(cartao).join('');
  el('limites').style.display='block';
}
iniciar();
</script>
</body></html>`;
}
