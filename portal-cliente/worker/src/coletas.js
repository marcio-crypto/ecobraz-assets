// Módulo Ordem de Coleta (OS) — geração PRÓPRIA a partir do cliente cadastrado.
// Substitui o "gerar coleta" do Ploomes. A escritório/comercial (Débora) cria; o app do
// motorista lê pra executar; o operacional recebe. Guardado no KV (os:index + os:{id} + os:seq).
//
// Numeração: OS-AAAA-NNNN (sequencial no ano). Id interno: coleta_<uuid>.

import { botaoGoogle } from './google-auth.js';
import { lerCliente } from './cadastro.js';
import qrcode from 'qrcode-generator';

const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function hmacSHA(secret, data) { const k = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, TE.encode(data)))); }
export async function seloOS(id, env) { const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-os'; return (await hmacSHA(`${base}|os-selo-v1`, `os:${id}`)).slice(0, 12); }
function origemPortal(env, url) { return String(env.PORTAL_BASE_URL || env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const anoAtual = () => { try { return new Date().getFullYear(); } catch { return 2026; } };
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const STATUS = { agendada: 'Agendada', em_transporte: 'Em transporte', na_unidade: 'Na unidade', concluida: 'Concluída', cancelada: 'Cancelada' };
const STATUS_COR = { agendada: '#8A6A16;background:#FFF4DE', em_transporte: '#0B5B66;background:#E3F0F3', na_unidade: '#6B3FA0;background:#EFE7FA', concluida: '#1E5B31;background:#E4F3E6', cancelada: '#8a4b45;background:#FBE9E7' };

export async function listarColetasOS(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('os:index') : null;
  return raw ? JSON.parse(raw) : [];
}
export async function lerColetaOS(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`os:${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
async function proximoNumero(env) {
  const ano = anoAtual();
  let seq = 1;
  if (env.PORTAL_KV) {
    const raw = await env.PORTAL_KV.get('os:seq');
    const obj = raw ? JSON.parse(raw) : {};
    seq = (obj[ano] || 0) + 1; obj[ano] = seq;
    await env.PORTAL_KV.put('os:seq', JSON.stringify(obj));
  }
  return `OS-${ano}-${String(seq).padStart(4, '0')}`;
}
export async function criarColetaOS(env, dados, criadoPor) {
  const d = dados || {};
  const numero = await proximoNumero(env);
  const id = 'coleta_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14));
  const rec = {
    id, numero, status: 'agendada',
    clienteId: d.clienteId || '', clienteNome: d.clienteNome || '', clienteDoc: d.clienteDoc || '',
    patrocinadorId: String(d.patrocinadorId || '').slice(0, 40), patrocinadorNome: String(d.patrocinadorNome || '').slice(0, 120),
    endereco: String(d.endereco || '').slice(0, 400),
    dataAgendada: String(d.dataAgendada || '').slice(0, 10), janela: String(d.janela || '').slice(0, 40),
    agenteEmail: String(d.agenteEmail || '').trim().toLowerCase(), agenteNome: d.agenteNome || '',
    material: String(d.material || '').slice(0, 500), quantidade: String(d.quantidade || '').slice(0, 100),
    acondicionamento: String(d.acondicionamento || '').slice(0, 120), obs: String(d.obs || '').slice(0, 600),
    contato: String(d.contato || '').slice(0, 200),
    criadoEm: agora(), criadoPor: criadoPor || '',
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await listarColetasOS(env);
    idx.unshift({ id, numero, status: 'agendada', clienteNome: rec.clienteNome, cidade: cidadeDoEndereco(rec.endereco), dataAgendada: rec.dataAgendada, agenteNome: rec.agenteNome, agenteEmail: rec.agenteEmail, criadoEm: rec.criadoEm });
    await env.PORTAL_KV.put('os:index', JSON.stringify(idx).slice(0, 900000));
  }
  return rec;
}
export async function atualizarStatusOS(env, id, status) {
  const rec = await lerColetaOS(env, id); if (!rec) return null;
  rec.status = status; rec.atualizadoEm = agora();
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`os:${id}`, JSON.stringify(rec));
    const idx = await listarColetasOS(env); const i = idx.findIndex((x) => x.id === id);
    if (i >= 0) { idx[i].status = status; await env.PORTAL_KV.put('os:index', JSON.stringify(idx).slice(0, 900000)); }
  }
  return rec;
}
function cidadeDoEndereco(e) { const m = String(e || '').match(/·\s*([^·]+?)\/[A-Z]{2}/); return m ? m[1].trim() : ''; }

// --- Páginas (escritório) ---
function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
textarea{resize:vertical}.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:22px 0 4px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
@media(max-width:640px){.g2{grid-template-columns:1fr}}</style></head>`;
}
function topo(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'coletas')}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}
const pill = (status) => `<span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;color:${STATUS_COR[status] || '#7c8a87;background:#EEF1F0'}">${esc((STATUS[status] || status).toUpperCase())}</span>`;

export function paginaColetasLista(user, coletas) {
  const abertas = coletas.filter((c) => c.status !== 'concluida' && c.status !== 'cancelada').length;
  const linhas = coletas.length ? coletas.map((c) => `<a href="/coletas/os?id=${esc(c.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#10262B">${esc(c.numero)} <span style="font-weight:600;color:#7c8a87">· ${esc(c.clienteNome || '')}</span></div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${c.dataAgendada ? '📅 ' + esc(dataBR(c.dataAgendada)) : 'sem data'}${c.agenteNome ? ' · 🚚 ' + esc(c.agenteNome) : ''}${c.cidade ? ' · ' + esc(c.cidade) : ''}</div></div>
      ${pill(c.status)}
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhuma coleta ainda.<br>Abra uma coleta a partir de um cliente no Cadastro.</div>`;
  return `${head('Coletas')}<body>${topo('coletas')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 14px"><h1 style="font-size:20px;margin:0">Ordens de Coleta</h1><span style="font-size:11px;background:#FFF4DE;color:#8A6A16;font-weight:800;padding:3px 9px;border-radius:20px">${abertas} em aberto</span></div>
  <a href="/cadastro" class="btn btn-g" style="margin-bottom:14px">Abrir coleta a partir de um cliente →</a>
  <div>${linhas}</div>
</div></body></html>`;
}

export function paginaGerarColeta(user, cliente, agentes, patrocinadores) {
  const e = cliente.endereco || {};
  const endPadrao = [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' · ');
  const nome = cliente.tipo === 'PJ' ? (cliente.razaoSocial || cliente.nomeFantasia || '') : (cliente.nome || '');
  const contatoPadrao = cliente.tipo === 'PJ' ? ((cliente.contatos || [])[0] || {}) : { nome: cliente.nome, fone: cliente.fone, email: cliente.email };
  const contatoStr = [contatoPadrao.nome, contatoPadrao.fone].filter(Boolean).join(' · ');
  const optAgentes = ['<option value="">— escolher motorista —</option>'].concat((agentes || []).map((a) => `<option value="${esc(a.email)}|${esc(a.nome)}">${esc(a.nome)}</option>`)).join('');
  const patros = patrocinadores || [];
  const optPatro = ['<option value="">— escolher empresa —</option>'].concat(patros.map((p) => `<option value="${esc(p.clienteId)}|${esc(p.nome)}">${esc(p.nome)} — ${(Number(p.saldoKg) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} t disponíveis</option>`)).join('');
  return `${head('Nova coleta')}<body>${topo('coletas')}
<div class="wrap">
  <a href="/cadastro/cliente?id=${esc(cliente.id)}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cliente</a>
  <h1 style="font-size:20px;margin:10px 0 2px">Nova coleta</h1>
  <p style="font-size:12.5px;color:#8fa39f;margin:0 0 14px">Gerando a Ordem de Coleta para <b>${esc(nome)}</b>.</p>
  <div class="card">
    <div class="sec">Local &amp; agendamento</div>
    <label>Endereço da coleta</label><textarea id="endereco" rows="2">${esc(endPadrao)}</textarea>
    <div class="g2"><div><label>Data</label><input id="data" type="date"></div><div><label>Janela (opcional)</label><input id="janela" placeholder="ex.: 09h–12h"></div></div>
    <label>Contato no local</label><input id="contato" value="${esc(contatoStr)}">
    <div class="sec">Material &amp; motorista</div>
    <label>Material declarado</label><textarea id="material" rows="2" placeholder="ex.: CPUs, monitores, cabos e placas (REEE)"></textarea>
    <div class="g2"><div><label>Quantidade estimada</label><input id="quantidade" placeholder="ex.: ~500 kg (3 pallets)"></div>
    <div><label>Acondicionamento</label><input id="acondicionamento" placeholder="ex.: paletizado / caixas"></div></div>
    <label>Motorista</label><select id="agente">${optAgentes}</select>
    <label>Observações / instruções de acesso</label><textarea id="obs" rows="2">${esc(cliente.obsColeta || '')}</textarea>
    <div class="sec">Patrocínio · Adote um Bairro</div>
    ${patros.length ? `<label style="display:flex;align-items:center;gap:8px;font-weight:600;font-size:13.5px;cursor:pointer"><input type="checkbox" id="patroOn" onchange="togglePatro()" style="width:18px;height:18px"> Esta coleta é patrocinada por uma empresa</label>
    <div id="patroBox" style="display:none;margin-top:10px">
      <label>Empresa patrocinadora</label><select id="patro">${optPatro}</select>
      <div style="font-size:11.5px;color:#8fa39f;margin-top:6px">O peso pesado na doca será descontado do crédito dessa empresa. Os documentos da coleta vão informar o patrocínio e a autorização do cliente para compartilhar os dados desta coleta com o parceiro.</div>
    </div>` : `<div style="font-size:12.5px;color:#8fa39f">Nenhuma empresa com crédito de patrocínio disponível no momento.</div>`}
    <div style="display:flex;gap:10px;align-items:center;margin-top:22px">
      <button class="btn btn-p" onclick="gerar()">Gerar coleta</button>
      <span id="m" style="font-size:13px;color:#4F6469"></span>
    </div>
  </div>
</div>
<script>
function g(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function togglePatro(){var on=document.getElementById('patroOn').checked;document.getElementById('patroBox').style.display=on?'block':'none';}
function gerar(){var ag=g('agente').split('|');
  var rec={clienteId:'${esc(cliente.id)}',clienteNome:${JSON.stringify(nome)},clienteDoc:${JSON.stringify(cliente.tipo === 'PJ' ? (cliente.cnpj || '') : (cliente.cpf || ''))},
    endereco:g('endereco'),dataAgendada:g('data'),janela:g('janela'),contato:g('contato'),
    material:g('material'),quantidade:g('quantidade'),acondicionamento:g('acondicionamento'),obs:g('obs'),
    agenteEmail:ag[0]||'',agenteNome:ag[1]||''};
  var pOn=document.getElementById('patroOn');
  if(pOn&&pOn.checked){var pp=g('patro').split('|');if(!pp[0]){document.getElementById('m').textContent='Escolha a empresa patrocinadora ou desmarque o patrocínio.';return;}rec.patrocinadorId=pp[0];rec.patrocinadorNome=pp[1]||'';}
  if(!rec.endereco){document.getElementById('m').textContent='Informe o endereço da coleta.';return;}
  document.getElementById('m').textContent='Gerando…';
  fetch('/api/coletas/criar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/coletas/os?id='+j.id;}else{document.getElementById('m').textContent=j.error||'Erro ao gerar.';}}).catch(()=>document.getElementById('m').textContent='Sem conexão.');}
</script></body></html>`;
}

export function paginaColetaOSDetalhe(user, os, seloUrl) {
  const linha = (l, v) => v ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#6B7B78;width:38%">${esc(l)}</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600">${esc(v)}</td></tr>` : '';
  return `${head(os.numero)}<body>${topo('coletas')}
<div class="wrap">
  <a href="/coletas" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Todas as coletas</a>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin:12px 0 16px">
    <div>${pill(os.status)}<h1 style="font-size:22px;margin:8px 0 0">${esc(os.numero)}</h1>
    <div style="font-size:13px;color:#7c8a87;margin-top:2px">${esc(os.clienteNome || '')}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;flex:none;justify-content:flex-end">
      <a href="/coletas/os/carta?id=${esc(os.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">📄 Carta de Descarte</a>
      <a href="/coletas/os/manifesto?id=${esc(os.id)}" class="btn btn-g" style="padding:9px 12px;font-size:12.5px">📄 Manifesto de Carga</a>
      <a href="/coletas/os/comprovante?id=${esc(os.id)}" class="btn btn-d" style="padding:9px 12px;font-size:12.5px">✅ Comprovante (QR)</a>
    </div>
  </div>
  <div class="card">
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13.5px">
      ${linha('Cliente', os.clienteNome)}${linha('Documento', os.clienteDoc)}
      ${linha('Endereço da coleta', os.endereco)}
      ${linha('Data / janela', [dataBR(os.dataAgendada), os.janela].filter(Boolean).join(' · '))}
      ${linha('Contato no local', os.contato)}
      ${linha('Motorista', os.agenteNome)}
      ${linha('Material', os.material)}${linha('Quantidade', os.quantidade)}${linha('Acondicionamento', os.acondicionamento)}
      ${linha('Observações', os.obs)}
      ${linha('Aberta em', dataBR(os.criadoEm))}
    </table>
    ${os.patrocinadorNome ? `<div style="margin-top:14px;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:12px;padding:14px">
      <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#3f6b1e">🤝 Coleta patrocinada · Adote um Bairro</div>
      <div style="font-size:13.5px;color:#28413f;margin-top:6px">Esta coleta é <b>financiada por ${esc(os.patrocinadorNome)}</b>.</div>
      <div style="font-size:12px;color:#4F6469;margin-top:8px;line-height:1.55">Ao realizar a coleta, o cliente <b>autoriza o compartilhamento das informações desta coleta</b> (materiais, peso e comprovantes de destinação) com o patrocinador <b>${esc(os.patrocinadorNome)}</b>, para fins de comprovação e relatório socioambiental, nos termos da LGPD (Lei 13.709/2018).</div>
    </div>` : ''}
    <div class="sec">Situação</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${Object.keys(STATUS).map((s) => `<button class="btn ${s === os.status ? 'btn-d' : 'btn-g'}" style="padding:8px 12px;font-size:12.5px" onclick="setStatus('${s}')" ${s === os.status ? 'disabled' : ''}>${esc(STATUS[s])}</button>`).join('')}
    </div>
    <div id="m" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>
  </div>
</div>
<script>function setStatus(s){document.getElementById('m').textContent='Salvando…';fetch('/api/coletas/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(os.id)}',status:s})}).then(r=>r.json()).then(j=>{if(j.ok){location.reload();}else{document.getElementById('m').textContent='Falha.';}}).catch(()=>document.getElementById('m').textContent='Sem conexão.');}</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Documentos que acompanham a OS na coleta: Carta de Descarte e Manifesto de Carga.
// Gerados AUTOMATICAMENTE a partir da OS (a Débora não redigita nada), padronizados,
// com QR de autenticidade. O texto jurídico da declaração é mantido LITERAL.
// ---------------------------------------------------------------------------
const EMPRESA = {
  razao: 'ASSOCIAÇÃO AUXÍLIO À RECICLAGEM DE ELETRÔNICOS E INCLUSÃO DIGITAL — ECOBRAZ',
  cnpj: '14.197.457/0001-42',
  lo: '30011495',
  endereco: 'Rua Dona Maria Quedas, 230 — Jardim Andaraí — 02175-010 — São Paulo/SP',
  fone: '(11) 4329-2001',
  email: 'contato@ecobraz.org.br',
};
// Declaração LITERAL do modelo (não alterar — texto jurídico).
const DECLARACAO_CARTA = 'A Ecobraz declara que está dispensada de emissão de nota fiscal de circulação de mercadorias, tendo em vista o que dispõe o ART. 19 do decreto Nº 45.490 de 30/11/2000 na resposta consulta 499/87 e no ART. 1 da lei complementar Nº 116/03 e suas alterações. Mediante o exposto, emite esta declaração para fins de circulação das mercadorias abaixo relacionadas.';

const tdDoc = 'padding:9px 10px;border:1px solid #E4EBE9';
function tabelaItens(os) {
  const nome = esc(os.material || 'Sucata Eletrônica — Diversa');
  const qtd = esc(os.quantidade || '1,000');
  return `<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px">
    <thead><tr style="background:#F2F6F4;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#5c6f6b">
      <th style="${tdDoc};text-align:left;width:40px">Item</th><th style="${tdDoc};text-align:left">Nome</th>
      <th style="${tdDoc};text-align:right">Quantidade</th><th style="${tdDoc};text-align:right">Valor Unit.</th><th style="${tdDoc};text-align:right">Total</th>
    </tr></thead>
    <tbody>
      <tr><td style="${tdDoc}">1</td><td style="${tdDoc}">${nome}</td><td style="${tdDoc};text-align:right">${qtd}</td><td style="${tdDoc};text-align:right">R$ 0,00</td><td style="${tdDoc};text-align:right">R$ 0,00</td></tr>
      <tr><td colspan="4" style="${tdDoc};text-align:right;font-weight:800">Total</td><td style="${tdDoc};text-align:right;font-weight:800">R$ 0,00</td></tr>
    </tbody></table>`;
}
const eyebrowDoc = (t) => `<div style="display:flex;align-items:center;gap:9px;margin:22px 0 8px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">${esc(t)}</span></div>`;
const campoDoc = (rot, val, span) => `<div style="${span ? 'grid-column:1/-1;' : ''}"><div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#93a6a2">${esc(rot)}</div><div style="font-size:13px;font-weight:600;color:#10262B;margin-top:2px;line-height:1.5">${esc(val || '—')}</div></div>`;
function blocoGerador(os) {
  return `${eyebrowDoc('Gerador')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px 26px">
    ${campoDoc('Razão social / Nome', os.clienteNome, true)}
    ${campoDoc('CNPJ / CPF', os.clienteDoc)}${campoDoc('Data da coleta', dataBR(os.dataAgendada))}
    ${campoDoc('Endereço', os.endereco, true)}</div>`;
}
function blocoPatrocinioDoc(os) {
  return `<div style="margin-top:18px;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:10px;padding:12px 14px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#3f6b1e">Coleta patrocinada · Adote um Bairro</div>
    <div style="font-size:11.5px;color:#28413f;margin-top:5px;line-height:1.5">Coleta financiada por <b>${esc(os.patrocinadorNome)}</b>. O cliente autoriza o compartilhamento das informações desta coleta com o patrocinador, para fins de comprovação e relatório socioambiental (LGPD, Lei nº 13.709/2018).</div></div>`;
}
const assinaturasDoc = (labels) => `<div style="display:flex;gap:22px;margin-top:38px;text-align:center">${labels.map((l) => `<div style="flex:1"><div style="border-top:1px solid #10262B;padding-top:6px;font-size:10.5px;font-weight:800;letter-spacing:.03em;color:#4F6469">${esc(l)}</div></div>`).join('')}</div>`;

function docHTML(titulo, os, seloUrl, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)} — ${esc(os.numero)}</title>
<style>@media print{.noprint{display:none!important}body{background:#fff!important}}*{box-sizing:border-box}</style></head>
<body style="margin:0;background:#EDF1EF;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div style="max-width:820px;margin:0 auto;padding:18px">
  <div class="noprint" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <a href="/coletas/os?id=${esc(os.id)}" style="color:#4F6469;font-size:13px;font-weight:800;text-decoration:none">← Voltar</a>
    <button onclick="window.print()" style="background:#00333B;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:800">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div style="background:#fff;border:1px solid #E1E8E5;border-radius:14px;overflow:hidden">
    <div style="background:#00333B;padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><div style="font-size:27px;font-weight:800;color:#fff">ecobraz<span style="color:#92C430">.</span></div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#92C430;margin-top:7px">${esc(titulo)}</div></div>
      <div style="text-align:right"><div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7fa6a3">Ordem de Serviço</div><div style="font-size:21px;font-weight:800;color:#fff">${esc(os.numero)}</div><div style="font-size:11.5px;color:#cfe3e0;margin-top:7px">Emissão: <b style="color:#fff">${esc(dataBR(os.criadoEm) || '—')}</b></div></div>
    </div>
    <div style="background:#F2F6F4;border-bottom:1px solid #E4EBE9;padding:11px 28px;font-size:11px;color:#4F6469;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <span><b style="color:#10262B">${esc(EMPRESA.razao)}</b></span><span>CNPJ ${esc(EMPRESA.cnpj)} · LO ${esc(EMPRESA.lo)}</span>
    </div>
    <div style="padding:20px 28px 22px">${corpo}</div>
    <div style="padding:0 28px 24px">
      <div style="display:flex;gap:16px;align-items:center;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:12px;padding:16px 18px">
        <img src="${esc(seloUrl)}" alt="QR de autenticidade" style="width:96px;height:96px;flex:none;border:1px solid #E4EBE9;border-radius:8px;background:#fff">
        <div><div style="font-size:13px;font-weight:800;color:#00333B">Autenticidade verificável</div>
        <div style="font-size:11.5px;color:#4F6469;line-height:1.6;margin-top:4px">Aponte a câmera para o QR e confira no site da Ecobraz que este documento é autêntico e vinculado à OS ${esc(os.numero)}.</div></div>
      </div>
    </div>
    <div style="background:#00333B;padding:13px 28px;font-size:10px;color:#9FC6C1;line-height:1.7">
      ${esc(EMPRESA.endereco)} · ${esc(EMPRESA.fone)} · ${esc(EMPRESA.email)}. Documento emitido eletronicamente e verificável pelo QR.
    </div>
  </div>
</div></body></html>`;
}

export function paginaCartaDescarte(os, seloUrl) {
  const veic = `Placa: ${esc(os.veiculoPlaca || '________________')}   ·   Motorista: ${esc(os.agenteNome || '________________')}`;
  const corpo = `${blocoGerador(os)}
    <div style="margin-top:16px;font-size:12.5px;color:#28413f;line-height:1.55"><b>Recebido por:</b> ${esc(EMPRESA.razao)}, inscrita no CNPJ ${esc(EMPRESA.cnpj)}, LO ${esc(EMPRESA.lo)}, com sede na Rua Dona Maria Quedas, 230.</div>
    <div style="margin-top:10px;font-size:12.5px;color:#28413f"><b>Dados do veículo:</b> ${veic}</div>
    ${eyebrowDoc('Declaração')}
    <div style="font-size:12px;color:#4F6469;line-height:1.65;text-align:justify;background:#FBFDFC;border:1px solid #EEF1F0;border-radius:10px;padding:12px 14px">${esc(DECLARACAO_CARTA)}</div>
    ${eyebrowDoc('Mercadorias')}${tabelaItens(os)}
    ${os.patrocinadorNome ? blocoPatrocinioDoc(os) : ''}
    ${assinaturasDoc(['Doador', 'Coletor', 'Responsável Comercial'])}`;
  return docHTML('Carta de Descarte', os, seloUrl, corpo);
}

export function paginaManifestoCarga(os, seloUrl) {
  const parte = (rot) => `<div style="flex:1;min-width:230px"><div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#93a6a2;margin-bottom:4px">${esc(rot)}</div><div style="font-size:12px;color:#28413f;line-height:1.5"><b>${esc(EMPRESA.razao)}</b><br>CNPJ ${esc(EMPRESA.cnpj)} · ${esc(EMPRESA.fone)}<br>${esc(EMPRESA.endereco)}</div></div>`;
  const corpo = `${blocoGerador(os)}
    ${eyebrowDoc('Descrição do material')}${tabelaItens(os)}
    <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:22px">${parte('Transportador')}${parte('Receptor')}</div>
    ${os.patrocinadorNome ? blocoPatrocinioDoc(os) : ''}
    ${assinaturasDoc(['Gerador', 'Transportador', 'Receptor'])}`;
  return docHTML('Manifesto de Carga', os, seloUrl, corpo);
}

// QR público da OS (aponta para /validar-os).
export async function qrOS(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  if (!id) return new Response('faltou id', { status: 400 });
  const code = await seloOS(id, env);
  const alvo = `${origemPortal(env, url)}/validar-os?id=${encodeURIComponent(id)}&c=${code}`;
  if ((url.searchParams.get('fmt') || '') === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=3600' } });
}

// Validação pública da Ordem de Coleta.
export async function validarOSPublico(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const esperado = id ? await seloOS(id, env) : '';
  const ok = !!(id && c && esperado && c === esperado);
  let os = null; if (ok) os = await lerColetaOS(env, id);
  const valido = ok && os;
  const cor = valido ? '#1E7A3D' : '#B23A2E';
  const linhas = valido ? `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Ordem de Coleta</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800">${esc(os.numero)}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Cliente</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(os.clienteNome || '—')}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Situação</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(STATUS[os.status] || os.status)}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Data</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(dataBR(os.dataAgendada) || dataBR(os.criadoEm))}</td></tr>
    </table>` : '';
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;display:flex;align-items:center;justify-content:center">
<div style="max-width:440px;margin:0 auto;padding:28px 22px;width:100%;box-sizing:border-box">
  <div style="background:#fff;border-radius:18px;padding:28px 24px;border:1px solid #E4EBE9">
    <div style="text-align:center"><span style="font-size:22px;font-weight:800;color:#00333B">ecobraz</span></div>
    <div style="text-align:center;margin-top:18px"><div style="display:inline-block;width:56px;height:56px;border-radius:50%;background:${valido ? '#E4F3E6' : '#FBE9E7'};line-height:56px;font-size:28px">${valido ? '✓' : '✕'}</div></div>
    <h1 style="margin:14px 0 6px;text-align:center;font-size:19px;color:${cor}">${valido ? 'Ordem de Coleta autêntica' : 'Documento não confere'}</h1>
    <p style="margin:0;text-align:center;font-size:13px;color:#6B7B78;line-height:1.6">${valido ? 'Emitida pela Ecobraz.' : 'Código inválido ou adulterado.'}</p>
    ${linhas}
    <div style="margin-top:22px;font-size:11px;color:#9aa7a4;text-align:center;line-height:1.6">A destinação final é comprovada pelo Certificado de Destinação Final (CDF), emitido ao término do processamento.</div>
  </div>
</div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// Comprovante/Ordem de Coleta imprimível (documento com a cara da Ecobraz + QR).
export function paginaComprovanteOS(os, seloUrl) {
  const passos = ['Coleta', 'MTR', 'Pesagem', 'Triagem', 'Processamento', 'Destinação', 'CDF'];
  const stepper = passos.map((p, i) => `<span style="display:inline-flex;align-items:center"><span style="background:${i === 0 ? '#92C430' : '#E7EDEA'};color:${i === 0 ? '#10262B' : '#7c8a87'};font-size:10.5px;font-weight:800;padding:5px 11px;border-radius:20px">${p}</span>${i < passos.length - 1 ? '<span style="color:#c2cdc9;margin:0 3px;font-weight:800">›</span>' : ''}</span>`).join('');
  const f = (l, v, span) => `<div style="${span ? 'grid-column:1/-1;' : ''}"><div style="font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#93a6a2">${esc(l)}</div><div style="font-size:13px;color:#10262B;font-weight:600;margin-top:3px;line-height:1.5">${esc(v || '—')}</div></div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(os.numero)} — Ecobraz</title>
<style>@media print{.noprint{display:none!important}body{background:#fff!important}}</style></head>
<body style="margin:0;background:#EDF1EF;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div style="max-width:820px;margin:0 auto;padding:18px">
  <div class="noprint" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <a href="/coletas/os?id=${esc(os.id)}" style="color:#4F6469;font-size:13px;font-weight:800;text-decoration:none">← Voltar</a>
    <button onclick="window.print()" style="background:#00333B;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:800">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div style="background:#fff;border:1px solid #E1E8E5;border-radius:14px;overflow:hidden">
    <div style="background:#00333B;padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start">
      <div><div style="font-size:27px;font-weight:800;color:#fff">ecobraz<span style="color:#92C430">.</span></div><div style="font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#92C430;margin-top:7px">Ordem de Coleta</div></div>
      <div style="text-align:right"><div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7fa6a3">Nº da OS</div><div style="font-size:21px;font-weight:800;color:#fff">${esc(os.numero)}</div><div style="font-size:11.5px;color:#cfe3e0;margin-top:7px">Emissão: <b style="color:#fff">${esc(dataBR(os.criadoEm))}</b></div></div>
    </div>
    <div style="background:#F2F6F4;border-bottom:1px solid #E4EBE9;padding:11px 28px;font-size:11px;color:#4F6469;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
      <span><b style="color:#10262B">Ecobraz Gestão de Resíduos Eletroeletrônicos</b> · CNPJ <span style="color:#B23A2E">[preencher]</span></span>
      <span>Lic. Ambiental <span style="color:#B23A2E">[nº]</span> · CADRI <span style="color:#B23A2E">[nº]</span></span>
    </div>
    <div style="padding:12px 28px;border-bottom:1px solid #EEF1F0;background:#FBFDFC">
      <div style="font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#93a6a2;margin-bottom:8px">Cadeia de custódia rastreável</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px 0;align-items:center">${stepper}</div>
    </div>
    <div style="padding:6px 28px 26px">
      <div style="display:flex;align-items:center;gap:9px;margin:20px 0 12px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">Gerador / Cliente</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px 26px">
        ${f('Cliente', os.clienteNome)}${f('Documento', os.clienteDoc)}
        ${f('Endereço da coleta', os.endereco, true)}
        ${f('Contato no local', os.contato)}${f('Motorista', os.agenteNome)}
      </div>
      <div style="display:flex;align-items:center;gap:9px;margin:22px 0 12px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">Coleta</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:13px 26px">
        ${f('Data / janela', [dataBR(os.dataAgendada), os.janela].filter(Boolean).join(' · '))}${f('Quantidade estimada', os.quantidade)}
        ${f('Material declarado', os.material, true)}
        ${f('Acondicionamento', os.acondicionamento)}${f('Situação', STATUS[os.status] || os.status)}
        ${os.obs ? f('Observações', os.obs, true) : ''}
      </div>
      ${os.patrocinadorNome ? `<div style="margin-top:22px;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:12px;padding:16px 18px">
        <div style="font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#3f6b1e">🤝 Coleta patrocinada · Adote um Bairro</div>
        <div style="font-size:13px;color:#28413f;margin-top:6px;line-height:1.55">Esta coleta é <b>financiada por ${esc(os.patrocinadorNome)}</b>. Ao receber este documento, o cliente <b>autoriza o compartilhamento das informações desta coleta</b> (materiais, peso e comprovantes de destinação) com o patrocinador, para fins de comprovação e relatório socioambiental — nos termos da LGPD (Lei 13.709/2018).</div>
      </div>` : ''}
      <div style="display:flex;gap:18px;align-items:center;margin-top:22px;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:12px;padding:16px 18px">
        <img src="${esc(seloUrl)}" alt="QR" style="width:100px;height:100px;flex:none;border:1px solid #E4EBE9;border-radius:8px;background:#fff">
        <div><div style="font-size:13px;font-weight:800;color:#00333B">Rastreabilidade &amp; autenticidade</div>
          <div style="font-size:11.5px;color:#4F6469;line-height:1.6;margin-top:4px">Acompanhe a coleta da origem à destinação final e confira a autenticidade deste documento.</div></div>
      </div>
      <div style="margin-top:18px;border-top:1px dashed #E1E8E5;padding-top:12px;font-size:11px;color:#4F6469"><b style="color:#10262B">Aceite eletrônico:</b> registrado no sistema no momento da coleta (motorista) e do recebimento (Ecobraz), com data/hora e verificação por QR.</div>
    </div>
    <div style="background:#00333B;padding:13px 28px;font-size:10px;color:#9FC6C1;line-height:1.7">
      <b style="color:#cfe3e0">Base legal:</b> Lei nº 12.305/2010 (PNRS) · Decreto nº 10.240/2020 (logística reversa de eletroeletrônicos) · classificação conforme ABNT NBR 10004:2004 · transporte manifestado (MTR/SINIR e SIGOR-CETESB) · destinação comprovada por CDF. Documento emitido eletronicamente e verificável pelo QR.
    </div>
  </div>
</div></body></html>`;
}
