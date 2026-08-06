// Documentos da Empresa (licenças e NRs da PRÓPRIA Ecobraz — caso SIGRA/Ambiensys).
// Guarda cada documento institucional com emissão/validade, arquivo (R2), o checklist
// de conferência do RT (Marcelo) e alerta automático por e-mail antes de vencer.
// Acesso: escritório, engenharia (RT) e diretoria. Dados no KV (chave única "empdocs").
//
// Alertas: o cron diário (export scheduled em index.js) chama alertasEmpresaDocs(env)
// — avisa a 60/30/7 dias do vencimento, no dia, e 7/30 dias após vencer (com de-dup).

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const dataBR = (iso) => { if (!iso) return ''; const [a, m, d] = String(iso).slice(0, 10).split('-'); return (d && m && a) ? `${d}/${m}/${a}` : ''; };
const hojeISO = () => { const d = new Date(); d.setUTCHours(d.getUTCHours() - 3); return d.toISOString().slice(0, 10); };
const diasAte = (validadeISO, hoje) => Math.round((Date.parse(validadeISO + 'T12:00:00Z') - Date.parse((hoje || hojeISO()) + 'T12:00:00Z')) / 86400000);

// Os 4 documentos do SIGRA já nascem cadastrados (com o parecer do RT no caso).
function seedInicial() {
  const agora = new Date().toISOString();
  return [
    { id: 'licenca-operacao', titulo: 'Licença ambiental de operação/destinação', emissor: 'CETESB', emissao: '', validade: '', indeterminada: false, naoAplica: false, obs: 'SIGRA/Ambiensys aponta pendente. Localizada apenas licença PRÉVIA de 2018 e uma dispensa antiga — não usar como se fossem a licença de operação atual. Obter o documento vigente na CETESB.', arquivo: null, checklist: { cnpj: false, endereco: false, escopo: false, vigencia: false, legivel: false }, atualizadoEm: agora, por: 'sistema' },
    { id: 'pcmso', titulo: 'PCMSO — Programa de Controle Médico de Saúde Ocupacional (NR-7)', emissor: 'Médico do trabalho / consultoria SST', emissao: '', validade: '', indeterminada: false, naoAplica: false, obs: 'Versão localizada é de 2016 — vencida, não usar. Pedir a versão vigente assinada pelo médico responsável.', arquivo: null, checklist: { cnpj: false, endereco: false, escopo: false, vigencia: false, legivel: false }, atualizadoEm: agora, por: 'sistema' },
    { id: 'pgr', titulo: 'PGR — Programa de Gerenciamento de Riscos (NR-1)', emissor: 'Consultoria SST', emissao: '', validade: '', indeterminada: false, naoAplica: false, obs: 'Não localizado PGR atual (substituiu o PPRA desde 2022). Elaborar com a consultoria de segurança do trabalho — normalmente sai junto com o PCMSO.', arquivo: null, checklist: { cnpj: false, endereco: false, escopo: false, vigencia: false, legivel: false }, atualizadoEm: agora, por: 'sistema' },
    { id: 'alvara-sanitario', titulo: 'Alvará sanitário', emissor: 'Vigilância sanitária', emissao: '', validade: '', indeterminada: false, naoAplica: true, obs: 'Parecer do RT (Eng. Marcelo): não se aplica à atividade da Ecobraz. Registrar a justificativa no SIGRA, se a plataforma permitir.', arquivo: null, checklist: { cnpj: false, endereco: false, escopo: false, vigencia: false, legivel: false }, atualizadoEm: agora, por: 'sistema' },
  ];
}

