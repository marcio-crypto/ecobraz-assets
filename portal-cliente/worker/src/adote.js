// Adote um Bairro — loja de coleta PRÉ-PAGA por tonelada (pública).
//
// Modelo comercial (definido pela diretoria em 2026-07-24):
//  - 3 pacotes fixos: 1 t, 5 t, 10 t. Compra AVULSA ou RECORRENTE (recorrente = −10%).
//  - O cliente compra PESO (toneladas) e fica com CRÉDITO em kg.
//  - A cada coleta CONCLUÍDA, desconta do crédito o PESO DA DOCA (número auditável).
//  - RECORRENTE: quando o saldo chega a ≤ 20 kg, recarrega o MESMO pacote
//    (cobrança automática no cartão salvo; se falhar ou não estiver configurado, envia link).
//
// SEGURANÇA: a chave do Mercado Pago vive só na Cloudflare (Secret). O cartão é
// tokenizado pelo próprio Mercado Pago — o sistema NUNCA vê o número do cartão.
//
// Guardado no KV: credito:{clienteId} (saldo + histórico) e pedido:{ref} (cada compra).

export const LIMIAR_RECARGA_KG = 20;

// Preços: avulso e recorrente (−10%). kg = toneladas × 1000.
export const PACOTES = [
  { id: 't1', ton: 1, kg: 1000, avulso: 3500, recorrente: 3150 },
  { id: 't5', ton: 5, kg: 5000, avulso: 16000, recorrente: 14400 },
  { id: 't10', ton: 10, kg: 10000, avulso: 30000, recorrente: 27000 },
];
export const acharPacote = (id) => PACOTES.find((p) => p.id === id) || null;
export const precoPacote = (pac, tipo) => (tipo === 'recorrente' ? pac.recorrente : pac.avulso);
const agora = () => { try { return new Date().toISOString(); } catch { return ''; } };

// --- Motor de crédito (funções PURAS; fáceis de testar) --------------------
export function novoCredito(clienteId) {
  return { clienteId: String(clienteId), saldoKg: 0, tipo: null, pacoteId: null, valorUltimo: 0, cardId: null, status: 'ativo', criadoEm: agora(), atualizadoEm: agora(), historico: [] };
}

// Registra uma COMPRA aprovada (primeira ou upgrade): soma kg e define tipo/pacote.
export function aplicarCompra(cred, pac, tipo, valor, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) + pac.kg);
  c.tipo = tipo === 'recorrente' ? 'recorrente' : 'avulso';
  c.pacoteId = pac.id;
  c.valorUltimo = Number(valor) || precoPacote(pac, tipo);
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'compra', pacote: pac.id, tipo: c.tipo, kg: pac.kg, valor: c.valorUltimo, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Registra uma RECARGA (recorrente): mesmo pacote, soma kg.
export function aplicarRecarga(cred, pac, valor, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) + pac.kg);
  c.valorUltimo = Number(valor) || pac.recorrente;
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'recarga', pacote: pac.id, kg: pac.kg, valor: c.valorUltimo, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Debita o peso (kg) de UMA coleta concluída. Não impede saldo negativo (a recarga cobre).
export function debitar(cred, kg, ref, quando) {
  const c = { ...cred, historico: [...(cred.historico || [])] };
  const q = Math.max(0, Math.round(Number(kg) || 0));
  c.saldoKg = Math.round((Number(c.saldoKg) || 0) - q);
  c.atualizadoEm = quando || agora();
  c.historico.push({ evento: 'consumo', kg: -q, saldo: c.saldoKg, ref: ref || '', quando: c.atualizadoEm });
  return c;
}

// Precisa recarregar? (só recorrente, saldo no limiar ou abaixo)
export function precisaRecarga(cred) {
  return !!(cred && cred.tipo === 'recorrente' && cred.status === 'ativo' && Number(cred.saldoKg) <= LIMIAR_RECARGA_KG);
}

// --- Persistência (KV) ------------------------------------------------------
export async function lerCredito(env, clienteId) {
  if (!env.PORTAL_KV || !clienteId) return null;
  const raw = await env.PORTAL_KV.get(`credito:${String(clienteId)}`);
  return raw ? JSON.parse(raw) : null;
}
export async function salvarCredito(env, cred) {
  if (!env.PORTAL_KV || !cred || !cred.clienteId) return cred;
  // mantém o histórico enxuto (últimos 200 lançamentos)
  if (cred.historico && cred.historico.length > 200) cred.historico = cred.historico.slice(-200);
  await env.PORTAL_KV.put(`credito:${cred.clienteId}`, JSON.stringify(cred));
  return cred;
}

// Formatação BR
export const moedaBR = (n) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kgBR = (n) => Number(n || 0).toLocaleString('pt-BR') + ' kg';
export const tonBR = (kg) => (Number(kg || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' t';
