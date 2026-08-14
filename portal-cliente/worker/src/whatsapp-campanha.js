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

async function db(env) {
  if (!env.DB_PLOOMES) return null;
  try {
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_campanhas (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT, template_nome TEXT, template_id TEXT, template_lang TEXT, params_json TEXT, publico TEXT, criado_por TEXT, criado_em TEXT, status TEXT, total INTEGER DEFAULT 0, enviados INTEGER DEFAULT 0, falhas INTEGER DEFAULT 0)').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_destinatarios (id INTEGER PRIMARY KEY AUTOINCREMENT, campanha_id INTEGER, tel TEXT, nome TEXT, doc TEXT, status TEXT, detalhe TEXT, em TEXT)').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS wa_optout (tel TEXT PRIMARY KEY, motivo TEXT, em TEXT)').run();
    return env.DB_PLOOMES;
  } catch { return null; }
}

export const PUBLICOS_WA = {
  'teste': 'Teste — só o número que você digitar',
  'clientes-os': 'Clientes que já têm OS no sistema (com telefone)',
  'sem-coleta-6m': 'Clientes com OS, mas SEM coleta nos últimos 6 meses (oferecer coleta)',
  'base-pj': 'Base de empresas (PJ) com telefone — os primeiros 500 em ordem alfabética',
};
const LIMITE_CAMPANHA = 500;

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

// Monta o público (antes de dedupe/supressão). Devolve [{tel, nome, doc}].
export async function montarPublicoWA(env, publico, telTeste) {
  if (publico === 'teste') {
    const t = telWhatsApp(telTeste);
    return t ? [{ tel: t, nome: 'Teste', doc: '' }] : [];
  }
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
  return contatos.map((c) => ({ tel: telWhatsApp(c.telefone), nome: limpar(c.nome), doc: String(c.documento || '').replace(/\D/g, '') })).filter((c) => c.tel);
}

// Prévia: contagem + exemplos, já sem duplicados e sem opt-outs.
export async function previaPublicoWA(env, publico, telTeste) {
  const brutos = await montarPublicoWA(env, publico, telTeste);
  const d = await db(env);
  let optouts = new Set();
  try { if (d) { const r = await d.prepare('SELECT tel FROM wa_optout').all(); optouts = new Set((r.results || []).map((x) => x.tel)); } } catch { /* segue */ }
  const vistos = new Set(); const finais = [];
  for (const c of brutos) {
    if (vistos.has(c.tel) || optouts.has(c.tel)) continue;
    vistos.add(c.tel); finais.push(c);
  }
  const cortados = Math.max(0, finais.length - LIMITE_CAMPANHA);
  return { total: Math.min(finais.length, LIMITE_CAMPANHA), cortados, exemplos: finais.slice(0, 5).map((c) => c.nome || c.tel.slice(0, 6) + '…'), lista: finais.slice(0, LIMITE_CAMPANHA) };
}

export async function prepararCampanhaWA(env, user, dados) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const titulo = limpar(dados && dados.titulo).slice(0, 120);
  if (titulo.length < 3) return { ok: false, message: 'Dê um título para a campanha (ex.: Oferta de coleta — agosto).' };
  const tpl = (dados && dados.template) || {};
  if (!tpl.nome && !tpl.id) return { ok: false, message: 'Escolha o template aprovado.' };
  const publico = String((dados && dados.publico) || '');
  if (!PUBLICOS_WA[publico]) return { ok: false, message: 'Escolha o público.' };
  const params = Array.isArray(dados && dados.params) ? dados.params.map((p) => String(p).slice(0, 200)).slice(0, 10) : [];
  const previa = await previaPublicoWA(env, publico, dados && dados.telTeste);
  if (!previa.lista.length) return { ok: false, message: publico === 'teste' ? 'Digite um número de WhatsApp válido para o teste.' : 'Nenhum destinatário nesse público (com telefone e fora da lista de saída).' };
  const agora = new Date().toISOString();
  await d.prepare('INSERT INTO wa_campanhas (titulo, template_nome, template_id, template_lang, params_json, publico, criado_por, criado_em, status, total) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,\'preparada\',?9)')
    .bind(titulo, String(tpl.nome || ''), String(tpl.id || ''), String(tpl.lang || 'pt_BR'), JSON.stringify(params), publico, (user && user.email) || '', agora, previa.lista.length).run();
  const row = await d.prepare('SELECT id FROM wa_campanhas ORDER BY id DESC LIMIT 1').first();
  const cid = Number(row && row.id);
  for (const c of previa.lista) {
    await d.prepare('INSERT INTO wa_destinatarios (campanha_id, tel, nome, doc, status) VALUES (?1,?2,?3,?4,\'pendente\')').bind(cid, c.tel, c.nome.slice(0, 160), c.doc).run();
  }
  return { ok: true, id: cid, total: previa.lista.length, cortados: previa.cortados };
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
    await d.prepare('UPDATE wa_destinatarios SET status=?2, detalhe=?3, em=?4 WHERE id=?1')
      .bind(dest.id, okEnvio ? 'enviado' : 'falha', okEnvio ? String(r.vencedor || '') : String((r && (r.motivo || '')) + ' ' + ((r && r.detalhe) || '')).slice(0, 200), new Date().toISOString()).run();
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

