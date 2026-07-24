// Adote um Bairro — loja de coleta PRÉ-PAGA por tonelada (pública).
//
// Modelo comercial (definido pela diretoria em 2026-07-24):
//  - 3 pacotes fixos: 1 t, 5 t, 10 t. Compra AVULSA ou RECORRENTE (recorrente = −10%).
//  - O cliente compra PESO (toneladas) e fica com CRÉDITO em kg.
//  - A cada coleta CONCLUÍDA, desconta do crédito o PESO DA DOCA (número auditável).
//  - RECORRENTE: quando o saldo chega a ≤ 20 kg, recarrega o MESMO pacote
//    (cobrança automática no cartão salvo; se falhar ou não estiver configurado, envia link).
//
// SEGURANÇA: a chave do Mercado Pago vive só na Cloudflare (Secret). O cartão é
// tokenizado pelo próprio Mercado Pago — o sistema NUNCA vê o número do cartão.
//
// Guardado no KV: credito:{clienteId} (saldo + histórico) e pedido:{ref} (cada compra).

export const LIMIAR_RECARGA_KG = 20;

// Preços: avulso e recorrente (−10%). kg = toneladas × 1000.
export const PACOTES = [
  { id: 't1', ton: 1, kg: 1000, avulso: 3500, recorrente: 3150 },
  { id: 't5', ton: 5, kg: 5000, avulso: 16000, recorrente: 14400 },
  { id: 't10', ton: 10, kg: 10000, avulso: 30000, recorrente: 27000 },
];
export const acharPacote = (id) => PACOTES.find((p) => p.id === id) || null;
export const precoPacote = (pac, tipo) => (tipo === 'recorrente' ? pac.recorrente : pac.avulso);
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };

// --- Motor de crédito (funções PURAS; fáceis de testar) --------------------
export function novoCredito(clienteId) {
  return { clienteId: String(clienteId), saldoKg: 0, tipo: null, pacoteId: null, valorUltimo: 0, cardId: null, status: 'ativo', criadoEm: agora(), atualizadoEm: agora(), historico: [] };
}

// Registra uma COMPRA aprovada (primeira ou upgrade): soma kg e define tipo/pacote.
export function aplicarCompra(cred, pac, tipo, valor, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) + pac.kg);
  c.tipo = tipo === 'recorrente' ? 'recorrente' : 'avulso';
  c.pacoteId = pac.id;
  c.valorUltimo = Number(valor) || precoPacote(pac, tipo);
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'compra', pacote: pac.id, tipo: c.tipo, kg: pac.kg, valor: c.valorUltimo, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Registra uma RECARGA (recorrente): mesmo pacote, soma kg.
export function aplicarRecarga(cred, pac, valor, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) + pac.kg);
  c.valorUltimo = Number(valor) || pac.recorrente;
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'recarga', pacote: pac.id, kg: pac.kg, valor: c.valorUltimo, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Debita o peso (kg) de UMA coleta concluída. Não impede saldo negativo (a recarga cobre).
export function debitar(cred, kg, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  const q = Math.max(0, Math.round(Number(kg) || 0));
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) - q);
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'consumo', kg: -q, saldo: c.saldoKg, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Precisa recarregar? (só recorrente, saldo no limiar ou abaixo)
export function precisaRecarga(cred) {
  return !!(cred && cred.tipo === 'recorrente' && cred.status === 'ativo' && Number(cred.saldoKg) <= LIMIAR_RECARGA_KG);
}

// --- Persistência (KV) ------------------------------------------------------
export async function lerCredito(env, clienteId) {
  if (!env.PORTAL_KV || !clienteId) return null;
  const raw = await env.PORTAL_KV.get(`credito:${String(clienteId)}`);
  return raw ? JSON.parse(raw) : null;
}
export async function salvarCredito(env, cred) {
  if (!env.PORTAL_KV || !cred || !cred.clienteId) return cred;
  // mantém o histórico enxuto (últimos 200 lançamentos)
  if (cred.historico && cred.historico.length > 200) cred.historico = cred.historico.slice(-200);
  await env.PORTAL_KV.put(`credito:${cred.clienteId}`, JSON.stringify(cred));
  return cred;
}

