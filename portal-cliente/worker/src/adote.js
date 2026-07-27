// Adote um Bairro — PATROCÍNIO de coletas de eletrônico em bairros/comunidades (público).
//
// Modelo comercial (aprovado pela diretoria em jul/2026):
//  - A empresa PATROCINA coletas de pessoa física ("adota um bairro"). Cada coleta
//    patrocinada rende, em média, ~25 kg de eletrônico tirado da casa das pessoas —
//    o peso REAL é o da doca (número auditável).
//  - Vendido em MÓDULOS por tonelada: 1 t, 3 t, 5 t, 10 t. Compra ANUAL.
//  - O preço varia pela FAIXA DE FATURAMENTO da empresa (mesma régua do carbono).
//  - A empresa fica com CRÉDITO em kg; a cada coleta patrocinada concluída, desconta
//    do crédito o PESO DA DOCA. Isso alimenta o "termômetro de neutralidade" dela.
//  - Renovação é MANUAL (a empresa recompra o módulo quando quiser) — igual ao carbono.
//
// SEGURANÇA: a chave do Mercado Pago vive só na Cloudflare (Secret). O cartão é
// tokenizado pelo próprio Mercado Pago — o sistema NUNCA vê o número do cartão.
//
// Guardado no KV: credito:{clienteId} (saldo + histórico), credito-doc:{cnpj} → clienteId
// (para o termômetro achar o crédito pelo login) e pedido:{ref} (cada compra).

import { FAIXAS_FATURAMENTO, faixaValida, faixaPorFaturamento } from './carbono.js';

export const LIMIAR_RECARGA_KG = 20;

// Cada coleta de PESSOA FÍSICA patrocinada rende, em média, ~25 kg de eletrônico.
// Custo de referência da Ecobraz por coleta patrocinada: R$ 55 (usado só internamente).
export const COLETA_KG_MEDIO = 25;
export const CUSTO_COLETA = 55;

// Módulos (1/3/5/10 t) × faixa de faturamento. Cobrança ANUAL. Preços aprovados
// pela diretoria (jul/2026). Faixa xg (> R$ 300 mi/ano) = proposta sob medida.
// kg = coletas × 25 = toneladas × 1000. coletas = quantas coletas PF o módulo patrocina.
export const MODULOS_ADOTE = [
  { id: 't1', ton: 1, kg: 1000, coletas: 40, precos: { p: 3900, m: 4500, g: 5200, xg: null } },
  { id: 't3', ton: 3, kg: 3000, coletas: 120, precos: { p: 10900, m: 12500, g: 14500, xg: null } },
  { id: 't5', ton: 5, kg: 5000, coletas: 200, precos: { p: 16900, m: 19500, g: 22900, xg: null } },
  { id: 't10', ton: 10, kg: 10000, coletas: 400, precos: { p: 31900, m: 36900, g: 42900, xg: null } },
];
// Compat (o resto do sistema chama "pacote"): PACOTES/acharPacote apontam para os módulos.
export const PACOTES = MODULOS_ADOTE;
export const acharPacote = (id) => MODULOS_ADOTE.find((p) => p.id === id) || null;
export const acharModuloAdote = acharPacote;

// Preço de um módulo numa faixa. { valor:Number, sobConsulta:false } ou { valor:null, sobConsulta:true }.
export function precoModuloAdote(moduloId, faixaId) {
  const m = acharPacote(moduloId); if (!m) return null;
  const v = m.precos[faixaValida(faixaId) || faixaId];
  return (v == null) ? { valor: null, sobConsulta: true } : { valor: v, sobConsulta: false };
}
// Compat: devolve o número do preço na faixa (0 se sob proposta / inválido).
export function precoPacote(pac, faixaId) {
  if (!pac || !pac.precos) return 0;
  return Number(pac.precos[faixaValida(faixaId) || 'p']) || 0;
}
export { FAIXAS_FATURAMENTO, faixaValida, faixaPorFaturamento };
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };

// --- Motor de crédito (funções PURAS; fáceis de testar) --------------------
export function novoCredito(clienteId, nome, doc) {
  return { clienteId: String(clienteId), clienteNome: nome || '', doc: String(doc || '').replace(/\D/g, ''), saldoKg: 0, compradoKg: 0, coletasFeitas: 0, tipo: null, pacoteId: null, faixa: '', valorUltimo: 0, cardId: null, status: 'ativo', criadoEm: agora(), atualizadoEm: agora(), historico: [] };
}

