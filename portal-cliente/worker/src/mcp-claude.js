// Conexão da BASE DE CLIENTES com o Claude (claude.ai) — servidor MCP mínimo.
// Pedido do Marcio (29/09): "que as minhas tarefas lá no chat tenham acesso
// online à nossa base de clientes".
//
// Como funciona: o Claude (claude.ai) chama este endpoint como um "conector
// personalizado". Regras rígidas:
//   1. SÓ LEITURA — nenhuma ferramenta altera nada.
//   2. Chave obrigatória na URL (/mcp-claude/<chave>): gerada na tela
//      /diretoria/conexao-claude; no KV fica só o HASH (nunca a chave em claro).
//      Sem chave cadastrada, o endpoint nem existe (404 para tudo).
//   3. CPF de pessoa física sai MASCARADO (só o final). CNPJ é público, sai inteiro.
//   4. Revogável a um clique (a URL antiga morre na hora).
// Protocolo: MCP "Streamable HTTP" (JSON-RPC 2.0 via POST; resposta JSON única).

import { listarColetasOS } from './coletas.js';
import { estatisticaAdocao } from './uso.js';

const digits = (s) => String(s || '').replace(/\D/g, '');
const fmtCNPJ = (d) => d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
// Documento seguro para o chat: CNPJ inteiro (público); CPF só o final (LGPD).
const docSeguro = (doc) => { const d = digits(doc); if (d.length === 14) return 'CNPJ ' + fmtCNPJ(d); if (d.length === 11) return 'CPF final ' + d.slice(-4); return String(doc || '—'); };
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || ''); };
const STATUS_ROTULO = { agendada: 'Agendada', em_transporte: 'Em transporte', na_unidade: 'Na unidade', concluida: 'Concluída', cancelada: 'Cancelada' };

