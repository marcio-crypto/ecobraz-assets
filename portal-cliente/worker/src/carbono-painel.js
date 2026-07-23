// Painel de Carbono do CLIENTE — a tela do "vale a pena pagar".
// PRÉVIA: os números são de EXEMPLO até (a) a Villanova validar os fatores e (b) os dados de material/peso
// entrarem pelo módulo de operação. A estrutura já é a final — troca-se só a fonte dos dados.
//
// Design (guia de dataviz): números-chave = stat tiles (não gráfico); os 2 gráficos são de UMA métrica
// (magnitude) → uma cor só, identidade vem do rótulo, não de cores cicladas.

const VERDE = '#3f8f3a';      // barra de dados (magnitude) — bom contraste em fundo claro
const VERDE_CLARO = '#92C430';
const TINTA = '#10262B';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nfmt = (n, d = 0) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

// Dados de EXEMPLO (claramente prévia). Depois vêm do motor de cálculo (Ploomes + fatores validados).
const DEMO = {
  pesoTotalKg: 12400,
  co2EvitadoT: 10.5,      // estimativa preliminar (fator ~0,85 tCO2e/t reciclado — a validar)
  coletas: 18,
  desvioAterroPct: 100,
  mensal: [ // tCO2e evitado por mês (exemplo)
    { m: 'Jul', v: 0.6 }, { m: 'Ago', v: 0.7 }, { m: 'Set', v: 0.5 }, { m: 'Out', v: 0.9 },
    { m: 'Nov', v: 0.8 }, { m: 'Dez', v: 1.1 }, { m: 'Jan', v: 0.7 }, { m: 'Fev', v: 0.9 },
    { m: 'Mar', v: 1.0 }, { m: 'Abr', v: 1.2 }, { m: 'Mai', v: 0.9 }, { m: 'Jun', v: 1.2 },
  ],
  materiais: [ // composição por peso (exemplo)
    { nome: 'Aço / ferro', pct: 45 }, { nome: 'Plásticos', pct: 22 }, { nome: 'Alumínio', pct: 15 },
    { nome: 'Cobre', pct: 10 }, { nome: 'Reuso (equipamentos)', pct: 8 },
  ],
};

// Equivalências ILUSTRATIVAS (fatores EPA aproximados) — rotuladas como tal.
function equivalencias(co2T) {
  return [
    { icone: '🚗', v: nfmt(co2T / 4.6, 1), rot: 'carros fora de circulação por 1 ano' },
    { icone: '🌳', v: nfmt(co2T / 0.06, 0), rot: 'árvores absorvendo CO₂ por 1 ano' },
    { icone: '🏠', v: nfmt(co2T / 2.4, 1), rot: 'casas abastecidas por 1 ano' },
  ];
}

