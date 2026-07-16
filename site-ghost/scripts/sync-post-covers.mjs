// Gera capas ilustradas (1200x675, WebP) para os artigos do blog e aplica em
// cada post via Ghost Admin API. Cada capa usa a identidade da marca, um ícone
// ligado ao assunto e o título do artigo. Idempotente: posts cuja capa atual já
// corresponde à versão gerada são pulados.
//
// Uso:
//   node sync-post-covers.mjs content/priority-posts.json            (gera + aplica)
//   node sync-post-covers.mjs content/priority-posts.json --render-only <dir>
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCanvas, GlobalFonts, Path2D} from '@napi-rs/canvas';

const DESIGN_VERSION = 1;
const W = 1200, H = 675;
const file = process.argv[2] || 'site-ghost/content/priority-posts.json';
const renderOnly = process.argv.includes('--render-only');
const outDir = renderOnly ? (process.argv[process.argv.indexOf('--render-only') + 1] || 'post-covers') : null;

const assets = path.resolve(import.meta.dirname, 'assets');
GlobalFonts.registerFromPath(path.join(assets, 'Montserrat-Bold.ttf'), 'MontserratBold');
GlobalFonts.registerFromPath(path.join(assets, 'Montserrat-Medium.ttf'), 'MontserratMedium');

