// Motor de cálculo de carbono — liga os DADOS REAIS (peso por material nas operações
// da doca) aos FATORES da metodologia. Produz o número A (emissões evitadas) por
// cliente, material a material.
//
// ⚠️ REGRA DE OURO (o Marcio reforçou; a metodologia já impõe): nenhum tCO₂e aparece
// como número real enquanto o fator não estiver VALIDADO. Os fatores hoje são valor:null
// e a metodologia está 'proposto' → o motor roda com o PESO REAL mas devolve os tCO₂e
// como "pendente". No dia em que a Villanova validar, os números acendem sozinhos.
// Nada é inventado.

import { METODOLOGIA, metodologiaVigente } from './carbono-metodologia.js';
import { listarOperacoes, lerOperacao } from './operacional.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const nfmt = (n, d = 0) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

// De-para: material da operação → id de categoria de fator da metodologia.
// É uma SUGESTÃO por palavra-chave (classificação automática). Boards ("placas") são
// um fluxo misto — ficam como 'preciosos' por aproximação, e idealmente o analista
// confirma/ajusta (mat.categoriaFator sobrepõe o automático).
export function categoriaDoMaterial(mat) {
  if (!mat) return '';
  if (mat.categoriaFator) return mat.categoriaFator; // ajuste manual do analista
  if (mat.destino === 'reuso') return 'reuso';
  const t = norm(`${mat.rotulo || ''} ${mat.ibama || ''} ${mat.classe || ''}`);
  if (/\b(ACO|FERRO|STEEL|FERROSA|FERROSO|SUCATA FERR)/.test(t)) return 'aco';
  if (/(ALUMINIO|\bALU\b)/.test(t)) return 'aluminio';
  if (/(COBRE|\bCABO|\bFIO\b|FIACAO|CHICOTE)/.test(t)) return 'cobre';
  if (/(PLAST|\bABS\b|\bPS\b|\bPVC\b|POLIM|\bPET\b|HDPE|POLIET|POLIPROP)/.test(t)) return 'plasticos';
  if (/(PLACA|\bPCI\b|CIRCUITO|COMPONENTE|PROCESSAD|MEMORIA|\bOURO\b|PRATA|PRECIOS|ELETRONIC)/.test(t)) return 'preciosos';
  return ''; // sem classificação → precisa de curadoria manual
}

// Núcleo PURO (sem rede, testável): recebe materiais [{rotulo,qtd,destino,...}] + a
// metodologia; devolve as linhas (com fator/status) e os totais. Um número de tCO₂e só
// sai != null quando: a metodologia está 'validado' E o fator existe, tem valor e está
// 'validado'. Caso contrário, fica pendente.
export function calcularEvitado(materiais, metodologia) {
  const M = metodologia || METODOLOGIA;
  const validadoGlobal = M && M.status === 'validado';
  // Fatores desmembrados (v1.3): 'aplicaA' liga o subtipo (ex.: aco_lata) à
  // categoria operacional (aco). REGRA DA RT: se 2+ fatores homologados disputam
  // a mesma categoria SEM a proporção em massa da triagem, NÃO se calcula —
  // nada de média escondida. Só calcula com exatamente 1 fator homologado.
  const candidatosDe = (cat) => {
    const todos = (M && M.fatores) || [];
    // Subtipo marcado na TRIAGEM (ex.: aco_lata): usa o fator EXATO daquela massa.
    const exatos = todos.filter((f) => f.id === cat);
    return exatos.length ? exatos : todos.filter((f) => (f.aplicaA || f.id) === cat);
  };
  let totalKg = 0, totalEvitadoKg = 0, algumPendente = false, algumSemCategoria = false;
  const linhas = (materiais || []).map((mat) => {
    const kg = Math.max(0, Number(mat.qtd) || 0);
    totalKg += kg;
    const cat = categoriaDoMaterial(mat);
    if (!cat) algumSemCategoria = true;
    const cands = cat ? candidatosDe(cat) : [];
    const homologados = cands.filter((x) => x.valor != null && x.status === 'validado');
    const f = homologados.length === 1 ? homologados[0] : null;
    const fatorValido = !!(validadoGlobal && f);
    const evitadoKg = fatorValido ? kg * Number(f.valor) : null;
    if (evitadoKg == null) algumPendente = true; else totalEvitadoKg += evitadoKg;
    return {
      rotulo: mat.rotulo || '(sem nome)', destino: mat.destino || '', kg,
      categoria: cat || null, auto: !mat.categoriaFator,
      fatorId: f ? f.id : null, fatorValor: f ? f.valor : null, fatorUnidade: f ? f.unidade : null,
      fatorFonte: f ? f.fonte : null,
      fatorStatus: f ? f.status : (homologados.length > 1 ? 'requer_proporcao' : (cands.length ? (cands[0].status || 'proposto') : (cat ? 'sem_fator' : 'sem_categoria'))),
      evitadoKg, pendente: evitadoKg == null,
    };
  });
  return {
    linhas, totalKg,
    totalEvitadoKg: algumPendente ? null : Math.round(totalEvitadoKg * 100) / 100,
    totalEvitadoT: algumPendente ? null : Math.round((totalEvitadoKg / 1000) * 100) / 100,
    pendente: algumPendente, semCategoria: algumSemCategoria,
    metodologiaStatus: M ? M.status : 'desconhecido', metodologiaVersao: M ? M.versao : '',
  };
}

