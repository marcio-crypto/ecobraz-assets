// Módulo Fiscal — importação de NF-e (lote) e amarração à coleta/cliente.
//
// PROBLEMA que resolve: hoje a Débora/fiscal vinculam nota a coleta na mão. Aqui,
// a contadora (papel "fiscal") importa o LOTE de XML da competência, o sistema
// guarda cada nota numa base própria (idempotente pela chave de 44 dígitos),
// SUGERE o vínculo casando o CNPJ/CPF do destinatário com um cliente cadastrado
// e as coletas dele — e uma pessoa CONFIRMA (nada é adivinhado sem confirmação).
//
// Fonte da verdade = o XML (tem chave, destinatário e protocolo da Receita). A
// listagem/CSV entra só como CONFERÊNCIA: o sistema compara e avisa quais XMLs
// faltaram no lote (pega export incompleto sozinho).
//
// KV: nf:{chave44} (nota completa + XML bruto + vínculo) e nf:index (lista leve).
// SEGURANÇA/LGPD: os XMLs trazem CPF/CNPJ de terceiros — vivem só no KV, NUNCA no
// repositório nem em log. O CPF do acesso (Rita) idem, via cadastro de Equipe.

import { botaoGoogle } from './google-auth.js';
import { listarClientes } from './cadastro.js';
import { listarColetasOS, lerColetaOS, salvarColetaOSDireto } from './coletas.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const fmtDoc = (d) => { const n = digits(d); return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : n.length === 11 ? n.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (d || ''); };
const brl = (v) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// --- Autorização (env FISCAL_EMAILS = "email|Nome,email2|Nome2") ---
export function fiscaisDe(env) {
  const out = new Map();
  for (const par of String(env.FISCAL_EMAILS || '').split(/[,;]+/)) {
    const [em, nome] = par.split('|');
    const e = (em || '').trim().toLowerCase();
    if (e) out.set(e, (nome || '').trim() || e.split('@')[0]);
  }
  return out;
}
export function fiscalPermitido(email, env) { return fiscaisDe(env).has(String(email || '').trim().toLowerCase()); }
export function nomeFiscal(email, env) { return fiscaisDe(env).get(String(email || '').trim().toLowerCase()) || String(email || '').split('@')[0]; }

// ===========================================================================
// MOTOR — leitura de NF-e e descompactação de lote (.zip) sem biblioteca
// ===========================================================================

// Classifica pela natureza da operação: tpNF 0 = entrada, 1 = saída/venda.
// CFOP 1/2/3xxx = entrada; 5/6/7xxx = saída — usado como reforço.
export function classificarNota(tpNF, cfops) {
  const t = String(tpNF || '');
  if (t === '1') return 'venda';
  if (t === '0') return 'entrada';
  const c = (cfops || []).map((x) => String(x || '')[0]).filter(Boolean);
  if (c.some((x) => '567'.includes(x))) return 'venda';
  if (c.some((x) => '123'.includes(x))) return 'entrada';
  return 'outra';
}

