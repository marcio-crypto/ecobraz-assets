// Módulo Engenharia Ambiental — validação técnica das operações (RT CREA/CRQ).
// O engenheiro revisa o DOSSIÊ completo da operação (pesos, materiais/IBAMA, balanço de massa,
// e as fotos carimbadas das 3 fases) e VALIDA ou DEVOLVE. Ao validar, gera um registro assinado
// (HMAC) e um QR público de verificação — o mesmo padrão anti-fraude do selo da Villanova.
//
// Fatias seguintes deste módulo: cadastro/auditoria de Destino Final (usinas) e os Relatórios finais.

import qrcode from 'qrcode-generator';
import { lerOperacao, balanco, FASES, DESTINOS, listarOperacoes, atualizarEtapaOperacao } from './operacional.js';
import { botaoGoogle } from './google-auth.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };
const dataHora = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : ''; };
const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, TE.encode(data))));
}
async function seloCodigoOp(osId, env) {
  const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-op';
  return (await hmac(`${base}|op-selo-v1`, `op:${osId}`)).slice(0, 12);
}
function origemPortal(env, url) { return String(env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }

// --- Registro de engenheiros (env ENG_EMAILS = "email|Nome,email2|Nome2") ---
export function engenheirosDe(env) {
  const out = new Map();
  for (const par of String(env.ENG_EMAILS || '').split(/[,;]+/)) {
    const [em, nome] = par.split('|');
    const e = (em || '').trim().toLowerCase();
    if (e) out.set(e, (nome || '').trim() || e.split('@')[0]);
  }
  return out;
}
export function engenheiroPermitido(email, env) { return engenheirosDe(env).has(String(email || '').trim().toLowerCase()); }
export function nomeEngenheiro(email, env) { return engenheirosDe(env).get(String(email || '').trim().toLowerCase()) || String(email || '').split('@')[0]; }

export async function filaValidacao(env) { return (await listarOperacoes(env)).filter((o) => o.etapa === 'validacao'); }
export async function operacoesValidadas(env) { return (await listarOperacoes(env)).filter((o) => o.etapa === 'concluida'); }
export async function lerValidacaoOp(env, osId) { if (!env.PORTAL_KV) return null; const raw = await env.PORTAL_KV.get(`opvalidacao:${osId}`); return raw ? JSON.parse(raw) : null; }

export async function registrarValidacaoOp(env, osId, eng, d) {
  const op = await lerOperacao(env, osId); if (!op) return null;
  const validar = (d && d.decisao || 'validar') === 'validar';
  const reg = {
    decisao: validar ? 'validada' : 'devolvida',
    rt: String((d && d.rt) || '').slice(0, 80),
    registro: String((d && d.registro) || '').slice(0, 40),
    comentario: String((d && d.comentario) || '').slice(0, 600),
    por: eng.email, em: agora(),
  };
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`opvalidacao:${osId}`, JSON.stringify(reg), { expirationTtl: 60 * 60 * 24 * 365 });
  await atualizarEtapaOperacao(env, osId, validar ? 'concluida' : 'saida', { validacao: { decisao: reg.decisao, rt: reg.rt, registro: reg.registro, em: reg.em, por: eng.email } });
  return reg;
}

// --- Páginas ---
const CSS = `*{box-sizing:border-box}body{margin:0;background:#F2F6F4;min-height:100vh;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B}
.wrap{max-width:760px;margin:0 auto;padding:20px 18px 48px}
.top{background:#00333B;padding:18px 20px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px;margin-bottom:16px}
.eyebrow{font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7c8a87;margin-bottom:12px}
.btn{display:block;width:100%;border:none;border-radius:12px;padding:14px;font-size:14px;font-weight:800;text-align:center;cursor:pointer;margin-bottom:10px;text-decoration:none}
.primary{background:#92C430;color:#10262B}.dark{background:#00333B;color:#fff}.ghost{background:#fff;color:#00333B;border:1.5px solid #cfe0dd}.muted{background:#EEF1F0;color:#9aa7a4}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kpi{background:#F7FaF6;border:1px solid #E4EBE9;border-radius:12px;padding:12px}
.kpi b{display:block;font-size:19px;color:#00333B;letter-spacing:-.02em}.kpi span{font-size:10.5px;color:#7c8a87;font-weight:700}
label.fld{display:block;font-size:12px;font-weight:700;color:#4F6469;margin:12px 0 6px}
input.txt,textarea.txt,select.txt{width:100%;border:1px solid #DDE1E6;border-radius:11px;padding:12px;font-size:15px;font-family:inherit}
.tbl{width:100%;border-collapse:collapse;font-size:12.5px}.tbl th{text-align:left;color:#7c8a87;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:6px 6px}.tbl td{padding:8px 6px;border-top:1px solid #EEF1F0}
.fotos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.fotos img{width:100%;height:96px;object-fit:cover;border-radius:9px;border:1px solid #E4EBE9}
.pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}
@media(max-width:560px){.kpis{grid-template-columns:repeat(2,1fr)}.fotos{grid-template-columns:repeat(2,1fr)}}`;
const head = (t) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t)} — Ecobraz</title><style>${CSS}</style></head><body>`;

export function paginaLoginEng(googleOn) {
  return `${head('Engenharia Ambiental')}
