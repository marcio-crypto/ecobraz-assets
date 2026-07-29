// Sonda de conexão MTR — SIGOR (CETESB/SP) e SINIR (nacional). SÓ LEITURA.
// GO do Marcio (2026-07-29). Esses sistemas autenticam com as MESMAS credenciais
// do portal web (CNPJ da unidade + CPF do usuário + senha) trocadas por um token.
// A documentação oficial não é acessível do ambiente de desenvolvimento, então a
// sonda testa os caminhos conhecidos da família de sistemas MTR (FEPAM/CETESB/
// SINIR compartilham a mesma base) e REGISTRA A EVIDÊNCIA no D1 — mesmo padrão
// que fechou a integração da RotaExata.
//
// SEGURANÇA (regra rígida do projeto):
//  - Credenciais só saem do cofre (env). NUNCA vão para logs, D1 ou respostas.
//  - Tokens recebidos são MASCARADOS antes de qualquer registro.
//  - Nenhuma chamada de escrita/emissão: só gettoken e consultas de tabelas
//    públicas (classes/acondicionamentos) para provar que o token vale.

const mascara = (s) => { const x = String(s || ''); return x ? `${x.slice(0, 4)}…(${x.length})` : ''; };
const semSegredos = (txt, cfg, token) => {
  let t = String(txt || '');
  for (const v of [cfg.senha, cfg.email, cfg.cpf, cfg.cnpj, token]) {
    if (v && t.includes(v)) t = t.split(v).join('▮▮▮');
  }
  return t;
};

const SISTEMAS = (env) => {
  const out = [];
  if (env.SIGOR_CNPJ || env.SIGOR_CPF || env.SIGOR_SENHA) {
    out.push({
      // DESCOBERTA (2026-07-29, manual oficial CETESB v1.15): a API NÃO fica no
      // host do site (mtr.cetesb...) e sim em mtrr.cetesb... (dois "r").
      // Produção: mtrr.cetesb.sp.gov.br · Homologação: mtrr-hom.cetesb.sp.gov.br
      nome: 'SIGOR (CETESB/SP)', base: String(env.SIGOR_BASE || 'https://mtrr.cetesb.sp.gov.br').replace(/\/+$/, ''), tipo: 'sigor',
      email: String(env.SIGOR_EMAIL || '').trim(), cnpj: String(env.SIGOR_CNPJ || '').replace(/\D/g, ''),
      cpf: String(env.SIGOR_CPF || '').replace(/\D/g, ''), senha: String(env.SIGOR_SENHA || ''),
      unidade: String(env.SIGOR_UNIDADE || '').replace(/\D/g, ''),
      caminhos: ['/apiws/rest/gettoken'],
    });
  }
  if (env.SINIR_CNPJ || env.SINIR_CPF || env.SINIR_SENHA) {
    out.push({
      // DESCOBERTA (2026-07-29, pacote oficial de tipos v1.15): o host da API do
      // SINIR é admin.sinir.gov.br (não mtr.sinir.gov.br, que é só o site).
      nome: 'SINIR (nacional)', base: String(env.SINIR_BASE || 'https://admin.sinir.gov.br').replace(/\/+$/, ''), tipo: 'sinir',
      email: String(env.SINIR_EMAIL || '').trim(), cnpj: String(env.SINIR_CNPJ || '').replace(/\D/g, ''),
      cpf: String(env.SINIR_CPF || '').replace(/\D/g, ''), senha: String(env.SINIR_SENHA || ''),
      unidade: String(env.SINIR_UNIDADE || '').replace(/\D/g, ''),
      caminhos: ['/apiws/rest/gettoken'],
    });
  }
  return out;
};

