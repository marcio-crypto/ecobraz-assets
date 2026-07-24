// Migração da base do Ploomes → sistema novo. FASE 1: contatos.
//
// Roda no Worker (tem a PLOOMES_USER_KEY e alcança o Ploomes). Este arquivo começa
// pelo INSPETOR: puxa uma amostra de contatos e mostra a ESTRUTURA dos campos
// (nomes + valores MASCARADOS) para eu escrever o mapeamento sem chutar, e o Marcio
// conferir sem expor CNPJ/nome inteiro. O importador em lote vem depois, quando a
// estrutura estiver confirmada.
//
// SEGURANÇA/LGPD: só inspeção; nada é gravado aqui. Valores exibidos são mascarados.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cfg(env) {
  return { base: (env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, ''), headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } };
}

// Mascara um valor para exibição segura (mantém o suficiente para reconhecer o campo).
function mascara(k, v) {
  if (v == null) return '';
  const s = String(v);
  const key = String(k).toLowerCase();
  if (/mail/.test(key)) return s.replace(/^(.).*?(@.*)$/, '$1***$2');
  const dig = s.replace(/\D/g, '');
  if (/register|cnpj|cpf|doc|phone|fone|zip|cep|number/.test(key) && dig.length >= 5) return '…' + dig.slice(-2) + ` (${dig.length} díg)`;
  if (/name|nome|legal|razao|fantasia|contact/.test(key)) { const p = s.trim().split(/\s+/); return (p[0] || '') + (p.length > 1 ? ' ***' : ''); }
  if (s.length > 22) return s.slice(0, 6) + `…(${s.length} car)`;
  return s;
}

// Busca JSON com tempo limite; nunca lança.
async function req(env, path, ms) {
  const { base, headers } = cfg(env);
  try {
    const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(ms || 9000) });
    const rec = { status: r.status };
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('json')) { try { const j = await r.json(); rec.value = Array.isArray(j.value) ? j.value : (j && j.Id != null ? [j] : []); if (j['@odata.count'] != null) rec.count = j['@odata.count']; } catch { rec.value = []; } }
    else if (!r.ok) rec.corpo = (await r.text().catch(() => '')).slice(0, 140);
    return rec;
  } catch (e) { return { erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : String((e && e.message) || e).slice(0, 100) }; }
}

// Mapeamento CONFIRMADO com a amostra real (26.967 contatos):
// PJ = quem tem CNPJ de 14 dígitos; PF = pessoa (contato, geralmente sem documento).
// Campos úteis: CNPJ/Register (doc), LegalName (razão), Name, Email, endereço,
// CNAECode/CNAEName (setor — alimenta o carbono) e CompanyId (liga a pessoa à empresa).
export function mapearContato(c) {
  if (!c || c.Id == null) return null;
  const dig = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const cnpj = dig(c.CNPJ).length === 14 ? dig(c.CNPJ) : (dig(c.Register).length === 14 ? dig(c.Register) : '');
  const cpf = dig(c.CPF).length === 11 ? dig(c.CPF) : (dig(c.Register).length === 11 ? dig(c.Register) : '');
  const ehPJ = cnpj.length === 14;
  const email = (Array.isArray(c.Emails) && c.Emails[0] && c.Emails[0].Email) || c.Email || '';
  const fone = (Array.isArray(c.Phones) && c.Phones[0] && (c.Phones[0].PhoneNumber || c.Phones[0].Number)) || '';
  return {
    ploomesId: c.Id,
    tipo: ehPJ ? 'PJ' : 'PF',
    nome: ehPJ ? (c.LegalName || c.Name || '') : (c.Name || ''),
    nomeFantasia: ehPJ ? (c.Name || '') : '',
    documento: ehPJ ? cnpj : cpf,
    email: String(email || '').trim().toLowerCase(),
    telefone: String(fone || '').trim(),
    cidade: (c.City && (c.City.Name || c.City.name)) || '',
    uf: (c.City && (c.City.StateShortName || c.City.State)) || '',
    endereco: [c.StreetAddress, c.StreetAddressNumber, c.Neighborhood, c.ZipCode].filter(Boolean).join(' · '),
    cnaeCodigo: String(c.CNAECode || ''),
    cnaeNome: String(c.CNAEName || ''),
    companyId: c.CompanyId || null,
    criadoEm: c.CreateDate || '',
  };
}

