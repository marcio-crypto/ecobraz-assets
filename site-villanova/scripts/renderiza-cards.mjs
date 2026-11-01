// Renderiza os cartões 1200x627 da campanha de LinkedIn e, opcionalmente, sobe
// cada um para a biblioteca de imagens do Ghost da Villanova.
//
//   node site-villanova/scripts/renderiza-cards.mjs \
//     --posts site-villanova/campanhas/VESG-LI-2026-11/content/posts.json \
//     --tpl   site-villanova/design/card-campanha.html \
//     --out   /tmp/cards [--upload] [--so A01,S01]
//
// POR QUE NÃO É O renderiza-og.mjs. Aquele chama o Chromium pela linha de
// comando e corta 88px de cromo do PNG na mão — solução correta para UMA peça.
// Aqui são 60: abrir o navegador 60 vezes custa minutos e o corte manual
// multiplica o risco por 60. Este usa o Playwright, que já está instalado no
// ambiente, abre o navegador UMA vez e tira 60 fotos com viewport exato. A
// arte e os tokens continuam sendo os mesmos do PADRAO.md — muda a mecânica,
// não o padrão.
//
// O QUE O --upload FAZ, E O QUE ELE NÃO FAZ. Sobe o PNG para o Ghost e devolve
// a URL pública em villanovaesg.com. Ele NÃO mexe no Metricool: anexar a
// imagem ao post agendado é outro passo, feito pelo conector do Metricool com
// as URLs deste manifesto. Separado de propósito: subir imagem é reversível,
// alterar post agendado é publicação.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const arg = (nome, padrao = null) => {
  const i = process.argv.indexOf(nome);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
};
const CAMINHO_POSTS = arg('--posts', 'site-villanova/campanhas/VESG-LI-2026-11/content/posts.json');
const CAMINHO_TPL = arg('--tpl', 'site-villanova/design/card-campanha.html');
const SAIDA = arg('--out', 'out/cards');
const SUBIR = process.argv.includes('--upload');
const SO = (arg('--so', '') || '').split(',').map((s) => s.trim()).filter(Boolean);

// Pilar por semana e nome do serviço por slug: vêm do pacote da campanha
// (docs/04_DESIGN_SYSTEM.md). Ficam aqui porque são rótulo de ARTE, não
// conteúdo — o texto do post não muda por causa deles.
const PILAR_POR_SEMANA = {
  W1: 'SUPPLIER EVIDENCE', W2: 'CBAM', W3: 'EUDR', W4: 'CSDDD · CONTRACTS', W5: 'SCOPE 3',
};
const SERVICO_POR_SLUG = {
  'supplier-evidence-risk-intake': 'SCOPE ASSESSMENT',
  'solicitar-analise': 'AVALIAÇÃO DE ESCOPO',
  'supplier-evidence-file-assessment': 'SUPPLIER EVIDENCE REVIEW',
  'revisao-evidencias-eudr-cbam-csddd-exportadores': 'REVISÃO DE EVIDÊNCIAS',
  'contract-clause-risk-review-eu-facing-suppliers': 'CONTRACT CLAUSE RISK REVIEW',
  'cbam-evidence-review-brazilian-suppliers': 'CBAM EVIDENCE REVIEW',
  'eudr-evidence-readiness-review': 'EUDR EVIDENCE READINESS REVIEW',
  'eu-brazil-supply-chain-risk-review': 'EU–BRAZIL SUPPLY CHAIN RISK REVIEW',
  'scope-3-brazil-programme': 'SCOPE 3 BRAZIL PROGRAMME',
  'continuous-evidence-management': 'CONTINUOUS EVIDENCE MANAGEMENT',
  'for-european-buyers': 'FOR EUROPEAN BUYERS',
  'supplier-evidence-maturity-model': 'SEMM',
};

const escapa = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// O "hook" é a frase que vai grande no cartão. Regra do pacote: campo
// card_hook quando existir; senão a primeira linha útil do texto, sem a linha
// "Evidence Note NN/30" (que já vira rótulo), cortada em 110 caracteres SEM
// partir palavra.
function hook(p) {
  if (p.card_hook) return p.card_hook;
  let linhas = p.text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (p.front === 'authority' && linhas[0] && linhas[0].startsWith('Evidence Note')) linhas = linhas.slice(1);
  let h = (linhas[0] || '').replace(/\s+/g, ' ');
  if (h.length > 110) h = h.slice(0, 110).replace(/\s+\S*$/, '').replace(/[.,;:—-]+$/, '') + '…';
  return h;
}

