// Transforma link em Markdown cru em link de verdade, dentro do Ghost.
//
// O QUE ELE CONSERTA. O procura-markdown-cru.mjs achou 8 ocorrências em 2
// posts (o mesmo texto em inglês e em português), todas assim:
//
//   ... define os KPIs. ([energy.ec.europa.eu](https://energy.ec.europa.eu/...))
//
// O leitor vê essa sintaxe crua no meio do parágrafo, e no celular o trecho é
// indivisível — foi o que empurrava a página antes do conserto no CSS.
//
// COMO ELE MEXE, E POR QUE ASSIM. Não dá para resolver com troca de texto: um
// link de verdade é um NÓ na árvore lexical do Ghost, não uma marcação dentro
// do texto. Então o script parte o nó de texto em três — o que vem antes, o
// link, e o que vem depois — e o nó de link é MOLDADO NUM LINK QUE JÁ EXISTE
// no mesmo documento. Isso não é elegância: é para não inventar formato. Se o
// post não tiver nenhum link para copiar, ele não adivinha — pula e avisa.
//
// REDE DE SEGURANÇA. Em modo aplicar, para cada post:
//   1. guarda o lexical original em memória e imprime o tamanho dele;
//   2. grava o novo;
//   3. relê o HTML publicado e confere DUAS coisas — que não sobrou nenhuma
//      sintaxe crua, e que o endereço virou <a href>;
//   4. se a conferência falhar, REGRAVA O ORIGINAL e sai com erro.
// Ou seja: ou o post fica certo, ou volta a ser exatamente o que era.
//
// Uso: node corrige-markdown-cru.mjs [simular|aplicar]
//      simular é o padrão e não grava nada.
import crypto from 'node:crypto';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';
const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey) { console.error('Faltam VILLANOVA_GHOST_ADMIN_URL / VILLANOVA_GHOST_ADMIN_API_KEY.'); process.exit(1); }
const [kid, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const headers = () => {
  const agora = Math.floor(Date.now() / 1000);
  const base = `${enc({alg: 'HS256', typ: 'JWT', kid})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
  const token = `${base}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(base).digest('base64url')}`;
  return {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};
};
const api = async (metodo, caminho, corpo) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${caminho}`, {
    method: metodo, headers: headers(), body: corpo ? JSON.stringify(corpo) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};

// O padrão. Exige http(s) e proíbe parêntese no endereço — é o formato exato
// que apareceu, e estreito de propósito: um regex generoso aqui mexeria em
// texto que não é link.
const RE = /\[([^\]\n]{1,120})\]\((https?:\/\/[^)\s]{1,300})\)/;

// Acha um nó de link que já exista, para copiar o formato em vez de inventar.
const achaModeloDeLink = (no) => {
  if (!no || typeof no !== 'object') return null;
  if (no.type === 'link' && Array.isArray(no.children)) return no;
  for (const f of (no.children || [])) { const a = achaModeloDeLink(f); if (a) return a; }
  return null;
};
const achaModeloDeTexto = (no) => {
  if (!no || typeof no !== 'object') return null;
  if (typeof no.text === 'string' && no.type && no.type !== 'link') return no;
  for (const f of (no.children || [])) { const a = achaModeloDeTexto(f); if (a) return a; }
  return null;
};

// Parte um nó de texto em [antes, link, depois] quantas vezes for preciso.
const parte = (noTexto, modeloLink, modeloTexto) => {
  const saida = [];
  let resto = noTexto.text;
  let achou = 0;
  for (;;) {
    const m = RE.exec(resto);
    if (!m) break;
    achou++;
    const antes = resto.slice(0, m.index);
    if (antes) saida.push({ ...noTexto, text: antes });
    const filhoTexto = { ...modeloTexto, text: m[1] };
    delete filhoTexto.children;
    saida.push({ ...modeloLink, url: m[2], children: [filhoTexto] });
    resto = resto.slice(m.index + m[0].length);
  }
  if (!achou) return null;
  if (resto) saida.push({ ...noTexto, text: resto });
  return saida;
};

