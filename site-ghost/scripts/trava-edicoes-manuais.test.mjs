// Testes da trava de edições manuais. Rodam no deploy, antes da trava:
//   node --test site-ghost/scripts/trava-edicoes-manuais.test.mjs
// Não tocam no Ghost nem no GitHub: as respostas das APIs são simuladas.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {MARCA, PASSO_DE_ESCRITA, TOLERANCIA_MS, WORKFLOW, arquivosSincronizados, editadasDepois, escritaDaExecucao, executa} from './trava-edicoes-manuais.mjs';

const workflowReal = await fs.readFile(new URL('../../.github/workflows/deploy-ghost.yml', import.meta.url), 'utf8');
const NOME_DA_TRAVA = 'Trava — edições manuais no Ghost ainda não levadas ao repositório';
// Passos que usam a chave do Ghost e não escrevem páginas nem posts.
const NAO_ESCREVEM = [NOME_DA_TRAVA, 'Install and verify backlink redirects'];

const passo = (name, conclusion, inicio, fim) => ({name, conclusion, started_at: inicio, completed_at: fim});
const execucaoQueEscreveu = (fim) => [{steps: [
  passo('Audit content, links and collection form', 'success', '2026-11-10T20:57:58Z', '2026-11-10T20:57:58Z'),
  passo(NOME_DA_TRAVA, 'success', '2026-11-10T20:57:58Z', '2026-11-10T20:57:59Z'),
  passo('Upload theme to Ghost staging', 'success', '2026-11-10T20:57:59Z', '2026-11-10T20:58:01Z'),
  passo('Sync material landing pages', 'success', '2026-11-10T20:58:06Z', '2026-11-10T20:58:18Z'),
  passo('Remove duplicate and starter content from indexing', 'success', '2026-11-10T21:02:38Z', fim),
  passo('Audit live site (pages, links, SEO wiring)', 'success', '2026-11-10T21:02:58Z', '2026-11-10T21:04:01Z')
]}];
const execucaoBarrada = (fim) => [{steps: [
  passo(NOME_DA_TRAVA, 'failure', fim, fim),
  passo('Upload theme to Ghost staging', 'skipped', fim, fim),
  passo('Sync material landing pages', 'skipped', fim, fim)
]}];

const WORKFLOW_DE_TESTE = `
      - name: Sync material landing pages
        run: node site-ghost/scripts/sync-pages.mjs site-ghost/content/a.json
      - name: Sync English pages
        run: node site-ghost/scripts/sync-pages.mjs site-ghost/content/opcional.json
      - name: Sync priority authority articles
        run: node site-ghost/scripts/sync-posts.mjs site-ghost/content/p.json
      - name: Gera e aplica capas ilustradas nos posts
        run: node site-ghost/scripts/sync-post-covers.mjs site-ghost/content/p.json
`;

function ambiente({execucoes, jobs, paginas = [], posts = [], extra = {}}) {
  const chamadas = [];
  const fetchImpl = async (url) => {
    chamadas.push(url);
    const ok = (corpo) => ({ok: true, status: 200, json: async () => corpo});
    if (url.includes('/actions/workflows/deploy-ghost.yml/runs')) return ok({workflow_runs: execucoes});
    const m = url.match(/\/actions\/runs\/(\d+)\/jobs/);
    if (m) return ok({jobs: jobs[m[1]] || []});
    if (url.includes('/ghost/api/admin/pages/')) return ok({pages: paginas, meta: {pagination: {pages: 1}}});
    if (url.includes('/ghost/api/admin/posts/')) return ok({posts, meta: {pagination: {pages: 1}}});
    return {ok: false, status: 404, json: async () => ({})};
  };
  const lerArquivo = async (caminho) => {
    if (caminho === WORKFLOW) return WORKFLOW_DE_TESTE;
    if (caminho.endsWith('a.json')) return JSON.stringify([{slug: 'pagina-gerida'}, {slug: 'outra-gerida'}]);
    if (caminho.endsWith('p.json')) return JSON.stringify([{slug: 'post-gerido'}]);
    throw Object.assign(new Error('não existe'), {code: 'ENOENT'});
  };
  const env = {
    GHOST_ADMIN_URL: 'https://exemplo.ghost.io', GHOST_ADMIN_API_KEY: 'abc:00ff', GITHUB_TOKEN: 't', GITHUB_REPOSITORY: 'dono/repo',
    GITHUB_RUN_ID: '999', GITHUB_RUN_ATTEMPT: '1', ...extra
  };
  return {env, fetchImpl, lerArquivo, chamadas};
}
const item = (slug, updated_at, status = 'published') => ({id: slug, slug, title: `Título de ${slug}`, updated_at, url: `https://ecobraz.org/${slug}/`, status});

