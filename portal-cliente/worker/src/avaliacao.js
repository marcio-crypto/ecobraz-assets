// PEDIDO DE AVALIAÇÃO NO GOOGLE — e-mail automático depois da coleta concluída.
// (Pedido da Débora, atendimento; decisões do Marcio em 18/11/2026.)
//
// COMO FUNCIONA
//   • Uma rodada a cada 10 minutos (gatilho CRON_AVALIACAO, no wrangler.toml), só entre
//     08:00 e 20:00 de Brasília, olha as OS CONCLUÍDAS e decide, para cada uma, uma única
//     vez: envia o pedido 2 horas depois da conclusão (fora do horário → 08:00 seguinte)
//     ou registra por que não enviou.
//   • NÃO mexe no fechamento da coleta (app do motorista, escritório, doca): só LÊ o
//     índice de OS. Se a OS deixar de estar concluída antes da hora, nada é enviado.
//   • Um pedido por cliente a cada 12 meses (chave: CNPJ/CPF; sem documento, o e-mail), e
//     o mesmo endereço de e-mail não recebe dois pedidos em 12 meses (CNPJs diferentes).
//   • Não recebe: casa/família, bloqueio de contato, já pedido em 12 meses, sem e-mail e
//     e-mail na lista "não enviar e-mail" (descadastrados e inválidos).
//   • Registro em D1 (avaliacao_pedidos — uma linha por OS; o registro da OS no KV não é
//     alterado). Lista "não enviar e-mail" em D1 (email_nao_enviar).
//   • Chave em KV (cfg:avaliacao): desligado (padrão) | teste | ligado.
//     teste = o e-mail vai SÓ para a equipe, com o nome do cliente no assunto.
//   • E-mail em TEXTO SIMPLES (sem imagem, sem HTML — não há link para ser reescrito por
//     rastreio de clique), remetente e resposta = a Débora.
//   • Nenhum nome, e-mail ou documento de cliente vai para o log: só número de OS e códigos.
//
// Ajustes por variável do Worker (opcionais): AVALIACAO_FROM, AVALIACAO_REPLY_TO,
// AVALIACAO_TESTE_PARA, AVALIACAO_LINK.

import { listarColetasOS } from './coletas.js';
import { lerChavesKV } from './kv-lote.js';
import { isoBR, textoBR } from './atendimento.js';

const MS_H = 3600e3;
const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const semAcentoMin = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const CRON_AVALIACAO = '*/10 11-22 * * *'; // a cada 10 min, das 08:00 às 19:50 de Brasília
const LINK_PADRAO = 'https://search.google.com/local/writereview?placeid=ChIJ4Y-kOuRdzpQRlgybAfVUOEo';
const REMETENTE_PADRAO = 'Debora Villanova <debora.villanova@ecobraz.org.br>';
const ESPERA_H = 2;                 // envio 2 horas depois da conclusão
const JANELA_INI = 8 * 60;          // 08:00 (minutos do dia, Brasília)
const JANELA_FIM = 20 * 60;         // 20:00
const VALIDADE_H = 24;              // passou disso da hora prevista, não envia mais (pedido atrasado não sai)
const DIAS_12_MESES = 365;
const MAX_ACOES = 5;                // decisões por rodada: envio ou "não enviado" (30 por hora — o volume é de 6 a 30 por dia)
const MAX_EXAME = 40;               // OS olhadas por rodada (as que não dão em nada não travam a fila)
const MAX_TENTATIVAS = 6;           // falha de envio: tenta de novo até 6 vezes…
const PAUSA_TENTATIVA_MIN = 30;     // …com 30 min entre as tentativas
const TRAVADO_MIN = 20;             // "enviando" há mais que isso = a rodada que enviava morreu no meio → retoma
const RETOMA_MAX_H = 20;            // …só enquanto a chave de idempotência do Resend (24h) ainda vale
const PAUSA_ENVIO_MS = 600;         // respiro entre dois envios (o Resend aceita 2 por segundo)
const ANTIGA_DIAS = 10;             // concluída no sistema mais de 10 dias depois da data da coleta = "coleta antiga"
const ANTIGA_SEM_DATA_DIAS = 60;    // OS sem data marcada: criada há mais de 60 dias
const CHAVE_CFG = 'cfg:avaliacao';        // a chave: { modo, desde, ligadoEm, por, atualizadoEm }
const CHAVE_CASA = 'cfg:avaliacao:casa';  // a lista casa/família: { casa: [...] }
const MODOS = ['desligado', 'teste', 'ligado'];
// Erros em que NÃO dá para saber se o e-mail saiu (o serviço pode ter recebido o pedido).
// Registro encerrado com um deles fica "envio não confirmado" e conta na regra dos 12 meses.
const INCERTOS = new Set(['tempo_esgotado', 'rede']);
const SQL_INCERTO = "erro IN ('tempo_esgotado','rede')";
const CASA_PADRAO = ['ecobraz', 'villanova'];

// Motivos de "não enviado" (texto que aparece na OS e no conector).
export const ROTULO_MOTIVO = {
  sem_email: 'sem e-mail', descadastrado: 'descadastrado', email_invalido: 'e-mail inválido',
  bloqueio: 'bloqueio', ja_pedido_12m: 'já pedido em 12 meses', casa_familia: 'casa/família',
  teste: 'modo de teste (e-mail só para a equipe)', falha_envio: 'falha no envio', prazo_expirado: 'prazo de envio expirado',
  coleta_antiga: 'coleta antiga (concluída no sistema muito depois da data)', reaberta: 'coleta reaberta depois de concluída',
  sem_cadastro: 'cadastro do cliente não encontrado', envio_nao_confirmado: 'envio não confirmado (pode ter saído)',
};
// A reabertura registrada deixa de valer quando a OS é concluída DE NOVO depois dela
// (conclusão nova). Reconclusão automática com a hora antiga (anterior à reabertura) não conta.
const reaberturaVencida = (row, concluidaEm) => !!(row && row.status === 'nao_enviado' && row.motivo === 'reaberta' && Date.parse(concluidaEm) > Date.parse(row.processado_em));
// Campos que saem na OS / conector a partir da linha do registro.
export function camposAvaliacao(row, concluidaEm) {
  if (!row || reaberturaVencida(row, concluidaEm)) return { avaliacao_pedida_em: null, avaliacao_canal: null, motivo_nao_enviado: null };
  const pedido = row.status === 'enviado' || row.status === 'whatsapp';
  return {
    avaliacao_pedida_em: pedido ? isoBR(row.pedida_em || row.processado_em) : null,
    avaliacao_canal: row.status === 'enviado' ? 'email' : (row.status === 'whatsapp' ? 'whatsapp' : 'nenhum'),
    motivo_nao_enviado: pedido ? null : (row.status === 'pendente' || row.status === 'enviando' ? 'envio em andamento' : (ROTULO_MOTIVO[row.motivo] || row.motivo || null)),
  };
}

// --- Chave liga/desliga (KV) ---------------------------------------------------------------
// A chave (modo) e a lista casa/família ficam em registros SEPARADOS: salvar a lista nunca
// regrava a chave. Qualquer falha de leitura da chave cai em DESLIGADO (o seguro); falha
// na leitura da lista marca casaErro e a rodada não envia nada.
// `estrito`: falha de leitura é ERRO (quem chama decide o lado seguro); sem ele, cai em DESLIGADO.
async function lerChave(env, estrito) {
  const kv = env && env.PORTAL_KV;
  let c = null;
  try { const raw = kv ? await kv.get(CHAVE_CFG) : null; c = raw ? JSON.parse(raw) : null; } catch (e) { if (estrito) throw e; c = null; }
  const modo = c && MODOS.includes(c.modo) ? c.modo : 'desligado';
  // A 1ª versão guardava a lista casa/família junto com a chave: continua valendo (e é
  // carregada adiante) enquanto a lista não for salva no registro próprio.
  const casaAntiga = c && Array.isArray(c.casa) ? c.casa.map((x) => limpar(x)).filter(Boolean).slice(0, 80) : null;
  return { modo, desde: (c && c.desde) || '', ligadoEm: (c && c.ligadoEm) || '', por: (c && c.por) || '', atualizadoEm: (c && c.atualizadoEm) || '', casaAntiga: casaAntiga && casaAntiga.length ? casaAntiga : null };
}
async function lerCasa(env, casaAntiga) {
  const kv = env && env.PORTAL_KV;
  let k = null, casaErro = false, existe = false;
  try { const raw = kv ? await kv.get(CHAVE_CASA) : null; existe = raw != null; k = raw ? JSON.parse(raw) : null; } catch { k = null; casaErro = true; }
  let lista = k && Array.isArray(k.casa) ? k.casa.map((x) => limpar(x)).filter(Boolean).slice(0, 80) : [];
  if (!existe && !casaErro && casaAntiga) lista = casaAntiga;
  // Lista vazia volta ao padrão: o filtro da casa nunca fica desligado.
  return { casa: lista.length ? lista : CASA_PADRAO, casaErro };
}
export async function lerConfigAvaliacao(env) {
  const chave = await lerChave(env);
  return { ...chave, ...(await lerCasa(env, chave.casaAntiga)) };
}
// A partir de quando uma coleta concluída entra no envio. Em TESTE: desde que o teste foi
// ligado. LIGADO de verdade: só coletas concluídas DEPOIS de ligar de verdade — as do
// período de teste (mesmo as que ainda não tinham sido tratadas) nunca viram e-mail real.
export const inicioDoEnvio = (cfg) => (cfg && cfg.modo === 'ligado' ? (cfg.ligadoEm || cfg.desde || '') : ((cfg && cfg.desde) || ''));
export async function salvarModoAvaliacao(env, modo, por) {
  if (!MODOS.includes(modo) || !env || !env.PORTAL_KV) return null;
  const atual = await lerConfigAvaliacao(env);
  const agora = new Date().toISOString();
  const desde = modo === 'desligado' ? '' : (atual.modo === 'desligado' || !atual.desde ? agora : atual.desde);
  const novo = { modo, desde, ligadoEm: modo === 'ligado' ? (atual.modo === 'ligado' && atual.ligadoEm ? atual.ligadoEm : agora) : '', por: String(por || '').slice(0, 120), atualizadoEm: agora };
  if (atual.casaAntiga) novo.casa = atual.casaAntiga; // lista da 1ª versão: nunca é descartada por uma troca de chave
  await env.PORTAL_KV.put(CHAVE_CFG, JSON.stringify(novo));
  // Mudou a chave: as novas tentativas que estavam na fila (envio que tinha falhado) são
  // encerradas — nada que nasceu num modo é enviado em outro.
  if (atual.modo !== modo && env.DB_PLOOMES) {
    try { await env.DB_PLOOMES.prepare(`UPDATE avaliacao_pedidos SET motivo = CASE WHEN ${SQL_INCERTO} THEN 'envio_nao_confirmado' WHEN modo='teste' THEN 'teste' ELSE 'falha_envio' END, status='nao_enviado', canal='nenhum', reserva=NULL WHERE status='pendente'`).run(); } catch { /* sem tabela ainda: nada na fila */ }
  }
  await auditar(env, por, 'chave', `${atual.modo} → ${modo}`);
  return novo;
}
export async function salvarCasaAvaliacao(env, texto, por) {
  if (!env || !env.PORTAL_KV) return null;
  const antes = await lerConfigAvaliacao(env);
  const casa = [...new Set(String(texto || '').split(/\r?\n|;/).map((s) => limpar(s).slice(0, 80)).filter((s) => s.length >= 4))].slice(0, 80);
  await env.PORTAL_KV.put(CHAVE_CASA, JSON.stringify({ casa, por: String(por || '').slice(0, 120), atualizadoEm: new Date().toISOString() }));
  await auditar(env, por, 'lista casa/família', `${antes.casa.length} → ${casa.length || CASA_PADRAO.length} entrada(s)${casa.length ? '' : ' (vazia: voltou ao padrão)'}`);
  return { casa: casa.length ? casa : CASA_PADRAO };
}