// Inspetor: volume + amostra com estrutura de campos (para confirmar o mapeamento).
export async function amostraContatosPloomes(env, top) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes (PLOOMES_USER_KEY) no cofre.' };
  const cnt = await req(env, '/Contacts?$top=0&$count=true', 7000);
  const total = cnt.count != null ? cnt.count : null;
  // Puxa a amostra com os campos expandidos que costumam guardar a identidade.
  const a = await req(env, `/Contacts?$top=${Math.min(Number(top) || 15, 30)}&$expand=Phones,City,OtherProperties`, 15000);
  const contatos = a.value || [];
  // União dos campos escalares presentes (pra eu ver a estrutura).
  const campos = {};
  for (const c of contatos) for (const k of Object.keys(c)) { const v = c[k]; if (v != null && typeof v !== 'object') campos[k] = (campos[k] || 0) + 1; }
  // Primeiro contato: campos escalares mascarados.
  const c0 = contatos[0] || {};
  const primeiro = Object.entries(c0).filter(([k, v]) => v != null && typeof v !== 'object').map(([k, v]) => ({ campo: k, valor: mascara(k, v) }));
  // Sub-objetos do 1º (Phones, City, OtherProperties) — só as chaves, pra ver onde está o que.
  const subs = {};
  for (const k of ['Phones', 'City', 'OtherProperties']) {
    if (Array.isArray(c0[k])) subs[k] = c0[k][0] ? Object.keys(c0[k][0]) : ['(vazio)'];
    else if (c0[k] && typeof c0[k] === 'object') subs[k] = Object.keys(c0[k]);
  }
  // Prévia do mapeamento aplicado à amostra (mascarado) — pra conferir se casou certo.
  const mapeados = contatos.slice(0, 8).map((c) => {
    const m = mapearContato(c) || {};
    return { tipo: m.tipo, nome: mascara('nome', m.nome), doc: mascara('doc', m.documento), email: mascara('email', m.email), cidade: mascara('cidade', m.cidade) };
  });
  return { ok: !a.erro, total, amostraN: contatos.length, status: a.status, erro: a.erro || (a.status && a.status !== 200 ? `HTTP ${a.status}` : ''), campos, primeiro, subs, mapeados };
}

// ---------------------------------------------------------------------------
// IMPORTADOR EM LOTE (D1) — paginação por Id (retomável, sem deep-skip)
// ---------------------------------------------------------------------------
// Puxa uma página de contatos com Id > desdeId, mapeia e grava no D1 (upsert
// idempotente pela chave ploomes_id). O navegador chama em loop passando o
// último Id de volta, até acabar. INSERT OR REPLACE = reimportar não duplica.
export async function importarLoteContatos(env, desdeId, top) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes no cofre.' };
  if (!env.DB_PLOOMES) return { ok: false, erro: 'Banco D1 não vinculado (DB_PLOOMES).' };
  const N = Math.min(Math.max(Number(top) || 100, 1), 200);
  const D = Math.max(Number(desdeId) || 0, 0);
  const r = await req(env, `/Contacts?$top=${N}&$orderby=Id&$filter=Id%20gt%20${D}&$expand=City`, 20000);
  if (r.erro) return { ok: false, erro: r.erro, desdeId: D };
  if (r.status !== 200) return { ok: false, erro: `HTTP ${r.status}`, desdeId: D };
  const contatos = r.value || [];
  const nowISO = (() => { try { return new Date().toISOString(); } catch { return ''; } })();
  const stmt = env.DB_PLOOMES.prepare('INSERT OR REPLACE INTO contatos (ploomes_id,tipo,nome,nome_fantasia,documento,email,telefone,cidade,uf,endereco,cnae_codigo,cnae_nome,company_id,criado_em,importado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const cortar = (s, n) => String(s == null ? '' : s).slice(0, n);
  let maxId = D; const batch = [];
  for (const c of contatos) {
    const m = mapearContato(c); if (!m) continue;
    if (m.ploomesId > maxId) maxId = m.ploomesId;
    batch.push(stmt.bind(m.ploomesId, m.tipo, cortar(m.nome, 200), cortar(m.nomeFantasia, 200), cortar(m.documento, 20), cortar(m.email, 160), cortar(m.telefone, 40), cortar(m.cidade, 90), cortar(m.uf, 6), cortar(m.endereco, 300), cortar(m.cnaeCodigo, 20), cortar(m.cnaeNome, 160), m.companyId != null ? Number(m.companyId) : null, cortar(m.criadoEm, 30), nowISO));
  }
  if (batch.length) { try { await env.DB_PLOOMES.batch(batch); } catch (e) { return { ok: false, erro: 'D1: ' + String((e && e.message) || e).slice(0, 120), desdeId: D }; } }
  return { ok: true, lidos: contatos.length, gravados: batch.length, ultimoId: maxId, fim: contatos.length < N };
}

