// ATENDIMENTO — quanto tempo leva do pedido do cliente até a coleta (pedido do Marcio,
// 18/11/2026: "medir e encurtar o tempo entre o pedido e a coleta"). Este módulo reúne
// as regras; as rotas e telas só chamam.
//
//   • Hora do pedido: lead.criadoEm (ISO, UTC). O registro do lead sempre gravou data E
//     hora; aqui ficam os conversores para o horário de Brasília (UTC-3, sem verão).
//   • Histórico do lead (D1, tabela lead_historico): cada mudança de status, com quem e
//     quando. No próprio lead: primeiroContatoEm / primeiroContatoPor (a 1ª ação de
//     alguém da equipe sobre o pedido). Ações automáticas do sistema entram no
//     histórico, mas NÃO contam como primeiro contato.
//   • Vínculo EXATO lead → OS: a OS gerada a partir do pedido grava leadId e o lead
//     guarda osId/osNumero. O vínculo "provável" fica só para o histórico antigo.
//   • Lote grande (decisão do Marcio, 18/11/2026): empresa (PJ) com 51 itens ou mais,
//     ou pedido de desmobilização de ativos → coleta em até 72h do pedido. Destaque
//     na caixa de entrada, e-mail na hora para a Débora e prazo-alvo na OS.
//     Ajustáveis por variável do Worker: LOTE_GRANDE_MIN_ITENS (51),
//     LOTE_GRANDE_PRAZO_HORAS (72), LOTE_GRANDE_PALAVRAS ("desmobiliza"),
//     LOTE_GRANDE_AVISO_EMAILS (destinatários do aviso; padrão: a Débora) e
//     LOTE_GRANDE_MAX_AVISOS_HORA (10 e-mails por hora, no máximo).

const MS_H = 3600e3;
const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');