// --- Horário ----------------------------------------------------------------------------------
const minutoBR = (ms) => { const d = new Date(ms - 3 * MS_H); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export const dentroDaJanela = (ms) => { const m = minutoBR(ms); return m >= JANELA_INI && m < JANELA_FIM; };
// Quando enviar (ms): conclusão + 2h; se cair fora de 08:00–20:00 (Brasília), a 08:00 seguinte.
export function quandoEnviar(concluidaEm) {
  const t = Date.parse(concluidaEm);
  if (!Number.isFinite(t)) return null;
  const alvo = t + ESPERA_H * MS_H;
  const loc = new Date(alvo - 3 * MS_H); // relógio de Brasília nos campos UTC
  const m = loc.getUTCHours() * 60 + loc.getUTCMinutes();
  if (m >= JANELA_INI && m < JANELA_FIM) return alvo;
  if (m >= JANELA_FIM) loc.setUTCDate(loc.getUTCDate() + 1);
  loc.setUTCHours(8, 0, 0, 0);
  return loc.getTime() + 3 * MS_H;
}

// --- Nome, destinatário e chave do cliente ---------------------------------------------------
// E-mails de um texto. Cada termo é validado POR INTEIRO: endereço com acento ou caractere
// fora do padrão é DESCARTADO, nunca aproveitado pela metade ("joão.x@…" não pode virar
// "o.x@…", que é o endereço de outra pessoa).
const EMAIL_INTEIRO = /^[a-z0-9_%+&-]+(\.[a-z0-9_%+&-]+)*@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
// A mesma regra de formato da carga de arquivo da tela /avaliacoes (lá ela vai escrita no script da página).
export const REGRA_EMAIL = EMAIL_INTEIRO.source;
// Lê os e-mails de um texto. `bons` = endereços bem formados. `ruins` = quantas palavras
// tinham cara de e-mail (algo@…) mas estavam mal formadas (domínio cortado, "|" no meio,
// texto grudado, acento…) — essas são descartadas INTEIRAS e nunca viram destinatário.
function lerEmails(v) {
  const bons = []; let ruins = 0;
  for (const palavra of String(v == null ? '' : v).toLowerCase().split(/\s+/)) {
    if (!palavra.includes('@')) continue;
    // Dentro de uma palavra (sem espaço), vírgula, barra, aspas etc. só podem separar
    // endereços INTEIROS: "joao,silva@x.com" e "maria/joao@x.com" são descartados — não
    // viram "silva@x.com"/"joao@x.com".
    const achados = []; let inteira = true;
    for (const bruto of palavra.split(/[,;|"\/·]+/)) {
      let t = bruto;
      const dentro = t.match(/<([^<>]*)>/); if (dentro) t = dentro[1];   // nome<a@b.com>
      t = t.replace(/^[(\[<]+|[)\]>]+$/g, '');                            // (a@b.com) [a@b.com]
      const rotulo = t.match(/^[a-z-]{1,12}:(.+)$/); if (rotulo) t = rotulo[1]; // e-mail:a@b.com
      t = t.replace(/^[.'’]+|[.'’]+$/g, '');
      if (!t) continue;
      if (t.length <= 254 && EMAIL_INTEIRO.test(t)) achados.push(t); else { inteira = false; break; }
    }
    if (inteira) { for (const t of achados) if (!bons.includes(t)) bons.push(t); }
    else if (/[^@\s]@/.test(palavra)) ruins++; // "@perfil" de rede social não conta como e-mail
  }
  return { bons, ruins };
}
export const emailsDe = (v) => lerEmails(v).bons;
export const temEmailMalFormado = (v) => lerEmails(v).ruins > 0;
const TITULOS = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'eng', 'prof', 'profa', 'dona', 'seu']);
const NAO_PESSOA = new Set(['financeiro', 'compras', 'recepcao', 'recepcionista', 'comercial', 'administrativo', 'administracao', 'adm', 'rh', 'dp', 'pessoal', 'ti', 'cpd', 'informatica', 'tecnologia', 'infra', 'infraestrutura', 'contato', 'atendimento', 'portaria', 'porteiro', 'porteira', 'zelador', 'zeladora', 'zeladoria', 'sindico', 'sindica', 'condominio', 'almoxarifado', 'estoque', 'deposito', 'manutencao', 'predial', 'facilities', 'suporte', 'diretoria', 'diretor', 'diretora', 'gerencia', 'gerente', 'supervisor', 'supervisora', 'coordenador', 'coordenadora', 'encarregado', 'encarregada', 'sac', 'fiscal', 'nfe', 'nf', 'xml', 'faturamento', 'cobranca', 'tesouraria', 'logistica', 'expedicao', 'operacao', 'operacoes', 'producao', 'vendas', 'marketing', 'juridico', 'contabilidade', 'secretaria', 'escritorio', 'engenharia', 'qualidade', 'sustentabilidade', 'seguranca', 'servicos', 'gerais', 'geral', 'equipe', 'central', 'matriz', 'filial', 'unidade', 'loja', 'obra', 'empresa', 'cliente', 'responsavel', 'proprietario', 'proprietaria', 'morador', 'moradora', 'espolio', 'departamento', 'setor', 'falar', 'procurar', 'tratar', 'aos', 'cuidados', 'sem', 'nao']);
// Primeiro nome para a saudação ("MARIA DA SILVA" → "Maria"). '' quando não parece nome de
// pessoa (setor, cargo, número, e-mail) — aí a mensagem começa com "Olá!".
export function primeiroNome(nome) {
  const partes = String(nome == null ? '' : nome).replace(/[·|,;()\[\]<>"]/g, ' ').trim().split(/\s+/).filter(Boolean);
  for (const bruto of partes.slice(0, 2)) {
    if (bruto.includes('@')) return '';
    const p = bruto.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    const n = semAcentoMin(p).replace(/\./g, '');
    if (TITULOS.has(n)) continue; // "Dr. João" → João
    if (p.length < 2 || /\d/.test(bruto) || /[\/\\]/.test(bruto) || NAO_PESSOA.has(n)) return '';
    return (p === p.toUpperCase() || p === p.toLowerCase()) ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p;
  }
  return '';
}
// Contato marcado como fora da empresa / não contatar (campo "Status" do contato na ficha).
const contatoInativo = (c) => /inativ|deslig|demit|saiu|nao trabalha|ex-func|bloque|falec|nao contat|aposent|afastad/.test(semAcentoMin(c && c.status));
const fonesNac = (v) => {
  const out = [];
  for (const parte of String(v == null ? '' : v).split(/\s*(?:\/|;|,|\||·|\be\b|\bou\b)\s*/i)) {
    let d = digits(parte);
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
    if (d.length === 10 || d.length === 11) out.push(d);
  }
  return out;
};
// O WhatsApp às vezes guarda o celular SEM o 9 da frente: compara os dois jeitos como iguais.
const semNove = (d) => (d.length === 11 && d[2] === '9' ? d.slice(0, 2) + d.slice(3) : d);
// Tudo o que as regras precisam saber do cliente de uma OS. `cli` = ficha (pode faltar).
// E-mails em ordem de preferência — empresa: o contato da OS (quem acompanhou a coleta),
// depois o e-mail geral da ficha, depois os demais contatos; pessoa física: o da ficha.
// E-mail de contato marcado como inativo/desligado nunca entra (nem como e-mail geral).
export function dadosDoCliente(os, cli) {
  const o = os || {}, c = cli || {};
  const doc = [o.clienteDoc, c.cnpj, c.cpf].map(digits).find((d) => d.length === 14 || d.length === 11) || '';
  const perfil = doc.length === 14 ? 'PJ' : (doc.length === 11 ? 'PF' : (c.tipo === 'PJ' ? 'PJ' : (c.tipo === 'PF' ? 'PF' : '')));
  const txt = String(o.contato || '');
  const emailOs = emailsDe(txt)[0] || '';
  const trecho1 = txt.split(/[·|,;]/)[0];
  let nomeOs = trecho1.includes('@') ? '' : trecho1.replace(/[^\p{L} .'’-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (nomeOs.length < 2) nomeOs = '';
  const todosContatos = (Array.isArray(c.contatos) ? c.contatos : []).filter(Boolean);
  const contatos = todosContatos.filter((x) => !contatoInativo(x));
  const inativos = new Set(todosContatos.filter(contatoInativo).flatMap((x) => emailsDe(x.email)));
  const cands = [];
  const poe = (email, nome) => { for (const e of emailsDe(email)) if (!inativos.has(e) && !cands.some((x) => x.email === e)) cands.push({ email: e, nome: limpar(nome) }); };
  if (perfil === 'PJ') {
    poe(emailOs, nomeOs);
    const nOs = semAcentoMin(nomeOs);
    if (nOs) {
      // Mesmo nome; ou nome parcial ("Carlos" × "Carlos Souza") — só se casar com UM contato.
      const nomeDe = (x) => semAcentoMin(x.nome);
      const parciais = contatos.filter((x) => nomeDe(x) && (nomeDe(x).startsWith(nOs + ' ') || nOs.startsWith(nomeDe(x) + ' ')));
      const m = contatos.find((x) => nomeDe(x) === nOs) || (parciais.length === 1 ? parciais[0] : null);
      if (m) poe(m.email, m.nome);
    }
    for (const e of emailsDe(c.email)) { const dono = contatos.find((x) => emailsDe(x.email).includes(e)); poe(e, dono ? dono.nome : ''); }
    for (const x of contatos) poe(x.email, x.nome);
  } else {
    poe(c.email, c.nome || nomeOs);
    poe(emailOs, c.nome || nomeOs);
    for (const x of contatos) poe(x.email, x.nome || c.nome);
  }
  const empresa = perfil === 'PJ' ? limpar(c.nomeFantasia || c.razaoSocial || o.clienteNome).replace(/[\r\n\t]+/g, ' ').slice(0, 80) : '';
  const nomes = [o.clienteNome, c.razaoSocial, c.nomeFantasia, c.nome].map(limpar).filter(Boolean);
  const fones = [...new Set([c.fone, c.telefone, c.celular, ...contatos.map((x) => x.fone), txt].flatMap(fonesNac))];
  // Há e-mail MAL FORMADO no cadastro ou no contato da OS? Ele nunca é usado; se não sobrar
  // outro endereço, o motivo que fica na OS é "e-mail inválido" (e não "sem e-mail").
  const emailMalFormado = [c.email, txt, ...contatos.map((x) => x.email)].some(temEmailMalFormado);
  // Chave da regra dos 12 meses: o CNPJ/CPF; sem documento, o e-mail (todos os do cliente
  // contam, para o pedido não se repetir só porque mudou o contato da OS). A ficha
  // (clienteId) também liga duas coletas do mesmo cliente.
  const clienteId = String(o.clienteId || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
  const chaves = doc ? ['d:' + doc] : cands.map((x) => 'e:' + x.email);
  const chave = chaves[0] || (clienteId ? 'c:' + clienteId : '');
  return { doc, perfil, empresa, nomes, fones, emails: cands, emailMalFormado, chave, chaves, clienteId, clienteNome: limpar(o.clienteNome || nomes[0] || '') };
}
// Casa e família: entra por CNPJ/CPF, por e-mail/domínio ou por pedaço do nome (4+ letras),
// que vale para o nome do cliente e para o domínio do e-mail. Devolve a entrada que casou.
export function ehDaCasa(casa, { nomes, doc, emails }) {
  const nomesN = (nomes || []).map(semAcentoMin).filter(Boolean);
  const mails = (emails || []).map((e) => String(e || '').toLowerCase());
  for (const bruto of casa || []) {
    const e = limpar(bruto); if (!e) continue;
    const d = digits(e);
    if ((d.length === 14 || d.length === 11) && !/[a-z@]/i.test(e)) { if (doc && d === doc) return e; continue; }
    const baixo = e.toLowerCase().replace(/^@/, '');
    if (e.includes('@')) { if (mails.some((m) => m === baixo || m.endsWith('@' + baixo))) return e; continue; }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(baixo)) { if (mails.some((m) => m.endsWith('@' + baixo) || m.endsWith('.' + baixo))) return e; continue; }
    const n = semAcentoMin(e);
    if (n.length >= 4 && (nomesN.some((x) => x.includes(n)) || mails.some((m) => m.split('@')[1] && m.split('@')[1].includes(n.replace(/\s+/g, ''))))) return e;
  }
  return '';
}

// --- Mensagem (texto do pedido — aprovado pelo Marcio em 18/11/2026) --------------------------
// O link fica numa linha só dele, sem ponto colado, para nenhum programa de e-mail quebrá-lo.
export function montarMensagem({ perfil, primeiro, empresa, link }) {
  const rodape = "Se não quiser receber mensagens da Ecobraz, responda 'remover'.";
  const url = link || LINK_PADRAO;
  const emp = limpar(empresa).replace(/[\r\n\t]+/g, ' ');
  if (perfil === 'PJ' && emp) {
    return {
      modelo: 'PJ', assunto: `Coleta concluída na ${emp}`.slice(0, 150),
      texto: `${primeiro ? `Olá, ${primeiro}.` : 'Olá!'} Aqui é a Debora, da Ecobraz. A coleta na ${emp} foi concluída. Se fizer sentido para vocês, uma avaliação no Google ajuda outras empresas a nos encontrarem quando precisarem descartar equipamentos:\n\n${url}\n\nObrigada.\n\n${rodape}`,
    };
  }
  return {
    modelo: 'PF', assunto: 'Sua coleta foi concluída',
    texto: `${primeiro ? `Oi, ${primeiro}!` : 'Olá!'} Aqui é a Debora, da Ecobraz. Sua coleta foi concluída. Se puder, conta no Google como foi o atendimento. Leva um minuto e ajuda outras pessoas a acharem onde descartar do jeito certo:\n\n${url}\n\nObrigada!\n\n${rodape}`,
  };
}
const remetente = (env) => String((env && env.AVALIACAO_FROM) || REMETENTE_PADRAO);
const emailTeste = (env) => emailsDe((env && env.AVALIACAO_TESTE_PARA) || remetente(env))[0] || '';
const mascarar = (e) => { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, 2)}***@${d}` : ''; };

// Envio pelo Resend, em texto simples, com limite de 15 segundos. Chave de idempotência: o
// mesmo pedido repetido em até 24h não vira dois e-mails. `definitivo` = repetir não resolve.
async function enviarResend(env, { para, assunto, texto, idem }) {
  if (!env || !env.RESEND_API_KEY) return { ok: false, definitivo: false, erro: 'sem_chave_email' };
  const from = remetente(env);
  const payload = { from, to: [para], subject: assunto, text: texto, reply_to: String(env.AVALIACAO_REPLY_TO || from) };
  let r;
  try {
    const init = { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}`, 'Idempotency-Key': String(idem || '').slice(0, 200) }, body: JSON.stringify(payload) };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') init.signal = AbortSignal.timeout(15000);
    r = await fetch('https://api.resend.com/emails', init);
  } catch (e) { return { ok: false, definitivo: false, erro: e && e.name === 'TimeoutError' ? 'tempo_esgotado' : 'rede' }; }
  if (r.ok) { let id = ''; try { id = String((await r.json()).id || ''); } catch { id = ''; } return { ok: true, id }; }
  return { ok: false, definitivo: r.status === 400 || r.status === 422, erro: `resend_${r.status}` };
}

