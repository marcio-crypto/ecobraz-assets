// Corrige as URLs internas dentro dos dados estruturados (JSON-LD) que ficam
// no code injection das páginas e posts da Villanova ESG.
//
// Contexto: a rodada anterior (corrige-links-internos.mjs) arrumou os href do
// texto, mas de propósito não encosta em nada fora de href=. Sobraram 3
// ocorrências visíveis ao vivo — e a checagem do dump mostrou que o problema é
// maior: 198 referências em 54 itens, dentro do JSON-LD, apontando para URLs
// que hoje redirecionam. São os campos "@id", "url", "hasPart", "relatedLink" e
// as listas de itens. Para o Google e para os chats de IA isso é pior do que um
// link de texto errado: um "hasPart" apontando para um "#webpage" que não
// existe mais é um nó solto no grafo da marca.
//
// Uso: node corrige-schema-urls.mjs [simular|aplicar]
//   simular (padrão) — só relata o que mudaria, não grava nada
//   aplicar          — grava no Ghost
//
// Como mexe: NÃO faz troca cega de texto. Lê cada bloco
// <script type="application/ld+json">, interpreta como JSON, troca os caminhos,
// e só então regrava. Se algum bloco não for JSON válido, ele é deixado intacto
// e reportado — melhor não mexer do que quebrar o dado estruturado.
//
// Depois da troca faz a limpeza que a troca crua não faria:
//   - tira duplicatas criadas quando duas URLs antigas caem no mesmo destino;
//   - tira a auto-referência (a página se listando como parte de si mesma);
//   - renumera o "position" das listas para não ficar buraco.
//
// No fim, confere ao vivo o status de cada URL interna que continuar citada no
// JSON-LD — inclusive as que não estão na tabela de pares — para não sobrar
// referência para página apagada ou despublicada.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';
const ARQUIVO = 'site-villanova/content/links-internos-redirect.json';
const SITE = 'https://www.villanovaesg.com';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
// Token novo a cada chamada: o JWT do Ghost vale 5 min e a rotina é longa.
const headers = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  const token = `${base}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(base).digest('base64url')}`;
  return {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};
};
const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers: headers(), body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

const pares = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
const mapa = new Map(pares.map(({de, para}) => [de, para]));

// Separa uma string em (origem, caminho, âncora) quando ela for uma URL do site.
// Aceita a forma absoluta (com ou sem www) e a relativa.
const parte = (s) => {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(https?:\/\/(?:www\.)?villanovaesg\.com)?(\/[^#?\s"']*)(#[^\s"']*)?$/);
  if (!m) return null;
  if (!m[1] && !s.startsWith('/')) return null;
  return {absoluto: Boolean(m[1]), caminho: m[2], ancora: m[3] || ''};
};

const trocas = new Map();
const remapa = (s) => {
  const p = parte(s);
  if (!p) return s;
  const destino = mapa.get(p.caminho);
  if (!destino) return s;
  trocas.set(p.caminho, (trocas.get(p.caminho) || 0) + 1);
  return (p.absoluto ? SITE : '') + destino + p.ancora;
};

// Percorre o objeto inteiro trocando só os valores que são URL do próprio site.
const anda = (no) => {
  if (Array.isArray(no)) return no.map(anda);
  if (no && typeof no === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(no)) saida[k] = anda(v);
    return saida;
  }
  return typeof no === 'string' ? remapa(no) : no;
};

// Depois do remapeamento, duas entradas antes distintas podem virar a mesma.
const limpa = (no, urlPropria) => {
  if (Array.isArray(no)) {
    const vistos = new Set();
    const saida = [];
    for (const item of no.map((x) => limpa(x, urlPropria))) {
      const chave = JSON.stringify(item);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(item);
    }
    return saida;
  }
  if (no && typeof no === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(no)) saida[k] = limpa(v, urlPropria);
    // Uma lista não deve se listar como parte de si mesma.
    for (const campo of ['hasPart', 'relatedLink']) {
      if (Array.isArray(saida[campo])) {
        saida[campo] = saida[campo].filter((x) => {
          const alvo = typeof x === 'string' ? x : x?.['@id'] || x?.url;
          const p = parte(alvo || '');
          return !p || p.caminho !== urlPropria;
        });
      }
    }
    // Numa lista de conteúdos, a própria página não é item da lista. No
    // BreadcrumbList é o contrário: o último item É a página atual, e tirá-lo
    // quebraria a trilha — por isso o tipo é checado antes.
    const tipos = [].concat(saida['@type'] || []);
    if (Array.isArray(saida.itemListElement) && !tipos.includes('BreadcrumbList')) {
      saida.itemListElement = saida.itemListElement.filter((x) => {
        const alvo = typeof x === 'string' ? x : x?.url || x?.item?.['@id'] || x?.item?.url || x?.['@id'];
        const p = parte(alvo || '');
        return !p || p.caminho !== urlPropria;
      });
    }
    // Buracos na numeração confundem quem lê a lista: renumera do 1.
    if (Array.isArray(saida.itemListElement)) {
      saida.itemListElement.forEach((x, i) => {
        if (x && typeof x === 'object' && 'position' in x) x.position = i + 1;
      });
    }
    return saida;
  }
  return no;
};

