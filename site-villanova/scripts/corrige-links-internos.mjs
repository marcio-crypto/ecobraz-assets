// Troca, dentro do conteúdo, os links internos que ainda apontam para URLs
// que hoje redirecionam — passando a apontar direto para o destino final.
//
// Contexto: a consolidação de agosto criou 301 corretos, mas os links dentro
// dos textos continuaram apontando para os endereços antigos. A auditoria de
// 01/09/2026 achou 153 links assim, em 79 páginas. Cada um custa um salto a
// mais para o visitante e dilui o sinal que deveria chegar na página final.
//
// Uso: node corrige-links-internos.mjs [simular|aplicar]
//   simular (padrão) — só relata o que mudaria, não grava nada
//   aplicar          — grava no Ghost
//
// Segurança: mexe SOMENTE no atributo href. Não reescreve texto, não toca em
// estrutura e não usa ?source=html (que destruiria as classes do design).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const MODO = process.argv[2] === 'aplicar' ? 'aplicar' : 'simular';
const ARQUIVO = 'site-villanova/content/links-internos-redirect.json';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
// Token novo a cada chamada: o JWT do Ghost vale 5 min e esta rotina passa por
// centenas de itens — um token único morreria no meio.
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
const escapa = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const pares = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
// Ancora no href para não trocar texto solto que por acaso pareça uma URL.
// Cobre href="/x/", href=\"/x/\" (dentro do lexical) e a forma absoluta.
const regras = pares.map(({de, para}) => ({
  de, para,
  re: new RegExp(`(href=\\\\?["'])(?:https?://(?:www\\.)?villanovaesg\\.com)?${escapa(de)}`, 'g'),
}));
console.log(`${regras.length} destinos a corrigir | modo: ${MODO}\n`);

const buscaTudo = async (tipo) => {
  const itens = [];
  let pag = 1;
  for (;;) {
    const r = await api('GET', `${tipo}/?limit=50&page=${pag}&formats=lexical&fields=id,slug,title,status,updated_at`);
    itens.push(...r[tipo]);
    if (!r.meta?.pagination?.next) break;
    pag = r.meta.pagination.next;
  }
  return itens;
};

let totalTrocas = 0, totalItens = 0, erros = 0;
const porDestino = new Map();

for (const tipo of ['pages', 'posts']) {
  const itens = await buscaTudo(tipo);
  console.log(`--- ${tipo}: ${itens.length} itens ---`);
  for (const it of itens) {
    const original = it.lexical || '';
    if (!original) continue;
    let texto = original;
    let trocasItem = 0;
    for (const {de, para, re} of regras) {
      texto = texto.replace(re, (m, pre) => {
        trocasItem++;
        porDestino.set(de, (porDestino.get(de) || 0) + 1);
        return pre + para;
      });
    }
    if (!trocasItem) continue;
    totalItens++; totalTrocas += trocasItem;
    console.log(`  ${trocasItem.toString().padStart(3)} link(s)  /${it.slug}/  [${it.status}]`);
    if (MODO === 'aplicar') {
      try {
        await api('PUT', `${tipo}/${it.id}/`, {[tipo]: [{lexical: texto, updated_at: it.updated_at}]});
        await espera(150);
      } catch (e) {
        erros++;
        console.log(`      ERRO ao gravar: ${e.message}`);
      }
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`${totalTrocas} links corrigidos em ${totalItens} itens | erros: ${erros}`);
console.log('='.repeat(70));
console.log('\nPor destino antigo:');
[...porDestino.entries()].sort((a, b) => b[1] - a[1]).forEach(([de, n]) => console.log(`  ${String(n).padStart(4)}x  ${de}`));
const naoUsadas = regras.filter((r) => !porDestino.has(r.de)).map((r) => r.de);
if (naoUsadas.length) {
  console.log(`\n${naoUsadas.length} destino(s) sem nenhum link no conteúdo (já limpos ou vindos de menu/tema):`);
  naoUsadas.forEach((d) => console.log('  ' + d));
}
if (MODO === 'simular') console.log('\nMODO SIMULAR — nada foi gravado.');
if (erros) process.exit(1);
