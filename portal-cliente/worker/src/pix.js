// Pix NATIVO na nossa própria página (decisão do Marcio, 2026-07-30).
// A Stripe bloqueia Pix para ONG e o checkout do Mercado Pago não oferece Pix
// nesta conta. Mas a chave Pix da Ecobraz (coleta@ecobraz.org.br, no Mercado
// Pago) recebe Pix normalmente — como qualquer chave. Então geramos aqui o
// "copia e cola" oficial do Pix (padrão EMV® / BR Code do Banco Central) com a
// chave + valor. O cliente paga pelo app do banco dele, sem entrar em conta de
// terceiro, e o dinheiro cai DIRETO na conta da Ecobraz.
//
// LIMITE HONESTO: um BR Code estático NÃO dispara confirmação automática. A
// baixa é manual (alguém confere no app do MP e marca como pago) até o Pix
// automático (via banco/gateway) estar no ar. Reconciliação pelo valor + horário
// + nome de quem pagou.
//
// SEGURANÇA: a chave Pix (um e-mail) NÃO é segredo — ela é mostrada a quem paga.
// Nada de chaves de API aqui.

// CRC16-CCITT (FALSE): polinômio 0x1021, início 0xFFFF. Exigido pelo padrão Pix.
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Campo EMV: ID (2) + tamanho (2, com zero à esquerda) + valor.
function tlv(id, valor) {
  const v = String(valor);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

// Tira acentos e caracteres não-ASCII (o padrão pede ASCII; alguns bancos
// enroscam com acento). Mantém o tamanho em bytes = nº de caracteres.
function ascii(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
}

// Monta o "copia e cola" (BR Code) estático com valor fixo.
//  chave  : chave Pix da Ecobraz (e-mail/CNPJ/telefone/aleatória)
//  nome   : nome do recebedor (máx 25, informativo — o banco mostra o titular real da chave)
//  cidade : cidade do recebedor (máx 15, informativo)
//  valor  : em reais (ex.: 55 → "55.00"); se 0/omitido, o pagador digita o valor
//  txid   : referência (máx 25 alfanum.); "***" quando não há
export function gerarPixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const key = String(chave || '').trim();
  if (!key) throw new Error('sem_chave_pix');
  const nomeSan = (ascii(nome || 'ECOBRAZ').toUpperCase().trim() || 'ECOBRAZ').slice(0, 25);
  const cidadeSan = (ascii(cidade || 'SAO PAULO').toUpperCase().trim() || 'SAO PAULO').slice(0, 15);
  const mai = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const txidSan = (String(txid || '').replace(/[^A-Za-z0-9]/g, '') || '***').slice(0, 25);
  let p = '';
  p += tlv('00', '01');            // Payload Format Indicator
  p += tlv('26', mai);             // Merchant Account Information (GUI + chave)
  p += tlv('52', '0000');          // Merchant Category Code
  p += tlv('53', '986');           // Moeda: BRL
  const n = Number(valor);
  if (n > 0) p += tlv('54', n.toFixed(2)); // Valor (opcional)
  p += tlv('58', 'BR');            // País
  p += tlv('59', nomeSan);         // Nome do recebedor
  p += tlv('60', cidadeSan);       // Cidade do recebedor
  p += tlv('62', tlv('05', txidSan)); // Additional Data (txid)
  p += '6304';                     // CRC: ID + tamanho, antes de calcular
  return p + crc16(p);
}

// Configuração da chave (via env, sem segredo). Default = chave confirmada pelo Marcio.
export function pixConfig(env) {
  return {
    chave: (env && env.PIX_CHAVE) || 'coleta@ecobraz.org.br',
    nome: (env && env.PIX_NOME) || 'ECOBRAZ',
    cidade: (env && env.PIX_CIDADE) || 'SAO PAULO',
  };
}