// Contrato do GetToken (plataforma MTR compartilhada por CETESB/SINIR/estados).
// O web SERVICE (API) autentica com o CPF do usuário — mesmo que o site humano
// use e-mail. Como o manual oficial está bloqueado do nosso ambiente, tentamos
// as variações de nomenclatura documentadas (cpf / cpfCnpj), com e sem CNPJ,
// unidade como texto e como número (algumas versões exigem número).
const CORPOS = (c) => {
  const lista = [];
  const doc = c.cpf || c.email; // a API usa o CPF do usuário
  const uniNum = /^\d+$/.test(c.unidade) ? Number(c.unidade) : c.unidade;
  // Campo confirmado pela própria API (D1 id 33): "cpfCnpj deve ser informado".
  if (c.tipo === 'sigor') {
    lista.push({ cpfCnpj: doc, senha: c.senha, unidade: uniNum });
    lista.push({ cpfCnpj: doc, senha: c.senha, unidade: c.unidade });
    lista.push({ cpfCnpj: doc, senha: c.senha, cnpj: c.cnpj, unidade: uniNum });
    lista.push({ cpfCnpj: c.cnpj, senha: c.senha, unidade: uniNum });
  } else {
    lista.push({ cpfCnpj: doc, senha: c.senha, unidade: uniNum });
    lista.push({ cpf: doc, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ cpfCnpj: doc, senha: c.senha, cnpj: c.cnpj, unidade: uniNum });
  }
  return lista;
};
// Consultas INOFENSIVAS (tabelas de domínio) para provar que o token funciona.
// Nomes oficiais confirmados no pacote de tipos v1.15 (idêntico ao manual).
const CAMINHOS_CONSULTA = [
  '/apiws/rest/retornaListaClasse',
  '/apiws/rest/retornaListaAcondicionamento',
  '/apiws/rest/retornaListaUnidade',
];

function acharToken(corpo) {
  const t = String(corpo || '');
  const m = t.match(/"(?:token|objetoResposta|objetoretorno|Token)"\s*:\s*"([^"]{10,})"/i);
  if (m) return m[1];
  // Alguns sistemas devolvem o token como texto puro.
  const puro = t.trim().replace(/^"|"$/g, '');
  if (/^[A-Za-z0-9._\-]{20,}$/.test(puro)) return puro;
  return '';
}

