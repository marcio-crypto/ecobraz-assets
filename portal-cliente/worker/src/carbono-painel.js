// Painel de Carbono do CLIENTE — agora ligado ao MOTOR (dados REAIS).
// Peso e composição por material vêm das operações reais da doca; o tCO₂e fica
// "pendente" até a Villanova validar os fatores (mesma trava do motor). Sem números
// inventados — se o cliente ainda não tem coleta processada, mostra estado vazio honesto.

const VERDE = '#3f8f3a';
const TINTA = '#10262B';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nfmt = (n, d = 0) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

const NOMES_CAT = { aco: 'Aço / ferro', aluminio: 'Alumínio', cobre: 'Cobre', plasticos: 'Plásticos', preciosos: 'Placas / componentes', reuso: 'Reuso de equipamentos' };

// Composição por material (kg → %) a partir das linhas do motor (dados reais).
function composicao(linhas) {
  const m = new Map();
  let semCat = 0;
  for (const l of (linhas || [])) {
    if (!l.categoria) { semCat += Number(l.kg) || 0; continue; }
    m.set(l.categoria, (m.get(l.categoria) || 0) + (Number(l.kg) || 0));
  }
  if (semCat > 0) m.set('_outros', (m.get('_outros') || 0) + semCat);
  const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
  return [...m.entries()]
    .map(([k, kg]) => ({ nome: k === '_outros' ? 'Outros / a classificar' : (NOMES_CAT[k] || k), kg, pct: Math.round((kg / total) * 1000) / 10 }))
    .sort((a, b) => b.kg - a.kg);
}

function graficoMateriais(mats) {
  const max = Math.max(...mats.map((m) => m.pct)) || 100;
  return mats.map((m) => {
    const w = (m.pct / max) * 100;
    return `<div style="margin:0 0 12px;">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;"><span style="color:#283b3f;font-weight:600;">${esc(m.nome)}</span><span style="color:#5B6570;">${nfmt(m.pct, 1)}% · ${nfmt(m.kg, 0)} kg</span></div>
      <div style="background:#EEF3F1;border-radius:5px;height:10px;overflow:hidden;"><div title="${esc(m.nome)}: ${nfmt(m.pct, 1)}%" style="width:${w.toFixed(1)}%;height:100%;background:${VERDE};border-radius:5px;"></div></div>
    </div>`;
  }).join('');
}

const tile = (valor, unidade, rot, destaque) => `<div style="flex:1 1 190px;min-width:170px;background:${destaque ? '#00333B' : '#fff'};border:1px solid ${destaque ? '#00333B' : '#E4EBE9'};border-radius:16px;padding:20px 20px 18px;">
    <div style="font-size:${destaque ? '30' : '28'}px;font-weight:800;letter-spacing:-.02em;color:${destaque ? '#fff' : TINTA};line-height:1.05;">${valor}<span style="font-size:14px;font-weight:700;color:${destaque ? '#92C430' : '#7c8a87'};margin-left:4px;">${unidade}</span></div>
    <div style="font-size:12px;color:${destaque ? '#9FC6C1' : '#6B7B78'};margin-top:9px;line-height:1.4;font-weight:600;">${rot}</div>
  </div>`;

