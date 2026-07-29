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
.svc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.svc{display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:var(--shadow-sm);transition:.16s}
.svc:hover{border-color:var(--green);transform:translateY(-1px);box-shadow:0 10px 26px rgba(0,51,59,.10)}
.svc-ic{font-size:24px}
.svc-t{font-size:15.5px;font-weight:800;color:var(--teal)}
.svc-d{font-size:12.5px;color:var(--muted);line-height:1.5}
@media(max-width:640px){.svc-grid{grid-template-columns:1fr}}
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
.sol-lead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sol-badge{font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--green-d);background:#EAF5D9;border:1px solid #cde5a6;border-radius:999px;padding:4px 11px}
.sol-sec{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.sol-sec h3{font-size:12.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--teal);margin:0 0 12px;display:flex;align-items:center;gap:9px}
.sol-sec h3 .ic{width:28px;height:28px;border-radius:8px;background:#EAF5D9;display:grid;place-items:center;font-size:15px}
.sol-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
.sol-grid label{margin-top:0}
.sol-grid .full{grid-column:1/-1}
.dropzone{border:2px dashed #cbd7d2;border-radius:12px;padding:24px;text-align:center;color:var(--muted);cursor:pointer;transition:.15s;background:var(--soft)}
.dropzone:hover,.dropzone.drag{border-color:var(--green);background:#F0F7EC;color:var(--teal)}
.dropzone strong{color:var(--teal)}
.thumbs{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.thumb{position:relative;width:76px;height:76px;border-radius:10px;overflow:hidden;border:1px solid var(--line)}
.thumb img{width:100%;height:100%;object-fit:cover}
.thumb button{position:absolute;top:3px;right:3px;width:20px;height:20px;border:0;border-radius:50%;background:rgba(16,38,43,.78);color:#fff;font-size:13px;cursor:pointer;line-height:1;display:grid;place-items:center}
@media(max-width:560px){.sol-grid{grid-template-columns:1fr}}
.os-main{flex:1;min-width:0}
.doclnk{margin-top:10px;background:none;border:0;color:var(--teal);font-weight:700;font-size:13px;cursor:pointer;padding:2px 0;display:inline-flex;align-items:center;gap:6px}
.doclnk:hover{color:var(--green)}
.docwrap{display:none;margin-top:8px;flex-direction:column;gap:6px}
.docdl{display:inline-flex;align-items:center;gap:8px;font-size:13.5px;color:var(--teal);text-decoration:none;padding:8px 12px;border:1px solid var(--line);border-radius:9px;background:var(--soft);width:fit-content;max-width:100%}
.docdl:hover{border-color:var(--green);background:#F0F7EC}

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

export function paginaLogin(googleOn) {
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
    <div class="auth-foot">Um só acesso — clientes e equipe Ecobraz. Simples e seguro.</div>
  </aside>
  <main class="auth-form">
    <div class="auth-card">
      <img class="auth-logo-sm" src="/assets/logo.png" alt="Ecobraz Emigre">
      <h2>Entrar no sistema</h2>
      <p class="muted">Digite o e-mail cadastrado na Ecobraz — <strong>cliente ou equipe</strong>. Enviamos um <strong>link de acesso</strong>; o sistema identifica sozinho para onde te levar.</p>
      <form id="f" onsubmit="return enviar(event)">
        <label for="email">Seu e-mail</label>
        <input id="email" name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com.br">
        <div style="margin-top:20px"><button class="btn btn-block" id="b" type="submit">Enviar link de acesso</button></div>
      </form>
      <div id="msg" class="notice" hidden></div>
      ${googleOn ? `<div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px"><div style="flex:1;height:1px;background:#E4EBE9"></div><span style="font-size:11px;color:#8fa39f;font-weight:700">OU</span><div style="flex:1;height:1px;background:#E4EBE9"></div></div>
      <a href="/auth/google?ctx=auto" style="display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid #DADCE0;border-radius:12px;padding:13px;font-size:14px;font-weight:700;color:#3c4043;text-decoration:none;background:#fff">Entrar com Google</a>
      <div style="font-size:11px;color:#8fa39f;margin-top:8px;text-align:center">Com o Google não precisa esperar e-mail — vale para clientes e equipe.</div>` : ''}
    </div>
  </main>
</div>
<script>
async function enviar(e){e.preventDefault();
  var b=document.getElementById('b'),m=document.getElementById('msg');
  b.disabled=true;b.textContent='Enviando…';
  try{ await fetch('/api/entrar-unificado',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value})}); }catch(_){}
  m.hidden=false;
  m.innerHTML='Se o e-mail estiver cadastrado na Ecobraz, enviamos um <strong>link de acesso</strong>. Confira sua caixa de entrada (e o spam). O link vale por 15 minutos.';
  document.getElementById('f').style.display='none';
  return false;
}
</script></body></html>`;
}

export function paginaPainel({ nome, email, dataFim, whatsapp }) {
  const primeiro = esc((nome || '').split(/\s+/)[0] || 'cliente');
  const empresa = esc(nome || 'Sua empresa');
  // WhatsApp do comercial (pedido do Marcio): número oficial do site; o env
  // WHATSAPP_COMERCIAL troca sem deploy. Só dígitos, com DDI.
  const zap = String(whatsapp || '5511912728412').replace(/\D/g, '');
  const zapLink = `https://wa.me/${zap}?text=${encodeURIComponent('Olá! Sou cliente Ecobraz e preciso de uma ajuda com o sistema.')}`;
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
    <div class="badge-ok"><span class="dot"></span> Cliente Ecobraz</div>
  </section>

  <section class="kpis">
    <div class="kpi"><span class="kpi-label">Ordens de serviço</span><strong class="kpi-num" id="kpiOs">—</strong><span class="kpi-hint">registradas no seu histórico</span></div>
    <div class="kpi"><span class="kpi-label">Acesso</span><strong class="kpi-num ok">Liberado</strong><span class="kpi-hint">por link seguro</span></div>
    <div class="kpi kpi-soon"><span class="kpi-label">Documentos</span><strong class="kpi-num">Em breve</strong><span class="kpi-hint">NF · MTR · CDF</span></div>
    <div class="kpi"><span class="kpi-label">Pegada de carbono</span><a class="kpi-num ok" href="/painel-carbono" style="font-size:20px;text-decoration:none">Ver painel →</a><span class="kpi-hint">termômetro de neutralidade</span></div>
  </section>

  <a href="/adote" style="display:flex;align-items:center;gap:12px;background:#F3FAEA;border:1px solid #D9EDBB;border-radius:12px;padding:11px 16px;margin:0 0 16px;text-decoration:none">
    <span style="font-size:20px">🌱</span>
    <span style="min-width:0;flex:1;font-size:13px;color:#3F5A34;line-height:1.4"><b style="color:#2E4A24">Adote um Bairro:</b> patrocine coletas com o selo da sua empresa e mostre o impacto no seu termômetro.</span>
    <span style="flex:none;font-size:12px;font-weight:800;background:#92C430;color:#10262B;border-radius:8px;padding:7px 12px">Conhecer →</span>
  </a>

  <section class="panel" style="margin-bottom:16px">
    <h2>Seus serviços</h2>
    <p class="muted" style="margin:6px 0 16px">Tudo no seu perfil: acompanhe o impacto, patrocine coletas e gere os relatórios — a compra fica amarrada ao CNPJ da sua empresa.</p>
    <div class="svc-grid">
      <a class="svc" href="/painel-carbono"><span class="svc-ic">🌡️</span><span class="svc-t">Painel de Carbono</span><span class="svc-d">Seu termômetro: pegada × compensações, com lastro real.</span></a>
      <a class="svc" href="/adote"><span class="svc-ic">🌱</span><span class="svc-t">Adote um Bairro</span><span class="svc-d">Patrocine coletas nos bairros e baixe o seu termômetro. Comprou, acabou? Compra mais — se quiser.</span></a>
      <a class="svc" href="/carbono/planos"><span class="svc-ic">🧮</span><span class="svc-t">Inventário de carbono</span><span class="svc-d">Meça a pegada da empresa no padrão GHG Protocol.</span></a>
      <a class="svc" href="/esg/planos"><span class="svc-ic">📄</span><span class="svc-t">Relatórios de ESG</span><span class="svc-d">Padrão BR, UE ou Financeiro — a prova para banco, cliente e auditoria.</span></a>
    </div>
  </section>

  <section class="panel">
    <h2>Suas ordens de serviço</h2>
    <p class="muted" style="margin:0 0 4px">Acompanhe suas coletas e atendimentos com a Ecobraz.</p>
    <div id="oslista" class="oslist"><p class="muted">Carregando…</p></div>
  </section>

  <a href="/carbono/planos" style="display:flex;align-items:center;gap:12px;background:#EDF7F6;border:1px solid #CBE7E3;border-radius:12px;padding:11px 16px;margin:16px 0 0;text-decoration:none">
    <span style="font-size:20px">🧮</span>
    <span style="min-width:0;flex:1;font-size:13px;color:#33565A;line-height:1.4"><b style="color:#1F4348">Sua empresa já mediu a pegada de carbono?</b> Inventário no padrão GHG Protocol, a partir dos seus dados reais.</span>
    <span style="flex:none;font-size:12px;font-weight:800;background:#00333B;color:#fff;border-radius:8px;padding:7px 12px">Ver planos →</span>
  </a>

  <section class="panel" style="margin-top:16px">
    <div class="sol-lead"><h2 style="margin:0">Solicitar nova coleta</h2><span class="sol-badge">✓ dados do seu cadastro</span></div>
    <p class="muted" style="margin:6px 0 0">Já preenchemos o que temos no seu cadastro. Confira, ajuste se precisar, anexe fotos e envie.</p>
    <form id="fc" onsubmit="return solicitar(event)">
      <div class="sol-sec">
        <h3><span class="ic">🏢</span> Sua empresa</h3>
        <div class="sol-grid">
          <div><label for="s_razao">Razão social</label><input id="s_razao" maxlength="200"></div>
          <div><label for="s_cnpj">CNPJ</label><input id="s_cnpj" maxlength="20"></div>
          <div><label for="s_email">E-mail</label><input id="s_email" type="email" maxlength="120"></div>
          <div><label for="s_tel">Telefone</label><input id="s_tel" maxlength="30" placeholder="(11) 90000-0000"></div>
          <div class="full"><label for="s_resp">Responsável (nome e sobrenome)</label><input id="s_resp" maxlength="120"></div>
        </div>
      </div>
      <div class="sol-sec">
        <h3><span class="ic">📍</span> Local da coleta</h3>
        <div class="sol-grid">
          <div><label for="s_cep">CEP</label><input id="s_cep" inputmode="numeric" maxlength="9" autocomplete="off" placeholder="00000-000"><div id="cepmsg" class="muted" style="font-size:12px;margin-top:4px"></div></div>
          <div><label for="s_num">Número</label><input id="s_num" maxlength="12" placeholder="nº"></div>
          <div class="full"><label for="s_log">Endereço (rua / avenida)</label><input id="s_log" required maxlength="200" placeholder="digite o CEP que preenchemos — confira"></div>
          <div><label for="s_bairro">Bairro</label><input id="s_bairro" maxlength="120"></div>
          <div><label for="s_cidade">Cidade / UF</label><input id="s_cidade" maxlength="120"></div>
          <div class="full"><label for="s_compl">Complemento / referência <span style="font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted)">— opcional</span></label><input id="s_compl" maxlength="160" placeholder="bloco, andar, sala, ponto de referência…"></div>
        </div>
      </div>
      <div class="sol-sec">
        <h3><span class="ic">📦</span> Equipamentos</h3>
        <textarea id="s_equip" rows="3" maxlength="4000" placeholder="Ex.: 10 monitores, 5 CPUs, 2 no-breaks, 1 impressora…"></textarea>
        <div class="sol-grid" style="margin-top:10px">
          <div><label for="s_itens">Quantos itens no total? (aproximado)</label><input id="s_itens" inputmode="numeric" required maxlength="6" placeholder="ex.: 25" oninput="atualizaTaxa()"></div>
        </div>
      </div>
      <div class="sol-sec">
        <h3><span class="ic">⏱️</span> Prazo da coleta</h3>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:1px solid #E4EBE9;border-radius:10px;cursor:pointer;margin-bottom:8px">
          <input type="radio" name="s_modo" value="tradicional" checked onchange="atualizaTaxa()" style="margin-top:3px">
          <span style="font-size:13.5px;line-height:1.45"><b>Tradicional</b> — coleta em 1 a 7 dias úteis.<br><span class="muted" style="font-size:12.5px">Gratuita a partir de 20 itens. Abaixo de 20 itens há taxa de R$ 55.</span></span>
        </label>
        <label style="display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:1px solid #E4EBE9;border-radius:10px;cursor:pointer">
          <input type="radio" name="s_modo" value="expressa" onchange="atualizaTaxa()" style="margin-top:3px">
          <span style="font-size:13.5px;line-height:1.45"><b>⚡ Expressa</b> — coleta em até 24h. <b>R$ 55</b>.<br><span class="muted" style="font-size:12.5px">Pagamento na hora e liberação automática.</span></span>
        </label>
        <div id="taxainfo" style="margin-top:10px;font-size:13px;font-weight:700;color:#3F5A34;background:#F3FAEA;border:1px solid #D9EDBB;border-radius:10px;padding:9px 13px">Coleta gratuita — prazo de 1 a 7 dias úteis.</div>
      </div>
      <div class="sol-sec">
        <h3><span class="ic">📸</span> Fotos dos equipamentos <span style="font-weight:600;text-transform:none;letter-spacing:0;color:var(--muted)">— opcional</span></h3>
        <div class="dropzone" id="dz"><strong>Clique ou arraste as fotos aqui</strong><br><span style="font-size:12.5px">até 4 imagens</span></div>
        <input id="fotos" type="file" accept="image/*" multiple style="display:none">
        <div class="thumbs" id="thumbs"></div>
      </div>
      <div style="margin-top:20px"><button class="btn" id="bc" type="submit">Solicitar coleta →</button></div>
    </form>
    <div id="cmsg" class="notice" hidden></div>
  </section>

  <a href="/esg/planos" style="display:flex;align-items:center;gap:12px;background:#EDF2FB;border:1px solid #CFDCF2;border-radius:12px;padding:11px 16px;margin:16px 0 0;text-decoration:none">
    <span style="font-size:20px">📄</span>
    <span style="min-width:0;flex:1;font-size:13px;color:#33456B;line-height:1.4"><b style="color:#1F3057">Relatório de ESG para banco, cliente e auditoria</b> — gerado a partir das suas coletas e documentos reais.</span>
    <span style="flex:none;font-size:12px;font-weight:800;background:#1F3057;color:#fff;border-radius:8px;padding:7px 12px">Ver opções →</span>
  </a>

  <section class="panel docs">
    <h2>Documentos e conformidade <span class="chip">em breve</span></h2>
    <p class="muted" style="margin:6px 0 0">Nota Fiscal, MTR, Carta de Doação e Certificado de Destinação Final — no padrão aceito por auditoria e ESG, gerados a partir do seu histórico de descartes.</p>
    <div class="docrow"><span class="docpill">Nota Fiscal</span><span class="docpill">MTR</span><span class="docpill">Carta de Doação</span><span class="docpill">Certificado de Destinação Final</span><span class="docpill">Relatório de conformidade</span></div>
  </section>

  <div class="foot">Ecobraz Emigre — Portal do Cliente · destinação correta, conformidade e evidências.</div>
</main>
<a href="${zapLink}" target="_blank" rel="noopener" title="Dúvida ou problema? Fale direto com o nosso comercial"
   style="position:fixed;right:18px;bottom:18px;z-index:60;display:flex;align-items:center;gap:8px;background:#25D366;color:#fff;text-decoration:none;font-weight:800;font-size:13px;padding:11px 16px;border-radius:30px;box-shadow:0 6px 18px rgba(0,0,0,.18)">
  <span style="font-size:17px">💬</span> Falar com o comercial
</a>
<script>
// Monitor de falhas: qualquer erro na tela do cliente é reportado ao servidor
// (a equipe enxerga mesmo se o cliente não reclamar). Nunca atrapalha o uso.
(function(){
  function rep(onde,msg,stack){
    try{
      var corpo=JSON.stringify({pagina:location.pathname,onde:onde,mensagem:String(msg||'').slice(0,600),stack:String(stack||'').slice(0,900)});
      if(navigator.sendBeacon){ navigator.sendBeacon('/api/monitor/erro', new Blob([corpo],{type:'application/json'})); }
      else { fetch('/api/monitor/erro',{method:'POST',headers:{'content-type':'application/json'},body:corpo}); }
    }catch(_){}
  }
  window.addEventListener('error',function(e){ rep('js', e.message||'erro', e.error&&e.error.stack); });
  window.addEventListener('unhandledrejection',function(e){ rep('promise',(e.reason&&e.reason.message)||String(e.reason||''), e.reason&&e.reason.stack); });
  window.__repErro=rep;
})();
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
      var titulo=o.numeroOS?('Ordem de serviço '+escapeHtml(String(o.numeroOS))):'Ordem de serviço';
      var meta=[]; meta.push(o.dataColeta?('Coleta em '+fmt(o.dataColeta)):('Aberta em '+fmt(o.aberturaISO)));
      if(o.peso && String(o.peso).toLowerCase().indexOf('não informado')<0 && String(o.peso).toLowerCase().indexOf('nao informado')<0) meta.push('Peso: '+escapeHtml(String(o.peso)));
      var rastreio=o.rastreavel?'<a class="doclnk" style="text-decoration:none;background:#92C430;color:#10262B;border-color:#92C430" href="/rastreio?os='+encodeURIComponent(o.id)+'">🚚 Acompanhar o caminhão</a> ':'';
      var cobr='';
      if(o.cobranca&&o.cobranca.status==='pago'){ cobr='<span class="doclnk" style="background:#E5F6E5;color:#1E7A1E;border-color:#CBE7CB">💳 Pago ✓</span> '; }
      else if(o.cobranca&&o.cobranca.link){ cobr='<a class="doclnk" style="text-decoration:none;background:#FFF4DE;color:#8A4B00;border-color:#F2C173;font-weight:800" href="'+o.cobranca.link+'" target="_blank" rel="noopener">💳 Pagar R$ '+String(o.cobranca.valor).replace('.',',')+'</a> '; }
      return '<div class="os"><div class="os-main"><div class="os-title">'+titulo+'</div><div class="os-meta">'+meta.join(' · ')+'</div>'
        +rastreio+cobr
        +'<button class="doclnk" type="button" onclick="verDocs(&#39;'+o.id+'&#39;,this)">📄 Documentos</button>'
        +'<div class="docwrap" id="docs-'+o.id+'"></div>'
        +'</div><span class="tag '+tagCls(o.status)+'">'+escapeHtml(o.status)+'</span></div>';
    }).join('');
  }catch(_){ kpi.textContent='—'; alvo.innerHTML='<p class="muted">Não foi possível carregar agora. Tente atualizar a página.</p>'; }
}
async function verDocs(id,btn){
  var box=document.getElementById('docs-'+id); if(!box) return;
  if(box.dataset.loaded){ box.style.display=(box.style.display==='none'||!box.style.display)?'flex':'none'; return; }
  btn.disabled=true; var txt=btn.textContent; btn.textContent='Carregando…';
  try{
    var r=await fetch('/api/os/docs?dealId='+encodeURIComponent(id)); var d=await r.json();
    if(d.ok&&d.docs&&d.docs.length){
      box.innerHTML=d.docs.map(function(x){return '<a class="docdl" href="/api/os/doc?docId='+encodeURIComponent(x.id)+'&fonte='+(x.fonte||'r2')+'" target="_blank" rel="noopener">⬇ '+escapeHtml(x.nome)+'</a>';}).join('');
    } else { box.innerHTML='<span class="muted" style="font-size:13px">Nenhum documento disponível ainda. Assim que a coleta for processada, os documentos aparecem aqui.</span>'; }
    box.dataset.loaded='1'; box.style.display='flex';
  }catch(_){ box.innerHTML='<span class="muted" style="font-size:13px">Não consegui carregar os documentos agora.</span>'; box.style.display='flex'; }
  btn.disabled=false; btn.textContent=txt;
}
function campoVal(id){var el=document.getElementById(id);return el?el.value.trim():'';}
async function preencherPerfil(){
  try{ var r=await fetch('/api/perfil'); var d=await r.json();
    if(d.ok&&d.perfil){ var p=d.perfil, set=function(id,v){ var el=document.getElementById(id); if(el&&v&&!el.value) el.value=v; };
      set('s_razao',p.razaoSocial); set('s_cnpj',p.cnpj); set('s_email',p.email); set('s_tel',p.telefone); set('s_resp',p.responsavel);
    }
  }catch(_){}
}
function soDig(s){return (s||'').replace(/\\D/g,'');}
async function buscarCep(){
  var el=document.getElementById('s_cep'), msg=document.getElementById('cepmsg'); if(!el) return;
  var cep=soDig(el.value); if(cep.length!==8){ if(msg) msg.textContent=''; return; }
  if(msg){ msg.textContent='Buscando endereço…'; msg.style.color=''; }
  try{
    var r=await fetch('/api/cep?cep='+cep); var d=await r.json();
    if(d.ok&&d.endereco){ var e=d.endereco, setv=function(id,v){ var x=document.getElementById(id); if(x&&v) x.value=v; };
      setv('s_log',e.logradouro); setv('s_bairro',e.bairro); setv('s_cidade',(e.cidade||'')+(e.uf?(' / '+e.uf):'')); el.value=e.cep||el.value;
      if(msg){ msg.textContent='✓ endereço preenchido'; msg.style.color='var(--green)'; }
      var n=document.getElementById('s_num'); if(n&&!n.value) n.focus();
    } else if(d.error==='cep_nao_encontrado'){ if(msg){ msg.textContent='CEP não encontrado — pode digitar o endereço.'; msg.style.color='#b23b3b'; } }
    else { if(msg){ msg.textContent='Não consegui buscar agora — pode digitar o endereço.'; msg.style.color='#b23b3b'; } }
  }catch(_){ if(msg){ msg.textContent='Sem conexão para buscar o CEP — digite o endereço.'; msg.style.color='#b23b3b'; } }
}
(function(){ var c=document.getElementById('s_cep'); if(c){ c.addEventListener('blur',buscarCep); c.addEventListener('input',function(){ if(soDig(c.value).length===8) buscarCep(); }); } })();
var _fotos=[];
function renderThumbs(){ var t=document.getElementById('thumbs'); if(t) t.innerHTML=_fotos.map(function(f,i){return '<div class="thumb"><img src="'+f.dataUrl+'"><button type="button" onclick="removeFoto('+i+')" aria-label="remover">×</button></div>';}).join(''); }
function removeFoto(i){ _fotos.splice(i,1); renderThumbs(); }
function addFiles(files){
  Array.prototype.slice.call(files||[]).forEach(function(file){
    if(_fotos.length>=4 || !/^image\\//.test(file.type)) return;
    var reader=new FileReader();
    reader.onload=function(ev){ var img=new Image(); img.onload=function(){
      var max=1400, sc=Math.min(1,max/Math.max(img.width,img.height));
      var cv=document.createElement('canvas'); cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
      _fotos.push({nome:file.name||'foto', dataUrl:cv.toDataURL('image/jpeg',0.72)}); renderThumbs();
    }; img.src=ev.target.result; };
    reader.readAsDataURL(file);
  });
}
(function(){ var dz=document.getElementById('dz'), inp=document.getElementById('fotos');
  if(dz&&inp){ dz.addEventListener('click',function(){inp.click();});
    inp.addEventListener('change',function(){addFiles(this.files);this.value='';});
    dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('drag');});
    dz.addEventListener('dragleave',function(){dz.classList.remove('drag');});
    dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('drag');addFiles(e.dataTransfer.files);});
  }
})();
function modoColeta(){ var r=document.querySelector('input[name="s_modo"]:checked'); return r?r.value:'tradicional'; }
function atualizaTaxa(){
  var box=document.getElementById('taxainfo'); if(!box) return;
  var itens=parseInt((campoVal('s_itens')||'').replace(/\\D/g,''),10)||0;
  var expressa=modoColeta()==='expressa';
  var pouco=itens>0&&itens<20;
  if(expressa||pouco){
    var motivo=expressa?(pouco?'expressa + menos de 20 itens':'coleta expressa em até 24h'):'menos de 20 itens';
    box.style.background='#FFF4DE';box.style.borderColor='#F2C173';box.style.color='#8A4B00';
    box.innerHTML='💳 Esta coleta tem taxa de <b>R$ 55</b> ('+motivo+'). Você paga na hora, e a liberação é automática.';
  } else if(itens===0){
    box.style.background='#F3FAEA';box.style.borderColor='#D9EDBB';box.style.color='#3F5A34';
    box.textContent='Informe a quantidade de itens: a coleta é gratuita a partir de 20 itens (1 a 7 dias úteis).';
  } else {
    box.style.background='#F3FAEA';box.style.borderColor='#D9EDBB';box.style.color='#3F5A34';
    box.textContent='✓ Coleta gratuita ('+itens+' itens) — prazo de 1 a 7 dias úteis.';
  }
}
async function solicitar(e){e.preventDefault();
  var b=document.getElementById('bc'),m=document.getElementById('cmsg');
  b.disabled=true;b.textContent='Enviando…';
  var cep=campoVal('s_cep'),log=campoVal('s_log'),num=campoVal('s_num'),bairro=campoVal('s_bairro'),cidade=campoVal('s_cidade'),compl=campoVal('s_compl');
  var endereco=[log+(num?(', '+num):''),bairro,cidade,cep?('CEP '+cep):'',compl?('('+compl+')'):''].filter(Boolean).join(' - ');
  var body={razaoSocial:campoVal('s_razao'),cnpj:campoVal('s_cnpj'),endereco:endereco,cep:cep,logradouro:log,numero:num,bairro:bairro,cidade:cidade,complemento:compl,telefone:campoVal('s_tel'),email:campoVal('s_email'),responsavel:campoVal('s_resp'),equipamentos:campoVal('s_equip'),itens:campoVal('s_itens'),expressa:modoColeta()==='expressa',fotos:_fotos};
  try{
    var r=await fetch('/api/os/solicitar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var d=await r.json(); m.hidden=false;
    if(d.ok){
      var extra=d.fotos?' <b>'+d.fotos+' foto(s) anexada(s).</b>':'';
      if(d.pagamento&&d.pagamento.link){
        m.innerHTML=escapeHtml(d.message||'Falta só o pagamento.')+extra
          +'<a href="'+d.pagamento.link+'" target="_blank" rel="noopener" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:13px;text-align:center;font-weight:800;font-size:15px;margin-top:12px">💳 Pagar R$ '+d.pagamento.valor+' agora →</a>'
          +'<div style="font-size:12px;color:#7c8a87;margin-top:8px">Pagamento seguro pelo Mercado Pago (Pix, cartão e boleto). Assim que aprovar, sua coleta é liberada automaticamente.</div>';
      } else {
        m.innerHTML=escapeHtml(d.message||'Coleta solicitada!')+extra;
      }
      ['s_cep','s_log','s_num','s_bairro','s_cidade','s_compl','s_equip','s_itens'].forEach(function(id){var el=document.getElementById(id); if(el) el.value='';});
      var cm=document.getElementById('cepmsg'); if(cm) cm.textContent=''; _fotos=[]; renderThumbs(); atualizaTaxa(); carregar();
    }
    else if(d.error==='endereco_obrigatorio'){ m.textContent='Informe o endereço de coleta.'; }
    else if(d.tipo==='barrado'||d.tipo==='so_perigosos'){ m.innerHTML='⚠️ '+escapeHtml(d.message||'Não coletamos esse tipo de material.'); }
    else { m.textContent='Não foi possível solicitar agora. Tente novamente em instantes.'; window.__repErro&&window.__repErro('solicitar-coleta-servidor', d.error||('http '+r.status)); }
  }catch(err){ m.hidden=false; m.textContent='Falha de conexão. Tente novamente.'; window.__repErro&&window.__repErro('solicitar-coleta', err&&err.message, err&&err.stack); }
  b.disabled=false;b.textContent='Solicitar coleta →';
  return false;
}
carregar();
preencherPerfil();
atualizaTaxa();
</script></body></html>`;
}

export function paginaMensagem(titulo, texto, voltarUrl) {
  const alvo = voltarUrl || '/inicio';
  return `${head(titulo)}
<div class="auth-form" style="min-height:100vh;flex-direction:column;gap:22px">
  <img src="/assets/logo.png" alt="Ecobraz Emigre" style="width:170px">
  <div class="panel" style="max-width:440px;text-align:center">
    <h2 style="color:var(--teal);font-size:22px">${esc(titulo)}</h2>
    <p class="muted" style="margin:10px 0 20px">${esc(texto)}</p>
    <a class="btn" href="${esc(alvo)}">Voltar ao início</a>
  </div>
</div></body></html>`;
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatarData(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; } }
