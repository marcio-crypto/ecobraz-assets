// Telas do Portal do Cliente — identidade Ecobraz Emigre (Montserrat, verde+teal),
// renderizadas no servidor (Worker), sem build. Logo servida em /assets/.

const CSS = `
@font-face{font-family:"Montserrat Fallback";src:local("Arial");size-adjust:112.5%;ascent-override:86%;descent-override:22.3%;line-gap-override:0%}
:root{--green:#92C430;--green-d:#74A21F;--teal:#00333B;--teal2:#0A454E;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8;--radius:18px;--shadow:0 18px 50px rgba(0,51,59,.12);--shadow-sm:0 6px 22px rgba(0,51,59,.07)}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:Montserrat,"Montserrat Fallback","Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
h1,h2,h3{letter-spacing:-.02em;margin:0}
.muted{color:var(--muted)}
.eyebrow{display:block;color:var(--green-d);font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}
.eyebrow.on-dark{color:var(--green)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;padding:0 26px;border:0;border-radius:10px;background:var(--green);color:var(--ink);font:inherit;font-weight:800;cursor:pointer;transition:.18s}
.btn:hover{background:#A2D53E;transform:translateY(-1px)}
.btn:disabled{opacity:.6;cursor:default;transform:none}
.btn-block{width:100%}
.btn-ghost{background:transparent;border:1px solid var(--line);color:var(--muted);min-height:40px;padding:0 16px;border-radius:8px;font:inherit;font-weight:700;font-size:13px;cursor:pointer}
.btn-ghost:hover{color:var(--teal);border-color:var(--green)}
label{display:block;font-size:13px;font-weight:700;color:var(--ink);margin:16px 0 7px}
input,textarea{width:100%;padding:13px 14px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:15px;background:#fff;color:var(--ink)}
input:focus,textarea:focus{outline:3px solid rgba(146,196,48,.22);border-color:var(--green)}
textarea{resize:vertical}
.notice{background:#F0F7EC;border:1px solid #cfe6be;border-radius:12px;padding:14px 16px;font-size:14px;margin-top:16px;color:#2f5510}
.notice[hidden]{display:none}

/* Login (split) */
.auth{min-height:100vh;display:grid;grid-template-columns:1.05fr .95fr}
.auth-brand{background:var(--teal);color:#fff;padding:56px 60px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.auth-brand:after{content:"";position:absolute;width:520px;height:520px;border:1px solid rgba(146,196,48,.22);border-radius:50%;right:-200px;bottom:-220px}
.auth-logo{width:196px;height:auto;position:relative;z-index:1}
.auth-title{font-size:clamp(30px,3.3vw,44px);line-height:1.09;margin:18px 0 18px}
.auth-sub{color:#c8dad6;font-size:16px;max-width:45ch}
.auth-trust{list-style:none;padding:0;margin:28px 0 0;display:grid;gap:13px;position:relative;z-index:1}
.auth-trust li{position:relative;padding-left:32px;color:#d7e5e2;font-size:14px}
.auth-trust li:before{content:"✓";position:absolute;left:0;top:0;width:21px;height:21px;border-radius:50%;background:rgba(146,196,48,.18);color:var(--green);font-weight:800;font-size:12px;display:grid;place-items:center}
.auth-foot{position:relative;z-index:1;color:#9fbdb7;font-size:12px}
.auth-form{display:flex;align-items:center;justify-content:center;padding:40px 28px}
.auth-card{width:100%;max-width:404px}
.auth-logo-sm{display:none;width:158px;margin:0 auto 28px}
.auth-card h2{font-size:26px;color:var(--teal);margin-bottom:8px}

/* Dashboard */
.appbar{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.appbar-in{width:min(1120px,calc(100% - 40px));margin:auto;min-height:70px;display:flex;align-items:center;gap:16px}
.appbar-logo{width:152px;height:auto}
.appbar-tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green-d);border-left:1px solid var(--line);padding-left:16px}
.appbar-right{margin-left:auto;display:flex;align-items:center;gap:14px}
.appbar-user{font-size:13px;font-weight:700;color:var(--teal);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.app{width:min(1120px,calc(100% - 40px));margin:34px auto 40px}
.welcome{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:28px}
.welcome h1{font-size:clamp(26px,3.2vw,38px);color:var(--teal)}
.badge-ok{display:inline-flex;align-items:center;gap:8px;background:#EAF5D9;color:#3f6d12;border:1px solid #cde5a6;border-radius:999px;padding:9px 16px;font-size:13px;font-weight:700}
.dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 0 3px rgba(146,196,48,.25)}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:var(--shadow-sm)}
.kpi-label{font-size:11.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}
.kpi-num{display:block;font-size:34px;font-weight:800;color:var(--teal);margin:10px 0 2px;letter-spacing:-.03em;line-height:1}
.kpi-num.ok{color:var(--green-d)}
.kpi-hint{font-size:12px;color:var(--muted)}
.kpi-soon{background:var(--soft);border-style:dashed}
.kpi-soon .kpi-num{font-size:17px;color:var(--muted);margin-top:12px}
.grid2{display:grid;grid-template-columns:1.35fr .65fr;gap:16px;align-items:start}
.panel{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:26px;box-shadow:var(--shadow-sm)}
.panel h2{font-size:19px;color:var(--teal);margin-bottom:6px}
.oslist{margin-top:10px}
.os{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 0;border-top:1px solid var(--line)}
.os:first-child{border-top:0}
.os-title{font-weight:700;color:var(--ink)}
.os-meta{font-size:12.5px;color:var(--muted);margin-top:3px}
.tag{font-size:11.5px;font-weight:800;padding:5px 12px;border-radius:999px;white-space:nowrap}
.tag-and{background:#FEF3E2;color:#8a5a12}
.tag-ok{background:#EAF5D9;color:#3f6d12}
.tag-x{background:#eef2f2;color:#4F6469}
.empty{text-align:center;padding:30px 10px;color:var(--muted)}
.empty-ic{width:46px;height:46px;border-radius:50%;background:var(--soft);display:inline-grid;place-items:center;font-size:20px;margin-bottom:10px}
.docs{margin-top:16px;background:linear-gradient(180deg,#fff,#FBFDF9);border-style:dashed}
.chip{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--green-d);background:#EAF5D9;border-radius:999px;padding:3px 10px;vertical-align:middle;margin-left:8px}
.docrow{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.docpill{font-size:13px;font-weight:700;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 15px}
.foot{text-align:center;color:var(--muted);font-size:12px;padding:26px 0 8px}

@media(max-width:860px){
  .auth{grid-template-columns:1fr}
  .auth-brand{display:none}
  .auth-logo-sm{display:block}
  .kpis{grid-template-columns:1fr 1fr}
  .grid2{grid-template-columns:1fr}
}
@media(max-width:520px){.kpis{grid-template-columns:1fr}.appbar-user{display:none}}
`;