// --- Termômetro de neutralidade -------------------------------------------
// Mostra a relação entre o INVENTÁRIO do cliente (número B) e a COMPENSAÇÃO via
// Adote um Bairro (número C). Honestidade: B e C são reportados À PARTE (a metodologia
// não os soma); "pegada líquida" é um caminho para a neutralidade, não substitui o
// inventário bruto. O tCO₂e compensado só aparece quando a Villanova valida o fator —
// até lá mostramos o dado FÍSICO real (coletas patrocinadas e quilos), sem inventar número.
function blocoTermometro(extra) {
  const ad = (extra && extra.adote) || null;
  const inv = (extra && extra.inventario) || null;
  const fator = (extra && extra.compensacao) || null;
  const coletas = ad ? Number(ad.coletasFeitas) || 0 : 0;
  const kgPat = ad ? Number(ad.kgPatrocinado) || 0 : 0;
  const compradoKg = ad ? Number(ad.compradoKg) || 0 : 0;
  const temAdote = !!(ad && (coletas > 0 || compradoKg > 0));
  const temInv = !!(inv && inv.totalTCO2e != null);
  const fatorOk = !!(fator && !fator.pendente && fator.valorKgPorColeta != null);
  const compensadoTon = (fatorOk && coletas > 0) ? Math.round((coletas * Number(fator.valorKgPorColeta) / 1000) * 100) / 100 : null;
  const brutoTon = temInv ? Number(inv.totalTCO2e) : null;
  const liquidoTon = (brutoTon != null && compensadoTon != null) ? Math.round((brutoTon - compensadoTon) * 100) / 100 : null;
  const pct = (brutoTon > 0 && compensadoTon != null) ? Math.min(100, Math.round((compensadoTon / brutoTon) * 100)) : null;

  // Tiles do termômetro
  const tileBruto = temInv
    ? tile(nfmt(brutoTon, 2), 'tCO₂e', 'pegada bruta — seu inventário (B)')
    : `<div style="flex:1 1 190px;min-width:170px;background:#fff;border:1px dashed #cbd7d2;border-radius:16px;padding:20px;">
        <div style="font-size:15px;font-weight:800;color:#00333B;">Faça o seu inventário</div>
        <div style="font-size:12px;color:#6B7B78;margin:8px 0 12px;line-height:1.5;">Sem a pegada bruta (número B), não dá para calcular a neutralidade.</div>
        <a href="/carbono/planos" style="display:inline-block;background:#00333B;color:#fff;font-size:12.5px;font-weight:800;text-decoration:none;border-radius:9px;padding:9px 13px;">Medir minha pegada →</a>
      </div>`;
  const tileCompensado = compensadoTon != null
    ? tile(nfmt(compensadoTon, 2), 'tCO₂e', 'compensado via Adote (C)', true)
    : `<div style="flex:1 1 190px;min-width:170px;background:#00333B;border:1px solid #00333B;border-radius:16px;padding:20px;">
        <div style="font-size:26px;font-weight:800;color:#fff;line-height:1.05;">${nfmt(coletas)}<span style="font-size:13px;font-weight:700;color:#92C430;margin-left:5px;">coletas</span></div>
        <div style="font-size:12px;color:#9FC6C1;margin-top:9px;line-height:1.4;font-weight:600;">patrocinadas · ${nfmt(kgPat)} kg tirados dos bairros<br><span style="color:#FFD79A;">tCO₂e compensado: pendente (Villanova valida o fator)</span></div>
      </div>`;
  const tileLiquido = liquidoTon != null
    ? tile(nfmt(liquidoTon, 2), 'tCO₂e', 'pegada líquida (B − C)')
    : '';

  const barra = pct != null
    ? `<div style="margin-top:18px;">
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#5B6570;font-weight:700;margin-bottom:5px;"><span>Rumo à neutralidade</span><span>${pct}%</span></div>
        <div style="background:#EEF3F1;border-radius:8px;height:16px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#92C430,#3f8f3a);border-radius:8px;"></div></div>
      </div>`
    : `<div style="margin-top:16px;background:#F7FAF9;border:1px solid #E4EBE9;border-radius:10px;padding:12px 14px;font-size:12.5px;color:#5B6570;line-height:1.5;">${temInv
        ? 'A barra de neutralidade acende quando a <b>Villanova ESG</b> validar o fator de compensação por coleta. Até lá, o patrocínio já está registrado com o <b>dado físico real</b> (coletas e quilos).'
        : 'Meça a sua pegada (inventário) e patrocine coletas no Adote um Bairro — aqui você acompanha o quanto já caminhou rumo à neutralidade.'}</div>`;

  return `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:18px;padding:22px 22px 20px;margin-top:20px;">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <div style="font-size:22px;">🌡️</div>
      <div><div style="font-size:16px;font-weight:800;color:#00333B;">Termômetro de neutralidade</div>
        <div style="font-size:12px;color:#6B7B78;">Sua pegada (inventário) vs. o que você já compensou patrocinando coletas.</div></div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;">${tileBruto}${tileCompensado}${tileLiquido}</div>
    ${barra}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
      <a href="/adote" style="flex:1 1 200px;text-align:center;background:#92C430;color:#10262B;font-size:13.5px;font-weight:800;text-decoration:none;border-radius:10px;padding:12px 14px;">🌱 Patrocinar mais coletas</a>
      <a href="/esg/planos" style="flex:1 1 200px;text-align:center;background:#fff;border:1px solid #cfe0dd;color:#00333B;font-size:13.5px;font-weight:800;text-decoration:none;border-radius:10px;padding:12px 14px;">📄 Gerar relatório de ESG</a>
    </div>
    <div style="margin-top:12px;font-size:11px;color:#9fb0ac;line-height:1.6;">Compensação (C) é reportada <b>à parte</b> do inventário (B) — sem dupla contagem, conforme a metodologia validada pela Villanova ESG. A “pegada líquida” é um indicador de caminho, não substitui o inventário bruto exigido pelo GHG Protocol.</div>
  </div>`;
}