// Guarda toda URL interna que sobrar citada, para conferir status no fim.
const citadas = new Map();
const anota = (no, slug) => {
  if (Array.isArray(no)) return no.forEach((x) => anota(x, slug));
  if (no && typeof no === 'object') return Object.values(no).forEach((x) => anota(x, slug));
  const p = parte(no);
  if (!p) return;
  if (!citadas.has(p.caminho)) citadas.set(p.caminho, new Set());
  citadas.get(p.caminho).add(slug);
};

// Fonte "dump" lê o export do repositório em vez da API: serve para conferir a
// transformação sem chave e sem risco, antes de rodar valendo.
const FONTE = process.argv[3] === 'dump' ? 'dump' : 'api';

const buscaTudo = async (tipo) => {
  if (FONTE === 'dump') return JSON.parse(await fs.readFile(`site-villanova/export/${tipo}.json`, 'utf8'));
  const itens = [];
  let pag = 1;
  for (;;) {
    const r = await api('GET', `${tipo}/?limit=50&page=${pag}&fields=id,slug,title,status,updated_at,codeinjection_head,codeinjection_foot`);
    itens.push(...r[tipo]);
    if (!r.meta?.pagination?.next) break;
    pag = r.meta.pagination.next;
  }
  return itens;
};

const BLOCO = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

console.log(`${mapa.size} destinos na tabela | modo: ${MODO}\n`);
let totalItens = 0, totalTrocas = 0, erros = 0, invalidos = 0;

for (const tipo of ['pages', 'posts']) {
  const itens = await buscaTudo(tipo);
  console.log(`--- ${tipo}: ${itens.length} itens ---`);
  for (const it of itens) {
    const urlPropria = `/${it.slug}/`;
    const campos = {};
    let trocasItem = 0;
    for (const campo of ['codeinjection_head', 'codeinjection_foot']) {
      const original = it[campo] || '';
      if (!original.includes('ld+json')) continue;
      let contou = 0;
      const novo = original.replace(BLOCO, (bloco, corpo) => {
        let dado;
        try {
          dado = JSON.parse(corpo);
        } catch {
          invalidos++;
          console.log(`  AVISO: JSON-LD inválido em /${it.slug}/ (${campo}) — deixado como está`);
          return bloco;
        }
        const marcaAntes = [...trocas.values()].reduce((a, b) => a + b, 0);
        const corrigido = limpa(anda(dado), urlPropria);
        contou += [...trocas.values()].reduce((a, b) => a + b, 0) - marcaAntes;
        anota(corrigido, it.slug);
        const texto = JSON.stringify(corrigido, null, 2);
        // Substituição por função: com string, um "$" dentro do JSON viraria
        // padrão especial ($&, $') e corromperia o bloco.
        return bloco.replace(corpo, () => `\n${texto}\n`);
      });
      if (contou) {
        campos[campo] = novo;
        trocasItem += contou;
      }
    }
    if (!trocasItem) continue;
    totalItens++; totalTrocas += trocasItem;
    // Quarto argumento opcional: imprime o resultado de um slug para conferir
    // o bloco com o olho antes de gravar valendo.
    if (process.argv[4] === it.slug) console.log(`\n----- ${it.slug} (resultado) -----\n${campos.codeinjection_head || campos.codeinjection_foot}\n-----`);
    console.log(`  ${String(trocasItem).padStart(3)} url(s)  /${it.slug}/  [${it.status}]`);
    if (MODO === 'aplicar' && FONTE === 'api') {
      try {
        await api('PUT', `${tipo}/${it.id}/`, {[tipo]: [{...campos, updated_at: it.updated_at}]});
        await espera(150);
      } catch (e) {
        erros++;
        console.log(`      ERRO ao gravar: ${e.message}`);
      }
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${totalTrocas} URLs corrigidas em ${totalItens} itens | erros: ${erros} | blocos inválidos: ${invalidos}`);
console.log('='.repeat(70));
console.log('\nPor caminho antigo:');
[...trocas.entries()].sort((a, b) => b[1] - a[1]).forEach(([de, n]) => console.log(`  ${String(n).padStart(4)}x  ${de} -> ${mapa.get(de)}`));

// Conferência final: o que continua citado no JSON-LD responde 200?
if (FONTE === 'dump') {
  console.log('\nFONTE DUMP — leitura do export do repositório, nada foi gravado e a conferência ao vivo foi pulada.');
  process.exit(0);
}
console.log(`\nConferindo ao vivo ${citadas.size} URLs internas citadas no JSON-LD...`);
const ruins = [];
for (const [caminho, slugs] of citadas) {
  try {
    const r = await fetch(SITE + caminho, {redirect: 'manual'});
    if (r.status < 200 || r.status >= 300) ruins.push({caminho, status: r.status, slugs: [...slugs]});
  } catch (e) {
    ruins.push({caminho, status: `erro: ${e.message}`, slugs: [...slugs]});
  }
}
if (!ruins.length) {
  console.log('Todas as URLs citadas respondem 200 direto.');
} else {
  console.log(`${ruins.length} URL(s) citadas que NÃO respondem 200 direto:`);
  ruins.sort((a, b) => b.slugs.length - a.slugs.length).forEach((r) => {
    console.log(`  [${r.status}] ${r.caminho}  (citada em ${r.slugs.length}: ${r.slugs.slice(0, 5).join(', ')}${r.slugs.length > 5 ? '…' : ''})`);
  });
}
if (MODO === 'simular') console.log('\nMODO SIMULAR — nada foi gravado.');
if (erros) process.exit(1);
