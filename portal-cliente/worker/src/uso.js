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
  const vazio = { clientes: { hoje: 0, ontem: 0, semana: 0, mes: 0, serie: [], top5: [] }, equipe: { hoje: 0, semana: 0, mes: 0, pessoas: [] } };
  if (!env.PORTAL_KV) return vazio;
  const hoje = dataBrasil();
  const d7 = new Set(seq(7)), d30 = new Set(seq(30));
  // Série diária (contador do Marcio, 17/08): clientes DISTINTOS por dia, 14 dias.
  const dias14 = seq(14);
  const porDia = new Map(dias14.map((d) => [d, new Set()]));
  try {
    const kc = await listarPrefixo(env, 'uso:c:');
    const cDia = new Set(), cSem = new Set(), cMes = new Set(); const porCli = new Map();
    for (const k of kc) {
      const m = k.name.match(/^uso:c:(\d{4}-\d{2}-\d{2}):(.+)$/);
      if (!m) continue;
      const dia = m[1], doc = m[2];
      if (dia === hoje) cDia.add(doc);
      if (d7.has(dia)) cSem.add(doc);
      if (porDia.has(dia)) porDia.get(dia).add(doc);
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
    return {
      clientes: {
        hoje: cDia.size, ontem: (porDia.get(dataBrasil(1)) || new Set()).size, semana: cSem.size, mes: cMes.size,
        serie: [...dias14].reverse().map((d) => ({ d, n: (porDia.get(d) || new Set()).size })),
        top5,
      },
      equipe: { hoje: eDia.size, semana: eSem.size, mes: eMes.size, pessoas },
    };
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

// --- Monitor nominal de acessos dos CLIENTES (pedido do Marcio, 09/08) -----------
// Detalha, cliente a cliente, o que os cartões agregados não mostram: QUEM entrou,
// QUANDO foi a última vez e a frequência. Janela = o que existe no KV (TTL 60 dias).
const fmtBR = (iso) => { const [a, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${a}` : '—'; };
const fmtDocBR = (v) => { const d = String(v || '').replace(/\D/g, ''); if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); return v || '—'; };

export async function acessosClientesDetalhe(env) {
  const out = { clientes: [], hoje: 0, semana: 0, mes: 0, janelaDias: 60 };
  if (!env.PORTAL_KV) return out;
  const hoje = dataBrasil();
  const d7 = new Set(seq(7)), d30 = new Set(seq(30));
  const porDoc = new Map();
  try {
    const keys = await (async () => {
      const acc = []; let cursor;
      do { const r = await env.PORTAL_KV.list({ prefix: 'uso:c:', cursor, limit: 1000 }); acc.push(...(r.keys || [])); cursor = r.list_complete ? null : r.cursor; } while (cursor);
      return acc;
    })();
    for (const k of keys) {
      const m = k.name.match(/^uso:c:(\d{4}-\d{2}-\d{2}):(.+)$/);
      if (!m) continue;
      const dia = m[1], doc = m[2];
      const c = porDoc.get(doc) || { doc, dias: [] };
      c.dias.push(dia);
      porDoc.set(doc, c);
    }
    for (const c of porDoc.values()) {
      c.dias.sort();
      c.primeiro = c.dias[0];
      c.ultimo = c.dias[c.dias.length - 1];
      c.ativoHoje = c.ultimo === hoje;
      c.dias30 = c.dias.filter((d) => d30.has(d)).length;
      c.dias7 = c.dias.filter((d) => d7.has(d)).length;
      try { c.pessoa = (await env.PORTAL_KV.get('uso:cnome:' + c.doc)) || ''; } catch { c.pessoa = ''; }
      // Enriquecimento pela base (D1): razão social e e-mail do cadastro.
      if (env.DB_PLOOMES) {
        try {
          const r = await env.DB_PLOOMES.prepare("SELECT nome, email FROM contatos WHERE REPLACE(REPLACE(REPLACE(REPLACE(documento,'.',''),'-',''),'/',''),' ','')=?1 LIMIT 1").bind(c.doc).first();
          if (r) { c.empresa = String(r.nome || '').trim(); c.email = String(r.email || '').trim(); }
        } catch { /* segue sem enriquecer */ }
      }
      if (c.ultimo === hoje) out.hoje++;
      if (c.dias7 > 0) out.semana++;
      if (c.dias30 > 0) out.mes++;
    }
    out.clientes = [...porDoc.values()].sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo)));
  } catch { /* devolve o que tiver */ }
  return out;
}

export function paginaAcessosClientes(dados) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const d = dados || { clientes: [], hoje: 0, semana: 0, mes: 0, janelaDias: 60 };
  const rows = d.clientes.map((c) => `<tr>
    <td><b>${esc(c.empresa || c.pessoa || 'Cliente ***' + String(c.doc).slice(-4))}</b>${c.empresa && c.pessoa && c.pessoa !== c.empresa ? `<br><span style="color:#7c8a87;font-size:11px">${esc(c.pessoa)}</span>` : ''}</td>
    <td style="white-space:nowrap">${esc(fmtDocBR(c.doc))}</td>
    <td>${esc(c.email || '—')}</td>
    <td style="white-space:nowrap"><b>${esc(fmtBR(c.ultimo))}</b>${c.ativoHoje ? ' <span style="font-size:9.5px;font-weight:800;color:#0B6B3A;background:#E7F4EC;border-radius:999px;padding:2px 8px">HOJE</span>' : ''}</td>
    <td style="white-space:nowrap">${esc(fmtBR(c.primeiro))}</td>
    <td style="text-align:center"><b>${c.dias7}</b></td>
    <td style="text-align:center"><b>${c.dias30}</b></td>
  </tr>`).join('') || '<tr><td colspan="7" style="color:#8fa39f">Nenhum acesso de cliente registrado na janela de medição.</td></tr>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Acessos dos clientes — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:960px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th{text-align:left;color:#7c8a87;font-weight:800;font-size:10px;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;border-bottom:2px solid #E4EBE9}
td{padding:10px;border-bottom:1px solid #EEF1F0;vertical-align:top}
tr:last-child td{border-bottom:none}
.kpi{display:flex;gap:14px;text-align:center;margin-bottom:16px}
.kpi>div{flex:1;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px}
.kpi b{font-size:26px;color:#0B5B66;display:block;line-height:1}
.kpi span{font-size:10px;color:#8fa39f;font-weight:800;letter-spacing:.06em}
@media(max-width:700px){.tblwrap{overflow-x:auto}}
</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:960px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <a href="/diretoria" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">acessos · clientes</span></a>
  <a href="/diretoria" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Painel</a>
</div></div>
<div class="wrap">
  <h1 style="font-size:21px;margin:0 0 4px">🏢 Quais clientes estão usando o sistema</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 16px">Cliente a cliente: última entrada, primeira entrada registrada e frequência. Um "dia ativo" = entrou no portal naquele dia (contado uma vez por dia).</p>
  <div class="kpi">
    <div><b>${d.hoje}</b><span>HOJE</span></div>
    <div><b>${d.semana}</b><span>7 DIAS</span></div>
    <div><b>${d.mes}</b><span>30 DIAS</span></div>
    <div><b>${d.clientes.length}</b><span>NA JANELA (${d.janelaDias}D)</span></div>
  </div>
  <div class="card tblwrap">
    <table>
      <thead><tr><th>Cliente</th><th>Documento</th><th>E-mail (cadastro)</th><th>Último acesso</th><th>Primeiro registro</th><th style="text-align:center">Dias 7d</th><th style="text-align:center">Dias 30d</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <p style="font-size:11px;color:#9aa7a4;margin-top:12px;line-height:1.6"><b>Transparência da medição:</b> a contagem existe desde que a medição foi ligada (não há registro retroativo) e guarda ${d.janelaDias} dias. "Primeiro registro" é o primeiro acesso <i>dentro dessa janela</i> — não necessariamente o primeiro da vida. Clientes que nunca entraram não aparecem aqui.</p>
</div></body></html>`;
}
