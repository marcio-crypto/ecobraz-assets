// ENTRADA POR CARGAS (processo do galpão — spec do Eng. Marcelo, 07/08/2026).
// Fluxo: [Chegada] → Carga (agrupa OSs do mesmo cliente/dia) → Pesagem (bruto/tara/
// líquido) + ≥2 fotos → Fracionamento em LOTES (categoria, peso, destino) → Etiqueta
// QR por lote (impressora térmica 80mm) → Filas por destino (matriz) com status.
//
// Regras do Marcelo implementadas aqui:
// - OS com laudo/certificado solicitado ⇒ carga EXCLUSIVA (não agrupa com outras).
// - Soma dos pesos dos lotes ≤ peso líquido da carga + 5% de tolerância.
// - Status do lote: aguardando → processando → finalizado.
// Dados no D1 (consistente na hora — lição aprendida com a tela de Documentos).

import qrcode from 'qrcode-generator';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const numBR = (s) => { const t = String(s == null ? '' : s).trim(); if (!t) return 0; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
const kg = (n) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg';
const horaBR = (iso) => { const d = new Date(iso || Date.now()); if (isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
async function sha256hex(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
export async function seloLote(id, env) { return (await sha256hex(`${env.PORTAL_SESSION_SECRET || 'ecobraz'}|lote|${id}`)).slice(0, 12); }

// A matriz de destinos do Marcelo — chave, rótulo, descrição e o que acontece depois.
export const DESTINOS = {
  laudo: { rot: 'Laudo (destruição técnica)', desc: 'Destruição com laudo fotográfico e baixa patrimonial. Vai para a fila de Destruição/Inutilização (fotos início/meio/fim).' },
  remanufatura: { rot: 'Remanufatura', desc: 'Potencial de teste, reparo e reuso. Vai para a bancada de Manutenção/Testes/Triagem de Ativos.' },
  reciclagem: { rot: 'Reciclagem (desmonte)', desc: 'Triagem física, prensa, moinho ou descaracterização. Vai para a linha de Prensagem/Separação de Insumos.' },
  destinacao: { rot: 'Destinação (expedição)', desc: 'Pronto para parceiros/terceiros. Vai para a expedição com emissão de MTR e CDF.' },
};
const STATUS_LOTE = { aguardando: 'Aguardando processamento', processando: 'Em processamento', finalizado: 'Finalizado' };
export const TOLERANCIA = 1.05; // 5% sobre o peso líquido
// Só o laudo de destruição técnica exige carga exclusiva (ajuste do Marcelo, 07/08):
// "Laudo fotográfico" e certificados comuns são de rotina e NÃO travam o agrupamento.
export const exigeLaudoExclusivo = (os) => (((os && os.certificados) || []).includes('Laudo de Sanitização'));

// --- Banco (D1) ----------------------------------------------------------------
let migrouColunas = false;
async function db(env) {
  if (!env.DB_PLOOMES) return null;
  try {
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS op_cargas (id TEXT PRIMARY KEY, criado_em TEXT, criado_por TEXT, cliente_nome TEXT, cliente_doc TEXT, os_json TEXT, exclusiva_laudo INTEGER DEFAULT 0, peso_bruto REAL, tara REAL, peso_liquido REAL, fotos_json TEXT, status TEXT, cancelada_json TEXT DEFAULT \'\', edicoes_json TEXT DEFAULT \'\')').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS op_lotes (id TEXT PRIMARY KEY, carga_id TEXT, categoria TEXT, peso REAL, qtd TEXT, destino TEXT, status TEXT, criado_em TEXT, criado_por TEXT, edicoes_json TEXT DEFAULT \'\', expedicao_json TEXT DEFAULT \'\')').run();
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS op_fornecedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, cnpj TEXT, cidade_uf TEXT, criado_em TEXT)').run();
  } catch { return null; }
  // Tabelas criadas antes de cancelar/editar/expedir existirem não têm as colunas — completa uma vez.
  if (!migrouColunas) {
    for (const sql of [
      'ALTER TABLE op_cargas ADD COLUMN cancelada_json TEXT DEFAULT \'\'',
      'ALTER TABLE op_cargas ADD COLUMN edicoes_json TEXT DEFAULT \'\'',
      'ALTER TABLE op_lotes ADD COLUMN edicoes_json TEXT DEFAULT \'\'',
      'ALTER TABLE op_lotes ADD COLUMN expedicao_json TEXT DEFAULT \'\'',
    ]) {
      try { await env.DB_PLOOMES.prepare(sql).run(); } catch { /* coluna já existe */ }
    }
    migrouColunas = true;
  }
  return env.DB_PLOOMES;
}
const parseEdicoes = (raw) => { try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; } };
async function proximoId(d, tabela, prefixo, digitos) {
  const ano = new Date().getFullYear();
  const like = `${prefixo}-${ano}-%`;
  let n = 0;
  try { const r = await d.prepare(`SELECT MAX(CAST(substr(id, ${prefixo.length + 7}) AS INTEGER)) AS m FROM ${tabela} WHERE id LIKE ?1`).bind(like).first(); n = Number(r && r.m) || 0; } catch { n = 0; }
  return `${prefixo}-${ano}-${String(n + 1).padStart(digitos, '0')}`;
}
const rowCarga = (r) => {
  if (!r) return null;
  let cancelada = null; try { cancelada = r.cancelada_json ? JSON.parse(r.cancelada_json) : null; } catch { cancelada = null; }
  return { id: r.id, criadoEm: r.criado_em, criadoPor: r.criado_por, clienteNome: r.cliente_nome, clienteDoc: r.cliente_doc, oss: JSON.parse(r.os_json || '[]'), exclusivaLaudo: !!r.exclusiva_laudo, pesoBruto: r.peso_bruto, tara: r.tara, pesoLiquido: r.peso_liquido, fotos: JSON.parse(r.fotos_json || '[]'), status: r.status, cancelada, edicoes: parseEdicoes(r.edicoes_json) };
};
const rowLote = (r) => {
  if (!r) return null;
  let expedicao = null; try { expedicao = r.expedicao_json ? JSON.parse(r.expedicao_json) : null; } catch { expedicao = null; }
  return { id: r.id, cargaId: r.carga_id, categoria: r.categoria, peso: r.peso, qtd: r.qtd, destino: r.destino, status: r.status, criadoEm: r.criado_em, criadoPor: r.criado_por, edicoes: parseEdicoes(r.edicoes_json), expedicao };
};

export async function listarCargas(env) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT * FROM op_cargas ORDER BY criado_em DESC LIMIT 200').all(); return (r.results || []).map(rowCarga); } catch { return []; }
}
export async function lerCarga(env, id) {
  const d = await db(env); if (!d) return null;
  const r = await d.prepare('SELECT * FROM op_cargas WHERE id=?1').bind(String(id || '')).first().catch(() => null);
  return rowCarga(r);
}
export async function lotesDaCarga(env, cargaId) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT * FROM op_lotes WHERE carga_id=?1 ORDER BY id').bind(String(cargaId || '')).all(); return (r.results || []).map(rowLote); } catch { return []; }
}
export async function lerLote(env, id) {
  const d = await db(env); if (!d) return null;
  const r = await d.prepare('SELECT * FROM op_lotes WHERE id=?1').bind(String(id || '')).first().catch(() => null);
  return rowLote(r);
}
export async function listarLotesPorDestino(env, destino) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT * FROM op_lotes WHERE destino=?1 ORDER BY (status IN (\'finalizado\',\'expedido\')), id DESC LIMIT 300').bind(String(destino || '')).all(); return (r.results || []).map(rowLote); } catch { return []; }
}

