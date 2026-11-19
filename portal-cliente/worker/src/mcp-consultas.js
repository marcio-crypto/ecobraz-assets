// CONSULTAS EM LOTE DA BASE — conector "Base Ecobraz" do Claude (pedido do Marcio,
// 17/11): leitura direta, com filtros e paginação, de clientes, coletas, leads e dados
// operacionais — listas de campanha separando PF e PJ, reativação da base,
// acompanhamento de coletas por dia e planejamento da capacidade de retirada.
//
// Regras desta camada (todas obrigatórias):
//   1. SÓ LEITURA: nenhuma função grava nada (nem cache).
//   2. Saída JSON { total, pagina, paginas, por_pagina, itens, filtros, avisos };
//      formato "texto" opcional, para compatibilidade.
//   3. Até 200 por página. Datas AAAA-MM-DD no fuso de São Paulo (UTC-3, sem verão).
//   4. LGPD: CPF NUNCA sai completo (***.456.789-**) — nem dentro de textos livres; RG
//      digitado em texto livre é omitido; nada de dado bancário, senha ou token; de
//      pessoa física (e de qualquer cliente) só cidade, UF, CEP e bairro, sem rua/número.
//   5. Descadastro: todo cliente traz aceita_email e motivo_bloqueio.
//   6. Cada informação que não existe no banco sai vazia e é dita em "avisos" — nunca
//      inventada. Estimativas vêm marcadas como estimativas.

import { listarColetasOS, materialIndiceOS } from './coletas.js';
import { lerChavesKV } from './kv-lote.js';
import { MATERIAIS as TRIAGEM_DOCA } from './operacional.js';
import { REGRAS_MATERIAIS, estimarPesoKg } from './cadastro.js';
import { isoBR, minutosEntre, percentil, segundaDaSemana, situacaoPrazo, avaliarLoteGrande, perfilDoLead, ehPedidoDeColeta, medido, INICIO_MEDICAO, INICIO_MEDICAO_TXT, primeiroContatoDoHistorico } from './atendimento.js';
import { lerAvaliacoes, camposAvaliacao, ROTULO_MOTIVO, contarAvisos, diagnosticoEmailAvaliacao, REGRA_LEITURA_EMAIL } from './avaliacao.js';
import { COMO_OPCOES, COMO_NAO_INFORMADO, comoValido, rotuloComo } from './como-nos-achou.js';

export class ErroUso extends Error {}

// --- Utilidades ---------------------------------------------------------------------
const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const normTxt = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const fmtCNPJ = (d) => (d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : d);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const MS_H = 3600e3;
const ROTULO_STATUS = { agendada: 'Agendada', em_transporte: 'Em transporte', na_unidade: 'Na unidade', concluida: 'Concluída', cancelada: 'Cancelada' };
const rotuloStatus = (o) => (o.status === 'agendada' && !o.dataAgendada ? 'Aguardando roteiro' : (ROTULO_STATUS[o.status] || o.status || ''));
const ABERTAS = new Set(['agendada', 'em_transporte', 'na_unidade']);

// Dia (AAAA-MM-DD) em São Paulo. Data/hora com fuso (Z ou ±HH:MM) é convertida; data
// sem fuso já está no horário local e só perde a hora.
export function diaBR(v) {
  const s = String(v == null ? '' : v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return '';
  if (!/T.*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) return m[1];
  const t = Date.parse(s);
  return isNaN(t) ? m[1] : new Date(t - 3 * MS_H).toISOString().slice(0, 10);
}
const hojeBR = () => new Date(Date.now() - 3 * MS_H).toISOString().slice(0, 10);
const somaDias = (dia, n) => new Date(Date.parse(dia + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
// Parâmetro de data: AAAA-MM-DD, ou AAAA-MM (início/fim do mês). '' quando inválido.
function dataParam(v, fim) {
  const s = String(v == null ? '' : v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const t = Date.parse(s + 'T12:00:00Z'); return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === s ? s : ''; }
  if (/^\d{4}-\d{2}$/.test(s)) { const [a, m] = s.split('-').map(Number); if (m < 1 || m > 12) return ''; return fim ? new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) : s + '-01'; }
  return '';
}
function periodoObrigatorio(a, maxDias) {
  const de = dataParam(a.de, false), ate = dataParam(a.ate, true);
  if (!de || !ate) throw new ErroUso('Informe "de" e "ate" no formato AAAA-MM-DD (ou AAAA-MM para o mês inteiro).');
  if (de > ate) throw new ErroUso('"de" precisa ser anterior ou igual a "ate".');
  if (maxDias && (Date.parse(ate) - Date.parse(de)) / 86400e3 + 1 > maxDias) throw new ErroUso(`Período máximo desta função: ${maxDias} dias. Divida a consulta.`);
  return { de, ate };
}
const sim = (v) => v === true || /^(true|sim|s|yes|1)$/i.test(String(v == null ? '' : v).trim());
const nao = (v) => v === false || /^(false|nao|não|n|no|0)$/i.test(String(v == null ? '' : v).trim());
const simNaoNulo = (v) => (v == null || String(v).trim() === '' ? null : (sim(v) ? true : (nao(v) ? false : null)));
function paginacao(a, padrao) {
  const pagina = Math.max(1, Math.floor(Number(a.pagina) || 1));
  const porPagina = Math.min(200, Math.max(1, Math.floor(Number(a.por_pagina) || padrao || 50)));
  return { pagina, porPagina };
}

// --- LGPD ---------------------------------------------------------------------------
export function mascararCPF(v) { const d = digits(v); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''; }
function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== Number(d[9])) return false;
  s = 0; for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0; return r === Number(d[10]);
}
// Texto livre — CPF: 11 dígitos escritos como se escreve CPF (pontos, hífen, travessão,
// espaço, barra ou vírgula; até 3 separadores entre os blocos) viram máscara quando
// passam no dígito verificador, quando têm o formato 000.000.000-00, ou quando a
// palavra "CPF" vem logo antes (CPF digitado com erro). Pode esconder 1 número em 100
// que não era CPF — melhor esconder a mais. RG: com a palavra "RG" na frente, o número
// inteiro some; sem ela, somem os formatos típicos (00.000.000-0, 00000000-0, UF-00.000.000).
const SEP_DOC = '[\\s.,\\-–—/]{0,3}';
const RE_CPF_LIVRE = new RegExp(`(?<!\\d)\\d{3}${SEP_DOC}\\d{3}${SEP_DOC}\\d{3}${SEP_DOC}\\d{2}(?!\\d)`, 'g');
const RE_RG_PALAVRA = /\b(?:rg|r\.g\.?)(?![a-z])[\s:.\-–—]*(?:n[º°o.]?\s*)?(?:[a-z]{2}[\s\-–—/]*)?\d[\dx.\-–—\s/]{3,16}[\dx]/gi;
export function limparTextoLivre(s) {
  return String(s == null ? '' : s)
    .replace(RE_CPF_LIVRE, (m, pos, tudo) => {
      const d = digits(m);
      if (cpfValido(d) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(m) || /cpf/i.test(tudo.slice(Math.max(0, pos - 25), pos))) return mascararCPF(d);
      return m;
    })
    .replace(RE_RG_PALAVRA, 'RG [omitido]')
    .replace(/(?<![\d.])\d{1,2}\.\d{3}\.\d{3}-[\dxX](?![\dxX])/g, '[RG omitido]')
    .replace(/(?<![\d./\-])\d{7,9}-[\dxX](?![\dxX])/g, '[RG omitido]')
    .replace(/\b[A-Z]{2}[\-–—\s]?\d{1,2}\.\d{3}\.\d{3}(?:-[\dxX])?(?![\dxX])/g, '[RG omitido]');
}
// Endereço em texto livre (rua e número não saem — LGPD). As linhas que o próprio
// sistema escreve com endereço ("Endereço: …", "Endereço de coleta: …", "(CEP … · rua,
// nº …)", "CNPJ/CPF: …") saem inteiras. No resto do texto somem "Rua/Avenida/Alameda/
// Travessa/Estrada/Rodovia/Praça…", as abreviações com ponto (Av., Al., Trav., Estr.,
// Rod., Pça., Lgo., R.), "R das Flores"/"Av Paulista" sem ponto, com até 10 palavras do
// nome (aceita "25 de Março") e o número ("123", ", 455", "nº 1.500", "s/n"); e
// "Quadra 104", "Lote 20". Endereço escrito sem nenhuma dessas palavras (ex.: só "das
// Flores, 123") não tem como ser reconhecido.
// Linha "rótulo: valor" de endereço (com dois-pontos — "endereço errado" num motivo
// de cancelamento continua, só a rua dentro dele some).
const RE_LINHA_ENDERECO = /^\s*(?:endere[cç]o(?:\s+(?:de|da|do)\s+[a-zà-ú]+)?\s*:|end\.?\s*:|local\s+(?:de|da)\s+(?:coleta|retirada)\s*:|logradouro\s*:|\(\s*cep\b|cnpj\/cpf\s*:)/i;
const NOME_RUA = String.raw`(?:\d{1,4}\b[ \t]*)?(?:[^\s\d,;:()\[\]]+[ \t]*){0,10}`;
const NUMERO_RUA = String.raw`(?:,?[ \t]*(?:(?:n[º°o.]?|n[uú]m(?:ero)?\.?)[ \t]*)?(?:\d{1,5}(?:\.\d{3})?[a-z]?\b|s\/n\b))?`;
const RE_RUA_PALAVRA = new RegExp(String.raw`\b(?:rua|avenida|alameda|travessa|estrada|rodovia|pra[cç]a|pça|largo|viela|servid[aã]o)(?![a-zà-ú])[ \t]*[:.]?[ \t]*` + NOME_RUA + NUMERO_RUA, 'gi');
const RE_RUA_ABREV = new RegExp(String.raw`\b(?:av|al|trav|estr|rod|pça|pç|pca|lgo|r)[.:][ \t]*` + NOME_RUA + NUMERO_RUA, 'gi');
const RE_RUA_SEM_PONTO = new RegExp(String.raw`\b(?:Av|AV|Al|R|Trav|TRAV|Estr|ESTR|Rod|ROD)[ \t]+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9]|d[aeo]s?\s)` + NOME_RUA + NUMERO_RUA, 'g');
const RE_QUADRA_LOTE = /\b(?:quadra|qd|qda|lote|lt)\.?[ \t]*\d{1,4}[a-z]?\b/gi;
export function semEndereco(texto) {
  return String(texto == null ? '' : texto).split(/\r?\n/)
    .filter((l) => !RE_LINHA_ENDERECO.test(l))
    .join('\n')
    .replace(RE_RUA_PALAVRA, '[endereço omitido]')
    .replace(RE_RUA_ABREV, '[endereço omitido]')
    .replace(RE_RUA_SEM_PONTO, '[endereço omitido]')
    .replace(RE_QUADRA_LOTE, '[endereço omitido]');
}
export const limparMensagemLead = semEndereco;
// Texto livre que vai sair: CPF/RG mascarados PRIMEIRO (o número da rua não pode
// "comer" o começo de um CPF), depois sem endereço, e só então cortado (um corte no
// meio de um CPF deixaria dígitos que a máscara não reconhece mais).
const textoSeguro = (s, max, manterLinhas) => {
  let t = semEndereco(limparTextoLivre(s));
  t = manterLinhas ? t.split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n') : limpar(t);
  return max && t.length > max ? t.slice(0, max).replace(/\s+\S{0,20}$/, '') : t;
};
// Campo que o sistema já cortou na gravação: tira a última palavra se ficou pela metade.
const semCauda = (s, max) => { const t = String(s == null ? '' : s); return t.length >= max ? t.replace(/\s+\S{0,20}$/, '') : t; };
// Última barreira antes de sair: todo texto passa pela limpeza, menos os campos que
// SÃO telefone (um celular de 11 dígitos não pode virar máscara de CPF por acaso).
const CAMPOS_FONE = new Set(['celulares', 'telefones', 'celular', 'telefone']);
function sanitizar(v, chave) {
  if (typeof v === 'string') return CAMPOS_FONE.has(chave) ? v : limparTextoLivre(v);
  if (Array.isArray(v)) return v.map((x) => sanitizar(x, chave));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = sanitizar(x, k); return o; }
  return v;
}

