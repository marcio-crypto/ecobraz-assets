// Coleta Expressa PÚBLICA (pedido do Marcio, 2026-07-30): captar a venda direto
// do site, sem login. O visitante preenche, paga R$ 55 na Stripe (cartão + Apple/
// Google Pay + boleto) e a coleta entra como ⚡ expressa (até 24h). Reaproveita a
// triagem e a liberação automática do portal (o pedido vira 'coleta' pago → o
// lead é liberado sozinho pela fulfillPedidoPago quando a Stripe confirma).
//
// SEGURANÇA: nada de segredo aqui. A cobrança é criada pela Stripe no servidor.

export function paginaColetaExpressa(env) {
  const valor = Math.max(1, Number(env && env.TAXA_COLETA_REAIS) || 55);
  const zap = String((env && env.WHATSAPP_COMERCIAL) || '5511912728412').replace(/\D/g, '');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Coleta Expressa (até 24h) — Ecobraz</title><link rel="icon" href="/assets/logo.png">
<style>
  *{box-sizing:border-box} body{margin:0;font-family:'Montserrat',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F7F6;color:#173A38}
  .wrap{max-width:560px;margin:0 auto;padding:26px 16px 60px}
  .logo{width:150px;display:block;margin:0 auto 14px}
  .hero{background:linear-gradient(90deg,#00333B,#0B5B66);color:#fff;border-radius:16px;padding:20px 20px 18px;text-align:center;margin-bottom:16px}
  .hero .flash{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#FFD46B}
  .hero h1{font-size:23px;margin:6px 0 6px} .hero p{font-size:13.5px;color:#EAF3F1;margin:0;line-height:1.5}
  .preco{font-size:30px;font-weight:800;margin-top:8px}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(11,91,102,.08);padding:20px}
  label{display:block;font-size:13px;font-weight:700;color:#3f5652;margin:12px 0 5px}
  input,textarea,select{width:100%;border:1px solid #d6e0dd;border-radius:10px;padding:12px;font-size:15px;font-family:inherit;color:#173A38;background:#fff}
  input:focus,textarea:focus,select:focus{outline:none;border-color:#0B5B66}
  .row{display:flex;gap:10px} .row>div{flex:1}
  .btn{display:block;width:100%;border:none;border-radius:12px;padding:15px;font-size:16px;font-weight:800;cursor:pointer;margin-top:18px;background:#8CC63F;color:#123;font-family:inherit}
  .btn:disabled{opacity:.6}
  .msg{margin-top:14px;font-size:13.5px;line-height:1.5;padding:12px;border-radius:10px;display:none}
  .msg.erro{display:block;background:#FBEDED;border:1px solid #f0c9c9;color:#9a3434}
  .msg.info{display:block;background:#F7FBF3;border:1px solid #e0eecb;color:#3f5652}
  .obs{font-size:12px;color:#7c8a87;margin-top:14px;line-height:1.5}
  .obs b{color:#0B5B66}
  .zap{display:block;text-align:center;margin-top:16px;color:#0B5B66;font-weight:700;text-decoration:none;font-size:13px}
</style></head><body>
<div class="wrap">
  <img class="logo" src="/assets/logo.png" alt="Ecobraz Emigre">
  <div class="hero">
    <div class="flash">⚡ Coleta Expressa</div>
    <h1>Sua coleta em até 24h</h1>
    <p>Preencha, pague a taxa e sua coleta entra na fila expressa — atendimento de um dia para o outro.</p>
    <div class="preco">R$ ${valor.toFixed(2).replace('.', ',')}</div>
  </div>
  <div class="card">
    <form id="f" onsubmit="return enviar(event)">
      <label>Nome completo *<input name="nome" autocomplete="name" required maxlength="120"></label>
      <div class="row">
        <div><label>E-mail *<input type="email" name="email" autocomplete="email" required maxlength="120"></label></div>
        <div><label>WhatsApp/Telefone *<input type="tel" name="telefone" autocomplete="tel" required maxlength="30"></label></div>
      </div>
      <label>Empresa (opcional)<input name="empresa" autocomplete="organization" maxlength="120"></label>
      <div class="row">
        <div><label>CEP *<input name="cep" inputmode="numeric" required maxlength="12"></label></div>
        <div><label>Cidade *<input name="cidade" required maxlength="80"></label></div>
      </div>
      <label>Endereço da coleta *<input name="endereco" required maxlength="200" placeholder="Rua, número, bairro, complemento"></label>
      <label>Quantos itens (aprox.)<input name="itens" inputmode="numeric" maxlength="8" placeholder="ex.: 5"></label>
      <label>O que precisa ser coletado? *<textarea name="equipamentos" rows="3" required maxlength="2000" placeholder="Ex.: 3 computadores, 2 monitores, cabos e uma impressora."></textarea></label>
      <button class="btn" id="b" type="submit">Pagar R$ ${valor.toFixed(2).replace('.', ',')} e agendar →</button>
      <div class="msg" id="m"></div>
      <div class="obs">💳 Pagamento seguro pela <b>Stripe</b> (cartão, Apple/Google Pay e boleto). Assim que aprovar, sua coleta é liberada automaticamente. Materiais que não coletamos ou que precisam de orçamento são avisados antes de qualquer cobrança.</div>
    </form>
    <a class="zap" href="https://wa.me/${zap}?text=${encodeURIComponent('Olá! Quero uma coleta expressa (até 24h).')}" target="_blank" rel="noopener">Prefere falar com a equipe? Chamar no WhatsApp →</a>
  </div>
</div>
<script>
async function enviar(e){e.preventDefault();
  var b=document.getElementById('b'), m=document.getElementById('m'), f=document.getElementById('f');
  b.disabled=true; var txt=b.textContent; b.textContent='Gerando pagamento…'; m.className='msg';
  var body={}; new FormData(f).forEach(function(v,k){body[k]=v;});
  try{
    var r=await fetch('/api/coleta-expressa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var d=await r.json();
    if(d.ok && d.link){ m.className='msg info'; m.textContent='Redirecionando para o pagamento seguro…'; window.location=d.link; return false; }
    m.className='msg erro'; m.textContent=d.message||'Não foi possível gerar o pagamento agora. Tente novamente em instantes.';
  }catch(_){ m.className='msg erro'; m.textContent='Falha de conexão. Tente novamente.'; }
  b.disabled=false; b.textContent=txt; return false;
}
</script></body></html>`;
}
