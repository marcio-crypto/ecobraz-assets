// Propostas comerciais & Contratos (escritório/comercial — a Débora).
// Substitui a emissão que era feita no Ploomes: proposta com itens/valores e
// contrato básico de prestação de serviços, ambos prontos para imprimir/salvar
// em PDF (pelo navegador) no padrão visual novo da Ecobraz.
//
// Guardado no KV: prop:{id} (registro), prop:index (lista), prop:seq:{ano} (numeração).
// O CONTRATO usa os mesmos dados da proposta. O texto atual é uma MINUTA-PADRÃO
// (marcada na tela, fora da impressão) — quando a Débora enviar o modelo oficial
// do Ploomes, é só substituir as cláusulas em clausulasContrato().

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const digits = (s) => String(s || '').replace(/\D/g, '');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const fmtCNPJ = (v) => { const d = digits(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (v || ''); };
const fmtCPF = (v) => { const d = digits(v); return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (v || ''); };
const fmtDoc = (v) => { const d = digits(v); return d.length === 14 ? fmtCNPJ(d) : d.length === 11 ? fmtCPF(d) : (v || ''); };
const money = (n) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numBR = (s) => { const t = String(s == null ? '' : s).trim(); if (!t) return 0; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
const dataBR = (iso) => { const d = new Date(iso || Date.now()); if (isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dataExtenso = (iso) => { const d = new Date(iso || Date.now()); if (isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; };
const horaBR = (iso) => { const d = new Date(iso || Date.now()); if (isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} às ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
async function sha256hex(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
// Validação de CPF (dígitos verificadores) — evita erro de digitação no aceite.
function cpfValido(v) {
  const d = digits(v); if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const dv = ((s * 10) % 11) % 10; if (dv !== Number(d[n])) return false; }
  return true;
}
const maskCPF = (v) => { const d = digits(v); return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : '***'; };

// Dados da Ecobraz no cabeçalho dos documentos (do modelo do Ploomes — ajuste aqui se algo mudar).
export const ECOBRAZ = {
  razao: 'Associação Auxílio à Reciclagem de Eletrônicos e Inc. Dig. Ecobraz',
  cnpj: '14.197.457/0001-42',
  fone: '(11) 4329-2001',
  email: 'contato@ecobraz.org.br',
  endereco: 'Rua Dona Maria Quedas, 230 — Jd. Andaraí — São Paulo — SP',
  cidadeForo: 'São Paulo/SP',
};

// --- Dados (KV) ---------------------------------------------------------------
export async function listarPropostas(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('prop:index') : null;
  return raw ? JSON.parse(raw) : [];
}
export async function lerProposta(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`prop:${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
function totalDe(itens) { return (itens || []).reduce((s, i) => s + (Number(i.qtd) || 0) * (Number(i.unit) || 0), 0); }
export async function salvarProposta(env, user, b) {
  if (!env.PORTAL_KV) return null;
  const agoraISO = new Date().toISOString();
  const itens = Array.isArray(b.itens) ? b.itens.map((i) => ({
    residuo: limpar(i.residuo).slice(0, 140), qtd: Number(i.qtd) || 0, un: limpar(i.un).slice(0, 12) || 'un.', unit: Number(i.unit) || 0,
  })).filter((i) => i.residuo || i.qtd || i.unit).slice(0, 40) : [];
  let p = b.id ? await lerProposta(env, b.id) : null;
  if (!p) {
    const ano = new Date().getFullYear();
    // Contrato AVULSO (pedido da Débora): documento geral, sem proposta — numeração própria CT-AAAA-NNN.
    const ehContrato = String(b.tipoDoc || '') === 'contrato';
    const chaveSeq = ehContrato ? `prop:seqct:${ano}` : `prop:seq:${ano}`;
    const seq = 1 + (Number(await env.PORTAL_KV.get(chaveSeq)) || 0);
    await env.PORTAL_KV.put(chaveSeq, String(seq));
    const num = String(seq).padStart(3, '0');
    p = ehContrato
      ? { id: `ct-${ano}-${num}`, numero: `CT-${ano}-${num}`, docTipo: 'contrato', criadoEm: agoraISO }
      : { id: `${ano}-${num}`, numero: `P-${ano}-${num}`, criadoEm: agoraISO };
  }
  p = {
    ...p,
    atualizadoEm: agoraISO,
    por: (user && user.email) || '',
    clienteId: limpar(b.clienteId).slice(0, 40),
    cliente: {
      nome: limpar(b.nome).slice(0, 160), doc: digits(b.doc).slice(0, 14),
      endereco: limpar(b.endereco).slice(0, 220), contato: limpar(b.contato).slice(0, 120),
      email: limpar(b.email).slice(0, 120), fone: limpar(b.fone).slice(0, 40),
    },
    titulo: limpar(b.titulo).slice(0, 160),
    itens,
    total: totalDe(itens),
    pagamento: limpar(b.pagamento).slice(0, 120),
    validade: limpar(b.validade).slice(0, 80),
    prazo: limpar(b.prazo).slice(0, 120),
    obs: String(b.obs || '').slice(0, 2000).trim(),
  };
  await env.PORTAL_KV.put(`prop:${p.id}`, JSON.stringify(p));
  await atualizarIndice(env, p);
  return p;
}
async function atualizarIndice(env, p) {
  const idx = (await listarPropostas(env)).filter((x) => x.id !== p.id);
  idx.unshift({ id: p.id, numero: p.numero, nome: (p.cliente || {}).nome || '', doc: (p.cliente || {}).doc || '', total: p.total, criadoEm: p.criadoEm, aceite: !!p.aceite, temLink: !!p.aceiteToken, docTipo: p.docTipo || '' });
  await env.PORTAL_KV.put('prop:index', JSON.stringify(idx.slice(0, 500)));
}

// --- Aceite eletrônico ---------------------------------------------------------
// O cliente abre um link único (token), confere o contrato, preenche nome/CPF,
// desenha a assinatura e aceita. Fica registrada a trilha de evidências (data/hora,
// IP, navegador, código de verificação). Assinatura eletrônica simples — não é
// certificado ICP-Brasil.
export async function garantirTokenAceite(env, id) {
  const p = await lerProposta(env, id);
  if (!p) return null;
  if (!p.aceiteToken) {
    const b = crypto.getRandomValues(new Uint8Array(18));
    p.aceiteToken = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await env.PORTAL_KV.put(`prop:${p.id}`, JSON.stringify(p));
    await atualizarIndice(env, p);
  }
  return p;
}
export async function registrarAceite(env, id, token, dados, meta) {
  const p = await lerProposta(env, id);
  if (!p || !p.aceiteToken || String(token || '') !== p.aceiteToken) return { ok: false, error: 'link_invalido', message: 'Link inválido ou expirado. Peça um novo link à Ecobraz.' };
  if (p.aceite) return { ok: false, error: 'ja_aceita', message: 'Este documento já foi aceito.' };
  const nome = limpar(dados.nome).slice(0, 120);
  const cpf = digits(dados.cpf);
  const cargo = limpar(dados.cargo).slice(0, 80);
  const email = limpar(dados.email).slice(0, 120);
  const ass = String(dados.assinatura || '');
  if (nome.length < 5 || !nome.includes(' ')) return { ok: false, error: 'nome', message: 'Escreva o nome completo.' };
  if (!cpfValido(cpf)) return { ok: false, error: 'cpf', message: 'CPF inválido — confira os números.' };
  if (!dados.aceito) return { ok: false, error: 'aceito', message: 'É preciso marcar a caixa "Li e aceito".' };
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(ass) || ass.length < 800 || ass.length > 200000) return { ok: false, error: 'assinatura', message: 'Desenhe a sua assinatura no quadro.' };
  const dt = new Date().toISOString();
  const codigo = (await sha256hex(`${p.id}|${nome}|${cpf}|${dt}|${p.aceiteToken}`)).slice(0, 10).toUpperCase();
  p.aceite = { nome, cpf, cargo, email, dt, ip: String((meta && meta.ip) || '').slice(0, 45), ua: String((meta && meta.ua) || '').slice(0, 180), assinatura: ass, codigo };
  await env.PORTAL_KV.put(`prop:${p.id}`, JSON.stringify(p));
  await atualizarIndice(env, p);
  return { ok: true, codigo, p };
}

// --- UI base (mesmo padrão do módulo de Cadastro) -----------------------------
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
function topo(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub)}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}

// --- Lista --------------------------------------------------------------------
export function paginaPropostas(user, lista) {
  const badge = (p) => (p.docTipo === 'contrato' ? '<span style="font-size:10px;font-weight:800;color:#0B5B66;background:#E3F0F3;border-radius:999px;padding:2px 9px">CONTRATO</span> ' : '')
    + (p.aceite ? '<span style="font-size:10px;font-weight:800;color:#0B6B3A;background:#E7F4EC;border-radius:999px;padding:2px 9px">✓ Aceito</span>'
    : p.temLink ? '<span style="font-size:10px;font-weight:800;color:#8A6A16;background:#FFF4DE;border-radius:999px;padding:2px 9px">Aguardando aceite</span>' : '');
  const rows = (lista || []).map((p) => `<a href="${p.docTipo === 'contrato' ? '/contrato/ver' : '/proposta/ver'}?id=${esc(p.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:10px;text-decoration:none;border:1px solid #EEF1F0;border-radius:10px;padding:12px 14px;margin-bottom:8px;background:#FBFDFC">
      <span style="min-width:0"><span style="font-size:13px;font-weight:800;color:#10262B">${esc(p.numero)} · ${esc(p.nome || '—')}</span> ${badge(p)}<span style="display:block;font-size:11px;color:#8fa39f">${esc(fmtDoc(p.doc))}${p.criadoEm ? ' · ' + esc(dataBR(p.criadoEm)) : ''}</span></span>
      <span style="flex:none;text-align:right">${p.docTipo === 'contrato' ? '' : `<span style="display:block;font-size:12.5px;font-weight:800;color:#0B5B66">${money(p.total)}</span>`}<span style="font-size:10.5px;color:#3f8f3a;font-weight:700">abrir ↗</span></span>
    </a>`).join('') || '<div style="font-size:12.5px;color:#8fa39f">Nenhum documento ainda. Crie a primeira proposta ou um contrato avulso — ou abra a ficha de um cliente.</div>';
  return `${head('Propostas')}<body>${topo('propostas')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">
    <div><h1 style="font-size:22px;margin:0">Propostas &amp; Contratos</h1>
    <div style="font-size:12.5px;color:#7c8a87;margin-top:3px">Emita a proposta comercial e o contrato básico — prontos para imprimir ou salvar em PDF.</div></div>
    <div style="flex:none;display:flex;gap:8px;flex-wrap:wrap">
      <a href="/proposta/nova" class="btn btn-p">＋ Nova proposta</a>
      <a href="/proposta/nova?tipo=contrato" class="btn btn-d">＋ Novo contrato (avulso)</a>
    </div>
  </div>
  <div class="card">${rows}</div>
</div></body></html>`;
}

// --- Formulário ---------------------------------------------------------------
export function paginaPropostaForm(user, prop, cli, tipoNovo) {
  const p = prop || {};
  const c = p.cliente || {};
  // Contrato AVULSO: formulário reduzido (só cliente + referência + observações).
  const ehContrato = (p.docTipo === 'contrato') || tipoNovo === 'contrato';
  // Pré-preenche a partir da ficha do cliente (quando veio de /cadastro/cliente).
  const pre = cli ? {
    nome: cli.tipo === 'PJ' ? (cli.razaoSocial || cli.nomeFantasia || '') : (cli.nome || ''),
    doc: cli.tipo === 'PJ' ? cli.cnpj : cli.cpf,
    endereco: (() => { const e = cli.endereco || {}; return [[e.logradouro, e.numero].filter(Boolean).join(', '), e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' · ') || limpar(cli.enderecoTexto || ''); })(),
    contato: ((cli.contatos || [])[0] || {}).nome || cli.responsavel || '',
    email: cli.email || ((cli.contatos || [])[0] || {}).email || '',
    fone: cli.telefone || cli.fone || ((cli.contatos || [])[0] || {}).fone || '',
    clienteId: cli.id || '',
  } : {};
  const v = (k) => esc(c[k] != null && c[k] !== '' ? c[k] : (pre[k] || ''));
  const itens = (p.itens && p.itens.length ? p.itens : [{ residuo: '', qtd: 1, un: 'un.', unit: 0 }]);
  return `${head(ehContrato ? (p.id ? 'Editar contrato' : 'Novo contrato') : (p.id ? 'Editar proposta' : 'Nova proposta'))}<body>${topo('propostas')}
<div class="wrap">
  <a href="${p.id ? (ehContrato ? '/contrato/ver?id=' : '/proposta/ver?id=') + esc(p.id) : '/propostas'}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Voltar</a>
  <h1 style="font-size:22px;margin:12px 0 16px">${ehContrato ? (p.id ? 'Editar contrato ' + esc(p.numero) : 'Novo contrato (avulso)') : (p.id ? 'Editar proposta ' + esc(p.numero) : 'Nova proposta comercial')}</h1>
  ${ehContrato && !p.id ? '<div style="font-size:12.5px;color:#7c8a87;margin:-8px 0 14px;line-height:1.5">Contrato geral, sem proposta: identifica as partes e as condições gerais. Valores ficam nas propostas/ordens de cada serviço.</div>' : ''}
  <div class="card">
    <div class="sec" style="margin-top:0">Cliente</div>
    <div class="g2">
      <div><label>Razão social / Nome</label><input id="f-nome" value="${v('nome')}"></div>
      <div><label>CNPJ / CPF</label><input id="f-doc" value="${esc(fmtDoc(c.doc != null && c.doc !== '' ? c.doc : (pre.doc || '')))}"></div>
    </div>
    <label>Endereço (coleta)</label><input id="f-end" value="${v('endereco')}">
    <div class="g3">
      <div><label>Contato</label><input id="f-contato" value="${v('contato')}"></div>
      <div><label>E-mail</label><input id="f-email" value="${v('email')}"></div>
      <div><label>Telefone</label><input id="f-fone" value="${v('fone')}"></div>
    </div>
    <label>Título / referência (opcional)</label><input id="f-titulo" value="${esc(p.titulo || '')}" placeholder="ex.: Coleta de equipamentos de informática — matriz">

    ${ehContrato ? '' : `<div class="sec">Itens da proposta</div>
    <div style="font-size:12px;color:#7c8a87;margin:-2px 0 8px">Resíduo, quantidade e valor unitário — o total calcula sozinho. Use valor 0 para item sem cobrança.</div>
    <div id="itens"></div>
    <button type="button" class="btn btn-g" style="padding:9px 14px;font-size:13px" onclick="addItem()">＋ Adicionar item</button>
    <div style="text-align:right;font-size:15px;font-weight:800;color:#00333B;margin-top:10px">Total: <span id="f-total">R$ 0,00</span></div>

    <div class="sec">Condições</div>
    <div class="g3">
      <div><label>Forma de pagamento</label><input id="f-pag" value="${esc(p.pagamento || '')}" placeholder="ex.: Boleto 10 DDL"></div>
      <div><label>Validade da proposta</label><input id="f-val" value="${esc(p.validade || '')}" placeholder="ex.: 15 dias"></div>
      <div><label>Prazo de atendimento</label><input id="f-prazo" value="${esc(p.prazo || '')}" placeholder="ex.: até 5 dias úteis"></div>
    </div>`}
    <label>Observações</label><textarea id="f-obs" rows="3" placeholder="${ehContrato ? 'condições específicas acordadas com este cliente (opcional)…' : 'condições adicionais, detalhes da coleta…'}">${esc(p.obs || '')}</textarea>

    <div style="display:flex;gap:10px;margin-top:20px;align-items:center;flex-wrap:wrap">
      <button type="button" class="btn btn-p" onclick="salvar()">${p.id ? 'Salvar alterações' : 'Salvar e visualizar'}</button>
      <span id="msg" style="font-size:12.5px;color:#4F6469"></span>
    </div>
  </div>
</div>
<script>
const ITENS_INI=${JSON.stringify(itens).replace(/</g, '\\u003c')};
const fmt=(n)=>'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const numBR=(s)=>{const t=String(s==null?'':s).trim();if(!t)return 0;return Number(t.includes(',')?t.replace(/\\./g,'').replace(',','.'):t)||0;};
function rowHTML(i){return '<div class="g-item" style="display:grid;grid-template-columns:1fr 74px 70px 110px 96px 34px;gap:8px;align-items:center;margin-bottom:8px">'
 +'<input class="i-res" placeholder="Resíduo / serviço" value="'+String(i.residuo||'').replace(/"/g,'&quot;')+'">'
 +'<input class="i-qtd" inputmode="decimal" placeholder="Qtd" value="'+(i.qtd||'')+'">'
 +'<input class="i-un" placeholder="un." value="'+String(i.un||'un.').replace(/"/g,'&quot;')+'">'
 +'<input class="i-unit" inputmode="decimal" placeholder="Valor unit." value="'+(i.unit?String(i.unit).replace('.',','):'')+'">'
 +'<div class="i-tot" style="font-size:13px;font-weight:800;color:#00333B;text-align:right">R$ 0,00</div>'
 +'<button type="button" onclick="this.parentNode.remove();recalc()" style="border:none;background:#fff;border:1px solid #E4EBE9;border-radius:8px;padding:8px 0;cursor:pointer;color:#a06a62;font-weight:800">✕</button></div>';}
function addItem(i){document.getElementById('itens').insertAdjacentHTML('beforeend',rowHTML(i||{qtd:1,un:'un.'}));recalc();}
function coletar(){const el=document.getElementById('itens');if(!el)return [];return Array.from(document.querySelectorAll('.g-item')).map(r=>({residuo:r.querySelector('.i-res').value,qtd:numBR(r.querySelector('.i-qtd').value),un:r.querySelector('.i-un').value,unit:numBR(r.querySelector('.i-unit').value)}));}
function recalc(){const tot=document.getElementById('f-total');if(!tot)return;let t=0;document.querySelectorAll('.g-item').forEach(r=>{const s=numBR(r.querySelector('.i-qtd').value)*numBR(r.querySelector('.i-unit').value);t+=s;r.querySelector('.i-tot').textContent=fmt(s);});tot.textContent=fmt(t);}
const EH_CONTRATO=${ehContrato ? 'true' : 'false'};
if(document.getElementById('itens')){document.getElementById('itens').addEventListener('input',recalc);ITENS_INI.forEach(i=>addItem(i));}
const gv=(id)=>{const el=document.getElementById(id);return el?el.value:'';};
async function salvar(){
  const msg=document.getElementById('msg');msg.textContent='Salvando…';
  const body={id:${JSON.stringify(p.id || '')},clienteId:${JSON.stringify(p.clienteId || pre.clienteId || '')},
   tipoDoc:EH_CONTRATO?'contrato':'',
   nome:gv('f-nome'),doc:gv('f-doc'),endereco:gv('f-end'),
   contato:gv('f-contato'),email:gv('f-email'),fone:gv('f-fone'),
   titulo:gv('f-titulo'),itens:coletar(),pagamento:gv('f-pag'),
   validade:gv('f-val'),prazo:gv('f-prazo'),obs:gv('f-obs')};
  if(!body.nome.trim()){msg.textContent='Preencha o nome/razão social do cliente.';return;}
  try{const r=await fetch('/api/proposta/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const j=await r.json();if(j.ok&&j.id){location.href=(EH_CONTRATO?'/contrato/ver?id=':'/proposta/ver?id=')+encodeURIComponent(j.id);}else{msg.textContent=j.message||'Não consegui salvar. Tente de novo.';}}
  catch{msg.textContent='Falha de rede. Tente de novo.';}
}
</script></body></html>`;
}

// --- Documentos (A4, padrão visual novo da Ecobraz) ---------------------------
function cssDoc() {
  return `<style>*{box-sizing:border-box}body{margin:0;background:#DDE5E2;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.folha{max-width:800px;margin:18px auto;background:#fff;box-shadow:0 10px 30px rgba(11,33,54,.14)}
.cabo{background:#00333B;color:#fff;padding:22px 30px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.cabo img{height:34px;display:block}
.cabo .dados{text-align:right;font-size:9.5px;line-height:1.55;color:#cfe3e0}
.cabo .dados b{color:#fff;font-size:10.5px;display:block;margin-bottom:2px}
.filete{height:5px;background:linear-gradient(90deg,#92C430,#5a9e2f)}
.corpo{padding:26px 30px 30px}
.titulo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0 0 4px}
.titulo h1{font-size:19px;color:#00333B;margin:0;letter-spacing:-.2px}
.numero{flex:none;background:#92C430;color:#10262B;font-weight:800;font-size:12.5px;border-radius:20px;padding:5px 14px}
.subt{font-size:12px;color:#7c8a87;margin:0 0 18px}
.sec{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B;margin:20px 0 8px;display:flex;align-items:center;gap:8px}
.sec::before{content:"";width:4px;height:13px;background:#92C430;border-radius:2px}
.bloco{border:1px solid #E4EBE9;border-radius:12px;padding:14px 16px}
.linha{display:flex;gap:10px;font-size:12px;padding:4px 0}
.linha span{color:#6B7B78;width:150px;flex:none}
.linha b{font-weight:700}
table.itens{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
table.itens th{background:#00333B;color:#fff;text-align:left;padding:9px 12px;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase}
table.itens th.r,table.itens td.r{text-align:right}
table.itens td{padding:9px 12px;border-bottom:1px solid #EEF1F0}
table.itens tr:nth-child(even) td{background:#FBFDFC}
table.itens tr.total td{border-top:2px solid #92C430;border-bottom:none;font-weight:800;color:#00333B;font-size:13px;background:#F4FAEA}
.cond{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.cond .c{border:1px solid #E4EBE9;border-radius:12px;padding:11px 13px}
.cond .c i{display:block;font-style:normal;font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#7c8a87;margin-bottom:4px}
.cond .c b{font-size:12.5px}
.obs{border:1px dashed #cfe0dd;border-radius:12px;padding:12px 14px;font-size:12px;color:#374b48;line-height:1.6;white-space:pre-wrap}
.rodape{border-top:1px solid #E4EBE9;margin-top:26px;padding-top:12px;font-size:9.5px;color:#8fa39f;display:flex;justify-content:space-between;gap:10px}
.clausula{font-size:12px;line-height:1.7;margin:0 0 12px;text-align:justify}
.clausula b{color:#00333B}
.assin{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:44px}
.assin .a{text-align:center;font-size:11px;color:#374b48}
.assin .a .tr{border-top:1.5px solid #10262B;padding-top:7px;margin-top:36px}
.toolbar{max-width:800px;margin:14px auto 4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.tb{display:inline-block;border:none;border-radius:11px;padding:11px 16px;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.tb-p{background:#92C430;color:#10262B}.tb-d{background:#00333B;color:#fff}.tb-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.aviso-minuta{max-width:800px;margin:0 auto 10px;background:#FFF4DE;border:1px solid #eed9a8;color:#8A6A16;border-radius:12px;padding:10px 14px;font-size:12px;line-height:1.5}
.linkbox{max-width:800px;margin:0 auto 10px;background:#E7F4EC;border:1px solid #bfe0cb;color:#0B6B3A;border-radius:12px;padding:10px 14px;font-size:12px;line-height:1.6;display:none;word-break:break-all}
.aceitebox{border:1.5px solid #1E7A3D;background:#F0FAF3;border-radius:12px;padding:12px 16px;font-size:11px;line-height:1.7;color:#14532d;margin-top:20px}
.aceitebox b{color:#0B6B3A}
.ass-img{height:54px;display:block;margin:0 auto -8px}
.chip-ok{background:#E7F4EC;color:#0B6B3A;border:1px solid #bfe0cb;cursor:default}
@media print{body{background:#fff}.folha{margin:0;max-width:none;box-shadow:none}.toolbar,.aviso-minuta,.linkbox{display:none}}
@page{size:A4;margin:0}
</style>`;
}
function cabecalhoDoc() {
  return `<div class="cabo">
    <img src="/assets/logo-claro.png" alt="Ecobraz">
    <div class="dados"><b>${esc(ECOBRAZ.razao)}</b>
      CNPJ: ${esc(ECOBRAZ.cnpj)}<br>${esc(ECOBRAZ.fone)} · ${esc(ECOBRAZ.email)}<br>${esc(ECOBRAZ.endereco)}</div>
  </div><div class="filete"></div>`;
}
function blocoCliente(c) {
  return `<div class="bloco">
    <div class="linha"><span>Razão social / Nome</span><b>${esc(c.nome || '—')}</b></div>
    ${c.doc ? `<div class="linha"><span>${digits(c.doc).length === 14 ? 'CNPJ' : 'CPF'}</span><b>${esc(fmtDoc(c.doc))}</b></div>` : ''}
    ${c.endereco ? `<div class="linha"><span>Endereço (coleta)</span><b>${esc(c.endereco)}</b></div>` : ''}
    ${c.contato ? `<div class="linha"><span>Contato</span><b>${esc(c.contato)}</b></div>` : ''}
    ${(c.email || c.fone) ? `<div class="linha"><span>E-mail / Telefone</span><b>${esc([c.email, c.fone].filter(Boolean).join(' · '))}</b></div>` : ''}
  </div>`;
}
function tabelaItens(p) {
  const linhas = (p.itens || []).map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.residuo || '—')}</td><td class="r">${(Number(i.qtd) || 0).toLocaleString('pt-BR')} ${esc(i.un || '')}</td><td class="r">${money(i.unit)}</td><td class="r">${money((Number(i.qtd) || 0) * (Number(i.unit) || 0))}</td></tr>`).join('');
  return `<table class="itens"><thead><tr><th style="width:34px">Item</th><th>Resíduo / serviço</th><th class="r" style="width:90px">Qtd.</th><th class="r" style="width:110px">Valor unitário</th><th class="r" style="width:110px">Total</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan="5" style="color:#8fa39f">Sem itens.</td></tr>'}
    <tr class="total"><td colspan="4">Valor total</td><td class="r">${money(p.total)}</td></tr></tbody></table>`;
}

// Botões e caixa do fluxo de aceite (equipe). O link é montado no navegador
// (location.origin), copiado para a área de transferência e pode ir por e-mail.
function aceiteUI(p) {
  if (p.aceite) return { botoes: `<span class="tb chip-ok">✓ Aceito em ${esc(horaBR(p.aceite.dt))}</span>`, extra: '' };
  const temEmail = !!((p.cliente || {}).email);
  return {
    botoes: `<button class="tb tb-g" onclick="gerarLinkAceite(false)">✍️ Link de aceite</button>${temEmail ? `<button class="tb tb-g" onclick="gerarLinkAceite(true)">✉️ Enviar para aceite</button>` : ''}`,
    extra: `<div class="linkbox" id="lkbox"></div>
<script>
async function gerarLinkAceite(porEmail){
  const box=document.getElementById('lkbox');box.style.display='block';box.textContent=porEmail?'Enviando…':'Gerando link…';
  try{
    const r=await fetch(porEmail?'/api/proposta/enviar-aceite':'/api/proposta/gerar-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:${JSON.stringify(p.id)}})});
    const j=await r.json();
    if(!j.ok){box.textContent=j.message||'Não deu certo — tente de novo.';return;}
    const u=location.origin+j.path;
    let cop='';try{await navigator.clipboard.writeText(u);cop=' (copiado ✓)';}catch(e){}
    box.innerHTML=(porEmail?'<b>E-mail enviado ✓</b> para '+(j.para||'o cliente')+'. ':'')+'<b>Link de aceite'+cop+':</b><br>'+u+'<br><span style="color:#4F6469">Mande por WhatsApp ou e-mail — o cliente abre, confere o contrato, assina na tela e aceita.</span>';
  }catch(e){box.textContent='Falha de rede — tente de novo.';}
}
</script>`,
  };
}

export function paginaPropostaVer(p) {
  const ac = aceiteUI(p);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Proposta ${esc(p.numero)} — Ecobraz</title>${cssDoc()}</head><body>
<div class="toolbar">
  <a href="/propostas" class="tb tb-g">← Propostas</a>
  <button class="tb tb-p" onclick="print()">🖨️ Imprimir / salvar PDF</button>
  ${p.aceite ? '' : `<a href="/proposta/editar?id=${esc(p.id)}" class="tb tb-g">✏️ Editar</a>`}
  <a href="/contrato/ver?id=${esc(p.id)}" class="tb tb-d">📜 ${p.aceite ? 'Contrato assinado' : 'Gerar contrato'}</a>
  ${ac.botoes}
</div>
${ac.extra}
<div class="folha">
  ${cabecalhoDoc()}
  <div class="corpo">
    <div class="titulo"><h1>PROPOSTA COMERCIAL</h1><span class="numero">Nº ${esc(p.numero)}</span></div>
    <p class="subt">${p.titulo ? esc(p.titulo) + ' · ' : ''}Emitida em ${esc(dataBR(p.criadoEm))}</p>
    <div class="sec">Dados do cliente</div>
    ${blocoCliente(p.cliente || {})}
    <div class="sec">Itens</div>
    ${tabelaItens(p)}
    <div class="sec">Condições</div>
    <div class="cond">
      <div class="c"><i>Forma de pagamento</i><b>${esc(p.pagamento || 'a combinar')}</b></div>
      <div class="c"><i>Validade da proposta</i><b>${esc(p.validade || 'a combinar')}</b></div>
      <div class="c"><i>Prazo de atendimento</i><b>${esc(p.prazo || 'a combinar')}</b></div>
    </div>
    ${p.obs ? `<div class="sec">Observações</div><div class="obs">${esc(p.obs)}</div>` : ''}
    <div class="rodape"><span>${esc(ECOBRAZ.razao)} · CNPJ ${esc(ECOBRAZ.cnpj)}</span><span>${esc(ECOBRAZ.fone)} · ${esc(ECOBRAZ.email)}</span></div>
  </div>
</div></body></html>`;
}

// Texto do contrato — minuta-padrão APROVADA pela Débora (06/08/2026) como modelo
// oficial da Ecobraz. Qualquer ajuste futuro de cláusula é feito aqui.
// Contrato AVULSO/GERAL (sem proposta): mesmas cláusulas, generalizadas — valores e
// prazos ficam nas propostas/ordens de cada serviço. Ajustar ao modelo oficial da
// Débora quando o PDF dela chegar.
function clausulasContratoGeral(p) {
  const c = p.cliente || {};
  return [
    ['CLÁUSULA 1ª — DO OBJETO', `Prestação, pela CONTRATADA, dos serviços de coleta, transporte, triagem, descaracterização e destinação de resíduos eletrônicos, conforme as solicitações da CONTRATANTE aceitas pela CONTRATADA${c.endereco ? `, com retirada no endereço indicado pela CONTRATANTE (${c.endereco})` : ''} ou em outro endereço acordado entre as partes.`],
    ['CLÁUSULA 2ª — DO VALOR E DO PAGAMENTO', 'Os valores e as condições de pagamento serão os acordados entre as partes em cada proposta ou ordem de serviço aprovada, que passa a integrar o presente contrato.'],
    ['CLÁUSULA 3ª — DO PRAZO DE ATENDIMENTO', 'Os serviços serão executados conforme a agenda acordada entre as partes em cada solicitação, contada da confirmação da agenda de coleta.'],
    ['CLÁUSULA 4ª — DA DOCUMENTAÇÃO', 'A CONTRATADA disponibilizará à CONTRATANTE os documentos aplicáveis à operação (como MTR, CDF e laudos), quando previstos no escopo contratado.'],
    ['CLÁUSULA 5ª — DAS OBRIGAÇÕES', 'A CONTRATANTE disponibilizará os materiais e o acesso ao local nas datas agendadas. A CONTRATADA executará os serviços com pessoal próprio e em conformidade com a legislação aplicável.'],
    ['CLÁUSULA 6ª — DA VIGÊNCIA', 'O presente contrato vigora por prazo indeterminado a partir da assinatura, podendo ser encerrado por qualquer das partes mediante aviso prévio de 30 (trinta) dias, sem prejuízo dos serviços já solicitados.'],
    ['CLÁUSULA 7ª — DO FORO', `Fica eleito o foro da Comarca de ${ECOBRAZ.cidadeForo} para dirimir quaisquer controvérsias decorrentes deste contrato.`],
  ];
}
const clausulasDe = (p) => p.docTipo === 'contrato' ? clausulasContratoGeral(p) : clausulasContrato(p);
function clausulasContrato(p) {
  const c = p.cliente || {};
  return [
    ['CLÁUSULA 1ª — DO OBJETO', `Prestação, pela CONTRATADA, dos serviços de coleta, transporte, triagem, descaracterização e destinação dos resíduos relacionados no quadro de itens desta proposta/contrato, a serem retirados no endereço indicado pela CONTRATANTE${c.endereco ? ` (${c.endereco})` : ''}.`],
    ['CLÁUSULA 2ª — DO VALOR E DO PAGAMENTO', `Pelos serviços descritos, a CONTRATANTE pagará à CONTRATADA o valor total de ${money(p.total)}, na seguinte forma: ${p.pagamento || 'a combinar entre as partes'}.`],
    ['CLÁUSULA 3ª — DO PRAZO DE ATENDIMENTO', `Os serviços serão executados no prazo de ${p.prazo || 'comum acordo entre as partes'}, contado da assinatura deste instrumento e da confirmação da agenda de coleta.`],
    ['CLÁUSULA 4ª — DA DOCUMENTAÇÃO', 'A CONTRATADA disponibilizará à CONTRATANTE os documentos aplicáveis à operação (como MTR, CDF e laudos), quando previstos no escopo contratado.'],
    ['CLÁUSULA 5ª — DAS OBRIGAÇÕES', 'A CONTRATANTE disponibilizará os materiais e o acesso ao local na data agendada. A CONTRATADA executará os serviços com pessoal próprio e em conformidade com a legislação aplicável.'],
    ['CLÁUSULA 6ª — DA VIGÊNCIA', 'O presente contrato vigora da data de assinatura até a conclusão dos serviços e a entrega da documentação aplicável.'],
    ['CLÁUSULA 7ª — DO FORO', `Fica eleito o foro da Comarca de ${ECOBRAZ.cidadeForo} para dirimir quaisquer controvérsias decorrentes deste contrato.`],
  ];
}
export function paginaContratoVer(p, modo = 'equipe', base = 'https://sistema.ecobraz.org') {
  const c = p.cliente || {};
  const cliente = modo === 'cliente';
  const geral = p.docTipo === 'contrato';
  const a = p.aceite || null;
  const clausulas = clausulasDe(p).map(([t, x]) => `<p class="clausula"><b>${esc(t)}.</b> ${esc(x)}</p>`).join('');
  const ac = cliente ? { botoes: '', extra: '' } : aceiteUI(p);
  const assinContratante = a
    ? `<div class="a"><img class="ass-img" src="${esc(a.assinatura)}" alt="Assinatura"><div class="tr"><b>${esc(a.nome)}</b><br>CPF ${esc(fmtCPF(a.cpf))}${a.cargo ? ' · ' + esc(a.cargo) : ''} · CONTRATANTE<br><span style="font-size:9px;color:#0B6B3A;font-weight:700">Assinado eletronicamente em ${esc(horaBR(a.dt))} · código ${esc(a.codigo)}</span></div></div>`
    : `<div class="a"><div class="tr"><b>${esc(c.nome || 'CONTRATANTE')}</b><br>CONTRATANTE</div></div>`;
  const evidencias = a ? `<div class="aceitebox"><b>✔ ACEITE ELETRÔNICO REGISTRADO</b> — Documento aceito e assinado eletronicamente por <b>${esc(a.nome)}</b> (CPF ${esc(fmtCPF(a.cpf))}${a.cargo ? ', ' + esc(a.cargo) : ''}${a.email ? ', e-mail ' + esc(a.email) : ''}) em <b>${esc(horaBR(a.dt))}</b> (horário de Brasília)${a.ip ? `, IP ${esc(a.ip)}` : ''}. Código de verificação: <b>${esc(a.codigo)}</b>. Confira a autenticidade em ${esc(base)}/aceite/verificar?id=${esc(p.id)}&amp;c=${esc(a.codigo)}</div>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Contrato ${esc(p.numero)} — Ecobraz</title>${cssDoc()}</head><body>
<div class="toolbar">
  ${cliente ? '' : (geral ? `<a href="/propostas" class="tb tb-g">← Documentos</a>` : `<a href="/proposta/ver?id=${esc(p.id)}" class="tb tb-g">← Proposta</a>`)}
  <button class="tb tb-p" onclick="print()">🖨️ Imprimir / salvar PDF</button>
  ${(!cliente && geral && !p.aceite) ? `<a href="/proposta/editar?id=${esc(p.id)}" class="tb tb-g">✏️ Editar</a>` : ''}
  ${ac.botoes}
</div>
${ac.extra}
<div class="folha">
  ${cabecalhoDoc()}
  <div class="corpo">
    <div class="titulo"><h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1><span class="numero">${geral ? 'Nº' : 'Ref.'} ${esc(p.numero)}</span></div>
    <p class="subt">Coleta e destinação de resíduos eletrônicos${p.titulo ? ' · ' + esc(p.titulo) : ''}</p>
    <p class="clausula"><b>CONTRATADA:</b> ${esc(ECOBRAZ.razao)}, inscrita no CNPJ sob nº ${esc(ECOBRAZ.cnpj)}, com sede na ${esc(ECOBRAZ.endereco)}.</p>
    <p class="clausula"><b>CONTRATANTE:</b> ${esc(c.nome || '________________')}${c.doc ? `, inscrita no ${digits(c.doc).length === 14 ? 'CNPJ' : 'CPF'} sob nº ${esc(fmtDoc(c.doc))}` : ''}${c.endereco ? `, com endereço na ${esc(c.endereco)}` : ''}.</p>
    <p class="clausula">As partes acima identificadas têm, entre si, justo e acertado o presente contrato, que se regerá pelas cláusulas seguintes:</p>
    ${clausulas}
    ${geral ? '' : `<div class="sec">Itens contratados</div>
    ${tabelaItens(p)}`}
    ${p.obs ? `<div class="sec">Observações</div><div class="obs">${esc(p.obs)}</div>` : ''}
    <p class="clausula" style="margin-top:22px">E por estarem justas e contratadas, as partes assinam o presente instrumento em duas vias de igual teor.</p>
    <p class="clausula" style="text-align:right">${esc(ECOBRAZ.cidadeForo.split('/')[0])}, ${esc(dataExtenso(new Date().toISOString()))}.</p>
    <div class="assin">
      <div class="a"><div class="tr"><b>${esc(ECOBRAZ.razao)}</b><br>CONTRATADA</div></div>
      ${assinContratante}
      <div class="a"><div class="tr">Testemunha 1 — CPF</div></div>
      <div class="a"><div class="tr">Testemunha 2 — CPF</div></div>
    </div>
    ${evidencias}
    <div class="rodape"><span>${esc(ECOBRAZ.razao)} · CNPJ ${esc(ECOBRAZ.cnpj)}</span><span>${esc(ECOBRAZ.fone)} · ${esc(ECOBRAZ.email)}</span></div>
  </div>
</div></body></html>`;
}

// --- Página pública de ACEITE (link único enviado ao cliente) ------------------
const CSS_FORM_ACEITE = `<style>
.fa label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
.fa input{width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:12px 13px;font-size:16px;font-family:inherit;background:#fff;color:#10262B}
.fa .g2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
@media(max-width:560px){.fa .g2{grid-template-columns:1fr}}
.fa .pad-assin{border:1.5px dashed #9db8b3;border-radius:12px;background:#fff;position:relative}
.fa canvas{display:block;width:100%;height:170px;border-radius:12px;touch-action:none}
.fa .pad-dica{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#b5c4c0;font-size:13px;pointer-events:none}
.fa .chk{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.55;color:#374b48;margin-top:16px}
.fa .chk input{width:20px;height:20px;flex:none;margin-top:1px}
.fa .btn-ok{width:100%;border:none;border-radius:12px;padding:15px;font-size:15.5px;font-weight:800;cursor:pointer;background:#92C430;color:#10262B;margin-top:16px}
.fa .btn-ok:disabled{opacity:.55;cursor:default}
.fa .limpar{border:none;background:#fff;border:1px solid #DDE1E6;border-radius:9px;padding:7px 12px;font-size:12px;font-weight:700;color:#4F6469;cursor:pointer;margin-top:8px}
.fa .msg{font-size:13px;color:#a04030;margin-top:10px;min-height:18px}
.fa .lgpdnote{font-size:11px;color:#8fa39f;line-height:1.6;margin-top:12px}
</style>`;
export function paginaAceite(p, base = 'https://sistema.ecobraz.org') {
  const c = p.cliente || {};
  if (p.aceite) {
    const a = p.aceite;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Documento aceito — Ecobraz</title>${cssDoc()}</head><body>
<div class="folha" style="margin-top:26px"><div style="height:5px;background:linear-gradient(90deg,#92C430,#5a9e2f)"></div>
  <div class="corpo" style="text-align:center;padding:40px 30px">
    <div style="width:66px;height:66px;border-radius:50%;background:#E7F4EC;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px">✅</div>
    <h1 style="font-size:20px;color:#00333B;margin:0 0 6px">Documento aceito</h1>
    <p style="font-size:13.5px;color:#4F6469;line-height:1.6;margin:0 0 4px">Contrato ref. <b>${esc(p.numero)}</b> aceito e assinado por <b>${esc(a.nome)}</b><br>em ${esc(horaBR(a.dt))} · código de verificação <b>${esc(a.codigo)}</b>.</p>
    <p style="font-size:12.5px;color:#7c8a87;margin:0 0 22px">Guarde este código. A Ecobraz também recebeu a confirmação.</p>
    <a class="tb tb-p" style="text-decoration:none" href="/contrato/ver?id=${esc(p.id)}&t=${esc(p.aceiteToken)}">📄 Ver / imprimir o contrato assinado</a>
  </div>
</div></body></html>`;
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Aceite do contrato — Ecobraz</title>${cssDoc()}${CSS_FORM_ACEITE}</head><body>
<div class="folha" style="margin-top:26px">
  ${cabecalhoDoc()}
  <div class="corpo">
    <div class="titulo"><h1>CONTRATO PARA ACEITE</h1><span class="numero">${p.docTipo === 'contrato' ? 'Nº' : 'Ref.'} ${esc(p.numero)}</span></div>
    <p class="subt">Confira o documento abaixo com calma. O aceite e a assinatura ficam no final da página.</p>
    <p class="clausula"><b>CONTRATADA:</b> ${esc(ECOBRAZ.razao)}, CNPJ ${esc(ECOBRAZ.cnpj)}, ${esc(ECOBRAZ.endereco)}.</p>
    <p class="clausula"><b>CONTRATANTE:</b> ${esc(c.nome || '—')}${c.doc ? `, ${digits(c.doc).length === 14 ? 'CNPJ' : 'CPF'} ${esc(fmtDoc(c.doc))}` : ''}${c.endereco ? `, ${esc(c.endereco)}` : ''}.</p>
    ${clausulasDe(p).map(([t, x]) => `<p class="clausula"><b>${esc(t)}.</b> ${esc(x)}</p>`).join('')}
    ${p.docTipo === 'contrato' ? '' : `<div class="sec">Itens contratados</div>
    ${tabelaItens(p)}`}
    ${p.obs ? `<div class="sec">Observações</div><div class="obs">${esc(p.obs)}</div>` : ''}
  </div>
</div>
<div class="folha" style="margin-bottom:30px">
  <div class="corpo fa">
    <div class="sec" style="margin-top:0">Aceite e assinatura</div>
    <div class="g2">
      <div><label>Nome completo *</label><input id="a-nome" autocomplete="name"></div>
      <div><label>CPF *</label><input id="a-cpf" inputmode="numeric" placeholder="000.000.000-00"></div>
    </div>
    <div class="g2">
      <div><label>Cargo (opcional)</label><input id="a-cargo" placeholder="ex.: Gerente administrativo"></div>
      <div><label>E-mail (opcional)</label><input id="a-email" inputmode="email" value="${esc(c.email || '')}"></div>
    </div>
    <label>Assinatura * <span style="font-weight:600;text-transform:none;letter-spacing:0">— desenhe no quadro (dedo ou mouse)</span></label>
    <div class="pad-assin"><canvas id="pad"></canvas><div class="pad-dica" id="pad-dica">✍️ assine aqui</div></div>
    <button type="button" class="limpar" onclick="limparPad()">↺ Limpar assinatura</button>
    <label class="chk" style="text-transform:none;letter-spacing:0;font-weight:600"><input type="checkbox" id="a-ok"> <span>Li e <b>aceito</b> os termos deste contrato, e declaro ter poderes para representar a contratante.</span></label>
    <button class="btn-ok" id="a-btn" onclick="enviarAceite()">✍️ Aceitar e assinar</button>
    <div class="msg" id="a-msg"></div>
    <div class="lgpdnote">Ao aceitar, registramos seu nome, CPF, data/hora, endereço IP e navegador como evidência do aceite (assinatura eletrônica). Esses dados são usados somente para comprovar este contrato.</div>
  </div>
</div>
<script>
const pad=document.getElementById('pad');const ctx=pad.getContext('2d');let tracos=0;
function prepPad(){const r=pad.getBoundingClientRect();const dpr=window.devicePixelRatio||1;pad.width=Math.round(r.width*dpr);pad.height=Math.round(170*dpr);ctx.scale(dpr,dpr);ctx.fillStyle='#fff';ctx.fillRect(0,0,r.width,170);ctx.strokeStyle='#10262B';ctx.lineWidth=2.2;ctx.lineCap='round';ctx.lineJoin='round';}
prepPad();
let desenhando=false,px=0,py=0;
function pos(e){const r=pad.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
pad.addEventListener('pointerdown',e=>{e.preventDefault();pad.setPointerCapture(e.pointerId);desenhando=true;[px,py]=pos(e);});
pad.addEventListener('pointermove',e=>{if(!desenhando)return;const [x,y]=pos(e);ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(x,y);ctx.stroke();px=x;py=y;tracos++;document.getElementById('pad-dica').style.display='none';});
pad.addEventListener('pointerup',()=>{desenhando=false;});
pad.addEventListener('pointercancel',()=>{desenhando=false;});
function limparPad(){tracos=0;const r=pad.getBoundingClientRect();ctx.setTransform(1,0,0,1,0,0);prepPad();document.getElementById('pad-dica').style.display='flex';}
async function enviarAceite(){
  const msg=document.getElementById('a-msg'),btn=document.getElementById('a-btn');
  msg.textContent='';
  const nome=document.getElementById('a-nome').value.trim();
  const cpf=document.getElementById('a-cpf').value;
  if(nome.length<5||!nome.includes(' ')){msg.textContent='Escreva o nome completo.';return;}
  if(cpf.replace(/\\D/g,'').length!==11){msg.textContent='Confira o CPF (11 números).';return;}
  if(tracos<8){msg.textContent='Desenhe a sua assinatura no quadro.';return;}
  if(!document.getElementById('a-ok').checked){msg.textContent='Marque a caixa "Li e aceito".';return;}
  btn.disabled=true;btn.textContent='Registrando…';
  try{
    const r=await fetch('/api/aceite',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
      id:${JSON.stringify(p.id)},t:${JSON.stringify(p.aceiteToken || '')},nome,cpf,
      cargo:document.getElementById('a-cargo').value,email:document.getElementById('a-email').value,
      aceito:document.getElementById('a-ok').checked,assinatura:pad.toDataURL('image/png')})});
    const j=await r.json();
    if(j.ok){btn.textContent='✓ Aceito!';location.reload();}
    else{msg.textContent=j.message||'Não deu certo — confira os campos.';btn.disabled=false;btn.textContent='✍️ Aceitar e assinar';}
  }catch(e){msg.textContent='Falha de rede — tente de novo.';btn.disabled=false;btn.textContent='✍️ Aceitar e assinar';}
}
</script></body></html>`;
}

// Página pública de verificação do aceite (código impresso no contrato).
export function paginaAceiteVerificar(p, code) {
  const ok = p && p.aceite && String(code || '').toUpperCase() === p.aceite.codigo;
  const inner = ok
    ? `<div style="width:66px;height:66px;border-radius:50%;background:#E7F4EC;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px">✅</div>
       <h1 style="font-size:20px;color:#00333B;margin:0 0 8px">Aceite confirmado</h1>
       <p style="font-size:13.5px;color:#4F6469;line-height:1.7;margin:0">Contrato ref. <b>${esc(p.numero)}</b><br>
       Aceito e assinado eletronicamente por <b>${esc(p.aceite.nome)}</b> (CPF ${esc(maskCPF(p.aceite.cpf))})<br>
       em <b>${esc(horaBR(p.aceite.dt))}</b> (horário de Brasília)<br>Código de verificação: <b>${esc(p.aceite.codigo)}</b></p>`
    : `<div style="width:66px;height:66px;border-radius:50%;background:#FDECEA;display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 14px">❌</div>
       <h1 style="font-size:20px;color:#00333B;margin:0 0 8px">Aceite não encontrado</h1>
       <p style="font-size:13.5px;color:#4F6469;line-height:1.7;margin:0">Não encontramos um aceite com esse código.<br>Confira o código impresso no contrato ou fale com a Ecobraz:<br><b>${esc(ECOBRAZ.fone)}</b> · ${esc(ECOBRAZ.email)}</p>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Verificação de aceite — Ecobraz</title>${cssDoc()}</head><body>
<div class="folha" style="margin-top:26px"><div style="height:5px;background:linear-gradient(90deg,#92C430,#5a9e2f)"></div>
  <div class="corpo" style="text-align:center;padding:40px 30px">${inner}</div>
</div></body></html>`;
}