// --- Página (Diretoria) -----------------------------------------------------------
export function paginaCampanhasWA(user, campanhas, optouts) {
  const fmtDt = (iso) => { const d0 = new Date(iso); if (!iso || isNaN(d0.getTime())) return '—'; d0.setUTCHours(d0.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d0.getUTCDate())}/${p(d0.getUTCMonth() + 1)} ${p(d0.getUTCHours())}:${p(d0.getUTCMinutes())}`; };
  const rows = (campanhas || []).map((c) => {
    const pct = c.total ? Math.round(((c.enviados + c.falhas) / c.total) * 100) : 0;
    return `<div style="border:1px solid #EEF1F0;border-radius:12px;padding:13px 15px;margin-bottom:10px" data-camp="${c.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="min-width:0"><b style="font-size:13.5px">${esc(c.titulo)}</b>
          <span style="display:block;font-size:11px;color:#8fa39f;margin-top:2px">${esc(fmtDt(c.criado_em))} · template ${esc(c.template_nome || c.template_id)} · ${esc(PUBLICOS_WA[c.publico] || c.publico)}</span></div>
        <div style="flex:none;display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;font-weight:800;color:${c.status === 'concluida' ? '#1E5B31' : '#8A6A16'}">${c.enviados}/${c.total} enviados${c.falhas ? ` · <b style="color:#B23A2E">${c.falhas} falhas</b>` : ''}</span>
          ${c.status !== 'concluida' ? `<button class="btn btn-p" style="padding:8px 13px;font-size:12px" onclick="enviarTudo(${c.id},this)">▶ ${c.enviados + c.falhas ? 'Continuar envio' : 'Iniciar envio'}</button>` : '<span style="font-size:10.5px;font-weight:800;color:#1E5B31;background:#E4F3E6;border-radius:999px;padding:3px 9px">✓ CONCLUÍDA</span>'}
          ${c.falhas ? `<button class="btn btn-g" style="padding:8px 11px;font-size:12px" onclick="verFalhas(${c.id})">falhas</button>` : ''}
        </div>
      </div>
      <div style="background:#EEF3F2;border-radius:99px;height:7px;margin-top:9px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:#92C430"></i></div>
      <div class="lote-msg" style="font-size:11.5px;color:#4F6469;margin-top:5px"></div>
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
    <div id="c-corpo" style="display:none;background:#F7FAF9;border:1px dashed #cfe0dd;border-radius:10px;padding:10px 12px;font-size:12px;color:#374b48;margin-top:8px;white-space:pre-wrap"></div>
    <div id="c-params"></div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:6px">Nas variáveis você pode usar <b>{nome}</b> (primeiro nome do contato) e <b>{empresa}</b> (nome completo) — o sistema troca para cada destinatário.</div>
    <label>Público</label>
    <select id="c-pub">${Object.entries(PUBLICOS_WA).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
    <div id="c-teste-wrap"><label>Número para o teste (com DDD)</label><input id="c-tel" inputmode="tel" placeholder="ex.: 11 99999-9999"></div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">
      <button type="button" class="btn btn-g" onclick="previa()">👀 Ver contagem do público</button>
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
  try{var r=await fetch('/api/diretoria/wa/templates');var j=await r.json();
    if(!j.ok){s.innerHTML='<option value="">Não consegui listar ('+(j.motivo||'erro')+') — confira no painel do Gupshup</option>';return;}
    TPLS=j.templates||[];
    var apr=TPLS.filter(function(t){return /approved|enabled/i.test(t.status||'');});
    s.innerHTML='<option value="">— escolha —</option>'+apr.map(function(t,i){return '<option value="'+i+'">'+t.nome+' ('+(t.idioma||'?')+')</option>';}).join('');
    if(!apr.length)s.innerHTML='<option value="">Nenhum template APROVADO — crie no painel do Gupshup e aprove na Meta</option>';
    window.__APR=apr;
  }catch(e){s.innerHTML='<option value="">Sem conexão com o sistema</option>';}
}
el('c-tpl').addEventListener('change',function(){
  var t=(window.__APR||[])[Number(this.value)];var box=el('c-corpo'),pw=el('c-params');pw.innerHTML='';
  if(!t){box.style.display='none';return;}
  if(t.corpo){box.style.display='block';box.textContent=t.corpo;}else{box.style.display='none';}
  var n=0;var m=(t.corpo||'').match(/\\{\\{\\d+\\}\\}/g);if(m){var mx=0;m.forEach(function(x){var v=Number(x.replace(/\\D/g,''));if(v>mx)mx=v;});n=mx;}
  if(!t.corpo){n=Number(prompt('Quantas variáveis {{n}} esse template tem? (0 se nenhuma)','0'))||0;}
  for(var i=1;i<=n;i++){pw.innerHTML+='<label>Variável {{'+i+'}}</label><input class="c-par" placeholder="ex.: {nome}">';}
});
el('c-pub').addEventListener('change',function(){el('c-teste-wrap').style.display=this.value==='teste'?'block':'none';});
el('c-teste-wrap').style.display='block';
function dadosCampanha(){
  var t=(window.__APR||[])[Number(el('c-tpl').value)];
  return {titulo:el('c-titulo').value,template:t?{nome:t.nome,id:t.id,lang:t.idioma||'pt_BR'}:null,
    params:[].map.call(document.querySelectorAll('.c-par'),function(x){return x.value;}),
    publico:el('c-pub').value,telTeste:el('c-tel').value};
}
async function previa(){
  msg('Contando…');
  try{var r=await fetch('/api/diretoria/wa/previa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(dadosCampanha())});
    var j=await r.json();
    if(j.ok){msg('Público: '+j.total+' destinatário(s)'+(j.cortados?' (+'+j.cortados+' acima do limite, fora desta campanha)':'')+(j.exemplos&&j.exemplos.length?' · ex.: '+j.exemplos.join(', '):''));}
    else{msg(j.message||'Não deu.', '#a06a62');}}
  catch(e){msg('Sem conexão.','#a06a62');}
}
async function preparar(){
  var d=dadosCampanha();
  if(!d.template){msg('Escolha o template.','#a06a62');return;}
  msg('Preparando…');
  try{var r=await fetch('/api/diretoria/wa/preparar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});
    var j=await r.json();
    if(j.ok){msg('✓ Campanha preparada com '+j.total+' destinatário(s). Atualizando…','#1E7A3D');setTimeout(function(){location.reload();},800);}
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
async function verFalhas(id){
  var box=document.querySelector('[data-camp="'+id+'"] .falhas-box');
  if(box.style.display==='block'){box.style.display='none';return;}
  box.style.display='block';box.textContent='Carregando falhas…';
  try{var r=await fetch('/api/diretoria/wa/falhas?id='+id);var j=await r.json();
    box.innerHTML=(j.falhas||[]).map(function(f){return '• '+(f.nome||f.tel)+' — '+(f.detalhe||'sem detalhe');}).join('<br>')||'Nenhuma falha registrada.';}
  catch(e){box.textContent='Não consegui carregar.';}
}
async function optout(tel,acao){
  try{var r=await fetch('/api/diretoria/wa/optout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tel:tel,acao:acao})});
    var j=await r.json(); if(j.ok)location.reload(); else alert(j.message||'Não deu.');}
  catch(e){alert('Sem conexão.');}
}
carregarTemplates();
</script></body></html>`;
}
