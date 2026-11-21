-- DIAGNÓSTICO (SOMENTE LEITURA) — tela "Montar carga": consultas usadas no banco das cargas (D1 DB_PLOOMES,
-- tabela op_cargas). A chave da Cloudflare do GitHub não lê o D1 (HTTP 403): estas consultas rodam pela
-- ferramenta de consulta do D1 (só SELECT). Devolvem contagens, datas, status e ids de OS — nenhum nome.

-- 1) INTEGRIDADE das listas de OS das cargas (o que pode fazer a tela dar erro ou ignorar uma carga).
--    Resultado de 21/11/2026 ~17:10 UTC: 94 cargas, 11 canceladas; ilegível 0, não-lista 0, vazio 0,
--    itens nulos 0, itens que não são objeto 0, ids que não são texto 0, fotos ilegíveis 0;
--    última carga 2026-11-19T12:17:24.477Z.
SELECT (SELECT COUNT(*) FROM op_cargas) AS cargas,
       (SELECT COUNT(*) FROM op_cargas WHERE status = 'cancelada') AS canceladas,
       (SELECT COUNT(*) FROM op_cargas WHERE os_json IS NOT NULL AND os_json <> '' AND NOT json_valid(os_json)) AS os_json_ilegivel,
       (SELECT COUNT(*) FROM op_cargas WHERE json_valid(os_json) AND json_type(os_json) <> 'array') AS os_json_nao_lista,
       (SELECT COUNT(*) FROM op_cargas WHERE os_json IS NULL OR os_json = '') AS os_json_vazio,
       (SELECT COUNT(*) FROM op_cargas c, json_each(c.os_json) j WHERE json_valid(c.os_json) AND json_type(c.os_json) = 'array' AND j.type = 'null') AS itens_nulos,
       (SELECT COUNT(*) FROM op_cargas c, json_each(c.os_json) j WHERE json_valid(c.os_json) AND json_type(c.os_json) = 'array' AND j.type <> 'object') AS itens_nao_objeto,
       (SELECT COUNT(*) FROM op_cargas c, json_each(c.os_json) j WHERE json_valid(c.os_json) AND json_type(c.os_json) = 'array' AND j.type = 'object' AND COALESCE(json_type(j.value, '$.id'), 'ausente') <> 'text') AS ids_nao_texto,
       (SELECT COUNT(*) FROM op_cargas WHERE fotos_json IS NOT NULL AND fotos_json <> '' AND NOT json_valid(fotos_json)) AS fotos_json_ilegivel,
       (SELECT MAX(criado_em) FROM op_cargas) AS ultima_carga;

-- 2) CÓPIA usada pelo diagnóstico (portal-cliente/configuracao/dados/montar-carga-cargas-AAAA-MM-DD.json):
--    data, status e as OS de cada carga, da mais nova para a mais antiga. Fora do banco, cada id de OS é
--    trocado por sha256("ecobraz-carga|" + id), 16 primeiros caracteres (o diagnóstico usa a mesma troca nos
--    ids do índice de OS). Só depois disso a cópia vai para o repositório.
SELECT c.criado_em AS e, c.status AS s, group_concat(json_extract(j.value, '$.id'), ' ') AS ids
  FROM op_cargas c LEFT JOIN json_each(c.os_json) j
 GROUP BY c.rowid ORDER BY c.criado_em DESC;

-- 3) CONFERÊNCIA da cópia (comparar com a mesma conta feita sobre a cópia antes de trocar os ids).
--    Resultado de 21/11/2026: itens 327, distintos 286, checksum 192370.
SELECT COUNT(*) AS itens, COUNT(DISTINCT id) AS distintos,
       SUM((instr('0123456789abcdef', substr(id,8,1))-1)*1 + (instr('0123456789abcdef', substr(id,9,1))-1)*2 + (instr('0123456789abcdef', substr(id,10,1))-1)*3 + (instr('0123456789abcdef', substr(id,11,1))-1)*4 + (instr('0123456789abcdef', substr(id,12,1))-1)*5 + (instr('0123456789abcdef', substr(id,13,1))-1)*6 + (instr('0123456789abcdef', substr(id,14,1))-1)*7 + (instr('0123456789abcdef', substr(id,15,1))-1)*8 + (instr('0123456789abcdef', substr(id,16,1))-1)*9 + (instr('0123456789abcdef', substr(id,17,1))-1)*10 + (instr('0123456789abcdef', substr(id,18,1))-1)*11 + (instr('0123456789abcdef', substr(id,19,1))-1)*12) AS checksum
  FROM (SELECT json_extract(j.value, '$.id') AS id FROM op_cargas c, json_each(c.os_json) j);
