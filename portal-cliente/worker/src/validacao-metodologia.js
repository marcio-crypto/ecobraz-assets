// Selo de validação da metodologia (ideia do Marcio: mesmo esquema do QR do CDF, agora para provar que a
// VILLANOVA validou). Quando a Villanova valida (logada), o sistema:
//   1) grava um REGISTRO imutável (quem/quando/versão/comentário) + a "impressão digital" (hash) do conteúdo;
//   2) o selo público (/validar-metodologia) confirma "validado por Villanova ESG em DD/MM, versão X" e,
//      se a metodologia mudar depois, avisa "conteúdo alterado após a validação" (o hash deixa de bater).
// O que dá credibilidade: (a) ação AUTENTICADA da Villanova (login), (b) registro versionado, (c) selo
// assinado + hash (inviolável). Público vê SÓ a confirmação — nunca a receita.

import qrcode from 'qrcode-generator';
import { METODOLOGIA, hashConteudo, lerFatoresHomologados } from './carbono-metodologia.js';

const TE = new TextEncoder();
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function base64ParaBytes(b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function agoraISO() { try { return new Date().toISOString(); } catch { return ''; } }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function dataBR(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', TE.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, TE.encode(data));
  return b64url(new Uint8Array(sig));
}
async function seloCodigo(versao, hash, env) {
  const base = env.PORTAL_SESSION_SECRET || env.PLOOMES_WEBHOOK_SECRET || 'ecobraz-metodo';
  return (await hmac(`${base}|metodo-selo-v1`, `${versao}:${hash}`)).slice(0, 12);
}
function origemPortal(env, url) { return String(env.PORTAL_URL || `${url.origin}/`).replace(/\/+$/, ''); }

// ---- Registro de validação (KV) ----
// Espelho de AUDITORIA no D1: cópia imutável do registro de validação. O KV é a
// fonte operacional; o banco guarda a trilha permanente (consultável em SQL,
// sem TTL). Grava 1× por hash — nas leituras seguintes o marcador pula tudo.
async function espelharValidacaoD1(env, rec) {
  try {
    if (!env.DB_PLOOMES || !rec || !rec.hash) return;
    if (env.PORTAL_KV) {
      const marca = `carbono:validacao:espelho:${rec.hash}`;
      if (await env.PORTAL_KV.get(marca)) return;
      await env.PORTAL_KV.put(marca, '1', { expirationTtl: 60 * 60 * 24 * 365 });
    }
    await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
    await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
      .bind('metodologia-validacao', agoraISO(), JSON.stringify(rec)).run();
  } catch { /* espelho é best-effort; a validação em si nunca depende dele */ }
}
export async function lerValidacao(env) {
  if (!env.PORTAL_KV) return null;
  const raw = await env.PORTAL_KV.get('carbono:validacao');
  const rec = raw ? JSON.parse(raw) : null;
  if (rec) await espelharValidacaoD1(env, rec);
  return rec;
}
async function lerValidacaoPorHash(env, hash) {
  if (!env.PORTAL_KV) return null;
  const raw = await env.PORTAL_KV.get(`carbono:validacao:${hash}`);
  return raw ? JSON.parse(raw) : null;
}
export async function registrarValidacao(env, { validadorEmail, comentario }) {
  const hash = await hashConteudo();
  const rec = {
    versao: METODOLOGIA.versao,
    hash,
    validadoPor: 'Villanova ESG',
    validadorEmail: validadorEmail || '',
    em: agoraISO(),
    comentario: String(comentario || '').slice(0, 300),
  };
  if (env.PORTAL_KV) {
    await env.PORTAL_KV.put(`carbono:validacao:${hash}`, JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 365 * 5 });
    await env.PORTAL_KV.put('carbono:validacao', JSON.stringify(rec), { expirationTtl: 60 * 60 * 24 * 365 * 5 });
  }
  await espelharValidacaoD1(env, rec);
  return rec;
}

