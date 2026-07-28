// Módulo de Cadastro (escritório/comercial — a Débora). Base PRÓPRIA da Ecobraz, sem Ploomes.
// Um cliente é UM único registro: Empresa (PJ, com contato[s] embutidos) OU Pessoa Física (PF).
// Sem cadastro duplicado, sem "amarrar" empresa e pessoa. Guardado no KV (cli:index + cli:{id}).
//
// Autorização: env ESCRITORIO_EMAILS = "email|Nome,email2|Nome2". Login por link mágico (e Google).

import { botaoGoogle } from './google-auth.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const digits = (s) => String(s || '').replace(/\D/g, '');
// Limpa nomes migrados sujos (espaços à esquerda, quebras de linha no fim).
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const fmtCNPJ = (v) => { const d = digits(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (v || ''); };
const fmtCPF = (v) => { const d = digits(v); return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (v || ''); };

// --- Autorização (env ESCRITORIO_EMAILS) ---
export function escritoriosDe(env) {
  const out = new Map();
  for (const par of String(env.ESCRITORIO_EMAILS || '').split(/[,;]+/)) {
    const [em, nome] = par.split('|');
    const e = (em || '').trim().toLowerCase();
    if (e) out.set(e, (nome || '').trim() || e.split('@')[0]);
  }
  return out;
}
export function escritorioPermitido(email, env) { return escritoriosDe(env).has(String(email || '').trim().toLowerCase()); }
export function nomeEscritorio(email, env) { return escritoriosDe(env).get(String(email || '').trim().toLowerCase()) || String(email || '').split('@')[0]; }

// --- Dados (KV) ---
export async function listarClientes(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('cli:index') : null;
  return raw ? JSON.parse(raw) : [];
}
export async function lerCliente(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`cli:${String(id).replace(/[^a-zA-Z0-9_]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}

// ---------------------------------------------------------------------------
// BASE COMPLETA (D1) — a fonte de verdade dos clientes migrados do Ploomes.
// A lista de Cadastro lê daqui (não mais só do índice KV, que era limitado).
// PJ = empresas; PF = pessoas físicas que SÃO clientes (sem company_id — quem é só
// contato de uma empresa aparece dentro da empresa, não solto na lista).
// ---------------------------------------------------------------------------
function condTipoD1(tipo) {
  if (tipo === 'PJ') return "tipo='PJ'";
  if (tipo === 'PF') return "tipo='PF' AND COALESCE(company_id,0)=0";
  return "(tipo='PJ' OR (tipo='PF' AND COALESCE(company_id,0)=0))";
}
export async function listarClientesD1(env, { tipo = '', q = '', pag = 1, porPag = 50 } = {}) {
  if (!env.DB_PLOOMES) return { rows: [], total: 0, totalPags: 1, pag: 1 };
  let where = condTipoD1(tipo);
  const params = [];
  const termo = String(q || '').trim();
  if (termo) {
    params.push('%' + termo + '%'); const pLike = params.length;
    let s = `nome LIKE ?${pLike} OR nome_fantasia LIKE ?${pLike}`;
    const dig = digits(termo);
    if (dig.length >= 3) { params.push('%' + dig + '%'); s += ` OR REPLACE(REPLACE(REPLACE(REPLACE(documento,'.',''),'-',''),'/',''),' ','') LIKE ?${params.length}`; }
    where += ` AND (${s})`;
  }
  const prep = (sql) => { const st = env.DB_PLOOMES.prepare(sql); return params.length ? st.bind(...params) : st; };
  let total = 0;
  try { const c = await prep(`SELECT COUNT(*) AS n FROM contatos WHERE ${where}`).first(); total = Number(c && c.n) || 0; } catch (e) { return { rows: [], total: 0, totalPags: 1, pag: 1, erro: String(e && e.message || e).slice(0, 120) }; }
  const totalPags = Math.max(1, Math.ceil(total / porPag));
  const p = Math.min(Math.max(1, Number(pag) || 1), totalPags);
  const off = (p - 1) * porPag;
  let results = [];
  try { const r = await prep(`SELECT ploomes_id, tipo, nome, nome_fantasia, documento, cidade, uf FROM contatos WHERE ${where} ORDER BY TRIM(nome) COLLATE NOCASE LIMIT ${Number(porPag)} OFFSET ${Number(off)}`).all(); results = r.results || []; } catch { results = []; }
  const rows = results.map((c) => ({
    id: 'p' + c.ploomes_id, tipo: c.tipo,
    nome: limpar(c.tipo === 'PJ' ? (c.nome || c.nome_fantasia) : c.nome) || '(sem nome)',
    doc: c.tipo === 'PJ' ? fmtCNPJ(c.documento) : fmtCPF(c.documento),
    cidade: [limpar(c.cidade), limpar(c.uf)].filter(Boolean).join('/'),
  }));
  return { rows, total, totalPags, pag: p };
}
// Contagens por tipo (para os chips Empresas/Pessoas), direto do banco.
export async function contagensClientesD1(env) {
  if (!env.DB_PLOOMES) return { pj: 0, pf: 0, todos: 0 };
  try {
    const pj = await env.DB_PLOOMES.prepare(`SELECT COUNT(*) AS n FROM contatos WHERE ${condTipoD1('PJ')}`).first();
    const pf = await env.DB_PLOOMES.prepare(`SELECT COUNT(*) AS n FROM contatos WHERE ${condTipoD1('PF')}`).first();
    const npj = Number(pj && pj.n) || 0, npf = Number(pf && pf.n) || 0;
    return { pj: npj, pf: npf, todos: npj + npf };
  } catch { return { pj: 0, pf: 0, todos: 0 }; }
}
// Endereço migrado (coluna TEXT — pode ser JSON ou string simples).
function parseEnderecoD1(txt, cidade, uf) {
  const base = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: cidade || '', uf: uf || '' };
  const t = String(txt || '').trim();
  if (!t) return base;
  if (t[0] === '{') { try { const o = JSON.parse(t); return { ...base, ...o, cidade: o.cidade || base.cidade, uf: o.uf || base.uf }; } catch { /* string simples */ } }
  return { ...base, logradouro: t };
}
// Lê um contato do D1 e devolve no formato "cli" (para a ficha e o formulário).
export async function lerClienteD1(env, ploomesId) {
  if (!env.DB_PLOOMES) return null;
  const pid = Number(digits(ploomesId));
  if (!pid) return null;
  let c = null;
  try { c = await env.DB_PLOOMES.prepare('SELECT ploomes_id,tipo,nome,nome_fantasia,documento,email,telefone,cidade,uf,endereco,company_id,criado_em FROM contatos WHERE ploomes_id=?1').bind(pid).first(); } catch { c = null; }
  if (!c) return null;
  const endereco = parseEnderecoD1(c.endereco, c.cidade, c.uf);
  const base = { id: 'p' + c.ploomes_id, ploomesId: c.ploomes_id, _fonte: 'd1', tipo: c.tipo === 'PJ' ? 'PJ' : 'PF', endereco, criadoEm: c.criado_em || '', companyId: c.company_id || null };
  if (c.tipo === 'PJ') return { ...base, razaoSocial: limpar(c.nome), nomeFantasia: limpar(c.nome_fantasia), cnpj: digits(c.documento), email: limpar(c.email), contatos: [] };
  return { ...base, nome: limpar(c.nome), cpf: digits(c.documento), fone: limpar(c.telefone), email: limpar(c.email) };
}
// Ordens de coleta ANTIGAS (negócios migrados) de um cliente — pelo id do contato
// (ploomes) e/ou pelo documento. status_id 1=aberto, 2=concluído, 3=perdido.
export async function negociosDoCliente(env, cli) {
  if (!env.DB_PLOOMES || !cli) return [];
  const doc = digits(cli.tipo === 'PJ' ? cli.cnpj : cli.cpf);
  const pid = Number(cli.ploomesId) || 0;
  if (!doc && !pid) return [];
  try {
    const r = await env.DB_PLOOMES.prepare(
      `SELECT ploomes_id AS id, titulo, status_id, amount, criado_em
         FROM negocios
        WHERE (?2>0 AND contact_id=?2) OR (?1<>'' AND contact_id IN (SELECT ploomes_id FROM contatos WHERE documento=?1))
        ORDER BY criado_em DESC LIMIT 200`
    ).bind(doc, pid).all();
    return (r.results || []).map((d) => ({
      id: d.id, titulo: limpar(d.titulo) || ('Atendimento ' + d.id),
      status: d.status_id === 2 ? 'Concluída' : (d.status_id === 3 ? 'Perdida' : 'Em atendimento'),
      cor: d.status_id === 2 ? '#1E7A3D' : (d.status_id === 3 ? '#a06a62' : '#8A6A16'),
      data: d.criado_em || '', valor: Number(d.amount) || 0,
    }));
  } catch { return []; }
}
// Espelha um cliente salvo (KV) na base D1, casando por DOCUMENTO (upsert). Assim a
// lista de Cadastro (que lê do D1) já mostra clientes novos/editados. Best-effort.
export async function espelharClienteD1(env, rec) {
  if (!env.DB_PLOOMES || !rec) return null;
  const tipo = rec.tipo === 'PJ' ? 'PJ' : 'PF';
  const doc = digits(tipo === 'PJ' ? rec.cnpj : rec.cpf);
  const nome = tipo === 'PJ' ? (rec.razaoSocial || rec.nomeFantasia || '') : (rec.nome || '');
  const fantasia = tipo === 'PJ' ? (rec.nomeFantasia || '') : '';
  const e = rec.endereco || {};
  const endStr = JSON.stringify({ cep: e.cep || '', logradouro: e.logradouro || '', numero: e.numero || '', complemento: e.complemento || '', bairro: e.bairro || '', cidade: e.cidade || '', uf: e.uf || '' });
  const email = tipo === 'PJ' ? ((rec.contatos && rec.contatos[0] && rec.contatos[0].email) || rec.email || '') : (rec.email || '');
  const fone = tipo === 'PJ' ? ((rec.contatos && rec.contatos[0] && rec.contatos[0].fone) || '') : (rec.fone || '');
  let pid = Number(rec.ploomesId) || 0;
  if (!pid && doc) { const ex = await env.DB_PLOOMES.prepare('SELECT ploomes_id FROM contatos WHERE documento=?1 LIMIT 1').bind(doc).first(); if (ex) pid = Number(ex.ploomes_id); }
  if (pid) {
    await env.DB_PLOOMES.prepare('UPDATE contatos SET tipo=?2,nome=?3,nome_fantasia=?4,documento=?5,email=?6,telefone=?7,cidade=?8,uf=?9,endereco=?10 WHERE ploomes_id=?1')
      .bind(pid, tipo, nome, fantasia, doc, email, fone, e.cidade || '', e.uf || '', endStr).run();
    return pid;
  }
  const mx = await env.DB_PLOOMES.prepare('SELECT COALESCE(MAX(ploomes_id),0) AS mx FROM contatos').first();
  pid = Math.max(900000000, Number(mx && mx.mx) || 0) + 1;
  await env.DB_PLOOMES.prepare('INSERT INTO contatos (ploomes_id,tipo,nome,nome_fantasia,documento,email,telefone,cidade,uf,endereco,company_id,criado_em,importado_em) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,NULL,?11,?11)')
    .bind(pid, tipo, nome, fantasia, doc, email, fone, e.cidade || '', e.uf || '', endStr, agora()).run();
  return pid;
}
// E-mails (minúsculos) de um cliente — a empresa e cada contato (PJ) ou a pessoa
// (PF). Usado no índice de login (climail) para o cliente entrar pelo próprio e-mail.
export function emailsDoCliente(cli) {
  if (!cli) return [];
  const out = [];
  const add = (e) => { const x = String(e || '').trim().toLowerCase(); if (x && x.includes('@') && !out.includes(x)) out.push(x); };
  add(cli.email);
  if (cli.tipo === 'PJ') (cli.contatos || []).forEach((c) => add(c && c.email));
  return out;
}
export async function salvarCliente(env, rec) {
  rec.atualizadoEm = agora();
  if (!rec.id) { rec.id = (rec.tipo === 'PJ' ? 'emp_' : 'pf_') + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 10) : Math.random().toString(36).slice(2, 12)); rec.criadoEm = rec.atualizadoEm; }
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`cli:${rec.id}`, JSON.stringify(rec));
    const idx = await listarClientes(env);
    const resumo = {
      id: rec.id, tipo: rec.tipo,
      nome: rec.tipo === 'PJ' ? (rec.razaoSocial || rec.nomeFantasia || '') : (rec.nome || ''),
      doc: rec.tipo === 'PJ' ? fmtCNPJ(rec.cnpj) : fmtCPF(rec.cpf),
      cidade: (rec.endereco && rec.endereco.cidade) || '', criadoEm: rec.criadoEm,
    };
    const i = idx.findIndex((x) => x.id === rec.id);
    if (i >= 0) idx[i] = resumo; else idx.unshift(resumo);
    await env.PORTAL_KV.put('cli:index', JSON.stringify(idx).slice(0, 900000));
    // Índice de login: e-mail → id do cliente (pro cliente novo entrar no portal).
    try { for (const em of emailsDoCliente(rec)) await env.PORTAL_KV.put(`climail:${em}`, rec.id); } catch { /* não bloqueia o cadastro */ }
  }
  // Espelha na base D1 (a lista de Cadastro lê de lá) — casa por documento. Best-effort.
  try { const pid = await espelharClienteD1(env, rec); if (pid && rec.ploomesId !== pid && env.PORTAL_KV) { rec.ploomesId = pid; await env.PORTAL_KV.put(`cli:${rec.id}`, JSON.stringify(rec)); } } catch { /* não bloqueia o cadastro */ }
  return rec;
}

// Backfill do índice de login: percorre os clientes já cadastrados e (re)grava
// climail:<email> → id, em lotes. Resumível por offset no cli:index — pode rodar
// várias vezes com segurança (idempotente).
export async function reindexarEmailsClientes(env, desde, limite) {
  if (!env.PORTAL_KV) return { ok: false, error: 'KV indisponível', fim: true };
  const idx = await listarClientes(env);
  const total = idx.length;
  const ini = Math.max(0, Number(desde) || 0);
  const fim = Math.min(total, ini + Math.max(1, Number(limite) || 200));
  let emails = 0, clientes = 0;
  for (let i = ini; i < fim; i++) {
    const cli = await lerCliente(env, idx[i] && idx[i].id);
    if (!cli) continue;
    clientes++;
    for (const em of emailsDoCliente(cli)) { try { await env.PORTAL_KV.put(`climail:${em}`, cli.id); emails++; } catch { /* segue */ } }
  }
  return { ok: true, total, proximo: fim, fim: fim >= total, clientes, emails };
}

// Sincroniza os clientes do índice KV para a base D1 (espelha por documento). Garante
// que clientes criados/editados ANTES desta mudança (adote, cadastros novos) apareçam na
// lista de Cadastro (que agora lê do D1). Batched, resumível por offset, idempotente.
export async function sincronizarKVparaD1(env, desde, limite) {
  if (!env.PORTAL_KV || !env.DB_PLOOMES) return { ok: false, error: 'KV/D1 indisponível', fim: true };
  const idx = await listarClientes(env);
  const total = idx.length;
  const ini = Math.max(0, Number(desde) || 0);
  const fim = Math.min(total, ini + Math.max(1, Number(limite) || 100));
  let sincronizados = 0, erros = 0;
  for (let i = ini; i < fim; i++) {
    const cli = await lerCliente(env, idx[i] && idx[i].id);
    if (!cli) continue;
    try { const pid = await espelharClienteD1(env, cli); if (pid && cli.ploomesId !== pid) { cli.ploomesId = pid; await env.PORTAL_KV.put(`cli:${cli.id}`, JSON.stringify(cli)); } sincronizados++; } catch { erros++; }
  }
  return { ok: true, total, proximo: fim, fim: fim >= total, sincronizados, erros };
}

// Busca dados de um CEP (BrasilAPI v2→v1). Só o necessário. null se falhar.
async function buscarCEPDados(cep) {
  let n = String(cep || '').replace(/\D/g, '');
  // CEPs migrados podem ter perdido o zero à esquerda (ex.: 4119002 = 04119-002).
  if (n.length === 7) n = '0' + n; else if (n.length === 6) n = '00' + n;
  if (n.length !== 8) return null;
  const ua = { 'user-agent': 'EcobrazPortal/1.0', accept: 'application/json' };
  for (const u of [`https://brasilapi.com.br/api/cep/v2/${n}`, `https://brasilapi.com.br/api/cep/v1/${n}`]) {
    try {
      const r = await fetch(u, { headers: ua, signal: AbortSignal.timeout(8000) });
      if (r.status === 404) return null;
      if (!r.ok) continue;
      const d = await r.json();
      return { cep: `${n.slice(0, 5)}-${n.slice(5)}`, logradouro: d.street || '', bairro: d.neighborhood || '', cidade: d.city || '', uf: d.state || '' };
    } catch { /* tenta a próxima */ }
  }
  return null;
}

