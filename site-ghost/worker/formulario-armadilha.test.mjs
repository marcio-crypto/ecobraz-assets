// Testes da armadilha anti-spam e do tempo mínimo do formulário de coleta.
// Não tocam em portal, cofre nem E-goi: o cofre e o fetch são simulados.
//   node --test site-ghost/worker/formulario-armadilha.test.mjs
//
// Regra (decisão do Marcio, 18/11/2026): envio com a armadilha preenchida ou
// rápido demais é RECUSADO com erro visível (422 blocked_form) e não grava nada.
// Antes o Worker respondia 202 "ok" e descartava em silêncio.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const fonte = await fs.readFile(new URL('./src/index.js', import.meta.url), 'utf8');
const copia = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'coletas-armadilha-')), 'index.mjs');
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
    let corpo = null;
    try { corpo = await resposta.json(); } catch {}
    return {status: resposta.status, corpo, gravados: gravados.length, chamadas: chamadas.length, cofre: gravados[0]};
  } finally { globalThis.fetch = fetchOriginal; }
}

test('armadilha nova preenchida: recusa visível e nada é gravado', async () => {
  const r = await envia({ecb_nao_preencher: 'https://exemplo.com', form_elapsed_ms: '20000'});
  assert.equal(r.status, 422);
  assert.equal(r.corpo.error, 'blocked_form');
  assert.equal(r.corpo.ok, false);
  assert.equal(r.gravados, 0);
  assert.equal(r.chamadas, 0);
});

test('armadilha antiga (página em cache) preenchida: mesma recusa, sem o falso "ok"', async () => {
  const r = await envia({website: 'https://exemplo.com'});
  assert.equal(r.status, 422);
  assert.equal(r.corpo.error, 'blocked_form');
  assert.equal(r.gravados, 0);
  assert.equal(r.chamadas, 0);
});

test('envio em menos de 3 segundos: recusa visível e nada é gravado', async () => {
  for (const tempo of ['0', '450', '2999', 2999]) {
    const r = await envia({form_elapsed_ms: tempo});
    assert.equal(r.status, 422, `tempo ${tempo}`);
    assert.equal(r.corpo.error, 'blocked_form');
    assert.equal(r.gravados, 0);
  }
});

test('envio normal (tempo de sobra, armadilha vazia) passa e grava no cofre', async () => {
  const r = await envia({ecb_nao_preencher: '', form_elapsed_ms: '45000'});
  assert.equal(r.status, 201);
  assert.equal(r.gravados, 1);
  // Os campos de controle não viajam para o cofre.
  assert.equal('ecb_nao_preencher' in r.cofre, false);
  assert.equal('form_elapsed_ms' in r.cofre, false);
});

test('página em cache que não manda o tempo continua aceita', async () => {
  const r = await envia({});
  assert.equal(r.status, 201);
  assert.equal(r.gravados, 1);
});

test('tempo ilegível não derruba pedido real; no limite de 3 s passa', async () => {
  const lixo = await envia({form_elapsed_ms: 'abc'});
  assert.equal(lixo.status, 201);
  const limite = await envia({form_elapsed_ms: '3000'});
  assert.equal(limite.status, 201);
});

test('campo obrigatório faltando continua devolvendo a lista de campos (não vira bloqueio)', async () => {
  const r = await envia({email: '', ecb_nao_preencher: 'x'});
  assert.equal(r.status, 422);
  assert.equal(r.corpo.error, 'validation_failed');
  assert.ok(r.corpo.fields.includes('email'));
});
