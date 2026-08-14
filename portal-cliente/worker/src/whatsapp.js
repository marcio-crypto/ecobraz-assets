// WhatsApp transacional pelo Gupshup (WhatsApp Business API). Pedido do Marcio (2026-07-30):
// avisar o cliente por WhatsApp nos momentos da coleta (a caminho / chegou) — melhor que
// e-mail/SMS. O Gupshup é o provedor (BSP) que a Ecobraz já usa para atender no WhatsApp.
//
// REGRA DO WHATSAPP: mensagem INICIADA pela empresa (fora da janela de 24h de atendimento)
// exige TEMPLATE APROVADO (HSM). Por isso o envio aqui é sempre por template aprovado.
//
// O ECOBRAZAPP é gerido por um PARCEIRO (ISV Sona Telecom / SONAX). O Gupshup tem mais de
// um jeito de enviar template — e qual funciona depende de como o parceiro configurou a
// chave. Como não dá para testar daqui (só o Worker na Cloudflare alcança o Gupshup), o
// envio tenta os caminhos conhecidos em cascata e para no primeiro que der certo. A tela
// de teste (/diretoria/teste-whatsapp) mostra o resultado de CADA caminho — assim um único
// teste do Marcio já revela qual caminho funciona e, se nenhum, o erro exato de cada um.
//
// ATIVAÇÃO (ação do Marcio: no Gupshup + no cofre da Cloudflare — NUNCA no chat/repo):
//   GUPSHUP_API_KEY            -> chave da API do Gupshup (parceiro/app)
//   GUPSHUP_SOURCE             -> número WhatsApp da Ecobraz (só dígitos, com DDI: 55DDDNUMERO)
//   GUPSHUP_APP                -> nome do app no Gupshup (vai no campo src.name; ex.: ECOBRAZAPP)
//   GUPSHUP_TEMPLATE_ACAMINHO  -> id do template aprovado "a caminho" (com hífens)
//   GUPSHUP_TEMPLATE_CHEGOU    -> id do template aprovado "chegou" (com hífens)
//   (opcionais) GUPSHUP_APP_ID, GUPSHUP_TEMPLATE_*_NOME, GUPSHUP_TEMPLATE_LANG
// Sem isso, o WhatsApp fica desligado e o aviso cai em SMS/e-mail (nada fica sem aviso).
//
// SEGURANÇA: nunca loga telefone nem chave — só a estratégia e o status HTTP. A tela de
// teste mostra só a RESPOSTA do Gupshup (nunca o corpo enviado, que teria o telefone).

// .trim() remove espaços/quebras de linha invisíveis que às vezes entram ao colar a
// chave no cofre — causa comum de 401 "Portal User Not Found With APIKey".
const chaveGupshup = (env) => String(env.GUPSHUP_API_KEY || '').trim();

// WhatsApp só é considerado ligado com chave + número de origem + nome do app.
export const whatsappConfigurado = (env) => !!(chaveGupshup(env) && env.GUPSHUP_SOURCE && env.GUPSHUP_APP);

// App ID do Gupshup (identificador, não é segredo). Padrão embutido; troca por GUPSHUP_APP_ID.
const APP_ID_PADRAO = '01a39217-d054-491f-8f3a-553fb4f74ce4';
const appIdDe = (env) => {
  const raw = String(env.GUPSHUP_APP_ID || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw) ? raw : APP_ID_PADRAO;
};
// src.name é o NOME do app (ex.: ECOBRAZAPP). Se vier vazio ou com o App ID (UUID) por
// engano, cai para o nome padrão — evita erro por src.name inválido.
const appNomeDe = (env) => {
  const raw = String(env.GUPSHUP_APP || '').trim();
  return (!raw || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw)) ? 'ECOBRAZAPP' : raw;
};
// Idioma do template. Os templates foram criados em Português (Brasil) = pt_BR no Meta/Gupshup.
const idiomaTpl = (env) => String(env.GUPSHUP_TEMPLATE_LANG || 'pt_BR').trim();

// NOME + ID do template de cada aviso. O endpoint v3 (formato Meta) usa o NOME; o endpoint
// antigo /template/msg usa o ID. Guardamos os dois para tentar os dois caminhos.
export function templateInfo(env, tipo) {
  if (tipo === 'a_caminho') return {
    nome: String(env.GUPSHUP_TEMPLATE_ACAMINHO_NOME || 'ecobraz_a_caminho').trim(),
    id: String(env.GUPSHUP_TEMPLATE_ACAMINHO || '').trim(),
  };
  if (tipo === 'chegou') return {
    nome: String(env.GUPSHUP_TEMPLATE_CHEGOU_NOME || 'ecobraz_chegou').trim(),
    id: String(env.GUPSHUP_TEMPLATE_CHEGOU || '').trim(),
  };
  return { nome: '', id: '' };
}
// Compat: só o nome (usado nas checagens de configuração da tela de teste).
export function templateColeta(env, tipo) { return templateInfo(env, tipo).nome; }

