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
  if (c.tipo === 'sigor') {
    lista.push({ cpf: doc, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ cpfCnpj: doc, senha: c.senha, unidade: c.unidade });
    lista.push({ cpf: doc, senha: c.senha, cnpj: c.cnpj, unidade: uniNum });
    lista.push({ cpf: doc, senha: c.senha, unidade: c.unidade });
    lista.push({ cpfCnpj: doc, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
  } else {
    lista.push({ cpf: doc, senha: c.senha, cnpj: c.cnpj, unidade: c.unidade });
    lista.push({ cpf: doc, senha: c.senha, cnpj: c.cnpj, unidade: uniNum });
    lista.push({ cpfCnpj: doc, senha: c.senha, unidade: c.unidade });
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
