// Worker ecobraz-portal — Portal do Cliente (Pacote 0: fundação).
//
// O que este Worker faz (v1):
//  - Login SEM SENHA (link mágico por e-mail).
//  - Portão de acesso: só entra EMPRESA (PJ) com "Contrato Ativo?" = Sim e dentro
//    da validade (campo "Data de encerramento do contrato") no Ploomes.
//  - Painel: mostra dados do contrato, lista as OS/atendimentos do cliente (lidas
//    do Ploomes) e permite abrir um novo chamado (nova OS no Ploomes).
//
// SEGURANÇA:
//  - Segredos vivem na Cloudflare (nunca no repositório): PLOOMES_USER_KEY,
//    PORTAL_SESSION_SECRET, chaves do E-goi transacional, etc.
//  - Tokens de login e sessão são assinados (HMAC-SHA256 via Web Crypto).
//  - Cookie de sessão: HttpOnly, Secure, SameSite=Lax.
//  - Anti-enumeração: /api/auth/solicitar responde sempre a mesma coisa.
//  - Link de login é de uso único (nonce guardado no KV e apagado ao usar).
//
// AINDA A VALIDAR CONTRA O PLOOMES REAL (marcado com TODO): o mapeamento exato de
// "OS/atendimento" (hoje lê os Negócios do contato) e os rótulos de status.

const SESSAO_COOKIE = 'portal_sessao';
const SESSAO_TTL_S = 8 * 60 * 60;       // 8 horas
const LINK_TTL_S = 15 * 60;             // 15 minutos
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

import { paginaLogin, paginaPainel, paginaMensagem } from './paginas.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/health') return json({
        ok: true, service: 'ecobraz-portal', version: 3,
        // Só presença (true/false) — NUNCA os valores. Ajuda a confirmar a
        // configuração pelo navegador sem expor segredo nenhum.
        config: {
          ploomes: !!env.PLOOMES_USER_KEY,
          sessao: !!env.PORTAL_SESSION_SECRET,
          email: !!(env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY),
          baseUrl: !!env.PORTAL_BASE_URL,
          kv: !!env.PORTAL_KV,
        },
      });

      if (pathname === '/' && request.method === 'GET') return await telaInicial(request, env);
      if (pathname === '/entrar' && request.method === 'GET') return await entrarComToken(request, env, url);
      if (pathname === '/api/auth/solicitar' && request.method === 'POST') return await solicitarLink(request, env);
      if (pathname === '/api/auth/sair' && request.method === 'POST') return sair();

      // Dali para baixo, exige sessão válida.
      const sessao = await lerSessao(request, env);
      if (pathname === '/api/os' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await listarOS(sessao, env);
      }
      if (pathname === '/api/chamado' && request.method === 'POST') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await abrirChamado(request, sessao, env);
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (error) {
      console.error('erro_inesperado', safeError(error));
      return json({ ok: false, error: 'erro_interno' }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------
async function telaInicial(request, env) {
  const sessao = await lerSessao(request, env);
  if (!sessao) return html(paginaLogin());
  return html(paginaPainel({ nome: sessao.nome, email: sessao.email, dataFim: sessao.dataFim || '' }));
}

// ---------------------------------------------------------------------------
// Autenticação: solicitar link, entrar com token, ler/gravar sessão, sair
// ---------------------------------------------------------------------------
async function solicitarLink(request, env) {
  // Resposta genérica SEMPRE (anti-enumeração): não revela se o e-mail é cliente.
  const generica = json({ ok: true, message: 'Se o e-mail for de um cliente ativo, enviamos um link de acesso.' });
  let input;
  try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return generica;

  // Turnstile (anti-abuso), se configurado.
  if (env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstile(input.turnstile_token, request.headers.get('CF-Connecting-IP'), env.TURNSTILE_SECRET_KEY);
    if (!ok) return generica;
  }
  // Throttle simples por e-mail (evita spam de e-mails de login).
  if (env.PORTAL_KV) {
    const chave = `throttle:${email}`;
    const jaEnviou = await env.PORTAL_KV.get(chave);
    if (jaEnviou) { console.log('login_throttle'); return generica; } // já mandou há pouco; ignora
    await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 });
  }

  let cliente;
  try { cliente = await buscarClienteAtivo(email, env); }
  catch (error) { console.error('ploomes_lookup_falhou', safeError(error)); return generica; }

  // Só manda link se for cliente ativo e liberado. Senão, silêncio (anti-enum).
  // Logs sem dados pessoais (só o motivo e o Id da empresa) para diagnóstico.
  if (!cliente || !cliente.liberado) {
    console.log('login_barrado', { achouContato: !!cliente, liberado: cliente?.liberado || false, empresaId: cliente?.empresaId || null, temDataFim: !!cliente?.dataFim });
    return generica;
  }
  console.log('login_liberado', { empresaId: cliente.empresaId });

  const token = await criarToken({ cid: cliente.contactId, emp: cliente.empresaId, em: cliente.email, nome: cliente.nome, fim: cliente.dataFim || '', tipo: 'login' }, LINK_TTL_S, env);
  // Uso único: guarda o nonce no KV; ao usar, apaga.
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });

  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin(cliente, link, env); console.log('login_email_ok', { empresaId: cliente.empresaId }); }
  catch (error) { console.error('login_email_falhou', safeError(error)); /* não revela ao cliente */ }
  return generica;
}

