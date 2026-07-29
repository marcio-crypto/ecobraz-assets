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
      nome: 'SINIR (nacional)', base: String(env.SINIR_BASE || 'https://mtr.sinir.gov.br').replace(/\/+$/, ''), tipo: 'sinir',
      email: String(env.SINIR_EMAIL || '').trim(), cnpj: String(env.SINIR_CNPJ || '').replace(/\D/g, ''),
      cpf: String(env.SINIR_CPF || '').replace(/\D/g, ''), senha: String(env.SINIR_SENHA || ''),
      unidade: String(env.SINIR_UNIDADE || '').replace(/\D/g, ''),
      caminhos: ['/apiws/rest/gettoken', '/controller/rest/gettoken'],
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
const CAMINHOS_CONSULTA = [
  '/apiws/rest/retornaListaClasse',
  '/apiws/rest/retornaListaAcondicionamento',
  '/apiws/rest/retornaListaUnidadeMedida',
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
export async function tokenSigor(env, { forcar } = {}) {
  const cfg = SISTEMAS(env).find((s) => s.tipo === 'sigor');
  if (!cfg || !(cfg.cpf || cfg.email) || !cfg.senha || !cfg.unidade) return null;
  if (!forcar && env.PORTAL_KV) {
    const cached = await env.PORTAL_KV.get('mtr:sigor:token');
    if (cached) return cached;
  }
  const doc = cfg.cpf || cfg.email;
  const uni = /^\d+$/.test(cfg.unidade) ? Number(cfg.unidade) : cfg.unidade;
  try {
    const r = await fetch(cfg.base + '/apiws/rest/gettoken', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ cpfCnpj: doc, senha: cfg.senha, unidade: uni }), signal: AbortSignal.timeout(20000),
    });
    const t = acharToken(await r.text());
    if (t && env.PORTAL_KV) await env.PORTAL_KV.put('mtr:sigor:token', t, { expirationTtl: 3600 }); // 1h
    return t || null;
  } catch { return null; }
}

// Candidatos de endpoint para LISTAR manifestos do destinador (a descobrir).
// Cada item: [método, caminho, corpo?]. Só LEITURA de consulta — nada é emitido.
const CONSULTA_MTR_CANDIDATOS = (cnpj, di, df) => [
  ['GET', '/apiws/rest/retornaManifestosPendentes', null],
  ['GET', '/apiws/rest/manifestosPendentes', null],
  ['GET', '/apiws/rest/retornaManifestoPendente', null],
  ['GET', `/apiws/rest/retornaManifestosPorDestinador/${cnpj}`, null],
  ['POST', '/apiws/rest/retornaManifestosPorPeriodo', { dataInicial: di, dataFinal: df }],
  ['POST', '/apiws/rest/manifestosPorPeriodo', { dataInicial: di, dataFinal: df, cpfCnpj: cnpj }],
  ['POST', '/apiws/rest/retornaListaMTRporPeriodo', { dataInicial: di, dataFinal: df }],
  ['GET', '/apiws/rest/retornaManifestosArmazenamento', null],
];
const dataBR = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

export async function consultarMtrSigor(env) {
  const cfg = SISTEMAS(env).find((s) => s.tipo === 'sigor');
  if (!cfg) return { ok: false, error: 'sem_sigor', message: 'SIGOR não está configurado no cofre.' };
  const token = await tokenSigor(env, { forcar: true });
  if (!token) return { ok: false, error: 'sem_token', message: 'Não consegui autenticar no SIGOR agora. Rode o "Testar conexão MTR" antes.' };
  // Janela dos últimos 30 dias (a data de "hoje" vem do ambiente do Worker).
  const hoje = env.__AGORA__ ? new Date(env.__AGORA__) : new Date();
  const ini = new Date(hoje.getTime() - 30 * 86400e3);
  const cnpj = cfg.cnpj;
  const out = { ok: false, achou: null, tentativas: [] };
  for (const [metodo, caminho, corpo] of CONSULTA_MTR_CANDIDATOS(cnpj, dataBR(ini), dataBR(hoje))) {
    try {
      const opts = { method: metodo, headers: { Authorization: token, accept: 'application/json' }, signal: AbortSignal.timeout(15000) };
      if (corpo) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(corpo); }
      const r = await fetch(cfg.base + caminho, opts);
      const txt = await r.text();
      const ehJson = txt.trim().startsWith('{') || txt.trim().startsWith('[');
      const temLista = /"objetoResposta"\s*:\s*\[/.test(txt) || txt.trim().startsWith('[');
      out.tentativas.push({ metodo, caminho, status: r.status, ehJson, temLista, corpoInicio: semSegredos(txt, cfg, token).slice(0, 180) });
      if (r.status === 200 && temLista) { out.ok = true; out.achou = { metodo, caminho }; break; }
    } catch (e) {
      out.tentativas.push({ metodo, caminho, erro: String(e && e.message || e).slice(0, 80) });
    }
  }
  // Evidência no D1 — token/segredos já vêm mascarados.
  try {
    if (env.DB_PLOOMES) {
      await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
      await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
        .bind('mtr-consulta', new Date().toISOString(), JSON.stringify(out).slice(0, 60000)).run();
    }
  } catch { /* best-effort */ }
  out.message = out.ok
    ? `✅ Encontrei o endereço de consulta de MTRs (${out.achou.caminho}). Vou montar o anexo automático nas OS.`
    : 'Ainda não achei o endereço certo de listagem — as respostas ficaram gravadas para eu analisar e ajustar.';
  return out;
}
