// Utilitários de OS compartilhados entre o Worker (painel) e a inspeção de diagnóstico,
// para a MESMA lógica valer nos dois lugares (sem divergir).
//
// A OS é um Negócio no Ploomes. O STATUS que o cliente vê vem da ETAPA (Stage) do
// negócio — e o mapeamento abaixo é AGNÓSTICO AO FUNIL (lê pelo nome da etapa), então
// serve aos 4 funis (LEADS, PJ VENDAS, SAC/RECEPTIVO, PESSOA FÍSICA), que têm etapas
// parecidas. Definido com o Marcio/Débora em 2026-07-22.

function semAcento(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Etapa (nome) -> status amigável ao cliente.
//  - Concluída: OS finalizada / doc enviado / certificado liberado (o cliente tem tudo).
//  - Em atendimento: a partir de "ordem de serviço" (coleta, correios, pesagem, stand by).
//  - Cancelada: cancelado/cancelada.
//  - Em negociação: fases anteriores à OS (em contato, reunião, proposta, cadastro...) — o
//    painel do cliente NÃO lista essas como OS.
export function statusDaEtapa(nomeEtapa) {
  const s = semAcento(nomeEtapa);
  if (s.includes('cancel')) return 'Cancelada';
  if (s.includes('os finalizada') || s.includes('doc env') || s.includes('certificado liberado')) return 'Concluída';
  if (s.includes('ordem de servico') || s.includes('coleta') || s.includes('correios') || s.includes('pesagem') || s.includes('stand by')) return 'Em atendimento';
  return 'Em negociação';
}

// A OS "vale" para o cliente (é uma coleta de verdade) quando já saiu da negociação.
export function ehOsDeCliente(nomeEtapa) {
  return statusDaEtapa(nomeEtapa) !== 'Em negociação';
}

// Lê o valor de um campo personalizado (OtherProperties) pela FieldKey.
export function valorProp(props, fieldKey) {
  const arr = Array.isArray(props) ? props : [];
  const p = arr.find((x) => x && x.FieldKey === fieldKey);
  if (!p) return null;
  return p.StringValue ?? p.DateTimeValue ?? p.DateValue ?? p.DecimalValue ?? p.IntegerValue ?? null;
}

// Abas de navegação do topo (pedido da equipe 24/08): as telas centrais do fluxo
// interno, sempre à mão. Cada página passa qual aba é a sua, que fica destacada.
export function abasEquipe(atual) {
  const ABAS = [
    ['coletas', '/coletas', '📋 Coletas / OSs'],
    ['cronograma', '/cronograma', '🗂️ Cronograma'],
    ['matriz', '/cronograma/matriz', '📊 Planilha'],
    ['cargas', '/cargas', '🚛 Cargas'],
    ['filas', '/cargas/filas', '📦 Filas'],
    ['operacao', '/operacao', '🏭 Operação'],
  ];
  const item = ([id, href, rot]) => id === atual
    ? `<span style="flex:none;background:#00333B;color:#fff;border-radius:20px;padding:7px 13px;font-size:11.5px;font-weight:800;white-space:nowrap">${rot}</span>`
    : `<a href="${href}" style="flex:none;background:#fff;color:#00333B;border:1.5px solid #cfe0dd;border-radius:20px;padding:7px 13px;font-size:11.5px;font-weight:800;text-decoration:none;white-space:nowrap">${rot}</a>`;
  return `<div style="display:flex;gap:7px;overflow-x:auto;padding:2px 0 10px;-webkit-overflow-scrolling:touch">${ABAS.map(item).join('')}</div>`;
}

// FieldKeys dos campos operacionais no Negócio (descobertos na inspeção 2026-07-22).
// Podem ser sobrescritos por variável de ambiente, se um dia mudarem.
export const CAMPOS_OS = {
  numero: 'deal_7EAFD2A7-7804-4B61-B717-1D895F1B4AF9', // Número da OS
  peso: 'deal_6CDA6722-B287-42B9-97DA-A7987A963CBE',   // Peso (ex.: "141,2 KG")
  dataColeta: 'deal_C8D28B9E-0F76-492B-B03D-6935CA2C39C8',
};
