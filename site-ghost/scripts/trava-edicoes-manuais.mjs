// Trava da publicação: para o deploy ANTES de qualquer escrita no Ghost quando
// uma página ou post gerido pelo repositório foi alterado direto no Ghost
// depois da última publicação.
//
// Por que existe: os passos "Sync ..." regravam título, texto, meta e código
// injetado de todas as páginas e posts listados em site-ghost/content/*.json.
// Uma edição feita no editor do Ghost some na publicação seguinte, sem aviso.
// Foi o que aconteceu em 10/11/2026 com /coleta-de-lixo-eletronico-para-empresas/.
//
// Como decide: toda página ou post tem a data da última alteração no Ghost
// (updated_at). O pipeline regrava todos os conteúdos geridos a cada execução.
// Então, um conteúdo gerido com updated_at posterior ao fim da última escrita
// do pipeline só pode ter sido alterado por fora. O fim da última escrita vem
// da API do GitHub Actions: a última execução deste workflow em que um passo
// de escrita chegou a rodar (execuções barradas por esta trava não contam,
// senão a segunda tentativa passaria por cima da edição).
//
// O que NÃO cobre: configurações gerais do site, meta das tags e o tema — só
// páginas e posts. E edições feitas nos poucos segundos entre a última escrita
// e a tolerância abaixo.
//
// Liberação consciente: título do commit começando por [regravar-ghost], ou
// execução manual do workflow com "Regravar o Ghost" marcado. Nos dois casos
// a lista é impressa do mesmo jeito, e a publicação segue.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const WORKFLOW = '.github/workflows/deploy-ghost.yml';
export const MARCA = '[regravar-ghost]';
// Passos do workflow que escrevem páginas ou posts no Ghost (pelo nome).
// Ao criar um passo novo que escreva, comece o nome por "Sync " ou inclua aqui.
// O teste trava-edicoes-manuais.test.mjs falha se um passo com a chave do
// Ghost não estiver nem aqui nem na lista de passos que não escrevem.
export const PASSO_DE_ESCRITA = /^(Upload theme|Sync |Reaplica hreflang|Gera e aplica capas|Remove duplicate)/;
// Folga para diferença de relógio entre o GitHub e o Ghost.
export const TOLERANCIA_MS = 15_000;
// Arquivos cujo texto do editor não aparece ao público (a página usa template),
// mas cujo título, meta e código injetado aparecem.
const RENDERIZADAS_POR_TEMPLATE = /(^|\/)(en-)?commercial-pages\.json$/;

/** Lê do próprio workflow quais arquivos de conteúdo o pipeline regrava. */
export function arquivosSincronizados(textoDoWorkflow) {
  const out = {pages: [], posts: []};
  for (const m of textoDoWorkflow.matchAll(/sync-(pages|posts)\.mjs\s+(\S+\.json)/g)) {
    if (!out[m[1]].includes(m[2])) out[m[1]].push(m[2]);
  }
  return out;
}

/** Fim do último passo de escrita que rodou nesta execução; null se nenhum rodou. */
export function escritaDaExecucao(jobs) {
  let ultimo = null;
  for (const job of jobs || []) {
    for (const passo of job.steps || []) {
      if (!PASSO_DE_ESCRITA.test(passo.name || '')) continue;
      if (!['success', 'failure', 'cancelled'].includes(passo.conclusion)) continue;
      if (!passo.started_at || !passo.completed_at) continue;
      const fim = new Date(passo.completed_at);
      if (!ultimo || fim > ultimo) ultimo = fim;
    }
  }
  return ultimo;
}

