// Módulo Frota + Jornada do motorista.
//
// Duas frentes que se encaixam:
//  1) FROTA (escritório): cadastro dos veículos — placa, apelido, modelo, tipo.
//     Guardado no KV: veiculos:index + veiculo:{id}. Id = veic_<PLACA normalizada>.
//  2) JORNADA (motorista): o "dia de trabalho". Ao ABRIR o dia o motorista faz o
//     checklist do veículo (placa, 4 fotos, hodômetro com foto+número, observações);
//     só então as coletas são liberadas (abertura OBRIGATÓRIA). Ao FECHAR o dia,
//     repete o checklist e o sistema calcula km = hodômetro final − inicial.
//     Abastecimentos (litros + R$) entram durante o dia → gasto e consumo (km/l).
//
//     KV: jornada:index + jornada:{id} + jornada:ativa:{email} + jornadafoto:{id}:{momento}:{lado}
//
// Isso dá controle de frota, custo por veículo/coleta, e alimenta o carbono
// (km de transporte por coleta). Cada coleta feita no dia fica ligada ao veículo.

import { tagsPWA } from './pwa.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const dataHoraBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${m[3]}/${m[2]} ${m[4]}` : ''; };
const numBR = (n) => Number(n || 0).toLocaleString('pt-BR');
const moedaBR = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
export function sanitizePlaca(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); }
const numeroLimpo = (v) => { const n = Number(String(v == null ? '' : v).replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };

const TIPOS_VEIC = { van: 'Van / furgão', caminhao: 'Caminhão', vuc: 'VUC', utilitario: 'Utilitário', carro: 'Carro', moto: 'Motocicleta', outro: 'Outro' };
const LADOS = ['frente', 'traseira', 'esquerda', 'direita'];
const LADO_ROTULO = { frente: 'Frente', traseira: 'Traseira', esquerda: 'Lateral esquerda', direita: 'Lateral direita', hodometro: 'Hodômetro' };

// ===========================================================================
// FROTA (escritório) — cadastro de veículos
// ===========================================================================
export async function listarVeiculos(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('veiculos:index') : null;
  return raw ? JSON.parse(raw) : [];
}
export async function lerVeiculo(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`veiculo:${String(id).replace(/[^a-zA-Z0-9_]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
export async function salvarVeiculo(env, dados, criadoPor) {
  const d = dados || {};
  const placa = sanitizePlaca(d.placa);
  if (!placa) return { erro: 'Informe a placa.' };
  const id = 'veic_' + placa;
  const existente = await lerVeiculo(env, id);
  const rec = {
    id, placa,
    apelido: String(d.apelido || '').slice(0, 60),
    marca: String(d.marca || '').slice(0, 40),
    modelo: String(d.modelo || '').slice(0, 60),
    ano: String(d.ano || '').replace(/[^0-9]/g, '').slice(0, 4),
    tipo: TIPOS_VEIC[d.tipo] ? d.tipo : 'van',
    renavam: String(d.renavam || '').replace(/[^0-9]/g, '').slice(0, 11),
    capacidadeKg: numeroLimpo(d.capacidadeKg) || 0,
    ativo: d.ativo === false ? false : true,
    ultimoHodometro: existente ? (existente.ultimoHodometro || 0) : numeroLimpo(d.hodometroAtual),
    criadoEm: existente ? existente.criadoEm : agora(),
    criadoPor: existente ? existente.criadoPor : (criadoPor || ''),
    atualizadoEm: agora(),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`veiculo:${id}`, JSON.stringify(rec));
    const idx = await listarVeiculos(env);
    const resumo = { id, placa: rec.placa, apelido: rec.apelido, tipo: rec.tipo, ativo: rec.ativo, ultimoHodometro: rec.ultimoHodometro };
    const i = idx.findIndex((v) => v.id === id);
    if (i >= 0) idx[i] = resumo; else idx.unshift(resumo);
    await env.PORTAL_KV.put('veiculos:index', JSON.stringify(idx).slice(0, 400000));
  }
  return rec;
}
async function atualizarHodometroVeiculo(env, veiculoId, hodometro) {
  if (!veiculoId) return;
  const v = await lerVeiculo(env, veiculoId); if (!v) return;
  if (numeroLimpo(hodometro) >= (v.ultimoHodometro || 0)) {
    v.ultimoHodometro = numeroLimpo(hodometro); v.atualizadoEm = agora();
    if (env.PORTAL_KV) {
      await env.PORTAL_KV.put(`veiculo:${veiculoId}`, JSON.stringify(v));
      const idx = await listarVeiculos(env); const i = idx.findIndex((x) => x.id === veiculoId);
      if (i >= 0) { idx[i].ultimoHodometro = v.ultimoHodometro; await env.PORTAL_KV.put('veiculos:index', JSON.stringify(idx).slice(0, 400000)); }
    }
  }
}

// ===========================================================================
// JORNADA (motorista) — abrir/fechar dia, checklist, abastecimento
// ===========================================================================
export async function lerJornada(env, id) {
  if (!env.PORTAL_KV || !id) return null;
  const raw = await env.PORTAL_KV.get(`jornada:${String(id).replace(/[^a-zA-Z0-9_]/g, '')}`);
  return raw ? JSON.parse(raw) : null;
}
export async function lerJornadaAtiva(env, agenteEmail) {
  if (!env.PORTAL_KV) return null;
  const email = String(agenteEmail || '').trim().toLowerCase();
  const id = await env.PORTAL_KV.get(`jornada:ativa:${email}`);
  if (!id) return null;
  const j = await lerJornada(env, id);
  return j && j.status === 'aberta' ? j : null;
}
export async function listarJornadas(env) {
  const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('jornada:index') : null;
  return raw ? JSON.parse(raw) : [];
}
async function salvarFotoJornada(env, jornadaId, momento, lado, b64) {
  if (!env.PORTAL_KV || !b64) return;
  const key = `jornadafoto:${jornadaId}:${momento}:${String(lado).replace(/[^a-z0-9]/g, '')}`;
  await env.PORTAL_KV.put(key, String(b64).slice(0, 2500000), { expirationTtl: 60 * 60 * 24 * 400 });
}
export async function servirFotoJornada(env, jornadaId, momento, lado) {
  if (!env.PORTAL_KV) return new Response('sem foto', { status: 404 });
  const key = `jornadafoto:${String(jornadaId).replace(/[^a-zA-Z0-9_]/g, '')}:${String(momento).replace(/[^a-z]/g, '')}:${String(lado).replace(/[^a-z0-9]/g, '')}`;
  const b64 = await env.PORTAL_KV.get(key);
  if (!b64) return new Response('sem foto', { status: 404 });
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' } });
}

// Resolve o veículo (da frota ou placa avulsa digitada pelo motorista).
async function resolverVeiculo(env, d) {
  if (d.veiculoId) { const v = await lerVeiculo(env, d.veiculoId); if (v) return { veiculoId: v.id, placa: v.placa, apelido: v.apelido, ultimoHodometro: v.ultimoHodometro || 0 }; }
  const placa = sanitizePlaca(d.placa);
  if (placa) { const v = await lerVeiculo(env, 'veic_' + placa); if (v) return { veiculoId: v.id, placa: v.placa, apelido: v.apelido, ultimoHodometro: v.ultimoHodometro || 0 }; return { veiculoId: '', placa, apelido: '', ultimoHodometro: 0 }; }
  return null;
}

export async function abrirJornada(env, agente, dados) {
  const d = dados || {};
  const email = String(agente.email || '').trim().toLowerCase();
  const jaAberta = await lerJornadaAtiva(env, email);
  if (jaAberta) return { erro: 'Você já tem um dia aberto. Feche o dia atual antes de abrir outro.', jornada: jaAberta };
  const veic = await resolverVeiculo(env, d);
  if (!veic || !veic.placa) return { erro: 'Escolha o veículo ou informe a placa.' };
  const hod = numeroLimpo(d.hodometro);
  if (!hod) return { erro: 'Informe o número do hodômetro.' };
  const alertas = [];
  if (veic.ultimoHodometro && hod < veic.ultimoHodometro) alertas.push(`Hodômetro informado (${numBR(hod)}) é menor que o último registrado para este veículo (${numBR(veic.ultimoHodometro)}).`);
  const id = 'jor_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : String(Date.now()).slice(-12));
  const fotos = d.fotos || {};
  for (const lado of [...LADOS, 'hodometro']) { if (fotos[lado]) await salvarFotoJornada(env, id, 'abertura', lado, fotos[lado]); }
  const rec = {
    id, status: 'aberta',
    agenteEmail: email, agenteNome: agente.nome || '',
    veiculoId: veic.veiculoId, placa: veic.placa,
    abertura: { hodometro: hod, obs: String(d.obs || '').slice(0, 500), em: agora(), fotos: Object.keys(fotos).filter((k) => fotos[k]), alertas },
    fechamento: null, abastecimentos: [], coletas: [], kmRodado: 0,
    criadoEm: agora(),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`jornada:${id}`, JSON.stringify(rec));
    await env.PORTAL_KV.put(`jornada:ativa:${email}`, id, { expirationTtl: 60 * 60 * 24 * 2 });
    const idx = await listarJornadas(env);
    idx.unshift({ id, agenteEmail: email, agenteNome: rec.agenteNome, placa: rec.placa, aberturaEm: rec.abertura.em, fechamentoEm: '', kmRodado: 0, status: 'aberta' });
    await env.PORTAL_KV.put('jornada:index', JSON.stringify(idx).slice(0, 600000));
  }
  await atualizarHodometroVeiculo(env, veic.veiculoId, hod);
  return { jornada: rec, alertas };
}

export async function fecharJornada(env, agente, dados) {
  const d = dados || {};
  const email = String(agente.email || '').trim().toLowerCase();
  const j = await lerJornadaAtiva(env, email);
  if (!j) return { erro: 'Você não tem um dia aberto.' };
  const hod = numeroLimpo(d.hodometro);
  if (!hod) return { erro: 'Informe o número do hodômetro final.' };
  const alertas = [];
  if (hod < (j.abertura.hodometro || 0)) alertas.push(`Hodômetro final (${numBR(hod)}) é menor que o inicial (${numBR(j.abertura.hodometro)}).`);
  const fotos = d.fotos || {};
  for (const lado of [...LADOS, 'hodometro']) { if (fotos[lado]) await salvarFotoJornada(env, j.id, 'fechamento', lado, fotos[lado]); }
  const km = Math.max(0, hod - (j.abertura.hodometro || 0));
  j.fechamento = { hodometro: hod, obs: String(d.obs || '').slice(0, 500), em: agora(), fotos: Object.keys(fotos).filter((k) => fotos[k]), alertas };
  j.kmRodado = km;
  j.status = 'fechada';
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`jornada:${j.id}`, JSON.stringify(j));
    await env.PORTAL_KV.delete(`jornada:ativa:${email}`);
    const idx = await listarJornadas(env); const i = idx.findIndex((x) => x.id === j.id);
    if (i >= 0) { idx[i].status = 'fechada'; idx[i].fechamentoEm = j.fechamento.em; idx[i].kmRodado = km; await env.PORTAL_KV.put('jornada:index', JSON.stringify(idx).slice(0, 600000)); }
  }
  await atualizarHodometroVeiculo(env, j.veiculoId, hod);
  return { jornada: j, alertas };
}

export async function registrarAbastecimento(env, agente, dados) {
  const d = dados || {};
  const email = String(agente.email || '').trim().toLowerCase();
  const j = await lerJornadaAtiva(env, email);
  if (!j) return { erro: 'Abra o dia antes de registrar um abastecimento.' };
  const litros = numeroLimpo(d.litros); const valor = numeroLimpo(d.valor);
  if (!litros && !valor) return { erro: 'Informe pelo menos litros ou valor.' };
  const ab = { litros, valor, hodometro: numeroLimpo(d.hodometro) || null, posto: String(d.posto || '').slice(0, 80), combustivel: String(d.combustivel || '').slice(0, 20), em: agora() };
  j.abastecimentos = j.abastecimentos || [];
  j.abastecimentos.push(ab);
  const i = j.abastecimentos.length - 1;
  if (d.foto) await salvarFotoJornada(env, j.id, 'abast', String(i), d.foto);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`jornada:${j.id}`, JSON.stringify(j));
  return { jornada: j, abastecimento: ab };
}

// Liga uma coleta ao veículo do dia (chamado no check-in). Grava o veículo no
// estado da coleta e adiciona a OS à lista de coletas da jornada.
// Resolve a placa do veículo de uma coleta, para os documentos (Carta/Manifesto):
// 1) veículo marcado na coleta no check-in; 2) jornada ativa do motorista; 3) vazio.
export async function placaDaColeta(env, os) {
  if (!env.PORTAL_KV || !os) return '';
  try {
    const raw = await env.PORTAL_KV.get(`coleta:${os.id}`);
    const e = raw ? JSON.parse(raw) : null;
    if (e && e.veiculo && e.veiculo.placa) return e.veiculo.placa;
  } catch { /* ignora */ }
  try {
    if (os.agenteEmail) { const j = await lerJornadaAtiva(env, os.agenteEmail); if (j && j.placa) return j.placa; }
  } catch { /* ignora */ }
  return '';
}

export async function tagColetaComVeiculo(env, agenteEmail, osId) {
  const j = await lerJornadaAtiva(env, agenteEmail);
  if (!j) return null;
  if (env.PORTAL_KV) {
    try {
      const raw = await env.PORTAL_KV.get(`coleta:${osId}`);
      const e = raw ? JSON.parse(raw) : {};
      e.veiculo = { veiculoId: j.veiculoId, placa: j.placa, jornadaId: j.id };
      await env.PORTAL_KV.put(`coleta:${osId}`, JSON.stringify(e).slice(0, 4000), { expirationTtl: 60 * 60 * 24 * 120 });
    } catch { /* estado da coleta ausente: ignora */ }
    if (!(j.coletas || []).includes(osId)) {
      j.coletas = j.coletas || []; j.coletas.push(osId);
      await env.PORTAL_KV.put(`jornada:${j.id}`, JSON.stringify(j));
    }
  }
  return { veiculoId: j.veiculoId, placa: j.placa };
}

// Custos/consumo de uma jornada (para relatórios).
export function resumoJornada(j) {
  const litros = (j.abastecimentos || []).reduce((s, a) => s + (a.litros || 0), 0);
  const gasto = (j.abastecimentos || []).reduce((s, a) => s + (a.valor || 0), 0);
  const km = j.kmRodado || 0;
  const consumo = litros > 0 && km > 0 ? km / litros : 0; // km/l
  const custoKm = km > 0 && gasto > 0 ? gasto / km : 0;   // R$/km
  return { litros, gasto, km, consumo, custoKm, coletas: (j.coletas || []).length };
}

// ===========================================================================
// PÁGINAS — escritório (frota)
// ===========================================================================
function headEsc(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
a{color:#0B5B66}.wrap{max-width:840px;margin:0 auto;padding:20px 18px 56px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px}
label{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:14px 0 5px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:10px;padding:11px 12px;font-size:14px;font-family:inherit;background:#fff;color:#10262B}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 14px}
.btn{display:inline-block;border:none;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none;text-align:center}
.btn-p{background:#92C430;color:#10262B}.btn-d{background:#00333B;color:#fff}.btn-g{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}
.sec{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:22px 0 4px;display:flex;align-items:center;gap:9px}
.sec::before{content:"";width:4px;height:15px;background:#92C430;border-radius:2px;display:inline-block}
@media(max-width:640px){.g2,.g3{grid-template-columns:1fr}}</style></head>`;
}
function topoEsc(sub) {
  return `<div style="background:#00333B;padding:15px 20px"><div style="max-width:840px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
    <a href="/inicio" style="text-decoration:none"><span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">${esc(sub || 'frota')}</span></a>
    <form method="post" action="/api/cadastro/sair" style="margin:0"><button class="btn" style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;padding:8px 12px;font-size:12px">Sair</button></form>
  </div></div>`;
}

export function paginaFrota(user, veiculos) {
  const ativos = veiculos.filter((v) => v.ativo !== false).length;
  const linhas = veiculos.length ? veiculos.map((v) => `<a href="/frota/veiculo?id=${esc(v.id)}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:12px;padding:13px 15px;margin-bottom:9px">
      <div style="min-width:0"><div style="font-size:15px;font-weight:800;color:#10262B;letter-spacing:.03em">${esc(v.placa)} <span style="font-weight:600;color:#7c8a87">${v.apelido ? '· ' + esc(v.apelido) : ''}</span></div>
      <div style="font-size:12px;color:#7c8a87;margin-top:3px">${esc(TIPOS_VEIC[v.tipo] || v.tipo || '')}${v.ultimoHodometro ? ' · hod. ' + numBR(v.ultimoHodometro) + ' km' : ''}</div></div>
      ${v.ativo === false ? '<span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:#FBE9E7;color:#8a4b45">INATIVO</span>' : '<span style="flex:none;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:#E4F3E6;color:#1E5B31">ATIVO</span>'}
    </a>`).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhum veículo cadastrado ainda.<br>Cadastre o primeiro veículo da frota acima.</div>`;
  return `${headEsc('Frota')}<body>${topoEsc('frota')}
<div class="wrap">
  <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 14px"><h1 style="font-size:20px;margin:0">Frota</h1><span style="font-size:11px;background:#E3F0F3;color:#0B5B66;font-weight:800;padding:3px 9px;border-radius:20px">${ativos} ativo(s)</span></div>
  <a href="/frota/novo" class="btn btn-d" style="margin-bottom:14px">＋ Novo veículo</a>
  <div>${linhas}</div>
  <div style="font-size:11px;color:#9aa7a4;text-align:center;margin-top:16px">Os veículos aqui aparecem para o motorista escolher ao abrir o dia.</div>
</div>
</body></html>`;
}

export function paginaVeiculoForm(user, veic) {
  const editando = !!(veic && veic.id);
  const v = veic || {};
  const optTipo = Object.entries(TIPOS_VEIC).map(([k, r]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${esc(r)}</option>`).join('');
  return `${headEsc(editando ? 'Editar veículo' : 'Novo veículo')}<body>${topoEsc('frota')}
<div class="wrap">
  <a href="/frota" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Frota</a>
  <h1 style="font-size:20px;margin:10px 0 12px">${editando ? 'Editar' : 'Novo'} veículo</h1>
  <div class="card">
    <div class="sec">Identificação</div>
    <div class="g2"><div><label>Placa *</label><input id="placa" style="text-transform:uppercase;letter-spacing:.05em" placeholder="ABC1D23" value="${esc(v.placa || '')}" ${editando ? 'readonly' : ''}></div>
    <div><label>Apelido (como o motorista chama)</label><input id="apelido" placeholder="ex.: Van branca" value="${esc(v.apelido || '')}"></div></div>
    <div class="g3"><div><label>Marca</label><input id="marca" value="${esc(v.marca || '')}"></div><div><label>Modelo</label><input id="modelo" value="${esc(v.modelo || '')}"></div><div><label>Ano</label><input id="ano" inputmode="numeric" value="${esc(v.ano || '')}"></div></div>
    <div class="g3"><div><label>Tipo</label><select id="tipo">${optTipo}</select></div>
    <div><label>Capacidade (kg)</label><input id="capacidadeKg" inputmode="numeric" value="${esc(v.capacidadeKg || '')}"></div>
    <div><label>Hodômetro atual (km)</label><input id="hodometroAtual" inputmode="numeric" value="${esc(v.ultimoHodometro || '')}" ${editando ? 'readonly title="Atualizado pelas jornadas"' : ''}></div></div>
    <div class="g2"><div><label>RENAVAM (opcional)</label><input id="renavam" inputmode="numeric" value="${esc(v.renavam || '')}"></div>
    <div><label>Situação</label><select id="ativo"><option value="1" ${v.ativo === false ? '' : 'selected'}>Ativo</option><option value="0" ${v.ativo === false ? 'selected' : ''}>Inativo</option></select></div></div>
    <input type="hidden" id="id" value="${esc(v.id || '')}">
    <div style="display:flex;gap:10px;align-items:center;margin-top:22px"><button class="btn btn-p" onclick="salvar()">Salvar veículo</button><span id="m" style="font-size:13px;color:#4F6469"></span></div>
  </div>
</div>
<script>
function g(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function salvar(){var rec={id:g('id'),placa:g('placa'),apelido:g('apelido'),marca:g('marca'),modelo:g('modelo'),ano:g('ano'),tipo:g('tipo'),capacidadeKg:g('capacidadeKg'),hodometroAtual:g('hodometroAtual'),renavam:g('renavam'),ativo:g('ativo')==='1'};
  if(!rec.placa){document.getElementById('m').textContent='Informe a placa.';return;}
  document.getElementById('m').textContent='Salvando…';
  fetch('/api/frota/salvar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/frota';}else{document.getElementById('m').textContent=j.error||'Falha ao salvar.';}}).catch(()=>document.getElementById('m').textContent='Sem conexão.');}
</script>
</body></html>`;
}

