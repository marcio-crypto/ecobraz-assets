// Metodologia de carbono como DADO ESTRUTURADO, versionado e validável — a "fonte da verdade".
// Alimenta: a tela da Villanova (validação), o motor de cálculo e o relatório do auditor.
//
// Cada FATOR tem: valor (null até ser preenchido da fonte), unidade, fonte, versão da fonte e STATUS
// de validação (proposto -> em_validacao -> validado). Nada entra em produção sem virar "validado".
// Regra de ouro: nenhum número é inventado. valor:null = ainda precisa ser extraído da fonte citada.

export const METODOLOGIA = {
  versao: '1.2-rascunho',
  status: 'proposto', // proposto | em_validacao | validado
  atualizadoEm: '2026-07-28',
  validadoPor: null, // preenchido quando a Villanova assinar (nome, data)

  // DECISÃO DO MARCIO (2026-07-28): a Ecobraz NÃO vende créditos de carbono.
  // A camada Verra/UNFCCC (VMR0008 + AMS-III.BA) que existiu na v1.1 foi REMOVIDA
  // na v1.2. O que permanece: A (evitado), B (inventário) e C (compensação do
  // Adote) — que não são créditos e nunca se misturam.
  normas: [
    { id: 'ghg', nome: 'GHG Protocol — Corporate & Scope 3 (Cat. 5, resíduos)', uso: 'Base do inventário do cliente', url: 'https://ghgprotocol.org/standards' },
    { id: 'wri', nome: 'WRI (2019) — Comparative Emissions Impacts of Products', uso: 'Regras de emissões evitadas', url: 'https://www.wri.org/research/estimating-and-reporting-comparative-emissions-impacts-products' },
    { id: 'wbcsd', nome: 'WBCSD — Guidance on Avoided Emissions v2.0 (2025)', uso: 'Metodologia atual de emissões evitadas', url: 'https://www.wbcsd.org/' },
    { id: 'iso14064', nome: 'ISO 14064-1 / 14064-3', uso: 'Inventário de GEE + verificação por terceira parte', url: 'https://www.iso.org/' },
    { id: 'iso14067', nome: 'ISO 14067 / 14040-44 (ACV)', uso: 'Pegada de produto e ciclo de vida', url: 'https://www.iso.org/' },
    { id: 'warm', nome: 'US EPA — WARM v16 (Eletrônicos, 2023)', uso: 'Fatores por rota (reciclagem/reuso/aterro)', url: 'https://www.epa.gov/system/files/documents/2023-12/warm_electronics_v16_dec.pdf' },
    { id: 'weee', nome: 'WEEE Forum — cálculo de CO₂-eq (validado PRé)', uso: 'Benefício da gestão de REEE', url: 'https://weee-forum.org/co2eqcalculation/' },
    { id: 'mcti', nome: 'MCTI / SIRENE — Fator de emissão do SIN', uso: 'Eletricidade da planta (Brasil), fonte oficial', url: 'https://www.gov.br/mcti/pt-br/acompanhe-o-mcti/cgcl/paginas/fator-medio-inventarios-corporativos' },
  ],

  // Os 3 números que NUNCA se misturam (espinha anti-greenwashing).
  numeros: [
    { id: 'A', titulo: 'Emissões evitadas (benefício)', desc: 'CO₂e que a destinação correta evita vs. cenário-base. Reportado À PARTE — não entra no inventário, não é neutralização.', base: 'WRI / WBCSD' },
    { id: 'B', titulo: 'Inventário do cliente (Escopo 3, Cat. 5)', desc: 'Emissões do tratamento do resíduo do cliente. É o que ENTRA no inventário de GEE dele.', base: 'GHG Protocol' },
    { id: 'C', titulo: 'Neutralização / compensação', desc: 'Offset (Adote um Bairro) — OUTRO produto, só com lastro real. NÃO se soma a A nem a B.', base: 'Pacote 4 (fora daqui)' },
  ],

  // O que ENTREGAMOS — e nada além (regra do Marcio, 2026-07-28: "não vamos
  // entregar nada além daquilo que podemos; o que temos é a rastreabilidade
  // que ninguém tem"). Este bloco é parte do conteúdo validável (entra no hash).
  escopoEntrega: {
    entregamos: [
      'Rastreabilidade ponta a ponta de cada coleta: foto no ato, GPS do agente, telemetria do veículo (RotaExata), pesagem, triagem e destino documentado (MTR/NF).',
      'Documentos verificáveis por QR — CDF assinado por Responsável Técnico (CREA), com selo antifraude.',
      'Inventário do cliente (GHG Protocol, Escopo 3 Cat. 5) e emissões evitadas reportadas À PARTE, com fatores homologados pela Villanova ESG.',
      'Compensação do Adote um Bairro reportada à parte, com lastro físico real (coletas e quilos).',
    ],
    naoPrometemos: [
      'NÃO emitimos nem vendemos créditos de carbono.',
      'NÃO temos certificação Verra, Gold Standard ou similar — e não afirmamos ter.',
      'Nenhum número de CO₂e é publicado sem fator validado — sem exceção.',
    ],
  },

  // Fronteira do sistema = a cadeia de custódia (o lastro).
  fronteira: [
    'Coleta no cliente (foto no ato + GPS do agente + telemetria do veículo — RotaExata)',
    'Transporte até a planta Ecobraz',
    'Pesagem e triagem',
    'Tratamento',
    'Destino: reciclagem (com MTR + NF) OU reuso/reintrodução no mercado (com NF)',
  ],

  // Tabela-mãe de fatores. valor:null até extrair da fonte + validar.
  fatores: [
    { id: 'aco', material: 'Aço / ferro recuperado', valor: null, unidade: 'kgCO₂e/kg', fonte: 'EPA WARM v16', versaoFonte: '2023', status: 'proposto', nota: '' },
    { id: 'aluminio', material: 'Alumínio recuperado', valor: null, unidade: 'kgCO₂e/kg', fonte: 'EPA WARM v16', versaoFonte: '2023', status: 'proposto', nota: '' },
    { id: 'cobre', material: 'Cobre recuperado', valor: null, unidade: 'kgCO₂e/kg', fonte: 'EPA WARM v16 / ACV', versaoFonte: '2023', status: 'proposto', nota: '' },
    { id: 'plasticos', material: 'Plásticos (HDPE/PET)', valor: null, unidade: 'kgCO₂e/kg', fonte: 'EPA WARM v16', versaoFonte: '2023', status: 'proposto', nota: '' },
    { id: 'preciosos', material: 'Metais preciosos', valor: null, unidade: 'kgCO₂e/kg', fonte: 'ACV específica', versaoFonte: '', status: 'proposto', nota: 'Alta variação — usar fonte específica' },
    { id: 'reuso', material: 'Reuso (por tipo de equipamento)', valor: null, unidade: 'kgCO₂e/kg', fonte: 'ACV / WEEE Forum', versaoFonte: '', status: 'proposto', nota: 'Benefício maior que reciclagem' },
    { id: 'eletricidade', material: 'Eletricidade da planta (BR)', valor: null, unidade: 'tCO₂e/MWh', fonte: 'MCTI/SIRENE (fator do ano)', versaoFonte: '2025', status: 'fonte_oficial', nota: 'Fator oficial publicado; atualizar por ano' },
    { id: 'transporte', material: 'Transporte da coleta (km × modal)', valor: null, unidade: 'kgCO₂e/t·km', fonte: 'GHG Protocol / Defra', versaoFonte: '', status: 'proposto', nota: '' },
  ],

  // Fator de COMPENSAÇÃO do "Adote um Bairro" (o número C). Quanto de CO₂e cada
  // coleta PF patrocinada (~25 kg de REEE) compensa. PLUGÁVEL: valor:null até a
  // Villanova/Karina validar (ou via var de ambiente ADOTE_KGCO2E_POR_COLETA, com a
  // MESMA trava de validação). C é reportado À PARTE de A (evitado) e B (inventário)
  // — NUNCA somado. É o que alimenta o "termômetro de neutralidade" do cliente.
  compensacaoAdote: { valor: null, unidade: 'kgCO₂e/coleta', coletaKgMedio: 25, fonte: 'Villanova ESG (a validar) — base WARM/WEEE por ~25 kg de REEE', versaoFonte: '', status: 'proposto', nota: 'Karina valida o fator; até lá o termômetro mostra só o dado físico (coletas e quilos).' },
};

