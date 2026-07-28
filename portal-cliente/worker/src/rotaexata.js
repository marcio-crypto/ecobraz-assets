// Integração RotaExata — rastreamento do caminhão em tempo real para o cliente.
//
// SEGURANÇA (regra rígida do projeto): o login e a senha do RotaExata vivem SÓ nos
// Secrets da Cloudflare (ROTAEXATA_USER / ROTAEXATA_SENHA). Nunca são impressos,
// logados ou devolvidos em resposta — a sonda mostra apenas STATUS e ESTRUTURA
// (nomes de campos), jamais valores de credencial.
//
// FASES (honestidade sobre o que está pronto):
//  1) SONDA (concluída — resultado salvo no D1, tabela diagnosticos): o Worker lê a
//     documentação oficial da API (SwaggerHub RotaExataSoftware/RotaExata) e testa a
//     autenticação/endpoints com as credenciais do cofre, só status/estrutura.
//  2) MAPEAMENTO (FEITO em 2026-07-28): posição por placa fixada no bloco POSIÇÕES
//     abaixo; ROTAEXATA_PRONTO=true acende o rastreio no portal. A primeira leitura
//     real de cada dia salva uma amostra ESTRUTURAL no D1 para auditoria contínua.

// Mapeamento CONFIRMADO pela sonda (2026-07-28, diagnóstico salvo no D1):
//   POST /login {email, password} → {token}  ·  chave CRUA no header Authorization
//   GET /adesoes → rastreadores/veículos  ·  GET /ultima-posicao/{id} → posição
export const ROTAEXATA_PRONTO = true;

export function rotaexataConfigurado(env) {
  return !!(env && env.ROTAEXATA_USER && env.ROTAEXATA_SENHA);
}
export function rastreioDisponivel(env) { return rotaexataConfigurado(env) && ROTAEXATA_PRONTO; }

const SPEC_URL = 'https://api.swaggerhub.com/apis/RotaExataSoftware/RotaExata';
const BASES_RESERVA = ['https://api.rotaexata.com.br', 'https://app.rotaexata.com.br/api'];

const corte = (s, n) => String(s == null ? '' : s).slice(0, n);
function tipoDe(v) { if (v == null) return 'vazio'; if (Array.isArray(v)) return `lista[${v.length}]`; return typeof v; }
// Estrutura SEM valores: nomes de campos + tipo (e 1 nível de um item de lista).
function estrutura(x, prof = 0) {
  if (Array.isArray(x)) return x.length ? { _lista: x.length, item: prof < 2 ? estrutura(x[0], prof + 1) : '(…)' } : { _lista: 0 };
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x).slice(0, 40)) o[k] = (prof < 2 && x[k] && typeof x[k] === 'object') ? estrutura(x[k], prof + 1) : tipoDe(x[k]);
    return o;
  }
  return tipoDe(x);
}

async function req(url, opts = {}, timeoutMs = 8000) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    const ct = r.headers.get('content-type') || '';
    const setCookie = r.headers.get('set-cookie') || '';
    let corpo = null, texto = '';
    if (/json/i.test(ct)) { try { corpo = await r.json(); } catch { corpo = null; } }
    else { texto = corte(await r.text().catch(() => ''), 300); }
    return { status: r.status, ct, corpo, texto, setCookie };
  } catch (e) {
    return { status: 0, erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : corte((e && e.message) || 'falha', 120) };
  }
}