<div style="min-height:100vh;display:flex;align-items:center;background:#00333B">
  <div style="max-width:420px;margin:0 auto;padding:32px 24px;width:100%">
    <div style="text-align:center;margin-bottom:26px"><span style="color:#fff;font-size:26px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">engenharia</span></div>
    <div style="background:#fff;border-radius:18px;padding:26px 22px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#00333B">Validação técnica</h1>
      <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6">Acesso do Engenheiro Ambiental (RT).</p>
      ${googleOn ? botaoGoogle('eng') : ''}
      <input id="e" type="email" inputmode="email" placeholder="seu e-mail" class="txt">
      <button id="b" class="btn primary" style="margin-top:12px">Entrar</button>
      <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px"></div>
    </div>
  </div>
</div>
<script>const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/eng/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail estiver cadastrado, enviamos o link.';}catch{m.textContent='Tente de novo.';}b.disabled=false;};
e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});</script></body></html>`;
}

export function paginaFilaEng(eng, fila, validadas) {
  const item = (o, badge) => `<a href="/eng/lote?id=${esc(o.osId)}" style="display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:14px;font-weight:800;color:#10262B">OS ${esc(o.numero)}</div>${badge}</div>
      <div style="font-size:13px;color:#4F6469;margin-top:6px">${esc(o.cliente || 'Cliente')}${o.tipo === 'pago' ? ' · <b style="color:#8A6A16">Pago/laudo</b>' : ''}</div></a>`;
  const filaHtml = fila.length ? fila.map((o) => item(o, `<span class="pill" style="background:#FFF4DE;color:#8A6A16">aguardando validação</span>`)).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhuma operação aguardando validação.</div>`;
  const validHtml = (validadas || []).slice(0, 8).map((o) => item(o, `<span class="pill" style="background:#E4F3E6;color:#1E5B31">✓ validada</span>`)).join('');
  return `${head('Fila de validação')}
<div class="top"><div style="display:flex;justify-content:space-between;align-items:center">
  <div><span style="color:#fff;font-size:15px;font-weight:800">Eng. ${esc((eng.nome || '').split(/\s+/)[0] || '')}</span><div style="color:#9FC6C1;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-top:4px">Ecobraz · Engenharia Ambiental</div></div>
  <form method="post" action="/api/eng/sair" style="margin:0"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700">Sair</button></form>
</div></div>
<div class="wrap">
  <a href="/eng/destinos" class="btn ghost" style="margin-bottom:16px">🏭 Destinos finais (usinas) →</a>
  <div style="font-size:13px;font-weight:800;margin-bottom:12px">Aguardando validação <span class="pill" style="background:#FFF4DE;color:#8A6A16">${fila.length}</span></div>
  ${filaHtml}
  ${validHtml ? `<div style="font-size:13px;font-weight:800;margin:22px 0 12px">Validadas recentemente</div>${validHtml}` : ''}
</div></body></html>`;
}

function kpi(v, s) { return `<div class="kpi"><b>${esc(v)}</b><span>${esc(s)}</span></div>`; }