// Abre a carga agrupando as OSs do dia — de 1 a N clientes (a rota do caminhão),
// conforme o Marcelo. Regra do laudo: OS com certificado/laudo solicitado não
// agrupa — vira carga exclusiva.
export async function novaCarga(env, user, oss) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const lista = (oss || []).filter(Boolean);
  if (!lista.length) return { ok: false, message: 'Selecione ao menos uma OS.' };
  const comLaudo = lista.filter(exigeLaudoExclusivo);
  if (comLaudo.length && lista.length > 1) {
    return { ok: false, message: `A OS ${comLaudo[0].numero || comLaudo[0].id} exige laudo e precisa de carga EXCLUSIVA. Crie uma carga só para ela.` };
  }
  const clientes = [...new Set(lista.map((o) => limpar(o.clienteNome || '')).filter(Boolean))];
  const rotulo = clientes.length <= 1 ? (clientes[0] || '') : `${clientes.length} clientes (rota do dia)`;
  const id = await proximoId(d, 'op_cargas', 'CG', 3);
  const agora = new Date().toISOString();
  const osJson = JSON.stringify(lista.map((o) => ({ id: o.id, numero: o.numero || '', clienteNome: o.clienteNome || '', laudo: exigeLaudoExclusivo(o) })));
  await d.prepare('INSERT INTO op_cargas (id,criado_em,criado_por,cliente_nome,cliente_doc,os_json,exclusiva_laudo,fotos_json,status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
    .bind(id, agora, (user && user.email) || '', rotulo, clientes.length === 1 ? String(lista[0].clienteDoc || '') : '', osJson, comLaudo.length ? 1 : 0, '[]', 'aberta').run();
  return { ok: true, id };
}

export async function pesarCarga(env, id, bruto, tara, opts = {}) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const c = await lerCarga(env, id);
  if (!c) return { ok: false, message: 'Carga não encontrada.' };
  if (c.status === 'cancelada') return { ok: false, message: 'Esta carga foi cancelada — abra uma carga nova.' };
  const b = Number(bruto) || 0, t = Number(tara) || 0;
  if (b <= 0) return { ok: false, message: 'Informe o peso bruto (da balança).' };
  if (t < 0 || t >= b) return { ok: false, message: 'A tara precisa ser menor que o peso bruto.' };
  const liquido = Math.round((b - t) * 10) / 10;
  // ALTERAR uma pesagem já registrada: exige justificativa (controle interno,
  // pedido do Marcelo 12/08) e não pode deixar os lotes já criados sem lastro.
  const jaPesada = Number(c.pesoBruto) > 0;
  let edicoes = c.edicoes || [];
  if (jaPesada) {
    const mudou = Number(c.pesoBruto) !== b || Number(c.tara || 0) !== t;
    if (!mudou) return { ok: true, liquido, semMudanca: true };
    const just = String(opts.justificativa || '').trim();
    if (just.length < 5) return { ok: false, message: 'Alterar uma pesagem já registrada exige justificativa (fica só no controle interno).' };
    const lotes = await lotesDaCarga(env, c.id);
    const soma = lotes.reduce((s, l) => s + (Number(l.peso) || 0), 0);
    const novoLimite = Math.round(liquido * TOLERANCIA * 10) / 10;
    if (soma > novoLimite) return { ok: false, message: `Não dá: os lotes já criados somam ${kg(soma)} e o novo líquido só comporta ${kg(novoLimite)} (líquido ${kg(liquido)} +5%). Ajuste os lotes primeiro.` };
    edicoes = edicoes.concat([{ em: new Date().toISOString(), por: String(opts.por || '').slice(0, 160), justificativa: just.slice(0, 300), o_que: 'pesagem', de: { bruto: c.pesoBruto, tara: c.tara, liquido: c.pesoLiquido }, para: { bruto: b, tara: t, liquido } }]).slice(-30);
  }
  await d.prepare('UPDATE op_cargas SET peso_bruto=?2, tara=?3, peso_liquido=?4, edicoes_json=?5, status=CASE WHEN status=\'aberta\' THEN \'pesada\' ELSE status END WHERE id=?1')
    .bind(c.id, b, t, liquido, JSON.stringify(edicoes)).run();
  return { ok: true, liquido };
}

export async function fotoCarga(env, id, meta) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const c = await lerCarga(env, id);
  if (!c) return { ok: false, message: 'Carga não encontrada.' };
  if (c.status === 'cancelada') return { ok: false, message: 'Esta carga foi cancelada — abra uma carga nova.' };
  const fotos = c.fotos.concat([meta]).slice(0, 12);
  await d.prepare('UPDATE op_cargas SET fotos_json=?2 WHERE id=?1').bind(c.id, JSON.stringify(fotos)).run();
  return { ok: true, total: fotos.length };
}

export async function criarLote(env, user, cargaId, dados) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const c = await lerCarga(env, cargaId);
  if (!c) return { ok: false, message: 'Carga não encontrada.' };
  if (c.status === 'cancelada') return { ok: false, message: 'Esta carga foi cancelada — abra uma carga nova.' };
  if (!c.pesoLiquido) return { ok: false, message: 'Registre a pesagem antes de fracionar.' };
  if ((c.fotos || []).length < 2) return { ok: false, message: 'Anexe no mínimo 2 fotos da carga antes de fracionar.' };
  const categoria = limpar(dados.categoria).slice(0, 80);
  const destino = String(dados.destino || '');
  const peso = Number(dados.peso) || 0;
  if (!categoria) return { ok: false, message: 'Informe o tipo de material / categoria.' };
  if (!DESTINOS[destino]) return { ok: false, message: 'Escolha o destino do lote.' };
  if (peso <= 0) return { ok: false, message: 'Informe o peso do lote.' };
  const lotes = await lotesDaCarga(env, c.id);
  const soma = lotes.reduce((s, l) => s + (Number(l.peso) || 0), 0);
  const limite = Math.round(c.pesoLiquido * TOLERANCIA * 10) / 10;
  if (soma + peso > limite) {
    return { ok: false, message: `Peso estoura o limite da carga: já fracionado ${kg(soma)} + este lote ${kg(peso)} > ${kg(limite)} (líquido ${kg(c.pesoLiquido)} +5%). Confira a balança.` };
  }
  const id = await proximoId(d, 'op_lotes', 'LT', 4);
  await d.prepare('INSERT INTO op_lotes (id,carga_id,categoria,peso,qtd,destino,status,criado_em,criado_por) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)')
    .bind(id, c.id, categoria, peso, limpar(dados.qtd).slice(0, 40), destino, 'aguardando', new Date().toISOString(), (user && user.email) || '').run();
  if (c.status === 'pesada') await d.prepare('UPDATE op_cargas SET status=\'fracionada\' WHERE id=?1').bind(c.id).run();
  return { ok: true, id };
}

