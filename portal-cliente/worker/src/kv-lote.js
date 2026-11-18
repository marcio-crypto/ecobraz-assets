// Leitura de MUITAS chaves do KV numa mesma chamada. O Workers limita as operações
// de KV por invocação; a leitura em lote (get com uma lista de até 100 chaves) faz o
// trabalho de 100 leituras de uma vez. Se o runtime não tiver a leitura em lote, cai
// sozinho para leituras individuais com paralelismo controlado (6 conexões por vez).
// Devolve um Map chave → texto (ou null quando a chave não existe).
//
// `orcamento` (opcional, objeto { restante }): teto de OPERAÇÕES desta chamada,
// compartilhado entre várias leituras. Ao acabar, as chaves restantes NÃO são lidas
// (ficam fora do Map) e o objeto ganha `esgotado = true` — quem chamou avisa que a
// resposta saiu parcial, em vez de a invocação inteira falhar no limite da plataforma.
export async function lerChavesKV(kv, chaves, opcoes) {
  const { lote = 100, paralelo = 6, orcamento = null } = opcoes || {};
  const out = new Map();
  const lista = [...new Set((chaves || []).filter((k) => typeof k === 'string' && k))];
  if (!kv || !lista.length) return out;
  const gasta = (n) => {
    if (!orcamento) return n;
    const pode = Math.max(0, Math.min(n, Math.floor(Number(orcamento.restante) || 0)));
    orcamento.restante = (Number(orcamento.restante) || 0) - pode;
    if (pode < n) orcamento.esgotado = true;
    return pode;
  };
  let emLote = true;
  for (let i = 0; i < lista.length; i += lote) {
    const parte = lista.slice(i, i + lote);
    if (emLote) {
      if (!gasta(1)) return out;
      try {
        const r = await kv.get(parte);
        if (r instanceof Map) { for (const k of parte) out.set(k, r.has(k) ? r.get(k) : null); continue; }
      } catch { /* runtime sem leitura em lote */ }
      emLote = false;
    }
    for (let j = 0; j < parte.length; j += paralelo) {
      const quer = Math.min(paralelo, parte.length - j);
      const pode = gasta(quer);
      const sub = parte.slice(j, j + pode);
      if (sub.length) {
        const vals = await Promise.all(sub.map((k) => Promise.resolve().then(() => kv.get(k)).catch(() => null)));
        sub.forEach((k, n) => out.set(k, vals[n] == null ? null : vals[n]));
      }
      if (pode < quer) return out;
    }
  }
  return out;
}
