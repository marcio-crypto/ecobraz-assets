// DIAGNÓSTICO (SOMENTE LEITURA) — ficha reaproveitada por CPF/CNPJ INVÁLIDO (pedido de 21/11/2026, Item 2).
//
// Pergunta: um documento inválido pode ter feito o sistema reaproveitar uma ficha existente e juntar
// pessoas diferentes? Este script CONTA, com os dados reais, as fichas que receberam OS ou pedidos com
// documento inválido e, para cada uma, compara nome, e-mail e CEP das OS/pedidos com os da ficha.
//
// Como: lê do KV de produção, SÓ COM GET pela API da Cloudflare (os:index, os:{id}, cli:index, cli:{id},
// leads:index, lead:{id}). Não grava nada, não muda o Worker, não chama o sistema.
//
// "Documento inválido" = a mesma regra do sistema (publicação 370): dígito verificador que não confere,
// todos os dígitos iguais (ex.: só zeros) ou tamanho que não é de CPF (11) nem de CNPJ (14).
//
// PRIVACIDADE: o registro do GitHub deste repositório é PÚBLICO. Este script imprime só contagens,
// datas, números de OS, ids de ficha (sorteados pelo sistema, sem dado pessoal; id fora do padrão sai
// como impressão digital curta) e o TIPO do problema. Nenhum nome, documento, e-mail, telefone ou
// endereço é impresso — as comparações são feitas aqui dentro e só o resultado sai.
import { createHash } from 'node:crypto';

const ACC = process.env.CLOUDFLARE_ACCOUNT_ID; const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const NS = 'edd3746ffe5a49d585c60d99c18a25c7'; // PORTAL_KV (wrangler.toml)
if (!ACC || !TOKEN) { console.log('Faltam CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN.'); process.exit(1); }
const API = `https://api.cloudflare.com/client/v4/accounts/${ACC}`;