// Backfill de endereços: acha os contatos migrados cujo endereço veio só como CEP
// e preenche rua/bairro/cidade/UF pela consulta de CEP. Lotes pequenos (o CEP é
// consulta externa), resumível por ploomes_id. Idempotente (o que já foi preenchido
// deixa de ser selecionado).
export async function backfillEnderecos(env, desde, limite) {
  if (!env.DB_PLOOMES) return { ok: false, error: 'D1 indisponível', fim: true };
  const D = Math.max(0, Number(desde) || 0);
  const L = Math.max(1, Math.min(40, Number(limite) || 20));
  let rows = [];
  try {
    const r = await env.DB_PLOOMES.prepare(
      "SELECT ploomes_id, endereco FROM contatos WHERE ploomes_id > ?1 AND endereco <> '' AND endereco NOT GLOB '*[A-Za-z]*' AND LENGTH(REPLACE(REPLACE(endereco,'-',''),' ','')) BETWEEN 7 AND 8 ORDER BY ploomes_id LIMIT ?2"
    ).bind(D, L).all();
    rows = r.results || [];
  } catch (e) { return { ok: false, error: 'D1: ' + String((e && e.message) || e).slice(0, 100), fim: true }; }
  let atualizados = 0, ultimo = D;
  for (const row of rows) {
    ultimo = row.ploomes_id;
    const dados = await buscarCEPDados(row.endereco);
    if (!dados || !dados.cidade) continue;
    const enderecoFull = [dados.logradouro, dados.bairro, `${dados.cidade}/${dados.uf}`, dados.cep].filter(Boolean).join(' · ');
    try { await env.DB_PLOOMES.prepare('UPDATE contatos SET endereco=?1, cidade=?2, uf=?3 WHERE ploomes_id=?4').bind(enderecoFull, dados.cidade, dados.uf, row.ploomes_id).run(); atualizados++; } catch { /* segue */ }
  }
  return { ok: true, lote: rows.length, atualizados, proximo: ultimo, fim: rows.length < L };
}

