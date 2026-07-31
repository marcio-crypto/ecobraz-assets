// Medição de USO do sistema + PENDÊNCIAS — alimenta o Painel da Diretoria.
//
// Como mede: presença por dia (chave KV por pessoa/dia, TTL 60 dias). Sem contador
// frágil: gravar 2x no mesmo dia é idempotente, então não há corrida de escrita.
//  - uso:c:{AAAA-MM-DD}:{doc}   → cliente (CNPJ/CPF) acessou naquele dia
//  - uso:cnome:{doc}            → nome do cliente (para o top 5 sem consulta pesada)
//  - uso:e:{AAAA-MM-DD}:{email} → funcionário acessou naquele dia
//  - uso:enome:{email}          → nome + papel do funcionário
//
// HONESTIDADE: a medição começa a valer do deploy em diante (não existe registro
// retroativo de acessos). "Semana" = últimos 7 dias; "mês" = últimos 30 dias.
// Dia calculado no fuso do Brasil (UTC−3, sem horário de verão).

const dataBrasil = (menosDias = 0) => new Date(Date.now() - 3 * 3600e3 - (menosDias * 86400e3)).toISOString().slice(0, 10);
const seq = (n) => Array.from({ length: n }, (_, i) => dataBrasil(i));

// Registra 1 acesso (best-effort; nunca derruba a página).
// ECONOMIA DE GRAVAÇÕES (lição de 2026-07-29, limite diário do KV estourado):
// só grava UMA vez por pessoa por dia — se a marca do dia já existe, não grava
// nada (leitura é barata; gravação conta no teto diário do plano).
export async function registrarUso(env, quem) {
  if (!env.PORTAL_KV || !quem) return;
  const dia = dataBrasil();
  try {
    if (quem.tipo === 'cliente') {
      const doc = String(quem.doc || '').replace(/\D/g, '');
      if (!doc) return;
      if (await env.PORTAL_KV.get(`uso:c:${dia}:${doc}`)) return; // já contado hoje
      await env.PORTAL_KV.put(`uso:c:${dia}:${doc}`, '1', { expirationTtl: 60 * 86400 });
      if (quem.nome) await env.PORTAL_KV.put(`uso:cnome:${doc}`, String(quem.nome).slice(0, 120), { expirationTtl: 120 * 86400 });
    } else if (quem.tipo === 'equipe') {
      const em = String(quem.email || '').trim().toLowerCase();
      if (!em) return;
      if (await env.PORTAL_KV.get(`uso:e:${dia}:${em}`)) return; // já contado hoje
      await env.PORTAL_KV.put(`uso:e:${dia}:${em}`, '1', { expirationTtl: 60 * 86400 });
      await env.PORTAL_KV.put(`uso:enome:${em}`, JSON.stringify({ nome: quem.nome || '', papel: quem.papel || '' }), { expirationTtl: 120 * 86400 });
    }
  } catch { /* medição não pode quebrar nada */ }
}

async function listarPrefixo(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const r = await env.PORTAL_KV.list({ prefix, cursor, limit: 1000 });
    keys.push(...(r.keys || []));
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return keys;
}