export async function sondaMTR(env) {
  const sistemas = SISTEMAS(env);
  if (!sistemas.length) {
    return { ok: false, error: 'sem_credenciais', message: 'Nenhuma credencial no cofre ainda. Adicione SIGOR_CNPJ, SIGOR_CPF e SIGOR_SENHA (ou SINIR_…) nas Variáveis e segredos do worker e tente de novo.' };
  }
  const resultado = { ok: false, sistemas: [] };
  for (const cfg of sistemas) {
    // A API autentica por CPF (e-mail é reserva). Precisa de senha, CNPJ e unidade.
    const temDoc = cfg.cpf || cfg.email;
    const faltando = [];
    if (!temDoc) faltando.push('CPF do usuário');
    if (!cfg.senha) faltando.push('senha');
    if (!cfg.cnpj) faltando.push('CNPJ');
    if (!cfg.unidade) faltando.push(cfg.tipo === 'sigor' ? 'código da unidade' : 'unidade');
    const reg = { sistema: cfg.nome, base: cfg.base, tentativas: [], autenticou: false, consulta: null, faltando };
    if (faltando.length) { resultado.sistemas.push(reg); continue; }
    let token = '';
    for (const caminho of (cfg.caminhos || ['/apiws/rest/gettoken'])) {
      if (token) break;
      for (const corpo of CORPOS(cfg)) {
        if (token) break;
        const url = cfg.base + caminho;
        try {
          // Servidor do governo pode ser lento — paciência de 20s por tentativa.
          const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(20000) });
          const txt = await r.text();
          const t = acharToken(txt);
          reg.tentativas.push({ url: caminho, campos: Object.keys(corpo).join(','), status: r.status, corpoInicio: semSegredos(txt, cfg, t).slice(0, 160), temToken: !!t });
          if (t) { token = t; reg.autenticou = true; reg.tokenMascarado = mascara(t); } // esta API pode devolver token com status != 200
          // A API da CETESB responde erro de campo com status 404 MAS corpo JSON.
          // Só desistimos deste caminho quando a resposta é do servidor web (HTML),
          // não da aplicação (JSON) — senão pularíamos o formato certo cedo demais.
          const ehRespostaApp = txt.trim().startsWith('{') || txt.trim().startsWith('[');
          if ((r.status === 404 || r.status === 405) && !ehRespostaApp) break;
        } catch (e) {
          reg.tentativas.push({ url: caminho, campos: Object.keys(corpo).join(','), erro: String(e && e.message || e).slice(0, 80) });
        }
        if (reg.tentativas.length >= 10) break; // teto de segurança
      }
      if (reg.tentativas.length >= 10) break;
    }
    // Prova de vida do token: uma consulta de tabela de domínio (só leitura).
    if (token) {
      for (const caminho of CAMINHOS_CONSULTA) {
        try {
          const r = await fetch(cfg.base + caminho, { headers: { Authorization: token, accept: 'application/json' }, signal: AbortSignal.timeout(9000) });
          const txt = await r.text();
          reg.consulta = { url: caminho, status: r.status, corpoInicio: semSegredos(txt, cfg, token).slice(0, 140) };
          if (r.status === 200) break;
        } catch (e) { reg.consulta = { url: caminho, erro: String(e && e.message || e).slice(0, 80) }; }
      }
    }
    resultado.sistemas.push(reg);
    if (reg.autenticou) resultado.ok = true;
  }
  // Evidência no D1 (auditável remotamente) — sem nenhum segredo.
  try {
    if (env.DB_PLOOMES) {
      await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
      await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
        .bind('mtr-sonda', new Date().toISOString(), JSON.stringify(resultado).slice(0, 60000)).run();
    }
  } catch { /* evidência é best-effort */ }
  const semCampos = resultado.sistemas.filter((s) => s.faltando && s.faltando.length);
  resultado.message = resultado.ok
    ? `✅ Autenticou no ${resultado.sistemas.find((s) => s.autenticou).sistema} — integração viável. Próximo passo: consulta de MTRs reais.`
    : semCampos.length
      ? `Falta cadastrar no cofre: ${semCampos.map((s) => `${s.sistema} → ${s.faltando.join(', ')}`).join(' · ')}.`
      : 'Ainda não autenticou. As respostas do órgão ficaram gravadas para eu analisar — nenhum dado foi exposto.';
  return resultado;
}

// ---------------------------------------------------------------------------
// ETAPA 1 — CONSULTA de MTRs (SIGOR). Token reaproveitável + sonda de leitura.
// ---------------------------------------------------------------------------
// TOKEN em cache no KV (o manual pede para NÃO chamar gettoken a cada requisição).
// Contrato PROVADO ao vivo (D1 id 34): POST mtrr/apiws/rest/gettoken
// { cpfCnpj, senha, unidade(número) } → objetoResposta = token (usar cru no header).
// Token de UM sistema (sigor OU sinir), com cache no KV por 1h.
async function tokenDe(env, cfg, { forcar } = {}) {
  if (!cfg || !(cfg.cpf || cfg.email) || !cfg.senha || !cfg.unidade) return null;
  const chave = `mtr:${cfg.tipo}:token`;
  if (!forcar && env.PORTAL_KV) { const c = await env.PORTAL_KV.get(chave); if (c) return c; }
  const doc = cfg.cpf || cfg.email;
  const uni = /^\d+$/.test(cfg.unidade) ? Number(cfg.unidade) : cfg.unidade;
  try {
    const r = await fetch(cfg.base + '/apiws/rest/gettoken', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ cpfCnpj: doc, senha: cfg.senha, unidade: uni }), signal: AbortSignal.timeout(20000),
    });
    const t = acharToken(await r.text());
    if (t && env.PORTAL_KV) await env.PORTAL_KV.put(chave, t, { expirationTtl: 3600 });
    return t || null;
  } catch { return null; }
}
export async function tokenSigor(env, opts) { return tokenDe(env, SISTEMAS(env).find((s) => s.tipo === 'sigor'), opts); }