function monta(tpl, p) {
  const h = hook(p);
  const ctx = { variant: p.front, hookclass: h.length > 80 ? 'long' : '', hook: escapa(h) };
  if (p.front === 'authority') {
    const m = p.text.match(/^Evidence Note (\d+\/\d+)/);
    ctx.label = m ? `EVIDENCE NOTE ${m[1]}` : 'EVIDENCE NOTE';
    ctx.pill = PILAR_POR_SEMANA[p.week] || '';
    ctx.cta = ''; ctx.site = '';
  } else {
    const slug = (p.link || '').replace(/\/+$/, '').split('/').pop();
    ctx.label = SERVICO_POR_SLUG[slug] || 'SUPPLIER EVIDENCE REVIEW';
    ctx.cta = p.lang === 'pt' ? 'Envie o pedido do comprador →' : 'Send the request you received →';
    ctx.pill = ''; ctx.site = '1';
  }
  let out = tpl;
  // Blocos opcionais {{#chave}}…{{/chave}}: somem quando o valor é vazio.
  for (const k of ['cta', 'pill', 'site']) {
    const re = new RegExp(`\\{\\{#${k}\\}\\}([\\s\\S]*?)\\{\\{/${k}\\}\\}`, 'g');
    out = out.replace(re, ctx[k] ? '$1' : '');
  }
  for (const [k, v] of Object.entries(ctx)) out = out.replaceAll(`{{${k}}}`, String(v));
  return { html: out, alt: h };
}

// --- Ghost: token de 5 minutos, igual ao deploy-theme.mjs ---
function tokenGhost(chave) {
  const [id, segredo] = chave.split(':');
  const agora = Math.floor(Date.now() / 1000);
  const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const base = `${enc({ alg: 'HS256', typ: 'JWT', kid: id })}.${enc({ iat: agora, exp: agora + 300, aud: '/admin/' })}`;
  return `${base}.${crypto.createHmac('sha256', Buffer.from(segredo, 'hex')).update(base).digest('base64url')}`;
}

async function sobeParaGhost(arquivo, nome) {
  const url = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
  const chave = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
  if (!url || !chave.includes(':')) throw new Error('Credenciais do Ghost da Villanova ausentes.');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(arquivo)], { type: 'image/png' }), nome);
  form.append('purpose', 'image');
  const r = await fetch(`${url}/ghost/api/admin/images/upload/`, {
    method: 'POST',
    headers: { Authorization: `Ghost ${tokenGhost(chave)}`, 'Accept-Version': 'v5.0' },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Upload de ${nome} falhou (${r.status}): ${txt.slice(0, 300)}`);
  const u = JSON.parse(txt).images?.[0]?.url;
  if (!u) throw new Error(`Upload de ${nome} não devolveu URL: ${txt.slice(0, 200)}`);
  return u;
}

const posts = JSON.parse(fs.readFileSync(CAMINHO_POSTS, 'utf8')).posts
  .filter((p) => (SO.length ? SO.includes(p.id) : true));
const tpl = fs.readFileSync(CAMINHO_TPL, 'utf8');
fs.mkdirSync(SAIDA, { recursive: true });

// O Playwright é resolvido de dois jeitos porque ele vive em dois lugares: no
// Actions é instalado no diretório de trabalho (import normal resolve), e no
// ambiente de desenvolvimento fica em /opt/node-tools, que só o resolvedor de
// CommonJS enxerga — `import('playwright')` ali falha com ERR_MODULE_NOT_FOUND.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire('/opt/node-tools/package.json');
  return req('playwright');
});
const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: 1 });

const manifesto = {};
for (const p of posts) {
  const { html, alt } = monta(tpl, p);
  await pagina.setContent(html, { waitUntil: 'load' });
  const arquivo = path.join(SAIDA, `${p.id}.png`);
  await pagina.screenshot({ path: arquivo, clip: { x: 0, y: 0, width: 1200, height: 627 } });
  const kb = fs.statSync(arquivo).size / 1024;
  // O LinkedIn aceita bem acima disso, mas o pacote pede ≤1 MB e cartão de
  // texto que passa de 1 MB é sinal de arte errada (foto, gradiente ruidoso).
  if (kb > 1024) console.log(`  ATENÇÃO: ${p.id}.png tem ${kb.toFixed(0)} kB, acima de 1 MB`);
  manifesto[p.id] = { arquivo, alt, kb: Number(kb.toFixed(1)) };
  if (SUBIR) {
    manifesto[p.id].url = await sobeParaGhost(arquivo, `vesg-li-2026-11-${p.id}.png`);
    console.log(`${p.id}  ${kb.toFixed(0)} kB  ${manifesto[p.id].url}`);
  } else {
    console.log(`${p.id}  ${kb.toFixed(0)} kB  ${arquivo}`);
  }
}
await navegador.close();

const caminhoManifesto = path.join(SAIDA, 'manifest.json');
fs.writeFileSync(caminhoManifesto, JSON.stringify(manifesto, null, 2) + '\n');
console.log(`\n${Object.keys(manifesto).length} cartões · manifesto em ${caminhoManifesto}`);
if (SUBIR) {
  // Impresso inteiro no log de propósito: é daqui que as URLs são lidas para
  // anexar no Metricool, e artefato de Action expira.
  console.log('\n===== MANIFESTO (id → url) =====');
  console.log(JSON.stringify(Object.fromEntries(Object.entries(manifesto).map(([k, v]) => [k, v.url])), null, 0));
}
