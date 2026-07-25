// Migração de ARQUIVOS do Ploomes → R2 (Fase 2 da migração da base).
//
// Duas fontes de arquivo no Ploomes (descobertas no diagnóstico + no código fiscal
// que já baixa a NF em produção):
//  - ANEXOS (Attachments): arquivos ENVIADOS (NF, certificados, MTR, fotos). Ficam
//    PENDURADOS em cada negócio (Deal/coleta) — por isso a listagem sem escopo estoura
//    o tempo. Enumeramos via /Deals?$expand=Attachments; o link de download vem do
//    campo .Url (buscado em /Attachments(Id) quando o expand não o traz).
//  - DOCUMENTOS (Documents): PDFs GERADOS (propostas). Cada um tem .DocumentUrl.
//
// Cada arquivo baixa pela URL de blob (Azure, download direto — mesmo esquema já provado
// no sistema fiscal: PDF real de 96 KB) e vai em STREAM para o R2 (env.R2_ARQUIVOS, sem
// bufferizar na memória). Os metadados (fonte, ids da coleta/cliente, nome, tipo, tamanho,
// chave no R2, data) ficam no D1 (env.DB_PLOOMES), amarrando cada arquivo à sua origem.
//
// SEGURANÇA/LGPD: só Diretoria. As URLs de storage do Ploomes nunca são expostas.
// Idempotente: reprocessar não re-baixa (checa a chave no D1). Retomável por cursor de Id.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cfg(env) {
  return { base: (env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, ''), headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } };
}

// GET JSON no Ploomes com tempo limite; nunca lança.
async function reqJSON(env, path, ms) {
  const { base, headers } = cfg(env);
  try {
    const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(ms || 15000) });
    const rec = { status: r.status };
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('json')) { try { const j = await r.json(); rec.value = Array.isArray(j.value) ? j.value : (j && j.Id != null ? [j] : []); if (j['@odata.count'] != null) rec.count = j['@odata.count']; } catch { rec.value = []; } }
    else if (!r.ok) rec.corpo = (await r.text().catch(() => '')).slice(0, 140);
    return rec;
  } catch (e) { return { erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : String((e && e.message) || e).slice(0, 100) }; }
}

const nowISO = () => { try { return new Date().toISOString(); } catch { return ''; } };
const cortar = (s, n) => String(s == null ? '' : s).slice(0, n);

// Cursores de retomada guardados no D1 (tabela migracao_estado).
async function lerEstado(env, chave, padrao) {
  try { const r = await env.DB_PLOOMES.prepare('SELECT valor FROM migracao_estado WHERE chave=?1').bind(chave).first(); return r && r.valor != null ? r.valor : padrao; }
  catch { return padrao; }
}
async function gravarEstado(env, chave, valor) {
  try { await env.DB_PLOOMES.prepare('INSERT OR REPLACE INTO migracao_estado (chave, valor) VALUES (?1, ?2)').bind(chave, String(valor)).run(); } catch { /* silencioso */ }
}

// Já está no D1? (idempotência — não re-baixa o que já veio).
async function jaImportado(env, key) {
  try { const r = await env.DB_PLOOMES.prepare('SELECT 1 AS x FROM arquivos_ploomes WHERE r2_key=?1 LIMIT 1').bind(key).first(); return !!(r && r.x); }
  catch { return false; }
}

// Baixa a URL (blob do Ploomes) e grava no R2 em STREAM. Devolve {ok, tamanho, contentType}.
async function baixarParaR2(env, key, url, contentTypeHint) {
  try {
    const resp = await fetch(String(url), { signal: AbortSignal.timeout(30000), redirect: 'follow' });
    if (!resp.ok || !resp.body) return { ok: false, erro: `download HTTP ${resp.status}` };
    const ct = resp.headers.get('content-type') || contentTypeHint || 'application/octet-stream';
    const tam = Number(resp.headers.get('content-length')) || null;
    await env.R2_ARQUIVOS.put(key, resp.body, { httpMetadata: { contentType: ct } });
    return { ok: true, tamanho: tam, contentType: ct };
  } catch (e) { return { ok: false, erro: (e && e.name === 'TimeoutError') ? 'download: tempo esgotado' : String((e && e.message) || e).slice(0, 100) }; }
}

