// Módulo Equipe & Acessos — cadastro de usuários internos e seus papéis.
//
// PROBLEMA que resolve: antes, dar acesso a alguém exigia editar uma lista de
// e-mails em segredo (secret) por papel. Agora o escritório cadastra a pessoa
// (nome, CPF, e-mail, papel) numa tela e isso JÁ concede o acesso.
//
// SEGURANÇA / ADITIVO: este módulo NÃO substitui as listas de acesso por env
// (ESCRITORIO_EMAILS, ENG_EMAILS, etc.) — ele SOMA a elas. `carregarEquipeNoEnv`
// devolve um env com as listas de cada papel acrescidas dos usuários ativos
// cadastrados. Assim, todas as funções *Permitido continuam iguais e passam a
// honrar também o cadastro. Se o KV falhar, cai para o env original (nunca
// quebra o acesso que já funciona).
//
// KV: usuarios:index (blob único — a equipe é pequena). CPF é dado sensível:
// vive só aqui no KV (privado), nunca no repositório nem em logs.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const soDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');
const fmtCPF = (s) => { const d = soDigitos(s).slice(0, 11); return d.length === 11 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : (s || ''); };

// Papéis e a variável de acesso que cada um alimenta.
// fmt: 'nome' => "email|Nome" (padrão) ; 'email' => só o e-mail (formato do VALIDADOR_EMAILS).
export const PAPEIS = {
  escritorio: { label: 'Escritório / Comercial', env: 'ESCRITORIO_EMAILS', fmt: 'nome', desc: 'Cadastro de clientes, coletas, leads, frota.' },
  motorista: { label: 'Motorista (coletas)', env: 'AGENTE_EMAILS', fmt: 'nome', desc: 'App de campo: checklist do veículo e coletas.' },
  operacao: { label: 'Operação (doca)', env: 'OPERACAO_EMAILS', fmt: 'nome', desc: 'Recepção, triagem, processamento e saída.' },
  engenharia: { label: 'Engenharia Ambiental', env: 'ENG_EMAILS', fmt: 'nome', desc: 'Validação técnica (RT), destinos e relatórios.' },
  diretoria: { label: 'Diretoria (visão macro)', env: 'DIRETORIA_EMAILS', fmt: 'nome', desc: 'Painel executivo: volume, prazos, alertas.' },
  validador: { label: 'Auditoria (Villanova ESG)', env: 'VALIDADOR_EMAILS', fmt: 'email', desc: 'Auditoria e validação de documentos/certificados.' },
};

