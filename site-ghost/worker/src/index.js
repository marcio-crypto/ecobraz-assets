// Worker ecobraz-coletas — recebe o formulário de /agendamento/, cria o lead no
// Ploomes (CRM) e no E-goi (marketing, se houver consentimento) e envia ao lead
// um e-mail transacional de confirmação ("recebemos sua solicitação").
//
// SEGURANÇA/COMPATIBILIDADE:
// - Segredos e variáveis vivem na Cloudflare; o deploy usa keep_vars=true e NÃO
//   os apaga.
// - O e-mail de confirmação é NÃO-FATAL e só dispara se EGOI_TRANSACTIONAL_API_KEY
//   e EGOI_SENDER_ID estiverem configurados. Sem eles, o lead é salvo igual e o
//   passo de e-mail é apenas registrado como "skipped".

const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = allowedOrigins(env);
    const cors = corsHeaders(origin, allowed);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ok:true, service:'ecobraz-coletas', version:5}, 200, cors);
    if (url.pathname !== '/api/coletas' || request.method !== 'POST') return json({ok:false, error:'not_found'}, 404, cors);
    if (!allowed.has(origin)) return json({ok:false, error:'origin_not_allowed'}, 403, cors);
    let input;
    try { input = await request.json(); } catch { return json({ok:false,error:'invalid_json'},400,cors); }
    const validation = validate(input);
    if (!validation.ok) return json({ok:false,error:'validation_failed',fields:validation.fields},422,cors);
    if (input.website) return json({ok:true}, 202, cors);
    if (env.TURNSTILE_SECRET_KEY) {
      const passed = await verifyTurnstile(input.turnstile_token, request.headers.get('CF-Connecting-IP'), env.TURNSTILE_SECRET_KEY);
      if (!passed) return json({ok:false,error:'challenge_failed'},403,cors);
    }
    const lead = normalize(input, request);
    let ploomes;
    try { ploomes = await sendToPloomes(lead, env); }
    catch (error) { console.error('ploomes_failure', safeError(error)); return json({ok:false,error:'crm_unavailable'},502,cors); }
    let egoi = {ok:false, skipped:true, existing:false};
    if (lead.marketing_consent) {
      try { egoi = await sendToEgoi(lead, env); }
      catch (error) { console.error('egoi_failure', safeError(error)); egoi = {ok:false, skipped:false, existing:false}; }
    }
    // E-mail de confirmação ao lead — NÃO-FATAL: uma falha aqui não invalida o
    // lead já registrado no CRM.
    let confirmation = {ok:false, skipped:true};
    try { confirmation = await sendConfirmationEmail(lead, env); }
    catch (error) { console.error('confirmation_email_failure', safeError(error)); confirmation = {ok:false, skipped:false}; }
    return json({ok:true, request_id:crypto.randomUUID(), crm:{ok:true,contact_id:ploomes.contactId,deal_id:ploomes.dealId}, marketing:{ok:Boolean(egoi.ok),skipped:Boolean(egoi.skipped)}, confirmation:{ok:Boolean(confirmation.ok),skipped:Boolean(confirmation.skipped)}},201,cors);
  }
};