// --- Início da medição ------------------------------------------------------------------
// A medição começou na publicação de 18/11/2026 às 04:11 UTC (01:11 de Brasília). Pedido
// "medido" = entrou pelo código novo: grava medicao=1 (os que chegaram entre a publicação
// e essa marca valem pela hora). Pedido ANTERIOR nunca ganha 1º contato nem vínculo exato:
// a hora real do contato é desconhecida e o vínculo dele continua o "provável" — assim
// nenhum registro antigo é alterado por essas regras.
export const INICIO_MEDICAO = '2026-11-18T04:11:00.000Z';
export const INICIO_MEDICAO_TXT = '18/11/2026 01:11';
export const medido = (l) => !!l && (l.medicao === 1 || Date.parse(l.criadoEm) >= Date.parse(INICIO_MEDICAO));
const semAcentoMin = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const escH = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Hora de Brasília -----------------------------------------------------------------
// ISO (UTC) → "AAAA-MM-DDTHH:MM:SS-03:00". Aceita também segundos Unix (campos antigos).
export function isoBR(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  return new Date(t - 3 * MS_H).toISOString().slice(0, 19) + '-03:00';
}
// ISO → "17/11/2026 14:32" (para as telas).
export function textoBR(v) {
  const s = isoBR(v);
  return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}` : '';
}
// "AAAA-MM-DDTHH:MM" digitado no horário de Brasília → ISO (UTC). '' se inválido.
export function deLocalBR(v) {
  const m = String(v == null ? '' : v).trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return '';
  const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:00-03:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
// "AAAA-MM-DDTHH:MM" de agora, em Brasília (valor inicial dos campos de data e hora).
export const agoraLocalBR = () => new Date(Date.now() - 3 * MS_H).toISOString().slice(0, 16);
export const minutosEntre = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 60000) : null; };

// --- Perfil, volume e lote grande -------------------------------------------------------
// Perfil pelo DOCUMENTO (CNPJ = PJ, CPF = PF); sem documento, o que a pessoa marcou no
// formulário. '' quando não dá para saber (ex.: Coleta Expressa sem documento).
export function perfilDoLead(l) {
  const d = digits(l && l.documento);
  if (d.length === 14) return 'PJ';
  if (d.length === 11) return 'PF';
  if (l && l.perfil === 'empresa') return 'PJ';
  if (l && l.perfil === 'pessoa_fisica') return 'PF';
  return '';
}
// Quantidade de itens declarada. Faixa do formulário ("51 a 200 itens") vale pelo
// MÍNIMO da faixa; "Mais de 200" = 201; "Até 10" = 10; número solto vale o número;
// "Não sei estimar" = null. Sem volume, procura "Quantidade de itens: N"/"Itens: N"
// que o portal e a Coleta Expressa escrevem na descrição.
export function itensDeclarados(volume) {
  const t = semAcentoMin(volume).replace(/(\d)\.(?=\d{3}\b)/g, '$1');
  if (!t.trim() || /nao sei/.test(t)) return null;
  let m = t.match(/(\d+)\s*(?:a|ate|-|–)\s*(\d+)/);
  if (m) return Number(m[1]);
  m = t.match(/(?:mais de|acima de|\+)\s*(\d+)/);
  if (m) return Number(m[1]) + 1;
  m = t.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}
export function itensDoLead(l) {
  const v = itensDeclarados(l && l.volume);
  if (v != null) return v;
  const m = semAcentoMin(l && l.descricao).match(/(?:quantidade de itens|itens)\s*:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
export function regrasLoteGrande(env) {
  const e = env || {};
  const n = (v, d, min, max) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= min && x <= max ? x : d; };
  const palavras = String(e.LOTE_GRANDE_PALAVRAS || 'desmobiliza').split(/[,;]+/).map((s) => semAcentoMin(s).trim()).filter((s) => s.length >= 4);
  return { minItens: n(e.LOTE_GRANDE_MIN_ITENS, 51, 2, 1000000), prazoHoras: n(e.LOTE_GRANDE_PRAZO_HORAS, 72, 1, 2400), palavras: palavras.length ? palavras : ['desmobiliza'] };
}
// Entradas da caixa que NÃO são pedido de coleta (propostas e compras de carbono/ESG/
// Adote um Bairro, chamados de suporte do portal): nunca viram lote grande — evita
// alarme falso (e e-mail) vindo de formulário de proposta com texto livre.
const ORIGEM_NAO_COLETA = /^(carbono|esg|adote|portal-chamado)/;
export const ehPedidoDeColeta = (l) => !ORIGEM_NAO_COLETA.test(String((l && l.origem) || ''));
// Triagem que já responde "não coletamos" / "só itens perigosos": não vira lote grande.
const TRIAGEM_SEM_COLETA = new Set(['barrado', 'so_perigosos']);
// É lote grande? Só EMPRESA (PJ): 51+ itens declarados, ou pedido de desmobilização de
// ativos. A desmobilização vale só por campo ESTRUTURADO — categoria do material, página
// de origem do formulário (as páginas de desmobilização do site mandam
// "origem=desmobilizacao-…") ou campanha —, nunca pelo texto livre que a pessoa digita
// ("não é desmobilização" não pode disparar alarme).
export function avaliarLoteGrande(lead, env) {
  const r = regrasLoteGrande(env);
  const l = lead || {};
  const perfil = perfilDoLead(l);
  const itens = itensDoLead(l);
  const nao = { loteGrande: false, motivo: '', itens, perfil };
  if (!ehPedidoDeColeta(l) || perfil !== 'PJ') return nao;
  const tri = l.triagem && typeof l.triagem === 'object' ? l.triagem.tipo : l.triagem;
  if (TRIAGEM_SEM_COLETA.has(tri)) return nao;
  const estruturado = semAcentoMin([l.material, l.pagina, l.utm && l.utm.campaign].filter(Boolean).join(' '));
  if (r.palavras.some((p) => estruturado.includes(p))) return { loteGrande: true, motivo: 'desmobilização de ativos', itens, perfil };
  if (itens != null && itens >= r.minItens) return { loteGrande: true, motivo: `empresa com ${String(l.volume || `${itens} itens`).trim()}`, itens, perfil };
  return nao;
}
// Marca o lead (antes de gravar): loteGrande, motivo e prazo-alvo (pedido + 72h).
export function marcarLoteGrande(lead, env) {
  const a = avaliarLoteGrande(lead, env);
  if (!a.loteGrande) return a;
  const r = regrasLoteGrande(env);
  const base = Date.parse(lead.criadoEm);
  lead.loteGrande = true;
  lead.loteGrandeMotivo = a.motivo;
  lead.prazoHoras = r.prazoHoras;
  lead.prazoAlvoEm = Number.isFinite(base) ? new Date(base + r.prazoHoras * MS_H).toISOString() : '';
  return a;
}
// Situação do prazo-alvo de uma OS de lote grande (ou de um lead ainda sem OS).
// cumpriu: true/false quando já dá para dizer; null enquanto está dentro do prazo.
export function situacaoPrazo(alvoISO, { status, concluidaEm } = {}, agoraMs) {
  const alvo = Date.parse(alvoISO);
  if (!Number.isFinite(alvo)) return null;
  const agora = Number.isFinite(agoraMs) ? agoraMs : Date.now();
  const h = (x) => Math.round(x / MS_H * 10) / 10;
  if (status === 'cancelada') return { situacao: 'cancelada', cumpriu: null, texto: 'OS cancelada' };
  if (status === 'concluida') {
    const fim = Date.parse(concluidaEm);
    if (!Number.isFinite(fim)) return { situacao: 'concluida_sem_hora', cumpriu: null, texto: 'concluída (hora da conclusão não registrada)' };
    return fim <= alvo ? { situacao: 'cumprido', cumpriu: true, horas: h(alvo - fim), texto: `cumprido (${h(alvo - fim)}h antes do prazo)` } : { situacao: 'atrasou', cumpriu: false, horas: h(fim - alvo), texto: `atrasou ${h(fim - alvo)}h` };
  }
  return alvo >= agora ? { situacao: 'no_prazo', cumpriu: null, horas: h(alvo - agora), texto: `no prazo — faltam ${h(alvo - agora)}h` } : { situacao: 'vencido', cumpriu: false, horas: h(agora - alvo), texto: `prazo vencido há ${h(agora - alvo)}h` };
}

// --- Status e primeiro contato ------------------------------------------------------------
// Status em que o pedido JÁ teve resposta de alguém da equipe.
const COM_CONTATO = new Set(['contatado', 'tratado', 'sem_retorno']);
// Status de pedido já resolvido. Um pedido que JÁ ESTAVA resolvido (ex.: tratado antes
// desta medição existir) não ganha "primeiro contato" agora — a hora real é desconhecida.
const JA_RESOLVIDO = new Set(['tratado', 'sem_retorno', 'excluido']);
// Aplica a mudança no registro (não grava): devolve o que mudou para o histórico.
// humano=false (ação automática do sistema) nunca marca o primeiro contato, nem pedido
// anterior ao início da medição (medido = false).
// contato=true/false força a decisão (ex.: botão "Registrei o contato").
export function aplicarStatusLead(lead, novo, { por, humano = true, contato } = {}) {
  const de = lead.status || 'novo';
  const em = new Date().toISOString();
  if (novo) lead.status = novo;
  let primeiroContato = false;
  const conta = contato != null ? !!contato : (COM_CONTATO.has(lead.status) && !JA_RESOLVIDO.has(de));
  if (humano && conta && !lead.primeiroContatoEm && medido(lead)) {
    lead.primeiroContatoEm = em;
    lead.primeiroContatoPor = String(por || '').trim().toLowerCase().slice(0, 120);
    primeiroContato = true;
  }
  return { de, para: lead.status, em, primeiroContato };
}

// --- Histórico (D1) -------------------------------------------------------------------------
let tabelaOk = false;
async function garantirTabela(db) {
  if (tabelaOk) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS lead_historico (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, status_anterior TEXT, status_novo TEXT, em TEXT NOT NULL, por TEXT, evento TEXT, detalhe TEXT)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS lead_historico_lead ON lead_historico (lead_id)').run();
  tabelaOk = true;
}
// Uma linha por acontecimento. `detalhe` nunca leva dado pessoal (só número de OS,
// canal etc.). Nunca derruba a ação principal: falha vira só um log.
export async function registrarHistoricoLead(env, { leadId, de, para, em, por, evento, detalhe }) {
  const db = env && env.DB_PLOOMES;
  if (!db || !leadId) return false;
  try {
    await garantirTabela(db);
    await db.prepare('INSERT INTO lead_historico (lead_id, status_anterior, status_novo, em, por, evento, detalhe) VALUES (?1,?2,?3,?4,?5,?6,?7)')
      .bind(String(leadId).slice(0, 60), de || null, para || null, em || new Date().toISOString(), String(por || '').slice(0, 120), String(evento || 'status').slice(0, 40), String(detalhe || '').slice(0, 200)).run();
    return true;
  } catch (e) { console.error('lead_historico_falhou', String((e && e.message) || e).slice(0, 140)); return false; }
}
export async function listarHistoricoLead(env, leadId) {
  const db = env && env.DB_PLOOMES;
  if (!db || !leadId) return [];
  try {
    const r = await db.prepare('SELECT status_anterior AS de, status_novo AS para, em, por, evento, detalhe FROM lead_historico WHERE lead_id = ?1 ORDER BY id').bind(String(leadId)).all();
    return (r && r.results) || [];
  } catch { return []; } // tabela ainda não criada: sem histórico
}
// Muda o status, marca o 1º contato (se for o caso) e devolve o registro do histórico
// pronto — quem chama grava o lead e depois o histórico.
export function mudancaComHistorico(lead, novo, { por, humano = true, evento, detalhe, contato } = {}) {
  const m = aplicarStatusLead(lead, novo, { por, humano, contato });
  return { ...m, historico: { leadId: lead.id, de: m.de, para: m.para, em: m.em, por: humano ? String(por || '') : String(por || 'sistema'), evento: evento || 'status', detalhe } };
}

// --- Aviso de lote grande por e-mail ---------------------------------------------------------
// Destinatária: a Débora (decisão do Marcio, 18/11/2026). Outra lista só se a variável
// própria LOTE_GRANDE_AVISO_EMAILS for configurada — não herda a lista da cobrança.
export function destinatariosLoteGrande(env) {
  const e = env || {};
  const bruto = e.LOTE_GRANDE_AVISO_EMAILS || 'debora.villanova@ecobraz.org.br';
  return [...new Set(String(bruto).split(/[,;]+/).map((s) => s.split('|')[0].trim().toLowerCase()).filter((s) => /^\S+@\S+\.\S+$/.test(s)))].slice(0, 10);
}
// Best-effort e uma vez só por lead. `por` (quem registrou à mão) não recebe o aviso.
export async function avisarLoteGrande(env, lead, { por } = {}) {
  if (!env || !lead || !lead.loteGrande) return { enviado: false, motivo: 'nao_lote_grande' };
  if (!env.RESEND_API_KEY) return { enviado: false, motivo: 'sem_chave_email' };
  const dest = destinatariosLoteGrande(env).filter((x) => x !== String(por || '').trim().toLowerCase());
  if (!dest.length) return { enviado: false, motivo: 'sem_destinatario' };
  const chave = `notif:lotegrande:${lead.id}`;
  if (env.PORTAL_KV && await env.PORTAL_KV.get(chave)) return { enviado: false, motivo: 'ja_avisado' };
  // Teto por hora (o formulário do site é público): passado o teto, o pedido continua
  // marcado e em destaque na caixa de entrada — só o e-mail deixa de sair.
  const maxHora = Math.max(1, Math.round(Number(env.LOTE_GRANDE_MAX_AVISOS_HORA)) || 10);
  const chaveHora = `notif:lotegrande:hora:${new Date().toISOString().slice(0, 13)}`;
  const nHora = env.PORTAL_KV ? (Number(await env.PORTAL_KV.get(chaveHora)) || 0) : 0;
  if (nHora >= maxHora) { console.error('aviso_lote_grande_teto_hora', nHora); return { enviado: false, motivo: 'limite_hora' }; }
  const quem = String(lead.empresa || lead.nome || 'Empresa').slice(0, 80);
  const prazo = textoBR(lead.prazoAlvoEm);
  const link = `https://sistema.ecobraz.org/leads/lead?id=${encodeURIComponent(lead.id)}`;
  const linhas = [
    ['Cliente', quem],
    ['Volume', lead.volume || (itensDoLead(lead) != null ? `${itensDoLead(lead)} itens` : '')],
    ['Material', String(lead.material || '').slice(0, 120)],
    ['Cidade', [lead.cidade, lead.uf].filter(Boolean).join('/')],
    ['Pedido recebido', textoBR(lead.criadoEm)],
    ['Prazo-alvo da coleta', prazo ? `${prazo} (${lead.prazoHoras || 72}h)` : ''],
    ['Por quê', lead.loteGrandeMotivo || 'lote grande'],
  ].filter(([, v]) => v);
  const assunto = `🏭 LOTE GRANDE — ${quem}${prazo ? ` — coletar até ${prazo}` : ''}`.slice(0, 140);
  const texto = `Pedido de LOTE GRANDE recebido — prazo de ${lead.prazoHoras || 72}h para a coleta.\n\n${linhas.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nAbrir o pedido: ${link}\n\nEcobraz · sistema`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">LOTE GRANDE · ${escH(lead.prazoHoras || 72)}H</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:22px"><h1 style="font-size:19px;margin:0 0 12px">🏭 Pedido de lote grande</h1><table style="width:100%;border-collapse:collapse;font-size:14px">${linhas.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6B7B78;width:42%">${escH(k)}</td><td style="padding:6px 0;font-weight:700">${escH(v)}</td></tr>`).join('')}</table><a href="${escH(link)}" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:18px 0 0">Abrir o pedido →</a></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: dest, subject: assunto, html, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_lote_grande_' + r.status);
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 });
    await env.PORTAL_KV.put(chaveHora, String(nHora + 1), { expirationTtl: 2 * 60 * 60 });
  }
  return { enviado: true, para: dest.length };
}