// --- Registro (D1) ----------------------------------------------------------------------------
const semTabela = (e) => /no such table/i.test(String((e && e.message) || e));
const prontas = new WeakSet();
async function garantirTabelas(db) {
  if (!db || prontas.has(db)) return;
  // Tudo num lote só (uma ida ao banco).
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS avaliacao_pedidos (os_id TEXT PRIMARY KEY, os_numero TEXT, chave TEXT, perfil TEXT, status TEXT NOT NULL, canal TEXT, motivo TEXT, concluida_em TEXT, previsto_em TEXT, processado_em TEXT, pedida_em TEXT, por TEXT, para TEXT, tentativas INTEGER DEFAULT 0, erro TEXT, modo TEXT, reserva TEXT, status_antes TEXT, cliente_id TEXT, para_h TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS avaliacao_pedidos_chave ON avaliacao_pedidos (chave)'),
    db.prepare('CREATE INDEX IF NOT EXISTS avaliacao_pedidos_proc ON avaliacao_pedidos (processado_em)'),
    db.prepare('CREATE TABLE IF NOT EXISTS email_nao_enviar (email TEXT PRIMARY KEY, motivo TEXT, origem TEXT, em TEXT, por TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS avaliacao_auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT, por TEXT, acao TEXT, detalhe TEXT)'),
  ]);
  // Tabela criada por versão anterior (sem cliente_id e/ou para_h): acrescenta o que faltar.
  try { await db.prepare('SELECT cliente_id, para_h FROM avaliacao_pedidos LIMIT 0').all(); }
  catch {
    for (const col of ['cliente_id', 'para_h']) {
      try { await db.prepare(`ALTER TABLE avaliacao_pedidos ADD COLUMN ${col} TEXT`).run(); } catch (e) { if (!/duplicate column/i.test(String((e && e.message) || e))) throw e; }
    }
  }
  prontas.add(db);
}
// Quem mudou o quê (chave, listas). O detalhe nunca leva e-mail inteiro de cliente.
async function auditar(env, por, acao, detalhe) {
  const db = env && env.DB_PLOOMES; if (!db) return;
  try {
    await garantirTabelas(db);
    await db.prepare('INSERT INTO avaliacao_auditoria (em, por, acao, detalhe) VALUES (?1,?2,?3,?4)').bind(new Date().toISOString(), String(por || '').slice(0, 120), String(acao || '').slice(0, 40), String(detalhe || '').slice(0, 200)).run();
  } catch { /* a auditoria nunca derruba a ação */ }
}
export async function listarAuditoria(env, n) {
  const db = env && env.DB_PLOOMES; if (!db) return [];
  try { const r = await db.prepare('SELECT em, por, acao, detalhe FROM avaliacao_auditoria ORDER BY id DESC LIMIT ?1').bind(Math.min(50, Math.max(1, Number(n) || 12))).all(); return (r && r.results) || []; } catch { return []; }
}
const COLUNAS = 'os_id, os_numero, chave, perfil, status, canal, motivo, concluida_em, previsto_em, processado_em, pedida_em, por, para, tentativas, erro, modo, status_antes, reserva';
// Linhas do registro por OS (Map os_id → linha). Tabela ainda não criada = nada registrado.
// `estrito` (a rodada de envio): qualquer outra falha de leitura é ERRO — nunca "nada
// registrado" (falha de leitura não pode virar permissão para enviar).
export async function lerAvaliacoes(env, osIds, opcoes) {
  const out = new Map();
  const db = env && env.DB_PLOOMES;
  const ids = [...new Set((osIds || []).map((x) => String(x || '')).filter(Boolean))];
  if (!db || !ids.length) return out;
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const r = await db.prepare(`SELECT ${COLUNAS} FROM avaliacao_pedidos WHERE os_id IN (SELECT value FROM json_each(?1))`).bind(JSON.stringify(ids.slice(i, i + 400))).all();
      for (const x of (r && r.results) || []) out.set(x.os_id, x);
    }
  } catch (e) { if (opcoes && opcoes.estrito && !semTabela(e)) throw e; }
  return out;
}
export async function lerAvaliacao(env, osId) { return (await lerAvaliacoes(env, [osId])).get(String(osId || '')) || null; }
// Resumo (hash) do endereço de destino: serve para a regra "o mesmo endereço não recebe dois
// pedidos em 12 meses" sem guardar o e-mail de quem recebeu.
async function resumoEmail(email) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`avaliacao:${String(email || '').toLowerCase()}`));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// As três consultas que decidem um envio, numa ida só ao banco (falha de leitura = ERRO):
//  1. já houve pedido para este CLIENTE em 12 meses? Casa pela chave (CNPJ/CPF; sem
//     documento, qualquer e-mail do cliente) ou pela mesma ficha;
//  2. quais e-mails do cliente estão na lista "não enviar e-mail";
//  3. quais ENDEREÇOS do cliente já receberam pedido em 12 meses (por outro CNPJ/CPF).
// O que conta como "pedido": enviado e WhatsApp; "enviando" e "envio não confirmado" (pode
// ter saído) — estes dois só quando nasceram no mesmo tipo de envio (os de teste não seguram
// o envio de verdade); em teste, os testes também contam (ensaio fiel).
async function consultasDoEnvio(db, d, osId, agoraMs, contarTeste, resumos) {
  const chaves = [...new Set([...(d.chaves || []), d.chave].filter(Boolean))];
  const desde = new Date(agoraMs - DIAS_12_MESES * 86400e3).toISOString();
  const t = contarTeste ? 1 : 0;
  const conta = "(status IN ('enviado','whatsapp') OR ((status = 'enviando' OR (status = 'nao_enviado' AND motivo = 'envio_nao_confirmado')) AND (?4 = 1 OR COALESCE(modo,'') <> 'teste')) OR (?4 = 1 AND status = 'teste'))";
  const r = await db.batch([
    db.prepare(`SELECT os_numero FROM avaliacao_pedidos WHERE (chave IN (SELECT value FROM json_each(?1)) OR (?5 <> '' AND cliente_id = ?5)) AND os_id <> ?2 AND COALESCE(pedida_em, processado_em) >= ?3 AND ${conta} LIMIT 1`).bind(JSON.stringify(chaves), String(osId), desde, t, d.clienteId || ''),
    db.prepare('SELECT email, motivo FROM email_nao_enviar WHERE email IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(d.emails.map((x) => x.email))),
    db.prepare(`SELECT para_h FROM avaliacao_pedidos WHERE para_h IN (SELECT value FROM json_each(?1)) AND os_id <> ?2 AND COALESCE(pedida_em, processado_em) >= ?3 AND ${conta}`).bind(JSON.stringify(resumos), String(osId), desde, t),
  ]);
  const linhas = (i) => (r && r[i] && r[i].results) || null;
  if (!Array.isArray(r) || r.length !== 3 || !linhas(0) || !linhas(1) || !linhas(2)) throw new Error('consultas_do_envio_sem_resposta');
  const lista = new Map(); for (const x of linhas(1)) lista.set(x.email, x);
  return { recente: linhas(0)[0] || null, lista, destinos: new Set(linhas(2).map((x) => x.para_h)) };
}
// Bloqueios de contato já conhecidos pelo sistema (os mesmos do conector): telefones que
// pediram para sair do WhatsApp e empresas retiradas das campanhas pela diretoria.
// Tabela que ainda não existe = sem bloqueios; qualquer outra falha de leitura é ERRO.
async function bloqueiosDeContato(db) {
  const porFone = new Set(), porDoc = new Set();
  const TETO = 50000; // se um dia passar disso, para tudo (erro) em vez de conferir só uma parte
  const ler = async (sql) => { try { const r = await db.prepare(`${sql} LIMIT ${TETO + 1}`).all(); const l = (r && r.results) || []; if (l.length > TETO) throw new Error('bloqueios_demais_para_conferir'); return l; } catch (e) { if (semTabela(e)) return []; throw e; } };
  for (const x of await ler('SELECT tel FROM wa_optout')) { let t = digits(x.tel); if (t.startsWith('55') && t.length >= 12) t = t.slice(2); if (t) porFone.add(semNove(t)); }
  for (const x of await ler('SELECT doc FROM wa_excluidos')) { const d = digits(x.doc); if (d) porDoc.add(d); }
  return { porFone, porDoc };
}

// --- Lista "não enviar e-mail" (descadastrados e inválidos) -----------------------------------
const MOTIVOS_LISTA = ['descadastrado', 'invalido'];
// `estrito` (a rodada de envio): falha de leitura é ERRO, nunca "não está na lista".
export async function consultarNaoEnviar(env, emails, opcoes) {
  const out = new Map();
  const db = env && env.DB_PLOOMES;
  const lista = [...new Set((emails || []).flatMap(emailsDe))];
  if (!db || !lista.length) return out;
  try {
    const r = await db.prepare('SELECT email, motivo, origem, em FROM email_nao_enviar WHERE email IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(lista)).all();
    for (const x of (r && r.results) || []) out.set(x.email, x);
  } catch (e) { if (opcoes && opcoes.estrito && !semTabela(e)) throw e; }
  return out;
}
// `itens` = [{ e: email, m: 'descadastrado' | 'invalido' }] (até 1.000 por chamada). Quem já
// está como "descadastrado" nunca é rebaixado para "inválido" por uma carga posterior, e a
// data da 1ª entrada é mantida.
export async function adicionarNaoEnviar(env, itens, { origem, por } = {}) {
  const db = env && env.DB_PLOOMES;
  if (!db) return { ok: false, gravados: 0 };
  const limpos = new Map();
  for (const it of (Array.isArray(itens) ? itens : []).slice(0, 1000)) {
    const e = emailsDe(it && it.e)[0]; if (!e) continue;
    const m = MOTIVOS_LISTA.includes(it && it.m) ? it.m : 'descadastrado';
    if (limpos.get(e) !== 'descadastrado') limpos.set(e, m);
  }
  if (!limpos.size) return { ok: true, gravados: 0 };
  await garantirTabelas(db);
  const arr = [...limpos].map(([e, m]) => ({ e, m }));
  for (let i = 0; i < arr.length; i += 250) {
    await db.prepare("INSERT INTO email_nao_enviar (email, motivo, origem, em, por) SELECT json_extract(value,'$.e'), json_extract(value,'$.m'), ?2, ?3, ?4 FROM json_each(?1) WHERE true ON CONFLICT(email) DO UPDATE SET motivo = CASE WHEN email_nao_enviar.motivo = 'descadastrado' THEN 'descadastrado' ELSE excluded.motivo END")
      .bind(JSON.stringify(arr.slice(i, i + 250)), String(origem || 'manual').slice(0, 30), new Date().toISOString(), String(por || '').slice(0, 120)).run();
  }
  await auditar(env, por, 'lista não enviar', arr.length === 1 ? `incluiu ${mascarar(arr[0].e)} (${arr[0].m === 'invalido' ? 'inválido' : 'descadastrado'})` : `carga de ${arr.length} e-mail(s)`);
  return { ok: true, gravados: arr.length };
}
export async function removerNaoEnviar(env, email, por) {
  const db = env && env.DB_PLOOMES; const e = emailsDe(email)[0];
  if (!db || !e) return { ok: false };
  try { await db.prepare('DELETE FROM email_nao_enviar WHERE email = ?1').bind(e).run(); } catch { return { ok: false }; }
  await auditar(env, por, 'lista não enviar', `tirou ${mascarar(e)}`);
  return { ok: true };
}
export async function contarNaoEnviar(env) {
  const db = env && env.DB_PLOOMES; if (!db) return { total: 0, porMotivo: {} };
  try {
    const r = await db.prepare('SELECT motivo, COUNT(*) AS n FROM email_nao_enviar GROUP BY motivo').all();
    const porMotivo = {}; let total = 0;
    for (const x of (r && r.results) || []) { porMotivo[x.motivo || 'descadastrado'] = Number(x.n) || 0; total += Number(x.n) || 0; }
    return { total, porMotivo };
  } catch { return { total: 0, porMotivo: {} }; }
}

// --- Decisão e envio de UMA OS ------------------------------------------------------------------
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
// Leitura ESTRITA do KV (a rodada de envio): chave que não existe = null; falha de leitura é
// ERRO — nunca "não existe". Uma operação para até 100 chaves quando há leitura em lote.
async function lerKVEstrito(kv, chaves) {
  const out = new Map();
  const lista = [...new Set((chaves || []).filter(Boolean))].slice(0, 100);
  if (!lista.length) return out;
  let lote = null;
  try { lote = await kv.get(lista); } catch { lote = null; } // sem leitura em lote (ou falha — as leituras abaixo acusam)
  if (lote instanceof Map) { for (const k of lista) out.set(k, lote.has(k) ? lote.get(k) : null); out.emLote = true; return out; }
  for (const k of lista) out.set(k, await kv.get(k));
  return out;
}
const idFicha = (os) => String((os && os.clienteId) || '').replace(/[^a-zA-Z0-9_]/g, '');
// Coleta "antiga": a OS só foi marcada como concluída no sistema muito depois da coleta
// (ex.: arrumação de OS atrasadas). O cliente não recebe pedido sobre coleta de semanas atrás.
function coletaAntiga(os) {
  const t = Date.parse(os.concluidaEm);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(os.dataAgendada || '')) ? Date.parse(`${os.dataAgendada}T12:00:00-03:00`) : NaN;
  if (Number.isFinite(dia)) return t - dia > ANTIGA_DIAS * 86400e3;
  const c = Date.parse(os.criadoEm || '');
  return Number.isFinite(c) && t - c > ANTIGA_SEM_DATA_DIAS * 86400e3;
}
async function gravarFinal(db, base, campos) {
  const v = { ...base, ...campos };
  await db.prepare('INSERT OR IGNORE INTO avaliacao_pedidos (os_id, os_numero, chave, perfil, status, canal, motivo, concluida_em, previsto_em, processado_em, pedida_em, por, para, tentativas, erro, modo, cliente_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)')
    .bind(v.os_id, v.os_numero || '', v.chave || '', v.perfil || '', v.status, v.canal || 'nenhum', v.motivo || null, v.concluida_em || null, v.previsto_em || null, v.processado_em, v.pedida_em || null, v.por || 'sistema', v.para || null, Number(v.tentativas) || 0, v.erro || null, v.modo || '', v.cliente_id || '').run();
}
// Devolve: 'enviado' | 'teste' | 'nao_enviado' | 'falha' | 'ignorada' (nada a fazer agora).
// `linha0` = registro que a OS já tem (só entram aqui: sem registro, "pendente" — envio que
// falhou e vai tentar de novo —, "enviando" travado e reabertura vencida).
async function processarUma(env, cfg, ctx, os, cli, linha0, fichaSumiu) {
  const db = env.DB_PLOOMES, agora = ctx.agoraMs, agoraISO = new Date(agora).toISOString();
  // A OS precisa CONTINUAR concluída (o registro completo é a verdade, não o índice).
  if (!os || os.status !== 'concluida' || !os.concluidaEm) return 'ignorada';
  const tConc = Date.parse(os.concluidaEm);
  if (!Number.isFinite(tConc) || !(tConc >= Date.parse(inicioDoEnvio(cfg)))) return 'ignorada';
  const alvo = quandoEnviar(os.concluidaEm);
  if (alvo == null || alvo > agora) return 'ignorada';
  let linha = linha0 || null;
  // Reaberta e concluída DE NOVO depois: o registro da reabertura deixa de valer.
  if (reaberturaVencida(linha, os.concluidaEm)) {
    await db.prepare("DELETE FROM avaliacao_pedidos WHERE os_id=?1 AND status='nao_enviado' AND motivo='reaberta' AND processado_em=?2").bind(os.id, linha.processado_em).run();
    linha = null;
  }
  // Retomada: o registro ficou em "enviando" porque a rodada que enviava morreu no meio.
  const retomada = !!(linha && linha.status === 'enviando');
  if (linha && !retomada && linha.status !== 'pendente') return 'ignorada';
  if (linha && !retomada && agora - Date.parse(linha.processado_em) < PAUSA_TENTATIVA_MIN * 60e3) return 'ignorada';
  if (retomada && agora - Date.parse(linha.processado_em) < TRAVADO_MIN * 60e3) return 'ignorada';
  const d = dadosDoCliente(os, cli);
  const base = { os_id: os.id, os_numero: os.numero || '', chave: d.chave, perfil: d.perfil, concluida_em: os.concluidaEm, previsto_em: new Date(alvo).toISOString(), processado_em: agoraISO, modo: cfg.modo, cliente_id: d.clienteId };
  // Registra "não enviado". Quando não dá para saber se uma tentativa anterior saiu (retomada,
  // ou nova tentativa cujo último erro foi tempo esgotado/rede), o motivo é sempre "envio não
  // confirmado". Só mexe no registro se ele continua como foi lido.
  const duvida = retomada || !!(linha && INCERTOS.has(linha.erro));
  const nao = async (motivo) => {
    if (linha) await db.prepare("UPDATE avaliacao_pedidos SET status='nao_enviado', canal='nenhum', motivo=?2, processado_em=?3, reserva=NULL WHERE os_id=?1 AND status=?4 AND COALESCE(reserva,'')=?5").bind(os.id, duvida ? 'envio_nao_confirmado' : motivo, agoraISO, linha.status, linha.reserva || '').run();
    else await gravarFinal(db, base, { status: 'nao_enviado', canal: 'nenhum', motivo });
    return 'nao_enviado';
  };
  // Nada que nasceu num modo (teste/ligado) é enviado em outro.
  if (linha && linha.modo && linha.modo !== cfg.modo) return await nao(linha.modo === 'teste' ? 'teste' : 'falha_envio');
  // A OS foi reaberta enquanto este envio estava em andamento: a retomada não reenvia.
  if (retomada && linha.status_antes === 'reaberta') return await nao('envio_nao_confirmado');
  if (agora - alvo > VALIDADE_H * MS_H) return await nao('prazo_expirado');
  // Regras, nesta ordem (a primeira que valer é o motivo que aparece na OS).
  if (coletaAntiga(os)) return await nao('coleta_antiga');
  if (fichaSumiu) return await nao('sem_cadastro'); // a OS aponta para um cadastro que não existe mais
  if (ehDaCasa(cfg.casa, { nomes: d.nomes, doc: d.doc, emails: d.emails.map((x) => x.email) })) return await nao('casa_familia');
  if (!ctx.bloqueios) ctx.bloqueios = await bloqueiosDeContato(db);
  if ((d.doc && ctx.bloqueios.porDoc.has(d.doc)) || d.fones.some((f) => ctx.bloqueios.porFone.has(semNove(f)))) return await nao('bloqueio');
  const resumos = await Promise.all(d.emails.map((x) => resumoEmail(x.email)));
  const q = await consultasDoEnvio(db, d, os.id, agora, cfg.modo === 'teste', resumos);
  if (q.recente) return await nao('ja_pedido_12m');
  // Nenhum endereço bem formado: não tenta o envio. Havia um mal formado → "e-mail inválido".
  if (!d.emails.length) return await nao(d.emailMalFormado ? 'email_invalido' : 'sem_email');
  // Escolha do endereço, na ordem de preferência. Descadastrado = não envia para o cliente;
  // inválido = tenta o próximo; endereço que já recebeu pedido em 12 meses (por outro
  // CNPJ/CPF) = tenta o próximo.
  let alvoEmail = null, resumoAlvo = '', motivoSem = '';
  for (let i = 0; i < d.emails.length; i++) {
    const cand = d.emails[i], b = q.lista.get(cand.email);
    if (b) { if (!motivoSem) motivoSem = b.motivo === 'invalido' ? 'email_invalido' : 'descadastrado'; if (b.motivo !== 'invalido') break; continue; }
    if (q.destinos.has(resumos[i])) { if (!motivoSem) motivoSem = 'ja_pedido_12m'; continue; }
    alvoEmail = cand; resumoAlvo = resumos[i]; break;
  }
  if (!alvoEmail) return await nao(motivoSem || 'descadastrado');
  // A chave pode ter sido desligada (ou trocada) no meio da rodada: confere de novo antes de
  // cada envio. Mudou — ou não deu para ler — → a rodada para aqui, sem enviar.
  const chaveAgora = await lerChave(env);
  if (chaveAgora.modo !== cfg.modo || chaveAgora.desde !== cfg.desde || chaveAgora.ligadoEm !== cfg.ligadoEm) return 'parar';
  // Reserva: só quem grava a própria marca envia (duas rodadas ao mesmo tempo não viram dois
  // e-mails). Sem documento, a chave dos 12 meses é o e-mail que de fato recebe.
  const chaveReg = d.doc ? d.chave : `e:${alvoEmail.email}`;
  const marca = `${agora}-${Math.random().toString(36).slice(2, 10)}`;
  if (!linha) await db.prepare("INSERT OR IGNORE INTO avaliacao_pedidos (os_id, os_numero, chave, perfil, status, canal, concluida_em, previsto_em, processado_em, por, para, tentativas, modo, reserva, cliente_id, para_h) VALUES (?1,?2,?3,?4,'enviando','email',?5,?6,?7,'sistema',?8,1,?9,?10,?11,?12)").bind(os.id, base.os_numero, chaveReg, base.perfil, base.concluida_em, base.previsto_em, agoraISO, mascarar(alvoEmail.email), cfg.modo, marca, d.clienteId, resumoAlvo).run();
  else await db.prepare("UPDATE avaliacao_pedidos SET status='enviando', canal='email', processado_em=?2, para=?3, tentativas=COALESCE(tentativas,0)+1, modo=?4, reserva=?5, chave=?6, cliente_id=?9, para_h=?10 WHERE os_id=?1 AND status=?7 AND COALESCE(reserva,'')=?8").bind(os.id, agoraISO, mascarar(alvoEmail.email), cfg.modo, marca, chaveReg, linha.status, linha.reserva || '', d.clienteId, resumoAlvo).run();
  const minha = await db.prepare('SELECT status, reserva, tentativas FROM avaliacao_pedidos WHERE os_id = ?1').bind(os.id).first();
  if (!minha || minha.reserva !== marca || minha.status !== 'enviando') return 'ignorada';
  const msg = montarMensagem({ perfil: d.perfil, primeiro: primeiroNome(alvoEmail.nome), empresa: d.empresa, link: env.AVALIACAO_LINK });
  const teste = cfg.modo !== 'ligado';
  // A chave de idempotência é a mesma em toda tentativa desta OS: se a anterior chegou ao
  // Resend, repetir devolve o mesmo resultado sem mandar outro e-mail.
  const envio = teste
    ? await enviarResend(env, { para: emailTeste(env), assunto: `[TESTE · ${d.clienteNome || 'cliente'} · ${os.numero || ''}] ${msg.assunto}`.slice(0, 200), texto: `MODO DE TESTE — este e-mail NÃO foi para o cliente.\nIria para: ${alvoEmail.email}\nOS: ${os.numero || ''} · modelo: ${msg.modelo === 'PJ' ? 'empresa' : 'pessoa física'}\n\n— texto que o cliente receberia —\n\nAssunto: ${msg.assunto}\n\n${msg.texto}`, idem: `avaliacao-teste-${os.id}` })
    : await enviarResend(env, { para: alvoEmail.email, assunto: msg.assunto, texto: msg.texto, idem: `avaliacao-${os.id}` });
  ctx.envios = (ctx.envios || 0) + 1;
  if (envio.ok) {
    if (teste) await db.prepare("UPDATE avaliacao_pedidos SET status='teste', canal='nenhum', motivo='teste', pedida_em=NULL, erro=NULL, reserva=NULL WHERE os_id=?1 AND reserva=?2").bind(os.id, marca).run();
    else await db.prepare("UPDATE avaliacao_pedidos SET status='enviado', canal='email', motivo=NULL, pedida_em=?3, erro=NULL, reserva=NULL WHERE os_id=?1 AND reserva=?2").bind(os.id, marca, agoraISO).run();
    return teste ? 'teste' : 'enviado';
  }
  const erro = String(envio.erro || 'erro').slice(0, 40);
  // 409 = o Resend já tinha um pedido com esta chave (conteúdo diferente ou ainda em curso):
  // pode ter saído — não repete.
  const repetido = erro === 'resend_409';
  // Recusa que não é culpa do endereço (chave ou domínio do serviço, limite, serviço fora do
  // ar): não gasta as 6 tentativas — fica na fila até o prazo de 24 horas.
  const doServico = /^resend_(401|403|429|5\d\d)$/.test(erro);
  const acabou = repetido || envio.definitivo || (!doServico && (Number(minha.tentativas) || 1) >= MAX_TENTATIVAS);
  console.error('avaliacao_envio_falhou', os.numero || os.id, erro, acabou ? 'definitivo' : 'vai_tentar_de_novo');
  // Retomada que falhou de novo continua "enviando" (para a próxima tentativa seguir como retomada).
  if (retomada && !acabou) { await db.prepare('UPDATE avaliacao_pedidos SET erro=?3 WHERE os_id=?1 AND reserva=?2').bind(os.id, marca, erro).run(); return 'falha'; }
  const incerto = repetido || retomada || INCERTOS.has(erro);
  await db.prepare('UPDATE avaliacao_pedidos SET status=?3, canal=?4, motivo=?5, erro=?6, reserva=NULL WHERE os_id=?1 AND reserva=?2').bind(os.id, marca, acabou ? 'nao_enviado' : 'pendente', acabou ? 'nenhum' : 'email', acabou ? (incerto ? 'envio_nao_confirmado' : 'falha_envio') : null, erro).run();
  return 'falha';
}

// --- A rodada (chamada pelo agendamento) -------------------------------------------------------
// Qualquer falha de leitura (lista casa/família, registros, lista "não enviar", bloqueios,
// OS, cadastro) faz a rodada NÃO enviar — falha de leitura nunca vira permissão para enviar.
export async function processarAvaliacoes(env, opcoes) {
  const o = opcoes || {};
  const agoraMs = Number.isFinite(o.agoraMs) ? o.agoraMs : Date.now();
  // Desligado (o padrão): uma única leitura e mais nada.
  const chave = await lerChave(env);
  const res = { modo: chave.modo, candidatas: 0, enviados: 0, testes: 0, nao_enviados: 0, falhas: 0 };
  if (chave.modo === 'desligado' || !env || !env.DB_PLOOMES || !env.PORTAL_KV) return res;
  if (!dentroDaJanela(agoraMs)) { res.fora_do_horario = true; return res; }
  // Sem o serviço de e-mail configurado nada é tratado (nem vira "falha"): quando for
  // resolvido, o que ainda estiver no prazo sai.
  if (!env.RESEND_API_KEY) { res.erro = 'sem_chave_email'; console.error('avaliacao_parada', res.erro); return res; }
  const cfg = { ...chave, ...(await lerCasa(env, chave.casaAntiga)) };
  if (cfg.casaErro) { res.erro = 'lista_casa_ilegivel'; console.error('avaliacao_parada', res.erro); return res; }
  const inicio = Date.parse(inicioDoEnvio(cfg));
  if (!Number.isFinite(inicio)) return res;
  const piso = Math.max(inicio, agoraMs - 10 * 86400e3);
  const db = env.DB_PLOOMES;
  // Faxina: nova tentativa de coleta que saiu do período, e "enviando" travado há tanto tempo
  // que não dá mais para retomar com segurança — encerra com o motivo certo.
  try {
    await db.prepare(`UPDATE avaliacao_pedidos SET motivo = CASE WHEN status='enviando' OR ${SQL_INCERTO} THEN 'envio_nao_confirmado' WHEN modo='teste' THEN 'teste' ELSE 'prazo_expirado' END, status='nao_enviado', canal='nenhum', reserva=NULL WHERE (status='pendente' AND concluida_em < ?1) OR (status='enviando' AND processado_em < ?2)`)
      .bind(new Date(piso).toISOString(), new Date(agoraMs - RETOMA_MAX_H * MS_H).toISOString()).run();
  } catch (e) { if (!semTabela(e)) throw e; }
  const cands = [];
  for (const x of await listarColetasOS(env)) {
    if (!x || !x.id || x.status !== 'concluida' || !x.concluidaEm) continue;
    const t = Date.parse(x.concluidaEm);
    if (!Number.isFinite(t) || t < piso) continue;
    const alvo = quandoEnviar(x.concluidaEm);
    if (alvo != null && alvo <= agoraMs) cands.push({ id: String(x.id), alvo, concluidaEm: x.concluidaEm });
  }
  if (!cands.length) return res;
  await garantirTabelas(db);
  const ja = await lerAvaliacoes(env, cands.map((c) => c.id), { estrito: true });
  // Entram: OS ainda sem registro; envio que falhou há mais de 30 min (nova tentativa);
  // "enviando" travado há mais de 20 min (retomada); reabertura vencida (conclusão nova).
  const naVez = (c) => {
    const r = ja.get(c.id);
    if (!r) return true;
    if (r.status === 'pendente') return !(agoraMs - Date.parse(r.processado_em) < PAUSA_TENTATIVA_MIN * 60e3);
    if (r.status === 'enviando') return agoraMs - Date.parse(r.processado_em) >= TRAVADO_MIN * 60e3;
    return reaberturaVencida(r, c.concluidaEm);
  };
  const fila = cands.filter(naVez).sort((a, b) => a.alvo - b.alvo);
  res.candidatas = fila.length;
  if (!fila.length) return res;
  const ctx = { agoraMs, bloqueios: null, envios: 0 };
  const espera = Number.isFinite(o.pausaMs) ? o.pausaMs : PAUSA_ENVIO_MS;
  let acoes = 0, erros = 0, parar = false;
  // A fila é olhada em partes de 40 OS (até 5 partes), parando nas 5 decisões da rodada:
  // OS que não dão em nada (registro defasado, cadastro ilegível) não seguram as de trás.
  for (let ini = 0; ini < fila.length && ini < MAX_EXAME * 5 && acoes < MAX_ACOES && !parar; ini += MAX_EXAME) {
    const parte = fila.slice(ini, ini + MAX_EXAME);
    const regs = await lerKVEstrito(env.PORTAL_KV, parte.map((c) => `os:${c.id}`));
    const oss = new Map();
    for (const c of parte) {
      const raw = regs.get(`os:${c.id}`);
      if (!raw) continue; // sem registro: nada a fazer
      try { oss.set(c.id, JSON.parse(raw)); } catch { console.error('avaliacao_os_ilegivel', c.id); }
    }
    const fichas = await lerKVEstrito(env.PORTAL_KV, [...new Set([...oss.values()].map(idFicha).filter(Boolean))].map((id) => `cli:${id}`));
    for (const c of parte) {
      if (acoes >= MAX_ACOES) break;
      const os = oss.get(c.id);
      if (!os) continue;
      const fid = idFicha(os);
      const raw = fid ? fichas.get(`cli:${fid}`) : null;
      let cli = null;
      // Cadastro ilegível: não dá para aplicar as regras → esta OS não é tratada (fica para a próxima rodada).
      if (raw) { try { cli = JSON.parse(raw); } catch { console.error('avaliacao_cadastro_ilegivel', os.numero || c.id); continue; } }
      try {
        const antes = ctx.envios;
        const r = await processarUma(env, cfg, ctx, os, cli, ja.get(c.id) || null, !!fid && !cli);
        // A chave mudou no meio da rodada (desligaram, ou trocaram o modo): para sem enviar mais nada.
        if (r === 'parar') { res.erro = 'chave_mudou'; parar = true; break; }
        if (r === 'enviado') res.enviados++; else if (r === 'teste') res.testes++; else if (r === 'nao_enviado') res.nao_enviados++; else if (r === 'falha') res.falhas++;
        if (r !== 'ignorada') acoes++;
        if (ctx.envios > antes && espera > 0) await dormir(espera);
      } catch (e) {
        res.falhas++; erros++;
        console.error('avaliacao_erro', os.numero || c.id, String((e && e.message) || e).slice(0, 120));
        if (erros >= 3) { res.erro = 'falhas_seguidas'; parar = true; break; } // banco ou KV fora do ar: para a rodada
      }
    }
    if (!regs.emLote) break; // sem leitura em lote no KV: uma parte só por rodada
  }
  return res;
}

// --- Reabertura (a OS saiu de "concluída") -----------------------------------------------------
// Chamado depois que o escritório muda o status de uma OS. Se ela ESTAVA concluída (dentro do
// período de envio) e deixou de estar, o pedido automático daquela conclusão não sai mais —
// nem se o sistema reconcluir a OS sozinho com a hora antiga. Só uma conclusão NOVA (depois
// da reabertura) volta a valer. Não faz nada (nem lê nada) para OS que nunca foi concluída.
export async function registrarReabertura(env, os, por) {
  const db = env && env.DB_PLOOMES;
  if (!db || !os || !os.id || os.status === 'concluida' || !os.concluidaEm) return { ok: true, nada: true };
  // Leitura ESTRITA da chave: se não der para saber se o envio está ligado, a reabertura é
  // registrada assim mesmo (o lado seguro é não enviar).
  let chave = null;
  try { chave = await lerChave(env, true); } catch { chave = null; }
  if (chave && (chave.modo === 'desligado' || !(Date.parse(os.concluidaEm) >= Date.parse(inicioDoEnvio(chave))))) return { ok: true, nada: true };
  await garantirTabelas(db);
  const agoraMs = Date.now(), agora = new Date(agoraMs).toISOString();
  const quem = String(por || 'sistema').trim().toLowerCase().slice(0, 120);
  await db.batch([
    // nova tentativa que estava na fila: encerra (se o último erro deixou dúvida, "não confirmado")
    db.prepare(`UPDATE avaliacao_pedidos SET motivo = CASE WHEN ${SQL_INCERTO} THEN 'envio_nao_confirmado' ELSE 'reaberta' END, status='nao_enviado', canal='nenhum', processado_em=?2, reserva=NULL WHERE os_id=?1 AND status='pendente'`).bind(String(os.id), agora),
    // "enviando" travado: a retomada não acontece mais; fica "envio não confirmado"
    db.prepare("UPDATE avaliacao_pedidos SET status='nao_enviado', canal='nenhum', motivo='envio_nao_confirmado', reserva=NULL WHERE os_id=?1 AND status='enviando' AND processado_em < ?2").bind(String(os.id), new Date(agoraMs - TRAVADO_MIN * 60e3).toISOString()),
    // "enviando" de agora há pouco (pode estar saindo neste instante): não dá para encerrar,
    // mas fica a marca — se a rodada que enviava morreu, a retomada NÃO reenvia
    db.prepare("UPDATE avaliacao_pedidos SET status_antes='reaberta' WHERE os_id=?1 AND status='enviando'").bind(String(os.id)),
    // reabertura já registrada: renova a hora (só uma conclusão DEPOIS desta reabertura volta a valer)
    db.prepare("UPDATE avaliacao_pedidos SET processado_em=?2, concluida_em=?3, por=?4 WHERE os_id=?1 AND status='nao_enviado' AND motivo='reaberta'").bind(String(os.id), agora, os.concluidaEm, quem),
    db.prepare("INSERT OR IGNORE INTO avaliacao_pedidos (os_id, os_numero, chave, perfil, status, canal, motivo, concluida_em, processado_em, por, tentativas, modo, cliente_id) VALUES (?1,?2,'','','nao_enviado','nenhum','reaberta',?3,?4,?5,0,?6,?7)").bind(String(os.id), os.numero || '', os.concluidaEm, agora, quem, (chave && chave.modo) || '', idFicha(os)),
  ]);
  return { ok: true };
}

// --- "Pedi pelo WhatsApp" (marcação da equipe na OS) -----------------------------------------
// Vale como pedido feito: entra na regra dos 12 meses e o e-mail automático não sai mais.
export async function marcarWhatsapp(env, os, cli, por) {
  const db = env && env.DB_PLOOMES;
  if (!db || !os || !os.id) return { ok: false, message: 'Registro indisponível.' };
  if (os.status !== 'concluida') return { ok: false, message: 'Só dá para marcar depois que a coleta está concluída.' };
  await garantirTabelas(db);
  const atual = await lerAvaliacao(env, os.id);
  if (atual && atual.status === 'enviado') return { ok: false, message: 'O pedido desta coleta já saiu por e-mail.' };
  if (atual && atual.status === 'whatsapp') return { ok: true, ja: true };
  // "Enviando" há pouco = o e-mail está saindo agora; travado há mais de 20 min, pode marcar por cima.
  if (atual && atual.status === 'enviando' && Date.now() - Date.parse(atual.processado_em) < TRAVADO_MIN * 60e3) return { ok: false, message: 'O e-mail desta coleta está saindo agora. Recarregue a página em um minuto.' };
  const agora = new Date().toISOString();
  const d = dadosDoCliente(os, cli);
  const quem = String(por || '').trim().toLowerCase().slice(0, 120);
  // Só grava se o registro continua como foi lido (o envio automático não é atropelado).
  if (atual) await db.prepare("UPDATE avaliacao_pedidos SET status_antes=CASE WHEN status='enviando' THEN 'nao_enviado' ELSE status END, motivo=CASE WHEN status='enviando' THEN 'envio_nao_confirmado' ELSE motivo END, status='whatsapp', canal='whatsapp', pedida_em=?2, por=?3, chave=CASE WHEN COALESCE(chave,'')='' THEN ?4 ELSE chave END, cliente_id=CASE WHEN COALESCE(cliente_id,'')='' THEN ?7 ELSE cliente_id END, reserva=NULL WHERE os_id=?1 AND status=?5 AND COALESCE(reserva,'')=?6").bind(os.id, agora, quem, d.chave, atual.status, atual.reserva || '', d.clienteId).run();
  else await db.prepare("INSERT OR IGNORE INTO avaliacao_pedidos (os_id, os_numero, chave, perfil, status, canal, concluida_em, processado_em, pedida_em, por, tentativas, modo, cliente_id) VALUES (?1,?2,?3,?4,'whatsapp','whatsapp',?5,?6,?6,?7,0,'manual',?8)").bind(os.id, os.numero || '', d.chave, d.perfil, os.concluidaEm || null, agora, quem, d.clienteId).run();
  const depois = await lerAvaliacao(env, os.id);
  if (!depois || depois.status !== 'whatsapp') return { ok: false, message: 'O registro desta coleta mudou agora mesmo. Recarregue a página e confira.' };
  return { ok: true };
}
// Desfazer a marcação (clique errado): volta ao que era; se não havia nada, o registro some
// e a OS volta para a fila normal (só envia se ainda estiver dentro do prazo).
export async function desfazerWhatsapp(env, osId) {
  const db = env && env.DB_PLOOMES;
  if (!db || !osId) return { ok: false };
  const atual = await lerAvaliacao(env, osId);
  if (!atual || atual.status !== 'whatsapp') return { ok: false, message: 'Esta coleta não está marcada como pedida pelo WhatsApp.' };
  if (atual.status_antes) await db.prepare("UPDATE avaliacao_pedidos SET status=status_antes, status_antes=NULL, canal='nenhum', pedida_em=NULL, por='sistema' WHERE os_id=?1 AND status='whatsapp'").bind(String(osId)).run();
  else await db.prepare("DELETE FROM avaliacao_pedidos WHERE os_id=?1 AND status='whatsapp'").bind(String(osId)).run();
  return { ok: true };
}

// --- Exemplo para a própria pessoa da equipe (conferir texto, caixa de entrada e resposta) ----
export async function enviarExemplo(env, para, modelo) {
  const dest = emailsDe(para)[0];
  if (!dest) return { ok: false, message: 'Sua sessão não tem e-mail.' };
  if (env.PORTAL_KV) { const k = `throttle:avaliacao-exemplo:${dest}`; if (await env.PORTAL_KV.get(k)) return { ok: false, message: 'Aguarde um minuto para pedir outro exemplo.' }; await env.PORTAL_KV.put(k, '1', { expirationTtl: 60 }); }
  const msg = modelo === 'PJ' ? montarMensagem({ perfil: 'PJ', primeiro: 'Carlos', empresa: 'Empresa Exemplo Ltda', link: env.AVALIACAO_LINK }) : montarMensagem({ perfil: 'PF', primeiro: 'Maria', empresa: '', link: env.AVALIACAO_LINK });
  const r = await enviarResend(env, { para: dest, assunto: `[EXEMPLO] ${msg.assunto}`, texto: `${msg.texto}\n\n— Exemplo enviado pelo sistema para conferência (nomes fictícios). Responda a este e-mail para conferir se a resposta chega na caixa da Débora.`, idem: `avaliacao-exemplo-${dest}-${Date.now()}` });
  return r.ok ? { ok: true, para: dest } : { ok: false, message: r.erro === 'sem_chave_email' ? 'O serviço de e-mail (Resend) não está configurado.' : `O serviço de e-mail recusou o envio (${r.erro}).`, erro: r.erro };
}

// --- Conferência do domínio de envio (SPF, DKIM, DMARC) — ao vivo ---------------------------
export async function conferirDominio(env) {
  const from = remetente(env);
  const dominio = ((from.match(/@([a-z0-9.-]+)/i) || [])[1] || '').toLowerCase();
  const padrao = String((env && env.RESEND_FROM) || 'Portal Ecobraz <acesso@ecobraz.org.br>');
  const dominioPadrao = ((padrao.match(/@([a-z0-9.-]+)/i) || [])[1] || '').toLowerCase();
  const dns = async (nome, tipo) => {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(nome)}&type=${tipo}`, { headers: { accept: 'application/dns-json' } });
      if (!r.ok) return null;
      const j = await r.json();
      return (Array.isArray(j.Answer) ? j.Answer : []).map((a) => String(a.data || '').replace(/"\s+"/g, '').replace(/^"|"$/g, '')).slice(0, 8);
    } catch { return null; }
  };
  const [raiz, dmarc, dkim, spfEnvio, mxEnvio] = await Promise.all([dns(dominio, 'TXT'), dns(`_dmarc.${dominio}`, 'TXT'), dns(`resend._domainkey.${dominio}`, 'TXT'), dns(`send.${dominio}`, 'TXT'), dns(`send.${dominio}`, 'MX')]);
  const tem = (lista, re) => (lista == null ? null : lista.some((x) => re.test(x)));
  const out = {
    servico: env && env.RESEND_API_KEY ? 'Resend' : '', remetente: from, dominio, remetente_padrao_do_sistema: padrao, mesmo_dominio_do_sistema: !!dominio && dominio === dominioPadrao,
    dkim: { ok: tem(dkim, /p=[A-Za-z0-9+/]{20,}/), onde: `resend._domainkey.${dominio}` },
    spf_envio: { ok: tem(spfEnvio, /v=spf1.*amazonses\.com/i), onde: `send.${dominio}`, valor: (spfEnvio || []).filter((x) => /v=spf1/i.test(x)).map((x) => x.slice(0, 160)) },
    mx_envio: { ok: tem(mxEnvio, /amazonses\.com/i), onde: `send.${dominio}` },
    spf_dominio: { valor: (raiz || []).filter((x) => /v=spf1/i.test(x)).map((x) => x.slice(0, 200)) },
    dmarc: { ok: tem(dmarc, /v=DMARC1/i), valor: (dmarc || []).filter((x) => /v=DMARC1/i.test(x)).map((x) => x.slice(0, 200)) },
    resend: { consultado: false },
  };
  // Situação do domínio dentro do Resend (só com chave de acesso completo; chave "só envio" não lista).
  if (env && env.RESEND_API_KEY) {
    try {
      const r = await fetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${env.RESEND_API_KEY}` } });
      if (r.ok) { const j = await r.json(); const lista = Array.isArray(j.data) ? j.data : []; const meu = lista.find((x) => String(x.name || '').toLowerCase() === dominio); out.resend = { consultado: true, dominios: lista.slice(0, 10).map((x) => ({ nome: String(x.name || ''), situacao: String(x.status || '') })), situacao_deste: meu ? String(meu.status || '') : 'não cadastrado no Resend' }; }
      else out.resend = { consultado: false, http: r.status };
    } catch { out.resend = { consultado: false }; }
  }
  return out;
}