// Página de Manutenção do escritório — ferramentas de "uma passada só" (backfills).
export function paginaManutencao(user) {
  return `${head('Manutenção')}<body>${topo(user, 'cadastro')}
<div class="wrap">
  <a href="/cadastro" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cadastro</a>
  <h1 style="font-size:20px;margin:10px 0 2px">Manutenção</h1>
  <p style="font-size:12.5px;color:#8fa39f;margin:0 0 16px">Ferramentas de uma passada só. Pode fechar e voltar depois — elas continuam de onde pararam.</p>
  <div class="card">
    <div style="font-size:15px;font-weight:800;color:#10262B">🔑 Ativar login dos clientes já cadastrados</div>
    <p style="font-size:13px;color:#4F6469;line-height:1.5;margin:8px 0 12px">Faz com que <b>todo cliente já cadastrado</b> que tenha e-mail consiga entrar no portal (os novos já entram sozinhos). Roda em lotes; é seguro rodar mais de uma vez.</p>
    <button class="btn btn-p" id="bEmail" onclick="rodarEmails()">Ativar login de todos</button>
    <div id="mEmail" style="font-size:13px;color:#4F6469;margin-top:10px"></div>
  </div>
  <div class="card" style="margin-top:14px">
    <div style="font-size:15px;font-weight:800;color:#10262B">📍 Puxar endereço completo (pelo CEP)</div>
    <p style="font-size:13px;color:#4F6469;line-height:1.5;margin:8px 0 12px">Preenche automaticamente rua, bairro, cidade e UF dos clientes migrados que vieram <b>só com o CEP</b>. Vai em lotes pequenos (consulta o CEP um a um) — <b>deixe a aba aberta</b> até terminar. Pode fechar e continuar depois.</p>
    <button class="btn btn-p" id="bEnd" onclick="rodarEnderecos()">Puxar endereços</button>
    <div id="mEnd" style="font-size:13px;color:#4F6469;margin-top:10px"></div>
  </div>
  <div class="card" style="margin-top:14px">
    <div style="font-size:15px;font-weight:800;color:#10262B">🔄 Sincronizar clientes recentes com a base</div>
    <p style="font-size:13px;color:#4F6469;line-height:1.5;margin:8px 0 12px">A lista de clientes agora mostra <b>a base completa</b> (todos os migrados). Esta ferramenta cobre só os clientes criados/editados <b>recentemente</b> (adote, cadastros novos), para garantir que também apareçam. Roda em lotes, seguro repetir.</p>
    <button class="btn btn-p" id="bSync" onclick="rodarSync()">Sincronizar agora</button>
    <div id="mSync" style="font-size:13px;color:#4F6469;margin-top:10px"></div>
  </div>
</div>
<script>
async function rodarEmails(){
  var b=document.getElementById('bEmail'), m=document.getElementById('mEmail');
  b.disabled=true; var desde=0, emails=0, total=0;
  m.textContent='Iniciando…';
  try{
    while(true){
      var r=await fetch('/api/cadastro/reindexar-emails',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({desde:desde})});
      var d=await r.json();
      if(!d.ok){ m.textContent='Erro: '+(d.error||'falhou'); b.disabled=false; return; }
      emails+=d.emails||0; total=d.total||total; desde=d.proximo||desde;
      m.innerHTML='Processados <b>'+Math.min(desde,total)+'/'+total+'</b> clientes · '+emails+' e-mail(s) ativados…';
      if(d.fim){ m.innerHTML='✅ Pronto! <b>'+total+'</b> clientes verificados, <b>'+emails+'</b> e-mail(s) de login ativados.'; b.disabled=false; return; }
    }
  }catch(_){ m.textContent='Sem conexão. Tente de novo — continua de onde parou.'; b.disabled=false; }
}
async function rodarEnderecos(){
  var b=document.getElementById('bEnd'), m=document.getElementById('mEnd');
  b.disabled=true; var desde=0, atualizados=0, lotes=0;
  m.textContent='Iniciando… (pode demorar; deixe a aba aberta)';
  try{
    while(true){
      var r=await fetch('/api/cadastro/backfill-enderecos',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({desde:desde})});
      var d=await r.json();
      if(!d.ok){ m.textContent='Erro: '+(d.error||'falhou'); b.disabled=false; return; }
      atualizados+=d.atualizados||0; lotes++; desde=d.proximo||desde;
      m.innerHTML='Lote '+lotes+' · <b>'+atualizados+'</b> endereço(s) preenchido(s)…';
      if(d.fim){ m.innerHTML='✅ Pronto! <b>'+atualizados+'</b> endereço(s) completados a partir do CEP.'; b.disabled=false; return; }
    }
  }catch(_){ m.textContent='Parou (conexão). Clique de novo — continua de onde parou.'; b.disabled=false; }
}
async function rodarSync(){
  var b=document.getElementById('bSync'), m=document.getElementById('mSync');
  b.disabled=true; var desde=0, sinc=0, total=0;
  m.textContent='Iniciando…';
  try{
    while(true){
      var r=await fetch('/api/cadastro/sync-d1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({desde:desde})});
      var d=await r.json();
      if(!d.ok){ m.textContent='Erro: '+(d.error||'falhou'); b.disabled=false; return; }
      sinc+=d.sincronizados||0; total=d.total||total; desde=d.proximo||desde;
      m.innerHTML='Sincronizados <b>'+Math.min(desde,total)+'/'+total+'</b>…';
      if(d.fim){ m.innerHTML='✅ Pronto! <b>'+total+'</b> clientes sincronizados com a base.'; b.disabled=false; return; }
    }
  }catch(_){ m.textContent='Sem conexão. Clique de novo — continua de onde parou.'; b.disabled=false; }
}
</script></body></html>`;
}

