// Módulo Prevenção de Perdas (só Diretoria).
//
// FILOSOFIA (importante): o controle CONFIÁVEL de desvio é o PESO — o balanço de
// massa (entrada × saída/materiais) que a operação já registra. A IA nas fotos é
// um REFORÇO: compara a foto da coleta com a da doca e levanta uma BANDEIRA de
// divergência visual grosseira; e estima valor por material. Nada aqui acusa
// ninguém — mostramos "divergência a investigar", nunca "fulano roubou". Quem
// decide é humano.
//
// A parte de PESO/VALOR funciona sem depender de nada externo. A parte de IA só
// ativa quando ANTHROPIC_API_KEY estiver no cofre (Cloudflare Secret). Sem a
// chave, o painel mostra a reconciliação e as fotos lado a lado para conferência.

import { listarOperacoes, lerOperacao, balanco, somaMateriais } from './operacional.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const numBR = (n) => Number(n || 0).toLocaleString('pt-BR');
const moedaBR = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soB64 = (s) => { const m = String(s || '').match(/base64,(.*)$/); return m ? m[1] : String(s || ''); };

// Tabela de referência R$/kg por categoria de material. São VALORES DE PARTIDA
// (ilustrativos) — a Diretoria ajusta na tela para os preços reais de mercado.
export const TABELA_PADRAO = {
  placa: { rotulo: 'Placas / PCB', preco: 15 },
  cobre: { rotulo: 'Cobre', preco: 30 },
  aluminio: { rotulo: 'Alumínio', preco: 8 },
  ferro: { rotulo: 'Ferro / aço', preco: 1.5 },
  cabo: { rotulo: 'Cabos / fios', preco: 5 },
  bateria: { rotulo: 'Baterias', preco: 2 },
  plastico: { rotulo: 'Plástico', preco: 1 },
  tela: { rotulo: 'Monitores / telas', preco: 0.5 },
  fonte: { rotulo: 'Fontes / gabinetes', preco: 2 },
  sucata: { rotulo: 'Sucata comum', preco: 0.8 },
};
const CATS = Object.keys(TABELA_PADRAO);
const APELIDOS = {
  placa: ['placa', 'pcb', 'circuito', 'memoria', 'processador', 'ram'],
  cobre: ['cobre', 'bobina'],
  aluminio: ['aluminio', 'alumínio', 'dissipador'],
  ferro: ['ferro', 'aco', 'aço', 'chapa', 'metal', 'carcaca', 'carcaça'],
  cabo: ['cabo', 'fio', 'chicote'],
  bateria: ['bateria', 'pilha', 'nobreak', 'no-break'],
  plastico: ['plastico', 'plástico', 'polim', 'abs'],
  tela: ['monitor', 'tela', 'lcd', 'crt', 'display', 'tv'],
  fonte: ['fonte', 'gabinete', 'cpu', 'desktop', 'servidor', 'switch', 'roteador'],
  sucata: ['sucata', 'diverso', 'misto', 'geral'],
};
function categoriaDe(m) {
  const t = (String(m.rotulo || '') + ' ' + String(m.classe || '') + ' ' + String(m.ibama || '')).toLowerCase();
  for (const cat of CATS) { if ((APELIDOS[cat] || []).some((k) => t.includes(k))) return cat; }
  return 'sucata';
}
export async function lerTabelaPrecos(env) {
  const base = {}; for (const c of CATS) base[c] = { ...TABELA_PADRAO[c] };
  try { const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('precos:materiais') : null; if (raw) { const o = JSON.parse(raw); for (const c of CATS) if (o[c] != null) base[c].preco = Number(o[c]) || base[c].preco; } } catch { /* usa padrão */ }
  return base;
}
export async function salvarTabelaPrecos(env, precos) {
  const o = {}; for (const c of CATS) { const v = Number(precos && precos[c]); if (Number.isFinite(v) && v >= 0) o[c] = v; }
  if (env.PORTAL_KV) await env.PORTAL_KV.put('precos:materiais', JSON.stringify(o));
  return o;
}

