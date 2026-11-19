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
//   • Descadastro bloqueia o cliente inteiro (qualquer e-mail dele na lista como "pediu para
//     sair"); devolução e queixa avisadas pelo Resend entram sozinhas na lista (webhook com
//     assinatura conferida — segredo RESEND_WEBHOOK_SECRET, só no ambiente).
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
const MAX_CAMPO = 2000;             // tamanho máximo lido de um campo de e-mail/contato; campo maior = cadastro não conferido (não envia)
const MAX_EMAILS_CADASTRO = 1000;   // acima disso a conferência na lista "não enviar" não é feita (e não envia)
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
  cadastro_grande: 'cadastro com e-mails demais para conferir',
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
// ESPAÇO ANTES DO @ (decisão do Marcio, 19/11/2026: "na dúvida, não envia"), em QUALQUER campo
// do cliente — contato da OS, e-mail da ficha e e-mail de cada contato: palavra colada antes do
// endereço, separada dele só por espaço ("maria clara@x.com", "maria mariano@x.com", "Maria
// maria@x.com", "financeiro fin@x.com"), ou "@" sem nada antes ("maria @x.com") → o endereço é
// DESCARTADO e conta como mal formado ("e-mail inválido", se não sobrar outro e-mail bem
// formado). O pedaço depois do espaço nunca é adivinhado. Também descartados: espaço logo
// DEPOIS de um @ ("maria@ clara@x.com", "maria @ clara@x.com") e ponto ou "_" solto entre a
// palavra e o endereço ("maria . clara@x.com"), inclusive juntos ("maria @ . clara@x.com"). NÃO é
// palavra colada (continua aceito): começo do texto; palavra que termina em ":" "·" ")" "]" ">"
// "»" ou em aspas retas " (as curvas ” e a simples ' não separam: a palavra fica colada) (no texto
// livre também "," ";" "/" "|" — num campo de e-mail eles valem como erro de digitação no lugar do
// ponto); endereço que começa com "<", "(", "[", aspas ou "rótulo:" (no texto livre também "," ";"
// "/" "|" "·"; num campo de e-mail, nome antes dele descarta — ver a conferência do trecho abaixo —,
// exceto entre "<>", "()" ou "[]");
// outro endereço antes; só números (telefone); conectivo entre dois endereços ("a@x.com e
// b@x.com"). Os 3 casos que o diagnóstico do conector conta usam a mesma detecção
// (palavraColada, enderecoNoInicio e arrobaSemNome, mais abaixo); a leitura descarta também os
// dois casos acima, que o diagnóstico não conta (para a contagem de antes e a de depois usarem
// o mesmo critério).
// Num CAMPO de e-mail vale ainda a conferência que já existia (nada que era descartado passa a
// ser aceito): nome em qualquer ponto do trecho solto logo antes do endereço — mesmo com hífen,
// meia-risca, travessão, número ou "," ";" "/" "|" soltos no meio ("vitor - souza@x.com", "vitor –
// souza@x.com", "vitor 11 souza@x.com", "vitor , souza@x.com") — descarta o endereço (exceto
// endereço entre "<>", "()" ou "[]"). Outro sinal solto no meio (aspas curvas, "#") desfaz o trecho:
// limite registrado ("vitor “ souza@x.com" é aceito, como na versão de antes de 19/11).
// Desde 19/11 sem a exceção de antes para o nome que "bate" com o endereço. Rótulo e conectivo
// separados do endereço por telefone ou traço continuam fora dessa conta ("tel 1133334444 joao@x.com").
// `campo: true` = o texto vem de um CAMPO de e-mail do cadastro (não de texto livre).
// `interno: true` = leitura de antes de 19/11, sem a regra do espaço. Usada SÓ em dois lugares, os
// dois do lado seguro: a configuração da própria Ecobraz (remetente e endereço de teste, definidos
// na Cloudflare) e a leitura LARGA para BLOQUEAR (emailsParaBloqueio). Nunca escolhe destinatário
// entre os dados do cliente (só o endereço do escritório que recebe os e-mails do modo de teste).
function lerEmails(v, opcoes) {
  const campo = !!(opcoes && opcoes.campo);
  const interno = !!(opcoes && opcoes.interno);
  // provedor:false = sem a regra do "@gmail" (2ª parte de 19/11/2026) — SÓ para a coluna "antes" do
  // diagnóstico repetir exatamente a leitura publicada antes dela.
  const provedor = !(opcoes && opcoes.provedor === false);
  const bons = []; let ruins = 0, ruimAntes = false;
  const palavras = String(v == null ? '' : v).slice(0, MAX_CAMPO).toLowerCase().split(/\s+/);
  let nomeNoTrecho = false; // há palavra com letra (fora conectivo e rótulo) no trecho solto logo antes da palavra atual
  for (let i = 0; i < palavras.length; i++) {
    const palavra = palavras[i];
    if (!palavra.includes('@')) {
      // vírgula, ponto e vírgula ou barra no FIM não desfazem o trecho solto ("vitor, souza@…")
      const limpa = semSeparadorNoFim(palavra);
      // "," ";" "/" "|", meia-risca, travessão e marcador SOLTOS ("vitor , souza@…", "vitor – souza@…"; o Word
      // troca " - " por " – ") também não desfazem o trecho
      if (!limpa) { /* só "," ";" "/" "|": não desfaz o trecho */ }
      else if (PALAVRA_SOLTA.test(limpa) || /^[‐-―−*•]+$/u.test(limpa)) { if (palavraDeNome(limpa)) nomeNoTrecho = true; }
      else nomeNoTrecho = false;
      continue;
    }
    const nomeAntes = nomeNoTrecho;
    // "a@x.com;maria clara@x.com": o pedaço solto no fim desta palavra fica "antes" da próxima.
    const resto = palavra.split(/[,;|"\/·]+/).pop();
    nomeNoTrecho = !!resto && !resto.includes('@') && PALAVRA_SOLTA.test(resto) && palavraDeNome(resto);
    if (!interno) {
      if (arrobaSemNome(palavra, palavras[i + 1], provedor)) { ruins++; continue; }                                             // "maria @x.com"
      let j = i - 1; while (j > 0 && /^[._]+$/.test(palavras[j])) j--;                                              // "maria . clara@x.com"
      if (/@$/.test(palavras[j] || '')) { ruins++; continue; }                                                       // "maria@ clara@x.com", "maria @ . clara@x.com"
      if (enderecoNoInicio(palavra) && palavraColada(palavras[j], palavras[j - 1], campo)) { ruins++; continue; }    // "maria clara@x.com"
      if (campo && nomeAntes && !/^[<(\[]/.test(palavra) && /[^@\s]@/.test(palavra)) { ruins++; continue; }          // "vitor - souza@x.com" (campo)
    }
    // Dentro de uma palavra (sem espaço), vírgula, barra, aspas etc. só podem separar
    // endereços INTEIROS: "joao,silva@x.com" e "maria/joao@x.com" são descartados — não
    // viram "silva@x.com"/"joao@x.com".
    const achados = []; let inteira = true;
    const pedacos = palavra.split(/[,;|"\/·]+/);
    for (const bruto of pedacos) {
      let t = bruto;
      const dentro = t.match(/<([^<>]*)>/); if (dentro) t = dentro[1];   // nome<a@b.com>
      t = t.replace(/^[(\[<]+|[)\]>]+$/g, '');                            // (a@b.com) [a@b.com]
      const rotulo = t.match(/^([^:@]+):(.+)$/); if (rotulo && ehRotulo(rotulo[1])) t = rotulo[2];   // e-mail:a@b.com, financeiro:a@b.com (só rótulo conhecido)
      t = t.replace(/^[.'’]+|[.'’]+$/g, '');
      if (!t) continue;
      if (t.length <= 254 && EMAIL_INTEIRO.test(t)) achados.push(t); else { inteira = false; break; }
    }
    // Fim do domínio cortado por um espaço ("souza@empresa.com .br"): o endereço lido estaria errado.
    // (quando o que vem logo depois é o pedaço que falta: ".br", ".com.br", ". br", "br", "m.br" — com ou sem ">", ")", ";" colado.
    //  "Brás", "BR-116" e "br" depois de um endereço que já termina em .br não são corte.)
    const depois = palavras.slice(i + 1, i + 3).join(' ');
    if (inteira && achados.length && (/^(?:\.[a-z]{2,6}|[a-z]\.br)(?![\p{L}\p{N}@])(?![a-z0-9._%+&-]*@)/u.test(depois) || (!achados[achados.length - 1].endsWith('.br') && /^\.?\s?br(?![\p{L}\p{N}@-])(?![a-z0-9._%+&-]*@)/u.test(depois)))) inteira = false;
    if (inteira && achados.length && /\.(?:co|ne|or)$/.test(achados[achados.length - 1]) && /^(?:co m|ne t|or g)(?![\p{L}\p{N}@.'’-])/u.test(achados[achados.length - 1].slice(-2) + ' ' + depois)) inteira = false;
    if (inteira) { if (!bons.length && achados.length) ruimAntes = ruins > 0; for (const t of achados) if (!bons.includes(t)) bons.push(t); }
    else if (/[^@\s]@/.test(palavra)) ruins++; // "@perfil" SOLTO de rede social não conta como e-mail (com ponto, "@maria.silva", conta: ver arrobaSemNome); grudado em sinal — "(@perfil)", "ig:@perfil" — conta (limite registrado: com a regra do mesmo campo, esvazia o campo)
  }
  return { bons, ruins, ruimAntes };
}
// Tira "," ";" "/" "|" do FIM da palavra — sem expressão regular, para o custo ser linear mesmo
// com milhares desses sinais seguidos.
const semSeparadorNoFim = (s) => { let k = s.length; while (k > 0 && ',;/|'.includes(s[k - 1])) k--; return s.slice(0, k); };
const PALAVRA_SOLTA = /^[\p{L}\p{N}._'’-]+$/u;
// (as mesmas palavras que a conferência de antes contava como "nome": com letra, fora conectivo e rótulo)
const palavraDeNome = (p) => /\p{L}/u.test(p) && !['e', 'ou', 'and'].includes(p) && !ehRotulo(p);
// Rótulo antes do endereço: os de e-mail ("e-mail:", "mailto:", "principal") e os nomes de
// setor/cargo ("financeiro:", "compras:"). "joao:silva@x.com" NÃO é rótulo — é descartado.
const ROTULOS_EMAIL = new Set(['e-mail', 'email', 'mail', 'mailto', 'correio', 'principal', 'particular', 'alternativo', 'secundario', 'copia', 'cc', 'nf-e', 'boleto', 'boletos', 'tel', 'telefone', 'fone', 'cel', 'celular', 'whatsapp', 'contador', 'contadora', 'socio', 'socia']);
const ehRotulo = (p) => { const n = semAcentoMin(p).replace(/[.:]+$/, ''); return ROTULOS_EMAIL.has(n) || NAO_PESSOA.has(n); };
export const emailsDe = (v) => lerEmails(v).bons;
// Configuração da própria Ecobraz (remetente, endereço de teste) e o remetente que o Resend
// devolve nos avisos: leitura de antes de 19/11 (ver `interno` acima). Nunca é dado de cliente.
const emailsDaConfig = (v) => lerEmails(v, { interno: true }).bons;
export const temEmailMalFormado = (v) => lerEmails(v).ruins > 0;
// Para os campos de e-mail do cadastro (o geral da ficha e o de cada contato). Se o 1º endereço do
// campo foi descartado (mal formado), os seguintes do MESMO campo não são usados — a mesma regra
// que já vale para o contato da OS (decisão do Marcio, 19/11/2026: "na dúvida, não envia"). Ex.:
// ficha "Maria maria@…; joao@…" → nenhum dos dois; se não sobrar outro, a OS fica "e-mail inválido".
const emailsDoCampo = (v) => { const r = lerEmails(v, { campo: true }); return r.ruimAntes ? [] : r.bons; };
const campoMalFormado = (v) => lerEmails(v, { campo: true }).ruins > 0;
// Leitura mais LARGA, só para BLOQUEAR (lista "não enviar", contato inativo, casa e família):
// todo trecho com cara de endereço conta — com rótulo desconhecido ("fin:joao@x.com"), palavra
// solta antes, vírgula no meio — e também os endereços que a pessoa PROVAVELMENTE quis digitar
// ("maria clara@x.com" → maria.clara@ e mariaclara@; "a@x.com .br" → a@x.com.br; sem acento).
// Na dúvida, entra. NUNCA é usada para escolher destinatário.
const EMAIL_SOLTO = /[a-z0-9_%+&-]+(?:\.[a-z0-9_%+&-]+)*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g;
function emailsParaBloqueio(v) {
  const bruto = String(v == null ? '' : v).slice(0, MAX_CAMPO).toLowerCase();
  if (!bruto.includes('@')) return [];
  // Leitura de antes de 19/11 (aceita o pedaço depois do espaço): para BLOQUEAR, na dúvida entra.
  const out = new Set(lerEmails(bruto, { interno: true }).bons);
  for (const t of new Set([bruto, semAcentoMin(bruto)])) {
    const variantes = [t, t.replace(/(\.[a-z]{2,})[\s.,;]+br\b/g, '$1.br'), t.replace(/\s*\.\s*/g, '.'), t.replace(/([a-z0-9])[\s,;]+(?=[a-z0-9._%+&-]{0,80}@)/g, '$1.'), t.replace(/([a-z0-9])[\s,;]+(?=[a-z0-9._%+&-]{0,80}@)/g, '$1')];
    // Em volta de cada "@" (janela curta): o custo cresce com o tamanho do texto, não com o quadrado.
    for (const x of variantes) for (let i = x.indexOf('@'); i !== -1; i = x.indexOf('@', i + 1)) for (const e of x.slice(Math.max(0, i - 80), i + 260).match(EMAIL_SOLTO) || []) if (e.length <= 254) out.add(e);
  }
  return [...out];
}
// --- "Espaço antes do @" ------------------------------------------------------------------------
// Palavra COLADA antes de um endereço: separada dele só por espaço, com letra e sem pontuação de
// separação no fim. É o caso "maria clara@x.com": não dá para saber se a palavra é parte do
// endereço (espaço no lugar do ponto) ou um nome/rótulo antes dele. NÃO é colada: começo do
// texto; palavra que termina em ":" "·" ")" "]" ">" "»" ou em aspas retas "/"<"/"("/"[" (no texto
// livre também "," ";" "/" "|" — num campo de e-mail eles são tratados como erro de digitação no
// lugar do ponto); palavra com "@" ("a@x.com b@x.com"; "maria@ clara@x.com" é descartado à parte, em
// lerEmails); só números (telefone); conectivo entre dois endereços ("a@x.com e b@x.com").
// `ant` = palavra imediatamente antes; `antAnt` = a anterior a ela.
function palavraColada(ant, antAnt, campo) {
  const p = String(ant || '');
  if (!p) return false;
  if ((campo ? /[:·)\]>»]$/ : /[:·)\]>»,;\/|]$/).test(p)) return false;
  const cauda = semSeparadorNoFim(p).split(/[,;|"\/·<>()\[\]:]+/).pop() || '';
  if (!cauda || cauda.includes('@') || !/\p{L}/u.test(cauda)) return false;
  if (['e', 'ou', 'and', 'or'].includes(cauda) && String(antAnt || '').includes('@')) return false;
  return true;
}
// O endereço começa já no início da palavra (sem "<", "(", "[", aspas nem "rótulo:" antes dele)?
// Só nesse caso a palavra de antes pode estar "colada" nele.
const enderecoNoInicio = (palavra) => /^[.a-z0-9_%+&-]/.test(palavra) && !/^[^@]*[:<(\[\]"'’]/.test(palavra);
// "@dominio.com" — espaço logo antes do @ ("maria @x.com"): falta a parte de antes do @.
// Também "@gmail", "@hotmail.", "@gmail,com"… (provedor de e-mail conhecido, com o fim cortado ou
// errado): é um endereço quebrado, não um "@perfil" de rede social (leitura independente da 2ª
// parte de 19/11/2026 — sem isso, "maria @gmail; joao@…" ia para joao@ com o nome da Maria).
const DOMINIO_SOLTO = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;
// Limites registrados: "@globo", "@terra", "@ig", "@live", "@uol" soltos como perfil de rede social
// também contam (lado seguro: não envia); erros de digitação do provedor ("@gmial") e "maria.gmail.com ·
// joao@…" (sem "@") não são reconhecidos.
const PROVEDOR_SOLTO = /^(?:gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|uol|bol|terra|globo|ig)(?![\p{L}\p{N}_-])/u;
const arrobaSemNome = (palavra, prox, provedor = true) => { const t = String(palavra || '').replace(/^[<(\["'’]+/, ''); return t.startsWith('@') && (DOMINIO_SOLTO.test(t.slice(1)) || (provedor && PROVEDOR_SOLTO.test(t.slice(1))) || (t === '@' && (DOMINIO_SOLTO.test(String(prox || '')) || (provedor && PROVEDOR_SOLTO.test(String(prox || '')))))); };

// --- Diagnóstico do e-mail de uma coleta (conector; só códigos, nunca o e-mail) ------------------
// Os três casos de "espaço antes do @" (pedido do Marcio, 19/11/2026), procurados no texto BRUTO
// dos campos — a detecção não depende da regra de leitura em vigor, então a contagem de antes e
// a de depois da mudança usam o mesmo critério:
//   contato_da_os ............... texto livre do contato da OS com palavra + espaço + endereço;
//   campo_de_email_do_cadastro .. e-mail geral da ficha ou de um contato com palavra + espaço + endereço;
//   espaco_antes_do_arroba ...... "maria @x.com" (falta a parte de antes do @), em qualquer campo.
// `leitura` = como a regra EM VIGOR lê o e-mail desta coleta (só a leitura do endereço: não olha
// status da OS, listas de bloqueio, 12 meses nem casa/família): envia (há destinatário bem formado) |
// envia_ao_pedaco_depois_do_espaco (o destinatário seria o pedaço depois do espaço, que nenhum campo
// traz bem formado — possível só pela regra de antes de 19/11; com a de 19/11 não acontece) |
// envia_a_email_bem_formado (há um dos casos, mas o destinatário é um e-mail que a leitura aceita
// em algum campo) | email_invalido | sem_email | cadastro_grande.
// `saudacao` = 'nome' | 'ola' | null (sem destinatário). `regra_anterior` (só quando algo muda) =
// leitura, saudação e destinatário ('o_mesmo' | 'outro_endereco' | 'nenhum_agora') pela regra de
// antes da 2ª parte de 19/11/2026 (mesmo campo + "Olá!").
export const REGRA_LEITURA_EMAIL = 'espaço antes da arroba (palavra colada antes do endereço, ou arroba sem nada antes) = e-mail inválido, em qualquer campo (desde 19/11/2026); se o 1º endereço de um campo é descartado, os seguintes do mesmo campo também não são usados; pessoa física: "Olá!" (sem nome) quando o e-mail escolhido não é o 1º da ficha (os dois desde 19/11/2026, 2ª parte)';
function varrerEspacos(v, campo) {
  const palavras = String(v == null ? '' : v).slice(0, MAX_CAMPO).toLowerCase().split(/\s+/).filter(Boolean);
  const r = { colados: [], arroba: false, palavras: [] };
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    if (!p.includes('@')) continue;
    if (arrobaSemNome(p, palavras[i + 1])) { r.arroba = true; continue; }
    const m = p.match(/^\.*([a-z0-9_%+&-]+(?:\.[a-z0-9_%+&-]+)*@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})/);
    if (m && enderecoNoInicio(p) && palavraColada(palavras[i - 1], palavras[i - 2], campo)) {
      r.colados.push(m[1]);
      const ant = semAcentoMin(semSeparadorNoFim(String(palavras[i - 1])).split(/[,;|"\/·<>()\[\]:]+/).pop()).replace(/[^a-z0-9]/g, '');
      const pedacos = m[1].split('@')[0].split(/[._+-]+/);
      r.palavras.push(ehRotulo(ant) ? 'rotulo' : (ant.length >= 3 && pedacos.some((q) => q.startsWith(ant)) ? 'comeco_do_endereco' : 'outra'));
    }
  }
  return r;
}
export function diagnosticoEmailAvaliacao(os, cli) {
  const o = os || {}, c = cli || {};
  const contatos = (Array.isArray(c.contatos) ? c.contatos : []).filter(Boolean);
  const vOs = varrerEspacos(o.contato, false);
  const vCampos = [c.email, ...contatos.map((x) => x.email)].map((x) => varrerEspacos(x, true));
  const casos = [];
  if (vOs.colados.length) casos.push('contato_da_os');
  if (vCampos.some((x) => x.colados.length)) casos.push('campo_de_email_do_cadastro');
  if (vOs.arroba || vCampos.some((x) => x.arroba)) casos.push('espaco_antes_do_arroba');
  const d = dadosDoCliente(o, c);
  const dAntes = dadosDoCliente(o, c, { regraAnterior: true });
  const colados = new Set([...vOs.colados, ...vCampos.flatMap((x) => x.colados)]);
  // "Limpo" = endereço que a leitura EM VIGOR aceita em algum campo, em qualquer formato
  // ("a@x.com;b@x.com", "e-mail:a@x.com", "Nome<a@x.com>").
  const limpos = new Set([...lerEmails(o.contato).bons, ...[c.email, ...contatos.map((x) => x.email)].flatMap((x) => lerEmails(x, { campo: true }).bons)]);
  const destinoDe = (dd) => (!dd.campoGrande && dd.emails[0] ? dd.emails[0].email : '');
  const leituraDe = (dd) => {
    if (dd.campoGrande) return 'cadastro_grande';
    const destino = destinoDe(dd);
    if (destino) return colados.has(destino) && !limpos.has(destino) ? 'envia_ao_pedaco_depois_do_espaco' : (casos.length ? 'envia_a_email_bem_formado' : 'envia');
    return dd.emailMalFormado ? 'email_invalido' : 'sem_email';
  };
  // Saudação do 1º candidato (o diagnóstico não olha listas nem 12 meses): 'nome' ("Oi, Maria!" /
  // "Olá, Carlos.") ou 'ola' ("Olá!"). Sem destinatário = null.
  const saudacaoDe = (dd) => { const alvo = destinoDe(dd) ? dd.emails[0] : null; return alvo ? (primeiroNome(alvo.nome) && alvo.saudar !== false ? 'nome' : 'ola') : null; };
  const leitura = leituraDe(d), saudacao = saudacaoDe(d);
  const r = { casos, leitura, saudacao, palavras: [...vOs.palavras, ...vCampos.flatMap((x) => x.palavras)] };
  // Como era antes da decisão de 19/11/2026 (2ª parte: mesmo campo + "Olá!") — só quando muda algo.
  const leituraAntes = leituraDe(dAntes), saudacaoAntes = saudacaoDe(dAntes);
  const destinoMudou = destinoDe(d) !== destinoDe(dAntes);
  if (leituraAntes !== leitura || saudacaoAntes !== saudacao || destinoMudou) {
    r.regra_anterior = { leitura: leituraAntes, saudacao: saudacaoAntes, destinatario: !destinoMudou ? 'o_mesmo' : (destinoDe(d) ? 'outro_endereco' : 'nenhum_agora') };
  }
  return r;
}
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
  // (sem corte de tamanho: todo telefone do campo conta para o bloqueio; os espaços em volta somem em digits)
  for (const parte of String(v == null ? '' : v).split(/\/|;|,|\||·|\be\b|\bou\b/i)) {
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
// depois o e-mail geral da ficha, depois os demais contatos; pessoa física (e cadastro sem
// CPF/CNPJ nem tipo, que recebe o texto de pessoa física): o da ficha, depois o do contato da OS,
// depois os dos demais contatos.
// E-mail de contato marcado como inativo/desligado nunca entra (nem como e-mail geral).
// `opcoes.regraAnterior === true` = SÓ para o diagnóstico do conector (contagem de antes × depois):
// lê os campos como antes da decisão de 19/11/2026 (2ª parte) — os endereços seguintes de um campo
// com o 1º descartado ainda eram usados, a saudação usava o nome ligado ao endereço sempre que
// ele parecia nome de pessoa, e "@gmail" sem ".com" não contava como mal formado — ou seja, repete
// a publicação anterior. O envio e as telas nunca passam isto.
export function dadosDoCliente(os, cli, opcoes) {
  const o = os || {}, c = cli || {};
  const anterior = !!(opcoes && opcoes.regraAnterior === true);
  const doCampo = anterior ? (v) => lerEmails(v, { campo: true, provedor: false }).bons : emailsDoCampo;
  const doc = [o.clienteDoc, c.cnpj, c.cpf].map(digits).find((d) => d.length === 14 || d.length === 11) || '';
  const perfil = doc.length === 14 ? 'PJ' : (doc.length === 11 ? 'PF' : (c.tipo === 'PJ' ? 'PJ' : (c.tipo === 'PF' ? 'PF' : '')));
  const txt = String(o.contato || '');
  // Se o 1º endereço do contato da OS foi descartado (mal formado), o seguinte do mesmo texto
  // não é aproveitado: ele pode ser de outra pessoa (e a saudação levaria o nome da primeira).
  const lidoOs = lerEmails(txt, anterior ? { provedor: false } : undefined);
  const emailOs = lidoOs.ruimAntes ? '' : (lidoOs.bons[0] || '');
  const trecho1 = txt.split(/[·|,;]/)[0];
  let nomeOs = trecho1.includes('@') ? '' : trecho1.replace(/[^\p{L} .'’-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  if (nomeOs.length < 2) nomeOs = '';
  const todosContatos = (Array.isArray(c.contatos) ? c.contatos : []).filter(Boolean);
  const contatos = todosContatos.filter((x) => !contatoInativo(x));
  const inativos = new Set(todosContatos.filter(contatoInativo).flatMap((x) => emailsParaBloqueio(x.email)));
  const cands = [];
  const poe = (email, nome) => { for (const e of doCampo(email)) if (!inativos.has(e) && !cands.some((x) => x.email === e)) cands.push({ email: e, nome: limpar(nome) }); };
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
    const doContato = contatos.map((x) => doCampo(x.email)); // lido uma vez só (cadastro grande não multiplica o custo)
    for (const e of doCampo(c.email)) { const k = doContato.findIndex((l) => l.includes(e)); poe(e, k >= 0 ? contatos[k].nome : ''); }
    for (const x of contatos) poe(x.email, x.nome);
  } else {
    poe(c.email, c.nome || nomeOs);
    poe(emailOs, c.nome || nomeOs);
    for (const x of contatos) poe(x.email, x.nome || c.nome);
    // Pessoa física (e cadastro sem CPF/CNPJ nem tipo): "Oi, [nome]!" só quando o e-mail escolhido
    // é o 1º da ficha. Qualquer outro (contato da OS, outro contato, o 2º da ficha, ficha sem
    // e-mail) → "Olá!": pode ser de outra pessoa (decisão do Marcio, 19/11/2026). `saudar` = pode
    // usar o nome; o nome fica no candidato. Limite: a regra é pela POSIÇÃO — "joao@… (filho);
    // maria@…" na ficha ainda leva "Oi, [nome da ficha]!" para joao@.
    if (!anterior) {
      const primeiroDaFicha = doCampo(c.email)[0] || '';
      for (const x of cands) x.saudar = !!primeiroDaFicha && x.email === primeiroDaFicha;
    }
  }
  const empresa = perfil === 'PJ' ? limpar(c.nomeFantasia || c.razaoSocial || o.clienteNome).replace(/[\r\n\t]+/g, ' ').slice(0, 80) : '';
  const nomes = [o.clienteNome, c.razaoSocial, c.nomeFantasia, c.nome].map(limpar).filter(Boolean);
  const fones = [...new Set([c.fone, c.telefone, c.celular, ...contatos.map((x) => x.fone), txt].flatMap(fonesNac))];
  // Há e-mail MAL FORMADO no cadastro ou no contato da OS? Ele nunca é usado; se não sobrar
  // outro endereço, o motivo que fica na OS é "e-mail inválido" (e não "sem e-mail").
  // Campo grande demais para ser lido por inteiro: o cadastro não é conferido pela metade (não envia).
  const campoGrande = [c.email, txt, ...todosContatos.map((x) => x.email)].some((x) => String(x == null ? '' : x).length > MAX_CAMPO);
  const emailMalFormado = anterior
    ? (lerEmails(txt, { provedor: false }).ruins > 0 || [c.email, ...contatos.map((x) => x.email)].some((x) => lerEmails(x, { campo: true, provedor: false }).ruins > 0))
    : (temEmailMalFormado(txt) || [c.email, ...contatos.map((x) => x.email)].some(campoMalFormado));
  // TODOS os e-mails bem formados do cliente: o geral da ficha, o do contato da OS e o de
  // QUALQUER contato (inclusive os marcados como inativos). É neles que vale a regra
  // "descadastro bloqueia o cliente inteiro".
  // SEM corte: a conferência na lista tem de cobrir todos (e todos os candidatos a destinatário).
  // Aqui vale a leitura mais LARGA (todo endereço que der para ler do cadastro): para bloquear,
  // na dúvida entra; para ENVIAR (acima), na dúvida fica de fora.
  const emailsTodos = [...new Set([...cands.map((x) => x.email), ...emailsParaBloqueio(c.email), ...emailsParaBloqueio(txt), ...todosContatos.flatMap((x) => emailsParaBloqueio(x.email))])];
  // Chave da regra dos 12 meses: o CNPJ/CPF; sem documento, o e-mail (todos os do cliente
  // contam, para o pedido não se repetir só porque mudou o contato da OS). A ficha
  // (clienteId) também liga duas coletas do mesmo cliente.
  const clienteId = String(o.clienteId || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 60);
  // A chave GRAVADA no registro é só o documento, o destinatário de verdade ou a ficha; os e-mails
  // da leitura larga entram apenas na CONSULTA (para um endereço que já recebeu continuar contando).
  const chavesCand = doc ? ['d:' + doc] : cands.map((x) => 'e:' + x.email);
  const chaves = doc ? chavesCand : [...new Set([...chavesCand, ...emailsTodos.map((e) => 'e:' + e)])];
  const chave = chavesCand[0] || (clienteId ? 'c:' + clienteId : '');
  return { doc, perfil, empresa, nomes, fones, emails: cands, emailsTodos, campoGrande, emailMalFormado, chave, chaves, clienteId, clienteNome: limpar(o.clienteNome || nomes[0] || '') };
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
const emailTeste = (env) => emailsDaConfig((env && env.AVALIACAO_TESTE_PARA) || remetente(env))[0] || '';
// Mostra no máximo 2 letras do começo — e menos quando o endereço é curto (nunca ele inteiro).
const mascarar = (e) => { const [u, d] = String(e || '').split('@'); return d ? `${u.slice(0, u.length > 3 ? 2 : (u.length > 1 ? 1 : 0))}***@${d}` : ''; };

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
  // Caminho normal: UMA instrução confere se as quatro tabelas e as colunas novas existem.
  try {
    await db.prepare('SELECT (SELECT COUNT(*) FROM (SELECT cliente_id, para_h FROM avaliacao_pedidos LIMIT 0)) + (SELECT COUNT(*) FROM (SELECT email FROM email_nao_enviar LIMIT 0)) + (SELECT COUNT(*) FROM (SELECT id FROM avaliacao_auditoria LIMIT 0)) + (SELECT COUNT(*) FROM (SELECT id FROM email_avisos LIMIT 0)) AS ok').first();
    prontas.add(db); return;
  } catch { /* falta tabela ou coluna: cria/atualiza abaixo */ }
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS avaliacao_pedidos (os_id TEXT PRIMARY KEY, os_numero TEXT, chave TEXT, perfil TEXT, status TEXT NOT NULL, canal TEXT, motivo TEXT, concluida_em TEXT, previsto_em TEXT, processado_em TEXT, pedida_em TEXT, por TEXT, para TEXT, tentativas INTEGER DEFAULT 0, erro TEXT, modo TEXT, reserva TEXT, status_antes TEXT, cliente_id TEXT, para_h TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS avaliacao_pedidos_chave ON avaliacao_pedidos (chave)'),
    db.prepare('CREATE INDEX IF NOT EXISTS avaliacao_pedidos_proc ON avaliacao_pedidos (processado_em)'),
    db.prepare('CREATE TABLE IF NOT EXISTS email_nao_enviar (email TEXT PRIMARY KEY, motivo TEXT, origem TEXT, em TEXT, por TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS avaliacao_auditoria (id INTEGER PRIMARY KEY AUTOINCREMENT, em TEXT, por TEXT, acao TEXT, detalhe TEXT)'),
    // Avisos do Resend (devolução e queixa). `id` = identificador do aviso (não repete); `para` mascarado.
    db.prepare('CREATE TABLE IF NOT EXISTS email_avisos (id TEXT PRIMARY KEY, em TEXT, recebido_em TEXT, tipo TEXT, classe TEXT, para TEXT, pedido INTEGER DEFAULT 0, teste INTEGER DEFAULT 0, incluido TEXT, detalhe TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS email_avisos_em ON email_avisos (em)'),
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
//  2. quais e-mails do cliente — TODOS, inclusive os de contato inativo — estão na lista
//     "não enviar e-mail";
//  3. quais ENDEREÇOS do cliente já receberam pedido em 12 meses (por outro CNPJ/CPF).
// O que conta como "pedido": enviado e WhatsApp; "enviando" e "envio não confirmado" (pode
// ter saído) — estes dois só quando nasceram no mesmo tipo de envio (os de teste não seguram
// o envio de verdade); em teste, os testes também contam (ensaio fiel).
async function consultasDoEnvio(db, d, osId, agoraMs, contarTeste, resumos) {
  const chaves = [...new Set([...(d.chaves || []), d.chave].filter(Boolean))];
  // A lista é conferida para TODOS os e-mails do cliente e TODOS os candidatos a destinatário
  // — sem corte. Cadastro absurdamente grande não é conferido pela metade: dá erro e não envia.
  const todos = [...new Set([...(d.emailsTodos || []), ...d.emails.map((x) => x.email)])];
  if (todos.length > MAX_EMAILS_CADASTRO) throw new Error('emails_demais_no_cadastro');
  const desde = new Date(agoraMs - DIAS_12_MESES * 86400e3).toISOString();
  const t = contarTeste ? 1 : 0;
  // "Em andamento" = há uma tentativa em curso (enviando) ou na fila para tentar de novo
  // (pendente): ainda não se sabe se vai sair, mas pode já ter saído.
  const doModo = "(?4 = 1 OR COALESCE(modo,'') <> 'teste')";
  const conta = `(status IN ('enviado','whatsapp') OR ((status IN ('enviando','pendente') OR (status = 'nao_enviado' AND motivo = 'envio_nao_confirmado')) AND ${doModo}) OR (?4 = 1 AND status = 'teste'))`;
  const r = await db.batch([
    // o que já está decidido vem primeiro; "em andamento" só aparece se não houver nada decidido
    db.prepare(`SELECT os_numero, status FROM avaliacao_pedidos WHERE (chave IN (SELECT value FROM json_each(?1)) OR (?5 <> '' AND cliente_id = ?5)) AND os_id <> ?2 AND COALESCE(pedida_em, processado_em) >= ?3 AND ${conta} ORDER BY CASE WHEN status IN ('enviando','pendente') THEN 1 ELSE 0 END LIMIT 1`).bind(JSON.stringify(chaves), String(osId), desde, t, d.clienteId || ''),
    db.prepare('SELECT email, motivo FROM email_nao_enviar WHERE email IN (SELECT value FROM json_each(?1))').bind(JSON.stringify(todos)),
    // andando = 1 quando TUDO o que segura o endereço é envio ainda em andamento (nada decidido)
    db.prepare(`SELECT para_h, MIN(CASE WHEN status IN ('enviando','pendente') THEN 1 ELSE 0 END) AS andando FROM avaliacao_pedidos WHERE para_h IN (SELECT value FROM json_each(?1)) AND os_id <> ?2 AND COALESCE(pedida_em, processado_em) >= ?3 AND ${conta} GROUP BY para_h`).bind(JSON.stringify(resumos), String(osId), desde, t),
  ]);
  const linhas = (i) => (r && r[i] && r[i].results) || null;
  if (!Array.isArray(r) || r.length !== 3 || !linhas(0) || !linhas(1) || !linhas(2)) throw new Error('consultas_do_envio_sem_resposta');
  const lista = new Map(); for (const x of linhas(1)) lista.set(x.email, x);
  const achou = linhas(0)[0] || null;
  const andando = !!achou && ['enviando', 'pendente'].includes(achou.status);
  return { recente: achou && !andando ? achou : null, emAndamento: andando, lista, destinos: new Map(linhas(2).map((x) => [x.para_h, Number(x.andando) === 1])) };
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
export async function adicionarNaoEnviar(env, itens, { origem, por, nota } = {}) {
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
  await auditar(env, por, 'lista não enviar', `${nota ? `${nota}: ` : ''}${arr.length === 1 ? `incluiu ${mascarar(arr[0].e)} (${arr[0].m === 'invalido' ? 'inválido' : 'descadastrado'})` : `carga de ${arr.length} e-mail(s)`}`);
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
  if (!os || os.status !== 'concluida' || !os.concluidaEm) {
    // O índice dizia "concluída", mas o registro completo (a verdade) diz que não: um envio em
    // andamento desta OS não vai ser retomado — encerra, como em encerrarOrfas.
    if (os && os.status !== 'concluida' && (await encerrarOrfa(db, linha0, agora))) return 'nao_enviado';
    return 'ignorada';
  }
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
  // A OS foi reaberta enquanto este envio estava em andamento: nem a retomada nem uma nova
  // tentativa reenviam (mesmo que a OS tenha sido reconcluída sozinha com a hora antiga).
  // Com uma conclusão NOVA (posterior à do registro), a tentativa antiga que com certeza não
  // saiu dá lugar a um envio normal; se pode ter saído (dúvida), fica "envio não confirmado".
  if (linha && linha.status_antes === 'reaberta' && (duvida || !(Date.parse(os.concluidaEm) > Date.parse(linha.concluida_em || '')))) return await nao('reaberta');
  if (agora - alvo > VALIDADE_H * MS_H) return await nao('prazo_expirado');
  // Regras, nesta ordem (a primeira que valer é o motivo que aparece na OS).
  if (coletaAntiga(os)) return await nao('coleta_antiga');
  if (fichaSumiu) return await nao('sem_cadastro'); // a OS aponta para um cadastro que não existe mais
  // (confere TODOS os e-mails do cadastro, na leitura larga — inclusive os de contato inativo)
  if (ehDaCasa(cfg.casa, { nomes: d.nomes, doc: d.doc, emails: d.emailsTodos })) return await nao('casa_familia');
  if (!ctx.bloqueios) ctx.bloqueios = await bloqueiosDeContato(db);
  if ((d.doc && ctx.bloqueios.porDoc.has(d.doc)) || d.fones.some((f) => ctx.bloqueios.porFone.has(semNove(f)))) return await nao('bloqueio');
  // Cadastro absurdamente grande (mais de 1.000 e-mails, ou um campo com mais de 2.000 letras): não dá para conferir todos na lista
  // "não enviar" — não envia e registra o motivo (decisão final: não fica dando erro a cada rodada).
  if (d.campoGrande || new Set([...d.emailsTodos, ...d.emails.map((x) => x.email)]).size > MAX_EMAILS_CADASTRO) return await nao('cadastro_grande');
  const resumos = await Promise.all(d.emails.map((x) => resumoEmail(x.email)));
  const q = await consultasDoEnvio(db, d, os.id, agora, cfg.modo === 'teste', resumos);
  // Descadastro bloqueia o CLIENTE INTEIRO: basta UM e-mail dele (o geral, o do contato da OS
  // ou o de qualquer contato) estar na lista como "pediu para sair" — pela carga do E-goi,
  // pela tela ou por queixa de spam avisada pelo Resend. Não vai para nenhum outro e-mail.
  if ([...q.lista.values()].some((x) => x.motivo !== 'invalido')) return await nao('descadastrado');
  if (q.recente) return await nao('ja_pedido_12m');
  // Outra coleta do MESMO cliente está com o envio em andamento (saindo agora, ou na fila
  // para tentar de novo — pode até já ter saído): esta espera o desfecho da outra, sem
  // registrar nada. Se a outra sair, esta vira "já pedido"; se a outra falhar de vez, esta sai.
  if (q.emAndamento) return 'ignorada';
  // Nenhum endereço bem formado: não tenta o envio. Havia um mal formado → "e-mail inválido".
  if (!d.emails.length) return await nao(d.emailMalFormado ? 'email_invalido' : 'sem_email');
  // Escolha do endereço, na ordem de preferência. E-mail inválido (voltou) = tenta o próximo;
  // endereço que já recebeu pedido em 12 meses (por outro CNPJ/CPF) = tenta o próximo.
  // (Descadastrado nem chega aqui: bloqueou o cliente inteiro logo acima.)
  let alvoEmail = null, resumoAlvo = '', motivoSem = '', esperar = false;
  for (let i = 0; i < d.emails.length; i++) {
    const cand = d.emails[i], b = q.lista.get(cand.email);
    if (b) { if (!motivoSem) motivoSem = b.motivo === 'invalido' ? 'email_invalido' : 'descadastrado'; if (b.motivo !== 'invalido') break; continue; }
    // Endereço seguro só por um envio AINDA EM ANDAMENTO de outro cliente: tenta o próximo; se
    // não houver, esta OS espera o desfecho daquele (não decide "já pedido" antes da hora).
    if (q.destinos.has(resumos[i])) { if (q.destinos.get(resumos[i])) esperar = true; else if (!motivoSem) motivoSem = 'ja_pedido_12m'; continue; }
    alvoEmail = cand; resumoAlvo = resumos[i]; break;
  }
  if (!alvoEmail && esperar) return 'ignorada';
  if (!alvoEmail) return await nao(motivoSem || 'descadastrado');
  // A chave pode ter sido desligada (ou trocada) no meio da rodada: confere de novo antes de
  // cada envio. Mudou — ou não deu para ler — → a rodada para aqui, sem enviar.
  const chaveAgora = await lerChave(env);
  if (chaveAgora.modo !== cfg.modo || chaveAgora.desde !== cfg.desde || chaveAgora.ligadoEm !== cfg.ligadoEm) return 'parar';
  // O horário (08h–20h) é conferido de novo na hora de cada envio: uma rodada que começou
  // atrasada, ou que demorou, não manda nada depois das 20h.
  if (!dentroDaJanela(agora + (Date.now() - (ctx.inicioReal || Date.now())))) return 'parar_horario';
  // Reserva: só quem grava a própria marca envia (duas rodadas ao mesmo tempo não viram dois
  // e-mails). Sem documento, a chave dos 12 meses é o e-mail que de fato recebe.
  const chaveReg = d.doc ? d.chave : `e:${alvoEmail.email}`;
  const marca = `${agora}-${Math.random().toString(36).slice(2, 10)}`;
  if (!linha) await db.prepare("INSERT OR IGNORE INTO avaliacao_pedidos (os_id, os_numero, chave, perfil, status, canal, concluida_em, previsto_em, processado_em, por, para, tentativas, modo, reserva, cliente_id, para_h) VALUES (?1,?2,?3,?4,'enviando','email',?5,?6,?7,'sistema',?8,1,?9,?10,?11,?12)").bind(os.id, base.os_numero, chaveReg, base.perfil, base.concluida_em, base.previsto_em, agoraISO, mascarar(alvoEmail.email), cfg.modo, marca, d.clienteId, resumoAlvo).run();
  else await db.prepare("UPDATE avaliacao_pedidos SET status='enviando', canal='email', processado_em=?2, para=?3, tentativas=COALESCE(tentativas,0)+1, modo=?4, reserva=?5, chave=?6, cliente_id=?9, para_h=?10, concluida_em=?11, previsto_em=?12, status_antes=NULL WHERE os_id=?1 AND status=?7 AND COALESCE(reserva,'')=?8").bind(os.id, agoraISO, mascarar(alvoEmail.email), cfg.modo, marca, chaveReg, linha.status, linha.reserva || '', d.clienteId, resumoAlvo, base.concluida_em, base.previsto_em).run();
  const minha = await db.prepare('SELECT status, reserva, tentativas FROM avaliacao_pedidos WHERE os_id = ?1').bind(os.id).first();
  if (!minha || minha.reserva !== marca || minha.status !== 'enviando') return 'ignorada';
  const msg = montarMensagem({ perfil: d.perfil, primeiro: alvoEmail.saudar === false ? '' : primeiroNome(alvoEmail.nome), empresa: d.empresa, link: env.AVALIACAO_LINK });
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
  // A dúvida de uma tentativa anterior (tempo esgotado/rede — pode ter saído) NÃO é apagada por
  // outra falha na tentativa seguinte (limite, serviço fora do ar, qualquer recusa passageira):
  // o erro guardado continua o da dúvida. Só a recusa DEFINITIVA do próprio pedido a desfaz
  // (o mesmo pedido, com a mesma chave, teria sido recusado igual na 1ª vez).
  const duvidaAntes = !!(linha && INCERTOS.has(linha.erro));
  const erroGuardado = duvidaAntes && !envio.definitivo ? linha.erro : erro;
  // Retomada que falhou de novo continua "enviando" (para a próxima tentativa seguir como retomada).
  if (retomada && !acabou) { await db.prepare('UPDATE avaliacao_pedidos SET erro=?3 WHERE os_id=?1 AND reserva=?2').bind(os.id, marca, erroGuardado).run(); return 'falha'; }
  const incerto = repetido || retomada || INCERTOS.has(erroGuardado);
  await db.prepare('UPDATE avaliacao_pedidos SET status=?3, canal=?4, motivo=?5, erro=?6, reserva=NULL WHERE os_id=?1 AND reserva=?2').bind(os.id, marca, acabou ? 'nao_enviado' : 'pendente', acabou ? 'nenhum' : 'email', acabou ? (incerto ? 'envio_nao_confirmado' : 'falha_envio') : null, erroGuardado).run();
  return 'falha';
}

// Envio "em andamento" (na fila para nova tentativa, ou "enviando" travado) de OS que DEIXOU de
// estar concluída — por qualquer tela: escritório, app do motorista, reagendamento. Esse envio
// não vai ser retomado; encerra já, para as outras coletas do mesmo cliente não ficarem
// esperando por ele. Motivo: "reaberta" (só uma conclusão NOVA volta a valer) ou, se o e-mail
// pode ter saído, "envio não confirmado". O índice pode estar atrasado: antes de encerrar,
// confere no registro completo da OS. Qualquer falha de leitura é ERRO (a rodada não segue).
// Encerra UM registro "em andamento" (na fila, ou "enviando" há 20+ minutos) — só se ele continua
// como foi lido. Devolve 1 se encerrou.
async function encerrarOrfa(db, linha, agoraMs) {
  if (!linha || !(linha.status === 'pendente' || (linha.status === 'enviando' && agoraMs - Date.parse(linha.processado_em) >= TRAVADO_MIN * 60e3))) return 0;
  const u = await db.prepare(`UPDATE avaliacao_pedidos SET motivo = CASE WHEN status='enviando' OR ${SQL_INCERTO} THEN 'envio_nao_confirmado' ELSE 'reaberta' END, status='nao_enviado', canal='nenhum', processado_em=?2, reserva=NULL WHERE os_id=?1 AND status=?3 AND processado_em=?4`).bind(String(linha.os_id), new Date(agoraMs).toISOString(), linha.status, linha.processado_em).run();
  return Number(u && u.meta && u.meta.changes) || 0;
}
async function encerrarOrfas(env, db, concluidas, agoraMs) {
  const r = await db.prepare("SELECT os_id, status, processado_em FROM avaliacao_pedidos WHERE status IN ('pendente','enviando') LIMIT 500").all();
  const orfas = ((r && r.results) || []).filter((x) => !concluidas.has(String(x.os_id)) && (x.status === 'pendente' || agoraMs - Date.parse(x.processado_em) >= TRAVADO_MIN * 60e3)).slice(0, 50);
  if (!orfas.length) return 0;
  const regs = await lerKVEstrito(env.PORTAL_KV, orfas.map((x) => `os:${x.os_id}`));
  let n = 0;
  for (const x of orfas) {
    const raw = regs.get(`os:${x.os_id}`); let os = null;
    if (raw) { try { os = JSON.parse(raw); } catch { continue; } } // registro ilegível: não mexe
    if (os && os.status === 'concluida') continue;                  // continua concluída: não é órfã
    n += await encerrarOrfa(db, x, agoraMs);
  }
  if (n) console.log('avaliacao_orfas_encerradas', n);
  return n;
}

// --- A rodada (chamada pelo agendamento) -------------------------------------------------------
// Qualquer falha de leitura (lista casa/família, registros, lista "não enviar", bloqueios,
// OS, cadastro) faz a rodada NÃO enviar — falha de leitura nunca vira permissão para enviar.
export async function processarAvaliacoes(env, opcoes) {
  const o = opcoes || {};
  const inicioReal = Date.now(); // o tempo gasto nas leituras do começo da rodada também conta para o horário
  const agoraMs = Number.isFinite(o.agoraMs) ? o.agoraMs : inicioReal;
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
  const cands = [], concluidas = new Set();
  for (const x of await listarColetasOS(env)) {
    if (!x || !x.id || x.status !== 'concluida' || !x.concluidaEm) continue;
    concluidas.add(String(x.id));
    const t = Date.parse(x.concluidaEm);
    if (!Number.isFinite(t) || t < piso) continue;
    const alvo = quandoEnviar(x.concluidaEm);
    if (alvo != null && alvo <= agoraMs) cands.push({ id: String(x.id), alvo, concluidaEm: x.concluidaEm });
  }
  if (!cands.length) return res;
  await garantirTabelas(db);
  await encerrarOrfas(env, db, concluidas, agoraMs);
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
  const ctx = { agoraMs, bloqueios: null, envios: 0, inicioReal };
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
        if (r === 'parar_horario') { res.fora_do_horario = true; parar = true; break; } // passou das 20h no meio da rodada
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
  // O que o "Desfazer" devolve: envio que pode ter saído ("enviando", ou na fila com dúvida) volta
  // como "envio não confirmado"; na fila com a marca de reabertura, como "reaberta"; o resto, como
  // estava. Registro já encerrado (inclusive "envio não confirmado") nunca é trocado.
  if (atual) await db.prepare("UPDATE avaliacao_pedidos SET status_antes=CASE WHEN status='enviando' OR (status='pendente' AND (status_antes='reaberta' OR " + SQL_INCERTO + ")) THEN 'nao_enviado' ELSE status END, motivo=CASE WHEN status='enviando' OR (status='pendente' AND " + SQL_INCERTO + ") THEN 'envio_nao_confirmado' WHEN status='pendente' AND status_antes='reaberta' THEN 'reaberta' ELSE motivo END, status='whatsapp', canal='whatsapp', pedida_em=?2, por=?3, chave=CASE WHEN COALESCE(chave,'')='' THEN ?4 ELSE chave END, cliente_id=CASE WHEN COALESCE(cliente_id,'')='' THEN ?7 ELSE cliente_id END, reserva=NULL WHERE os_id=?1 AND status=?5 AND COALESCE(reserva,'')=?6").bind(os.id, agora, quem, d.chave, atual.status, atual.reserva || '', d.clienteId).run();
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

// --- Avisos do Resend: devolução e queixa entram sozinhas na lista "não enviar e-mail" ---------
// O Resend chama POST /api/resend/webhook a cada devolução ou queixa. Antes de aceitar, a
// AUTENTICIDADE é conferida pela assinatura do aviso (padrão Svix): HMAC-SHA256 de
// "id.hora.corpo" com o segredo do webhook, que fica SÓ nos segredos do ambiente
// (RESEND_WEBHOOK_SECRET) — nunca no repositório, em log ou em tela. Sem o segredo, tudo é
// recusado. Aviso com mais de 5 minutos é recusado (contra repetição de um aviso antigo).
//   • devolução DEFINITIVA (o endereço não existe)  → lista como "e-mail inválido (voltou)";
//   • queixa de spam                                → lista como "pediu para sair" (e, pela
//     regra do descadastro, bloqueia o cliente inteiro);
//   • devolução temporária (caixa cheia, servidor fora do ar) → NÃO entra na lista.
const QUEM_RESEND = 'Resend (automático)';
const TOLERANCIA_AVISO_S = 300;
const TAMANHO_MAX_AVISO = 100000;
const deBase64 = (t) => Uint8Array.from(atob(t), (ch) => ch.charCodeAt(0));
const respJson = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
// `corpo` = os BYTES do aviso, exatamente como chegaram (a assinatura é sobre eles).
async function avisoAutentico(segredo, id, ts, corpo, cabecalho) {
  let chave;
  try { chave = deBase64(String(segredo).trim().replace(/^whsec_/, '')); } catch { return false; }
  if (chave.length < 16) return false;
  const k = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const prefixo = new TextEncoder().encode(`${id}.${ts}.`);
  const dados = new Uint8Array(prefixo.length + corpo.length); dados.set(prefixo, 0); dados.set(corpo, prefixo.length);
  // O cabeçalho pode trazer várias assinaturas ("v1,<base64> v1,<base64>"): basta uma conferir.
  for (const parte of String(cabecalho || '').split(/\s+/).slice(0, 10)) {
    const i = parte.indexOf(',');
    if (i < 0 || parte.slice(0, i) !== 'v1') continue;
    let assin; try { assin = deBase64(parte.slice(i + 1)); } catch { continue; }
    if (await crypto.subtle.verify('HMAC', k, assin, dados)) return true; // comparação em tempo constante
  }
  return false;
}
// Lê o corpo aos poucos e para assim que passa do tamanho máximo (não carrega um corpo enorme).
async function lerCorpoLimitado(request, max) {
  if (!request.body) return new Uint8Array(0);
  const leitor = request.body.getReader();
  const partes = []; let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > max) { try { await leitor.cancel(); } catch { /* já fechado */ } return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total); let pos = 0;
  for (const x of partes) { tudo.set(x, pos); pos += x.length; }
  return tudo;
}
export const avisosConfigurados = (env) => !!(env && env.RESEND_WEBHOOK_SECRET);
export async function receberAvisoResend(request, env) {
  const segredo = String((env && env.RESEND_WEBHOOK_SECRET) || '');
  if (!segredo) return respJson(503, { ok: false, erro: 'nao_configurado' });
  // 1º os cabeçalhos (barato), depois o corpo — e o corpo com tamanho máximo.
  const id = String(request.headers.get('svix-id') || '');
  const ts = String(request.headers.get('svix-timestamp') || '');
  const assinatura = String(request.headers.get('svix-signature') || '');
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(id) || !/^\d{9,12}$/.test(ts) || !assinatura || assinatura.length > 2000) return respJson(401, { ok: false, erro: 'sem_assinatura' });
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCIA_AVISO_S) return respJson(401, { ok: false, erro: 'fora_do_prazo' });
  if (Number(request.headers.get('content-length') || 0) > TAMANHO_MAX_AVISO) return respJson(413, { ok: false, erro: 'grande_demais' });
  let corpo = null;
  try { corpo = await lerCorpoLimitado(request, TAMANHO_MAX_AVISO); } catch { return respJson(400, { ok: false, erro: 'corpo_invalido' }); }
  if (!corpo) return respJson(413, { ok: false, erro: 'grande_demais' });
  let autentico = false;
  try { autentico = await avisoAutentico(segredo, id, ts, corpo, assinatura); } catch { autentico = false; }
  if (!autentico) return respJson(401, { ok: false, erro: 'assinatura_invalida' });
  let ev = null; try { ev = JSON.parse(new TextDecoder().decode(corpo)); } catch { ev = null; }
  if (!ev || typeof ev !== 'object') return respJson(400, { ok: false, erro: 'corpo_invalido' });
  try { return respJson(200, { ok: true, ...(await tratarAvisoResend(env, id, ev)) }); }
  catch (e) {
    // Falha nossa (banco fora do ar…): responde erro para o Resend tentar de novo mais tarde.
    console.error('resend_aviso_falhou', String(ev.type || '').slice(0, 40), String((e && e.message) || e).slice(0, 80));
    return respJson(500, { ok: false, erro: 'falha_interna' });
  }
}
async function tratarAvisoResend(env, id, ev) {
  const db = env && env.DB_PLOOMES;
  if (!db) throw new Error('sem_banco');
  const tipo = String(ev.type || '').slice(0, 40);
  const dados = ev.data && typeof ev.data === 'object' ? ev.data : {};
  const falaDeQueixa = (o) => /complain|spam/.test(semAcentoMin(JSON.stringify(o || '')));
  // Classe do aviso. Só "devolucao" (definitiva) e "queixa" mexem na lista.
  let classe = '';
  if (tipo === 'email.complained') classe = 'queixa';
  else if (tipo === 'email.bounced') {
    const bt = semAcentoMin(dados.bounce && dados.bounce.type);
    classe = bt === 'permanent' ? 'devolucao' : (bt === 'temporary' || bt === 'transient' ? 'temporaria' : 'indefinida');
    // Devolução "porque o endereço já está bloqueado no Resend": se o motivo do bloqueio foi
    // uma queixa de spam, vale como queixa (bloqueia o cliente inteiro).
    if (classe === 'devolucao' && /suppress/.test(semAcentoMin(dados.bounce && dados.bounce.subType)) && falaDeQueixa(dados.bounce)) classe = 'queixa';
  } else if (tipo === 'email.suppressed') {
    // O Resend se recusou a enviar porque o endereço já está na lista de bloqueio DELE (devolução
    // definitiva ou queixa anterior). Se o aviso disser que foi queixa, vale como queixa.
    classe = falaDeQueixa(dados.suppressed || dados.bounce) ? 'queixa' : 'devolucao';
  } else if (tipo === 'email.delivery_delayed') classe = 'temporaria';
  if (!classe) return { ignorado: true }; // entregue, aberto etc.: não interessa aqui
  await garantirTabelas(db);
  // O Resend repete o aviso se não tiver certeza de que chegou: cada um é tratado uma vez só.
  if (await db.prepare('SELECT id FROM email_avisos WHERE id = ?1').bind(id).first()) return { repetido: true };
  const lista = Array.isArray(dados.to) ? dados.to : (dados.to ? [dados.to] : []);
  const destinos = [...new Set(lista.flatMap((x) => emailsDe(String(x == null ? '' : x))))];
  const unico = destinos.length === 1 ? destinos[0] : '';
  const doRemetente = emailsDaConfig(remetente(env))[0] || '';
  const doPedido = !!doRemetente && emailsDaConfig(String(dados.from || '')).includes(doRemetente);
  const ehTeste = /@resend\.dev$/.test(unico); // endereços de teste do próprio Resend
  // "Da empresa" = mesmo domínio do remetente (ou o endereço que recebe os testes): não entra na lista.
  const ehCasa = !!unico && !ehTeste && (unico === emailTeste(env) || (!!doRemetente && unico.endsWith(`@${doRemetente.split('@')[1]}`)));
  const motivoLista = classe === 'devolucao' ? 'invalido' : (classe === 'queixa' ? 'descadastrado' : '');
  const rotulo = classe === 'queixa' ? 'queixa de spam' : 'devolução definitiva';
  let incluido = '';
  if (motivoLista) {
    if (!unico) incluido = destinos.length > 1 ? 'varios_destinatarios' : 'sem_endereco';
    else if (ehTeste) { incluido = 'teste'; await auditar(env, QUEM_RESEND, 'aviso de teste', `${rotulo} de teste recebida e conferida — nada foi incluído na lista`); }
    else if (ehCasa) { incluido = 'casa'; await auditar(env, QUEM_RESEND, 'aviso do Resend', `${rotulo} de um endereço da própria empresa (${mascarar(unico)}) — não incluído na lista`); }
    else {
      // Como o endereço estava na lista ANTES deste aviso (falha de leitura = erro: o Resend repete).
      const antes = (await consultarNaoEnviar(env, [unico], { estrito: true })).get(unico);
      // Já estava (como "pediu para sair", que nunca é rebaixado, ou com o mesmo motivo): a lista
      // não muda — o aviso conta no dia, mas não vira linha em "Últimas mudanças".
      if (antes && (antes.motivo === 'descadastrado' || antes.motivo === motivoLista)) incluido = 'ja_estava';
      else { await adicionarNaoEnviar(env, [{ e: unico, m: motivoLista }], { origem: 'resend', por: QUEM_RESEND, nota: antes ? `${rotulo} (estava como inválido)` : rotulo }); incluido = motivoLista; }
    }
  }
  const agora = new Date().toISOString();
  const tEv = Date.parse(ev.created_at || '');
  const em = Number.isFinite(tEv) && Math.abs(Date.now() - tEv) < 3 * 86400e3 ? new Date(tEv).toISOString() : agora;
  await db.prepare('INSERT OR IGNORE INTO email_avisos (id, em, recebido_em, tipo, classe, para, pedido, teste, incluido, detalhe) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)')
    .bind(id, em, agora, tipo, classe, unico ? mascarar(unico) : '', doPedido ? 1 : 0, ehTeste ? 1 : 0, incluido, String((dados.bounce && dados.bounce.subType) || '').replace(/[^A-Za-z]/g, '').slice(0, 40)).run();
  console.log('resend_aviso', tipo, classe, incluido || 'nao_incluido');
  return { classe, incluido };
}
// Contagem dos avisos por dia (horário de Brasília), classe e origem — feita pelo próprio banco,
// sem teto de linhas. Os avisos de teste ficam de fora. Devolve [{ dia, classe, pedido, n }].
export async function contarAvisos(env, deISO, ateISO) {
  const db = env && env.DB_PLOOMES; if (!db) return [];
  try { const r = await db.prepare("SELECT strftime('%Y-%m-%d', em, '-3 hours') AS dia, classe, pedido, COUNT(*) AS n FROM email_avisos WHERE teste = 0 AND em >= ?1 AND em < ?2 GROUP BY 1, 2, 3").bind(String(deISO), String(ateISO)).all(); return (r && r.results) || []; } catch { return []; }
}
export async function ultimoAviso(env) {
  const db = env && env.DB_PLOOMES; if (!db) return null;
  try { return (await db.prepare('SELECT recebido_em, classe, teste, incluido FROM email_avisos ORDER BY recebido_em DESC LIMIT 1').first()) || null; } catch { return null; }
}
// Situação dos avisos para a tela. `desde` (opcional): chegou algum aviso DE TESTE depois desse instante?
export async function estadoAvisos(env, desde) {
  const db = env && env.DB_PLOOMES;
  let testeRecebido = false;
  // Só aceita a hora no formato exato em que o próprio sistema a devolve (AAAA-MM-DDTHH:MM:SS.sssZ).
  const t = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(String(desde || '')) ? Date.parse(desde) : NaN;
  if (db && Number.isFinite(t)) {
    try { testeRecebido = !!(await db.prepare('SELECT id FROM email_avisos WHERE teste = 1 AND recebido_em >= ?1 LIMIT 1').bind(new Date(t).toISOString()).first()); } catch { testeRecebido = false; }
  }
  return { ok: true, configurado: avisosConfigurados(env), ultimo: await ultimoAviso(env), testeRecebido };
}
// Teste de ponta a ponta, disparado por alguém da equipe na tela: manda um e-mail para um
// endereço de TESTE do próprio Resend (que simula a devolução ou a queixa). O aviso volta
// pelo caminho de verdade, é conferido e aparece em "Últimas mudanças" como aviso de teste —
// sem incluir nada na lista e sem contar nas devoluções do dia.
export async function enviarTesteAviso(env, tipo, por) {
  if (!avisosConfigurados(env)) return { ok: false, message: 'Primeiro é preciso guardar o segredo do aviso na Cloudflare (veja “Como ligar”, logo abaixo).' };
  const quem = emailsDe(por)[0] || 'equipe';
  if (env.PORTAL_KV) { const k = `throttle:avaliacao-teste-aviso:${quem}`; if (await env.PORTAL_KV.get(k)) return { ok: false, message: 'Aguarde um minuto para repetir o teste.' }; await env.PORTAL_KV.put(k, '1', { expirationTtl: 60 }); }
  const queixa = tipo === 'queixa';
  const desde = new Date().toISOString(); // ANTES de enviar: o aviso pode voltar muito rápido
  const r = await enviarResend(env, { para: queixa ? 'complained@resend.dev' : 'bounced@resend.dev', assunto: `[TESTE DE AVISO] ${queixa ? 'queixa' : 'devolução'} simulada`, texto: 'Teste do aviso de devolução e queixa do Resend, disparado pela tela de avaliações do sistema. Nenhum cliente recebe este e-mail.', idem: `avaliacao-teste-aviso-${Date.now()}` });
  if (!r.ok) return { ok: false, message: r.erro === 'sem_chave_email' ? 'O serviço de e-mail (Resend) não está configurado.' : `O serviço de e-mail recusou o envio do teste (${r.erro}).` };
  await auditar(env, por, 'aviso de teste', `disparou o teste de ${queixa ? 'queixa' : 'devolução'}`);
  return { ok: true, desde };
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
  // Devoluções e queixas avisadas pelo Resend, por dia (horário de Brasília), últimos 7 dias.
  const avisosDia = new Map();
  for (const a of await contarAvisos(env, new Date(Date.now() - 7 * 86400e3).toISOString(), new Date(Date.now() + 86400e3).toISOString())) {
    const n = Number(a.n) || 0;
    const x = avisosDia.get(a.dia) || { dia: a.dia, devolucoes: 0, queixas: 0, temporarias: 0, devolucoes_pedido: 0, queixas_pedido: 0 };
    if (a.classe === 'devolucao') { x.devolucoes += n; if (a.pedido) x.devolucoes_pedido += n; } else if (a.classe === 'queixa') { x.queixas += n; if (a.pedido) x.queixas_pedido += n; } else x.temporarias += n;
    avisosDia.set(a.dia, x);
  }
  const avisos = { configurado: avisosConfigurados(env), ultimo: await ultimoAviso(env), dias: [...avisosDia.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1)) };
  return { cfg, ultimos, semana, recusa, avisos, auditoria: await listarAuditoria(env, 12), naoEnviar: await contarNaoEnviar(env), resendOk: !!(env && env.RESEND_API_KEY), remetente: remetente(env), testePara: emailTeste(env), link: (env && env.AVALIACAO_LINK) || LINK_PADRAO };
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
  const av = d.avisos || { configurado: false, ultimo: null, dias: [] };
  const diaCurto = (dia) => dia.split('-').reverse().slice(0, 2).join('/');
  const rotuloAviso = (u) => (u.teste ? 'aviso de teste' : (u.classe === 'queixa' ? 'queixa de spam' : (u.classe === 'devolucao' ? 'devolução definitiva' : 'devolução temporária')));
  const avisosLinhas = av.dias.map((x) => `<div style="padding:6px 0;border-top:1px solid #EEF1F0;font-size:13px">${esc(diaCurto(x.dia))} — devoluções: <b>${x.devolucoes}</b>${x.devolucoes ? ` (${x.devolucoes_pedido} de pedido de avaliação)` : ''} · queixas: <b>${x.queixas}</b>${x.queixas ? ` (${x.queixas_pedido} de pedido de avaliação)` : ''} · temporárias: <b>${x.temporarias}</b></div>`).join('');
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
    <div class="sec">Devoluções e queixas (avisos do Resend)</div>
    <div style="font-size:13.5px;line-height:1.6">Aviso do Resend: ${av.configurado ? '<b style="color:#1E5B31">✅ ligado</b>' : '<b style="color:#9B1C1C">❌ ainda não ligado</b> — sem isso, devolução e queixa não entram sozinhas na lista (veja “Como ligar”, abaixo)'}.${av.ultimo ? ` Último aviso recebido: <b>${esc(textoBR(av.ultimo.recebido_em))}</b> (${esc(rotuloAviso(av.ultimo))}).` : (av.configurado ? ' Nenhum aviso recebido ainda.' : '')}</div>
    <div style="font-size:12.5px;color:#4F6469;line-height:1.6;margin-top:6px">E-mail que <b>volta de vez</b> (o endereço não existe) entra na lista como “e-mail inválido (voltou)”. <b>Queixa de spam</b> entra como “pediu para sair” e bloqueia o cliente inteiro. Devolução <b>temporária</b> (caixa cheia, servidor fora do ar) não entra na lista. Cada entrada aparece em “Últimas mudanças” como vinda do Resend. Quem já estava como “pediu para sair” continua assim. Só endereço do próprio domínio da empresa (o do remetente) fica de fora da lista; a lista “casa e família” não muda isso.</div>
    <div class="sec" style="margin-top:14px">Últimos 7 dias, por dia</div>
    ${avisosLinhas || '<div style="font-size:13px;color:#8fa39f">Nenhuma devolução ou queixa nos últimos 7 dias.</div>'}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-g" onclick="testeAviso('devolucao')">🧪 Testar aviso de devolução</button>
      <button class="btn btn-g" onclick="testeAviso('queixa')">🧪 Testar aviso de queixa</button>
    </div>
    <div id="mAviso" class="msg">O teste manda um e-mail para um endereço de teste do próprio Resend (nenhum cliente recebe). Em até 1 minuto o aviso volta e aparece aqui e em “Últimas mudanças” como “aviso de teste”, sem incluir nada na lista.</div>
    <details style="margin-top:10px"><summary style="font-size:12.5px;font-weight:800;color:#0B5B66;cursor:pointer">Como ligar (uma vez só)</summary>
      <div style="font-size:12.5px;color:#4F6469;line-height:1.7;margin-top:6px">1. No painel do Resend, em <b>Webhooks</b>, clique em <b>Add Webhook</b>; no endereço, cole <b>https://sistema.ecobraz.org/api/resend/webhook</b>; marque os eventos <b>email.bounced</b>, <b>email.complained</b>, <b>email.delivery_delayed</b> e, se existir, <b>email.suppressed</b>; clique em <b>Add</b>.<br>2. Abra o webhook criado e copie o <b>Signing Secret</b> (começa com “whsec_”).<br>3. Na Cloudflare, em <b>Workers &amp; Pages → ecobraz-portal → Settings → Variables and Secrets</b>, clique em <b>Add</b>, escolha o tipo <b>Secret</b>, nome <b>RESEND_WEBHOOK_SECRET</b>, cole o valor e clique em <b>Deploy</b>.<br>4. Volte aqui, recarregue a página (deve aparecer “✅ ligado”) e clique em “Testar aviso de devolução”.<br><b>O segredo não deve ser colado em conversa, e-mail ou arquivo</b> — só nesses dois lugares.</div></details>
  </div>
  <div class="card">
    <div class="sec">Últimas mudanças (chave e listas)</div>
    ${mudancas || '<div style="font-size:13px;color:#8fa39f">Nenhuma mudança registrada ainda.</div>'}
  </div>
  <div class="card">
    <div class="sec">Como funciona</div>
    <div style="font-size:13px;color:#4F6469;line-height:1.7">• Sai 2 horas depois de a coleta ficar <b>concluída</b>, só entre 08h e 20h (fora disso, às 08h seguintes). O sistema confere a cada 10 minutos.<br>• Um pedido por cliente a cada 12 meses (pelo CNPJ/CPF; sem documento, pelo e-mail). O mesmo endereço de e-mail também não recebe dois pedidos em 12 meses, ainda que seja contato de empresas diferentes — nesse caso o pedido vai para o contato seguinte da empresa, se houver.<br>• Se o serviço de e-mail não responde num envio (não dá para saber se saiu), as outras coletas do mesmo cliente <b>esperam</b> o desfecho dele, para ninguém receber dois pedidos.<br>• Não recebem: casa e família, cliente com bloqueio de contato, quem já recebeu em 12 meses, quem não tem e-mail, quem tem e-mail mal formado no cadastro (endereço cortado, com “|” no meio, texto grudado, palavra colada antes do endereço como “maria clara@…”, espaço antes do @ — aparece como “e-mail inválido”) e quem está na lista “não enviar e-mail”. O motivo aparece na OS.<br>• Também não sai: coleta marcada como concluída mais de 10 dias depois da data dela (coleta antiga) e coleta que foi <b>reaberta</b> depois de concluída — só uma conclusão nova volta a valer.<br>• Contato marcado como inativo/desligado no cadastro não recebe.<br>• Se o sistema não conseguir ler as listas ou o cadastro, ele <b>não envia</b> e tenta de novo na rodada seguinte.<br>• <b>Descadastro bloqueia o cliente inteiro:</b> se qualquer e-mail do cliente (o geral, o do contato da coleta ou o de qualquer contato) estiver na lista como “pediu para sair”, o pedido não vai para nenhum e-mail dele. E-mail inválido (voltou) ou mal formado é diferente: o pedido pode ir para outro e-mail bom do cliente — exceto quando o <b>primeiro</b> endereço de um campo é mal formado: aí os outros desse <b>mesmo campo</b> também não são usados.<br>• Pessoa física: “Oi, [nome]!” só quando o e-mail usado é o <b>primeiro da ficha</b>; se for outro (o do contato da coleta, de outro contato, o segundo da ficha), o texto começa com “Olá!”, sem nome.<br>• Sem e-mail? Peça pelo WhatsApp e marque <b>“Pedi pelo WhatsApp”</b> na OS — vale como pedido feito.<br>• Texto simples, sem imagem. O link é o do Google, sem rastreio.</div>
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
function testeAviso(t){var m=$('mAviso');m.textContent='Enviando o teste…';post('/api/avaliacoes/teste-aviso',{tipo:t}).then(function(j){if(!j.ok){m.textContent=j.message||'Não foi possível disparar o teste.';return;}var n=0;m.textContent='Teste enviado. Esperando o aviso do Resend voltar…';
  (function olhar(){post('/api/avaliacoes/aviso-estado',{desde:j.desde}).then(function(e){if(e&&e.testeRecebido){m.innerHTML='<b style="color:#1E5B31">✅ Aviso de teste recebido e conferido.</b> Recarregue a página para ver em “Últimas mudanças”.';return;}if(++n>=20){m.textContent='O aviso não voltou em 1 minuto. Confira no Resend se o webhook está ativo e se o segredo guardado na Cloudflare é o mesmo do webhook; depois tente de novo.';return;}setTimeout(olhar,3000);}).catch(function(){if(++n>=20){m.textContent='Sem conexão para conferir. Recarregue a página em um minuto.';return;}setTimeout(olhar,3000);});})();}).catch(function(){m.textContent='Sem conexão.';});}
function salvarCasa(){var m=$('mCasa');m.textContent='Salvando…';post('/api/avaliacoes/casa',{texto:$('casa').value}).then(function(j){m.textContent=j.ok?'Salvo.':(j.message||'Não foi possível salvar.');}).catch(function(){m.textContent='Sem conexão.';});}
function carga(){var f=$('arq').files[0],m=$('mCarga');if(!f){m.textContent='Escolha o arquivo.';return;}var padrao=$('aMotivo').value;var r=new FileReader();
  r.onload=function(){var RE=/^[a-z0-9_%+&-]+(\\.[a-z0-9_%+&-]+)*@[a-z0-9-]+(\\.[a-z0-9-]+)*\\.[a-z]{2,}$/,linhas=String(r.result||'').split(/\\r?\\n/),achados=[],temSaida=false,i;
    for(i=0;i<linhas.length;i++){var t=linhas[i].normalize('NFC').toLowerCase(),cels=t.split(/[\\s,;|<>()\\[\\]"]+/),e='';
      for(var c=0;c<cels.length;c++){var x=cels[c].replace(/^[.']+|[.']+$/g,'');if(x.length<=254&&RE.test(x)){e=x;break;}}
      if(!e)continue;var resto=t.replace(e,' ').replace(/_/g,' '),tipo='';
      if(/\\b(inativ[oa]s?|removid[oa]s?|removed|descadastr\\w*|unsubscri\\w*|opt[- ]?out|cancelad[oa]s?|cancelou|cancell?ed|reclama\\w*|spam|complain\\w*)\\b/.test(resto)||/(?:\\b(?:n[^a-z\\s]o|nao|not|nunca|never)(?:[^\\S\\t]|-)+(?:(?:est[^\\s|;,·-]?|foi|is|was|[^\\s|;,·-])(?:[^\\S\\t]|-)+)?(?:mais(?:[^\\S\\t]|-)+)?|\\b(?:no|non)(?:[^\\S\\t]|-)+(?:longer(?:[^\\S\\t]|-)+)?|(?:^|[^a-z-])(?:in|un)(?:[^\\S\\t]|-)+)(?:ativ[oa]s?|active|subscribed|inscrit[oa]s?|confirmad[oa]s?)\\b/.test(resto.replace(/\\bopt[\\s-]?in\\b/g,' ')))tipo='descadastrado';
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