// Agrega os acessos: clientes distintos (hoje/7d/30d + top 5) e equipe pessoa a pessoa.
export async function resumoUso(env) {
  const vazio = { clientes: { hoje: 0, semana: 0, mes: 0, top5: [] }, equipe: { hoje: 0, semana: 0, mes: 0, pessoas: [] } };
  if (!env.PORTAL_KV) return vazio;
  const hoje = dataBrasil();
  const d7 = new Set(seq(7)), d30 = new Set(seq(30));
  try {
    const kc = await listarPrefixo(env, 'uso:c:');
    const cDia = new Set(), cSem = new Set(), cMes = new Set(); const porCli = new Map();
    for (const k of kc) {
      const m = k.name.match(/^uso:c:(\d{4}-\d{2}-\d{2}):(.+)$/);
      if (!m) continue;
      const dia = m[1], doc = m[2];
      if (dia === hoje) cDia.add(doc);
      if (d7.has(dia)) cSem.add(doc);
      if (d30.has(dia)) { cMes.add(doc); porCli.set(doc, (porCli.get(doc) || 0) + 1); }
    }
    const top5 = [];
    for (const [doc, dias] of [...porCli.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      let nome = ''; try { nome = (await env.PORTAL_KV.get('uso:cnome:' + doc)) || ''; } catch { /* segue */ }
      top5.push({ doc, nome: nome || ('Cliente ***' + doc.slice(-4)), dias });
    }
    const ke = await listarPrefixo(env, 'uso:e:');
    const eDia = new Set(), eSem = new Set(), eMes = new Set(); const porEq = new Map();
    for (const k of ke) {
      const m = k.name.match(/^uso:e:(\d{4}-\d{2}-\d{2}):(.+)$/);
      if (!m) continue;
      const dia = m[1], em = m[2];
      if (dia === hoje) eDia.add(em);
      if (d7.has(dia)) eSem.add(em);
      if (d30.has(dia)) { eMes.add(em); porEq.set(em, (porEq.get(em) || 0) + 1); }
    }
    const pessoas = [];
    for (const [em, dias] of [...porEq.entries()].sort((a, b) => b[1] - a[1])) {
      let info = { nome: '', papel: '' };
      try { const raw = await env.PORTAL_KV.get('uso:enome:' + em); if (raw) info = JSON.parse(raw); } catch { /* segue */ }
      pessoas.push({ email: em, nome: info.nome || em.split('@')[0], papel: info.papel || '', dias, ativoHoje: eDia.has(em) });
    }
    return { clientes: { hoje: cDia.size, semana: cSem.size, mes: cMes.size, top5 }, equipe: { hoje: eDia.size, semana: eSem.size, mes: eMes.size, pessoas } };
  } catch { return vazio; }
}

// Conta itens (leads, OS…) por período pelo campo de data + série dos últimos 14 dias.
export function contarPorPeriodo(itens = [], campo = 'criadoEm') {
  const hoje = dataBrasil();
  const d7 = new Set(seq(7)), d30 = new Set(seq(30));
  const dias14 = seq(14).reverse(); // do mais antigo ao mais novo
  const mapa = new Map(dias14.map((d) => [d, 0]));
  let dia = 0, semana = 0, mes = 0;
  for (const it of itens) {
    const d = String((it && it[campo]) || '').slice(0, 10);
    if (!d) continue;
    if (d === hoje) dia++;
    if (d7.has(d)) semana++;
    if (d30.has(d)) mes++;
    if (mapa.has(d)) mapa.set(d, mapa.get(d) + 1);
  }
  return { dia, semana, mes, serie: [...mapa.entries()].map(([d, n]) => ({ d, n })) };
}

// Junta as pendências do sistema, com o RESPONSÁVEL por cada uma e a idade.
//  - Leads do site sem tratamento → Escritório
//  - Coletas em aberto → o motorista designado (ou "sem motorista"), doca…
//  - Operações na fila de validação → Engenharia
export function reunirPendencias({ leads = [], coletas = [], aguardandoValidacao = 0 } = {}) {
  const hoje = dataBrasil();
  const d7 = new Set(seq(7)), d30 = new Set(seq(30));
  const idadeDias = (iso) => {
    const d = String(iso || '').slice(0, 10);
    if (!d) return null;
    const ms = Date.parse(hoje) - Date.parse(d);
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400e3)) : null;
  };
  const grupos = new Map();
  const add = (chave, rotulo, quem, criadoEm) => {
    const g = grupos.get(chave) || { rotulo, quem, qtd: 0, maisAntigaDias: 0, hoje: 0, semana: 0, mes: 0, antigas: 0 };
    g.qtd++;
    const dISO = String(criadoEm || '').slice(0, 10);
    const idade = idadeDias(criadoEm);
    if (idade != null && idade > g.maisAntigaDias) g.maisAntigaDias = idade;
    if (dISO === hoje) g.hoje++; else if (d7.has(dISO)) g.semana++; else if (d30.has(dISO)) g.mes++; else g.antigas++;
    grupos.set(chave, g);
  };
  for (const l of leads) if (l && l.status !== 'tratado' && l.status !== 'sem_retorno' && l.status !== 'excluido') add('leads', 'Leads do site sem tratamento', 'Escritório', l.criadoEm);
  const ROT = {
    agendada: ['Coletas agendadas aguardando execução', (c) => c.agenteNome || 'Sem motorista designado'],
    em_transporte: ['Coletas em transporte (não encerradas)', (c) => c.agenteNome || 'Motorista'],
    na_unidade: ['Cargas na unidade aguardando a doca', () => 'Operação (doca)'],
  };
  for (const c of coletas) {
    const r = ROT[c && c.status];
    if (r) add('col:' + c.status + ':' + (c.agenteNome || ''), r[0], r[1](c), c.criadoEm);
  }
  if (aguardandoValidacao > 0) grupos.set('eng', { rotulo: 'Operações aguardando validação técnica', quem: 'Engenharia Ambiental', qtd: aguardandoValidacao, maisAntigaDias: null, hoje: 0, semana: 0, mes: 0, antigas: 0 });
  return [...grupos.values()].sort((a, b) => b.qtd - a.qtd);
}
