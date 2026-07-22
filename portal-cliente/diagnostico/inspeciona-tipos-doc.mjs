// Inspeção SOMENTE-LEITURA dos TIPOS de documento e de como o Ploomes marca "liberado
// pro cliente" — pra o download do Portal respeitar a regra da Débora:
//   PODE: OS, NF, MTR, Carta de Descarte, CDF, laudo (CDF/laudo só quando liberados).
//   NÃO PODE: contratos, imagens de controle interno.
// Objetivo: descobrir (a) como os tipos aparecem no campo Name, e (b) se o flag "Shared"
// (ou ExternalSharingDate) distingue o que já foi liberado pro cliente.
// Read-only. A chave nunca é impressa.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const L = (...a) => console.log(...a);
if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }
const H = { 'User-Key': KEY, Accept: 'application/json' };
const q = async (p) => { const r = await fetch(`${BASE}/${p}`.replace(/ /g, '%20'), { headers: H }); const t = await r.text(); return { ok: r.ok, status: r.status, val: (() => { try { return JSON.parse(t).value; } catch { return null; } })() }; };

function bucket(name) {
  const s = String(name || '').toLowerCase();
  if (/cdf|certificad/.test(s)) return 'CDF/Certificado (LIBERAR)';
  if (/laudo/.test(s)) return 'Laudo (LIBERAR)';
  if (/mtr/.test(s)) return 'MTR';
  if (/nota|\bnf\b|fiscal/.test(s)) return 'NF/Nota';
  if (/carta/.test(s)) return 'Carta';
  if (/ordem|\bo\.?s\.?\b|servi/.test(s)) return 'OS';
  if (/contrat/.test(s)) return 'Contrato (INTERNO)';
  if (/imagem|imagens|foto|controle/.test(s)) return 'Imagem/Controle (INTERNO)';
  if (/propost/.test(s)) return 'Proposta';
  return 'Outros';
}

async function main() {
  L('\n===== TIPOS DE DOCUMENTO + FLAG "LIBERADO" (somente leitura) =====\n');
  const r = await q(`Documents?$top=400&$orderby=Id desc&$select=Id,Name,Shared,ExternallyAccepted,ExternalSharingDate,TemplateId`);
  const docs = r.val || [];
  L(`Amostra: ${docs.length} documentos (mais recentes)\n`);

  // 1) Por tipo: quantos, quantos Shared=true, quantos com ExternalSharingDate.
  const porTipo = new Map();
  let sharedTrue = 0, comSharingDate = 0, aceitos = 0;
  for (const d of docs) {
    const b = bucket(d.Name);
    if (!porTipo.has(b)) porTipo.set(b, { total: 0, shared: 0, comData: 0, ex: null });
    const o = porTipo.get(b); o.total++;
    if (d.Shared) { o.shared++; sharedTrue++; }
    if (d.ExternalSharingDate) { o.comData++; comSharingDate++; }
    if (d.ExternallyAccepted) aceitos++;
    if (!o.ex) o.ex = d.Name;
  }
  L('--- Por tipo (nome) | total | Shared=true | com data de compartilhamento ---');
  for (const [b, o] of [...porTipo.entries()].sort((a, c) => c[1].total - a[1].total))
    L(`  ${b.padEnd(28)} | ${String(o.total).padStart(3)} | shared ${String(o.shared).padStart(3)} | data ${String(o.comData).padStart(3)} | ex.: ${String(o.ex).slice(0, 40)}`);

  L(`\n--- Flags no geral ---`);
  L(`  Shared=true: ${sharedTrue}/${docs.length} | com ExternalSharingDate: ${comSharingDate} | ExternallyAccepted: ${aceitos}`);

  // 2) Amostras de nomes crus (pra ver o padrão real de nomeação).
  L('\n--- 12 nomes crus (amostra) ---');
  for (const d of docs.slice(0, 12)) L(`  [${d.Id}] Shared=${d.Shared} data=${d.ExternalSharingDate ? d.ExternalSharingDate.slice(0, 10) : '-'} | "${d.Name}"`);

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