function head(titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titulo} — Portal Ecobraz</title>
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>`;
}

export function paginaLogin() {
  return `${head('Entrar')}
<div class="auth">
  <aside class="auth-brand">
    <img class="auth-logo" src="/assets/logo-claro.png" alt="Ecobraz Emigre" width="196">
    <div>
      <span class="eyebrow on-dark">Portal do Cliente</span>
      <h1 class="auth-title">Sua destinação,<br>documentada e sob controle.</h1>
      <p class="auth-sub">Acompanhe suas ordens de serviço, abra chamados e mantenha a conformidade ambiental da sua empresa — tudo em um só lugar.</p>
      <ul class="auth-trust">
        <li>Rastreabilidade e evidências prontas para auditoria e ESG</li>
        <li>Ordens de serviço e documentos sempre à mão</li>
        <li>Acesso seguro por link — sem senha para decorar</li>
      </ul>
    </div>
    <div class="auth-foot">Acesso exclusivo para clientes com contrato ativo com a Ecobraz.</div>
  </aside>
  <main class="auth-form">
    <div class="auth-card">
      <img class="auth-logo-sm" src="/assets/logo.png" alt="Ecobraz Emigre">
      <h2>Acesso do cliente</h2>
      <p class="muted">Digite o e-mail cadastrado na Ecobraz. Enviamos um <strong>link de acesso</strong> — simples e seguro.</p>
      <form id="f" onsubmit="return enviar(event)">
        <label for="email">Seu e-mail</label>
        <input id="email" name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com.br">
        <div style="margin-top:20px"><button class="btn btn-block" id="b" type="submit">Enviar link de acesso</button></div>
      </form>
      <div id="msg" class="notice" hidden></div>
    </div>
  </main>