export function paginaDossie(eng, op, validacao, seloUrl) {
  const b = balanco(op);
  const validada = op.etapa === 'concluida' && validacao && validacao.decisao === 'validada';
  const fotosHtml = Object.keys(FASES).map((fase) => {
    const fs = (op.fotos && op.fotos[fase]) || {};
    const imgs = FASES[fase].fotos.filter((f) => fs[f.id]).map((f) => `<div><img src="/eng/foto?id=${esc(op.osId)}&fase=${fase}&cat=${f.id}" alt="${esc(f.rotulo)}"><div style="font-size:10px;color:#7c8a87;margin-top:3px">${esc(f.rotulo)} · ${dataHora(fs[f.id].em)}${fs[f.id].geo ? ' · GPS ✓' : ''}</div></div>`).join('');
    return imgs ? `<div style="margin-bottom:12px"><div style="font-size:11px;font-weight:800;color:#4F6469;margin-bottom:6px">${esc(FASES[fase].rotulo)}</div><div class="fotos">${imgs}</div></div>` : '';
  }).join('') || '<div style="font-size:12px;color:#9aa7a4">Sem fotos anexadas.</div>';
  const matRows = (op.materiais || []).map((m) => `<tr><td>${esc(m.rotulo)}</td><td>${esc(m.ibama || '—')}</td><td>${esc(m.classe)}</td><td>${String(m.qtd).replace('.', ',')} kg</td><td>${esc(DESTINOS[m.destino] || m.destino)}</td></tr>`).join('') || '<tr><td colspan="5" style="color:#9aa7a4">Sem materiais.</td></tr>';
  const balCor = b.fecha ? '#1E7A3D' : '#B23A2E';
  const bloco = validada
    ? `<div class="card" style="border-color:#cfe6be;background:#F5FBF1">
        <div class="eyebrow">Validação técnica</div>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <div style="flex:1;min-width:180px">
            <div style="font-size:15px;font-weight:800;color:#1E5B31">✓ Operação validada</div>
            <div style="font-size:12.5px;color:#4F6469;margin-top:6px">RT <b>${esc(validacao.rt || '—')}</b>${validacao.registro ? ` · ${esc(validacao.registro)}` : ''}</div>
            <div style="font-size:11.5px;color:#7c8a87;margin-top:2px">em ${dataHora(validacao.em)}</div>
            ${validacao.comentario ? `<div style="font-size:12px;color:#4F6469;margin-top:8px;font-style:italic">“${esc(validacao.comentario)}”</div>` : ''}
          </div>
          ${seloUrl ? `<div style="text-align:center"><img src="${esc(seloUrl)}" alt="QR de verificação" style="width:120px;height:120px"><div style="font-size:10px;color:#7c8a87;margin-top:4px">Verificação pública</div></div>` : ''}
        </div>
        <a href="/eng/relatorio?id=${esc(op.osId)}" target="_blank" rel="noopener" class="btn dark" style="margin:16px 0 0">📄 Gerar relatório de conformidade (PDF)</a>
      </div>`
    : `<div class="card">
        <div class="eyebrow">Validação técnica (RT)</div>
        <form method="post" action="/api/eng/validar">
          <input type="hidden" name="osId" value="${esc(op.osId)}">
          <label class="fld">Responsável Técnico (nome)</label><input class="txt" name="rt" value="${esc(eng.nome || '')}" required>
          <label class="fld">Registro profissional (CREA/CRQ)</label><input class="txt" name="registro" placeholder="ex.: CREA-SP 000000">
          <label class="fld">Parecer / observações</label><textarea class="txt" name="comentario" rows="3" placeholder="Conformidade da operação, ressalvas…"></textarea>
          <div style="display:flex;gap:10px;margin-top:14px">
            <button class="btn dark" name="decisao" value="validar" style="margin:0">✓ Validar e assinar</button>
            <button class="btn ghost" name="decisao" value="devolver" style="margin:0" onclick="return confirm('Devolver a operação para a doca?')">↩ Devolver</button>
          </div>
        </form>
      </div>`;
  return `${head('Dossiê OS ' + op.numero)}
<div class="top"><a href="/eng" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← DOSSIÊ OS ${esc(op.numero)}</a>
  <div style="color:#fff;font-size:20px;font-weight:800;margin-top:8px">${esc(op.cliente || 'Cliente')}</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px">${op.tipo === 'pago' ? 'Pago / laudo' : 'Padrão'} · dossiê de conformidade</div></div>
<div class="wrap">
  <div class="card">
    <div class="eyebrow">Resumo</div>
    <div class="kpis">
      ${kpi(String(b.entrada).replace('.', ',') + ' kg', 'Entrada')}
      ${kpi(String(b.saida).replace('.', ',') + ' kg', 'Saída')}
      ${kpi((op.materiais || []).length, 'Materiais')}
      ${kpi((b.saida > 0 ? (Math.round(b.pct * 1000) / 10) + '%' : '—'), 'Dif. balanço')}
    </div>
    <div style="font-size:12px;color:${balCor};font-weight:700;margin-top:12px">${b.fecha ? '✓ Balanço de massa fecha dentro de ±2%' : (b.saida > 0 ? '⚠ Balanço fora de ±2%' + (op.saida && op.saida.justificativa ? ' — justificado: “' + esc(op.saida.justificativa) + '”' : '') : 'Saída ainda não pesada')}</div>
  </div>

  <div class="card">
    <div class="eyebrow">Materiais / classificação</div>
    <table class="tbl"><thead><tr><th>Material</th><th>IBAMA</th><th>Classe</th><th>Qtd</th><th>Destino</th></tr></thead><tbody>${matRows}</tbody></table>
  </div>

  <div class="card">
    <div class="eyebrow">Evidências fotográficas (3 fases, carimbadas)</div>
    ${fotosHtml}
  </div>

  ${bloco}
</div></body></html>`;
}

// --- Público: QR de verificação da operação validada ---
export async function qrOperacao(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^0-9]/g, '').slice(0, 12);
  if (!id) return new Response('faltou id', { status: 400 });
  const code = await seloCodigoOp(id, env);
  const alvo = `${origemPortal(env, url)}/validar-operacao?id=${id}&c=${code}`;
  if ((url.searchParams.get('fmt') || '') === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=86400' } });
}

