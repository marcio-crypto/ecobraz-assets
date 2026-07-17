// Worker de contato da Villanova ESG.
// Recebe o formulário nativo (POST JSON) e envia o lead por e-mail via
// Cloudflare Email Routing (binding send_email) — sem serviço de terceiros.
// Campos: nome, email (profissional), empresa, mensagem. Anti-spam: honeypot.
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

const ORIGENS = new Set([
  'https://www.villanovaesg.com',
  'https://villanovaesg.com',
]);

const cors = (origin) => ({
  'Access-Control-Allow-Origin': ORIGENS.has(origin) ? origin : 'https://www.villanovaesg.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return json({ ok: false, erro: 'método' }, 405, origin);

    let dados;
    try { dados = await request.json(); } catch { return json({ ok: false, erro: 'json' }, 400, origin); }

    // Honeypot: se preenchido, é bot — finge sucesso e descarta.
    if (dados._gotcha) return json({ ok: true }, 200, origin);

    const nome = String(dados.nome || '').trim().slice(0, 120);
    const email = String(dados.email || '').trim().slice(0, 160);
    const empresa = String(dados.empresa || '').trim().slice(0, 160);
    const mensagem = String(dados.mensagem || '').trim().slice(0, 4000);

    if (!nome || !empresa || !mensagem || !emailValido(email)) {
      return json({ ok: false, erro: 'campos' }, 422, origin);
    }

    const de = env.FROM_EMAIL;          // ex.: contato@villanovaesg.com (zona com Email Routing)
    const para = env.DEST_EMAIL;        // e-mail verificado que recebe os leads
    const msg = createMimeMessage();
    msg.setSender({ name: 'Villanova ESG — Site', addr: de });
    msg.setRecipient(para);
    msg.setSubject(`Nova solicitação de análise — ${empresa}`);
    msg.setHeader('Reply-To', `${nome} <${email}>`);
    msg.addMessage({
      contentType: 'text/html',
      data:
        `<h2>Nova solicitação pelo site</h2>` +
        `<p><strong>Nome:</strong> ${escapar(nome)}</p>` +
        `<p><strong>E-mail:</strong> ${escapar(email)}</p>` +
        `<p><strong>Empresa:</strong> ${escapar(empresa)}</p>` +
        `<p><strong>Mensagem:</strong><br>${escapar(mensagem).replace(/\n/g, '<br>')}</p>`,
    });

    try {
      await env.SEB.send(new EmailMessage(de, para, msg.asRaw()));
    } catch (e) {
      return json({ ok: false, erro: 'envio' }, 502, origin);
    }
    return json({ ok: true }, 200, origin);
  },
};