// Valor estimado do lote: soma (kg do material × preço da categoria).
export function valorEstimado(op, tabela) {
  const linhas = []; let total = 0;
  for (const m of (op.materiais || [])) {
    const cat = categoriaDe(m); const preco = (tabela[cat] || {}).preco || 0;
    const kg = Number(m.qtd) || 0; const v = kg * preco; total += v;
    linhas.push({ rotulo: m.rotulo || (tabela[cat] || {}).rotulo || cat, cat, kg, preco, valor: v });
  }
  return { linhas, total };
}

// Reconciliação por peso (o controle real). status: ok | atencao | divergencia.
export function reconciliar(op) {
  const b = balanco(op);
  const somaMat = somaMateriais(op);
  let status = 'atencao', motivo = '';
  if (!b.entrada || !b.saida) { status = 'atencao'; motivo = 'Falta peso de entrada ou de saída.'; }
  else if (b.fecha) { status = 'ok'; motivo = `Balanço fecha (${(b.pct * 100).toFixed(1)}%).`; }
  else if (op.saida && op.saida.justificativa) { status = 'atencao'; motivo = `Fora de ±2% — justificado: "${op.saida.justificativa}".`; }
  else { status = 'divergencia'; motivo = `Diferença de ${numBR(b.dif)} kg (${(b.pct * 100).toFixed(1)}%) sem justificativa.`; }
  return { entrada: b.entrada, saida: b.saida, dif: b.dif, pct: b.pct, somaMat, status, motivo };
}

// ---------------------------------------------------------------------------
// IA: compara a foto da coleta com a da doca. Guardada em iaprev:{osId}.
// ---------------------------------------------------------------------------
export function iaConfigurada(env) { return !!env.ANTHROPIC_API_KEY; }