export async function listarUsuarios(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('usuarios:index') : null;
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export async function lerUsuario(env, email) {
  const e = String(email || '').trim().toLowerCase();
  return (await listarUsuarios(env)).find((u) => u.email === e) || null;
}
export async function salvarUsuario(env, dados, criadoPor) {
  const d = dados || {};
  const email = String(d.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: 'Informe um e-mail válido.' };
  const papeis = Array.isArray(d.papeis) ? d.papeis.filter((p) => PAPEIS[p]) : [];
  const lista = await listarUsuarios(env);
  const i = lista.findIndex((u) => u.email === email);
  const antigo = i >= 0 ? lista[i] : null;
  const rec = {
    email,
    nome: String(d.nome || '').replace(/[,;|]/g, ' ').slice(0, 100).trim(),
    cpf: soDigitos(d.cpf).slice(0, 11),
    registro: String(d.registro || '').slice(0, 40).trim(), // CREA/CRQ etc. (RT)
    papeis,
    ativo: d.ativo === false ? false : true,
    criadoEm: antigo ? antigo.criadoEm : agora(),
    criadoPor: antigo ? antigo.criadoPor : (criadoPor || ''),
    atualizadoEm: agora(),
    atualizadoPor: criadoPor || '',
  };
  if (i >= 0) lista[i] = rec; else lista.unshift(rec);
  if (env.PORTAL_KV) await env.PORTAL_KV.put('usuarios:index', JSON.stringify(lista).slice(0, 600000));
  return rec;
}

// Coração da integração aditiva: devolve um env com as listas de acesso de cada
// papel acrescidas dos usuários ativos cadastrados. Defensivo: qualquer falha
// devolve o env original (mantém o acesso atual intacto).
export async function carregarEquipeNoEnv(env) {
  if (!env || !env.PORTAL_KV) return env;
  let usuarios;
  try { usuarios = await listarUsuarios(env); } catch { return env; }
  if (!usuarios || !usuarios.length) return env;
  const add = {};
  for (const u of usuarios) {
    if (!u || u.ativo === false || !u.email) continue;
    const email = String(u.email).trim().toLowerCase();
    const nome = String(u.nome || '').replace(/[,;|]/g, ' ').trim();
    for (const p of (u.papeis || [])) {
      const def = PAPEIS[p]; if (!def) continue;
      const entry = def.fmt === 'email' ? email : `${email}|${nome || email.split('@')[0]}`;
      (add[def.env] = add[def.env] || []).push(entry);
    }
  }
  if (!Object.keys(add).length) return env;
  const out = { ...env };
  for (const [ev, entries] of Object.entries(add)) {
    const orig = String(env[ev] || '').trim();
    out[ev] = [orig, entries.join(',')].filter(Boolean).join(',');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Páginas (escritório)
// ---------------------------------------------------------------------------
function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
input{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:22px 0 6px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
.papel{display:flex;gap:11px;align-items:flex-start;border:1px solid #E4EBE9;border-radius:11px;padding:11px 13px;margin-bottom:8px;cursor:pointer;background:#fff}
.papel input{width:auto;margin:2px 0 0}
@media(max-width:640px){.g2{grid-template-columns:1fr}}</style></head>`;
}
function topo(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'equipe')}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}
const chip = (p) => `<span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;background:#E3F0F3;color:#0B5B66;margin:0 4px 4px 0;display:inline-block">${esc((PAPEIS[p] && PAPEIS[p].label) || p)}</span>`;

export function paginaEquipe(user, usuarios) {
  const ativos = usuarios.filter((u) => u.ativo !== false).length;
  const linhas = usuarios.length ? usuarios.map((u) => `<a href="/equipe/usuario?email=${encodeURIComponent(u.email)}" style="display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <div style="min-width:0"><div style="font-size:15px;font-weight:800;color:#10262B">${esc(u.nome || u.email)}</div>
        <div style="font-size:12px;color:#7c8a87;margin-top:2px">${esc(u.email)}</div></div>
        ${u.ativo === false ? '<span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:#FBE9E7;color:#8a4b45">INATIVO</span>' : ''}
      </div>
      <div style="margin-top:9px">${(u.papeis || []).map(chip).join('') || '<span style="font-size:11.5px;color:#b06">sem papel — não acessa nada</span>'}</div>
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhuma pessoa cadastrada ainda.<br>Cadastre o primeiro acesso acima.</div>`;
  return `${head('Equipe & Acessos')}<body>${topo('equipe & acessos')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 6px"><h1 style="font-size:20px;margin:0">Equipe & Acessos</h1><span style="font-size:11px;background:#E3F0F3;color:#0B5B66;font-weight:800;padding:3px 9px;border-radius:20px">${ativos} com acesso</span></div>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 14px">Cada pessoa entra pelo próprio e-mail (link mágico ou Google). O papel define o que ela vê.</p>
  <a href="/equipe/novo" class="btn btn-d" style="margin-bottom:14px">＋ Cadastrar pessoa</a>
  <div>${linhas}</div>
</div>
</body></html>`;
}

export function paginaUsuarioForm(user, usuario) {
  const editando = !!(usuario && usuario.email);
  const u = usuario || {};
  const papeisSel = new Set(u.papeis || []);
  const listaPapeis = Object.entries(PAPEIS).map(([k, def]) => `<label class="papel">
      <input type="checkbox" class="pp" value="${k}" ${papeisSel.has(k) ? 'checked' : ''}>
      <div><div style="font-size:13.5px;font-weight:800;color:#10262B">${esc(def.label)}</div><div style="font-size:11.5px;color:#7c8a87;margin-top:2px">${esc(def.desc)}</div></div>
    </label>`).join('');
  return `${head(editando ? 'Editar acesso' : 'Nova pessoa')}<body>${topo('equipe & acessos')}
<div class="wrap">
  <a href="/equipe" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Equipe</a>
  <h1 style="font-size:20px;margin:10px 0 12px">${editando ? 'Editar acesso' : 'Cadastrar pessoa'}</h1>
  <div class="card">
    <div class="sec">Identificação</div>
    <label>Nome completo *</label><input id="nome" value="${esc(u.nome || '')}" placeholder="Nome e sobrenome">
    <div class="g2">
      <div><label>E-mail (é o login) *</label><input id="email" inputmode="email" value="${esc(u.email || '')}" placeholder="pessoa@ecobraz.org.br" ${editando ? 'readonly title="O e-mail é a identidade — para trocar, crie outro acesso"' : ''}></div>
      <div><label>CPF</label><input id="cpf" inputmode="numeric" value="${esc(fmtCPF(u.cpf))}" placeholder="000.000.000-00"></div>
    </div>
    <label>Registro profissional (CREA/CRQ) — para engenharia/RT</label><input id="registro" value="${esc(u.registro || '')}" placeholder="ex.: CREA 5062654748">
    <div class="sec">Acessos (o que a pessoa pode usar)</div>
    <div style="font-size:11.5px;color:#7c8a87;margin:0 0 10px">Marque um ou mais. Sem marcar nada, a pessoa fica cadastrada mas não acessa nenhuma área.</div>
    ${listaPapeis}
    ${editando ? `<div class="sec">Situação</div><label class="papel" style="border-color:#f2cfc9"><input type="checkbox" id="inativo" ${u.ativo === false ? 'checked' : ''}><div><div style="font-size:13.5px;font-weight:800;color:#8a4b45">Bloquear acesso (inativo)</div><div style="font-size:11.5px;color:#7c8a87;margin-top:2px">Mantém o cadastro mas tira todos os acessos.</div></div></label>` : ''}
    <input type="hidden" id="editando" value="${editando ? '1' : ''}">
    <div style="display:flex;gap:10px;align-items:center;margin-top:22px"><button class="btn btn-p" onclick="salvar()">Salvar</button><span id="m" style="font-size:13px;color:#4F6469"></span></div>
  </div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:16px">O CPF fica guardado com segurança na nossa base — nunca sai em relatório público.</div>
</div>
<script>
function g(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function salvar(){
  var papeis=[].slice.call(document.querySelectorAll('.pp')).filter(function(c){return c.checked;}).map(function(c){return c.value;});
  var rec={nome:g('nome'),email:g('email'),cpf:g('cpf'),registro:g('registro'),papeis:papeis,ativo:!(document.getElementById('inativo')&&document.getElementById('inativo').checked)};
  if(!rec.nome){document.getElementById('m').textContent='Informe o nome.';return;}
  if(!/^\\S+@\\S+\\.\\S+$/.test(rec.email)){document.getElementById('m').textContent='E-mail inválido.';return;}
  document.getElementById('m').textContent='Salvando…';
  fetch('/api/equipe/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/equipe';}else{document.getElementById('m').textContent=j.error||'Falha ao salvar.';}}).catch(()=>document.getElementById('m').textContent='Sem conexão.');}
</script>
</body></html>`;
}