// --- Dados para as telas ------------------------------------------------------------------------
// Situação da avaliação de UMA OS (bloco na tela da OS).
export async function infoAvaliacaoOS(env, os) {
  const [cfg, row] = await Promise.all([lerConfigAvaliacao(env), lerAvaliacao(env, os && os.id)]);
  return { cfg, row: reaberturaVencida(row, os && os.concluidaEm) ? null : row, previstoMs: os && os.concluidaEm ? quandoEnviar(os.concluidaEm) : null };
}
export async function dadosPaginaAvaliacoes(env) {
  const cfg = await lerConfigAvaliacao(env);
  const db = env && env.DB_PLOOMES;
  let ultimos = [], semana = [];
  if (db) {
    try { const r = await db.prepare(`SELECT ${COLUNAS} FROM avaliacao_pedidos ORDER BY COALESCE(pedida_em, processado_em) DESC LIMIT 60`).all(); ultimos = (r && r.results) || []; } catch { ultimos = []; }
    try { const r = await db.prepare('SELECT status, motivo, COUNT(*) AS n FROM avaliacao_pedidos WHERE COALESCE(pedida_em, processado_em) >= ?1 GROUP BY status, motivo').bind(new Date(Date.now() - 7 * 86400e3).toISOString()).all(); semana = (r && r.results) || []; } catch { semana = []; }
  }
  // O serviço de e-mail está recusando os envios (chave, domínio ou limite)? Mostra na tela.
  const recusa = (ultimos.find((r) => r.status === 'pendente' && /^resend_(401|403|429)$/.test(String(r.erro || ''))) || {}).erro || '';
  return { cfg, ultimos, semana, recusa, auditoria: await listarAuditoria(env, 12), naoEnviar: await contarNaoEnviar(env), resendOk: !!(env && env.RESEND_API_KEY), remetente: remetente(env), testePara: emailTeste(env), link: (env && env.AVALIACAO_LINK) || LINK_PADRAO };
}

