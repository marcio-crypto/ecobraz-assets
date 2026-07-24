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

// Mapeamento PROPOSTO (ajusto depois de ver a amostra real). Empresa x pessoa pelo TypeId.
export function mapearContato(c) {
  if (!c || c.Id == null) return null;
  const dig = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const doc = dig(c.CNPJ || c.CPF || c.Register);
  const ehPJ = doc.length === 14 || c.TypeId === 2 || !!c.LegalName;
  const fone = (Array.isArray(c.Phones) && c.Phones[0] && (c.Phones[0].PhoneNumber || c.Phones[0].Number)) || c.Phone || '';
  const email = (Array.isArray(c.Emails) && c.Emails[0] && c.Emails[0].Email) || c.Email || '';
  return {
    ploomesId: c.Id,
    tipo: ehPJ ? 'PJ' : 'PF',
    nome: ehPJ ? (c.LegalName || c.Name || '') : (c.Name || ''),
    nomeFantasia: ehPJ ? (c.Name || '') : '',
    documento: doc,
    email: String(email || '').trim().toLowerCase(),
    telefone: String(fone || '').trim(),
    cidade: (c.City && (c.City.Name || c.City.name)) || c.CityName || '',
    uf: (c.City && c.City.StateShortName) || c.StateName || '',
    endereco: [c.StreetAddress, c.Neighborhood, c.ZipCode].filter(Boolean).join(' · '),
    criadoEm: c.CreateDate || c.LastUpdateDate || '',
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
// Página do inspetor (Diretoria)
// ---------------------------------------------------------------------------
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
