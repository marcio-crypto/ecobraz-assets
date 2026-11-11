// Testes da origem do lead no Worker de coletas. Não tocam em portal, cofre
// nem E-goi: o cofre e o fetch são simulados.
//   node --test site-ghost/worker/origem-do-lead.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// O Worker é um módulo ES num pacote sem "type": "module"; copiar para .mjs
// permite importar em qualquer versão do Node usada no runner.
const fonte = await fs.readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const copia = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'coletas-')), 'index.mjs');
await fs.writeFile(copia, fonte);
const worker = (await import(copia)).default;

const ORIGEM = 'https://ecobraz.org';
const base = {
  profile: 'pessoa_fisica', name: 'TESTE', email: 'teste@example.com', phone: '11999999999',
  material_category: 'Eletrodomésticos', city: 'São Paulo', service_consent: 'yes',
};

async function envia(extra) {
  const gravados = [];
  const chamadas = [];
  const env = {
    ALLOWED_ORIGINS: ORIGEM,
    LEAD_INGEST_SECRET: 'segredo-de-teste',
    LEADS_COFRE: {put: async (chave, valor) => { gravados.push(JSON.parse(valor)); }},
  };
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (url, opcoes) => {
    chamadas.push({url: String(url), corpo: opcoes?.body ? JSON.parse(opcoes.body) : null});
    return new Response(JSON.stringify({ok: true, id: 'L-1'}), {status: 200, headers: {'content-type': 'application/json'}});
  };
  try {
    const resposta = await worker.fetch(new Request('https://coletas.example/api/coletas', {
      method: 'POST', headers: {'content-type': 'application/json', Origin: ORIGEM}, body: JSON.stringify({...base, ...extra}),
    }), env);
    const portal = chamadas.find((c) => c.url.includes('/api/lead'));
    return {status: resposta.status, cofre: gravados[0], portal: portal?.corpo};
  } finally { globalThis.fetch = fetchOriginal; }
}

test('busca orgânica: canal vai ao cofre; portal recebe origem derivada nos campos de UTM', async () => {
  const r = await envia({origin_channel: 'busca_organica', origin_referrer: 'google.com', landing_path: '/descarte-de-geladeira/'});
  assert.equal(r.status, 201);
  assert.equal(r.cofre.origin_channel, 'busca_organica');
  assert.equal(r.cofre.origin_referrer, 'google.com');
  assert.equal(r.cofre.landing_path, '/descarte-de-geladeira/');
  assert.equal(r.portal.utm_source, 'google.com');
  assert.equal(r.portal.utm_medium, 'organic');
  for (const campo of ['origin_channel', 'origin_referrer', 'landing_path']) assert.equal(campo in r.portal, false);
});

test('chat de IA e acesso direto', async () => {
  const ia = await envia({origin_channel: 'chat_ia', origin_referrer: 'chatgpt.com', landing_path: '/para-empresas/'});
  assert.deepEqual([ia.portal.utm_source, ia.portal.utm_medium], ['chatgpt.com', 'ai']);
  const direto = await envia({origin_channel: 'direto', origin_referrer: '', landing_path: '/'});
  assert.deepEqual([direto.portal.utm_source, direto.portal.utm_medium], ['(direct)', '(none)']);
});

test('UTM de campanha nunca é sobrescrita', async () => {
  const r = await envia({origin_channel: 'campanha', origin_referrer: 'linkedin.com', utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'ecobraz_pj_202611'});
  assert.deepEqual([r.portal.utm_source, r.portal.utm_medium, r.portal.utm_campaign], ['linkedin', 'social', 'ecobraz_pj_202611']);
  assert.equal(r.cofre.origin_channel, 'campanha');
});

test('valor inesperado vindo do navegador é descartado', async () => {
  const r = await envia({origin_channel: '<script>', origin_referrer: 'Evil.com/<b>?x=1', landing_path: 'javascript:alert(1)'});
  assert.equal(r.cofre.origin_channel, '');
  assert.equal(r.cofre.origin_referrer, 'evil.combx1');
  assert.equal(r.cofre.landing_path, '');
  assert.equal(r.portal.utm_source, '');
});

test('formulário antigo, sem os campos novos, continua aceito e o portal recebe o mesmo corpo de antes', async () => {
  const r = await envia({});
  assert.equal(r.status, 201);
  assert.equal(r.cofre.origin_channel, '');
  assert.deepEqual([r.portal.utm_source, r.portal.utm_medium], ['', '']);
  assert.equal('origin_channel' in r.portal, false);
});