// Ícones em traço (viewBox 24x24), estilo consistente com os das landings.
const ICONS = {
  battery: ['M3 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M22 10.5v3', 'M5 10.5v3', 'M8.5 10.5v3'],
  laptop: ['M4 5h16v11H4z', 'M1 19h22'],
  router: ['M5 12a10 10 0 0 1 14 0', 'M8.2 15.2a5.5 5.5 0 0 1 7.6 0', 'M12 18.6h.01'],
  drive: ['M2 8h20v8a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 16z', 'M2 8l3.2-4.5h13.6L22 8', 'M17.5 13h.01', 'M13.5 13h.01'],
  certificate: ['M6 2h9l5 5v15H6z', 'M15 2v5h5', 'M9.5 14l2 2 4.5-4.5'],
  tv: ['M3 6h18v12H3z', 'M8 21h8', 'M9 2.5l3 3 3-3'],
  fridge: ['M6 2h12v20H6z', 'M6 9.5h12', 'M9 5v2', 'M9 13v3.5'],
  ac: ['M2 6.5h20v8H2z', 'M6 10.5h9', 'M7 18.5c1.2 1.2 2.3 1.2 3.5 0s2.3-1.2 3.5 0 2.3 1.2 3.5 0'],
  medical: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 8.5v7', 'M8.5 12h7'],
  map: ['M12 21.5S5 15.6 5 10a7 7 0 0 1 14 0c0 5.6-7 11.5-7 11.5z', 'M12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z'],
  chart: ['M3 3v18h18', 'M8 17v-6.5', 'M13 17V6', 'M18 17v-8'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z', 'M20 17v5H6.5a2.5 2.5 0 0 1 0-5'],
  box: ['M21 8.2l-9-5.2-9 5.2v7.6l9 5.2 9-5.2z', 'M3 8.2l9 5.2 9-5.2', 'M12 13.4v7.6'],
  leaf: ['M5.5 21c0-9.5 4.2-15.8 13.5-15.8 0 10.3-5.2 14.2-13.5 15.8z', 'M5.5 21C8.5 15 12 11 16.5 8.5'],
  alert: ['M12 3.5L22 21H2z', 'M12 10.2v4.3', 'M12 18h.01'],
  recycle: ['M3.5 12a8.5 8.5 0 0 1 14.2-6.3L20 7.8', 'M20 3.5v4.3h-4.3', 'M20.5 12a8.5 8.5 0 0 1-14.2 6.3L4 16.2', 'M4 20.5v-4.3h4.3'],
  truck: ['M1 5.5h13V16H1z', 'M14 9.5h4.2L22 13.3V16h-8', 'M6 18.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z', 'M17.5 18.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z'],
  shield: ['M12 2.5l8 3v5.8c0 4.9-3.4 8.7-8 10.7-4.6-2-8-5.8-8-10.7V5.5z', 'M8.8 11.8l2.2 2.2 4.4-4.4'],
  cpu: ['M6 6h12v12H6z', 'M9.5 9.5h5v5h-5z', 'M9.5 1.5v3', 'M14.5 1.5v3', 'M9.5 19.5v3', 'M14.5 19.5v3', 'M1.5 9.5h3', 'M1.5 14.5h3', 'M19.5 9.5h3', 'M19.5 14.5h3'],
  plug: ['M9 2v6', 'M15 2v6', 'M6 8h12v3.5a6 6 0 0 1-12 0z', 'M12 17.5V22'],
  list: ['M8.5 6.5H21', 'M8.5 12H21', 'M8.5 17.5H21', 'M3.5 6.5h.01', 'M3.5 12h.01', 'M3.5 17.5h.01'],
  clipboard: ['M9 2.5h6v3.5H9z', 'M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2', 'M9 13l2.2 2.2L15.5 11'],
  building: ['M3 21V8.5l6 3.6V8.5l6 3.6V8.5l6 3.6V21', 'M1.5 21h21', 'M7 17h2', 'M13 17h2'],
};

const KICKERS = {
  battery: 'Baterias e riscos', laptop: 'Computadores', router: 'Redes e conectividade',
  drive: 'Dados e armazenamento', certificate: 'Documentação e certificados', tv: 'Eletrônicos domésticos',
  fridge: 'Eletrodomésticos', ac: 'Climatização', medical: 'Equipamentos de saúde',
  map: 'Onde descartar', chart: 'Dados e panorama', book: 'Educação ambiental',
  box: 'Coleta corporativa', leaf: 'Meio ambiente', alert: 'Riscos e segurança',
  recycle: 'Reciclagem', truck: 'Logística reversa', shield: 'Conformidade',
  cpu: 'Tecnologia', plug: 'Fios e cabos', list: 'Guia rápido',
  clipboard: 'Processos e normas', building: 'Setor produtivo',
};

// Assunto de cada artigo → ícone da capa.
const SLUG_ICON = {
  'tabela-de-classificacao-de-residuos-eletronicos-abntconama-consulta-rapida': 'list',
  'a-evolucao-dos-computadores-dos-anos-70-ao-seculo-xxi': 'laptop',
  'lixo-eletronico-no-brasil-numeros-atualizados-2025': 'chart',
  'como-limpar-roteadores-e-modems-antes-do-descarte': 'router',
  'bateria-de-notebook-vazando-o-que-fazer-agora': 'battery',
  'normas-da-antt-e-abnt-para-transporte-de-baterias-de-litio': 'truck',
  'descarte-de-equipamentos-de-imagem-medica-raio-x-tomografos-etc': 'medical',
  'o-mapa-completo-do-lixo-eletronico-no-brasil-dados-regionais-volumes-e-riscos': 'map',
  'como-montar-um-ponto-de-coleta-de-eletronicos-na-sua-empresa': 'box',
  'os-componentes-toxicos-presentes-no-lixo-eletronico-e-seus-riscos': 'alert',
  'onde-descartar-lixo-eletronico-em-sao-paulo-mapa-e-opcoes-seguras': 'map',
  'lixo-eletronico-nas-escolas-como-ensinar-sustentabilidade-com-a-ecobraz': 'book',
  'ranking-global-os-20-paises-que-mais-geram-lixo-eletronico': 'chart',
  'qual-documentacao-fiscal-adequada-para-saida-de-sucata-x-reciclagem': 'clipboard',
  'a-diferenca-entre-descarte-reciclagem-reuso-e-remanufatura-e-por-que-isso-importa-no-compliance': 'recycle',
  'os-impactos-do-lixo-eletronico-nos-solos-rios-e-oceanos': 'leaf',
  'procedimento-operacional-padrao-pop-coleta-e-descarte-de-elixo': 'clipboard',
  'o-impacto-ambiental-do-descarte-incorreto-de-eletrodomesticos': 'fridge',
  'por-que-nao-jogar-eletronicos-no-lixo-comum-entenda-os-riscos-reais': 'alert',
  'o-que-e-considerado-lixo-eletronico-exemplos-e-destinos-corretos-com-a-ecobraz': 'list',
  'coleta-de-lixo-eletronico-em-osasco': 'map',
  'de-onde-vem-o-lixo-eletronico-a-origem-dos-residuos-de-tecnologia-no-brasil': 'building',
  'como-a-inteligencia-artificial-esta-ajudando-a-reciclar-lixo-eletronico': 'cpu',
  'licenciamento-ambiental-para-recicladores-de-eletronicos-o-que-verificar-antes-de-contratar': 'shield',
  'empresas-obrigadas-a-fazer-logistica-reversa-lista-completa': 'truck',
  'lixo-eletronico-lista-completa-do-que-pode-e-nao-pode-descartar': 'list',
  'normas-da-anvisa-e-lixo-eletronico-cuidados-especiais-no-descarte-de-equipamentos-eletromedicos-e-hospitalares': 'medical',
  'o-papel-da-logistica-reversa-na-certificacao-iso-14001-das-empresas': 'shield',
  'por-que-fios-e-cabos-eletricos-nao-devem-ser-jogados-no-lixo-comum': 'plug',
  'o-impacto-do-lixo-eletronico-no-meio-ambiente-dados-2025': 'leaf',
  'descarte-de-ar-condicionado-a-solucao-sustentavel-da-ecobraz-emigre': 'ac',
  'descarte-de-baterias-de-litio-riscos-normas-e-destinacao-segura': 'battery',
  'passo-a-passo-para-emitir-mtr-e-cdf-no-descarte-de-eletronicos': 'certificate',
  'reciclagem-de-eletronicos-no-brasil-panorama-atual-desafios-e-oportunidades-para-empresas': 'recycle',
  'power-banks-sinais-de-risco-e-descarte-seguro': 'battery',
  'como-funciona-a-triagem-do-lixo-eletronico-passo-a-passo': 'recycle',
  'coleta-e-reciclagem-de-autoclaves-e-equipamentos-de-esterilizacao': 'medical',
  'como-descartar-geladeira-velha-em-sao-paulo': 'fridge',
  'tv-antiga-como-e-onde-descartar-corretamente-em-2025': 'tv',
  'sanitizacao-de-dados-em-hds-e-ssds-como-fazer-de-forma-certificada': 'drive',
  'certificado-de-descarte-de-lixo-eletronico-por-que-sua-empresa-precisa': 'certificate',
};

const hashInt = (value) => parseInt(crypto.createHash('sha1').update(value).digest('hex').slice(0, 8), 16);
const coverRef = (post, icon) => `capa-${post.slug.slice(0, 60)}-v${DESIGN_VERSION}-${crypto.createHash('sha1').update(`${DESIGN_VERSION}|${post.title}|${icon}`).digest('hex').slice(0, 8)}`;

const GRADIENTS = [
  {from: [0, 0], to: [W, H], stops: [['#013A44', 0], ['#001F26', 1]]},
  {from: [0, H], to: [W, 0], stops: [['#00333B', 0], ['#04434B', 1]]},
  {from: [0, 0], to: [0, H], stops: [['#012F36', 0], ['#00434E', 1]]},
  {from: [W, 0], to: [0, H], stops: [['#003840', 0], ['#001B21', 1]]},
];
const RINGS = [[1120, 90], [1140, 590], [930, -30], [1180, 345]];

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function renderCover(post, icon) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const seed = hashInt(post.slug);

  const g = GRADIENTS[seed % GRADIENTS.length];
  const gradient = ctx.createLinearGradient(g.from[0], g.from[1], g.to[0], g.to[1]);
  for (const [color, at] of g.stops) gradient.addColorStop(at, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  const [ringX, ringY] = RINGS[(seed >>> 3) % RINGS.length];
  ctx.strokeStyle = 'rgba(146,196,48,0.10)';
  ctx.lineWidth = 42;
  ctx.beginPath(); ctx.arc(ringX, ringY, 215, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(146,196,48,0.05)';
  ctx.beginPath(); ctx.arc(ringX, ringY, 128, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  const dotsBaseY = 560 + ((seed >>> 5) % 2) * 24;
  for (let col = 0; col < 8; col += 1) for (let row = 0; row < 3; row += 1) {
    ctx.beginPath(); ctx.arc(806 + col * 22, dotsBaseY + row * 22, 2, 0, Math.PI * 2); ctx.fill();
  }

  // Cartão do ícone temático (lado direito)
  const tile = {x: 846, y: 187, size: 300, radius: 34};
  ctx.fillStyle = 'rgba(146,196,48,0.12)';
  ctx.strokeStyle = 'rgba(146,196,48,0.38)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(tile.x, tile.y, tile.size, tile.size, tile.radius); ctx.fill(); ctx.stroke();
  const scale = 7.6;
  ctx.save();
  ctx.translate(tile.x + (tile.size - 24 * scale) / 2, tile.y + (tile.size - 24 * scale) / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#C7E77E';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of ICONS[icon]) ctx.stroke(new Path2D(d));
  ctx.restore();

  // Bloco de texto (lado esquerdo)
  const left = 84;
  ctx.fillStyle = '#92C430';
  ctx.beginPath(); ctx.roundRect(left, 128, 64, 8, 4); ctx.fill();
  ctx.fillStyle = '#A8D84E';
  ctx.font = '26px MontserratMedium';
  ctx.fillText(KICKERS[icon].toUpperCase(), left, 176);

  let fontSize = 56, lineHeight = 68, maxLines = 4;
  ctx.font = `${fontSize}px MontserratBold`;
  let lines = wrapLines(ctx, post.title, 656);
  if (lines.length > maxLines) {
    fontSize = 46; lineHeight = 57; maxLines = 5;
    ctx.font = `${fontSize}px MontserratBold`;
    lines = wrapLines(ctx, post.title, 656);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += '…'; }
  }
  ctx.fillStyle = '#FFFFFF';
  const titleTop = 246;
  lines.forEach((line, i) => ctx.fillText(line, left, titleTop + i * lineHeight));

  // Marca no rodapé
  const brandY = H - 58;
  ctx.font = '34px MontserratBold';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('eco', left, brandY);
  const ecoWidth = ctx.measureText('eco').width;
  ctx.fillStyle = '#92C430';
  ctx.fillText('braz', left + ecoWidth, brandY);
  const brazWidth = ctx.measureText('braz').width;
  ctx.font = '22px MontserratMedium';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText('emigre', left + ecoWidth + brazWidth + 14, brandY);

  return canvas;
}

const posts = JSON.parse(await fs.readFile(file, 'utf8'));
const iconFor = (post) => {
  const icon = SLUG_ICON[post.slug];
  if (icon && ICONS[icon]) return icon;
  console.log(`AVISO: ${post.slug} sem ícone mapeado — usando "recycle".`);
  return 'recycle';
};

if (renderOnly) {
  await fs.mkdir(outDir, {recursive: true});
  for (const post of posts) {
    const icon = iconFor(post);
    const buffer = await renderCover(post, icon).encode('webp', 82);
    await fs.writeFile(path.join(outDir, `${coverRef(post, icon)}.webp`), buffer);
    console.log(`Renderizada ${post.slug} (${icon}, ${(buffer.length / 1024).toFixed(0)} KB)`);
  }
  process.exit(0);
}

const adminUrl = String(process.env.GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.GHOST_ADMIN_API_KEY || '');
if (!adminUrl || !adminKey.includes(':')) throw new Error('Missing Ghost Admin credentials');
const [id, secret] = adminKey.split(':');
const makeToken = () => {
  const now = Math.floor(Date.now() / 1000);
  const enc = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: now, exp: now + 300, aud: '/admin/'})}`;
  return `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
};

