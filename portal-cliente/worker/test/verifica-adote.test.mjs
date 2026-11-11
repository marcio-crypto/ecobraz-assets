// Testes da verificação "compra pública do Adote" (src/verifica-adote.js).
// Dados 100% FICTÍCIOS — este repositório é público.
//
// Rodar na pasta portal-cliente/worker, depois de `npm install` (Node 22.13+):
//   node --test test/verifica-adote.test.mjs
//
// O banco é um SQLite de verdade (node:sqlite) atrás de uma casca com a mesma
// forma do D1, então as consultas rodam como na Cloudflare. O armazenamento (KV)
// é um mapa em memória. Os dois ANOTAM qualquer tentativa de gravação: o último
// teste exige que essa lista esteja vazia — a verificação só pode ler.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { varrerFichasAdote, analisarFichaAdote, LOTE_VARREDURA } from '../src/verifica-adote.js';

const escritas = []; // toda tentativa de gravar cai aqui

function novoKV(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    _m: m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async list({ prefix = '', limit = 1000, cursor } = {}) {
      const todas = [...m.keys()].filter((k) => k.startsWith(prefix)).sort();
      const ini = cursor ? Number(cursor) : 0;
      const fim = Math.min(todas.length, ini + limit);
      const completa = fim >= todas.length;
      return { keys: todas.slice(ini, fim).map((name) => ({ name })), list_complete: completa, ...(completa ? {} : { cursor: String(fim) }) };
    },
    async put(k) { escritas.push('KV.put ' + k); throw new Error('gravação proibida no teste'); },
    async delete(k) { escritas.push('KV.delete ' + k); throw new Error('gravação proibida no teste'); },
  };
}