export async function excluirLote(env, id) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const l = await lerLote(env, id);
  if (!l) return { ok: false, message: 'Lote não encontrado.' };
  if (l.status !== 'aguardando') return { ok: false, message: 'Só dá para excluir lote que ainda não entrou em processamento.' };
  await d.prepare('DELETE FROM op_lotes WHERE id=?1').bind(l.id).run();
  return { ok: true };
}

// EDITAR um lote (pedido do Marcelo 12/08): categoria, peso, qtd e destino, com
// justificativa obrigatória — fica só no registro interno (não sai em etiqueta).
// Só lote "aguardando": depois que entra em processamento, o conteúdo é história.
export async function editarLote(env, user, id, dados) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const l = await lerLote(env, id);
  if (!l) return { ok: false, message: 'Lote não encontrado.' };
  if (l.status !== 'aguardando') return { ok: false, message: 'Lote que já entrou em processamento não pode ser editado — registre a correção na etapa atual.' };
  const c = await lerCarga(env, l.cargaId);
  if (!c) return { ok: false, message: 'Carga do lote não encontrada.' };
  if (c.status === 'cancelada') return { ok: false, message: 'A carga deste lote foi cancelada.' };
  const just = String((dados && dados.justificativa) || '').trim();
  if (just.length < 5) return { ok: false, message: 'Escreva a justificativa da alteração (fica só no controle interno).' };
  const categoria = limpar(dados.categoria).slice(0, 80);
  const destino = String(dados.destino || '');
  const peso = Number(dados.peso) || 0;
  const qtd = limpar(dados.qtd).slice(0, 40);
  if (!categoria) return { ok: false, message: 'Informe o tipo de material / categoria.' };
  if (!DESTINOS[destino]) return { ok: false, message: 'Escolha o destino do lote.' };
  if (peso <= 0) return { ok: false, message: 'Informe o peso do lote.' };
  const outros = (await lotesDaCarga(env, c.id)).filter((x) => x.id !== l.id);
  const soma = outros.reduce((s, x) => s + (Number(x.peso) || 0), 0);
  const limite = Math.round((Number(c.pesoLiquido) || 0) * TOLERANCIA * 10) / 10;
  if (limite && soma + peso > limite) {
    return { ok: false, message: `Peso estoura o limite da carga: os outros lotes somam ${kg(soma)} + este ${kg(peso)} > ${kg(limite)} (líquido ${kg(c.pesoLiquido)} +5%).` };
  }
  const mudou = categoria !== l.categoria || peso !== Number(l.peso) || qtd !== String(l.qtd || '') || destino !== l.destino;
  if (!mudou) return { ok: true, semMudanca: true };
  const edicoes = (l.edicoes || []).concat([{ em: new Date().toISOString(), por: (user && user.email) || '', justificativa: just.slice(0, 300), o_que: 'lote', de: { categoria: l.categoria, peso: l.peso, qtd: l.qtd, destino: l.destino }, para: { categoria, peso, qtd, destino } }]).slice(-30);
  await d.prepare('UPDATE op_lotes SET categoria=?2, peso=?3, qtd=?4, destino=?5, edicoes_json=?6 WHERE id=?1')
    .bind(l.id, categoria, peso, qtd, destino, JSON.stringify(edicoes)).run();
  return { ok: true };
}

// EXPEDIÇÃO do lote finalizado (pedido do Marcelo 12/08): registrar a SAÍDA —
// fornecedor que recebe o material, MTR de saída (número) e data. O status vira
// "expedido" e fecha o ciclo do lote. A EMISSÃO de MTR pela API do órgão é a
// próxima etapa da integração (task #31) — por ora o número é informado.
export async function expedirLote(env, user, id, dados) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const l = await lerLote(env, id);
  if (!l) return { ok: false, message: 'Lote não encontrado.' };
  if (l.status === 'expedido') return { ok: false, message: 'Este lote já foi expedido.' };
  if (l.status !== 'finalizado') return { ok: false, message: 'Finalize o processamento do lote antes de registrar a saída.' };
  const fornecedor = limpar((dados && dados.fornecedor) || '').slice(0, 160);
  if (fornecedor.length < 3) return { ok: false, message: 'Informe o fornecedor/destinatário que recebe o material.' };
  const cnpj = String((dados && dados.cnpj) || '').replace(/\D/g, '');
  if (cnpj && cnpj.length !== 14) return { ok: false, message: 'CNPJ do fornecedor incompleto — confira (ou deixe em branco).' };
  const dataSaida = String((dados && dados.data) || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataSaida) || Number.isNaN(Date.parse(dataSaida))) return { ok: false, message: 'Informe a data de saída.' };
  const mtr = String((dados && dados.mtr) || '').replace(/\D/g, '').slice(0, 20);
  const cidadeUf = limpar((dados && dados.cidadeUf) || '').slice(0, 80);
  const obs = limpar((dados && dados.obs) || '').slice(0, 300);
  const expedicao = { fornecedor, cnpj, cidadeUf, mtr, data: dataSaida, obs, por: (user && user.email) || '', em: new Date().toISOString() };
  await d.prepare('UPDATE op_lotes SET status=\'expedido\', expedicao_json=?2 WHERE id=?1').bind(l.id, JSON.stringify(expedicao)).run();
  // Registra o fornecedor para as próximas expedições (lista de sugestão).
  try {
    const achou = cnpj
      ? await d.prepare('SELECT id FROM op_fornecedores WHERE cnpj=?1 LIMIT 1').bind(cnpj).first()
      : await d.prepare('SELECT id FROM op_fornecedores WHERE LOWER(nome)=LOWER(?1) LIMIT 1').bind(fornecedor).first();
    if (!achou) await d.prepare('INSERT INTO op_fornecedores (nome, cnpj, cidade_uf, criado_em) VALUES (?1,?2,?3,?4)').bind(fornecedor, cnpj, cidadeUf, new Date().toISOString()).run();
  } catch { /* sugestão é best-effort */ }
  return { ok: true };
}

export async function listarFornecedores(env) {
  const d = await db(env); if (!d) return [];
  try { const r = await d.prepare('SELECT nome, cnpj, cidade_uf FROM op_fornecedores ORDER BY nome LIMIT 200').all(); return r.results || []; } catch { return []; }
}