function allowedOrigins(env) { return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(v=>v.trim()).filter(Boolean)); }
function corsHeaders(origin, allowed) { return allowed.has(origin) ? {'access-control-allow-origin':origin,'access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'content-type','vary':'Origin',...JSON_HEADERS} : JSON_HEADERS; }
function json(body,status,headers={}) { return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...headers}}); }
function validate(v) {
  const fields=[];
  if (!['empresa','pessoa_fisica'].includes(v.profile)) fields.push('profile');
  for (const key of ['name','email','phone','material_category','volume','material_description','postal_code','city','state']) if (!String(v[key]||'').trim()) fields.push(key);
  if (!/^\S+@\S+\.\S+$/.test(String(v.email||''))) fields.push('email');
  if (String(v.material_description||'').length > 4000) fields.push('material_description');
  if (v.service_consent !== 'yes') fields.push('service_consent');
  return {ok:fields.length===0,fields:[...new Set(fields)]};
}
function normalize(v, request) {
  const clean=(x,max=500)=>String(x||'').trim().slice(0,max);
  return {profile:clean(v.profile),name:clean(v.name,200),company:clean(v.company,200),email:clean(v.email,320).toLowerCase(),phone:clean(v.phone,50),material_category:clean(v.material_category,200),volume:clean(v.volume,100),material_description:clean(v.material_description,4000),postal_code:clean(v.postal_code,20),city:clean(v.city,150),state:clean(v.state,20),documentation:clean(v.documentation,250),urgency:clean(v.urgency,100),page_url:clean(v.page_url,1000),source:'website',utm_source:clean(v.utm_source,200),utm_medium:clean(v.utm_medium,200),utm_campaign:clean(v.utm_campaign,200),utm_content:clean(v.utm_content,200),utm_term:clean(v.utm_term,200),marketing_consent:v.marketing_consent==='yes',submitted_at:new Date().toISOString(),country:request.cf?.country || ''};
}
async function sendToPloomes(lead, env) {
  requireEnv(env,['PLOOMES_USER_KEY','PLOOMES_PIPELINE_ID']);
  const base=env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers={'content-type':'application/json','User-Key':env.PLOOMES_USER_KEY};
  const escaped=lead.email.replaceAll("'","''");
  const lookup=await fetch(`${base}/Contacts?$filter=Email%20eq%20'${encodeURIComponent(escaped)}'&$select=Id&$top=1`,{headers});
  if (!lookup.ok) throw new Error(`contact_lookup_${lookup.status}`);
  const existing=await lookup.json();
  let contactId=existing.value?.[0]?.Id;
  if (!contactId) {
    const contact={Name:lead.name,TypeId:2,Email:lead.email,Phones:[{PhoneNumber:lead.phone,TypeId:1}],Note:buildNote(lead)};
    const created=await apiJson(`${base}/Contacts`,{method:'POST',headers,body:JSON.stringify(contact)});
    contactId=created.value?.[0]?.Id;
  }
  if (!contactId) throw new Error('contact_id_missing');
  const deal={Title:`Solicitação de coleta - ${lead.company || lead.name}`,ContactId:contactId,PipelineId:Number(env.PLOOMES_PIPELINE_ID)};
  if (env.PLOOMES_STAGE_ID) deal.StageId=Number(env.PLOOMES_STAGE_ID);
  if (env.PLOOMES_OWNER_ID) deal.OwnerId=Number(env.PLOOMES_OWNER_ID);
  const dealCreated=await apiJson(`${base}/Deals`,{method:'POST',headers,body:JSON.stringify(deal)});
  const dealId=dealCreated.value?.[0]?.Id;
  if (!dealId) throw new Error('deal_id_missing');
  return {contactId,dealId};
}
function buildNote(l) { return [`Origem: Site Ecobraz`,`Perfil: ${l.profile}`,`Empresa: ${l.company||'-'}`,`Material: ${l.material_category}`,`Volume: ${l.volume}`,`Descrição: ${l.material_description}`,`Local: ${l.postal_code} - ${l.city}/${l.state}`,`Documentação: ${l.documentation||'-'}`,`Urgência: ${l.urgency||'-'}`,`Página: ${l.page_url||'-'}`,`UTM: ${[l.utm_source,l.utm_medium,l.utm_campaign,l.utm_content,l.utm_term].filter(Boolean).join(' | ')||'-'}`,`Consentimento marketing: ${l.marketing_consent?'Sim':'Não'}`,`Enviado em: ${l.submitted_at}`].join('\n'); }
async function sendToEgoi(lead, env) {
  requireEnv(env,['EGOI_API_KEY','EGOI_LIST_ID']);
  const base=env.EGOI_API_URL || 'https://api.egoiapp.com';
  const [first_name,...rest]=lead.name.split(/\s+/);
  const payload={base:{status:'active',first_name,last_name:rest.join(' '),email:lead.email,cellphone:normalizeBrazilPhone(lead.phone)},extra:[]};
  const response=await fetch(`${base}/lists/${encodeURIComponent(env.EGOI_LIST_ID)}/contacts`,{method:'POST',headers:{'content-type':'application/json','Apikey':env.EGOI_API_KEY},body:JSON.stringify(payload)});
  if (response.status===409) return {ok:true,skipped:false,existing:true};
  if (!response.ok) {
    const detail=await response.text();
    throw new Error(`egoi_${response.status}_${detail.slice(0,300)}`);
  }
  return {ok:true,skipped:false,existing:false};
}
// Envia o e-mail transacional de confirmação ao lead via E-goi Transacional (v2).
// Só dispara com EGOI_TRANSACTIONAL_API_KEY + EGOI_SENDER_ID configurados.
async function sendConfirmationEmail(lead, env) {
  // Usa a chave transacional dedicada se existir; senão tenta a chave do E-goi
  // que o Worker já usa (na maioria das contas é a mesma chave da conta).
  const apiKey = env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY;
  if (!apiKey || !env.EGOI_SENDER_ID) return {ok:false, skipped:true};
  const base=env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const payload={
    sender_id: env.EGOI_SENDER_ID,
    subject: 'Recebemos a sua solicitação — Ecobraz',
    to: [lead.email],
    html_body: buildConfirmationHtml(lead),
    text_body: buildConfirmationText(lead),
    open_tracking: false,
    click_tracking: false
  };
  if (env.EGOI_SENDER_NAME) payload.sender_name = env.EGOI_SENDER_NAME;
  if (env.EGOI_REPLY_TO_ID) payload.reply_to_id = env.EGOI_REPLY_TO_ID;
  const r=await fetch(`${base}/v2/email/messages/action/send`,{method:'POST',headers:{'content-type':'application/json','ApiKey':apiKey},body:JSON.stringify(payload)});
  if (!r.ok) throw new Error(`egoi_tx_${r.status}_${(await r.text()).slice(0,300)}`);
  return {ok:true, skipped:false};
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function buildConfirmationText(l) {
  const nome=(l.name||'').split(/\s+/)[0]||'';
  return [
    `Olá${nome?` ${nome}`:''}, recebemos a sua solicitação.`,
    ``,
    `Nossa equipe vai analisar as informações enviadas e entrar em contato pelo e-mail ou telefone que você informou. Não é necessário enviar novamente.`,
    ``,
    `Resumo da solicitação:`,
    `- Perfil: ${l.profile==='empresa'?'Empresa':'Pessoa física'}`,
    `- Material: ${l.material_category}`,
    `- Volume: ${l.volume}`,
    `- Local: ${l.city}/${l.state}`,
    ``,
    `Se preferir adiantar a conversa, fale com a equipe pelos canais do site ecobraz.org.`,
    ``,
    `Ecobraz Emigre — coleta e destinação de eletrônicos com rastreabilidade.`
  ].join('\n');
}
function buildConfirmationHtml(l) {
  const nome=esc((l.name||'').split(/\s+/)[0]||'');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f6;font-family:Arial,Helvetica,sans-serif;color:#0b2a2f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8e8;">
<tr><td style="background:#00333B;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;">Ecobraz Emigre</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#00333B;">Recebemos a sua solicitação${nome?`, ${nome}`:''} ✓</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Nossa equipe vai analisar as informações enviadas e entrar em contato pelo e-mail ou telefone que você informou. <strong>Não é necessário enviar novamente.</strong></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;border-radius:8px;margin:8px 0 18px;">
<tr><td style="padding:14px 16px;font-size:14px;line-height:1.7;color:#334;">
<strong style="color:#00333B;">Resumo</strong><br>
Perfil: ${esc(l.profile==='empresa'?'Empresa':'Pessoa física')}<br>
Material: ${esc(l.material_category)}<br>
Volume: ${esc(l.volume)}<br>
Local: ${esc(l.city)}/${esc(l.state)}
</td></tr></table>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#556;">Se preferir adiantar a conversa, fale com a nossa equipe pelos canais do site.</p>
<p style="margin:18px 0 0;"><a href="https://ecobraz.org/" style="display:inline-block;background:#00333B;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;">Voltar ao site</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f4f6f6;font-size:12px;color:#889;line-height:1.5;">Ecobraz Emigre — coleta e destinação de eletrônicos com rastreabilidade e documentação. Você recebeu este e-mail porque enviou uma solicitação em ecobraz.org.</td></tr>
</table></td></tr></table></body></html>`;
}
function normalizeBrazilPhone(value) { const n=String(value||'').replace(/\D/g,''); const local=n.startsWith('55')?n.slice(2):n; return `55-${local}`; }
async function apiJson(url,options) { const r=await fetch(url,options); const body=await r.text(); if (!r.ok) throw new Error(`api_${r.status}_${body.slice(0,180)}`); try{return JSON.parse(body)}catch{throw new Error('invalid_api_json')} }
function requireEnv(env,names) { const missing=names.filter(n=>!env[n]); if(missing.length) throw new Error(`missing_env_${missing.join('_')}`); }
async function verifyTurnstile(token,ip,secret) { if(!token)return false; const form=new FormData(); form.set('secret',secret); form.set('response',token); if(ip)form.set('remoteip',ip); const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form}); if(!r.ok)return false; return Boolean((await r.json()).success); }
function safeError(error) { return {name:error?.name || 'Error',message:String(error?.message || 'unknown').slice(0,240)}; }