export async function validarOperacaoPublico(request, env, url) {
  const id = (url.searchParams.get('id') || '').replace(/[^0-9]/g, '').slice(0, 12);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const esperado = id ? await seloCodigoOp(id, env) : '';
  const assinaturaOk = !!(id && c && esperado && c === esperado);
  let op = null, val = null;
  if (assinaturaOk) { op = await lerOperacao(env, id); val = await lerValidacaoOp(env, id); }
  const ok = assinaturaOk && op && op.etapa === 'concluida' && val && val.decisao === 'validada';
  const cor = ok ? '#1E7A3D' : '#B23A2E';
  const b = op ? balanco(op) : null;
  const linhas = ok ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;font-size:14px">
        <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Operação (OS)</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800">${esc(op.numero)}</td></tr>
        <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Cliente</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(op.cliente || '—')}</td></tr>
        <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Entrada / Saída</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${String(b.entrada).replace('.', ',')} / ${String(b.saida).replace('.', ',')} kg</td></tr>
        <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Validado por (RT)</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(val.rt || '—')}${val.registro ? ' · ' + esc(val.registro) : ''}</td></tr>
        <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78">Data</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700">${esc(dataHora(val.em))}</td></tr>
      </table>` : '';
  const body = `${head('Verificação de operação')}
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
  <div style="background:#00333B;border-radius:16px 16px 0 0;padding:22px 26px"><span style="color:#fff;font-size:20px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">verificação</span></div>
  <div style="background:#fff;border-radius:0 0 16px 16px;border:1px solid #E4EBE9;border-top:none;padding:30px 26px 34px">
    <div style="width:74px;height:74px;border-radius:50%;background:${cor};color:#fff;font-size:40px;line-height:74px;text-align:center;margin:0 auto 18px">${ok ? '✓' : '✕'}</div>
    <h1 style="margin:0 0 10px;text-align:center;font-size:22px;color:${cor}">${ok ? 'Operação validada' : (assinaturaOk ? 'Operação não encontrada' : 'Código inválido')}</h1>
    <p style="margin:0;text-align:center;font-size:14.5px;color:#4F6469;line-height:1.6">${ok ? 'Esta operação foi <strong>validada pela Engenharia Ambiental da Ecobraz</strong>, com rastreabilidade e balanço de massa.' : 'Não foi possível verificar. Escaneie o QR direto do documento original.'}</p>
    ${linhas}
    <p style="margin:24px 0 0;text-align:center;font-size:11.5px;color:#9fb0ac">Conferido em tempo real nos registros da Ecobraz.</p>
  </div>
</div></body></html>`;
  return new Response(body, { status: ok ? 200 : (assinaturaOk ? 404 : 400), headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// ---------------------------------------------------------------------------
// Destino Final — cadastro e auditoria das usinas (incineração/coprocessamento/reciclagem)
// A Ecobraz é ATERRO ZERO: nada vai para aterro; o que não recicla é incinerado/coprocessado.
// A Engenharia audita a documentação (Licença de Operação + validade) de cada destino.
// ---------------------------------------------------------------------------
export const TIPOS_DESTINO = { reciclagem: 'Reciclagem', incineracao: 'Incineração', coprocessamento: 'Coprocessamento', reuso: 'Reúso', tratamento: 'Tratamento' };
export function destinoStatus(d) {
  if (!d) return 'pendente';
  let hoje = ''; try { hoje = new Date().toISOString().slice(0, 10); } catch { hoje = ''; }
  if (d.loValidade && hoje && d.loValidade < hoje) return 'vencido';
  return d.validado ? 'validado' : 'pendente';
}
async function lerIndiceDestinos(env) { if (!env.PORTAL_KV) return []; const raw = await env.PORTAL_KV.get('destinos:index'); try { return raw ? JSON.parse(raw) : []; } catch { return []; } }
export async function listarDestinos(env) { return await lerIndiceDestinos(env); }
export async function lerDestino(env, id) { if (!env.PORTAL_KV) return null; const raw = await env.PORTAL_KV.get(`destino:${String(id).replace(/\D/g, '')}`); return raw ? JSON.parse(raw) : null; }
export async function salvarDestino(env, eng, d) {
  const id = String((d && d.cnpj) || (d && d.id) || '').replace(/\D/g, '');
  if (!id) return null;
  const destino = {
    id, razaoSocial: String(d.razaoSocial || '').slice(0, 120), cnpj: String(d.cnpj || '').slice(0, 20),
    tipo: TIPOS_DESTINO[d.tipo] ? d.tipo : 'reciclagem', endereco: String(d.endereco || '').slice(0, 160),
    lo: String(d.lo || '').slice(0, 40), loValidade: String(d.loValidade || '').slice(0, 10),
    validado: d.validado === true || d.validado === 'on' || d.validado === '1',
    por: eng.email, em: agora(),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`destino:${id}`, JSON.stringify(destino), { expirationTtl: 60 * 60 * 24 * 730 });
    const idx = await lerIndiceDestinos(env);
    const resumo = { id, razaoSocial: destino.razaoSocial, cnpj: destino.cnpj, tipo: destino.tipo, lo: destino.lo, loValidade: destino.loValidade, validado: destino.validado };
    const i = idx.findIndex((x) => x.id === id); if (i >= 0) idx[i] = resumo; else idx.unshift(resumo);
    await env.PORTAL_KV.put('destinos:index', JSON.stringify(idx.slice(0, 200)));
  }
  return destino;
}

const pillStatus = (st) => {
  const m = { validado: ['#E4F3E6', '#1E5B31', '✓ validado'], pendente: ['#FFF4DE', '#8A6A16', 'pendente'], vencido: ['#FCE7E4', '#B23A2E', '⚠ licença vencida'] };
  const [bg, fg, txt] = m[st] || m.pendente;
  return `<span class="pill" style="background:${bg};color:${fg}">${txt}</span>`;
};

export function paginaDestinos(eng, destinos) {
  const itens = destinos.length ? destinos.map((d) => {
    const st = destinoStatus(d);
    return `<a href="/eng/destino?id=${esc(d.id)}" style="display:block;text-decoration:none;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:14px 16px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><div style="font-size:14px;font-weight:800;color:#10262B">${esc(d.razaoSocial || d.cnpj)}</div>${pillStatus(st)}</div>
      <div style="font-size:12.5px;color:#4F6469;margin-top:6px">${esc(TIPOS_DESTINO[d.tipo] || d.tipo)} · LO ${esc(d.lo || '—')}${d.loValidade ? ` · val. ${esc(d.loValidade.split('-').reverse().join('/'))}` : ''}</div></a>`;
  }).join('') : `<div class="card" style="text-align:center;color:#8fa39f;font-size:13.5px">Nenhum destino cadastrado ainda.</div>`;
  return `${head('Destinos finais')}