// Página de expedição do lote (saída para o fornecedor).
export function paginaExpedirLote(l, c, fornecedores, hoje) {
  const forn = (fornecedores || []).map((f) => `<option value="${esc(f.nome)}">${f.cnpj ? esc(f.cnpj) : ''}</option>`).join('');
  return `${head('Expedir ' + l.id)}${topo('entrada · cargas')}
<div class="wrap" style="max-width:640px">
  <a href="/cargas/carga?id=${esc(l.cargaId)}" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Carga ${esc(l.cargaId)}</a>
  <h1 style="font-size:20px;margin:10px 0 4px">🚚 Registrar saída — ${esc(l.id)}</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 12px">${esc(l.categoria)} · ${kg(l.peso)} · destino ${esc((DESTINOS[l.destino] || {}).rot || l.destino)}${c && c.clienteNome ? ' · origem ' + esc(c.clienteNome) : ''}</p>
  <div class="card">
    <label>Fornecedor / destinatário que recebe *</label>
    <input id="x-forn" list="forns" placeholder="ex.: Recicladora XYZ Ltda"><datalist id="forns">${forn}</datalist>
    <div class="g2">
      <div><label>CNPJ do fornecedor (opcional)</label><input id="x-cnpj" inputmode="numeric" placeholder="00.000.000/0000-00"></div>
      <div><label>Cidade/UF (opcional)</label><input id="x-cid" placeholder="ex.: Sorocaba/SP"></div>
    </div>
    <div class="g2">
      <div><label>Data de saída *</label><input id="x-data" type="date" value="${esc(hoje || '')}"></div>
      <div><label>Nº do MTR de saída (se já emitido)</label><input id="x-mtr" inputmode="numeric" placeholder="ex.: 2600XXXXXXXX"></div>
    </div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
      <button type="button" class="btn btn-g" style="padding:8px 12px;font-size:12px" onclick="conferirMtr()">Conferir MTR no órgão</button>
      <span id="x-mtr-info" style="font-size:11.5px;color:#4F6469"></span>
    </div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:6px">A emissão do MTR pela API do órgão é a próxima etapa da integração — por enquanto, emita no site do SIGOR/SINIR e informe o número aqui (ou deixe em branco e complete depois).</div>
    <label>Observação (opcional)</label><input id="x-obs" placeholder="ex.: NF 1234 · motorista João">
    <div style="display:flex;gap:10px;align-items:center;margin-top:16px">
      <button class="btn btn-p" onclick="expedir()">Registrar saída do lote</button>
      <span class="msg" id="x-msg" style="margin:0"></span>
    </div>
  </div>
</div>
<script>
const numBR=(s)=>String(s==null?'':s).replace(/\\D/g,'');
async function conferirMtr(){
  const n=numBR(document.getElementById('x-mtr').value), i=document.getElementById('x-mtr-info');
  if(!n){i.textContent='Digite o número do MTR primeiro.';return;}
  i.textContent='Consultando o órgão…';
  try{const r=await fetch('/api/cargas/mtr-info',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({numero:n})});
    const j=await r.json(); i.textContent=j.message||'Sem retorno.';}
  catch{i.textContent='Falha de rede na consulta.';}
}
async function expedir(){
  const g=(id)=>document.getElementById(id).value;
  const msg=document.getElementById('x-msg');msg.textContent='Registrando…';
  try{const r=await fetch('/api/cargas/expedir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:${JSON.stringify(l.id)},fornecedor:g('x-forn'),cnpj:g('x-cnpj'),cidadeUf:g('x-cid'),data:g('x-data'),mtr:g('x-mtr'),obs:g('x-obs')})});
    const j=await r.json(); if(j.ok){location.href='/cargas/carga?id=${esc(l.cargaId)}';}else{msg.textContent=j.message||'Não deu certo.';}}
  catch{msg.textContent='Falha de rede.';}
}
</script></body></html>`;
}

// Lotes com os dados da carga (cliente) — para o Cronograma/Kanban.
export async function listarLotesComCarga(env) {
  const d = await db(env); if (!d) return [];
  try {
    const r = await d.prepare('SELECT l.*, c.cliente_nome AS carga_cliente, c.status AS carga_status FROM op_lotes l LEFT JOIN op_cargas c ON c.id = l.carga_id ORDER BY l.id DESC LIMIT 300').all();
    return (r.results || []).map((x) => ({ ...rowLote(x), cargaCliente: x.carga_cliente || '', cargaStatus: x.carga_status || '' }));
  } catch { return []; }
}

// Cancela a carga e devolve as OSs para a recepção (pedido do Marcelo, 11/08:
// carga de teste travou 5 OSs). Regras: não cancela duas vezes; não cancela se
// já houver lote (exclua os lotes antes — e lote em processamento nem se exclui).
// Pesagem e fotos registradas ficam guardadas no registro cancelado, só de histórico.
export async function cancelarCarga(env, user, id) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const c = await lerCarga(env, id);
  if (!c) return { ok: false, message: 'Carga não encontrada.' };
  if (c.status === 'cancelada') return { ok: false, message: 'Esta carga já está cancelada.' };
  const lotes = await lotesDaCarga(env, c.id);
  if (lotes.length) return { ok: false, message: `Esta carga já tem ${lotes.length} lote(s). Exclua cada lote primeiro (botão ✕) e aí cancele. Lote que já entrou em processamento não pode ser desfeito.` };
  await d.prepare('UPDATE op_cargas SET status=\'cancelada\', cancelada_json=?2 WHERE id=?1')
    .bind(c.id, JSON.stringify({ por: (user && user.email) || '', em: new Date().toISOString() })).run();
  return { ok: true };
}

export async function mudarStatusLote(env, id, novo) {
  const d = await db(env); if (!d) return { ok: false, message: 'Banco indisponível.' };
  const l = await lerLote(env, id);
  if (!l) return { ok: false, message: 'Lote não encontrado.' };
  const ordem = ['aguardando', 'processando', 'finalizado'];
  const de = ordem.indexOf(l.status), para = ordem.indexOf(String(novo));
  if (para < 0 || para !== de + 1) return { ok: false, message: `Transição inválida (${l.status} → ${novo}).` };
  await d.prepare('UPDATE op_lotes SET status=?2 WHERE id=?1').bind(l.id, String(novo)).run();
  return { ok: true };
}