function novoD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE contatos (ploomes_id INTEGER PRIMARY KEY, tipo TEXT, nome TEXT, nome_fantasia TEXT, documento TEXT, email TEXT, telefone TEXT, cidade TEXT, uf TEXT, endereco TEXT, company_id INTEGER, criado_em TEXT, importado_em TEXT, dados_json TEXT);
    CREATE TABLE negocios (ploomes_id INTEGER PRIMARY KEY, titulo TEXT, contact_id INTEGER, status_id INTEGER, amount REAL, criado_em TEXT, dados_json TEXT);
  `);
  const prepare = (sql) => {
    let args = [];
    const soLeitura = () => { if (!/^\s*SELECT\b/i.test(sql)) { escritas.push('D1 ' + sql.slice(0, 60)); throw new Error('gravação proibida no teste'); } };
    const st = {
      bind(...a) { args = a; return st; },
      async all() { soLeitura(); return { results: db.prepare(sql).all(...args) }; },
      async first() { soLeitura(); return db.prepare(sql).get(...args) ?? null; },
      async run() { soLeitura(); return { success: true }; },
    };
    return st;
  };
  return { _db: db, prepare, async batch(lista) { const out = []; for (const s of lista) out.push(await s.all()); return out; } };
}

const T_FICHA = '2026-10-01T15:00:00.000Z';
const ficha = (id, extra) => JSON.stringify({ id, tipo: 'PJ', origem: 'adote', criadoEm: T_FICHA, atualizadoEm: T_FICHA, endereco: {}, ...extra });
const linhaIndice = (id, doc) => ({ id, tipo: 'PJ', nome: 'x', doc, cidade: '', criadoEm: T_FICHA });

// Cenário: o estado que a rota ANTIGA deixava em cada situação.
function cenario() {
  const d1 = novoD1();
  const ins = d1._db.prepare('INSERT INTO contatos (ploomes_id,tipo,nome,documento,email,company_id,criado_em,dados_json) VALUES (?,?,?,?,?,?,?,?)');
  // A — cliente antigo; a compra pública sobrescreveu nome e e-mail da linha (dados_json guarda o original).
  ins.run(5001, 'PJ', 'Nome Digitado', '11222333000100', 'terceiro@ficticio.example', null, '2021-03-10T10:00:00.000-03:00', JSON.stringify({ Id: 5001, LegalName: 'AURORA FICTICIA LTDA', Email: 'financeiro@aurora-ficticia.example' }));
  ins.run(5002, 'PF', 'Contato Antigo', '', 'contato@aurora-ficticia.example', 5001, '2021-03-11T10:00:00.000-03:00', '{}');
  d1._db.prepare('INSERT INTO negocios (ploomes_id,titulo,contact_id,criado_em) VALUES (?,?,?,?)').run(7001, 'Coleta antiga', 5001, '2022-05-02T08:00:00.000-03:00');
  // C — cliente antigo com CNPJ PONTUADO: a rota antiga criava uma 2ª linha com o e-mail digitado.
  ins.run(5101, 'PJ', 'CEDRO FICTICIA SA', '22.333.444/0001-55', 'contato@cedro-ficticia.example', null, '2020-01-05T10:00:00.000-03:00', JSON.stringify({ Id: 5101, LegalName: 'CEDRO FICTICIA SA', Email: 'contato@cedro-ficticia.example' }));
  ins.run(900000001, 'PJ', 'Cedro Digitada', '22333444000155', 'outro@ficticio.example', null, '2026-10-01T15:00:00.050Z', null);
  // B — empresa nova de verdade: a linha nasce logo DEPOIS da ficha.
  ins.run(900000002, 'PJ', 'BETA NOVA FICTICIA', '44555666000177', 'compras@beta-ficticia.example', null, '2026-10-01T15:00:00.050Z', null);
  // E — cliente antigo que comprou com o e-mail que já era dele.
  ins.run(5201, 'PJ', 'Outra (digitado)', '33444555000166', 'adm@outra-ficticia.example', null, '2019-06-01T10:00:00.000-03:00', JSON.stringify({ Id: 5201, LegalName: 'OUTRA FICTICIA LTDA', Email: 'adm@outra-ficticia.example' }));

  const kv = novoKV({
    'cli:emp_a': ficha('emp_a', { razaoSocial: 'Nome Digitado', cnpj: '11222333000100', email: 'terceiro@ficticio.example', contatos: [{ nome: 'Contato Antigo', email: 'contato@aurora-ficticia.example' }] }),
    'cli:emp_c': ficha('emp_c', { razaoSocial: 'Cedro Digitada', cnpj: '22333444000155', email: 'outro@ficticio.example' }),
    'cli:emp_b': ficha('emp_b', { razaoSocial: 'BETA NOVA FICTICIA', cnpj: '44555666000177', email: 'compras@beta-ficticia.example' }),
    'cli:emp_e': ficha('emp_e', { razaoSocial: 'Outra (digitado)', cnpj: '33444555000166', email: 'adm@outra-ficticia.example' }),
    'cli:emp_comum': JSON.stringify({ id: 'emp_comum', tipo: 'PJ', razaoSocial: 'Cliente Comum', cnpj: '99888777000166', email: 'c@comum-ficticio.example', criadoEm: T_FICHA }),
    'cli:index': JSON.stringify([linhaIndice('emp_a', '11.222.333/0001-00'), linhaIndice('emp_c', '22.333.444/0001-55'), linhaIndice('emp_b', '44.555.666/0001-77'), linhaIndice('emp_e', '33.444.555/0001-66'), linhaIndice('emp_comum', '99.888.777/0001-66')]),
    'os:index': JSON.stringify([
      { id: 'os1', numero: 'OC-1', clienteDoc: '22.333.444/0001-55', criadoEm: '2026-09-01T12:00:00.000Z' }, // antes da ficha C
      { id: 'os2', numero: 'OC-2', clienteId: 'emp_b', clienteDoc: '44555666000177', criadoEm: '2026-10-05T12:00:00.000Z' }, // depois da ficha B
    ]),
    'credito:emp_b': JSON.stringify({ clienteId: 'emp_b', compradoKg: 1000, saldoKg: 1000, historico: [{ evento: 'compra' }] }),
    'cligest:11222333000100': JSON.stringify({ doc: '11222333000100', gestores: [{ email: 'gestor@ficticio.example', nome: 'Gestor', nivel: 'ver' }] }),
    'clirev:22333444000155:outro@ficticio.example': JSON.stringify({ email: 'outro@ficticio.example', em: '2026-11-11T12:00:00.000Z', por: 'equipe@teste.local', motivo: 'removido pela equipe' }),
  });
  // Faz o papel do reconhecimento do login: quem ele reconhece e como qual CNPJ.
  const logins = { 'terceiro@ficticio.example': '11222333000100', 'contato@aurora-ficticia.example': '11222333000100', 'compras@beta-ficticia.example': '44555666000177', 'adm@outra-ficticia.example': '33444555000166' };
  const reconhecerLogin = async (em) => (logins[em] ? { liberado: true, contactId: 1, documento: logins[em], nome: 'x', nivel: 'admin' } : null);
  return { env: { PORTAL_KV: kv, DB_PLOOMES: d1 }, reconhecerLogin };
}

test('varredura: lê o armazenamento em lotes, acha as fichas do Adote e aponta a ilegível', async () => {
  const dados = {};
  const total = LOTE_VARREDURA * 2 + 5;
  for (let i = 0; i < total; i++) { const id = 'emp_' + String(i).padStart(6, '0'); dados['cli:' + id] = JSON.stringify({ id, tipo: 'PJ', razaoSocial: 'Comum ' + i }); }
  dados['cli:emp_000003'] = ficha('emp_000003', { razaoSocial: 'Adote no começo', cnpj: '11222333000100', email: 'a@ficticio.example' });
  dados['cli:zz_fora_do_indice'] = ficha('zz_fora_do_indice', { razaoSocial: 'Adote fora do índice', cnpj: '22333444000155', email: 'b@ficticio.example' });
  dados['cli:emp_quebrada'] = '{isto não é json';
  dados['cli:index'] = JSON.stringify([{ id: 'emp_000003' }]);
  dados['climail:a@ficticio.example'] = 'emp_000003'; // não é ficha: não pode entrar na varredura
  const env = { PORTAL_KV: novoKV(dados) };

  let cursor = '', lidas = 0, voltas = 0; const achados = [], semLeitura = []; let totalIndice;
  do {
    const r = await varrerFichasAdote(env, cursor);
    assert.equal(r.ok, true);
    if (!voltas) totalIndice = r.totalIndice; else assert.equal(r.totalIndice, null);
    lidas += r.lidas; achados.push(...r.achados); semLeitura.push(...r.semLeitura);
    cursor = r.fim ? '' : r.proximo; voltas++;
  } while (cursor);

  assert.ok(voltas >= 3, 'tem de paginar');
  assert.equal(lidas, total + 1); // as comuns + a que está fora do índice (a quebrada não conta)
  assert.deepEqual(achados.map((a) => a.id).sort(), ['emp_000003', 'zz_fora_do_indice']);
  assert.deepEqual(semLeitura, ['emp_quebrada']);
  assert.equal(totalIndice, 1);
  assert.equal(achados[0].emailFormulario, 'a@ficticio.example');
});

test('varredura sem armazenamento: devolve erro, nunca "nenhuma ficha"', async () => {
  const r = await varrerFichasAdote({}, '');
  assert.equal(r.ok, false);
  assert.ok(r.erro);
});

test('cliente antigo sobrescrito pela compra pública → suspeita, e só o e-mail digitado é o alvo', async () => {
  const { env, reconhecerLogin } = cenario();
  const a = await analisarFichaAdote(env, 'emp_a', { reconhecerLogin });
  assert.equal(a.veredito, 'suspeita');
  assert.ok(a.motivos.length >= 2);
  assert.equal(a.base.linhas[0].emailMudou, true);
  assert.equal(a.base.linhas[0].nomeMudou, true);
  assert.equal(a.base.linhas[0].original.email, 'financeiro@aurora-ficticia.example');
  assert.equal(a.base.negocios.antes, 1);
  const [digitado, antigo] = a.emails;
  assert.deepEqual([digitado.origem, digitado.jaEraDoCliente, digitado.situacao], ['formulario', false, 'entra']);
  // contato que já era do cliente não é testado no login (não está em questão)
  assert.deepEqual([antigo.origem, antigo.jaEraDoCliente, antigo.situacao], ['contato', true, 'nao_testado']);
  assert.equal(a.gestores[0].email, 'gestor@ficticio.example');
  assert.equal(a.compra.paga, false);
});

test('CNPJ pontuado na base (2ª linha criada pela compra) → suspeita; acesso já removido aparece', async () => {
  const { env, reconhecerLogin } = cenario();
  const a = await analisarFichaAdote(env, 'emp_c', { reconhecerLogin });
  assert.equal(a.veredito, 'suspeita');
  assert.equal(a.base.linhas.length, 2);
  assert.equal(a.os.antes, 1);
  assert.equal(a.emails[0].situacao, 'removido');
  assert.equal(a.emails[0].removido.por, 'equipe@teste.local');
  assert.equal(a.removidos.length, 1);
});

test('empresa nova que comprou e pagou → sem histórico anterior', async () => {
  const { env, reconhecerLogin } = cenario();
  const a = await analisarFichaAdote(env, 'emp_b', { reconhecerLogin });
  assert.equal(a.veredito, 'sem_historico');
  assert.deepEqual(a.motivos, []);
  assert.equal(a.os.depois, 1);
  assert.equal(a.compra.paga, true);
  assert.equal(a.uso, null);
});

test('cliente antigo que comprou com o e-mail que já era dele → não é terceiro', async () => {
  const { env, reconhecerLogin } = cenario();
  const a = await analisarFichaAdote(env, 'emp_e', { reconhecerLogin });
  assert.equal(a.veredito, 'email_do_cliente');
  assert.equal(a.emails[0].jaEraDoCliente, true);
});

test('base fora do ar → não conferido (nunca "sem histórico" nem "não entra")', async () => {
  const { env } = cenario();
  env.DB_PLOOMES = { prepare() { throw new Error('D1 fora do ar'); }, async batch() { throw new Error('D1 fora do ar'); } };
  const a = await analisarFichaAdote(env, 'emp_b', { reconhecerLogin: async () => null });
  assert.equal(a.veredito, 'nao_conferido');
  assert.equal(a.base.conferida, false);
  assert.equal(a.emails[0].situacao, 'nao_conferido');
  assert.ok(a.duvidas.length);
});

test('ficha sem data ou sem CNPJ → não conferido', async () => {
  const { env, reconhecerLogin } = cenario();
  env.PORTAL_KV._m.set('cli:emp_semdata', JSON.stringify({ id: 'emp_semdata', tipo: 'PJ', origem: 'adote', razaoSocial: 'Sem data', cnpj: '', email: 'x@ficticio.example' }));
  const a = await analisarFichaAdote(env, 'emp_semdata', { reconhecerLogin });
  assert.equal(a.veredito, 'nao_conferido');
  assert.equal(a.duvidas.length, 2);
});

test('ficha que não é do Adote, inexistente ou id estranho → recusa', async () => {
  const { env } = cenario();
  assert.equal((await analisarFichaAdote(env, 'emp_comum', {})).ok, false);
  assert.equal((await analisarFichaAdote(env, 'nao_existe', {})).ok, false);
  assert.equal((await analisarFichaAdote(env, '../index', {})).ok, false);
  assert.equal((await analisarFichaAdote(env, '', {})).ok, false);
});

test('SÓ LEITURA: nenhum teste acima tentou gravar no armazenamento nem na base', () => {
  assert.deepEqual(escritas, []);
});
