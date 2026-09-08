// Corrige os dados estruturados das paginas de arquivo de tag da Villanova ESG.
//
// Uso: node corrige-schema-tags.mjs [simular|aplicar]
//
// O que estava errado, comprovado com o mostra-schema.mjs em 08/09/2026:
//
//   "@type": "Series"
//
// "Series" existe no schema.org, mas e um tipo ABSTRATO — a classe pai de
// CreativeWorkSeries e afins. Nao e para ser usado direto, e os validadores
// recusam. E esse o "Schema.org validation error" que a auditoria de 01/09
// apontou nas 7 paginas de tag. Uma pagina de arquivo que lista artigos de um
// tema e CollectionPage.
//
// De quebra, o bloco redefinia a Organization inteira dentro de "publisher",
// com nome, url e logo proprios — uma QUARTA definicao da mesma empresa na
// mesma pagina, alem das duas que ja brigavam entre o tema e o code injection
// do site. Aqui ela passa a ser apenas uma referencia por "@id" ao no que ja
// existe, que e como o resto do site faz.
//
// Nao inventa conteudo: nome, url, descricao e mainEntityOfPage seguem os que
// ja estavam la. Modo simular e o padrao.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';
const SITE = 'https://www.villanovaesg.com';
const ORG = `${SITE}/#organization`;
const WEBSITE = `${SITE}/#website`;

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const headers = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  const token = `${base}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(base).digest('base64url')}`;
  return {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};
};
const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {
    method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

const BLOCO = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

// Troca o tipo abstrato pelo concreto e enxuga o publisher.
const conserta = (no, slug) => {
  const tipos = [].concat(no?.['@type'] || []);
  if (!tipos.includes('Series')) return null;
  const url = no.url || `${SITE}/tag/${slug}/`;
  const novo = {
    ...no,
    '@type': 'CollectionPage',
    '@id': `${SITE}/tag/${slug}/#webpage`,
    url,
    isPartOf: {'@id': WEBSITE},
    publisher: {'@id': ORG},
  };
  // mainEntityOfPage repetindo a propria url nao acrescenta nada depois que o
  // no ganhou "@id" e "url" — o proprio "@id" ja cumpre esse papel.
  if (typeof novo.mainEntityOfPage === 'string' && novo.mainEntityOfPage === url) delete novo.mainEntityOfPage;
  return novo;
};

const tags = [];
let pag = 1;
for (;;) {
  const r = await api('GET', `tags/?limit=100&page=${pag}&fields=id,slug,name,updated_at,codeinjection_head`);
  tags.push(...r.tags);
  if (!r.meta?.pagination?.next) break;
  pag = r.meta.pagination.next;
}
console.log(`${tags.length} tags no Ghost | modo: ${MODO}\n`);

let corrigidas = 0, erros = 0, invalidos = 0;

for (const tag of tags) {
  const original = tag.codeinjection_head || '';
  if (!original.includes('ld+json')) continue;
  let mudou = false;

  const novo = original.replace(BLOCO, (bloco, corpo) => {
    let dado;
    try {
      dado = JSON.parse(corpo);
    } catch {
      invalidos++;
      console.log(`  AVISO: JSON-LD invalido em tag/${tag.slug} — deixado como esta`);
      return bloco;
    }
    const consertado = conserta(dado, tag.slug);
    if (!consertado) return bloco;
    mudou = true;
    const texto = JSON.stringify(consertado, null, 2);
    // Substituicao por funcao: com string, um "$" no JSON viraria padrao especial.
    return bloco.replace(corpo, () => `\n${texto}\n`);
  });

  if (!mudou) { console.log(`ok (sem Series): tag/${tag.slug}`); continue; }
  corrigidas++;
  console.log(`CORRIGIR tag/${tag.slug}  —  Series -> CollectionPage, publisher por @id`);
  if (MODO === 'aplicar') {
    try {
      await api('PUT', `tags/${tag.id}/`, {tags: [{codeinjection_head: novo, updated_at: tag.updated_at}]});
      await espera(200);
    } catch (e) {
      erros++;
      console.log(`      ERRO ao gravar: ${e.message}`);
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${corrigidas} tag(s) corrigidas | erros: ${erros} | blocos invalidos: ${invalidos}`);
console.log('='.repeat(70));
if (MODO === 'simular') console.log('\nMODO SIMULAR — nada foi gravado.');
if (erros) process.exit(1);
