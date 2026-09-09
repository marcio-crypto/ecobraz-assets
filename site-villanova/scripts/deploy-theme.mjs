// Sobe o tema villanova-institutional para o Ghost da Villanova ESG.
// Uso: node deploy-theme.mjs <zip> [activate]
//  - sem "activate": apenas envia (o tema fica disponível, sem trocar o ativo)
//  - com "activate": envia e ativa
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const themePath = process.argv[2] || 'villanova-institutional.zip';
const activate = process.argv[3] === 'activate';
if (!adminUrl || !adminKey.includes(':')) throw new Error('Credenciais do Ghost da Villanova ausentes');

const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const auth = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

// Hash de asset ANTES de mexer em nada: e a unica forma de a checagem depois
// significar alguma coisa. Sem o "antes", um hash qualquer no "depois" nao
// prova se mudou.
// O HASH DO GHOST E POR ARQUIVO, NAO DO SITE. Medido em 09/09/2026 no HTML
// servido:  main.css?v=mgeUqhCpucRBJtt6 · v2.css?v=IZlqYv_BDew-xOV6 ·
// menu.js?v=SAEskuSEW6JEGsYD — tres valores diferentes na mesma pagina.
//
// A primeira versao desta checagem olhava so o main.css, que e justamente um
// arquivo que quase nunca muda: o hash dele ficava igual em todo deploy e o
// script anunciava "o hash nao mudou" mesmo quando o tema tinha subido
// perfeitamente. Deu alarme falso duas vezes na mesma madrugada, e eu cheguei a
// escrever num commit que a causa era cache de borda do CDN. Nao era. Era eu
// vigiando o arquivo errado.
//
// Agora recolhe TODOS os pares arquivo->hash da pagina. Se qualquer um mudou,
// coisa nova esta sendo servida — e o log diz quais mudaram, que e a informacao
// util. O parametro unico na URL fica, porque nao custa nada e afasta a duvida
// de cache de borda.
const leHashes = async () => {
  try {
    const r = await fetch(`https://www.villanovaesg.com/?_cache=${Date.now()}-${Math.random().toString(36).slice(2)}`,
      {redirect: 'follow', cache: 'no-store', headers: {'Cache-Control': 'no-cache', Pragma: 'no-cache'}});
    const html = await r.text();
    const mapa = {};
    for (const m of html.matchAll(/assets\/(?:css|js)\/([A-Za-z0-9._-]+)\?v=([A-Za-z0-9_-]+)/g)) mapa[m[1]] = m[2];
    return Object.keys(mapa).length ? mapa : null;
  } catch (e) { return null; }
};
const mudaram = (a, b) => {
  if (!a || !b) return null;
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] !== b[k]) out.push(`${k}: ${a[k] || '(ausente)'} -> ${b[k] || '(ausente)'}`);
  }
  return out;
};
const hashAntes = activate ? await leHashes() : null;
if (activate) console.log(`Hashes de asset ANTES da ativação: ${hashAntes ? JSON.stringify(hashAntes) : '(não lidos)'}`);

const bytes = await fs.readFile(themePath);
const form = new FormData();
form.append('file', new Blob([bytes], {type: 'application/zip'}), 'villanova-institutional.zip');

const up = await fetch(`${adminUrl}/ghost/api/admin/themes/upload/`, {method: 'POST', headers: auth, body: form});
const upText = await up.text();
if (!up.ok) throw new Error(`Upload do tema falhou (${up.status}): ${upText.slice(0, 600)}`);
const nome = JSON.parse(upText).themes?.[0]?.name;
if (!nome) throw new Error(`Upload não retornou o nome do tema: ${upText.slice(0, 400)}`);
console.log(`Tema enviado: ${nome}`);

if (activate) {
  const act = await fetch(`${adminUrl}/ghost/api/admin/themes/${encodeURIComponent(nome)}/activate/`, {method: 'PUT', headers: auth});
  const actText = await act.text();
  if (!act.ok) throw new Error(`Ativação falhou (${act.status}): ${actText.slice(0, 600)}`);
  console.log(`TEMA ATIVADO: ${nome} ✔`);
  // O QUE ESTA CHECAGEM PROVA, E O QUE NAO PROVA. Antes ela procurava
  // "VILLANOVA" e "main.css" no HTML — duas coisas no ar desde sempre, que
  // continuariam ali com o tema ANTIGO ativo. Passava sem provar nada.
  //
  // Agora compara o hash de asset do Ghost (?v=...) antes e depois. E PRECISA
  // INSISTIR: em 09/09/2026 a primeira versao leu 0,4 segundo depois de ativar,
  // pegou uma copia de cache do CDN e reportou o hash ANTIGO — eu quase conclui
  // que o tema nao tinha subido, quando tinha. Dois minutos depois o hash ja
  // era outro. Por isso o laco abaixo tenta por ate um minuto.
  let hashDepois = null, diferencas = null;
  for (let i = 0; i < 12; i++) {
    hashDepois = await leHashes();
    diferencas = mudaram(hashAntes, hashDepois);
    if (diferencas && diferencas.length) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (diferencas && diferencas.length) {
    console.log('Arquivos com hash novo no HTML servido:');
    for (const d of diferencas) console.log(`   ${d}`);
    console.log('Ou seja: o tema recém-ativado já está sendo servido.');
  } else if (hashAntes && hashDepois) {
    console.log('INCONCLUSIVO: nenhum hash de asset mudou em um minuto.');
    console.log('Isso é ESPERADO quando o deploy não alterou nenhum CSS nem JS —');
    console.log('mudança só em .hbs não muda hash de asset. Também pode ser cache');
    console.log('de borda. Este script NÃO distingue os casos: não trate como');
    console.log('falha de publicação sem procurar no HTML servido um trecho que');
    console.log('só exista na versão nova.');
  }
  console.log('ATENÇÃO: isto confirma ATIVAÇÃO, não confirma que uma mudança');
  console.log('específica está no ar. Para isso, rode o workflow');
  console.log('"Villanova — auditoria no navegador de verdade".');
} else {
  console.log('Tema apenas enviado (não ativado). Ative com o parâmetro "activate".');
}
