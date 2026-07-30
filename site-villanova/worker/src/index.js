// Worker de contato da Villanova ESG (v2 — Lote 2 da reestruturação).
// Recebe o formulário nativo de /supplier-evidence-risk-intake/ e
// /solicitar-analise/ (POST multipart/FormData ou JSON) e entrega o lead por
// e-mail via Cloudflare Email Routing (binding send_email) — sem terceiros.
//
// Campos: nome, email, empresa, cargo, pais, tipo (o que a empresa recebeu),
// prazo, mensagem, idioma, lead_source (intake | magnet-*), anexo (arquivo
// opcional do pedido do comprador, até 8 MB).
// Anti-spam: honeypot _gotcha/botcheck. GET /health para diagnóstico.
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage, Mailbox } from 'mimetext';

const ORIGENS = new Set([
  'https://www.villanovaesg.com',
  'https://villanovaesg.com',
]);

const ANEXO_MAX = 8 * 1024 * 1024;
const ANEXO_TIPOS = new Set([
  'application/pdf', 'image/png', 'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const cors = (origin) => ({
  'Access-Control-Allow-Origin': ORIGENS.has(origin) ? origin : 'https://www.villanovaesg.com',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
});

const json = (obj, status, origin) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });

const escapar = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));
const campo = (v, max) => String(v || '').trim().slice(0, max);

export default {
  async fetch(request, env) {
    try {
      return await tratar(request, env);
    } catch (e) {
      // Nunca estoura 1101 para o usuário — devolve o erro de forma legível.
      return new Response(JSON.stringify({ ok: false, erro: 'excecao', detalhe: String(e && e.message || e).slice(0, 300) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors(request.headers.get('Origin') || '') },
      });
    }
  },
};

async function tratar(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      let leads = null;
      try { if (env.LEADS) leads = (await env.LEADS.list({ limit: 1000 })).keys.length; } catch (e) {}
      return json({ ok: true, service: 'villanova-contato', version: 3, leads_no_cofre: leads }, 200, origin);
    }
    if (request.method !== 'POST') return json({ ok: false, erro: 'metodo' }, 405, origin);

    // Aceita FormData (formulário nativo, com anexo) e JSON (compatibilidade).
    let dados = {};
    let anexo = null;
    const ct = request.headers.get('Content-Type') || '';
    try {
      if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
        const fd = await request.formData();
        for (const [k, v] of fd.entries()) {
          if (typeof v === 'string') dados[k] = v;
          else if (k === 'anexo' && v && v.size) anexo = v;
        }
      } else {
        dados = await request.json();
      }
    } catch { return json({ ok: false, erro: 'corpo' }, 400, origin); }

    // Honeypot: se preenchido, é bot — finge sucesso e descarta.
    if (dados._gotcha || dados.botcheck) return json({ ok: true }, 200, origin);

    const nome = campo(dados.nome, 120);
    const email = campo(dados.email, 160);
    const empresa = campo(dados.empresa, 160);
    const cargo = campo(dados.cargo, 120);
    const pais = campo(dados.pais, 80);
    const tipo = campo(dados.tipo, 160);
    const prazo = campo(dados.prazo, 120);
    const mensagem = campo(dados.mensagem, 4000);
    const idioma = campo(dados.idioma, 8) || 'pt';
    const leadSource = campo(dados.lead_source, 60) || 'intake';
    const ehMagnet = leadSource.startsWith('magnet');

    // Magnets pedem só nome+e-mail+empresa; o intake completo exige mensagem.
    if (!nome || !empresa || !emailValido(email) || (!ehMagnet && !mensagem)) {
      return json({ ok: false, erro: 'campos' }, 422, origin);
    }

    const de = env.FROM_EMAIL;
    const para = env.DEST_EMAIL;
    const msg = createMimeMessage();
    msg.setSender({ name: 'Villanova ESG — Site', addr: de });
    msg.setRecipient(para);
    msg.setSubject(ehMagnet
      ? `Download de material (${leadSource.replace('magnet-', '')}) — ${empresa}`
      : `Nova solicitação de análise — ${empresa}`);
    // Cabeçalhos de endereço no mimetext exigem Mailbox. Se ainda assim
    // falhar, seguimos sem Reply-To — o e-mail do lead já está no corpo.
    try { msg.setHeader('Reply-To', new Mailbox(email)); } catch (e) {}

    const linhas = [
      ['Origem', ehMagnet ? `Material gateado: ${leadSource}` : 'Formulário de solicitação'],
      ['Idioma da página', idioma],
      ['Nome', nome],
      ['E-mail', email],
      ['Empresa', empresa],
      ['Cargo', cargo],
      ['País', pais],
      ['O que recebeu', tipo],
      ['Prazo', prazo],
    ].filter(([, v]) => v);

    let html = `<h2>${ehMagnet ? 'Lead de material gateado' : 'Nova solicitação pelo site'}</h2>`;
    for (const [k, v] of linhas) html += `<p><strong>${k}:</strong> ${escapar(v)}</p>`;
    if (mensagem) html += `<p><strong>Mensagem:</strong><br>${escapar(mensagem).replace(/\n/g, '<br>')}</p>`;

    if (anexo) {
      if (anexo.size > ANEXO_MAX) return json({ ok: false, erro: 'anexo_grande' }, 422, origin);
      if (anexo.type && !ANEXO_TIPOS.has(anexo.type)) return json({ ok: false, erro: 'anexo_tipo' }, 422, origin);
      const buf = new Uint8Array(await anexo.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      msg.addAttachment({
        filename: campo(anexo.name, 180) || 'anexo',
        contentType: anexo.type || 'application/octet-stream',
        data: btoa(bin),
      });
      html += `<p><strong>Anexo:</strong> ${escapar(anexo.name)} (${Math.round(anexo.size / 1024)} KB)</p>`;
    }

    msg.addMessage({ contentType: 'text/html', data: html });

    // 1) Cofre primeiro: o lead é gravado no KV antes de qualquer envio.
    //    Se o KV falhar E o e-mail falhar, aí sim reportamos erro.
    let guardado = false;
    if (env.LEADS) {
      try {
        const chave = `lead:${new Date().toISOString()}:${crypto.randomUUID().slice(0, 8)}`;
        await env.LEADS.put(chave, JSON.stringify({
          lead_source: leadSource, idioma, nome, email, empresa, cargo, pais, tipo, prazo, mensagem,
          anexo: anexo ? { nome: anexo.name, kb: Math.round(anexo.size / 1024) } : null,
          quando: new Date().toISOString(),
        }));
        guardado = true;
      } catch (e) {}
    }

    // 2) Notificação por e-mail (Email Routing). Não-fatal se o lead já está no cofre.
    let emailOk = false;
    let emailErro = '';
    try {
      await env.SEB.send(new EmailMessage(de, para, msg.asRaw()));
      emailOk = true;
    } catch (e) {
      emailErro = String(e && e.message || e).slice(0, 300);
    }

    if (!guardado && !emailOk) {
      return json({ ok: false, erro: 'envio', detalhe: emailErro }, 502, origin);
    }
    return json({ ok: true, email: emailOk ? 'enviado' : 'pendente' }, 200, origin);
}