// CONSTATAÇÃO (pacote oficial de tipos v1.15): a API do SIGOR/SINIR NÃO tem
// endpoint de "listar/pescar manifestos". A consulta é sempre POR NÚMERO:
//   - retornaManifesto/{numero}          → dados do MTR
//   - retornaManifestoSeuCodigo/{codigo} → por referência própria do gerador
//   - downloadManifesto/{numero}         → PDF oficial
// Ou seja: para anexar o MTR do cliente, precisamos do NÚMERO do MTR (o cliente
// informa, ou a Ecobraz emite via salvarManifestoLote e recebe o número). Não dá
// para "descobrir" MTRs às cegas — é uma característica da API, não uma limitação
// nossa. Isso torna o vínculo mais preciso (chave exata, sem casar por CNPJ+data).
const soDigitos = (s) => String(s || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 40);
const soNum = (s) => String(s || '').replace(/\D/g, '');
// epoch ms → dd/mm/aaaa (a API devolve datas como número).
const dataDeEpoch = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};
// Extrai um resumo SEGURO e útil do objetoResposta do retornaManifesto.
function resumoManifesto(obj, num) {
  const par = (p) => (p && (p.parDescricao || p.parRazaoSocial || p.parNome)) || '';
  // Documento do parceiro: PJ (parCnpj) ou PF (parCpf) — a MTR aceita os dois.
  const parDoc = (p) => (p && (p.parCnpj || p.parCpfCnpj || p.parCpf || p.parDocumento)) || '';
  return {
    numero: obj.manNumero || num,
    situacao: (obj.situacaoManifesto && obj.situacaoManifesto.simDescricao) || '',
    gerador: par(obj.parceiroGerador), geradorCnpj: parDoc(obj.parceiroGerador),
    transportador: par(obj.parceiroTransportador),
    destinador: par(obj.parceiroDestinador), destinadorCnpj: parDoc(obj.parceiroDestinador),
    emissao: dataDeEpoch(obj.manData), expedicao: dataDeEpoch(obj.manDataExpedicao),
    motorista: obj.manNomeMotorista || '', placa: obj.manPlacaVeiculo || '',
    cdf: obj.cdfCodigo || obj.cdfNumero || '',
    qtdResiduos: Array.isArray(obj.listaManifestoResiduo) ? obj.listaManifestoResiduo.length : null,
  };
}