// --- Contatos: e-mails e telefones ---------------------------------------------------
export function separarEmails(...valores) {
  const out = [];
  for (const v of valores.flat()) for (const m of String(v == null ? '' : v).toLowerCase().matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}
const fmtFone = (d) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`);
// Dígitos nacionais (DDD + número) de cada telefone de um texto livre.
function fonesNacionais(v) {
  const out = [];
  for (const parte of String(v == null ? '' : v).split(/\s*(?:\/|;|,|\||\be\b|\bou\b)\s*/i)) {
    let d = digits(parte);
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
    // 11 dígitos sem o 9 de celular não é telefone no Brasil; se passa no dígito
    // verificador do CPF, é CPF digitado no campo errado — não sai.
    if (d.length === 11 && d[2] !== '9' && cpfValido(d)) continue;
    if (d.length === 10 || d.length === 11) out.push(d);
  }
  return out;
}
export function separarFones(...valores) {
  const cel = [], fix = [];
  for (const v of valores.flat()) for (const d of fonesNacionais(v)) {
    if (d.length === 11 && d[2] === '9') { if (!cel.includes(d)) cel.push(d); } else if (!fix.includes(d)) fix.push(d);
  }
  return { celulares: cel.map(fmtFone), telefones: fix.map(fmtFone) };
}
// Telefones de um cliente sem nenhum número igual a um CPF dele (CPF digitado no campo
// de telefone sairia "disfarçado" de celular).
function fonesSemDocs(docs, ...valores) {
  const r = separarFones(...valores);
  const bloq = new Set((docs || []).map(digits).filter((d) => d.length === 11));
  const fica = (f) => !bloq.has(digits(f));
  return { celulares: r.celulares.filter(fica), telefones: r.telefones.filter(fica) };
}

// --- Endereço ---------------------------------------------------------------------
const cepDe = (v) => { const m = String(v == null ? '' : v).match(/(?<!\d)(\d{5})-?(\d{3})(?!\d)/); return m ? m[1] + m[2] : ''; };
const fmtCep = (d) => (d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : '');
// Placa do veículo da OS: a da transportadora (coleta terceirizada) ou a do motorista —
// mesma regra do índice de OS.
const placaDoRegistro = (rec) => String((rec && rec.transportadora && rec.transportadora.placa) || (rec && rec.veiculoPlaca) || '').trim().toUpperCase();
// Endereço de uma linha do D1: JSON (cadastro do sistema novo) ou texto do Ploomes.
function enderecoDaLinha(row) {
  const t = String((row && row.endereco) || '').trim();
  if (t.startsWith('{')) { try { const o = JSON.parse(t); return { cep: digits(o.cep).slice(0, 8), bairro: limpar(o.bairro), cidade: limpar(o.cidade || row.cidade), uf: limpar(o.uf || row.uf).toUpperCase() }; } catch { /* texto */ } }
  return { cep: digits(row && row.pl_cep).slice(0, 8) || cepDe(t), bairro: limpar(row && row.pl_bairro), cidade: limpar(row && row.cidade), uf: limpar(row && row.uf).toUpperCase() };
}
const PRACA_DA_SE = { lat: -23.5505, lon: -46.6339 };
function distanciaSeKm(lat, lon) {
  const rad = Math.PI / 180, R = 6371;
  const dLat = (lat - PRACA_DA_SE.lat) * rad, dLon = (lon - PRACA_DA_SE.lon) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(PRACA_DA_SE.lat * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

// --- SQL ------------------------------------------------------------------------------
const DOC_SQL = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${col},''),'.',''),'/',''),'-',''),' ','')`;
const ACENTOS = 'áaàaâaãaäaÁaÀaÂaÃaÄaéeèeêeëeÉeÈeÊeËeíiìiîiïiÍiÌiÎiÏióoòoôoõoöoÓoÒoÔoÕoÖoúuùuûuüuÚuÙuÛuÜuçcÇcñnÑn';
function sqlSemAcento(col) { let s = `COALESCE(${col},'')`; for (let i = 0; i < ACENTOS.length; i += 2) s = `REPLACE(${s},'${ACENTOS[i]}','${ACENTOS[i + 1]}')`; return `TRIM(LOWER(${s}))`; }
const SQL_DIA_BR = (col) => `(CASE WHEN ${col} GLOB '????-??-??T*Z' OR ${col} GLOB '????-??-??T*[+-][0-9][0-9]:[0-9][0-9]' THEN date(${col}, '-3 hours') ELSE substr(${col},1,10) END)`;
const COND_TIPO = {
  PJ: "c.tipo='PJ'",
  PF: "c.tipo='PF' AND COALESCE(c.company_id,0)=0",
  todos: "(c.tipo='PJ' OR (c.tipo='PF' AND COALESCE(c.company_id,0)=0))",
};
// Executa a mesma consulta em fatias (listas grandes no json_each) e junta as linhas.
async function consultaEmFatias(db, montarSQL, lista, bindsExtras, fatia) {
  const out = [];
  const tam = fatia || 2500;
  for (let i = 0; i < Math.max(1, lista.length); i += tam) {
    const parte = lista.slice(i, i + tam);
    if (!parte.length && lista.length) break;
    const r = await db.prepare(montarSQL()).bind(JSON.stringify(parte), ...(bindsExtras || [])).all();
    out.push(...((r && r.results) || []));
  }
  return out;
}
const chaveCliente = (doc, pid) => { const d = digits(doc); return d.length === 11 || d.length === 14 ? d : 'p' + pid; };
// Tipo pelo documento (CNPJ = PJ, CPF = PF); sem documento, o tipo do cadastro.
const tipoDaChave = (k, t) => (k.startsWith('p') ? (t === 'PJ' ? 'PJ' : 'PF') : (k.length === 14 ? 'PJ' : 'PF'));
// Id público do cliente: PJ com CNPJ → "PJ-<cnpj>"; os demais pelo registro da base →
// "PF-B<id>" / "PJ-B<id>". Nunca pelo CPF (que não pode sair inteiro).
function idCliente(k, tipo, pids) {
  if (k.length === 14 && !k.startsWith('p')) return `PJ-${k}`;
  const base = k.startsWith('p') ? Number(k.slice(1)) : Math.min(...(pids || []).map(Number).filter((n) => n > 0));
  return Number.isFinite(base) && base > 0 ? `${tipo === 'PJ' ? 'PJ' : 'PF'}-B${base}` : null;
}

// --- Materiais: sinônimos e categorias -------------------------------------------------
const SINONIMOS = [
  ['geladeira', 'refrigerador'], ['freezer', 'congelador'], ['maquina de lavar', 'lavadora', 'lava roupa', 'lava-roupa'],
  ['micro-ondas', 'microondas', 'micro ondas'], ['televisao', 'televisor', 'tv'], ['notebook', 'laptop'],
  ['computador', 'desktop', 'cpu', 'gabinete'], ['celular', 'smartphone'], ['nobreak', 'no-break', 'no break'], ['ar condicionado', 'ar-condicionado'],
];
function termosMaterial(v) {
  const t = normTxt(v); if (!t) return [];
  const grupo = SINONIMOS.find((g) => g.includes(t));
  return grupo ? grupo : [t];
}
const casaTermo = (texto, termos) => termos.some((t) => (t.length <= 3 ? new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(texto) : texto.includes(t)));
const CATEGORIAS = [
  ['linha_branca', 'Linha branca', /geladeira|refrigerador|freezer|congelador|frigobar|maquina de lavar|lavadora|lava.?roupa|secadora|lava.?loucas?|fogao|cooktop|forno|micro.?ondas|ar.?condicionado|bebedouro|purificador|adega/],
  ['informatica', 'Informática', /computador|desktop|gabinete|\bcpus?\b|notebook|laptop|monitor|impressora|multifuncional|servidor|teclado|mouse|\bhds?\b|\bssds?\b|memoria|placa|\bpci\b|roteador|switch|modem|scanner|projetor|tablet|componente|informatica/],
  ['telefonia', 'Telefonia', /celular|smartphone|telefone|central telefonica|\bpabx\b|radio/],
  ['baterias_energia', 'Baterias e energia', /bateria|pilha|nobreak|no-break|estabilizador|\bups\b|\bfontes?\b/],
  ['cabos', 'Cabos e fios', /\bcabos?\b|\bfios?\b|fiacao|extensao/],
  ['linha_marrom', 'Linha marrom (TV e áudio)', /\btvs?\b|televis|caixa de som|\bsom\b|home theater|\bdvd|video.?game|decodificador|receptor/],
  ['iluminacao', 'Iluminação', /lampada|luminaria|reator/],
  ['cartuchos_toners', 'Cartuchos e toners', /cartucho|toner|tonner/],
  ['metais', 'Metais e sucata', /metal|sucata|\baco\b|aluminio|cobre|ferro/],
  ['plastico', 'Plástico', /plastico/],
];
export function categoriaMaterial(nome) {
  const t = normTxt(nome);
  for (const [cod, rotulo, re] of CATEGORIAS) if (re.test(t)) return { codigo: cod, nome: rotulo };
  return { codigo: 'outros', nome: 'Outros' };
}
// "quantidade | material | 2 geladeira; 1 monitor" → nomes dos itens (ou o material).
// Os textos saem já sem endereço e sem CPF/RG (são digitados livremente na OS).
function partesMat(mat) {
  const s = String(mat || ''); if (!s) return { quantidade: '', material: '', itens: [] };
  const [q = '', m = '', i = ''] = s.split(' | ');
  const itens = i ? i.split('; ').map((x) => { const mm = x.match(/^(\d+(?:[.,]\d+)?)\s+(.*)$/); return mm ? { qtd: mm[1], nome: textoSeguro(mm[2], 140) } : { qtd: '1', nome: textoSeguro(x, 140) }; }).filter((x) => x.nome) : [];
  return { quantidade: textoSeguro(q, 100), material: textoSeguro(m, 300), itens };
}
const nomesMateriais = (mat) => { const p = partesMat(mat); return p.itens.length ? p.itens.map((x) => x.nome) : (p.material ? [textoSeguro(p.material, 80)] : []); };
// A OS tem o material procurado? Texto da OS (quantidade, material e itens) ou categoria
// pesada na doca. OS cancelada não conta (não houve coleta).
const osTemMaterial = (o, termos, mats, pesos) => o.status !== 'cancelada' && (casaTermo(mats.get(o.id) || '', termos) || ((pesos.get(o.id) || {}).cats || []).some((c) => casaTermo(normTxt(c.categoria), termos)));

// --- Contexto de uma chamada (memoriza leituras; nada é gravado) ------------------------
function novoContexto(env) {
  const memo = new Map();
  const uma = (k, fn) => { if (!memo.has(k)) memo.set(k, fn()); return memo.get(k); };
  const kvJSON = async (chave, padrao) => { try { const raw = env.PORTAL_KV ? await env.PORTAL_KV.get(chave) : null; const v = raw ? JSON.parse(raw) : padrao; return v == null ? padrao : v; } catch { return padrao; } };
  const ctx = {
    env, db: env.DB_PLOOMES || null, avisos: [],
    // Teto de operações de KV desta chamada (a plataforma corta em 1.000 por invocação;
    // com leitura em lote o uso real fica em dezenas). Se acabar, a resposta sai com aviso.
    orcamento: { restante: 850 },
    aviso(t) { if (!ctx.avisos.includes(t)) ctx.avisos.push(t); },
    oss: () => uma('oss', async () => { try { const l = await listarColetasOS(env); return Array.isArray(l) ? l.filter((o) => o && o.id) : []; } catch { ctx.aviso('Índice de Ordens de Coleta indisponível agora.'); return []; } }),
    opIndex: () => uma('op', async () => { const l = await kvJSON('op:index', []); return Array.isArray(l) ? l : []; }),
    leads: () => uma('leads', async () => { const l = await kvJSON('leads:index', []); return Array.isArray(l) ? l.filter((x) => x && x.id && x.status !== 'excluido') : []; }),
    cliIdx: () => uma('cli', async () => { const l = await kvJSON('cli:index', []); return Array.isArray(l) ? l : []; }),
    lerVarios: (chaves) => lerChavesKV(env.PORTAL_KV, chaves, { orcamento: ctx.orcamento }),
  };
  // Ficha (KV) por documento: mesmo critério do "Editar" — a 1ª do índice com aquele doc.
  ctx.fichaIdPorDoc = () => uma('fichaDoc', async () => { const m = new Map(); for (const c of await ctx.cliIdx()) { const d = digits(c && c.doc); if ((d.length === 11 || d.length === 14) && !m.has(d)) m.set(d, c.id); } return m; });
  ctx.docPorFicha = () => uma('docFicha', async () => { const m = new Map(); for (const c of await ctx.cliIdx()) { const d = digits(c && c.doc); if (c && c.id && (d.length === 11 || d.length === 14)) m.set(c.id, d); } return m; });
  // Documento do cliente de uma OS (o da OS; se faltar, o da ficha ligada a ela).
  ctx.docDaOS = async (o) => { const d = digits(o && o.clienteDoc); if (d.length === 11 || d.length === 14) return d; return (o && o.clienteId && (await ctx.docPorFicha()).get(o.clienteId)) || ''; };
  // Peso e categorias pesadas por OS: doca (op:index, 300 mais recentes) + cargas (D1).
  ctx.pesos = () => uma('pesos', async () => {
    const porOS = new Map();
    for (const o of await ctx.opIndex()) {
      const id = String((o && o.osId) || ''); if (!id) continue;
      porOS.set(id, { kg: Number(o.entradaKg) || 0, rateado: false, etapa: o.etapa || '', recebidoEm: o.criadoEm || '', cats: [] });
    }
    if (ctx.db) {
      try {
        const cg = ((await ctx.db.prepare("SELECT id, peso_liquido, os_json FROM op_cargas WHERE COALESCE(status,'') <> 'cancelada'").all()) || {}).results || [];
        let lt = []; try { lt = ((await ctx.db.prepare('SELECT carga_id, categoria, SUM(peso) AS kg FROM op_lotes GROUP BY carga_id, categoria').all()) || {}).results || []; } catch { lt = []; }
        const cats = new Map(); for (const l of lt) { const a = cats.get(l.carga_id) || []; a.push({ categoria: limpar(l.categoria), kg: Number(l.kg) || 0 }); cats.set(l.carga_id, a); }
        for (const c of cg) {
          let lista = []; try { lista = JSON.parse(c.os_json || '[]'); } catch { lista = []; }
          if (!Array.isArray(lista)) lista = []; // uma carga com dado estranho não derruba o peso das outras
          const n = lista.length || 1;
          for (const o of lista) {
            const id = String((o && o.id) || ''); if (!id) continue;
            const cur = porOS.get(id) || { kg: 0, rateado: false, etapa: '', recebidoEm: '', cats: [] };
            if (!(cur.kg > 0) && Number(c.peso_liquido) > 0) cur.kg = r2(Number(c.peso_liquido) / n);
            if (n > 1) cur.rateado = true;
            cur.cats = (cats.get(c.id) || []).map((x) => ({ categoria: x.categoria, kg: r2(x.kg / n) }));
            porOS.set(id, cur);
          }
        }
      } catch { /* sem cargas registradas */ }
    }
    return porOS;
  });
  // Materiais (texto normalizado) de cada OS: do índice; OS antigas ainda sem o campo
  // são lidas direto (até um teto) — o agendamento diário completa o índice.
  // A placa das OS antigas sai da mesma leitura (o índice só a tem depois de completado).
  ctx.placasLidas = new Map();
  ctx.mats = () => uma('mats', async () => {
    const oss = await ctx.oss();
    const mapa = new Map();
    const falta = [];
    for (const o of oss) { if (o.mat !== undefined) mapa.set(o.id, String(o.mat || '')); else falta.push(o.id); }
    if (falta.length) {
      const TETO = 600;
      const ler = falta.slice(0, TETO);
      const regs = await ctx.lerVarios(ler.map((id) => `os:${id}`));
      let semLeitura = falta.length - ler.length;
      for (const id of ler) {
        if (!regs.has(`os:${id}`)) { semLeitura++; continue; }
        try { const raw = regs.get(`os:${id}`); const rec = raw ? JSON.parse(raw) : null; mapa.set(id, rec ? materialIndiceOS(rec) : ''); const pl = placaDoRegistro(rec); if (pl) ctx.placasLidas.set(id, pl); } catch { mapa.set(id, ''); }
      }
      if (semLeitura > 0) ctx.aviso(`Materiais: ${semLeitura} OS antigas ainda não estão no índice (o agendamento diário completa) — buscas por material podem sair incompletas até lá.`);
    }
    return mapa;
  });
  ctx.placa = (o) => String(o.placa || ctx.placasLidas.get(o.id) || '');
  // Bloqueios de contato conhecidos pelo sistema: opt-out do WhatsApp (inclui quem
  // respondeu SAIR) e empresas retiradas das campanhas pela diretoria.
  ctx.bloqueios = () => uma('bloq', async () => {
    const porFone = new Map(), porDoc = new Map();
    if (ctx.db) {
      try {
        const r = await ctx.db.prepare('SELECT tel, motivo, em FROM wa_optout ORDER BY em DESC LIMIT 5000').all();
        for (const x of (r && r.results) || []) { let t = digits(x.tel); if (t.startsWith('55') && t.length >= 12) t = t.slice(2); if (t && !porFone.has(t)) porFone.set(t, x); }
      } catch { /* sem campanhas ainda */ }
      try {
        const r = await ctx.db.prepare('SELECT doc, nome, em FROM wa_excluidos ORDER BY em DESC LIMIT 5000').all();
        for (const x of (r && r.results) || []) { const d = digits(x.doc); if (d && !porDoc.has(d)) porDoc.set(d, x); }
      } catch { /* sem exclusões */ }
    }
    return { porFone, porDoc };
  });
  // Lista "não enviar e-mail" (descadastrados e inválidos: carga do E-goi + os que a
  // equipe marcou). Map e-mail → { motivo, em }. Vazia enquanto a carga não for feita.
  ctx.naoEnviar = () => uma('naoEnviar', async () => {
    const m = new Map();
    if (ctx.db) {
      try { const r = await ctx.db.prepare('SELECT email, motivo, em FROM email_nao_enviar LIMIT 100000').all(); for (const x of (r && r.results) || []) if (x.email) m.set(String(x.email).toLowerCase(), x); }
      catch { /* lista ainda não criada */ }
    }
    return m;
  });
  // Estatística de coletas por cliente (chave = CNPJ/CPF, ou p+id sem documento), com a
  // MESMA regra de clientes_pj_por_ultima_coleta: negócios ganhos do Ploomes (data de
  // abertura) + OS concluídas do sistema novo (data agendada; sem ela, a de criação).
  ctx.stats = () => uma('stats', async () => {
    const st = new Map();
    const junta = (k, pri, ult, n, origemUlt) => {
      if (!k || !/^\d{4}-\d{2}-\d{2}$/.test(pri) || !/^\d{4}-\d{2}-\d{2}$/.test(ult)) return;
      const s = st.get(k) || { pri, ult, n: 0, nOS: 0, origemUlt };
      s.n += n; if (pri < s.pri) s.pri = pri; if (ult > s.ult) { s.ult = ult; s.origemUlt = origemUlt; }
      st.set(k, s);
    };
    if (ctx.db) {
      try {
        const r = await ctx.db.prepare(
          `SELECT d, pid, MIN(cri) AS pri, MAX(cri) AS ult, COUNT(*) AS n FROM (
             SELECT REPLACE(REPLACE(REPLACE(COALESCE(e.documento,''),'.',''),'/',''),'-','') AS d, e.ploomes_id AS pid, substr(g.criado_em,1,10) AS cri
               FROM negocios g
               JOIN contatos c ON c.ploomes_id = g.contact_id
               JOIN contatos e ON e.ploomes_id = COALESCE(NULLIF(c.company_id, 0), c.ploomes_id)
              WHERE g.status_id = 2) GROUP BY d, pid`
        ).all();
        for (const x of (r && r.results) || []) junta(chaveCliente(x.d, x.pid), String(x.pri || ''), String(x.ult || ''), Number(x.n) || 0, 'histórico Ploomes');
      } catch { ctx.aviso('Histórico do Ploomes indisponível agora — datas de coleta só do sistema novo.'); }
    }
    for (const o of await ctx.oss()) {
      if (o.status !== 'concluida') continue;
      const d = digits(o.clienteDoc); if (d.length !== 11 && d.length !== 14) continue;
      const dia = String(o.dataAgendada || o.criadoEm || '').slice(0, 10);
      junta(d, dia, dia, 1, o.numero || 'OS');
      const s = st.get(d); if (s) s.nOS++;
    }
    return st;
  });
  return ctx;
}

// Data em que a OS foi concluída/cancelada. Registro exato desde 18/11/2026; antes
// disso a conclusão vem do app do motorista (quando ainda guardado) ou é ESTIMADA pela
// data agendada; o cancelamento antigo é estimado pela última atualização da OS.
function dataConclusao(o, pesos) {
  if (o.status !== 'concluida') return { dia: '', estimada: false };
  if (o.concluidaEm) return { dia: diaBR(o.concluidaEm), estimada: false };
  const p = pesos && pesos.get(o.id);
  return { dia: o.dataAgendada || diaBR(p && p.recebidoEm) || diaBR(o.criadoEm), estimada: true };
}

// Vínculo pedido (lead) → OS.
//   EXATO: a OS nasceu do pedido — o pedido guarda osId (a OS atual; se uma OS foi
//   cancelada e outra gerada, vale a nova) e a OS guarda leadId. Só pedidos da medição
//   (desde 18/11/2026 01:11, ver atendimento.js).
//   PROVÁVEL: só para o HISTÓRICO ANTIGO (pedidos de antes da medição): a 1ª OS do
//   mesmo cliente (documento ou e-mail) criada em até 30 dias depois do pedido, entre
//   as OS que não têm pedido exato.
// `tipo` (id do lead → 'exato' | 'provavel') diz qual dos dois.
async function vinculosLeadOS(ctx) {
  return ctx.vinculos ? ctx.vinculos : (ctx.vinculos = await calcularVinculos(ctx));
}
async function calcularVinculos(ctx) {
  const oss = await ctx.oss();
  const leads = (await ctx.leads()).filter((l) => l.criadoEm);
  const osPorLead = new Map(), leadPorOS = new Map(), tipo = new Map();
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  const osPorId = new Map(oss.map((o) => [o.id, o]));
  const liga = (l, o, t) => { osPorLead.set(l.id, o); leadPorOS.set(o.id, l); tipo.set(l.id, t); };
  for (const l of leads) { const o = l.osId ? osPorId.get(l.osId) : null; if (o && !osPorLead.has(l.id) && !leadPorOS.has(o.id)) liga(l, o, 'exato'); }
  for (const o of oss) { const l = o.leadId ? leadPorId.get(o.leadId) : null; if (l && !l.osId && !osPorLead.has(l.id) && !leadPorOS.has(o.id)) liga(l, o, 'exato'); }
  // Provável: só pedidos antigos (de antes da medição) sem vínculo exato, e só OS sem pedido exato.
  const antigos = leads.filter((l) => !osPorLead.has(l.id) && !medido(l));
  if (!antigos.length) return { osPorLead, leadPorOS, tipo };
  const docs = [...new Set((await Promise.all(oss.map((o) => ctx.docDaOS(o)))).filter(Boolean))];
  const emailsPorDoc = new Map();
  if (ctx.db && docs.length) {
    try {
      const rows = await consultaEmFatias(ctx.db, () => `SELECT ${DOC_SQL('c.documento')} AS d, c.ploomes_id AS i, c.email AS m FROM contatos c WHERE ${DOC_SQL('c.documento')} IN (SELECT value FROM json_each(?1))`, docs);
      const pidDoc = new Map();
      for (const r of rows) { const d = digits(r.d); pidDoc.set(r.i, d); const s = emailsPorDoc.get(d) || new Set(); for (const e of separarEmails(r.m)) s.add(e); emailsPorDoc.set(d, s); }
      const pids = [...pidDoc.keys()];
      if (pids.length) {
        const ps = await consultaEmFatias(ctx.db, () => "SELECT p.company_id AS c, p.email AS m FROM contatos p WHERE p.tipo='PF' AND p.company_id IN (SELECT value FROM json_each(?1)) AND COALESCE(p.email,'') LIKE '%@%'", pids);
        for (const p of ps) { const d = pidDoc.get(p.c); if (!d) continue; const s = emailsPorDoc.get(d) || new Set(); for (const e of separarEmails(p.m)) s.add(e); emailsPorDoc.set(d, s); }
      }
    } catch { /* sem e-mails: vincula só por documento */ }
  }
  // OS de cada cliente em ordem de criação; e-mail → clientes (para achar rápido).
  const ossPorDoc = new Map();
  for (const o of oss) {
    const t = Date.parse(o.criadoEm); if (isNaN(t)) continue;
    const d = await ctx.docDaOS(o); if (!d) continue;
    const l = ossPorDoc.get(d) || []; l.push({ o, t }); ossPorDoc.set(d, l);
  }
  for (const l of ossPorDoc.values()) l.sort((x, y) => x.t - y.t);
  const docsPorEmail = new Map();
  for (const [d, emails] of emailsPorDoc) for (const e of emails) { const s = docsPorEmail.get(e) || new Set(); s.add(d); docsPorEmail.set(e, s); }
  for (const l of [...antigos].sort((x, y) => String(x.criadoEm).localeCompare(String(y.criadoEm)))) {
    const t = Date.parse(l.criadoEm); if (isNaN(t)) continue;
    const ld = digits(l.documento), le = String(l.email || '').trim().toLowerCase();
    const docsCand = new Set([...(ld ? [ld] : []), ...(le && docsPorEmail.has(le) ? docsPorEmail.get(le) : [])]);
    let melhor = null;
    for (const d of docsCand) for (const { o, t: to } of ossPorDoc.get(d) || []) {
      if (to < t) continue; if (to > t + 30 * 86400e3) break;
      if (leadPorOS.has(o.id) || o.leadId) continue;
      if (!melhor || to < melhor.t) melhor = { o, t: to };
      break;
    }
    if (melhor) liga(l, melhor.o, 'provavel');
  }
  return { osPorLead, leadPorOS, tipo };
}
const ROTULO_VINCULO = { exato: 'exato (a OS foi gerada a partir deste pedido)', provavel: 'provável (pedido antigo: OS do mesmo cliente até 30 dias depois)' };
const gclidDe = (url) => { const s = String(url || ''); try { return new URL(s).searchParams.get('gclid') || ''; } catch { const m = s.match(/[?&]gclid=([^&#\s]+)/); if (!m) return ''; try { return decodeURIComponent(m[1]); } catch { return m[1]; } } };
const utmDe = (u) => { const o = {}; for (const k of ['source', 'medium', 'campaign', 'content', 'term']) if (u && u[k]) o[k] = textoSeguro(u[k], 120); return Object.keys(o).length ? o : null; };

// --- Saída -------------------------------------------------------------------------------
function camposPedidos(a) {
  if (Array.isArray(a.campos)) return a.campos.map((c) => String(c).trim()).filter(Boolean);
  if (typeof a.campos === 'string' && a.campos.trim()) return a.campos.split(/[\s,;]+/).filter(Boolean);
  return null;
}
// `fixos`: campos que saem SEMPRE, mesmo quando a chamada pede só alguns `campos`
// (ex.: aceita_email e motivo_bloqueio de todo cliente — regra do descadastro).
function saida(ctx, a, { total, pagina, porPagina, itens, filtros, extra, titulo, linha, fixos, rodape }) {
  const paginas = Math.max(1, Math.ceil((Number(total) || 0) / porPagina));
  const pedidos = camposPedidos(a);
  const campos = pedidos ? [...new Set([...pedidos, ...(fixos || [])])] : null;
  const lista = campos ? itens.map((it) => Object.fromEntries(campos.filter((k) => k in it).map((k) => [k, it[k]]))) : itens;
  const filtrosLimpos = Object.fromEntries(Object.entries(filtros || {}).filter(([, v]) => v !== '' && v != null));
  if (ctx.orcamento && ctx.orcamento.esgotado) ctx.aviso('Resposta PARCIAL: esta consulta precisou ler mais registros do que a plataforma permite numa chamada — alguns detalhes podem ter ficado vazios. Reduza o período ou o tamanho da página.');
  const corpo = sanitizar({ total, pagina, paginas, por_pagina: porPagina, itens: lista, ...(extra || {}), filtros: filtrosLimpos, avisos: ctx.avisos });
  if (String(a.formato || '').trim().toLowerCase() !== 'texto') return JSON.stringify(corpo);
  const linhas = [`${titulo}: ${total} resultado(s) — página ${pagina} de ${paginas} (${porPagina} por página)`];
  for (const it of corpo.itens) linhas.push('• ' + (campos ? Object.entries(it).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : (v && typeof v === 'object' ? JSON.stringify(v) : v)}`).join(' — ') : linha(it)));
  if (rodape) { const r = rodape(corpo); if (r) linhas.push(r); }
  if (pagina < paginas) linhas.push(`… peça a página ${pagina + 1} para continuar.`);
  for (const av of corpo.avisos) linhas.push(`⚠️ ${av}`);
  return linhas.join('\n');
}

// ===================================================================================
// A) CLIENTES
// ===================================================================================
async function ferrClientes(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const db = ctx.db;
  if (!db) throw new ErroUso('Base indisponível no momento.');
  const tipo = /^pj$/i.test(String(a.tipo || '').trim()) ? 'PJ' : (/^pf$/i.test(String(a.tipo || '').trim()) ? 'PF' : 'todos');
  const { pagina, porPagina } = paginacao(a, 50);
  const ultDe = dataParam(a.ultima_coleta_de, false), ultAte = dataParam(a.ultima_coleta_ate, true);
  const cadDe = dataParam(a.cadastrado_de, false), cadAte = dataParam(a.cadastrado_ate, true);
  for (const [nome, bruto, ok] of [['ultima_coleta_de', a.ultima_coleta_de, ultDe], ['ultima_coleta_ate', a.ultima_coleta_ate, ultAte], ['cadastrado_de', a.cadastrado_de, cadDe], ['cadastrado_ate', a.cadastrado_ate, cadAte]]) {
    if (bruto != null && String(bruto).trim() && !ok) throw new ErroUso(`"${nome}" precisa estar no formato AAAA-MM-DD (ou AAAA-MM).`);
  }
  const nunca = sim(a.nunca_coletou);
  if (nunca && (ultDe || ultAte)) throw new ErroUso('Use nunca_coletou OU ultima_coleta_de/ate — os dois juntos não retornam ninguém.');
  const cidade = normTxt(a.cidade);
  const uf = String(a.uf || '').trim().toUpperCase().slice(0, 2);
  const cepPref = digits(a.cep_prefixo).slice(0, 8);
  const termos = termosMaterial(a.material);
  const temOsAberta = simNaoNulo(a.tem_os_aberta);
  const aceita = simNaoNulo(a.aceita_email);
  const temEmail = simNaoNulo(a.tem_email);
  const origem = normTxt(a.origem);
  if (origem && !['ploomes', 'sistema', 'site'].includes(origem)) throw new ErroUso('origem aceita: ploomes, sistema ou site.');
  const filtros = { tipo, ultima_coleta_de: ultDe, ultima_coleta_ate: ultAte, nunca_coletou: nunca || '', cadastrado_de: cadDe, cadastrado_ate: cadAte, cidade: a.cidade ? limpar(a.cidade) : '', uf, cep_prefixo: cepPref, material: a.material ? normTxt(a.material) : '', tem_os_aberta: temOsAberta, aceita_email: aceita, tem_email: temEmail, origem };

  const stats = await ctx.stats();
  const oss = await ctx.oss();
  // OS por cliente (chave = documento).
  const ossPorDoc = new Map();
  for (const o of oss) { const d = await ctx.docDaOS(o); if (!d) continue; const l = ossPorDoc.get(d) || []; l.push(o); ossPorDoc.set(d, l); }

  // 1) Conjunto POSITIVO de chaves (quando algum filtro diz exatamente quem entra).
  let positivo = null;
  const restringe = (conj) => { positivo = positivo ? new Set([...positivo].filter((k) => conj.has(k))) : conj; };
  if (ultDe || ultAte) restringe(new Set([...stats.entries()].filter(([, s]) => (!ultDe || s.ult >= ultDe) && (!ultAte || s.ult <= ultAte)).map(([k]) => k)));
  if (termos.length) {
    const mats = await ctx.mats(); const pesos = await ctx.pesos();
    const conj = new Set();
    for (const [d, lista] of ossPorDoc) if (lista.some((o) => osTemMaterial(o, termos, mats, pesos))) conj.add(d);
    restringe(conj);
  }
  if (temOsAberta === true) restringe(new Set([...ossPorDoc].filter(([, l]) => l.some((o) => ABERTAS.has(o.status))).map(([d]) => d)));

  // 2) SQL: linhas do universo de clientes (PJ = empresas; PF = pessoas que SÃO
  //    clientes — contatos de empresa ficam dentro da empresa).
  const where = [COND_TIPO[tipo]]; const binds = [];
  const p = (v) => { binds.push(v); return `?${binds.length + 1}`; }; // ?1 = lista do json_each
  if (uf) where.push(`UPPER(TRIM(COALESCE(c.uf,''))) = ${p(uf)}`);
  if (cidade) where.push(`${sqlSemAcento('c.cidade')} = ${p(cidade)}`);
  if (cadDe) where.push(`${SQL_DIA_BR('c.criado_em')} >= ${p(cadDe)}`);
  if (cadAte) where.push(`${SQL_DIA_BR('c.criado_em')} <= ${p(cadAte)}`);
  if (origem === 'ploomes') where.push('c.ploomes_id < 900000000');
  if (origem === 'sistema' || origem === 'site') where.push('c.ploomes_id >= 900000000');
  if (temEmail != null) where.push(`${temEmail ? '' : 'NOT '}(COALESCE(c.email,'') LIKE '%@%' OR EXISTS (SELECT 1 FROM contatos q WHERE q.company_id = c.ploomes_id AND q.tipo='PF' AND COALESCE(q.email,'') LIKE '%@%'))`);
  const precisaFone = aceita != null;
  const cols = `c.ploomes_id AS i, c.documento AS d, c.tipo AS t, TRIM(COALESCE(NULLIF(c.nome,''), c.nome_fantasia, '')) AS n${cepPref ? ", c.endereco AS e, c.cidade AS ci, c.uf AS u, CASE WHEN json_valid(c.dados_json) THEN json_extract(c.dados_json,'$.ZipCode') END AS z" : ''}${origem === 'site' || origem === 'sistema' || precisaFone ? ', c.email AS m' : ''}${precisaFone ? ', c.telefone AS f' : ''}`;
  let linhas;
  if (positivo) {
    const docs = [...positivo].filter((k) => !k.startsWith('p'));
    const pids = [...positivo].filter((k) => k.startsWith('p')).map((k) => Number(k.slice(1)));
    linhas = [];
    if (docs.length) linhas.push(...await consultaEmFatias(db, () => `SELECT ${cols} FROM contatos c WHERE ${where.join(' AND ')} AND ${DOC_SQL('c.documento')} IN (SELECT value FROM json_each(?1))`, docs, binds));
    if (pids.length) linhas.push(...await consultaEmFatias(db, () => `SELECT ${cols} FROM contatos c WHERE ${where.join(' AND ')} AND c.ploomes_id IN (SELECT value FROM json_each(?1))`, pids, binds));
  } else {
    const r = await db.prepare(`SELECT ${cols} FROM contatos c WHERE ?1 IS NULL AND ${where.join(' AND ')}`).bind(null, ...binds).all();
    linhas = (r && r.results) || [];
  }
  // 3) Agrupa por cliente (mesmo CNPJ/CPF em mais de uma linha = um cliente só). O tipo
  //    sai do documento quando há (CNPJ = PJ, CPF = PF); sem documento, do cadastro.
  const grupos = new Map();
  const agrupa = (r) => {
    const k = chaveCliente(r.d, r.i);
    const g = grupos.get(k) || { k, tipo: tipoDaChave(k, r.t), pids: [], nome: '', linhas: [], emails: [], fonesTexto: [] };
    if (g.pids.includes(r.i)) return;
    g.pids.push(r.i);
    if (!g.nome && r.n) g.nome = limpar(r.n);
    if (cepPref) g.linhas.push({ endereco: r.e, cidade: r.ci, uf: r.u, pl_cep: r.z });
    if (r.m) g.emails.push(...separarEmails(r.m));
    if (r.f) g.fonesTexto.push(r.f);
    grupos.set(k, g);
  };
  for (const r of linhas) agrupa(r);
  // Documento com coleta que ficou fora do universo acima — CPF cadastrado como contato
  // de uma empresa (a OS saiu em nome da pessoa), documento salvo no tipo errado, ou
  // ficha do sistema novo que não espelhou na base: entra pelas linhas que existirem e,
  // sem nenhuma, como "sem cadastro na base". Só quando nenhum filtro depende do
  // cadastro — mesma contagem da função clientes_pj_por_ultima_coleta.
  const filtroDeCadastro = !!(uf || cidade || cadDe || cadAte || origem || temEmail != null || cepPref || precisaFone);
  if (positivo && !filtroDeCadastro) {
    const faltam = [...positivo].filter((k) => !grupos.has(k) && !k.startsWith('p') && (tipo === 'todos' || tipo === tipoDaChave(k)));
    if (faltam.length) {
      for (const r of await consultaEmFatias(db, () => `SELECT ${cols} FROM contatos c WHERE ${DOC_SQL('c.documento')} IN (SELECT value FROM json_each(?1))`, faltam)) agrupa(r);
      for (const k of faltam) {
        if (grupos.has(k)) continue;
        const os1 = (ossPorDoc.get(k) || [])[0];
        grupos.set(k, { k, tipo: tipoDaChave(k), pids: [], nome: limpar(os1 && os1.clienteNome) || '(cliente sem cadastro na base)', linhas: [], emails: [], fonesTexto: [], semCadastro: true });
      }
    }
  }
  let lista = [...grupos.values()];
  if (tipo !== 'todos') lista = lista.filter((g) => g.tipo === tipo);
  // 4) Filtros que dependem de dados fora do SQL.
  if (nunca) lista = lista.filter((g) => !stats.has(g.k));
  if (temOsAberta === false) lista = lista.filter((g) => !(ossPorDoc.get(g.k) || []).some((o) => ABERTAS.has(o.status)));
  // Fichas do sistema novo dos candidatos (endereço e contatos editados pela equipe):
  // os filtros de CEP e de descadastro usam a MESMA regra do item que sai na lista.
  let fichaDe = () => null;
  if (cepPref || aceita != null) {
    const idPorDoc = await ctx.fichaIdPorDoc();
    const ids = [...new Set(lista.map((g) => idPorDoc.get(g.k)).filter(Boolean))];
    const TETO_FICHAS = 3000;
    if (ids.length > TETO_FICHAS) ctx.aviso(`Filtro de CEP/descadastro: ${ids.length} candidatos têm ficha no sistema novo e foram conferidas ${TETO_FICHAS}; nos demais valeram só os dados da base — confira o aceita_email de cada item (ele considera tudo). Combine com outro filtro para conferência completa.`);
    const lidos = await ctx.lerVarios(ids.slice(0, TETO_FICHAS).map((id) => `cli:${id}`));
    const fichas = new Map();
    for (const id of ids.slice(0, TETO_FICHAS)) { try { const raw = lidos.get(`cli:${id}`); if (raw) fichas.set(id, JSON.parse(raw)); } catch { /* ficha ilegível: fica a base */ } }
    fichaDe = (g) => { const id = idPorDoc.get(g.k); return (id && fichas.get(id)) || null; };
  }
  if (cepPref) lista = lista.filter((g) => enderecoCliente(fichaDe(g), g.linhas).cep.startsWith(cepPref));
  if (origem === 'site' || origem === 'sistema') {
    const leads = await ctx.leads();
    const lDocs = new Set(leads.map((l) => digits(l.documento)).filter(Boolean));
    const lEmails = new Set(leads.map((l) => String(l.email || '').trim().toLowerCase()).filter(Boolean));
    const veioDoSite = (g) => lDocs.has(g.k) || g.emails.some((e) => lEmails.has(e));
    lista = lista.filter((g) => (origem === 'site' ? veioDoSite(g) : !veioDoSite(g)));
  }
  if (aceita != null) {
    const bl = await ctx.bloqueios();
    // Telefones das pessoas vinculadas às empresas candidatas.
    const pjPids = lista.filter((g) => g.tipo === 'PJ').flatMap((g) => g.pids);
    const fonesPessoas = new Map(), emailsPessoas = new Map();
    if (pjPids.length) {
      const ps = await consultaEmFatias(db, () => "SELECT p.company_id AS c, p.telefone AS f, p.email AS m FROM contatos p WHERE p.tipo='PF' AND p.company_id IN (SELECT value FROM json_each(?1)) AND (COALESCE(p.telefone,'') <> '' OR COALESCE(p.email,'') LIKE '%@%')", pjPids);
      for (const x of ps) {
        if (x.f) { const l = fonesPessoas.get(x.c) || []; l.push(x.f); fonesPessoas.set(x.c, l); }
        if (x.m) { const l = emailsPessoas.get(x.c) || []; l.push(x.m); emailsPessoas.set(x.c, l); }
      }
    }
    // Lista "não enviar e-mail": cliente com e-mail em que TODOS estão na lista não aceita e-mail.
    const ne = await ctx.naoEnviar();
    const semEmailLivre = (g) => {
      if (!ne.size) return false;
      const f = fichaDe(g);
      const es = separarEmails(f && f.email, (f && Array.isArray(f.contatos) ? f.contatos : []).filter((c) => c && (c.nome || c.email || c.fone)).map((c) => c.email), g.emails, g.pids.flatMap((pid) => emailsPessoas.get(pid) || []));
      return es.length > 0 && es.every((e) => ne.has(e));
    };
    const bloqueado = (g) => motivoDeBloqueio(bl, g.k, [...fonesDaFicha(fichaDe(g)), ...g.fonesTexto, ...g.pids.flatMap((pid) => fonesPessoas.get(pid) || [])]) != null || semEmailLivre(g);
    lista = lista.filter((g) => (aceita ? !bloqueado(g) : bloqueado(g)));
    ctx.aviso('aceita_email: o filtro usa a mesma regra do campo de cada cliente — documento, telefones e e-mails da base, das pessoas da empresa e da ficha do sistema novo.');
  }
  // 5) Ordem: com filtro de última coleta, da mais recente; senão, por nome.
  const porData = !!(ultDe || ultAte);
  for (const g of lista) g.ordem = normTxt(g.nome);
  lista.sort((x, y) => {
    if (porData) { const dx = (stats.get(x.k) || {}).ult || '', dy = (stats.get(y.k) || {}).ult || ''; if (dx !== dy) return dy < dx ? -1 : 1; }
    return (x.ordem < y.ordem ? -1 : (x.ordem > y.ordem ? 1 : 0)) || (x.k < y.k ? -1 : (x.k > y.k ? 1 : 0));
  });
  const total = lista.length;
  const semDoc = lista.filter((g) => g.k.startsWith('p')).length;
  if (semDoc) ctx.aviso(`${semDoc} cliente(s) da lista não têm CNPJ/CPF no cadastro (campo cnpj/cpf vazio)${tipo !== 'PF' ? '; a função clientes_pj_por_ultima_coleta conta só empresas COM CNPJ — é essa a diferença entre as duas (ver "contagem")' : ''}.`);
  const fatia = lista.slice((pagina - 1) * porPagina, pagina * porPagina);
  const itens = await detalharClientes(ctx, fatia, { stats, ossPorDoc, termos });
  if (termos.length) ctx.aviso('material: procura nas OS não canceladas (concluídas e em aberto); "material_encontrado_em" mostra em quais OS o material apareceu.');
  if (tipo !== 'PJ') ctx.aviso('PF = pessoa física que é cliente; contatos de empresas ficam dentro da empresa (por isso o total difere de "pessoas físicas" da visao_geral, que soma os dois).');
  ctx.aviso('Coletas: OS concluídas do sistema novo + negócios ganhos do Ploomes (data de abertura). Peso e materiais só existem para OS do sistema novo.');
  ctx.aviso('aceita_email = "não" vem de: opt-out do WhatsApp, empresa retirada das campanhas ou TODOS os e-mails do cliente na lista "não enviar e-mail" do sistema (descadastrados e inválidos — carga do E-goi e marcações da equipe; vazia até a carga ser feita). E-mail que está nessa lista sai de "emails" e aparece em "emails_nao_enviar". Descadastros feitos no E-goi DEPOIS da carga só entram aqui com nova carga.');
  return saida(ctx, a, {
    total, pagina, porPagina, itens, filtros, titulo: 'Clientes',
    extra: { contagem: { com_cnpj_ou_cpf: total - semDoc, sem_documento: semDoc } },
    fixos: ['aceita_email', 'motivo_bloqueio'],
    rodape: (corpo) => (corpo.contagem ? `Com CNPJ/CPF: ${corpo.contagem.com_cnpj_ou_cpf} · sem documento: ${corpo.contagem.sem_documento}` : ''),
    linha: (c) => [c.nome, c.tipo, c.cnpj || c.cpf, c.cidade && `${c.cidade}/${c.uf}`, (c.emails || [])[0], (c.celulares || [])[0] || (c.telefones || [])[0], c.ultima_coleta && `última coleta ${c.ultima_coleta}`, c.aceita_email === 'não' ? `aceita e-mail: NÃO — não contatar (${c.motivo_bloqueio})` : 'aceita e-mail: sim'].filter(Boolean).join(' — '),
  });
}

// Regras únicas, usadas tanto pelos FILTROS quanto pelo que sai em cada cliente (um
// filtro não pode discordar do campo que aparece na lista).
// Telefones da ficha do sistema novo (o da ficha e os dos contatos com cargo).
const fonesDaFicha = (f) => (f ? [f.fone, f.telefone, ...(Array.isArray(f.contatos) ? f.contatos.map((c) => c && c.fone) : [])] : []);
// Descadastro conhecido pelo sistema: empresa retirada das campanhas, ou algum telefone
// do cliente que pediu para sair do WhatsApp. null = pode contatar.
function motivoDeBloqueio(bl, k, fonesTexto) {
  const exc = bl.porDoc.get(k);
  if (exc) return `empresa retirada das campanhas pela diretoria${exc.em ? ` em ${diaBR(exc.em)}` : ''}`;
  const todos = [...new Set(fonesNacionais(fonesTexto.filter(Boolean).join(' / ')))];
  const hit = todos.map((t) => bl.porFone.get(t)).find(Boolean);
  return hit ? `pediu para sair das mensagens de WhatsApp${hit.em ? ` em ${diaBR(hit.em)}` : ''}${hit.motivo ? ` (${textoSeguro(hit.motivo, 80)})` : ''}` : null;
}
// Endereço que sai para o cliente: o da ficha (quando tem CEP ou cidade); senão a
// primeira linha da base que tiver CEP ou cidade.
function enderecoCliente(f, rows) {
  if (f && f.endereco && (f.endereco.cep || f.endereco.cidade)) return { cep: digits(f.endereco.cep).slice(0, 8), bairro: limpar(f.endereco.bairro), cidade: limpar(f.endereco.cidade), uf: limpar(f.endereco.uf).toUpperCase() };
  for (const r of rows || []) { const e = enderecoDaLinha(r); if (e.cep || e.cidade) return e; }
  return { cep: '', bairro: '', cidade: '', uf: '' };
}

async function detalharClientes(ctx, grupos, { stats, ossPorDoc, termos }) {
  if (!grupos.length) return [];
  const db = ctx.db;
  const pids = grupos.flatMap((g) => g.pids);
  const linhas = pids.length ? await consultaEmFatias(db, () => `SELECT c.ploomes_id, c.tipo, c.nome, c.nome_fantasia, c.documento, c.email, c.telefone, c.cidade, c.uf, c.endereco, c.company_id, c.criado_em,
      CASE WHEN json_valid(c.dados_json) THEN json_extract(c.dados_json,'$.Neighborhood') END AS pl_bairro,
      CASE WHEN json_valid(c.dados_json) THEN json_extract(c.dados_json,'$.ZipCode') END AS pl_cep
    FROM contatos c WHERE c.ploomes_id IN (SELECT value FROM json_each(?1))`, pids) : [];
  const porPid = new Map(linhas.map((r) => [r.ploomes_id, r]));
  const pjPids = grupos.filter((g) => g.tipo === 'PJ').flatMap((g) => g.pids);
  const pessoas = pjPids.length ? await consultaEmFatias(db, () => "SELECT p.company_id AS c, p.nome, p.email, p.telefone, p.documento FROM contatos p WHERE p.tipo='PF' AND p.company_id IN (SELECT value FROM json_each(?1)) ORDER BY p.nome", pjPids) : [];
  const pessoasPorEmpresa = new Map(); for (const x of pessoas) { const l = pessoasPorEmpresa.get(x.c) || []; l.push(x); pessoasPorEmpresa.set(x.c, l); }
  // Fichas do sistema novo (dados editados pela equipe: contatos com cargo, endereço).
  const fichaPorDoc = await ctx.fichaIdPorDoc();
  const fichaIds = [...new Set(grupos.map((g) => fichaPorDoc.get(g.k)).filter(Boolean))];
  const fichasRaw = await ctx.lerVarios(fichaIds.map((id) => `cli:${id}`));
  const ficha = (g) => { const id = fichaPorDoc.get(g.k); if (!id) return null; try { const raw = fichasRaw.get(`cli:${id}`); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  const bl = await ctx.bloqueios();
  const ne = await ctx.naoEnviar();
  const pesos = await ctx.pesos();
  const mats = await ctx.mats();
  const leads = await ctx.leads();
  const lDocs = new Set(leads.map((l) => digits(l.documento)).filter(Boolean));
  const lEmails = new Set(leads.map((l) => String(l.email || '').trim().toLowerCase()).filter(Boolean));
  const base = grupos.map((g) => {
    const rows = g.pids.map((id) => porPid.get(id)).filter(Boolean);
    const f = ficha(g);
    const pes = g.pids.flatMap((id) => pessoasPorEmpresa.get(id) || []);
    const contatosFicha = (f && Array.isArray(f.contatos) ? f.contatos : []).filter((c) => c && (c.nome || c.email || c.fone));
    return { g, rows, f, pes, contatosFicha, end: enderecoCliente(f, rows) };
  });
  const ceps = [...new Set(base.map((b) => b.end.cep).filter((c) => c.length === 8))];
  const geo = await ctx.lerVarios(ceps.map((c) => `geocep:${c}`));
  return base.map(({ g, rows, f, pes, contatosFicha, end }) => {
    const pj = g.tipo === 'PJ';
    const r0 = rows[0] || {};
    const todosEmails = separarEmails(f && f.email, contatosFicha.map((c) => c.email), rows.map((r) => r.email), pes.map((x) => x.email));
    // Os que estão na lista "não enviar e-mail" saem de "emails" (ficam em emails_nao_enviar).
    const emailsFora = ne.size ? todosEmails.filter((e) => ne.has(e)) : [];
    const emails = emailsFora.length ? todosEmails.filter((e) => !ne.has(e)) : todosEmails;
    const docsDoCliente = [g.k, ...rows.map((r) => r.documento), ...pes.map((x) => x.documento)];
    const fones = fonesSemDocs(docsDoCliente, fonesDaFicha(f), rows.map((r) => r.telefone), pes.map((x) => x.telefone));
    let coord = null; try { const raw = geo.get(`geocep:${end.cep}`); const v = raw ? JSON.parse(raw) : null; if (v && Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lon)) && v.lat && v.lon) coord = { lat: Number(v.lat), lon: Number(v.lon) }; } catch { coord = null; }
    const s = stats.get(g.k);
    const lista = ossPorDoc.get(g.k) || [];
    const concluidas = lista.filter((o) => o.status === 'concluida');
    const pesadas = concluidas.filter((o) => ((pesos.get(o.id) || {}).kg || 0) > 0);
    const pesoTotal = r2(pesadas.reduce((t, o) => t + pesos.get(o.id).kg, 0));
    const materiais = [...new Set([...concluidas.flatMap((o) => nomesMateriais(mats.get(o.id))), ...concluidas.flatMap((o) => ((pesos.get(o.id) || {}).cats || []).map((c) => c.categoria))])].filter(Boolean).slice(0, 20);
    const abertas = lista.filter((o) => ABERTAS.has(o.status)).map((o) => ({ numero: o.numero, status: o.status, status_rotulo: rotuloStatus(o), data_agendada: o.dataAgendada || null }));
    const emAberto = lista.filter((o) => o.cobranca && o.cobranca.status !== 'pago' && o.status !== 'cancelada');
    const valorAberto = r2(emAberto.reduce((t, o) => t + (Number(o.cobranca.valor) || 0), 0));
    // Descadastro (o que o sistema conhece): opt-out do WhatsApp e empresa excluída.
    const motivo = motivoDeBloqueio(bl, g.k, [...fonesDaFicha(f), ...rows.map((r) => r.telefone), ...pes.map((x) => x.telefone)])
      || (todosEmails.length && !emails.length ? 'todos os e-mails do cliente estão na lista "não enviar e-mail" (descadastrado ou inválido)' : null);
    const origemFicha = String((f && f.origem) || '');
    const origem = g.pids.some((id) => Number(id) < 900000000) || origemFicha.startsWith('ploomes') ? 'ploomes' : (origemFicha === 'adote' ? 'adote' : (lDocs.has(g.k) || todosEmails.some((e) => lEmails.has(e)) ? 'site' : (g.semCadastro ? 'sem cadastro na base' : 'sistema')));
    const cadastro = rows.map((r) => diaBR(r.criado_em)).filter(Boolean).sort()[0] || diaBR(f && f.criadoEm) || null;
    const contatoPrincipal = pj ? (contatosFicha[0]
      ? { nome: limpar(contatosFicha[0].nome) || null, cargo: limpar(contatosFicha[0].cargo) || null, email: separarEmails(contatosFicha[0].email)[0] || null, telefone: (() => { const x = fonesSemDocs(docsDoCliente, contatosFicha[0].fone); return x.celulares[0] || x.telefones[0] || null; })() }
      : (() => { const x = pes.find((q) => q.email || q.telefone); if (!x) return null; const fx = fonesSemDocs(docsDoCliente, x.telefone); return { nome: limpar(x.nome) || null, cargo: null, email: separarEmails(x.email)[0] || null, telefone: fx.celulares[0] || fx.telefones[0] || null }; })()) : undefined;
    if (contatoPrincipal && contatoPrincipal.email && ne.has(contatoPrincipal.email)) contatoPrincipal.email = null;
    const item = {
      id: idCliente(g.k, g.tipo, g.pids),
      tipo: g.tipo,
      nome: limpar(pj ? ((f && f.razaoSocial) || r0.nome || g.nome) : ((f && f.nome) || r0.nome || g.nome)) || null,
      nome_fantasia: pj ? (limpar((f && f.nomeFantasia) || r0.nome_fantasia) || null) : undefined,
      cnpj: pj ? (!g.k.startsWith('p') && g.k.length === 14 ? fmtCNPJ(g.k) : null) : undefined,
      cpf: !pj ? (mascararCPF(g.k) || null) : undefined,
      emails, emails_nao_enviar: emailsFora.length ? emailsFora : undefined, celulares: fones.celulares, telefones: fones.telefones,
      contato_principal: contatoPrincipal,
      cidade: end.cidade || null, uf: end.uf || null, cep: fmtCep(end.cep) || null, bairro: end.bairro || null,
      latitude: coord ? coord.lat : null, longitude: coord ? coord.lon : null,
      distancia_km_sp: coord ? distanciaSeKm(coord.lat, coord.lon) : null,
      cadastrado_em: cadastro,
      origem,
      primeira_coleta: s ? s.pri : null, ultima_coleta: s ? s.ult : null, total_coletas: s ? s.n : 0,
      peso_total_kg: pesadas.length ? pesoTotal : null,
      materiais,
      material_encontrado_em: termos && termos.length ? lista.filter((o) => osTemMaterial(o, termos, mats, pesos)).map((o) => ({ numero: o.numero, status: rotuloStatus(o) })) : undefined,
      os_aberta: abertas.length ? abertas : null,
      aceita_email: motivo ? 'não' : 'sim', motivo_bloqueio: motivo,
      cobranca: emAberto.length ? { situacao: 'em aberto', valor_em_aberto: valorAberto, cobrancas_em_aberto: emAberto.length } : { situacao: 'em dia', valor_em_aberto: 0 },
    };
    for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
    return item;
  });
}

// ===================================================================================
// B) COLETAS POR PERÍODO
// ===================================================================================
async function ferrColetasPeriodo(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const { de, ate } = periodoObrigatorio(a, 732);
  const campo = { criacao: 'criacao', criada: 'criacao', agendada: 'agendada', agendamento: 'agendada', concluida: 'concluida', conclusao: 'concluida', cancelada: 'cancelada', cancelamento: 'cancelada' }[normTxt(a.campo_data) || 'criacao'];
  if (!campo) throw new ErroUso('campo_data aceita: criacao, agendada, concluida ou cancelada.');
  const status = normTxt(a.status).replace(/\s+/g, '_');
  if (status && !['agendada', 'aguardando_roteiro', 'em_transporte', 'na_unidade', 'concluida', 'cancelada'].includes(status)) throw new ErroUso('status aceita: agendada, aguardando_roteiro, em_transporte, na_unidade, concluida ou cancelada.');
  const tipoCli = /^pj$/i.test(String(a.tipo_cliente || '').trim()) ? 'PJ' : (/^pf$/i.test(String(a.tipo_cliente || '').trim()) ? 'PF' : '');
  const cidade = normTxt(a.cidade), motorista = normTxt(a.motorista), termos = termosMaterial(a.material), origem = normTxt(a.origem);
  const { pagina, porPagina } = paginacao(a, 50);
  const filtros = { de, ate, campo_data: campo, status, tipo_cliente: tipoCli, cidade: a.cidade ? limpar(a.cidade) : '', material: a.material ? normTxt(a.material) : '', motorista: a.motorista ? limpar(a.motorista) : '', origem };

  const oss = await ctx.oss();
  const pesos = await ctx.pesos();
  // Cancelamentos antigos (sem data registrada): estimativa pela última atualização.
  const canceladaEst = new Map();
  if (campo === 'cancelada') {
    const semData = oss.filter((o) => o.status === 'cancelada' && !o.canceladaEm).map((o) => o.id);
    const regs = await ctx.lerVarios(semData.slice(0, 400).map((id) => `os:${id}`));
    for (const id of semData.slice(0, 400)) { try { const raw = regs.get(`os:${id}`); const r = raw ? JSON.parse(raw) : null; canceladaEst.set(id, diaBR(r && (r.atualizadoEm || r.criadoEm))); } catch { /* sem data */ } }
    if (semData.length > 400) ctx.aviso(`${semData.length - 400} cancelamentos antigos (sem data registrada) ficaram fora desta busca por limite de leitura — reduza o período.`);
  }
  const dataRef = (o) => {
    if (campo === 'criacao') return diaBR(o.criadoEm);
    if (campo === 'agendada') return o.dataAgendada || '';
    if (campo === 'concluida') return dataConclusao(o, pesos).dia;
    if (o.status !== 'cancelada') return '';
    return o.canceladaEm ? diaBR(o.canceladaEm) : (canceladaEst.get(o.id) || '');
  };
  let lista = oss.filter((o) => { const d = dataRef(o); return d && d >= de && d <= ate; });
  if (status === 'aguardando_roteiro') lista = lista.filter((o) => o.status === 'agendada' && !o.dataAgendada);
  else if (status) lista = lista.filter((o) => o.status === status);
  if (tipoCli) { const t = []; for (const o of lista) { const d = await ctx.docDaOS(o); if ((tipoCli === 'PJ' && d.length === 14) || (tipoCli === 'PF' && d.length === 11)) t.push(o); } lista = t; }
  if (cidade) lista = lista.filter((o) => normTxt(o.cidade) === cidade);
  if (motorista) lista = lista.filter((o) => normTxt(o.agenteNome).includes(motorista) || normTxt(o.transp).includes(motorista) || (motorista === 'sem motorista' && !o.agenteNome && !o.transp));
  if (termos.length) { const mats = await ctx.mats(); lista = lista.filter((o) => casaTermo(mats.get(o.id) || '', termos) || ((pesos.get(o.id) || {}).cats || []).some((c) => casaTermo(normTxt(c.categoria), termos))); }
  let vinc = null;
  if (origem) {
    vinc = await vinculosLeadOS(ctx);
    lista = lista.filter((o) => { const l = vinc.leadPorOS.get(o.id); return origem === 'sem_pedido' ? !l : (l && normTxt(l.origem).includes(origem)); });
  }
  lista.sort((x, y) => dataRef(x).localeCompare(dataRef(y)) || String(x.numero).localeCompare(String(y.numero)));
  const total = lista.length;
  const fatia = lista.slice((pagina - 1) * porPagina, pagina * porPagina);
  // Diagnóstico do e-mail do pedido de avaliação (só quando pedido em `campos`): por coleta e
  // somado no período inteiro — códigos e contagens, nunca o e-mail.
  const querDiag = (camposPedidos(a) || []).includes('email_avaliacao');
  const diag = querDiag ? await diagnosticoEmails(ctx, lista, { de, ate, campo_data: campo }) : null;
  const itens = await detalharColetas(ctx, fatia, vinc || await vinculosLeadOS(ctx));
  if (diag) fatia.forEach((o, i) => { if (itens[i]) { const dg = diag.porOS.get(o.id); itens[i].email_avaliacao = dg ? { casos: dg.casos, leitura: dg.leitura, saudacao: dg.saudacao, ...(dg.regra_anterior ? { regra_anterior: dg.regra_anterior } : {}) } : null; } });
  if (campo === 'concluida') ctx.aviso('Data de conclusão: registrada exatamente a partir de 18/11/2026; antes disso vem do app do motorista quando guardado, ou é estimada pela data agendada (data_conclusao_estimada = true).');
  if (campo === 'cancelada') ctx.aviso('Data de cancelamento: registrada a partir de 18/11/2026; cancelamentos anteriores usam a última atualização da OS (data_cancelamento_estimada = true).');
  ctx.aviso(`Pedido de origem: desde ${INICIO_MEDICAO_TXT} a OS gerada a partir de um pedido grava o pedido (lead_id; origem_pedido.vinculo = "exato"). Pedidos de antes disso usam o vínculo "provável" (pedido do mesmo cliente até 30 dias antes). Sem pedido ligado, modalidade = "padrão" e origem vazia.`);
  ctx.aviso('data_hora_conclusao = hora do encerramento no app do motorista. Coleta que não passa pelo app (transportadora, ou concluída pelo escritório/doca) fica com a hora em que foi marcada como concluída — pode ser depois da retirada real.');
  ctx.aviso('como_nos_achou = resposta da equipe a "Como nos achou?" (obrigatória na criação da OS a partir da publicação de 19/11/2026; pode ser corrigida na edição). OS criada antes disso fica "não informado" (a não ser que a equipe informe depois, na edição) — nada foi preenchido por adivinhação. como_nos_achou_sugestao_do_pedido = a opção que o canal do pedido do site indicava (vem marcada na tela; a equipe pode trocar). Contagem por dia e por origem: função agendamentos_por_origem.');
  if (diag) ctx.aviso('email_avaliacao = como o pedido de avaliação no Google lê o e-mail da coleta (contato da OS + ficha do cliente), pela regra em vigor (regra_de_leitura). É SÓ a leitura do endereço: não considera status da OS, listas de bloqueio, regra dos 12 meses nem casa/família ("envia" não quer dizer que o pedido vai sair; para as coletas que entram no pedido, use campo_data=concluida). casos: contato_da_os (palavra solta + espaço antes do endereço, no texto livre do contato da OS), campo_de_email_do_cadastro (o mesmo no e-mail da ficha ou de um contato) e espaco_antes_do_arroba (espaço logo antes da arroba, sem nada antes dela). leitura: envia (há destinatário bem formado) | envia_ao_pedaco_depois_do_espaco (o destinatário seria o pedaço depois do espaço — só pela regra de antes de 19/11/2026; pela regra atual não acontece) | envia_a_email_bem_formado (há um dos casos, mas o destinatário é um e-mail que a leitura aceita em algum campo) | email_invalido | sem_email | cadastro_grande | sem_cadastro (a OS aponta para um cadastro que não existe mais: o envio para aí; um erro de leitura isolado do cadastro também aparece assim) | cadastro_nao_lido (esta consulta não chegou a ler o cadastro — limite de leituras; peça um período menor). saudacao: nome ("Oi, Maria!" / "Olá, Carlos.") | ola ("Olá!", sem nome) | null (sem destinatário) — pessoa física só leva o nome quando o e-mail escolhido é o 1º da ficha (desde 19/11/2026, 2ª parte) e a ficha tem nome; ficha sem nome = "Olá!", o nome do contato da OS não é usado (desde 19/11/2026, decisão das 16:24 da Itália). regra_anterior (só nas coletas em que algo muda) = leitura, saudação e destinatário (o_mesmo | outro_endereco | nenhum_agora) pela regra da publicação anterior (366/367: ficha de pessoa física sem nome levava o nome do contato da OS no 1º e-mail da ficha). Peça também "numero" em campos para saber de qual coleta é cada item. resumo_email_avaliacao (só no formato json) soma o período inteiro (coletas e cadastros distintos); palavra_antes_do_endereco conta as ocorrências por tipo da palavra solta (rotulo: e-mail, financeiro…; comeco_do_endereco: a palavra é o começo do próprio endereço; outra); regra_anterior soma a comparação com a regra de antes (as saudações contam só coletas com destinatário; de_nome_para_ola e de_ola_para_nome = coletas que trocam de saudação, inclusive por trocar de destinatário). A coluna regra_anterior repete exatamente a publicação anterior (366/367): leitura e destinatário iguais aos de hoje; só a saudação da ficha de pessoa física sem nome muda; casos usa a detecção de hoje. Só leitura; nenhum e-mail sai na resposta.');
  return saida(ctx, a, {
    total, pagina, porPagina, itens, filtros, titulo: `Coletas (${campo})`, extra: diag ? { resumo_email_avaliacao: diag.resumo } : undefined,
    linha: (o) => [o.numero, o.status_rotulo, o.cliente && `${o.cliente.nome} (${o.cliente.tipo})`, o.cidade, `criada ${o.data_hora_criacao || o.data_criacao}`, o.data_agendada && `agendada ${o.data_agendada}`, o.data_conclusao && `concluída ${o.data_conclusao}${o.data_conclusao_estimada ? ' (estimada)' : ''}`, o.motorista && `🚚 ${o.motorista}`, o.peso_kg != null && `${o.peso_kg} kg`, o.lead_id && `pedido ${o.lead_id}`, o.prazo_alvo && `🏭 prazo ${o.prazo_alvo} — ${o.prazo_situacao}`, o.como_nos_achou && `achou: ${o.como_nos_achou}${o.como_nos_achou_outro ? ` (${o.como_nos_achou_outro})` : ''}`].filter(Boolean).join(' — '),
  });
}

// Diagnóstico do e-mail do pedido de avaliação de todas as coletas da lista (registro completo da
// OS + ficha do cliente — os mesmos dados que o envio usa). Devolve o diagnóstico por OS e o
// resumo do período (contagens; cadastros = fichas distintas).
async function diagnosticoEmails(ctx, lista, periodo) {
  const regs = await ctx.lerVarios(lista.map((o) => `os:${o.id}`));
  const recs = new Map();
  for (const o of lista) { try { const raw = regs.get(`os:${o.id}`); recs.set(o.id, raw ? JSON.parse(raw) : null); } catch { recs.set(o.id, null); } }
  const idF = (rec) => String((rec && rec.clienteId) || '').replace(/[^a-zA-Z0-9_]/g, '');
  const fichaIds = [...new Set(lista.map((o) => idF(recs.get(o.id))).filter(Boolean))];
  const fichas = await ctx.lerVarios(fichaIds.map((id) => `cli:${id}`));
  const vazio = () => ({ coletas: 0, cadastros: new Set(), leitura: {} });
  const grupos = { contato_da_os: vazio(), campo_de_email_do_cadastro: vazio(), espaco_antes_do_arroba: vazio(), algum_caso: vazio(), todas: vazio() };
  const palavras = { rotulo: 0, comeco_do_endereco: 0, outra: 0 };
  // Comparação com a publicação anterior (366/367: ficha de pessoa física sem nome levava o nome do
  // contato da OS).
  const soma = (m, k) => { if (k) m[k] = (m[k] || 0) + 1; };
  const comp = { leitura: {}, saudacao: {}, saudacao_agora: {}, mudou: vazio(), destinatario: {}, de_nome_para_ola: vazio(), de_ola_para_nome: vazio() };
  const porOS = new Map();
  let semRegistro = 0, fichaIlegivel = 0;
  for (const o of lista) {
    const rec = recs.get(o.id);
    if (!rec) { semRegistro++; continue; }
    const fid = idF(rec);
    let cli = null, ilegivel = false;
    if (fid) { try { const raw = fichas.get(`cli:${fid}`); cli = raw ? JSON.parse(raw) : null; } catch { cli = null; fichaIlegivel++; ilegivel = true; } }
    let dg = diagnosticoEmailAvaliacao(rec, cli);
    // A OS aponta para um cadastro que não existe mais (a chave foi lida e veio vazia): o envio de
    // verdade para em "cadastro do cliente não encontrado" (sem_cadastro). Cadastro que esta
    // consulta NÃO chegou a ler (limite de leituras): cadastro_nao_lido. Nos dois casos fica fora
    // da comparação de saudação. (Limite: erro de leitura de uma chave isolada chega como "vazia".)
    const lida = fid ? fichas.has(`cli:${fid}`) : true;
    if (fid && !cli && !ilegivel) dg = { casos: dg.casos, leitura: lida ? 'sem_cadastro' : 'cadastro_nao_lido', saudacao: null, palavras: dg.palavras };
    porOS.set(o.id, dg);
    const conta = (g) => { g.coletas++; if (fid && cli) g.cadastros.add(fid); g.leitura[dg.leitura] = (g.leitura[dg.leitura] || 0) + 1; };
    conta(grupos.todas);
    for (const k of dg.casos) conta(grupos[k]);
    if (dg.casos.length) conta(grupos.algum_caso);
    for (const w of dg.palavras) palavras[w] = (palavras[w] || 0) + 1;
    const ant = dg.regra_anterior;
    soma(comp.leitura, ant ? ant.leitura : dg.leitura);
    soma(comp.saudacao, ant ? ant.saudacao : dg.saudacao);
    soma(comp.saudacao_agora, dg.saudacao);
    if (ant) {
      conta(comp.mudou); soma(comp.destinatario, ant.destinatario);
      if (ant.saudacao === 'nome' && dg.saudacao === 'ola') conta(comp.de_nome_para_ola);
      if (ant.saudacao === 'ola' && dg.saudacao === 'nome') conta(comp.de_ola_para_nome);
    }
  }
  const fecha = (g) => ({ coletas: g.coletas, cadastros: g.cadastros.size, leitura: g.leitura });
  return {
    porOS,
    resumo: {
      regra_de_leitura: REGRA_LEITURA_EMAIL, periodo,
      coletas: grupos.todas.coletas, cadastros: grupos.todas.cadastros.size,
      por_caso: { contato_da_os: fecha(grupos.contato_da_os), campo_de_email_do_cadastro: fecha(grupos.campo_de_email_do_cadastro), espaco_antes_do_arroba: fecha(grupos.espaco_antes_do_arroba) },
      algum_caso: fecha(grupos.algum_caso),
      todas: fecha(grupos.todas),
      palavra_antes_do_endereco: palavras,
      saudacao: comp.saudacao_agora,
      // leitura e saudação de TODAS as coletas pela regra da publicação anterior (366/367);
      // coletas_que_mudam = as que mudam de leitura, de saudação ou de destinatário (leitura dentro
      // dele = a leitura de agora). As saudações só contam coletas COM destinatário (a soma pode
      // ser menor que `coletas`).
      regra_anterior: {
        leitura: comp.leitura, saudacao: comp.saudacao,
        coletas_que_mudam: fecha(comp.mudou), destinatario: comp.destinatario,
        de_nome_para_ola: { coletas: comp.de_nome_para_ola.coletas, cadastros: comp.de_nome_para_ola.cadastros.size },
        de_ola_para_nome: { coletas: comp.de_ola_para_nome.coletas, cadastros: comp.de_ola_para_nome.cadastros.size },
      },
      ...(semRegistro ? { coletas_sem_registro: semRegistro } : {}),
      ...(fichaIlegivel ? { fichas_ilegiveis: fichaIlegivel } : {}),
    },
  };
}

async function detalharColetas(ctx, lista, vinc) {
  if (!lista.length) return [];
  const pesos = await ctx.pesos();
  const regs = await ctx.lerVarios(lista.map((o) => `os:${o.id}`));
  const ops = await ctx.lerVarios(lista.map((o) => `op:${o.id}`));
  const leadIds = lista.map((o) => vinc.leadPorOS.get(o.id)).filter(Boolean).map((l) => `lead:${l.id}`);
  const leadsRaw = await ctx.lerVarios(leadIds);
  // Pedido de avaliação no Google de cada OS concluída (registro próprio; sem dado pessoal).
  const avals = await lerAvaliacoes(ctx.env, lista.filter((o) => o.status === 'concluida').map((o) => o.id));
  // Ids dos clientes (PJ pelo CNPJ; PF pela linha da base — nunca pelo CPF).
  const docs = [...new Set((await Promise.all(lista.map((o) => ctx.docDaOS(o)))).filter(Boolean))];
  const pidPF = new Map();
  const pfDocs = docs.filter((d) => d.length === 11);
  if (ctx.db && pfDocs.length) {
    // Mesmo critério da função clientes: a linha de cliente PF (sem empresa); se o CPF
    // só existir como contato de empresa ou noutro tipo, a menor linha com aquele CPF.
    try { for (const r of await consultaEmFatias(ctx.db, () => `SELECT ${DOC_SQL('c.documento')} AS d, COALESCE(MIN(CASE WHEN c.tipo='PF' AND COALESCE(c.company_id,0)=0 THEN c.ploomes_id END), MIN(c.ploomes_id)) AS i FROM contatos c WHERE ${DOC_SQL('c.documento')} IN (SELECT value FROM json_each(?1)) GROUP BY 1`, pfDocs)) pidPF.set(digits(r.d), r.i); } catch { /* sem id */ }
  }
  const out = [];
  for (const o of lista) {
    let rec = {}; try { const raw = regs.get(`os:${o.id}`); rec = raw ? JSON.parse(raw) : {}; } catch { rec = {}; }
    let op = null; try { const raw = ops.get(`op:${o.id}`); op = raw ? JSON.parse(raw) : null; } catch { op = null; }
    const d = await ctx.docDaOS(o);
    const tipo = d.length === 14 ? 'PJ' : (d.length === 11 ? 'PF' : null);
    const p = pesos.get(o.id) || {};
    const kg = op && op.entrada && Number(op.entrada.pesoKg) > 0 ? Number(op.entrada.pesoKg) : (p.kg > 0 ? p.kg : null);
    const rateado = op && op.entrada && Number(op.entrada.pesoKg) > 0 ? !!(op.entrada.rateado && !op.entrada.ajustadoEm) : !!p.rateado;
    const itensDecl = (Array.isArray(rec.itens) ? rec.itens : []).map((it) => ({ nome: textoSeguro(semCauda(it && it.nome, 140)), quantidade: limpar(it && it.qtd) || '1' })).filter((it) => it.nome);
    const pesados = op && Array.isArray(op.materiais) && op.materiais.length
      ? op.materiais.map((m) => ({ categoria: limpar(String(m.rotulo || '').replace(/\s+·\s+LT-[\w-]+$/, '')), peso_kg: r2(m.qtd) }))
      : (p.cats || []).map((c) => ({ categoria: c.categoria, peso_kg: c.kg }));
    const conc = dataConclusao(o, pesos);
    const lead = vinc.leadPorOS.get(o.id);
    const tipoVinc = lead ? (vinc.tipo.get(lead.id) || 'provavel') : '';
    let leadRec = null; if (lead) { try { const raw = leadsRaw.get(`lead:${lead.id}`); leadRec = raw ? JSON.parse(raw) : null; } catch { leadRec = null; } }
    const prazoAlvo = rec.prazoAlvoEm || o.prazoAlvoEm || '';
    const sitPrazo = prazoAlvo ? situacaoPrazo(prazoAlvo, { status: o.status, concluidaEm: o.concluidaEm || rec.concluidaEm }) : null;
    const etapa = (op && op.etapa) || p.etapa || '';
    const cdf = etapa === 'concluida' && (!op || !op.validacao || op.validacao.decisao === 'validada');
    const notas = Array.isArray(rec.notas) ? rec.notas : [];
    const mtrNum = (rec.mtr && rec.mtr.numero) || o.mtr || '';
    out.push({
      numero: o.numero, status: o.status, status_rotulo: rotuloStatus(o),
      cliente: { id: d.length === 14 ? `PJ-${d}` : (pidPF.has(d) ? `PF-B${pidPF.get(d)}` : null), tipo, nome: limpar(o.clienteNome) || null },
      cidade: limpar(o.cidade) || null, cep: fmtCep(cepDe(rec.endereco)) || null,
      data_criacao: diaBR(o.criadoEm) || null,
      data_hora_criacao: isoBR(o.criadoEm),
      lead_id: (tipoVinc === 'exato' && lead.id) || rec.leadId || o.leadId || null,
      // "Como nos achou?" (obrigatório a partir da publicação de 19/11/2026): OS de antes do campo = "não informado".
      como_nos_achou: rotuloComo(comoValido(rec.comoNosAchou) ? rec.comoNosAchou : o.como),
      como_nos_achou_outro: (rec.comoNosAchou || o.como) === 'outro' ? (textoSeguro(rec.comoNosAchouOutro, 60) || null) : undefined,
      como_nos_achou_sugestao_do_pedido: comoValido(rec.comoNosAchouSugerido) ? rotuloComo(rec.comoNosAchouSugerido) : undefined,
      data_agendada: o.dataAgendada || null,
      data_conclusao: conc.dia || null, data_conclusao_estimada: conc.dia ? conc.estimada : undefined,
      data_hora_conclusao: o.status === 'concluida' ? isoBR(o.concluidaEm || rec.concluidaEm) : undefined,
      lote_grande: prazoAlvo ? true : undefined,
      prazo_alvo: prazoAlvo ? isoBR(prazoAlvo) : undefined,
      prazo_cumprido: sitPrazo ? sitPrazo.cumpriu : undefined,
      prazo_situacao: sitPrazo ? sitPrazo.texto : undefined,
      ...camposAvaliacao(avals.get(o.id), o.concluidaEm || rec.concluidaEm),
      data_cancelamento: o.status === 'cancelada' ? (diaBR(o.canceladaEm || rec.canceladaEm) || diaBR(rec.atualizadoEm) || null) : null,
      data_cancelamento_estimada: o.status === 'cancelada' ? !(o.canceladaEm || rec.canceladaEm) : undefined,
      motivo_cancelamento: o.status === 'cancelada' ? (textoSeguro(semCauda(rec.motivoCancelamento, 300)) || null) : undefined,
      motorista: limpar(o.agenteNome) || (o.transp ? `Transportadora: ${limpar(o.transp)}` : null),
      veiculo: placaDoRegistro(rec) || ctx.placa(o) || null,
      materiais: itensDecl,
      material_descricao: textoSeguro(semCauda(rec.material, 500)) || null,
      quantidade_estimada: textoSeguro(semCauda(rec.quantidade, 100)) || null,
      materiais_pesados: pesados,
      peso_kg: kg != null ? r2(kg) : null, peso_rateado: kg != null ? rateado : undefined,
      modalidade: leadRec && leadRec.expressa ? 'expressa' : 'padrão',
      valor_cobrado: o.cobranca ? r2(o.cobranca.valor) : null,
      pagamento: o.cobranca ? (o.cobranca.status === 'pago' ? 'pago' : 'em aberto') : null,
      origem_pedido: lead ? { lead_id: lead.id, canal: limpar(lead.origem) || 'site', utm: utmDe(leadRec && leadRec.utm), gclid: gclidDe(leadRec && leadRec.pagina) || null, data_pedido: diaBR(lead.criadoEm), data_hora_pedido: isoBR(lead.criadoEm), vinculo: tipoVinc === 'exato' ? 'exato' : 'provável', vinculo_explicacao: ROTULO_VINCULO[tipoVinc] || ROTULO_VINCULO.provavel } : null,
      documentos: {
        cdf: { emitido: !!cdf, numero: cdf ? 'CDF-' + digits(o.numero) : null },
        nf: { emitida: notas.length > 0, numeros: notas.map((n) => String(n.numero || '')).filter(Boolean) },
        mtr: { emitida: !!mtrNum, numero: mtrNum || null },
      },
    });
    const it = out[out.length - 1]; for (const k of Object.keys(it)) if (it[k] === undefined) delete it[k];
  }
  return out;
}

// ===================================================================================
// C) LEADS
// ===================================================================================
const STATUS_LEAD = { novo: 'novo', 'aguardando-pagamento': 'novo', contatado: 'contatado', tratado: 'contatado', sem_retorno: 'perdido' };
// Lote grande de um pedido — a MESMA regra em leads e tempos_atendimento: marcado no próprio
// pedido (desde 18/11/2026 01:11, com prazo de 72h) ou, pedido anterior a isso, classificado
// AGORA pela mesma regra (empresa com 51+ itens ou desmobilização): "classificado depois", sem
// prazo. `r` = registro completo do pedido (sem ele, só vale a marca do índice).
function loteDoPedido(l, r, env) {
  if ((l && l.loteGrande) || (r && r.loteGrande)) return { lote: true, depois: false, motivo: (r && r.loteGrandeMotivo) || '' };
  if (r && !medido({ ...(l || {}), ...r })) { const a = avaliarLoteGrande(r, env); if (a.loteGrande) return { lote: true, depois: true, motivo: a.motivo }; }
  return { lote: false, depois: false, motivo: '' };
}
// 1º contato dos pedidos ANTERIORES ao corte (18/11/2026 01:11), pelo histórico do pedido (D1):
// a 1ª ação de alguém da equipe depois do corte, com o pedido ainda sem contato (decisão do
// Marcio, 19/11/2026). Map id → { em, por }. Tabela ainda inexistente → vazio, sem aviso (de
// propósito: nada foi registrado ainda); outra falha de leitura → vazio, com aviso.
async function primeirosContatosAntigos(ctx, ids) {
  const out = new Map();
  const lista = [...new Set((ids || []).filter(Boolean).map(String))];
  if (!ctx.db || !lista.length) return out;
  try {
    const rows = await consultaEmFatias(ctx.db, () => 'SELECT lead_id AS l, status_anterior AS de, status_novo AS para, em, por, evento FROM lead_historico WHERE lead_id IN (SELECT value FROM json_each(?1))', lista);
    const porLead = new Map(); for (const r of rows) { const a = porLead.get(r.l) || []; a.push(r); porLead.set(r.l, a); }
    for (const [id, linhas] of porLead) { const pc = primeiroContatoDoHistorico(linhas); if (pc) out.set(id, pc); }
  } catch (e) { if (!/no such table/i.test(String((e && e.message) || e))) ctx.aviso(`Histórico dos pedidos indisponível agora: o 1º contato dos pedidos anteriores a ${INICIO_MEDICAO_TXT} saiu vazio.`); }
  return out;
}
// Prioridade do pedido: lote grande (empresa 51+ itens ou desmobilização — prazo de 72h,
// marcado desde 18/11/2026) > prioritária (triagem: volume/valor alto) > normal.
const prioridadeDoLead = (l) => (l.loteGrande ? 'lote_grande' : (l.prioridade === 'alta' ? 'prioritaria' : 'normal'));
// Prazo de 72h do lote grande, visto pelo PEDIDO: com OS ligada (exata), vale a OS; sem
// OS, pedido encerrado (sem retorno / tratado sem coleta ligada) não conta como atraso.
function prazoDoPedido(l, os, tipoVinc, alvo, agoraMs) {
  if (!alvo) return null;
  if (os && tipoVinc === 'exato') return situacaoPrazo(alvo, { status: os.status, concluidaEm: os.concluidaEm }, agoraMs);
  if (l.status === 'sem_retorno') return { situacao: 'sem_retorno', cumpriu: null, texto: 'pedido encerrado sem coleta (cliente sem retorno)' };
  if (l.status === 'tratado') return { situacao: 'tratado_sem_os', cumpriu: null, texto: 'tratado sem coleta ligada a este pedido' };
  return situacaoPrazo(alvo, {}, agoraMs);
}
async function ferrLeads(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const de = dataParam(a.de, false), ate = dataParam(a.ate, true);
  if ((a.de && !de) || (a.ate && !ate)) throw new ErroUso('"de" e "ate" no formato AAAA-MM-DD (ou AAAA-MM).');
  const status = normTxt(a.status).replace(/\s+/g, '_');
  const statusOk = { novo: 'novo', contatado: 'contatado', virou_os: 'virou OS', perdido: 'perdido' };
  if (status && !statusOk[status]) throw new ErroUso('status aceita: novo, contatado, virou_os ou perdido.');
  const perfil = /^pj$/i.test(String(a.perfil || '').trim()) ? 'PJ' : (/^pf$/i.test(String(a.perfil || '').trim()) ? 'PF' : '');
  const origem = normTxt(a.origem);
  const prioridade = normTxt(a.prioridade).replace(/\s+/g, '_').replace('prioritária', 'prioritaria');
  if (prioridade && !['lote_grande', 'prioritaria', 'normal'].includes(prioridade)) throw new ErroUso('prioridade aceita: lote_grande, prioritaria ou normal.');
  const { pagina, porPagina } = paginacao(a, 50);
  const filtros = { de, ate, status, perfil, origem, prioridade };
  const vinc = await vinculosLeadOS(ctx);
  const statusDe = (l) => (vinc.osPorLead.has(l.id) ? 'virou OS' : (STATUS_LEAD[l.status] || 'novo'));
  let lista = (await ctx.leads()).filter((l) => { const d = diaBR(l.criadoEm); return (!de || d >= de) && (!ate || d <= ate); });
  if (status) lista = lista.filter((l) => statusDe(l) === statusOk[status]);
  if (origem) lista = lista.filter((l) => normTxt(l.origem).includes(origem));
  if (prioridade) {
    // Lote grande pela MESMA regra de tempos_atendimento: pedido anterior a 18/11/2026 01:11 sem a
    // marca é lido e classificado agora ("classificado depois").
    // Acima do limite por consulta, recusa (em vez de classificar uma parte só pelo índice e sair
    // diferente de tempos_atendimento). Os pedidos antigos são um conjunto fechado (162 em 19/11/2026).
    const LIMP = 1500;
    const semMarca = lista.filter((l) => !l.loteGrande && !medido(l));
    if (semMarca.length > LIMP) throw new ErroUso(`Prioridade: ${semMarca.length} pedidos antigos sem marca no período, acima de ${LIMP} por consulta. Use um período menor (de / ate).`);
    const regsP = await ctx.lerVarios(semMarca.map((l) => `lead:${l.id}`));
    const recP = new Map(); for (const l of semMarca) { try { const raw = regsP.get(`lead:${l.id}`); if (raw) recP.set(l.id, JSON.parse(raw)); } catch { /* registro ilegível: vale o índice */ } }
    const prioDe = (l) => (loteDoPedido(l, recP.get(l.id) || null, env).lote ? 'lote_grande' : (l.prioridade === 'alta' ? 'prioritaria' : 'normal'));
    lista = lista.filter((l) => prioDe(l) === prioridade);
  }
  // Perfil: o DOCUMENTO manda (CNPJ = PJ, CPF = PF) — o formulário do portal marca
  // "empresa" até para pessoa física; sem documento, o perfil gravado no índice (desde
  // 18/11) ou no próprio lead.
  const perfilDoc = (d) => { const n = digits(d).length; return n === 14 ? 'PJ' : (n === 11 ? 'PF' : ''); };
  const perfilIdx = (l) => perfilDoc(l.documento) || (l.perfil === 'PJ' || l.perfil === 'PF' ? l.perfil : '');
  const perfilDoRec = (r) => (r ? (perfilDoc(r.documento) || (r.perfil === 'empresa' ? 'PJ' : (r.perfil === 'pessoa_fisica' ? 'PF' : ''))) : '');
  if (perfil) {
    const indef = lista.filter((l) => !perfilIdx(l));
    const LIM = 600;
    const regs = await ctx.lerVarios(indef.slice(0, LIM).map((l) => `lead:${l.id}`));
    const doRec = new Map(); for (const l of indef.slice(0, LIM)) { try { const raw = regs.get(`lead:${l.id}`); doRec.set(l.id, perfilDoRec(raw ? JSON.parse(raw) : null) || (l.empresa ? 'PJ' : 'PF')); } catch { doRec.set(l.id, l.empresa ? 'PJ' : 'PF'); } }
    if (indef.length > LIM) ctx.aviso(`Perfil de ${indef.length - LIM} leads antigos deduzido pelo nome da empresa (reduza o período para precisão total).`);
    lista = lista.filter((l) => (perfilIdx(l) || doRec.get(l.id) || (l.empresa ? 'PJ' : 'PF')) === perfil);
  }
  lista.sort((x, y) => String(y.criadoEm).localeCompare(String(x.criadoEm)));
  const total = lista.length;
  const fatia = lista.slice((pagina - 1) * porPagina, pagina * porPagina);
  const regs = await ctx.lerVarios(fatia.map((l) => `lead:${l.id}`));
  const pcAntigos = await primeirosContatosAntigos(ctx, fatia.filter((l) => !medido(l)).map((l) => l.id));
  const itens = fatia.map((l) => {
    let r = {}; try { const raw = regs.get(`lead:${l.id}`); r = raw ? JSON.parse(raw) : {}; } catch { r = {}; }
    const doc = digits(r.documento || l.documento);
    const fones = fonesSemDocs([r.documento, l.documento], r.fone);
    const os = vinc.osPorLead.get(l.id);
    const tipoVinc = os ? (vinc.tipo.get(l.id) || 'provavel') : '';
    const pf = perfilDoc(r.documento) || perfilIdx(l) || perfilDoRec(r) || (l.empresa ? 'PJ' : 'PF');
    // 1º contato: o gravado no pedido; pedido ANTERIOR ao corte, o do histórico (1ª ação da equipe
    // depois do corte, com o pedido ainda sem contato) — nunca um valor sem essa confirmação.
    const novoPedido = medido({ ...l, ...r });
    const pcHist = novoPedido ? null : (pcAntigos.get(l.id) || null);
    const pcEm = novoPedido ? (r.primeiroContatoEm || l.primeiroContatoEm || '') : (pcHist ? pcHist.em : '');
    const pcPor = novoPedido ? limpar(r.primeiroContatoPor) : (pcHist ? pcHist.por : '');
    const lg = loteDoPedido(l, r, env);
    const minPC = pcEm ? minutosEntre(l.criadoEm, pcEm) : null;
    const prazoAlvo = r.prazoAlvoEm || l.prazoAlvoEm || '';
    const sitPrazo = prazoDoPedido({ ...l, status: r.status || l.status }, os, tipoVinc, prazoAlvo);
    const hBruto = os && tipoVinc === 'exato' && os.status === 'concluida' && os.concluidaEm ? horasEntre(l.criadoEm, os.concluidaEm) : null;
    const hColeta = hBruto != null ? Math.round(hBruto * 10) / 10 : null;
    const osVinc = os ? { numero: os.numero, status: os.status, vinculo: tipoVinc === 'exato' ? 'exato' : 'provável', vinculo_explicacao: ROTULO_VINCULO[tipoVinc] || ROTULO_VINCULO.provavel, data_hora_criacao: isoBR(os.criadoEm), data_hora_conclusao: os.status === 'concluida' ? isoBR(os.concluidaEm) : null } : null;
    const item = {
      id: l.id, data: diaBR(l.criadoEm), data_hora: isoBR(l.criadoEm), perfil: pf,
      nome: limpar(r.nome || l.nome) || null, empresa: limpar(r.empresa || l.empresa) || null,
      documento: doc.length === 14 ? fmtCNPJ(doc) : (doc.length === 11 ? mascararCPF(doc) : null),
      email: separarEmails(r.email || l.email)[0] || null,
      celular: fones.celulares[0] || fones.telefones[0] || null,
      cidade: limpar(r.cidade || l.cidade) || null, uf: limpar(r.uf).toUpperCase() || null, cep: fmtCep(digits(r.cep).slice(0, 8)) || null,
      material: textoSeguro(r.material, 300) || null, volume: textoSeguro(r.volume, 200) || null,
      mensagem: textoSeguro(r.descricao, 1500, true) || null,
      triagem: (r.triagem && r.triagem.tipo) || l.triagem || null,
      modalidade: r.expressa ? 'expressa' : 'padrão',
      consentimento_marketing: r.consentimentoMkt === true ? 'sim' : 'não informado',
      origem: limpar(r.origem || l.origem) || null, utm: utmDe(r.utm), gclid: gclidDe(r.pagina) || null,
      status: statusDe(l), status_sistema: l.status || 'novo',
      prioridade: lg.lote ? 'lote_grande' : prioridadeDoLead({ ...l, loteGrande: false }),
      lote_grande_motivo: lg.lote ? (textoSeguro(lg.motivo, 120) || 'lote grande') : null,
      lote_grande_classificado_depois: lg.depois ? true : undefined,
      prazo_alvo: prazoAlvo ? isoBR(prazoAlvo) : null,
      prazo_cumprido: sitPrazo ? sitPrazo.cumpriu : null,
      prazo_situacao: sitPrazo ? sitPrazo.texto : null,
      primeiro_contato_em: pcEm ? isoBR(pcEm) : null,
      primeiro_contato_por: pcEm ? (pcPor || null) : null,
      minutos_ate_primeiro_contato: minPC != null ? Math.max(0, minPC) : null,
      horas_ate_coleta_concluida: hColeta != null ? Math.max(0, hColeta) : null,
      os_vinculada: osVinc,
      os_gerada: osVinc,
      canal_registro: r.registradoEm ? { canal: limpar(r.canal) || 'outro', registrado_em: isoBR(r.registradoEm), registrado_por: limpar(r.registradoPor) || null } : null,
      quem_atendeu: limpar(r.tratadoPor) || null,
    };
    return item;
  });
  ctx.aviso(`"virou OS" / os_vinculada: vínculo EXATO quando a OS foi gerada a partir do pedido (pedidos desde ${INICIO_MEDICAO_TXT}). Pedidos de antes disso usam o vínculo PROVÁVEL (OS do mesmo cliente, por documento ou e-mail, até 30 dias depois). os_gerada = nome antigo do mesmo campo.`);
  ctx.aviso(`data_hora = hora do pedido no horário de Brasília. primeiro_contato_em = 1ª ação de alguém da equipe sobre o pedido ("Registrei o contato", tratado, sem retorno ou coleta gerada); ações automáticas do sistema não contam. Pedido de antes de ${INICIO_MEDICAO_TXT} também tem 1º contato quando a 1ª ação da equipe aconteceu depois disso (tirado do histórico do pedido; o tempo conta desde o pedido); o que já tinha sido atendido antes fica vazio (hora desconhecida).`);
  ctx.aviso(`"quem_atendeu" é gravado a partir de 18/11/2026; leads tratados antes ficam vazios. Lote grande (empresa com 51+ itens ou desmobilização; prazo de 72h) é marcado nos pedidos desde ${INICIO_MEDICAO_TXT}; pedidos anteriores que pela mesma regra seriam lote grande saem como lote_grande com lote_grande_classificado_depois = true (sem prazo) — a mesma regra de tempos_atendimento. Isso vale também para pedido antigo marcado como prioritário: se pela regra ele é lote grande, sai de prioridade=prioritaria e entra em prioridade=lote_grande. horas_ate_coleta_concluida usa a hora de conclusão da OS (encerramento no app do motorista; fora do app, a hora em que foi marcada como concluída).`);
  return saida(ctx, a, {
    total, pagina, porPagina, itens, filtros, titulo: 'Leads',
    linha: (l) => [l.data_hora || l.data, l.perfil, l.nome || l.empresa, l.email, l.celular, l.cidade, l.material, l.status, l.prioridade !== 'normal' && (l.lote_grande_classificado_depois ? 'lote_grande (classificado depois)' : l.prioridade), l.minutos_ate_primeiro_contato != null && `1º contato em ${l.minutos_ate_primeiro_contato} min${l.primeiro_contato_por ? ` (${l.primeiro_contato_por})` : ''}`, l.os_vinculada && `OS ${l.os_vinculada.numero} (${l.os_vinculada.vinculo})`, l.prazo_situacao && `prazo: ${l.prazo_situacao}`].filter(Boolean).join(' — '),
  });
}

// ===================================================================================
// D) MÉTRICAS DIÁRIAS
// ===================================================================================
async function ferrMetricasDiarias(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const { de, ate } = periodoObrigatorio(a, 732);
  const { pagina, porPagina } = paginacao(a, 31);
  const oss = await ctx.oss();
  const pesos = await ctx.pesos();
  const mats = await ctx.mats();
  const dias = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) dias.push(d);
  const blank = () => ({ total: 0, pf: 0, pj: 0 });
  const m = new Map(dias.map((d) => [d, { dia: d, os_criadas: blank(), os_agendadas: blank(), os_concluidas: blank(), os_canceladas: blank(), peso_total_kg: 0, _mat: new Map(), _cid: new Map(), valor_cobrado: 0, valor_recebido: 0, leads_recebidos: 0, leads_convertidos_em_os: 0, conclusoes_estimadas: 0, avaliacoes_google: { pedidos_email: 0, pedidos_whatsapp: 0, nao_enviados: 0, nao_enviados_por_motivo: {}, testes: 0, devolucoes: 0, queixas: 0 }, avisos_resend: { devolucoes: 0, queixas: 0, temporarias: 0 } }]));
  // Pedidos de avaliação no Google: contagem no dia em que o pedido saiu (ou em que se
  // decidiu não enviar), horário de Brasília.
  if (ctx.db) {
    try {
      const ini = new Date(Date.parse(`${de}T00:00:00-03:00`)).toISOString(), fim = new Date(Date.parse(`${somaDias(ate, 1)}T00:00:00-03:00`)).toISOString();
      const r = await ctx.db.prepare('SELECT COALESCE(pedida_em, processado_em) AS em, status, motivo FROM avaliacao_pedidos WHERE COALESCE(pedida_em, processado_em) >= ?1 AND COALESCE(pedida_em, processado_em) < ?2').bind(ini, fim).all();
      for (const x of (r && r.results) || []) {
        const d = m.get(diaBR(x.em)); if (!d) continue;
        const a = d.avaliacoes_google;
        if (x.status === 'enviado') a.pedidos_email++;
        else if (x.status === 'whatsapp') a.pedidos_whatsapp++;
        else if (x.status === 'teste') a.testes++;
        else if (x.status === 'nao_enviado') { a.nao_enviados++; const k = ROTULO_MOTIVO[x.motivo] || x.motivo || 'outro'; a.nao_enviados_por_motivo[k] = (a.nao_enviados_por_motivo[k] || 0) + 1; }
      }
    } catch { /* registro de avaliações ainda não criado */ }
    // Devoluções e queixas avisadas pelo Resend, no dia do aviso (horário de Brasília).
    // avisos_resend = todos os e-mails do sistema; dentro de avaliacoes_google, só os do
    // pedido de avaliação. Avisos de teste ficam de fora.
    try {
      const ini = new Date(Date.parse(`${de}T00:00:00-03:00`)).toISOString(), fim = new Date(Date.parse(`${somaDias(ate, 1)}T00:00:00-03:00`)).toISOString();
      // A soma por dia já vem pronta do banco (sem teto de linhas).
      for (const x of await contarAvisos({ DB_PLOOMES: ctx.db }, ini, fim)) {
        const d = m.get(x.dia); if (!d) continue;
        const n = Number(x.n) || 0;
        if (x.classe === 'devolucao') { d.avisos_resend.devolucoes += n; if (x.pedido) d.avaliacoes_google.devolucoes += n; }
        else if (x.classe === 'queixa') { d.avisos_resend.queixas += n; if (x.pedido) d.avaliacoes_google.queixas += n; }
        else d.avisos_resend.temporarias += n;
      }
    } catch { /* avisos ainda não recebidos */ }
  }
  const conta = (dia, campo, tipo) => { const x = m.get(dia); if (!x) return null; x[campo].total++; if (tipo) x[campo][tipo.toLowerCase()]++; return x; };
  // Cancelamentos antigos sem data → estimativa pela última atualização (lida da OS).
  const cancTodos = oss.filter((o) => o.status === 'cancelada' && !o.canceladaEm).map((o) => o.id);
  const cobTodos = oss.filter((o) => o.cobranca).map((o) => o.id);
  const canc = cancTodos.slice(0, 400), comCob = cobTodos.slice(0, 600);
  if (cancTodos.length > canc.length) ctx.aviso(`${cancTodos.length - canc.length} cancelamentos antigos (sem data registrada) ficaram fora da contagem por limite de leitura.`);
  if (cobTodos.length > comCob.length) ctx.aviso(`${cobTodos.length - comCob.length} cobranças de OS mais antigas ficaram fora dos valores por limite de leitura.`);
  const regs = await ctx.lerVarios([...new Set([...canc, ...comCob])].map((id) => `os:${id}`));
  const rec = (id) => { try { const raw = regs.get(`os:${id}`); return raw ? JSON.parse(raw) : null; } catch { return null; } };
  for (const o of oss) {
    const d = await ctx.docDaOS(o); const tipo = d.length === 14 ? 'PJ' : (d.length === 11 ? 'PF' : '');
    conta(diaBR(o.criadoEm), 'os_criadas', tipo);
    if (o.dataAgendada && o.status !== 'cancelada') conta(o.dataAgendada, 'os_agendadas', tipo);
    const c = dataConclusao(o, pesos);
    if (c.dia) {
      const x = conta(c.dia, 'os_concluidas', tipo);
      if (x) {
        if (c.estimada) x.conclusoes_estimadas++;
        x.peso_total_kg += (pesos.get(o.id) || {}).kg || 0;
        for (const n of nomesMateriais(mats.get(o.id))) x._mat.set(n, (x._mat.get(n) || 0) + 1);
        for (const cat of (pesos.get(o.id) || {}).cats || []) x._mat.set(normTxt(cat.categoria), (x._mat.get(normTxt(cat.categoria)) || 0) + 1);
        if (o.cidade) x._cid.set(limpar(o.cidade), (x._cid.get(limpar(o.cidade)) || 0) + 1);
      }
    }
    if (o.status === 'cancelada') { const r = o.canceladaEm ? null : rec(o.id); conta(o.canceladaEm ? diaBR(o.canceladaEm) : diaBR(r && (r.atualizadoEm || r.criadoEm)), 'os_canceladas', tipo); }
    if (o.cobranca) {
      const r = rec(o.id);
      const cob = (r && r.cobranca) || o.cobranca;
      const xc = m.get(diaBR(cob.criadoEm)); if (xc) xc.valor_cobrado += Number(cob.valor) || 0;
      if (cob.status === 'pago') { const xp = m.get(diaBR(cob.pagoEm)); if (xp) xp.valor_recebido += Number(cob.valor) || 0; }
    }
  }
  // Vendas do portal (Coleta Expressa, Adote, carbono, ESG) pagas no período.
  try {
    if (env.PORTAL_KV && typeof env.PORTAL_KV.list === 'function') {
      const keys = []; let cursor; let guarda = 0;
      do { const r = await env.PORTAL_KV.list({ prefix: 'pedido:', cursor, limit: 1000 }); keys.push(...(r.keys || []).map((k) => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor && ++guarda < 3);
      if (keys.length > 1500 || cursor) ctx.aviso('Vendas do portal: há mais pedidos guardados do que esta consulta lê de uma vez (1.500) — os valores do portal podem sair incompletos.');
      const peds = await ctx.lerVarios(keys.slice(0, 1500));
      for (const k of keys.slice(0, 1500)) {
        let p = null; try { const raw = peds.get(k); p = raw ? JSON.parse(raw) : null; } catch { p = null; }
        if (!p || p.produto === 'teste' || p.produto === 'oscobranca') continue;
        const xc = m.get(diaBR(p.criadoEm)); if (xc) xc.valor_cobrado += Number(p.valor) || 0;
        if (p.status === 'pago') { const xp = m.get(diaBR(p.pagoEm)); if (xp) xp.valor_recebido += Number(p.valor) || 0; }
      }
    }
  } catch { ctx.aviso('Vendas do portal (fora das OS) indisponíveis agora.'); }
  const vinc = await vinculosLeadOS(ctx);
  for (const l of await ctx.leads()) { const x = m.get(diaBR(l.criadoEm)); if (x) { x.leads_recebidos++; if (vinc.osPorLead.has(l.id)) x.leads_convertidos_em_os++; } }
  const top = (mp) => [...mp.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 5).map(([nome, qtd]) => ({ nome, os: qtd }));
  const todos = dias.map((d) => { const x = m.get(d); const out = { ...x, peso_total_kg: r2(x.peso_total_kg), valor_cobrado: r2(x.valor_cobrado), valor_recebido: r2(x.valor_recebido), materiais_mais_coletados: top(x._mat), cidades_com_mais_coletas: top(x._cid) }; delete out._mat; delete out._cid; return out; });
  const fatia = todos.slice((pagina - 1) * porPagina, pagina * porPagina);
  ctx.aviso('Dia de conclusão das OS antigas é estimado pela data agendada (conclusoes_estimadas mostra quantas no dia); exato a partir de 18/11/2026.');
  ctx.aviso('avaliacoes_google = pedidos de avaliação no Google por dia: pedidos_email (enviados ao cliente), pedidos_whatsapp (marcados pela equipe na OS), nao_enviados com o motivo (sem e-mail, descadastrado, bloqueio, já pedido em 12 meses, casa/família…) e testes (modo de teste: e-mail só para a equipe). Tudo zero enquanto a função estiver desligada. devolucoes e queixas (dentro de avaliacoes_google) = avisos do Resend sobre e-mails do pedido de avaliação: devolução definitiva (o endereço não existe) e queixa de spam. avisos_resend = os mesmos avisos para TODOS os e-mails que o sistema envia, mais as devoluções temporárias (que não entram na lista “não enviar e-mail”). Zero enquanto o aviso do Resend não for ligado.');
  ctx.aviso(`leads_convertidos_em_os = leads recebidos no dia que viraram OS: vínculo exato quando a OS foi gerada a partir do pedido; pedidos de antes de ${INICIO_MEDICAO_TXT}, vínculo provável (OS do mesmo cliente em até 30 dias). Valores: cobranças de OS + vendas do portal; pedidos não pagos antigos somem do sistema em 35–90 dias.`);
  return saida(ctx, a, {
    total: todos.length, pagina, porPagina, itens: fatia, filtros: { de, ate }, titulo: 'Métricas por dia',
    linha: (x) => `${x.dia} — criadas ${x.os_criadas.total} (PF ${x.os_criadas.pf}/PJ ${x.os_criadas.pj}) · concluídas ${x.os_concluidas.total} · canceladas ${x.os_canceladas.total} · ${x.peso_total_kg} kg · cobrado R$ ${x.valor_cobrado} · recebido R$ ${x.valor_recebido} · leads ${x.leads_recebidos} (${x.leads_convertidos_em_os} viraram OS) · avaliações pedidas ${x.avaliacoes_google.pedidos_email + x.avaliacoes_google.pedidos_whatsapp} (não enviadas ${x.avaliacoes_google.nao_enviados})`,
  });
}

// ===================================================================================
// D2) TEMPOS DE ATENDIMENTO POR SEMANA (pedido → 1º contato; pedido → coleta concluída)
// ===================================================================================
// Horas entre duas datas/horas (sem arredondar no meio do caminho); null se inválida.
const horasEntre = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return Number.isFinite(x) && Number.isFinite(y) ? (y - x) / MS_H : null; };
// Mediana: valor do meio (média dos dois do meio quando a quantidade é par).
// P80: valor abaixo do qual ficam 80% dos casos (método do posto mais próximo).
function resumoTempos(valores, casas) {
  const v = valores.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  const arred = (x) => (x == null ? null : (casas ? Math.round(x * 10 ** casas) / 10 ** casas : Math.round(x)));
  if (!v.length) return { n: 0, mediana: null, p80: null };
  const meio = v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  return { n: v.length, mediana: arred(meio), p80: arred(percentil(v, 0.8)) };
}
async function ferrTemposAtendimento(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const p = periodoObrigatorio(a, 371);
  // Semanas inteiras (segunda a domingo), pelo dia do PEDIDO (horário de Brasília).
  const de = segundaDaSemana(p.de), ate = somaDias(segundaDaSemana(p.ate), 6);
  const { pagina, porPagina } = paginacao(a, 60);
  const agoraMs = Date.now();
  const vinc = await vinculosLeadOS(ctx);
  const pesos = await ctx.pesos();
  // Só pedidos de COLETA (propostas de carbono/ESG/Adote e chamados de suporte ficam fora).
  const leads = (await ctx.leads()).filter((l) => { const d = diaBR(l.criadoEm); return d && d >= de && d <= ate && ehPedidoDeColeta(l); });
  // Perfil e lote grande: o índice já traz (desde 18/11/2026). Pedidos antigos sem
  // perfil, ou sem a marca de lote grande, são lidos para aplicar a MESMA regra agora.
  const LIM = 1500;
  const antigo = (l) => !medido(l);
  const perfilDoIndice = (l) => perfilDoLead({ documento: l.documento, perfil: l.perfil === 'PJ' ? 'empresa' : (l.perfil === 'PF' ? 'pessoa_fisica' : '') });
  const precisaLer = leads.filter((l) => antigo(l) && (!l.loteGrande || !perfilDoIndice(l))).map((l) => l.id);
  // Acima do limite por consulta, recusa (perfil e lote grande de uma parte sairiam só do índice,
  // diferentes da função leads). Só pedidos ANTIGOS são lidos — um conjunto fechado (162 em
  // 19/11/2026): o pedido novo grava perfil e lote grande no índice na criação, e o registro dele
  // não traria nada a mais (pedido sem documento nem perfil, como a Coleta Expressa, fica sem perfil).
  if (precisaLer.length > LIM) throw new ErroUso(`Este período tem ${precisaLer.length} pedidos antigos a ler um a um, acima de ${LIM} por consulta. Use um período menor (de / ate).`);
  const ler = precisaLer;
  const regs = await ctx.lerVarios(ler.map((id) => `lead:${id}`));
  let retroativos = 0;
  const info = new Map();
  for (const l of leads) {
    let r = null; try { const raw = regs.get(`lead:${l.id}`); r = raw ? JSON.parse(raw) : null; } catch { r = null; }
    const perfilIdx = l.perfil === 'PJ' || l.perfil === 'PF' ? l.perfil : '';
    const perfil = perfilDoLead({ documento: l.documento || (r && r.documento), perfil: r ? r.perfil : '' }) || perfilIdx || '';
    const lg = loteDoPedido(l, r, env); // a MESMA regra da função leads
    if (lg.depois) retroativos++;
    info.set(l.id, { perfil, lote: lg.lote });
  }
  // 1º contato dos pedidos anteriores ao corte: do histórico (a mesma regra da função leads).
  const pcAntigos = await primeirosContatosAntigos(ctx, leads.filter(antigo).map((l) => l.id));
  const semanas = new Map();
  for (let s = de; s <= ate; s = somaDias(s, 7)) semanas.set(s, { semana_inicio: s, semana_fim: somaDias(s, 6), _pc: { geral: [], pf: [], pj: [], lote_grande: [] }, _col: { geral: [], pf: [], pj: [], lote_grande: [] }, _colEst: { geral: [], pf: [], pj: [], lote_grande: [] }, pedidos: { total: 0, pf: 0, pj: 0, sem_perfil: 0, lote_grande: 0 }, sem_primeiro_contato: 0, sem_coleta_concluida: 0, conclusoes_estimadas: 0, prazo_72h_lote_grande: { cumprido: 0, atrasou: 0, no_prazo: 0, vencido_sem_coleta: 0, sem_coleta_encerrado: 0, concluida_sem_hora: 0 } });
  const totalPeriodo = { _pc: { geral: [], pf: [], pj: [], lote_grande: [] }, _col: { geral: [], pf: [], pj: [], lote_grande: [] }, _colEst: { geral: [], pf: [], pj: [], lote_grande: [] } };
  const poe = (alvo, chave, grupos, valor) => { for (const g of grupos) { alvo[chave][g].push(valor); totalPeriodo[chave][g].push(valor); } };
  for (const l of leads) {
    const s = semanas.get(segundaDaSemana(diaBR(l.criadoEm))); if (!s) continue;
    const { perfil, lote } = info.get(l.id) || { perfil: '', lote: false };
    const grupos = ['geral', ...(perfil === 'PF' ? ['pf'] : perfil === 'PJ' ? ['pj'] : []), ...(lote ? ['lote_grande'] : [])];
    s.pedidos.total++; if (perfil === 'PF') s.pedidos.pf++; else if (perfil === 'PJ') s.pedidos.pj++; else s.pedidos.sem_perfil++; if (lote) s.pedidos.lote_grande++;
    // Pedido → 1º contato (minutos): o registrado; pedido anterior ao corte, o do histórico.
    const pcEm = antigo(l) ? ((pcAntigos.get(l.id) || {}).em || '') : (l.primeiroContatoEm || '');
    if (pcEm) { const m = minutosEntre(l.criadoEm, pcEm); if (m != null) poe(s, '_pc', grupos, Math.max(0, m)); } else s.sem_primeiro_contato++;
    // Pedido → coleta concluída (horas).
    const os = vinc.osPorLead.get(l.id);
    const tipoVinc = os ? (vinc.tipo.get(l.id) || 'provavel') : '';
    if (os && os.status === 'concluida') {
      if (tipoVinc === 'exato' && os.concluidaEm) { const h = horasEntre(l.criadoEm, os.concluidaEm); if (h != null) poe(s, '_col', grupos, Math.max(0, h)); }
      else {
        // Histórico (vínculo provável) ou conclusão sem hora: ESTIMATIVA, em bloco separado.
        const c = dataConclusao(os, pesos);
        const fim = os.concluidaEm || (c.dia ? `${c.dia}T12:00:00-03:00` : '');
        const h = fim ? horasEntre(l.criadoEm, fim) : null;
        if (h != null) { poe(s, '_colEst', grupos, Math.max(0, h)); if (!os.concluidaEm) s.conclusoes_estimadas++; }
      }
    } else s.sem_coleta_concluida++;
    if (lote && l.prazoAlvoEm) {
      const sit = prazoDoPedido(l, os, tipoVinc, l.prazoAlvoEm, agoraMs);
      const k = { cumprido: 'cumprido', atrasou: 'atrasou', no_prazo: 'no_prazo', vencido: 'vencido_sem_coleta', concluida_sem_hora: 'concluida_sem_hora' }[sit && sit.situacao] || 'sem_coleta_encerrado';
      s.prazo_72h_lote_grande[k]++;
    }
  }
  const fecha = (x) => ({
    pedido_ate_primeiro_contato_min: Object.fromEntries(Object.entries(x._pc).map(([g, v]) => [g, resumoTempos(v, 0)])),
    pedido_ate_coleta_concluida_h: Object.fromEntries(Object.entries(x._col).map(([g, v]) => [g, resumoTempos(v, 1)])),
    pedido_ate_coleta_concluida_h_estimado: Object.fromEntries(Object.entries(x._colEst).map(([g, v]) => [g, resumoTempos(v, 1)])),
  });
  const todas = [...semanas.values()].map((s) => { const { _pc, _col, _colEst, ...resto } = s; return { ...resto, ...fecha({ _pc, _col, _colEst }) }; });
  const fatia = todas.slice((pagina - 1) * porPagina, pagina * porPagina);
  ctx.aviso('Semanas de segunda a domingo, pelo dia do PEDIDO (horário de Brasília). Só pedidos de coleta (propostas de carbono/ESG/Adote e chamados de suporte ficam fora). n = quantos pedidos entraram no cálculo; mediana = valor do meio; p80 = 80% dos pedidos ficaram abaixo desse tempo.');
  ctx.aviso(`Pedido → 1º contato (minutos): só pedidos com o 1º contato REGISTRADO, o que começou em ${INICIO_MEDICAO_TXT}. É a 1ª ação de alguém da equipe no sistema ("Registrei o contato", tratado, sem retorno ou coleta gerada); ações automáticas não contam. Pedido de antes disso entra quando a 1ª ação da equipe aconteceu depois (o tempo conta desde o pedido); o que já tinha sido atendido antes fica fora (hora desconhecida).`);
  // Viés das semanas antigas (leitura independente de 19/11/2026): só quando o período as inclui.
  const semanaDoCorte = segundaDaSemana(diaBR(INICIO_MEDICAO));
  if (de <= semanaDoCorte) ctx.aviso(`Nas semanas que começam antes de ${semanaDoCorte}, o 1º contato só traz os pedidos de antes do corte atendidos DEPOIS dele (os mais demorados): a mediana e o p80 dessas semanas não representam o atendimento da época. A semana de ${semanaDoCorte} mistura pedidos de antes e de depois do corte (${INICIO_MEDICAO_TXT}).`);
  ctx.aviso(`Pedido → coleta concluída (horas): pedido_ate_coleta_concluida_h usa só o vínculo EXATO (OS gerada a partir do pedido) e a hora registrada da conclusão — o encerramento no app do motorista; coleta fora do app (transportadora, ou concluída pelo escritório/doca) usa a hora em que foi marcada como concluída, que pode ser depois da retirada real. pedido_ate_coleta_concluida_h_estimado é o HISTÓRICO: pedidos de antes de ${INICIO_MEDICAO_TXT} ligados pelo vínculo provável (OS do mesmo cliente em até 30 dias) e, sem hora de conclusão registrada, o dia estimado ao meio-dia (conclusoes_estimadas).`);
  if (retroativos) ctx.aviso(`Lote grande: ${retroativos} pedido(s) de antes de ${INICIO_MEDICAO_TXT} foram classificados agora pela mesma regra (empresa com 51+ itens ou desmobilização) — na época o pedido não era marcado nem tinha prazo de 72h. A função leads mostra os mesmos, com lote_grande_classificado_depois = true.`);
  ctx.aviso('prazo_72h_lote_grande (pedidos marcados desde 18/11/2026): cumprido / atrasou = coleta concluída antes / depois do prazo; no_prazo = ainda dentro das 72h; vencido_sem_coleta = passou das 72h sem coleta concluída; sem_coleta_encerrado = pedido encerrado sem coleta ligada (sem retorno, tratado sem OS ligada ou OS cancelada).');
  return saida(ctx, a, {
    total: todas.length, pagina, porPagina, itens: fatia, filtros: { de, ate },
    extra: { periodo_inteiro: fecha(totalPeriodo) },
    titulo: 'Tempos de atendimento por semana',
    linha: (x) => `${x.semana_inicio} a ${x.semana_fim} — ${x.pedidos.total} pedidos (PF ${x.pedidos.pf}/PJ ${x.pedidos.pj}/lote grande ${x.pedidos.lote_grande}) · 1º contato: mediana ${x.pedido_ate_primeiro_contato_min.geral.mediana ?? '—'} min, p80 ${x.pedido_ate_primeiro_contato_min.geral.p80 ?? '—'} min (n=${x.pedido_ate_primeiro_contato_min.geral.n}) · coleta: mediana ${x.pedido_ate_coleta_concluida_h.geral.mediana ?? '—'} h, p80 ${x.pedido_ate_coleta_concluida_h.geral.p80 ?? '—'} h (n=${x.pedido_ate_coleta_concluida_h.geral.n}) · histórico estimado: mediana ${x.pedido_ate_coleta_concluida_h_estimado.geral.mediana ?? '—'} h (n=${x.pedido_ate_coleta_concluida_h_estimado.geral.n})`,
  });
}

// ===================================================================================
// E) AGENDA E CAPACIDADE
// ===================================================================================
async function ferrAgendaCapacidade(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const { de, ate } = periodoObrigatorio(a, 186);
  const { pagina, porPagina } = paginacao(a, 31);
  const oss = await ctx.oss();
  const pesos = await ctx.pesos();
  const mats = await ctx.mats();
  // Peso: o real da doca quando já pesada; senão PREVISTO pelo texto da OS (quantidade
  // declarada + itens × peso típico — o mesmo estimador da triagem dos pedidos).
  const pesoOS = (o) => {
    const p = pesos.get(o.id); if (p && p.kg > 0) return { kg: p.kg, real: true };
    const pm = partesMat(mats.get(o.id));
    // Quantidade declarada em kg vale sozinha (somar os itens contaria duas vezes).
    const est = estimarPesoKg(pm.quantidade) || estimarPesoKg(`${pm.material} ${pm.itens.map((i) => `${i.qtd} ${i.nome}`).join(' ')}`);
    return { kg: est || 0, real: false, semEstimativa: !est };
  };
  const dias = []; for (let d = de; d <= ate; d = somaDias(d, 1)) dias.push(d);
  const porDia = new Map(dias.map((d) => [d, []]));
  for (const o of oss) if (o.status !== 'cancelada' && o.dataAgendada && porDia.has(o.dataAgendada)) porDia.get(o.dataAgendada).push(o);
  const todos = dias.map((d) => {
    const lista = porDia.get(d);
    const grupos = new Map();
    let kg = 0, semEst = 0;
    for (const o of lista) {
      const quem = limpar(o.agenteNome) || (o.transp ? `Transportadora: ${limpar(o.transp)}` : 'Sem motorista definido');
      const g = grupos.get(quem) || { motorista: quem, veiculos: [], qtd_os: 0, concluidas: 0, peso_previsto_kg: 0, peso_real_kg: 0, cidades: [], os: [] };
      const placa = ctx.placa(o); if (placa && !g.veiculos.includes(placa)) g.veiculos.push(placa);
      g.qtd_os++; if (o.status === 'concluida') g.concluidas++;
      const p = pesoOS(o); if (p.real) g.peso_real_kg += p.kg; else { g.peso_previsto_kg += p.kg; if (p.semEstimativa) semEst++; }
      kg += p.kg;
      if (o.cidade && !g.cidades.includes(limpar(o.cidade))) g.cidades.push(limpar(o.cidade));
      g.os.push(o.numero);
      grupos.set(quem, g);
    }
    const motoristas = [...grupos.values()].map((g) => ({ ...g, peso_previsto_kg: r2(g.peso_previsto_kg), peso_real_kg: r2(g.peso_real_kg) })).sort((x, y) => y.qtd_os - x.qtd_os);
    return { dia: d, qtd_os: lista.length, peso_total_kg: r2(kg), os_sem_estimativa_de_peso: semEst, cidades: [...new Set(lista.map((o) => limpar(o.cidade)).filter(Boolean))], motoristas };
  });
  const fila = oss.filter((o) => o.status === 'agendada' && !o.dataAgendada);
  const filaKg = r2(fila.reduce((t, o) => t + pesoOS(o).kg, 0));
  const fatia = todos.slice((pagina - 1) * porPagina, pagina * porPagina);
  ctx.aviso('peso_previsto_kg é ESTIMATIVA pelo texto da OS (quantidade declarada e itens × peso típico); peso_real_kg é o pesado na doca. OS sem texto suficiente ficam sem estimativa (os_sem_estimativa_de_peso).');
  ctx.aviso('Veículo: placa gravada na OS (do motorista ou da transportadora); OS sem placa não aparecem em "veiculos".');
  return saida(ctx, a, {
    total: todos.length, pagina, porPagina, itens: fatia, filtros: { de, ate }, titulo: 'Agenda e capacidade',
    extra: { fila_sem_data: { qtd_os: fila.length, peso_previsto_kg: filaKg, observacao: 'OS "aguardando roteiro" (sem data marcada)' } },
    linha: (x) => `${x.dia} — ${x.qtd_os} OS · ${x.peso_total_kg} kg · ${x.motoristas.map((g) => `${g.motorista}: ${g.qtd_os} OS${g.veiculos.length ? ` (${g.veiculos.join(', ')})` : ''}`).join(' | ') || 'sem coletas'}${x.cidades.length ? ` · ${x.cidades.join(', ')}` : ''}`,
  });
}

// ===================================================================================
// F) BLOQUEIOS DE CONTATO
// ===================================================================================
async function ferrBloqueiosContato(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const { pagina, porPagina } = paginacao(a, 100);
  const canalF = normTxt(a.canal);
  const bl = await ctx.bloqueios();
  const itens = [];
  // Clientes ligados a cada telefone bloqueado (para saber de quem é o número).
  const porFone = new Map();
  if (ctx.db && bl.porFone.size) {
    try {
      const r = await ctx.db.prepare("SELECT c.ploomes_id AS i, c.tipo AS t, c.documento AS d, COALESCE(NULLIF(c.nome,''), c.nome_fantasia, '') AS n, c.email AS m, c.telefone AS f, COALESCE(c.company_id,0) AS emp, e.documento AS ed, COALESCE(NULLIF(e.nome,''), e.nome_fantasia, '') AS en FROM contatos c LEFT JOIN contatos e ON e.ploomes_id = c.company_id AND COALESCE(c.company_id,0) <> 0 WHERE COALESCE(c.telefone,'') <> ''").all();
      const alvo = new Set(bl.porFone.keys());
      for (const x of (r && r.results) || []) for (const f of fonesNacionais(x.f)) if (alvo.has(f)) { const l = porFone.get(f) || []; l.push(x); porFone.set(f, l); }
    } catch { /* sem o cruzamento */ }
  }
  for (const [tel, x] of bl.porFone) {
    const quem = (porFone.get(tel) || []).slice(0, 5);
    itens.push({
      canal: 'WhatsApp', telefone: fmtFone(tel), email: separarEmails(quem.map((q) => q.m))[0] || null,
      clientes: quem.map((q) => (Number(q.emp) > 0
        ? { id: digits(q.ed).length === 14 ? `PJ-${digits(q.ed)}` : `PJ-B${q.emp}`, nome: limpar(q.en) || null, contato: limpar(q.n) || null }
        : { id: q.t === 'PJ' && digits(q.d).length === 14 ? `PJ-${digits(q.d)}` : `${q.t === 'PJ' ? 'PJ' : 'PF'}-B${q.i}`, nome: limpar(q.n) || null })),
      data: diaBR(x.em) || null, motivo: textoSeguro(x.motivo, 200) || 'pediu para sair',
    });
  }
  for (const [doc, x] of bl.porDoc) itens.push({ canal: 'Campanhas (diretoria)', documento: doc.length === 14 ? fmtCNPJ(doc) : mascararCPF(doc) || null, email: null, clientes: [{ id: doc.length === 14 ? `PJ-${doc}` : null, nome: limpar(x.nome) || null }], data: diaBR(x.em) || null, motivo: 'empresa retirada das campanhas pela diretoria' });
  // Lista "não enviar e-mail" do sistema (descadastrados e inválidos).
  for (const [email, x] of await ctx.naoEnviar()) itens.push({ canal: 'E-mail (lista não enviar)', email, clientes: [], data: diaBR(x.em) || null, motivo: x.motivo === 'invalido' ? 'e-mail inválido (voltou)' : 'pediu para não receber e-mails' });
  let lista = itens;
  const semHifen = (s) => normTxt(s).replace(/-/g, '');
  if (canalF) lista = lista.filter((i) => semHifen(i.canal).includes(semHifen(canalF)));
  lista.sort((x, y) => String(y.data || '').localeCompare(String(x.data || '')));
  const total = lista.length;
  ctx.aviso('E-mail: a lista "não enviar e-mail" do sistema traz os descadastrados e inválidos da carga do E-goi e os que a equipe marcou (vazia até a carga ser feita). Descadastros feitos no E-goi DEPOIS da carga só entram aqui com nova carga — o E-goi continua bloqueando sozinho os envios feitos por ele.');
  return saida(ctx, a, {
    total, pagina, porPagina, itens: lista.slice((pagina - 1) * porPagina, pagina * porPagina), filtros: { canal: canalF }, titulo: 'Bloqueios de contato',
    linha: (b) => [b.canal, b.telefone || b.documento, b.email, (b.clientes || []).map((c) => c.nome).filter(Boolean).join(', '), b.data, b.motivo].filter(Boolean).join(' — '),
  });
}

// ===================================================================================
// G) MATERIAIS
// ===================================================================================
async function ferrMateriais(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const { pagina, porPagina } = paginacao(a, 100);
  const fonteF = normTxt(a.fonte);
  const slug = (s) => normTxt(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const itens = [];
  for (const m of TRIAGEM_DOCA) itens.push({ codigo: `doca.${m.id}`, nome: m.rotulo, categoria: categoriaMaterial(m.rotulo).nome, fonte: 'triagem da doca', ibama: m.ibama || null, classe: m.classe || null, destino: m.destino || null });
  if (ctx.db) {
    try {
      const r = await ctx.db.prepare("SELECT l.categoria AS c, COUNT(*) AS n, SUM(l.peso) AS kg FROM op_lotes l JOIN op_cargas g ON g.id = l.carga_id WHERE COALESCE(g.status,'') <> 'cancelada' GROUP BY l.categoria ORDER BY kg DESC").all();
      for (const x of (r && r.results) || []) if (limpar(x.c)) itens.push({ codigo: `lote.${slug(x.c)}`, nome: limpar(x.c), categoria: categoriaMaterial(x.c).nome, fonte: 'lotes das cargas (doca)', lotes: Number(x.n) || 0, peso_total_kg: r2(x.kg) });
    } catch { /* sem cargas */ }
  }
  const mats = await ctx.mats();
  const freq = new Map();
  for (const mat of mats.values()) for (const n of new Set(partesMat(mat).itens.map((x) => x.nome))) freq.set(n, (freq.get(n) || 0) + 1);
  for (const [n, q] of [...freq.entries()].sort((x, y) => y[1] - x[1]).slice(0, 300)) itens.push({ codigo: `item.${slug(n)}`, nome: n, categoria: categoriaMaterial(n).nome, fonte: 'itens declarados nas OS', os: q });
  const regra = (lista, situacao) => { for (const [, rot] of lista) itens.push({ codigo: `regra.${slug(rot)}`, nome: rot, categoria: categoriaMaterial(rot).nome, fonte: 'regras de triagem dos pedidos', situacao }); };
  regra(REGRAS_MATERIAIS.recusados, 'não coletamos');
  regra(REGRAS_MATERIAIS.comCusto, 'coletamos com taxa (só junto com outros equipamentos)');
  regra(REGRAS_MATERIAIS.orcamento, 'só com orçamento');
  let lista = itens;
  if (fonteF) lista = lista.filter((i) => normTxt(i.fonte).includes(fonteF));
  const total = lista.length;
  ctx.aviso('Não existe catálogo oficial de materiais com código: este reúne a tabela de triagem da doca (com código IBAMA), as categorias usadas nos lotes, os itens digitados nas OS e as regras de triagem. "categoria" é sugerida por palavra-chave.');
  return saida(ctx, a, {
    total, pagina, porPagina, itens: lista.slice((pagina - 1) * porPagina, pagina * porPagina), filtros: { fonte: fonteF }, titulo: 'Materiais',
    linha: (m) => [m.codigo, m.nome, m.categoria, m.fonte, m.situacao, m.os != null && `${m.os} OS`, m.peso_total_kg != null && `${m.peso_total_kg} kg`].filter(Boolean).join(' — '),
  });
}

// ===================================================================================
// AGENDAMENTOS (OS criadas) POR DIA E POR ORIGEM — "Como nos achou?" (pedido do Marcio, 19/11/2026)
// ===================================================================================
// Conta pelo índice de OS (o código da origem fica nele): nenhuma leitura extra por OS. Agendamento =
// OS CRIADA no dia (horário de Brasília), em qualquer status — as que foram canceladas depois
// continuam contando e aparecem em `canceladas`. Sem origem registrada = nao_informado.
const CODIGOS_COMO = [...COMO_OPCOES.map(([c]) => c), COMO_NAO_INFORMADO];
const zeroComo = () => Object.fromEntries(CODIGOS_COMO.map((c) => [c, 0]));
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function somarAgendamento(acc, x) {
  acc.total += x.total; acc.canceladas += x.canceladas;
  for (const c of CODIGOS_COMO) acc.por_origem[c] += x.por_origem[c];
}
function fecharAgendamentos(acc) {
  const informadas = acc.total - acc.por_origem[COMO_NAO_INFORMADO];
  return { total: acc.total, informadas, nao_informadas: acc.por_origem[COMO_NAO_INFORMADO], percentual_informadas: acc.total ? Math.round((informadas / acc.total) * 1000) / 10 : null, canceladas: acc.canceladas, por_origem: acc.por_origem };
}
async function ferrAgendamentosPorOrigem(env, args) {
  const a = args || {};
  const ctx = novoContexto(env);
  const { de, ate } = periodoObrigatorio(a, 370);
  const { pagina, porPagina } = paginacao(a, 31);
  // Hoje (Brasília): dias DEPOIS de hoje não entram; hoje entra marcado "em andamento" e fica fora
  // das médias (um dia pela metade, ou dias futuros contados como zero, puxariam a média para baixo).
  const hoje = diaBR(new Date().toISOString());
  const fim = ate < hoje ? ate : hoje;
  const porDia = new Map();
  // Índice de OS podado por tamanho (coletas.js, salvarIndiceOS: acima de 900.000 caracteres saem
  // primeiro as OS FECHADAS do fim do índice — as inseridas há mais tempo). Só pode ter havido poda
  // se o sistema já emitiu mais números de OS (os:seq) do que o índice tem E o índice está perto do
  // teto. Aí a contagem está completa a partir da ÚLTIMA OS fechada na ordem do índice (a próxima a
  // ser podada; uma OS antiga que voltou para a frente do índice ao mudar de status não conta como
  // fronteira). Sem nenhuma fechada no índice: todos os dias ficam marcados. Longe do teto (o caso
  // em 19/11/2026), nada é marcado. Limites registrados: um buraco na numeração que não vem de poda
  // (criação que falhou, consulta no meio de uma criação, OS perdida numa gravação simultânea) não
  // vira aviso longe do teto e, perto dele, aparece como "podado"; uma OS fechada que volta para a
  // frente do índice pode deixar a fronteira atrasada até ela ser podada de novo.
  const LIMITE_INDICE_OS = 900000;
  const todasOS = await ctx.oss();
  let podado = false, completoDesde = '';
  let seqOS = null; try { const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('os:seq') : null; seqOS = raw ? JSON.parse(raw) : null; } catch { seqOS = null; }
  let emitidos = 0; for (const v of Object.values(seqOS && typeof seqOS === 'object' ? seqOS : {})) emitidos += Math.max(0, Math.min(Number(v) || 0, 1e6));
  const faltaNumero = !seqOS || emitidos > new Set(todasOS.map((o) => o.numero).filter(Boolean)).size;
  if (faltaNumero && JSON.stringify(todasOS).length >= 0.85 * LIMITE_INDICE_OS) {
    podado = true;
    for (let i = todasOS.length - 1; i >= 0; i--) { const o = todasOS[i]; if ((o.status === 'concluida' || o.status === 'cancelada') && o.criadoEm) { completoDesde = String(o.criadoEm); break; } }
  }
  const diaLimite = podado ? (completoDesde ? diaBR(completoDesde) : '9999-12-31') : '';
  let primeiraComOrigem = '';
  for (const o of todasOS) {
    const d = diaBR(o && o.criadoEm);
    if (!d || d < de || d > fim) continue;
    const c = comoValido(o.como) ? o.como : COMO_NAO_INFORMADO;
    if (c !== COMO_NAO_INFORMADO && (!primeiraComOrigem || String(o.criadoEm) < primeiraComOrigem)) primeiraComOrigem = String(o.criadoEm);
    let x = porDia.get(d); if (!x) { x = { total: 0, canceladas: 0, por_origem: zeroComo() }; porDia.set(d, x); }
    x.total++; x.por_origem[c]++; if (o.status === 'cancelada') x.canceladas++;
  }
  const dias = [];
  const semanas = new Map();
  const periodo = { total: 0, canceladas: 0, por_origem: zeroComo() };
  let diasCompletos = 0, totalCompletos = 0, diasUteis = 0, totalUteis = 0;
  for (let d = de; d <= fim; d = somaDias(d, 1)) {
    const x = porDia.get(d) || { total: 0, canceladas: 0, por_origem: zeroComo() };
    const dow = new Date(Date.parse(d + 'T12:00:00Z')).getUTCDay();
    const emAndamento = d === hoje;
    const podeFaltar = podado && d <= diaLimite;
    dias.push({ data: d, dia_semana: DIAS_SEMANA[dow], ...(emAndamento ? { dia_em_andamento: true } : {}), ...(podeFaltar ? { pode_faltar_os_no_indice: true } : {}), ...fecharAgendamentos({ total: x.total, canceladas: x.canceladas, por_origem: { ...x.por_origem } }) });
    const seg = segundaDaSemana(d);
    let s = semanas.get(seg); if (!s) { s = { semana_inicio: seg, semana_fim: somaDias(seg, 6), dias: 0, emAndamento: false, acc: { total: 0, canceladas: 0, por_origem: zeroComo() } }; semanas.set(seg, s); }
    s.dias++; if (emAndamento) s.emAndamento = true; somarAgendamento(s.acc, x); somarAgendamento(periodo, x);
    if (!emAndamento) { diasCompletos++; totalCompletos += x.total; if (dow >= 1 && dow <= 5) { diasUteis++; totalUteis += x.total; } }
  }
  const media = (t, n) => (n ? Math.round((t / n) * 10) / 10 : null);
  const listaSemanas = [...semanas.values()].map((s) => ({ semana_inicio: s.semana_inicio, semana_fim: s.semana_fim, dias_contados: s.dias, ...(s.dias < 7 ? { semana_incompleta: true } : {}), ...(s.emAndamento ? { semana_em_andamento: true } : {}), ...fecharAgendamentos(s.acc) }));
  const resumo = {
    de, ate, ate_contado: fim >= de ? fim : null, dias: dias.length, dias_completos: diasCompletos, ...fecharAgendamentos(periodo),
    media_por_dia: media(totalCompletos, diasCompletos), media_por_dia_util: media(totalUteis, diasUteis),
    ...(fim === hoje && fim >= de ? { hoje: { data: hoje, total: (porDia.get(hoje) || { total: 0 }).total } } : {}),
    primeira_os_com_origem_no_periodo: primeiraComOrigem ? isoBR(primeiraComOrigem) : null,
    ...(podado ? { indice_podado: true, contagem_completa_a_partir_de: completoDesde ? isoBR(completoDesde) : null } : {}),
  };
  if (de > hoje) ctx.aviso(`O período começa depois de hoje (${hoje}): nenhum dia contado.`);
  else if (ate > hoje) ctx.aviso(`Dias depois de hoje (${hoje}) não entram (ate_contado).`);
  ctx.aviso('Agendamento = OS criada no dia (horário de Brasília), em qualquer status; as canceladas depois continuam contando e aparecem em "canceladas". media_por_dia e media_por_dia_util usam só os dias COMPLETOS: hoje aparece com dia_em_andamento (o que já foi criado até agora) e fica fora das médias. media_por_dia_util = segunda a sexta (feriados não são descontados). Semana com menos de 7 dias no período: semana_incompleta e dias_contados.');
  ctx.aviso('Origem = resposta da equipe a "Como nos achou?" na criação da OS (obrigatória a partir da publicação de 19/11/2026; pode ser corrigida na edição). OS criada antes disso fica nao_informado (a não ser que a equipe informe depois, na edição): nada foi preenchido por adivinhação. Quando a OS nasce de um pedido do site com canal claro, a opção vem marcada (a equipe pode trocar). primeira_os_com_origem_no_periodo = a OS mais antiga DO PERÍODO que tem a origem informada (não é a data em que o campo passou a existir).');
  if (podado && dias.some((x) => x.pode_faltar_os_no_indice)) ctx.aviso(`Atenção: o índice de OS chegou ao teto de tamanho e foi podado (saem primeiro as OS fechadas mais antigas). ${completoDesde ? `A contagem está completa a partir de ${isoBR(completoDesde)}; nos dias até ${diaBR(completoDesde)} (pode_faltar_os_no_indice) ela pode sair MENOR do que a real.` : 'Não dá para saber a partir de quando a contagem está completa.'}`);
  const origensDe = (po) => CODIGOS_COMO.filter((c) => po[c]).map((c) => `${c === COMO_NAO_INFORMADO ? 'não informado' : rotuloComo(c)}: ${po[c]}`).join(', ');
  return saida(ctx, a, {
    total: dias.length, pagina, porPagina, itens: dias.slice((pagina - 1) * porPagina, pagina * porPagina), filtros: { de, ate }, titulo: 'Agendamentos por origem (por dia)',
    extra: { origens: COMO_OPCOES.map(([codigo, rotulo]) => ({ codigo, rotulo })).concat([{ codigo: COMO_NAO_INFORMADO, rotulo: 'não informado' }]), semanas: listaSemanas, periodo_inteiro: resumo },
    linha: (x) => `${x.data} (${x.dia_semana}${x.dia_em_andamento ? ', em andamento' : ''}${x.pode_faltar_os_no_indice ? ', pode faltar OS no índice' : ''}) — ${x.total} OS${x.canceladas ? ` (${x.canceladas} cancelada(s) depois)` : ''}${x.total ? ' — ' + origensDe(x.por_origem) : ''}`,
    rodape: (corpo) => {
      const p = corpo.periodo_inteiro; if (!p) return '';
      const linhas = (corpo.semanas || []).map((s) => `• semana ${s.semana_inicio} a ${s.semana_fim}${s.semana_incompleta ? ` (${s.dias_contados} dia(s) no período${s.semana_em_andamento ? ', em andamento' : ''})` : (s.semana_em_andamento ? ' (em andamento)' : '')}: ${s.total} OS, ${s.informadas} com origem${s.total ? ' — ' + origensDe(s.por_origem) : ''}`);
      const medias = p.media_por_dia != null ? ` (média ${p.media_por_dia} por dia completo${p.media_por_dia_util != null ? `; ${p.media_por_dia_util} por dia útil` : ''})` : '';
      return [`Período ${p.de} a ${p.ate_contado || p.ate}: ${p.total} OS criadas${medias}${p.hoje ? `, ${p.hoje.total} delas hoje (dia em andamento)` : ''}, ${p.informadas} com origem (${p.percentual_informadas ?? 0}%), ${p.canceladas} cancelada(s) depois.`, ...linhas].join('\n');
    },
  });
}

// ===================================================================================
// Definições (descrições lidas pelo Claude para saber como chamar)
// ===================================================================================
const PAG = { pagina: { type: 'number', description: 'página, a partir de 1' }, por_pagina: { type: 'number', description: 'itens por página (máx. 200)' }, campos: { type: 'array', items: { type: 'string' }, description: 'opcional: só estes campos de cada item (economiza espaço em páginas grandes)' }, formato: { type: 'string', enum: ['json', 'texto'], description: 'json (padrão) ou texto' } };
export const FERRAMENTAS_CONSULTA = [
  {
    name: 'clientes',
    description: 'Clientes da Ecobraz EM LOTE, com filtros — para listas de campanha (PF e PJ separados) e reativação. Só leitura. Filtros opcionais: tipo (PF | PJ | todos), ultima_coleta_de / ultima_coleta_ate (AAAA-MM-DD ou AAAA-MM; última coleta/atendimento concluído, somando sistema novo e histórico do Ploomes), nunca_coletou (true), cadastrado_de / cadastrado_ate, cidade, uf, cep_prefixo (ex.: "013"), material (ex.: "geladeira"; procura nos itens das OS, aceita sinônimos), tem_os_aberta (true/false), aceita_email (true/false), tem_email (true/false), origem (ploomes | sistema | site). Cada cliente traz: id, tipo, nome, CNPJ ou CPF mascarado, e-mails, celulares, telefones, contato principal (PJ), cidade/UF/CEP/bairro (sem rua), coordenadas e distância até a Praça da Sé quando houver, datas de cadastro e de 1ª/última coleta, total de coletas, peso, materiais, OS aberta, aceita_email + motivo_bloqueio (e emails_nao_enviar: os e-mails do cliente que estão na lista "não enviar e-mail" e por isso ficam fora de "emails") e situação de cobrança (com filtro de material, também material_encontrado_em: as OS onde o material apareceu). JSON: total, pagina, paginas, itens (até 200 por página; padrão 50) e contagem (com e sem CNPJ/CPF). Exemplo: {"tipo":"PF","ultima_coleta_de":"2025-11-01","ultima_coleta_ate":"2026-11-17","aceita_email":true,"por_pagina":200,"campos":["nome","emails","celulares","cidade","ultima_coleta"]}',
    inputSchema: { type: 'object', properties: { tipo: { type: 'string', enum: ['PF', 'PJ', 'todos'] }, ultima_coleta_de: { type: 'string' }, ultima_coleta_ate: { type: 'string' }, nunca_coletou: { type: 'boolean' }, cadastrado_de: { type: 'string' }, cadastrado_ate: { type: 'string' }, cidade: { type: 'string' }, uf: { type: 'string' }, cep_prefixo: { type: 'string' }, material: { type: 'string' }, tem_os_aberta: { type: 'boolean' }, aceita_email: { type: 'boolean' }, tem_email: { type: 'boolean' }, origem: { type: 'string', enum: ['ploomes', 'sistema', 'site'] }, ...PAG } },
  },
  {
    name: 'coletas_periodo',
    description: 'Ordens de Coleta (OS) num período, com filtros — acompanhar coletas por dia. Só leitura. Obrigatórios: de, ate (AAAA-MM-DD ou AAAA-MM). campo_data escolhe qual data cai no período: criacao (padrão) | agendada | concluida | cancelada. Filtros opcionais: status (agendada | aguardando_roteiro | em_transporte | na_unidade | concluida | cancelada), tipo_cliente (PF | PJ), cidade, material, motorista (nome, ou "sem motorista"), origem (canal do pedido, ex.: site, portal-coleta; ou "sem_pedido"). Cada OS traz: número, status, cliente (id, tipo, nome), cidade e CEP, datas de criação/agendamento/conclusão/cancelamento (com marcação quando estimada), data_hora_criacao e data_hora_conclusao (horário de Brasília), lead_id (pedido de origem quando o vínculo é exato), lote grande com prazo_alvo / prazo_cumprido / prazo_situacao (prazo de 72h), motivo do cancelamento, motorista e veículo, materiais declarados e pesados, peso, modalidade, valor cobrado e pagamento, origem do pedido (lead_id, data e hora do pedido, vínculo exato ou provável, UTM e gclid quando houver), pedido de avaliação no Google (avaliacao_pedida_em, avaliacao_canal = email | whatsapp | nenhum, motivo_nao_enviado) e documentos (CDF, NF e MTR com número); "Como nos achou?" da equipe (como_nos_achou: Busca no Google, Google Maps, Assistente de IA, Indicação de alguém, Cliente antigo, E-mail da Ecobraz, Anúncio, Outro + como_nos_achou_outro, ou "não informado" nas OS criadas antes da publicação de 19/11/2026). Opcional: pedir "email_avaliacao" em campos traz, por OS, como o pedido de avaliação lê o e-mail (casos de espaço antes do @ e leitura: envia | e-mail inválido | sem e-mail…, sem mostrar o e-mail), a saudação (com o nome ou "Olá!"), a comparação com a publicação anterior (regra_anterior: só a saudação da ficha de pessoa física sem nome muda) e resumo_email_avaliacao do período inteiro. Exemplo: {"de":"2026-11-17","ate":"2026-11-17","campo_data":"concluida"}',
    inputSchema: { type: 'object', properties: { de: { type: 'string' }, ate: { type: 'string' }, campo_data: { type: 'string', enum: ['criacao', 'agendada', 'concluida', 'cancelada'] }, status: { type: 'string' }, tipo_cliente: { type: 'string', enum: ['PF', 'PJ'] }, cidade: { type: 'string' }, material: { type: 'string' }, motorista: { type: 'string' }, origem: { type: 'string' }, ...PAG }, required: ['de', 'ate'] },
  },
  {
    name: 'leads',
    description: 'Leads (pedidos que chegam pelo formulário do site, pelo portal do cliente, WhatsApp/telefone/e-mail registrados pela equipe e demais canais), com filtros. Só leitura. Filtros opcionais: de, ate (AAAA-MM-DD), status (novo | contatado | virou_os | perdido), perfil (PF | PJ), origem (ex.: website, portal-coleta, whatsapp), prioridade (lote_grande | prioritaria | normal). Cada lead traz: id, data e data_hora do pedido (horário de Brasília), perfil, nome, empresa, e-mail, celular, cidade/UF/CEP, material e mensagem, triagem, modalidade, origem com UTM e gclid, status, prioridade (lote grande = empresa com 51+ itens ou desmobilização, prazo de 72h: prazo_alvo / prazo_cumprido / prazo_situacao; pedido anterior a 18/11/2026 01:11 classificado depois pela mesma regra: lote_grande_classificado_depois = true, sem prazo), primeiro_contato_em, primeiro_contato_por, minutos_ate_primeiro_contato, horas_ate_coleta_concluida, os_vinculada (número, status, vínculo exato ou provável, hora de criação e de conclusão; os_gerada = nome antigo) e quem atendeu. Exemplo: {"de":"2026-11-01","ate":"2026-11-17","status":"novo","perfil":"PJ"}',
    inputSchema: { type: 'object', properties: { de: { type: 'string' }, ate: { type: 'string' }, status: { type: 'string', enum: ['novo', 'contatado', 'virou_os', 'perdido'] }, perfil: { type: 'string', enum: ['PF', 'PJ'] }, origem: { type: 'string' }, prioridade: { type: 'string', enum: ['lote_grande', 'prioritaria', 'normal'] }, ...PAG } },
  },
  {
    name: 'tempos_atendimento',
    description: 'TEMPOS DE ATENDIMENTO POR SEMANA (segunda a domingo, pelo dia do pedido), entre de e ate (obrigatórios, AAAA-MM-DD; até 53 semanas): mediana e percentil 80 do tempo pedido → primeiro contato (minutos) e pedido → coleta concluída (horas), separados em geral, PF, PJ e lote grande, com n (quantos pedidos entraram no cálculo); quantidade de pedidos; pedidos ainda sem 1º contato ou sem coleta concluída; cumprimento do prazo de 72h dos lotes grandes; e o histórico ESTIMADO (pedidos antigos, vínculo provável) em bloco separado. Traz também o resumo do período inteiro. Só leitura. Exemplo: {"de":"2026-10-01","ate":"2026-11-30"}',
    inputSchema: { type: 'object', properties: { de: { type: 'string' }, ate: { type: 'string' }, ...PAG }, required: ['de', 'ate'] },
  },
  {
    name: 'agendamentos_por_origem',
    description: 'AGENDAMENTOS (OS criadas) POR DIA E POR ORIGEM entre de e ate (obrigatórios, AAAA-MM-DD; até 370 dias; 31 dias por página) — para a leitura semanal de onde vêm os agendamentos. Origem = resposta da equipe a "Como nos achou?" na criação da OS (busca_google, google_maps, assistente_ia, indicacao, cliente_antigo, email_ecobraz, anuncio, outro; nao_informado = OS criada antes do campo, que passou a ser obrigatório na publicação de 19/11/2026). Cada dia traz total, informadas, nao_informadas, percentual_informadas, canceladas (das criadas no dia, quantas foram canceladas depois) e por_origem; hoje vem com dia_em_andamento e dias depois de hoje não entram. semanas (segunda a domingo, com dias_contados) trazem os mesmos totais; periodo_inteiro traz os totais e a média por dia e por dia útil, só dos dias completos (hoje fica fora da média). Se o índice de OS já tiver sido podado por tamanho, os dias que podem sair com menos vêm com pode_faltar_os_no_indice e periodo_inteiro traz contagem_completa_a_partir_de. Só leitura. Exemplo: {"de":"2026-11-17","ate":"2026-11-23"}',
    inputSchema: { type: 'object', properties: { de: { type: 'string' }, ate: { type: 'string' }, ...PAG }, required: ['de', 'ate'] },
  },
  {
    name: 'metricas_diarias',
    description: 'Métricas POR DIA entre de e ate (obrigatórios, AAAA-MM-DD; até 2 anos, 31 dias por página): OS criadas, agendadas, concluídas e canceladas separadas em PF e PJ; peso total; materiais mais coletados; cidades com mais coletas; valor cobrado e recebido; leads recebidos e convertidos em OS; pedidos de avaliação no Google (enviados por e-mail, pelo WhatsApp e não enviados por motivo). Só leitura. Exemplo: {"de":"2026-11-01","ate":"2026-11-17"}',
    inputSchema: { type: 'object', properties: { de: { type: 'string' }, ate: { type: 'string' }, ...PAG }, required: ['de', 'ate'] },
  },
  {
    name: 'agenda_capacidade',
    description: 'AGENDA E CAPACIDADE por dia entre de e ate (obrigatórios; até 186 dias): OS agendadas por motorista e veículo, quantidade, peso previsto (estimado pelo texto da OS) ou real (doca) e cidades atendidas — para saber quanto cabe antes de disparar uma campanha. Traz também a fila "aguardando roteiro" (OS sem data). Só leitura. Exemplo: {"de":"2026-11-18","ate":"2026-11-30"}',
    inputSchema: { type: 'object', properties: { de: { type: 'string' }, ate: { type: 'string' }, ...PAG }, required: ['de', 'ate'] },
  },
  {
    name: 'bloqueios_contato',
    description: 'Quem pediu para NÃO receber contato: opt-out do WhatsApp (inclui quem respondeu SAIR), empresas retiradas das campanhas pela diretoria e a lista "não enviar e-mail" do sistema (descadastrados e inválidos: carga do E-goi + marcados pela equipe) — com telefone ou documento, e-mail e cliente ligados quando houver, data, canal e motivo. Use antes de montar qualquer lista de campanha. Só leitura. Filtro opcional: canal (whatsapp | campanhas | email). Exemplo: {}',
    inputSchema: { type: 'object', properties: { canal: { type: 'string' }, ...PAG } },
  },
  {
    name: 'materiais',
    description: 'Catálogo dos materiais usados nas OS: código, nome e categoria (linha branca, informática, baterias, cabos etc.), reunindo a tabela de triagem da doca (com código IBAMA e classe), as categorias dos lotes pesados, os itens digitados nas OS (com quantas OS) e as regras de triagem (o que não coletamos, o que tem taxa, o que exige orçamento). Use os nomes daqui no filtro "material". Só leitura. Filtro opcional: fonte (doca | lotes | itens | regras). Exemplo: {"fonte":"itens"}',
    inputSchema: { type: 'object', properties: { fonte: { type: 'string' }, ...PAG } },
  },
];
export const NOMES_CONSULTA = new Set(FERRAMENTAS_CONSULTA.map((f) => f.name));

export async function executarConsulta(env, nome, args) {
  if (nome === 'clientes') return await ferrClientes(env, args);
  if (nome === 'coletas_periodo') return await ferrColetasPeriodo(env, args);
  if (nome === 'leads') return await ferrLeads(env, args);
  if (nome === 'metricas_diarias') return await ferrMetricasDiarias(env, args);
  if (nome === 'tempos_atendimento') return await ferrTemposAtendimento(env, args);
  if (nome === 'agendamentos_por_origem') return await ferrAgendamentosPorOrigem(env, args);
  if (nome === 'agenda_capacidade') return await ferrAgendaCapacidade(env, args);
  if (nome === 'bloqueios_contato') return await ferrBloqueiosContato(env, args);
  if (nome === 'materiais') return await ferrMateriais(env, args);
  throw new Error(`Ferramenta desconhecida: ${nome}`);
}
