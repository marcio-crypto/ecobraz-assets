import fs from 'node:fs/promises';

const baseUrl = String(process.argv[2] || 'https://ecobraz-emigre.ghost.io').replace(/\/$/, '');
const file = process.argv[3] || 'migration/legacy-url-inventory.csv';
const limit = Number(process.argv[4] || 250);
const redirects = file.endsWith('.yaml')
  ? loadFromRedirectsYaml(await fs.readFile(file, 'utf8'), limit)
  : loadFromCsv(await fs.readFile(file, 'utf8'), limit);

function loadFromCsv(text, max) {
  const rows = parseCsv(text);
  const headers = rows.shift();
  const column = Object.fromEntries(headers.map((name, index) => [name, index]));
  const sourceOf = (columns) => {
    if (column.caminho_original !== undefined) return decodeURIComponent(columns[column.caminho_original]);
    return decodeURIComponent(new URL(columns[column.url_antiga]).pathname);
  };
  const seen = new Set();
  return rows
    .filter((columns) => columns[column.acao] === '301')
    .map((columns) => ({
      source: sourceOf(columns),
      target: columns[column.destino_novo],
      clicks: Number(columns[column.cliques_90d] || 0),
      impressions: Number(columns[column.impressoes_90d] || 0),
    }))
    .filter(({source}) => !seen.has(source) && seen.add(source))
    .sort((a,b) => b.clicks-a.clicks || b.impressions-a.impressions || a.source.localeCompare(b.source))
    .slice(0, max);
}

function loadFromRedirectsYaml(text, max) {
  const rules = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s{2}("(?:[^"\\]|\\.)*"):\s+("(?:[^"\\]|\\.)*")\s*$/);
    if (!match) continue;
    const pattern = JSON.parse(match[1]);
    const target = JSON.parse(match[2]);
    const literal = pattern.match(/^\^((?:\\.|[^\\.*+?^${}()|[\]])*)\/\?\$$/);
    if (!literal) continue;
    const source = literal[1].replace(/\\(.)/g, '$1');
    if (!source.startsWith('/')) continue;
    rules.push({source, target, clicks: 0, impressions: 0});
  }
  if (rules.length <= max) return rules;
  const step = rules.length / max;
  const sample = [];
  for (let index = 0; index < max; index += 1) sample.push(rules[Math.floor(index * step)]);
  return sample;
}

const errors = [];
for (let index = 0; index < redirects.length; index += 8) {
  const batch = redirects.slice(index, index + 8);
  await Promise.all(batch.map(async ({source,target}) => {
    try {
      const response = await fetch(`${baseUrl}${source}`, {redirect:'manual'});
      const location = response.headers.get('location');
      const actual = location ? normalizePath(new URL(location, baseUrl).pathname) : '';
      const expected = normalizePath(new URL(target, baseUrl).pathname);
      if (response.status !== 301) errors.push(`${source}: expected 301, received ${response.status}`);
      if (actual !== expected) errors.push(`${source}: expected ${expected}, received ${actual || '(no location)'}`);
      if (response.status === 301 && actual === expected) {
        const targetResponse = await fetch(`${baseUrl}${expected}`, {redirect:'follow'});
        if (!targetResponse.ok) errors.push(`${source}: target ${expected} returned ${targetResponse.status}`);
        else console.log(`PASS ${source} -> ${expected}`);
      }
    } catch (error) {
      errors.push(`${source}: ${error.message}`);
    }
  }));
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`All ${redirects.length} priority live redirects passed.`);

function normalizePath(pathname) {
  return pathname === '/' ? '/' : `${pathname.replace(/\/+$/, '')}/`;
}

function parseCsv(input) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''));
      if (record.some(Boolean)) records.push(record);
      record = [];
      field = '';
    } else field += character;
  }
  if (field || record.length) {
    record.push(field.replace(/\r$/, ''));
    records.push(record);
  }
  return records;
}