// Grava/atualiza os metadados do arquivo no D1.
async function gravarMeta(env, m) {
  await env.DB_PLOOMES.prepare('INSERT OR REPLACE INTO arquivos_ploomes (r2_key,fonte,ploomes_id,deal_id,contact_id,nome_arquivo,content_type,tamanho,criado_em,importado_em) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(m.r2_key, m.fonte, m.ploomes_id != null ? Number(m.ploomes_id) : null, m.deal_id != null ? Number(m.deal_id) : null, m.contact_id != null ? Number(m.contact_id) : null, cortar(m.nome_arquivo, 250), cortar(m.content_type, 100), m.tamanho != null ? Number(m.tamanho) : null, cortar(m.criado_em, 30), nowISO()).run();
}

// ---------------------------------------------------------------------------
// ANEXOS (Attachments) — enumerados por negócio (Deal), com $expand=Attachments.
// Retomável pelo Id do negócio. Cada anexo: resolve .Url → baixa → R2 + D1.
// ---------------------------------------------------------------------------
export async function importarLoteAnexos(env, desdeDealId, topDeals) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes no cofre.' };
  if (!env.DB_PLOOMES) return { ok: false, erro: 'Banco D1 não vinculado (DB_PLOOMES).' };
  if (!env.R2_ARQUIVOS) return { ok: false, erro: 'Depósito R2 ainda não ligado. Ative o R2 no painel da Cloudflare.' };
  // Lotes de coletas grandes: coleta SEM anexo custa quase nada (só o expand), então
  // varremos rápido as regiões vazias. Mas limitamos os DOWNLOADS por requisição (CAP)
  // para não estourar tempo/memória — o corte é em fronteira de coleta (cursor seguro).
  const N = Math.min(Math.max(Number(topDeals) || 30, 1), 60);
  const CAP = 25;
  const D = Math.max(Number(desdeDealId) || 0, 0);
  const r = await reqJSON(env, `/Deals?$top=${N}&$orderby=Id&$filter=Id%20gt%20${D}&$expand=Attachments`, 25000);
  if (r.erro) return { ok: false, erro: r.erro, desdeDealId: D };
  if (r.status !== 200) return { ok: false, erro: `HTTP ${r.status}`, desdeDealId: D };
  const deals = r.value || [];
  let maxId = D, gravados = 0, anexosVistos = 0, falhas = 0, bytes = 0, baixados = 0, cortadoPorCap = false;
  for (const deal of deals) {
    const anexos = Array.isArray(deal.Attachments) ? deal.Attachments : [];
    for (const a of anexos) {
      anexosVistos++;
      const key = `anexo/${a.Id}`;
      if (await jaImportado(env, key)) continue;
      // O expand normalmente NÃO traz .Url — busca no item quando faltar.
      let url = a.Url, ct = a.ContentType, fn = a.FileName || a.Name, dealId = a.DealId || deal.Id;
      if (!url) {
        const one = await reqJSON(env, `/Attachments(${a.Id})`, 12000);
        const it = one.value && one.value[0];
        if (it) { url = it.Url; ct = ct || it.ContentType; fn = fn || it.FileName || it.Name; dealId = dealId || it.DealId; }
      }
      if (!url) { falhas++; continue; }
      const dl = await baixarParaR2(env, key, url, ct);
      if (!dl.ok) { falhas++; continue; }
      await gravarMeta(env, { r2_key: key, fonte: 'anexo', ploomes_id: a.Id, deal_id: dealId, contact_id: deal.ContactId || null, nome_arquivo: fn, content_type: dl.contentType, tamanho: dl.tamanho, criado_em: a.CreateDate || deal.CreateDate || '' });
      gravados++; baixados++; if (dl.tamanho) bytes += dl.tamanho;
    }
    maxId = deal.Id;                       // cursor avança só com a coleta concluída
    if (baixados >= CAP) { cortadoPorCap = true; break; }
  }
  await gravarEstado(env, 'anexos_cursor', maxId);
  // "fim" SÓ quando a página vem realmente vazia (o Ploomes manda página curta no meio;
  // usar deals.length<N marcava fim cedo demais e perdia coletas).
  return { ok: true, dealsLidos: deals.length, anexosVistos, gravados, falhas, bytes, ultimoDealId: maxId, fim: deals.length === 0 };
}

