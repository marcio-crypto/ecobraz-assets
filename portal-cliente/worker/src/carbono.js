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

// ---------------------------------------------------------------------------
// LOJA DE CARBONO — 4 níveis × faixa de faturamento, cobrança ANUAL.
// Estrutura e preços aprovados pelo Marcio (jul/2026) como PONTO DE PARTIDA de
// mercado — a refinar com a Villanova/Karina (que sabe o custo real de entrega).
// ---------------------------------------------------------------------------
export const FAIXAS_FATURAMENTO = [
  { id: 'p', rotulo: 'até R$ 5 milhões/ano', max: 5000000 },
  { id: 'm', rotulo: 'R$ 5 mi a R$ 50 mi/ano', max: 50000000 },
  { id: 'g', rotulo: 'R$ 50 mi a R$ 300 mi/ano', max: 300000000 },
  { id: 'xg', rotulo: 'acima de R$ 300 milhões/ano', max: Infinity },
];
export const NIVEIS_CARBONO = [
  { id: 'simples', nome: 'Simples', escopos: 'Escopo 2', inclui: 'Consumo de energia elétrica.', self: true, precos: { p: 590, m: 1490, g: 2990, xg: null } },
  { id: 'intermediario', nome: 'Intermediário', escopos: 'Escopos 1 e 2 + deslocamento', inclui: 'Energia + combustíveis (frota) + deslocamento dos funcionários.', self: true, precos: { p: 1490, m: 3900, g: 7900, xg: null } },
  { id: 'completo', nome: 'Completo', escopos: 'Escopos 1, 2 e 3', inclui: 'Energia + combustíveis + funcionários + cadeia de fornecedores.', self: true, precos: { p: 3900, m: 9900, g: 19900, xg: null } },
  { id: 'contratado', nome: 'Contratado', escopos: 'Completo, feito pela Villanova', inclui: 'A Villanova ESG coleta os dados e faz todo o inventário para você.', self: false, precos: { p: 9900, m: 24900, g: 49900, xg: null } },
];
export function nivelCarbono(id) { return NIVEIS_CARBONO.find((n) => n.id === id) || null; }
export function faixaValida(id) { return FAIXAS_FATURAMENTO.some((f) => f.id === id) ? id : ''; }
// Preço de um nível numa faixa. { valor:Number } ou { sobConsulta:true } (faixa >300mi).
export function precoNivel(nivelId, faixaId) {
  const nv = nivelCarbono(nivelId); if (!nv) return null;
  const v = nv.precos[faixaId];
  return (v == null) ? { valor: null, sobConsulta: true } : { valor: v, sobConsulta: false };
}
export function faixaPorFaturamento(faturamento) {
  const f = Number(faturamento) || 0;
  return (FAIXAS_FATURAMENTO.find((x) => f <= x.max) || FAIXAS_FATURAMENTO[FAIXAS_FATURAMENTO.length - 1]).id;
}