// Consulta retornaManifesto em UM sistema.
async function consultarEm(env, cfg, num) {
  const token = await tokenDe(env, cfg);
  if (!token) return { erroToken: true, sistema: cfg.nome };
  try {
    const r = await fetch(`${cfg.base}/apiws/rest/retornaManifesto/${encodeURIComponent(num)}`, { headers: { Authorization: token, accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    const txt = await r.text();
    let dado = null; try { dado = JSON.parse(txt); } catch { /* não-JSON */ }
    const obj = dado && dado.objetoResposta;
    if (r.status === 200 && obj && !dado.erro) return { ok: true, sistema: cfg.tipo, nomeSistema: cfg.nome, resumo: resumoManifesto(obj, num) };
    return { ok: false, sistema: cfg.nome, status: r.status, mensagem: (dado && (dado.mensagem || dado.restResponseMensagem)) || `HTTP ${r.status}`, corpoInicio: semSegredos(txt, cfg, token).slice(0, 160) };
  } catch (e) { return { ok: false, sistema: cfg.nome, erro: String(e && e.message || e).slice(0, 100) }; }
}

// Consulta uma MTR por número tentando OS DOIS sistemas (SIGOR e SINIR): um MTR
// vive em um só (SP começa com "26" no SIGOR; nacional/outros no SINIR).
export async function consultarMtrSigor(env, numero) {
  const num = soDigitos(numero);
  if (!num) return { ok: false, error: 'sem_numero', message: 'Informe o número da MTR para consultar (a API do órgão consulta por número, não tem listagem).' };
  const sistemas = SISTEMAS(env);
  if (!sistemas.length) return { ok: false, error: 'sem_config', message: 'MTR não está configurado no cofre.' };
  const out = { ok: false, numero: num, tentativas: [] };
  let ultima = null;
  for (const cfg of sistemas) {
    const res = await consultarEm(env, cfg, num);
    out.tentativas.push({ sistema: res.sistema, ok: !!res.ok, status: res.status, mensagem: res.mensagem, erroToken: !!res.erroToken, corpoInicio: res.corpoInicio });
    if (res.ok) { out.ok = true; out.resumo = res.resumo; out.sistema = res.sistema; out.nomeSistema = res.nomeSistema; break; }
    ultima = res;
  }
  // Evidência no D1 — token/segredos já vêm mascarados.
  try {
    if (env.DB_PLOOMES) {
      await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
      await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
        .bind('mtr-consulta', new Date().toISOString(), JSON.stringify(out).slice(0, 20000)).run();
    }
  } catch { /* best-effort */ }
  out.message = out.ok
    ? `✅ MTR ${out.resumo.numero} encontrada no ${out.nomeSistema} — gerador: ${out.resumo.gerador || '(n/d)'} · situação: ${out.resumo.situacao || '(n/d)'}.`
    : `Não consegui ler a MTR ${num} em nenhum dos sistemas: ${(ultima && (ultima.mensagem || ultima.erro)) || 'sem resposta'}.`;
  return out;
}

// Baixa o PDF oficial (downloadManifesto) de UM sistema.
async function baixarPdfEm(env, cfg, num) {
  const token = await tokenDe(env, cfg);
  if (!token) return { erro: 'sem_token' };
  try {
    const r = await fetch(`${cfg.base}/apiws/rest/downloadManifesto/${encodeURIComponent(num)}`, { headers: { Authorization: token, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (r.status !== 200) return { erro: `HTTP ${r.status}` };
    const ct = r.headers.get('content-type') || '';
    if (/application\/pdf|octet-stream/i.test(ct)) {
      const buf = new Uint8Array(await r.arrayBuffer());
      return buf.length > 100 ? { bytes: buf } : { erro: 'pdf_vazio' };
    }
    const txt = await r.text();
    let b64 = '';
    try { const j = JSON.parse(txt); b64 = (j && (j.objetoResposta || j.arquivo || j.pdf)) || ''; }
    catch { b64 = txt.trim().replace(/^"|"$/g, ''); }
    b64 = String(b64).replace(/^data:.*?;base64,/, '');
    if (!/^[A-Za-z0-9+/=\s]{200,}$/.test(b64)) return { erro: 'sem_pdf_reconhecivel' };
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return bytes.length > 100 ? { bytes } : { erro: 'pdf_vazio' };
  } catch (e) { return { erro: String(e && e.message || e).slice(0, 80) }; }
}
// Baixa o PDF do sistema informado (tipo), ou tenta os dois se não souber.
// Best-effort: nunca derruba o fluxo — o número/dados já valem sem o PDF.
export async function baixarPdfManifesto(env, numero, tipo) {
  const num = soDigitos(numero);
  if (!num) return null;
  const sistemas = SISTEMAS(env);
  const ordenados = tipo ? sistemas.filter((s) => s.tipo === tipo).concat(sistemas.filter((s) => s.tipo !== tipo)) : sistemas;
  let ultimo = null;
  for (const cfg of ordenados) {
    const res = await baixarPdfEm(env, cfg, num);
    if (res && res.bytes) return res;
    ultimo = res;
  }
  return ultimo;
}

// Consulta um MTR e devolve só o resumo seguro (para vincular à OS).
export async function dadosManifesto(env, numero) {
  const j = await consultarMtrSigor(env, numero);
  return j.ok ? j.resumo : null;
}
