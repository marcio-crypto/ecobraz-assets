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

// A Integration Key nao tem permissao de leitura em redirects/download/
// (403 NoPermissionError): esse endpoint exige token de usuario. Antes isso
// derrubava o script inteiro — inclusive no modo enviar, que nem chegava a
// tentar gravar. Comparar e util, mas nao e pre-requisito para enviar: as duas
// permissoes sao separadas na API do Ghost, e so tentando da para saber.
const baixa = await fetch(`${adminUrl}/ghost/api/admin/redirects/download/`, {
  headers: {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'},
});
if (!baixa.ok) {
  console.log(`AVISO: nao foi possivel BAIXAR os redirects ativos (${baixa.status}).`);
  console.log('       Sem isso nao da para comparar repo e site.');
  if (MODO === 'comparar') {
    console.log(`\nRegras no repositorio: ${rLocal.size}`);
    console.log('Modo comparar sem leitura: nada a relatar. Rode em modo enviar para tentar gravar.');
    process.exit(0);
  }
  console.log('       Seguindo mesmo assim para TENTAR o envio.\n');
}
const remoto = baixa.ok ? await baixa.text() : '';
// O Ghost devolve JSON quando o site foi configurado pelo formato antigo.
const rRemoto = !remoto ? new Map()
  : remoto.trimStart().startsWith('[')
    ? new Map(JSON.parse(remoto).map((r) => [r.from, r.to]))
    : regras(remoto);

console.log(`Regras no repositório: ${rLocal.size}`);
console.log(`Regras ativas no Ghost: ${baixa.ok ? rRemoto.size : 'desconhecido (sem permissão de leitura)'}`);

// Sem leitura, toda regra pareceria "faltando" — seria relatorio inventado.
const faltando = baixa.ok ? [...rLocal].filter(([de]) => !rRemoto.has(de)) : [];
const sobrando = baixa.ok ? [...rRemoto].filter(([de]) => !rLocal.has(de)) : [];
const diferentes = baixa.ok ? [...rLocal].filter(([de, para]) => rRemoto.has(de) && rRemoto.get(de) !== para) : [];

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
if (!envio.ok) {
  const detalhe = (await envio.text()).slice(0, 400);
  if (envio.status === 403) {
    console.log(`\nUpload recusado (403): a Integration Key tambem nao grava redirects.`);
    console.log('Este endpoint so aceita token de usuario — e trabalho de painel:');
    console.log('  Ghost > Settings > Labs > Redirects > Upload redirects');
    console.log(`  arquivo: ${ARQUIVO} (${rLocal.size} regras)`);
    process.exit(1);
  }
  throw new Error(`Upload de redirects falhou: ${envio.status} ${detalhe}`);
}
console.log(`\nArquivo enviado ao Ghost: ${rLocal.size} regras agora ativas.`);
