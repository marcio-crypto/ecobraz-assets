// Acrescenta o redirect do /bio (link da bio do Instagram/TikTok) ao Ghost.
//
// POR QUE EXISTE. O link da bio aponta para https://ecobraz.org/bio, que
// devolve 404. Todo post agendado diz "detalhes no link da bio": cada clique
// cai numa pagina de erro e o lead se perde.
//
// A REGRA QUE GOVERNA ESTE SCRIPT: o arquivo de redirects do Ghost tem ~9.085
// linhas e o upload SUBSTITUI O CONJUNTO INTEIRO. Nao existe "acrescentar uma
// regra" na API — existe "mandar o arquivo todo de novo". Entao qualquer erro
// aqui nao perde uma regra: perde nove mil.
//
// A API ESTA FECHADA PARA NOS, e isso foi MEDIDO em 23/09/2026, nao suposto:
//   GET /ghost/api/admin/redirects/download/ -> 403
//   {"message":"API tokens do not have permission to access this endpoint"}
// O mesmo 403 que o deploy-redirects.mjs ja tratava no upload vale tambem para
// a leitura. Ou seja: com chave de integracao nao da para baixar nem subir
// redirects. O caminho que funciona hoje e o painel do proprietario.
//
// MODOS
//   montar <arquivo>  le o arquivo que o Marcio baixou do painel, monta o novo
//                     e valida. NAO usa a API. E sobre o arquivo BAIXADO, nunca
//                     sobre a copia do repositorio: o painel pode ter regra que
//                     o repositorio nao tem, e montar a partir da copia errada
//                     apagaria essa regra sem ninguem perceber.
//   verificar         so as conferencias HTTP ao vivo. NAO usa a API.
//   conferir          baixa e guarda backup (hoje: 403).
//   aplicar           backup + montar + validar + subir + verificar + rollback
//                     (hoje: 403). Fica pronto para quando houver permissao.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MODO = ['aplicar', 'conferir', 'montar', 'verificar'].includes(process.argv[2]) ? process.argv[2] : 'conferir';
const ARQUIVO_LOCAL = process.argv[3];
const SITE = 'https://ecobraz.org';
const DESTINO = '/agendamento/?utm_source=social_bio&utm_medium=organic&utm_campaign=link_bio';
const CHAVE = '^/bio/?$';
const BLOCO = `302:\n  "${CHAVE}": "${DESTINO}"\n`;

const PRECISA_API = MODO === 'conferir' || MODO === 'aplicar';
const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (PRECISA_API && (!adminUrl || !adminKey.includes(':'))) {
  console.error('FALTA GHOST_ADMIN_URL ou GHOST_ADMIN_API_KEY.');
  process.exit(1);
}
const [kid, secret] = adminKey.includes(':') ? adminKey.split(':') : ['', ''];
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg:'HS256',typ:'JWT',kid})}.${enc({iat:agora, exp:agora + 300, aud:'/admin/'})}`;
  return `${base}.${crypto.createHmac('sha256', Buffer.from(secret,'hex')).update(base).digest('base64url')}`;
};
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
const titulo = (t) => console.log(`\n================ ${t} ================`);

// Conta as regras sobre o TEXTO que vai subir, de proposito: a contagem tem de
// ser do que sai daqui, nao de uma estrutura ja interpretada.
const contaRegras = (txt) => txt.split('\n').filter((l) => /^\s+\S.*:\s*\S/.test(l)).length;

// ------------------------------------------------------- montar e validar
async function montarEValidar(base) {
  titulo('MONTAR');
  const texto = BLOCO + base;
  console.log('2 linhas acrescentadas NO TOPO:');
  BLOCO.trimEnd().split('\n').forEach((l) => console.log(`  + ${l}`));

  titulo('VALIDAR');
  let ok = true;
  const checa = (nome, cond, detalhe = '') => {
    console.log(`  ${cond ? 'OK   ' : 'FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`);
    if (!cond) ok = false;
  };
  const regrasBase = contaRegras(base);
  const regrasNovas = contaRegras(texto);
  checa('o original continua inteiro, byte a byte, no fim do arquivo', texto.endsWith(base));
  checa('nenhuma linha original foi alterada', texto.slice(BLOCO.length) === base);
  checa('a contagem de regras subiu exatamente 1', regrasNovas === regrasBase + 1, `${regrasBase} -> ${regrasNovas}`);
  checa('o arquivo comeca com a secao 302', texto.startsWith('302:\n'));
  checa('a secao 301 continua presente', /(^|\n)301:\s*\n/.test(texto));
  try {
    const { execFileSync } = await import('node:child_process');
    const saida = execFileSync('python3', ['-c', `
import sys, yaml
d = yaml.safe_load(sys.stdin.read())
def n(k):
    return len(d.get(k) or d.get(str(k)) or {})
print(n(301), n(302))
`], { input: texto }).toString().trim();
    const [n301, n302] = saida.split(/\s+/).map(Number);
    checa('o YAML analisa sem erro', Number.isFinite(n301), `301: ${n301} regras · 302: ${n302} regra(s)`);
    checa('a secao 302 tem exatamente 1 regra', n302 === 1);
    checa('a secao 301 manteve todas as regras', n301 === regrasBase, `${regrasBase} esperadas, ${n301} lidas`);
  } catch (e) {
    checa('o YAML analisa sem erro', false, String(e.message).slice(0, 200));
  }
  return { texto, relatorioOk: ok, regrasNovas, regrasBase };
}

