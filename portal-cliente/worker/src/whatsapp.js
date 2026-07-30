// WhatsApp transacional pelo Gupshup (WhatsApp Business API). Pedido do Marcio (2026-07-30):
// avisar o cliente por WhatsApp nos momentos da coleta (a caminho / chegou) — melhor que
// e-mail/SMS. O Gupshup é o provedor (BSP) que a Ecobraz já usa para atender no WhatsApp.
//
// REGRA DO WHATSAPP: mensagem INICIADA pela empresa (fora da janela de 24h de atendimento)
// exige TEMPLATE APROVADO (HSM). Por isso o envio aqui é sempre por template aprovado.
//
// ATIVAÇÃO (ação do Marcio: no Gupshup + no cofre da Cloudflare — NUNCA no chat/repo):
//   GUPSHUP_API_KEY            -> chave da API do Gupshup
//   GUPSHUP_SOURCE             -> número WhatsApp da Ecobraz (só dígitos, com DDI: 55DDDNUMERO)
//   GUPSHUP_APP                -> nome do app no Gupshup (vai no campo src.name)
//   GUPSHUP_TEMPLATE_ACAMINHO  -> id do template aprovado do aviso "a caminho"
//   GUPSHUP_TEMPLATE_CHEGOU    -> id do template aprovado do aviso "chegou"
// Sem isso, o WhatsApp fica desligado e o aviso cai em SMS/e-mail (nada fica sem aviso).
//
// SEGURANÇA: nunca loga telefone nem chave — só o status HTTP.

// .trim() remove espaços/quebras de linha invisíveis que às vezes entram ao colar a
// chave no cofre — causa comum de 401 "Portal User Not Found With APIKey".
const chaveGupshup = (env) => String(env.GUPSHUP_API_KEY || '').trim();

// WhatsApp só é considerado ligado com chave + número de origem + nome do app.
export const whatsappConfigurado = (env) => !!(chaveGupshup(env) && env.GUPSHUP_SOURCE && env.GUPSHUP_APP);

// Id do template aprovado para cada tipo de aviso (fica no cofre/env).
export function templateColeta(env, tipo) {
  if (tipo === 'a_caminho') return String(env.GUPSHUP_TEMPLATE_ACAMINHO || '').trim();
  if (tipo === 'chegou') return String(env.GUPSHUP_TEMPLATE_CHEGOU || '').trim();
  return '';
}

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

// Envia um template aprovado pelo Gupshup. params = array de strings (variáveis {{1}}, {{2}}...).
// Devolve { ok, motivo }. Nunca lança — o chamador decide o fallback (SMS/e-mail).
// O ECOBRAZAPP é gerenciado por um PARCEIRO (ISV Sona Telecom / SONAX). Para app com
// parceiro, o envio é pela PARTNER API do Gupshup: endpoint por App ID + header
// Authorization com a chave (não o header apikey do self-serve). O App ID não é segredo
// (é um identificador); fica com um padrão embutido e pode ser trocado por GUPSHUP_APP_ID.
const APP_ID_PADRAO = '01a39217-d054-491f-8f3a-553fb4f74ce4';
export async function enviarWhatsAppTemplate(env, telefone, templateId, params) {
  const key = chaveGupshup(env);
  // App ID tem que ser um UUID; se GUPSHUP_APP_ID vier vazio/errado, usa o padrão certo.
  const appIdRaw = String(env.GUPSHUP_APP_ID || '').trim();
  const appId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(appIdRaw) ? appIdRaw : APP_ID_PADRAO;
  const source = String(env.GUPSHUP_SOURCE || '').replace(/\D/g, '');
  // src.name é o NOME do app (ex.: ECOBRAZAPP). Se GUPSHUP_APP vier vazio ou com o App ID
  // (UUID) por engano, cai para o nome padrão — evita o 400 por src.name inválido.
  const appRaw = String(env.GUPSHUP_APP || '').trim();
  const appName = (!appRaw || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(appRaw)) ? 'ECOBRAZAPP' : appRaw;
  const to = telWhatsApp(telefone);
  if (!key || !appId) return { ok: false, motivo: 'nao_configurado' };
  if (!templateId) return { ok: false, motivo: 'sem_template' };
  if (!to) return { ok: false, motivo: 'telefone_invalido' };
  // Partner API: header 'token' (não Authorization) e corpo SEM 'channel' — igual ao
  // exemplo oficial: source + destination + src.name + template.
  const body = new URLSearchParams();
  if (source) body.set('source', source);
  body.set('destination', to);
  if (appName) body.set('src.name', appName);
  body.set('template', JSON.stringify({ id: templateId, params: (params || []).map((p) => String(p == null ? '' : p)) }));
  const urlPartner = `https://partner.gupshup.io/partner/app/${encodeURIComponent(appId)}/template/msg`;
  try {
    const r = await fetch(urlPartner, {
      method: 'POST',
      headers: { token: key, 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true };
    let detalhe = ''; try { detalhe = String(await r.text() || '').slice(0, 260); } catch { detalhe = ''; }
    console.error('gupshup_wa_status', r.status); // só o status — nunca telefone/chave
    return { ok: false, motivo: 'http_' + r.status, detalhe, enviado: `URL: ${urlPartner}  ||  ${body.toString()}` };
  } catch (e) { console.error('gupshup_wa_erro', String((e && e.name) || 'erro')); return { ok: false, motivo: 'excecao' }; }
}
