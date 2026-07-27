// Relatórios de ESG — 3 modelos + combo, cobrança ANUAL, preço por faixa de faturamento.
// Entregues pela Villanova ESG (como o nível "Contratado" do carbono): quando o cliente
// paga, abre uma tarefa para a Villanova produzir o relatório (com todo o lastro do sistema:
// coletas rastreadas, CDF, inventário de carbono e patrocínios do Adote um Bairro).
//
// Modelos (aprovados pela diretoria, jul/2026):
//  - Padrão BR   — conformidade com o arcabouço brasileiro (CVM/IFRS-ISSB, GRI).
//  - Padrão UE   — conformidade com a diretiva europeia (CSRD/ESRS) — exportação e cadeia UE.
//  - Financeiro  — para instituições financeiras (TCFD/CMN) — pleitear crédito mais barato.
//  - Combo 3     — os três, com preço mais acessível.
//
// SEGURANÇA: nada de segredo aqui; o pagamento passa pelo Mercado Pago (chave só na Cloudflare).

import { FAIXAS_FATURAMENTO, faixaValida, faixaPorFaturamento } from './carbono.js';

export const RELATORIOS_ESG = [
  {
    id: 'br', nome: 'Relatório Padrão BR', selo: '🇧🇷 Brasil',
    norma: 'CVM/IFRS-ISSB · GRI',
    resumo: 'Relatório de sustentabilidade no arcabouço brasileiro — alinhado ao padrão ISSB adotado pela CVM e às diretrizes GRI.',
    paraQuem: 'Empresas que precisam reportar ESG no Brasil, participar de licitações e responder a clientes e auditoria.',
    precos: { p: 2900, m: 5900, g: 9900, xg: null },
  },
  {
    id: 'ue', nome: 'Relatório Padrão UE', selo: '🇪🇺 Europa',
    norma: 'CSRD · ESRS',
    resumo: 'Relatório em conformidade com a diretiva europeia CSRD e os padrões ESRS — o que a Europa exige de quem exporta ou está na cadeia de fornecedores da UE.',
    paraQuem: 'Exportadores e fornecedores de empresas europeias, que já são cobrados pela CSRD.',
    precos: { p: 3900, m: 7900, g: 12900, xg: null },
  },
  {
    id: 'fin', nome: 'Relatório Financeiro', selo: '🏦 Crédito',
    norma: 'TCFD · CMN 4.945',
    resumo: 'Relatório ESG no formato que bancos e fundos pedem (TCFD / Res. CMN 4.945) — para pleitear linhas de crédito verde e taxas melhores.',
    paraQuem: 'Empresas que querem usar o ESG para destravar crédito mais barato e melhorar rating.',
    precos: { p: 3900, m: 7900, g: 12900, xg: null },
  },
];

export const COMBO_ESG = {
  id: 'combo', nome: 'Combo — os 3 relatórios', selo: '⭐ Melhor valor',
  norma: 'BR + UE + Financeiro',
  resumo: 'Os três relatórios (BR, UE e Financeiro) com um preço bem mais acessível do que comprar separado. Cobre Brasil, Europa e o sistema financeiro de uma vez.',
  paraQuem: 'Quem opera em várias frentes e quer conformidade total com o melhor custo.',
  precos: { p: 8900, m: 17900, g: 29900, xg: null },
};

