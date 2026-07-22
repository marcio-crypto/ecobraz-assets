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
import { LOGO_ESCURO_B64, LOGO_CLARO_B64 } from './logos.js';
import { paginaCalculadora, estimativaCarbono, paginaCalculoDetalhado, calculoDetalhadoGHG } from './carbono.js';
import { criarPreferencia, consultarPagamento } from './mercadopago.js';
import { statusDaEtapa, valorProp, CAMPOS_OS } from './os-utils.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/health') return json({
        ok: true, service: 'ecobraz-portal', version: 5,
        // Só presença (true/false) — NUNCA os valores. Ajuda a confirmar a
        // configuração pelo navegador sem expor segredo nenhum.
        config: {
          ploomes: !!env.PLOOMES_USER_KEY,
          sessao: !!env.PORTAL_SESSION_SECRET,
          email: !!(env.RESEND_API_KEY || env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY),
          resend: !!env.RESEND_API_KEY,
          resendFrom: env.RESEND_FROM || '(padrão acesso@ecobraz.org.br)',
          egoi: !!(env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY),
          baseUrl: !!env.PORTAL_BASE_URL,
          kv: !!env.PORTAL_KV,
          mercadopago: !!env.MERCADOPAGO_ACCESS_TOKEN,
          mercadopagoModo: env.MERCADOPAGO_ACCESS_TOKEN ? (env.MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-') ? 'teste' : 'producao') : null,
          avisoEmail: !!env.PLOOMES_WEBHOOK_SECRET,
        },
      });

      if (pathname === '/assets/logo.png') return servirLogo(LOGO_ESCURO_B64);
      if (pathname === '/assets/logo-claro.png') return servirLogo(LOGO_CLARO_B64);

      // Calculadora de pegada de carbono — Nível 1 (estimativa grátis por CNPJ). Público.
      if (pathname === '/calculadora' && request.method === 'GET') return html(paginaCalculadora());
      if (pathname === '/api/carbono/estimativa' && request.method === 'GET') {
        const resultado = await estimativaCarbono(url.searchParams.get('cnpj') || '', env);
        return json(resultado, resultado.ok ? 200 : 400);
      }
      // Cálculo detalhado — Nível 2 (formulário GHG). Página de teste (será liberada após pagamento).
      if (pathname === '/calculo-detalhado' && request.method === 'GET') return html(paginaCalculoDetalhado());
      if (pathname === '/api/carbono/detalhado' && request.method === 'POST') {
        const corpo = await request.json().catch(() => ({}));
        return json({ ok: true, resultado: calculoDetalhadoGHG(corpo) });
      }
      // Pagamento (Mercado Pago) — cria a cobrança e devolve o link de pagamento.
      // Por ora valor de TESTE (R$1). Depois: precoNivel2 por porte.
      if (pathname === '/api/carbono/pagar' && request.method === 'POST') {
        const valor = Number(env.MP_VALOR_TESTE || 1);
        const pedidoId = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${pedidoId}`, JSON.stringify({ status: 'pendente', valor, criadoEm: nowS() }), { expirationTtl: 86400 });
        try {
          const pref = await criarPreferencia({ valor, descricao: 'Cálculo detalhado de pegada de carbono (teste)', externalReference: pedidoId, baseUrl }, env);
          return json({ ok: true, pedido: pedidoId, init_point: pref.initPoint });
        } catch (error) {
          console.error('mp_criar_falhou', safeError(error));
          return json({ ok: false, error: 'nao_foi_possivel_cobrar', detalhe: String(error?.message || '').slice(0, 220) }, 502);
        }
      }
      // Webhook do Mercado Pago: confirma o pagamento consultando a API (fonte da verdade).
      if (pathname === '/api/mp/webhook') {
        let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || null;
        if (!paymentId && request.method === 'POST') {
          const corpo = await request.json().catch(() => ({}));
          paymentId = corpo?.data?.id || corpo?.id || null;
        }
        if (paymentId && env.PORTAL_KV) {
          const pg = await consultarPagamento(paymentId, env);
          if (pg && pg.status === 'approved' && pg.externalReference) {
            const chave = `pedido:${pg.externalReference}`;
            const raw = await env.PORTAL_KV.get(chave);
            const ped = raw ? JSON.parse(raw) : { status: 'pendente' };
            if (ped.status !== 'pago') {
              ped.status = 'pago'; ped.paymentId = pg.id; ped.pagoEm = nowS();
              await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 7 * 86400 });
              console.log('mp_pago', { pedido: pg.externalReference, valor: pg.valor });
              try { await enviarEmailNF(ped, pg, env); } catch (error) { console.error('nf_email_falhou', safeError(error)); }
            }
          }
        }
        return json({ ok: true }); // sempre 200 para o MP não reenviar sem parar
      }
      // Status do pedido (a página consulta para saber se já foi pago).
      if (pathname === '/api/carbono/pedido' && request.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!env.PORTAL_KV || !id) return json({ ok: false, status: 'desconhecido' }, 400);
        const raw = await env.PORTAL_KV.get(`pedido:${id}`);
        const ped = raw ? JSON.parse(raw) : null;
        return json({ ok: true, status: ped?.status || 'desconhecido' });
      }

      if (pathname === '/' && request.method === 'GET') return await telaInicial(request, env);
      if (pathname === '/entrar' && request.method === 'GET') return await entrarComToken(request, env, url);
      if (pathname === '/api/auth/solicitar' && request.method === 'POST') return await solicitarLink(request, env);
      if (pathname === '/api/auth/sair' && request.method === 'POST') return sair();
      // Aviso ao cliente quando a OS muda de etapa (o Ploomes chama esta rota na automação).
      if (pathname === '/api/ploomes/webhook' && request.method === 'POST') return await webhookPloomes(request, env);
      if (pathname === '/api/ploomes/webhook' && request.method === 'GET') return await webhookUltimo(request, env);

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
      if (pathname === '/api/perfil' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await perfilCliente(sessao, env);
      }
      if (pathname === '/api/os/solicitar' && request.method === 'POST') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await solicitarOS(request, sessao, env);
      }
      if (pathname === '/api/cep' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await consultaCep(request, env);
      }
      if (pathname === '/api/os/docs' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await listarDocsOS(url, sessao, env);
      }
      if (pathname === '/api/os/doc' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await baixarDocOS(url, sessao, env);
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
  // A OS é o Negócio; o status vem da ETAPA (mapeamento agnóstico ao funil). Os campos
  // operacionais (nº da OS, peso, data de coleta) vêm das OtherProperties — descobertos
  // na inspeção 2026-07-22 (ver os-utils.js).
  const clienteId = Number(sessao.empresaId || sessao.contactId);
  const url = `${base}/Deals?$filter=ContactId%20eq%20${clienteId}&$top=100&$orderby=CreateDate%20desc&$expand=OtherProperties,Stage`;
  const r = await fetch(url, { headers });
  if (!r.ok) { console.error('deals_erro', r.status); return json({ ok: false, error: 'ploomes_indisponivel' }, 502); }
  const kNum = env.PLOOMES_FIELD_OS_NUMERO || CAMPOS_OS.numero;
  const kPeso = env.PLOOMES_FIELD_OS_PESO || CAMPOS_OS.peso;
  const kData = env.PLOOMES_FIELD_OS_DATA_COLETA || CAMPOS_OS.dataColeta;
  const linhas = ((await r.json()).value || [])
    .map((d) => {
      const etapa = d.Stage?.Name || '';
      return {
        id: d.Id,
        numeroOS: valorProp(d.OtherProperties, kNum),
        titulo: d.Title || `Atendimento ${d.Id}`,
        etapa,
        status: statusDaEtapa(etapa),
        peso: valorProp(d.OtherProperties, kPeso),
        dataColeta: valorProp(d.OtherProperties, kData),
        aberturaISO: d.CreateDate || null,
        conclusaoISO: d.FinishDate || null,
      };
    })
    .filter((o) => o.status !== 'Em negociação'); // só OS de verdade (da etapa "ordem de serviço" em diante)
  return json({ ok: true, os: linhas });
}

// Classifica um documento pelo NOME e diz se o CLIENTE pode ver — e se depende de liberação.
// Regras da Débora (2026-07-22): cliente vê OS, NF, MTR, Carta de Descarte, CDF, laudo; o CDF e
// o laudo SÓ quando liberados; NUNCA contrato/imagens de controle interno. Nomes no Ploomes
// seguem "NNNNN - Tipo". Desconhecido = NÃO mostra (padrão seguro — melhor esconder que vazar).
function semAcentoLc(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function classificaDoc(nome) {
  const s = semAcentoLc(nome);
  // Esconde SEMPRE (mesmo que o nome também tenha "serviço"): interno + comercial (proposta/orçamento).
  if (/contrat|imagem|imagens|controle interno|\binterno\b|propost|orcament/.test(s)) return { cliente: false };
  if (/cdf|certificad/.test(s)) return { cliente: true, liberar: true, rotulo: 'Certificado de Destinação Final (CDF)' };
  if (/laudo/.test(s)) return { cliente: true, liberar: true, rotulo: 'Laudo' };
  if (/mtr/.test(s)) return { cliente: true, rotulo: 'MTR' };
  if (/carta/.test(s)) return { cliente: true, rotulo: 'Carta de Descarte' };
  if (/nota|\bnf\b|fiscal/.test(s)) return { cliente: true, rotulo: 'Nota Fiscal' };
  if (/ordem|servi|\bo\.?s\.?\b/.test(s)) return { cliente: true, rotulo: 'Ordem de Serviço' };
  return { cliente: false }; // tipo desconhecido: não mostra
}
// "Liberado" NÃO está no flag Shared do Ploomes (sonda: 0 de 400 docs marcados) — usamos a
// ETAPA "Certificado Liberado" como sinal de liberação do CDF/laudo. (A confirmar com a Débora.)
function certificadoLiberadoDaEtapa(nomeEtapa) { return /certificado liberado/.test(semAcentoLc(nomeEtapa)); }
// Classifica um ANEXO pelo NOME DO ARQUIVO. Allowlist ESTRITO: só a NF passa; fotos de
// controle (WhatsApp), termos e qualquer outro anexo interno ficam SEMPRE escondidos.
function classificaAnexo(fileName) {
  const s = semAcentoLc(fileName);
  if (/(^|[\s_.\-])nf([\s_.\-]|\d)/.test(s) || /nota.?fiscal/.test(s)) return { cliente: true, rotulo: 'Nota Fiscal' };
  return { cliente: false };
}
// Nome do MODELO (DocumentTemplate) de um Order — pra separar a OS ("OS - ...") de proposta.
async function nomeModelo(templateId, base, headers) {
  if (!templateId) return '';
  try { const t = await fetch(`${base}/DocumentTemplates?$filter=Id%20eq%20${Number(templateId)}&$top=1&$select=Name`, { headers }); if (t.ok) return ((await t.json()).value || [])[0]?.Name || ''; } catch { /* ignore */ }
  return '';
}

// Lista os DOCUMENTOS de uma OS que o cliente PODE ver. Segurança: só a OS do próprio cliente
// (confere ContactId) e aplica as regras de tipo/liberação acima.
async function listarDocsOS(url, sessao, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const clienteId = Number(sessao.empresaId || sessao.contactId);
  const dealId = Number(url.searchParams.get('dealId') || 0);
  if (!dealId || !clienteId) return json({ ok: false, error: 'sem_id' }, 400);
  try {
    // Confere que a OS é do cliente E pega etapa (liberação) + anexos (a NF) numa tacada só.
    const own = await fetch(`${base}/Deals?$filter=Id%20eq%20${dealId}%20and%20ContactId%20eq%20${clienteId}&$top=1&$expand=Stage,Attachments`, { headers });
    const deal = own.ok ? ((await own.json()).value || [])[0] : null;
    if (!deal) return json({ ok: false, error: 'nao_encontrada' }, 404);
    const liberado = certificadoLiberadoDaEtapa(deal.Stage?.Name);
    const r = await fetch(`${base}/Documents?$filter=DealId%20eq%20${dealId}&$top=50&$select=Id,Name,DocumentNumber,FileName,Date`, { headers });
    const brutos = r.ok ? ((await r.json()).value || []) : [];
    const docs = [];
    for (const d of brutos) {
      const c = classificaDoc(d.Name);
      if (!c.cliente) continue;                 // interno/desconhecido: nunca mostra
      if (c.liberar && !liberado) continue;     // CDF/laudo só quando liberado
      docs.push({ id: d.Id, fonte: 'document', nome: c.rotulo ? `${c.rotulo}${d.DocumentNumber ? ' nº ' + d.DocumentNumber : ''}` : (d.Name || `Documento ${d.Id}`) });
    }
    // O documento da OS fica na entidade Orders — mostra só o que é do cliente (classifica pelo
    // NOME DO MODELO, p/ nunca vazar proposta comercial). DocumentUrl verificado (PDF 60 KB).
    try {
      const ro = await fetch(`${base}/Orders?$filter=DealId%20eq%20${dealId}&$top=20&$select=Id,OrderNumber,TemplateId,DocumentUrl`, { headers });
      for (const o of (ro.ok ? ((await ro.json()).value || []) : [])) {
        if (!o.DocumentUrl) continue;
        const cO = classificaDoc(await nomeModelo(o.TemplateId, base, headers));
        if (!cO.cliente || (cO.liberar && !liberado)) continue;
        docs.push({ id: o.Id, fonte: 'order', nome: `${cO.rotulo || 'Ordem de Serviço'}${o.OrderNumber ? ' nº ' + o.OrderNumber : ''}` });
      }
    } catch (error) { console.error('orders_lista_erro', safeError(error)); }
    // A NF fica nos ANEXOS — allowlist ESTRITO (só NF). Respeita ainda os flags do Ploomes
    // (IsSensitiveData / Listable). Fotos de controle e termos NUNCA aparecem.
    for (const a of (deal.Attachments || [])) {
      if (a.IsSensitiveData || a.Listable === false) continue;
      const cA = classificaAnexo(a.FileName || a.Name);
      if (!cA.cliente) continue;
      docs.push({ id: a.Id, fonte: 'anexo', nome: cA.rotulo });
    }
    return json({ ok: true, docs });
  } catch (error) { console.error('docs_erro', safeError(error)); return json({ ok: false, error: 'indisponivel' }, 502); }
}

// Baixa UM documento (o Worker busca o PDF e entrega ao cliente — a URL de storage nunca
// é exposta). Segurança: confere que a OS do documento é do próprio cliente.
async function baixarDocOS(url, sessao, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const clienteId = Number(sessao.empresaId || sessao.contactId);
  const docId = Number(url.searchParams.get('docId') || 0);
  const fonte = ['order', 'anexo'].includes(url.searchParams.get('fonte')) ? url.searchParams.get('fonte') : 'document';
  if (!docId || !clienteId) return json({ ok: false, error: 'sem_id' }, 400);
  try {
    // Resolve na fonte certa (Documents / Orders / Attachments) → {dealId, url, nome, tipo}.
    let dealId, documentUrl, nomeClass, nomeArq, contentType = null, ehAnexo = false;
    if (fonte === 'anexo') {
      ehAnexo = true;
      const r = await fetch(`${base}/Attachments(${docId})`, { headers });
      const j = r.ok ? await r.json().catch(() => null) : null;
      const a = j ? (j.value ? j.value[0] : j) : null;
      if (!a || !a.Url) return json({ ok: false, error: 'nao_encontrado' }, 404);
      // Allowlist estrito (só NF) + flags do Ploomes — senão nem baixa.
      if (a.IsSensitiveData || a.Listable === false || !classificaAnexo(a.FileName || '').cliente) return json({ ok: false, error: 'sem_permissao' }, 403);
      dealId = a.DealId; documentUrl = a.Url; nomeArq = a.FileName || `anexo-${docId}`; contentType = a.ContentType || null;
    } else if (fonte === 'order') {
      const r = await fetch(`${base}/Orders?$filter=Id%20eq%20${docId}&$top=1&$select=Id,OrderNumber,TemplateId,DealId,DocumentUrl`, { headers });
      const o = r.ok ? ((await r.json()).value || [])[0] : null;
      if (!o || !o.DocumentUrl) return json({ ok: false, error: 'nao_encontrado' }, 404);
      dealId = o.DealId; documentUrl = o.DocumentUrl; nomeArq = `OS-${o.OrderNumber || docId}`; nomeClass = await nomeModelo(o.TemplateId, base, headers);
    } else {
      const r = await fetch(`${base}/Documents?$filter=Id%20eq%20${docId}&$top=1&$select=Id,Name,FileName,DealId,DocumentUrl`, { headers });
      const d = r.ok ? ((await r.json()).value || [])[0] : null;
      if (!d || !d.DocumentUrl) return json({ ok: false, error: 'nao_encontrado' }, 404);
      dealId = d.DealId; documentUrl = d.DocumentUrl; nomeClass = d.Name; nomeArq = d.FileName || d.Name || `documento-${docId}`;
    }
    // Confere que a OS é do cliente (e a etapa, p/ liberação de CDF/laudo).
    const own = await fetch(`${base}/Deals?$filter=Id%20eq%20${Number(dealId)}%20and%20ContactId%20eq%20${clienteId}&$top=1&$expand=Stage`, { headers });
    const deal = own.ok ? ((await own.json()).value || [])[0] : null;
    if (!deal) return json({ ok: false, error: 'sem_permissao' }, 403);
    // Regras de tipo/liberação p/ Documents/Orders (o anexo já foi validado — allowlist NF — acima).
    if (!ehAnexo) {
      const c = classificaDoc(nomeClass);
      if (!c.cliente) return json({ ok: false, error: 'sem_permissao' }, 403);
      if (c.liberar && !certificadoLiberadoDaEtapa(deal.Stage?.Name)) return json({ ok: false, error: 'nao_liberado' }, 403);
    }
    const arq = await fetch(documentUrl);
    if (!arq.ok || !arq.body) return json({ ok: false, error: 'indisponivel' }, 502);
    const limpo = String(nomeArq).replace(/[^\w.\- ]+/g, '').slice(0, 80) || `documento-${docId}`;
    const nome = /\.[a-z0-9]{2,4}$/i.test(limpo) ? limpo : `${limpo}.pdf`;
    return new Response(arq.body, { status: 200, headers: {
      'content-type': contentType || arq.headers.get('content-type') || 'application/pdf',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'private, no-store',
    } });
  } catch (error) { console.error('baixar_doc_erro', safeError(error)); return json({ ok: false, error: 'indisponivel' }, 502); }
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

// Perfil do cliente para PRÉ-PREENCHER o formulário de solicitação de coleta.
// Lê o cadastro do Ploomes (Razão Social = Name, CNPJ = Register, e-mail). Telefone
// e responsável vêm quando disponíveis; o cliente confirma/atualiza tudo no form.
async function perfilCliente(sessao, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const id = Number(sessao.empresaId || sessao.contactId);
  let c = {};
  try {
    const r = await fetch(`${base}/Contacts?$filter=Id%20eq%20${id}&$top=1`, { headers });
    if (r.ok) c = (await r.json()).value?.[0] || {};
  } catch (error) { console.error('perfil_erro', safeError(error)); }
  return json({ ok: true, perfil: {
    razaoSocial: c.Name || sessao.nome || '',
    cnpj: c.Register || '',
    email: c.Email || sessao.email || '',
    telefone: c.Phones?.[0]?.PhoneNumber || '',
    responsavel: sessao.nome || '',
  } });
}

// Consulta de CEP para AUTOPREENCHER o endereço de coleta (evita erro de digitação).
// Usa a BrasilAPI (mesma origem do CNPJ), com User-Agent — sem User-Agent ela recusa.
// Tenta v2 e cai para v1 se preciso. Só devolve o que precisamos (rua, bairro, cidade, UF).
async function consultaCep(request, env) {
  const cep = String(new URL(request.url).searchParams.get('cep') || '').replace(/\D/g, '');
  if (cep.length !== 8) return json({ ok: false, error: 'cep_invalido' }, 422);
  const ua = { 'user-agent': 'EcobrazPortal/1.0', accept: 'application/json' };
  for (const u of [`https://brasilapi.com.br/api/cep/v2/${cep}`, `https://brasilapi.com.br/api/cep/v1/${cep}`]) {
    try {
      const r = await fetch(u, { headers: ua });
      if (r.status === 404) return json({ ok: false, error: 'cep_nao_encontrado' }, 404);
      if (!r.ok) continue;
      const d = await r.json();
      return json({ ok: true, endereco: {
        cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
        logradouro: d.street || '',
        bairro: d.neighborhood || '',
        cidade: d.city || '',
        uf: d.state || '',
      } });
    } catch (error) { console.error('cep_erro', safeError(error)); }
  }
  return json({ ok: false, error: 'indisponivel' }, 502);
}