// --------------------------------------------------------- verificar ao vivo
async function verificarAoVivo(rotulo, baseParaSorteio) {
  titulo(rotulo);
  let tudoOk = true;
  const cabeca = async (u) => {
    try {
      const resp = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
      return { status: resp.status, location: resp.headers.get('location') || '' };
    } catch (e) { return { status: 0, location: `erro: ${e.message.slice(0, 60)}` }; }
  };

  console.log('  --- 1 e 2: o /bio (esperado 302 para o agendamento) ---');
  for (const u of [`${SITE}/bio`, `${SITE}/bio/`]) {
    const { status, location } = await cabeca(u);
    const bom = status === 302 && location.includes('/agendamento/') && location.includes('utm_campaign=link_bio');
    console.log(`  ${bom ? 'OK   ' : 'FALHA'} ${u} -> HTTP ${status} · Location: ${location || '(nenhum)'}`);
    if (!bom) tudoOk = false;
  }

  console.log('  --- 3: tres redirects antigos, sorteados (esperado 301 para o mesmo destino) ---');
  const simples = String(baseParaSorteio || '').split('\n')
    .map((l) => l.match(/^\s+"\^(\/[a-z0-9/_-]+)\/\?\$":\s*"([^"]+)"/))
    .filter(Boolean);
  if (!simples.length) {
    console.log('  (sem arquivo de referencia para sortear — passe o caminho como 2o argumento)');
  } else {
    const restantes = simples.slice();
    for (let i = 0; i < 3 && restantes.length; i++) {
      const m = restantes.splice(Math.floor(Math.random() * restantes.length), 1)[0];
      const { status, location } = await cabeca(`${SITE}${m[1]}/`);
      const bom = status === 301 && location.endsWith(m[2]);
      console.log(`  ${bom ? 'OK   ' : 'FALHA'} ${m[1]}/ -> HTTP ${status} · destino esperado ${m[2]} · veio ${location || '(nenhum)'}`);
      if (!bom) tudoOk = false;
    }
  }

  console.log('  --- 4: destinos dos posts agendados (esperado 200) ---');
  const destinos = ['/agendamento/', '/para-empresas/', '/para-condominios/', '/coleta-gratuita/', '/pontos-de-coleta/', '/descarte-de-eletrodomesticos/', '/destruicao-fisica-de-dados-e-midias/', '/sistema-de-rastreabilidade/', '/coleta-de-lixo-eletronico-para-empresas/'];
  const ruins = [];
  for (const d of destinos) {
    let status = 0;
    try { status = (await fetch(`${SITE}${d}`, { signal: AbortSignal.timeout(30000) })).status; } catch (e) {}
    console.log(`  ${status === 200 ? 'OK   ' : 'FALHA'} ${d} -> HTTP ${status}`);
    if (status !== 200) ruins.push(`${d} (${status})`);
  }
  if (ruins.length) { console.log(`  NAO RETORNARAM 200: ${ruins.join(' · ')}`); tudoOk = false; }

  console.log('  --- 5: o formulario carrega no destino final ---');
  try {
    const resp = await fetch(`${SITE}${DESTINO}`, { signal: AbortSignal.timeout(30000) });
    const html = await resp.text();
    const temForm = /<form[\s>]/i.test(html);
    const campos = (html.match(/<input[\s>]/gi) || []).length;
    const bom = resp.status === 200 && temForm;
    console.log(`  ${bom ? 'OK   ' : 'FALHA'} destino final -> HTTP ${resp.status} · <form> presente: ${temForm} · ${campos} campo(s) <input>`);
    if (!bom) tudoOk = false;
  } catch (e) { console.log(`  FALHA destino final -> ${e.message.slice(0, 80)}`); tudoOk = false; }

  return tudoOk;
}