async function sha256hex(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function tokenNovo() {
  const b = new Uint8Array(32); crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// --- Configuração (KV mcp:claude = { hash, criadoEm, por }) ---------------------
export async function lerConexaoClaude(env) {
  if (!env.PORTAL_KV) return null;
  const raw = await env.PORTAL_KV.get('mcp:claude');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export async function gerarConexaoClaude(env, quem) {
  const token = tokenNovo();
  if (env.PORTAL_KV) await env.PORTAL_KV.put('mcp:claude', JSON.stringify({ hash: await sha256hex(token), criadoEm: new Date().toISOString(), por: String(quem || '') }));
  return token; // mostrado UMA vez na tela; daqui não sai para log nenhum
}
export async function revogarConexaoClaude(env) { if (env.PORTAL_KV) await env.PORTAL_KV.delete('mcp:claude'); }

// --- Ferramentas (só leitura) ---------------------------------------------------
const FERRAMENTAS = [
  { name: 'buscar_clientes', description: 'Busca clientes da Ecobraz por nome, CNPJ/CPF ou e-mail. Retorna até 10, com documento, cidade e contatos.', inputSchema: { type: 'object', properties: { termo: { type: 'string', description: 'Nome (ou parte), CNPJ/CPF ou e-mail' } }, required: ['termo'] } },
  { name: 'detalhe_cliente', description: 'Ficha de um cliente pelo CNPJ (ou CPF): dados cadastrais, contatos vinculados e as últimas Ordens de Coleta.', inputSchema: { type: 'object', properties: { documento: { type: 'string', description: 'CNPJ ou CPF, com ou sem pontuação' } }, required: ['documento'] } },
  { name: 'coletas', description: 'Lista Ordens de Coleta (OS) recentes. Filtros opcionais: status (agendada, em_transporte, concluida, cancelada) e nome do cliente.', inputSchema: { type: 'object', properties: { status: { type: 'string' }, cliente: { type: 'string' }, limite: { type: 'number', description: 'máx. 20' } } } },
  { name: 'visao_geral', description: 'Números gerais da base da Ecobraz: total de clientes (empresas e pessoas) e coletas por status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'clientes_pj_por_ultima_coleta', description: 'REATIVAÇÃO: empresas (PJ) cuja ÚLTIMA coleta/atendimento concluído caiu entre duas datas. Considera as Ordens de Coleta do sistema novo E o histórico migrado do Ploomes. Paginada (50 por página), da mais recente para a mais antiga, com razão social, CNPJ, contato e a data da última atividade.', inputSchema: { type: 'object', properties: { de: { type: 'string', description: 'data inicial (AAAA-MM-DD ou AAAA-MM)' }, ate: { type: 'string', description: 'data final (AAAA-MM-DD ou AAAA-MM)' }, pagina: { type: 'number', description: 'página, a partir de 1 (50 por página)' } }, required: ['de', 'ate'] } },
];

async function ferrPjUltimaColeta(env, args) {
  const a = args || {};
  const norm = (v, fim) => { const s = String(v || '').trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; if (/^\d{4}-\d{2}$/.test(s)) return s + (fim ? '-31' : '-01'); return ''; };
  const de = norm(a.de, false), ate = norm(a.ate, true);
  if (!de || !ate) return 'Informe as datas como AAAA-MM-DD (ou AAAA-MM), ex.: de "2024-01" ate "2025-12".';
  const pagina = Math.max(1, Math.floor(Number(a.pagina) || 1));
  const POR_PAGINA = 50;
  // Última atividade concluída por CNPJ: histórico Ploomes (negócios ganhos) + OSs novas.
  const ultima = new Map(); // cnpj(14 díg.) → { quando: 'AAAA-MM-DD', origem }
  const anota = (doc, quando, origem) => {
    const d = digits(doc); const q = String(quando || '').slice(0, 10);
    if (d.length !== 14 || !/^\d{4}-\d{2}-\d{2}$/.test(q)) return;
    const atual = ultima.get(d);
    if (!atual || q > atual.quando) ultima.set(d, { quando: q, origem });
  };
  if (env.DB_PLOOMES) {
    try {
      const r = await env.DB_PLOOMES.prepare(
        `SELECT REPLACE(REPLACE(REPLACE(COALESCE(e.documento,''),'.',''),'/',''),'-','') AS doc, MAX(g.criado_em) AS ult
           FROM negocios g
           JOIN contatos c ON c.ploomes_id = g.contact_id
           JOIN contatos e ON e.ploomes_id = COALESCE(NULLIF(c.company_id, 0), c.ploomes_id)
          WHERE g.status_id = 2 AND COALESCE(e.documento,'') <> ''
          GROUP BY 1`
      ).all();
      for (const row of (r && r.results) || []) anota(row.doc, row.ult, 'histórico');
    } catch { /* histórico indisponível: segue só com as OSs */ }
  }
  try { for (const o of await listarColetasOS(env)) if (o.status === 'concluida') anota(o.clienteDoc, o.dataAgendada || o.criadoEm, o.numero || 'OS'); } catch { /* segue */ }
  const alvo = [...ultima.entries()].filter(([, u]) => u.quando >= de && u.quando <= ate).sort((x, y) => y[1].quando.localeCompare(x[1].quando));
  if (!alvo.length) return `Nenhuma empresa com última coleta/atendimento concluído entre ${de} e ${ate}.`;
  const paginas = Math.ceil(alvo.length / POR_PAGINA);
  const fatia = alvo.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  if (!fatia.length) return `Só existem ${paginas} página(s) para esse período (${alvo.length} empresas).`;
  // Enriquecer a página com razão social e contato (empresa e, se faltar, uma pessoa vinculada).
  const info = new Map();
  if (env.DB_PLOOMES && fatia.length) {
    try {
      const docs = fatia.map(([d]) => d);
      const ph = docs.map((_, i) => `?${i + 1}`).join(',');
      const r = await env.DB_PLOOMES.prepare(`SELECT ploomes_id, documento, nome, nome_fantasia, email, telefone, cidade, uf FROM contatos WHERE REPLACE(REPLACE(REPLACE(COALESCE(documento,''),'.',''),'/',''),'-','') IN (${ph})`).bind(...docs).all();
      for (const c of (r && r.results) || []) { const d = digits(c.documento); if (!info.has(d)) info.set(d, c); }
      const semContato = [...info.values()].filter((c) => !c.email && !c.telefone).map((c) => c.ploomes_id);
      if (semContato.length) {
        const ph2 = semContato.map((_, i) => `?${i + 1}`).join(',');
        const p = await env.DB_PLOOMES.prepare(`SELECT company_id, nome, email, telefone FROM contatos WHERE company_id IN (${ph2}) AND (COALESCE(email,'')<>'' OR COALESCE(telefone,'')<>'')`).bind(...semContato).all();
        for (const pes of (p && p.results) || []) { const emp = [...info.values()].find((c) => c.ploomes_id === pes.company_id); if (emp && !emp._pessoa) emp._pessoa = pes; }
      }
    } catch { /* sem enriquecimento, lista mesmo assim */ }
  }
  const linhas = fatia.map(([d, u]) => {
    const c = info.get(d);
    const nome = (c && (c.nome || c.nome_fantasia)) || '(razão social não localizada)';
    const pes = c && c._pessoa;
    const contato = [c && c.email, c && c.telefone, pes && `contato: ${[pes.nome, pes.email, pes.telefone].filter(Boolean).join(' ')}`, c && c.cidade ? `${c.cidade}${c.uf ? '/' + c.uf : ''}` : ''].filter(Boolean).join(' · ');
    return `• ${nome} — CNPJ ${fmtCNPJ(d)} — última: ${dataBR(u.quando)} (${u.origem})${contato ? ` — ${contato}` : ''}`;
  });
  return `${alvo.length} empresa(s) com última coleta/atendimento entre ${dataBR(de)} e ${dataBR(ate)} — página ${pagina} de ${paginas} (${POR_PAGINA}/página):\n` + linhas.join('\n') + (pagina < paginas ? `\n… peça a página ${pagina + 1} para continuar.` : '');
}

async function ferrBuscarClientes(env, args) {
  const termo = String((args && args.termo) || '').trim();
  if (!termo) return 'Informe um termo de busca (nome, CNPJ/CPF ou e-mail).';
  if (!env.DB_PLOOMES) return 'Base indisponível no momento.';
  const dig = digits(termo);
  // LIKE do SQLite só ignora caixa em letras SEM acento ("roldão" não acha "ROLDÃO").
  // Buscamos com as variantes do termo (como veio, MAIÚSCULA e minúscula) de uma vez.
  const limpo = termo.replace(/[%_]/g, '');
  const variantes = [...new Set([limpo, limpo.toUpperCase(), limpo.toLowerCase()])].map((v) => `%${v}%`);
  const conds = variantes.map((_, i) => `nome LIKE ?${i + 1} OR nome_fantasia LIKE ?${i + 1} OR email LIKE ?${i + 1}`);
  const binds = [...variantes];
  if (dig.length >= 6) { binds.push(`%${dig}%`); conds.push(`documento LIKE ?${binds.length}`); }
  const r = await env.DB_PLOOMES.prepare(
    `SELECT ploomes_id, tipo, nome, nome_fantasia, documento, email, telefone, cidade, uf
       FROM contatos
      WHERE ${conds.join(' OR ')}
      ORDER BY (CASE WHEN tipo='PJ' THEN 0 ELSE 1 END), ploomes_id DESC LIMIT 10`
  ).bind(...binds).all();
  const rows = (r && r.results) || [];
  if (!rows.length) return `Nenhum cliente encontrado para "${termo}".`;
  return rows.map((c) => `• ${c.nome || c.nome_fantasia || '(sem nome)'}${c.tipo ? ` [${c.tipo}]` : ''} — ${docSeguro(c.documento)}${c.cidade ? ` — ${c.cidade}${c.uf ? '/' + c.uf : ''}` : ''}${c.email ? ` — ${c.email}` : ''}${c.telefone ? ` — ${c.telefone}` : ''}`).join('\n');
}

async function ferrDetalheCliente(env, args) {
  const dig = digits(args && args.documento);
  if (dig.length !== 11 && dig.length !== 14) return 'Informe um CNPJ (14 dígitos) ou CPF (11 dígitos).';
  if (!env.DB_PLOOMES) return 'Base indisponível no momento.';
  const c = await env.DB_PLOOMES.prepare('SELECT ploomes_id, tipo, nome, nome_fantasia, documento, email, telefone, cidade, uf FROM contatos WHERE documento=?1 LIMIT 1').bind(dig).first();
  if (!c) return `Nenhum cliente com o documento informado (${docSeguro(dig)}).`;
  const linhas = [`${c.nome || c.nome_fantasia || '(sem nome)'} — ${docSeguro(c.documento)}${c.cidade ? ` — ${c.cidade}${c.uf ? '/' + c.uf : ''}` : ''}`];
  if (c.email || c.telefone) linhas.push(`Contato: ${[c.email, c.telefone].filter(Boolean).join(' · ')}`);
  try {
    const pessoas = await env.DB_PLOOMES.prepare('SELECT nome, email, telefone FROM contatos WHERE company_id=?1 LIMIT 8').bind(c.ploomes_id).all();
    const ps = (pessoas && pessoas.results) || [];
    if (ps.length) linhas.push('Pessoas vinculadas: ' + ps.map((p) => [p.nome, p.email, p.telefone].filter(Boolean).join(' ')).join(' | '));
  } catch { /* sem pessoas */ }
  try {
    const oss = (await listarColetasOS(env)).filter((o) => digits(o.clienteDoc) === dig).slice(0, 10);
    if (oss.length) {
      linhas.push('Últimas coletas:');
      for (const o of oss) linhas.push(`  • ${o.numero} — ${STATUS_ROTULO[o.status] || o.status}${o.dataAgendada ? ` — ${dataBR(o.dataAgendada)}` : ''}${o.transp ? ` — 🚛 ${o.transp}` : (o.agenteNome ? ` — 🚚 ${o.agenteNome}` : '')}`);
    } else linhas.push('Sem Ordens de Coleta registradas no sistema novo.');
  } catch { /* sem coletas */ }
  return linhas.join('\n');
}

async function ferrColetas(env, args) {
  const a = args || {};
  const st = String(a.status || '').trim().toLowerCase();
  const cli = String(a.cliente || '').trim().toLowerCase();
  const limite = Math.max(1, Math.min(20, Number(a.limite) || 10));
  let oss = await listarColetasOS(env);
  if (st) oss = oss.filter((o) => o.status === st);
  if (cli) oss = oss.filter((o) => String(o.clienteNome || '').toLowerCase().includes(cli));
  if (!oss.length) return 'Nenhuma coleta encontrada com esses filtros.';
  return oss.slice(0, limite).map((o) => `• ${o.numero} — ${o.clienteNome || '—'} — ${STATUS_ROTULO[o.status] || o.status}${o.dataAgendada ? ` — ${dataBR(o.dataAgendada)}` : ''}${o.transp ? ` — 🚛 ${o.transp}` : (o.agenteNome ? ` — 🚚 ${o.agenteNome}` : '')}`).join('\n');
}

// Base ATIVA: clientes (PJ e PF) com coleta/atendimento CONCLUÍDO nos últimos 12
// meses — denominador honesto para a taxa de adoção do portal.
async function baseAtiva12m(env) {
  const docs = new Set();
  const corte = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  if (env.DB_PLOOMES) {
    try {
      const r = await env.DB_PLOOMES.prepare(
        `SELECT DISTINCT REPLACE(REPLACE(REPLACE(COALESCE(e.documento,''),'.',''),'/',''),'-','') AS doc
           FROM negocios g
           JOIN contatos c ON c.ploomes_id = g.contact_id
           JOIN contatos e ON e.ploomes_id = COALESCE(NULLIF(c.company_id, 0), c.ploomes_id)
          WHERE g.status_id = 2 AND g.criado_em >= ?1 AND COALESCE(e.documento,'') <> ''`
      ).bind(corte).all();
      for (const row of (r && r.results) || []) { const d = digits(row.doc); if (d.length === 11 || d.length === 14) docs.add(d); }
    } catch { /* segue com as OSs */ }
  }
  try { for (const o of await listarColetasOS(env)) { if (o.status !== 'concluida') continue; const d = digits(o.clienteDoc); const q = String(o.dataAgendada || o.criadoEm || '').slice(0, 10); if ((d.length === 11 || d.length === 14) && q >= corte) docs.add(d); } } catch { /* segue */ }
  return docs.size;
}

async function ferrVisaoGeral(env) {
  const linhas = [];
  try {
    const t = await env.DB_PLOOMES.prepare("SELECT SUM(CASE WHEN tipo='PJ' THEN 1 ELSE 0 END) AS pj, SUM(CASE WHEN tipo='PF' THEN 1 ELSE 0 END) AS pf, COUNT(*) AS total FROM contatos").first();
    if (t) linhas.push(`Clientes na base: ${t.total} (${t.pj || 0} empresas · ${t.pf || 0} pessoas físicas)`);
  } catch { linhas.push('Contagem de clientes indisponível.'); }
  try {
    const oss = await listarColetasOS(env);
    const porStatus = {};
    for (const o of oss) porStatus[o.status] = (porStatus[o.status] || 0) + 1;
    linhas.push(`Ordens de Coleta no sistema: ${oss.length}` + (oss.length ? ' — ' + Object.entries(porStatus).map(([s, q]) => `${STATUS_ROTULO[s] || s}: ${q}`).join(' · ') : ''));
  } catch { linhas.push('Contagem de coletas indisponível.'); }
  // Adoção do portal pelos CLIENTES (medição ligada em ~09/08/2026; janela 60 dias;
  // "dia ativo" = abriu o portal logado naquele dia, contado 1x/dia).
  try {
    const base = await baseAtiva12m(env);
    const a = await estatisticaAdocao(env, base);
    linhas.push(`\n📈 ADOÇÃO DO PORTAL (clientes): hoje ${a.hoje} · últimos 7 dias ${a.semana} · últimos 30 dias ${a.mes} clientes distintos · ${a.distintos} distintos na janela de ${a.janelaDias} dias`);
    linhas.push(`Base ativa (12 meses): ${base} clientes${a.taxa30dPct != null ? ` → taxa de adoção 30d: ${String(a.taxa30dPct).replace('.', ',')}%` : ''}`);
    linhas.push(`Rotina: ${a.rotina4sem} clientes entraram em 2+ das últimas 4 semanas · ${a.recorrentes30} recorrentes (3+ dias ativos no mês) · ${a.novosSemana} entraram pela 1ª vez (na janela) nesta semana`);
    linhas.push('Clientes distintos por semana (da mais antiga p/ a atual): ' + a.semanas.map((s) => s.clientes).join(' → '));
  } catch { linhas.push('Adoção do portal: medição indisponível agora.'); }
  return linhas.join('\n');
}

async function execFerramenta(env, nome, args) {
  if (nome === 'buscar_clientes') return await ferrBuscarClientes(env, args);
  if (nome === 'detalhe_cliente') return await ferrDetalheCliente(env, args);
  if (nome === 'coletas') return await ferrColetas(env, args);
  if (nome === 'visao_geral') return await ferrVisaoGeral(env);
  if (nome === 'clientes_pj_por_ultima_coleta') return await ferrPjUltimaColeta(env, args);
  throw new Error(`Ferramenta desconhecida: ${nome}`);
}

// --- Servidor MCP (JSON-RPC 2.0 sobre POST) -------------------------------------
const jsonResp = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

async function responderMsg(env, m) {
  if (!m || typeof m !== 'object') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requisição inválida' } };
  const semId = m.id === undefined || m.id === null;
  if (String(m.method || '').startsWith('notifications/')) return null; // aceitas em silêncio
  if (m.method === 'initialize') {
    const pv = (m.params && typeof m.params.protocolVersion === 'string') ? m.params.protocolVersion : '2025-06-18';
    return { jsonrpc: '2.0', id: m.id, result: { protocolVersion: pv, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'Base de Clientes Ecobraz', version: '1.0' } } };
  }
  if (m.method === 'ping') return { jsonrpc: '2.0', id: m.id, result: {} };
  if (m.method === 'tools/list') return { jsonrpc: '2.0', id: m.id, result: { tools: FERRAMENTAS } };
  if (m.method === 'tools/call') {
    const nome = m.params && m.params.name;
    try {
      const texto = await execFerramenta(env, nome, (m.params && m.params.arguments) || {});
      return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: String(texto) }] } };
    } catch (e) {
      return { jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Erro: ' + String((e && e.message) || e).slice(0, 200) }], isError: true } };
    }
  }
  if (semId) return null;
  return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Método não suportado' } };
}