// --- Telas --------------------------------------------------------------------------------------
const ROTULO_MODO = { desligado: 'DESLIGADO', teste: 'EM TESTE', ligado: 'LIGADO' };
const COR_MODO = { desligado: '#7c8a87;background:#EEF1F0', teste: '#8A6A16;background:#FFF4DE', ligado: '#1E5B31;background:#E4F3E6' };
function resultadoTexto(r) {
  if (r.status === 'enviado') return `✅ pedido enviado por e-mail${r.para ? ` (${r.para})` : ''}`;
  if (r.status === 'whatsapp') return `✅ pedido pelo WhatsApp${r.por && r.por !== 'sistema' ? ` — marcado por ${r.por}` : ''}`;
  if (r.status === 'teste') return `🧪 teste — e-mail só para a equipe${r.para ? ` (iria para ${r.para})` : ''}`;
  if (r.status === 'pendente') return `⏳ o envio falhou — o sistema vai tentar de novo${r.erro ? ` (última tentativa: ${r.erro})` : ''}`;
  if (r.status === 'enviando') return `⏳ envio em andamento${r.erro ? ` (última tentativa: ${r.erro})` : ''}`;
  return `— não enviado: ${ROTULO_MOTIVO[r.motivo] || r.motivo || 'motivo não registrado'}${r.erro ? ` (${r.erro})` : ''}`;
}
// Bloco "Avaliação no Google" da tela da OS. `pode` = sessão do escritório (pode marcar).
export function blocoAvaliacaoOS(os, info, pode) {
  if (!os || os.status !== 'concluida') return '';
  const { cfg, row, previstoMs } = info || {};
  let texto = '', botao = '';
  const bMarcar = '<button class="btn btn-g" style="padding:9px 12px;font-size:12.5px" onclick="avalWpp(\'marcar\')">💬 Pedi pelo WhatsApp</button>';
  if (row) {
    texto = `${esc(resultadoTexto(row))} · ${esc(textoBR(row.pedida_em || row.processado_em))}`;
    if (row.status === 'whatsapp') botao = '<button class="btn btn-g" style="padding:9px 12px;font-size:12.5px" onclick="avalWpp(\'desfazer\')">Desfazer</button>';
    else if (row.status !== 'enviado' && !(row.status === 'enviando' && Date.now() - Date.parse(row.processado_em) < TRAVADO_MIN * 60e3)) botao = bMarcar;
    if (row.status === 'nao_enviado' && ['sem_email', 'reaberta', 'coleta_antiga', 'falha_envio', 'prazo_expirado', 'email_invalido'].includes(row.motivo)) texto += ' — se quiser, peça pelo WhatsApp e marque aqui.';
  } else if (!cfg || cfg.modo === 'desligado') { texto = 'O envio automático está desligado.'; botao = bMarcar; }
  else if (!os.concluidaEm || !(Date.parse(os.concluidaEm) >= Date.parse(inicioDoEnvio(cfg)))) { texto = cfg.modo === 'ligado' ? 'Coleta concluída antes de o envio ser ligado de verdade — não entra no envio.' : 'Coleta concluída antes de o envio automático ser ligado — não entra no envio.'; botao = bMarcar; }
  else if (previstoMs && Date.now() - previstoMs > VALIDADE_H * MS_H) { texto = 'Prazo de envio passou — o pedido automático não sai mais.'; botao = bMarcar; }
  else { texto = `⏳ ${cfg.modo === 'teste' ? 'Teste previsto' : 'Envio previsto'} para ${esc(textoBR(previstoMs))} (2 horas depois da conclusão, entre 08h e 20h).`; botao = bMarcar; }
  return `<div class="card" style="margin-bottom:14px;border-left:4px solid #F2B705">
    <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8A6A16;margin-bottom:6px">⭐ Avaliação no Google</div>
    <div style="font-size:13.5px;color:#10262B;line-height:1.55">${texto}</div>
    ${pode && botao ? `<div style="display:flex;gap:10px;align-items:center;margin-top:10px">${botao}<span id="avm" style="font-size:12.5px;color:#4F6469"></span></div>
    <script>function avalWpp(a){var m=document.getElementById('avm');m.textContent='Salvando…';fetch('/api/coletas/avaliacao-whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${String(os.id).replace(/[^a-zA-Z0-9_-]/g, '')}',acao:a})}).then(function(r){return r.json();}).then(function(j){if(j.ok){location.reload();}else{m.textContent=j.message||'Não foi possível salvar.';}}).catch(function(){m.textContent='Sem conexão.';});}</script>` : ''}
  </div>`;
}