// Solicitação de coleta (Abrir OS): cria o Negócio no Ploomes com os dados da coleta.
// O endereço de coleta é obrigatório (muda a cada coleta). Fotos entram num passo seguinte.
async function solicitarOS(request, sessao, env) {
  let input;
  try { input = await request.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }
  const g = (k, n) => String(input?.[k] || '').trim().slice(0, n);
  const endereco = g('endereco', 300);
  if (!endereco) return json({ ok: false, error: 'endereco_obrigatorio' }, 422);
  const razaoSocial = g('razaoSocial', 200), cnpj = g('cnpj', 20), telefone = g('telefone', 30);
  const email = g('email', 120), responsavel = g('responsavel', 120), equipamentos = g('equipamentos', 4000);
  const cep = g('cep', 12), logradouro = g('logradouro', 200), numero = g('numero', 20);
  const bairro = g('bairro', 120), cidade = g('cidade', 120), complemento = g('complemento', 160);
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'content-type': 'application/json', 'User-Key': env.PLOOMES_USER_KEY };
  const nota = `Solicitação de coleta pelo Portal do Cliente.\n\n` +
    `Razão Social: ${razaoSocial}\nCNPJ: ${cnpj}\n` +
    `Endereço de coleta: ${endereco}\n` +
    (cep ? `  (CEP ${cep} | Rua ${logradouro} | Nº ${numero} | Bairro ${bairro} | Cidade/UF ${cidade}${complemento ? ' | Compl. ' + complemento : ''})\n` : '') +
    `Telefone: ${telefone}\nE-mail: ${email}\nResponsável: ${responsavel}\n\n` +
    `Equipamentos:\n${equipamentos || '(não informado)'}`;
  const deal = {
    Title: `[Portal] ${(razaoSocial || sessao.nome || 'Cliente').slice(0, 80)} — solicitação de coleta`,
    ContactId: Number(sessao.empresaId || sessao.contactId),
    Note: nota,
    // Grava o endereço no CAMPO do Ploomes que os documentos leem (deal_F4BF490C..., verificado
    // 2026-07-22 numa OS real), pra CDF/documentos saírem preenchidos certos — não só na nota.
    OtherProperties: [{ FieldKey: env.PLOOMES_FIELD_OS_ENDERECO || 'deal_F4BF490C-707A-434A-BB3A-E187CBFD8638', StringValue: endereco.slice(0, 300) }],
  };
  // A solicitação já entra como OS DE VERDADE: funil [PJ] VENDAS, etapa "📄 Ordem de Serviço"
  // (IDs verificados em 2026-07-22). Assim o cliente vê "Em atendimento" na hora e a Débora
  // recebe na coluna de OS. O Nº da OS e os documentos são gerados MAIS À FRENTE no fluxo
  // interno (pesagem/finalização) — como já acontece com as 49 OS reais que estão nessa etapa.
  // O prefixo "[Portal]" marca as que vieram do site (a Débora consegue filtrar/validar).
  // IDs sobrescrevíveis por variável, caso o funil mude.
  deal.PipelineId = Number(env.PORTAL_OS_PIPELINE_ID || 44259);
  deal.StageId = Number(env.PORTAL_OS_STAGE_ID || 199543);
  if (env.PORTAL_OS_OWNER_ID) deal.OwnerId = Number(env.PORTAL_OS_OWNER_ID);
  const r = await fetch(`${base}/Deals`, { method: 'POST', headers, body: JSON.stringify(deal) });
  const body = await r.text();
  if (!r.ok) { console.error('solicitar_os_erro', r.status, body.slice(0, 160)); return json({ ok: false, error: 'nao_foi_possivel' }, 502); }
  let dealId = null;
  try { dealId = JSON.parse(body).value?.[0]?.Id ?? null; } catch {}

  // Anexa as fotos enviadas (até 4) ao negócio no Ploomes.
  // Formato VERIFICADO por sonda em 2026-07-22: multipart, campo "file", em
  // Deals({id})/UploadFile → HTTP 200. Cada foto já vem reduzida (JPEG) do navegador.
  const fotos = Array.isArray(input.fotos) ? input.fotos.slice(0, 4) : [];
  let fotosOk = 0;
  for (let i = 0; dealId && i < fotos.length; i++) {
    try {
      const m = /^data:(image\/[\w.+-]+);base64,(.+)$/i.exec(String(fotos[i]?.dataUrl || ''));
      if (!m) continue;
      const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
      const limpo = String(fotos[i]?.nome || '').replace(/[^\w.\- ]+/g, '').slice(0, 60);
      const nome = /\.(jpe?g|png|webp|gif)$/i.test(limpo) ? limpo : `${limpo || 'foto-' + (i + 1)}.jpg`;
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: m[1] }), nome);
      const up = await fetch(`${base}/Deals(${dealId})/UploadFile`, { method: 'POST', headers: { 'User-Key': env.PLOOMES_USER_KEY }, body: form });
      if (up.ok) fotosOk++;
      else console.error('foto_upload_http', up.status, (await up.text().catch(() => '')).slice(0, 140));
    } catch (error) { console.error('foto_upload', safeError(error)); }
  }

  return json({ ok: true, pedido_id: dealId, fotos: fotosOk, message: 'Pronto! Sua ordem de serviço foi aberta e já está em atendimento. Acompanhe o andamento aqui no painel.' }, 201);
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
  // Preferimos o Resend (API simples e compatível com Cloudflare Workers). O E-goi
  // fica como reserva enquanto o envio transacional dele não estiver resolvido.
  if (env.RESEND_API_KEY) return await enviarViaResend(cliente, link, env);

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

