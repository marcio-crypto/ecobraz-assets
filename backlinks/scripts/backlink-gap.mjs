#!/usr/bin/env node
// Monitor de backlinks: compara os alvos de backlinks/alvos.csv com os
// referring domains reais (API Ahrefs v3) e atualiza as colunas de status.
// Também detecta domínios de spam novos que ainda não estão nos rascunhos
// de disavow. Uso:
//   AHREFS_API_KEY=... node backlinks/scripts/backlink-gap.mjs
// Custo aproximado: ~2 unidades de API por referring domain retornado
// (limite de 1000 por site), dentro da cota mensal do plano Lite (100k).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = {
  ecobraz: 'ecobraz.org',
  villanova: 'villanovaesg.com',
};
const API_KEY = process.env.AHREFS_API_KEY;
if (!API_KEY) {
  console.error('Defina AHREFS_API_KEY no ambiente.');
  process.exit(1);
}

async function refdomains(target) {
  const params = new URLSearchParams({
    target,
    mode: 'subdomains',
    history: 'live',
    select: 'domain,domain_rating,is_spam,dofollow_links',
    order_by: 'domain_rating:desc',
    limit: '1000',
    output: 'json',
  });
  const res = await fetch(`https://api.ahrefs.com/v3/site-explorer/refdomains?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Ahrefs ${target}: HTTP ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.refdomains ?? [];
}

// Parser de CSV simples com suporte a aspas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

function toCsv(rows) {
  const esc = v => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
}

// O alvo "business.google.com" nunca aparece como referring domain (link nofollow
// via perfil); domínios assim são conferidos manualmente — o script não mexe
// em status "verificar", "tem_pagina", "nao_aplica" nem "descartado".
const MANUAL_STATUS = new Set(['nao_aplica', 'descartado', 'tem_pagina', 'verificar']);

function domainMatches(refdomain, alvo) {
  return refdomain === alvo || refdomain.endsWith('.' + alvo) || alvo.endsWith('.' + refdomain);
}

const refs = {};
for (const [empresa, site] of Object.entries(TARGETS)) {
  refs[empresa] = await refdomains(site);
  console.log(`${site}: ${refs[empresa].length} referring domains ao vivo`);
}

const csvPath = join(ROOT, 'alvos.csv');
const rows = parseCsv(readFileSync(csvPath, 'utf8'));
const header = rows[0];
const col = name => header.indexOf(name);
const iDominio = col('dominio');
const statusCol = { ecobraz: col('status_ecobraz'), villanova: col('status_villanova') };

const mudancas = [];
for (const row of rows.slice(1)) {
  const alvo = row[iDominio].replace(/^www\./, '');
  for (const empresa of Object.keys(TARGETS)) {
    const atual = row[statusCol[empresa]];
    if (MANUAL_STATUS.has(atual)) continue;
    const linkado = refs[empresa].some(r => domainMatches(r.domain.replace(/^www\./, ''), alvo));
    const novo = linkado ? 'tem_link' : 'pendente';
    if (novo !== atual) {
      mudancas.push(`- ${alvo} (${empresa}): ${atual} -> ${novo}`);
      row[statusCol[empresa]] = novo;
    }
  }
}
writeFileSync(csvPath, toCsv(rows));

// Spam novo: domínios is_spam que ainda não estão no rascunho de disavow.
const spamNovo = {};
for (const [empresa, site] of Object.entries(TARGETS)) {
  const disavowPath = join(ROOT, 'disavow', `${site}.txt`);
  let conhecidos = new Set();
  try {
    conhecidos = new Set(
      readFileSync(disavowPath, 'utf8').split('\n')
        .filter(l => l.startsWith('domain:')).map(l => l.slice(7).trim())
    );
  } catch { /* arquivo ainda não existe */ }
  spamNovo[site] = refs[empresa]
    .filter(r => r.is_spam && !conhecidos.has(r.domain))
    .map(r => `${r.domain} (DR ${r.domain_rating})`);
}

// Pendências P0/P1 por empresa.
const iPrio = col('prioridade');
const pendencias = rows.slice(1)
  .filter(r => ['P0', 'P1'].includes(r[iPrio]))
  .filter(r => r[statusCol.ecobraz] === 'pendente' || r[statusCol.villanova] === 'pendente')
  .map(r => `- **${r[iDominio]}** (${r[iPrio]}): ecobraz=${r[statusCol.ecobraz]}, villanova=${r[statusCol.villanova]}`);

const hoje = new Date().toISOString().slice(0, 10);
const relatorio = [
  `# Monitor de backlinks — ${hoje}`,
  '',
  `Referring domains ao vivo: ecobraz.org = ${refs.ecobraz.length}, villanovaesg.com = ${refs.villanova.length}.`,
  '',
  '## Mudanças de status detectadas',
  mudancas.length ? mudancas.join('\n') : 'Nenhuma.',
  '',
  '## Oportunidades P0/P1 ainda pendentes',
  pendencias.length ? pendencias.join('\n') : 'Nenhuma — parabéns.',
  '',
  '## Spam novo (fora dos rascunhos de disavow)',
  ...Object.entries(spamNovo).map(([site, lista]) =>
    `### ${site}\n${lista.length ? lista.map(d => `- ${d}`).join('\n') : 'Nenhum novo.'}`),
  '',
].join('\n');

mkdirSync(join(ROOT, 'relatorios'), { recursive: true });
const relPath = join(ROOT, 'relatorios', `${hoje}-gap.md`);
writeFileSync(relPath, relatorio);
console.log(relatorio);
console.log(`Relatório salvo em ${relPath}`);