// Registra uma COMPRA aprovada (primeira ou upgrade): soma kg e define tipo/pacote/faixa.
export function aplicarCompra(cred, pac, tipo, valor, ref, quando, faixa) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) + pac.kg);
  c.compradoKg = Math.round((Number(c.compradoKg) || 0) + pac.kg);
  c.tipo = tipo === 'recorrente' ? 'recorrente' : 'avulso';
  c.pacoteId = pac.id;
  if (faixa) c.faixa = faixaValida(faixa) || c.faixa;
  c.valorUltimo = Number(valor) || precoPacote(pac, faixa || c.faixa);
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'compra', pacote: pac.id, tipo: c.tipo, kg: pac.kg, valor: c.valorUltimo, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Registra uma RECARGA (recorrente): mesmo pacote, soma kg.
export function aplicarRecarga(cred, pac, valor, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) + pac.kg);
  c.compradoKg = Math.round((Number(c.compradoKg) || 0) + pac.kg);
  c.valorUltimo = Number(valor) || precoPacote(pac, c.faixa) || 0;
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'recarga', pacote: pac.id, kg: pac.kg, valor: c.valorUltimo, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Debita o peso (kg) de UMA coleta patrocinada concluída. Conta a coleta (para o
// termômetro). Não impede saldo negativo (a recompra cobre).
export function debitar(cred, kg, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  const q = Math.max(0, Math.round(Number(kg) || 0));
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) - q);
  c.coletasFeitas = (Number(c.coletasFeitas) || 0) + 1;
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'consumo', kg: -q, saldo: c.saldoKg, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Resumo de patrocínio de UMA empresa — alimenta o termômetro de neutralidade.
// Números FÍSICOS e reais (coletas patrocinadas concluídas, kg tirados dos bairros).
export function resumoPatrocinio(cred) {
  if (!cred) return { temCredito: false, coletasFeitas: 0, kgPatrocinado: 0, saldoKg: 0, compradoKg: 0 };
  const hist = cred.historico || [];
  const consumos = hist.filter((h) => h.evento === 'consumo');
  const kgPatrocinado = consumos.reduce((a, h) => a + Math.abs(Number(h.kg) || 0), 0);
  const coletasFeitas = Number(cred.coletasFeitas) || consumos.length;
  const compradoKg = Number(cred.compradoKg) || hist.filter((h) => h.evento === 'compra' || h.evento === 'recarga').reduce((a, h) => a + (Number(h.kg) || 0), 0);
  return { temCredito: true, coletasFeitas, kgPatrocinado, saldoKg: Number(cred.saldoKg) || 0, compradoKg };
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
  // índice por documento → o termômetro do cliente logado acha o crédito pelo CNPJ.
  const doc = String(cred.doc || '').replace(/\D/g, '');
  if (doc) { try { await env.PORTAL_KV.put(`credito-doc:${doc}`, String(cred.clienteId)); } catch { /* ok */ } }
  return cred;
}

// Acha o crédito de uma empresa pelo CNPJ (para o termômetro do cliente logado).
export async function lerCreditoPorDoc(env, doc) {
  const d = String(doc || '').replace(/\D/g, '');
  if (!env.PORTAL_KV || !d) return null;
  const clienteId = await env.PORTAL_KV.get(`credito-doc:${d}`);
  if (clienteId) return lerCredito(env, clienteId);
  return null;
}