export async function atenderMcpClaude(request, env, url) {
  const cfg = await lerConexaoClaude(env);
  const chave = decodeURIComponent((url.pathname.split('/')[2] || '')).slice(0, 80);
  if (!cfg || !cfg.hash || !chave || (await sha256hex(chave)) !== cfg.hash) {
    return new Response('não encontrado', { status: 404 }); // desligado ou chave errada: nem existe
  }
  if (request.method === 'GET' || request.method === 'DELETE') return new Response(null, { status: 405 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  let body; try { body = await request.json(); } catch { return jsonResp({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400); }
  try {
    if (Array.isArray(body)) {
      const outs = [];
      for (const m of body) { const r = await responderMsg(env, m); if (r) outs.push(r); }
      return outs.length ? jsonResp(outs) : new Response(null, { status: 202 });
    }
    const r = await responderMsg(env, body);
    console.log('mcp_claude', { metodo: String(body && body.method || '').slice(0, 40) }); // sem dados, só o método
    return r ? jsonResp(r) : new Response(null, { status: 202 });
  } catch (e) {
    return jsonResp({ jsonrpc: '2.0', id: (body && body.id) ?? null, error: { code: -32603, message: 'Erro interno' } }, 500);
  }
}

// --- Tela da Diretoria: gerar / revogar a conexão --------------------------------
const escH = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function paginaConexaoClaude(diretor, cfg) {
  const dataBRcfg = cfg && cfg.criadoEm ? `${cfg.criadoEm.slice(8, 10)}/${cfg.criadoEm.slice(5, 7)}/${cfg.criadoEm.slice(0, 4)}` : '';
  const estado = cfg
    ? `<div style="background:#E4F3E6;border:1px solid #bfe3c6;border-radius:12px;padding:14px 16px;font-size:13px;color:#1E5B31"><b>🟢 Conexão ATIVA</b> — criada em ${escH(dataBRcfg)}${cfg.por ? ` por ${escH(cfg.por)}` : ''}.<br><span style="color:#4F6469">A chave não fica guardada aqui (só a impressão digital dela). Se você perdeu a URL, gere uma nova — a antiga morre na hora.</span></div>`
    : `<div style="background:#FFF4DE;border:1px solid #f0dca6;border-radius:12px;padding:14px 16px;font-size:13px;color:#8A6A16"><b>⚪ Conexão desligada.</b> Gere a chave para conectar o Claude à base.</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Conexão com o Claude — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}.wrap{max-width:720px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px;margin-top:14px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none}
.btn-p{background:#92C430;color:#10262B}.btn-r{background:#fff;color:#B23A2E;border:1.5px solid #E0B4AE}</style></head>
<body><div style="background:#00333B;padding:15px 20px"><div style="max-width:720px;margin:0 auto"><a href="/diretoria" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">conexão com o claude</span></a></div></div>
<div class="wrap">
  <h1 style="font-size:20px;margin:14px 0 6px">🔌 Base de clientes no Claude</h1>
  <p style="font-size:13px;color:#4F6469;line-height:1.65;margin:0 0 14px">Conecta o claude.ai à nossa base — <b>só leitura</b> (buscar clientes, ficha, coletas e números gerais). Nada pode ser alterado por essa conexão, e o CPF de pessoa física sai mascarado.</p>
  ${estado}
  <div class="card">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-p" id="bGerar">${cfg ? '🔁 Gerar chave NOVA (a antiga morre)' : '🔑 Gerar a chave da conexão'}</button>
      ${cfg ? '<button class="btn btn-r" id="bRev">Desligar a conexão</button>' : ''}
    </div>
    <div id="resultado" style="display:none;margin-top:16px">
      <div style="font-size:12.5px;font-weight:800;color:#B23A2E">⚠️ Esta URL é uma CHAVE — quem tiver, lê a base. Copie AGORA (ela não aparece de novo) e cole só no claude.ai.</div>
      <textarea id="urlBox" readonly rows="3" style="width:100%;margin-top:8px;border:1.5px solid #92C430;border-radius:10px;padding:11px;font-size:12.5px;font-family:ui-monospace,Menlo,monospace"></textarea>
      <button class="btn" id="bCopiar" style="margin-top:8px;background:#00333B;color:#fff">📋 Copiar a URL</button>
    </div>
    <div id="m" style="font-size:12.5px;color:#4F6469;margin-top:10px"></div>
  </div>
  <div class="card">
    <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin-bottom:8px">Como ligar no claude.ai (uma vez só)</div>
    <ol style="font-size:13px;color:#4F6469;line-height:1.8;margin:0;padding-left:20px">
      <li>Gere a chave acima e <b>copie a URL</b>;</li>
      <li>No <b>claude.ai</b>: ⚙️ <b>Configurações → Conectores</b> (Settings → Connectors);</li>
      <li><b>Adicionar conector personalizado</b> (Add custom connector) → nome: <b>Base Ecobraz</b> → cole a URL → salvar;</li>
      <li>Numa conversa, abra o menu de ferramentas (🔍 <i>Search &amp; tools</i>) e confira se <b>Base Ecobraz</b> está ligado;</li>
      <li>Pronto: peça, por exemplo, <i>"busque o cliente ROLDÃO na base da Ecobraz e me diga as últimas coletas dele"</i>.</li>
    </ol>
    <div style="font-size:11.5px;color:#9aa7a4;margin-top:10px">Se algo vazar ou parecer estranho, volte aqui e toque em <b>Desligar a conexão</b> (ou gere chave nova) — a URL antiga para de funcionar na hora.</div>
  </div>
</div>
<script>
var bG=document.getElementById('bGerar'),bR=document.getElementById('bRev'),m=document.getElementById('m');
if(bG)bG.onclick=function(){if(${cfg ? 'true' : 'false'}&&!confirm('Gerar uma chave NOVA? A URL antiga para de funcionar na hora (troque também no claude.ai).'))return;bG.disabled=true;m.textContent='Gerando…';
  fetch('/api/diretoria/conexao-claude',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({acao:'gerar'})}).then(function(r){return r.json();}).then(function(j){bG.disabled=false;if(!j.ok){m.textContent=j.error||'Falha.';return;}m.textContent='';document.getElementById('resultado').style.display='block';document.getElementById('urlBox').value=j.url;}).catch(function(){bG.disabled=false;m.textContent='Sem conexão.';});};
if(bR)bR.onclick=function(){if(!confirm('Desligar a conexão com o Claude? A URL atual para de funcionar na hora.'))return;bR.disabled=true;m.textContent='Desligando…';
  fetch('/api/diretoria/conexao-claude',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({acao:'revogar'})}).then(function(r){return r.json();}).then(function(j){if(j.ok){location.reload();}else{bR.disabled=false;m.textContent=j.error||'Falha.';}}).catch(function(){bR.disabled=false;m.textContent='Sem conexão.';});};
var bC=document.getElementById('bCopiar');if(bC)bC.onclick=function(){var t=document.getElementById('urlBox');t.select();try{document.execCommand('copy');bC.textContent='✓ Copiada';}catch(e){m.textContent='Selecione o texto e copie manualmente.';}};
</script>
</body></html>`;
}