// --- QR ------------------------------------------------------------------------
export async function qrLoteGif(env, id, origem) {
  const code = await seloLote(id, env);
  const alvo = `${origem}/validar-lote?id=${encodeURIComponent(id)}&c=${code}`;
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// --- UI ------------------------------------------------------------------------
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:18px 16px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:12px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:15px;font-family:inherit;background:#fff;color:#10262B}
.btn{display:inline-block;border:none;border-radius:11px;padding:12px 16px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:18px 0 6px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;display:inline-block}
.p-ag{background:#FFF4DE;color:#8A6A16}.p-pr{background:#E3F0F3;color:#0B5B66}.p-fi{background:#E7F4EC;color:#0B6B3A}.p-laudo{background:#FDE8E8;color:#7a1f1f}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #EEF1F0;border-radius:10px;padding:11px 13px;margin-bottom:8px;background:#FBFDFC}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 14px}
.barra{height:14px;border-radius:7px;background:#EEF3F1;overflow:hidden;margin:6px 0}
.barra i{display:block;height:100%;background:linear-gradient(90deg,#92C430,#5a9e2f)}
.msg{font-size:12.5px;color:#a04030;min-height:16px;margin-top:8px}
@media(max-width:640px){.g3{grid-template-columns:1fr}.g2{grid-template-columns:1fr}}`;
function head(t) { return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title><style>${CSS}</style></head><body>`; }
function topo(sub) {
  return `<div style="background:#00333B;padding:14px 18px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/cargas" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub)}</span></a>
    <a href="/operacao" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">Operação →</a>
  </div></div>`;
}
const stLote = (s) => s === 'expedido' ? '<span class="pill p-fi">🚚 Expedido</span>' : s === 'finalizado' ? '<span class="pill p-fi">Finalizado</span>' : s === 'processando' ? '<span class="pill p-pr">Em processamento</span>' : '<span class="pill p-ag">Aguardando</span>';

export function paginaCargas(user, cargas) {
  const rows = (cargas || []).map((c) => `<a class="row" style="text-decoration:none" href="/cargas/carga?id=${esc(c.id)}">
    <span style="min-width:0"><b style="font-size:13.5px;color:#10262B">${esc(c.id)}</b> · <span style="font-size:12.5px">${esc(c.clienteNome || '—')}</span>${c.exclusivaLaudo ? ' <span class="pill p-laudo">LAUDO — exclusiva</span>' : ''}
      <span style="display:block;font-size:11px;color:#8fa39f">${esc(horaBR(c.criadoEm))} · ${c.oss.length} OS · ${c.pesoLiquido ? 'líquido ' + kg(c.pesoLiquido) : 'sem pesagem'}</span></span>
    <span style="flex:none;font-size:11px;font-weight:800;color:${c.status === 'cancelada' ? '#B23A2E' : '#0B5B66'};text-transform:uppercase">${esc(c.status)}</span>
  </a>`).join('') || '<div style="font-size:12.5px;color:#8fa39f">Nenhuma carga ainda. Abra a primeira quando o caminhão chegar.</div>';
  return `${head('Cargas')}${topo('entrada · cargas')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <div><h1 style="font-size:21px;margin:0">🚛 Entrada por Cargas</h1>
    <div style="font-size:12px;color:#7c8a87;margin-top:3px">Chegou caminhão? Abra a carga, pese, fotografe, fracione em lotes e etiquete.</div></div>
    <div style="display:flex;gap:8px"><a href="/cargas/nova" class="btn btn-p">＋ Abrir carga</a><a href="/cargas/filas" class="btn btn-g">Filas por destino</a></div>
  </div>
  <div class="card">${rows}</div>
</div></body></html>`;
}

export function paginaNovaCarga(user, oss) {
  const rows = (oss || []).map((o) => {
    const laudo = exigeLaudoExclusivo(o);
    return `<label class="row" style="cursor:pointer">
      <span style="display:flex;gap:10px;align-items:center;min-width:0"><input type="checkbox" class="os" value="${esc(o.id)}" data-laudo="${laudo ? '1' : '0'}" style="width:19px;height:19px;flex:none">
      <span style="min-width:0"><b style="font-size:13px">${esc(o.numero || o.id)}</b> · <span style="font-size:12.5px">${esc(o.clienteNome || '—')}</span>${laudo ? ' <span class="pill p-laudo">exige laudo — carga exclusiva</span>' : ''}
      <span style="display:block;font-size:11px;color:#8fa39f">${esc(o.material || '')}${o.dataAgendada ? ' · ' + esc(o.dataAgendada) : ''}</span></span></span>
    </label>`;
  }).join('') || '<div style="font-size:12.5px;color:#8fa39f">Nenhuma OS aguardando recebimento agora.</div>';
  return `${head('Abrir carga')}${topo('entrada · cargas')}
<div class="wrap">
  <a href="/cargas" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cargas</a>
  <h1 style="font-size:20px;margin:10px 0 4px">Abrir carga (consolidação)</h1>
  <p style="font-size:12.5px;color:#7c8a87;margin:0 0 12px">Marque as OSs que chegaram juntas <b>no dia</b> — pode misturar clientes da mesma rota. OS que exige laudo entra <b>sozinha</b> numa carga exclusiva.</p>
  <div class="card">${rows}
    <button class="btn btn-p" style="width:100%;margin-top:10px" onclick="abrir()">Abrir carga com as OSs marcadas</button>
    <div class="msg" id="msg"></div>
  </div>
</div>
<script>
async function abrir(){
  const ids=[...document.querySelectorAll('.os:checked')].map(c=>c.value);
  const msg=document.getElementById('msg');
  if(!ids.length){msg.textContent='Marque ao menos uma OS.';return;}
  const laudos=[...document.querySelectorAll('.os:checked')].filter(c=>c.dataset.laudo==='1');
  if(laudos.length && ids.length>1){msg.textContent='OS com laudo entra sozinha — desmarque as outras.';return;}
  msg.textContent='Abrindo…';
  try{const r=await fetch('/api/cargas/nova',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({osIds:ids})});
    const j=await r.json(); if(j.ok){location.href='/cargas/carga?id='+encodeURIComponent(j.id);}else{msg.textContent=j.message||'Não deu certo.';}}
  catch{msg.textContent='Falha de rede.';}
}
</script></body></html>`;
}

export function paginaCarga(user, c, lotes) {
  const soma = (lotes || []).reduce((s, l) => s + (Number(l.peso) || 0), 0);
  const limite = c.pesoLiquido ? Math.round(c.pesoLiquido * TOLERANCIA * 10) / 10 : 0;
  const pct = limite ? Math.min(100, Math.round(soma / limite * 100)) : 0;
  const podeFracionar = !!c.pesoLiquido && (c.fotos || []).length >= 2;
  const cancelada = c.status === 'cancelada';
  const avisoCancelada = cancelada ? `<div style="background:#FDF3F1;border:1.5px solid #E8B9B2;border-radius:14px;padding:14px 16px;margin-bottom:12px">
    <div style="font-size:14px;font-weight:800;color:#B23A2E">🚫 Carga cancelada</div>
    <div style="font-size:12.5px;color:#5d4a46;margin-top:4px">${c.cancelada ? `Em ${esc(horaBR(c.cancelada.em))} por ${esc(c.cancelada.por || '—')}. ` : ''}As OSs desta carga <b>voltaram para a recepção</b> e já podem entrar numa nova carga (em "＋ Abrir carga"). Este registro fica só como histórico.</div>
  </div>` : '';
  const osRows = c.oss.map((o) => `<span class="pill" style="background:#EEF3F1;color:#374b48;margin:0 6px 6px 0">${esc(o.numero || o.id)}${o.clienteNome ? ' · ' + esc(o.clienteNome) : ''}${o.laudo ? ' · LAUDO' : ''}</span>`).join('');
  const fotos = (c.fotos || []).map((f, i) => `<a href="/cargas/foto?id=${esc(c.id)}&i=${i}" target="_blank" rel="noopener" style="display:inline-block;width:74px;height:74px;border-radius:10px;background:#EEF3F1;border:1px solid #E4EBE9;overflow:hidden;margin:0 6px 6px 0"><img src="/cargas/foto?id=${esc(c.id)}&i=${i}" style="width:100%;height:100%;object-fit:cover" alt="foto"></a>`).join('');
  const destinoOptsDe = (sel) => Object.entries(DESTINOS).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(v.rot)}</option>`).join('');
  const loteRows = (lotes || []).map((l) => `<div>
  <div class="row">
    <span style="min-width:0"><b style="font-size:13px">${esc(l.id)}</b> · <span style="font-size:12.5px">${esc(l.categoria)}</span>
      <span style="display:block;font-size:11px;color:#8fa39f">${kg(l.peso)}${l.qtd ? ' · ' + esc(l.qtd) : ''} · ${esc((DESTINOS[l.destino] || {}).rot || l.destino)}${(l.edicoes || []).length ? ' · ✎ alterado' : ''}</span>
      ${l.status === 'expedido' && l.expedicao ? `<span style="display:block;font-size:11px;color:#1E5B31;margin-top:2px">🚚 ${esc(l.expedicao.fornecedor)}${l.expedicao.mtr ? ' · MTR ' + esc(l.expedicao.mtr) : ''} · saída ${esc((l.expedicao.data || '').split('-').reverse().join('/'))}</span>` : ''}</span>
    <span style="flex:none;display:flex;gap:6px;align-items:center">${stLote(l.status)}
      <a class="btn btn-g" style="padding:7px 11px;font-size:12px" href="/cargas/etiqueta?id=${esc(l.id)}" target="_blank" rel="noopener">🏷️ Etiqueta</a>
      ${l.status === 'finalizado' ? `<a class="btn btn-p" style="padding:7px 11px;font-size:12px;text-decoration:none" href="/cargas/expedir?id=${esc(l.id)}">🚚 Registrar saída</a>` : ''}
      ${l.status === 'aguardando' ? `<button class="btn btn-g" style="padding:7px 10px;font-size:12px" onclick="abrirEdicao('${esc(l.id)}')">✏️</button>
      <button class="btn btn-g" style="padding:7px 10px;font-size:12px;color:#a04030" onclick="excluirLote('${esc(l.id)}')">✕</button>` : ''}</span>
  </div>
  ${l.status === 'aguardando' ? `<div id="ed-${esc(l.id)}" style="display:none;border:1.5px dashed #cfe0dd;border-radius:11px;padding:12px;margin:-2px 0 8px;background:#F7FAF9">
    <div style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0B5B66;margin-bottom:8px">✏️ Editar ${esc(l.id)}</div>
    <div class="g3">
      <div><label>Categoria</label><input id="ed-cat-${esc(l.id)}" value="${esc(l.categoria)}"></div>
      <div><label>Peso (kg)</label><input id="ed-peso-${esc(l.id)}" inputmode="decimal" value="${l.peso}"></div>
      <div><label>Qtd (opcional)</label><input id="ed-qtd-${esc(l.id)}" value="${esc(l.qtd || '')}"></div>
    </div>
    <label>Destino</label><select id="ed-dest-${esc(l.id)}">${destinoOptsDe(l.destino)}</select>
    <label>Justificativa da alteração (fica só no controle interno)</label><input id="ed-just-${esc(l.id)}" placeholder="ex.: peso digitado errado na criação">
    <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
      <button class="btn btn-d" style="padding:9px 14px;font-size:12.5px" onclick="salvarLote('${esc(l.id)}')">Salvar alterações</button>
      <button class="btn btn-g" style="padding:9px 14px;font-size:12.5px" onclick="fecharEdicao('${esc(l.id)}')">Cancelar</button>
      <span class="msg" id="ed-msg-${esc(l.id)}" style="margin:0"></span>
    </div>
  </div>` : ''}
  </div>`).join('') || '<div style="font-size:12.5px;color:#8fa39f">Nenhum lote ainda.</div>';
  // Histórico interno de alterações (pesagem da carga + lotes) — só para controle.
  const historico = [];
  for (const e of (c.edicoes || [])) historico.push({ ...e, alvo: c.id });
  for (const l of (lotes || [])) for (const e of (l.edicoes || [])) historico.push({ ...e, alvo: l.id });
  historico.sort((a, b) => String(b.em).localeCompare(String(a.em)));
  const mudancaTxt = (e) => {
    if (e.o_que === 'pesagem') return `pesagem: bruto ${e.de.bruto ?? '—'}→${e.para.bruto} kg · tara ${e.de.tara ?? '—'}→${e.para.tara} kg (líquido ${e.para.liquido} kg)`;
    const partes = [];
    for (const [campo, rot] of [['categoria', 'categoria'], ['peso', 'peso'], ['qtd', 'qtd'], ['destino', 'destino']]) {
      if (String(e.de[campo] ?? '') !== String(e.para[campo] ?? '')) {
        const fmt = (v) => campo === 'destino' ? ((DESTINOS[v] || {}).rot || v) : v;
        partes.push(`${rot} ${fmt(e.de[campo]) || '—'} → ${fmt(e.para[campo])}`);
      }
    }
    return partes.join(' · ') || 'sem mudança de campos';
  };
  const historicoHTML = historico.length ? `<div class="card" style="margin-top:12px;background:#FBFDFC">
    <div class="sec" style="margin-top:0">🗒️ Alterações registradas (controle interno)</div>
    <div style="font-size:11px;color:#9aa7a4;margin:-2px 0 8px">Não sai em etiqueta nem documento — é o histórico interno de correções desta carga.</div>
    ${historico.map((e) => `<div style="font-size:11.5px;color:#4F6469;border-top:1px solid #EEF1F0;padding:7px 2px">
      <b>${esc(horaBR(e.em))}</b> · ${esc(String(e.por || '—').split('@')[0])} · <b>${esc(e.alvo)}</b> — ${esc(mudancaTxt(e))}
      <span style="display:block;color:#8fa39f;margin-top:1px">“${esc(e.justificativa || '')}”</span>
    </div>`).join('')}
  </div>` : '';
  const destinoOpts = Object.entries(DESTINOS).map(([k, v]) => `<option value="${k}">${esc(v.rot)}</option>`).join('');
  return `${head('Carga ' + c.id)}${topo('entrada · cargas')}
<div class="wrap">
  <a href="/cargas" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cargas</a>
  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin:10px 0 4px;flex-wrap:wrap">
    <h1 style="font-size:20px;margin:0">${esc(c.id)} · ${esc(c.clienteNome || '—')}</h1>
    ${c.exclusivaLaudo ? '<span class="pill p-laudo">CARGA EXCLUSIVA — LAUDO</span>' : ''}
  </div>
  <div style="font-size:11.5px;color:#8fa39f;margin-bottom:10px">${esc(horaBR(c.criadoEm))} · aberta por ${esc(c.criadoPor || '—')}</div>
  ${avisoCancelada}
  <div class="card" style="margin-bottom:12px"><div class="sec" style="margin-top:0">OSs desta carga</div>${osRows}</div>
  ${cancelada ? '' : `
  <div class="card" style="margin-bottom:12px">
    <div class="sec" style="margin-top:0">⚖️ Pesagem</div>
    <div class="g3">
      <div><label>Peso bruto (kg)</label><input id="p-bruto" inputmode="decimal" value="${c.pesoBruto || ''}"></div>
      <div><label>Tara (kg)</label><input id="p-tara" inputmode="decimal" value="${c.tara || ''}"></div>
      <div><label>Líquido</label><div style="font-size:22px;font-weight:900;color:#00333B;padding:8px 0" id="p-liq">${c.pesoLiquido ? kg(c.pesoLiquido) : '—'}</div></div>
    </div>
    ${Number(c.pesoBruto) > 0 ? '<label>Justificativa da alteração (obrigatória para mudar uma pesagem já registrada — fica só no controle interno)</label><input id="p-just" placeholder="ex.: tara digitada errada na entrada">' : ''}
    <button class="btn btn-d" style="margin-top:8px" onclick="pesar()">${Number(c.pesoBruto) > 0 ? 'Salvar pesagem corrigida' : 'Registrar pesagem'}</button>
    <span class="msg" id="msg-peso"></span>
  </div>

  <div class="card" style="margin-bottom:12px">
    <div class="sec" style="margin-top:0">📷 Fotos de entrada (mínimo 2)</div>
    <div>${fotos || '<span style="font-size:12.5px;color:#a04030;font-weight:700">Nenhuma foto ainda.</span>'}</div>
    <input type="file" id="foto" accept="image/*" capture="environment" style="display:none">
    <input type="file" id="fotoArq" accept="image/*" style="display:none">
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button class="btn btn-p" onclick="document.getElementById('foto').click()">📷 Tirar foto agora</button>
      <button class="btn btn-g" onclick="document.getElementById('fotoArq').click()">🖼️ Anexar da galeria</button>
    </div>
    <div style="font-size:11px;color:#9aa7a4;margin-top:6px">No celular/tablet, "Tirar foto agora" abre a câmera direto — dá para fotografar a abertura junto com o processo.</div>
    <span class="msg" id="msg-foto"></span>
  </div>

  <div class="card">
    <div class="sec" style="margin-top:0">📦 Fracionamento em lotes</div>
    ${c.pesoLiquido ? `<div style="font-size:12px;color:#374b48">Fracionado <b>${kg(soma)}</b> de <b>${kg(limite)}</b> (líquido ${kg(c.pesoLiquido)} + 5%)</div><div class="barra"><i style="width:${pct}%"></i></div>` : ''}
    ${podeFracionar ? '' : '<div style="font-size:12.5px;color:#8A6A16;background:#FFF4DE;border-radius:10px;padding:9px 12px;margin:8px 0">Para fracionar: registre a pesagem e anexe pelo menos 2 fotos.</div>'}
    <div class="g3">
      <div><label>Tipo de material / categoria</label><input id="l-cat" list="cats" placeholder="ex.: Informática"><datalist id="cats"><option>Informática</option><option>Eletroeletrônicos</option><option>Baterias</option><option>Cabos</option><option>Metais</option><option>Plásticos</option><option>Placas eletrônicas</option><option>Sucata mista</option></datalist></div>
      <div><label>Peso do lote (kg)</label><input id="l-peso" inputmode="decimal"></div>
      <div><label>Qtd (opcional)</label><input id="l-qtd" placeholder="ex.: 40 un."></div>
    </div>
    <label>Destino do lote</label><select id="l-dest">${destinoOpts}</select>
    <div id="l-desc" style="font-size:11.5px;color:#7c8a87;margin-top:5px"></div>
    <button class="btn btn-p" style="margin-top:10px" onclick="addLote()" ${podeFracionar ? '' : 'disabled style="margin-top:10px;opacity:.5"'}>＋ Criar lote e gerar etiqueta</button>
    <span class="msg" id="msg-lote"></span>
    <div class="sec">Lotes desta carga (${(lotes || []).length})</div>
    ${loteRows}
  </div>
  <div style="margin-top:14px;text-align:right">
    <button onclick="cancelarCg()" style="background:none;border:1.5px solid #E8B9B2;color:#B23A2E;border-radius:11px;padding:10px 16px;font-size:12.5px;font-weight:800;cursor:pointer">✖ Cancelar carga — OSs voltam para a recepção</button>
  </div>`}
  ${historicoHTML}
</div>
<script>
const DESC=${JSON.stringify(Object.fromEntries(Object.entries(DESTINOS).map(([k, v]) => [k, v.desc]))).replace(/</g, '\\u003c')};
const numBR=(s)=>{const t=String(s==null?'':s).trim();if(!t)return 0;return Number(t.includes(',')?t.replace(/\\./g,'').replace(',','.'):t)||0;};
const dsel=document.getElementById('l-dest'), ddesc=document.getElementById('l-desc');
function attDesc(){if(dsel&&ddesc)ddesc.textContent=DESC[dsel.value]||'';} if(dsel){dsel.addEventListener('change',attDesc); attDesc();}
['p-bruto','p-tara'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('input',()=>{const b=numBR(document.getElementById('p-bruto').value),t=numBR(document.getElementById('p-tara').value);document.getElementById('p-liq').textContent=(b>0&&t>=0&&t<b)?((b-t).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg'):'—';});});
async function pesar(){
  const msg=document.getElementById('msg-peso');msg.textContent='Registrando…';
  const just=document.getElementById('p-just');
  try{const r=await fetch('/api/cargas/pesar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:${JSON.stringify(c.id)},bruto:numBR(document.getElementById('p-bruto').value),tara:numBR(document.getElementById('p-tara').value),justificativa:just?just.value.trim():''})});
    const j=await r.json(); if(j.ok)location.reload(); else msg.textContent=j.message||'Não deu certo.';}
  catch{msg.textContent='Falha de rede.';}
}
function abrirEdicao(id){const d=document.getElementById('ed-'+id);if(d)d.style.display='block';}
function fecharEdicao(id){const d=document.getElementById('ed-'+id);if(d)d.style.display='none';}
async function salvarLote(id){
  const g=(p)=>{const el=document.getElementById(p+'-'+id);return el?el.value:'';};
  const msg=document.getElementById('ed-msg-'+id);
  if(!g('ed-just').trim()){msg.textContent='Escreva a justificativa da alteração.';return;}
  msg.textContent='Salvando…';
  try{const r=await fetch('/api/cargas/editar-lote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,categoria:g('ed-cat'),peso:numBR(g('ed-peso')),qtd:g('ed-qtd'),destino:g('ed-dest'),justificativa:g('ed-just').trim()})});
    const j=await r.json(); if(j.ok)location.reload(); else msg.textContent=j.message||'Não deu certo.';}
  catch{msg.textContent='Falha de rede.';}
}
['foto','fotoArq'].forEach(function(fid){
  const el=document.getElementById(fid);
  if(el)el.addEventListener('change',async function(){
    const msg=document.getElementById('msg-foto'); if(!this.files||!this.files[0])return;
    msg.textContent='Enviando foto…';
    const fd=new FormData(); fd.append('id',${JSON.stringify(c.id)}); fd.append('file',this.files[0]);
    try{const r=await fetch('/api/cargas/foto',{method:'POST',body:fd}); const j=await r.json(); if(j.ok)location.reload(); else msg.textContent=j.message||'Falha no envio.';}
    catch{msg.textContent='Falha de rede.';}
  });
});
async function addLote(){
  const msg=document.getElementById('msg-lote');msg.textContent='Criando lote…';
  try{const r=await fetch('/api/cargas/lote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cargaId:${JSON.stringify(c.id)},categoria:document.getElementById('l-cat').value,peso:numBR(document.getElementById('l-peso').value),qtd:document.getElementById('l-qtd').value,destino:document.getElementById('l-dest').value})});
    const j=await r.json(); if(j.ok){window.open('/cargas/etiqueta?id='+encodeURIComponent(j.id),'_blank');location.reload();}else{msg.textContent=j.message||'Não deu certo.';}}
  catch{msg.textContent='Falha de rede.';}
}
async function excluirLote(id){
  if(!confirm('Excluir o lote '+id+'?'))return;
  try{const r=await fetch('/api/cargas/lote-excluir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});
    const j=await r.json(); if(j.ok)location.reload(); else alert(j.message||'Não deu certo.');}
  catch{alert('Falha de rede.');}
}
async function cancelarCg(){
  if(!confirm('Cancelar a carga ${esc(c.id)}?\\n\\nAs OSs desta carga voltam para a lista de recebimento (dá para abrir uma carga nova com elas). Pesagem e fotos já registradas aqui saem do fluxo e ficam só no histórico.'))return;
  try{const r=await fetch('/api/cargas/cancelar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:${JSON.stringify(c.id)}})});
    const j=await r.json(); if(j.ok){alert('Carga cancelada. As OSs voltaram para a recepção.');location.href='/cargas';}else{alert(j.message||'Não deu certo.');}}
  catch{alert('Falha de rede.');}
}
</script></body></html>`;
}

// Etiqueta térmica 80mm — QR + dados essenciais, um lote por página.
export function paginaEtiqueta(l, c, origem) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Etiqueta ${esc(l.id)}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#DDE5E2}
.toolbar{max-width:340px;margin:12px auto 6px;display:flex;gap:8px}
.tb{border:none;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:800;cursor:pointer}
.et{width:76mm;background:#fff;margin:0 auto;padding:4mm;border:1px dashed #9db8b3}
.et .top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #000;padding-bottom:2mm}
.et .top b{font-size:15px}
.et .qr{text-align:center;padding:3mm 0}.et .qr img{width:34mm;height:34mm;image-rendering:pixelated}
.et .id{font-size:19px;font-weight:900;text-align:center;letter-spacing:.5px}
.et table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:2mm}
.et td{padding:1.2mm 0;border-top:1px solid #ccc}.et td:first-child{color:#444;width:34%}
.et .dest{margin-top:2mm;border:2px solid #000;text-align:center;font-size:13px;font-weight:900;padding:1.6mm;text-transform:uppercase}
@media print{body{background:#fff}.toolbar{display:none}.et{border:none;margin:0}}
@page{size:80mm auto;margin:2mm}
</style></head><body>
<div class="toolbar"><button class="tb" style="background:#92C430" onclick="print()">🖨️ Imprimir etiqueta</button><button class="tb" style="background:#fff" onclick="window.close()">Fechar</button></div>
<div class="et">
  <div class="top"><b>ecobraz</b><span style="font-size:10px">${esc(horaBR(l.criadoEm))}</span></div>
  <div class="qr"><img src="/cargas/qr?id=${esc(l.id)}" alt="QR ${esc(l.id)}"></div>
  <div class="id">${esc(l.id)}</div>
  <table>
    <tr><td>Categoria</td><td><b>${esc(l.categoria)}</b></td></tr>
    <tr><td>Peso</td><td><b>${kg(l.peso)}</b>${l.qtd ? ' · ' + esc(l.qtd) : ''}</td></tr>
    <tr><td>Cliente origem</td><td>${esc(c.clienteNome || '—')}</td></tr>
    <tr><td>Carga</td><td>${esc(c.id)}${c.exclusivaLaudo ? ' · LAUDO' : ''}</td></tr>
  </table>
  <div class="dest">${esc((DESTINOS[l.destino] || {}).rot || l.destino)}</div>
</div>
</body></html>`;
}

export function paginaFilas(user, destino, lotes) {
  const tabs = Object.entries(DESTINOS).map(([k, v]) => `<a href="/cargas/filas?destino=${k}" class="btn ${k === destino ? 'btn-d' : 'btn-g'}" style="padding:9px 13px;font-size:12.5px">${esc(v.rot)}</a>`).join('');
  const rows = (lotes || []).map((l) => `<div class="row">
    <span style="min-width:0"><b style="font-size:13px">${esc(l.id)}</b> · <span style="font-size:12.5px">${esc(l.categoria)}</span>
      <span style="display:block;font-size:11px;color:#8fa39f">${kg(l.peso)}${l.qtd ? ' · ' + esc(l.qtd) : ''} · carga ${esc(l.cargaId)}</span>
      ${l.status === 'expedido' && l.expedicao ? `<span style="display:block;font-size:11px;color:#1E5B31;margin-top:2px">🚚 ${esc(l.expedicao.fornecedor)}${l.expedicao.mtr ? ' · MTR ' + esc(l.expedicao.mtr) : ''}</span>` : ''}</span>
    <span style="flex:none;display:flex;gap:6px;align-items:center">${stLote(l.status)}
      ${l.status === 'aguardando' ? `<button class="btn btn-p" style="padding:7px 11px;font-size:12px" onclick="mudar('${esc(l.id)}','processando')">▶ Iniciar</button>` : ''}
      ${l.status === 'processando' ? `<button class="btn btn-d" style="padding:7px 11px;font-size:12px" onclick="mudar('${esc(l.id)}','finalizado')">✔ Finalizar</button>` : ''}
      ${l.status === 'finalizado' ? `<a class="btn btn-p" style="padding:7px 11px;font-size:12px;text-decoration:none" href="/cargas/expedir?id=${esc(l.id)}">🚚 Registrar saída</a>` : ''}
      <a class="btn btn-g" style="padding:7px 11px;font-size:12px" href="/cargas/etiqueta?id=${esc(l.id)}" target="_blank" rel="noopener">🏷️</a></span>
  </div>`).join('') || '<div style="font-size:12.5px;color:#8fa39f">Fila vazia.</div>';
  return `${head('Filas por destino')}${topo('entrada · filas')}
<div class="wrap">
  <a href="/cargas" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Cargas</a>
  <h1 style="font-size:20px;margin:10px 0 8px">Filas por destino</h1>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${tabs}</div>
  <div style="font-size:12px;color:#7c8a87;margin-bottom:10px">${esc((DESTINOS[destino] || {}).desc || '')}</div>
  <div class="card">${rows}</div>
</div>
<script>
async function mudar(id,novo){
  try{const r=await fetch('/api/cargas/lote-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,novo})});
    const j=await r.json(); if(j.ok)location.reload(); else alert(j.message||'Não deu certo.');}
  catch{alert('Falha de rede.');}
}
</script></body></html>`;
}

// Página pública do QR (quem bipa a etiqueta) — mostra a cadeia do lote.
export function paginaValidarLote(l, c, ok) {
  const inner = (ok && l) ? `
    <div style="width:60px;height:60px;border-radius:50%;background:#E7F4EC;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px">📦</div>
    <h1 style="font-size:19px;color:#00333B;margin:0 0 4px;text-align:center">Lote ${esc(l.id)}</h1>
    <div style="text-align:center;margin-bottom:14px">${stLote(l.status)}</div>
    <div class="row"><span>Categoria</span><b>${esc(l.categoria)}</b></div>
    <div class="row"><span>Peso</span><b>${kg(l.peso)}${l.qtd ? ' · ' + esc(l.qtd) : ''}</b></div>
    <div class="row"><span>Destino</span><b>${esc((DESTINOS[l.destino] || {}).rot || l.destino)}</b></div>
    <div class="row"><span>Carga</span><b>${esc(l.cargaId)}${c && c.exclusivaLaudo ? ' · LAUDO' : ''}</b></div>
    <div class="row"><span>Cliente origem</span><b>${esc((c && c.clienteNome) || '—')}</b></div>
    <div class="row"><span>Criado em</span><b>${esc(horaBR(l.criadoEm))}</b></div>
    <div style="font-size:11px;color:#8fa39f;text-align:center;margin-top:12px">Rastreabilidade Ecobraz · etiqueta autêntica ✓</div>`
    : `<div style="width:60px;height:60px;border-radius:50%;background:#FDE8E8;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px">❌</div>
    <h1 style="font-size:19px;color:#00333B;margin:0 0 8px;text-align:center">Etiqueta não reconhecida</h1>
    <p style="font-size:13px;color:#4F6469;text-align:center">Confira o código ou fale com a operação Ecobraz.</p>`;
  return `${head('Lote')}<div class="wrap" style="max-width:430px;padding-top:26px"><div class="card">${inner}</div></div></body></html>`;
}
