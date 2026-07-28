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

async function req(url, opts = {}, timeoutMs = 9000) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
    const ct = r.headers.get('content-type') || '';
    let corpo = null, texto = '';
    if (/json/i.test(ct)) { try { corpo = await r.json(); } catch { corpo = null; } }
    else { texto = corte(await r.text().catch(() => ''), 300); }
    return { status: r.status, ct, corpo, texto };
  } catch (e) {
    return { status: 0, erro: (e && e.name === 'TimeoutError') ? 'tempo esgotado' : corte((e && e.message) || 'falha', 120) };
  }
}

// --- SONDA (Diretoria) ------------------------------------------------------
// Nunca inclui credenciais no retorno. Mostra: spec (servidores/segurança/rotas),
// tentativas de login e de leitura de posições — só status + estrutura.
export async function sondaRotaExata(env) {
  const out = { configurado: rotaexataConfigurado(env), pronto: ROTAEXATA_PRONTO, spec: null, tentativas: [], dica: '' };

  // 1) Documentação oficial (SwaggerHub) — pública, sem credencial.
  const candidatosSpec = [`${SPEC_URL}/0.0.6`, SPEC_URL];
  for (const u of candidatosSpec) {
    const r = await req(u, { headers: { accept: 'application/json' } });
    if (r.status === 200 && r.corpo) {
      const spec = r.corpo;
      const servers = (spec.servers || []).map((s) => s && s.url).filter(Boolean);
      const host = spec.host ? [`https://${spec.host}${spec.basePath || ''}`] : [];
      const seg = spec.components && spec.components.securitySchemes ? spec.components.securitySchemes : (spec.securityDefinitions || {});
      const seguranca = Object.entries(seg).map(([k, v]) => ({ nome: k, tipo: v && v.type, esquema: v && (v.scheme || v.in || '') }));
      const paths = [];
      for (const [p, metodos] of Object.entries(spec.paths || {})) {
        for (const [m, def] of Object.entries(metodos || {})) {
          if (!/^(get|post|put|delete|patch)$/i.test(m)) continue;
          paths.push({ metodo: m.toUpperCase(), path: p, resumo: corte((def && (def.summary || def.description)) || '', 90) });
        }
      }
      out.spec = { origem: u, titulo: corte(spec.info && spec.info.title, 80), versao: corte(spec.info && spec.info.version, 20), servidores: [...servers, ...host], seguranca, totalRotas: paths.length, rotas: paths.slice(0, 40) };
      break;
    }
    out.tentativas.push({ passo: 'documentação', url: u, status: r.status || 0, detalhe: r.erro || corte(r.texto, 120) });
  }

  if (!out.configurado) {
    out.dica = 'Cadastre os Secrets ROTAEXATA_USER e ROTAEXATA_SENHA na Cloudflare para a sonda testar o login.';
    return out;
  }

  // 2) Bases candidatas: as da documentação + reservas conhecidas.
  const bases = [...new Set([...(out.spec ? out.spec.servidores : []), ...BASES_RESERVA])].filter(Boolean).slice(0, 4);
  const user = env.ROTAEXATA_USER, senha = env.ROTAEXATA_SENHA;
  const basic = 'Basic ' + btoa(`${user}:${senha}`);

  // Rotas de login sugeridas pela documentação (ou padrões comuns).
  const rotasLogin = [];
  if (out.spec) for (const r of out.spec.rotas) if (r.metodo === 'POST' && /(login|auth|token|sessao|session)/i.test(r.path)) rotasLogin.push(r.path);
  if (!rotasLogin.length) rotasLogin.push('/login', '/auth/login', '/api/login', '/token');
  const corposLogin = [
    { login: user, senha }, { email: user, senha }, { username: user, password: senha }, { user, password: senha }, { usuario: user, senha },
  ];

  let token = '', tokenDe = '';
  fora:
  for (const base of bases) {
    for (const rota of rotasLogin.slice(0, 4)) {
      for (const corpo of corposLogin) {
        const r = await req(base.replace(/\/+$/, '') + rota, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corpo) }, 8000);
        const chavesCorpo = Object.keys(corpo).join('+');
        if (r.status >= 200 && r.status < 300 && r.corpo) {
          const t = r.corpo.token || r.corpo.access_token || r.corpo.accessToken || r.corpo.jwt || (r.corpo.data && (r.corpo.data.token || r.corpo.data.access_token)) || '';
          out.tentativas.push({ passo: 'login', url: base + rota, corpo: chavesCorpo, status: r.status, estrutura: estrutura(r.corpo), achouToken: !!t });
          if (t) { token = String(t); tokenDe = base; break fora; }
        } else if (r.status && r.status !== 404) {
          out.tentativas.push({ passo: 'login', url: base + rota, corpo: chavesCorpo, status: r.status, detalhe: r.erro || corte(r.texto, 100) });
        }
      }
    }
  }

  // 3) Leitura de posições/veículos — Bearer (se achou token) e Basic.
  const rotasPos = [];
  if (out.spec) for (const r of out.spec.rotas) if (r.metodo === 'GET' && /(veicul|vehicle|posi|position|localiza|rastre|last|atual)/i.test(r.path)) rotasPos.push(r.path);
  if (!rotasPos.length) rotasPos.push('/veiculos', '/v1/veiculos', '/posicoes', '/veiculos/posicoes');
  const auths = [];
  if (token) auths.push({ nome: 'Bearer (token do login)', header: { authorization: `Bearer ${token}` }, base: tokenDe });
  auths.push({ nome: 'Basic (login:senha)', header: { authorization: basic }, base: '' });

  for (const a of auths) {
    const basesTeste = a.base ? [a.base] : bases;
    for (const base of basesTeste) {
      for (const rota of rotasPos.slice(0, 4)) {
        const r = await req(base.replace(/\/+$/, '') + rota, { headers: { ...a.header, accept: 'application/json' } }, 8000);
        if (r.status === 0) { out.tentativas.push({ passo: 'posições', auth: a.nome, url: base + rota, status: 0, detalhe: r.erro }); continue; }
        out.tentativas.push({ passo: 'posições', auth: a.nome, url: base + rota, status: r.status, estrutura: r.corpo ? estrutura(r.corpo) : undefined, detalhe: r.corpo ? undefined : corte(r.texto, 100) });
        if (r.status >= 200 && r.status < 300 && r.corpo) { out.dica = 'ACHOU! Me mande o print desta tela que eu fixo o mapeamento e ligo o rastreio para o cliente.'; return out; }
      }
    }
  }
  if (!out.dica) out.dica = 'Nenhuma rota respondeu 200 ainda. Me mande o print desta tela — com os códigos acima eu ajusto a próxima tentativa.';
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
  <div style="font-size:11.5px;color:#8fa39f">Depois de rodar, me mande o <b>print do resultado</b> — com ele eu fixo o mapeamento e ligo o botão “Acompanhar o caminhão” no portal do cliente.</div>
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