export function paginaPainelCarbono(cliente, dados, validacao, extra) {
  const validado = !!(validacao && validacao.hash);
  const nome = esc((cliente?.nome || '').split(/\s+/)[0] || '');
  const temDados = !!(dados && dados.coletas > 0);
  const mats = temDados ? composicao(dados.linhas) : [];
  const termometro = blocoTermometro(extra);

  const banner = validado
    ? `<div style="background:#F1F8EC;border:1px solid #cfe6b8;border-radius:12px;padding:12px 16px;font-size:12.5px;color:#28413f;line-height:1.5"><strong>Metodologia validada pela Villanova ESG.</strong> Os números abaixo são finais, com lastro em cada coleta.</div>`
    : `<div style="background:#FFFBEB;border:1px solid #F0DCA6;border-radius:12px;padding:12px 16px;font-size:12.5px;color:#7a5f13;line-height:1.5"><strong>Peso e composição são reais</strong> (das suas coletas). O <strong>tCO₂e evitado fica pendente</strong> até a metodologia ser <strong>validada pela Villanova ESG</strong> — aí o número aparece automaticamente, sem mudar mais nada.</div>`;

  const co2Tile = validado && dados && dados.totalEvitadoT != null
    ? tile(nfmt(dados.totalEvitadoT, 2), 'tCO₂e', 'evitados no período', true)
    : tile('pendente', '', 'tCO₂e evitado — aguardando validação da Villanova', true);

  const corpo = temDados
    ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px;">
        ${co2Tile}
        ${tile(nfmt(dados.pesoEntradaKg / 1000, 2), 't', 'de eletrônicos recebidos e destinados')}
        ${tile(nfmt(dados.coletas), '', 'operações rastreadas (foto + GPS)')}
        ${tile(nfmt(dados.totalKg / 1000, 2), 't', 'de material triado por tipo')}
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:26px;">
        <div style="flex:1 1 320px;min-width:280px;background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:20px 22px;">
          <h2 style="font-size:15px;color:#00333B;margin:0 0 14px;">Composição por material <span style="font-size:11px;color:#9aa7a4;font-weight:600;">(real · por peso)</span></h2>
          ${mats.length ? graficoMateriais(mats) : '<div style="font-size:12.5px;color:#8fa39f">Materiais ainda não triados nas operações.</div>'}
        </div>
        <div style="flex:1 1 260px;min-width:240px;background:#00333B;border-radius:16px;padding:22px 24px;">
          <div style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Rastreabilidade</div>
          <div style="color:#fff;font-size:14.5px;font-weight:700;margin-top:8px;line-height:1.5;">Cada quilo aqui vem de coleta real — com foto, GPS, pesagem, MTR, NF e Certificado de Destinação Final.</div>
          <div style="color:#9FC6C1;font-size:12px;margin-top:8px;line-height:1.6;">É o que sustenta o seu relatório de ESG/CSRD e resiste a auditoria. Nada é estimado no ar.</div>
        </div>
      </div>`
    : `<div style="background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:34px 24px;text-align:center;margin-top:20px;">
        <div style="font-size:30px">🌱</div>
        <div style="font-size:16px;font-weight:800;color:#00333B;margin-top:8px">Seu painel de impacto aparece aqui</div>
        <div style="font-size:13px;color:#6B7B78;margin-top:6px;line-height:1.6;max-width:460px;margin-left:auto;margin-right:auto">Assim que a sua primeira coleta for <b>processada na nossa unidade</b> (pesada e triada), os números reais — peso, materiais recuperados e CO₂ evitado — passam a ser exibidos aqui, com lastro documental.</div>
      </div>`;

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

  ${banner}
  ${termometro}
  ${corpo}

  <div style="margin-top:22px;font-size:11px;color:#9fb0ac;line-height:1.6;text-align:center;">Ecobraz Emigre · Painel de Carbono — os fatores são homologados pela Villanova ESG; o benefício (evitado) é reportado à parte do inventário, conforme a metodologia.</div>
</div>
</body></html>`;
}