async function primeiraFotoDoca(env, osId) {
  // tenta as fotos da fase inicial da operação (recepção)
  for (const cat of ['carga', 'geral', 'material', 'lote', 'entrada', 'foto1', 'foto']) {
    const v = env.PORTAL_KV ? await env.PORTAL_KV.get(`opfoto:${osId}:inicio:${cat}`) : null;
    if (v) return v;
  }
  return null;
}
export async function lerAnaliseIA(env, osId) {
  if (!env.PORTAL_KV) return null;
  const raw = await env.PORTAL_KV.get(`iaprev:${String(osId).replace(/[^a-zA-Z0-9_-]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
export async function analisarColetaIA(env, osId) {
  if (!iaConfigurada(env)) return { ok: false, erro: 'IA não configurada (falta a chave no cofre).' };
  const fColeta = env.PORTAL_KV ? await env.PORTAL_KV.get(`coletafoto:${osId}`) : null;
  const fDoca = await primeiraFotoDoca(env, osId);
  if (!fColeta || !fDoca) return { ok: false, erro: 'Faltam fotos (coleta e/ou doca) para comparar.' };
  const prompt = 'Você é um auditor de conformidade ambiental da Ecobraz (reciclagem de resíduo eletroeletrônico). '
    + 'Vou te mostrar DUAS fotos do mesmo lote: a primeira foi tirada na COLETA (no cliente) e a segunda na chegada na DOCA da Ecobraz. '
    + 'Compare o material visível nas duas. Seja CONSERVADOR: as fotos têm ângulos, distâncias e iluminação diferentes, e o material pode ter sido reembalado ou compactado no transporte — só considere incompatível se houver diferença GROSSA e evidente de tipo ou quantidade. '
    + 'Você NÃO está acusando ninguém; apenas descreve o que vê para um humano investigar. Não invente detalhes que não consegue ver. '
    + 'Responda SOMENTE com um JSON, sem texto antes ou depois, no formato: '
    + '{"compativel": true, "confianca": "alta|media|baixa", "resumo_coleta": "o que aparece na 1a foto", "resumo_doca": "o que aparece na 2a foto", "observacao": "1 frase; se houver divergência, o que investigar"}';
  const body = {
    model: 'claude-opus-4-8', max_tokens: 700,
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'text', text: 'Foto 1 — COLETA:' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: soB64(fColeta) } },
      { type: 'text', text: 'Foto 2 — DOCA:' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: soB64(fDoca) } },
    ] }],
  };
  let dados = null, bruto = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!r.ok) { const t = await r.text(); return { ok: false, erro: `IA indisponível (${r.status}).`, detalhe: t.slice(0, 200) }; }
    const j = await r.json();
    bruto = ((j.content || []).find((b) => b.type === 'text') || {}).text || '';
    const m = bruto.match(/\{[\s\S]*\}/);
    dados = m ? JSON.parse(m[0]) : null;
  } catch (e) { return { ok: false, erro: 'Falha ao chamar a IA.', detalhe: String(e).slice(0, 200) }; }
  if (!dados) return { ok: false, erro: 'A IA respondeu em formato inesperado.', detalhe: bruto.slice(0, 200) };
  const reg = {
    ok: true, em: agora(),
    compativel: dados.compativel !== false,
    confianca: ['alta', 'media', 'baixa'].includes(dados.confianca) ? dados.confianca : 'baixa',
    resumoColeta: String(dados.resumo_coleta || '').slice(0, 400),
    resumoDoca: String(dados.resumo_doca || '').slice(0, 400),
    observacao: String(dados.observacao || '').slice(0, 400),
  };
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`iaprev:${osId}`, JSON.stringify(reg), { expirationTtl: 60 * 60 * 24 * 365 });
  return reg;
}

// ---------------------------------------------------------------------------
// Dados do painel + página (Diretoria)
// ---------------------------------------------------------------------------
export async function dadosPrevencao(env) {
  const tabela = await lerTabelaPrecos(env);
  const idx = await listarOperacoes(env);
  const alvo = idx.filter((o) => o.etapa === 'validacao' || o.etapa === 'concluida').slice(0, 40);
  const itens = [];
  for (const resumo of alvo) {
    const op = await lerOperacao(env, resumo.osId); if (!op) continue;
    const rec = reconciliar(op);
    const val = valorEstimado(op, tabela);
    const ia = await lerAnaliseIA(env, op.osId);
    itens.push({ osId: op.osId, numero: op.numero, cliente: op.cliente, rec, valorTotal: val.total, ia });
  }
  const totais = itens.reduce((a, it) => {
    a.valor += it.valorTotal;
    if (it.rec.status === 'divergencia') a.divergencias++;
    return a;
  }, { valor: 0, divergencias: 0 });
  return { itens, tabela, totais, iaOn: iaConfigurada(env) };
}

function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:960px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px}
input{border:1px solid #DDE1E6;border-radius:9px;padding:9px 10px;font-size:14px;font-family:inherit;width:110px}
.btn{border:none;border-radius:10px;padding:10px 15px;font-size:13.5px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}
.btn-p{background:#92C430;color:#10262B}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}
</style></head>`;
}
function topo() {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:960px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/diretoria" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">prevenção de perdas</span></a>
    <a href="/diretoria" style="color:#9FC6C1;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
  </div></div>`;
}
const STATUS_PILL = { ok: 'background:#E4F3E6;color:#1E5B31', atencao: 'background:#FFF4DE;color:#8A6A16', divergencia: 'background:#FBE9E7;color:#8a4b45' };
const STATUS_TXT = { ok: 'BALANÇO OK', atencao: 'ATENÇÃO', divergencia: 'DIVERGÊNCIA' };

export function paginaPrevencao(user, dados) {
  const { itens, tabela, totais, iaOn } = dados;
  const linhas = itens.length ? itens.map((it) => {
    const ia = it.ia;
    const iaBloco = ia && ia.ok
      ? `<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:${ia.compativel ? '#F1F8F1' : '#FBE9E7'};border:1px solid ${ia.compativel ? '#cfe6cf' : '#f2cfc9'}">
          <div style="font-size:12px;font-weight:800;color:${ia.compativel ? '#1E5B31' : '#8a4b45'}">🤖 IA: ${ia.compativel ? 'material compatível' : 'possível divergência — investigar'} <span style="font-weight:600;color:#7c8a87">· confiança ${esc(ia.confianca)}</span></div>
          <div style="font-size:11.5px;color:#4F6469;margin-top:5px"><b>Coleta:</b> ${esc(ia.resumoColeta)}<br><b>Doca:</b> ${esc(ia.resumoDoca)}${ia.observacao ? '<br><b>Nota:</b> ' + esc(ia.observacao) : ''}</div></div>`
      : (ia && ia.erro ? `<div style="margin-top:8px;font-size:11.5px;color:#8a4b45">IA: ${esc(ia.erro)}</div>` : '');
    return `<div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div><div style="font-size:14px;font-weight:800">${esc(it.numero)} <span style="font-weight:600;color:#7c8a87">· ${esc(it.cliente || '')}</span></div>
        <div style="font-size:12px;color:#4F6469;margin-top:4px">Entrada ${numBR(it.rec.entrada)} kg · Saída ${numBR(it.rec.saida)} kg · ${esc(it.rec.motivo)}</div></div>
        <span class="pill" style="${STATUS_PILL[it.rec.status]}">${STATUS_TXT[it.rec.status]}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;border-top:1px solid #EEF1F0;padding-top:10px">
        <div style="font-size:13px">Valor estimado (revenda/sucata): <b>R$ ${moedaBR(it.valorTotal)}</b></div>
        ${iaOn ? `<button class="btn btn-g" onclick="analisar(this,'${esc(it.osId)}')">${ia && ia.ok ? '↻ Reanalisar fotos (IA)' : '🤖 Analisar fotos (IA)'}</button>` : ''}
      </div>
      ${iaBloco}
    </div>`;
  }).join('') : `<div class="card" style="text-align:center;color:#8fa39f">Nenhum lote recebido ainda para reconciliar.</div>`;

  const precoInputs = CATS.map((c) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid #F2F5F4">
    <span style="font-size:13px">${esc(tabela[c].rotulo)}</span>
    <div>R$ <input id="p_${c}" inputmode="decimal" value="${esc(String(tabela[c].preco))}"> /kg</div></div>`).join('');

  return `${head('Prevenção de Perdas')}<body>${topo()}
<div class="wrap">
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin:2px 0 16px">
    <div class="card" style="flex:1;min-width:180px"><div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87">Valor estimado no período</div><div style="font-size:24px;font-weight:800;margin-top:4px">R$ ${moedaBR(totais.valor)}</div></div>
    <div class="card" style="flex:1;min-width:180px"><div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87">Divergências a investigar</div><div style="font-size:24px;font-weight:800;margin-top:4px;color:${totais.divergencias ? '#8a4b45' : '#1E5B31'}">${totais.divergencias}</div></div>
  </div>

  <div style="background:#EAF3FB;border:1px solid #cfe0ee;border-radius:12px;padding:12px 15px;margin-bottom:16px;font-size:12.5px;color:#2b4a63">
    <b>Como ler este painel.</b> O controle firme é o <b>peso</b> (balanço de massa). A <b>IA nas fotos</b> é um apoio: aponta divergência visual grosseira para <b>investigar</b> — nunca é prova, nunca acusa ninguém. O <b>valor</b> é estimativa (peso × tabela abaixo).${iaOn ? '' : ' <b>IA ainda não ativada</b> (falta a chave da Anthropic no cofre).'}
  </div>

  <h2 style="font-size:16px;margin:0 0 10px">Lotes recebidos</h2>
  ${linhas}

  <div class="card" style="margin-top:18px">
    <div style="font-size:14px;font-weight:800;margin-bottom:6px">Tabela de preços (R$/kg)</div>
    <div style="font-size:12px;color:#7c8a87;margin-bottom:6px">Valores de referência para a estimativa. Ajuste para os preços reais e salve.</div>
    ${precoInputs}
    <div style="display:flex;gap:10px;align-items:center;margin-top:12px"><button class="btn btn-p" onclick="salvarPrecos()">Salvar preços</button><span id="mp" style="font-size:12.5px;color:#4F6469"></span></div>
  </div>
</div>
<script>
function analisar(btn,osId){var t=btn.textContent;btn.disabled=true;btn.textContent='Analisando… (pode levar alguns segundos)';
  fetch('/api/diretoria/analisar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({osId:osId})}).then(r=>r.json()).then(j=>{if(j.ok||j.erro){location.reload();}else{btn.disabled=false;btn.textContent=t;}}).catch(function(){btn.disabled=false;btn.textContent=t;});}
function salvarPrecos(){var precos={};${CATS.map((c) => `precos['${c}']=(document.getElementById('p_${c}')||{}).value;`).join('')}
  document.getElementById('mp').textContent='Salvando…';
  fetch('/api/diretoria/precos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({precos:precos})}).then(r=>r.json()).then(j=>{document.getElementById('mp').textContent=j.ok?'Preços salvos.':'Falha.';if(j.ok)setTimeout(function(){location.reload();},600);}).catch(function(){document.getElementById('mp').textContent='Sem conexão.';});}
</script>
</body></html>`;
}