// Lê o fator de compensação do Adote (número C), pronto para o termômetro.
// REGRA DE OURO: só devolve número quando a metodologia estiver 'validado' E o fator
// 'validado'. O valor pode vir da metodologia OU da var de ambiente (plugue sem deploy),
// mas a trava de validação é a mesma — nada acende antes da assinatura da Villanova.
export function fatorCompensacaoAdote(env, metodologia) {
  const M = metodologia || METODOLOGIA;
  const base = (M && M.compensacaoAdote) || null;
  const validado = !!(M && M.status === 'validado' && base && base.status === 'validado');
  let valor = null;
  if (validado) {
    const ov = env && env.ADOTE_KGCO2E_POR_COLETA;
    const envVal = (ov != null && ov !== '') ? Number(ov) : null;
    valor = (envVal != null && !Number.isNaN(envVal)) ? envVal : (base.valor != null ? Number(base.valor) : null);
  }
  return { valorKgPorColeta: valor, pendente: valor == null, unidade: base ? base.unidade : 'kgCO₂e/coleta', coletaKgMedio: (base && base.coletaKgMedio) || 25, fonte: base ? base.fonte : '', validado };
}

// "Impressão digital" do CONTEÚDO validável (normas, números, fronteira, fatores, versão) — NÃO inclui
// metadados mutáveis (status/validadoPor). Se alguém mudar a receita depois de validada, o hash muda e o
// selo deixa de bater → a página pública avisa "conteúdo alterado após a validação".
export async function hashConteudo() {
  const conteudo = { versao: METODOLOGIA.versao, normas: METODOLOGIA.normas, numeros: METODOLOGIA.numeros, escopoEntrega: METODOLOGIA.escopoEntrega, fronteira: METODOLOGIA.fronteira, fatores: METODOLOGIA.fatores, compensacaoAdote: METODOLOGIA.compensacaoAdote };
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(conteudo)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

const BADGE = {
  validado: { txt: 'validado', bg: '#E4F3E6', cor: '#1E7A3D', bd: '#B7E0BE' },
  em_validacao: { txt: 'em validação', bg: '#FFF4DE', cor: '#8A6A16', bd: '#F0DCA6' },
  fonte_oficial: { txt: 'fonte oficial', bg: '#E3F0F3', cor: '#0B5B66', bd: '#B9DBE1' },
  proposto: { txt: 'a validar', bg: '#F0F1F3', cor: '#5B6570', bd: '#DDE1E6' },
};
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function badge(status) { const b = BADGE[status] || BADGE.proposto; return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:800;background:${b.bg};color:${b.cor};border:1px solid ${b.bd};white-space:nowrap;">${b.txt}</span>`; }

// Página da metodologia — superfície compartilhada (Auditor + Villanova veem isto).
// Read-only nesta fase; a validação interativa (login Villanova + aprovar) vem na Fase 2.
export function paginaMetodologia(env, validacao) {
  const m = METODOLOGIA;
  const validado = !!(validacao && validacao.versao === m.versao);
  const statusGeral = badge(validado ? 'validado' : 'proposto');
  const normas = m.normas.map((n) => `<li style="margin:0 0 10px;"><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:#00333B;font-weight:700;text-decoration:none;border-bottom:1px solid #cfe0dd;">${esc(n.nome)}</a><div style="font-size:12.5px;color:#5B6570;margin-top:2px;">${esc(n.uso)}</div></li>`).join('');
  const numeros = m.numeros.map((x) => `<div style="flex:1 1 220px;min-width:220px;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px 18px 16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="width:26px;height:26px;border-radius:7px;background:#00333B;color:#92C430;font-weight:800;font-size:13px;display:inline-flex;align-items:center;justify-content:center;">${x.id}</span><strong style="font-size:14.5px;color:#10262B;line-height:1.2;">${esc(x.titulo)}</strong></div>
      <div style="font-size:12.5px;color:#4F6469;line-height:1.55;">${esc(x.desc)}</div>
      <div style="font-size:11px;color:#8fa39f;margin-top:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${esc(x.base)}</div>
    </div>`).join('');
  const passos = m.fronteira.map((p, i) => `<div style="display:flex;gap:12px;align-items:flex-start;margin:0 0 10px;"><span style="flex:none;width:22px;height:22px;border-radius:50%;background:#92C430;color:#10262B;font-weight:800;font-size:12px;display:inline-flex;align-items:center;justify-content:center;">${i + 1}</span><span style="font-size:13.5px;color:#283b3f;line-height:1.5;padding-top:1px;">${esc(p)}</span></div>`).join('');
  const linhas = m.fatores.map((f) => `<tr>
      <td style="padding:11px 12px;border-top:1px solid #EDF1F0;font-size:13px;color:#10262B;font-weight:600;">${esc(f.material)}</td>
      <td style="padding:11px 12px;border-top:1px solid #EDF1F0;font-size:13px;color:#4F6469;">${f.valor == null ? '<span style="color:#9aa7a4;">—</span>' : esc(f.valor)}</td>
      <td style="padding:11px 12px;border-top:1px solid #EDF1F0;font-size:12px;color:#5B6570;">${esc(f.unidade)}</td>
      <td style="padding:11px 12px;border-top:1px solid #EDF1F0;font-size:12px;color:#5B6570;">${esc(f.fonte)}${f.versaoFonte ? ` <span style="color:#9aa7a4;">(${esc(f.versaoFonte)})</span>` : ''}</td>
      <td style="padding:11px 12px;border-top:1px solid #EDF1F0;text-align:right;">${badge(f.status)}</td>
    </tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Metodologia de Carbono — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;-webkit-font-smoothing:antialiased;">
<div style="max-width:920px;margin:0 auto;padding:28px 20px 60px;">
  <div style="background:#00333B;border-radius:18px;padding:30px 34px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
      <div>
        <span style="color:#fff;font-size:22px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">emigre</span>
        <h1 style="margin:14px 0 6px;color:#fff;font-size:26px;letter-spacing:-.02em;">Metodologia de Carbono</h1>
        <div style="color:#9FC6C1;font-size:13.5px;line-height:1.5;max-width:560px;">Base auditável para o cálculo do benefício ambiental da destinação correta de resíduos eletrônicos — com lastro na cadeia de custódia.</div>
      </div>
      <div style="text-align:right;">
        <div style="color:#9FC6C1;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Versão ${esc(m.versao)}</div>
        <div style="margin-top:8px;">${statusGeral}</div>
      </div>
    </div>
  </div>

  ${validado ? `<div style="background:#E4F3E6;border:1px solid #B7E0BE;border-radius:12px;padding:14px 18px;margin-top:16px;font-size:13px;color:#1E5B31;line-height:1.55;">
    <strong>✓ Metodologia validada por ${esc(validacao.validadoPor || 'Villanova ESG')}</strong> em ${esc((validacao.em || '').slice(0, 10).split('-').reverse().join('/'))} — versão ${esc(validacao.versao)}.${validacao.comentario ? ` <em>“${esc(validacao.comentario)}”</em>` : ''}
  </div>` : `<div style="background:#FFFBEB;border:1px solid #F0DCA6;border-radius:12px;padding:14px 18px;margin-top:16px;font-size:13px;color:#7a5f13;line-height:1.55;">
    <strong>Rascunho v1 — em validação.</strong> Os fatores marcados <em>“a validar”</em> têm a <strong>fonte</strong> definida, mas o <strong>valor exato</strong> ainda será extraído da fonte e <strong>homologado pela Villanova ESG</strong>. Nada é publicado como número final antes disso.
  </div>`}

  <h2 style="font-size:16px;color:#00333B;margin:30px 0 12px;">O que entregamos — e nada além</h2>
  <div style="display:flex;gap:12px;flex-wrap:wrap;">
    <div style="flex:1 1 300px;min-width:280px;background:#fff;border:1px solid #cde5a6;border-radius:14px;padding:18px 20px;">
      <div style="font-size:13px;font-weight:800;color:#1E7A3D;margin-bottom:10px;">✓ O que entregamos (com prova)</div>
      ${m.escopoEntrega.entregamos.map((e) => `<div style="display:flex;gap:9px;align-items:flex-start;margin:0 0 8px;"><span style="flex:none;color:#1E7A3D;font-weight:800;">✓</span><span style="font-size:12.5px;color:#28413f;line-height:1.55;">${esc(e)}</span></div>`).join('')}
    </div>
    <div style="flex:1 1 300px;min-width:280px;background:#fff;border:1px solid #EADFDA;border-radius:14px;padding:18px 20px;">
      <div style="font-size:13px;font-weight:800;color:#B23A2E;margin-bottom:10px;">✕ O que NÃO prometemos</div>
      ${m.escopoEntrega.naoPrometemos.map((e) => `<div style="display:flex;gap:9px;align-items:flex-start;margin:0 0 8px;"><span style="flex:none;color:#B23A2E;font-weight:800;">✕</span><span style="font-size:12.5px;color:#28413f;line-height:1.55;">${esc(e)}</span></div>`).join('')}
      <div style="font-size:11.5px;color:#8fa39f;margin-top:10px;line-height:1.5;">O diferencial da Ecobraz é a <b style="color:#4F6469;">rastreabilidade auditável</b> — prometer só o que se prova faz parte da metodologia.</div>
    </div>
  </div>

  <h2 style="font-size:16px;color:#00333B;margin:30px 0 12px;">Os 3 números que nunca se misturam</h2>
  <div style="display:flex;gap:12px;flex-wrap:wrap;">${numeros}</div>

  <h2 style="font-size:16px;color:#00333B;margin:30px 0 12px;">Fronteira do sistema — a cadeia de custódia (o lastro)</h2>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px 22px;">${passos}</div>

  <h2 style="font-size:16px;color:#00333B;margin:30px 0 12px;">Fatores de emissão <span style="font-size:12.5px;color:#8fa39f;font-weight:600;">(tabela-mãe — cada um com fonte, versão e status)</span></h2>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;overflow:hidden;">
    <div style="overflow-x:auto;"><table role="presentation" style="width:100%;border-collapse:collapse;min-width:560px;">
      <thead><tr style="background:#F7FAF9;">
        <th style="text-align:left;padding:11px 12px;font-size:11px;color:#7c8a87;text-transform:uppercase;letter-spacing:.06em;">Material / processo</th>
        <th style="text-align:left;padding:11px 12px;font-size:11px;color:#7c8a87;text-transform:uppercase;letter-spacing:.06em;">Fator</th>
        <th style="text-align:left;padding:11px 12px;font-size:11px;color:#7c8a87;text-transform:uppercase;letter-spacing:.06em;">Unidade</th>
        <th style="text-align:left;padding:11px 12px;font-size:11px;color:#7c8a87;text-transform:uppercase;letter-spacing:.06em;">Fonte</th>
        <th style="text-align:right;padding:11px 12px;font-size:11px;color:#7c8a87;text-transform:uppercase;letter-spacing:.06em;">Status</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>
  </div>

  <h2 style="font-size:16px;color:#00333B;margin:30px 0 12px;">Compensação — Adote um Bairro <span style="font-size:12.5px;color:#8fa39f;font-weight:600;">(número C — reportado à parte)</span></h2>
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px 20px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center;">
    <div style="min-width:240px;flex:1;">
      <div style="font-size:13.5px;color:#10262B;font-weight:700;">Fator de compensação por coleta patrocinada</div>
      <div style="font-size:12.5px;color:#5B6570;margin-top:4px;line-height:1.55;">${esc(m.compensacaoAdote.fonte)}. Coleta média de <b>${esc(String(m.compensacaoAdote.coletaKgMedio))} kg</b>. ${esc(m.compensacaoAdote.nota)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:20px;font-weight:800;color:#10262B;">${m.compensacaoAdote.valor == null ? '<span style="color:#9aa7a4;">—</span>' : esc(m.compensacaoAdote.valor)} <span style="font-size:12px;color:#8fa39f;font-weight:700;">${esc(m.compensacaoAdote.unidade)}</span></div>
      <div style="margin-top:6px;">${badge(m.compensacaoAdote.status)}</div>
    </div>
  </div>

  <h2 style="font-size:16px;color:#00333B;margin:30px 0 12px;">Normas e referências</h2>
  <ul style="list-style:none;padding:0;margin:0;background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:18px 22px;">${normas}</ul>

  <div style="margin-top:26px;padding-top:18px;border-top:1px solid #DFE7E6;font-size:12px;color:#9fb0ac;line-height:1.6;">
    <strong style="color:#4F6469;">Validação:</strong> ${m.validadoPor ? esc(m.validadoPor) : 'pendente — Villanova ESG'} · Meta: verificação por terceira parte (ISO 14064-3).<br>
    Documento vivo e versionado — toda mudança de fator ou premissa gera nova versão e recálculo rastreável.
  </div>
</div>
</body></html>`;
}