// ---------------------------------------------------------------------------
// ANEXOS via CLIENTES (Contacts) — muitos anexos ficam no contato (não na coleta).
// Enumera contatos com $expand=Attachments. Dedup pela chave (anexo/Id): se a
// varredura das coletas já pegou, pula. Retomável pelo Id do contato.
// ---------------------------------------------------------------------------
export async function importarLoteAnexosContatos(env, desdeContactId, topContatos) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes no cofre.' };
  if (!env.DB_PLOOMES) return { ok: false, erro: 'Banco D1 não vinculado (DB_PLOOMES).' };
  if (!env.R2_ARQUIVOS) return { ok: false, erro: 'Depósito R2 ainda não ligado. Ative o R2 no painel da Cloudflare.' };
  const N = Math.min(Math.max(Number(topContatos) || 40, 1), 80);
  const CAP = 25;
  const D = Math.max(Number(desdeContactId) || 0, 0);
  const r = await reqJSON(env, `/Contacts?$top=${N}&$orderby=Id&$filter=Id%20gt%20${D}&$expand=Attachments`, 25000);
  if (r.erro) return { ok: false, erro: r.erro, desdeContactId: D };
  if (r.status !== 200) return { ok: false, erro: `HTTP ${r.status}`, desdeContactId: D };
  const contatos = r.value || [];
  let maxId = D, gravados = 0, anexosVistos = 0, falhas = 0, bytes = 0, baixados = 0, cortadoPorCap = false;
  for (const c of contatos) {
    const anexos = Array.isArray(c.Attachments) ? c.Attachments : [];
    for (const a of anexos) {
      anexosVistos++;
      const key = `anexo/${a.Id}`;
      if (await jaImportado(env, key)) continue;   // dedup: já veio pela varredura das coletas
      let url = a.Url, ct = a.ContentType, fn = a.FileName || a.Name, dealId = a.DealId || null;
      if (!url) {
        const one = await reqJSON(env, `/Attachments(${a.Id})`, 12000);
        const it = one.value && one.value[0];
        if (it) { url = it.Url; ct = ct || it.ContentType; fn = fn || it.FileName || it.Name; dealId = dealId || it.DealId; }
      }
      if (!url) { falhas++; continue; }
      const dl = await baixarParaR2(env, key, url, ct);
      if (!dl.ok) { falhas++; continue; }
      await gravarMeta(env, { r2_key: key, fonte: 'anexo', ploomes_id: a.Id, deal_id: dealId, contact_id: c.Id, nome_arquivo: fn, content_type: dl.contentType, tamanho: dl.tamanho, criado_em: a.CreateDate || '' });
      gravados++; baixados++; if (dl.tamanho) bytes += dl.tamanho;
    }
    maxId = c.Id;
    if (baixados >= CAP) { cortadoPorCap = true; break; }
  }
  await gravarEstado(env, 'anexos_contatos_cursor', maxId);
  return { ok: true, contatosLidos: contatos.length, anexosVistos, gravados, falhas, bytes, ultimoContactId: maxId, fim: contatos.length === 0 };
}

