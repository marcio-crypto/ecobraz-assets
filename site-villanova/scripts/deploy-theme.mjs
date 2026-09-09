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
const leHash = async () => {
  try {
    const r = await fetch('https://www.villanovaesg.com/', {redirect: 'follow', cache: 'no-store'});
    return ((await r.text()).match(/assets\/css\/main\.css\?v=([A-Za-z0-9]+)/) || [])[1] || null;
  } catch (e) { return null; }
};
const hashAntes = activate ? await leHash() : null;
if (activate) console.log(`Hash de asset ANTES da ativação: ${hashAntes || '(não lido)'}`);

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
  let hashDepois = null;
  for (let i = 0; i < 12; i++) {
    hashDepois = await leHash();
    if (hashDepois && hashDepois !== hashAntes) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`Hash de asset ANTES : ${hashAntes || '(não lido)'}`);
  console.log(`Hash de asset DEPOIS: ${hashDepois || '(não lido)'}`);
  if (hashAntes && hashDepois && hashAntes === hashDepois) {
    console.log('AVISO: o hash não mudou em um minuto. Pode ser cache do CDN ainda');
    console.log('servindo o HTML antigo, ou o tema realmente não subiu. Confirme');
    console.log('buscando no HTML servido um trecho que só exista na versão nova.');
  } else if (hashDepois && hashAntes) {
    console.log('O hash mudou: o HTML servido já é o do tema recém-ativado.');
  }
  console.log('ATENÇÃO: isto confirma ATIVAÇÃO, não confirma que uma mudança');
  console.log('específica está no ar. Para isso, rode o workflow');
  console.log('"Villanova — auditoria no navegador de verdade".');
} else {
  console.log('Tema apenas enviado (não ativado). Ative com o parâmetro "activate".');
}