async function entrarComToken(request, env, url) {
  const valor = url.searchParams.get('token') || '';
  const payload = await verificarToken(valor, env);
  if (!payload || payload.tipo !== 'login') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso na tela inicial.'), 400);

  // Uso único: consome o nonce.
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo na tela inicial.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }

  // Reconfirma no Ploomes que o contrato segue ativo AGORA (não confia só no token).
  let cliente = null;
  try { cliente = await buscarClienteAtivo(payload.em, env); }
  catch (error) { console.error('reconfirma_falhou', safeError(error)); }
  if (!cliente || !cliente.liberado) {
    return html(paginaMensagem('Acesso indisponível', 'Seu contrato pode ter expirado. Fale com a equipe da Ecobraz para renovar.'), 403);
  }

  const sessao = await criarToken({ cid: cliente.contactId, emp: cliente.empresaId, em: cliente.email, nome: cliente.nome, fim: cliente.dataFim || '', tipo: 'sessao' }, SESSAO_TTL_S, env);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': cookieSessao(sessao.valor, SESSAO_TTL_S) },
  });
}

function sair() {
  return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': cookieSessao('', 0) } });
}

async function lerSessao(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${SESSAO_COOKIE}=`));
  if (!cookie) return null;
  const valor = decodeURIComponent(cookie.slice(SESSAO_COOKIE.length + 1));
  const payload = await verificarToken(valor, env);
  if (!payload || payload.tipo !== 'sessao') return null;
  return { contactId: payload.cid, empresaId: payload.emp || payload.cid, email: payload.em, nome: payload.nome, dataFim: payload.fim };
}

function cookieSessao(valor, maxAge) {
  return `${SESSAO_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

// ---------------------------------------------------------------------------
// Ploomes: portão de acesso (contrato) e leitura/escrita de OS
// ---------------------------------------------------------------------------
// Portão de acesso. O e-mail de login costuma ser de uma PESSOA vinculada à
// empresa; o contrato ("Contrato Ativo?", campo Sim/Não 277451) fica no cadastro
// da EMPRESA. Por isso NÃO decidimos por TypeId (a convenção varia): achamos o
// contato pelo e-mail e procuramos o contrato no próprio registro E na empresa
// vinculada (CompanyId / LastCompanyId), cobrindo os dois sentidos de login.
async function buscarClienteAtivo(email, env) {
  requireEnv(env, ['PLOOMES_USER_KEY']);
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const fieldAtivo = Number(env.PLOOMES_FIELD_CONTRATO_ATIVO || 277451);
  // 366005 = "Termino de Contrato" (data que APARECE no formulário do Ploomes).
  // O 365984 ("Data de encerramento...") foi criado via API e não aparece — órfão.
  const fieldFim = Number(env.PLOOMES_FIELD_CONTRATO_FIM || 366005);

  // 1) Acha o(s) contato(s) pelo e-mail.
  const esc = email.replaceAll("'", "''");
  const url = `${base}/Contacts?$filter=Email%20eq%20'${encodeURIComponent(esc)}'&$top=5&$expand=OtherProperties`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`contacts_${r.status}`);
  const encontrados = (await r.json()).value || [];
  if (!encontrados.length) return null;

  // 2) Candidatos que podem GUARDAR o contrato: cada contato achado e a empresa
  //    vinculada a ele. Guarda os já expandidos para evitar buscas repetidas.
  const registros = new Map();
  const idsCandidatos = [];
  for (const c of encontrados) {
    registros.set(Number(c.Id), c);
    for (const id of [c.Id, c.CompanyId, c.LastCompanyId]) {
      const n = id == null ? null : Number(id);
      if (n != null && !idsCandidatos.includes(n)) idsCandidatos.push(n);
    }
  }

  // 3) Avalia cada candidato: tem o campo de contrato? está ATIVO e na validade?
  const pessoa = encontrados[0];
  let ativoValido = null;   // { reg, dataFim } — libera o acesso
  let ativoExpirado = null; // ativo porém fora da validade
  let empresaBase = null;   // 1º candidato que tem o campo (para exibir nome mesmo sem liberar)
  for (const id of idsCandidatos) {
    let reg = registros.get(id);
    if (!reg) { reg = await fetchContatoPorId(base, headers, id); if (reg) registros.set(id, reg); }
    if (!reg) continue;
    const propAtivo = acharOtherProp(reg, fieldAtivo);
    if (!propAtivo) continue;                    // não tem o campo de contrato
    empresaBase = empresaBase || reg;
    if (propAtivo.BoolValue !== true) continue;  // tem o campo, mas está "Não"
    const propFim = acharOtherProp(reg, fieldFim);
    const dataFim = propFim?.DateTimeValue || propFim?.DateValue || null;
    const naValidade = !dataFim || new Date(dataFim) >= inicioDeHoje();
    if (naValidade) { ativoValido = { reg, dataFim }; break; }
    ativoExpirado = ativoExpirado || { reg, dataFim };
  }

  const empresa = ativoValido?.reg || ativoExpirado?.reg || empresaBase || pessoa;
  const dataFim = ativoValido?.dataFim || ativoExpirado?.dataFim || null;
  return {
    contactId: pessoa.Id,      // quem fez login (pessoa vinculada, em geral)
    empresaId: empresa.Id,     // cadastro que guarda o contrato — usado nas OS/chamados
    nome: empresa.Name || pessoa.Name || '',
    email: (pessoa.Email || email).toLowerCase(),
    dataFim,
    liberado: !!ativoValido,
  };
}

async function fetchContatoPorId(base, headers, id) {
  const u = `${base}/Contacts?$filter=Id%20eq%20${Number(id)}&$top=1&$expand=OtherProperties`;
  const r = await fetch(u, { headers });
  if (!r.ok) return null;
  try { return (await r.json()).value?.[0] || null; } catch { return null; }
}

function acharOtherProp(contact, fieldId) {
  const props = Array.isArray(contact?.OtherProperties) ? contact.OtherProperties : [];
  return props.find((p) => Number(p.FieldId) === fieldId) || null;
}

async function listarOS(sessao, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  // TODO(validar): v1 lista os Negócios da EMPRESA como "atendimentos". O modelo
  // exato de OS (Documentos com "Número da OS") será refinado após teste real.
  const clienteId = Number(sessao.empresaId || sessao.contactId);
  const url = `${base}/Deals?$filter=ContactId%20eq%20${clienteId}&$top=50&$orderby=CreateDate%20desc&$select=Id,Title,StageId,StatusId,CreateDate,FinishDate`;
  const r = await fetch(url, { headers });
  if (!r.ok) { console.error('deals_erro', r.status); return json({ ok: false, error: 'ploomes_indisponivel' }, 502); }
  const linhas = ((await r.json()).value || []).map((d) => ({
    id: d.Id,
    titulo: d.Title || `Atendimento ${d.Id}`,
    status: rotuloStatus(d.StatusId),
    aberturaISO: d.CreateDate || null,
    conclusaoISO: d.FinishDate || null,
  }));
  return json({ ok: true, os: linhas });
}

async function abrirChamado(request, sessao, env) {
  let input;
  try { input = await request.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }
  const assunto = String(input?.assunto || '').trim().slice(0, 200);
  const descricao = String(input?.descricao || '').trim().slice(0, 4000);
  if (!assunto) return json({ ok: false, error: 'assunto_obrigatorio' }, 422);

  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'content-type': 'application/json', 'User-Key': env.PLOOMES_USER_KEY };
  const deal = {
    Title: `[Portal] ${assunto}`,
    ContactId: Number(sessao.empresaId || sessao.contactId),
    Note: `Chamado aberto pelo cliente no Portal.\nEmpresa: ${sessao.nome}\nE-mail: ${sessao.email}\n\n${descricao}`,
  };
  if (env.PORTAL_OS_PIPELINE_ID) deal.PipelineId = Number(env.PORTAL_OS_PIPELINE_ID); // TODO(Marcio): funil de "coletas/OS/solicitações"
  if (env.PORTAL_OS_STAGE_ID) deal.StageId = Number(env.PORTAL_OS_STAGE_ID);
  if (env.PORTAL_OS_OWNER_ID) deal.OwnerId = Number(env.PORTAL_OS_OWNER_ID);

  const r = await fetch(`${base}/Deals`, { method: 'POST', headers, body: JSON.stringify(deal) });
  const body = await r.text();
  if (!r.ok) { console.error('criar_chamado_erro', r.status, body.slice(0, 160)); return json({ ok: false, error: 'nao_foi_possivel_abrir' }, 502); }
  let dealId = null;
  try { dealId = JSON.parse(body).value?.[0]?.Id ?? null; } catch {}
  return json({ ok: true, chamado_id: dealId, message: 'Chamado aberto! Nossa equipe já recebeu.' }, 201);
}