test('lê do workflow real os arquivos que o pipeline regrava', () => {
  const arquivos = arquivosSincronizados(workflowReal);
  assert.ok(arquivos.pages.includes('site-ghost/content/search-intent-pages.json'));
  assert.ok(arquivos.pages.includes('site-ghost/content/commercial-pages.json'));
  assert.ok(arquivos.posts.includes('site-ghost/content/priority-posts.json'));
  assert.ok(arquivos.pages.length >= 10 && arquivos.posts.length >= 3);
  assert.ok(![...arquivos.pages, ...arquivos.posts].some((a) => a.includes('covers')));
});

test('todo passo do workflow real que usa a chave do Ghost está classificado', () => {
  const blocos = workflowReal.split(/\n {6}- name: /).slice(1);
  const comChave = blocos.filter((b) => b.includes('GHOST_ADMIN_API_KEY')).map((b) => b.split('\n')[0].trim());
  assert.ok(comChave.length >= 15);
  const semClasse = comChave.filter((nome) => !PASSO_DE_ESCRITA.test(nome) && !NAO_ESCREVEM.includes(nome));
  assert.deepEqual(semClasse, [], 'passo novo com a chave do Ghost: inclua em PASSO_DE_ESCRITA ou em NAO_ESCREVEM');
  assert.ok(!PASSO_DE_ESCRITA.test(NOME_DA_TRAVA));
});

test('a trava roda antes do primeiro passo que escreve no Ghost', () => {
  const nomes = workflowReal.split(/\n {6}- name: /).slice(1).map((b) => b.split('\n')[0].trim());
  const trava = nomes.indexOf(NOME_DA_TRAVA);
  const primeiraEscrita = nomes.findIndex((n) => PASSO_DE_ESCRITA.test(n));
  assert.ok(trava >= 0, 'o passo da trava sumiu do workflow');
  assert.ok(trava < primeiraEscrita, 'a trava precisa vir antes de qualquer escrita');
});

test('execução que escreveu devolve o fim do último passo de escrita; a barrada devolve null', () => {
  assert.equal(escritaDaExecucao(execucaoQueEscreveu('2026-11-10T21:02:40Z')).toISOString(), '2026-11-10T21:02:40.000Z');
  assert.equal(escritaDaExecucao(execucaoBarrada('2026-11-10T22:00:00Z')), null);
  assert.equal(escritaDaExecucao([{steps: [passo('Upload theme to Ghost staging', 'cancelled', null, '2026-11-10T22:00:00Z')]}]), null);
  assert.equal(escritaDaExecucao([]), null);
});

test('só conta conteúdo gerido e alterado depois da referência', () => {
  const geridos = new Map([['a', 'x.json'], ['b', 'x.json']]);
  const ref = new Date('2026-11-10T21:00:00Z');
  const r = editadasDepois([item('a', '2026-11-10T21:00:01.000Z'), item('b', '2026-11-10T20:59:59.000Z'), item('fora', '2026-11-10T23:00:00.000Z')], geridos, ref);
  assert.deepEqual(r.map((x) => x.slug), ['a']);
  assert.equal(r[0].arquivo, 'x.json');
});