// Formatação BR
export const moedaBR = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kgBR = (n) => Number(n || 0).toLocaleString('pt-BR') + ' kg';
export const tonBR = (kg) => (Number(kg || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' t';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Telas -----------------------------------------------------------------
function headLoja(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(t)}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
.top{background:#00333B;padding:16px 20px}.top .wr{max-width:960px;margin:0 auto;display:flex;align-items:center;gap:10px}
.wrap{max-width:960px;margin:0 auto;padding:22px 18px 60px}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin:8px 0 6px}
.pac{flex:1;min-width:210px;background:#fff;border:2px solid #E4EBE9;border-radius:16px;padding:18px;cursor:pointer;transition:border-color .15s,box-shadow .15s}
.pac.sel{border-color:#92C430;box-shadow:0 6px 20px rgba(146,196,48,.18)}
.pac .ton{font-size:26px;font-weight:800;color:#00333B}.pac .pr{font-size:22px;font-weight:800;margin-top:8px}.pac .un{font-size:12px;color:#7c8a87}
.seg{display:inline-flex;background:#E7EEEC;border-radius:12px;padding:4px;margin:6px 0 4px}
.seg button{border:none;background:none;padding:9px 16px;border-radius:9px;font-size:13.5px;font-weight:800;color:#4F6469;cursor:pointer}
.seg button.on{background:#fff;color:#00333B;box-shadow:0 1px 3px rgba(0,0,0,.08)}
label{display:block;font-size:12px;font-weight:700;color:#4F6469;margin:10px 0 4px}
input{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:12px;font-size:15px;font-family:inherit}
.btn{background:#92C430;color:#10262B;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:800;cursor:pointer;width:100%}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px}
</style></head>`;
}
function topoLoja() {
  return `<div class="top"><div class="wr"><span style="color:#fff;font-size:17px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Adote um Bairro</span></div></div>`;
}

export function paginaLojaAdote() {
  const cards = PACOTES.map((p) => `<div class="pac" data-id="${p.id}" data-ton="${p.ton}" data-avulso="${p.avulso}" data-recorrente="${p.recorrente}" onclick="selPac('${p.id}')">
      <div class="ton">${p.ton} ${p.ton === 1 ? 'tonelada' : 'toneladas'}</div>
      <div class="pr" id="pr_${p.id}">${moedaBR(p.avulso)}</div>
      <div class="un" id="un_${p.id}">${moedaBR(p.avulso / p.ton)} por tonelada</div>
    </div>`).join('');
  return `${headLoja('Adote um Bairro — Ecobraz')}<body>${topoLoja()}
<div class="wrap">
  <h1 style="font-size:23px;margin:6px 0 4px;color:#00333B">Contrate sua coleta por tonelada</h1>
  <p style="font-size:14px;color:#4F6469;margin:0 0 14px;line-height:1.6">Compre o peso que precisar. O valor vira <b>crédito</b> e vai sendo consumido a cada coleta — com rastreabilidade e certificado de destinação.</p>

  <div class="seg" role="tablist">
    <button id="seg_avulso" class="on" onclick="setTipo('avulso')">Avulso</button>
    <button id="seg_recorrente" onclick="setTipo('recorrente')">Recorrente −10%</button>
  </div>
  <div id="notaTipo" style="font-size:12.5px;color:#4F6469;margin-bottom:8px"></div>

  <div class="cards">${cards}</div>

  <div class="card" style="margin-top:16px">
    <div style="font-size:15px;font-weight:800;margin-bottom:4px">Seus dados</div>
    <div style="font-size:12px;color:#7c8a87;margin-bottom:6px">Para emitirmos a cobrança e agendar as coletas.</div>
    <label>Razão social / Nome da empresa</label><input id="f_razao" maxlength="120" autocomplete="organization">
    <label>CNPJ</label><input id="f_cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00">
    <div style="display:flex;gap:12px"><div style="flex:1"><label>E-mail</label><input id="f_email" type="email" autocomplete="email"></div><div style="flex:1"><label>Telefone</label><input id="f_tel" inputmode="tel" autocomplete="tel"></div></div>
    <label>Cidade / UF <span style="color:#9aa7a4;font-weight:400">(opcional)</span></label><input id="f_cidade" maxlength="80" placeholder="São Paulo / SP">
    <button class="btn" style="margin-top:16px" onclick="contratar(this)">Contratar e pagar</button>
    <div id="msg" style="font-size:13px;color:#4F6469;margin-top:12px;text-align:center"></div>
  </div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:14px">Pagamento seguro via Mercado Pago. Ao contratar, você concorda com os termos de coleta e destinação da Ecobraz.</div>
</div>
<script>
var TIPO='avulso', PAC=null;
function fmtBRL(n){return 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function setTipo(t){TIPO=t;
  document.getElementById('seg_avulso').className=(t==='avulso'?'on':'');
  document.getElementById('seg_recorrente').className=(t==='recorrente'?'on':'');
  document.getElementById('notaTipo').innerHTML = t==='recorrente' ? 'Na recorrência você tem <b>10% de desconto</b>. O crédito se renova automaticamente quando está acabando.' : 'Compra única. Quando o crédito acabar, é só comprar de novo.';
  document.querySelectorAll('.pac').forEach(function(el){
    var v=Number(el.getAttribute('data-'+t)), ton=Number(el.getAttribute('data-ton'));
    var id=el.getAttribute('data-id');
    document.getElementById('pr_'+id).textContent=fmtBRL(v);
    document.getElementById('un_'+id).textContent=fmtBRL(v/ton)+' por tonelada';
  });
}
function selPac(id){PAC=id;document.querySelectorAll('.pac').forEach(function(el){el.className='pac'+(el.getAttribute('data-id')===id?' sel':'');});}
function contratar(btn){var m=document.getElementById('msg');
  if(!PAC){m.textContent='Escolha um pacote acima.';return;}
  var body={pacoteId:PAC,tipo:TIPO,razaoSocial:v('f_razao'),cnpj:v('f_cnpj'),email:v('f_email'),telefone:v('f_tel'),cidade:v('f_cidade')};
  if(!body.razaoSocial||!body.cnpj||!body.email){m.style.color='#8a4b45';m.textContent='Preencha razão social, CNPJ e e-mail.';return;}
  btn.disabled=true;m.style.color='#4F6469';m.textContent='Gerando pagamento…';
  fetch('/api/adote/contratar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok&&j.init_point){m.textContent='Redirecionando para o pagamento…';window.location=j.init_point;}
    else{btn.disabled=false;m.style.color='#8a4b45';m.textContent=(j&&j.erro)||'Não foi possível gerar o pagamento.';}
  }).catch(function(){btn.disabled=false;m.style.color='#8a4b45';m.textContent='Sem conexão. Tente de novo.';});
}
function v(id){var el=document.getElementById(id);return el?el.value.trim():'';}
setTipo('avulso');
</script>
</body></html>`;
}

export function paginaObrigadoAdote(pedido, cred) {
  const pago = pedido && pedido.status === 'pago';
  const kg = cred ? cred.saldoKg : (pedido ? pedido.kg : 0);
  return `${headLoja('Pedido — Adote um Bairro')}<body>${topoLoja()}
<div class="wrap"><div class="card" style="text-align:center;max-width:460px;margin:20px auto">
  <div style="font-size:44px">${pago ? '✅' : '⏳'}</div>
  <h1 style="font-size:20px;margin:8px 0 6px;color:#00333B">${pago ? 'Pagamento confirmado!' : 'Recebemos seu pedido'}</h1>
  ${pago
    ? `<p style="font-size:14px;color:#4F6469;line-height:1.6">Seu crédito foi liberado. Saldo atual:</p><div style="font-size:30px;font-weight:800;color:#00333B;margin:6px 0">${kgBR(kg)}</div><p style="font-size:13px;color:#7c8a87">(${tonBR(kg)}) — nossa equipe entrará em contato para agendar as coletas.</p>`
    : `<p style="font-size:14px;color:#4F6469;line-height:1.6">Assim que o Mercado Pago confirmar o pagamento, seu crédito é liberado automaticamente. Isso costuma levar alguns instantes.</p><button class="btn" style="max-width:240px;margin:10px auto 0" onclick="location.reload()">Atualizar</button>`}
</div></div></body></html>`;
}