const pegar = (bloco, tag) => { const m = String(bloco || '').match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1].trim() : ''; };
const pegarBloco = (xml, tag) => { const m = String(xml || '').match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`)); return m ? m[1] : ''; };

// Extrai os campos que importam de um XML de NF-e (nfeProc). Regex direcionado
// à estrutura fixa da SEFAZ (Workers não têm parser de XML nativo).
export function parseNFe(xml) {
  const s = String(xml || '');
  if (!/<(nfeProc|NFe)\b/.test(s)) return { erro: 'não parece um XML de NF-e' };
  let chave = (s.match(/<chNFe>(\d{44})<\/chNFe>/) || [])[1] || (s.match(/Id=["']NFe(\d{44})["']/) || [])[1] || '';
  const ide = pegarBloco(s, 'ide');
  const emitB = pegarBloco(s, 'emit');
  const destB = pegarBloco(s, 'dest');
  const totB = pegarBloco(s, 'ICMSTot') || pegarBloco(s, 'total');
  const protB = pegarBloco(s, 'protNFe') || pegarBloco(s, 'infProt');

  const tpNF = pegar(ide, 'tpNF');
  const cfops = [];
  const dets = s.match(/<det\b[^>]*>[\s\S]*?<\/det>/g) || [];
  const itens = dets.map((d) => {
    const p = pegarBloco(d, 'prod');
    const cf = pegar(p, 'CFOP'); if (cf) cfops.push(cf);
    return { desc: pegar(p, 'xProd'), ncm: pegar(p, 'NCM'), cfop: cf, qtd: pegar(p, 'qCom'), valor: Number(pegar(p, 'vProd')) || 0 };
  });
  const destDoc = digits(pegar(destB, 'CNPJ') || pegar(destB, 'CPF'));
  const emitDoc = digits(pegar(emitB, 'CNPJ') || pegar(emitB, 'CPF'));

  return {
    chave,
    serie: pegar(ide, 'serie'),
    numero: pegar(ide, 'nNF'),
    dhEmi: pegar(ide, 'dhEmi'),
    dataEmi: (pegar(ide, 'dhEmi') || '').slice(0, 10),
    tpNF,
    tipo: classificarNota(tpNF, cfops),
    natOp: pegar(ide, 'natOp'),
    cfops: [...new Set(cfops)],
    emit: { doc: emitDoc, nome: pegar(emitB, 'xNome') },
    dest: { doc: destDoc, nome: pegar(destB, 'xNome'), pessoa: (pegar(destB, 'CPF') ? 'PF' : (pegar(destB, 'CNPJ') ? 'PJ' : '')) },
    itens,
    valor: Number(pegar(totB, 'vNF')) || 0,
    prot: { nProt: pegar(protB, 'nProt'), cStat: pegar(protB, 'cStat'), xMotivo: pegar(protB, 'xMotivo'), dhRecbto: pegar(protB, 'dhRecbto') },
  };
}

// Inflate de dados DEFLATE crus (método 8 do ZIP) usando a API nativa.
async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await stream.arrayBuffer());
}

// Extrai os arquivos de um .zip lendo o diretório central (autoritativo).
// Suporta método 0 (stored) e 8 (deflate). Devolve [{name, bytes}].
export async function extrairZip(buf) {
  const b = new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Acha o End Of Central Directory (assinatura 0x06054b50), de trás pra frente.
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip inválido (sem EOCD)');
  const total = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const saida = [];
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const fnLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(b.subarray(off + 46, off + 46 + fnLen));
    // Cabeçalho local: recalcula o início dos dados (fn/extra podem diferir).
    const lFnLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lFnLen + lExtraLen;
    const comp = b.subarray(dataStart, dataStart + compSize);
    let bytes;
    if (method === 0) bytes = comp;
    else if (method === 8) bytes = await inflateRaw(comp);
    else { off += 46 + fnLen + extraLen + commentLen; continue; }
    if (/\.xml$/i.test(name)) saida.push({ name, bytes });
    off += 46 + fnLen + extraLen + commentLen;
  }
  return saida;
}

// Recebe [{name, bytes}] de upload; devolve [{name, xml}] achatando zips.
export async function extrairXMLs(arquivos) {
  const out = [];
  for (const a of (arquivos || [])) {
    const nome = a.name || '';
    if (/\.zip$/i.test(nome)) {
      try { for (const x of await extrairZip(a.bytes)) out.push({ name: x.name, xml: new TextDecoder().decode(x.bytes) }); }
      catch (e) { out.push({ name: nome, erro: 'zip ilegível: ' + (e && e.message || e) }); }
    } else if (/\.xml$/i.test(nome)) {
      out.push({ name: nome, xml: new TextDecoder().decode(a.bytes) });
    }
  }
  return out;
}

// Lê a listagem/CSV do IOB (conferência). Detecta separador e coluna do número.
export function parseListagemCSV(texto) {
  const linhas = String(texto || '').split(/\r?\n/).filter((l) => l.trim());
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
  const head = linhas[0].split(sep).map((c) => c.trim().toLowerCase());
  const iNum = head.findIndex((c) => c.includes('mero'));
  const iNat = head.findIndex((c) => c.includes('natureza'));
  const iCfop = head.findIndex((c) => c === 'cfop' || c.includes('cfop'));
  const iVal = head.findIndex((c) => c.includes('valor'));
  const out = [];
  for (let i = 1; i < linhas.length; i++) {
    const c = linhas[i].split(sep);
    const num = digits(iNum >= 0 ? c[iNum] : c[0]);
    if (!num) continue;
    out.push({ numero: num, natureza: (iNat >= 0 ? c[iNat] : '').trim(), cfop: (iCfop >= 0 ? c[iCfop] : '').trim(), valorTxt: (iVal >= 0 ? c[iVal] : '').trim() });
  }
  return out;
}

// ===========================================================================
// BASE DE DADOS (KV)
// ===========================================================================
export async function listarNotas(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('nf:index') : null;
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export async function lerNota(env, chave) {
  const k = digits(chave); if (!env.PORTAL_KV || k.length !== 44) return null;
  const raw = await env.PORTAL_KV.get(`nf:${k}`);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
// Grava SÓ o documento da nota (nf:{chave}); devolve o resumo p/ o índice.
// Idempotente pela chave; preserva vínculo já existente. Não mexe no índice —
// quem chama junta os resumos e escreve o índice UMA vez (evita ler-após-gravar
// no KV, que é eventualmente consistente).
export async function gravarNotaDoc(env, parsed, xmlBruto, por) {
  const chave = digits(parsed && parsed.chave);
  if (!env.PORTAL_KV || chave.length !== 44) return { erro: 'chave inválida' };
  const jaRaw = await env.PORTAL_KV.get(`nf:${chave}`);
  const ja = jaRaw ? (() => { try { return JSON.parse(jaRaw); } catch { return null; } })() : null;
  const rec = {
    ...parsed, chave, xml: String(xmlBruto || '').slice(0, 60000),
    vinculo: ja && ja.vinculo ? ja.vinculo : null,
    criadoEm: ja ? ja.criadoEm : agora(), criadoPor: ja ? ja.criadoPor : (por || ''),
    atualizadoEm: agora(),
  };
  await env.PORTAL_KV.put(`nf:${chave}`, JSON.stringify(rec));
  const resumo = {
    chave, numero: parsed.numero, serie: parsed.serie, tipo: parsed.tipo, natOp: parsed.natOp,
    dataEmi: parsed.dataEmi, destDoc: parsed.dest.doc, destNome: parsed.dest.nome, valor: parsed.valor,
    cStat: parsed.prot.cStat, vinculo: rec.vinculo, criadoEm: rec.criadoEm,
  };
  return { rec, resumo, novo: !ja };
}
// Grava uma nota avulsa (documento + índice) — para uso individual.
export async function salvarNota(env, parsed, xmlBruto, por) {
  const r = await gravarNotaDoc(env, parsed, xmlBruto, por);
  if (r.erro) return r;
  const idx = await listarNotas(env);
  const i = idx.findIndex((x) => x.chave === r.resumo.chave);
  if (i >= 0) idx[i] = r.resumo; else idx.unshift(r.resumo);
  await env.PORTAL_KV.put('nf:index', JSON.stringify(idx).slice(0, 950000));
  return { rec: r.rec, novo: r.novo };
}
// Confirma o vínculo nota→cliente/coleta (nos dois lados) — com trilha de auditoria.
export async function vincularNota(env, chave, alvo, por) {
  const nota = await lerNota(env, chave);
  if (!nota) return { erro: 'nota não encontrada' };
  const vinc = {
    clienteId: String((alvo && alvo.clienteId) || '').slice(0, 40),
    clienteNome: String((alvo && alvo.clienteNome) || '').slice(0, 120),
    osId: String((alvo && alvo.osId) || '').slice(0, 60),
    osNumero: String((alvo && alvo.osNumero) || '').slice(0, 40),
    por: por || '', em: agora(),
  };
  nota.vinculo = vinc; nota.atualizadoEm = agora();
  await env.PORTAL_KV.put(`nf:${digits(chave)}`, JSON.stringify(nota));
  const idx = await listarNotas(env);
  const i = idx.findIndex((x) => x.chave === digits(chave));
  if (i >= 0) { idx[i].vinculo = vinc; await env.PORTAL_KV.put('nf:index', JSON.stringify(idx).slice(0, 950000)); }
  // Espelha na coleta (para a coleta listar suas notas).
  if (vinc.osId && typeof salvarColetaOSDireto === 'function') {
    try {
      const os = await lerColetaOS(env, vinc.osId);
      if (os) {
        os.notas = (os.notas || []).filter((x) => x.chave !== digits(chave));
        os.notas.push({ chave: digits(chave), numero: nota.numero, tipo: nota.tipo, valor: nota.valor, dataEmi: nota.dataEmi, em: vinc.em, por: vinc.por });
        await salvarColetaOSDireto(env, os);
      }
    } catch { /* não bloqueia o vínculo se a coleta falhar */ }
  }
  return { ok: true, vinculo: vinc };
}

// ===========================================================================
// CASAMENTO (sugestão) — puro: recebe as listas já carregadas
// ===========================================================================
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
export function sugerirVinculoSync(nota, clientes, coletas) {
  const doc = digits(nota && (nota.destDoc || (nota.dest && nota.dest.doc)));
  let cliente = null;
  if (doc) cliente = (clientes || []).find((c) => digits(c.doc) === doc) || null;
  let cand = [];
  if (cliente) {
    const alvo = norm(cliente.nome);
    cand = (coletas || []).filter((o) => norm(o.clienteNome) === alvo)
      .sort((a, b) => String(b.dataAgendada || b.criadoEm || '').localeCompare(String(a.dataAgendada || a.criadoEm || '')))
      .slice(0, 12)
      .map((o) => ({ id: o.id, numero: o.numero, dataAgendada: o.dataAgendada, status: o.status }));
  }
  return { cliente: cliente ? { id: cliente.id, nome: cliente.nome, doc: cliente.doc } : null, coletas: cand };
}

// ===========================================================================
// ORQUESTRADOR — importa arquivos, grava, sugere e concilia com o CSV
// ===========================================================================
export async function importarLote(env, arquivos, csvTexto, por) {
  const xmls = await extrairXMLs(arquivos);
  const clientes = await listarClientes(env);
  const coletas = await listarColetasOS(env);
  const idx = await listarNotas(env);            // índice lido UMA vez
  const importadas = [], erros = [];
  for (const x of xmls) {
    if (x.erro) { erros.push({ nome: x.name, motivo: x.erro }); continue; }
    const parsed = parseNFe(x.xml);
    if (parsed.erro || digits(parsed.chave).length !== 44) { erros.push({ nome: x.name, motivo: parsed.erro || 'sem chave válida' }); continue; }
    const r = await gravarNotaDoc(env, parsed, x.xml, por);
    if (r.erro) { erros.push({ nome: x.name, motivo: r.erro }); continue; }
    const i = idx.findIndex((z) => z.chave === r.resumo.chave);   // atualiza índice em memória
    if (i >= 0) idx[i] = r.resumo; else idx.unshift(r.resumo);
    const sug = sugerirVinculoSync(r.rec, clientes, coletas);
    importadas.push({ chave: r.rec.chave, numero: parsed.numero, tipo: parsed.tipo, natOp: parsed.natOp, valor: parsed.valor, dataEmi: parsed.dataEmi, cStat: parsed.prot.cStat, destNome: parsed.dest.nome, destDoc: parsed.dest.doc, vinculo: r.rec.vinculo, novo: r.novo, sugestao: sug });
  }
  if (importadas.length) await env.PORTAL_KV.put('nf:index', JSON.stringify(idx).slice(0, 950000));   // índice escrito UMA vez
  // Conciliação com a listagem/CSV.
  let reconc = null;
  const lista = parseListagemCSV(csvTexto);
  if (lista.length) {
    const numsCsv = new Set(lista.map((l) => l.numero));
    const numsXml = new Set(importadas.map((i) => digits(i.numero)));
    const faltandoXml = [...numsCsv].filter((n) => !numsXml.has(n)).sort();
    const soNoXml = [...numsXml].filter((n) => !numsCsv.has(n)).sort();
    reconc = { csvTotal: numsCsv.size, xmlTotal: numsXml.size, faltandoXml, soNoXml };
  }
  return { importadas, erros, reconc };
}

// ===========================================================================
// PÁGINAS
// ===========================================================================
function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:960px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px}
.btn{display:inline-block;border:none;border-radius:11px;padding:12px 17px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.tile{flex:1;min-width:120px;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:12px 14px}
.tile b{display:block;font-size:22px;color:#00333B}.tile span{font-size:11px;color:#7c8a87;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;color:#7c8a87;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;padding:7px 8px;border-bottom:1px solid #E4EBE9}
td{padding:9px 8px;border-bottom:1px solid #EEF3F1;vertical-align:top}
.pill{font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;white-space:nowrap}
select,input[type=file]{font-family:inherit;font-size:13px;border:1px solid #DDE1E6;border-radius:9px;padding:8px 9px;background:#fff;max-width:100%}
@media(max-width:640px){.wrap{padding:14px 12px 40px}}</style></head>`;
}
function topo(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:960px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/fiscal" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'fiscal')}</span></a>
    <form method="post" action="/api/fiscal/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}
const pillTipo = (t) => t === 'venda'
  ? `<span class="pill" style="background:#FDE9D6;color:#8a5a16">VENDA</span>`
  : t === 'entrada' ? `<span class="pill" style="background:#E3F0F3;color:#0B5B66">ENTRADA</span>` : `<span class="pill" style="background:#EEF3F1;color:#7c8a87">${esc(t || '—')}</span>`;
const pillStat = (c) => c === '100'
  ? `<span class="pill" style="background:#E4F3E6;color:#1E5B31">autorizada</span>`
  : c === '150' ? `<span class="pill" style="background:#FFF4DE;color:#8A6A16">fora de prazo</span>` : `<span class="pill" style="background:#FBE9E7;color:#8a4b45">${esc(c || '?')}</span>`;

export function paginaFiscalLogin(googleOn) {
  return `${head('Fiscal')}<body style="display:flex;align-items:center;min-height:100vh;background:#00333B">
<div style="max-width:400px;margin:0 auto;padding:32px 24px;width:100%">
  <div style="text-align:center;margin-bottom:24px"><span style="color:#fff;font-size:26px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">fiscal</span></div>
  <div class="card">
    <h1 style="margin:0 0 8px;font-size:20px;color:#00333B">Fiscal &amp; Notas</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6">Importação e conciliação de notas fiscais. Acesso da contadora / fiscal.</p>
    ${googleOn ? botaoGoogle('fiscal') : ''}
    <input id="e" type="email" inputmode="email" placeholder="seu e-mail" style="width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px">
    <button id="b" class="btn btn-p" style="width:100%;margin-top:12px">Entrar</button>
    <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px"></div>
  </div>
</div>
<script>const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/fiscal/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail estiver cadastrado, enviamos o link.';}catch{m.textContent='Tente de novo.';}b.disabled=false;};
e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});</script></body></html>`;
}

export function paginaFiscalHome(user, notas) {
  const n = notas.length;
  const ent = notas.filter((x) => x.tipo === 'entrada').length;
  const ven = notas.filter((x) => x.tipo === 'venda').length;
  const vinc = notas.filter((x) => x.vinculo).length;
  const aVincular = n - vinc;
  const linhas = notas.length ? notas.slice(0, 300).map((x) => `<tr>
      <td><b>${esc(x.numero)}</b><div style="color:#9aa7a4;font-size:10px">${esc(dataBR(x.dataEmi))}</div></td>
      <td>${pillTipo(x.tipo)}</td>
      <td style="max-width:230px"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.destNome || '—')}</div><div style="color:#9aa7a4;font-size:10px">${esc(fmtDoc(x.destDoc))}</div></td>
      <td style="text-align:right;white-space:nowrap">${esc(brl(x.valor))}</td>
      <td>${pillStat(x.cStat)}</td>
      <td>${x.vinculo ? `<span class="pill" style="background:#E4F3E6;color:#1E5B31">✓ ${esc(x.vinculo.osNumero || 'vinculada')}</span>` : `<a href="/fiscal/nota?chave=${esc(x.chave)}" class="pill" style="background:#FFF4DE;color:#8A6A16;text-decoration:none">vincular →</a>`}</td>
    </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#8fa39f;padding:22px">Nenhuma nota importada ainda. Envie o lote de XML abaixo.</td></tr>`;
  return `${head('Fiscal & Notas')}<body>${topo('fiscal & notas')}
<div class="wrap">
  <h1 style="font-size:21px;margin:0 0 4px">Notas fiscais</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 14px">Importe o lote de XML da competência. O sistema guarda, sugere o vínculo pelo CNPJ/CPF e você confirma.</p>
  <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:16px">
    <div class="tile"><b>${n}</b><span>notas</span></div>
    <div class="tile"><b>${ent}</b><span>entrada</span></div>
    <div class="tile"><b>${ven}</b><span>venda</span></div>
    <div class="tile"><b style="color:#1E7A3D">${vinc}</b><span>vinculadas</span></div>
    <div class="tile"><b style="color:${aVincular ? '#B26A16' : '#1E7A3D'}">${aVincular}</b><span>a vincular</span></div>
  </div>
  <div class="card" style="margin-bottom:18px">
    <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#00333B;margin-bottom:10px">📥 Importar lote</div>
    <form method="post" action="/api/fiscal/importar" enctype="multipart/form-data">
      <div style="font-size:12.5px;color:#4F6469;margin-bottom:6px">1) XML das notas (pode ser o <b>.zip</b> do IOB ou vários <b>.xml</b>):</div>
      <input type="file" name="xmls" accept=".xml,.zip" multiple required>
      <div style="font-size:12.5px;color:#4F6469;margin:14px 0 6px">2) <i>Opcional</i> — a listagem/CSV, só para conferência (aponta XML que faltou):</div>
      <input type="file" name="csv" accept=".csv,.txt">
      <div style="margin-top:16px"><button class="btn btn-p" type="submit">Importar e conferir</button></div>
    </form>
  </div>
  <div class="card" style="padding:0;overflow-x:auto">
    <table><thead><tr><th>Nº</th><th>Tipo</th><th>Destinatário</th><th style="text-align:right">Valor</th><th>Receita</th><th>Vínculo</th></tr></thead><tbody>${linhas}</tbody></table>
  </div>
  ${notas.length > 300 ? `<div style="font-size:11.5px;color:#8fa39f;text-align:center;margin-top:10px">Mostrando 300 de ${notas.length}.</div>` : ''}
</div>
</body></html>`;
}

export function paginaFiscalResultado(user, resultado) {
  const { importadas, erros, reconc } = resultado;
  const novas = importadas.filter((i) => i.novo).length;
  const linhas = importadas.map((x, k) => {
    const sug = x.sugestao || {};
    const cli = sug.cliente;
    const jaVinc = x.vinculo;
    let acao;
    if (jaVinc) acao = `<span class="pill" style="background:#E4F3E6;color:#1E5B31">✓ ${esc(jaVinc.osNumero || 'vinculada')}</span>`;
    else if (!cli) acao = `<span style="font-size:11.5px;color:#B26A16">cliente não encontrado — <a href="/fiscal/nota?chave=${esc(x.chave)}">vincular manual</a></span>`;
    else {
      const opts = ['<option value="">— sem coleta (só cliente) —</option>'].concat((sug.coletas || []).map((o) => `<option value="${esc(o.id)}|${esc(o.numero)}">${esc(o.numero)} · ${esc(dataBR(o.dataAgendada) || '')}</option>`)).join('');
      acao = `<div style="min-width:220px"><div style="font-size:11.5px;color:#1E5B31;margin-bottom:4px">✓ ${esc(cli.nome)}</div>
        <select id="s${k}">${opts}</select>
        <button class="btn btn-d" style="padding:7px 12px;font-size:12px;margin-top:6px" onclick="vinc('${esc(x.chave)}','${esc(cli.id)}',${JSON.stringify(esc(cli.nome))},'s${k}',this)">Confirmar</button>
        <span id="m${k}" style="font-size:11px;color:#4F6469;margin-left:6px"></span></div>`;
    }
    return `<tr>
      <td><b>${esc(x.numero)}</b><div style="color:#9aa7a4;font-size:10px">${esc(dataBR(x.dataEmi))}</div></td>
      <td>${pillTipo(x.tipo)}</td>
      <td style="max-width:220px"><div style="font-weight:700">${esc(x.destNome || '—')}</div><div style="color:#9aa7a4;font-size:10px">${esc(fmtDoc(x.destDoc))}</div></td>
      <td style="text-align:right;white-space:nowrap">${esc(brl(x.valor))}</td>
      <td>${pillStat(x.cStat)}</td>
      <td>${acao}</td>
    </tr>`;
  }).join('');
  const boxRec = reconc ? `<div class="card" style="margin-bottom:16px;border-color:${reconc.faltandoXml.length ? '#f0d9b0' : '#bfe3c6'};background:${reconc.faltandoXml.length ? '#FFF9EE' : '#F1F8EC'}">
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#00333B;margin-bottom:6px">Conferência com a listagem</div>
    <div style="font-size:13px;color:#28413f;line-height:1.6">Listagem: <b>${reconc.csvTotal}</b> notas · XML importados: <b>${reconc.xmlTotal}</b>.
    ${reconc.faltandoXml.length ? `<br><b style="color:#B26A16">⚠ Faltam os XML de ${reconc.faltandoXml.length} nota(s):</b> ${esc(reconc.faltandoXml.join(', '))}. Peça ao fiscal o export completo desses XMLs.` : '<br>✓ Todos os XMLs da listagem foram importados.'}
    ${reconc.soNoXml.length ? `<br><span style="color:#7c8a87">No XML mas fora da listagem: ${esc(reconc.soNoXml.join(', '))}.</span>` : ''}</div>
  </div>` : '';
  const boxErr = (erros && erros.length) ? `<div class="card" style="margin-bottom:16px;border-color:#f2cfc9;background:#FDECEA">
    <div style="font-size:12.5px;color:#8a4b45"><b>${erros.length} arquivo(s) com problema:</b><ul style="margin:6px 0 0;padding-left:18px">${erros.map((e) => `<li>${esc(e.nome)} — ${esc(e.motivo)}</li>`).join('')}</ul></div></div>` : '';
  return `${head('Importação')}<body>${topo('fiscal & notas')}
<div class="wrap">
  <a href="/fiscal" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Notas</a>
  <h1 style="font-size:21px;margin:10px 0 4px">Resultado da importação</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 14px"><b>${importadas.length}</b> nota(s) lida(s) · <b>${novas}</b> nova(s). Confirme os vínculos sugeridos abaixo.</p>
  ${boxRec}${boxErr}
  <div class="card" style="padding:0;overflow-x:auto">
    <table><thead><tr><th>Nº</th><th>Tipo</th><th>Destinatário</th><th style="text-align:right">Valor</th><th>Receita</th><th>Vincular à coleta</th></tr></thead><tbody>${linhas}</tbody></table>
  </div>
</div>
<script>
function vinc(chave,cid,cnome,selId,btn){
  var sel=document.getElementById(selId);var osId='',osNum='';
  if(sel&&sel.value){var p=sel.value.split('|');osId=p[0];osNum=p[1]||'';}
  var msg=document.getElementById('m'+selId.slice(1));
  btn.disabled=true;if(msg)msg.textContent='Salvando…';
  fetch('/api/fiscal/vincular',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chave:chave,clienteId:cid,clienteNome:cnome,osId:osId,osNumero:osNum})})
   .then(r=>r.json()).then(j=>{if(j.ok){if(msg){msg.style.color='#1E5B31';msg.textContent='✓ vinculada';}btn.textContent='Vinculada';}else{if(msg){msg.style.color='#b23';msg.textContent=j.error||'falhou';}btn.disabled=false;}})
   .catch(function(){if(msg)msg.textContent='sem conexão';btn.disabled=false;});
}
</script>
</body></html>`;
}

// Página de vínculo manual de uma nota (quando o cliente não foi achado, ou p/ revisar).
export function paginaFiscalNota(user, nota, sugestao, clientes) {
  const doc = fmtDoc(nota.dest && nota.dest.doc);
  const cli = sugestao && sugestao.cliente;
  const optCli = ['<option value="">— escolher cliente —</option>'].concat((clientes || []).slice(0, 4000).map((c) => `<option value="${esc(c.id)}|${esc(c.nome)}" ${cli && cli.id === c.id ? 'selected' : ''}>${esc(c.nome)} — ${esc(c.doc || '')}</option>`)).join('');
  return `${head('Nota ' + (nota.numero || ''))}<body>${topo('fiscal & notas')}
<div class="wrap">
  <a href="/fiscal" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Notas</a>
  <h1 style="font-size:21px;margin:10px 0 12px">Nota nº ${esc(nota.numero)} ${pillTipo(nota.tipo)}</h1>
  <div class="card" style="margin-bottom:14px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;font-size:13px">
      <div><div style="font-size:10px;color:#9aa7a4;text-transform:uppercase">Destinatário</div><b>${esc(nota.dest && nota.dest.nome)}</b><div style="color:#7c8a87;font-size:11px">${esc(doc)}</div></div>
      <div><div style="font-size:10px;color:#9aa7a4;text-transform:uppercase">Valor / Emissão</div><b>${esc(brl(nota.valor))}</b> · ${esc(dataBR(nota.dataEmi))}</div>
      <div><div style="font-size:10px;color:#9aa7a4;text-transform:uppercase">Natureza</div>${esc(nota.natOp || '—')}</div>
      <div><div style="font-size:10px;color:#9aa7a4;text-transform:uppercase">Receita</div>${pillStat(nota.prot && nota.prot.cStat)} · protocolo ${esc((nota.prot && nota.prot.nProt) || '—')}</div>
    </div>
    <div style="font-size:10.5px;color:#9aa7a4;margin-top:10px;word-break:break-all">Chave: ${esc(nota.chave)}</div>
  </div>
  <div class="card">
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#00333B;margin-bottom:8px">Vincular</div>
    <label style="font-size:11px;color:#7c8a87;font-weight:700">Cliente</label>
    <select id="cli" style="width:100%;margin:4px 0 12px">${optCli}</select>
    <label style="font-size:11px;color:#7c8a87;font-weight:700">Coleta (opcional)</label>
    <select id="os" style="width:100%;margin:4px 0 12px"><option value="">— carregando ao escolher o cliente —</option></select>
    <div style="display:flex;gap:10px;align-items:center"><button class="btn btn-p" onclick="salvar(this)">Confirmar vínculo</button><span id="m" style="font-size:12.5px;color:#4F6469"></span></div>
    ${nota.vinculo ? `<div style="font-size:11.5px;color:#1E5B31;margin-top:10px">Já vinculada a ${esc(nota.vinculo.clienteNome)}${nota.vinculo.osNumero ? ' · ' + esc(nota.vinculo.osNumero) : ''} (${esc(dataBR(nota.vinculo.em))}).</div>` : ''}
  </div>
</div>
<script>
var CH=${JSON.stringify(nota.chave)};
document.getElementById('cli').addEventListener('change',carregaColetas);
function carregaColetas(){var v=document.getElementById('cli').value;var os=document.getElementById('os');if(!v){os.innerHTML='<option value="">—</option>';return;}
  var cid=v.split('|')[0];os.innerHTML='<option value="">carregando…</option>';
  fetch('/api/fiscal/coletas?clienteId='+encodeURIComponent(cid)).then(r=>r.json()).then(j=>{
    var h='<option value="">— sem coleta (só cliente) —</option>';(j.coletas||[]).forEach(function(o){h+='<option value="'+o.id+'|'+o.numero+'">'+o.numero+' · '+(o.dataAgendada||'')+'</option>';});os.innerHTML=h;
  }).catch(function(){os.innerHTML='<option value="">—</option>';});}
if(document.getElementById('cli').value)carregaColetas();
function salvar(btn){var cv=document.getElementById('cli').value;if(!cv){document.getElementById('m').textContent='Escolha o cliente.';return;}
  var cp=cv.split('|');var ov=document.getElementById('os').value;var op=ov?ov.split('|'):['',''];
  btn.disabled=true;document.getElementById('m').textContent='Salvando…';
  fetch('/api/fiscal/vincular',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chave:CH,clienteId:cp[0],clienteNome:cp[1]||'',osId:op[0],osNumero:op[1]||''})})
   .then(r=>r.json()).then(j=>{if(j.ok){location.href='/fiscal';}else{btn.disabled=false;document.getElementById('m').textContent=j.error||'falhou';}})
   .catch(function(){btn.disabled=false;document.getElementById('m').textContent='sem conexão';});}
</script>
</body></html>`;
}