test('sem edição manual: a publicação segue', async () => {
  const a = ambiente({
    execucoes: [{id: 100}], jobs: {100: execucaoQueEscreveu('2026-11-10T21:02:40Z')},
    paginas: [item('pagina-gerida', '2026-11-10T21:01:49.000Z'), item('nao-gerida', '2026-11-10T23:30:00.000Z')],
    posts: [item('post-gerido', '2026-11-10T21:01:06.000Z')]
  });
  const r = await executa(a);
  assert.equal(r.bloqueia, false);
  assert.equal(r.editadas.length, 0);
  assert.equal(r.referencia.quando.getTime(), new Date('2026-11-10T21:02:40Z').getTime() + TOLERANCIA_MS);
  assert.match(r.texto, /A publicação segue/);
});

test('página gerida editada depois da última publicação: a publicação para e lista a página', async () => {
  const a = ambiente({
    execucoes: [{id: 100}], jobs: {100: execucaoQueEscreveu('2026-11-10T21:02:40Z')},
    paginas: [item('pagina-gerida', '2026-11-10T22:15:00.000Z'), item('outra-gerida', '2026-11-10T21:01:00.000Z')],
    posts: [item('post-gerido', '2026-11-10T22:20:00.000Z', 'draft')]
  });
  const r = await executa(a);
  assert.equal(r.bloqueia, true);
  assert.deepEqual(r.editadas.map((e) => e.slug).sort(), ['pagina-gerida', 'post-gerido']);
  assert.match(r.texto, /PUBLICAÇÃO INTERROMPIDA/);
  assert.match(r.texto, /https:\/\/ecobraz\.org\/pagina-gerida\//);
  assert.match(r.texto, /site-ghost\/content\/a\.json/);
  assert.match(r.texto, /rascunho/);
  assert.ok(r.texto.includes(MARCA));
});

test('uma execução barrada não vira referência: a segunda tentativa continua barrada', async () => {
  // Edição manual às 22:15. Às 22:30 a trava barrou (execução 101). Nova tentativa agora.
  const a = ambiente({
    execucoes: [{id: 101}, {id: 100}],
    jobs: {101: execucaoBarrada('2026-11-10T22:30:00Z'), 100: execucaoQueEscreveu('2026-11-10T21:02:40Z')},
    paginas: [item('pagina-gerida', '2026-11-10T22:15:00.000Z')]
  });
  const r = await executa(a);
  assert.equal(r.bloqueia, true);
  assert.match(r.referencia.origem, /100/);
});

test('"Re-run" da mesma execução considera a tentativa anterior que escreveu', async () => {
  const a = ambiente({
    execucoes: [{id: 100}],
    jobs: {999: execucaoQueEscreveu('2026-11-10T23:00:00Z'), 100: execucaoQueEscreveu('2026-11-10T21:02:40Z')},
    paginas: [item('pagina-gerida', '2026-11-10T22:59:00.000Z')],
    extra: {GITHUB_RUN_ATTEMPT: '2'}
  });
  const r = await executa(a);
  assert.equal(r.bloqueia, false);
  assert.match(r.referencia.origem, /999/);
});

test('liberação explícita: lista as páginas, mas não bloqueia', async () => {
  const a = ambiente({
    execucoes: [{id: 100}], jobs: {100: execucaoQueEscreveu('2026-11-10T21:02:40Z')},
    paginas: [item('pagina-gerida', '2026-11-10T22:15:00.000Z')], extra: {TRAVA_REGRAVAR: 'true'}
  });
  const r = await executa(a);
  assert.equal(r.bloqueia, false);
  assert.equal(r.editadas.length, 1);
  assert.match(r.texto, /serão regravados/);
});

test('sem publicação anterior para servir de referência: erro (a trava fecha)', async () => {
  const a = ambiente({execucoes: [{id: 101}], jobs: {101: execucaoBarrada('2026-11-10T22:30:00Z')}});
  await assert.rejects(() => executa(a), /referência/);
});

test('falha da API do Ghost ou do GitHub: erro (a trava fecha)', async () => {
  const a = ambiente({execucoes: [{id: 100}], jobs: {100: execucaoQueEscreveu('2026-11-10T21:02:40Z')}});
  const fetchQuebrado = async (url) => (url.includes('/ghost/') ? {ok: false, status: 503, json: async () => ({})} : a.fetchImpl(url));
  await assert.rejects(() => executa({...a, fetchImpl: fetchQuebrado}), /Ghost: não consegui listar/);
});