</div>
<script>
async function enviar(e){e.preventDefault();
  var b=document.getElementById('b'),m=document.getElementById('msg');
  b.disabled=true;b.textContent='Enviando…';
  try{ await fetch('/api/auth/solicitar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value})}); }catch(_){}
  m.hidden=false;
  m.innerHTML='Se o e-mail for de um cliente ativo, enviamos um <strong>link de acesso</strong>. Confira sua caixa de entrada (e o spam). O link vale por 15 minutos.';
  document.getElementById('f').style.display='none';
  return false;
}
</script></body></html>`;
}

export function paginaPainel({ nome, email, dataFim }) {
  const primeiro = esc((nome || '').split(/\s+/)[0] || 'cliente');
  const empresa = esc(nome || 'Sua empresa');
  const validadeBadge = dataFim ? ` · válido até <b>${esc(formatarData(dataFim))}</b>` : '';
  const validadeHint = dataFim ? `válido até ${esc(formatarData(dataFim))}` : 'sem prazo definido';
  return `${head('Painel')}
<header class="appbar">
  <div class="appbar-in">
    <img class="appbar-logo" src="/assets/logo.png" alt="Ecobraz Emigre">
    <span class="appbar-tag">Portal do Cliente</span>
    <div class="appbar-right">
      <span class="appbar-user" title="${esc(email)}">${empresa}</span>
      <form method="post" action="/api/auth/sair" style="margin:0"><button class="btn-ghost" type="submit">Sair</button></form>
    </div>
  </div>
</header>
<main class="app">
  <section class="welcome">
    <div>
      <span class="eyebrow">Bem-vindo</span>
      <h1>Olá, ${primeiro}</h1>
      <p class="muted">${esc(email)}</p>
    </div>
    <div class="badge-ok"><span class="dot"></span> Contrato ativo${validadeBadge}</div>
  </section>

  <section class="kpis">
    <div class="kpi"><span class="kpi-label">Ordens de serviço</span><strong class="kpi-num" id="kpiOs">—</strong><span class="kpi-hint">registradas no seu histórico</span></div>
    <div class="kpi"><span class="kpi-label">Contrato</span><strong class="kpi-num ok">Ativo</strong><span class="kpi-hint">${validadeHint}</span></div>
    <div class="kpi kpi-soon"><span class="kpi-label">Documentos</span><strong class="kpi-num">Em breve</strong><span class="kpi-hint">NF · MTR · CDF</span></div>
    <div class="kpi kpi-soon"><span class="kpi-label">Pegada de carbono</span><strong class="kpi-num">Em breve</strong><span class="kpi-hint">cálculo e neutralização</span></div>
  </section>

  <div class="grid2">
    <section class="panel">
      <h2>Suas ordens de serviço</h2>
      <p class="muted" style="margin:0 0 4px">Acompanhe suas coletas e atendimentos com a Ecobraz.</p>
      <div id="oslista" class="oslist"><p class="muted">Carregando…</p></div>
    </section>

    <aside class="panel">
      <h2>Solicitar coleta</h2>
      <p class="muted" style="margin:0 0 4px">Confirme seus dados e abra uma nova ordem de coleta.</p>
      <form id="fc" onsubmit="return solicitar(event)">
        <label for="s_razao">Razão social</label>
        <input id="s_razao" maxlength="200">
        <label for="s_cnpj">CNPJ</label>
        <input id="s_cnpj" maxlength="20">
        <label for="s_end">Endereço de coleta (com CEP)</label>
        <input id="s_end" required maxlength="300" placeholder="Rua, nº, bairro, cidade — CEP">
        <label for="s_tel">Telefone</label>
        <input id="s_tel" maxlength="30" placeholder="(11) 90000-0000">
        <label for="s_email">E-mail</label>
        <input id="s_email" type="email" maxlength="120">
        <label for="s_resp">Responsável (nome e sobrenome)</label>
        <input id="s_resp" maxlength="120">
        <label for="s_equip">Equipamentos</label>
        <textarea id="s_equip" rows="3" maxlength="4000" placeholder="Ex.: 10 monitores, 5 CPUs, 2 no-breaks…"></textarea>
        <div style="margin-top:14px"><button class="btn btn-block" id="bc" type="submit">Solicitar coleta</button></div>
      </form>
      <div id="cmsg" class="notice" hidden></div>
    </aside>
  </div>

  <section class="panel docs">
    <h2>Documentos e conformidade <span class="chip">em breve</span></h2>
    <p class="muted" style="margin:6px 0 0">Nota Fiscal, MTR, Carta de Doação e Certificado de Destinação Final — no padrão aceito por auditoria e ESG, gerados a partir do seu histórico de descartes.</p>
    <div class="docrow"><span class="docpill">Nota Fiscal</span><span class="docpill">MTR</span><span class="docpill">Carta de Doação</span><span class="docpill">Certificado de Destinação Final</span><span class="docpill">Relatório de conformidade</span></div>
  </section>

  <div class="foot">Ecobraz Emigre — Portal do Cliente · destinação correta, conformidade e evidências.</div>
</main>
<script>
function fmt(iso){ if(!iso) return '—'; try{ return new Date(iso).toLocaleDateString('pt-BR'); }catch(_){ return '—'; } }
function tagCls(s){ s=(s||'').toLowerCase(); if(s.indexOf('conclu')>=0) return 'tag-ok'; if(s.indexOf('atendimento')>=0||s.indexOf('andamento')>=0) return 'tag-and'; return 'tag-x'; }
function escapeHtml(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
async function carregar(){
  var alvo=document.getElementById('oslista'), kpi=document.getElementById('kpiOs');
  try{
    var r=await fetch('/api/os'); var d=await r.json();
    if(!d.ok||!d.os||!d.os.length){ kpi.textContent='0'; alvo.innerHTML='<div class="empty"><div class="empty-ic">📄</div>Ainda não há ordens de serviço registradas.</div>'; return; }
    kpi.textContent=String(d.os.length);
    alvo.innerHTML=d.os.map(function(o){
      var titulo=o.numeroOS?('Ordem de serviço '+escapeHtml(String(o.numeroOS))):escapeHtml(o.titulo||'Atendimento');
      var meta=[]; meta.push(o.dataColeta?('Coleta em '+fmt(o.dataColeta)):('Aberta em '+fmt(o.aberturaISO)));
      if(o.peso && String(o.peso).toLowerCase().indexOf('não informado')<0 && String(o.peso).toLowerCase().indexOf('nao informado')<0) meta.push('Peso: '+escapeHtml(String(o.peso)));
      return '<div class="os"><div><div class="os-title">'+titulo+'</div><div class="os-meta">'+meta.join(' · ')+'</div></div><span class="tag '+tagCls(o.status)+'">'+escapeHtml(o.status)+'</span></div>';
    }).join('');
  }catch(_){ kpi.textContent='—'; alvo.innerHTML='<p class="muted">Não foi possível carregar agora. Tente atualizar a página.</p>'; }
}
function campoVal(id){var el=document.getElementById(id);return el?el.value.trim():'';}
async function preencherPerfil(){
  try{ var r=await fetch('/api/perfil'); var d=await r.json();
    if(d.ok&&d.perfil){ var p=d.perfil, set=function(id,v){ var el=document.getElementById(id); if(el&&v&&!el.value) el.value=v; };
      set('s_razao',p.razaoSocial); set('s_cnpj',p.cnpj); set('s_email',p.email); set('s_tel',p.telefone); set('s_resp',p.responsavel);
    }
  }catch(_){}
}
async function solicitar(e){e.preventDefault();
  var b=document.getElementById('bc'),m=document.getElementById('cmsg');
  b.disabled=true;b.textContent='Enviando…';
  var body={razaoSocial:campoVal('s_razao'),cnpj:campoVal('s_cnpj'),endereco:campoVal('s_end'),telefone:campoVal('s_tel'),email:campoVal('s_email'),responsavel:campoVal('s_resp'),equipamentos:campoVal('s_equip')};
  try{
    var r=await fetch('/api/os/solicitar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var d=await r.json(); m.hidden=false;
    if(d.ok){ m.textContent=d.message||'Coleta solicitada!'; document.getElementById('s_end').value=''; document.getElementById('s_equip').value=''; carregar(); }
    else if(d.error==='endereco_obrigatorio'){ m.textContent='Informe o endereço de coleta.'; }
    else { m.textContent='Não foi possível solicitar agora. Tente novamente em instantes.'; }
  }catch(_){ m.hidden=false; m.textContent='Falha de conexão. Tente novamente.'; }
  b.disabled=false;b.textContent='Solicitar coleta';
  return false;
}
carregar();
preencherPerfil();
</script></body></html>`;
}

export function paginaMensagem(titulo, texto) {
  return `${head(titulo)}
<div class="auth-form" style="min-height:100vh;flex-direction:column;gap:22px">
  <img src="/assets/logo.png" alt="Ecobraz Emigre" style="width:170px">
  <div class="panel" style="max-width:440px;text-align:center">
    <h2 style="color:var(--teal);font-size:22px">${esc(titulo)}</h2>
    <p class="muted" style="margin:10px 0 20px">${esc(texto)}</p>
    <a class="btn" href="/">Voltar ao início</a>
  </div>
</div></body></html>`;
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatarData(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; } }