// Lista os clientes que já têm operação (para o seletor do analista).
export async function clientesComOperacoes(env) {
  const ops = await listarOperacoes(env);
  const mapa = new Map();
  for (const o of ops) {
    const nome = (o.cliente || '').trim(); if (!nome) continue;
    const k = norm(nome);
    const at = mapa.get(k) || { cliente: nome, coletas: 0, entradaKg: 0 };
    at.coletas += 1; at.entradaKg += Number(o.entradaKg || 0);
    mapa.set(k, at);
  }
  return [...mapa.values()].sort((a, b) => b.entradaKg - a.entradaKg);
}

// Agrega as operações de um cliente e aplica o motor.
export async function carbonoDoCliente(env, clienteNome) {
  const alvo = norm(clienteNome);
  const ops = (await listarOperacoes(env)).filter((o) => norm(o.cliente) === alvo);
  const materiais = [];
  let pesoEntradaKg = 0, pesoSaidaKg = 0;
  const operacoes = [];
  for (const o of ops) {
    const full = await lerOperacao(env, o.osId);
    if (!full) { operacoes.push({ osId: o.osId, numero: o.numero, entradaKg: o.entradaKg, expirada: true }); continue; }
    pesoEntradaKg += Number((full.entrada && full.entrada.pesoKg) || 0);
    pesoSaidaKg += Number((full.saida && full.saida.pesoKg) || 0);
    for (const m of (full.materiais || [])) materiais.push(m);
    operacoes.push({ osId: full.osId, numero: full.numero, entradaKg: (full.entrada && full.entrada.pesoKg) || 0, materiais: (full.materiais || []).length });
  }
  // Metodologia VIGENTE: esqueleto + fatores homologados pela Villanova no KV.
  const calc = calcularEvitado(materiais, await metodologiaVigente(env));
  return { clienteNome, coletas: ops.length, pesoEntradaKg, pesoSaidaKg, operacoes, ...calc };
}