// ---- leitura da produção (só GET no KV) ----
let leituras = 0;
async function kv(chave) {
  for (let t = 0; t < 6; t++) {
    leituras++;
    const r = await fetch(`${API}/storage/kv/namespaces/${NS}/values/${encodeURIComponent(chave)}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (r.status === 200) return await r.text();
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 2000 * (t + 1))); continue; }
    throw new Error(`leitura do KV recusada (HTTP ${r.status})`);
  }
  throw new Error('leitura do KV falhou depois de 6 tentativas');
}
const cache = new Map();
async function ler(chave) { if (!cache.has(chave)) cache.set(chave, await kv(chave)); return cache.get(chave); }
async function lerVarios(chaves, paralelo = 6) { const l = [...new Set(chaves)].filter((k) => !cache.has(k)); for (let i = 0; i < l.length; i += paralelo) await Promise.all(l.slice(i, i + paralelo).map(ler)); }
const json = (raw, padrao) => { try { return raw ? JSON.parse(raw) : padrao; } catch { return padrao; } };

// ---- regras ----
const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
function cpfOk(d) {
  let s = 0; for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== Number(d[9])) return false;
  s = 0; for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0; return r === Number(d[10]);
}
function cnpjOk(n) {
  const dv = (base) => { let soma = 0, peso = base.length - 7; for (const ch of base) { soma += Number(ch) * peso; peso = peso === 2 ? 9 : peso - 1; } const r = soma % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(n.slice(0, 12)); const d2 = dv(n.slice(0, 12) + d1); return n.slice(12) === `${d1}${d2}`;
}
// 'vazio' | 'ok' | 'dv' (dígito verificador) | 'repetido' (todos iguais) | 'tamanho'
function situacao(raw) {
  const d = digits(raw);
  if (!d) return 'vazio';
  if (d.length === 11) return /^(\d)\1{10}$/.test(d) ? 'repetido' : (cpfOk(d) ? 'ok' : 'dv');
  if (d.length === 14) return /^(\d)\1{13}$/.test(d) ? 'repetido' : (cnpjOk(d) ? 'ok' : 'dv');
  return 'tamanho';
}
const invalido = (raw) => ['dv', 'repetido', 'tamanho'].includes(situacao(raw));
const TXT_SIT = { dv: 'dígito verificador não confere', repetido: 'todos os dígitos iguais', tamanho: 'tamanho que não é de CPF nem de CNPJ' };

// Comparações (feitas aqui dentro; só o resultado é impresso).
const PALAVRAS_VAZIAS = new Set(['ltda', 'ltd', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'do', 'da', 'de', 'dos', 'das', 'e', 'the', 'and', 'em', 'com']);
const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// true = batem; false = não batem; null = não dá para comparar. Pessoa física: mesmo primeiro e mesmo
// último nome (ou 2+ nomes em comum com o mesmo sobrenome final); empresa: metade das palavras em comum.
function nomesBatem(a, lista, tipo) {
  const palavras = (n) => n.split(' ').filter((t) => t.length >= 2 && !PALAVRAS_VAZIAS.has(t));
  const na = normNome(a); const alvos = (lista || []).map(normNome).filter(Boolean);
  if (!na || !alvos.length) return null;
  const ta = palavras(na);
  for (const nb of alvos) {
    if (na === nb || (na.length >= 5 && nb.includes(na)) || (nb.length >= 5 && na.includes(nb))) return true;
    const tb = palavras(nb); if (!ta.length || !tb.length) continue;
    const comuns = ta.filter((t) => tb.includes(t)).length;
    if (tipo === 'PF') {
      if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1]) return true;
      if (comuns >= 2 && ta[ta.length - 1] === tb[tb.length - 1]) return true;
    } else if (comuns && comuns / Math.min(ta.length, tb.length) >= 0.5) return true;
  }
  return false;
}
const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const emailsDe = (...textos) => [...new Set(textos.flatMap((t) => String(t || '').toLowerCase().match(RE_EMAIL) || []))];
const cepDe = (t) => { const m = String(t || '').match(/(?<!\d)(\d{5})-?(\d{3})(?!\d)/); return m ? m[1] + m[2] : ''; };
function emailsDaFicha(f) { const out = emailsDe(f && f.email); if (f && Array.isArray(f.contatos)) for (const c of f.contatos) out.push(...emailsDe(c && c.email)); return [...new Set(out)]; }
function nomesDaFicha(f) { if (!f) return []; const l = [f.nome, f.razaoSocial, f.nomeFantasia]; if (Array.isArray(f.contatos)) for (const c of f.contatos) l.push(c && c.nome); return l.filter(Boolean); }
const cepDaFicha = (f) => digits(f && f.endereco && f.endereco.cep).slice(0, 8);
const docDaFicha = (f) => (f ? (f.tipo === 'PJ' ? f.cnpj : f.cpf) || f.cnpj || f.cpf || '' : '');

// Id de ficha impresso só se for do formato sorteado pelo sistema (emp_/pf_ + letras/números);
// qualquer outro formato sai como impressão digital curta (nunca um dado pessoal).
const idSeguro = (id) => { const s = String(id || ''); return /^(emp|pf)_[0-9a-z]{6,16}$/i.test(s) && !/\d{8,}/.test(s) ? s : (s ? 'ficha#' + createHash('sha256').update(s).digest('hex').slice(0, 8) : '(sem ficha)'); };
const dia = (iso) => String(iso || '').slice(0, 10) || 'sem data';

// ===================================================================================
console.log('DIAGNÓSTICO — FICHA REAPROVEITADA POR CPF/CNPJ INVÁLIDO — somente leitura (nada é gravado)');
console.log(`Horário da leitura (UTC): ${new Date().toISOString()}`);
const osIdx = json(await ler('os:index'), []);
const cliIdx = json(await ler('cli:index'), []);
const leadsIdx = json(await ler('leads:index'), []);
const fichaResumo = new Map(cliIdx.filter((c) => c && c.id).map((c) => [String(c.id), c]));

console.log('\n== Base ==');
const contar = (lista, f) => { const m = {}; for (const x of lista) { const k = f(x); m[k] = (m[k] || 0) + 1; } return m; };
const sitFichas = contar(cliIdx, (c) => situacao(c && c.doc));
console.log(`Fichas no cadastro (cli:index): ${cliIdx.length} — documento válido ${sitFichas.ok || 0}, vazio ${sitFichas.vazio || 0}, inválido ${(sitFichas.dv || 0) + (sitFichas.repetido || 0) + (sitFichas.tamanho || 0)} (dígito verificador ${sitFichas.dv || 0}; todos iguais ${sitFichas.repetido || 0}; tamanho ${sitFichas.tamanho || 0}).`);
const sitOS = contar(osIdx, (o) => situacao(o && o.clienteDoc));
console.log(`OS no índice: ${osIdx.length} — documento na OS válido ${sitOS.ok || 0}, vazio ${sitOS.vazio || 0}, inválido ${(sitOS.dv || 0) + (sitOS.repetido || 0) + (sitOS.tamanho || 0)} (dígito verificador ${sitOS.dv || 0}; todos iguais ${sitOS.repetido || 0}; tamanho ${sitOS.tamanho || 0}).`);
const sitLeads = contar(leadsIdx, (l) => situacao(l && l.documento));
console.log(`Pedidos (leads:index): ${leadsIdx.length} — documento válido ${sitLeads.ok || 0}, vazio ${sitLeads.vazio || 0}, inválido ${(sitLeads.dv || 0) + (sitLeads.repetido || 0) + (sitLeads.tamanho || 0)} (dígito verificador ${sitLeads.dv || 0}; todos iguais ${sitLeads.repetido || 0}; tamanho ${sitLeads.tamanho || 0}).`);
const prefixos = contar(osIdx, (o) => { const s = String((o && o.clienteId) || ''); return !s ? 'sem ficha' : /^emp_|^pf_/.test(s) ? 'ficha do sistema novo' : /^p\d+$/.test(s) ? 'contato da base antiga' : 'outro formato'; });
console.log(`Ligação das OS: ${Object.entries(prefixos).map(([k, v]) => `${k} ${v}`).join('; ')}.`);

// ---- Fichas com o MESMO documento inválido (risco de reaproveitar uma pela outra) ----
const gruposInv = new Map();
for (const c of cliIdx) { if (!c || !invalido(c.doc)) continue; const d = digits(c.doc); if (!gruposInv.has(d)) gruposInv.set(d, []); gruposInv.get(d).push(c); }
const gruposDuplos = [...gruposInv.values()].filter((g) => g.length >= 2);

// ---- Quem recebeu OS ou pedido com documento inválido ----
// (a) OS cujo documento (o da OS ou o da ficha dela) é inválido
const osCasos = osIdx.filter((o) => o && (invalido(o.clienteDoc) || invalido(fichaResumo.get(String(o.clienteId || ''))?.doc)));
// (b) pedidos com documento inválido
const leadsInv = leadsIdx.filter((l) => l && invalido(l.documento));
await lerVarios(leadsInv.map((l) => `lead:${String(l.id).replace(/[^a-zA-Z0-9_]/g, '')}`));
const leadsInvFull = leadsInv.map((l) => json(cache.get(`lead:${String(l.id).replace(/[^a-zA-Z0-9_]/g, '')}`), null) || l);
// Fichas envolvidas: as das OS em (a) e as ligadas aos pedidos em (b) (pelo pedido ou pela OS que ele gerou)
const osPorId = new Map(osIdx.filter((o) => o && o.id).map((o) => [String(o.id), o]));
const fichasEnv = new Map(); // fichaId → { os: Set, leads: [] }
const add = (fid) => { const k = String(fid || ''); if (!fichasEnv.has(k)) fichasEnv.set(k, { os: new Set(), leads: [] }); return fichasEnv.get(k); };
for (const o of osCasos) add(o.clienteId).os.add(String(o.id));
for (const l of leadsInvFull) {
  const fid = l.clienteId || (l.osId && osPorId.get(String(l.osId)) && osPorId.get(String(l.osId)).clienteId) || '';
  const e = add(fid); e.leads.push(l); if (l.osId && osPorId.has(String(l.osId))) e.os.add(String(l.osId));
}
// Para comparar: todas as OS de cada ficha envolvida (não só as do caso) e as fichas completas.
const fichaIds = [...fichasEnv.keys()].filter((k) => k && !/^p\d+$/.test(k));
for (const fid of fichaIds) for (const o of osIdx) if (o && String(o.clienteId || '') === fid) fichasEnv.get(fid).os.add(String(o.id));
await lerVarios(fichaIds.map((id) => `cli:${id}`));
await lerVarios([...new Set([...fichasEnv.values()].flatMap((e) => [...e.os]))].map((id) => `os:${id}`));
// Fichas de grupos com o mesmo documento inválido (para comparar nomes entre elas)
await lerVarios(gruposDuplos.flat().map((c) => `cli:${c.id}`));

console.log('\n== Fichas que receberam OS ou pedidos com documento inválido ==');
const semFicha = fichasEnv.get('');
const linhas = []; let juntam = 0, mesmas = 0, semDados = 0; const osJuntam = []; const sinais = { nome: 0, email: 0, cep: 0 };
for (const fid of fichaIds) {
  const e = fichasEnv.get(fid); const f = json(cache.get(`cli:${fid}`), null);
  const docSit = situacao(docDaFicha(f) || (fichaResumo.get(fid) || {}).doc);
  const nomesF = nomesDaFicha(f); const emailsF = emailsDaFicha(f); const cepF = cepDaFicha(f);
  const itens = []; // { tipo, numero, data, nome, emails, cep, docSit }
  for (const id of e.os) {
    const o = json(cache.get(`os:${id}`), null) || osPorId.get(id) || {};
    itens.push({ tipo: 'OS', numero: o.numero || (osPorId.get(id) || {}).numero || '?', data: dia(o.criadoEm || (osPorId.get(id) || {}).criadoEm), nome: o.clienteNome, emails: emailsDe(o.contato, o.email, o.emailContato, o.obs), cep: cepDe(o.endereco), docSit: situacao(o.clienteDoc) });
  }
  for (const l of e.leads) itens.push({ tipo: 'pedido', numero: 'pedido', data: dia(l.criadoEm), nome: l.empresa || l.nome, nome2: l.nome, emails: emailsDe(l.email), cep: cepDe(l.endereco || l.cep), docSit: situacao(l.documento) });
  let difNome = 0, difEmail = 0, difCep = 0, comparaveis = 0, juntaAqui = false;
  for (const it of itens) {
    const tipoF = (f && f.tipo) || (fichaResumo.get(fid) || {}).tipo || '';
    const n1 = nomesBatem(it.nome, nomesF, tipoF); const n2 = it.nome2 ? nomesBatem(it.nome2, nomesF, tipoF) : null;
    const nome = n1 === true || n2 === true ? true : (n1 === false || n2 === false ? false : null);
    const email = it.emails.length && emailsF.length ? it.emails.some((x) => emailsF.includes(x)) : null;
    const cep = it.cep && cepF ? it.cep === cepF : null;
    if (nome !== null) comparaveis++;
    if (nome === false) difNome++;
    if (email === false) difEmail++;
    if (cep === false) difCep++;
    // Junta pessoas diferentes = o nome não bate e nenhum e-mail confirma que é a mesma.
    if (nome === false && email !== true) { juntaAqui = true; it.junta = true; }
  }
  if (juntaAqui) { juntam++; sinais.nome += difNome ? 1 : 0; sinais.email += difEmail ? 1 : 0; sinais.cep += difCep ? 1 : 0; for (const it of itens) if (it.tipo === 'OS') osJuntam.push(`${it.numero} (${it.data})`); }
  else if (comparaveis) mesmas++; else semDados++;
  const resumoItens = itens.map((it) => `${it.tipo === 'OS' ? it.numero : 'pedido'} ${it.data}${it.docSit !== 'ok' && it.docSit !== 'vazio' ? ' [doc inválido]' : ''}${it.junta ? ' [não bate]' : ''}`).join(', ');
  linhas.push(`- ${idSeguro(fid)} — documento da ficha: ${docSit === 'ok' ? 'válido' : docSit === 'vazio' ? 'vazio' : 'INVÁLIDO (' + TXT_SIT[docSit] + ')'}${f && f.ploomesId ? `; ligada ao contato ${Number(f.ploomesId)} da base antiga` : ''}; ${[...e.os].length} OS, ${e.leads.length} pedido(s) — ${juntaAqui ? 'PARECE JUNTAR PESSOAS DIFERENTES' : comparaveis ? 'parece a mesma pessoa' : 'sem dados para comparar'} (nome não bate em ${difNome}, e-mail não bate em ${difEmail}, CEP diferente em ${difCep}) — ${resumoItens}`);
}
console.log(`Fichas: ${fichaIds.length} — parecem juntar pessoas diferentes: ${juntam}; parecem a mesma pessoa: ${mesmas}; sem dados para comparar: ${semDados}.`);
for (const l of linhas) console.log(l);
if (semFicha) console.log(`Sem ficha ligada: ${semFicha.os.size} OS e ${semFicha.leads.length} pedido(s) com documento inválido (nada a reaproveitar por ficha).`);
const direto = [...fichasEnv.keys()].filter((k) => /^p\d+$/.test(k));
for (const k of direto) { const e = fichasEnv.get(k); console.log(`- ligada direto ao contato ${k.slice(1)} da base antiga (sem ficha nova): ${e.os.size} OS, ${e.leads.length} pedido(s) — ${[...e.os].map((id) => `${(osPorId.get(id) || {}).numero || '?'} ${dia((osPorId.get(id) || {}).criadoEm)}`).join(', ')}`); }
const pids = fichaIds.map((id) => Number((json(cache.get(`cli:${id}`), null) || {}).ploomesId) || 0).filter(Boolean);
console.log(`Contatos da base antiga ligados a essas fichas (para conferir no D1 só por id): ${pids.length ? pids.join(', ') : 'nenhum'}.`);
console.log(`OS nas fichas que parecem juntar pessoas: ${osJuntam.length}${osJuntam.length ? ' — ' + osJuntam.join(', ') : ''}.`);

console.log('\n== Fichas DIFERENTES com o MESMO documento inválido (o sistema pegaria a primeira) ==');
let gruposNomesDif = 0;
for (const g of gruposDuplos) {
  const nomes = g.map((c) => nomesDaFicha(json(cache.get(`cli:${c.id}`), null)).concat([c.nome]));
  let dif = false; for (let i = 1; i < nomes.length && !dif; i++) if (nomesBatem(nomes[0][0] || '', nomes[i], g[0].tipo) === false) dif = true;
  if (dif) gruposNomesDif++;
  const comOS = g.filter((c) => osIdx.some((o) => o && String(o.clienteId || '') === String(c.id))).length;
  console.log(`- ${g.length} fichas (${g.map((c) => idSeguro(c.id)).join(', ')}) — ${TXT_SIT[situacao(g[0].doc)]}; nomes ${dif ? 'DIFERENTES' : 'parecidos'}; ${comOS} delas com OS.`);
}
console.log(`Grupos: ${gruposDuplos.length} (${gruposNomesDif} com nomes diferentes).`);

console.log('\n== Controle ==');
console.log(`Leituras feitas na produção: ${leituras} (todas só leitura, GET). Nada foi gravado.`);