// ---- Tela da Villanova (logada) ----
export async function paginaAreaValidacao(env, validador, url) {
  const m = METODOLOGIA;
  const rec = await lerValidacao(env);
  const jaValidada = !!(rec && rec.versao === m.versao);
  const hashAtual = await hashConteudo();
  const seloUrl = jaValidada ? `${origemPortal(env, url)}/validar-metodologia?v=${encodeURIComponent(rec.versao)}&h=${rec.hash}&c=${await seloCodigo(rec.versao, rec.hash, env)}` : '';
  // Homologação fator a fator: a RT digita o valor EXATO da fonte citada (na
  // unidade indicada) e assina. Cada assinatura fica registrada (quem/quando) e
  // espelhada no D1 — trilha imutável. Só libera depois de a versão ser validada.
  const homolog = await lerFatoresHomologados(env);
  const itensFat = [
    ...m.fatores.map((f) => ({ id: f.id, material: f.material, unidade: f.unidade, fonte: `${f.fonte}${f.versaoFonte ? ` (${f.versaoFonte})` : ''}`, nota: f.nota || '' })),
    { id: 'compensacaoAdote', material: 'Compensação — Adote um Bairro (por coleta de ~25 kg)', unidade: m.compensacaoAdote.unidade, fonte: m.compensacaoAdote.fonte, nota: 'É o fator que acende o termômetro de neutralidade dos clientes.' },
  ];
  const tdF = 'padding:10px 10px;border-top:1px solid #EDF1F0;vertical-align:top;';
  const fatores = itensFat.map((f) => {
    const h = homolog[f.id];
    const tem = !!(h && h.valor != null);
    return `<tr>
      <td style="${tdF}font-size:13px;font-weight:600;color:#10262B;">${esc(f.material)}<div style="font-size:11px;font-weight:400;color:#8fa39f;margin-top:2px;">${esc(f.fonte)}${f.nota ? ` · ${esc(f.nota)}` : ''}</div></td>
      <td style="${tdF}font-size:12px;color:#5B6570;white-space:nowrap;">${esc(f.unidade)}</td>
      <td style="${tdF}"><input id="fat_${esc(f.id)}" value="${tem ? esc(String(h.valor)) : ''}" inputmode="decimal" placeholder="—" ${jaValidada ? '' : 'disabled'} style="width:110px;border:1px solid #DDE1E6;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;${jaValidada ? '' : 'background:#F4F6F5;'}"></td>
      <td style="${tdF}font-size:11.5px;white-space:nowrap;">${tem ? `<span style="color:#1E7A3D;font-weight:800;">✓ homologado</span><div style="color:#8fa39f;">${esc(String(h.em || '').slice(0, 10).split('-').reverse().join('/'))}</div>` : '<span style="color:#8A6A16;font-weight:700;">a homologar</span>'}</td>
      <td style="${tdF}text-align:right;"><button onclick="homologar('${esc(f.id)}')" ${jaValidada ? '' : 'disabled'} style="background:${jaValidada ? '#00333B' : '#cfd8d6'};color:#fff;border:none;border-radius:8px;padding:9px 14px;font-size:12px;font-weight:800;cursor:${jaValidada ? 'pointer' : 'default'};white-space:nowrap;">${tem ? 'Reassinar' : 'Assinar'}</button></td>
    </tr>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação de Metodologia — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="max-width:760px;margin:0 auto;padding:26px 18px 60px;">
  <div style="background:#00333B;border-radius:16px;padding:24px 28px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
    <div><span style="color:#fff;font-size:19px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:7px;">emigre</span>
      <div style="color:#9FC6C1;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-top:8px;">Área de validação — Villanova ESG</div></div>
    <form method="post" action="/api/validacao/sair"><button style="background:#0e4651;color:#cfe3e0;border:1px solid #1c5b66;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;">Sair</button></form>
  </div>

  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:22px 24px;margin-top:16px;">
    <div style="font-size:13px;color:#5B6570;">Logado como <strong style="color:#10262B;">${esc(validador.email)}</strong></div>
    <h1 style="margin:8px 0 6px;font-size:22px;color:#00333B;letter-spacing:-.02em;">Metodologia de Carbono — versão ${esc(m.versao)}</h1>
    <p style="margin:0 0 16px;font-size:13.5px;color:#4F6469;line-height:1.6;">Revise a metodologia completa em <a href="/metodologia" style="color:#00333B;font-weight:700;">/metodologia</a>. Ao validar, sua aprovação fica <strong>registrada</strong> (com data e versão) e gera um <strong>selo público com QR</strong> que comprova a validação — inclusive detectando se a metodologia for alterada depois.</p>

    <div style="font-size:14px;font-weight:800;color:#00333B;margin:4px 0 6px;">Fatores de emissão — homologação individual</div>
    <div style="font-size:12.5px;color:#4F6469;line-height:1.6;margin-bottom:10px;">Digite o valor <strong>exatamente como consta na fonte citada</strong>, já convertido para a unidade indicada (aceita vírgula decimal), e clique em <strong>Assinar</strong>. Cada homologação fica registrada no seu nome, com data, e espelhada na trilha de auditoria. <strong>Só fator homologado acende número</strong> nos painéis dos clientes.${jaValidada ? '' : ' <strong style="color:#8A6A16;">Valide a versão (abaixo) para liberar os campos.</strong>'}</div>
    <div style="overflow-x:auto;"><table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:6px;min-width:640px;">
      <thead><tr>
        <th style="text-align:left;padding:8px 10px;font-size:10.5px;color:#7c8a87;text-transform:uppercase;letter-spacing:.05em;">Fator / fonte</th>
        <th style="text-align:left;padding:8px 10px;font-size:10.5px;color:#7c8a87;text-transform:uppercase;letter-spacing:.05em;">Unidade</th>
        <th style="text-align:left;padding:8px 10px;font-size:10.5px;color:#7c8a87;text-transform:uppercase;letter-spacing:.05em;">Valor</th>
        <th style="text-align:left;padding:8px 10px;font-size:10.5px;color:#7c8a87;text-transform:uppercase;letter-spacing:.05em;">Status</th>
        <th></th>
      </tr></thead>
      <tbody>${fatores}</tbody>
    </table></div>
  </div>

  ${jaValidada ? `<div style="background:#E4F3E6;border:1px solid #B7E0BE;border-radius:14px;padding:20px 24px;margin-top:16px;">
      <div style="font-size:15px;font-weight:800;color:#1E5B31;">✓ Você já validou esta versão</div>
      <div style="font-size:13px;color:#3f6b4c;margin-top:6px;line-height:1.6;">Validada em <strong>${esc(dataBR(rec.em))}</strong>${rec.comentario ? ` — “${esc(rec.comentario)}”` : ''}.</div>
      <div style="font-size:12px;color:#4F6469;margin-top:12px;">Selo público: <a href="${esc(seloUrl)}" style="color:#00333B;font-weight:700;word-break:break-all;">${esc(seloUrl)}</a></div>
    </div>` : `<form method="post" action="/api/validacao/validar" style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:22px 24px;margin-top:16px;">
      <div style="font-size:15px;font-weight:800;color:#00333B;margin-bottom:12px;">Validar esta versão</div>
      <label style="display:block;font-size:12px;color:#5B6570;font-weight:700;margin-bottom:6px;">Comentário / parecer (opcional)</label>
      <textarea name="comentario" rows="3" maxlength="300" placeholder="Ex.: metodologia aderente ao GHG Protocol; fatores conforme fontes citadas." style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:9px;padding:10px 12px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
      <label style="display:flex;align-items:flex-start;gap:9px;margin:14px 0 16px;font-size:12.5px;color:#4F6469;line-height:1.5;cursor:pointer;">
        <input type="checkbox" name="declaro" required style="margin-top:2px;"> Declaro que revisei esta metodologia (versão ${esc(m.versao)}) e a valido em nome da Villanova ESG.</label>
      <button type="submit" style="background:#92C430;color:#10262B;border:none;border-radius:10px;padding:13px 26px;font-size:14px;font-weight:800;cursor:pointer;">Validar versão ${esc(m.versao)}</button>
    </form>`}

  <div style="margin-top:22px;font-size:11px;color:#9fb0ac;line-height:1.6;">Impressão digital da versão atual: <code style="color:#5B6570;">${esc(hashAtual)}</code> · A validação é registrada de forma imutável e versionada.</div>
</div>
<script>
function homologar(id){
  var inp=document.getElementById('fat_'+id);
  var v=(inp&&inp.value?inp.value:'').trim();
  if(!v){alert('Digite o valor do fator (conforme a fonte) antes de assinar.');return;}
  if(!confirm('Homologar este fator com o valor '+v+'?\\n\\nA assinatura fica registrada no seu nome, com data, na trilha de auditoria.'))return;
  fetch('/api/validacao/fator',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,valor:v})})
    .then(function(r){return r.json();})
    .then(function(j){if(j.ok){location.reload();}else{alert(j.error||'Não foi possível homologar.');}})
    .catch(function(){alert('Sem conexão. Tente de novo.');});
}
</script>
</body></html>`;
}

// ---- Ação: homologar um fator (só validador logado; versão precisa estar assinada) ----
export async function homologarFatorAcao(request, env, validador) {
  const rj = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  let b; try { b = await request.json(); } catch { b = {}; }
  const id = String((b && b.id) || '').slice(0, 40);
  const meta = id === 'compensacaoAdote' ? METODOLOGIA.compensacaoAdote : METODOLOGIA.fatores.find((f) => f.id === id);
  if (!meta) return rj({ ok: false, error: 'Fator desconhecido.' }, 400);
  const rec0 = await lerValidacao(env);
  if (!rec0 || rec0.versao !== METODOLOGIA.versao) return rj({ ok: false, error: 'Valide a versão da metodologia antes de homologar fatores.' }, 409);
  let sv = String((b && b.valor) ?? '').trim();
  if (sv.includes(',')) sv = sv.replace(/\./g, '').replace(',', '.'); // "1.234,56" → "1234.56"
  const valor = Number(sv);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 1e6) return rj({ ok: false, error: 'Valor inválido — use número positivo (aceita vírgula decimal).' }, 400);
  if (!env.PORTAL_KV) return rj({ ok: false, error: 'Armazenamento indisponível.' }, 500);
  const mapa = await lerFatoresHomologados(env);
  mapa[id] = {
    valor,
    unidade: meta.unidade || '',
    fonte: meta.fonte || '',
    por: (validador && validador.email) || '',
    em: agoraISO(),
    versaoMetodologia: METODOLOGIA.versao,
    hashMetodologia: await hashConteudo(),
  };
  await env.PORTAL_KV.put('carbono:fatores:homologados', JSON.stringify(mapa));
  // Trilha imutável no D1: cada homologação vira um registro próprio (auditoria).
  try {
    if (env.DB_PLOOMES) {
      await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
      await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
        .bind('fator-homologacao', agoraISO(), JSON.stringify({ id, ...mapa[id] })).run();
    }
  } catch { /* trilha é best-effort; a homologação em si já está no KV */ }
  return rj({ ok: true, id, valor });
}

// ---- QR do selo (imagem) ----
export async function qrMetodologia(request, env, url) {
  const rec = await lerValidacao(env);
  if (!rec) return new Response('metodologia ainda não validada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const alvo = `${origemPortal(env, url)}/validar-metodologia?v=${encodeURIComponent(rec.versao)}&h=${rec.hash}&c=${await seloCodigo(rec.versao, rec.hash, env)}`;
  if ((url.searchParams.get('fmt') || 'gif') === 'txt') return new Response(alvo, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const qr = qrcode(0, 'M'); qr.addData(alvo); qr.make();
  const b64 = (qr.createDataURL(6, 4).split(',')[1]) || '';
  return new Response(base64ParaBytes(b64), { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=3600' } });
}

// ---- Página pública do selo ----
export async function validarMetodologiaPublico(request, env, url) {
  const v = (url.searchParams.get('v') || '').slice(0, 40);
  const h = (url.searchParams.get('h') || '').replace(/[^a-f0-9]/gi, '').slice(0, 64);
  const c = (url.searchParams.get('c') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  const okSelo = v && h && c && c === await seloCodigo(v, h, env);
  let rec = okSelo ? await lerValidacaoPorHash(env, h) : null;
  const hashAtual = await hashConteudo();
  const alterada = okSelo && h !== hashAtual; // conteúdo mudou desde esta validação
  const autentico = okSelo && !!rec;
  const cor = autentico && !alterada ? '#1E7A3D' : (autentico && alterada ? '#8A6A16' : '#B23A2E');
  const selo = autentico && !alterada ? '✓' : (autentico && alterada ? '!' : '✕');
  let titulo, sub, extra = '';
  if (!okSelo) { titulo = 'Selo inválido'; sub = 'Não foi possível verificar este selo. Escaneie o QR diretamente do documento original.'; }
  else if (!rec) { titulo = 'Validação não encontrada'; sub = 'A assinatura confere, mas não há registro dessa validação.'; }
  else if (alterada) { titulo = 'Metodologia alterada após a validação'; sub = `Esta versão (${esc(v)}) foi validada, mas o conteúdo mudou desde então — requer nova validação.`; }
  else {
    titulo = 'Metodologia validada'; sub = `Validada por <strong>${esc(rec.validadoPor)}</strong> e registrada nos sistemas da Ecobraz.`;
    extra = `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;">
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Validado por</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:800;color:#10262B;">${esc(rec.validadoPor)}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Data</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#10262B;">${esc(dataBR(rec.em))}</td></tr>
      <tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Versão</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:700;color:#10262B;">${esc(rec.versao)}</td></tr>
      ${rec.comentario ? `<tr><td style="padding:9px 0;border-top:1px solid #E4EBE9;color:#6B7B78;font-size:13px;">Parecer</td><td style="padding:9px 0;border-top:1px solid #E4EBE9;text-align:right;font-weight:600;color:#4F6469;">${esc(rec.comentario)}</td></tr>` : ''}</table>`;
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação de Metodologia — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="max-width:520px;margin:0 auto;padding:28px 18px;">
  <div style="background:#00333B;border-radius:16px 16px 0 0;padding:22px 26px;"><span style="color:#fff;font-size:20px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">emigre</span>
    <div style="color:#9FC6C1;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:10px;">Selo de metodologia</div></div>
  <div style="background:#fff;border-radius:0 0 16px 16px;border:1px solid #E4EBE9;border-top:none;padding:30px 26px 34px;box-shadow:0 18px 50px rgba(0,51,59,.08);">
    <div style="width:74px;height:74px;border-radius:50%;background:${cor};color:#fff;font-size:40px;line-height:74px;text-align:center;margin:0 auto 18px;font-weight:700;">${selo}</div>
    <h1 style="margin:0 0 10px;text-align:center;font-size:21px;color:${cor};">${esc(titulo)}</h1>
    <p style="margin:0;text-align:center;font-size:14px;line-height:1.6;color:#4F6469;">${sub}</p>
    ${extra}
    <p style="margin:26px 0 0;text-align:center;font-size:11.5px;color:#9fb0ac;line-height:1.6;">Verificação de autenticidade — Ecobraz. Dúvidas: <strong style="color:#4F6469;">acesso@ecobraz.org.br</strong>.</p>
  </div>
</div></body></html>`;
  return new Response(html, { status: autentico ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