// ---------------------------------------------------------------------------
// TELA DO ANALISTA — a "cozinha" que alimenta as outras duas telas.
// ---------------------------------------------------------------------------
const T = '#10262B', TEAL = '#00333B', VERDE = '#3f8f3a';
function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:${T}}
a{color:#0B5B66}.wrap{max-width:1000px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px}
.tile{flex:1;min-width:150px;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:14px 16px}
.tile b{display:block;font-size:24px;color:${TEAL};line-height:1}.tile span{font-size:11px;color:#7c8a87;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:12.5px}th{text-align:left;color:#7c8a87;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;padding:8px;border-bottom:1px solid #E4EBE9}
td{padding:9px 8px;border-bottom:1px solid #EEF3F1;vertical-align:top}
.pend{font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;background:#FFF4DE;color:#8A6A16;white-space:nowrap}
select{font-family:inherit;font-size:13px;border:1px solid #DDE1E6;border-radius:9px;padding:9px 11px;background:#fff}
.cat{font-size:10px;font-weight:800;padding:2px 7px;border-radius:20px;background:#E7EFF0;color:#0B5B66}
.cat.sem{background:#FBE9E7;color:#8a4b45}</style></head>`;
}
function topo(sub, home) {
  return `<div style="background:${TEAL};padding:15px 20px"><div style="max-width:1000px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="${esc(home || '/carbono/analista')}" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'carbono')}</span></a>
    <a href="/metodologia" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none;border:1px solid #1c5b66;border-radius:8px;padding:7px 11px">Metodologia</a>
  </div></div>`;
}
// Faixa de honestidade — sempre visível enquanto a metodologia não for validada.
function faixaStatus(calc) {
  const validado = calc && calc.metodologiaStatus === 'validado';
  if (validado) return '';
  return `<div class="card" style="background:#FFF9EE;border-color:#f0d9b0;margin-bottom:16px">
    <div style="font-size:13px;color:#8A6A16;line-height:1.6"><b>Metodologia ${esc(calc ? calc.metodologiaVersao : '')} · status "${esc(calc ? calc.metodologiaStatus : 'proposto')}".</b>
    Os <b>pesos por material são reais</b> (vêm das operações da doca), mas <b>nenhum tCO₂e é exibido como número</b> — os fatores ainda não foram validados pela Villanova ESG. Assim que a metodologia for validada e os fatores preenchidos, os números aparecem automaticamente. <a href="/validacao">Ver validação →</a></div>
  </div>`;
}

export function paginaCarbonoAnalista(user, clientes, dados) {
  const opts = ['<option value="">— escolher cliente —</option>'].concat((clientes || []).map((c) =>
    `<option value="${esc(c.cliente)}" ${dados && norm(dados.clienteNome) === norm(c.cliente) ? 'selected' : ''}>${esc(c.cliente)} — ${nfmt(c.coletas)} coleta(s) · ${nfmt(c.entradaKg / 1000, 2)} t</option>`)).join('');
  const seletor = `<div class="card" style="margin-bottom:16px"><label style="font-size:11px;font-weight:800;text-transform:uppercase;color:#7c8a87">Cliente</label>
    <div style="margin-top:6px"><select id="cli" onchange="if(this.value)location.href='/carbono/analista?cliente='+encodeURIComponent(this.value)">${opts}</select></div></div>`;

  let corpo;
  if (!dados) {
    corpo = `<div class="card" style="text-align:center;color:#8fa39f;font-size:14px;padding:30px">Escolha um cliente acima para ver o cálculo material a material.<br><span style="font-size:12.5px">${(clientes || []).length ? '' : 'Ainda não há operações concluídas na doca.'}</span></div>`;
  } else {
    const c = dados;
    const tiles = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div class="tile"><b>${nfmt(c.pesoEntradaKg / 1000, 2)}<span style="font-size:13px;color:#7c8a87"> t</span></b><span>peso recebido (real)</span></div>
      <div class="tile"><b>${nfmt(c.coletas)}</b><span>operações</span></div>
      <div class="tile"><b>${nfmt(c.totalKg / 1000, 2)}<span style="font-size:13px;color:#7c8a87"> t</span></b><span>material triado (real)</span></div>
      <div class="tile"><b style="color:#8A6A16;font-size:16px">${c.totalEvitadoT == null ? 'pendente' : nfmt(c.totalEvitadoT, 2) + ' tCO₂e'}</b><span>emissões evitadas (A)</span></div>
    </div>`;
    const linhas = c.linhas.length ? c.linhas.map((l) => `<tr>
      <td><b>${esc(l.rotulo)}</b>${l.destino ? `<div style="color:#9aa7a4;font-size:10px">destino: ${esc(l.destino)}</div>` : ''}</td>
      <td>${l.categoria ? `<span class="cat">${esc(l.categoria)}</span>${l.auto ? '<div style="color:#9aa7a4;font-size:9px;margin-top:2px">auto — a confirmar</div>' : ''}` : '<span class="cat sem">sem categoria</span>'}</td>
      <td style="text-align:right;white-space:nowrap">${nfmt(l.kg, 2)} kg</td>
      <td>${l.fatorValor == null ? `<span class="pend">fator pendente</span>${l.fatorFonte ? `<div style="color:#9aa7a4;font-size:9px;margin-top:3px">${esc(l.fatorFonte)}</div>` : ''}` : `${esc(String(l.fatorValor))} ${esc(l.fatorUnidade || '')}`}</td>
      <td style="text-align:right">${l.evitadoKg == null ? '<span class="pend">pendente</span>' : nfmt(l.evitadoKg / 1000, 3) + ' tCO₂e'}</td>
    </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:#8fa39f;padding:20px">Este cliente ainda não tem materiais triados nas operações.</td></tr>`;
    corpo = `${tiles}
      <div class="card" style="padding:0;overflow-x:auto">
        <table><thead><tr><th>Material (real)</th><th>Categoria de fator</th><th style="text-align:right">Peso</th><th>Fator (metodologia)</th><th style="text-align:right">Evitado (A)</th></tr></thead><tbody>${linhas}</tbody></table>
      </div>
      ${c.semCategoria ? `<div style="font-size:11.5px;color:#8a4b45;margin-top:10px">⚠ Há material <b>sem categoria de fator</b> — precisa de classificação manual (curadoria) antes de contar no cálculo.</div>` : ''}
      <div style="font-size:11px;color:#9aa7a4;margin-top:10px">A = emissões evitadas (benefício, reportado à parte). O inventário do cliente (B, Escopo 3) e a neutralização (C, Adote) são números separados — a metodologia não os mistura.</div>`;
  }
  return `${head('Carbono · Analista')}<body>${topo('carbono · analista', '/carbono/analista')}
<div class="wrap">
  <h1 style="font-size:21px;margin:0 0 4px">Cálculo de carbono — Analista</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 14px">A cozinha: peso real por material × fator da metodologia. É o que alimenta o painel do cliente e o dossiê do auditor.</p>
  ${faixaStatus(dados)}
  ${seletor}
  ${corpo}
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// TELA DO AUDITOR — o dossiê que resiste a auditoria: metodologia (selo) +
// a conta + a cadeia de custódia (evidências) por trás de cada número.
// ---------------------------------------------------------------------------
export function paginaCarbonoAuditor(user, clientes, dados, validacao) {
  const validado = !!(validacao && validacao.hash);
  const linkBtn = 'font-size:12px;font-weight:700;text-decoration:none;border:1px solid #cfe0dd;border-radius:8px;padding:8px 12px;color:#00333B;background:#fff';
  const selo = `<div class="card" style="margin-bottom:16px;border-color:${validado ? '#bfe3c6' : '#f0d9b0'};background:${validado ? '#F1F8EC' : '#FFF9EE'}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div style="min-width:220px"><div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:${validado ? '#1E5B31' : '#8A6A16'}">Metodologia — ${validado ? '✓ validada' : 'aguardando validação'}</div>
        <div style="font-size:13.5px;color:#28413f;margin-top:6px;line-height:1.55">${validado
          ? `Validada por <b>${esc(validacao.validadoPor || 'Villanova ESG')}</b> em ${esc((validacao.em || '').slice(0, 10))} · versão ${esc(validacao.versao || '')}<div style="font-size:10.5px;color:#7c8a87;margin-top:4px;word-break:break-all">selo (hash): ${esc((validacao.hash || '').slice(0, 40))}…</div>`
          : `A receita de cálculo <b>ainda não foi validada</b> pela Villanova ESG. Os pesos e as evidências já são reais; os tCO₂e ficam <b>pendentes</b> até a assinatura.`}</div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a href="/metodologia" style="${linkBtn}">Ver metodologia</a><a href="/validacao" style="${linkBtn}">Área de validação</a></div>
    </div></div>`;
  const opts = ['<option value="">— escolher cliente —</option>'].concat((clientes || []).map((c) =>
    `<option value="${esc(c.cliente)}" ${dados && norm(dados.clienteNome) === norm(c.cliente) ? 'selected' : ''}>${esc(c.cliente)} — ${nfmt(c.coletas)} coleta(s) · ${nfmt(c.entradaKg / 1000, 2)} t</option>`)).join('');
  const seletor = `<div class="card" style="margin-bottom:16px"><label style="font-size:11px;font-weight:800;text-transform:uppercase;color:#7c8a87">Cliente a auditar</label>
    <div style="margin-top:6px"><select id="cli" onchange="if(this.value)location.href='/carbono/auditor?cliente='+encodeURIComponent(this.value)">${opts}</select></div></div>`;

  let corpo;
  if (!dados) {
    corpo = `<div class="card" style="text-align:center;color:#8fa39f;font-size:14px;padding:30px">Escolha um cliente para auditar a conta e a cadeia de custódia.</div>`;
  } else {
    const c = dados;
    const linhas = c.linhas.length ? c.linhas.map((l) => `<tr>
      <td><b>${esc(l.rotulo)}</b></td>
      <td>${l.categoria ? `<span class="cat">${esc(l.categoria)}</span>` : '<span class="cat sem">sem categoria</span>'}</td>
      <td style="text-align:right;white-space:nowrap">${nfmt(l.kg, 2)} kg</td>
      <td>${l.fatorValor == null ? `<span class="pend">pendente</span>${l.fatorFonte ? `<div style="color:#9aa7a4;font-size:9px;margin-top:3px">${esc(l.fatorFonte)}</div>` : ''}` : `${esc(String(l.fatorValor))} ${esc(l.fatorUnidade || '')}`}</td>
      <td style="text-align:right">${l.evitadoKg == null ? '<span class="pend">pendente</span>' : nfmt(l.evitadoKg / 1000, 3) + ' tCO₂e'}</td>
    </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:#8fa39f;padding:18px">Sem materiais triados.</td></tr>`;
    const ops = (c.operacoes || []).map((o) => `<tr>
      <td><b>${esc(o.numero || o.osId)}</b></td>
      <td style="text-align:right;white-space:nowrap">${nfmt(o.entradaKg || 0, 0)} kg</td>
      <td>${o.expirada ? '<span class="pend">registro expirado</span>' : `<a href="/coletas/os/carta?id=${esc(o.osId)}" style="color:#0B5B66;font-size:11.5px">Carta</a> · <a href="/coletas/os/manifesto?id=${esc(o.osId)}" style="color:#0B5B66;font-size:11.5px">Manifesto</a> · <a href="/coletas/os/cdf?id=${esc(o.osId)}" style="color:#0B5B66;font-size:11.5px">CDF</a>`}</td>
    </tr>`).join('') || `<tr><td colspan="3" style="text-align:center;color:#8fa39f;padding:14px">—</td></tr>`;
    corpo = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
        <div class="tile"><b>${nfmt(c.pesoEntradaKg / 1000, 2)}<span style="font-size:13px;color:#7c8a87"> t</span></b><span>peso recebido (real)</span></div>
        <div class="tile"><b>${nfmt(c.coletas)}</b><span>operações auditáveis</span></div>
        <div class="tile"><b style="color:#8A6A16;font-size:16px">${c.totalEvitadoT == null ? 'pendente' : nfmt(c.totalEvitadoT, 2) + ' tCO₂e'}</b><span>emissões evitadas (A)</span></div>
      </div>
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#00333B;margin:6px 0 8px">Conta (A — emissões evitadas)</div>
      <div class="card" style="padding:0;overflow-x:auto;margin-bottom:18px">
        <table><thead><tr><th>Material</th><th>Categoria</th><th style="text-align:right">Peso</th><th>Fator</th><th style="text-align:right">Evitado</th></tr></thead><tbody>${linhas}</tbody></table>
      </div>
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#00333B;margin:6px 0 8px">Cadeia de custódia (evidências por operação)</div>
      <div class="card" style="padding:0;overflow-x:auto;margin-bottom:14px">
        <table><thead><tr><th>Operação</th><th style="text-align:right">Entrada</th><th>Documentos vinculados</th></tr></thead><tbody>${ops}</tbody></table>
      </div>
      <div class="card" style="background:#F7FAF9">
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#00333B;margin-bottom:8px">O que este dossiê comprova</div>
        <div style="font-size:12.5px;color:#28413f;line-height:1.7">✓ Cada quilo vem de uma <b>coleta rastreada</b> (foto + GPS no ato) → pesagem na doca → triagem por material → destinação.<br>✓ Cada operação tem <b>Carta de Descarte, Manifesto e CDF</b> (verificáveis por QR).<br>✓ A conta separa os 3 números (A evitado · B inventário · C neutralização) — <b>não há dupla contagem nem neutralização disfarçada</b>.<br>${validado ? '✓ Fatores <b>validados</b> pela Villanova ESG (selo acima).' : '⚠ Fatores <b>pendentes</b> de validação — nenhum tCO₂e é afirmado como final até a assinatura da Villanova.'}</div>
      </div>`;
  }
  return `${head('Carbono · Auditor')}<body>${topo('carbono · auditor', '/carbono/auditor')}
<div class="wrap">
  <h1 style="font-size:21px;margin:0 0 4px">Dossiê de auditoria — Carbono</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 14px">A conta e a cadeia de custódia por trás de cada número. É o que sustenta o relatório de ESG/CSRD do cliente e resiste a auditoria de terceira parte.</p>
  ${selo}
  ${seletor}
  ${corpo}
</div>
</body></html>`;
}