// Empresas com crédito disponível — alimenta o seletor de "patrocínio" na coleta.
export async function listarPatrocinadores(env) {
  if (!env.PORTAL_KV) return [];
  const out = [];
  let cursor;
  do {
    const res = await env.PORTAL_KV.list({ prefix: 'credito:', cursor, limit: 1000 });
    for (const k of (res.keys || [])) {
      const raw = await env.PORTAL_KV.get(k.name);
      if (!raw) continue;
      try { const c = JSON.parse(raw); if (Number(c.saldoKg) > 0 && c.status !== 'suspenso') out.push({ clienteId: c.clienteId, nome: c.clienteNome || c.clienteId, saldoKg: c.saldoKg, tipo: c.tipo }); } catch { /* ignora */ }
    }
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  return out.sort((a, b) => b.saldoKg - a.saldoKg);
}

// Desconta o crédito da EMPRESA patrocinadora quando uma coleta patrocinada é
// validada na doca. Nunca lança; devolve o novo saldo e se precisa recarga.
export async function debitarPatrocinio(env, empresaId, kg, ref) {
  const cred = await lerCredito(env, empresaId);
  if (!cred) return { ok: false, motivo: 'sem_credito' };
  const atualizado = debitar(cred, kg, ref);
  await salvarCredito(env, atualizado);
  return { ok: true, saldoKg: atualizado.saldoKg, precisaRecarga: precisaRecarga(atualizado) };
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
.hero{background:linear-gradient(160deg,#00333B 0%,#014a45 100%);color:#fff;padding:44px 18px 40px}
.hero .in{max-width:820px;margin:0 auto}
.eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#9CE06B}
.h1{font-size:30px;line-height:1.15;font-weight:800;margin:12px 0 12px;letter-spacing:-.02em}
.lead{font-size:16px;line-height:1.6;color:#CFE3DF;margin:0 0 22px;max-width:640px}
.cta{display:inline-block;background:#92C430;color:#0d2a12;border:none;border-radius:12px;padding:15px 26px;font-size:16px;font-weight:800;cursor:pointer;text-decoration:none}
.cta:active{transform:translateY(1px)}
.sec{max-width:900px;margin:0 auto;padding:34px 18px}
.sec h2{font-size:23px;font-weight:800;color:#00333B;letter-spacing:-.02em;margin:0 0 6px;text-align:center}
.sec .sub{font-size:14px;color:#5c6f6b;text-align:center;margin:0 auto 22px;max-width:560px;line-height:1.6}
.pains{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pain{background:#fff;border:1px solid #EADFDA;border-left:4px solid #C6553F;border-radius:14px;padding:16px}
.pain .t{font-size:15px;font-weight:800;color:#00333B;margin:6px 0 4px}
.pain .d{font-size:13px;color:#5c6f6b;line-height:1.55}
.bens{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.ben{display:flex;gap:12px;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:15px}
.ben .ic{font-size:22px;flex:none}.ben .t{font-size:14.5px;font-weight:800;color:#00333B}.ben .d{font-size:12.5px;color:#5c6f6b;line-height:1.5;margin-top:2px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;counter-reset:s}
.step{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;position:relative}
.step .n{width:30px;height:30px;border-radius:50%;background:#00333B;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}
.step .t{font-size:14.5px;font-weight:800;color:#00333B;margin:10px 0 4px}.step .d{font-size:13px;color:#5c6f6b;line-height:1.5}
.faq{max-width:720px;margin:0 auto}
.faq details{background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:2px 16px;margin-bottom:10px}
.faq summary{font-size:14.5px;font-weight:700;color:#00333B;cursor:pointer;padding:14px 0;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq p{font-size:13.5px;color:#5c6f6b;line-height:1.6;margin:0 0 14px}
.impact{background:#0d2a12;color:#EAF7E0;border-radius:18px;padding:28px 22px;text-align:center}
.badge{display:inline-flex;align-items:center;gap:7px;background:#EAF3EF;color:#1E5B31;border-radius:20px;padding:7px 14px;font-size:12.5px;font-weight:700;margin:4px}
.cmp{width:100%;border-collapse:collapse;font-size:13.5px;min-width:540px}
.cmp th,.cmp td{padding:12px 14px;text-align:left;border-bottom:1px solid #EAF0EE;vertical-align:top}
.cmp thead th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#5c6f6b;font-weight:800}
.cmp .eco{background:#F1F8EC}
.cmp thead .eco{color:#3f6b1e;border-top:2px solid #92C430}
.cmp td.no{color:#a06a62}.cmp td.yes{color:#1E7A3D;font-weight:700}
.cmp td:first-child{font-weight:700;color:#10262B}
@media(max-width:720px){.pains,.bens,.steps{grid-template-columns:1fr}.h1{font-size:25px}}
</style></head>`;
}
function topoLoja() {
  return `<div class="top"><div class="wr"><span style="color:#fff;font-size:17px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Adote um Bairro</span></div></div>`;
}

export function paginaLojaAdote(faixaIni, pre) {
  const p = pre || {};
  const faixaSel = faixaValida(faixaIni) || 'p';
  const optFaixas = FAIXAS_FATURAMENTO.map((f) => `<option value="${f.id}"${f.id === faixaSel ? ' selected' : ''}>${esc(f.rotulo)}</option>`).join('');
  const modulosJson = JSON.stringify(MODULOS_ADOTE.map((m) => ({ id: m.id, ton: m.ton, coletas: m.coletas, precos: m.precos })));
  return `${headLoja('Adote um Bairro — Ecobraz')}<body>${topoLoja()}
<div class="hero"><div class="in">
  <div class="eyebrow">Adote um Bairro · Patrocínio de coletas</div>
  <div class="h1">Sua empresa financia a coleta de eletrônico na casa das pessoas — e leva a prova para o ESG.</div>
  <p class="lead">Você adota um bairro: patrocina as coletas de lixo eletrônico que quase ninguém faz (a “última milha”), recebe a documentação auditável de tudo — e cada coleta patrocinada <b>baixa o seu termômetro de emissões</b>. Impacto social real, com lastro, no nome da sua marca.</p>
  <a href="#planos" class="cta">Ver módulos e contratar →</a>
  <a href="/diagnostico" style="display:inline-block;margin-left:14px;color:#fff;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px">Ainda em dúvida? Faça o diagnóstico de 1 min →</a>
  <div style="font-size:12px;color:#9FC6C1;margin-top:16px">Destinação licenciada · Certificado com Responsável Técnico (CREA) · Rastreabilidade total</div>
</div></div>

<div class="sec">
  <h2>Por que sua empresa não pode ignorar isso</h2>
  <div class="sub">O descarte de eletrônico não é só “jogar fora”. É responsabilidade legal, risco de dados e prova para auditoria — tudo no nome da sua empresa.</div>
  <div class="pains">
    <div class="pain"><div style="font-size:22px">⚖️</div><div class="t">A responsabilidade é sua — até o fim</div><div class="d">Pela Política Nacional de Resíduos Sólidos, quem gera o resíduo responde pela destinação correta. Descarte errado vira multa, embargo e passivo ambiental no CNPJ.</div></div>
    <div class="pain"><div style="font-size:22px">🔒</div><div class="t">Seus dados saem pela porta</div><div class="d">HDs, servidores e celulares antigos guardam informação sigilosa. Sem destruição certificada, é um vazamento de dados pronto para explodir.</div></div>
    <div class="pain"><div style="font-size:22px">📉</div><div class="t">Auditoria e ESG cobram prova</div><div class="d">Clientes, investidores e certificações exigem descarte responsável documentado. Sem papelada, sua empresa perde contrato e reputação.</div></div>
  </div>
</div>

<div class="sec" style="padding-top:6px">
  <h2>Uma contratação resolve os três</h2>
  <div class="sub">Você terceiriza o problema inteiro e recebe a prova na mão.</div>
  <div class="bens">
    <div class="ben"><div class="ic">✅</div><div><div class="t">Conformidade legal</div><div class="d">Certificado de Destinação Final (CDF) e rastreabilidade via MTR — a prova que a fiscalização e a auditoria pedem.</div></div></div>
    <div class="ben"><div class="ic">🔒</div><div><div class="t">Destruição certificada de dados</div><div class="d">Equipamentos com informação sensível passam por destruição/descaracterização certificada, com comprovação. Seu sigilo protegido — e documentado.</div></div></div>
    <div class="ben"><div class="ic">🌱</div><div><div class="t">Impacto ESG de verdade</div><div class="d">Cada tonelada financia a coleta correta em bairros e comunidades. Sua marca ligada a algo que admiram.</div></div></div>
    <div class="ben"><div class="ic">♻️</div><div><div class="t">Rastreabilidade que se sustenta</div><div class="d">Do caminhão ao destino final, cada quilo é pesado, fotografado e registrado — a trilha que segura em pé numa auditoria.</div></div></div>
    <div class="ben"><div class="ic">💳</div><div><div class="t">Crédito pré-pago, sem surpresa</div><div class="d">Compra o peso que precisa e usa quando quiser. Sem mensalidade escondida, sem contrato amarrado.</div></div></div>
    <div class="ben"><div class="ic">🔁</div><div><div class="t">Crédito que vai baixando</div><div class="d">Você compra o pacote e ele vai sendo consumido a cada coleta patrocinada. Quando o crédito acabar, você decide se compra mais — sem cobrança automática, sem amarração.</div></div></div>
  </div>
</div>

<div class="sec" style="padding-top:6px">
  <h2>Como funciona</h2>
  <div class="steps">
    <div class="step"><div class="n">1</div><div class="t">Escolha e contrate</div><div class="d">Selecione o módulo (1, 3, 5 ou 10 toneladas) conforme o porte da empresa e pague com segurança.</div></div>
    <div class="step"><div class="n">2</div><div class="t">A gente coleta nos bairros</div><div class="d">A Ecobraz recolhe o eletrônico na casa das pessoas. Cada coleta é pesada, fotografada e rastreada — e desconta do seu saldo.</div></div>
    <div class="step"><div class="n">3</div><div class="t">Prova + termômetro</div><div class="d">Você recebe a documentação auditável, e cada coleta baixa o seu termômetro de carbono — pronto para o relatório de ESG.</div></div>
  </div>
</div>

<div class="sec" style="padding-top:6px">
  <div class="impact">
    <div class="eyebrow" style="color:#9CE06B">Por que “Adote um Bairro”</div>
    <h2 style="color:#fff;margin-top:10px">Você financia a coleta que faltava — e fica com a prova</h2>
    <p style="font-size:15px;line-height:1.7;color:#CFE9C7;max-width:660px;margin:8px auto 0">Recolher o eletrônico na casa de uma pessoa custa caro: é a “última milha” que quase ninguém faz — e por isso esse lixo acaba no lixão ou no desmanche informal. No Adote um Bairro, a sua empresa <b>financia essa coleta</b>. Em troca, você recebe a <b>documentação auditável</b> de tudo que foi recolhido e realiza uma ação concreta: tira o lixo eletrônico da casa das pessoas e fecha o ciclo do jeito certo. É a sua marca ligada a um impacto que dá para provar — e que ninguém mais no mercado oferece.</p>
    <div style="display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-top:22px">
      <div style="flex:1 1 240px;max-width:300px;background:rgba(255,255,255,.06);border:1px solid rgba(146,196,48,.35);border-radius:14px;padding:16px 18px;text-align:left">
        <div style="font-size:22px">🌡️</div>
        <div style="font-size:14.5px;font-weight:800;color:#fff;margin:6px 0 4px">Baixa o seu termômetro</div>
        <div style="font-size:12.5px;color:#CFE9C7;line-height:1.55">Cada coleta patrocinada é pesada na doca e entra como <b>compensação</b> no seu Painel de Carbono — puxando a sua pegada em direção à neutralidade, com lastro real (não estimativa).</div>
      </div>
      <div style="flex:1 1 240px;max-width:300px;background:rgba(255,255,255,.06);border:1px solid rgba(146,196,48,.35);border-radius:14px;padding:16px 18px;text-align:left">
        <div style="font-size:22px">📊</div>
        <div style="font-size:14.5px;font-weight:800;color:#fff;margin:6px 0 4px">Vira linha no relatório ESG</div>
        <div style="font-size:12.5px;color:#CFE9C7;line-height:1.55">O patrocínio entra como ação social e ambiental <b>documentada</b> no seu relatório de ESG — a prova que investidor, banco e auditoria pedem.</div>
      </div>
    </div>
  </div>
</div>

<div class="sec" style="padding-top:6px">
  <h2>O que só a Ecobraz entrega</h2>
  <div class="sub">Jogar no lixo comum ou chamar um sucateiro é barato — até o dia da fiscalização, do vazamento ou da auditoria. Compare o que você realmente leva para casa.</div>
  <div style="overflow-x:auto;border:1px solid #E4EBE9;border-radius:14px;background:#fff">
    <table class="cmp">
      <thead><tr><th></th><th>Descarte comum / sucateiro</th><th class="eco">Adote um Bairro · Ecobraz</th></tr></thead>
      <tbody>
        <tr><td>Certificado de Destinação Final (CDF)</td><td class="no">✗ Raramente</td><td class="eco yes">✓ Sempre, assinado por RT (CREA)</td></tr>
        <tr><td>Rastreabilidade (peso, foto, documento)</td><td class="no">✗ Não</td><td class="eco yes">✓ De ponta a ponta</td></tr>
        <tr><td>Destruição certificada de dados</td><td class="no">✗ Sem garantia</td><td class="eco yes">✓ Com comprovação</td></tr>
        <tr><td>Coleta na casa das pessoas (última milha)</td><td class="no">✗ Não existe</td><td class="eco yes">✓ Você financia e leva a prova</td></tr>
        <tr><td>Ação social e ambiental documentada</td><td class="no">✗ Não</td><td class="eco yes">✓ Sim, com evidência</td></tr>
        <tr><td>Pronto para auditoria e licitação</td><td class="no">✗ Não</td><td class="eco yes">✓ Sim</td></tr>
      </tbody>
    </table>
  </div>
  <div style="font-size:12px;color:#8fa39f;text-align:center;margin-top:10px">O barato do descarte informal cobra caro depois. A prova é o que fica.</div>
</div>

<div class="sec" id="planos" style="padding-top:10px">
  <h2>Escolha o seu módulo</h2>
  <div class="sub">Cada módulo patrocina um número de coletas na casa das pessoas (~25 kg cada). Quanto maior o módulo, menor o custo por coleta. O preço acompanha o porte da sua empresa. Você compra o pacote, ele vai baixando a cada coleta, e quando acabar você compra mais — se quiser.</div>
  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:16px">
    <label style="margin:0;font-size:13.5px;font-weight:800;color:#28413f">Faturamento anual da empresa:</label>
    <select id="fat" onchange="render()" style="padding:11px 12px;border:1px solid #CBD7D2;border-radius:10px;font:inherit;font-size:15px;background:#fff">${optFaixas}</select>
  </div>

  <div class="cards" id="cards"></div>

  <div class="card" style="margin-top:16px">
    <div style="font-size:15px;font-weight:800;margin-bottom:4px">Seus dados</div>
    <div style="font-size:12px;color:#7c8a87;margin-bottom:6px">${p.cnpj ? 'Você está logado — já preenchemos os dados da sua empresa. É só escolher o módulo e contratar.' : 'Para emitirmos a cobrança e organizar o patrocínio das coletas.'}</div>
    <label>Razão social / Nome da empresa</label><input id="f_razao" maxlength="120" autocomplete="organization" value="${esc(p.razao || '')}">
    <label>CNPJ</label><input id="f_cnpj" inputmode="numeric" maxlength="18" placeholder="00.000.000/0000-00" value="${esc(p.cnpj || '')}">
    <div style="display:flex;gap:12px"><div style="flex:1"><label>E-mail</label><input id="f_email" type="email" autocomplete="email" value="${esc(p.email || '')}"></div><div style="flex:1"><label>Telefone</label><input id="f_tel" inputmode="tel" autocomplete="tel"></div></div>
    <label>Cidade / UF <span style="color:#9aa7a4;font-weight:400">(opcional)</span></label><input id="f_cidade" maxlength="80" placeholder="São Paulo / SP">
    <button class="btn" id="btnc" style="margin-top:16px" onclick="contratar(this)">Contratar e pagar</button>
    <div id="msg" style="font-size:13px;color:#4F6469;margin-top:12px;text-align:center"></div>
  </div>
  <div style="margin-top:16px;text-align:center">
    <span class="badge">🛡️ Destinação licenciada</span><span class="badge">📄 Certificado com RT (CREA)</span><span class="badge">🌡️ Baixa o seu termômetro</span><span class="badge">🔒 Pagamento seguro (Mercado Pago)</span>
  </div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:12px">Pagamento seguro via Mercado Pago. Ao contratar, você concorda com os termos de coleta e destinação da Ecobraz.</div>
</div>

<div class="sec" style="padding-top:0">
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px 22px">
    <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#3f6b1e;text-align:center">Complete o ciclo do carbono</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px" class="funil">
      <a href="/carbono/planos" style="text-decoration:none;color:inherit;border:1px solid #E4EBE9;border-radius:12px;padding:14px 16px;display:block">
        <div style="font-size:20px">🧮</div><div style="font-size:14px;font-weight:800;color:#00333B;margin:6px 0 3px">1. Meça a pegada</div><div style="font-size:12.5px;color:#5c6f6b;line-height:1.5">Faça o inventário de carbono da sua empresa (GHG Protocol).</div></a>
      <div style="border:1px solid #cde5a6;background:#F7FBF2;border-radius:12px;padding:14px 16px">
        <div style="font-size:20px">🌱</div><div style="font-size:14px;font-weight:800;color:#00333B;margin:6px 0 3px">2. Compense (você está aqui)</div><div style="font-size:12.5px;color:#5c6f6b;line-height:1.5">Patrocine coletas e baixe o seu termômetro com lastro real.</div></div>
      <a href="/esg/planos" style="text-decoration:none;color:inherit;border:1px solid #E4EBE9;border-radius:12px;padding:14px 16px;display:block">
        <div style="font-size:20px">📄</div><div style="font-size:14px;font-weight:800;color:#00333B;margin:6px 0 3px">3. Comprove</div><div style="font-size:12.5px;color:#5c6f6b;line-height:1.5">Gere o relatório de ESG que investidor, banco e auditoria pedem.</div></a>
    </div>
  </div>
</div>

<div class="sec" style="padding-top:6px">
  <h2>Perguntas frequentes</h2>
  <div class="faq">
    <details><summary>Como o patrocínio baixa o meu termômetro de emissões?</summary><p>Cada coleta patrocinada é pesada na doca (peso real, auditável) e entra como <b>compensação</b> no seu Painel de Carbono. O número em toneladas de CO₂e só aparece como valor final depois que a <b>Villanova ESG</b> homologa o fator de conversão — até lá mostramos o dado físico real (coletas e quilos), sem inventar número. Compensação é reportada à parte do inventário, sem dupla contagem.</p></details>
    <details><summary>E se eu não usar todas as coletas do módulo?</summary><p>O crédito fica guardado no seu saldo, sem prazo de validade — as coletas patrocinadas vão sendo descontadas uma a uma, conforme acontecem, com total transparência no sistema.</p></details>
    <details><summary>Por que o preço muda conforme o faturamento?</summary><p>O módulo é o mesmo para todos; o preço acompanha o porte da empresa para ser justo. Empresas acima de R$ 300 milhões/ano recebem uma proposta sob medida.</p></details>
    <details><summary>Como comprovo que foi destinado corretamente?</summary><p>Você recebe o Certificado de Destinação Final (CDF) e a trilha de rastreabilidade de cada coleta, com assinatura do Responsável Técnico — válidos para auditoria e órgãos ambientais.</p></details>
    <details><summary>Preciso assinar contrato ou mensalidade?</summary><p>Não. Você compra o pacote uma vez; ele vai sendo consumido a cada coleta patrocinada. Quando o crédito acabar, você decide se compra mais — sem cobrança automática, sem fidelidade.</p></details>
  </div>
</div>
<script>
var MODS=${modulosJson}, SEL=null;
function brl(v){return 'R$ '+Number(v).toLocaleString('pt-BR');}
function fmtBRL(n){return 'R$ '+Number(n).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
function faixa(){return document.getElementById('fat').value;}
function render(){
  var fx=faixa();
  document.getElementById('cards').innerHTML=MODS.map(function(m){
    var p=m.precos[fx];
    var preco=(p==null)?'<div class="pr" style="font-size:19px">Sob proposta</div>':('<div class="pr">'+brl(p)+'<span style="font-size:12px;color:#7c8a87;font-weight:700"> · pacote</span></div>');
    var un=(p==null)?'<div class="un">a equipe monta uma proposta sob medida</div>':('<div class="un">'+fmtBRL(p/m.coletas)+' por coleta · '+fmtBRL(p/m.ton)+' por tonelada</div>');
    return '<div class="pac'+(SEL===m.id?' sel':'')+'" data-id="'+m.id+'" onclick="selPac(\\''+m.id+'\\')">'
      +'<div class="ton">'+m.ton+(m.ton===1?' tonelada':' toneladas')+'</div>'
      +'<div style="font-size:12.5px;color:#3f6b1e;font-weight:800;margin-top:4px">patrocina ~'+m.coletas+' coletas</div>'
      +preco+un+'</div>';
  }).join('');
  atualizaBotao();
}
function selPac(id){SEL=id;render();}
function sob(){var m=MODS.find(function(x){return x.id===SEL;});return !!(m&&m.precos[faixa()]==null);}
function atualizaBotao(){var b=document.getElementById('btnc');if(!b)return;
  var fx=faixa(), todaSob=MODS.every(function(m){return m.precos[fx]==null;});
  b.textContent=((SEL&&sob())||todaSob)?'Pedir proposta':'Contratar e pagar';}
function v(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function contratar(btn){var m=document.getElementById('msg');
  if(!SEL){m.style.color='#8a4b45';m.textContent='Escolha um módulo acima.';return;}
  var body={moduloId:SEL,faixa:faixa(),razaoSocial:v('f_razao'),cnpj:v('f_cnpj'),email:v('f_email'),telefone:v('f_tel'),cidade:v('f_cidade')};
  if(!body.razaoSocial||!body.cnpj||!body.email){m.style.color='#8a4b45';m.textContent='Preencha razão social, CNPJ e e-mail.';return;}
  btn.disabled=true;m.style.color='#4F6469';
  if(sob()){
    m.textContent='Enviando o seu pedido de proposta…';
    fetch('/api/adote/proposta',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(){
      m.style.color='#1E7A3D';m.textContent='✅ Recebido! Nossa equipe vai preparar a sua proposta e entrar em contato.';btn.disabled=false;
    }).catch(function(){btn.disabled=false;m.style.color='#8a4b45';m.textContent='Sem conexão. Tente de novo.';});
    return;
  }
  m.textContent='Gerando pagamento…';
  fetch('/api/adote/contratar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(j){
    if(j&&j.ok&&j.init_point){m.textContent='Redirecionando para o pagamento…';window.location=j.init_point;}
    else if(j&&j.proposta){m.style.color='#1E7A3D';m.textContent='✅ Recebido! Nossa equipe vai preparar a sua proposta e entrar em contato.';btn.disabled=false;}
    else{btn.disabled=false;m.style.color='#8a4b45';m.textContent=(j&&j.erro)||'Não foi possível gerar o pagamento.';}
  }).catch(function(){btn.disabled=false;m.style.color='#8a4b45';m.textContent='Sem conexão. Tente de novo.';});
}
render();
</script>
</body></html>`;
}

export function paginaDiagnostico() {
  const q = (n, titulo, opcoes) => `<div class="qcard"><div class="qtit">${n}. ${titulo}</div>${opcoes.map((o) => `<label class="opt"><input type="radio" name="q${n}" value="${o.p}"${o.f ? ` data-flag="${o.f}"` : ''}><span>${o.l}</span></label>`).join('')}</div>`;
  const quiz = [
    q(1, 'Sua empresa tem equipamentos eletrônicos parados ou obsoletos guardados (PCs, servidores, notebooks, celulares, no-breaks)?', [
      { l: 'Sim, vários', p: 2, f: 'Material acumulado sem destino definido' }, { l: 'Alguns', p: 1 }, { l: 'Nenhum', p: 0 }]),
    q(2, 'Algum desses equipamentos já armazenou dados da empresa ou de clientes?', [
      { l: 'Sim', p: 2, f: 'Dados sensíveis em equipamento sem destruição comprovada' }, { l: 'Não tenho certeza', p: 1, f: 'Você não sabe onde estão seus dados antigos' }, { l: 'Não', p: 0 }]),
    q(3, 'Quando descarta eletrônico, você recebe um Certificado de Destinação Final (o documento que comprova o destino)?', [
      { l: 'Nunca — ou não sei o que é', p: 2, f: 'Sem prova documentada de destinação correta' }, { l: 'Às vezes', p: 1 }, { l: 'Sempre', p: 0 }]),
    q(4, 'Sua empresa já foi cobrada — por cliente, auditoria, licitação ou investidor — sobre descarte responsável, ESG ou sustentabilidade?', [
      { l: 'Sim', p: 2, f: 'Pressão de ESG já batendo à porta, sem resposta pronta' }, { l: 'Ainda não, mas sinto que vem aí', p: 1 }, { l: 'Não', p: 0 }]),
    q(5, 'Hoje, para onde vai o seu lixo eletrônico?', [
      { l: 'Destinador licenciado, com documento', p: 0 }, { l: 'Sucateiro / catador comum', p: 2, f: 'Destino sem licença nem rastreabilidade' }, { l: 'Junto com o lixo comum', p: 3, f: 'Descarte irregular — risco jurídico direto' }, { l: 'Sinceramente, não sei', p: 2, f: 'Sem controle sobre o destino do seu resíduo' }]),
  ].join('');

  return `${headLoja('Termômetro de Exposição — Ecobraz')}<body>${topoLoja()}
<div class="hero" style="padding:34px 18px 26px"><div class="in">
  <div class="eyebrow">Diagnóstico gratuito · 1 minuto</div>
  <div class="h1" style="font-size:25px">Sua empresa está mais exposta do que imagina com o lixo eletrônico?</div>
  <p class="lead">Responda 5 perguntas rápidas e descubra seu nível de risco — jurídico, de dados e de reputação. Sem cadastro para ver o resultado.</p>
</div></div>
<div class="sec" id="quiz" style="padding-top:20px">
  ${quiz}
  <button class="cta" style="width:100%;margin-top:6px" onclick="calcular()">Ver meu resultado →</button>
  <div id="qmsg" style="font-size:13px;color:#8a4b45;text-align:center;margin-top:10px"></div>
  <p style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:14px">Orientação inicial baseada nas suas respostas — não substitui avaliação técnica.</p>
</div>
<div class="sec" id="resultado" style="display:none;padding-top:6px"></div>
<style>
.qcard{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px;margin-bottom:12px}
.qtit{font-size:14.5px;font-weight:800;color:#00333B;margin-bottom:10px;line-height:1.4}
.opt{display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #E4EBE9;border-radius:10px;margin-bottom:8px;cursor:pointer;font-size:14px;color:#28413f}
.opt:hover{border-color:#92C430;background:#F7FBF2}
.opt input{width:18px;height:18px;accent-color:#92C430;flex:none}
</style>
<script>
var NIVEIS=[
  {min:9,nome:'Exposição CRÍTICA',cor:'#B23A2E',bg:'#FBE9E7',txt:'Risco jurídico, de dados e de reputação — somados. Hoje, se te cobrarem, você não tem como comprovar destino correto. Isso precisa ser resolvido agora.'},
  {min:6,nome:'Exposição ALTA',cor:'#C6553F',bg:'#FBECE6',txt:'Sua empresa corre risco real: material sem destino comprovado e nenhuma prova para auditoria. É o tipo de coisa que só vira problema quando já é tarde.'},
  {min:3,nome:'Exposição MÉDIA',cor:'#8A6A16',bg:'#FFF4DE',txt:'Você tem pontos cegos. Falta principalmente a prova documentada — que é justamente o que a fiscalização e a auditoria pedem.'},
  {min:0,nome:'Exposição BAIXA',cor:'#1E5B31',bg:'#E4F3E6',txt:'Você já cuida bem disso. O Adote um Bairro te leva além: transforma o descarte correto em ação social e em dado de ESG que fortalece a sua marca.'}
];
function calcular(){
  var total=0,flags=[],faltou=false;
  for(var i=1;i<=5;i++){var sel=document.querySelector('input[name="q'+i+'"]:checked');if(!sel){faltou=true;continue;}total+=Number(sel.value);var f=sel.getAttribute('data-flag');if(f)flags.push(f);}
  if(faltou){document.getElementById('qmsg').textContent='Responda todas as 5 perguntas para ver seu resultado.';return;}
  document.getElementById('qmsg').textContent='';
  var n=NIVEIS.find(function(x){return total>=x.min;});
  var bullets=flags.length?('<ul style="margin:12px 0 0;padding-left:18px;font-size:13.5px;color:#4F6469;line-height:1.7">'+flags.map(function(f){return '<li>⚠️ '+f+'</li>';}).join('')+'</ul>'):'';
  var html='<div class="card" style="border:2px solid '+n.cor+';background:'+n.bg+'">'
    +'<div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:'+n.cor+'">Seu resultado</div>'
    +'<div style="font-size:24px;font-weight:800;color:'+n.cor+';margin:6px 0 8px">'+n.nome+'</div>'
    +'<div style="font-size:14px;color:#28413f;line-height:1.6">'+n.txt+'</div>'+bullets+'</div>'
    +'<div class="card" style="margin-top:14px;text-align:center">'
    +'<div style="font-size:16px;font-weight:800;color:#00333B;margin-bottom:6px">A Ecobraz resolve isso com prova na sua mão</div>'
    +'<div style="font-size:13.5px;color:#5c6f6b;line-height:1.6;margin-bottom:14px">Coleta, destinação licenciada e Certificado de Destinação Final. Você contrata por tonelada e ainda financia a coleta na casa das pessoas — impacto social que fortalece a sua marca.</div>'
    +'<a href="/adote#planos" class="cta">Ver planos e contratar →</a></div>';
  var r=document.getElementById('resultado');r.innerHTML=html;r.style.display='block';r.scrollIntoView({behavior:'smooth'});
}
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
