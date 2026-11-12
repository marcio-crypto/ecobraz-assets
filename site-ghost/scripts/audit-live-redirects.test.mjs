// Testes da auditoria de redirecionamentos (sem rede externa).
// Rodar: node --test site-ghost/scripts/audit-live-redirects.test.mjs
//
// O que estes testes garantem:
// 1. erro de rede passageiro NÃO derruba a auditoria (tenta de novo e passa);
// 2. resposta com status errado continua sendo erro e NÃO é repetida;
// 3. erro de rede que persiste continua sendo erro.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-live-redirects.mjs');

function servidor() {
  const pedidos = {};
  const server = http.createServer((request, response) => {
    const caminho = request.url.split('?')[0];
    pedidos[caminho] = (pedidos[caminho] || 0) + 1;
    if (caminho === '/novo/') {
      response.writeHead(200, {'content-type': 'text/plain'});
      response.end('ok');
    } else if (caminho === '/velho-ok') {
      response.writeHead(301, {location: '/novo/'});
      response.end();
    } else if (caminho === '/velho-instavel') {
      // A primeira tentativa cai sem resposta (erro de rede); as seguintes respondem.
      if (pedidos[caminho] === 1) request.socket.destroy();
      else {
        response.writeHead(301, {location: '/novo/'});
        response.end();
      }
    } else if (caminho === '/velho-sempre-cai') {
      request.socket.destroy();
    } else if (caminho === '/velho-errado') {
      response.writeHead(302, {location: '/novo/'});
      response.end();
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({server, pedidos, base: `http://127.0.0.1:${server.address().port}`}));
  });
}

async function arquivoDeRegras(fontes) {
  const pasta = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-redirects-'));
  const arquivo = path.join(pasta, 'redirects.yaml');
  const linhas = fontes.map((fonte) => `  ${JSON.stringify(`^${fonte}/?$`)}: "/novo/"`);
  await fs.writeFile(arquivo, `301:\n${linhas.join('\n')}\n`, 'utf8');
  return arquivo;
}

function roda(base, arquivo, env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, base, arquivo, '10'],
      {env: {...process.env, AUDIT_REDIRECTS_ESPERA_MS: '10', ...env}},
      (error, stdout, stderr) => resolve({codigo: error ? error.code : 0, stdout, stderr}),
    );
  });
}

test('erro de rede passageiro: tenta de novo e passa', async () => {
  const {server, pedidos, base} = await servidor();
  try {
    const resultado = await roda(base, await arquivoDeRegras(['/velho-ok', '/velho-instavel']));
    assert.equal(resultado.codigo, 0, resultado.stderr);
    assert.match(resultado.stdout, /PASS \/velho-instavel -> \/novo\//);
    assert.match(resultado.stdout, /PASS \/velho-ok -> \/novo\//);
    assert.equal(pedidos['/velho-instavel'], 2);
  } finally {
    server.close();
  }
});

test('status errado continua sendo erro e não é repetido', async () => {
  const {server, pedidos, base} = await servidor();
  try {
    const resultado = await roda(base, await arquivoDeRegras(['/velho-errado']));
    assert.equal(resultado.codigo, 1);
    assert.match(resultado.stderr, /\/velho-errado: expected 301, received 302/);
    assert.equal(pedidos['/velho-errado'], 1);
  } finally {
    server.close();
  }
});

test('erro de rede que persiste continua sendo erro', async () => {
  const {server, pedidos, base} = await servidor();
  try {
    const resultado = await roda(base, await arquivoDeRegras(['/velho-sempre-cai']));
    assert.equal(resultado.codigo, 1);
    assert.match(resultado.stderr, /\/velho-sempre-cai: .*erro de rede em 3 tentativa/);
    assert.equal(pedidos['/velho-sempre-cai'], 3);
  } finally {
    server.close();
  }
});