<div class="top"><a href="/eng" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← DESTINOS FINAIS</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px">Usinas / destinos homologados</div>
  <div style="color:#9FC6C1;font-size:12px;margin-top:4px">Ecobraz é aterro zero · reciclagem, incineração e coprocessamento</div></div>
<div class="wrap">
  <a href="/eng/destino" class="btn dark" style="margin-bottom:16px">➕ Cadastrar destino</a>
  ${itens}
</div></body></html>`;
}

export function paginaDestinoForm(eng, destino) {
  const d = destino || {};
  const optsTipo = Object.entries(TIPOS_DESTINO).map(([k, v]) => `<option value="${k}"${d.tipo === k ? ' selected' : ''}>${esc(v)}</option>`).join('');
  return `${head(d.id ? 'Editar destino' : 'Cadastrar destino')}
<div class="top"><a href="/eng/destinos" style="color:#9FC6C1;font-size:12px;font-weight:800;letter-spacing:.08em;text-decoration:none">← ${d.id ? 'EDITAR DESTINO' : 'CADASTRAR DESTINO'}</a>
  <div style="color:#fff;font-size:19px;font-weight:800;margin-top:8px">${d.id ? esc(d.razaoSocial || d.cnpj) : 'Novo destino final'}</div></div>
<div class="wrap">
  <form method="post" action="/api/eng/destino" class="card">
    <label class="fld">Razão social da usina/destino</label><input class="txt" name="razaoSocial" value="${esc(d.razaoSocial || '')}" required>
    <label class="fld">CNPJ</label><input class="txt" name="cnpj" value="${esc(d.cnpj || '')}" ${d.id ? 'readonly' : ''} required placeholder="00.000.000/0000-00">
    <label class="fld">Tipo de tratamento</label><select class="txt" name="tipo">${optsTipo}</select>
    <label class="fld">Endereço</label><input class="txt" name="endereco" value="${esc(d.endereco || '')}">
    <div style="display:flex;gap:10px">
      <div style="flex:1"><label class="fld">Licença de Operação (LO)</label><input class="txt" name="lo" value="${esc(d.lo || '')}"></div>
      <div style="width:150px"><label class="fld">Validade da LO</label><input class="txt" type="date" name="loValidade" value="${esc(d.loValidade || '')}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:10px;margin-top:16px;font-size:13.5px;font-weight:700;color:#10262B"><input type="checkbox" name="validado" value="1"${d.validado ? ' checked' : ''} style="width:18px;height:18px">Documentação auditada e destino homologado</label>
    <button class="btn dark" style="margin-top:16px">Salvar destino</button>
  </form>
  <div style="font-size:11px;color:#9aa7a4;text-align:center">A homologação atesta que a Engenharia auditou a licença ambiental do destino. Destinos com LO vencida entram como alerta.</div>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Relatório final de conformidade (documento imprimível / PDF, à prova de auditoria)
// ---------------------------------------------------------------------------
// Identidade legal (dos modelos oficiais da Ecobraz).
const EMPRESA_CDF = {
  razao: 'ASSOCIAÇÃO AUXÍLIO À RECICLAGEM DE ELETRÔNICOS E INCLUSÃO DIGITAL — ECOBRAZ',
  cnpj: '14.197.457/0001-42', lo: '30011495',
  endereco: 'Rua Dona Maria Quedas, 230 — Jardim Andaraí — 02175-010 — São Paulo/SP',
  fone: '(11) 4329-2001', email: 'contato@ecobraz.org.br',
};
const tdC = 'padding:9px 10px;border:1px solid #E4EBE9';

