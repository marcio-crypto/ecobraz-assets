// Renderiza o cartão social (design/og-default.html) em PNG 1200x630.
//
// Uso: node renderiza-og.mjs [html-de-entrada] [png-de-saida]
//
// Duas armadilhas do Chromium headless que este script resolve, para ninguém
// ter que redescobrir:
//
// 1) --window-size NÃO é o tamanho do viewport: sobram 88px de cromo do
//    navegador. Pedindo 630 de altura, o viewport fica com 542 e a arte sai
//    espremida com uma faixa em branco embaixo. Medido com uma barra fixa no
//    rodapé do viewport: pedindo 718, a barra cai exatamente em 630.
// 2) A captura pega a janela inteira, então a imagem sai 1200x718. Os 88px
//    extras são cortados aqui, sem biblioteca externa: o PNG é decodificado,
//    as 630 primeiras linhas são mantidas e ele é reescrito.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const ENTRADA = process.argv[2] || 'site-villanova/design/og-default.html';
const SAIDA = process.argv[3] || 'site-villanova/theme/assets/images/og-default.png';
const LARGURA = 1200;
const ALTURA = 630;
const CROMO = 88; // altura do cromo do headless, medida (ver comentário acima)

const acha = () => {
  const base = '/opt/pw-browsers';
  const dirs = fs.existsSync(base) ? fs.readdirSync(base) : [];
  for (const d of dirs.filter((x) => x.startsWith('chromium-'))) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium não encontrado.');
};

const bruto = '/tmp/og-bruto.png';
execFileSync(acha(), [
  '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1', `--window-size=${LARGURA},${ALTURA + CROMO}`,
  `--screenshot=${bruto}`, `file://${path.resolve(ENTRADA)}`,
], {stdio: 'ignore'});

// --- PNG: decodificar, cortar, reescrever ---
const dado = fs.readFileSync(bruto);
let pos = 8;
let larg = 0, alt = 0, prof = 0, cor = 0;
const pedacos = [];
while (pos < dado.length) {
  const n = dado.readUInt32BE(pos);
  const tipo = dado.toString('ascii', pos + 4, pos + 8);
  const corpo = dado.subarray(pos + 8, pos + 8 + n);
  if (tipo === 'IHDR') { larg = corpo.readUInt32BE(0); alt = corpo.readUInt32BE(4); prof = corpo[8]; cor = corpo[9]; }
  if (tipo === 'IDAT') pedacos.push(corpo);
  pos += 12 + n;
}
if (prof !== 8 || (cor !== 2 && cor !== 6)) throw new Error(`PNG inesperado: profundidade ${prof}, cor ${cor}`);
const canais = cor === 2 ? 3 : 4;
const passo = larg * canais;
const cru = zlib.inflateSync(Buffer.concat(pedacos));

// Desfaz os filtros por linha (o corte precisa de pixels, não de deltas).
const pixels = Buffer.alloc(alt * passo);
let i = 0;
for (let y = 0; y < alt; y++) {
  const f = cru[i++];
  const linha = cru.subarray(i, i + passo); i += passo;
  const dest = pixels.subarray(y * passo, (y + 1) * passo);
  const ant = y ? pixels.subarray((y - 1) * passo, y * passo) : Buffer.alloc(passo);
  for (let x = 0; x < passo; x++) {
    const a = x >= canais ? dest[x - canais] : 0;
    const b = ant[x];
    const c = x >= canais ? ant[x - canais] : 0;
    let v = linha[x];
    if (f === 1) v += a;
    else if (f === 2) v += b;
    else if (f === 3) v += (a + b) >> 1;
    else if (f === 4) {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
    }
    dest[x] = v & 255;
  }
}

const altFinal = Math.min(ALTURA, alt);
const saidaCrua = Buffer.alloc(altFinal * (passo + 1));
for (let y = 0; y < altFinal; y++) {
  saidaCrua[y * (passo + 1)] = 0; // filtro nenhum: simples e à prova de erro
  pixels.copy(saidaCrua, y * (passo + 1) + 1, y * passo, (y + 1) * passo);
}
const bloco = (tipo, corpo) => {
  const b = Buffer.alloc(8 + corpo.length + 4);
  b.writeUInt32BE(corpo.length, 0);
  b.write(tipo, 4, 'ascii');
  corpo.copy(b, 8);
  // CRC do PNG é sem sinal: gravar como Int32 estoura para valores altos.
  const alvo = Buffer.concat([Buffer.from(tipo, 'ascii'), corpo]);
  const valor = (zlib.crc32 ? zlib.crc32(alvo) : crc(alvo)) >>> 0;
  b.writeUInt32BE(valor, 8 + corpo.length);
  return b;
};
// CRC32 próprio: nem toda versão do Node expõe zlib.crc32.
let tabela = null;
function crc(buf) {
  if (!tabela) {
    tabela = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      tabela[n] = c;
    }
  }
  let c = 0xFFFFFFFF;
  for (const b of buf) c = tabela[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) | 0;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(larg, 0); ihdr.writeUInt32BE(altFinal, 4);
ihdr[8] = 8; ihdr[9] = cor; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
fs.mkdirSync(path.dirname(SAIDA), {recursive: true});
fs.writeFileSync(SAIDA, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  bloco('IHDR', ihdr),
  bloco('IDAT', zlib.deflateSync(saidaCrua, {level: 9})),
  bloco('IEND', Buffer.alloc(0)),
]));
console.log(`${SAIDA}: ${larg}x${altFinal} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} kB)`);
