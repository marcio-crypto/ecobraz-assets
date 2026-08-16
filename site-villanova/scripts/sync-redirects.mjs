// Redirecionamentos 301 da Villanova ESG: compara o arquivo do repositório com
// o que está realmente ativo no Ghost, e (no modo enviar) publica o arquivo.
//
// Uso:
//   node sync-redirects.mjs comparar   -> só relata as diferenças, não altera nada
//   node sync-redirects.mjs enviar     -> envia o arquivo do repo para o Ghost
//
// Até 16/08/2026 o redirects-villanova.yaml vivia no repositório sem nenhum
// caminho automático até o Ghost: quem quisesse aplicar tinha que subir à mão
// pelo painel. Isso deixava repo e site livres para divergir sem aviso.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const ARQUIVO = 'site-villanova/redirects-villanova.yaml';
const MODO = process.argv[2] === 'enviar' ? 'enviar' : 'comparar';
const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;

// As regras vêm no formato YAML do Ghost: "origem": "destino", agrupadas por 301/302.
const regras = (texto) => {
  const mapa = new Map();
  for (const linha of texto.split('\n')) {
    const m = linha.match(/^\s+"(.+?)"\s*:\s*"(.+?)"\s*$/);
    if (m) mapa.set(m[1], m[2]);
  }
  return mapa;
};

const local = await fs.readFile(ARQUIVO, 'utf8');
const rLocal = regras(local);

const baixa = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {
  headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'},
});
if (!baixa.ok) throw new Error(`Download de redirects falhou: ${baixa.status}`);
const remoto = await baixa.text();
// O Ghost devolve JSON quando o site foi configurado pelo formato antigo.
const rRemoto = remoto.trimStart().startsWith('[')
  ? new Map(JSON.parse(remoto).map((r) => [r.from, r.to]))
  : regras(remoto);

console.log(`Regras no repositório: ${rLocal.size}`);
console.log(`Regras ativas no Ghost: ${rRemoto.size}`);

const faltando = [...rLocal].filter(([de]) => !rRemoto.has(de));
const sobrando = [...rRemoto].filter(([de]) => !rLocal.has(de));
const diferentes = [...rLocal].filter(([de, para]) => rRemoto.has(de) && rRemoto.get(de) !== para);

console.log(`\nNo repo e NÃO no site: ${faltando.length}`);
faltando.slice(0, 20).forEach(([de, para]) => console.log(`   + ${de} -> ${para}`));
console.log(`No site e NÃO no repo: ${sobrando.length}`);
sobrando.slice(0, 20).forEach(([de, para]) => console.log(`   - ${de} -> ${para}`));
console.log(`Destino diferente: ${diferentes.length}`);
diferentes.slice(0, 20).forEach(([de, para]) => console.log(`   ~ ${de}: site=${rRemoto.get(de)} repo=${para}`));

if (MODO === 'comparar') {
  console.log('\nModo comparar — nada foi alterado no site.');
  process.exit(0);
}

const corpo = new FormData();
corpo.append('redirects', new Blob([local], {type: 'application/x-yaml'}), 'redirects.yaml');
const envio = await fetch(`${adminUrl}/ghost/api/admin/redirects/upload/`, {
  method: 'POST',
  headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'},
  body: corpo,
});
if (!envio.ok) throw new Error(`Upload de redirects falhou: ${envio.status} ${(await envio.text()).slice(0, 400)}`);
console.log(`\nArquivo enviado ao Ghost: ${rLocal.size} regras agora ativas.`);