// Resolve $ref do OpenAPI (ex.: #/components/schemas/X) e devolve os CAMPOS de um
// schema (nomes + tipos), para a sonda mostrar o formato exato sem valores.
function deref(spec, node, prof = 0) {
  if (!node || prof > 5) return node;
  if (node.$ref) {
    const partes = String(node.$ref).replace(/^#\//, '').split('/');
    let x = spec; for (const p of partes) x = x && x[p];
    return deref(spec, x, prof + 1);
  }
  return node;
}
function esquemaCampos(spec, schema, prof = 0) {
  const s = deref(spec, schema, prof);
  if (!s || prof > 3) return null;
  if (s.type === 'array' || s.items) return { _lista: esquemaCampos(spec, s.items, prof + 1) };
  if (s.properties) {
    const o = {};
    for (const [k, v] of Object.entries(s.properties).slice(0, 35)) {
      const d = deref(spec, v, prof + 1) || {};
      o[k] = (d.properties || d.items) ? esquemaCampos(spec, d, prof + 1) : (d.type || 'campo');
    }
    if (Array.isArray(s.required) && s.required.length) o._obrigatorios = s.required.join(', ');
    return o;
  }
  return s.type || null;
}
// Campos (corpo esperado + resposta) de uma operação do spec.
function detalheOperacao(spec, def) {
  if (!def) return null;
  const rb = def.requestBody && def.requestBody.content && (def.requestBody.content['application/json'] || Object.values(def.requestBody.content)[0]);
  const ok = def.responses && (def.responses['200'] || def.responses['201'] || def.responses.default);
  const rc = ok && ok.content && (ok.content['application/json'] || Object.values(ok.content)[0]);
  return {
    corpoEsperado: rb ? esquemaCampos(spec, rb.schema) : null,
    respostaEsperada: rc ? esquemaCampos(spec, rc.schema) : null,
    parametros: (def.parameters || []).map((p) => { const d = deref(spec, p) || {}; return `${d.name || '?'} (${d.in || '?'}${d.required ? ', obrigatório' : ''})`; }).slice(0, 12),
  };
}

// --- SONDA (Diretoria) ------------------------------------------------------
// Nunca inclui credenciais no retorno. Mostra: spec (servidores/segurança/rotas),
// tentativas de login e de leitura de posições — só status + estrutura.
export async function sondaRotaExata(env) {
  const out = { configurado: rotaexataConfigurado(env), pronto: ROTAEXATA_PRONTO, spec: null, tentativas: [], dica: '' };

  // 1) Documentação oficial (SwaggerHub) — pública, sem credencial. Extrai também o
  // FORMATO EXATO do /login (campos do corpo e da resposta) e o header da chave.
  let specRaw = null;
  for (const u of [`${SPEC_URL}/0.0.6`, SPEC_URL]) {
    const r = await req(u, { headers: { accept: 'application/json' } });
    if (r.status === 200 && r.corpo && r.corpo.paths) { specRaw = r.corpo; out.specOrigem = u; break; }
    out.tentativas.push({ passo: 'documentação', url: u, status: r.status || 0, detalhe: r.erro || corte(r.texto, 120) });
  }
  let headerChave = '', rotasLogin = [], rotasPos = [];
  if (specRaw) {
    const servers = (specRaw.servers || []).map((s) => s && s.url).filter(Boolean);
    const seg = (specRaw.components && specRaw.components.securitySchemes) || specRaw.securityDefinitions || {};
    const seguranca = Object.entries(seg).map(([k, v]) => ({ nome: k, tipo: v && v.type, header: (v && v.name) || '', em: (v && (v.in || v.scheme)) || '' }));
    headerChave = (seguranca.find((s) => s.tipo === 'apiKey' && s.header) || {}).header || '';
    const paths = [];
    for (const [p, metodos] of Object.entries(specRaw.paths || {})) {
      for (const [m, def] of Object.entries(metodos || {})) {
        if (!/^(get|post|put|delete|patch)$/i.test(m)) continue;
        paths.push({ metodo: m.toUpperCase(), path: p, resumo: corte((def && (def.summary || def.description)) || '', 90) });
        if (m === 'post' && /login|auth|token|sessao|session/i.test(p)) rotasLogin.push(p);
        if (m === 'get' && !p.includes('{') && /(veicul|vehicle|posi|position|localiza|rastre|last|atual|frota|fleet|mapa)/i.test(p)) rotasPos.push(p);
      }
    }
    // Formato exato do login e das rotas de posição (o mapa do tesouro).
    const loginDef = rotasLogin.length && specRaw.paths[rotasLogin[0]] ? specRaw.paths[rotasLogin[0]].post : null;
    const detLogin = detalheOperacao(specRaw, loginDef);
    const detPos = {};
    for (const rp of rotasPos.slice(0, 6)) { try { detPos[rp] = detalheOperacao(specRaw, specRaw.paths[rp].get); } catch { /* segue */ } }
    out.spec = {
      titulo: corte(specRaw.info && specRaw.info.title, 80), versao: corte(specRaw.info && specRaw.info.version, 20),
      servidores: servers, seguranca, headerDaChave: headerChave || '(não informado no spec)',
      loginFormato: detLogin, rotasDePosicao: detPos,
      totalRotas: paths.length, rotas: paths.slice(0, 80),
    };
  }

  if (!out.configurado) {
    out.dica = 'Cadastre os Secrets ROTAEXATA_USER e ROTAEXATA_SENHA na Cloudflare para a sonda testar o login.';
    return fimSonda(env, out);
  }

  const user = env.ROTAEXATA_USER, senha = env.ROTAEXATA_SENHA;
  const bases = [...new Set([...(out.spec ? out.spec.servidores : []), ...BASES_RESERVA])].filter(Boolean).slice(0, 3);
  if (!rotasLogin.length) rotasLogin = ['/login', '/auth/login', '/api/login'];

  // 2) LOGIN — primeiro com os campos EXATOS que a documentação pede; depois variações.
  const corposLogin = [];
  const fmt = out.spec && out.spec.loginFormato && out.spec.loginFormato.corpoEsperado;
  if (fmt && typeof fmt === 'object') {
    const corpo = {}; let casou = 0;
    for (const k of Object.keys(fmt)) {
      if (k.startsWith('_')) continue;
      if (/senha|pass/i.test(k)) { corpo[k] = senha; casou++; }
      else if (/mail|user|login|usuario/i.test(k)) { corpo[k] = user; casou++; }
    }
    if (casou >= 2) corposLogin.push(corpo);
  }
  corposLogin.push({ email: user, senha }, { login: user, senha }, { email: user, password: senha }, { username: user, password: senha }, { usuario: user, senha });

  let token = '', cookie = '', baseOk = '';
  fora:
  for (const base of bases) {
    for (const rota of rotasLogin.slice(0, 3)) {
      for (const corpo of corposLogin.slice(0, 6)) {
        const r = await req(base.replace(/\/+$/, '') + rota, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corpo) }, 7000);
        const info = { passo: 'login', url: base + rota, campos: Object.keys(corpo).join('+'), status: r.status };
        if (r.status >= 200 && r.status < 300) {
          const c = r.corpo || {};
          const t = c.token || c.access_token || c.accessToken || c.jwt || c.key || c.apiKey || c.api_key || c.chave ||
            (c.data && (c.data.token || c.data.access_token || c.data.key)) || (typeof r.corpo === 'string' && r.corpo.length < 600 ? r.corpo : '');
          if (r.setCookie) { cookie = r.setCookie.split(',').map((x) => x.split(';')[0].trim()).filter(Boolean).join('; '); }
          info.estrutura = r.corpo ? estrutura(r.corpo) : '(sem corpo JSON)';
          info.achouToken = !!t; info.recebeuCookie = !!cookie;
          if (cookie) info.cookies = cookie.split('; ').map((x) => x.split('=')[0]); // só NOMES
          out.tentativas.push(info);
          if (t) token = String(t);
          if (t || cookie) { baseOk = base; break fora; }
        } else if (r.status === 0 || r.status !== 404) {
          info.detalhe = r.erro || corte(r.texto, 100) || (r.corpo ? JSON.stringify(estrutura(r.corpo)) : '');
          out.tentativas.push(info);
        }
      }
    }
  }

  // 3) LEITURA — o header da doc leva a chave CRUA (apiKey em 'Authorization').
  // Varre TODAS as rotas GET sem parâmetro (qualquer nome — a rota de veículos pode
  // não ter nome óbvio), priorizando as com cara de veículo/posição; assim que um
  // auth responder 200, trava nele. Depois tenta as rotas com {id} usando um id
  // descoberto nas listas. Para quando achar latitude/longitude.
  const kw = /(veicul|vehicle|posi|position|localiza|rastre|last|atual|frota|fleet|mapa|monitor|equipamento|dispositivo|tracker|placa|ades)/i;
  let getsSem = [], getsCom = [];
  if (specRaw) {
    for (const [p, met] of Object.entries(specRaw.paths || {})) {
      if (!met || !met.get) continue;
      // NUNCA sondar /logout: derruba o token na hora e transforma o resto em 401
      // (aprendido na v3 — foi exatamente o que aconteceu).
      if (/logout|sair|deslogar/i.test(p)) continue;
      if (p.includes('{')) { if (kw.test(p)) getsCom.push(p); }
      else getsSem.push(p);
    }
    getsSem.sort((a, b) => (kw.test(b) ? 1 : 0) - (kw.test(a) ? 1 : 0));
  }
  if (!getsSem.length) getsSem = ['/adesoes', '/veiculos', '/posicoes'];

  const auths = [];
  if (token && headerChave) auths.push({ nome: `chave crua no ${headerChave}`, header: { [headerChave]: token } });
  if (token) auths.push({ nome: 'Bearer', header: { authorization: `Bearer ${token}` } });
  if (cookie) auths.push({ nome: 'cookie de sessão', header: { cookie } });
  auths.push({ nome: 'Basic (login:senha)', header: { authorization: 'Basic ' + btoa(`${user}:${senha}`) } });

  const basePos = (baseOk || bases[0] || 'https://api.rotaexata.com.br').replace(/\/+$/, '');
  const ehPosicao = (est) => { const s = JSON.stringify(est || {}); return /lat/i.test(s) && /(lng|lon)/i.test(s); };
  const extraiId = (corpo) => {
    const item = Array.isArray(corpo) ? corpo[0] : (corpo && ((corpo.data && corpo.data[0]) || (corpo.items && corpo.items[0]) || (corpo.veiculos && corpo.veiculos[0]) || (corpo.adesoes && corpo.adesoes[0]) || (corpo.results && corpo.results[0])));
    if (!item || typeof item !== 'object') return null;
    return (item.veiculo && typeof item.veiculo === 'object' ? item.veiculo.id : null) ?? item.veiculoId ?? item.id ?? item._id ?? item.deviceId ?? item.codigo ?? null;
  };

  let authOk = null, idAchado = null;
  for (const a of auths) {
    let acertou = false;
    for (const rota of getsSem.slice(0, 12)) {
      const r = await req(basePos + rota, { headers: { ...a.header, accept: 'application/json' } }, 7000);
      const ent = { passo: 'leitura', auth: a.nome, url: basePos + rota, status: r.status };
      if (r.status >= 200 && r.status < 300 && r.corpo != null) {
        ent.estrutura = estrutura(r.corpo);
        out.tentativas.push(ent);
        acertou = true; authOk = a;
        const id = extraiId(r.corpo); if (id != null && idAchado == null) idAchado = id;
        if (ehPosicao(ent.estrutura)) { out.dica = 'ACHOU POSIÇÕES! (latitude/longitude na estrutura acima). Resultado salvo — só me avise que rodou, que eu fixo o mapeamento e ligo o rastreio.'; return fimSonda(env, out); }
      } else {
        ent.detalhe = r.erro || corte(r.texto, 80);
        out.tentativas.push(ent);
      }
    }
    if (acertou) break; // trava no auth que funcionou e não desperdiça tentativas
  }
  if (authOk && idAchado != null && getsCom.length) {
    for (const rota of getsCom.slice(0, 6)) {
      const caminho = rota.replace(/\{[^}]+\}/g, encodeURIComponent(String(idAchado)));
      const r = await req(basePos + caminho, { headers: { ...authOk.header, accept: 'application/json' } }, 7000);
      const ent = { passo: 'leitura com id', auth: authOk.nome, url: basePos + caminho, status: r.status };
      if (r.status >= 200 && r.status < 300 && r.corpo != null) {
        ent.estrutura = estrutura(r.corpo);
        out.tentativas.push(ent);
        if (ehPosicao(ent.estrutura)) { out.dica = 'ACHOU POSIÇÕES (rota com id)! Resultado salvo — só me avise que rodou, que eu fixo o mapeamento e ligo o rastreio.'; return fimSonda(env, out); }
      } else { ent.detalhe = r.erro || corte(r.texto, 80); out.tentativas.push(ent); }
    }
  }
  out.tentativas = out.tentativas.slice(0, 60);
  out.dica = (token || cookie)
    ? 'Login OK; as leituras acima mostram o que cada rota respondeu. Resultado salvo no banco — só me avise que rodou, que eu analiso daqui.'
    : 'O login ainda não passou. Resultado salvo no banco — só me avise que rodou, que eu analiso daqui.';
  return fimSonda(env, out);
}

