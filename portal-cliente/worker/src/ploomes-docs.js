// Diagnóstico de ANEXOS/DOCUMENTOS do Ploomes (só Diretoria, read-only).
//
// Objetivo: descobrir COMO a conta real do Ploomes expõe os anexos, para montar o
// importador SEM chutar a API. Roda no Worker (que tem a chave e alcança o Ploomes).
// Não baixa nem grava nada — apenas inspeciona e relata:
//   1) o $metadata (lista autoritativa de entidades/navegações) filtrado por anexo/documento;
//   2) uma amostra de endpoints candidatos (status + nomes dos campos do 1º registro).
//
// Risco que este diagnóstico resolve: se a API só lista metadados mas NÃO entrega o
// arquivo (bytes/URL), a importação de documentos não é viável por aqui — melhor saber já.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cfg(env) {
  return { base: (env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, ''), headers: { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' } };
}

export async function sondarAnexosPloomes(env) {
  if (!env.PLOOMES_USER_KEY) return { ok: false, erro: 'Falta a chave do Ploomes (PLOOMES_USER_KEY) no cofre.' };
  const { base, headers } = cfg(env);
  const rel = /(attach|document|anexo|file|arquiv)/i;
  const out = { ok: true, entidades: [], entitySets: [], navs: [], amostras: [] };

  // 1) $metadata — o mapa oficial de todas as entidades e relações.
  try {
    const r = await fetch(`${base}/$metadata`, { headers: { ...headers, Accept: 'application/xml' } });
    out.metadataStatus = r.status;
    if (r.ok) {
      const xml = await r.text();
      let m;
      const ents = new Set();
      const reEnt = /<EntityType[^>]*\bName="([^"]+)"/g;
      while ((m = reEnt.exec(xml))) if (rel.test(m[1])) ents.add(m[1]);
      const sets = new Set();
      const reSet = /<EntitySet[^>]*\bName="([^"]+)"/g;
      while ((m = reSet.exec(xml))) if (rel.test(m[1])) sets.add(m[1]);
      const navs = new Set();
      const reNav = /<NavigationProperty[^>]*\bName="([^"]+)"[^>]*\bType="([^"]+)"/g;
      while ((m = reNav.exec(xml))) if (rel.test(m[1]) || rel.test(m[2])) navs.add(`${m[1]} → ${m[2]}`);
      out.entidades = [...ents]; out.entitySets = [...sets]; out.navs = [...navs];
    } else {
      out.metadataErro = (await r.text()).slice(0, 200);
    }
  } catch (e) { out.metadataErro = String(e).slice(0, 200); }

  // 2) Amostra de endpoints candidatos: status + nomes dos campos do 1º registro.
  for (const ep of ['Documents', 'Attachments', 'ContactAttachments', 'DealAttachments', 'Files', 'ContactDocuments']) {
    try {
      const r = await fetch(`${base}/${ep}?$top=1`, { headers });
      const rec = { endpoint: ep, status: r.status };
      if (r.ok) {
        const j = await r.json();
        const it = (j.value || [])[0];
        rec.campos = it ? Object.keys(it) : [];
      }
      out.amostras.push(rec);
    } catch (e) { out.amostras.push({ endpoint: ep, erro: String(e).slice(0, 120) }); }
  }
  return out;
}

function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:820px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px;margin-bottom:12px}
code{background:#EEF3F1;border-radius:5px;padding:1px 6px;font-size:12.5px}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}
</style></head>`;
}

export function paginaSondaAnexos(user, d) {
  if (!d || d.ok === false) {
    return `${head('Diagnóstico de anexos')}<body><div class="wrap"><a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
    <div class="card" style="margin-top:12px;color:#8a4b45"><b>Não foi possível diagnosticar.</b><br>${esc((d && d.erro) || 'Erro desconhecido.')}</div></div></body></html>`;
  }
  const lista = (arr) => (arr && arr.length) ? arr.map((x) => `<code>${esc(x)}</code>`).join(' ') : '<span style="color:#8fa39f">— nada encontrado —</span>';
  const amostras = (d.amostras || []).map((a) => {
    const cor = a.status === 200 ? '#1E5B31' : (a.status ? '#8a4b45' : '#8A6A16');
    return `<div style="padding:8px 0;border-top:1px solid #F2F5F4">
      <div><code>/${esc(a.endpoint)}</code> <span class="pill" style="background:#EEF3F1;color:${cor}">${a.status != null ? 'HTTP ' + a.status : esc(a.erro || 'erro')}</span></div>
      ${a.campos ? `<div style="font-size:12px;color:#4F6469;margin-top:5px">campos: ${a.campos.length ? a.campos.map((c) => `<code>${esc(c)}</code>`).join(' ') : '(sem registros)'}</div>` : ''}
    </div>`;
  }).join('');

  return `${head('Diagnóstico de anexos')}<body><div class="wrap">
  <a href="/diretoria" style="color:#00333B;font-size:12px;font-weight:800;text-decoration:none">← Diretoria</a>
  <h1 style="font-size:19px;margin:12px 0 4px">Diagnóstico — anexos no Ploomes</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 16px">Leitura só de inspeção (nada é baixado ou apagado). Tire um print desta tela e me mande — com isso eu monto o importador certo.</p>

  <div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:6px">1) Mapa do Ploomes ($metadata) — <span class="pill" style="background:#EEF3F1;color:${d.metadataStatus === 200 ? '#1E5B31' : '#8a4b45'}">${d.metadataStatus != null ? 'HTTP ' + d.metadataStatus : 'sem resposta'}</span></div>
    ${d.metadataErro ? `<div style="font-size:12px;color:#8a4b45">${esc(d.metadataErro)}</div>` : ''}
    <div style="font-size:12.5px;color:#4F6469;line-height:1.9">
      <div><b>Entidades (tipo):</b> ${lista(d.entidades)}</div>
      <div><b>Coleções (endpoints):</b> ${lista(d.entitySets)}</div>
      <div><b>Relações (navegação):</b> ${lista(d.navs)}</div>
    </div>
  </div>

  <div class="card">
    <div style="font-size:13px;font-weight:800;margin-bottom:2px">2) Teste dos endpoints candidatos</div>
    ${amostras || '<div style="color:#8fa39f;font-size:12.5px">—</div>'}
  </div>

  <div style="font-size:11.5px;color:#8fa39f">Se aparecerem endpoints com <b>HTTP 200</b> e campos como <code>Url</code>, <code>FileName</code>, <code>Base64</code> ou <code>Size</code>, dá para importar os arquivos. Se só houver metadados sem o arquivo, eu te aviso a alternativa.</div>
  </div></body></html>`;
}