// Certificado de Destinação Final (CDF) — documento enxuto para o cliente, gerado
// da operação VALIDADA. Só certifica de fato quando há validação técnica do RT.
export function paginaCDF(op, validacao, destinos, seloUrl) {
  const b = balanco(op);
  let emissao = ''; try { emissao = new Date().toLocaleDateString('pt-BR'); } catch { emissao = ''; }
  const validada = !!(validacao && validacao.decisao === 'validada');
  const numCDF = 'CDF-' + ((op.numero || '').replace(/[^0-9]/g, '') || '—');
  const tipos = [...new Set((op.materiais || []).map((m) => m.destino))];
  const destRows = tipos.map((t) => {
    const usinas = (destinos || []).filter((d) => d.tipo === t && destinoStatus(d) === 'validado');
    const kg = Math.round((b.porDestino[t] || 0) * 100) / 100;
    return `<tr><td style="${tdC}">${esc(DESTINOS[t] || t)}</td><td style="${tdC};text-align:right">${String(kg).replace('.', ',')} kg</td><td style="${tdC}">${usinas.length ? usinas.map((u) => esc(u.razaoSocial || u.cnpj) + (u.lo ? ' (LO ' + esc(u.lo) + ')' : '')).join('; ') : 'Ecobraz — aterro zero'}</td></tr>`;
  }).join('') || `<tr><td style="${tdC}" colspan="3">—</td></tr>`;
  const eyebrow = (t) => `<div style="display:flex;align-items:center;gap:9px;margin:22px 0 8px"><span style="width:4px;height:16px;background:#92C430;border-radius:2px"></span><span style="font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#00333B">${esc(t)}</span></div>`;
  const corpo = `
    <div style="font-size:12.5px;color:#28413f;line-height:1.7;text-align:justify">A <b>${esc(EMPRESA_CDF.razao)}</b>, inscrita no CNPJ ${esc(EMPRESA_CDF.cnpj)}, licenciada sob LO ${esc(EMPRESA_CDF.lo)}, <b>CERTIFICA</b> que recebeu do gerador abaixo identificado, por meio da <b>Ordem de Serviço ${esc(op.numero)}</b>, a quantidade de <b>${String(b.entrada).replace('.', ',')} kg</b> de resíduos de equipamentos eletroeletrônicos (REEE), e promoveu sua <b>destinação final ambientalmente adequada</b>, nos termos da Política Nacional de Resíduos Sólidos (Lei nº 12.305/2010), conforme o detalhamento e a validação técnica a seguir.</div>
    ${eyebrow('Gerador')}
    <div style="font-size:13px;font-weight:700;color:#10262B">${esc(op.cliente || '—')}</div>
    ${eyebrow('Destinação final')}
    <table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="background:#F2F6F4;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#5c6f6b"><th style="${tdC};text-align:left">Tipo</th><th style="${tdC};text-align:right">Quantidade</th><th style="${tdC};text-align:left">Destino / usina homologada</th></tr></thead>
      <tbody>${destRows}<tr><td style="${tdC};text-align:right;font-weight:800" colspan="1">Total recebido</td><td style="${tdC};text-align:right;font-weight:800">${String(b.entrada).replace('.', ',')} kg</td><td style="${tdC}"></td></tr></tbody>
    </table>
    ${eyebrow('Validação técnica')}
    ${validada
      ? `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:#F1F8EC;border:1px solid #cfe6b8;border-radius:12px;padding:16px 18px">
          <div style="flex:1;min-width:220px"><div style="font-size:13.5px;font-weight:800;color:#1E5B31">✓ Operação validada pela Engenharia Ambiental</div>
          <div style="font-size:12.5px;color:#28413f;margin-top:6px">Responsável Técnico: <b>${esc(validacao.rt || '—')}</b>${validacao.registro ? ' · ' + esc(validacao.registro) : ''}</div>
          <div style="font-size:11px;color:#7c8a87;margin-top:2px">em ${esc(dataHora(validacao.em))}</div></div>
          ${seloUrl ? `<div style="text-align:center"><img src="${esc(seloUrl)}" alt="QR" style="width:92px;height:92px;border:1px solid #E4EBE9;border-radius:8px;background:#fff"><div style="font-size:8.5px;color:#9aa7a4;margin-top:3px;text-transform:uppercase;letter-spacing:.05em">Verificar autenticidade</div></div>` : ''}
        </div>`
      : `<div style="background:#FFF4DE;border:1px solid #f0e0b8;border-radius:12px;padding:14px 16px;font-size:12.5px;color:#8A6A16"><b>Certificado pendente.</b> Este CDF só é emitido após a <b>validação técnica</b> da operação pela Engenharia Ambiental (RT). Aguarde a validação para gerar a versão final.</div>`}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(numCDF)} — Ecobraz</title>
<style>@media print{.noprint{display:none!important}body{background:#fff!important}}*{box-sizing:border-box}</style></head>
<body style="margin:0;background:#EDF1EF;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B">
<div style="max-width:820px;margin:0 auto;padding:18px">
  <div class="noprint" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <a href="/coletas/os?id=${esc(op.osId)}" style="color:#4F6469;font-size:13px;font-weight:800;text-decoration:none">← Voltar</a>
    <button onclick="window.print()" style="background:#00333B;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:800">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div style="background:#fff;border:1px solid #E1E8E5;border-radius:14px;overflow:hidden">
    <div style="background:#00333B;padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
      <div><div style="font-size:27px;font-weight:800;color:#fff">ecobraz<span style="color:#92C430">.</span></div>
      <div style="font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#92C430;margin-top:7px">Certificado de Destinação Final</div></div>
      <div style="text-align:right"><div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#7fa6a3">Nº do certificado</div><div style="font-size:20px;font-weight:800;color:#fff">${esc(numCDF)}</div><div style="font-size:11.5px;color:#cfe3e0;margin-top:7px">Emissão: <b style="color:#fff">${esc(emissao)}</b></div></div>
    </div>
    <div style="background:#F2F6F4;border-bottom:1px solid #E4EBE9;padding:11px 28px;font-size:11px;color:#4F6469;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px"><span><b style="color:#10262B">${esc(EMPRESA_CDF.razao)}</b></span><span>CNPJ ${esc(EMPRESA_CDF.cnpj)} · LO ${esc(EMPRESA_CDF.lo)}</span></div>
    <div style="padding:22px 28px 24px">${corpo}</div>
    <div style="background:#00333B;padding:13px 28px;font-size:10px;color:#9FC6C1;line-height:1.7">Base legal: Lei nº 12.305/2010 (PNRS) · classificação ABNT NBR 10004 · ${esc(EMPRESA_CDF.endereco)} · ${esc(EMPRESA_CDF.fone)}. Documento emitido eletronicamente e verificável pelo QR.</div>
  </div>
</div></body></html>`;
}