// Salva o resultado da sonda no D1 (sem credencial nenhuma — só status/estrutura),
// para análise direta sem depender de print. Best-effort.
async function fimSonda(env, out) {
  try {
    if (env.DB_PLOOMES) {
      await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
      await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
        .bind('rotaexata', new Date().toISOString(), JSON.stringify(out).slice(0, 180000)).run();
      out.salvoNoBanco = true;
    }
  } catch { /* segue sem salvar */ }
  return out;
}

// --- POSIÇÕES (mapeamento REAL, confirmado pela sonda) -----------------------
// Fluxo: POST /login {email, password} → token · GET /adesoes (lista de
// rastreadores/veículos) · GET /ultima-posicao/{id} por veículo. A chave vai CRUA
// no header Authorization (esquema apiKey do spec — provado ao vivo pela sonda).
// REGRA APRENDIDA NA SONDA: nunca chamar /logout — derruba o token na hora.
// Os nomes de campo da lista/posição podem variar; a extração abaixo cobre as
// variações comuns e a primeira leitura do dia salva uma amostra ESTRUTURAL no D1
// (só nomes/tipos de campos — nunca coordenadas, placas ou credenciais).
const BASE_REAL = 'https://api.rotaexata.com.br';
const normPlaca = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = (v) => { if (v == null || v === '') return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Token com cache (~40 min) no KV; leitura que tomar 401 força um login novo.
async function tokenRotaExata(env, forcar = false) {
  if (!forcar && env.PORTAL_KV) { try { const t = await env.PORTAL_KV.get('rotaexata:tok'); if (t) return t; } catch { /* segue */ } }
  const r = await req(`${BASE_REAL}/login`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ email: env.ROTAEXATA_USER, password: env.ROTAEXATA_SENHA }) }, 8000);
  const c = (r.status >= 200 && r.status < 300 && r.corpo) || {};
  const t = c.token || c.accessToken || (c.data && c.data.token) || '';
  if (!t) return '';
  if (env.PORTAL_KV) { try { await env.PORTAL_KV.put('rotaexata:tok', String(t), { expirationTtl: 2400 }); } catch { /* segue */ } }
  return String(t);
}
const getAut = (tok, caminho) => req(`${BASE_REAL}${caminho}`, { headers: { authorization: tok, accept: 'application/json' } }, 6500);