// Página que mostra o Pix (copia e cola) com botão de copiar. Autossuficiente
// (estilo inline) para servir tanto no teste da diretoria quanto ao cliente.
export function paginaPix({ titulo, valor, copiaECola, chave, nome, ref, voltarUrl, aviso }) {
  const e = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const valorTxt = Number(valor) > 0 ? `R$ ${Number(valor).toFixed(2).replace('.', ',')}` : 'valor a combinar';
  const alvo = voltarUrl || '/inicio';
  const cc = e(copiaECola);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${e(titulo || 'Pagar com Pix')} — Ecobraz</title><link rel="icon" href="/assets/logo.png">
<style>
  *{box-sizing:border-box} body{margin:0;font-family:'Montserrat',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F7F6;color:#173A38}
  .wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:18px;padding:28px 16px}
  .logo{width:150px;margin-top:6px}
  .card{background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(11,91,102,.10);max-width:440px;width:100%;padding:26px 22px;text-align:center}
  h1{color:#0B5B66;font-size:21px;margin:0 0 4px} .sub{color:#5b716e;font-size:13.5px;margin:0 0 18px}
  .valor{font-size:30px;font-weight:800;color:#173A38;margin:6px 0 2px}
  .rec{font-size:12.5px;color:#5b716e;margin-bottom:18px}
  .rotulo{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#8fa39f;text-align:left;margin:0 0 6px}
  .cc{word-break:break-all;background:#F0F5F4;border:1px dashed #b9d2ce;border-radius:10px;padding:12px;font-size:12px;color:#173A38;text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace;line-height:1.5;max-height:120px;overflow:auto}
  .btn{display:block;width:100%;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:800;cursor:pointer;margin-top:14px;font-family:inherit}
  .btn-primary{background:#8CC63F;color:#123} .btn-primary:active{transform:translateY(1px)}
  .ok{color:#1d8a4e;font-weight:700;font-size:13px;margin-top:10px;min-height:18px}
  .passos{text-align:left;font-size:13px;color:#3f5652;line-height:1.6;margin:20px 0 0;padding:16px;background:#F7FBF3;border:1px solid #e0eecb;border-radius:12px}
  .passos b{color:#0B5B66}
  .aviso{text-align:left;font-size:12px;color:#7a6a3a;background:#FBF6E6;border:1px solid #efe1b5;border-radius:10px;padding:10px 12px;margin-top:16px;line-height:1.5}
  .voltar{display:inline-block;margin-top:18px;color:#0B5B66;font-size:13px;font-weight:700;text-decoration:none}
</style></head><body>
<div class="wrap">
  <img class="logo" src="/assets/logo.png" alt="Ecobraz Emigre">
  <div class="card">
    <h1>${e(titulo || 'Pagar com Pix')}</h1>
    <p class="sub">Pague pelo app do seu banco — cai direto na conta da Ecobraz.</p>
    <div class="valor">${e(valorTxt)}</div>
    <div class="rec">Recebedor: <b>${e(nome || 'Ecobraz')}</b> · chave ${e(chave || '')}</div>

    <p class="rotulo">Pix copia e cola</p>
    <div class="cc" id="cc">${cc}</div>
    <button class="btn btn-primary" id="btnCopiar" type="button" onclick="copiar()">📋 Copiar código Pix</button>
    <div class="ok" id="okMsg"></div>

    <div class="passos">
      <b>Como pagar:</b><br>
      1. Toque em <b>Copiar código Pix</b> acima.<br>
      2. Abra o app do seu banco → <b>Pix</b> → <b>Pix Copia e Cola</b>.<br>
      3. Cole o código, confira o valor e o recebedor (<b>Ecobraz</b>) e confirme.
    </div>
    ${aviso ? `<div class="aviso">${e(aviso)}</div>` : ''}
    <a class="voltar" href="${e(alvo)}">← Voltar</a>
  </div>
</div>
<script>
function copiar(){
  var t=document.getElementById('cc').innerText, ok=document.getElementById('okMsg');
  function done(){ ok.textContent='✅ Código copiado! Agora é só colar no app do banco.'; var b=document.getElementById('btnCopiar'); b.textContent='✅ Copiado'; }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done).catch(sel); } else { sel(); }
  function sel(){ try{ var r=document.createRange(); r.selectNode(document.getElementById('cc')); var s=window.getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); s.removeAllRanges(); done(); }catch(_){ ok.textContent='Selecione o código acima e copie manualmente.'; } }
}
</script></body></html>`;
}
