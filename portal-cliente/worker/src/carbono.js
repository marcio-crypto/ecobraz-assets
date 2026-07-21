// Calculadora de Pegada de Carbono — Nível 1 (estimativa GRÁTIS por CNPJ).
//
// O que é: a partir do CNPJ, o sistema consulta o CNAE (setor) e o porte da
// empresa (API pública BrasilAPI) e devolve uma ESTIMATIVA GROSSEIRA de emissões
// anuais (faixa em tCO₂e). É a "isca" do funil — o cálculo real (Nível 2, pago)
// exige os dados do cliente (energia, combustível etc.), no padrão GHG Protocol.
//
// ⚠️ HONESTIDADE (ler antes de usar como algo mais que demonstração):
//  - Os FATORES por setor abaixo são uma PRIMEIRA VERSÃO ILUSTRATIVA, para
//    demonstrar o motor. NÃO são fatores validados. Antes de virar produto de
//    verdade, precisam de curadoria/validação de um especialista de carbono
//    (ver VISAO-E-ROADMAP §4.4 e §5.4).
//  - Por isso devolvemos uma FAIXA (min–máx), nunca um número de falsa precisão,
//    e a tela avisa em letras claras que é "estimativa".

// Intensidade ilustrativa por grande setor (tCO₂e por funcionário por ano).
// Chave = "divisão" CNAE (2 primeiros dígitos do cnae_fiscal). Valores propositalmente
// redondos e conservadores; a curadoria real virá com o especialista.
const INTENSIDADE_PESADA = 60;  // indústrias intensivas (química, cimento, metalurgia, papel, petróleo)
const DIVISOES_PESADAS = new Set([17, 19, 20, 23, 24]);

function intensidadePorDivisao(div) {
  if (div >= 1 && div <= 3) return 8;      // agropecuária
  if (div >= 5 && div <= 9) return 40;     // indústrias extrativas (mineração)
  if (DIVISOES_PESADAS.has(div)) return INTENSIDADE_PESADA;
  if (div >= 10 && div <= 33) return 20;   // demais indústrias de transformação
  if (div === 35) return 50;               // eletricidade e gás
  if (div >= 36 && div <= 39) return 15;   // água, esgoto, resíduos
  if (div >= 41 && div <= 43) return 12;   // construção
  if (div >= 45 && div <= 47) return 5;    // comércio
  if (div >= 49 && div <= 53) return 25;   // transporte e logística
  if (div >= 55 && div <= 56) return 8;    // alojamento e alimentação
  if (div >= 58 && div <= 63) return 3;    // informação e comunicação / TI
  if (div >= 64 && div <= 82) return 2.5;  // finanças, imobiliário, serviços profissionais/administrativos
  if (div >= 84 && div <= 88) return 4;    // administração pública, educação, saúde
  if (div >= 90 && div <= 99) return 3;    // artes, outros serviços
  return 5;                                // desconhecido / padrão
}

// Faixa de funcionários por porte (proxy de tamanho — o CNPJ não traz o nº real).
function bandaFuncionariosPorPorte(porteTexto) {
  const p = String(porteTexto || '').toUpperCase();
  if (p.includes('MICRO') || p.includes('MEI')) return { min: 2, max: 9, rotulo: 'Microempresa' };
  if (p.includes('PEQUEN')) return { min: 10, max: 49, rotulo: 'Pequeno porte' };
  if (p.includes('DEMAIS') || p.includes('MEDIO') || p.includes('MÉDIO') || p.includes('GRANDE')) {
    return { min: 50, max: 250, rotulo: 'Médio/grande porte' };
  }
  return { min: 5, max: 50, rotulo: 'Porte não informado' };
}

function rotuloSetor(div) {
  if (div >= 1 && div <= 3) return 'Agropecuária';
  if (div >= 5 && div <= 9) return 'Indústria extrativa';
  if (DIVISOES_PESADAS.has(div)) return 'Indústria intensiva';
  if (div >= 10 && div <= 33) return 'Indústria de transformação';
  if (div === 35) return 'Energia e gás';
  if (div >= 36 && div <= 39) return 'Saneamento e resíduos';
  if (div >= 41 && div <= 43) return 'Construção';
  if (div >= 45 && div <= 47) return 'Comércio';
  if (div >= 49 && div <= 53) return 'Transporte e logística';
  if (div >= 55 && div <= 56) return 'Alojamento e alimentação';
  if (div >= 58 && div <= 63) return 'Informação, comunicação e TI';
  if (div >= 64 && div <= 82) return 'Serviços e finanças';
  if (div >= 84 && div <= 88) return 'Administração, educação e saúde';
  if (div >= 90 && div <= 99) return 'Serviços diversos';
  return 'Setor geral';
}

