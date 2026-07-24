// Diagnóstico de ANEXOS/DOCUMENTOS do Ploomes (só Diretoria, read-only).
//
// Objetivo: descobrir COMO a conta real do Ploomes expõe os anexos, para montar o
// importador SEM chutar a API. Roda no Worker (que tem a chave e alcança o Ploomes).
// Não baixa nem grava nada — apenas inspeciona e relata.
//
// LEVE e à prova de travamento: consulta a raiz OData (documento de serviço, pequeno)
// para listar as coleções, e sonda alguns endpoints candidatos EM PARALELO, cada um
// com tempo limite curto. Nunca lança: devolve o que conseguir, mesmo com falhas.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cfg(env) {
  return { base: (env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, ''), headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } };
}

export async function sondarAnexosPloomes(env) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes (PLOOMES_USER_KEY) no cofre.' };
  const { base, headers } = cfg(env);
  const rel = /(attach|document|anexo|file|arquiv)/i;
  const out = { ok: true, entitySets: [], amostras: [] };

  // Busca JSON com tempo limite curto; nunca lança.
  const getJson = async (path, ms) => {
    try {
      const r = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(ms || 7000) });
      const rec = { status: r.status };
      if (r.ok) { try { rec.json = await r.json(); } catch { rec.corpo = 'resposta não-JSON'; } }
      else { rec.corpo = (await r.text().catch(() => '')).slice(0, 120); }
      return rec;
    } catch (e) { return { erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : String(e && e.message || e).slice(0, 90) }; }
  };

  // 1) Raiz OData (documento de serviço): lista compacta de TODAS as coleções.
  const raiz = await getJson('/', 7000);
  out.raizStatus = raiz.status != null ? raiz.status : null;
  if (raiz.erro) out.raizErro = raiz.erro;
  const todas = (raiz.json && Array.isArray(raiz.json.value)) ? raiz.json.value.map((v) => v.name || v.url).filter(Boolean) : [];
  out.totalColecoes = todas.length;
  out.entitySets = todas.filter((n) => rel.test(n));

  // 2) Sonda os candidatos EM PARALELO, com timeout curto e ordenação leve por Id
  //    (ajuda o Ploomes a usar índice e evitar o 504 do /Attachments sem filtro).
  const fixos = ['Attachments', 'AttachmentItems', 'AttachmentFolders', 'Documents'];
  const candidatos = [...new Set([...fixos, ...out.entitySets])].slice(0, 8);
  out.amostras = await Promise.all(candidatos.map(async (ep) => {
    const r = await getJson(`/${ep}?$top=1&$orderby=Id%20desc`, 6000);
    const rec = { endpoint: ep, status: r.status != null ? r.status : null, erro: r.erro };
    if (r.json && Array.isArray(r.json.value)) { const it = r.json.value[0]; rec.campos = it ? Object.keys(it) : []; }
    return rec;
  }));
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
  const lista = (arr) => (arr && arr.length) ? arr.map((x) => `<code>${esc(x)}</code>`).join(' ') : '<span style="color:#8fa39f">— nenhuma coleção de anexo/documento encontrada —</span>';
  const pill = (st) => `<span class="pill" style="background:#EEF3F1;color:${st === 200 ? '#1E5B31' : (st ? '#8a4b45' : '#8A6A16')}">${st != null ? 'HTTP ' + st : 'sem resposta'}</span>`;
  const amostras = (d.amostras || []).map((a) => `<div style="padding:8px 0;border-top:1px solid #F2F5F4">
      <div><code>/${esc(a.endpoint)}</code> ${a.status != null ? pill(a.status) : `<span class="pill" style="background:#FFF4DE;color:#8A6A16">${esc(a.erro || 'erro')}</span>`}</div>
      ${a.campos ? `<div style="font-size:12px;color:#4F6469;margin-top:5px">campos: ${a.campos.length ? a.campos.map((c) => `<code>${esc(c)}</code>`).join(' ') : '(sem registros nesta conta)'}</div>` : ''}
    </div>`).join('');

  return `${head('Diagnóstico de anexos')}<body><div class="wrap">
  <a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
  <h1 style="font-size:19px;margin:12px 0 4px">Diagnóstico — anexos no Ploomes</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 16px">Só inspeção (nada é baixado, apagado ou alterado). Tire um print e me mande — com isso eu monto o importador certo.</p>

  <div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:6px">1) Coleções do Ploomes ${pill(d.raizStatus)} ${d.totalColecoes != null ? `<span style="font-size:11px;color:#8fa39f">(${d.totalColecoes} coleções no total)</span>` : ''}</div>
    ${d.raizErro ? `<div style="font-size:12px;color:#8a4b45;margin-bottom:6px">Raiz: ${esc(d.raizErro)}</div>` : ''}
    <div style="font-size:12.5px;color:#4F6469;line-height:1.9"><b>Coleções de anexo/documento:</b> ${lista(d.entitySets)}</div>
  </div>

  <div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:2px">2) Teste dos endpoints candidatos</div>
    ${amostras || '<div style="color:#8fa39f;font-size:12.5px">—</div>'}
  </div>

  <div style="font-size:11.5px;color:#8fa39f">Se algum endpoint der <b>HTTP 200</b> com campos como <code>Url</code>, <code>FileName</code>, <code>Base64</code> ou <code>Size</code>, dá para importar os arquivos. Se der <b>403</b> (sem permissão) ou só metadados sem o arquivo, eu te aviso a alternativa.</div>
  </div></body></html>`;
}