function rotuloStatus(statusId) {
  // Aproximação amigável para o cliente. TODO(validar) conforme o funil de OS.
  switch (Number(statusId)) {
    case 1: return 'Em andamento';
    case 2: return 'Concluído';
    case 3: return 'Encerrado';
    default: return 'Em andamento';
  }
}

// ---------------------------------------------------------------------------
// E-mail de login (E-goi transacional — mesmo padrão do Worker de coletas)
// ---------------------------------------------------------------------------
let _senderId = null;
async function resolverSender(apiKey, env) {
  if (env.EGOI_SENDER_ID) return env.EGOI_SENDER_ID;
  if (_senderId) return _senderId;
  const base = env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const r = await fetch(`${base}/v2/email/senders`, { headers: { ApiKey: apiKey, accept: 'application/json' } });
  if (!r.ok) { console.error('egoi_senders_erro', { status: r.status }); return null; }
  let data; try { data = await r.json(); } catch { console.error('egoi_senders_json'); return null; }
  const list = Array.isArray(data) ? data : (data.items || data.senders || data.data || data.list || []);
  const pick = (list || []).find((x) => x && (x.sender_id || x.id || x.senderId)) || (list || [])[0];
  _senderId = pick ? (pick.sender_id || pick.id || pick.senderId) : null;
  if (!_senderId) console.error('egoi_sem_sender_na_lista', { qtd: (list || []).length });
  return _senderId;
}

