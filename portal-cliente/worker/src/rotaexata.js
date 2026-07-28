// Integração RotaExata — rastreamento do caminhão em tempo real para o cliente.
//
// SEGURANÇA (regra rígida do projeto): o login e a senha do RotaExata vivem SÓ nos
// Secrets da Cloudflare (ROTAEXATA_USER / ROTAEXATA_SENHA). Nunca são impressos,
// logados ou devolvidos em resposta — a sonda mostra apenas STATUS e ESTRUTURA
// (nomes de campos), jamais valores de credencial.
//
// FASES (honestidade sobre o que está pronto):
//  1) SONDA (esta fase): o Worker (que tem internet) lê a documentação oficial da API
//     (SwaggerHub RotaExataSoftware/RotaExata) e testa a autenticação/endpoints com as
//     credenciais do cofre, mostrando a ESTRUTURA da resposta na tela da Diretoria.
//  2) MAPEAMENTO: com o print da sonda, o mapeamento (posição por placa) é fixado no
//     código e ROTAEXATA_PRONTO vira true — aí o botão "Acompanhar o caminhão" acende
//     no portal do cliente. Antes disso, nada aparece para o cliente (sem promessa vazia).

export const ROTAEXATA_PRONTO = false; // vira true quando o mapeamento for confirmado pela sonda

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
  const kw = /(veicul|vehicle|posi|position|localiza|rastre|last|atual|frota|fleet|mapa|monitor|equipamento|dispositivo|tracker|placa)/i;
  let getsSem = [], getsCom = [];
  if (specRaw) {
    for (const [p, met] of Object.entries(specRaw.paths || {})) {
      if (!met || !met.get) continue;
      if (p.includes('{')) { if (kw.test(p)) getsCom.push(p); }
      else getsSem.push(p);
    }
    getsSem.sort((a, b) => (kw.test(b) ? 1 : 0) - (kw.test(a) ? 1 : 0));
  }
  if (!getsSem.length) getsSem = ['/veiculos', '/posicoes', '/veiculos/posicoes'];

  const auths = [];
  if (token && headerChave) auths.push({ nome: `chave crua no ${headerChave}`, header: { [headerChave]: token } });
  if (token) auths.push({ nome: 'Bearer', header: { authorization: `Bearer ${token}` } });
  if (cookie) auths.push({ nome: 'cookie de sessão', header: { cookie } });
  auths.push({ nome: 'Basic (login:senha)', header: { authorization: 'Basic ' + btoa(`${user}:${senha}`) } });

  const basePos = (baseOk || bases[0] || 'https://api.rotaexata.com.br').replace(/\/+$/, '');
  const ehPosicao = (est) => { const s = JSON.stringify(est || {}); return /lat/i.test(s) && /(lng|lon)/i.test(s); };
  const extraiId = (corpo) => {
    const item = Array.isArray(corpo) ? corpo[0] : (corpo && ((corpo.data && corpo.data[0]) || (corpo.items && corpo.items[0]) || (corpo.veiculos && corpo.veiculos[0])));
    if (!item || typeof item !== 'object') return null;
    return item.id ?? item._id ?? item.veiculoId ?? item.deviceId ?? item.codigo ?? null;
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

// --- POSIÇÕES (usada pelo portal do cliente) --------------------------------
// Fica travada até o mapeamento ser confirmado pela sonda (ROTAEXATA_PRONTO=true).
// Quando confirmar, aqui entra a chamada real: autentica, busca as posições e
// devolve normalizado por placa.
export async function posicaoDoVeiculo(env, placa) {
  if (!rotaexataConfigurado(env)) return { ok: false, motivo: 'nao_configurado' };
  if (!ROTAEXATA_PRONTO) return { ok: false, motivo: 'mapeamento_pendente' };
  // (mapeamento real entra aqui após a sonda)
  return { ok: false, motivo: 'mapeamento_pendente', placa: corte(placa, 8) };
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