// Núcleo PURO (sem rede) — testável localmente. Recebe o código CNAE fiscal e o
// texto de porte; devolve a faixa estimada em tCO₂e/ano e os rótulos.
export function estimativaPorSetor(cnaeFiscal, porteTexto) {
  const cnae = Number(cnaeFiscal) || 0;
  const div = Math.floor(cnae / 100000); // 2 primeiros dígitos de um código de 7 dígitos
  const intensidade = intensidadePorDivisao(div);
  const banda = bandaFuncionariosPorPorte(porteTexto);
  const min = Math.round(intensidade * banda.min);
  const max = Math.round(intensidade * banda.max);
  return {
    setor: rotuloSetor(div),
    divisaoCnae: div,
    porteRotulo: banda.rotulo,
    intensidadePorFuncionario: intensidade,
    faixaFuncionarios: { min: banda.min, max: banda.max },
    estimativaTonCO2eAno: { min, max },
  };
}

// Limpa o CNPJ para 14 dígitos.
export function limparCnpj(bruto) {
  return String(bruto || '').replace(/\D/g, '').slice(0, 14);
}

function esperar(ms) { return new Promise((res) => setTimeout(res, ms)); }

// Orquestra: consulta o CNPJ (BrasilAPI) + calcula a estimativa. Devolve objeto
// simples (o index.js embrulha em JSON). Nunca lança — sempre retorna {ok:...}.
export async function estimativaCarbono(cnpjBruto, env) {
  const cnpj = limparCnpj(cnpjBruto);
  if (cnpj.length !== 14) {
    return { ok: false, error: 'cnpj_invalido', message: 'Informe um CNPJ válido (14 dígitos).' };
  }
  const base = env.BRASILAPI_URL || 'https://brasilapi.com.br/api/cnpj/v1';
  const headers = { accept: 'application/json', 'user-agent': 'EcobrazPortal/1.0 (+https://ecobraz.org)' };
  let dados = null, ultimoStatus = 0, detalhe = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(`${base}/${cnpj}`, { headers });
      ultimoStatus = r.status;
      if (r.status === 404) return { ok: false, error: 'cnpj_nao_encontrado', message: 'CNPJ não encontrado na base pública.' };
      if (r.ok) { dados = await r.json(); break; }
      detalhe = (await r.text().catch(() => '')).slice(0, 140);
      // 5xx e 429 costumam ser passageiros — espera um pouco e tenta de novo.
      if (r.status >= 500 || r.status === 429) { await esperar(500 * (tentativa + 1)); continue; }
      break; // outros 4xx não adianta repetir
    } catch (e) {
      detalhe = String(e?.message || 'erro').slice(0, 140);
      await esperar(500 * (tentativa + 1));
    }
  }
  if (!dados) {
    // status/detalhe são temporários, só para diagnóstico (não há segredo aqui).
    return { ok: false, error: 'consulta_indisponivel', status: ultimoStatus, detalhe,
      message: 'A consulta de CNPJ está indisponível agora. Tente novamente em instantes.' };
  }

  // Leitura DEFENSIVA dos campos (o formato exato pode variar entre versões da API).
  const razaoSocial = dados.razao_social || dados.nome_fantasia || dados.company?.name || '';
  const cnaeFiscal = dados.cnae_fiscal || dados.cnae_fiscal_principal || dados.primary_activity?.id || 0;
  const cnaeDescricao = dados.cnae_fiscal_descricao || dados.primary_activity?.text || '';
  const porte = dados.porte || dados.descricao_porte || dados.codigo_porte || '';
  const uf = dados.uf || dados.estado || '';
  const municipio = dados.municipio || dados.cidade || '';

  const est = estimativaPorSetor(cnaeFiscal, porte);

  return {
    ok: true,
    empresa: { cnpj, razaoSocial, cnae: cnaeFiscal, cnaeDescricao, porte, uf, municipio },
    estimativa: est,
    nivel: 1,
    disclaimer:
      'Estimativa GROSSEIRA, baseada apenas no setor (CNAE) e no porte da empresa. ' +
      'Serve para dar uma ordem de grandeza — não é um inventário. O cálculo detalhado ' +
      '(GHG Protocol, a partir dos seus dados reais de energia, combustível etc.) é o próximo passo.',
  };
}