export function paginaRelatorio(op, validacao, destinos, seloUrl) {
  const b = balanco(op);
  let emissao = ''; try { emissao = new Date().toLocaleDateString('pt-BR'); } catch { emissao = ''; }
  const tiposUsados = [...new Set((op.materiais || []).map((m) => m.destino))];
  const destinacao = tiposUsados.map((t) => {
    const usinas = (destinos || []).filter((d) => d.tipo === t && destinoStatus(d) === 'validado');
    return { tipo: t, kg: b.porDestino[t] || 0, usinas };
  });
  const matRows = (op.materiais || []).map((m) => `<tr><td>${esc(m.rotulo)}</td><td>${esc(m.ibama || '—')}</td><td>${esc(m.classe)}</td><td style="text-align:right">${String(m.qtd).replace('.', ',')} kg</td><td>${esc(DESTINOS[m.destino] || m.destino)}</td></tr>`).join('');
  const destRows = destinacao.map((d) => `<tr><td>${esc(DESTINOS[d.tipo] || d.tipo)}</td><td style="text-align:right">${String(Math.round(d.kg * 100) / 100).replace('.', ',')} kg</td><td>${d.usinas.length ? d.usinas.map((u) => esc(u.razaoSocial || u.cnpj) + ' (LO ' + esc(u.lo || '—') + ')').join('; ') : '<span style="color:#B23A2E">destino homologado pendente</span>'}</td></tr>`).join('');
  const fotos = Object.keys(FASES).map((fase) => {
    const fs = (op.fotos && op.fotos[fase]) || {};
    const imgs = FASES[fase].fotos.filter((f) => fs[f.id]).map((f) => `<div style="width:31%"><img src="/eng/foto?id=${esc(op.osId)}&fase=${fase}&cat=${f.id}" style="width:100%;height:90px;object-fit:cover;border:1px solid #ccc;border-radius:6px"><div style="font-size:8.5px;color:#666;margin-top:2px">${esc(f.rotulo)} · ${dataHora(fs[f.id].em)}${fs[f.id].geo ? ' · GPS✓' : ''}</div></div>`).join('');
    return imgs ? `<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:800;color:#00333B;margin-bottom:4px">${esc(FASES[fase].rotulo)}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${imgs}</div></div>` : '';
  }).join('');
  const S = (v) => String(v).replace('.', ',');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Relatório de Conformidade — OS ${esc(op.numero)}</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#EEF1F0;font-family:Arial,Helvetica,sans-serif;color:#1f2933}
  .bar{position:sticky;top:0;background:#00333B;padding:10px 16px;display:flex;justify-content:space-between;align-items:center}
  .bar b{color:#fff;font-size:13px}.pbtn{background:#92C430;color:#10262B;border:none;border-radius:8px;padding:9px 16px;font-weight:800;font-size:13px;cursor:pointer}
  .doc{max-width:800px;margin:16px auto;background:#fff;padding:34px 40px;box-shadow:0 8px 30px rgba(0,0,0,.1)}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #92C430;padding-bottom:14px;margin-bottom:18px}
  .hd .lg{font-size:24px;font-weight:800;color:#00333B}.hd .lg span{color:#3f8f3a}
  h1{font-size:16px;color:#00333B;margin:0 0 2px}.sub{font-size:11px;color:#666}
  .sec{font-size:11px;font-weight:800;color:#00333B;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin:20px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}th{text-align:left;color:#666;font-size:9.5px;text-transform:uppercase;padding:5px 6px;border-bottom:1px solid #e2e8f0}td{padding:6px;border-bottom:1px solid #eef1f0}
  .grid{display:flex;gap:14px;flex-wrap:wrap}.box{flex:1;min-width:150px;background:#F7FaF6;border:1px solid #e2e8f0;border-radius:8px;padding:10px}.box b{display:block;font-size:16px;color:#00333B}.box span{font-size:10px;color:#666}
  .ok{color:#1E7A3D;font-weight:700}.bad{color:#B23A2E;font-weight:700}
  .val{display:flex;gap:16px;align-items:center;background:#F5FBF1;border:1px solid #cfe6be;border-radius:8px;padding:14px;margin-top:8px;flex-wrap:wrap}
  .foot{margin-top:22px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9.5px;color:#888;line-height:1.5}
  @media print{.bar{display:none}body{background:#fff}.doc{box-shadow:none;margin:0;max-width:100%;padding:0}}
</style></head><body>
<div class="bar noprint"><b>Relatório de Conformidade · OS ${esc(op.numero)}</b><button class="pbtn" onclick="window.print()">🖨 Imprimir / Salvar PDF</button></div>
<div class="doc">
  <div class="hd">
    <div><div class="lg">ecobraz<span> emigre</span></div><div class="sub" style="margin-top:4px">Associação Auxílio à Reciclagem de Eletrônicos e Inclusão Digital</div></div>
    <div style="text-align:right"><h1>Relatório de Conformidade Ambiental</h1><div class="sub">Nº da operação: <b>${esc(op.numero)}</b> · Emissão: ${esc(emissao)}</div></div>
  </div>

  <div class="sec">Partes</div>
  <div class="grid">
    <div class="box"><span>Gerador (cliente)</span><b style="font-size:13px">${esc(op.cliente || '—')}</b></div>
    <div class="box"><span>Destinador</span><b style="font-size:13px">Ecobraz (aterro zero)</b><span>Atendimento: ${op.tipo === 'pago' ? 'Pago / laudo' : 'Padrão'}</span></div>
  </div>

  <div class="sec">Balanço de massa</div>
  <div class="grid">
    <div class="box"><span>Entrada (pesada)</span><b>${S(b.entrada)} kg</b></div>
    <div class="box"><span>Saída (pesada)</span><b>${S(b.saida)} kg</b></div>
    <div class="box"><span>Diferença</span><b>${b.saida > 0 ? (Math.round(b.pct * 1000) / 10) + '%' : '—'}</b><span class="${b.fecha ? 'ok' : 'bad'}">${b.fecha ? '✓ fecha em ±2%' : (op.saida && op.saida.justificativa ? 'justificado' : 'fora de ±2%')}</span></div>
  </div>
  ${op.saida && op.saida.justificativa ? `<div style="font-size:10.5px;color:#666;margin-top:8px">Justificativa da diferença: “${esc(op.saida.justificativa)}”.</div>` : ''}

  <div class="sec">Detalhamento dos resíduos (Tabela IBAMA)</div>
  <table><thead><tr><th>Material</th><th>Cód. IBAMA</th><th>Classe</th><th>Quantidade</th><th>Destino</th></tr></thead><tbody>${matRows || '<tr><td colspan="5">—</td></tr>'}</tbody></table>

  <div class="sec">Destinação final (aterro zero)</div>
  <table><thead><tr><th>Tipo</th><th>Quantidade</th><th>Usina(s) homologada(s)</th></tr></thead><tbody>${destRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table>

  <div class="sec">Evidências fotográficas (3 fases, carimbadas com OS · data/hora · GPS)</div>
  ${fotos || '<div style="font-size:11px;color:#888">Sem fotos.</div>'}

  <div class="sec">Validação técnica</div>
  ${validacao && validacao.decisao === 'validada'
    ? `<div class="val"><div style="flex:1;min-width:200px"><div class="ok" style="font-size:14px">✓ Operação validada pela Engenharia Ambiental</div>
        <div style="font-size:11.5px;margin-top:6px">Responsável Técnico: <b>${esc(validacao.rt || '—')}</b>${validacao.registro ? ' · ' + esc(validacao.registro) : ''}</div>
        <div style="font-size:10.5px;color:#666">em ${esc(dataHora(validacao.em))}</div>
        ${validacao.comentario ? `<div style="font-size:10.5px;color:#555;margin-top:6px;font-style:italic">“${esc(validacao.comentario)}”</div>` : ''}</div>
        ${seloUrl ? `<div style="text-align:center"><img src="${esc(seloUrl)}" style="width:96px;height:96px"><div style="font-size:8.5px;color:#666">Verificação: escaneie o QR</div></div>` : ''}</div>`
    : '<div class="bad" style="font-size:12px">Operação ainda não validada.</div>'}

  <div class="foot">Documento gerado pelo sistema Ecobraz a partir do registro operacional rastreável (recepção, triagem, processamento e saída). A destinação segue a Política Nacional de Resíduos Sólidos (Lei nº 12.305/2010). Autenticidade verificável pelo QR de validação. Ecobraz é aterro zero: o material não reciclável é encaminhado a incineração/coprocessamento em usinas homologadas.</div>
</div></body></html>`;
}
