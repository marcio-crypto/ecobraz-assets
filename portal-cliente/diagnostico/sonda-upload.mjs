// Sonda do UPLOAD DE FOTOS no Ploomes (para o "Abrir OS / Solicitar coleta").
//
// Objetivo: descobrir o FORMATO EXATO do endpoint de upload (Deals/{id}/UploadFile)
// antes de embutir no Worker — para o anexo de fotos funcionar de primeira quando o
// Marcio testar (nada de chute).
//
// O que faz:
//   1) Lê o $metadata e imprime a definição da ação UploadFile + entidades de anexo
//      (SOMENTE LEITURA).
//   2) Se LIVE=1: cria UM negócio DESCARTÁVEL bem rotulado ("[TESTE-PORTAL-UPLOAD]"),
//      tenta subir um PNG 1x1 em algumas variações de multipart, imprime status+resposta
//      de cada tentativa e, no fim, APAGA o negócio de teste (limpeza).
//
// A chave nunca é impressa. Saída vai só para o log (privado) da CI.

const BASE = (process.env.PLOOMES_API_URL || 'https://public-api2.ploomes.com').replace(/\/+$/, '');
const KEY = process.env.PLOOMES_USER_KEY || '';
const LIVE = process.env.LIVE === '1';
const L = (...a) => console.log(...a);

if (!KEY) { console.error('ERRO: PLOOMES_USER_KEY não definido.'); process.exit(1); }

const HKEY = { 'User-Key': KEY };
const HJSON = { ...HKEY, 'content-type': 'application/json', Accept: 'application/json' };

// PNG 1x1 transparente (bytes válidos) — carga mínima de teste.
const PNG_1x1_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function main() {
  L('\n===== SONDA DE UPLOAD (Ploomes) =====');
  L('Base:', BASE, '| modo:', LIVE ? 'LIVE (cria+apaga negócio de teste)' : 'somente leitura ($metadata)');

  // 1) $metadata — achar a ação UploadFile e entidades de anexo (read-only).
  L('\n--- $metadata: ação UploadFile e anexos ---');
  try {
    const r = await fetch(`${BASE}/$metadata`, { headers: HKEY });
    const xml = await r.text();
    L('  HTTP', r.status, '| tamanho', xml.length, 'chars');
    // Blocos <Action ...>...</Action> e <Function ...> cujo Name casa com upload/file/attach.
    const blocos = [...xml.matchAll(/<(Action|Function)\b[^>]*Name="([^"]*)"[\s\S]*?<\/\1>/g)];
    const alvo = blocos.filter((m) => /upload|file|attach|anexo|arquivo/i.test(m[2]));
    if (alvo.length) {
      for (const m of alvo) L(`  ↳ <${m[1]} Name="${m[2]}">:\n     ${m[0].replace(/\s+/g, ' ').slice(0, 500)}`);
    } else {
      L('  (nenhuma <Action>/<Function> com nome upload/file/attach — pode ser rota fora do CSDL)');
      // Mostra qualquer menção textual a UploadFile.
      const idx = xml.indexOf('UploadFile');
      if (idx >= 0) L('  menção a "UploadFile" no XML:', xml.slice(idx - 120, idx + 200).replace(/\s+/g, ' '));
    }
    const sets = [...new Set([...xml.matchAll(/EntitySet Name="([^"]+)"/g)].map((m) => m[1]))];
    L('  EntitySets de anexo:', sets.filter((n) => /attach|anexo|file|arquivo|document/i.test(n)).join(', ') || '(nenhum)');
  } catch (e) { L('  $metadata falhou:', String(e.message).slice(0, 120)); }

  if (!LIVE) { L('\n(Defina LIVE=1 para testar o upload de verdade.)\n===== FIM ====='); return; }

  // 2) Cria um negócio descartável, tenta upload, limpa.
  L('\n--- LIVE: cria negócio de teste ---');
  const novo = { Title: '[TESTE-PORTAL-UPLOAD — pode apagar]' };
  const cr = await fetch(`${BASE}/Deals`, { method: 'POST', headers: HJSON, body: JSON.stringify(novo) });
  const crBody = await cr.text();
  if (!cr.ok) { L('  falhou ao criar negócio de teste:', cr.status, crBody.slice(0, 200)); L('\n===== FIM ====='); return; }
  let dealId = null;
  try { dealId = JSON.parse(crBody).value?.[0]?.Id ?? null; } catch {}
  L('  negócio de teste criado: Id =', dealId);
  if (!dealId) { L('  sem Id — aborta.'); return; }

  const bytes = Buffer.from(PNG_1x1_B64, 'base64');
  const variantes = [
    { nome: 'multipart campo "file"', field: 'file', url: `${BASE}/Deals(${dealId})/UploadFile` },
    { nome: 'multipart campo "File"', field: 'File', url: `${BASE}/Deals(${dealId})/UploadFile` },
    { nome: 'multipart campo "arquivo"', field: 'arquivo', url: `${BASE}/Deals(${dealId})/UploadFile` },
  ];
  let venceu = null;
  for (const v of variantes) {
    try {
      const form = new FormData();
      form.append(v.field, new Blob([bytes], { type: 'image/png' }), 'teste.png');
      const up = await fetch(v.url, { method: 'POST', headers: HKEY, body: form });
      const b = await up.text();
      L(`  [${v.nome}] -> HTTP ${up.status} | ${b.slice(0, 220).replace(/\s+/g, ' ')}`);
      if (up.ok && !venceu) { venceu = v; break; }
    } catch (e) { L(`  [${v.nome}] -> erro ${String(e.message).slice(0, 120)}`); }
  }
  L(venceu ? `\n  ✅ FORMATO QUE FUNCIONOU: ${venceu.nome} em Deals({id})/UploadFile` : '\n  ⚠️ Nenhuma variação retornou 2xx — ver respostas acima (o corpo costuma dizer o que faltou).');

  // 3) Limpeza — apaga o negócio de teste.
  L('\n--- Limpeza: apaga o negócio de teste ---');
  const del = await fetch(`${BASE}/Deals(${dealId})`, { method: 'DELETE', headers: HKEY });
  const delBody = await del.text().catch(() => '');
  L(`  DELETE Deals(${dealId}) -> HTTP ${del.status} ${del.ok ? '(apagado)' : '| ' + delBody.slice(0, 160)}`);
  if (!del.ok) L(`  ⚠️ NÃO consegui apagar o negócio de teste ${dealId}. Peça pra Débora apagar "[TESTE-PORTAL-UPLOAD]".`);

  L('\n===== FIM =====\n');
}
main().catch((e) => { console.error('Falha inesperada:', e?.message || e); process.exit(1); });
