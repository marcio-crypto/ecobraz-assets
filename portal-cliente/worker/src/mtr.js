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
      nome: 'SIGOR (CETESB/SP)', base: 'https://mtr.cetesb.sp.gov.br', tipo: 'sigor',
      email: String(env.SIGOR_EMAIL || '').trim(), cnpj: String(env.SIGOR_CNPJ || '').replace(/\D/g, ''),
      cpf: String(env.SIGOR_CPF || '').replace(/\D/g, ''), senha: String(env.SIGOR_SENHA || ''),
      unidade: String(env.SIGOR_UNIDADE || '').replace(/\D/g, ''),
      caminhos: ['/api/apiws/rest/gettoken', '/apiws/rest/gettoken'],
    });
  }
  if (env.SINIR_CNPJ || env.SINIR_CPF || env.SINIR_SENHA) {
    out.push({
      nome: 'SINIR (nacional)', base: 'https://mtr.sinir.gov.br', tipo: 'sinir',
      email: String(env.SINIR_EMAIL || '').trim(), cnpj: String(env.SINIR_CNPJ || '').replace(/\D/g, ''),
      cpf: String(env.SINIR_CPF || '').replace(/\D/g, ''), senha: String(env.SINIR_SENHA || ''),
      unidade: String(env.SINIR_UNIDADE || '').replace(/\D/g, ''),
      caminhos: ['/apiws/rest/gettoken', '/mtrservice/rest/gettoken', '/apiws/rest/getToken', '/api/apiws/rest/gettoken'],
    });
  }
  return out;
};

// Contrato descoberto com o Marcio (2026-07-29): o login é de 4 CAMPOS.
//  - SIGOR/CETESB: e-mail, senha, CNPJ e código da unidade (D1 id 31: o endpoint
//    /api/apiws/rest/gettoken respondeu 401 = existe, só faltava e-mail + 4º campo).
//  - SINIR: CNPJ, unidade, CPF do usuário e senha.
// Como o 401 não devolve dica do nome dos campos, tentamos as variações mais
// prováveis de nomenclatura — todas com os 4 valores certos.
const CORPOS = (c) => {
  const lista = [];
  if (c.tipo === 'sigor') {
    const login = c.email || c.cpf; // SIGOR loga por e-mail
    lista.push({ login, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ email: login, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ login, senha: c.senha, cnpj: c.cnpj, codigoUnidade: c.unidade });
    lista.push({ cpf: login, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ email: login, senha: c.senha, cnpj: c.cnpj, codigo: c.unidade });
  } else {
    // SINIR: CNPJ + unidade + CPF do usuário + senha.
    lista.push({ cpf: c.cpf, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ login: c.cpf, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ cpf: c.cpf, senha: c.senha, cnpj: c.cnpj, codigoUnidade: c.unidade });
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
    // SIGOR loga por e-mail; SINIR por CPF. Ambos precisam de senha, CNPJ e unidade.
    const obrig = cfg.tipo === 'sigor' ? { email: 'e-mail', senha: 'senha', cnpj: 'CNPJ', unidade: 'código da unidade' } : { cpf: 'CPF', senha: 'senha', cnpj: 'CNPJ', unidade: 'unidade' };
    const faltando = Object.keys(obrig).filter((k) => !cfg[k]).map((k) => obrig[k]);
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
          reg.tentativas.push({ url: caminho, campos: Object.keys(corpo).join(','), status: r.status, corpoInicio: semSegredos(txt, cfg, t).slice(0, 140), temToken: !!t });
          if (r.status === 200 && t) { token = t; reg.autenticou = true; reg.tokenMascarado = mascara(t); }
          if (r.status === 404 || r.status === 405) break; // caminho errado — tenta o próximo caminho, não os outros corpos
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
