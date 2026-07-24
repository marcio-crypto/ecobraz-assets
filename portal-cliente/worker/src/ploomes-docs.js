// Diagnóstico de ANEXOS/DOCUMENTOS do Ploomes (só Diretoria, read-only).
//
// Roda no Worker (tem a chave e alcança o Ploomes). Não grava nada. Objetivo:
// descobrir, na conta REAL, (1) se dá para listar os anexos de um cliente e
// (2) se dá para BAIXAR o arquivo — para eu montar o importador sem chutar a API.
//
// Descobertas até aqui: /Attachments sem filtro dá timeout (pesado); precisa ser
// escopado por cliente. /AttachmentItems e /AttachmentFolders não existem (404).
// /Documents responde 200 (mas é o módulo de PROPOSTAS). Tudo com tempo limite.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cfg(env) {
  return { base: (env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, ''), headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } };
}

export async function sondarAnexosPloomes(env) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes (PLOOMES_USER_KEY) no cofre.' };
  const { base, headers } = cfg(env);
  const out = { ok: true, contatoId: null, testes: [], amostra: null, download: null };

  // Busca JSON com tempo limite; nunca lança.
  const req = async (path, ms) => {
    try {
      const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(ms || 7000) });
      const rec = { status: r.status };
      const ct = r.headers.get('content-type') || '';
      if (r.ok && ct.includes('json')) { try { const j = await r.json(); rec.value = Array.isArray(j.value) ? j.value : (j && j.Id != null ? [j] : []); if (j['@odata.count'] != null) rec.count = j['@odata.count']; } catch { rec.value = []; } }
      else if (!r.ok) { rec.corpo = (await r.text().catch(() => '')).slice(0, 120); }
      return rec;
    } catch (e) { return { erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : String(e && e.message || e).slice(0, 90) }; }
  };

  // 0) Volume (contagem rápida via $count): dimensiona o trabalho em 1 chamada por entidade.
  const contar = async (entidade, ms) => {
    const r = await req(`/${entidade}?$top=0&$count=true`, ms);
    if (r.erro) return { erro: r.erro };
    if (r.status !== 200) return { status: r.status };
    return { total: r.count != null ? r.count : null };
  };
  out.volume = {
    contatos: await contar('Contacts', 7000),
    documentos: await contar('Documents', 7000),
    anexos: await contar('Attachments', 9000),
  };

  // 1) Um contato real (para escopar os anexos).
  const c = await req('/Contacts?$top=1&$select=Id,Name', 7000);
  const cid = c.value && c.value[0] && c.value[0].Id;
  out.contatoId = cid || null;
  out.testes.push({ rotulo: 'Contacts (1 amostra)', status: c.status, erro: c.erro });

  // 2) Anexos: o filtro por ContactId é rápido (200), mas o contato de amostra pode ter 0.
  // O blanket COM $orderby estoura o tempo (força ordenar 10k linhas). Então: tenta o
  // contato; depois um blanket SEM $orderby ($top pequeno), que costuma voltar rápido.
  let att = null;
  const probes = [];
  if (cid) probes.push({ q: `$top=5&$filter=ContactId%20eq%20${cid}`, ms: 7000 });
  probes.push({ q: `$top=5`, ms: 12000 });          // sem $orderby: evita a ordenação que travou
  probes.push({ q: `$top=1&$skip=100`, ms: 12000 }); // outro ponto da base, ainda sem ordenar
  for (const p of probes) {
    if (att) break;
    const a = await req(`/Attachments?${p.q}`, p.ms);
    const it = a.value && a.value[0];
    out.testes.push({ rotulo: `Attachments (${decodeURIComponent(p.q)})`, status: a.status, erro: a.erro, qtd: a.value ? a.value.length : undefined, campos: it ? Object.keys(it) : (a.value ? [] : undefined) });
    if (a.status === 200 && it) att = it;
  }

  // 3) Documents (sabidamente 200) — guarda um p/ comparar/baixar se não houver anexo.
  const d = await req('/Documents?$top=1', 7000);
  const doc = d.value && d.value[0];
  out.testes.push({ rotulo: 'Documents', status: d.status, erro: d.erro, campos: doc ? Object.keys(doc) : undefined });

  // Amostra: valores dos campos "de arquivo" do 1º anexo (ou documento).
  const src = att || doc;
  if (src) {
    const chaves = ['Id', 'Name', 'FileName', 'Key', 'Url', 'DownloadUrl', 'FileUrl', 'DocumentUrl', 'Size', 'ContactId', 'DealId', 'MimeType', 'Extension', 'CreateDate'];
    const campos = {};
    for (const k of chaves) if (src[k] != null) campos[k] = String(src[k]).slice(0, 90);
    out.amostra = { origem: att ? 'Attachment (anexo)' : 'Document (proposta)', campos };
  }

  // 4) Teste de DOWNLOAD real (sem gravar): tenta baixar o arquivo pelo campo de URL.
  const urlCampo = src && (src.Url || src.DownloadUrl || src.FileUrl || src.DocumentUrl);
  if (urlCampo) {
    try {
      const r = await fetch(String(urlCampo), { signal: AbortSignal.timeout(9000), redirect: 'follow' });
      let bytes = 0; if (r.ok) { const b = await r.arrayBuffer(); bytes = b.byteLength; }
      out.download = { via: att ? 'anexo' : 'documento', status: r.status, contentType: r.headers.get('content-type') || '', bytes };
    } catch (e) { out.download = { erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : String(e && e.message || e).slice(0, 90) }; }
  }
  return out;
}