// =========================================================== modo VERIFICAR
if (MODO === 'verificar') {
  let base = '';
  try { base = await fs.readFile(ARQUIVO_LOCAL || 'site-ghost/theme/redirects.yaml', 'utf8'); } catch (e) {}
  const passou = await verificarAoVivo('VERIFICACAO AO VIVO', base);
  console.log(`\n${passou ? 'TODAS as conferencias passaram.' : 'ALGUMA conferencia falhou — o detalhe esta acima.'}`);
  process.exit(passou ? 0 : 1);
}

// ============================================================= modo MONTAR
if (MODO === 'montar') {
  if (!ARQUIVO_LOCAL) {
    console.error('Uso: node redirect-bio.mjs montar <arquivo-baixado-do-painel.yaml>');
    process.exit(1);
  }
  const base = await fs.readFile(ARQUIVO_LOCAL, 'utf8');
  titulo('ARQUIVO DE ENTRADA (o que veio do painel)');
  console.log(`  ${ARQUIVO_LOCAL}`);
  console.log(`  ${base.split('\n').length} linhas · ${contaRegras(base)} regras · ${base.length} bytes · sha256:${sha(base)}`);
  const jaTem = base.split('\n').filter((l) => /\/bio/.test(l) && !/biomedic/.test(l));
  if (jaTem.length) { console.log('  ATENCAO: ja existe regra mencionando /bio:'); jaTem.forEach((l) => console.log(`    ${l}`)); }
  const { texto, relatorioOk } = await montarEValidar(base);
  if (!relatorioOk) { console.error('\nValidacao falhou. NENHUM arquivo de saida foi escrito.'); process.exit(1); }
  await fs.writeFile('redirects-com-bio.yaml', texto);
  titulo('SAIDA');
  console.log(`  redirects-com-bio.yaml`);
  console.log(`  ${texto.split('\n').length} linhas · ${contaRegras(texto)} regras · ${texto.length} bytes · sha256:${sha(texto)}`);
  console.log('\nSuba ESTE arquivo em Settings -> Labs -> Redirects -> Upload redirects.');
  console.log('Guarde o arquivo de entrada como backup antes de subir.');
  process.exit(0);
}