let applied = 0, skipped = 0;
for (const post of posts) {
  const icon = iconFor(post);
  const ref = coverRef(post, icon);
  const headers = {Authorization: `Ghost ${makeToken()}`, 'Accept-Version': 'v5.0'};
  const lookup = await fetch(`${adminUrl}/ghost/api/admin/posts/?filter=slug:${encodeURIComponent(post.slug)}&limit=1&fields=id,updated_at,feature_image`, {headers});
  if (!lookup.ok) throw new Error(`Lookup failed for ${post.slug}: ${lookup.status} ${await lookup.text()}`);
  const existing = (await lookup.json()).posts?.[0];
  if (!existing) { console.log(`AVISO: post ${post.slug} não existe no Ghost — pulado.`); continue; }
  if (existing.feature_image && existing.feature_image.includes(ref)) { skipped += 1; continue; }

  const buffer = await renderCover(post, icon).encode('webp', 82);
  const form = new FormData();
  form.append('file', new Blob([buffer], {type: 'image/webp'}), `${ref}.webp`);
  form.append('purpose', 'image');
  form.append('ref', ref);
  const upload = await fetch(`${adminUrl}/ghost/api/admin/images/upload/`, {method: 'POST', headers, body: form});
  if (!upload.ok) throw new Error(`Upload failed for ${post.slug}: ${upload.status} ${(await upload.text()).slice(0, 400)}`);
  const imageUrl = (await upload.json()).images?.[0]?.url;
  if (!imageUrl) throw new Error(`Upload for ${post.slug} returned no URL`);

  const alt = `Capa ilustrada: ${post.title}`.slice(0, 180);
  const payload = {posts: [{feature_image: imageUrl, feature_image_alt: alt, updated_at: existing.updated_at}]};
  const update = await fetch(`${adminUrl}/ghost/api/admin/posts/${existing.id}/`, {
    method: 'PUT',
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  if (!update.ok) throw new Error(`Cover update failed for ${post.slug}: ${update.status} ${(await update.text()).slice(0, 400)}`);
  applied += 1;
  console.log(`Capa aplicada em ${post.slug} (${icon}, ${(buffer.length / 1024).toFixed(0)} KB)`);
}
console.log(`Capas: ${applied} aplicada(s), ${skipped} já atualizadas.`);
