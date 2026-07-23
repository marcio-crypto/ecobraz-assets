// Login com Google (OAuth 2.0 / OpenID Connect) para o time interno da Ecobraz.
// Ativa automaticamente quando GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET estiverem nos segredos
// da Cloudflare. Autentica QUEM é a pessoa (e-mail Google verificado); a AUTORIZAÇÃO do papel
// continua vindo das listas do sistema (OPERACAO_EMAILS / ENG_EMAILS / DIRETORIA_EMAILS).
//
// Fluxo: botão "Entrar com Google" -> /auth/google?ctx=<papel> -> Google -> /auth/google/callback
// -> troca o code por tokens -> lê o e-mail verificado -> o index cria a sessão do papel.

const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function hmac(secret, data) {
  const k = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, TE.encode(data))));
}
export function googleConfigurado(env) { return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET); }
// Botão "Entrar com Google" (mostrado só quando o login Google está configurado).
export function botaoGoogle(ctx) {
  const g = '<svg width="18" height="18" viewBox="0 0 48 48" style="flex:none"><path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/><path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"/><path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/></svg>';
  return `<a href="/auth/google?ctx=${ctx}" style="display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;border:1px solid #DADCE0;border-radius:12px;padding:13px;font-size:14px;font-weight:700;color:#3c4043;text-decoration:none;background:#fff">${g}Entrar com Google</a>
  <div style="text-align:center;font-size:11px;color:#9aa7a4;margin:12px 0 4px">ou entre pelo link por e-mail</div>`;
}
function baseUrl(env, url) { return String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, ''); }
function redirectUri(env, url) { return baseUrl(env, url) + '/auth/google/callback'; }

async function assinarEstado(ctx, env) {
  const n = b64url(crypto.getRandomValues(new Uint8Array(9)));
  const dados = ctx + '.' + n;
  const sig = (await hmac(env.PORTAL_SESSION_SECRET || 'ecobraz', 'gstate|' + dados)).slice(0, 16);
  return dados + '.' + sig;
}
async function verificarEstado(state, env) {
  const p = String(state || '').split('.');
  if (p.length !== 3) return null;
  const dados = p[0] + '.' + p[1];
  const sig = (await hmac(env.PORTAL_SESSION_SECRET || 'ecobraz', 'gstate|' + dados)).slice(0, 16);
  return sig === p[2] ? { ctx: p[0] } : null;
}

// Redireciona para o consentimento do Google.
export async function iniciarGoogle(env, url) {
  const ctx = (url.searchParams.get('ctx') || 'operacao').replace(/[^a-z]/g, '').slice(0, 12);
  const state = await assinarEstado(ctx, env);
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(env, url), response_type: 'code',
    scope: 'openid email profile', state, access_type: 'online', prompt: 'select_account',
  });
  if (env.GOOGLE_HD) p.set('hd', env.GOOGLE_HD); // opcional: restringe ao domínio (ex.: ecobraz.org.br)
  return new Response(null, { status: 302, headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString(), 'cache-control': 'no-store' } });
}

// Troca o code por tokens e devolve o e-mail verificado + o papel (ctx).
export async function callbackGoogle(env, url) {
  const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
  const st = await verificarEstado(state, env);
  if (!code || !st) return { ok: false, erro: 'estado' };
  const body = new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(env, url), grant_type: 'authorization_code' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) return { ok: false, erro: 'token' };
  const tok = await r.json(); const idt = tok.id_token;
  if (!idt) return { ok: false, erro: 'idtoken' };
  let payload = {};
  try { payload = JSON.parse(decodeURIComponent(escape(atob(idt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return { ok: false, erro: 'decode' }; }
  const email = String(payload.email || '').toLowerCase();
  if (!email || payload.email_verified === false) return { ok: false, erro: 'email' };
  // Confere o audience (segurança): o token tem que ser para o nosso client_id.
  if (payload.aud && payload.aud !== env.GOOGLE_CLIENT_ID) return { ok: false, erro: 'aud' };
  return { ok: true, email, ctx: st.ctx, hd: payload.hd || '', nome: payload.name || '' };
}