// ARMAZENAMENTO: D1 (banco SQL, leitura consistente na hora). O KV era o depósito
// original, mas a propagação dele demora (~60s) e fazia as alterações "sumirem" ao
// salvar/recarregar — e salvamentos seguidos podiam se sobrescrever. Um registro por
// documento (linha própria), com migração automática do que já existia no KV.
async function d1Docs(env) {
  if (!env.DB_PLOOMES) return null;
  try { await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS empresa_docs (id TEXT PRIMARY KEY, dados TEXT)').run(); return env.DB_PLOOMES; }
  catch { return null; }
}
async function lerDocD1(db, id) {
  try { const r = await db.prepare('SELECT dados FROM empresa_docs WHERE id=?1').bind(String(id)).first(); return r ? JSON.parse(r.dados) : null; }
  catch { return null; }
}
async function gravarDocD1(db, d) {
  await db.prepare('INSERT OR REPLACE INTO empresa_docs (id,dados) VALUES (?1,?2)').bind(d.id, JSON.stringify(d)).run();
}
export async function lerEmpresaDocs(env) {
  const db = await d1Docs(env);
  if (!db) {
    // Sem D1 (não deve acontecer em produção): cai no KV como era.
    if (!env.PORTAL_KV) return [];
    const raw = await env.PORTAL_KV.get('empdocs');
    if (raw) return JSON.parse(raw);
    const seed = seedInicial();
    await env.PORTAL_KV.put('empdocs', JSON.stringify(seed));
    return seed;
  }
  let rows = [];
  try { const r = await db.prepare('SELECT dados FROM empresa_docs ORDER BY rowid').all(); rows = (r.results || []).map((x) => JSON.parse(x.dados)); } catch { rows = []; }
  if (rows.length) return rows;
  // Primeira vez no D1: migra o que já existia no KV (inclusive anexos enviados); senão, semeia.
  let base = null;
  try { const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('empdocs') : null; base = raw ? JSON.parse(raw) : null; } catch { base = null; }
  const docs = (base && base.length) ? base : seedInicial();
  for (const d of docs) { try { await gravarDocD1(db, d); } catch { /* segue */ } }
  return docs;
}

const OK_DATA = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
function aplicarCampos(d, b, user) {
  if (b.titulo != null) d.titulo = limpar(b.titulo).slice(0, 140) || d.titulo;
  if (b.emissor != null) d.emissor = limpar(b.emissor).slice(0, 120);
  if (b.emissao != null) d.emissao = OK_DATA(b.emissao);
  if (b.validade != null) d.validade = OK_DATA(b.validade);
  if (b.indeterminada != null) d.indeterminada = !!b.indeterminada;
  if (b.naoAplica != null) d.naoAplica = !!b.naoAplica;
  if (b.obs != null) d.obs = String(b.obs).slice(0, 1500).trim();
  if (b.checklist && typeof b.checklist === 'object') {
    for (const k of ['cnpj', 'endereco', 'escopo', 'vigencia', 'legivel']) if (b.checklist[k] != null) d.checklist[k] = !!b.checklist[k];
  }
  d.atualizadoEm = new Date().toISOString();
  d.por = (user && user.email) || '';
  return d;
}
function docNovo(titulo) {
  return { id: 'doc-' + Date.now().toString(36), titulo, emissor: '', emissao: '', validade: '', indeterminada: false, naoAplica: false, obs: '', arquivo: null, checklist: { cnpj: false, endereco: false, escopo: false, vigencia: false, legivel: false }, atualizadoEm: '', por: '' };
}
export async function salvarEmpresaDoc(env, user, b) {
  const db = await d1Docs(env);
  if (!db) return { ok: false, message: 'Banco indisponível — tente de novo em instantes.' };
  await lerEmpresaDocs(env); // garante seed/migração antes do primeiro salvar
  const idPedido = String(b.id || '');
  let d = idPedido ? await lerDocD1(db, idPedido) : null;
  if (!d) {
    const titulo = limpar(b.titulo).slice(0, 140);
    if (!titulo) return { ok: false, message: idPedido ? 'Documento não encontrado — recarregue a página.' : 'Dê um nome ao documento.' };
    d = docNovo(titulo);
  }
  aplicarCampos(d, b, user);
  try { await gravarDocD1(db, d); } catch { return { ok: false, message: 'Não consegui gravar — tente de novo.' }; }
  return { ok: true, id: d.id };
}

export async function anexarEmpresaDoc(env, user, id, meta) {
  const db = await d1Docs(env);
  if (!db) return { ok: false, message: 'Banco indisponível — tente de novo em instantes.' };
  await lerEmpresaDocs(env);
  const d = await lerDocD1(db, String(id || ''));
  if (!d) return { ok: false, message: 'Documento não encontrado.' };
  d.arquivo = meta; d.atualizadoEm = new Date().toISOString(); d.por = (user && user.email) || '';
  try { await gravarDocD1(db, d); } catch { return { ok: false, message: 'Não consegui gravar o anexo — tente de novo.' }; }
  return { ok: true };
}

// Situação do documento — a régua que pinta o cartão e dispara os alertas.
export function statusEmpresaDoc(d, hoje) {
  if (d.naoAplica) return { k: 'na', rot: 'Não se aplica', cor: '#64748b', bg: '#f1f5f9' };
  if (!d.arquivo) return { k: 'faltando', rot: 'FALTANDO', cor: '#7a1f1f', bg: '#fde8e8' };
  if (d.indeterminada || !d.validade) return { k: 'ok', rot: 'Vigente (sem vencimento informado)', cor: '#0B6B3A', bg: '#E7F4EC' };
  const dias = diasAte(d.validade, hoje);
  if (dias < 0) return { k: 'vencido', rot: `VENCIDO em ${dataBR(d.validade)}`, cor: '#7a1f1f', bg: '#fde8e8' };
  if (dias <= 60) return { k: 'vencendo', rot: `Vence em ${dias} dia(s) — ${dataBR(d.validade)}`, cor: '#8A6A16', bg: '#FFF4DE' };
  return { k: 'ok', rot: `Vigente até ${dataBR(d.validade)}`, cor: '#0B6B3A', bg: '#E7F4EC' };
}

// --- Alertas por e-mail (chamado pelo cron diário) -----------------------------
export async function alertasEmpresaDocs(env, hoje) {
  if (!env.PORTAL_KV || !env.RESEND_API_KEY) return { ok: false, motivo: 'sem_kv_ou_email' };
  const docs = await lerEmpresaDocs(env);
  const h = hoje || hojeISO();
  const MARCOS = [60, 30, 7, 0, -7, -30];
  const avisos = [];
  for (const d of docs) {
    if (d.naoAplica || !d.validade || d.indeterminada) continue;
    const dias = diasAte(d.validade, h);
    if (!MARCOS.includes(dias)) continue;
    const chave = `empdocalert:${d.id}:${d.validade}:${dias}`;
    if (await env.PORTAL_KV.get(chave)) continue;
    avisos.push({ d, dias, chave });
  }
  if (!avisos.length) return { ok: true, enviados: 0 };
  const listaEnv = env.EMPRESA_DOCS_NOTIFY_EMAILS
    ? String(env.EMPRESA_DOCS_NOTIFY_EMAILS).split(/[,;]+/).map((s) => s.split('|')[0].trim().toLowerCase()).filter(Boolean)
    : ['marcio@ecobraz.org.br', 'marcelo.oliveira@ecobraz.org.br'];
  const dest = [...new Set(listaEnv)].filter((e) => /^\S+@\S+\.\S+$/.test(e)).slice(0, 25);
  if (!dest.length) return { ok: false, motivo: 'sem_destinatarios' };
  const rot = (a) => a.dias > 0 ? `vence em ${a.dias} dia(s) (${dataBR(a.d.validade)})` : a.dias === 0 ? `VENCE HOJE (${dataBR(a.d.validade)})` : `VENCIDO há ${-a.dias} dia(s) (${dataBR(a.d.validade)})`;
  const assunto = `⚠️ Documentos da empresa: ${avisos.length} alerta(s) de vencimento`;
  const texto = `Alerta automático do sistema Ecobraz:\n\n${avisos.map((a) => `- ${a.d.titulo}: ${rot(a)}`).join('\n')}\n\nVer e atualizar: https://sistema.ecobraz.org/empresa/docs\n\nEcobraz · sistema`;
  const htmlCorpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">DOCUMENTOS</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">⚠️ Vencimento de documentos</h1>${avisos.map((a) => `<p style="font-size:14px;line-height:1.5;color:#10262B;background:#FFF4DE;border-radius:10px;padding:11px 13px;margin:0 0 8px"><b>${esc(a.d.titulo)}</b><br><span style="color:#8A6A16;font-weight:700">${esc(rot(a))}</span></p>`).join('')}<a href="https://sistema.ecobraz.org/empresa/docs" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0 0">Abrir Documentos da Empresa →</a></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: dest, subject: assunto, html: htmlCorpo, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) return { ok: false, motivo: 'resend_' + r.status };
  for (const a of avisos) { try { await env.PORTAL_KV.put(a.chave, '1', { expirationTtl: 200 * 86400 }); } catch { /* ok */ } }
  return { ok: true, enviados: avisos.length };
}

// --- Página -------------------------------------------------------------------
export function paginaEmpresaDocs(user, docs) {
  const hoje = hojeISO();
  const CHECKS = [['cnpj', 'Razão social e CNPJ corretos'], ['endereco', 'Unidade e endereço abrangidos'], ['escopo', 'Atividade e escopo aplicáveis'], ['vigencia', 'Emissão, vigência e assinaturas'], ['legivel', 'Versão integral e legível']];
  const card = (d) => {
    const st = statusEmpresaDoc(d, hoje);
    const cks = CHECKS.map(([k, rot]) => `<label style="display:flex;gap:8px;align-items:center;font-size:12px;color:#374b48;margin:4px 0;font-weight:600"><input type="checkbox" data-ck="${k}" ${d.checklist && d.checklist[k] ? 'checked' : ''} style="width:16px;height:16px"> ${rot}</label>`).join('');
    return `<div class="card" data-id="${esc(d.id)}" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
      <div style="min-width:0"><div style="font-size:14.5px;font-weight:800;color:#10262B">${esc(d.titulo)}</div>
      ${d.emissor ? `<div style="font-size:11.5px;color:#8fa39f;margin-top:2px">${esc(d.emissor)}</div>` : ''}</div>
      <span style="flex:none;font-size:11px;font-weight:800;padding:5px 12px;border-radius:20px;color:${st.cor};background:${st.bg}">${esc(st.rot)}</span>
    </div>
    <div class="g3" style="margin-top:6px">
      <div><label>Emissão</label><input type="date" data-f="emissao" value="${esc(d.emissao)}"></div>
      <div><label>Validade</label><input type="date" data-f="validade" value="${esc(d.validade)}"></div>
      <div style="display:flex;flex-direction:column;justify-content:flex-end;gap:5px;padding-bottom:2px">
        <label style="display:flex;gap:7px;align-items:center;margin:0;text-transform:none;letter-spacing:0;font-size:12px;font-weight:600;color:#374b48"><input type="checkbox" data-f="indeterminada" ${d.indeterminada ? 'checked' : ''} style="width:15px;height:15px"> Sem vencimento</label>
        <label style="display:flex;gap:7px;align-items:center;margin:0;text-transform:none;letter-spacing:0;font-size:12px;font-weight:600;color:#374b48"><input type="checkbox" data-f="naoAplica" ${d.naoAplica ? 'checked' : ''} style="width:15px;height:15px"> Não se aplica</label>
      </div>
    </div>
    <div class="sec" style="margin:14px 0 4px">Checklist de conferência (RT)</div>
    ${cks}
    <label>Observações</label><textarea data-f="obs" rows="2">${esc(d.obs || '')}</textarea>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
      ${d.arquivo ? `<a class="btn btn-g" style="padding:8px 13px;font-size:12.5px" href="/empresa/docs/arquivo?id=${esc(d.id)}" target="_blank" rel="noopener">📄 ${esc(d.arquivo.nome)} ↗</a>` : '<span style="font-size:12px;color:#a06a62;font-weight:700">Sem arquivo anexado.</span>'}
      <input type="file" data-file style="display:none">
      <button type="button" class="btn btn-g" style="padding:8px 13px;font-size:12.5px" onclick="this.parentNode.querySelector('[data-file]').click()">${d.arquivo ? '↻ Trocar arquivo' : '＋ Anexar arquivo'}</button>
      <button type="button" class="btn btn-p" style="padding:8px 15px;font-size:12.5px" onclick="salvarDoc(this)">Salvar</button>
      <span class="msg" style="font-size:12px;color:#4F6469"></span>
    </div>
  </div>`;
  };
  return `${head('Documentos da Empresa')}<body>${topo('empresa')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px;flex-wrap:wrap">
    <div><h1 style="font-size:22px;margin:0">🗄️ Documentos da Empresa</h1>
    <p style="font-size:12.5px;color:#7c8a87;margin:4px 0 0;max-width:560px;line-height:1.5">Licenças e programas da própria Ecobraz (caso SIGRA/Ambiensys), com vigência e checklist de conferência. <b>Alerta automático por e-mail</b> a 60/30/7 dias do vencimento, no dia, e depois de vencido.</p></div>
  </div>
  <div id="lista">${docs.map(card).join('')}</div>
  <div class="card" style="border-style:dashed">
    <div class="sec" style="margin-top:0">＋ Adicionar outro documento</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <input id="novo-titulo" placeholder="ex.: AVCB — Auto de Vistoria do Corpo de Bombeiros" style="flex:1;min-width:240px">
      <button type="button" class="btn btn-d" style="padding:10px 16px;font-size:13px" onclick="novoDoc()">Adicionar</button>
      <span id="novo-msg" style="font-size:12px;color:#4F6469"></span>
    </div>
  </div>
</div>
<script>
function coletar(card){
  const g=(s)=>card.querySelector(s);
  const ck={};card.querySelectorAll('[data-ck]').forEach(c=>ck[c.dataset.ck]=c.checked);
  return { id:card.dataset.id, emissao:g('[data-f=emissao]').value, validade:g('[data-f=validade]').value,
    indeterminada:g('[data-f=indeterminada]').checked, naoAplica:g('[data-f=naoAplica]').checked,
    obs:g('[data-f=obs]').value, checklist:ck };
}
async function salvarDoc(btn){
  const card=btn.closest('.card'); const msg=card.querySelector('.msg'); msg.textContent='Salvando…';
  try{const r=await fetch('/api/empresa-docs/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(coletar(card))});
    const j=await r.json(); if(j.ok){msg.textContent='Salvo ✓';location.reload();}else{msg.textContent=j.message||'Não salvou — tente de novo.';}}
  catch{msg.textContent='Falha de rede.';}
}
document.querySelectorAll('[data-file]').forEach(inp=>inp.addEventListener('change',async()=>{
  const card=inp.closest('.card'); const msg=card.querySelector('.msg');
  if(!inp.files || !inp.files[0]) return; msg.textContent='Enviando arquivo…';
  const fd=new FormData(); fd.append('id',card.dataset.id); fd.append('file',inp.files[0]);
  try{const r=await fetch('/api/empresa-docs/arquivo',{method:'POST',body:fd}); const j=await r.json();
    if(j.ok){msg.textContent='Anexado ✓';location.reload();}else{msg.textContent=j.message||'Falha no envio.';}}
  catch{msg.textContent='Falha de rede.';}
}));
async function novoDoc(){
  const t=document.getElementById('novo-titulo').value.trim(); const msg=document.getElementById('novo-msg');
  if(!t){msg.textContent='Escreva o nome do documento.';return;}
  msg.textContent='Criando…';
  try{const r=await fetch('/api/empresa-docs/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({titulo:t})});
    const j=await r.json(); if(j.ok)location.reload(); else msg.textContent=j.message||'Não deu certo.';}
  catch{msg.textContent='Falha de rede.';}
}
</script></body></html>`;
}
function head(titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:12px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
input[type=checkbox]{width:auto}
textarea{resize:vertical}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:18px 0 4px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
@media(max-width:640px){.g3{grid-template-columns:1fr}}
</style></head>`;
}
function topo(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub)}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}
