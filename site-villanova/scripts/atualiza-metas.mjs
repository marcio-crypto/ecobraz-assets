// Atualiza SOMENTE meta_title e meta_description de páginas/posts da Villanova ESG.
// Uso: node atualiza-metas.mjs [caminho-do-json]   (padrão: content/metas-ctr.json)
//
// Por que um script separado: o sync-pagina.mjs reescreve o conteúdo (lexical).
// Aqui a intenção é mexer só no que o Google mostra no resultado de busca —
// título e descrição — sem tocar em uma linha do corpo da página.
// O Ghost faz merge no PUT: campos não enviados permanecem como estão.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const ARQUIVO = process.argv[2] || 'site-villanova/content/metas-ctr.json';
const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const agora = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg: 'HS256', typ: 'JWT', kid: id})}.${enc({iat: agora, exp: agora + 300, aud: '/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const headers = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0', 'Content-Type': 'application/json'};

const api = async (method, path, body) => {
  const r = await fetch(`${adminUrl}/ghost/api/admin/${path}`, {method, headers, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

// Limites práticos do Google: o título é cortado por volta de 60 caracteres e a
// descrição por volta de 160. Passar disso não é erro, mas some do resultado.
const LIM_TITULO = 60;
const LIM_DESC = 160;

const itens = JSON.parse(await fs.readFile(ARQUIVO, 'utf8'));
let alterados = 0;
let avisos = 0;

for (const item of itens) {
  // A home não usa as metas da página: a rota "/" do routes.yaml cai no
  // template home e o {{meta_title}} ali resolve para as CONFIGURAÇÕES do
  // site, não para a página. Por isso ela é tratada como caso próprio.
  if (item.tipo === 'site') {
    const settings = [];
    if (item.meta_title) settings.push({key: 'meta_title', value: item.meta_title});
    if (item.meta_description) settings.push({key: 'meta_description', value: item.meta_description});
    const r = await fetch(`${adminUrl}/ghost/api/admin/settings/`, {
      method: 'PUT', headers, body: JSON.stringify({settings}),
    });
    // A Integration Key não tem permissão em settings/ (403 NoPermissionError):
    // esse endpoint exige token de usuário. Não é motivo para derrubar o resto
    // do arquivo — avisa e segue, e o ajuste da home fica para o painel.
    if (!r.ok) {
      console.log(`AVISO: não foi possível gravar as settings do site (${r.status}).`);
      console.log('       Ajuste manual no painel: Settings > Meta data.');
      console.log(`       Título:    ${item.meta_title}`);
      console.log(`       Descrição: ${item.meta_description}`);
      avisos++;
      continue;
    }
    console.log('atualizado: configurações do site (título e descrição da home)');
    console.log(`  depois: ${item.meta_title}`);
    alterados++;
    continue;
  }

  // Sem "tipo" declarado, procura primeiro em pages e depois em posts: assim a
  // lista de slugs não precisa saber de antemão o que é página e o que é artigo.
  const candidatos = item.tipo === 'post' ? ['posts'] : item.tipo === 'page' ? ['pages'] : ['pages', 'posts'];
  let tipo = null;
  let atual = null;
  for (const t of candidatos) {
    atual = (await api('GET', `${t}/?filter=slug:${item.slug}&limit=1`))[t]?.[0];
    if (atual) { tipo = t; break; }
  }
  if (!atual) { console.log(`AVISO: ${item.slug} não existe nem em pages nem em posts — pulado`); avisos++; continue; }

  if (item.meta_title && item.meta_title.length > LIM_TITULO) {
    console.log(`AVISO: título com ${item.meta_title.length} caracteres (>${LIM_TITULO}) em ${item.slug}`);
    avisos++;
  }
  if (item.meta_description && item.meta_description.length > LIM_DESC) {
    console.log(`AVISO: descrição com ${item.meta_description.length} caracteres (>${LIM_DESC}) em ${item.slug}`);
    avisos++;
  }

  const mudou = (atual.meta_title || '') !== (item.meta_title || atual.meta_title || '')
    || (atual.meta_description || '') !== (item.meta_description || atual.meta_description || '');
  if (!mudou) { console.log(`ok (sem mudança): ${tipo}/${item.slug}`); continue; }

  const payload = {[tipo]: [{updated_at: atual.updated_at}]};
  if (item.meta_title) payload[tipo][0].meta_title = item.meta_title;
  if (item.meta_description) payload[tipo][0].meta_description = item.meta_description;
  await api('PUT', `${tipo}/${atual.id}/`, payload);

  // Mostra só o campo que mudou: quando a lista traz apenas a descrição, o
  // log do título saía como "depois: undefined" e parecia erro sem ser.
  console.log(`atualizado: ${tipo}/${item.slug}`);
  if (item.meta_title) {
    console.log(`   título antes: ${atual.meta_title}`);
    console.log(`  título depois: ${item.meta_title}`);
  }
  if (item.meta_description) {
    console.log(`   descrição antes (${(atual.meta_description || '').length}): ${atual.meta_description}`);
    console.log(`  descrição depois (${item.meta_description.length}): ${item.meta_description}`);
  }
  alterados++;
  await espera(200);
}

console.log(`\nResumo: ${alterados} atualizados, ${avisos} avisos, ${itens.length} itens no arquivo.`);