// A lista pode vir na raiz ou embrulhada (data/adesoes/items/…).
function comoLista(corpo) {
  if (Array.isArray(corpo)) return corpo;
  if (corpo && typeof corpo === 'object') {
    for (const k of ['data', 'adesoes', 'items', 'results', 'lista', 'registros', 'rows', 'docs']) if (Array.isArray(corpo[k])) return corpo[k];
    if (corpo.data && typeof corpo.data === 'object') { for (const k of ['adesoes', 'items', 'results', 'lista']) if (Array.isArray(corpo.data[k])) return corpo.data[k]; }
  }
  return [];
}
// Ids candidatos para /ultima-posicao/{id}: primeiro o do VEÍCULO, depois o da adesão.
function idsCandidatos(a) {
  const out = []; const poe = (v) => { if ((typeof v === 'number' || (typeof v === 'string' && v !== '')) && !out.includes(v)) out.push(v); };
  if (a && typeof a === 'object') {
    for (const k of ['veiculoId', 'idVeiculo', 'veiculo_id', 'vehicleId']) poe(a[k]);
    for (const k of ['veiculo', 'vehicle']) { const v = a[k]; if (v && typeof v === 'object') { poe(v.id); poe(v._id); poe(v.codigo); } }
    for (const k of ['id', '_id', 'adesaoId', 'idAdesao', 'codigo']) poe(a[k]);
  }
  return out.slice(0, 2);
}
// Busca um campo de texto (ex.: placa) direto ou aninhado (veiculo.placa etc.).
function acharTexto(x, chaves, prof = 0) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || prof > 2) return '';
  for (const k of chaves) { const v = x[k]; if (v != null && typeof v !== 'object' && String(v).trim()) return String(v).trim(); }
  for (const k of ['veiculo', 'vehicle', 'carro', 'equipamento', 'rastreador', 'device', 'dados', 'data']) {
    const v = x[k]; if (v && typeof v === 'object') { const r = acharTexto(v, chaves, prof + 1); if (r) return r; }
  }
  return '';
}
const extrairPlaca = (a) => acharTexto(a, ['placa', 'plate', 'licensePlate', 'license_plate', 'Placa']);
const extrairApelido = (a) => corte(acharTexto(a, ['apelido', 'nome', 'descricao', 'identificacao', 'label', 'name', 'modelo']), 40);
const adesaoInativa = (a) => !!(a && (a.ativo === false || a.ativa === false || a.ativado === false || /cancelad|inativ|suspens|bloquead/i.test(String(a.status || a.situacao || ''))));