// =================================================== modos que usam a API
titulo('1. BAIXAR O ARQUIVO AO VIVO E GUARDAR BACKUP');
const r = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {
  headers: { Authorization: `Ghost ${token()}`, 'Accept-Version': 'v5.0' },
  signal: AbortSignal.timeout(60000),
});
const original = await r.text();
console.log(`GET /redirects/download/ -> HTTP ${r.status}`);
if (!r.ok) {
  console.error('\nNAO DA PARA CONTINUAR: sem backup nao se mexe (regra 1).');
  console.error(`Resposta: ${original.slice(0, 300)}`);
  if (r.status === 403) {
    console.error('\n403 = o Ghost nao deixa chave de integracao ler os redirects.');
    console.error('Caminho que funciona: o proprietario baixa em');
    console.error('  Settings -> Labs -> Redirects -> Download,');
    console.error('manda o arquivo, e este script monta o novo com');
    console.error('  node redirect-bio.mjs montar <arquivo>');
    console.error('que valida tudo sem tocar na API.');
  }
  process.exit(1);
}
const hoje = new Date().toISOString().slice(0, 10);
const nomeBackup = `redirects-backup-${hoje}.yaml`;
await fs.writeFile(nomeBackup, original);
console.log(`backup salvo: ${nomeBackup}`);
console.log(`  ${original.split('\n').length} linhas · ${contaRegras(original)} regras · ${original.length} bytes · sha256:${sha(original)}`);
try {
  const doRepo = await fs.readFile('site-ghost/theme/redirects.yaml', 'utf8');
  if (doRepo === original) console.log('  identico byte a byte ao arquivo do repositorio.');
  else {
    const a = new Set(doRepo.split('\n')), b = new Set(original.split('\n'));
    console.log(`  DIFERE do repositorio: ${[...b].filter((l) => !a.has(l)).length} linha(s) so no ar, ${[...a].filter((l) => !b.has(l)).length} so no repositorio.`);
  }
} catch (e) { console.log('  (nao consegui ler a copia do repositorio para comparar)'); }

if (MODO === 'conferir') {
  console.log('\nMODO CONFERIR — nada foi enviado ao Ghost.');
  await verificarAoVivo('ESTADO ATUAL (antes de qualquer mudanca)', original);
  process.exit(0);
}

const { texto: novo, relatorioOk, regrasNovas } = await montarEValidar(original);
if (!relatorioOk) { console.error('\nValidacao falhou. NADA foi enviado.'); process.exit(1); }

titulo('ENVIAR AO GHOST');
const form = new FormData();
form.append('redirects', new Blob([novo], { type: 'application/yaml' }), 'redirects.yaml');
const envio = await fetch(`${adminUrl}/ghost/api/admin/redirects/upload/`, {
  method: 'POST',
  headers: { Authorization: `Ghost ${token()}`, 'Accept-Version': 'v5.0' },
  body: form,
  signal: AbortSignal.timeout(120000),
});
const respostaEnvio = await envio.text();
console.log(`POST /redirects/upload/ -> HTTP ${envio.status}`);
if (!envio.ok) {
  await fs.writeFile('redirects-com-bio.yaml', novo);
  console.error('\nENVIO FALHOU. Nada mudou no Ghost — o arquivo antigo continua no ar.');
  console.error(`Resposta: ${respostaEnvio.slice(0, 400)}`);
  console.error('O arquivo pronto ficou como artefato: redirects-com-bio.yaml');
  process.exit(1);
}

const releitura = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {
  headers: { Authorization: `Ghost ${token()}`, 'Accept-Version': 'v5.0' },
});
const instalado = await releitura.text();
const regrasInstaladas = contaRegras(instalado);
console.log(`releitura -> HTTP ${releitura.status} · ${regrasInstaladas} regras`);
const guardouTudo = releitura.ok && regrasInstaladas === regrasNovas && /\/bio/.test(instalado);

const passou = await verificarAoVivo('VERIFICACAO AO VIVO', original);

if (!guardouTudo || !passou) {
  titulo('ROLLBACK');
  console.error(`Alguma conferencia falhou (guardou tudo: ${guardouTudo} · verificacao: ${passou}).`);
  console.error('Reenviando o backup original, sem alteracoes...');
  const volta = new FormData();
  volta.append('redirects', new Blob([original], { type: 'application/yaml' }), 'redirects.yaml');
  const rb = await fetch(`${adminUrl}/ghost/api/admin/redirects/upload/`, {
    method: 'POST', headers: { Authorization: `Ghost ${token()}`, 'Accept-Version': 'v5.0' }, body: volta,
  });
  console.error(`rollback -> HTTP ${rb.status}${rb.ok ? ' (backup restaurado)' : ' (FALHOU — restaurar a mao pelo painel)'}`);
  process.exit(1);
}

titulo('RESULTADO');
console.log(`Aplicado e verificado. ${regrasNovas - 1} -> ${regrasInstaladas} regras. Backup: ${nomeBackup}. Sem rollback.`);