function graficoMensal(dados) {
  const W = 680, H = 170, pb = 26, pt = 18, pl = 6, pr = 6;
  const max = Math.max(...dados.map((d) => d.v)) * 1.15 || 1;
  const n = dados.length;
  const bw = Math.min(30, (W - pl - pr) / n - 10);
  const gap = (W - pl - pr - bw * n) / (n - 1);
  const y0 = H - pb;
  const barras = dados.map((d, i) => {
    const x = pl + i * (bw + gap);
    const h = Math.max(2, (d.v / max) * (H - pb - pt));
    const y = y0 - h;
    return `<g><title>${esc(d.m)}: ${nfmt(d.v, 1)} tCO₂e</title>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${VERDE}"></rect>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(H - 9).toFixed(1)}" text-anchor="middle" font-size="10" fill="#8fa39f">${esc(d.m)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução mensal de CO₂ evitado" style="display:block;">
    <line x1="${pl}" y1="${y0}" x2="${W - pr}" y2="${y0}" stroke="#E4EBE9" stroke-width="1"></line>${barras}</svg>`;
}

function graficoMateriais(mats) {
  const max = Math.max(...mats.map((m) => m.pct)) || 100;
  return mats.map((m) => {
    const w = (m.pct / max) * 100;
    return `<div style="margin:0 0 12px;">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;"><span style="color:#283b3f;font-weight:600;">${esc(m.nome)}</span><span style="color:#5B6570;">${nfmt(m.pct)}%</span></div>
      <div style="background:#EEF3F1;border-radius:5px;height:10px;overflow:hidden;"><div title="${esc(m.nome)}: ${nfmt(m.pct)}%" style="width:${w.toFixed(1)}%;height:100%;background:${VERDE};border-radius:5px;"></div></div>
    </div>`;
  }).join('');
}

export function paginaPainelCarbono(cliente) {
  const d = DEMO;
  const nome = esc((cliente?.nome || '').split(/\s+/)[0] || '');
  const empresa = esc(cliente?.nome || 'sua empresa');
  const eqv = equivalencias(d.co2EvitadoT);
  const tile = (valor, unidade, rot, destaque) => `<div style="flex:1 1 190px;min-width:170px;background:${destaque ? '#00333B' : '#fff'};border:1px solid ${destaque ? '#00333B' : '#E4EBE9'};border-radius:16px;padding:20px 20px 18px;">
      <div style="font-size:${destaque ? '34' : '28'}px;font-weight:800;letter-spacing:-.02em;color:${destaque ? '#fff' : TINTA};line-height:1;">${valor}<span style="font-size:15px;font-weight:700;color:${destaque ? '#92C430' : '#7c8a87'};margin-left:4px;">${unidade}</span></div>
      <div style="font-size:12px;color:${destaque ? '#9FC6C1' : '#6B7B78'};margin-top:9px;line-height:1.4;font-weight:600;">${rot}</div>
    </div>`;
  const eqvTiles = eqv.map((e) => `<div style="flex:1 1 150px;min-width:140px;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px 16px;text-align:center;">
      <div style="font-size:26px;">${e.icone}</div><div style="font-size:22px;font-weight:800;color:${TINTA};margin-top:4px;">${e.v}</div>
      <div style="font-size:11.5px;color:#6B7B78;margin-top:5px;line-height:1.4;">${esc(e.rot)}</div></div>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Painel de Carbono — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:${TINTA};-webkit-font-smoothing:antialiased;">
<div style="max-width:900px;margin:0 auto;padding:26px 18px 60px;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
    <div><span style="font-size:18px;font-weight:800;color:#00333B;">ecobraz</span><span style="color:#8ab83f;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:7px;">emigre</span>
      <div style="font-size:13px;color:#5B6570;margin-top:2px;">Painel de Carbono${nome ? ' · ' + nome : ''}</div></div>
    <a href="/metodologia" style="font-size:12px;color:#00333B;font-weight:700;text-decoration:none;border:1px solid #cfe0dd;border-radius:8px;padding:8px 12px;">Ver metodologia</a>
  </div>

  <h1 style="margin:20px 0 4px;font-size:25px;letter-spacing:-.02em;color:#00333B;">Seu impacto ambiental</h1>
  <p style="margin:0 0 14px;font-size:14px;color:#4F6469;">O benefício de destinar seus eletrônicos corretamente com a Ecobraz — com lastro em cada coleta.</p>

  <div style="background:#FFFBEB;border:1px solid #F0DCA6;border-radius:12px;padding:12px 16px;font-size:12.5px;color:#7a5f13;line-height:1.5;">
    <strong>Prévia com dados de exemplo.</strong> Os números reais aparecem quando a metodologia for <strong>validada pela Villanova ESG</strong> e os dados de operação (material e peso por coleta) entrarem. A estrutura já é a definitiva.
  </div>

  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px;">
    ${tile(nfmt(d.co2EvitadoT, 1), 'tCO₂e', 'evitados no período (estimativa preliminar)', true)}
    ${tile(nfmt(d.pesoTotalKg / 1000, 1), 't', 'de eletrônicos destinados corretamente')}
    ${tile(nfmt(d.coletas), '', 'coletas rastreadas (foto + GPS)')}
    ${tile(nfmt(d.desvioAterroPct), '%', 'desviado de aterro')}
  </div>

  <h2 style="font-size:15px;color:#00333B;margin:30px 0 4px;">Equivalências <span style="font-size:11.5px;color:#9aa7a4;font-weight:600;">(ilustrativas — fatores EPA)</span></h2>
  <div style="display:flex;gap:12px;flex-wrap:wrap;">${eqvTiles}</div>

  <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:30px;">
    <div style="flex:2 1 380px;min-width:300px;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px 22px;">
      <h2 style="font-size:15px;color:#00333B;margin:0 0 4px;">Evolução — CO₂ evitado por mês</h2>
      <div style="font-size:11.5px;color:#9aa7a4;margin-bottom:12px;">tCO₂e · passe o mouse nas barras</div>
      ${graficoMensal(d.mensal)}
    </div>
    <div style="flex:1 1 240px;min-width:240px;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px 22px;">
      <h2 style="font-size:15px;color:#00333B;margin:0 0 14px;">Composição por material</h2>
      ${graficoMateriais(d.materiais)}
    </div>
  </div>

  <div style="background:#00333B;border-radius:16px;padding:22px 24px;margin-top:24px;">
    <div style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Rastreabilidade</div>
    <div style="color:#fff;font-size:15px;font-weight:700;margin-top:8px;line-height:1.5;">Cada número aqui vem de coletas reais — com foto, GPS, pesagem, MTR, NF e Certificado de Destinação Final.</div>
    <div style="color:#9FC6C1;font-size:12.5px;margin-top:8px;line-height:1.6;">É o que sustenta o seu relatório de ESG/CSRD e resiste a auditoria. Nada aqui é estimado no ar.</div>
  </div>

  <div style="margin-top:20px;font-size:11px;color:#9fb0ac;line-height:1.6;text-align:center;">Ecobraz Emigre · Painel de Carbono (prévia) — os fatores serão homologados pela Villanova ESG antes de qualquer número final.</div>
</div>
</body></html>`;
}