async function enviarEmailLogin(cliente, link, env) {
  const apiKey = env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY;
  if (!apiKey) throw new Error('sem_chave_email');
  const senderId = await resolverSender(apiKey, env);
  if (!senderId) throw new Error('sem_remetente');
  const base = env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const payload = {
    sender_id: senderId,
    subject: 'Seu acesso ao Portal Ecobraz',
    to: [cliente.email],
    html_body: emailHtml(cliente, link),
    text_body: `Olá,\n\nUse o link abaixo para acessar o Portal Ecobraz (vale uma vez, expira em 15 minutos):\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.\n\nEcobraz`,
    open_tracking: false,
    click_tracking: false,
  };
  if (env.EGOI_SENDER_NAME) payload.sender_name = env.EGOI_SENDER_NAME;
  if (env.EGOI_REPLY_TO_ID) payload.reply_to_id = env.EGOI_REPLY_TO_ID;
  const r = await fetch(`${base}/v2/email/messages/action/send`, { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: apiKey }, body: JSON.stringify(payload) });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`egoi_tx_${r.status}:${b.slice(0, 140)}`); }
}

function emailHtml(cliente, link) {
  const nome = esc((cliente.nome || '').split(/\s+/)[0] || '');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f6;font-family:Arial,Helvetica,sans-serif;color:#0b2a2f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8e8;">
<tr><td style="background:#00333B;padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">Portal Ecobraz</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 12px;font-size:20px;color:#00333B;">Seu acesso${nome ? `, ${nome}` : ''}</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Clique no botão abaixo para entrar. O link vale <strong>uma vez</strong> e expira em <strong>15 minutos</strong>.</p>
<p style="margin:0 0 22px;"><a href="${esc(link)}" style="display:inline-block;background:#00333B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;">Entrar no Portal</a></p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#667;">Se você não pediu este acesso, ignore este e-mail.</p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f4f6f6;font-size:12px;color:#889;">Ecobraz — Portal do Cliente.</td></tr>
</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Tokens assinados (HMAC-SHA256) e utilidades
// ---------------------------------------------------------------------------
async function criarToken(dados, ttlS, env) {
  requireEnv(env, ['PORTAL_SESSION_SECRET']);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = { ...dados, n: nonce, exp: nowS() + ttlS };
  const corpo = b64urlStr(JSON.stringify(payload));
  const assinatura = await hmac(env.PORTAL_SESSION_SECRET, corpo);
  return { valor: `${corpo}.${assinatura}`, nonce };
}

async function verificarToken(valor, env) {
  if (!valor || !env.PORTAL_SESSION_SECRET) return null;
  const ponto = valor.lastIndexOf('.');
  if (ponto < 0) return null;
  const corpo = valor.slice(0, ponto);
  const assinatura = valor.slice(ponto + 1);
  const esperada = await hmac(env.PORTAL_SESSION_SECRET, corpo);
  if (!tempoConstanteIgual(assinatura, esperada)) return null;
  let payload;
  try { payload = JSON.parse(b64urlStrDecode(corpo)); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < nowS()) return null;
  return payload;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

function tempoConstanteIgual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlStr(str) { return b64url(new TextEncoder().encode(str)); }
function b64urlStrDecode(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); return new TextDecoder().decode(bytes); }

// ---------------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------------
function nowS() { return Math.floor(Date.now() / 1000); }
function inicioDeHoje() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function json(body, status = 200, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } }); }
function html(markup, status = 200) { return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function requireEnv(env, names) { const m = names.filter((n) => !env[n]); if (m.length) throw new Error(`missing_env_${m.join('_')}`); }
function safeError(e) { return { name: e?.name || 'Error', message: String(e?.message || 'unknown').slice(0, 200) }; }
async function verifyTurnstile(token, ip, secret) { if (!token) return false; const f = new FormData(); f.set('secret', secret); f.set('response', token); if (ip) f.set('remoteip', ip); const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f }); if (!r.ok) return false; return Boolean((await r.json()).success); }