function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:820px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px;margin-bottom:12px}
code{background:#EEF3F1;border-radius:5px;padding:1px 6px;font-size:12.5px;word-break:break-word}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}
</style></head>`;
}

export function paginaSondaAnexos(user, d) {
  if (!d || d.ok === false) {
    return `${head('Diagnóstico de anexos')}<body><div class="wrap"><a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
    <div class="card" style="margin-top:12px;color:#8a4b45"><b>Não foi possível diagnosticar.</b><br>${esc((d && d.erro) || 'Erro desconhecido.')}</div></div></body></html>`;
  }
  const pill = (st, txt) => `<span class="pill" style="background:${st === 200 ? '#E4F3E6' : '#FFF4DE'};color:${st === 200 ? '#1E5B31' : '#8A6A16'}">${esc(txt || (st != null ? 'HTTP ' + st : '—'))}</span>`;
  const testes = (d.testes || []).map((t) => `<div style="padding:9px 0;border-top:1px solid #F2F5F4">
      <div style="font-size:13px;font-weight:700">${esc(t.rotulo)} ${t.status != null ? pill(t.status) : pill(0, t.erro || 'erro')} ${t.qtd != null ? `<span style="font-size:11px;color:#8fa39f">${t.qtd} registro(s)</span>` : ''}</div>
      ${t.campos && t.campos.length ? `<div style="font-size:11.5px;color:#4F6469;margin-top:5px">campos: ${t.campos.map((c) => `<code>${esc(c)}</code>`).join(' ')}</div>` : (t.campos && !t.campos.length ? '<div style="font-size:11.5px;color:#8fa39f;margin-top:5px">(respondeu, mas sem registros)</div>' : '')}
    </div>`).join('');

  const amostra = d.amostra ? `<div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:6px">Amostra de 1 arquivo <span style="font-size:11px;color:#8fa39f">(${esc(d.amostra.origem)})</span></div>
    ${Object.keys(d.amostra.campos).length ? Object.entries(d.amostra.campos).map(([k, v]) => `<div style="font-size:12.5px;padding:3px 0"><code>${esc(k)}</code> = ${esc(v)}</div>`).join('') : '<div style="color:#8fa39f;font-size:12.5px">sem campos de arquivo reconhecíveis</div>'}
  </div>` : '';

  const download = d.download ? `<div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:6px">Teste de download real</div>
    ${d.download.erro ? `<div style="color:#8a4b45;font-size:12.5px">Falhou: ${esc(d.download.erro)}</div>`
      : `<div style="font-size:12.5px;color:#4F6469">via ${esc(d.download.via)} · ${pill(d.download.status)} · tipo <code>${esc(d.download.contentType || '?')}</code> · <b>${esc(String(d.download.bytes))} bytes</b> ${d.download.bytes > 0 && d.download.status === 200 ? '<span style="color:#1E5B31;font-weight:800">✓ arquivo baixou!</span>' : ''}</div>`}
  </div>` : '';

  const vfmt = (x) => (x && x.total != null) ? `<b>${Number(x.total).toLocaleString('pt-BR')}</b>` : (x && x.status ? `<span style="color:#8a4b45">HTTP ${esc(String(x.status))}</span>` : `<span style="color:#8A6A16">${esc((x && x.erro) || '—')}</span>`);
  const v = d.volume || {};
  const estMB = (v.documentos && v.documentos.total) ? Math.round(v.documentos.total * 96694 / 1048576) : null;
  const volume = `<div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:6px">Volume no Ploomes</div>
    <div style="font-size:13px;color:#4F6469;line-height:1.9">Contatos: ${vfmt(v.contatos)}<br>Documentos (propostas/PDF): ${vfmt(v.documentos)}${estMB ? ` <span style="color:#8fa39f">(~${Number(estMB).toLocaleString('pt-BR')} MB estimados)</span>` : ''}<br>Anexos: ${vfmt(v.anexos)}</div>
  </div>`;

  return `${head('Diagnóstico de anexos')}<body><div class="wrap">
  <a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
  <h1 style="font-size:19px;margin:12px 0 4px">Diagnóstico — anexos no Ploomes</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 16px">Só inspeção (nada é baixado para guardar, nem apagado). ${d.contatoId ? `Cliente de amostra: <code>#${esc(String(d.contatoId))}</code>.` : ''} Tire um print e me mande.</p>
  ${volume}
  <div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:2px">Testes na API</div>
    ${testes}
  </div>
  ${amostra}
  ${download}

  <div style="font-size:11.5px;color:#8fa39f">O que decide a importação: um teste com <b>HTTP 200</b> listando anexos do cliente + o "arquivo baixou!" no teste de download. Se der <b>403</b> (sem permissão) ou o download falhar, eu te aviso a alternativa.</div>
  </div></body></html>`;
}
