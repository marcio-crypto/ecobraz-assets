import fs from 'node:fs/promises';

const baseUrl = String(process.argv[2] || 'https://ecobraz-emigre.ghost.io').replace(/\/$/, '');
const file = process.argv[3] || 'migration/legacy-url-inventory.csv';
const limit = Number(process.argv[4] || 250);
const rows = (await fs.readFile(file, 'utf8')).trim().split(/\r?\n/).slice(1);
const seen = new Set();
const redirects = rows
  .map((row) => row.split(','))
  .filter((columns) => columns[6] === '301')
  .map((columns) => ({source:decodeURIComponent(columns[4]),target:columns[7],clicks:Number(columns[9] || 0),impressions:Number(columns[10] || 0)}))
  .filter(({source}) => !seen.has(source) && seen.add(source))
  .sort((a,b) => b.clicks-a.clicks || b.impressions-a.impressions || a.source.localeCompare(b.source))
  .slice(0,limit);

const errors = [];
for (let index = 0; index < redirects.length; index += 8) {
  const batch = redirects.slice(index, index + 8);
  await Promise.all(batch.map(async ({source,target}) => {
    const response = await fetch(`${baseUrl}${source}`, {redirect:'manual'});
    const location = response.headers.get('location');
    const actual = location ? new URL(location, baseUrl).pathname : '';
    const expected = new URL(target, baseUrl).pathname;
    if (response.status !== 301) errors.push(`${source}: expected 301, received ${response.status}`);
    if (actual !== expected) errors.push(`${source}: expected ${expected}, received ${actual || '(no location)'}`);
    if (response.status === 301 && actual === expected) console.log(`PASS ${source} -> ${expected}`);
  }));
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log(`All ${redirects.length} priority live redirects passed.`);
