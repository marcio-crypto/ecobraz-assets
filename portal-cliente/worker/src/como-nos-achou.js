// "COMO NOS ACHOU?" — origem de cada agendamento (OS criada). Pedido do Marcio, 19/11/2026.
//
// • Campo obrigatório na criação da OS, uma escolha só, opções FIXAS (abaixo). "Outro" leva um
//   texto curto. A Debora pode corrigir depois, na edição da OS.
// • OS criada a partir de um pedido do site já vem com a opção marcada quando o canal do pedido é
//   claro (busca orgânica, assistente de IA, anúncio, e-mail da Ecobraz, Google Maps). Nos outros
//   casos (direto, indicação de outro site, campanha, rede social, WhatsApp/telefone) ela escolhe.
// • OS antigas (de antes do campo) ficam "não informado": nada é preenchido por adivinhação.
//
// O canal do pedido NÃO chega pronto ao sistema: o worker do site (site-ghost/worker) classifica a
// visita (origin_channel) e, quando a visita veio sem UTM, manda a origem traduzida em utm_source /
// utm_medium (busca orgânica → medium "organic" e a fonte = buscador; IA → "ai"; anúncio → "cpc";
// e-mail → "email"). Com UTM própria (campanha), a UTM vai como veio. Por isso `canalDoPedido` lê
// a UTM e a página gravadas no pedido com a MESMA ordem de regras do site (site-ghost/theme/assets/
// js/main.js, classifyOrigin) — e devolve '' sempre que não dá para ter certeza.

export const COMO_OPCOES = [
  ['busca_google', 'Busca no Google'],
  ['google_maps', 'Google Maps'],
  ['assistente_ia', 'Assistente de IA (ChatGPT, Gemini e outros)'],
  ['indicacao', 'Indicação de alguém'],
  ['cliente_antigo', 'Cliente antigo'],
  ['email_ecobraz', 'E-mail da Ecobraz'],
  ['anuncio', 'Anúncio'],
  ['outro', 'Outro'],
];
export const COMO_NAO_INFORMADO = 'nao_informado';
export const COMO_OUTRO_MAX = 60;
const ROTULOS = new Map(COMO_OPCOES);
export const comoValido = (c) => ROTULOS.has(String(c || ''));
// Rótulo para telas e conector. Sem código válido = "não informado" (OS de antes do campo).
export const rotuloComo = (c) => ROTULOS.get(String(c || '')) || 'não informado';
// Texto do "Outro": uma linha, sem marcação, até 60 caracteres.
export const limparTextoOutro = (t) => String(t == null ? '' : t).slice(0, 2000).replace(/<[^<>]{0,200}>/g, ' ').replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, COMO_OUTRO_MAX).trim();
// Confere o que veio do formulário. null = inválido (sem escolha, opção fora da lista ou "Outro"
// sem texto). { codigo, outro } = válido (outro = '' quando a escolha não é "Outro").
export function lerComo(codigo, outroTexto) {
  const c = String(codigo == null ? '' : codigo).trim();
  if (!comoValido(c)) return null;
  const outro = c === 'outro' ? limparTextoOutro(outroTexto) : '';
  if (c === 'outro' && !outro) return null;
  return { codigo: c, outro };
}

// --- Canal do pedido do site (mesmas listas e mesma ordem do site) ---------------------------
const AI_HOSTS = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|copilot\.microsoft\.com|copilot\.com|gemini\.google\.com|bard\.google\.com|notebooklm\.google\.com|meta\.ai|grok\.com|x\.ai|deepseek\.com|you\.com|phind\.com|mistral\.ai|poe\.com|duck\.ai)$/;
const AI_UTM = /^(chatgpt|openai|perplexity|claude|copilot|gemini|bard|grok|deepseek|mistral|phind|poe)$/;
const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|brave\.com|yandex\.[a-z]+|baidu\.com|startpage\.com|qwant\.com)$/;
const baixo = (s) => String(s == null ? '' : s).trim().toLowerCase();
// busca_paga | chat_ia | perfil_google | email | busca_orgânica ('busca_organica') | '' (não dá
// para saber: direto, indicação de site, rede social, campanha, pedido que não veio do site).
export function canalDoPedido(lead) {
  if (!lead || typeof lead !== 'object') return '';
  const u = (lead.utm && typeof lead.utm === 'object') ? lead.utm : {};
  const medium = baixo(u.medium), source = baixo(u.source).replace(/^www\./, ''), campaign = baixo(u.campaign);
  const pagina = String(lead.pagina || '');
  if (/[?&](gclid|gbraid|wbraid|msclkid)=/i.test(pagina) || /cpc|ppc|paid/.test(medium)) return 'busca_paga';
  if (medium === 'ai' || AI_HOSTS.test(source) || AI_UTM.test(source)) return 'chat_ia';
  if (/gbp|google_business|perfil/.test(`${source} ${campaign}`)) return 'perfil_google';
  if (medium === 'email' || /egoi|newsletter/.test(source)) return 'email';
  // Busca orgânica: o site só manda "organic" quando a visita veio SEM UTM e o buscador é a fonte.
  if (medium === 'organic' && SEARCH_HOSTS.test(source)) return 'busca_organica';
  return '';
}
// Canal claro → opção (decisão do Marcio, 19/11/2026). O resto fica para a Debora escolher.
const CANAL_PARA_COMO = { busca_organica: 'busca_google', chat_ia: 'assistente_ia', busca_paga: 'anuncio', email: 'email_ecobraz', perfil_google: 'google_maps' };
export const sugestaoComoDoPedido = (lead) => CANAL_PARA_COMO[canalDoPedido(lead)] || '';