// Loja: mostra os 4 níveis com o preço da faixa escolhida. O cliente troca a faixa
// e os preços atualizam na hora. Cobrança anual. noindex por enquanto.
export function paginaLojaCarbono(faixaIni) {
  const faixaSel = faixaValida(faixaIni) || 'p';
  const optFaixas = FAIXAS_FATURAMENTO.map((f) => `<option value="${f.id}"${f.id === faixaSel ? ' selected' : ''}>${f.rotulo}</option>`).join('');
  const niveisJson = JSON.stringify(NIVEIS_CARBONO);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Planos de pegada de carbono — Ecobraz</title><link rel="icon" href="/assets/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--green:#92C430;--green-d:#74A21F;--teal:#00333B;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
.wrap{max-width:920px;margin:0 auto;padding:40px 20px 60px}
.top{display:flex;align-items:center;gap:14px;margin-bottom:22px}.top img{width:150px;height:auto}
.tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green-d);border-left:1px solid var(--line);padding-left:14px}
h1{font-size:clamp(23px,3vw,31px);color:var(--teal);letter-spacing:-.02em;margin:0 0 8px}
.sub{color:var(--muted);margin:0 0 22px}
.fatbox{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:20px;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.fatbox label{font-size:13.5px;font-weight:700}
select{padding:11px 12px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:15px;background:#fff}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.tier{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;box-shadow:0 8px 26px rgba(0,51,59,.06)}
.tier.contr{border-color:#cde5a6;background:#FBFDF9}
.tn{font-size:18px;font-weight:800;color:var(--teal)}
.te{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--green-d);margin:4px 0 10px}
.ti{font-size:13px;color:var(--muted);flex:1;margin-bottom:14px}
.tp{margin-bottom:14px}.pv{font-size:26px;font-weight:800;color:var(--ink)}.pu{font-size:12px;color:var(--muted);font-weight:700;margin-left:3px}.sob{font-size:16px;font-weight:800;color:var(--teal)}
.btn{display:block;text-align:center;text-decoration:none;min-height:46px;line-height:46px;border-radius:10px;background:var(--green);color:var(--ink);font-weight:800;font-size:14.5px}
.btn:hover{background:#A2D53E}.btn.dark{background:var(--teal);color:#fff}.btn.ghost{background:#fff;border:1px solid var(--line);color:var(--teal)}
.disc{font-size:12.5px;color:var(--muted);background:#FBFDF9;border:1px dashed var(--line);border-radius:12px;padding:13px 15px;margin-top:20px}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:26px}
</style></head><body>
<div class="wrap">
  <div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">Pegada de carbono · Planos</span></div>
  <h1>Inventário de carbono da sua empresa</h1>
  <p class="sub">Escolha o nível de análise. Você preenche os dados e a calculadora faz o resto, no padrão <b>GHG Protocol</b>. Cobrança <b>anual</b>.</p>
  <div class="fatbox"><label for="fat">Faturamento anual da empresa:</label><select id="fat" onchange="render()">${optFaixas}</select></div>
  <div class="cards" id="cards"></div>
  <div class="disc">Os preços são um <b>ponto de partida de mercado</b> e podem ser ajustados. O padrão de cálculo (GHG Protocol) e os fatores de emissão são revisados pela <b>Villanova ESG</b> antes de virar relatório oficial.</div>
  <div style="background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px 20px;margin-top:22px">
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--green-d);text-align:center">Depois de medir, complete o ciclo</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px" class="cross">
      <a href="/adote" style="text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:block"><div style="font-size:20px">🌱</div><div style="font-size:14px;font-weight:800;color:var(--teal);margin:6px 0 3px">Compense — Adote um Bairro</div><div style="font-size:12.5px;color:var(--muted);line-height:1.5">Patrocine coletas e baixe o seu termômetro com lastro real.</div></a>
      <a href="/esg/planos" style="text-decoration:none;color:inherit;border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:block"><div style="font-size:20px">📄</div><div style="font-size:14px;font-weight:800;color:var(--teal);margin:6px 0 3px">Comprove — Relatório de ESG</div><div style="font-size:12.5px;color:var(--muted);line-height:1.5">BR, UE ou Financeiro (para crédito mais barato).</div></a>
    </div>
  </div>
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
var NIVEIS=${niveisJson};
function brl(v){return 'R$ '+Number(v).toLocaleString('pt-BR');}
function render(){
  var fx=document.getElementById('fat').value;
  document.getElementById('cards').innerHTML=NIVEIS.map(function(n){
    var p=n.precos[fx];
    var preco=(p==null)?'<span class="sob">Sob proposta</span>':('<span class="pv">'+brl(p)+'</span><span class="pu">/ano</span>');
    var cta;
    if(p==null){ cta='<a class="btn ghost" href="/carbono/contato?nivel='+n.id+'&faixa='+fx+'">Pedir proposta</a>'; }
    else if(!n.self){ cta='<a class="btn dark" href="/carbono/assinar?nivel='+n.id+'&faixa='+fx+'">Contratar</a>'; }
    else { cta='<a class="btn" href="/carbono/assinar?nivel='+n.id+'&faixa='+fx+'">Assinar</a>'; }
    return '<div class="tier'+(n.self?'':' contr')+'"><div class="tn">'+n.nome+'</div><div class="te">'+n.escopos+'</div><div class="ti">'+n.inclui+'</div><div class="tp">'+preco+'</div>'+cta+'</div>';
  }).join('');
}
render();
</script></body></html>`;
}

// Contato/proposta (nível Contratado ou faixa "sob proposta") — vira um lead.
export function paginaCarbonoContato(nivel, faixa) {
  const nomeNivel = nivel ? ('Plano ' + nivel.nome) : 'Inventário de carbono';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Falar sobre carbono — Ecobraz</title><link rel="icon" href="/assets/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--green:#92C430;--green-d:#74A21F;--teal:#00333B;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
.wrap{max-width:560px;margin:0 auto;padding:40px 20px 60px}.top{display:flex;align-items:center;gap:14px;margin-bottom:22px}.top img{width:150px}
.tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--green-d);border-left:1px solid var(--line);padding-left:14px}
h1{font-size:26px;color:var(--teal);margin:0 0 8px}.sub{color:var(--muted);margin:0 0 22px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px}
label{display:block;font-size:13px;font-weight:700;margin:12px 0 6px}input,textarea{width:100%;padding:13px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:15px}
.btn{margin-top:16px;width:100%;min-height:50px;border:0;border-radius:10px;background:var(--green);color:var(--ink);font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.foot{color:var(--muted);font-size:12px;text-align:center;margin-top:22px}
</style></head><body>
<div class="wrap">
  <div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">Pegada de carbono</span></div>
  <h1>${nomeNivel}</h1>
  <p class="sub">Deixe seus dados que a equipe da Ecobraz e da Villanova ESG entra em contato para tocar o seu inventário de carbono.</p>
  <div class="card" id="card">
    <form id="f" onsubmit="return enviar(event)">
      <input type="hidden" id="nivel" value="${nivel ? nivel.id : ''}"><input type="hidden" id="faixa" value="${faixaValida(faixa) || ''}">
      <label>Empresa</label><input id="empresa" required>
      <label>Seu nome</label><input id="nome" required>
      <label>E-mail</label><input id="email" type="email" required>
      <label>Telefone / WhatsApp</label><input id="fone">
      <label>Mensagem (opcional)</label><textarea id="msg" rows="3"></textarea>
      <button class="btn" id="b" type="submit">Enviar</button>
    </form>
  </div>
  <div class="foot">Ecobraz Emigre — destinação correta, conformidade e evidências.</div>
</div>
<script>
async function enviar(e){e.preventDefault();var b=document.getElementById('b');b.disabled=true;b.textContent='Enviando…';
  var g=function(id){var el=document.getElementById(id);return el?el.value.trim():'';};
  try{await fetch('/api/carbono/contato',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nivel:g('nivel'),faixa:g('faixa'),empresa:g('empresa'),nome:g('nome'),email:g('email'),fone:g('fone'),msg:g('msg')})});}catch(_){}
  document.getElementById('card').innerHTML='<div style="text-align:center;padding:20px 0"><div style="font-size:42px">✅</div><div style="font-size:17px;font-weight:800;color:#00333B;margin-top:8px">Recebido!</div><p class="sub" style="margin-top:8px">Nossa equipe vai entrar em contato em breve.</p></div>';
  return false;
}
</script></body></html>`;
}

// Pós-pagamento: confirma (polling) e libera o preenchimento dos dados.
export function paginaCarbonoObrigado(pedidoId) {
  const pid = String(pedidoId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Pagamento — Ecobraz</title><link rel="icon" href="/assets/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>:root{--green:#92C430;--teal:#00333B;--ink:#10262B;--muted:#4F6469;--line:#DFE7E6;--soft:#F7F9F8}
*{box-sizing:border-box}body{margin:0;font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--soft);line-height:1.6}
.wrap{max-width:560px;margin:0 auto;padding:48px 20px 60px}.top{display:flex;align-items:center;gap:14px;margin-bottom:22px}.top img{width:150px}
.tag{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#74A21F;border-left:1px solid var(--line);padding-left:14px}
h2{font-size:22px;margin:6px 0 8px}.sub{color:var(--muted);margin:0}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:28px 24px;text-align:center}
.btn{display:inline-block;margin-top:16px;text-decoration:none;padding:0 22px;min-height:50px;line-height:50px;border-radius:10px;background:var(--green);color:var(--ink);font-weight:800;font-size:15px}
</style></head><body>
<div class="wrap">
  <div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">Pegada de carbono</span></div>
  <div class="card" id="card"><p class="sub" id="msg">⏳ Confirmando seu pagamento…</p></div>
</div>
<script>
var PID=${JSON.stringify(pid)},tent=0;
function fdata(iso){try{return new Date(iso).toLocaleDateString('pt-BR');}catch(e){return '';}}
function checa(){
  fetch('/api/carbono/pedido?id='+encodeURIComponent(PID)).then(function(r){return r.json();}).then(function(d){
    var card=document.getElementById('card');
    if(d.status==='pago'){
      var val=d.validade?(' Válido até <b>'+fdata(d.validade)+'</b>.'):'';
      if(d.nivel==='contratado'){ card.innerHTML='<div style="font-size:44px">✅</div><h2>Contratação confirmada!</h2><p class="sub">A <b>Villanova ESG</b> vai entrar em contato para coletar os dados e montar o seu inventário de carbono.'+val+'</p>'; }
      else { card.innerHTML='<div style="font-size:44px">✅</div><h2>Pagamento confirmado!</h2><p class="sub">Agora é só preencher os dados da sua empresa que a calculadora monta o inventário.'+val+'</p><a class="btn" href="/calculo-detalhado?nivel='+encodeURIComponent(d.nivel||'')+'&pedido='+encodeURIComponent(PID)+'">Preencher meus dados &rarr;</a>'; }
      return;
    }
    if(tent++<40){ var m=document.getElementById('msg'); if(m)m.textContent='⏳ Confirmando seu pagamento… (pode levar até 1 minuto)'; setTimeout(checa,3000); }
    else { document.getElementById('card').innerHTML='<p class="sub">Ainda não confirmou. Se você já pagou, recarregue esta página em instantes.</p>'; }
  }).catch(function(){ if(tent++<40) setTimeout(checa,3000); });
}
checa();
</script></body></html>`;
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
      <div class="cta"><b>Quer o número real?</b><br>O inventário no padrão GHG Protocol, a partir dos seus dados reais. <a href="/carbono/planos" style="display:inline-block;margin-top:8px;font-weight:800;color:var(--green-d);text-decoration:none">Ver os planos →</a></div>
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
export function paginaCalculoDetalhado(nivelId) {
  const nv = nivelCarbono(nivelId);
  const teste = !nv;
  const mostra1 = teste || nv.id !== 'simples';   // Escopo 1 (combustíveis) + Escopo 3 (viagens/deslocamento)
  const cadeia = teste || nv.id === 'completo' || nv.id === 'contratado';
  const titulo = nv ? `Inventário de carbono — nível ${nv.nome}` : 'Cálculo detalhado da sua pegada';
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
  <div class="top"><img src="/assets/logo.png" alt="Ecobraz Emigre"><span class="tag">Inventário de carbono · GHG Protocol</span></div>
  <h1>${titulo}</h1>
  <p class="sub">Informe os consumos do último ano. A calculadora faz o resto, no padrão GHG Protocol.</p>
  ${teste ? `<div class="note">🔒 Página de teste. Na versão final, ela abre após o pagamento confirmado.</div>
  <div class="card" id="paycard">
    <div class="grp">🧪 Teste de pagamento (R$ 1 · Pix real)</div>
    <p class="sub" style="margin:0 0 12px">Gera a cobrança no Mercado Pago e paga R$ 1 via Pix — é o teste do fluxo de pagamento de verdade.</p>
    <div id="paystatus"></div>
    <button class="btn" id="paybtn" type="button" onclick="pagar()">Pagar R$ 1 com Pix (teste)</button>
  </div>` : ''}
  <form id="f" onsubmit="return calc(event)">
    <div class="card">
      <div class="grp">Escopo 2 — Energia</div>
      <div class="row"><label>Energia elétrica<span class="u">kWh/ano</span></label><input id="eletricidade_kwh" inputmode="numeric" placeholder="0"></div>
      ${mostra1 ? `<div class="grp">Escopo 1 — Combustíveis (frota, geradores)</div>
      <div class="row"><label>Diesel<span class="u">L/ano</span></label><input id="diesel_litro" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>Gasolina<span class="u">L/ano</span></label><input id="gasolina_litro" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>Etanol<span class="u">L/ano</span></label><input id="etanol_litro" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>GNV<span class="u">m³/ano</span></label><input id="gnv_m3" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>GLP (gás)<span class="u">kg/ano</span></label><input id="glp_kg" inputmode="numeric" placeholder="0"></div>
      <div class="grp">Escopo 3 — Transporte e funcionários</div>
      <div class="row"><label>Viagens aéreas<span class="u">km/ano</span></label><input id="viagem_aerea_km" inputmode="numeric" placeholder="0"></div>
      <div class="row"><label>Deslocamento de funcionários<span class="u">km/ano</span></label><input id="deslocamento_km" inputmode="numeric" placeholder="0"></div>` : ''}
      ${cadeia ? `<div class="grp">Escopo 3 — Cadeia de fornecedores</div>
      <div class="note" style="margin:0 0 4px">A <b>cadeia de fornecedores</b> é consolidada com apoio da <b>Villanova ESG</b>, a partir dos dados dos seus principais fornecedores — a equipe entra em contato para levantar isso com você.</div>` : ''}
      <button class="btn" id="b" type="submit">Calcular</button>
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
function val(id){var el=document.getElementById(id);return el?el.value.replace(/\\./g,'').replace(',', '.'):'';}
async function calc(e){e.preventDefault();
  var b=document.getElementById('b');b.disabled=true;b.textContent='Calculando…';
  var campos=['eletricidade_kwh','diesel_litro','gasolina_litro','etanol_litro','gnv_m3','glp_kg','viagem_aerea_km','deslocamento_km'];
  var body={}; campos.forEach(function(c){ body[c]=val(c); });
  body.pedido=new URLSearchParams(location.search).get('pedido')||'';
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