// ---------------------------------------------------------------------------
// NÍVEL 2 — cálculo detalhado (GHG Protocol) + preço por porte
// ---------------------------------------------------------------------------
// ⚠️ Os fatores abaixo são valores de REFERÊNCIA (IPCC/GHG Protocol / fator SIN),
// para o motor funcionar. Antes do uso comercial de verdade, precisam ser
// confirmados/atualizados com o especialista (o do SIN muda a cada ano).
// Unidade interna: kgCO₂e; converte para tCO₂e no fim.
const FATORES_GHG = {
  eletricidade_kwh: 0.0817, // Escopo 2 — fator médio do SIN (MCTI). ATUALIZAR com o valor oficial do ano.
  diesel_litro: 2.60,       // Escopo 1 — combustão
  gasolina_litro: 2.30,
  etanol_litro: 1.50,       // parte biogênica; simplificado
  gnv_m3: 2.00,
  glp_kg: 3.00,
  viagem_aerea_km: 0.15,    // Escopo 3 — simplificado (por passageiro)
  deslocamento_km: 0.12,    // Escopo 3 — deslocamento de funcionários
};

// Núcleo PURO (sem rede) — testável localmente. Recebe consumos anuais, devolve tCO₂e por escopo.
export function calculoDetalhadoGHG(inputs) {
  const n = (v) => Math.max(0, Number(v) || 0);
  const i = inputs || {};
  const esc1 =
    n(i.diesel_litro) * FATORES_GHG.diesel_litro +
    n(i.gasolina_litro) * FATORES_GHG.gasolina_litro +
    n(i.etanol_litro) * FATORES_GHG.etanol_litro +
    n(i.gnv_m3) * FATORES_GHG.gnv_m3 +
    n(i.glp_kg) * FATORES_GHG.glp_kg;
  const esc2 = n(i.eletricidade_kwh) * FATORES_GHG.eletricidade_kwh;
  const esc3 =
    n(i.viagem_aerea_km) * FATORES_GHG.viagem_aerea_km +
    n(i.deslocamento_km) * FATORES_GHG.deslocamento_km;
  const t = (kg) => Math.round((kg / 1000) * 100) / 100; // kg → t (2 casas)
  return {
    escopo1TCO2e: t(esc1),
    escopo2TCO2e: t(esc2),
    escopo3TCO2e: t(esc3),
    totalTCO2e: t(esc1 + esc2 + esc3),
  };
}

// Preço do Nível 2 por porte (decisão 2026-07-20): Micro/Pequena R$290, Média R$690,
// Grande → Nível 3. ATENÇÃO: o porte do CNPJ não separa "média" de "grande" (ambos = "Demais");
// uso o capital social como sinal auxiliar de "grande" (limiar a validar).
export function precoNivel2(porteTexto, capitalSocial) {
  const p = String(porteTexto || '').toUpperCase();
  const cap = Number(capitalSocial) || 0;
  if (cap >= 10000000) return { valor: null, rotulo: 'Grande', encaminhar: 'nivel3' };
  if (p.includes('MICRO') || p.includes('MEI') || p.includes('PEQUEN')) return { valor: 290, rotulo: 'Micro/Pequena' };
  return { valor: 690, rotulo: 'Média' }; // "Demais"/médio (grande sem capital alto cai aqui por ora)
}