// ---------------------------------------------------------------------------
// DOCUMENTOS (Documents/propostas) — retomável pelo Id. Cada um: baixa DocumentUrl.
// ---------------------------------------------------------------------------
export async function importarLoteDocumentos(env, desdeId, top) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes no cofre.' };
  if (!env.DB_PLOOMES) return { ok: false, erro: 'Banco D1 não vinculado (DB_PLOOMES).' };
  if (!env.R2_ARQUIVOS) return { ok: false, erro: 'Depósito R2 ainda não ligado. Ative o R2 no painel da Cloudflare.' };
  const N = Math.min(Math.max(Number(top) || 20, 1), 50);
  const D = Math.max(Number(desdeId) || 0, 0);
  const r = await reqJSON(env, `/Documents?$top=${N}&$orderby=Id&$filter=Id%20gt%20${D}&$select=Id,Name,FileName,ContactId,DealId,DocumentUrl,CreateDate`, 20000);
  if (r.erro) return { ok: false, erro: r.erro, desdeId: D };
  if (r.status !== 200) return { ok: false, erro: `HTTP ${r.status}`, desdeId: D };
  const docs = r.value || [];
  let maxId = D, gravados = 0, falhas = 0, bytes = 0;
  for (const d of docs) {
    if (d.Id > maxId) maxId = d.Id;
    const key = `documento/${d.Id}`;
    if (await jaImportado(env, key)) continue;
    if (!d.DocumentUrl) { falhas++; continue; }
    const dl = await baixarParaR2(env, key, d.DocumentUrl, 'application/pdf');
    if (!dl.ok) { falhas++; continue; }
    await gravarMeta(env, { r2_key: key, fonte: 'documento', ploomes_id: d.Id, deal_id: d.DealId || null, contact_id: d.ContactId || null, nome_arquivo: d.FileName || d.Name || `documento-${d.Id}`, content_type: dl.contentType, tamanho: dl.tamanho, criado_em: d.CreateDate || '' });
    gravados++; if (dl.tamanho) bytes += dl.tamanho;
  }
  await gravarEstado(env, 'documentos_cursor', maxId);
  return { ok: true, lidos: docs.length, gravados, falhas, bytes, ultimoId: maxId, fim: docs.length === 0 };
}