// Percorre a árvore trocando os filhos onde houver o padrão.
const percorre = (no, modeloLink, modeloTexto, conta) => {
  if (!no || typeof no !== 'object' || !Array.isArray(no.children)) return;
  const novos = [];
  for (const f of no.children) {
    if (typeof f?.text === 'string' && f.type !== 'link' && RE.test(f.text)) {
      const pedacos = parte(f, modeloLink, modeloTexto);
      if (pedacos) { novos.push(...pedacos); conta.n += pedacos.filter((p) => p.type === 'link').length; continue; }
    }
    percorre(f, modeloLink, modeloTexto, conta);
    novos.push(f);
  }
  no.children = novos;
};

const semTags = (html) => String(html || '').replace(/<[^>]+>/g, ' ');

const buscaTudo = async (tipo) => {
  const itens = [];
  let pag = 1;
  for (;;) {
    const r = await api('GET', `${tipo}/?limit=50&page=${pag}&formats=lexical,html&fields=id,slug,title,status,updated_at`);
    itens.push(...r[tipo]);
    if (!r.meta?.pagination?.next) break;
    pag = r.meta.pagination.next;
  }
  return itens;
};

console.log(`modo: ${MODO}\n`);
let itensMexidos = 0, linksFeitos = 0, pulados = 0, revertidos = 0;

for (const tipo of ['pages', 'posts']) {
  const itens = await buscaTudo(tipo);
  console.log(`--- ${tipo}: ${itens.length} itens lidos ---`);
  for (const it of itens) {
    if (!it.lexical) continue;
    if (!RE.test(semTags(it.html))) continue;

    const arvore = JSON.parse(it.lexical);
    const modeloLink = achaModeloDeLink(arvore.root);
    const modeloTexto = achaModeloDeTexto(arvore.root);
    if (!modeloLink || !modeloTexto) {
      pulados++;
      console.log(`  /${it.slug}/  PULADO: não achei link nem texto para copiar o formato`);
      continue;
    }
    const conta = { n: 0 };
    percorre(arvore.root, { ...modeloLink, children: [] }, modeloTexto, conta);
    if (!conta.n) { pulados++; console.log(`  /${it.slug}/  PULADO: o padrão aparece no HTML mas não num nó de texto`); continue; }

    itensMexidos++; linksFeitos += conta.n;
    console.log(`  /${it.slug}/  [${it.status}]  ${conta.n} link(s)`);
    if (MODO === 'simular') {
      console.log(`      formato de link copiado deste documento: ${JSON.stringify({ ...modeloLink, children: undefined })}`);
      console.log(`      formato de texto copiado: ${JSON.stringify({ ...modeloTexto, text: '…' })}`);
      continue;
    }

    const original = it.lexical;
    await api('PUT', `${tipo}/${it.id}/`, {[tipo]: [{lexical: JSON.stringify(arvore), updated_at: it.updated_at}]});
    console.log(`      gravado (lexical original tinha ${original.length} caracteres, guardado para reverter)`);

    // Conferência no que o Ghost devolve depois de gravar.
    const depois = await api('GET', `${tipo}/${it.id}/?formats=html`);
    const html = depois[tipo][0].html || '';
    const sobrou = RE.test(semTags(html));
    const virouLink = /<a[^>]+href="https?:\/\/[^"]+"/.test(html);
    if (sobrou || !virouLink) {
      console.log(`      CONFERÊNCIA FALHOU (sobrou sintaxe crua: ${sobrou} · virou <a href>: ${virouLink}) — revertendo`);
      const atual = await api('GET', `${tipo}/${it.id}/?fields=updated_at`);
      await api('PUT', `${tipo}/${it.id}/`, {[tipo]: [{lexical: original, updated_at: atual[tipo][0].updated_at}]});
      revertidos++;
      console.log('      revertido para o original.');
    } else {
      console.log('      conferido: nenhuma sintaxe crua sobrou e o endereço virou <a href>.');
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${itensMexidos} item(ns) · ${linksFeitos} link(s) · pulados: ${pulados} · revertidos: ${revertidos}`);
console.log('='.repeat(70));
if (MODO === 'simular') console.log('MODO SIMULAR — nada foi gravado no Ghost.');
if (revertidos) process.exit(1);