// Envio via Resend (https://resend.com) — POST simples, ideal para Cloudflare Workers.
// RESEND_FROM é o remetente; no teste inicial use o padrão do Resend (onboarding@resend.dev),
// depois troque para acesso@ecobraz.org.br após verificar o domínio no Resend.
async function enviarViaResend(cliente, link, env) {
  // Domínio ecobraz.org.br verificado no Resend → envia de acesso@ecobraz.org.br
  // para qualquer cliente. RESEND_FROM pode sobrescrever se quiser outro remetente.
  const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
  const payload = {
    from,
    to: [cliente.email],
    subject: 'Seu acesso ao Portal Ecobraz',
    html: emailHtml(cliente, link),
    text: `Olá,\n\nUse o link abaixo para acessar o Portal Ecobraz (vale uma vez, expira em 15 minutos):\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.\n\nEcobraz`,
  };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`resend_${r.status}:${b.slice(0, 160)}`); }
}

// E-mail para o financeiro emitir a NF (via Resend). TESTE → vai para o Marcio (não
// incomoda o financeiro). PRODUÇÃO → defina NF_EMAIL=pagamento@ecobraz.org.br.
async function enviarEmailNF(pedido, pagamento, env) {
  if (!env.RESEND_API_KEY) return;
  const to = env.NF_EMAIL || 'marcio@ecobraz.org.br';
  const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
  const empresa = (pedido && pedido.empresa) || {};
  const linhas = [
    'Produto: Cálculo detalhado de pegada de carbono — GHG Protocol',
    `Valor pago: R$ ${Number(pagamento.valor || 0).toFixed(2)}`,
    `Pagamento (Mercado Pago) ID: ${pagamento.id}`,
    empresa.razaoSocial ? `Empresa: ${empresa.razaoSocial}` : null,
    empresa.cnpj ? `CNPJ: ${empresa.cnpj}` : null,
    `Pedido: ${pagamento.externalReference}`,
  ].filter(Boolean);
  const texto = `Nova venda no Portal Ecobraz.\n\n${linhas.join('\n')}\n\nEmita a NF e envie ao cliente.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10262B"><h2 style="color:#00333B;margin:0 0 12px">Nova venda — emitir NF</h2><p style="line-height:1.7">${linhas.join('<br>')}</p><p>Emita a NF e envie ao cliente.</p></div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: [to], subject: 'Nova venda — Cálculo de pegada de carbono (emitir NF)', html, text: texto }),
  });
}

// ---------------------------------------------------------------------------
// Aviso ao cliente na mudança de etapa da OS (item pedido pelo Marcio).
// O Ploomes chama POST /api/ploomes/webhook?t=SEGREDO quando a OS muda de etapa;
// o Worker confere a etapa, acha o e-mail do cliente e manda um e-mail com a cara da
// Ecobraz — nos 3 momentos definidos pela Débora. De-dup por KV (não manda 2x o mesmo).
// ---------------------------------------------------------------------------
const MSGS_STATUS = {
  coleta_agendada: { assunto: 'Sua coleta foi agendada — Ecobraz', titulo: 'Coleta agendada', corpo: 'Recebemos sua solicitação e sua coleta já está <strong>agendada</strong>. Você acompanha cada passo por aqui, no seu portal.' },
  coleta_realizada: { assunto: 'Coleta realizada — Ecobraz', titulo: 'Coleta realizada', corpo: 'Sua coleta foi <strong>realizada com sucesso</strong>. Em breve os documentos ficam disponíveis para você no portal.' },
  certificado_liberado: { assunto: 'Seu certificado está disponível — Ecobraz', titulo: 'Certificado liberado', corpo: 'Seu <strong>Certificado de Destinação Final</strong> já está disponível para baixar no seu portal.' },
};
function tipoNotificacao(nomeEtapa) {
  const s = semAcentoLc(nomeEtapa);
  if (/certificado liberado/.test(s)) return 'certificado_liberado';
  if (/coleta finalizada/.test(s)) return 'coleta_realizada';
  if (/ordem de servico/.test(s)) return 'coleta_agendada';
  return null;
}
function extrairDealId(p) {
  if (!p || typeof p !== 'object') return null;
  const cands = [p.Id, p.DealId, p.dealId, p.Deal?.Id, p.deal?.Id, p.entity?.Id, p.Entity?.Id, p.data?.Id, p.Data?.Id, Array.isArray(p.value) ? p.value[0]?.Id : null];
  for (const c of cands) { const n = Number(c); if (Number.isInteger(n) && n > 0) return n; }
  return null;
}
async function webhookPloomes(request, env) {
  if (!env.PLOOMES_WEBHOOK_SECRET) return json({ ok: false, error: 'nao_configurado' }, 503);
  const token = new URL(request.url).searchParams.get('t') || request.headers.get('x-webhook-token') || '';
  if (token !== env.PLOOMES_WEBHOOK_SECRET) return json({ ok: false, error: 'nao_autorizado' }, 401);
  let payload = null;
  try { payload = await request.json(); } catch { payload = null; }
  // Guarda o último payload cru (pra ajustar o formato após o 1º disparo real).
  try { if (env.PORTAL_KV) await env.PORTAL_KV.put('webhook:ultimo', JSON.stringify(payload).slice(0, 4000), { expirationTtl: 60 * 60 * 24 * 7 }); } catch { /* ignore */ }
  const dealId = extrairDealId(payload);
  if (!dealId) { console.error('webhook_sem_deal'); return json({ ok: true, ignorado: 'sem_deal' }); }
  try { await processarMudancaOS(dealId, env); } catch (error) { console.error('webhook_erro', safeError(error)); }
  return json({ ok: true });
}
async function webhookUltimo(request, env) { // depuração: ver o último payload que o Ploomes mandou
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!env.PLOOMES_WEBHOOK_SECRET || token !== env.PLOOMES_WEBHOOK_SECRET) return json({ ok: false, error: 'nao_autorizado' }, 401);
  const ultimo = env.PORTAL_KV ? await env.PORTAL_KV.get('webhook:ultimo') : null;
  return json({ ok: true, ultimo: ultimo ? JSON.parse(ultimo) : null });
}
async function processarMudancaOS(dealId, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const r = await fetch(`${base}/Deals?$filter=Id%20eq%20${dealId}&$top=1&$expand=Stage,Contact`, { headers });
  const deal = r.ok ? ((await r.json()).value || [])[0] : null;
  if (!deal) return;
  const tipo = tipoNotificacao(deal.Stage?.Name);
  if (!tipo) return; // etapa não é gatilho de aviso
  const email = deal.Contact?.Email;
  if (!email) { console.error('webhook_sem_email', dealId); return; }
  const chave = `notif:${dealId}:${tipo}`;
  if (env.PORTAL_KV && (await env.PORTAL_KV.get(chave))) return; // já avisou este passo
  await enviarEmailStatus(email, deal.Contact?.Name || '', tipo, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 });
}
async function enviarEmailStatus(to, nome, tipo, env) {
  if (!env.RESEND_API_KEY) throw new Error('sem_resend');
  const m = MSGS_STATUS[tipo]; if (!m) return;
  const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
  const portalUrl = env.PORTAL_URL || 'https://ecobraz-portal.ti-0ab.workers.dev/';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: [to], subject: m.assunto, html: emailStatusHtml(nome, m, portalUrl), text: `${m.titulo}\n\n${m.corpo.replace(/<[^>]+>/g, '')}\n\nAcesse seu portal: ${portalUrl}\n\nEcobraz` }),
  });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`resend_${r.status}:${b.slice(0, 140)}`); }
}
function emailStatusHtml(nome, m, portalUrl) {
  const primeiro = esc((nome || '').split(/\s+/)[0] || '');
  let logo = '';
  try { logo = new URL(portalUrl).origin + '/assets/logo-claro.png'; } catch { /* ignore */ }
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F9F8;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9F8;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #DFE7E6;box-shadow:0 18px 50px rgba(0,51,59,.10);">
<tr><td style="background:#00333B;padding:28px 32px;">
${logo ? `<img src="${logo}" alt="Ecobraz Emigre" width="168" style="display:block;width:168px;height:auto;border:0;">` : `<span style="color:#fff;font-size:22px;font-weight:800;">ecobraz</span>`}
<div style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-top:14px;">Portal do Cliente</div>
</td></tr>
<tr><td style="padding:38px 32px 6px;">
<h1 style="margin:0 0 14px;font-size:23px;line-height:1.2;letter-spacing:-.02em;color:#00333B;">${esc(m.titulo)}${primeiro ? `, ${primeiro}` : ''}</h1>
<p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4F6469;">${m.corpo}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#92C430;">
<a href="${esc(portalUrl)}" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:800;color:#10262B;text-decoration:none;">Acessar meu portal &rarr;</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:26px 32px 30px;">
<div style="border-top:1px solid #DFE7E6;padding-top:18px;font-size:12px;color:#9fb0ac;line-height:1.6;"><strong style="color:#4F6469;">Ecobraz Emigre</strong> — Portal do Cliente<br>Destinação correta, conformidade e evidências para a sua empresa.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function emailHtml(cliente, link) {
  const nome = esc((cliente.nome || '').split(/\s+/)[0] || '');
  let logo = '';
  try { logo = new URL(link).origin + '/assets/logo-claro.png'; } catch {}
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F9F8;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9F8;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #DFE7E6;box-shadow:0 18px 50px rgba(0,51,59,.10);">
<tr><td style="background:#00333B;padding:28px 32px;">
${logo ? `<img src="${logo}" alt="Ecobraz Emigre" width="168" style="display:block;width:168px;height:auto;border:0;">` : `<span style="color:#fff;font-size:22px;font-weight:800;">ecobraz</span>`}
<div style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-top:14px;">Portal do Cliente</div>
</td></tr>
<tr><td style="padding:38px 32px 6px;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;letter-spacing:-.02em;color:#00333B;">Seu acesso${nome ? `, ${nome}` : ''}</h1>
<p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4F6469;">Clique no botão abaixo para entrar no Portal Ecobraz. O link vale <strong style="color:#10262B;">uma vez</strong> e expira em <strong style="color:#10262B;">15 minutos</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#92C430;">
<a href="${esc(link)}" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:800;color:#10262B;text-decoration:none;">Entrar no Portal &rarr;</a>
</td></tr></table>
<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#9fb0ac;">Se o botão não abrir, copie e cole este endereço no navegador:<br><span style="color:#4F6469;word-break:break-all;">${esc(link)}</span></p>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#9fb0ac;">Se você não pediu este acesso, ignore este e-mail com segurança.</p>
</td></tr>
<tr><td style="padding:26px 32px 30px;">
<div style="border-top:1px solid #DFE7E6;padding-top:18px;font-size:12px;color:#9fb0ac;line-height:1.6;"><strong style="color:#4F6469;">Ecobraz Emigre</strong> — Portal do Cliente<br>Destinação correta, conformidade e evidências para a sua empresa.</div>
</td></tr>
</table>
<div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#aebfbb;text-align:center;">Acesso exclusivo para clientes com contrato ativo.</div>
</td></tr></table></body></html>`;
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
function novoId() { return b64url(crypto.getRandomValues(new Uint8Array(12))); }
function inicioDeHoje() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function json(body, status = 200, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } }); }
function html(markup, status = 200) { return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
function servirLogo(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
}
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function requireEnv(env, names) { const m = names.filter((n) => !env[n]); if (m.length) throw new Error(`missing_env_${m.join('_')}`); }
function safeError(e) { return { name: e?.name || 'Error', message: String(e?.message || 'unknown').slice(0, 200) }; }
async function verifyTurnstile(token, ip, secret) { if (!token) return false; const f = new FormData(); f.set('secret', secret); f.set('response', token); if (ip) f.set('remoteip', ip); const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f }); if (!r.ok) return false; return Boolean((await r.json()).success); }