// Página pública (Nível 1). Enxuta e com a marca Ecobraz Emigre. noindex por enquanto.
export function paginaCalculadora() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Estimativa de pegada de carbono — Ecobraz</title>
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--green:#92C430;--green-d:#74A21F;--teal:#00333B;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
.wrap{max-width:640px;margin:0 auto;padding:40px 20px 60px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:26px}
.top img{width:150px;height:auto}
.tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green-d);border-left:1px solid var(--line);padding-left:14px}
h1{font-size:clamp(24px,3.2vw,32px);color:var(--teal);letter-spacing:-.02em;margin:0 0 8px}
.sub{color:var(--muted);margin:0 0 26px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px;box-shadow:0 10px 34px rgba(0,51,59,.07)}
label{display:block;font-size:13px;font-weight:700;margin:0 0 7px}
input{width:100%;padding:14px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:16px}
input:focus{outline:3px solid rgba(146,196,48,.22);border-color:var(--green)}
.btn{margin-top:16px;width:100%;min-height:52px;border:0;border-radius:10px;background:var(--green);color:var(--ink);font:inherit;font-weight:800;font-size:15px;cursor:pointer;transition:.18s}
.btn:hover{background:#A2D53E}.btn:disabled{opacity:.6;cursor:default}
#res{margin-top:22px;display:none}
.res-emp{font-weight:800;color:var(--teal);font-size:18px}
.res-meta{color:var(--muted);font-size:13.5px;margin:2px 0 18px}
.big{background:var(--teal);color:#fff;border-radius:14px;padding:20px 22px;text-align:center}
.big .n{font-size:32px;font-weight:800;letter-spacing:-.02em;display:block;line-height:1.1}
.big .u{color:#bfe08a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.disc{font-size:12.5px;color:var(--muted);background:#FBFDF9;border:1px dashed var(--line);border-radius:12px;padding:13px 15px;margin-top:16px}
.cta{margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:12px;background:#F0F7EC}
.cta b{color:var(--teal)}.cta .soon{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--green-d);background:#EAF5D9;border-radius:999px;padding:3px 10px;margin-left:6px}
.err{margin-top:18px;color:#8a2b2b;background:#fbeded;border:1px solid #f0cccc;border-radius:10px;padding:12px 14px;font-size:14px;display:none}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:26px}
</style></head><body>
<div class="wrap">
  <div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">Pegada de carbono</span></div>
  <h1>Estimativa da sua pegada de carbono</h1>
  <p class="sub">Digite o CNPJ da empresa e veja uma primeira ordem de grandeza das emissões anuais — grátis, em segundos.</p>
  <div class="card">
    <form id="f" onsubmit="return calc(event)">
      <label for="cnpj">CNPJ da empresa</label>
      <input id="cnpj" inputmode="numeric" autocomplete="off" placeholder="00.000.000/0000-00" required>
      <button class="btn" id="b" type="submit">Ver estimativa grátis</button>
    </form>
    <div class="err" id="err"></div>
    <div id="res">
      <div class="res-emp" id="emp"></div>
      <div class="res-meta" id="meta"></div>
      <div class="big"><span class="n" id="faixa"></span><span class="u">toneladas de CO₂e por ano (estimado)</span></div>
      <div class="disc" id="disc"></div>
      <div class="cta"><b>Quer o número real?</b><span class="soon">em breve</span><br>O cálculo detalhado no padrão GHG Protocol, a partir dos seus dados, é o próximo passo.</div>
    </div>
  </div>
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
function fmt(n){return (Math.round(n)).toLocaleString('pt-BR');}
async function calc(e){e.preventDefault();
  var b=document.getElementById('b'),err=document.getElementById('err'),res=document.getElementById('res');
  err.style.display='none';res.style.display='none';b.disabled=true;b.textContent='Consultando…';
  try{
    var cnpj=document.getElementById('cnpj').value.replace(/\\D/g,'');
    var r=await fetch('/api/carbono/estimativa?cnpj='+encodeURIComponent(cnpj));
    var d=await r.json();
    if(!d.ok){ err.textContent=d.message||'Não foi possível calcular agora.'; err.style.display='block'; }
    else{
      document.getElementById('emp').textContent=d.empresa.razaoSocial||'Empresa';
      document.getElementById('meta').textContent=[d.estimativa.setor, d.empresa.cnaeDescricao, d.estimativa.porteRotulo].filter(Boolean).join(' · ');
      document.getElementById('faixa').textContent=fmt(d.estimativa.estimativaTonCO2eAno.min)+' – '+fmt(d.estimativa.estimativaTonCO2eAno.max);
      document.getElementById('disc').textContent=d.disclaimer;
      res.style.display='block';
    }
  }catch(_){ err.textContent='Falha de conexão. Tente novamente.'; err.style.display='block'; }
  b.disabled=false;b.textContent='Ver estimativa grátis';
  return false;
}
</script></body></html>`;
}

// Página do formulário GHG (Nível 2). Por ora PÚBLICA para teste; na versão final
// ela abre só depois do pagamento confirmado.
export function paginaCalculoDetalhado() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Cálculo detalhado de pegada de carbono — Ecobraz</title>
<link rel="icon" href="/assets/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--green:#92C430;--green-d:#74A21F;--teal:#00333B;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
.wrap{max-width:680px;margin:0 auto;padding:40px 20px 60px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:22px}.top img{width:150px;height:auto}
.tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green-d);border-left:1px solid var(--line);padding-left:14px}
h1{font-size:clamp(23px,3vw,30px);color:var(--teal);letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--muted);margin:0 0 24px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 10px 34px rgba(0,51,59,.07);margin-bottom:16px}
.grp{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--green-d);margin:8px 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.grp:first-child{margin-top:0}
.row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:9px 0}
.row label{font-size:14px;font-weight:600;flex:1}.row .u{font-size:12px;color:var(--muted);margin-left:4px}
.row input{width:150px;padding:11px 12px;border:1px solid #CBD7D2;border-radius:9px;font:inherit;font-size:15px;text-align:right}
.row input:focus{outline:3px solid rgba(146,196,48,.22);border-color:var(--green)}
.btn{margin-top:8px;width:100%;min-height:52px;border:0;border-radius:10px;background:var(--green);color:var(--ink);font:inherit;font-weight:800;font-size:15px;cursor:pointer;transition:.18s}
.btn:hover{background:#A2D53E}.btn:disabled{opacity:.6}
.res{display:none}
.scopes{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:6px 0 14px}
.sc{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:14px;text-align:center}
.sc .n{display:block;font-size:22px;font-weight:800;color:var(--teal)}.sc .l{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.total{background:var(--teal);color:#fff;border-radius:14px;padding:20px;text-align:center}
.total .n{font-size:34px;font-weight:800;letter-spacing:-.02em;display:block;line-height:1}.total .u{color:#bfe08a;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}
.disc{font-size:12.5px;color:var(--muted);background:#FBFDF9;border:1px dashed var(--line);border-radius:12px;padding:13px 15px;margin-top:16px}
.note{font-size:12.5px;color:var(--muted);background:#EAF5D9;border:1px solid #cde5a6;border-radius:10px;padding:11px 14px;margin-bottom:16px}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:22px}
@media(max-width:520px){.scopes{grid-template-columns:1fr}.row input{width:120px}}
</style></head><body>
<div class="wrap">
  <div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">Cálculo detalhado · GHG Protocol</span></div>
  <h1>Cálculo detalhado da sua pegada</h1>
  <p class="sub">Informe os consumos do último ano. Quanto mais campos preencher, mais preciso fica o resultado.</p>
  <div class="note">🔒 Página de teste. Na versão final, ela abre automaticamente após o pagamento confirmado.</div>
  <div class="card" id="paycard">
    <div class="grp">🧪 Teste de pagamento (R$ 1 · Pix real)</div>
    <p class="sub" style="margin:0 0 12px">Gera a cobrança no Mercado Pago e paga R$ 1 via Pix — é o teste do fluxo de pagamento de verdade.</p>
    <div id="paystatus"></div>
    <button class="btn" id="paybtn" type="button" onclick="pagar()">Pagar R$ 1 com Pix (teste)</button>
  </div>
  <form id="f" onsubmit="return calc(event)">
    <div class="card">
      <div class="grp">Escopo 2 — Energia</div>
      <div class="row"><label>Energia elétrica<span class="u">kWh/ano</span></label><input id="eletricidade_kwh" inputmode="numeric" placeholder="0"></div>
      <div class="grp">Escopo 1 — Combustíveis (frota, geradores)</div>
      <div class="row"><label>Diesel<span class="u">L/ano</span></label><input id="diesel_litro" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>Gasolina<span class="u">L/ano</span></label><input id="gasolina_litro" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>Etanol<span class="u">L/ano</span></label><input id="etanol_litro" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>GNV<span class="u">m³/ano</span></label><input id="gnv_m3" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>GLP (gás)<span class="u">kg/ano</span></label><input id="glp_kg" inputmode="numeric" placeholder="0"></div>
      <div class="grp">Escopo 3 — Outros (opcional)</div>
      <div class="row"><label>Viagens aéreas<span class="u">km/ano</span></label><input id="viagem_aerea_km" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>Deslocamento de funcionários<span class="u">km/ano</span></label><input id="deslocamento_km" inputmode="numeric" placeholder="0"></div>
      <button class="btn" id="b" type="submit">Calcular pegada detalhada</button>
    </div>
  </form>
  <div class="card res" id="res">
    <div class="scopes">
      <div class="sc"><span class="n" id="s1">0</span><span class="l">Escopo 1</span></div>
      <div class="sc"><span class="n" id="s2">0</span><span class="l">Escopo 2</span></div>
      <div class="sc"><span class="n" id="s3">0</span><span class="l">Escopo 3</span></div>
    </div>
    <div class="total"><span class="n" id="stotal">0</span><span class="u">toneladas de CO₂e por ano (total)</span></div>
    <div class="disc">Cálculo pelo padrão <b>GHG Protocol</b> a partir dos dados que você informou. Os fatores de emissão usados são de referência e devem ser revisados por especialista antes de uso em relatório oficial. Não substitui um inventário verificado por terceiro.</div>
  </div>
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
function nf(n){return (Math.round(n*100)/100).toLocaleString('pt-BR');}
function val(id){return document.getElementById(id).value.replace(/\\./g,'').replace(',', '.');}
async function calc(e){e.preventDefault();
  var b=document.getElementById('b');b.disabled=true;b.textContent='Calculando…';
  var campos=['eletricidade_kwh','diesel_litro','gasolina_litro','etanol_litro','gnv_m3','glp_kg','viagem_aerea_km','deslocamento_km'];
  var body={}; campos.forEach(function(c){ body[c]=val(c); });
  try{
    var r=await fetch('/api/carbono/detalhado',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    var d=await r.json();
    if(d.ok){
      document.getElementById('s1').textContent=nf(d.resultado.escopo1TCO2e);
      document.getElementById('s2').textContent=nf(d.resultado.escopo2TCO2e);
      document.getElementById('s3').textContent=nf(d.resultado.escopo3TCO2e);
      document.getElementById('stotal').textContent=nf(d.resultado.totalTCO2e);
      document.getElementById('res').style.display='block';
      document.getElementById('res').scrollIntoView({behavior:'smooth'});
    }
  }catch(_){}
  b.disabled=false;b.textContent='Calcular pegada detalhada';
  return false;
}
async function pagar(){
  var b=document.getElementById('paybtn'),s=document.getElementById('paystatus');
  b.disabled=true;b.textContent='Gerando cobrança…';
  try{
    var r=await fetch('/api/carbono/pagar',{method:'POST'});
    var d=await r.json();
    if(d.ok&&d.init_point){ window.location.href=d.init_point; return; }
    s.innerHTML='<div class="disc">Não foi possível gerar a cobrança agora.'+(d.detalhe?'<br><small style="word-break:break-all">'+d.detalhe+'</small>':' Tente de novo.')+'</div>';
  }catch(_){ s.innerHTML='<div class="disc">Falha de conexão.</div>'; }
  b.disabled=false;b.textContent='Pagar R$ 1 com Pix (teste)';
}
(function(){
  var p=new URLSearchParams(location.search).get('pedido');
  if(!p) return;
  var s=document.getElementById('paystatus'),b=document.getElementById('paybtn'),t=0;
  function checa(){
    fetch('/api/carbono/pedido?id='+encodeURIComponent(p)).then(function(r){return r.json();}).then(function(d){
      if(d.status==='pago'){ s.innerHTML='<div class="disc" style="background:#EAF5D9;border-color:#cde5a6;color:#3f6d12">✅ Pagamento confirmado! O cálculo detalhado está liberado abaixo.</div>'; if(b)b.style.display='none'; }
      else if(t++<20){ s.innerHTML='<div class="disc">⏳ Aguardando a confirmação do pagamento…</div>'; setTimeout(checa,3000); }
      else { s.innerHTML='<div class="disc">Ainda não confirmou. Se você pagou, recarregue em instantes.</div>'; }
    }).catch(function(){ if(t++<20) setTimeout(checa,3000); });
  }
  checa();
})();
</script></body></html>`;
}