const TODOS_ESG = [...RELATORIOS_ESG, COMBO_ESG];
export function relatorioESG(id) { return TODOS_ESG.find((r) => r.id === id) || null; }
// Preço de um relatório numa faixa. { valor:Number, sobConsulta:false } ou { valor:null, sobConsulta:true }.
export function precoRelatorioESG(id, faixaId) {
  const r = relatorioESG(id); if (!r) return null;
  const v = r.precos[faixaValida(faixaId) || faixaId];
  return (v == null) ? { valor: null, sobConsulta: true } : { valor: v, sobConsulta: false };
}
export { FAIXAS_FATURAMENTO, faixaValida, faixaPorFaturamento };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function head(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(t)}</title><link rel="icon" href="/assets/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--green:#92C430;--green-d:#74A21F;--teal:#00333B;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
.wrap{max-width:960px;margin:0 auto;padding:40px 20px 60px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:22px}.top img{width:150px;height:auto}
.tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green-d);border-left:1px solid var(--line);padding-left:14px}
h1{font-size:clamp(23px,3vw,31px);color:var(--teal);letter-spacing:-.02em;margin:0 0 8px}
.sub{color:var(--muted);margin:0 0 22px;max-width:660px}
.fatbox{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.fatbox label{font-size:13.5px;font-weight:700}
select{padding:11px 12px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:15px;background:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.rep{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;box-shadow:0 8px 26px rgba(0,51,59,.06)}
.rep.combo{border-color:#cde5a6;background:#FBFDF9;grid-column:1/-1}
.selo{font-size:11px;font-weight:800;color:var(--green-d)}
.rn{font-size:18px;font-weight:800;color:var(--teal);margin:5px 0 2px}
.norma{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:10px}
.ri{font-size:13px;color:var(--muted);flex:1;margin-bottom:10px;line-height:1.55}
.para{font-size:12px;color:#3f6b1e;background:#F1F8EC;border-radius:9px;padding:9px 11px;margin-bottom:12px;line-height:1.45}
.tp{margin-bottom:14px}.pv{font-size:25px;font-weight:800;color:var(--ink)}.pu{font-size:12px;color:var(--muted);font-weight:700;margin-left:3px}.sob{font-size:16px;font-weight:800;color:var(--teal)}
.btn{display:block;text-align:center;text-decoration:none;min-height:46px;line-height:46px;border-radius:10px;background:var(--green);color:var(--ink);font-weight:800;font-size:14.5px}
.btn:hover{background:#A2D53E}.btn.dark{background:var(--teal);color:#fff}.btn.ghost{background:#fff;border:1px solid var(--line);color:var(--teal)}
.disc{font-size:12.5px;color:var(--muted);background:#FBFDF9;border:1px dashed var(--line);border-radius:12px;padding:13px 15px;margin-top:20px}
.funnel{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-top:22px}
.funnel .row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px}
.fstep{border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-decoration:none;color:inherit;display:block}
.fstep.here{border-color:#cde5a6;background:#F7FBF2}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:26px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px}
label.fld{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}
input,textarea{width:100%;padding:13px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:15px}
.btnf{margin-top:16px;width:100%;min-height:50px;border:0;border-radius:10px;background:var(--green);color:var(--ink);font:inherit;font-weight:800;font-size:15px;cursor:pointer}
@media(max-width:640px){.funnel .row{grid-template-columns:1fr}}
</style></head>`;
}
function topo(sub) {
  return `<div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">${esc(sub || 'Relatórios de ESG')}</span></div>`;
}
function funil(here) {
  const step = (href, ico, tit, txt, isHere) => `<a href="${href}" class="fstep${isHere ? ' here' : ''}"><div style="font-size:20px">${ico}</div><div style="font-size:14px;font-weight:800;color:#00333B;margin:6px 0 3px">${tit}</div><div style="font-size:12.5px;color:#5c6f6b;line-height:1.5">${txt}</div></a>`;
  return `<div class="funnel">
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#3f6b1e;text-align:center">O caminho completo do ESG</div>
    <div class="row">
      ${step('/carbono/planos', '🧮', '1. Meça', 'Inventário de carbono da empresa (GHG Protocol).', here === 'medir')}
      ${step('/adote', '🌱', '2. Compense', 'Patrocine coletas e baixe o seu termômetro.', here === 'compensar')}
      ${step('/esg/planos', '📄', '3. Comprove', 'Relatório de ESG que prova tudo — você está aqui.', here === 'comprovar')}
    </div>
  </div>`;
}

// Loja dos relatórios de ESG.
export function paginaLojaESG(faixaIni) {
  const faixaSel = faixaValida(faixaIni) || 'p';
  const optFaixas = FAIXAS_FATURAMENTO.map((f) => `<option value="${f.id}"${f.id === faixaSel ? ' selected' : ''}>${esc(f.rotulo)}</option>`).join('');
  const dados = JSON.stringify({ reports: RELATORIOS_ESG, combo: COMBO_ESG });
  return `${head('Relatórios de ESG — Ecobraz')}<body>
<div class="wrap">
  ${topo('Relatórios de ESG')}
  <h1>Prove o seu ESG — no padrão que cada porta exige</h1>
  <p class="sub">Do inventário de carbono às coletas rastreadas e ao Adote um Bairro: a Ecobraz já tem o lastro. A Villanova ESG transforma isso no <b>relatório</b> que o Brasil, a Europa ou o seu banco pedem. Cobrança <b>anual</b>.</p>
  <div class="fatbox"><label for="fat">Faturamento anual da empresa:</label><select id="fat" onchange="render()">${optFaixas}</select></div>
  <div class="cards" id="cards"></div>
  <div class="disc">Os relatórios são produzidos pela <b>Villanova ESG</b> a partir dos dados reais do seu sistema Ecobraz (coletas, CDF, inventário de carbono e patrocínios). Prazo e escopo detalhado são confirmados no início do trabalho. Empresas acima de R$ 300 milhões/ano recebem proposta sob medida.</div>
  ${funil('comprovar')}
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
var D=${dados};
function brl(v){return 'R$ '+Number(v).toLocaleString('pt-BR');}
function faixa(){return document.getElementById('fat').value;}
function cardHTML(r,combo){
  var p=r.precos[faixa()];
  var preco=(p==null)?'<span class="sob">Sob proposta</span>':('<span class="pv">'+brl(p)+'</span><span class="pu">/ano</span>');
  var cta;
  if(p==null){ cta='<a class="btn ghost" href="/esg/contato?rel='+r.id+'&faixa='+faixa()+'">Pedir proposta</a>'; }
  else { cta='<a class="btn'+(combo?' dark':'')+'" href="/esg/assinar?rel='+r.id+'&faixa='+faixa()+'">Contratar</a>'; }
  return '<div class="rep'+(combo?' combo':'')+'">'
    +'<div class="selo">'+r.selo+'</div>'
    +'<div class="rn">'+r.nome+'</div>'
    +'<div class="norma">'+r.norma+'</div>'
    +'<div class="ri">'+r.resumo+'</div>'
    +'<div class="para">👤 '+r.paraQuem+'</div>'
    +'<div class="tp">'+preco+'</div>'+cta+'</div>';
}
function render(){
  var html=D.reports.map(function(r){return cardHTML(r,false);}).join('')+cardHTML(D.combo,true);
  document.getElementById('cards').innerHTML=html;
}
render();
</script>
</body></html>`;
}

// Contato/proposta (faixa "sob proposta" ou pedido sob medida) — vira lead.
export function paginaESGContato(rel, faixa) {
  const nome = rel ? rel.nome : 'Relatório de ESG';
  return `${head('Falar sobre ESG — Ecobraz')}<body>
<div class="wrap" style="max-width:560px">
  ${topo('Relatórios de ESG')}
  <h1 style="font-size:26px">${esc(nome)}</h1>
  <p class="sub">Deixe seus dados que a equipe da Ecobraz e da Villanova ESG entra em contato para montar a sua proposta.</p>
  <div class="card" id="card">
    <form id="f" onsubmit="return enviar(event)">
      <input type="hidden" id="rel" value="${rel ? esc(rel.id) : ''}"><input type="hidden" id="faixa" value="${esc(faixaValida(faixa) || '')}">
      <label class="fld">Empresa</label><input id="empresa" required>
      <label class="fld">Seu nome</label><input id="nomec" required>
      <label class="fld">E-mail</label><input id="email" type="email" required>
      <label class="fld">Telefone / WhatsApp</label><input id="fone">
      <label class="fld">Mensagem (opcional)</label><textarea id="msg" rows="3"></textarea>
      <button class="btnf" id="b" type="submit">Enviar</button>
    </form>
  </div>
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
async function enviar(e){e.preventDefault();var b=document.getElementById('b');b.disabled=true;b.textContent='Enviando…';
  var g=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  try{await fetch('/api/esg/contato',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rel:g('rel'),faixa:g('faixa'),empresa:g('empresa'),nome:g('nomec'),email:g('email'),fone:g('fone'),msg:g('msg')})});}catch(_){}
  document.getElementById('card').innerHTML='<div style="text-align:center;padding:20px 0"><div style="font-size:42px">✅</div><div style="font-size:17px;font-weight:800;color:#00333B;margin-top:8px">Recebido!</div><p class="sub" style="margin-top:8px">Nossa equipe vai entrar em contato em breve.</p></div>';
  return false;
}
</script>
</body></html>`;
}

// Pós-pagamento: confirma (polling) e explica os próximos passos (Villanova entra em contato).
export function paginaESGObrigado(pedidoId) {
  const pid = String(pedidoId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${head('Pagamento — Relatório de ESG')}<body>
<div class="wrap" style="max-width:560px">
  ${topo('Relatórios de ESG')}
  <div class="card" id="card" style="text-align:center"><p class="sub" id="msg" style="margin:0">⏳ Confirmando seu pagamento…</p></div>
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
var PID=${JSON.stringify(pid)},tent=0;
function fdata(iso){try{return new Date(iso).toLocaleDateString('pt-BR');}catch(e){return '';}}
function checa(){
  fetch('/api/esg/pedido?id='+encodeURIComponent(PID)).then(function(r){return r.json();}).then(function(d){
    var card=document.getElementById('card');
    if(d.status==='pago'){
      var val=d.validade?(' Válido até <b>'+fdata(d.validade)+'</b>.'):'';
      card.innerHTML='<div style="font-size:44px">✅</div><h2 style="font-size:22px;margin:6px 0 8px">Contratação confirmada!</h2><p class="sub" style="margin:0 auto">A <b>Villanova ESG</b> vai entrar em contato para produzir o seu relatório a partir dos dados do seu sistema Ecobraz.'+val+'</p>';
      return;
    }
    if(tent++<40){ var m=document.getElementById('msg'); if(m)m.textContent='⏳ Confirmando seu pagamento… (pode levar até 1 minuto)'; setTimeout(checa,3000); }
    else { document.getElementById('card').innerHTML='<p class="sub" style="margin:0">Ainda não confirmou. Se você já pagou, recarregue esta página em instantes.</p>'; }
  }).catch(function(){ if(tent++<40) setTimeout(checa,3000); });
}
checa();
</script>
</body></html>`;
}
