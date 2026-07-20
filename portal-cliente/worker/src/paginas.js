// Telas do Portal (HTML server-rendered, sem build). Português, identidade Ecobraz.

const BASE_CSS = `
:root{--verde:#00333B;--verde2:#0b5c66;--bg:#f4f6f6;--card:#fff;--linha:#e2e8e8;--txt:#0b2a2f;--suave:#5b6b6e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5}
a{color:var(--verde2)}
.wrap{max-width:860px;margin:0 auto;padding:24px 16px}
.top{background:var(--verde);color:#fff;padding:16px 20px;font-weight:700;font-size:18px;display:flex;justify-content:space-between;align-items:center}
.card{background:var(--card);border:1px solid var(--linha);border-radius:12px;padding:22px;margin:16px 0}
h1{font-size:22px;color:var(--verde);margin:0 0 6px}h2{font-size:17px;color:var(--verde);margin:0 0 12px}
label{display:block;font-size:14px;margin:12px 0 6px;color:var(--suave)}
input,textarea{width:100%;padding:11px 12px;border:1px solid var(--linha);border-radius:8px;font-size:15px;font-family:inherit}
.btn{display:inline-block;background:var(--verde);color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer;text-decoration:none}
.btn:disabled{opacity:.6;cursor:default}
.muted{color:var(--suave);font-size:14px}
.aviso{background:#eef6f4;border:1px solid #cfe6e0;border-radius:8px;padding:12px 14px;font-size:14px;margin-top:12px}
.os{border-top:1px solid var(--linha);padding:12px 0;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.os:first-child{border-top:0}
.tag{font-size:12px;padding:3px 10px;border-radius:20px;background:#eef2f2;color:var(--verde);white-space:nowrap}
.linkbtn{background:none;border:0;color:var(--verde2);cursor:pointer;font-size:14px;padding:0}
.rodape{color:var(--suave);font-size:12px;text-align:center;padding:20px}
`;

function shell(titulo, corpo, topoDireita = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${titulo} — Portal Ecobraz</title><style>${BASE_CSS}</style></head>
<body><div class="top"><span>Portal Ecobraz</span><span>${topoDireita}</span></div>
<div class="wrap">${corpo}</div>
<div class="rodape">Ecobraz — Portal do Cliente</div></body></html>`;
}

export function paginaLogin() {
  const corpo = `
<div class="card">
  <h1>Acesso do cliente</h1>
  <p class="muted">Digite o e-mail cadastrado na Ecobraz. Enviaremos um <strong>link de acesso</strong> — sem senha para decorar.</p>
  <form id="f" onsubmit="return enviar(event)">
    <label for="email">Seu e-mail</label>
    <input id="email" name="email" type="email" autocomplete="email" required placeholder="voce@empresa.com.br">
    <div style="margin-top:16px"><button class="btn" id="b" type="submit">Enviar link de acesso</button></div>
  </form>
  <div id="msg" class="aviso" style="display:none"></div>
  <p class="muted" style="margin-top:16px">O acesso é exclusivo para empresas com contrato ativo com a Ecobraz.</p>
</div>
<script>
async function enviar(e){e.preventDefault();
  var b=document.getElementById('b'),m=document.getElementById('msg');
  b.disabled=true;b.textContent='Enviando...';
  try{
    await fetch('/api/auth/solicitar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value})});
  }catch(_){}
  m.style.display='block';
  m.innerHTML='Se o e-mail for de um cliente ativo, enviamos um <strong>link de acesso</strong>. Verifique sua caixa de entrada (e o spam). O link vale por 15 minutos.';
  b.style.display='none';
  return false;
}
</script>`;
  return shell('Entrar', corpo);
}

export function paginaPainel({ nome, email, dataFim }) {
  const primeiro = esc((nome || '').split(/\s+/)[0] || 'cliente');
  const validade = dataFim ? `Contrato ativo até <strong>${esc(formatarData(dataFim))}</strong>.` : 'Contrato ativo.';
  const corpo = `
<div class="card">
  <h1>Olá, ${primeiro} 👋</h1>
  <p class="muted">${esc(email)} — ${validade}</p>
</div>

<div class="card">
  <h2>Seus atendimentos / OS</h2>
  <div id="oslista"><p class="muted">Carregando...</p></div>
</div>

<div class="card">
  <h2>Abrir um chamado</h2>
  <p class="muted">Precisa de uma nova coleta ou tem uma solicitação? Abra aqui — cai direto na nossa equipe.</p>
  <form id="fc" onsubmit="return abrir(event)">
    <label for="assunto">Assunto</label>
    <input id="assunto" required maxlength="200" placeholder="Ex.: Nova coleta de equipamentos">
    <label for="descricao">Descrição (opcional)</label>
    <textarea id="descricao" rows="4" maxlength="4000" placeholder="Detalhes que ajudem a equipe..."></textarea>
    <div style="margin-top:14px"><button class="btn" id="bc" type="submit">Abrir chamado</button></div>
  </form>
  <div id="cmsg" class="aviso" style="display:none"></div>
</div>

<form method="post" action="/api/auth/sair"><button class="linkbtn" type="submit">Sair</button></form>

<script>
function fmt(iso){ if(!iso) return '-'; try{ return new Date(iso).toLocaleDateString('pt-BR'); }catch(_){ return '-'; } }
async function carregar(){
  var alvo=document.getElementById('oslista');
  try{
    var r=await fetch('/api/os'); var d=await r.json();
    if(!d.ok||!d.os||!d.os.length){ alvo.innerHTML='<p class="muted">Ainda não há atendimentos registrados.</p>'; return; }
    alvo.innerHTML=d.os.map(function(o){
      return '<div class="os"><div><strong>'+escapeHtml(o.titulo)+'</strong><br><span class="muted">Aberto em '+fmt(o.aberturaISO)+(o.conclusaoISO?' • Concluído em '+fmt(o.conclusaoISO):'')+'</span></div><span class="tag">'+escapeHtml(o.status)+'</span></div>';
    }).join('');
  }catch(_){ alvo.innerHTML='<p class="muted">Não foi possível carregar agora. Tente atualizar a página.</p>'; }
}
async function abrir(e){e.preventDefault();
  var b=document.getElementById('bc'),m=document.getElementById('cmsg');
  b.disabled=true;b.textContent='Enviando...';
  try{
    var r=await fetch('/api/chamado',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({assunto:document.getElementById('assunto').value,descricao:document.getElementById('descricao').value})});
    var d=await r.json();
    m.style.display='block';
    if(d.ok){ m.textContent=d.message||'Chamado aberto!'; document.getElementById('fc').reset(); carregar(); }
    else { m.textContent='Não foi possível abrir agora. Tente novamente em instantes.'; }
  }catch(_){ m.style.display='block'; m.textContent='Falha de conexão. Tente novamente.'; }
  b.disabled=false;b.textContent='Abrir chamado';
  return false;
}
function escapeHtml(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
carregar();
</script>`;
  return shell('Painel', corpo, '<form method="post" action="/api/auth/sair" style="margin:0"><button class="linkbtn" style="color:#cde" type="submit">Sair</button></form>');
}

export function paginaMensagem(titulo, texto) {
  return shell(titulo, `<div class="card"><h1>${esc(titulo)}</h1><p class="muted">${esc(texto)}</p><p style="margin-top:16px"><a class="btn" href="/">Voltar ao início</a></p></div>`);
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatarData(iso) { try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return iso; } }