// Normaliza telefone para o formato do Gupshup: só dígitos, com DDI (55...).
// Aceita "(11) 95617-3707", "11956173707", "5511956173707". Devolve '' se não der.
export function telWhatsApp(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return d; // já com DDI 55
  if (d.length === 10 || d.length === 11) return '55' + d;              // BR sem DDI
  if (d.length >= 12 && d.length <= 15) return d;                       // já veio com DDI
  return '';
}

// Lê a resposta do Gupshup em texto, curta e sem lançar (nunca contém o corpo que enviamos).
async function corpoResposta(r) { try { return String(await r.text() || '').slice(0, 300); } catch { return ''; } }

// --- Estratégias de envio (cada uma devolve { estrategia, status, ok, corpo }) ---

// A) Partner API v3 — formato Meta Cloud API, template por NOME. Caminho recomendado para
//    template COM variáveis em app gerido por parceiro.
async function viaV3(env, to, info, params, lang) {
  const url = `https://partner.gupshup.io/partner/app/${encodeURIComponent(appIdDe(env))}/v3/message`;
  const template = { name: info.nome, language: { code: lang } };
  if (params && params.length) {
    template.components = [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p == null ? '' : p) })) }];
  }
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template };
  const r = await fetch(url, {
    method: 'POST',
    headers: { token: chaveGupshup(env), 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  return { estrategia: `Partner v3 (${lang})`, status: r.status, ok: r.ok, corpo: await corpoResposta(r) };
}

// B) Partner API /template/msg — formato antigo (form), template por ID.
async function viaTemplateMsg(env, to, info, params) {
  const url = `https://partner.gupshup.io/partner/app/${encodeURIComponent(appIdDe(env))}/template/msg`;
  const body = new URLSearchParams();
  const source = String(env.GUPSHUP_SOURCE || '').replace(/\D/g, '');
  if (source) body.set('source', source);
  body.set('destination', to);
  body.set('src.name', appNomeDe(env));
  body.set('template', JSON.stringify({ id: info.id, params: (params || []).map((p) => String(p == null ? '' : p)) }));
  const r = await fetch(url, {
    method: 'POST',
    headers: { token: chaveGupshup(env), 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(8000),
  });
  return { estrategia: 'Partner /template/msg (id)', status: r.status, ok: r.ok, corpo: await corpoResposta(r) };
}

// C) Self-serve api.gupshup.io — header apikey, template por ID. Funciona se a chave for de
//    conta self-serve (não de parceiro). Para app de parceiro costuma dar "Portal User Not Found".
async function viaSelfServe(env, to, info, params) {
  const url = 'https://api.gupshup.io/wa/api/v1/template/msg';
  const body = new URLSearchParams();
  const source = String(env.GUPSHUP_SOURCE || '').replace(/\D/g, '');
  body.set('channel', 'whatsapp');
  if (source) body.set('source', source);
  body.set('destination', to);
  body.set('src.name', appNomeDe(env));
  body.set('template', JSON.stringify({ id: info.id, params: (params || []).map((p) => String(p == null ? '' : p)) }));
  const r = await fetch(url, {
    method: 'POST',
    headers: { apikey: chaveGupshup(env), 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: body.toString(),
    signal: AbortSignal.timeout(8000),
  });
  return { estrategia: 'Self-serve (apikey)', status: r.status, ok: r.ok, corpo: await corpoResposta(r) };
}

// Cascata com diagnóstico: tenta as estratégias na ordem, para na primeira 2xx, registra
// todas. Devolve { ok, vencedor, motivo, detalhe, tentativas:[{estrategia,status,ok,corpo}] }.
export async function enviarWhatsAppDiag(env, telefone, tipo, params) {
  return enviarWhatsAppInfo(env, telefone, templateInfo(env, tipo), params);
}
// Envio por template QUALQUER (campanhas da Diretoria): mesma cascata, mas o template
// vem por { nome, id, lang } em vez dos dois tipos fixos da coleta.
export async function enviarWhatsAppInfo(env, telefone, info, params) {
  const key = chaveGupshup(env);
  const to = telWhatsApp(telefone);
  info = info || {};
  if (!key) return { ok: false, motivo: 'nao_configurado', tentativas: [] };
  if (!to) return { ok: false, motivo: 'telefone_invalido', tentativas: [] };
  if (!info.nome && !info.id) return { ok: false, motivo: 'sem_template', tentativas: [] };
  const lang = String(info.lang || idiomaTpl(env)).trim() || 'pt_BR';
  const langAlt = lang === 'pt_BR' ? 'pt' : (lang === 'pt' ? 'pt_BR' : '');
  const plano = [];
  // Caminho CONFIRMADO em 2026-07-30 (HTTP 202 + mensagem entregue no WhatsApp do Marcio):
  // self-serve por ID. Vai primeiro para o envio de produção ser uma chamada só.
  if (info.id) plano.push(() => viaSelfServe(env, to, info, params));
  // Fallbacks (só rodam se o self-serve falhar) — Partner API, caso a chave/config mude.
  if (info.nome) plano.push(() => viaV3(env, to, info, params, lang));
  if (info.nome && langAlt) plano.push(() => viaV3(env, to, info, params, langAlt));
  if (info.id) plano.push(() => viaTemplateMsg(env, to, info, params));
  const tentativas = [];
  for (const passo of plano) {
    let t;
    try { t = await passo(); }
    catch (e) { t = { estrategia: 'exceção', status: 0, ok: false, corpo: String((e && e.name) || 'excecao') }; }
    tentativas.push(t);
    console.error('gupshup_wa', t.estrategia, t.status); // só estratégia + status (nunca tel/chave)
    if (t.ok) return { ok: true, vencedor: t.estrategia, tentativas };
  }
  const ult = tentativas[tentativas.length - 1] || {};
  return { ok: false, motivo: 'http_' + (ult.status || 0), detalhe: ult.corpo || '', tentativas };
}

// Envio de produção: mesma cascata, resposta enxuta { ok, via | motivo }. Nunca lança —
// o chamador (avisarColeta) decide o fallback para SMS/e-mail.
export async function enviarWhatsAppTemplate(env, telefone, tipo, params) {
  try {
    const r = await enviarWhatsAppDiag(env, telefone, tipo, params);
    return r.ok ? { ok: true, via: r.vencedor } : { ok: false, motivo: r.motivo, detalhe: r.detalhe };
  } catch (e) { console.error('gupshup_wa_erro', String((e && e.name) || 'erro')); return { ok: false, motivo: 'excecao' }; }
}

// Diagnóstico: lista os templates reais do app no Gupshup (nome + id + status + idioma +
// corpo), para conferir configuração e para a tela de CAMPANHAS escolher o template.
// Tenta a Partner API e, se a chave for self-serve (o caminho confirmado do envio), cai
// para a listagem self-serve por nome do app.
const mapaTpl = (t) => ({
  id: t.id || t.templateId || '',
  nome: t.elementName || t.templateName || t.name || '',
  status: String(t.status || t.templateStatus || ''),
  idioma: t.languageCode || t.language || t.locale || '',
  corpo: String(t.data || t.templateData || t.body || '').slice(0, 1200),
});
const extrairTpls = (txt) => {
  let data = null; try { data = JSON.parse(txt); } catch { data = null; }
  const arr = Array.isArray(data) ? data : ((data && (data.templates || data.data || data.templateList || data.template)) || []);
  return (Array.isArray(arr) ? arr : []).map(mapaTpl).filter((t) => t.id || t.nome);
};
export async function listarTemplatesGupshup(env) {
  const key = chaveGupshup(env);
  const appId = appIdDe(env);
  if (!key || !appId) return { ok: false, motivo: 'nao_configurado', tentativas: [] };
  const tentativas = [];
  const semChave = (t) => String(t || '').split(key).join('▮▮▮').slice(0, 220);
  const caminhos = [
    // Self-serve primeiro: é a MESMA credencial do envio que funciona (apikey).
    { via: 'self-serve lista', url: `https://api.gupshup.io/sm/api/v1/template/list/${encodeURIComponent(appNomeDe(env))}`, headers: { apikey: key, accept: 'application/json' } },
    { via: 'self-serve wa/app', url: `https://api.gupshup.io/wa/app/${encodeURIComponent(appId)}/template`, headers: { apikey: key, accept: 'application/json' } },
    { via: 'partner token', url: `https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/templates`, headers: { token: key, accept: 'application/json' } },
  ];
  for (const c of caminhos) {
    try {
      const r = await fetch(c.url, { method: 'GET', headers: c.headers, signal: AbortSignal.timeout(8000) });
      const txt = await r.text();
      const tpls = r.ok ? extrairTpls(txt) : [];
      tentativas.push({ via: c.via, status: r.status, achou: tpls.length, corpoInicio: semChave(txt) });
      if (tpls.length) return { ok: true, via: c.via, templates: tpls, tentativas };
    } catch (e) {
      tentativas.push({ via: c.via, status: 0, achou: 0, corpoInicio: String((e && e.name) || 'excecao') });
    }
  }
  console.error('gupshup_tpls_erro', tentativas.map((t) => `${t.via} ${t.status}`).join(' · '));
  return { ok: false, motivo: 'sem_listagem', tentativas };
}