export function paginaAvaliacoes(user, d, podeLigar) {
  const cfg = d.cfg;
  const soma = (f) => d.semana.filter(f).reduce((t, x) => t + (Number(x.n) || 0), 0);
  const naoPorMotivo = d.semana.filter((x) => x.status === 'nao_enviado').map((x) => `${esc(ROTULO_MOTIVO[x.motivo] || x.motivo || 'outro')}: <b>${Number(x.n) || 0}</b>`).join(' · ');
  const bModo = (modo, rotulo, explica, trava) => `<button class="btn ${cfg.modo === modo ? 'btn-d' : 'btn-g'}" ${trava ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''} onclick="modo('${modo}')">${cfg.modo === modo ? '● ' : ''}${rotulo}</button><div style="font-size:11.5px;color:#7c8a87;margin:4px 0 12px;line-height:1.5">${explica}</div>`;
  const linhas = d.ultimos.map((r) => `<tr><td style="padding:7px 8px 7px 0;border-top:1px solid #EEF1F0;white-space:nowrap;color:#4F6469">${esc(textoBR(r.pedida_em || r.processado_em))}</td><td style="padding:7px 8px 7px 0;border-top:1px solid #EEF1F0;white-space:nowrap"><a href="/coletas/os?id=${esc(r.os_id)}" style="color:#0B5B66;font-weight:700;text-decoration:none">${esc(r.os_numero || 'OS')}</a></td><td style="padding:7px 0;border-top:1px solid #EEF1F0">${esc(resultadoTexto(r))}</td></tr>`).join('');
  const mudancas = (d.auditoria || []).map((a) => `<div style="padding:7px 0;border-top:1px solid #EEF1F0;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere"><span style="color:#7c8a87">${esc(textoBR(a.em))} · ${esc(a.por || '')}</span><br><b>${esc(a.acao || '')}</b>: ${esc(a.detalhe || '')}</div>`).join('');
  const exemplo = montarMensagem({ perfil: 'PF', primeiro: 'Maria', empresa: '', link: d.link });
  const exemploPJ = montarMensagem({ perfil: 'PJ', primeiro: 'Carlos', empresa: 'Empresa Exemplo Ltda', link: d.link });
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Avaliações no Google — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px;margin-bottom:14px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:12px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
.btn{display:inline-block;border:none;border-radius:11px;padding:11px 16px;font-size:13.5px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:0 0 10px}
pre{white-space:pre-wrap;word-break:break-word;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:10px;padding:12px;font-size:12.5px;line-height:1.55;font-family:inherit;margin:8px 0 0}
.msg{font-size:12.5px;color:#4F6469;margin-top:8px;line-height:1.5}</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">avaliações</span></a>
  <span style="color:#cfe3e0;font-size:12px">${esc((user && (user.nome || user.email)) || '')}</span></div></div>
<div class="wrap">
  <a href="/inicio" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Início</a>
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 14px"><h1 style="font-size:20px;margin:0">⭐ Pedido de avaliação no Google</h1>
    <span style="font-size:11px;font-weight:800;padding:4px 11px;border-radius:20px;color:${COR_MODO[cfg.modo]}">${ROTULO_MODO[cfg.modo]}${cfg.desde ? ` · desde ${esc(textoBR(cfg.desde))}` : ''}</span></div>
  ${d.resendOk ? '' : '<div class="card" style="border-color:#F3C6C6;background:#FDECEC;color:#9B1C1C;font-size:13px;font-weight:700">O serviço de e-mail (Resend) não está configurado neste sistema — nenhum pedido sai enquanto isso não for resolvido.</div>'}
  ${d.recusa ? `<div class="card" style="border-color:#F3C6C6;background:#FDECEC;color:#9B1C1C;font-size:13px;font-weight:700">O serviço de e-mail está RECUSANDO os envios (código ${esc(d.recusa)}${d.recusa === 'resend_429' ? ': limite do plano atingido' : ': chave ou domínio não aceito'}). Os pedidos ficam na fila por até 24 horas e saem sozinhos quando isso for resolvido no Resend.</div>` : ''}
  <div class="card">
    <div class="sec">Chave</div>
    ${bModo('desligado', 'Desligado', 'Nada é enviado. É o padrão.', false)}
    ${bModo('teste', 'Teste', `O e-mail vai <b>só para ${esc(d.testePara)}</b>, com o nome do cliente no assunto. <b>Nada vai para o cliente.</b> Use nos 3 primeiros dias.`, false)}
    ${bModo('ligado', 'Ligado de verdade', podeLigar ? 'O pedido vai para o cliente, 2 horas depois da coleta concluída (entre 08h e 20h).' : 'O pedido vai para o cliente. <b>Só a diretoria (Marcio) pode ligar.</b>', !podeLigar && cfg.modo !== 'ligado')}
    <div class="msg">Ligar a chave vale só para coletas concluídas <b>depois</b> de ligar — nenhuma coleta antiga recebe pedido. As coletas do período de teste também <b>não</b> recebem e-mail quando você liga de verdade.${cfg.por ? ` Última mudança: ${esc(cfg.por)}, ${esc(textoBR(cfg.atualizadoEm))}.` : ''}</div>
    ${cfg.casaErro ? '<div class="msg" style="color:#9B1C1C;font-weight:700">Não consegui ler a lista “casa e família” agora — enquanto isso, nenhum pedido sai. Recarregue a página; se continuar, salve a lista de novo.</div>' : ''}
    <div id="mModo" class="msg"></div>
  </div>
  <div class="card">
    <div class="sec">Antes de ligar — conferir</div>
    <div style="font-size:13px;color:#4F6469;line-height:1.55">Remetente e resposta: <b>${esc(d.remetente)}</b>.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-g" onclick="conferir()">🔎 Conferir o domínio (SPF e DKIM)</button>
      <button class="btn btn-g" onclick="exemplo('PF')">✉️ Enviar exemplo (pessoa) para mim</button>
      <button class="btn btn-g" onclick="exemplo('PJ')">✉️ Enviar exemplo (empresa) para mim</button>
    </div>
    <div id="mConf" class="msg"></div>
    <div class="msg">O exemplo vai só para o seu e-mail (${esc((user && user.email) || '')}), com nomes fictícios. Responda a ele: a resposta deve chegar na caixa da Débora.</div>
  </div>
  <div class="card">
    <div class="sec">Últimos 7 dias</div>
    <div style="font-size:13.5px;line-height:1.7">Pedidos por e-mail: <b>${soma((x) => x.status === 'enviado')}</b> · pelo WhatsApp: <b>${soma((x) => x.status === 'whatsapp')}</b> · testes: <b>${soma((x) => x.status === 'teste')}</b> · não enviados: <b>${soma((x) => x.status === 'nao_enviado')}</b>${naoPorMotivo ? `<br><span style="color:#4F6469;font-size:12.5px">${naoPorMotivo}</span>` : ''}</div>
    <div class="sec" style="margin-top:16px">Últimos registros</div>
    ${linhas ? `<table style="width:100%;border-collapse:collapse;font-size:13px">${linhas}</table>` : '<div style="font-size:13px;color:#8fa39f">Nenhum registro ainda.</div>'}
  </div>
  <div class="card">
    <div class="sec">Lista “não enviar e-mail” (descadastrados e inválidos)</div>
    <div style="font-size:13.5px">Hoje na lista: <b id="tLista">${Number(d.naoEnviar.total) || 0}</b> e-mail(s)${d.naoEnviar.total ? ` — descadastrados: ${Number(d.naoEnviar.porMotivo.descadastrado) || 0} · inválidos: ${Number(d.naoEnviar.porMotivo.invalido) || 0}` : ''}.</div>
    <label>Um e-mail</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="lEmail" type="email" placeholder="cliente@exemplo.com.br" style="flex:1;min-width:220px"><select id="lMotivo" style="width:auto"><option value="descadastrado">pediu para sair</option><option value="invalido">e-mail inválido (voltou)</option></select></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button class="btn btn-g" onclick="lista('consultar')">Consultar</button><button class="btn btn-p" onclick="lista('adicionar')">Colocar na lista</button><button class="btn btn-g" onclick="lista('remover')">Tirar da lista</button></div>
    <div id="mLista" class="msg">Cliente respondeu “remover”? Coloque o e-mail dele aqui.</div>
    <label style="margin-top:18px">Carga de um arquivo (lista do E-goi)</label>
    <div style="font-size:12.5px;color:#4F6469;line-height:1.55;margin-bottom:8px">Arquivo <b>.csv</b> ou <b>.txt</b>, do jeito que o E-goi exporta: basta ter o e-mail em cada linha. Se a linha disser “removido”, “bounce” ou parecido, o motivo é lido dela; senão vale o escolhido abaixo. Linha que disser “ativo” só é pulada quando o mesmo arquivo também tem linhas de removidos (exportação completa). Antes de gravar, o sistema mostra a contagem e pede confirmação. O arquivo é lido no seu navegador e só os e-mails sobem para o sistema.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input id="arq" type="file" accept=".csv,.txt,text/csv,text/plain" style="flex:1;min-width:220px"><select id="aMotivo" style="width:auto"><option value="descadastrado">são descadastrados</option><option value="invalido">são inválidos</option></select><button class="btn btn-p" onclick="carga()">Carregar</button></div>
    <div id="mCarga" class="msg"></div>
  </div>
  <div class="card">
    <div class="sec">Casa e família (nunca recebem)</div>
    <div style="font-size:12.5px;color:#4F6469;line-height:1.55">Um por linha: pedaço do nome (4 letras ou mais), CNPJ/CPF, e-mail ou domínio. Se a lista ficar vazia, volta sozinha ao padrão (ecobraz, villanova).</div>
    <textarea id="casa" rows="4" style="margin-top:8px">${esc(cfg.casa.join('\n'))}</textarea>
    <div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="btn btn-g" onclick="salvarCasa()">Salvar lista</button><span id="mCasa" class="msg" style="margin:0"></span></div>
  </div>
  <div class="card">
    <div class="sec">Últimas mudanças (chave e listas)</div>
    ${mudancas || '<div style="font-size:13px;color:#8fa39f">Nenhuma mudança registrada ainda.</div>'}
  </div>
  <div class="card">
    <div class="sec">Como funciona</div>
    <div style="font-size:13px;color:#4F6469;line-height:1.7">• Sai 2 horas depois de a coleta ficar <b>concluída</b>, só entre 08h e 20h (fora disso, às 08h seguintes). O sistema confere a cada 10 minutos.<br>• Um pedido por cliente a cada 12 meses (pelo CNPJ/CPF; sem documento, pelo e-mail). O mesmo endereço de e-mail também não recebe dois pedidos em 12 meses, ainda que seja contato de empresas diferentes — nesse caso o pedido vai para o contato seguinte da empresa, se houver.<br>• Não recebem: casa e família, cliente com bloqueio de contato, quem já recebeu em 12 meses, quem não tem e-mail, quem tem e-mail mal formado no cadastro (endereço cortado, com “|” no meio, texto grudado — aparece como “e-mail inválido”) e quem está na lista “não enviar e-mail”. O motivo aparece na OS.<br>• Também não sai: coleta marcada como concluída mais de 10 dias depois da data dela (coleta antiga) e coleta que foi <b>reaberta</b> depois de concluída — só uma conclusão nova volta a valer.<br>• Contato marcado como inativo/desligado no cadastro não recebe.<br>• Se o sistema não conseguir ler as listas ou o cadastro, ele <b>não envia</b> e tenta de novo na rodada seguinte.<br>• Sem e-mail? Peça pelo WhatsApp e marque <b>“Pedi pelo WhatsApp”</b> na OS — vale como pedido feito.<br>• Texto simples, sem imagem. O link é o do Google, sem rastreio.</div>
    <label>Pessoa física — assunto: ${esc(exemplo.assunto)}</label><pre>${esc(exemplo.texto)}</pre>
    <label>Empresa — assunto: ${esc(exemploPJ.assunto)}</label><pre>${esc(exemploPJ.texto)}</pre>
  </div>
</div>
<script>
function $(i){return document.getElementById(i);}
function post(u,b){return fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})}).then(function(r){return r.json();});}
function modo(m){if(m==='ligado'&&!confirm('Ligar de verdade? A partir de agora os clientes passam a receber o pedido de avaliação.'))return;$('mModo').textContent='Salvando…';post('/api/avaliacoes/modo',{modo:m}).then(function(j){if(j.ok){location.reload();}else{$('mModo').textContent=j.message||'Não foi possível mudar.';}}).catch(function(){$('mModo').textContent='Sem conexão.';});}
function sn(v){return v===true?'✅ certo':(v===false?'❌ NÃO encontrado':'❔ não deu para consultar');}
function conferir(){var m=$('mConf');m.textContent='Consultando…';post('/api/avaliacoes/conferir').then(function(j){if(!j.ok){m.textContent=j.message||'Não foi possível conferir.';return;}var c=j.conferencia,l=[];
  l.push('Serviço de envio: '+(c.servico||'NÃO configurado')+' · domínio do remetente: '+c.dominio+(c.mesmo_dominio_do_sistema?' (o mesmo dos outros e-mails do sistema)':' (atenção: os outros e-mails do sistema saem de outro domínio — '+c.remetente_padrao_do_sistema+')'));
  l.push('DKIM (assinatura): '+sn(c.dkim.ok)+' — '+c.dkim.onde);
  l.push('SPF do envio: '+sn(c.spf_envio.ok)+' — '+c.spf_envio.onde+(c.spf_envio.valor.length?' = '+c.spf_envio.valor.join(' | '):''));
  l.push('Retorno (MX do envio): '+sn(c.mx_envio.ok));
  l.push('DMARC: '+sn(c.dmarc.ok)+(c.dmarc.valor.length?' = '+c.dmarc.valor.join(' | '):''));
  if(c.spf_dominio.valor.length)l.push('SPF do domínio principal: '+c.spf_dominio.valor.join(' | '));
  l.push(c.resend.consultado?('Situação no Resend: '+c.resend.situacao_deste+' (domínios da conta: '+c.resend.dominios.map(function(x){return x.nome+' = '+x.situacao;}).join(', ')+')'):'Situação no painel do Resend: não deu para consultar por aqui (a chave do sistema é só de envio) — confira em resend.com → Domains.');
  m.innerHTML=l.map(function(x){return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;');}).join('<br>');}).catch(function(){m.textContent='Sem conexão.';});}
function exemplo(t){var m=$('mConf');m.textContent='Enviando…';post('/api/avaliacoes/exemplo',{modelo:t}).then(function(j){m.textContent=j.ok?('Exemplo enviado para '+j.para+'. Confira a caixa de entrada (e o spam) e responda a ele.'):(j.message||'Não foi possível enviar.');}).catch(function(){m.textContent='Sem conexão.';});}
function lista(a){var e=$('lEmail').value.trim(),m=$('mLista');if(!e){m.textContent='Digite o e-mail.';return;}m.textContent='…';post('/api/avaliacoes/nao-enviar',{acao:a,email:e,motivo:$('lMotivo').value}).then(function(j){m.textContent=j.message||(j.ok?'Feito.':'Não foi possível.');if(j.ok&&j.total!=null)$('tLista').textContent=j.total;}).catch(function(){m.textContent='Sem conexão.';});}
function salvarCasa(){var m=$('mCasa');m.textContent='Salvando…';post('/api/avaliacoes/casa',{texto:$('casa').value}).then(function(j){m.textContent=j.ok?'Salvo.':(j.message||'Não foi possível salvar.');}).catch(function(){m.textContent='Sem conexão.';});}
function carga(){var f=$('arq').files[0],m=$('mCarga');if(!f){m.textContent='Escolha o arquivo.';return;}var padrao=$('aMotivo').value;var r=new FileReader();
  r.onload=function(){var RE=/^[a-z0-9_%+&-]+(\\.[a-z0-9_%+&-]+)*@[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}$/,linhas=String(r.result||'').split(/\\r?\\n/),achados=[],temSaida=false,i;
    for(i=0;i<linhas.length;i++){var t=linhas[i].toLowerCase(),cels=t.split(/[\\s,;|<>()\\[\\]"]+/),e='';
      for(var c=0;c<cels.length;c++){var x=cels[c].replace(/^[.']+|[.']+$/g,'');if(x.length<=254&&RE.test(x)){e=x;break;}}
      if(!e)continue;var resto=t.replace(e,' '),tipo='';
      if(/\\b(inativ[oa]s?|removid[oa]s?|removed|descadastr\\w*|unsubscri\\w*|opt[- ]?out|cancelad[oa]s?|cancell?ed|reclama\\w*|spam|complain\\w*)\\b/.test(resto))tipo='descadastrado';
      else if(/\\b(bounce[ds]?|hard|inv[aá]lid[oa]s?|invalid|inexistente)\\b/.test(resto))tipo='invalido';
      else if(/\\b(ativ[oa]s?|active|subscribed|inscrit[oa]s?|confirmad[oa]s?)\\b/.test(resto))tipo='ativo';
      if(tipo==='descadastrado'||tipo==='invalido')temSaida=true;
      achados.push({e:e,t:tipo});}
    var mapa={},pulados=0,semSituacao=0,ditosAtivos=0;
    for(i=0;i<achados.length;i++){var a=achados[i],mo=a.t;
      if(mo==='ativo'){if(temSaida){pulados++;continue;}ditosAtivos++;mo=padrao;}
      else if(!mo){semSituacao++;mo=padrao;}
      if(mapa[a.e]!=='descadastrado')mapa[a.e]=mo;}
    var itens=Object.keys(mapa).map(function(k){return{e:k,m:mapa[k]};});if(!itens.length){m.textContent='Não achei nenhum e-mail para a lista nesse arquivo'+(pulados?' ('+pulados+' linha(s) de contatos ATIVOS foram puladas)':'')+'.';return;}
    var nInv=itens.filter(function(q){return q.m==='invalido';}).length,rot=padrao==='invalido'?'inválidos':'descadastrados';
    var aviso='Achei '+itens.length+' e-mail(s) diferentes: '+(itens.length-nInv)+' como descadastrado(s) e '+nInv+' como inválido(s).';
    if(semSituacao)aviso+='\\n'+semSituacao+' linha(s) não diziam a situação: entraram como '+rot+' (o que você escolheu).';
    if(pulados)aviso+='\\nPulei '+pulados+' linha(s) de contatos ATIVOS.';
    if(ditosAtivos)aviso+='\\nATENÇÃO: '+ditosAtivos+' linha(s) dizem "ativo/confirmado", mas o arquivo não tem nenhuma linha de removido — tratei o arquivo INTEIRO como lista de quem NÃO deve receber. Se este arquivo for a lista de contatos ATIVOS, cancele.';
    if(!confirm(aviso+'\\n\\nColocar na lista “não enviar e-mail”?')){m.textContent='Cancelado: nada foi gravado.';return;}var pos=0,gravados=0;
    (function proximo(){if(pos>=itens.length){m.textContent='Pronto: '+gravados+' e-mail(s) na lista. Recarregue a página para ver o total.';return;}m.textContent='Carregando… '+pos+' de '+itens.length;
      post('/api/avaliacoes/nao-enviar',{acao:'importar',itens:itens.slice(pos,pos+500)}).then(function(j){if(!j.ok){m.textContent='Parou em '+pos+' de '+itens.length+': '+(j.message||'erro')+'. Pode carregar o mesmo arquivo de novo — não duplica.';return;}gravados+=j.gravados||0;pos+=500;proximo();}).catch(function(){m.textContent='Sem conexão (parou em '+pos+'). Pode carregar o mesmo arquivo de novo — não duplica.';});})();};
  r.onerror=function(){m.textContent='Não consegui ler o arquivo.';};r.readAsText(f);}
</script></body></html>`;
}
