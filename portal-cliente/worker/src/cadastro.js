// Módulo de Cadastro (escritório/comercial — a Débora). Base PRÓPRIA da Ecobraz, sem Ploomes.
// Um cliente é UM único registro: Empresa (PJ, com contato[s] embutidos) OU Pessoa Física (PF).
// Sem cadastro duplicado, sem "amarrar" empresa e pessoa. Guardado no KV (cli:index + cli:{id}).
//
// Autorização: env ESCRITORIO_EMAILS = "email|Nome,email2|Nome2". Login por link mágico (e Google).

import { botaoGoogle } from './google-auth.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const digits = (s) => String(s || '').replace(/\D/g, '');
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
  }
  return rec;
}

// Busca dados públicos do CNPJ (BrasilAPI) para pré-preencher o cadastro (menos digitação).
export async function consultarCNPJ(cnpj) {
  const n = digits(cnpj); if (n.length !== 14) return null;
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${n}`, { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      razaoSocial: d.razao_social || '', nomeFantasia: d.nome_fantasia || '',
      cep: d.cep ? String(d.cep) : '', logradouro: d.logradouro || '', numero: d.numero ? String(d.numero) : '',
      complemento: d.complemento || '', bairro: d.bairro || '', cidade: d.municipio || '', uf: d.uf || '',
      email: d.email || '', fone: d.ddd_telefone_1 || '',
    };
  } catch { return null; }
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
    <a href="/cadastro" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'cadastro')}</span></a>
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

export function paginaCadastroHome(user, clientes, q = '', totalFiltrado = null, totalGeral = null) {
  const tf = totalFiltrado == null ? clientes.length : totalFiltrado;
  const tg = totalGeral == null ? clientes.length : totalGeral;
  const linhas = clientes.length ? clientes.map((c) => `<a href="/cadastro/cliente?id=${esc(c.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:14px;font-weight:800;color:#10262B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.nome || '(sem nome)')}</div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${esc(c.doc || '')}${c.cidade ? ' · ' + esc(c.cidade) : ''}</div></div>
      <span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;${c.tipo === 'PJ' ? 'background:#E3F0F3;color:#0B5B66' : 'background:#EAF2E6;color:#3f7a2e'}">${c.tipo === 'PJ' ? 'EMPRESA' : 'PESSOA FÍSICA'}</span>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">${q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente cadastrado ainda.<br>Comece criando uma empresa ou pessoa física acima.'}</div>`;
  const maisInfo = tf > clientes.length ? `<div style="font-size:11.5px;color:#8fa39f;text-align:center;margin-top:10px">Mostrando ${clientes.length} de ${tf} — refine a busca para ver os demais.</div>` : '';
  return `${head('Cadastro')}<body>${topo(user, 'cadastro')}
<div class="wrap">
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
    <a href="/cadastro/novo?tipo=PJ" class="btn btn-d">＋ Nova empresa</a>
    <a href="/cadastro/novo?tipo=PF" class="btn btn-g">＋ Nova pessoa física</a>
  </div>
  <form method="get" action="/cadastro" style="margin:0 0 14px"><input name="q" value="${esc(q)}" placeholder="🔎 Buscar por nome ou documento e apertar Enter…" autocomplete="off"></form>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div style="font-size:13px;font-weight:800">${q ? 'Resultados' : 'Clientes'}</div><span style="font-size:11px;background:#E3F0F3;color:#0B5B66;font-weight:800;padding:3px 9px;border-radius:20px">${q ? tf : tg}</span></div>
  <div id="lista">${linhas}</div>
  ${maisInfo}
</div>
</body></html>`;
}

function contatoRowHTML(c) {
  c = c || {};
  return `<div class="contato" style="border:1px solid #EEF1F0;border-radius:10px;padding:12px;margin-bottom:10px;background:#FBFDFC">
    <div class="g2"><div><label>Nome do contato</label><input class="c-nome" value="${esc(c.nome || '')}"></div><div><label>Cargo</label><input class="c-cargo" value="${esc(c.cargo || '')}"></div></div>
    <div class="g2"><div><label>Telefone</label><input class="c-fone" value="${esc(c.fone || '')}"></div><div><label>E-mail</label><input class="c-email" value="${esc(c.email || '')}"></div></div>
    <button type="button" class="rm-contato" style="margin-top:8px;background:none;border:none;color:#B23A2E;font-size:12px;font-weight:700;cursor:pointer">remover contato</button>
  </div>`;
}

export function paginaFormCliente(user, tipo, cli) {
  const editando = !!(cli && cli.id);
  tipo = (cli && cli.tipo) || (tipo === 'PF' ? 'PF' : 'PJ');
  const e = (cli && cli.endereco) || {};
  const contatos = (cli && Array.isArray(cli.contatos) && cli.contatos.length) ? cli.contatos : [{}];
  const enderecoBloco = `<div class="sec">Endereço</div>
    <div class="g3"><div><label>CEP</label><input id="cep" value="${esc(e.cep || '')}"></div><div style="grid-column:span 2"><label>Logradouro</label><input id="logradouro" value="${esc(e.logradouro || '')}"></div></div>
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
    <div class="g2"><div><label>Nº de contrato</label><input id="contrato" value="${esc(cli?.contrato || '')}"></div>
    <div><label>Condição de pagamento</label><select id="pagamento">${['', 'À vista', 'Faturado 15 dias', 'Faturado 30 dias', 'Boleto', 'Outro'].map((o) => `<option ${cli?.pagamento === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
    <label>Observação / instrução padrão de coleta</label><textarea id="obsColeta" rows="2">${esc(cli?.obsColeta || '')}</textarea>
  ` : `
    <div class="sec">Pessoa física</div>
    <div class="g2"><div><label>Nome completo *</label><input id="nome" value="${esc(cli?.nome || '')}"></div><div><label>CPF</label><input id="cpf" inputmode="numeric" placeholder="000.000.000-00" value="${esc(cli?.cpf || '')}"></div></div>
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
function msg(t){document.getElementById('m').textContent=t;}
function g(id){const el=document.getElementById(id);return el?el.value.trim():'';}
function addContato(){var w=document.getElementById('contatos');var d=document.createElement('div');d.className='contato';d.style.cssText='border:1px solid #EEF1F0;border-radius:10px;padding:12px;margin-bottom:10px;background:#FBFDFC';
  d.innerHTML='<div class="g2"><div><label>Nome do contato</label><input class="c-nome"></div><div><label>Cargo</label><input class="c-cargo"></div></div><div class="g2"><div><label>Telefone</label><input class="c-fone"></div><div><label>E-mail</label><input class="c-email"></div></div><button type="button" class="rm-contato" style="margin-top:8px;background:none;border:none;color:#B23A2E;font-size:12px;font-weight:700;cursor:pointer">remover contato</button>';
  w.appendChild(d);}
document.addEventListener('click',function(ev){if(ev.target&&ev.target.classList.contains('rm-contato')){var c=ev.target.closest('.contato');if(c)c.remove();}});
function buscarCNPJ(){var n=(document.getElementById('cnpj').value||'').replace(/\\D/g,'');if(n.length!==14){msg('CNPJ deve ter 14 dígitos.');return;}msg('Buscando dados do CNPJ…');
  fetch('/api/cadastro/cnpj?n='+n).then(r=>r.json()).then(d=>{if(!d||!d.ok){msg('Não encontrei esse CNPJ — preencha manualmente.');return;}var s=function(id,v){if(v&&document.getElementById(id)&&!document.getElementById(id).value)document.getElementById(id).value=v;};s('razaoSocial',d.razaoSocial);s('nomeFantasia',d.nomeFantasia);s('cep',d.cep);s('logradouro',d.logradouro);s('numero',d.numero);s('complemento',d.complemento);s('bairro',d.bairro);s('cidade',d.cidade);s('uf',d.uf);msg('Dados preenchidos ✓ confira e complete.');}).catch(()=>msg('Sem conexão — preencha manualmente.'));}
function salvar(){var tipo=g('tipo');var rec={tipo:tipo,endereco:{cep:g('cep'),logradouro:g('logradouro'),numero:g('numero'),complemento:g('complemento'),bairro:g('bairro'),cidade:g('cidade'),uf:g('uf')},obsColeta:g('obsColeta')};
  var id=g('id');if(id)rec.id=id;
  if(tipo==='PJ'){rec.razaoSocial=g('razaoSocial');rec.nomeFantasia=g('nomeFantasia');rec.cnpj=g('cnpj');rec.ie=g('ie');rec.contrato=g('contrato');rec.pagamento=g('pagamento');
    rec.contatos=Array.prototype.map.call(document.querySelectorAll('.contato'),function(c){return{nome:c.querySelector('.c-nome').value.trim(),cargo:c.querySelector('.c-cargo').value.trim(),fone:c.querySelector('.c-fone').value.trim(),email:c.querySelector('.c-email').value.trim()};}).filter(function(x){return x.nome||x.fone||x.email;});
    if(!rec.razaoSocial){msg('Informe a razão social.');return;}}
  else{rec.nome=g('nome');rec.cpf=g('cpf');rec.fone=g('fone');rec.email=g('email');if(!rec.nome){msg('Informe o nome.');return;}}
  msg('Salvando…');
  fetch('/api/cadastro/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/cadastro/cliente?id='+j.id;}else{msg(j.error||'Erro ao salvar.');}}).catch(()=>msg('Sem conexão. Tente de novo.'));}
</script>
</body></html>`;
}

export function paginaClienteDetalhe(user, cli) {
  const e = cli.endereco || {};
  const endereco = [[e.logradouro, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' · ');
  const linha = (l, v) => v ? `<tr><td style="padding:8px 0;border-top:1px solid #EEF1F0;color:#6B7B78;width:38%">${esc(l)}</td><td style="padding:8px 0;border-top:1px solid #EEF1F0;font-weight:600">${esc(v)}</td></tr>` : '';
  const contatos = (cli.contatos || []).filter((c) => c.nome || c.fone || c.email).map((c) => `<div style="border:1px solid #EEF1F0;border-radius:10px;padding:11px 13px;margin-bottom:8px"><div style="font-weight:800;font-size:13.5px">${esc(c.nome || '')}${c.cargo ? ` <span style="font-weight:600;color:#7c8a87">· ${esc(c.cargo)}</span>` : ''}</div><div style="font-size:12.5px;color:#4F6469;margin-top:3px">${[c.fone, c.email].filter(Boolean).map(esc).join(' · ')}</div></div>`).join('') || '<div style="font-size:12.5px;color:#8fa39f">Sem contatos cadastrados.</div>';
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
      ${cli.tipo === 'PJ' ? linha('Nº de contrato', cli.contrato) + linha('Pagamento', cli.pagamento) : ''}
      ${linha('Observação de coleta', cli.obsColeta)}
      ${linha('Cadastrado em', dataBR(cli.criadoEm))}
    </table>
    ${cli.tipo === 'PJ' ? `<div class="sec">Contatos</div>${contatos}` : ''}
  </div>
  <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap"><a href="/coletas/nova?cliente=${esc(cli.id)}" class="btn btn-p">＋ Gerar coleta</a>
    <a href="/coletas" class="btn btn-g">Ver todas as coletas</a></div>
</div>
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
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
    <button class="btn btn-p" id="btrat" ${lead.status === 'tratado' ? 'disabled style="opacity:.5"' : ''}>${lead.status === 'tratado' ? '✓ Tratado' : 'Marcar como tratado'}</button>
    <span id="m" style="font-size:13px;color:#4F6469;align-self:center"></span>
  </div>
  <div style="font-size:11px;color:#9aa7a4;margin-top:10px">Converter o lead em cliente + gerar a coleta entra no próximo passo.</div>
</div>
<script>const bt=document.getElementById('btrat');if(bt&&!bt.disabled)bt.onclick=async()=>{bt.disabled=true;document.getElementById('m').textContent='Salvando…';try{const r=await fetch('/api/leads/tratar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${esc(lead.id)}'})});if(r.ok){location.reload();}else{document.getElementById('m').textContent='Falha. Tente de novo.';bt.disabled=false;}}catch{document.getElementById('m').textContent='Sem conexão.';bt.disabled=false;}};</script>
</body></html>`;
}