// ---------------------------------------------------------------------------
// Estatísticas: total no Ploomes + já importado no D1 (por fonte) + cursores.
// ---------------------------------------------------------------------------
export async function estatisticasArquivos(env) {
  const out = { r2Ligado: !!env.R2_ARQUIVOS, ploomes: {}, importado: {}, cursores: {} };
  // Conta no Ploomes; se falhar (timeout), tenta mais uma vez antes de desistir.
  const contar = async (ent) => { let r = await reqJSON(env, `/${ent}?$top=0&$count=true`, 9000); if (r.count == null) r = await reqJSON(env, `/${ent}?$top=0&$count=true`, 12000); return r.count != null ? r.count : null; };
  out.ploomes.anexos = await contar('Attachments');
  out.ploomes.documentos = await contar('Documents');
  if (env.DB_PLOOMES) {
    try {
      const t = await env.DB_PLOOMES.prepare('SELECT fonte, COUNT(*) AS n, COALESCE(SUM(tamanho),0) AS bytes FROM arquivos_ploomes GROUP BY fonte').all();
      for (const row of (t.results || [])) out.importado[row.fonte || '?'] = { n: row.n, bytes: row.bytes };
    } catch { /* tabela ainda não criada */ }
    out.cursores.anexos = Number(await lerEstado(env, 'anexos_cursor', '0')) || 0;
    out.cursores.anexosContatos = Number(await lerEstado(env, 'anexos_contatos_cursor', '0')) || 0;
    out.cursores.documentos = Number(await lerEstado(env, 'documentos_cursor', '0')) || 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// DIAGNÓSTICO: onde estão os anexos que faltam? Testa (1) contagem real,
// (2) enumerar Attachments direto por Id (com/sem $orderby), (3) se o $expand
// corta anexos por registro (compara com o filtro direto no maior registro).
// Só leitura; nada é gravado.
// ---------------------------------------------------------------------------
export async function diagnosticoAnexos(env) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes.' };
  // Negócio com MAIS anexos no nosso banco (consulta local, rápida).
  let topDeal = null;
  try { topDeal = await env.DB_PLOOMES.prepare("SELECT deal_id, COUNT(*) AS n FROM arquivos_ploomes WHERE fonte='anexo' AND deal_id IS NOT NULL GROUP BY deal_id ORDER BY n DESC LIMIT 1").first(); } catch { /* ignore */ }
  const trabalho = (async () => {
    // Conta os anexos POR EntityId (tipo do dono). Assim vejo exatamente onde estão.
    const ids = [1, 2, 3, 4, 5, 6, 8, 9, 10];
    const calls = [reqJSON(env, '/Attachments?$top=0&$count=true', 8000)].concat(
      ids.map((k) => reqJSON(env, `/Attachments?$filter=EntityId%20eq%20${k}&$top=0&$count=true`, 8000)),
    );
    const res = await Promise.all(calls);
    const out = { ok: true };
    out.countReal = res[0].count != null ? res[0].count : (res[0].erro || `HTTP ${res[0].status}`);
    const nome = { 1: 'Contato', 2: 'Negócio/Coleta', 3: 'OS (Order)', 4: 'Anotação', 5: 'Interação', 6: 'E-mail', 8: 'Lead', 9: 'Tarefa', 10: 'Documento' };
    out.porEntidade = ids.map((k, i) => ({ entityId: k, nome: nome[k] || '?', count: res[i + 1].count != null ? res[i + 1].count : (res[i + 1].erro || `HTTP ${res[i + 1].status}`) }));
    return out;
  })();
  // Teto rígido: devolve a página em no máx. 13s, mesmo se o Ploomes travar.
  const teto = new Promise((resolve) => setTimeout(() => resolve({ ok: true, parcial: true, countReal: 'o Ploomes não respondeu a tempo (está lento agora) — recarregue em instantes' }), 13000));
  return await Promise.race([trabalho, teto]);
}

export function paginaDiagAnexos(user, d) {
  const head = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Diagnóstico de anexos</title>
<style>body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}.wrap{max-width:820px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px;margin-bottom:12px}code{background:#EEF3F1;border-radius:5px;padding:1px 6px;font-size:12.5px}.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}</style></head><body><div class="wrap"><a href="/diretoria/migrar-arquivos" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Arquivos</a>`;
  if (!d || d.ok === false) return `${head}<div class="card" style="color:#8a4b45;margin-top:12px">${esc((d && d.erro) || 'erro')}</div></div></body></html>`;
  const linhas = (d.porEntidade || []).map((e) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #F2F5F4">${esc(String(e.entityId))}</td><td style="padding:6px 8px;border-bottom:1px solid #F2F5F4">${esc(e.nome)}</td><td style="padding:6px 8px;border-bottom:1px solid #F2F5F4;text-align:right;font-weight:800">${typeof e.count === 'number' ? e.count.toLocaleString('pt-BR') : esc(String(e.count))}</td></tr>`).join('');
  return `${head}
  <h1 style="font-size:19px;margin:12px 0 4px">Diagnóstico — anexos por tipo de dono (EntityId)</h1>
  <div class="card"><div style="font-size:13px">Total real de anexos no Ploomes: <b>${esc(String(d.countReal))}</b> · já temos no banco <b>4.085</b> (Negócio 3.488 + Contato 597).</div></div>
  <div class="card"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#7c8a87">EntityId</th><th style="text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#7c8a87">Tipo</th><th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase;color:#7c8a87">Anexos</th></tr></thead><tbody>${linhas}</tbody></table>
  <div style="font-size:11.5px;color:#8fa39f;margin-top:8px">O(s) tipo(s) com número grande fora de "Negócio" é onde estão os que faltam — vou varrer aquele tipo.</div></div>
  <div style="font-size:11.5px;color:#8fa39f">Só leitura. Tire um print e me mande.</div>
  </div></body></html>`;
}

// ---------------------------------------------------------------------------
// Painel de controle (Diretoria)
// ---------------------------------------------------------------------------
export function paginaMigrarArquivos(user, s) {
  const anexT = Number((s.ploomes && s.ploomes.anexos) || 0), docT = Number((s.ploomes && s.ploomes.documentos) || 0);
  const anexI = Number((s.importado && s.importado.anexo && s.importado.anexo.n) || 0);
  const docI = Number((s.importado && s.importado.documento && s.importado.documento.n) || 0);
  const bytes = Number(((s.importado && s.importado.anexo && s.importado.anexo.bytes) || 0)) + Number(((s.importado && s.importado.documento && s.importado.documento.bytes) || 0));
  const mb = bytes ? (bytes / 1048576) : 0;
  const anexPct = anexT ? Math.min(100, Math.round(anexI / anexT * 100)) : 0;
  const docPct = docT ? Math.min(100, Math.round(docI / docT * 100)) : 0;
  const curA = Number((s.cursores && s.cursores.anexos) || 0), curD = Number((s.cursores && s.cursores.documentos) || 0);
  const aviso = s.r2Ligado ? '' : `<div class="card" style="background:#FFF6DB;border-color:#F0D98A;color:#7a5b12"><b>⚠ Depósito de arquivos (R2) ainda não ligado.</b><br>Ative o R2 no painel da Cloudflare (menu <b>R2</b> → <b>Enable</b>). Assim que ligar, me avise que eu conecto o depósito e libero a importação aqui.</div>`;
  const bloco = (titulo, sub, id, pct, imp, tot, disabled) => `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px"><div style="font-size:14px;font-weight:800">${titulo}</div><div style="font-size:12px;color:#7c8a87"><b id="${id}I">${imp.toLocaleString('pt-BR')}</b> de <b>${tot.toLocaleString('pt-BR')}</b></div></div>
    <div style="font-size:11.5px;color:#8fa39f;margin-bottom:8px">${sub}</div>
    <div class="bar"><div id="${id}Bar" style="width:${pct}%"></div></div>
    <div id="${id}Txt" style="font-size:12px;color:#7c8a87;margin:6px 0 12px">${pct}%</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-p" id="${id}Go" onclick="rodar('${id}',this)" ${disabled ? 'disabled' : ''}>▶ Importar ${titulo.toLowerCase()}</button>
      <button class="btn btn-g" id="${id}Stop" onclick="PARAR['${id}']=true" disabled>■ Parar</button>
    </div>
    <div id="${id}St" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>
  </div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Migração Ploomes — Arquivos</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:820px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;margin-bottom:14px}
.btn{border:none;border-radius:11px;padding:11px 16px;font-size:14px;font-weight:800;cursor:pointer}.btn:disabled{opacity:.5;cursor:default}
.btn-p{background:#92C430;color:#10262B}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.bar{height:14px;background:#EEF3F1;border-radius:10px;overflow:hidden}.bar>div{height:100%;background:#3f8f3a;transition:width .3s}
.top{color:#00333B;font-size:12px;font-weight:800;text-decoration:none}</style></head>
<body><div class="wrap">
  <a class="top" href="/diretoria">← Diretoria</a>
  <h1 style="font-size:20px;margin:12px 0 4px">Migração do Ploomes — Arquivos</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 14px">Copia os arquivos do Ploomes para o depósito próprio (R2), amarrando cada um à coleta/cliente de origem. É retomável e não duplica — pode fechar e voltar. Guardado até agora: <b id="mbTot">${mb ? mb.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' MB' : '0 MB'}</b>.</p>
  ${aviso}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px"><div style="font-size:14px;font-weight:800">Anexos</div><div style="font-size:12px;color:#7c8a87"><b id="anexoI">${anexI.toLocaleString('pt-BR')}</b> de <b>${anexT.toLocaleString('pt-BR')}</b></div></div>
    <div style="font-size:11.5px;color:#8fa39f;margin-bottom:8px">NF, certificados, MTR e fotos. Ficam nas <b>coletas</b> E nos <b>clientes</b> — as duas varreduras juntas cobrem tudo (não duplica).</div>
    <div class="bar"><div id="anexoBar" style="width:${anexPct}%"></div></div>
    <div id="anexoTxt" style="font-size:12px;color:#7c8a87;margin:6px 0 12px">${anexPct}%</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="rodar('deal',this)" ${s.r2Ligado ? '' : 'disabled'}>▶ Varrer coletas</button>
      <button class="btn btn-p" onclick="rodar('cont',this)" ${s.r2Ligado ? '' : 'disabled'}>▶ Varrer clientes</button>
      <button class="btn btn-g" onclick="PARAR.deal=true;PARAR.cont=true">■ Parar</button>
    </div>
    <div id="dealSt" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>
    <div id="contSt" style="font-size:12.5px;color:#4F6469;margin-top:4px"></div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px"><div style="font-size:14px;font-weight:800">Documentos</div><div style="font-size:12px;color:#7c8a87"><b id="docI">${docI.toLocaleString('pt-BR')}</b> de <b>${docT.toLocaleString('pt-BR')}</b></div></div>
    <div style="font-size:11.5px;color:#8fa39f;margin-bottom:8px">Propostas geradas (PDF).</div>
    <div class="bar"><div id="docBar" style="width:${docPct}%"></div></div>
    <div id="docTxt" style="font-size:12px;color:#7c8a87;margin:6px 0 12px">${docPct}%</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-p" onclick="rodar('doc',this)" ${s.r2Ligado ? '' : 'disabled'}>▶ Importar documentos</button>
      <button class="btn btn-g" onclick="PARAR.doc=true">■ Parar</button>
    </div>
    <div id="docSt" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>
  </div>
</div>
<script>
var PARAR={};
var CUR={deal:${curA}, cont:${Number((s.cursores && s.cursores.anexosContatos) || 0)}, doc:${curD}};
var TOT={anexo:${anexT}, doc:${docT}};
var FEITO={anexo:${anexI}, doc:${docI}};
var BYTES0=${bytes}, BYTES=0;
var CFG={
  deal:{api:'/api/diretoria/arquivos-anexos', q:'desdeDealId', last:'ultimoDealId', bar:'anexo', st:'dealSt'},
  cont:{api:'/api/diretoria/arquivos-anexos-contatos', q:'desdeContactId', last:'ultimoContactId', bar:'anexo', st:'contSt'},
  doc:{api:'/api/diretoria/arquivos-docs', q:'desdeId', last:'ultimoId', bar:'doc', st:'docSt'}
};
function setBar(bar){var t=TOT[bar],f=FEITO[bar];var p=t?Math.min(100,Math.round(f/t*100)):0;document.getElementById(bar+'Bar').style.width=p+'%';document.getElementById(bar+'Txt').textContent=p+'% · '+f.toLocaleString('pt-BR')+' / '+t.toLocaleString('pt-BR');document.getElementById(bar+'I').textContent=f.toLocaleString('pt-BR');}
function setMB(){var m=(BYTES0+BYTES)/1048576;document.getElementById('mbTot').textContent=(m>=1?Math.round(m).toLocaleString('pt-BR'):m.toFixed(1))+' MB';}
async function rodar(which,btn){var c=CFG[which];PARAR[which]=false;btn.disabled=true;var st=document.getElementById(c.st);st.textContent='Importando…';
  while(!PARAR[which]){var j;try{var r=await fetch(c.api+'?'+c.q+'='+CUR[which],{method:'POST'});j=await r.json();}catch(e){st.textContent='Erro de conexão — clique de novo para retomar.';break;}
    if(!j.ok){st.textContent='Parou: '+(j.erro||'erro')+' — clique de novo para retomar.';break;}
    FEITO[c.bar]+=(j.gravados||0);if(j.bytes)BYTES+=j.bytes;CUR[which]=j[c.last];setBar(c.bar);setMB();
    var extra=(j.falhas?(' · '+j.falhas+' sem link'):'');
    if(j.fim){st.textContent='✅ Varredura concluída.'+extra;break;}
    st.textContent='Importando… +'+(j.gravados||0)+' neste lote'+extra;
    await new Promise(function(r){setTimeout(r,150);});}
  btn.disabled=false;}
</script></body></html>`;
}
