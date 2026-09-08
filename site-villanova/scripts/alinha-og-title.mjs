// Alinha o og:title ao <title> das páginas da Villanova ESG.
//
// COMO O GHOST DECIDE O og:title: usa o og_title da página se houver; senão cai
// para o meta_title; senão para o título. Ou seja, um og_title preenchido é uma
// SOBRESCRITA.
//
// Por isso este script APAGA o og_title em vez de copiar o texto do <title>
// para dentro dele. Copiar deixaria duas cópias da mesma frase, e a próxima vez
// que alguém ajustasse o título para o Google as duas voltariam a divergir em
// silêncio — que é exatamente como chegamos aqui. Apagando, o og:title passa a
// ser o mesmo valor por construção.
//
// Uso: node alinha-og-title.mjs simular|aplicar slug1 slug2 ...
//      (sem slugs, varre todas as páginas e relata quem tem og_title próprio)
//
// A HOME É EXCEÇÃO, E A REGRA DELA É OUTRA. Não repita o que eu escrevi aqui
// antes: mandei ESVAZIAR o Facebook card das configurações, esperando que o
// Ghost caísse no meta_title como faz no nível de página. NÃO CAI. No nível do
// SITE a reserva é o TÍTULO DO SITE — o campo ficou vazio e o og:title virou
// "Villanova ESG", pior do que estava. Medido no HTML servido em 08/09/2026.
//
// Resumo do que vale onde:
//
//   nível de PÁGINA  og_title → meta_title → title   (vazio se resolve sozinho)
//   nível de SITE    og_title → title do site        (vazio PIORA)
//
// Por isso a home precisa de valor explícito nos dois cartões, e não de campo
// vazio. Estado atual, conferido no HTML servido: <title>, og:title e
// twitter:title servem os três "Villanova ESG — EU Buyer Evidence, Brazilian
// Suppliers".
//
// A home não é alcançável por este script: a rota "/" do routes.yaml cai no
// template home, que resolve pelas configurações do site, e /settings/ recusa
// escrita por token de integração (403 comprovado). Se um dia o título de
// busca da home mudar, os dois cartões têm de ser reescritos à mão em
// Settings → General → Meta data → abas "Facebook card" e "X card".
import crypto from 'node:crypto';

const modo = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';
const slugsPedidos = process.argv.slice(3);

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Faltam credenciais do Ghost da Villanova.');

// Token novo a cada chamada: o JWT do Ghost vale 5 minutos e este script pode
// percorrer dezenas de páginas.
const token = () => {
  const [id, secret] = adminKey.split(':');
  const agora = Math.floor(Date.now() / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const base = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  return `${base}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(base).digest('base64url')}`;
};
const cabecalhos = () => ({
  Authorization: `Ghost ${token()}`,
  'Accept-Version': 'v5.0',
  'Content-Type': 'application/json',
});

const api = async (metodo, caminho, corpo) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${caminho}`, {
    method: metodo,
    headers: cabecalhos(),
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

// Percorre todas as páginas (paginado) para não depender de uma lista escrita
// à mão, que envelhece.
const todasPaginas = async () => {
  const out = [];
  for (let pagina = 1; ; pagina++) {
    const r = await api('GET', `pages/?limit=100&page=${pagina}&fields=id,slug,title,meta_title,og_title,updated_at`);
    out.push(...(r.pages || []));
    if (!r.meta?.pagination?.next) break;
  }
  return out;
};

const paginas = await todasPaginas();
console.log(`Páginas no site: ${paginas.length}`);

const comOverride = paginas.filter((p) => (p.og_title || '').trim() !== '');
console.log(`Com og_title próprio (sobrescrevendo o título): ${comOverride.length}\n`);

for (const p of comOverride) {
  const efetivo = p.meta_title || p.title;
  const igual = (p.og_title || '').trim() === (efetivo || '').trim();
  console.log(`${igual ? '=' : '≠'} /${p.slug}/`);
  console.log(`    título : ${efetivo}`);
  console.log(`    og     : ${p.og_title}`);
}

const alvos = slugsPedidos.length
  ? comOverride.filter((p) => slugsPedidos.includes(p.slug))
  : comOverride.filter((p) => (p.og_title || '').trim() !== (p.meta_title || p.title || '').trim());

console.log(`\nA alinhar: ${alvos.length}`);
if (slugsPedidos.length) {
  const achados = new Set(alvos.map((p) => p.slug));
  for (const s of slugsPedidos) {
    if (!achados.has(s)) console.log(`AVISO: "${s}" não tem og_title próprio (ou não existe) — nada a fazer nele.`);
  }
}

if (modo === 'simular') {
  console.log('\nMODO SIMULAR — nada foi alterado.');
  process.exit(0);
}

let alinhados = 0;
for (const p of alvos) {
  // O Ghost exige o updated_at atual no PUT como trava contra escrita
  // concorrente; sem ele a API recusa.
  const atual = (await api('GET', `pages/${p.id}/?fields=id,updated_at`)).pages[0];
  await api('PUT', `pages/${p.id}/`, {pages: [{og_title: null, updated_at: atual.updated_at}]});
  console.log(`alinhado: /${p.slug}/ → og:title passa a ser "${p.meta_title || p.title}"`);
  alinhados++;
}

console.log(`\nAlinhados: ${alinhados}`);
console.log('O og:title agora é derivado do título, não uma segunda cópia dele.');