// Estatísticas: total no Ploomes + quanto já foi importado no D1 (por tipo) + maior Id.
export async function estatisticasMigracao(env) {
  const cnt = await req(env, '/Contacts?$top=0&$count=true', 7000);
  const total = cnt.count != null ? cnt.count : null;
  let importado = 0, maxId = 0; const porTipo = {};
  if (env.DB_PLOOMES) {
    try {
      const a = await env.DB_PLOOMES.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(ploomes_id),0) AS mx FROM contatos').first();
      importado = (a && a.n) || 0; maxId = (a && a.mx) || 0;
      const t = await env.DB_PLOOMES.prepare('SELECT tipo, COUNT(*) AS n FROM contatos GROUP BY tipo').all();
      for (const row of (t.results || [])) porTipo[row.tipo || '?'] = row.n;
    } catch { /* tabela vazia/ausente */ }
  }
  return { total, importado, maxId, porTipo };
}

// Busca na base migrada (D1) por nome / documento / e-mail.
export async function buscarContatos(env, q, limit) {
  if (!env.DB_PLOOMES || !q) return [];
  const termo = String(q).trim(); const dig = termo.replace(/\D/g, '');
  const L = Math.min(Math.max(Number(limit) || 25, 1), 100);
  try {
    const like = `%${termo.replace(/[%_]/g, '')}%`;
    const r = await env.DB_PLOOMES.prepare(
      'SELECT ploomes_id,tipo,nome,nome_fantasia,documento,email,cidade,uf,cnae_nome FROM contatos WHERE nome LIKE ?1 OR email LIKE ?1 OR nome_fantasia LIKE ?1' + (dig.length >= 3 ? ' OR documento LIKE ?2' : '') + ' ORDER BY nome LIMIT ?3'
    ).bind(like, dig.length >= 3 ? `%${dig}%` : '', L).all();
    return r.results || [];
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Painel de controle da migração (Diretoria)
// ---------------------------------------------------------------------------
export function paginaMigrarPloomes(user, s) {
  const total = Number(s.total || 0), imp = Number(s.importado || 0), maxId = Number(s.maxId || 0);
  const pct = total ? Math.min(100, Math.round((imp / total) * 100)) : 0;
  const pj = (s.porTipo && s.porTipo.PJ) || 0, pf = (s.porTipo && s.porTipo.PF) || 0;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Migração Ploomes — Contatos</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:820px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;margin-bottom:14px}
.btn{border:none;border-radius:11px;padding:12px 18px;font-size:14px;font-weight:800;cursor:pointer}
.btn-p{background:#92C430;color:#10262B}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.bar{height:16px;background:#EEF3F1;border-radius:10px;overflow:hidden}.bar>div{height:100%;background:#3f8f3a;width:${pct}%;transition:width .3s}
input{border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;width:100%}
table{width:100%;border-collapse:collapse;font-size:12.5px}td{padding:7px 8px;border-bottom:1px solid #F2F5F4}th{text-align:left;font-size:9.5px;text-transform:uppercase;color:#7c8a87;padding:7px 8px;border-bottom:1px solid #E4EBE9}
.pill{font-size:10px;font-weight:800;padding:2px 8px;border-radius:20px;background:#E7EFF0;color:#0B5B66}</style></head>
<body><div class="wrap">
  <a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
  <h1 style="font-size:20px;margin:12px 0 4px">Migração do Ploomes — Contatos</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 14px">Traz os contatos do Ploomes para o banco próprio (D1). É idempotente — pode rodar de novo sem duplicar. Mantenha esta aba aberta durante a importação.</p>
  <div class="card">
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><span><b>${imp.toLocaleString('pt-BR')}</b> importados <span class="pill">${pj.toLocaleString('pt-BR')} PJ</span> <span class="pill" style="background:#EAF2E6;color:#3f7a2e">${pf.toLocaleString('pt-BR')} PF</span></span><span style="color:#7c8a87">de <b>${total.toLocaleString('pt-BR')}</b> no Ploomes</span></div>
    <div class="bar"><div id="bar"></div></div>
    <div id="pctxt" style="font-size:12px;color:#7c8a87;margin-top:6px">${pct}%</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-p" id="go" onclick="rodar(this)">▶ Importar tudo</button>
      <button class="btn btn-g" id="amostra" onclick="amostra(this)">Importar só uma amostra (100)</button>
      <button class="btn btn-g" id="parar" onclick="parar=true" disabled>■ Parar</button>
    </div>
    <div id="st" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>
  </div>
  <div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:8px">Buscar na base migrada</div>
    <input id="q" placeholder="nome, CNPJ ou e-mail…" onkeydown="if(event.key==='Enter')buscar()">
    <div id="res" style="margin-top:10px"></div>
  </div>
</div>
<script>
var TOTAL=${total}, TOP=100, parar=false, desdeId=${maxId}, feitos=${imp};
function setBar(){var p=TOTAL?Math.min(100,Math.round(feitos/TOTAL*100)):0;document.getElementById('bar').style.width=p+'%';document.getElementById('pctxt').textContent=p+'% · '+feitos.toLocaleString('pt-BR')+' / '+TOTAL.toLocaleString('pt-BR');}
async function umLote(){var r=await fetch('/api/diretoria/ploomes-importar?desdeId='+desdeId+'&top='+TOP,{method:'POST'});return r.json();}
async function rodar(btn){parar=false;btn.disabled=true;document.getElementById('amostra').disabled=true;document.getElementById('parar').disabled=false;var st=document.getElementById('st');st.textContent='Importando…';
  while(!parar){var j;try{j=await umLote();}catch(e){st.textContent='Erro de conexão. Clique em Importar tudo de novo para retomar.';break;}
    if(!j.ok){st.textContent='Parou: '+(j.erro||'erro')+' — clique de novo para retomar.';break;}
    feitos+=j.gravados;desdeId=j.ultimoId;setBar();
    if(j.fim){st.textContent='✅ Importação concluída! '+feitos.toLocaleString('pt-BR')+' contatos na base.';break;}
    await new Promise(function(r){setTimeout(r,120);});}
  btn.disabled=false;document.getElementById('amostra').disabled=false;document.getElementById('parar').disabled=true;}
async function amostra(btn){btn.disabled=true;var st=document.getElementById('st');st.textContent='Importando amostra…';try{var j=await umLote();if(j.ok){feitos+=j.gravados;desdeId=j.ultimoId;setBar();st.textContent='Amostra: +'+j.gravados+' gravados (lidos '+j.lidos+'). Confira na busca abaixo (ex.: um nome que você conheça).';}else{st.textContent='Erro: '+(j.erro||'?');}}catch(e){st.textContent='Erro de conexão.';}btn.disabled=false;}
async function buscar(){var q=document.getElementById('q').value.trim();var res=document.getElementById('res');if(!q){res.innerHTML='';return;}res.innerHTML='<span style="color:#7c8a87;font-size:12px">buscando…</span>';
  try{var r=await fetch('/api/diretoria/ploomes-buscar?q='+encodeURIComponent(q));var j=await r.json();var l=j.contatos||[];
    if(!l.length){res.innerHTML='<span style="color:#8fa39f;font-size:12.5px">nada encontrado</span>';return;}
    var h='<table><thead><tr><th>Tipo</th><th>Nome/Razão</th><th>Documento</th><th>E-mail</th><th>Cidade</th></tr></thead><tbody>';
    l.forEach(function(c){h+='<tr><td>'+(c.tipo||'')+'</td><td>'+(c.nome||'')+(c.nome_fantasia&&c.nome_fantasia!==c.nome?' <span style="color:#9aa7a4">('+c.nome_fantasia+')</span>':'')+'</td><td>'+(c.documento||'')+'</td><td>'+(c.email||'')+'</td><td>'+(c.cidade||'')+(c.uf?'/'+c.uf:'')+'</td></tr>';});
    h+='</tbody></table>';res.innerHTML=h;
  }catch(e){res.innerHTML='<span style="color:#8a4b45;font-size:12px">erro na busca</span>';}}
</script></body></html>`;
}

export function paginaAmostraContatos(user, d) {
  const head = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Inspeção Ploomes — Contatos</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:860px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px;margin-bottom:12px}
code{background:#EEF3F1;border-radius:5px;padding:1px 6px;font-size:12.5px;word-break:break-word}
table{width:100%;border-collapse:collapse;font-size:12.5px}td{padding:6px 8px;border-bottom:1px solid #F2F5F4}
th{text-align:left;font-size:9.5px;text-transform:uppercase;color:#7c8a87;padding:6px 8px;border-bottom:1px solid #E4EBE9}</style></head>`;
  if (!d || d.ok === false) {
    return `${head}<body><div class="wrap"><a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
    <div class="card" style="margin-top:12px;color:#8a4b45"><b>Não foi possível inspecionar.</b><br>${esc((d && (d.erro || d.status)) || 'Erro desconhecido.')}</div></div></body></html>`;
  }
  const campos = Object.entries(d.campos || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<code>${esc(k)}</code>`).join(' ');
  const primeiro = (d.primeiro || []).map((f) => `<tr><td><code>${esc(f.campo)}</code></td><td>${esc(f.valor)}</td></tr>`).join('');
  const subs = Object.entries(d.subs || {}).map(([k, arr]) => `<div style="font-size:12px;margin:4px 0"><b>${esc(k)}</b>: ${arr.map((x) => `<code>${esc(x)}</code>`).join(' ')}</div>`).join('');
  const map = (d.mapeados || []).map((m) => `<tr><td>${esc(m.tipo || '?')}</td><td>${esc(m.nome)}</td><td>${esc(m.doc)}</td><td>${esc(m.email)}</td><td>${esc(m.cidade)}</td></tr>`).join('');
  return `${head}<body><div class="wrap">
  <a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
  <h1 style="font-size:19px;margin:12px 0 4px">Inspeção — Contatos do Ploomes</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 16px">Só leitura, valores <b>mascarados</b>. Total no Ploomes: <b>${d.total != null ? Number(d.total).toLocaleString('pt-BR') : '—'}</b> · amostra lida: <b>${esc(String(d.amostraN || 0))}</b>. Tire um print e me mande.</p>
  <div class="card"><div style="font-size:13px;font-weight:800;margin-bottom:8px">Prévia do mapeamento (casou certo?)</div>
    <table><thead><tr><th>Tipo</th><th>Nome/Razão</th><th>Documento</th><th>E-mail</th><th>Cidade</th></tr></thead><tbody>${map || '<tr><td colspan="5" style="color:#8fa39f">sem amostra</td></tr>'}</tbody></table>
    <div style="font-size:11.5px;color:#8fa39f;margin-top:8px">Se as colunas estão com a informação certa em cada lugar, o mapeamento está bom. Se algo trocou de lugar (ex.: CNPJ no e-mail), me avisa.</div>
  </div>
  <div class="card"><div style="font-size:13px;font-weight:800;margin-bottom:6px">Campos disponíveis no contato</div><div style="line-height:2">${campos || '—'}</div>${subs ? `<div style="margin-top:10px;border-top:1px solid #F2F5F4;padding-top:8px">${subs}</div>` : ''}</div>
  <div class="card"><div style="font-size:13px;font-weight:800;margin-bottom:6px">1º contato (campos mascarados)</div>
    <table><tbody>${primeiro || '<tr><td style="color:#8fa39f">—</td></tr>'}</tbody></table></div>
  </div></body></html>`;
}
