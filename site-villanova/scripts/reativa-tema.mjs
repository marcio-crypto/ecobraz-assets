// Força o Ghost a reler o tema ativo (robots.txt fica em cache do tema):
// ativa o Casper por um instante e reativa o tema institucional em seguida.
// Uso: node reativa-tema.mjs [tema-final]  (padrão: villanova-institutional)
import crypto from 'node:crypto';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Faltam credenciais do Ghost da Villanova');
const temaFinal = process.argv[2] || 'villanova-institutional';

const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const semAssinar = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:agora,exp:agora+300,aud:'/admin/'})}`;
const token = `${semAssinar}.${crypto.createHmac('sha256',Buffer.from(secret,'hex')).update(semAssinar).digest('base64url')}`;
const headers = {Authorization:`Ghost ${token}`,'Accept-Version':'v5.0','Content-Type':'application/json'};

async function ativa(nome) {
  const r = await fetch(`${adminUrl}/ghost/api/admin/themes/${encodeURIComponent(nome)}/activate/`, {method:'PUT', headers});
  if (!r.ok) throw new Error(`Ativação de ${nome} falhou: ${r.status} ${(await r.text()).slice(0,300)}`);
  console.log('Ativado:', nome);
}

await ativa('casper');
await ativa(temaFinal);
const check = await fetch(`${adminUrl}/robots.txt?apos-reativacao=1`, {headers: {'User-Agent': 'verificacao-robots'}});
const corpo = await check.text();
const aberto = corpo.includes('explicitly allowed');
const bloqueado = /Disallow: \/\s*$/m.test(corpo);
console.log('robots.txt na origem — aberto p/ IA:', aberto, '| linhas de bloqueio total:', bloqueado);
if (!aberto) { console.log(corpo.slice(0, 600)); process.exit(1); }
