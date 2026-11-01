// Renderiza um vídeo de campanha quadro a quadro, a partir de um template HTML
// cujo desenho é FUNÇÃO DO TEMPO (window.desenha(t)).
//
//   node site-villanova/scripts/renderiza-video.mjs \
//     --tpl site-villanova/design/video-campanha.html \
//     --out site-villanova/campanhas/VESG-LI-2026-11/arte/videos/A15.mp4 \
//     [--fps 25] [--dur 24] [--crf 19] [--largura 1080] [--altura 1350] \
//     [--quadros /tmp/frames]
//
// POR QUE OS QUADROS NÃO VÃO PARA O DISCO. 600 PNG de 1080x1350 passam de
// 200 MB, e o disco desta sessão é uma cota fixa: estourar derruba a
// renderização no meio. Aqui cada foto sai do Playwright como Buffer e vai
// direto para a entrada do ffmpeg (image2pipe). Nada toca o disco além do MP4.
// O --quadros existe só para depurar um quadro específico.
//
// POR QUE EXISTE UMA FAIXA DE ÁUDIO MUDA. O vídeo não tem som por decisão
// (o feed começa mudo), mas arquivo sem NENHUMA trilha de áudio é recusado por
// alguns validadores de upload. Uma trilha silenciosa de 64 kbps custa ~200 kB
// e remove essa classe inteira de falha. Quem vê, vê o mesmo: silêncio.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TPL = arg('--tpl', 'site-villanova/design/video-campanha.html');
const MP4 = arg('--out', 'out/video.mp4');
const FPS = Number(arg('--fps', '25'));
const CRF = arg('--crf', '19');
const LARG = Number(arg('--largura', '1080'));
const ALT = Number(arg('--altura', '1350'));
const QUADROS = arg('--quadros', null);
const DUR_FORCADA = arg('--dur', null);

if (LARG % 2 || ALT % 2) throw new Error(`H.264 exige lado par: ${LARG}x${ALT}`);
fs.mkdirSync(path.dirname(MP4), { recursive: true });
if (QUADROS) fs.mkdirSync(QUADROS, { recursive: true });

// O Playwright vive em dois lugares: no Actions é instalado no diretório de
// trabalho (import normal resolve) e aqui fica em /opt/node-tools, que só o
// resolvedor de CommonJS enxerga. Mesmo remendo do renderiza-cards.mjs.
const { chromium } = await import('playwright').catch(async () => {
  const { createRequire } = await import('node:module');
  return createRequire('/opt/node-tools/package.json')('playwright');
});

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: LARG, height: ALT }, deviceScaleFactor: 1 });
await pagina.setContent(fs.readFileSync(TPL, 'utf8'), { waitUntil: 'load' });
// As fontes precisam estar carregadas ANTES do primeiro quadro, senão os
// primeiros segundos saem com a fonte de fallback e o vídeo "pula" de tipo.
await pagina.evaluate(() => document.fonts.ready);

const DUR = Number(DUR_FORCADA ?? await pagina.evaluate(() => window.DUR));
if (!Number.isFinite(DUR) || DUR <= 0) throw new Error('O template não expôs window.DUR.');
const TOTAL = Math.round(DUR * FPS);
console.log(`${TPL} → ${MP4}`);
console.log(`${LARG}x${ALT} · ${FPS} fps · ${DUR}s · ${TOTAL} quadros · crf ${CRF}`);

const ff = spawn('ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(FPS), '-i', 'pipe:0',
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
  '-c:a', 'aac', '-b:a', '64k', '-shortest',
  '-movflags', '+faststart',
  MP4,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const fim = new Promise((ok, erro) => {
  ff.on('error', erro);
  ff.on('close', (c) => (c === 0 ? ok() : erro(new Error(`ffmpeg saiu com ${c}`))));
});
// stdin do ffmpeg fecha quando ele morre; sem este guarda o processo cai com
// EPIPE e a mensagem real do ffmpeg se perde.
ff.stdin.on('error', () => {});

const escreve = (buf) => new Promise((ok) => (ff.stdin.write(buf) ? ok() : ff.stdin.once('drain', ok)));

for (let i = 0; i < TOTAL; i++) {
  const t = i / FPS;
  await pagina.evaluate((tt) => window.desenha(tt), t);
  const buf = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: LARG, height: ALT } });
  if (QUADROS) fs.writeFileSync(path.join(QUADROS, `q${String(i).padStart(5, '0')}.png`), buf);
  await escreve(buf);
  if (i % 50 === 0) console.log(`  quadro ${i}/${TOTAL}  t=${t.toFixed(2)}s`);
}
ff.stdin.end();
await navegador.close();
await fim;

const kb = fs.statSync(MP4).size / 1024;
console.log(`\n${MP4}  ${(kb / 1024).toFixed(2)} MB`);