// Acha o par latitude/longitude em qualquer nível razoável da resposta.
// Aceita vírgula decimal e ignora (0,0) — rastreador sem sinal de GPS.
function extrairPosicao(x, prof = 0) {
  if (x == null || prof > 3) return null;
  if (Array.isArray(x)) { for (const it of x.slice(0, 3)) { const p = extrairPosicao(it, prof + 1); if (p) return p; } return null; }
  if (typeof x !== 'object') return null;
  const lat = num(x.lat ?? x.latitude ?? x.Latitude ?? x.Lat);
  const lng = num(x.lng ?? x.lon ?? x.long ?? x.longitude ?? x.Longitude ?? x.Lng);
  if (lat != null && lng != null && (lat !== 0 || lng !== 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const em = x.dataHora ?? x.data_hora ?? x.dataPosicao ?? x.dataHoraServidor ?? x.serverTime ?? x.data ?? x.date ?? x.timestamp ?? x.horario ?? null;
    return { lat, lng, velocidade: num(x.velocidade ?? x.speed ?? x.vel ?? x.velocity), em: em != null ? String(em) : null };
  }
  for (const k of Object.keys(x).slice(0, 30)) { const v = x[k]; if (v && typeof v === 'object') { const p = extrairPosicao(v, prof + 1); if (p) return p; } }
  return null;
}

// Amostra ESTRUTURAL no D1 (diagnosticos) — 1×/dia quando dá certo, no máx. 1×/hora
// quando falha. Só nomes de campos e contagens; nunca coordenadas nem credenciais.
async function amostraDiaria(env, amostra, falha = false) {
  try {
    if (!env.DB_PLOOMES) return;
    const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    const marca = `rotaexata:amostra:${falha ? 'erro' : 'ok'}:${dia}`;
    if (env.PORTAL_KV) {
      if (await env.PORTAL_KV.get(marca)) return;
      await env.PORTAL_KV.put(marca, '1', { expirationTtl: falha ? 3600 : 172800 });
    }
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
    await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
      .bind('rotaexata-posicoes', new Date().toISOString(), JSON.stringify(amostra).slice(0, 60000)).run();
  } catch { /* diagnóstico é best-effort */ }
}

// Frota inteira (todas as placas) — alimenta o painel do comercial e da diretoria.
export async function posicoesFrota(env) {
  if (!rotaexataConfigurado(env)) return { ok: false, motivo: 'nao_configurado', veiculos: [] };
  if (!ROTAEXATA_PRONTO) return { ok: false, motivo: 'mapeamento_pendente', veiculos: [] };

  // Cache curto: várias telas abertas ao mesmo tempo não martelam a API.
  if (env.PORTAL_KV) { try { const c = await env.PORTAL_KV.get('rotaexata:pos', 'json'); if (c && c.t && (Date.now() - c.t) < 15000 && Array.isArray(c.veiculos)) return { ok: true, veiculos: c.veiculos }; } catch { /* segue */ } }

  let tok = await tokenRotaExata(env);
  if (!tok) return { ok: false, motivo: 'login_falhou', veiculos: [] };
  let rAd = await getAut(tok, '/adesoes');
  if (rAd.status === 401 || rAd.status === 403) {
    tok = await tokenRotaExata(env, true);
    if (!tok) return { ok: false, motivo: 'login_falhou', veiculos: [] };
    rAd = await getAut(tok, '/adesoes');
  }
  if (!(rAd.status >= 200 && rAd.status < 300) || rAd.corpo == null) {
    await amostraDiaria(env, { passo: 'adesoes_falhou', status: rAd.status || 0, detalhe: rAd.erro || corte(rAd.texto, 120) }, true);
    return { ok: false, motivo: 'sem_resposta', veiculos: [] };
  }

  const lista = comoLista(rAd.corpo).filter((a) => !adesaoInativa(a)).slice(0, 15);
  let estPos = null; // estrutura da 1ª resposta de posição (para a amostra)
  const veiculos = (await Promise.all(lista.map(async (a) => {
    const placa = extrairPlaca(a);
    for (const id of idsCandidatos(a)) {
      const rp = await getAut(tok, `/ultima-posicao/${encodeURIComponent(String(id))}`);
      if (!(rp.status >= 200 && rp.status < 300) || rp.corpo == null) continue;
      if (!estPos) estPos = estrutura(rp.corpo);
      const pos = extrairPosicao(rp.corpo);
      if (pos) return { placa: placa || `ID ${id}`, apelido: extrairApelido(a), lat: pos.lat, lng: pos.lng, velocidade: pos.velocidade, em: pos.em };
    }
    return null;
  }))).filter(Boolean);

  await amostraDiaria(env, {
    adesoes: { status: rAd.status, itensNaLista: comoLista(rAd.corpo).length, ativos: lista.length, estrutura: estrutura(rAd.corpo) },
    ultimaPosicao: { estrutura: estPos },
    posicoesExtraidas: veiculos.length,
  }, veiculos.length === 0);

  if (!veiculos.length) return { ok: false, motivo: 'sem_posicao', veiculos: [] };
  if (env.PORTAL_KV) { try { await env.PORTAL_KV.put('rotaexata:pos', JSON.stringify({ t: Date.now(), veiculos }), { expirationTtl: 60 }); } catch { /* segue */ } }
  return { ok: true, veiculos };
}

// Um veículo específico (por placa) — alimenta o rastreio do cliente.
export async function posicaoDoVeiculo(env, placa) {
  const fr = await posicoesFrota(env);
  if (!fr.ok) return { ok: false, motivo: fr.motivo };
  const alvo = normPlaca(placa);
  const v = (fr.veiculos || []).find((x) => normPlaca(x.placa) === alvo);
  if (!v) return { ok: false, motivo: 'sem_posicao' };
  return { ok: true, placa: corte(v.placa, 8), lat: v.lat, lng: v.lng, velocidade: v.velocidade ?? null, atualizadoEm: v.em || null };
}

// Fotografa a posição do veículo num EVENTO da coleta (a caminho, check-in,
// encerramento…) para virar PROVA de rastreabilidade anexada à OS. Nunca lança;
// devolve null se a posição não estiver disponível (aí simplesmente não anexa).
export async function capturarTelemetria(env, placa, evento) {
  try {
    const p = await posicaoDoVeiculo(env, placa);
    if (!p || !p.ok) return null;
    return { evento: corte(evento, 40), placa: corte(placa, 8), lat: p.lat, lng: p.lng, velocidade: p.velocidade ?? null, em: new Date().toISOString(), fonte: 'rotaexata' };
  } catch { return null; }
}

// --- Telas ------------------------------------------------------------------
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Página da SONDA (Diretoria): status da configuração + instruções de secrets + resultado.
export function paginaSondaRotaExata(user, env) {
  const conf = rotaexataConfigurado(env);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>RotaExata — Sonda</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:860px;margin:0 auto;padding:20px 18px 56px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px;margin-bottom:14px}
.btn{border:none;border-radius:11px;padding:12px 18px;font-size:14px;font-weight:800;cursor:pointer;background:#92C430;color:#10262B}
pre{background:#0d2a30;color:#cfe3e0;border-radius:10px;padding:14px;font-size:11px;overflow:auto;max-height:520px;white-space:pre-wrap;word-break:break-word}
.ok{color:#1E7A3D;font-weight:800}.warn{color:#8A6A16;font-weight:800}
ol{font-size:13px;color:#28413f;line-height:1.8;padding-left:20px;margin:8px 0 0}
code{background:#EEF3F1;border-radius:6px;padding:1px 7px;font-size:12px}</style></head>
<body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:860px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/diretoria" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">rotaexata · sonda</span></a>
</div></div>
<div class="wrap">
  <h1 style="font-size:20px;margin:12px 0 4px">🛰️ RotaExata — configuração do rastreamento</h1>
  <p style="font-size:13px;color:#4F6469;margin:0 0 14px">A sonda lê a documentação oficial da API e testa o login com as credenciais do cofre — mostrando só <b>status e estrutura</b> (nunca as credenciais). Com o resultado, o mapeamento é fixado e o cliente passa a acompanhar o caminhão em tempo real.</p>

  <div class="card">
    <div style="font-size:14px;font-weight:800;margin-bottom:6px">Credenciais no cofre: ${conf ? '<span class="ok">✓ configuradas</span>' : '<span class="warn">✗ ainda não configuradas</span>'}</div>
    ${conf ? '<div style="font-size:12.5px;color:#4F6469">ROTAEXATA_USER e ROTAEXATA_SENHA encontrados. Pode rodar a sonda abaixo.</div>' : `
    <div style="font-size:12.5px;color:#4F6469;margin-bottom:6px">Cadastre o login e a senha do RotaExata como <b>Secrets</b> na Cloudflare (só você vê; nunca cole aqui no sistema nem em conversa):</div>
    <ol>
      <li>Abra <b>dash.cloudflare.com</b> e entre na conta da Ecobraz.</li>
      <li>Menu <b>Workers &amp; Pages</b> → clique no worker <b>ecobraz-portal</b>.</li>
      <li>Aba <b>Settings</b> → seção <b>Variables and Secrets</b> → botão <b>Add</b>.</li>
      <li>Type: <b>Secret</b> · Variable name: <code>ROTAEXATA_USER</code> · Value: <b>o login do RotaExata</b> → <b>Deploy</b>.</li>
      <li>Repita: <b>Add</b> → Type <b>Secret</b> · Name: <code>ROTAEXATA_SENHA</code> · Value: <b>a senha</b> → <b>Deploy</b>.</li>
      <li>Volte aqui e recarregue a página — o status acima vira ✓.</li>
    </ol>`}
  </div>

  <div class="card">
    <button class="btn" id="b" onclick="rodar()" ${conf ? '' : 'disabled style="opacity:.5"'}>▶ Rodar a sonda agora</button>
    <span id="st" style="font-size:13px;color:#4F6469;margin-left:10px"></span>
    <pre id="res" style="display:none;margin-top:14px"></pre>
  </div>
  <div style="font-size:11.5px;color:#8fa39f">Depois de rodar, o resultado fica <b>salvo no banco automaticamente</b> — é só me avisar “rodei” que eu analiso daqui e ligo o botão “Acompanhar o caminhão” no portal do cliente. (Print não é mais necessário.)</div>
</div>
<script>
async function rodar(){
  var b=document.getElementById('b'),st=document.getElementById('st'),res=document.getElementById('res');
  b.disabled=true;st.textContent='Rodando… (até ~40 s, testa várias rotas)';res.style.display='none';
  try{
    var r=await fetch('/api/diretoria/rotaexata-sonda',{method:'POST'});
    var j=await r.json();
    res.textContent=JSON.stringify(j,null,2);res.style.display='block';
    st.textContent=j&&j.dica?j.dica:'Concluída.';
  }catch(e){st.textContent='Falhou a chamada. Tente de novo.';}
  b.disabled=false;
}
</script></body></html>`;
}

// Página do COMERCIAL/ESCRITÓRIO: frota ao vivo — onde está cada caminhão, qual
// coleta ele atende agora e qual é a próxima. Atualiza sozinha a cada 20 s.
export function paginaFrotaAoVivo(user) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Frota ao vivo — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:900px;margin:0 auto;padding:18px 16px 48px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px 18px;margin-bottom:10px}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}
iframe{width:100%;height:300px;border:1px solid #E4EBE9;border-radius:10px;margin-top:10px}
.aviso{background:#FFFBEB;border:1px solid #F0DCA6;border-radius:12px;padding:12px 15px;font-size:12.5px;color:#7a5f13;line-height:1.5;margin-bottom:12px}</style></head>
<body>
<div style="background:#00333B;padding:14px 18px"><div style="max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">frota ao vivo</span></a>
  <span id="hora" style="color:#9FC6C1;font-size:11px;font-weight:700"></span>
</div></div>
<div class="wrap">
  <h1 style="font-size:20px;margin:4px 0 2px">🛰️ Frota ao vivo</h1>
  <p style="font-size:12.5px;color:#4F6469;margin:0 0 12px">Onde está cada caminhão, qual coleta ele atende agora e a próxima da fila. Atualiza sozinho a cada 20 segundos.</p>
  <div id="lista"><div class="card" style="color:#8fa39f;font-size:13px">⏳ Carregando a frota…</div></div>
</div>
<script>
function escapeHtml(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function mapa(el, la, lo){ if(!el) return; var dl=0.008, bbox=(lo-dl)+','+(la-dl)+','+(lo+dl)+','+(la+dl);
  el.innerHTML='<iframe loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent(bbox)+'&layer=mapnik&marker='+encodeURIComponent(la+','+lo)+'"></iframe>'; }
function pinta(d){
  var alvo=document.getElementById('lista');
  document.getElementById('hora').textContent='atualizado '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  var aviso='';
  if(d && !d.posOk){
    var mm={login_falhou:'🛰️ <b>Sem comunicação com o RotaExata agora</b> (autenticação não passou). Tentamos de novo automaticamente — as colunas de coleta atual/próxima seguem reais.',
            sem_resposta:'🛰️ <b>Sem resposta do RotaExata agora</b>. Tentamos de novo automaticamente — as colunas de coleta atual/próxima seguem reais.',
            sem_posicao:'🛰️ <b>Rastreadores sem sinal neste momento</b>. Assim que um veículo transmitir, a posição aparece aqui sozinha.',
            nao_configurado:'🛰️ <b>Posições ao vivo em ativação</b> (credenciais do RotaExata ainda não configuradas no cofre). As colunas de coleta atual/próxima já são reais.'};
    aviso='<div class="aviso">'+(mm[d.motivo]||'🛰️ <b>Posições ao vivo em ativação</b> (integração RotaExata em conclusão). As colunas de coleta atual/próxima já são reais.')+'</div>';
  }
  if(!d || !Array.isArray(d.frota) || !d.frota.length){ alvo.innerHTML=aviso+'<div class="card" style="color:#8fa39f;font-size:13px">Nenhum veículo cadastrado na Frota ainda.</div>'; return; }
  alvo.innerHTML = aviso + d.frota.map(function(v,i){
    var pos = v.pos ? ('🟢 <b>'+(v.pos.velocidade!=null?Math.round(v.pos.velocidade)+' km/h':'parado/andando')+'</b>') : '<span style="color:#8fa39f">sem sinal ao vivo</span>';
    var atual = v.coletaAtual ? ('<b>'+escapeHtml(v.coletaAtual.numero||'')+'</b> · '+escapeHtml(v.coletaAtual.cliente||'')) : '<span style="color:#8fa39f">nenhuma em andamento</span>';
    var prox = v.proxima ? (escapeHtml(v.proxima.numero||'')+' · '+escapeHtml(v.proxima.cliente||'')) : '—';
    return '<div class="card">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'
      +'<div><span style="font-size:15px;font-weight:800">🚛 '+escapeHtml(v.placa||'—')+'</span>'+(v.apelido?' <span style="font-size:12px;color:#7c8a87">· '+escapeHtml(v.apelido)+'</span>':'')+(v.motorista?' <span style="font-size:12px;color:#0B5B66;font-weight:700">· '+escapeHtml(v.motorista)+'</span>':'')+'</div>'
      +'<div style="font-size:12px">'+pos+'</div></div>'
      +'<div style="font-size:12.5px;color:#28413f;margin-top:8px">Atendendo agora: '+atual+'</div>'
      +'<div style="font-size:12.5px;color:#28413f;margin-top:3px">Próxima da fila: '+prox+'</div>'
      +'<div style="font-size:12px;color:#7c8a87;margin-top:3px">Concluídas hoje: <b>'+(v.concluidasHoje||0)+'</b></div>'
      +(v.pos?('<button style="margin-top:8px;border:1px solid #cfe0dd;background:#fff;border-radius:8px;padding:7px 11px;font-size:12px;font-weight:700;color:#00333B;cursor:pointer" onclick="var m=document.getElementById(\\'m'+i+'\\'); if(m.dataset.on){m.innerHTML=\\'\\';m.dataset.on=\\'\\';this.textContent=\\'🗺️ Ver no mapa\\';}else{mapa(m,'+v.pos.lat+','+v.pos.lng+');m.dataset.on=\\'1\\';this.textContent=\\'✕ Fechar mapa\\';}">🗺️ Ver no mapa</button><div id="m'+i+'"></div>'):'')
      +'</div>';
  }).join('');
}
function busca(){ fetch('/api/frota/aovivo').then(function(r){return r.json();}).then(pinta).catch(function(){}); }
busca(); setInterval(busca, 20000);
</script></body></html>`;
}

// Página do CLIENTE: acompanhar o caminhão da coleta (mapa + atualização automática).
// Abre apenas para a OS do próprio cliente; se a posição não estiver disponível,
// mostra o estado com honestidade (sem mapa fake).
export function paginaRastreio(osId, numero) {
  const oid = String(osId || '').replace(/[^a-zA-Z0-9_]/g, '');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Acompanhar coleta — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:640px;margin:0 auto;padding:18px 16px 40px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px}
iframe{width:100%;height:380px;border:1px solid #E4EBE9;border-radius:12px}</style></head>
<body>
<div style="background:#00333B;padding:14px 18px"><div style="max-width:640px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/painel" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">acompanhar coleta</span></a>
  <a href="/painel" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Voltar</a>
</div></div>
<div class="wrap">
  <h1 style="font-size:19px;margin:4px 0 2px">🚚 Sua coleta ${esc(numero || '')}</h1>
  <p style="font-size:12.5px;color:#4F6469;margin:0 0 14px">Acompanhe o caminhão a caminho. A posição atualiza sozinha a cada 20 segundos.</p>
  <div class="card" id="card"><div id="st" style="font-size:13.5px;color:#4F6469">⏳ Buscando a posição do caminhão…</div><div id="mapa" style="margin-top:12px"></div></div>
  <div style="font-size:10.5px;color:#9aa7a4;margin-top:12px;text-align:center">Posição fornecida pelo rastreador do veículo (RotaExata). Pode haver pequeno atraso do sinal.</div>
</div>
<script>
var OS=${JSON.stringify(oid)};
function pinta(d){
  var st=document.getElementById('st'), mapa=document.getElementById('mapa');
  if(!d||!d.ok){
    var m={mapeamento_pendente:'O rastreio em tempo real está em ativação — em breve você acompanha o caminhão por aqui.',
           nao_configurado:'O rastreio em tempo real está em ativação — em breve você acompanha o caminhão por aqui.',
           fora_de_transporte:'Esta coleta não está em transporte agora.',
           sem_veiculo:'O veículo desta coleta ainda não foi designado.',
           login_falhou:'Sem comunicação com o rastreador agora — tentando de novo em instantes…',
           sem_resposta:'Sem comunicação com o rastreador agora — tentando de novo em instantes…',
           sem_posicao:'Sem sinal do rastreador neste momento — tentando de novo em instantes…'};
    st.textContent='ℹ️ '+(m[d&&d.motivo]||'Posição indisponível no momento. Tentando de novo…');
    return;
  }
  var quando=d.atualizadoEm?new Date(d.atualizadoEm):new Date();
  st.innerHTML='🟢 <b>Caminhão localizado</b> · atualizado às '+quando.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(d.velocidade!=null?' · '+Math.round(d.velocidade)+' km/h':'');
  var la=Number(d.lat),lo=Number(d.lng),dl=0.008;
  var bbox=(lo-dl)+','+(la-dl)+','+(lo+dl)+','+(la+dl);
  mapa.innerHTML='<iframe loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent(bbox)+'&layer=mapnik&marker='+encodeURIComponent(la+','+lo)+'"></iframe>';
}
function busca(){
  fetch('/api/os/rastreio?id='+encodeURIComponent(OS)).then(function(r){return r.json();}).then(pinta).catch(function(){});
}
busca(); setInterval(busca, 20000);
</script></body></html>`;
}