// Busca dados públicos do CNPJ para pré-preencher o cadastro (menos digitação).
// Robusto: tenta a BrasilAPI e, se falhar/estiver fora, cai para a publica.cnpj.ws.
export async function consultarCNPJ(cnpj) {
  const n = digits(cnpj); if (n.length !== 14) return null;
  // Fonte 1 — BrasilAPI
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
    if (r.ok) {
      const d = await r.json();
      if (d && (d.razao_social || d.cep || d.municipio)) return {
        razaoSocial: d.razao_social || '', nomeFantasia: d.nome_fantasia || '',
        cep: d.cep ? String(d.cep) : '', logradouro: d.logradouro || '', numero: d.numero ? String(d.numero) : '',
        complemento: d.complemento || '', bairro: d.bairro || '', cidade: d.municipio || '', uf: d.uf || '',
        email: d.email || '', fone: d.ddd_telefone_1 || '',
      };
    }
  } catch { /* cai para a fonte 2 */ }
  // Fonte 2 — publica.cnpj.ws (formato diferente)
  try {
    const r = await fetch(`https://publica.cnpj.ws/cnpj/${n}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
    if (r.ok) {
      const d = await r.json();
      const est = d && d.estabelecimento;
      if (est) return {
        razaoSocial: d.razao_social || '', nomeFantasia: est.nome_fantasia || '',
        cep: est.cep ? String(est.cep) : '', logradouro: [est.tipo_logradouro, est.logradouro].filter(Boolean).join(' ').trim(), numero: est.numero ? String(est.numero) : '',
        complemento: est.complemento || '', bairro: est.bairro || '', cidade: (est.cidade && est.cidade.nome) || '', uf: (est.estado && est.estado.sigla) || '',
        email: est.email || '', fone: [est.ddd1, est.telefone1].filter(Boolean).join(' ').trim(),
      };
    }
  } catch { /* ambas falharam */ }
  return null;
}

// --- Páginas ---
function head(titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
textarea{resize:vertical}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.g3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:0 16px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:22px 0 4px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
@media(max-width:640px){.g2,.g3{grid-template-columns:1fr}}
</style></head>`;
}
function topo(user, sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'cadastro')}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}

export function paginaLoginEscritorio(googleOn) {
  return `${head('Cadastro')}<body style="display:flex;align-items:center;min-height:100vh;background:#00333B">
<div style="max-width:400px;margin:0 auto;padding:32px 24px;width:100%">
  <div style="text-align:center;margin-bottom:24px"><span style="color:#fff;font-size:26px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">cadastro</span></div>
  <div class="card">
    <h1 style="margin:0 0 8px;font-size:20px;color:#00333B">Cadastro &amp; Clientes</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6">Acesso da equipe Ecobraz.</p>
    ${googleOn ? botaoGoogle('escritorio') : ''}
    <input id="e" type="email" inputmode="email" placeholder="seu e-mail">
    <button id="b" class="btn btn-p" style="width:100%;margin-top:12px">Entrar</button>
    <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px"></div>
  </div>
</div>
<script>const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/cadastro/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail estiver cadastrado, enviamos o link.';}catch{m.textContent='Tente de novo.';}b.disabled=false;};
e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});</script></body></html>`;
}