/** Conteúdos geridos pelo repositório alterados no Ghost depois da referência. */
export function editadasDepois(itens, geridos, referencia) {
  return itens
    .filter((i) => geridos.has(i.slug) && new Date(i.updated_at) > referencia)
    .map((i) => ({...i, arquivo: geridos.get(i.slug)}))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

const tokenGhost = (adminKey) => {
  const [id, segredo] = adminKey.split(':');
  const agora = Math.floor(Date.now() / 1000);
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const semAssinatura = `${b64({alg: 'HS256', typ: 'JWT', kid: id})}.${b64({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  return `${semAssinatura}.${crypto.createHmac('sha256', Buffer.from(segredo, 'hex')).update(semAssinatura).digest('base64url')}`;
};

async function listaGhost({adminUrl, adminKey, tipo, fetchImpl}) {
  const itens = [];
  for (let pagina = 1; pagina <= 50; pagina += 1) {
    const url = `${adminUrl}/ghost/api/admin/${tipo}/?limit=100&page=${pagina}&fields=id,slug,title,updated_at,url,status`;
    const r = await fetchImpl(url, {headers: {Authorization: `Ghost ${tokenGhost(adminKey)}`, 'Accept-Version': 'v5.0'}});
    if (!r.ok) throw new Error(`Ghost: não consegui listar ${tipo} (HTTP ${r.status})`);
    const corpo = await r.json();
    itens.push(...(corpo[tipo] || []));
    if (pagina >= (corpo.meta?.pagination?.pages || 1)) break;
  }
  return itens;
}

async function referenciaDaUltimaEscrita({github, runId, runAttempt, arquivoDoWorkflow}) {
  const candidatos = [];
  const olha = async (id, rotulo) => {
    const corpo = await github(`actions/runs/${id}/jobs?filter=all&per_page=100`);
    const fim = escritaDaExecucao(corpo.jobs);
    if (fim) candidatos.push({fim, rotulo});
    return Boolean(fim);
  };
  // Tentativas anteriores desta mesma execução ("Re-run") também podem ter escrito.
  if (runId && Number(runAttempt) > 1) await olha(runId, `execução ${runId} (tentativa anterior)`);
  const lista = await github(`actions/workflows/${arquivoDoWorkflow}/runs?status=completed&per_page=30`);
  let vistas = 0;
  for (const exec of lista.workflow_runs || []) {
    if (String(exec.id) === String(runId)) continue;
    await olha(exec.id, `execução ${exec.id}`);
    vistas += 1;
    // As execuções vêm da mais nova para a mais antiga. Depois de achar uma que
    // escreveu, olha mais algumas por segurança (execuções sobrepostas) e para.
    if (candidatos.length && vistas >= 5) break;
  }
  if (!candidatos.length) return null;
  const ultima = candidatos.reduce((a, b) => (a.fim > b.fim ? a : b));
  return {quando: new Date(ultima.fim.getTime() + TOLERANCIA_MS), fimDaEscrita: ultima.fim, origem: ultima.rotulo};
}

const hora = (data, fuso) => new Intl.DateTimeFormat('pt-BR', {timeZone: fuso, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}).format(data);
const quando = (data) => `${hora(data, 'America/Sao_Paulo').replace(', ', ' ')} em Brasília, ${hora(data, 'Europe/Rome').slice(-5)} em Roma`;

export function relatorio({referencia, geridos, editadas, liberada}) {
  const linhas = [];
  linhas.push('Trava de edições manuais no Ghost');
  linhas.push(`Última escrita do pipeline: ${quando(referencia.fimDaEscrita)} (${referencia.origem}).`);
  linhas.push(`Conferidos ${geridos.pages} páginas e ${geridos.posts} posts geridos pelo repositório.`);
  linhas.push('');
  if (!editadas.length) {
    linhas.push('Nenhuma edição manual depois da última publicação. A publicação segue.');
    return linhas.join('\n');
  }
  linhas.push(liberada
    ? `ATENÇÃO: ${editadas.length} conteúdo(s) alterado(s) direto no Ghost serão regravados pelo texto do repositório, por liberação explícita (${MARCA} ou execução manual).`
    : `PUBLICAÇÃO INTERROMPIDA. Nada foi gravado no site.\n${editadas.length} conteúdo(s) foram alterados direto no Ghost depois da última publicação. Se a publicação continuasse, o texto do repositório seria gravado por cima:`);
  linhas.push('');
  editadas.forEach((e, n) => {
    linhas.push(`  ${n + 1}. ${e.tipo === 'pages' ? 'Página' : 'Post'}: ${e.title}`);
    linhas.push(`     ${e.url}`);
    linhas.push(`     alterado em ${quando(new Date(e.updated_at))}`);
    linhas.push(`     fonte no repositório: ${e.arquivo}`);
    if (e.status !== 'published') linhas.push('     está como rascunho no Ghost; a publicação voltaria a publicar.');
    if (RENDERIZADAS_POR_TEMPLATE.test(e.arquivo)) linhas.push('     página de template: o texto do editor não aparece ao público; título, meta e código injetado aparecem.');
  });
  if (!liberada) {
    linhas.push('');
    linhas.push('Como resolver:');
    linhas.push('  a) A edição do Ghost deve ficar: leve o texto para o arquivo indicado acima e publique de novo com');
    linhas.push(`     o título do commit começando por ${MARCA}.`);
    linhas.push(`  b) A edição pode ser descartada: publique de novo com o título do commit começando por ${MARCA}, ou rode o workflow`);
    linhas.push('     manualmente (Actions > Deploy Ghost staging > Run workflow) com "Regravar o Ghost" marcado.');
  }
  return linhas.join('\n');
}

export async function executa({env, fetchImpl = fetch, lerArquivo = (p) => fs.readFile(p, 'utf8')}) {
  const adminUrl = String(env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
  const adminKey = String(env.GHOST_ADMIN_API_KEY || '');
  const liberada = String(env.TRAVA_REGRAVAR || '') === 'true';
  if (!adminUrl || !adminKey.includes(':')) throw new Error('Faltam as credenciais do Ghost (GHOST_ADMIN_URL / GHOST_ADMIN_API_KEY).');
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) throw new Error('Faltam GITHUB_TOKEN / GITHUB_REPOSITORY para ler o histórico de publicações.');

  const api = String(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const github = async (caminho) => {
    const r = await fetchImpl(`${api}/repos/${env.GITHUB_REPOSITORY}/${caminho}`, {
      headers: {Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'}
    });
    if (!r.ok) throw new Error(`GitHub: ${caminho.split('?')[0]} respondeu HTTP ${r.status}`);
    return r.json();
  };

  // 1. Quais conteúdos o pipeline regrava (lido do próprio workflow).
  const arquivos = arquivosSincronizados(await lerArquivo(WORKFLOW));
  const geridos = {pages: new Map(), posts: new Map()};
  for (const tipo of ['pages', 'posts']) {
    for (const arquivo of arquivos[tipo]) {
      let texto;
      try { texto = await lerArquivo(arquivo); } catch (erro) {
        if (erro.code === 'ENOENT') continue; // arquivos opcionais (versão EN)
        throw erro;
      }
      for (const item of JSON.parse(texto)) if (item.slug && !geridos[tipo].has(item.slug)) geridos[tipo].set(item.slug, arquivo);
    }
  }
  if (!geridos.pages.size && !geridos.posts.size) throw new Error('Não achei nenhum conteúdo gerido: o workflow mudou de formato? Revise arquivosSincronizados().');

  // 2. Quando o pipeline escreveu pela última vez.
  const referencia = await referenciaDaUltimaEscrita({
    github, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, arquivoDoWorkflow: WORKFLOW.split('/').pop()
  });
  if (!referencia) throw new Error('Não achei nenhuma publicação anterior nas últimas 30 execuções para servir de referência. Confira o Ghost à mão e libere com ' + MARCA + '.');

  // 3. O que mudou no Ghost depois disso.
  const editadas = [];
  for (const tipo of ['pages', 'posts']) {
    const itens = await listaGhost({adminUrl, adminKey, tipo, fetchImpl});
    editadas.push(...editadasDepois(itens, geridos[tipo], referencia.quando).map((e) => ({...e, tipo})));
  }

  const texto = relatorio({referencia, geridos: {pages: geridos.pages.size, posts: geridos.posts.size}, editadas, liberada});
  return {bloqueia: editadas.length > 0 && !liberada, editadas, referencia, texto};
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const liberada = String(process.env.TRAVA_REGRAVAR || '') === 'true';
  try {
    const resultado = await executa({env: process.env});
    console.log(resultado.texto);
    if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, '```\n' + resultado.texto + '\n```\n');
    if (resultado.bloqueia) process.exit(1);
  } catch (erro) {
    // Sem conseguir conferir, a trava fecha: é mais seguro parar do que regravar às cegas.
    console.error(`Trava de edições manuais: não consegui conferir. ${erro.message}`);
    if (liberada) {
      console.error(`Liberação explícita (${MARCA} ou execução manual): a publicação segue sem a conferência.`);
    } else {
      console.error(`Rode de novo. Se o erro persistir e você tiver certeza de que não há edição manual no Ghost, libere com ${MARCA}.`);
      process.exit(1);
    }
  }
}