// ===========================================================================
// PÁGINAS — motorista (jornada, mobile)
// ===========================================================================
// JS reutilizável: comprime a foto (canvas) e captura via <input capture>.
const JS_FOTO = `
function comprime(file,cb){var img=new Image();var url=URL.createObjectURL(file);img.onload=function(){var mx=1280,w=img.width,h=img.height;if(w>h&&w>mx){h=Math.round(h*mx/w);w=mx;}else if(h>=w&&h>mx){w=Math.round(w*mx/h);h=mx;}var c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);URL.revokeObjectURL(url);cb(c.toDataURL('image/jpeg',0.6));};img.src=url;}
function ligarFoto(id){var inp=document.getElementById('f_'+id);var prev=document.getElementById('p_'+id);inp.addEventListener('change',function(){if(!inp.files||!inp.files[0])return;comprime(inp.files[0],function(data){window.FOTOS=window.FOTOS||{};window.FOTOS[id]=data;prev.style.backgroundImage='url('+data+')';prev.classList.add('ok');prev.textContent='';});});}
`;
function botaoFoto(id, rotulo) {
  return `<div style="margin-bottom:10px"><input type="file" accept="image/*" capture="environment" id="f_${id}" style="display:none">
    <label for="f_${id}" style="display:flex;align-items:center;gap:12px;cursor:pointer;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:10px 12px;margin:0">
      <div id="p_${id}" class="fprev" style="flex:none;width:56px;height:56px;border-radius:10px;background:#EEF3F1 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:22px;color:#9FB4AF">📷</div>
      <div><div style="font-size:14px;font-weight:800;color:#10262B">${esc(rotulo)}</div><div style="font-size:11.5px;color:#7c8a87" id="s_${id}">Toque para fotografar</div></div>
    </label></div>`;
}
function headMob(t) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${tagsPWA('agente')}<title>${esc(t)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B}
.wrap{max-width:520px;margin:0 auto;padding:16px 16px 40px}
label.lb{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87;margin:16px 0 6px}
input,select,textarea{width:100%;border:1px solid #DDE1E6;border-radius:11px;padding:13px;font-size:16px;font-family:inherit;background:#fff;color:#10262B}
.fprev.ok{color:transparent}
.btnp{width:100%;background:#92C430;color:#10262B;border:none;border-radius:13px;padding:16px;font-size:16px;font-weight:800}
.btng{width:100%;background:#fff;color:#00333B;border:1.5px solid #cfe0dd;border-radius:13px;padding:14px;font-size:15px;font-weight:800}</style></head>`;
}
function topoMob(agente, sub) {
  return `<div style="background:#00333B;padding:16px 18px 14px"><div style="display:flex;justify-content:space-between;align-items:center">
    <div><span style="color:#fff;font-size:15px;font-weight:800">Olá, ${esc((agente.nome || '').split(/\s+/)[0] || 'motorista')} 👋</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">${esc(sub || 'Ecobraz · Coletas')}</div></div>
    <form method="post" action="/api/agente/sair" style="margin:0"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700">Sair</button></form>
  </div></div>`;
}

// Banner do dia em andamento (injetado no topo da lista de coletas).
export function bannerJornada(j) {
  if (!j) return '';
  const r = resumoJornada(j);
  return `<div style="background:#062f36;border:1px solid #12525d;border-radius:16px;padding:14px 16px;margin-bottom:14px;color:#eaf5f3">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7fc9c0">Dia aberto · veículo</div>
      <div style="font-size:17px;font-weight:800;letter-spacing:.04em;margin-top:2px">${esc(j.placa)}${j.abertura ? ' <span style="font-weight:600;color:#9FC6C1;font-size:13px">· hod. ' + numBR(j.abertura.hodometro) + '</span>' : ''}</div></div>
      <div style="text-align:right;font-size:11px;color:#9FC6C1">${r.coletas} coleta(s)${r.gasto ? '<br>R$ ' + moedaBR(r.gasto) : ''}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <a href="/agente/dia/abastecer" style="flex:1;text-align:center;text-decoration:none;background:#0e4651;color:#eaf5f3;border:1px solid #1c5b66;border-radius:10px;padding:9px;font-size:13px;font-weight:800">⛽ Abastecimento</a>
      <a href="/agente/dia/fechar" style="flex:1;text-align:center;text-decoration:none;background:#92C430;color:#10262B;border-radius:10px;padding:9px;font-size:13px;font-weight:800">Fechar o dia</a>
    </div>
  </div>`;
}

export function paginaAbrirDia(agente, veiculos, msg) {
  const ativos = (veiculos || []).filter((v) => v.ativo !== false);
  const opts = ['<option value="">— escolher veículo —</option>']
    .concat(ativos.map((v) => `<option value="${esc(v.id)}" data-hod="${v.ultimoHodometro || 0}">${esc(v.placa)}${v.apelido ? ' · ' + esc(v.apelido) : ''}</option>`))
    .concat(['<option value="__nova__">Outro veículo (digitar placa)</option>']).join('');
  const fotos = LADOS.map((l) => botaoFoto(l, LADO_ROTULO[l])).join('') + botaoFoto('hodometro', 'Foto do hodômetro');
  return `${headMob('Abrir o dia')}<body>${topoMob(agente, 'Checklist do veículo')}
<div class="wrap">
  <div style="background:#FFF4DE;border:1px solid #F0E0B8;border-radius:14px;padding:13px 15px;margin-bottom:6px;font-size:13px;color:#7a5f14"><b>Antes de coletar, confira o veículo.</b> Isso protege você e a empresa e ajuda no controle da frota.</div>
  ${msg ? `<div style="background:#FBE9E7;border:1px solid #f2cfc9;border-radius:12px;padding:11px 14px;margin:10px 0;font-size:13px;color:#8a4b45">${esc(msg)}</div>` : ''}
  <label class="lb">Veículo</label>
  <select id="veiculo" onchange="mudouVeic()">${opts}</select>
  <div id="placaBox" style="display:none"><label class="lb">Placa do veículo</label><input id="placa" style="text-transform:uppercase;letter-spacing:.06em" placeholder="ABC1D23" inputmode="text"></div>
  <label class="lb">Hodômetro agora (km)</label><input id="hodometro" inputmode="numeric" placeholder="ex.: 45230">
  <div id="hodDica" style="font-size:11.5px;color:#7c8a87;margin-top:5px"></div>
  <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:20px 0 8px">Fotos do veículo</div>
  ${fotos}
  <label class="lb">Observações (avarias, nível de combustível, etc.)</label><textarea id="obs" rows="2" placeholder="opcional"></textarea>
  <div id="m" style="font-size:13px;color:#8a4b45;margin:14px 0 0;min-height:18px"></div>
  <button class="btnp" id="b" style="margin-top:8px" onclick="abrir()">Abrir o dia e ver coletas →</button>
</div>
<script>${JS_FOTO}
${LADOS.concat(['hodometro']).map((l) => `ligarFoto('${l}');`).join('')}
var sel=document.getElementById('veiculo');
function mudouVeic(){var v=sel.value;document.getElementById('placaBox').style.display=(v==='__nova__')?'block':'none';var o=sel.options[sel.selectedIndex];var hod=o?o.getAttribute('data-hod'):0;document.getElementById('hodDica').textContent=(hod&&hod!=='0')?('Último hodômetro deste veículo: '+Number(hod).toLocaleString('pt-BR')+' km'):'';}
function abrir(){var b=document.getElementById('b'),m=document.getElementById('m');var vsel=sel.value;
  var rec={fotos:window.FOTOS||{},hodometro:document.getElementById('hodometro').value,obs:document.getElementById('obs').value};
  if(vsel==='__nova__'){rec.placa=document.getElementById('placa').value;}else if(vsel){rec.veiculoId=vsel;}else{m.textContent='Escolha o veículo.';return;}
  if(!rec.hodometro){m.textContent='Informe o hodômetro.';return;}
  var faltam=['frente','traseira','esquerda','direita','hodometro'].filter(function(k){return !rec.fotos[k];});
  if(faltam.length){m.textContent='Faltam fotos: '+faltam.length+' de 5.';return;}
  b.disabled=true;m.style.color='#4F6469';m.textContent='Enviando…';
  fetch('/api/agente/jornada/abrir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/agente';}else{m.style.color='#8a4b45';m.textContent=j.error||'Falha ao abrir o dia.';b.disabled=false;}}).catch(()=>{m.style.color='#8a4b45';m.textContent='Sem conexão. Tente de novo.';b.disabled=false;});}
</script>
</body></html>`;
}

export function paginaFecharDia(agente, jornada) {
  const j = jornada;
  const fotos = LADOS.map((l) => botaoFoto('fim_' + l, LADO_ROTULO[l])).join('') + botaoFoto('fim_hodometro', 'Foto do hodômetro');
  return `${headMob('Fechar o dia')}<body>${topoMob(agente, 'Encerramento do dia')}
<div class="wrap">
  <a href="/agente" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Voltar</a>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin:12px 0">
    <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7c8a87">Veículo</div>
    <div style="font-size:17px;font-weight:800;letter-spacing:.04em;margin-top:2px">${esc(j.placa)}</div>
    <div style="font-size:12.5px;color:#7c8a87;margin-top:4px">Hodômetro na abertura: <b>${numBR(j.abertura.hodometro)} km</b></div>
  </div>
  <label class="lb">Hodômetro agora (km) — final do dia</label><input id="hodometro" inputmode="numeric" placeholder="ex.: ${numBR((j.abertura.hodometro || 0) + 60)}">
  <div id="kmDica" style="font-size:12px;color:#3f8f3a;font-weight:700;margin-top:6px"></div>
  <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:20px 0 8px">Fotos do veículo (como está agora)</div>
  ${fotos}
  <label class="lb">Observações do dia</label><textarea id="obs" rows="2" placeholder="opcional"></textarea>
  <div id="m" style="font-size:13px;color:#8a4b45;margin:14px 0 0;min-height:18px"></div>
  <button class="btnp" id="b" style="margin-top:8px" onclick="fechar()">Fechar o dia →</button>
</div>
<script>${JS_FOTO}
${LADOS.concat(['hodometro']).map((l) => `ligarFoto('fim_${l}');`).join('')}
var HOD_INI=${Number(j.abertura.hodometro || 0)};
document.getElementById('hodometro').addEventListener('input',function(){var v=Number(this.value.replace(/\\./g,'').replace(',','.'))||0;var km=v-HOD_INI;document.getElementById('kmDica').textContent=(km>0)?('Rodou '+km.toLocaleString('pt-BR')+' km hoje'):(v?'Hodômetro final menor que o inicial — confira':'');});
function fechar(){var b=document.getElementById('b'),m=document.getElementById('m');var F=window.FOTOS||{};
  var rec={hodometro:document.getElementById('hodometro').value,obs:document.getElementById('obs').value,fotos:{frente:F['fim_frente'],traseira:F['fim_traseira'],esquerda:F['fim_esquerda'],direita:F['fim_direita'],hodometro:F['fim_hodometro']}};
  if(!rec.hodometro){m.textContent='Informe o hodômetro final.';return;}
  var faltam=['frente','traseira','esquerda','direita','hodometro'].filter(function(k){return !rec.fotos[k];});
  if(faltam.length){m.textContent='Faltam fotos: '+faltam.length+' de 5.';return;}
  b.disabled=true;m.style.color='#4F6469';m.textContent='Enviando…';
  fetch('/api/agente/jornada/fechar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/agente';}else{m.style.color='#8a4b45';m.textContent=j.error||'Falha ao fechar.';b.disabled=false;}}).catch(()=>{m.style.color='#8a4b45';m.textContent='Sem conexão.';b.disabled=false;});}
</script>
</body></html>`;
}

export function paginaAbastecer(agente, jornada) {
  const j = jornada;
  const r = resumoJornada(j);
  const lista = (j.abastecimentos || []).length ? (j.abastecimentos || []).map((a) => `<div style="display:flex;justify-content:space-between;background:#fff;border:1px solid #E4EBE9;border-radius:11px;padding:10px 13px;margin-bottom:8px;font-size:13px">
      <div>${a.litros ? numBR(a.litros) + ' L' : ''}${a.posto ? ' · ' + esc(a.posto) : ''}<div style="font-size:11px;color:#7c8a87">${dataHoraBR(a.em)}</div></div>
      <div style="font-weight:800">R$ ${moedaBR(a.valor)}</div></div>`).join('') : '';
  return `${headMob('Abastecimento')}<body>${topoMob(agente, 'Abastecimento')}
<div class="wrap">
  <a href="/agente" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Voltar</a>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin:12px 0">
    <div style="font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#7c8a87">Veículo ${esc(j.placa)}</div>
    <div style="font-size:13px;color:#4F6469;margin-top:4px">Hoje: ${numBR(r.litros)} L · R$ ${moedaBR(r.gasto)}</div>
  </div>
  <label class="lb">Litros</label><input id="litros" inputmode="decimal" placeholder="ex.: 42,5">
  <label class="lb">Valor pago (R$)</label><input id="valor" inputmode="decimal" placeholder="ex.: 280,00">
  <div class="g2" style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">
    <div><label class="lb">Hodômetro (opcional)</label><input id="hodometro" inputmode="numeric" placeholder="km"></div>
    <div><label class="lb">Combustível</label><input id="combustivel" placeholder="ex.: Diesel S10"></div>
  </div>
  <label class="lb">Posto (opcional)</label><input id="posto" placeholder="nome/local do posto">
  ${botaoFoto('cupom', 'Foto do cupom (opcional)')}
  <div id="m" style="font-size:13px;color:#8a4b45;margin:14px 0 0;min-height:18px"></div>
  <button class="btnp" id="b" style="margin-top:8px" onclick="salvar()">Registrar abastecimento</button>
  ${lista ? `<div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#00333B;margin:22px 0 8px">Abastecimentos de hoje</div>${lista}` : ''}
</div>
<script>${JS_FOTO}
ligarFoto('cupom');
function g(id){return document.getElementById(id).value.trim();}
function salvar(){var b=document.getElementById('b'),m=document.getElementById('m');var F=window.FOTOS||{};
  var rec={litros:g('litros'),valor:g('valor'),hodometro:g('hodometro'),combustivel:g('combustivel'),posto:g('posto'),foto:F['cupom']};
  if(!rec.litros&&!rec.valor){m.textContent='Informe litros ou valor.';return;}
  b.disabled=true;m.style.color='#4F6469';m.textContent='Enviando…';
  fetch('/api/agente/jornada/abastecer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rec)}).then(r=>r.json()).then(j=>{if(j.ok){location.href='/agente/dia/abastecer';}else{m.style.color='#8a4b45';m.textContent=j.error||'Falha.';b.disabled=false;}}).catch(()=>{m.style.color='#8a4b45';m.textContent='Sem conexão.';b.disabled=false;});}
</script>
</body></html>`;
}
