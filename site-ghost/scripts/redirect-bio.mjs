// Acrescenta o redirect do /bio (link da bio do Instagram/TikTok) ao Ghost.
//
// POR QUE EXISTE. O link da bio aponta para https://ecobraz.org/bio, que
// devolve 404. Todo post agendado diz "detalhes no link da bio": cada clique
// cai numa pagina de erro e o lead se perde.
//
// A REGRA QUE GOVERNA ESTE SCRIPT: o arquivo de redirects do Ghost tem ~9.085
// linhas e o upload SUBSTITUI O CONJUNTO INTEIRO. Nao existe "acrescentar uma
// regra" na API — existe "mandar o arquivo todo de novo". Entao qualquer erro
// aqui nao perde uma regra: perde nove mil. Por isso:
//
//   1. baixa o arquivo ao vivo e guarda backup datado ANTES de tudo;
//   2. se o download falhar, PARA — sem backup nao se mexe;
//   3. monta o novo arquivo como "302 no topo + original byte a byte";
//   4. confere que o original continua la INTEIRO (novo.endsWith(original));
//   5. confere que a contagem de regras subiu exatamente 1;
//   6. so entao envia, e reconfere lendo de volta;
//   7. se qualquer conferencia falhar, REENVIA O BACKUP e sai com erro.
//
// O endereco do Ghost e segredo e nao e impresso em lugar nenhum.
//
// Uso: node redirect-bio.mjs [conferir|aplicar]
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'conferir';
const SITE = 'https://ecobraz.org';
const DESTINO = '/agendamento/?utm_source=social_bio&utm_medium=organic&utm_campaign=link_bio';
const CHAVE = '^/bio/?$';

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) {
  console.error('FALTA GHOST_ADMIN_URL ou GHOST_ADMIN_API_KEY.');
  process.exit(1);
}
const [kid, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const token = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg:'HS256',typ:'JWT',kid})}.${enc({iat:agora, exp:agora + 300, aud:'/admin/'})}`;
  return `${base}.${crypto.createHmac('sha256', Buffer.from(secret,'hex')).update(base).digest('base64url')}`;
};
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
const titulo = (t) => console.log(`\n================ ${t} ================`);

// Conta as regras: uma por linha indentada que contenha ": ". Nao uso parser de
// YAML aqui de proposito — a contagem tem de ser sobre o TEXTO que vai subir.
const contaRegras = (txt) => txt.split('\n').filter((l) => /^\s+\S.*:\s*\S/.test(l)).length;

// ---------------------------------------------------------------- 1. BACKUP
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
    console.error('Caminho manual: Settings -> Labs -> Redirects -> Download,');
    console.error('editar, e Upload. Mesmas regras.');
  }
  process.exit(1);
}
const hoje = new Date().toISOString().slice(0, 10);
const nomeBackup = `redirects-backup-${hoje}.yaml`;
await fs.writeFile(nomeBackup, original);
const regrasOriginais = contaRegras(original);
console.log(`backup salvo: ${nomeBackup}`);
console.log(`  ${original.split('\n').length} linhas · ${regrasOriginais} regras · ${original.length} bytes · sha256:${sha(original)}`);

// Comparar com a copia do repositorio — isso responde de quebra uma duvida
// antiga: se o painel tem regras que o repositorio nao tem.
try {
  const doRepo = await fs.readFile('site-ghost/theme/redirects.yaml', 'utf8');
  if (doRepo === original) console.log('  identico byte a byte ao arquivo do repositorio.');
  else {
    const a = new Set(doRepo.split('\n')), b = new Set(original.split('\n'));
    console.log(`  DIFERE do repositorio: ${[...b].filter((l)=>!a.has(l)).length} linha(s) so no ar, ${[...a].filter((l)=>!b.has(l)).length} so no repositorio.`);
  }
} catch (e) { console.log('  (nao consegui ler a copia do repositorio para comparar)'); }

if (original.includes('/bio')) {
  const jaTem = original.split('\n').filter((l) => l.includes('/bio') && !l.includes('biomedic'));
  if (jaTem.length) { console.log('\nATENCAO: ja existe regra mencionando /bio:'); jaTem.forEach((l)=>console.log(`  ${l}`)); }
}

// ------------------------------------------------------------- 2. MONTAR
titulo('2. MONTAR O ARQUIVO NOVO');
const bloco = `302:\n  "${CHAVE}": "${DESTINO}"\n`;
const novo = bloco + original;
console.log('2 linhas acrescentadas NO TOPO:');
bloco.trimEnd().split('\n').forEach((l) => console.log(`  + ${l}`));

// ------------------------------------------------------------ 3. VALIDAR
titulo('3. VALIDAR ANTES DE ENVIAR');
let ok = true;
const checa = (nome, cond, detalhe='') => { console.log(`  ${cond ? 'OK  ' : 'FALHA'} ${nome}${detalhe ? ' — ' + detalhe : ''}`); if (!cond) ok = false; };
checa('o original continua inteiro, byte a byte, no fim do arquivo novo', novo.endsWith(original));
checa('nenhuma linha original foi alterada', novo.slice(bloco.length) === original);
const regrasNovas = contaRegras(novo);
checa('a contagem de regras subiu exatamente 1', regrasNovas === regrasOriginais + 1, `${regrasOriginais} -> ${regrasNovas}`);
checa('o arquivo novo comeca com a secao 302', novo.startsWith('302:\n'));
checa('a secao 301 original continua presente', novo.includes('\n301:\n') || novo.includes('301:'));
try {
  const { execSync } = await import('node:child_process');
  await fs.writeFile('/tmp/novo-redirects.yaml', novo);
  const saida = execSync('python3 -c "import yaml,sys; d=yaml.safe_load(open(\'/tmp/novo-redirects.yaml\')); print(len(d.get(\'301\',{}) or {}), len(d.get(302,{}) or d.get(\'302\',{}) or {}))"').toString().trim();
  const [n301, n302] = saida.split(/\s+/).map(Number);
  checa('o YAML analisa sem erro', true, `301: ${n301} regras · 302: ${n302} regra(s)`);
  checa('a secao 302 tem exatamente 1 regra', n302 === 1);
} catch (e) {
  checa('o YAML analisa sem erro', false, String(e.message).slice(0, 200));
}
if (!ok) { console.error('\nValidacao falhou. NADA foi enviado.'); process.exit(1); }

// ------------------------------------------------------------- 4. ENVIAR
const verificar = async (rotulo) => {
  titulo(rotulo);
  let tudoOk = true;
  const cabeca = async (u) => {
    const resp = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    return { status: resp.status, location: resp.headers.get('location') || '' };
  };
  // 1 e 2 — o /bio
  for (const u of [`${SITE}/bio`, `${SITE}/bio/`]) {
    const { status, location } = await cabeca(u);
    const bom = status === 302 && location.includes('/agendamento/') && location.includes('utm_campaign=link_bio');
    console.log(`  ${bom ? 'OK  ' : 'FALHA'} ${u} -> HTTP ${status} · Location: ${location || '(nenhum)'}`);
    if (!bom) tudoOk = false;
  }
  // 3 — tres redirects antigos ao acaso
  const simples = original.split('\n')
    .map((l) => l.match(/^\s+"\^(\/[a-z0-9/_-]+)\/\?\$":\s*"([^"]+)"/))
    .filter(Boolean);
  const sorteadas = [];
  while (sorteadas.length < 3 && simples.length) sorteadas.push(simples.splice(Math.floor(Math.random()*simples.length), 1)[0]);
  console.log('  --- 3 redirects antigos, sorteados no backup ---');
  for (const m of sorteadas) {
    const { status, location } = await cabeca(`${SITE}${m[1]}/`);
    const bom = status === 301 && location.endsWith(m[2]);
    console.log(`  ${bom ? 'OK  ' : 'FALHA'} ${m[1]}/ -> HTTP ${status} · esperado destino ${m[2]} · veio ${location || '(nenhum)'}`);
    if (!bom) tudoOk = false;
  }
  // 4 — destinos dos posts agendados
  console.log('  --- destinos dos posts agendados (esperado 200) ---');
  const destinos = ['/agendamento/','/para-empresas/','/para-condominios/','/coleta-gratuita/','/pontos-de-coleta/','/descarte-de-eletrodomesticos/','/destruicao-fisica-de-dados-e-midias/','/sistema-de-rastreabilidade/','/coleta-de-lixo-eletronico-para-empresas/'];
  const ruins = [];
  for (const d of destinos) {
    const resp = await fetch(`${SITE}${d}`, { signal: AbortSignal.timeout(30000) });
    console.log(`  ${resp.status === 200 ? 'OK  ' : 'FALHA'} ${d} -> HTTP ${resp.status}`);
    if (resp.status !== 200) ruins.push(`${d} (${resp.status})`);
  }
  if (ruins.length) { console.log(`  NAO RETORNARAM 200: ${ruins.join(' · ')}`); tudoOk = false; }
  // 5 — o formulario carrega no destino final
  const alvo = `${SITE}${DESTINO}`;
  const resp = await fetch(alvo, { signal: AbortSignal.timeout(30000) });
  const html = await resp.text();
  const temForm = /<form[\s>]/i.test(html);
  const campos = (html.match(/<input[\s>]/gi) || []).length;
  console.log(`  ${resp.status === 200 && temForm ? 'OK  ' : 'FALHA'} destino final -> HTTP ${resp.status} · <form> presente: ${temForm} · ${campos} campo(s) <input>`);
  if (!(resp.status === 200 && temForm)) tudoOk = false;
  return tudoOk;
};

if (MODO === 'conferir') {
  console.log('\nMODO CONFERIR — nada foi enviado ao Ghost.');
  await verificar('4. ESTADO ATUAL (antes de qualquer mudanca)');
  console.log('\nPara aplicar, rode de novo com modo "aplicar".');
  process.exit(0);
}

titulo('4. ENVIAR AO GHOST');
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
  console.error(`\nENVIO FALHOU. Nada mudou no Ghost — o arquivo antigo continua no ar.`);
  console.error(`Resposta: ${respostaEnvio.slice(0, 400)}`);
  if (envio.status === 403) {
    console.error('\n403 = o Ghost nao deixa chave de integracao importar redirects.');
    console.error('Caminho manual: Settings -> Labs -> Redirects -> Upload redirects,');
    console.error(`enviando o arquivo "redirects-com-bio.yaml" guardado como artefato desta execucao.`);
    await fs.writeFile('redirects-com-bio.yaml', novo);
  }
  process.exit(1);
}

// Reler do Ghost e conferir que ele guardou o que mandamos.
const releitura = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {
  headers: { Authorization: `Ghost ${token()}`, 'Accept-Version': 'v5.0' },
});
const instalado = await releitura.text();
const regrasInstaladas = contaRegras(instalado);
console.log(`releitura -> HTTP ${releitura.status} · ${regrasInstaladas} regras`);
const guardouTudo = releitura.ok && regrasInstaladas === regrasNovas && instalado.includes('/bio');

const passou = await verificar('5. VERIFICACAO AO VIVO');

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
console.log(`Aplicado e verificado. ${regrasOriginais} -> ${regrasInstaladas} regras. Backup: ${nomeBackup}. Sem rollback.`);