// --- Pedidos em aberto de um cliente (para ligar a OS ao pedido certo) ----------------
// Leads MEDIDOS (de depois do início da medição) dos últimos `dias`, sem OS (ou cuja OS
// foi cancelada — `osCanceladas`), do mesmo cliente (ficha convertida, CNPJ/CPF ou
// e-mail), do mais recente para o mais antigo. Pedido antigo nunca entra: o vínculo
// dele é o provável e o registro antigo não é tocado.
export const leadSemOSValida = (l, osCanceladas) => !l.osId || !!(osCanceladas && osCanceladas.has(l.osId));
export function leadsAbertosDoCliente(leadsIdx, cli, { dias = 60, agoraMs, osCanceladas } = {}) {
  if (!cli) return [];
  const doc = digits(cli.tipo === 'PJ' ? cli.cnpj : cli.cpf);
  const emails = new Set([cli.email, ...(Array.isArray(cli.contatos) ? cli.contatos.map((c) => c && c.email) : [])].map((e) => String(e || '').trim().toLowerCase()).filter((e) => e.includes('@')));
  const limite = (Number.isFinite(agoraMs) ? agoraMs : Date.now()) - dias * 86400e3;
  return (Array.isArray(leadsIdx) ? leadsIdx : [])
    .filter((l) => l && l.id && medido(l) && leadSemOSValida(l, osCanceladas) && !['excluido', 'sem_retorno'].includes(l.status) && Date.parse(l.criadoEm) >= limite)
    .filter((l) => (l.clienteId && l.clienteId === cli.id) || (doc.length >= 11 && digits(l.documento) === doc) || (l.email && emails.has(String(l.email).trim().toLowerCase())))
    .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))
    .slice(0, 8);
}

// --- Estatística (métricas por semana) ---------------------------------------------------------
// Percentil pelo método do "posto mais próximo" (simples de explicar: o valor abaixo do
// qual ficam p% dos casos). null sem dados.
export function percentil(valores, p) {
  const v = (valores || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = Math.min(v.length - 1, Math.max(0, Math.ceil(p * v.length) - 1));
  return v[i];
}
// Segunda-feira (AAAA-MM-DD) da semana de um dia AAAA-MM-DD.
export function segundaDaSemana(dia) {
  const t = Date.parse(`${dia}T12:00:00Z`);
  if (!Number.isFinite(t)) return '';
  const dow = new Date(t).getUTCDay(); // 0 = domingo
  return new Date(t - ((dow + 6) % 7) * 86400e3).toISOString().slice(0, 10);
}
