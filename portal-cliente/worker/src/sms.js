// SMS transacional pelo e-Goi (Slingshot). Pedido do Marcio (2026-07-30): avisar o
// cliente por SMS nos momentos da coleta (a caminho / chegou). Reaproveita a conta e
// a chave do e-Goi que já existem no cofre — sem abrir provedor novo.
//
// ATIVAÇÃO (no e-Goi, ação do Marcio): 1) ativar o serviço transacional (Slingshot);
// 2) ter CRÉDITOS de SMS; 3) ter um REMETENTE (sender) aprovado. Depois, colocar o
// nome do remetente no cofre como EGOI_SMS_SENDER — só então o SMS liga. Sem isso,
// o sistema manda o aviso por e-mail (reserva), então nada fica sem aviso.
//
// SEGURANÇA: usa a chave já existente (EGOI_TRANSACTIONAL_API_KEY / EGOI_API_KEY).
// Nunca loga telefone nem chave — só o status HTTP.

const chaveEgoi = (env) => env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY || '';

// SMS só é considerado ligado quando há chave E um remetente definido (ativação
// deliberada). Assim não tentamos mandar SMS que falharia por falta de sender.
export const smsConfigurado = (env) => !!(chaveEgoi(env) && env.EGOI_SMS_SENDER);

// Normaliza telefone BR para E.164 (+55DDDNÚMERO). Aceita "(11) 95617-3707",
// "11956173707", "5511956173707", etc. Devolve '' se não der para normalizar.
export function telE164(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12 && d.length <= 13) return '+' + d;
  if (d.length === 10 || d.length === 11) return '+55' + d; // fixo (10) ou celular (11) BR
  if (d.length >= 12 && d.length <= 15) return '+' + d;     // já veio com DDI
  return '';
}

// Envia 1 SMS. Devolve { ok, motivo }. Nunca lança — o chamador decide o fallback.
export async function enviarSMS(env, telefone, texto) {
  const key = chaveEgoi(env);
  const from = String(env.EGOI_SMS_SENDER || '').trim().slice(0, 11);
  const to = telE164(telefone);
  if (!key || !from) return { ok: false, motivo: 'nao_configurado' };
  if (!to) return { ok: false, motivo: 'telefone_invalido' };
  if (!texto) return { ok: false, motivo: 'sem_texto' };
  try {
    const r = await fetch('https://slingshot.egoiapp.com/api/v2/sms/messages/action/send/single', {
      method: 'POST',
      headers: { Apikey: key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ to, from, textBody: String(texto).slice(0, 459) }),
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return { ok: true };
    console.error('egoi_sms_status', r.status); // só o status — nunca telefone/chave
    return { ok: false, motivo: 'http_' + r.status };
  } catch (e) { console.error('egoi_sms_erro', String((e && e.name) || 'erro')); return { ok: false, motivo: 'excecao' }; }
}