export function paginaCadastroHome(user, clientes, q = '', totalFiltrado = null, totalGeral = null, opts = {}) {
  const tf = totalFiltrado == null ? clientes.length : totalFiltrado;
  const tipo = opts.tipo === 'PJ' || opts.tipo === 'PF' ? opts.tipo : '';
  const pag = Math.max(1, Number(opts.pag || 1));
  const totalPags = Math.max(1, Number(opts.totalPags || 1));
  const base = (params) => { const kv = []; if (q) kv.push('q=' + encodeURIComponent(q)); const t = params && 'tipo' in params ? params.tipo : tipo; if (t) kv.push('tipo=' + t); if (params && params.p) kv.push('p=' + params.p); return '/cadastro' + (kv.length ? '?' + kv.join('&') : ''); };
  const linhas = clientes.length ? clientes.map((c) => `<a href="/cadastro/cliente?id=${esc(c.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#10262B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nome || '(sem nome)')}</div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${esc(c.doc || '')}${c.cidade ? ' · ' + esc(c.cidade) : ''}</div></div>
      <span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;${c.tipo === 'PJ' ? 'background:#E3F0F3;color:#0B5B66' : 'background:#EAF2E6;color:#3f7a2e'}">${c.tipo === 'PJ' ? 'EMPRESA' : 'PESSOA FÍSICA'}</span>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">${q ? 'Nenhum cliente encontrado para essa busca.' : (tipo ? 'Nenhum cliente desse tipo.' : 'Nenhum cliente cadastrado ainda.<br>Comece criando uma empresa ou pessoa física acima.')}</div>`;
  const chip = (lbl, tp) => `<a href="${base({ tipo: tp, p: 0 })}" style="text-decoration:none;font-size:12px;font-weight:800;padding:6px 13px;border-radius:20px;border:1.5px solid ${tipo === tp ? '#00333B' : '#cfe0dd'};background:${tipo === tp ? '#00333B' : '#fff'};color:${tipo === tp ? '#fff' : '#00333B'}">${lbl}</a>`;
  const pager = totalPags > 1 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;gap:10px">
    ${pag > 1 ? `<a href="${base({ p: pag - 1 })}" class="btn btn-g" style="padding:9px 14px;text-decoration:none">← Anterior</a>` : '<span></span>'}
    <span style="font-size:12px;color:#7c8a87">Página <b>${pag}</b> de <b>${totalPags}</b></span>
    ${pag < totalPags ? `<a href="${base({ p: pag + 1 })}" class="btn btn-g" style="padding:9px 14px;text-decoration:none">Próxima →</a>` : '<span></span>'}
  </div>` : '';
  return `${head('Cadastro')}<body>${topo(user, 'cadastro')}
<div class="wrap">
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <a href="/cadastro/novo?tipo=PJ" class="btn btn-d">＋ Nova empresa</a>
    <a href="/cadastro/novo?tipo=PF" class="btn btn-g">＋ Nova pessoa física</a>
    <a href="/cadastro/manutencao" style="margin-left:auto;font-size:12.5px;font-weight:700;color:#7c8a87;text-decoration:none">⚙ Manutenção</a>
  </div>
  <form method="get" action="/cadastro" style="margin:0 0 10px">${tipo ? `<input type="hidden" name="tipo" value="${tipo}">` : ''}<input name="q" value="${esc(q)}" placeholder="🔎 Buscar por nome ou documento e apertar Enter…" autocomplete="off"></form>
  <div style="display:flex;gap:8px;margin-bottom:12px">${chip('Todos', '')}${chip('Empresas', 'PJ')}${chip('Pessoas', 'PF')}</div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-size:13px;font-weight:800">${q ? 'Resultados' : (tipo === 'PJ' ? 'Empresas' : tipo === 'PF' ? 'Pessoas físicas' : 'Clientes')}</div><span style="font-size:11px;background:#E3F0F3;color:#0B5B66;font-weight:800;padding:3px 9px;border-radius:20px">${tf.toLocaleString('pt-BR')}</span></div>
  <div id="lista">${linhas}</div>
  ${pager}
</div>
</body></html>`;
}

function contatoRowHTML(c) {
  c = c || {};
  return `<div class="contato" style="border:1px solid #EEF1F0;border-radius:10px;padding:12px;margin-bottom:10px;background:#FBFDFC">
    <div class="g2"><div><label>Nome do contato</label><input class="c-nome" value="${esc(c.nome || '')}"></div><div><label>Cargo</label><input class="c-cargo" value="${esc(c.cargo || '')}"></div></div>
    <div class="g2"><div><label>Telefone</label><input class="c-fone" value="${esc(c.fone || '')}"></div><div><label>E-mail</label><input class="c-email" value="${esc(c.email || '')}"></div></div>
    <div class="g2"><div><label>Status</label><input class="c-status" value="${esc(c.status || '')}" placeholder="ex.: Ativo"></div><div></div></div>
    <button type="button" class="rm-contato" style="margin-top:8px;background:none;border:none;color:#B23A2E;font-size:12px;font-weight:700;cursor:pointer">remover contato</button>
  </div>`;
}

export function paginaFormCliente(user, tipo, cli, leadId) {
  const editando = !!(cli && cli.id);
  tipo = (cli && cli.tipo) || (tipo === 'PF' ? 'PF' : 'PJ');
  const e = (cli && cli.endereco) || {};
  const contatos = (cli && Array.isArray(cli.contatos) && cli.contatos.length) ? cli.contatos : [{}];
  const enderecoBloco = `<div class="sec">Endereço</div>
    <div class="g3"><div><label>CEP</label><input id="cep" inputmode="numeric" placeholder="00000-000" value="${esc(e.cep || '')}" onblur="buscarCEP()"></div><div style="grid-column:span 2"><label>Logradouro</label><input id="logradouro" value="${esc(e.logradouro || '')}"></div></div>
    <div class="g3"><div><label>Número</label><input id="numero" value="${esc(e.numero || '')}"></div><div><label>Complemento</label><input id="complemento" value="${esc(e.complemento || '')}"></div><div><label>Bairro</label><input id="bairro" value="${esc(e.bairro || '')}"></div></div>
    <div class="g2"><div><label>Cidade</label><input id="cidade" value="${esc(e.cidade || '')}"></div><div><label>UF</label><input id="uf" maxlength="2" value="${esc(e.uf || '')}"></div></div>`;

  const corpo = tipo === 'PJ' ? `
    <div class="sec">Empresa</div>
    <div class="g2"><div><label>Razão social *</label><input id="razaoSocial" value="${esc(cli?.razaoSocial || '')}"></div><div><label>Nome fantasia</label><input id="nomeFantasia" value="${esc(cli?.nomeFantasia || '')}"></div></div>
    <label>CNPJ</label>
    <div style="display:flex;gap:8px"><input id="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" value="${esc(cli?.cnpj || '')}"><button type="button" class="btn btn-g" style="flex:none;white-space:nowrap" onclick="buscarCNPJ()">Buscar dados</button></div>
    <div class="g2"><div><label>Inscrição estadual</label><input id="ie" value="${esc(cli?.ie || '')}"></div><div></div></div>
    ${enderecoBloco}
    <div class="sec">Contatos da empresa</div>
    <div id="contatos">${contatos.map(contatoRowHTML).join('')}</div>
    <button type="button" class="btn btn-g" onclick="addContato()" style="padding:9px 14px;font-size:13px">＋ Adicionar contato</button>
    <div class="sec">Comercial (opcional)</div>
    <div class="g2"><div><label>Status da empresa</label><input id="statusEmpresa" value="${esc(cli?.status || '')}" placeholder="ex.: Ativo"></div><div><label>Nº de contrato</label><input id="contrato" value="${esc(cli?.contrato || '')}"></div></div>
    <div class="g2"><div><label>Condição de pagamento</label><select id="pagamento">${['', 'À vista', 'Faturado 15 dias', 'Faturado 30 dias', 'Boleto', 'Outro'].map((o) => `<option ${cli?.pagamento === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div><div></div></div>
    <label>Observação / instrução padrão de coleta</label><textarea id="obsColeta" rows="2">${esc(cli?.obsColeta || '')}</textarea>
  ` : `
    <div class="sec">Pessoa física</div>
    <div class="g2"><div><label>Nome completo *</label><input id="nome" value="${esc(cli?.nome || '')}"></div><div><label>CPF</label><input id="cpf" inputmode="numeric" placeholder="000.000.000-00" value="${esc(cli?.cpf || '')}" onblur="validarCPF()"><div id="cpfMsg" style="font-size:11.5px;font-weight:700;margin-top:4px"></div></div></div>
    <div class="g2"><div><label>Telefone</label><input id="fone" value="${esc(cli?.fone || '')}"></div><div><label>E-mail</label><input id="email" value="${esc(cli?.email || '')}"></div></div>
    ${enderecoBloco}
    <label>Observação / instrução de coleta</label><textarea id="obsColeta" rows="2">${esc(cli?.obsColeta || '')}</textarea>
  `;

  return `${head(editando ? 'Editar cliente' : 'Novo cliente')}<body>${topo(user, 'cadastro')}
<div class="wrap">
  <a href="${editando ? `/cadastro/cliente?id=${esc(cli.id)}` : '/cadastro'}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Voltar</a>
  <h1 style="font-size:20px;margin:10px 0 2px">${editando ? 'Editar' : 'Novo'} ${tipo === 'PJ' ? 'cliente (empresa)' : 'cliente (pessoa física)'}</h1>
  <p style="font-size:12.5px;color:#8fa39f;margin:0 0 14px">Um único registro — ${tipo === 'PJ' ? 'com os contatos embutidos, sem cadastro separado.' : 'simples e direto.'}</p>
  <div class="card">${corpo}
    <input type="hidden" id="tipo" value="${tipo}"><input type="hidden" id="id" value="${esc(cli?.id || '')}">
    <div style="display:flex;gap:10px;align-items:center;margin-top:22px">
      <button class="btn btn-p" onclick="salvar()">Salvar cliente</button>
      <span id="m" style="font-size:13px;color:#4F6469"></span>
    </div>
  </div>
</div>
<script>
var LEAD_ORIGEM=${JSON.stringify(leadId || '')};
function msg(t){document.getElementById('m').textContent=t;}
function g(id){const el=document.getElementById(id);return el?el.value.trim():'';}
function addContato(){var w=document.getElementById('contatos');var d=document.createElement('div');d.className='contato';d.style.cssText='border:1px solid #EEF1F0;border-radius:10px;padding:12px;margin-bottom:10px;background:#FBFDFC';
  d.innerHTML='<div class="g2"><div><label>Nome do contato</label><input class="c-nome"></div><div><label>Cargo</label><input class="c-cargo"></div></div><div class="g2"><div><label>Telefone</label><input class="c-fone"></div><div><label>E-mail</label><input class="c-email"></div></div><div class="g2"><div><label>Status</label><input class="c-status" placeholder="ex.: Ativo"></div><div></div></div><button type="button" class="rm-contato" style="margin-top:8px;background:none;border:none;color:#B23A2E;font-size:12px;font-weight:700;cursor:pointer">remover contato</button>';
  w.appendChild(d);}
document.addEventListener('click',function(ev){if(ev.target&&ev.target.classList.contains('rm-contato')){var c=ev.target.closest('.contato');if(c)c.remove();}});
function buscarCNPJ(){var n=(document.getElementById('cnpj').value||'').replace(/\\D/g,'');if(n.length!==14){msg('CNPJ deve ter 14 dígitos.');return;}msg('Buscando dados do CNPJ…');
  fetch('/api/cadastro/cnpj?n='+n).then(r=>r.json()).then(d=>{if(!d||!d.ok){msg('Não encontrei esse CNPJ — preencha manualmente.');return;}var s=function(id,v){if(v&&document.getElementById(id)&&!document.getElementById(id).value)document.getElementById(id).value=v;};s('razaoSocial',d.razaoSocial);s('nomeFantasia',d.nomeFantasia);s('cep',d.cep);s('logradouro',d.logradouro);s('numero',d.numero);s('complemento',d.complemento);s('bairro',d.bairro);s('cidade',d.cidade);s('uf',d.uf);msg('Dados preenchidos ✓ confira e complete.');}).catch(()=>msg('Sem conexão — preencha manualmente.'));}
function buscarCEP(){var c=document.getElementById('cep');if(!c)return;var n=(c.value||'').replace(/\\D/g,'');if(n.length!==8)return;
  fetch('https://viacep.com.br/ws/'+n+'/json/').then(function(r){return r.json();}).then(function(d){if(!d||d.erro)return;var s=function(id,v){var el=document.getElementById(id);if(el&&v)el.value=v;};s('logradouro',d.logradouro);s('bairro',d.bairro);s('cidade',d.localidade);s('uf',d.uf);var comp=document.getElementById('complemento');if(comp&&!comp.value&&d.complemento)comp.value=d.complemento;var num=document.getElementById('numero');if(num&&!num.value)num.focus();}).catch(function(){});}
function cpfValido(v){var s=0,r,i;for(i=0;i<9;i++)s+=parseInt(v.charAt(i),10)*(10-i);r=(s*10)%11;if(r===10)r=0;if(r!==parseInt(v.charAt(9),10))return false;s=0;for(i=0;i<10;i++)s+=parseInt(v.charAt(i),10)*(11-i);r=(s*10)%11;if(r===10)r=0;return r===parseInt(v.charAt(10),10);}
function validarCPF(){var el=document.getElementById('cpf'),m=document.getElementById('cpfMsg');if(!el||!m)return;var v=(el.value||'').replace(/\\D/g,'');if(!v){m.textContent='';return;}
  if(v.length!==11||/^(\\d)\\1{10}$/.test(v)||!cpfValido(v)){m.textContent='⚠ CPF inválido — confira os números.';m.style.color='#B23A2E';}else{m.textContent='✓ CPF válido';m.style.color='#3f7a2e';}}
function salvar(){var tipo=g('tipo');var rec={tipo:tipo,endereco:{cep:g('cep'),logradouro:g('logradouro'),numero:g('numero'),complemento:g('complemento'),bairro:g('bairro'),cidade:g('cidade'),uf:g('uf')},obsColeta:g('obsColeta')};
  var id=g('id');if(id)rec.id=id;
  if(tipo==='PJ'){rec.razaoSocial=g('razaoSocial');rec.nomeFantasia=g('nomeFantasia');rec.cnpj=g('cnpj');rec.ie=g('ie');rec.contrato=g('contrato');rec.pagamento=g('pagamento');rec.status=g('statusEmpresa');
    rec.contatos=Array.prototype.map.call(document.querySelectorAll('.contato'),function(c){var st=c.querySelector('.c-status');return{nome:c.querySelector('.c-nome').value.trim(),cargo:c.querySelector('.c-cargo').value.trim(),fone:c.querySelector('.c-fone').value.trim(),email:c.querySelector('.c-email').value.trim(),status:st?st.value.trim():''};}).filter(function(x){return x.nome||x.fone||x.email;});
    if(!rec.razaoSocial){msg('Informe a razão social.');return;}}
  else{rec.nome=g('nome');rec.cpf=g('cpf');rec.fone=g('fone');rec.email=g('email');if(!rec.nome){msg('Informe o nome.');return;}}
  if(LEAD_ORIGEM)rec.leadOrigem=LEAD_ORIGEM;
  msg('Salvando…');
  fetch('/api/cadastro/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/cadastro/cliente?id='+j.id;}else{msg(j.error||'Erro ao salvar.');}}).catch(()=>msg('Sem conexão. Tente de novo.'));}
</script>
</body></html>`;
}

// Arquivos migrados do Ploomes ligados a este cliente — casados pelo CNPJ/CPF
// (cliente → contato migrado com o mesmo documento → arquivos no R2).
export async function arquivosDoCliente(env, cli) {
  if (!env.DB_PLOOMES || !cli) return [];
  const doc = digits(cli.tipo === 'PJ' ? cli.cnpj : cli.cpf);
  if (doc.length < 11) return [];
  try {
    const r = await env.DB_PLOOMES.prepare(
      "SELECT r2_key, nome_arquivo, content_type, tamanho, fonte, criado_em FROM arquivos_ploomes WHERE contact_id IN (SELECT ploomes_id FROM contatos WHERE documento = ?1) ORDER BY (fonte='documento') DESC, criado_em DESC LIMIT 300"
    ).bind(doc).all();
    return r.results || [];
  } catch { return []; }
}

export function paginaClienteDetalhe(user, cli, arquivos, negocios) {
  const negs = negocios || [];
  const temDoc = cli.tipo === 'PJ' ? !!digits(cli.cnpj) : !!digits(cli.cpf);
  const negRows = negs.length ? negs.map((n) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #EEF1F0;border-radius:10px;padding:10px 12px;margin-bottom:7px;background:#FBFDFC">
      <div style="min-width:0"><div style="font-size:12.5px;font-weight:700;color:#10262B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.titulo)}</div><div style="font-size:11px;color:#8fa39f">${esc(dataBR(n.data))}</div></div>
      <span style="flex:none;font-size:10.5px;font-weight:800;color:${n.cor || '#8A6A16'}">${esc(n.status)}</span>
    </div>`).join('') : '<div style="font-size:12.5px;color:#8fa39f">Nenhuma ordem de coleta anterior encontrada para este cliente.</div>';
  const uploadUI = temDoc ? `<div style="border-top:1px dashed #E4EBE9;margin-top:12px;padding-top:12px">
      <input type="file" id="arqFile" style="display:none" onchange="subirAnexo()">
      <button type="button" class="btn btn-g" style="padding:9px 14px;font-size:13px" onclick="document.getElementById('arqFile').click()">＋ Adicionar anexo</button>
      <span id="arqMsg" style="font-size:12px;color:#4F6469;margin-left:10px"></span>
    </div>` : `<div style="font-size:12px;color:#a06a62;margin-top:10px">Cadastre o ${cli.tipo === 'PJ' ? 'CNPJ' : 'CPF'} para poder anexar documentos a este cliente.</div>`;
  const e = cli.endereco || {};
  const endereco = [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' · ');
  const linha = (l, v) => v ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#6B7B78;width:38%">${esc(l)}</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600">${esc(v)}</td></tr>` : '';
  const fmtTam = (n) => { n = Number(n || 0); if (!n) return ''; return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
  const iconArq = (ct, nome) => { const s = (String(ct || '') + ' ' + String(nome || '')).toLowerCase(); if (/pdf/.test(s)) return '📕'; if (/image|jpg|jpeg|png|gif|webp/.test(s)) return '🖼️'; if (/zip|rar/.test(s)) return '🗜️'; if (/xml/.test(s)) return '📑'; if (/sheet|excel|xls|csv/.test(s)) return '📊'; if (/word|\bdoc/.test(s)) return '📘'; return '📄'; };
  const arqs = arquivos || [];
  const semDoc = cli.tipo === 'PJ' ? !digits(cli.cnpj) : !digits(cli.cpf);
  const arqRows = arqs.length ? arqs.map((a) => `<a href="/cadastro/arquivo?key=${encodeURIComponent(a.r2_key)}&nome=${encodeURIComponent(a.nome_arquivo || '')}" target="_blank" rel="noopener" style="display:flex;justify-content:space-between;align-items:center;gap:10px;text-decoration:none;border:1px solid #EEF1F0;border-radius:10px;padding:10px 12px;margin-bottom:7px;background:#FBFDFC">
      <div style="min-width:0;display:flex;align-items:center;gap:9px"><span style="font-size:18px;flex:none">${iconArq(a.content_type, a.nome_arquivo)}</span><span style="font-size:12.5px;color:#10262B;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.nome_arquivo || a.r2_key)}</span></div>
      <span style="flex:none;font-size:11px;color:#8fa39f">${a.fonte === 'documento' ? 'proposta' : 'anexo'}${fmtTam(a.tamanho) ? ' · ' + fmtTam(a.tamanho) : ''} ↗</span>
    </a>`).join('') : `<div style="font-size:12.5px;color:#8fa39f">Nenhum documento migrado encontrado para este cliente.${semDoc ? ' Cadastre o ' + (cli.tipo === 'PJ' ? 'CNPJ' : 'CPF') + ' para localizar os arquivos.' : ''}</div>`;
  const contatos = (cli.contatos || []).filter((c) => c.nome || c.fone || c.email).map((c) => `<div style="border:1px solid #EEF1F0;border-radius:10px;padding:11px 13px;margin-bottom:8px"><div style="font-weight:800;font-size:13.5px">${esc(c.nome || '')}${c.cargo ? ` <span style="font-weight:600;color:#7c8a87">· ${esc(c.cargo)}</span>` : ''}${c.status ? ` <span style="display:inline-block;font-size:10.5px;font-weight:700;color:#0B6B3A;background:#E7F4EC;border-radius:999px;padding:1px 8px;vertical-align:middle">${esc(c.status)}</span>` : ''}</div><div style="font-size:12.5px;color:#4F6469;margin-top:3px">${[c.fone, c.email].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('') || '<div style="font-size:12.5px;color:#8fa39f">Sem contatos cadastrados.</div>';
  return `${head(cli.tipo === 'PJ' ? (cli.razaoSocial || 'Empresa') : (cli.nome || 'Pessoa física'))}<body>${topo(user, 'cadastro')}
<div class="wrap">
  <a href="/cadastro" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Todos os clientes</a>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 16px">
    <div><span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;${cli.tipo === 'PJ' ? 'background:#E3F0F3;color:#0B5B66' : 'background:#EAF2E6;color:#3f7a2e'}">${cli.tipo === 'PJ' ? 'EMPRESA' : 'PESSOA FÍSICA'}</span>
    <h1 style="font-size:22px;margin:8px 0 0">${esc(cli.tipo === 'PJ' ? (cli.razaoSocial || '—') : (cli.nome || '—'))}</h1>
    ${cli.tipo === 'PJ' && cli.nomeFantasia ? `<div style="font-size:13px;color:#7c8a87;margin-top:2px">${esc(cli.nomeFantasia)}</div>` : ''}</div>
    <a href="/cadastro/editar?id=${esc(cli.id)}" class="btn btn-g" style="flex:none;padding:9px 14px;font-size:13px">Editar</a>
  </div>
  <div class="card">
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px">
      ${cli.tipo === 'PJ' ? linha('CNPJ', fmtCNPJ(cli.cnpj)) + linha('Inscrição estadual', cli.ie) : linha('CPF', fmtCPF(cli.cpf)) + linha('Telefone', cli.fone) + linha('E-mail', cli.email)}
      ${linha('Endereço', endereco)}
      ${linha('Status', cli.status)}
      ${cli.tipo === 'PJ' ? linha('Nº de contrato', cli.contrato) + linha('Pagamento', cli.pagamento) : ''}
      ${linha('Observação de coleta', cli.obsColeta)}
      ${linha('Cadastrado em', dataBR(cli.criadoEm))}
    </table>
    ${cli.tipo === 'PJ' ? `<div class="sec">Contatos</div>${contatos}` : ''}
  </div>
  <div class="card" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><div class="sec" style="margin-top:0">📋 Ordens de coleta — histórico</div>${negs.length ? `<span style="font-size:11px;color:#8fa39f">${negs.length}</span>` : ''}</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin:-2px 0 10px">Coletas e atendimentos anteriores deste cliente, migrados do Ploomes.</div>
    ${negRows}
  </div>
  <div class="card" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline"><div class="sec" style="margin-top:0">📎 Documentos &amp; anexos</div>${arqs.length ? `<span style="font-size:11px;color:#8fa39f">${arqs.length} arquivo(s)</span>` : ''}</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin:-2px 0 10px">Notas, certificados, MTR e propostas migrados do Ploomes + os que você anexar aqui — ligados a este cliente pelo CNPJ/CPF.</div>
    ${arqRows}
    ${uploadUI}
  </div>
  <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><a href="/coletas/nova?cliente=${esc(cli.id)}" class="btn btn-p">＋ Gerar coleta</a>
    <a href="/coletas?cliente=${esc(cli.id)}" class="btn btn-g">Ver coletas deste cliente</a></div>
</div>
<script>
function subirAnexo(){var f=document.getElementById('arqFile'),m=document.getElementById('arqMsg');if(!f||!f.files||!f.files[0])return;var file=f.files[0];
  if(file.size>15728640){m.style.color='#a06a62';m.textContent='Arquivo muito grande (máx. 15 MB).';return;}
  m.style.color='#4F6469';m.textContent='Enviando '+file.name+'…';
  var fd=new FormData();fd.append('file',file);fd.append('cliente',${JSON.stringify(cli.id)});
  fetch('/api/cadastro/anexo',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok){m.style.color='#1E7A3D';m.textContent='✓ Anexado! Atualizando…';setTimeout(function(){location.reload();},700);}
    else{m.style.color='#a06a62';m.textContent=(j&&j.erro)||'Não consegui anexar.';}
  }).catch(function(){m.style.color='#a06a62';m.textContent='Sem conexão. Tente de novo.';});}
</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// LEADS do site (formulário /agendamento/) — entram aqui em vez do Ploomes.
// Guardados no KV (lead:{id} + leads:index). A Débora vê na caixa de entrada.
// ---------------------------------------------------------------------------
export async function listarLeads(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('leads:index') : null;
  return raw ? JSON.parse(raw) : [];
}
export async function lerLead(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`lead:${String(id).replace(/[^a-zA-Z0-9_]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
export async function salvarLead(env, rec) {
  if (!env.PORTAL_KV || !rec || !rec.id) return rec;
  await env.PORTAL_KV.put(`lead:${rec.id}`, JSON.stringify(rec));
  const idx = await listarLeads(env);
  const i = idx.findIndex((x) => x.id === rec.id);
  if (i >= 0) { idx[i].status = rec.status; await env.PORTAL_KV.put('leads:index', JSON.stringify(idx).slice(0, 800000)); }
  return rec;
}
// Recebe um lead do site (worker ecobraz-coletas) e guarda na nossa base.
export async function ingestLead(env, body) {
  const b = body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.name || b.nome || '').trim();
  const empresa = String(b.company || b.empresa || '').trim();
  if (!email && !nome && !empresa) return { ok: false, error: 'dados' };
  const id = 'lead_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14));
  const rec = {
    id, status: 'novo', perfil: String(b.profile || b.perfil || ''),
    nome, empresa, email, fone: String(b.phone || b.fone || '').trim(),
    material: String(b.material_category || b.material || '').trim(), volume: String(b.volume || '').trim(),
    descricao: String(b.material_description || b.descricao || '').slice(0, 4000),
    cep: String(b.postal_code || b.cep || '').trim(), cidade: String(b.city || b.cidade || '').trim(), uf: String(b.state || b.uf || '').trim(),
    documentacao: String(b.documentation || '').trim(), urgencia: String(b.urgency || '').trim(),
    consentimentoMkt: b.marketing_consent === true || b.marketing_consent === 'yes',
    origem: String(b.source || 'site'), pagina: String(b.page_url || '').slice(0, 500),
    utm: { source: b.utm_source || '', medium: b.utm_medium || '', campaign: b.utm_campaign || '', content: b.utm_content || '', term: b.utm_term || '' },
    criadoEm: agora(),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`lead:${id}`, JSON.stringify(rec));
    const idx = await listarLeads(env);
    idx.unshift({ id, nome: nome || empresa || email, empresa, email, cidade: rec.cidade, status: 'novo', criadoEm: rec.criadoEm });
    await env.PORTAL_KV.put('leads:index', JSON.stringify(idx).slice(0, 800000));
  }
  return { ok: true, id };
}

export function paginaLeads(user, leads) {
  const novos = leads.filter((l) => l.status !== 'tratado').length;
  const linhas = leads.length ? leads.map((l) => `<a href="/leads/lead?id=${esc(l.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#10262B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.nome || l.empresa || '(sem nome)')}</div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${esc(l.email || '')}${l.cidade ? ' · ' + esc(l.cidade) : ''} · ${esc(dataBR(l.criadoEm))}</div></div>
      <span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;${l.status === 'tratado' ? 'background:#EEF1F0;color:#7c8a87' : 'background:#FFF4DE;color:#8A6A16'}">${l.status === 'tratado' ? 'TRATADO' : 'NOVO'}</span>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhum lead ainda. Quando alguém preencher o formulário do site, aparece aqui.</div>`;
  return `${head('Leads do site')}<body>${topo(user, 'leads')}
<div class="wrap">
  <a href="/cadastro" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cadastro</a>
  <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 14px"><h1 style="font-size:20px;margin:0">Leads do site</h1><span style="font-size:11px;background:#FFF4DE;color:#8A6A16;font-weight:800;padding:3px 9px;border-radius:20px">${novos} novo(s)</span></div>
  <div>${linhas}</div>
</div>
</body></html>`;
}

// Transforma um lead do site num pré-preenchimento de cliente (sem id → é NOVO).
// Empresa → PJ (com o contato do lead embutido); pessoa física → PF.
export function clienteDeLead(lead) {
  if (!lead) return null;
  const tipo = lead.perfil === 'pessoa_fisica' ? 'PF' : (lead.perfil === 'empresa' ? 'PJ' : (lead.empresa ? 'PJ' : 'PF'));
  const endereco = { cep: lead.cep || '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: lead.cidade || '', uf: lead.uf || '' };
  const obs = [lead.material ? `Material: ${lead.material}` : '', lead.volume ? `Volume: ${lead.volume}` : '', lead.descricao || '']
    .filter(Boolean).join(' — ').slice(0, 600);
  if (tipo === 'PJ') {
    return {
      tipo: 'PJ', razaoSocial: lead.empresa || lead.nome || '', nomeFantasia: '', endereco,
      contatos: [{ nome: lead.nome || '', cargo: '', fone: lead.fone || '', email: lead.email || '' }],
      obsColeta: obs,
    };
  }
  return { tipo: 'PF', nome: lead.nome || '', fone: lead.fone || '', email: lead.email || '', endereco, obsColeta: obs };
}

export function paginaLeadDetalhe(user, lead) {
  const linha = (l, v) => v ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#6B7B78;width:38%">${esc(l)}</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600">${esc(v)}</td></tr>` : '';
  const utm = lead.utm && (lead.utm.source || lead.utm.campaign) ? [lead.utm.source, lead.utm.medium, lead.utm.campaign, lead.utm.content, lead.utm.term].filter(Boolean).join(' · ') : '';
  return `${head(lead.nome || lead.empresa || 'Lead')}<body>${topo(user, 'leads')}
<div class="wrap">
  <a href="/leads" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Todos os leads</a>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 16px">
    <div><span style="font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;${lead.status === 'tratado' ? 'background:#EEF1F0;color:#7c8a87' : 'background:#FFF4DE;color:#8A6A16'}">${lead.status === 'tratado' ? 'TRATADO' : 'NOVO'}</span>
    <h1 style="font-size:22px;margin:8px 0 0">${esc(lead.nome || lead.empresa || '—')}</h1></div>
  </div>
  <div class="card">
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px">
      ${linha('Perfil', lead.perfil === 'empresa' ? 'Empresa' : (lead.perfil === 'pessoa_fisica' ? 'Pessoa física' : lead.perfil))}
      ${linha('Empresa', lead.empresa)}
      ${linha('E-mail', lead.email)}
      ${linha('Telefone', lead.fone)}
      ${linha('Material', lead.material)}
      ${linha('Volume', lead.volume)}
      ${linha('Descrição', lead.descricao)}
      ${linha('Local', [lead.cidade, lead.uf].filter(Boolean).join('/') + (lead.cep ? ' · ' + lead.cep : ''))}
      ${linha('Documentação', lead.documentacao)}
      ${linha('Urgência', lead.urgencia)}
      ${linha('Consentimento marketing', lead.consentimentoMkt ? 'Sim' : 'Não')}
      ${linha('Origem', [lead.origem, utm].filter(Boolean).join(' · '))}
      ${linha('Recebido em', dataBR(lead.criadoEm))}
    </table>
  </div>
  ${(Array.isArray(lead.fotos) && lead.fotos.length) ? `<div class="card" style="margin-top:12px"><div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#7c8a87;margin-bottom:10px">📷 Fotos enviadas pelo cliente</div><div style="display:flex;flex-wrap:wrap;gap:10px">${lead.fotos.map((f) => `<a href="/coletas/anexo?key=${encodeURIComponent(f.key)}" target="_blank" rel="noopener"><img src="/coletas/anexo?key=${encodeURIComponent(f.key)}" alt="${esc(f.nome || 'foto')}" style="width:130px;height:100px;object-fit:cover;border:1px solid #E4EBE9;border-radius:8px;background:#fff"></a>`).join('')}</div></div>` : ''}
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
    <a class="btn btn-p" href="/cadastro/novo?tipo=${lead.perfil === 'pessoa_fisica' ? 'PF' : 'PJ'}&lead=${esc(lead.id)}">➜ Converter em cliente</a>
    <button class="btn btn-g" id="btrat" ${lead.status === 'tratado' ? 'disabled style="opacity:.5"' : ''}>${lead.status === 'tratado' ? '✓ Tratado' : 'Marcar como tratado'}</button>
    <span id="m" style="font-size:13px;color:#4F6469;align-self:center"></span>
  </div>
  <div style="font-size:11px;color:#9aa7a4;margin-top:10px">Ao converter, o cadastro já vem preenchido com os dados do lead — e o lead é marcado como tratado automaticamente. Depois é só <b>Gerar coleta</b> na ficha do cliente.</div>
</div>
<script>const bt=document.getElementById('btrat');if(bt&&!bt.disabled)bt.onclick=async()=>{bt.disabled=true;document.getElementById('m').textContent='Salvando…';try{const r=await fetch('/api/leads/tratar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(lead.id)}'})});if(r.ok){location.reload();}else{document.getElementById('m').textContent='Falha. Tente de novo.';bt.disabled=false;}}catch{document.getElementById('m').textContent='Sem conexão.';bt.disabled=false;}};</script>
</body></html>`;
}

// Tela inicial (hub) — a "casa" que integra todos os módulos. Landing após o login interno.
export function paginaInicio(user, stats) {
  const nome = (user && user.nome ? user.nome : '').split(/\s+/)[0] || 'equipe';
  const s = stats || {};
  const badge = (txt, destaque) => txt == null ? '' : `<span style="flex:none;font-size:10.5px;font-weight:800;padding:3px 10px;border-radius:20px;${destaque ? 'background:#FFF4DE;color:#8A6A16' : 'background:#EEF3F1;color:#4F6469'}">${esc(txt)}</span>`;
  const card = (href, icon, titulo, desc, badgeHtml) => `<a href="${href}" style="display:flex;flex-direction:column;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px;min-height:152px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="font-size:28px;line-height:1">${icon}</div>${badgeHtml || ''}</div>
    <div style="font-size:15.5px;font-weight:800;color:#10262B;margin-top:12px">${esc(titulo)}</div>
    <div style="font-size:12.5px;color:#7c8a87;margin-top:5px;line-height:1.55;flex:1">${esc(desc)}</div>
    <div style="font-size:12px;color:#3f8f3a;font-weight:800;margin-top:12px">Abrir →</div>
  </a>`;
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  return `${head('Início')}<body>
<div style="background:#00333B;padding:16px 20px"><div style="max-width:960px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <div><span style="color:#fff;font-size:17px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">sistema</span></div>
  <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
</div></div>
<div style="max-width:960px;margin:0 auto;padding:26px 18px 56px">
  <h1 style="font-size:22px;margin:0 0 4px">Olá, ${esc(nome)} 👋</h1>
  <p style="font-size:13.5px;color:#7c8a87;margin:0 0 22px">Bem-vindo ao sistema da Ecobraz. Por onde você quer começar?</p>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px" class="grid">
    ${card('/cadastro', '🏢', 'Cadastro & Clientes', 'Empresas e pessoas físicas, com contatos embutidos. Busca rápida.', badge(s.clientes != null ? `${num(s.clientes)} clientes` : null))}
    ${card('/coletas', '📋', 'Ordens de Coleta', 'Abra e acompanhe as coletas. Comprovante com QR de rastreio.', badge(s.coletasAbertas != null ? `${num(s.coletasAbertas)} em aberto` : null, s.coletasAbertas > 0))}
    ${card('/leads', '📥', 'Leads do site', 'Solicitações que chegam pelo formulário do site.', badge(s.leadsNovos != null ? `${num(s.leadsNovos)} novos` : null, s.leadsNovos > 0))}
    ${card('/operacao', '🏭', 'Operação (doca)', 'Recepção, triagem, processamento e saída. Balanço de massa.', badge(s.aReceber != null && s.aReceber > 0 ? `${num(s.aReceber)} a receber` : null, true))}
    ${card('/frota', '🚛', 'Frota', 'Veículos da empresa. O motorista faz o checklist ao abrir e fechar o dia.', badge(s.veiculos != null && s.veiculos > 0 ? `${num(s.veiculos)} veículos` : null))}
    ${card('/eng', '🔬', 'Engenharia Ambiental', 'Validação técnica (RT), destino final e relatórios de conformidade.')}
    ${card('/diretoria', '📊', 'Diretoria', 'Visão macro: volume, prazos e alertas.')}
    ${card('/equipe', '🔑', 'Equipe & Acessos', 'Cadastre as pessoas e defina o que cada uma pode acessar.', badge(s.equipe != null && s.equipe > 0 ? `${num(s.equipe)} pessoas` : null))}
  </div>
  <div style="margin-top:22px;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
    <div><div style="font-size:14px;font-weight:800">🚚 App do Motorista</div><div style="font-size:12.5px;color:#7c8a87;margin-top:3px">O motorista usa no celular pra fazer as coletas em campo.</div></div>
    <a href="/agente" class="btn btn-g" style="padding:10px 16px">Abrir app do motorista →</a>
  </div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:20px">Cada área tem seu acesso. Se pedir login, é porque seu e-mail ainda não foi liberado para aquela área.</div>
</div>
<style>@media(max-width:720px){.grid{grid-template-columns:1fr 1fr!important}}@media(max-width:460px){.grid{grid-template-columns:1fr!important}}</style>
</body></html>`;
}
