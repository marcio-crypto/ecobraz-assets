// Lista de clientes para o GOOGLE ADS (Customer Match) — pedido do Marcio 17/08.
// Gera o CSV no formato oficial do Google ("Lista de clientes"): colunas
// Email, Phone, First Name, Last Name, Country, Zip. O Google usa esses dados
// SÓ para casar com contas Google (ele faz hash na subida) e permite: anunciar
// para os próprios clientes, criar públicos SEMELHANTES e excluir quem já é
// cliente de campanhas de aquisição.
//
// Honestidade/LGPD: só listas de quem tem relação real com a Ecobraz (regra do
// próprio Google — nada de lista comprada). O arquivo baixa direto do sistema
// para a máquina do Marcio; nenhum terceiro no meio.
import { telWhatsApp } from './whatsapp.js';

const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ESCOPOS_ADS = {
  'clientes': 'Clientes de verdade — já tiveram negócio ou OS com a Ecobraz (RECOMENDADO)',
  'todos': 'Base completa — todos os contatos com e-mail ou telefone',
};
const LIMITE_ADS = 15000;

const emailOk = (v) => { const e = String(v || '').trim().toLowerCase(); return /^\S+@\S+\.\S+$/.test(e) ? e : ''; };
const foneE164 = (v) => { const t = telWhatsApp(v); return t ? '+' + t : ''; };
const cepDe = (endereco) => { const m = String(endereco || '').match(/(\d{5})-?(\d{3})/); return m ? m[1] + m[2] : ''; };

// Monta a lista {email, phone, first, last, zip} a partir do D1 (contatos +
// negócios) e das OS do sistema novo. PF leva nome (pessoa de verdade — ajuda o
// Google a casar); PJ vai só com e-mail/telefone (razão social não é nome de gente).
export async function montarListaGoogleAds(env, escopo) {
  const out = { itens: [], total: 0, comEmail: 0, comFone: 0, truncado: false, escopo: ESCOPOS_ADS[escopo] ? escopo : 'clientes' };
  if (!env.DB_PLOOMES) return out;
  let linhas = [];
  try {
    if (out.escopo === 'clientes') {
      // Relação real: o contato tem negócio, OU é pessoa de uma empresa com
      // negócio, OU é a empresa de pessoas com negócio.
      const r = await env.DB_PLOOMES.prepare(`SELECT nome, tipo, email, telefone, endereco, documento FROM contatos c
        WHERE (COALESCE(c.email,'')<>'' OR COALESCE(c.telefone,'')<>'') AND (
          EXISTS (SELECT 1 FROM negocios n WHERE n.contact_id = c.ploomes_id)
          OR (c.company_id > 0 AND EXISTS (SELECT 1 FROM negocios n2 WHERE n2.contact_id = c.company_id))
          OR EXISTS (SELECT 1 FROM negocios n3 JOIN contatos p ON p.ploomes_id = n3.contact_id WHERE p.company_id = c.ploomes_id)
        ) ORDER BY TRIM(nome) COLLATE NOCASE LIMIT ${LIMITE_ADS + 1}`).all();
      linhas = r.results || [];
      // Clientes que só existem no sistema novo (OS sem histórico de negócio).
      try {
        const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('os:index') : null;
        const docs = raw ? [...new Set(JSON.parse(raw).filter((o) => o && o.status !== 'cancelada').map((o) => String(o.clienteDoc || '').replace(/\D/g, '')).filter(Boolean))] : [];
        const jaDocs = new Set(linhas.map((l) => String(l.documento || '').replace(/\D/g, '')).filter(Boolean));
        const faltam = docs.filter((d) => !jaDocs.has(d));
        while (faltam.length) {
          const bloco = faltam.splice(0, 40);
          const marcas = bloco.map((_, i) => `?${i + 1}`).join(',');
          const r2 = await env.DB_PLOOMES.prepare(`SELECT nome, tipo, email, telefone, endereco, documento FROM contatos WHERE (COALESCE(email,'')<>'' OR COALESCE(telefone,'')<>'') AND REPLACE(REPLACE(REPLACE(REPLACE(documento,'.',''),'-',''),'/',''),' ','') IN (${marcas})`).bind(...bloco).all();
          linhas.push(...(r2.results || []));
        }
      } catch { /* segue só com o histórico */ }
    } else {
      const r = await env.DB_PLOOMES.prepare(`SELECT nome, tipo, email, telefone, endereco, documento FROM contatos
        WHERE (COALESCE(email,'')<>'' OR COALESCE(telefone,'')<>'') ORDER BY TRIM(nome) COLLATE NOCASE LIMIT ${LIMITE_ADS + 1}`).all();
      linhas = r.results || [];
    }
  } catch { linhas = []; }
  if (linhas.length > LIMITE_ADS) { out.truncado = true; linhas = linhas.slice(0, LIMITE_ADS); }
  const vistos = new Map();
  for (const l of linhas) {
    const email = emailOk(l.email);
    const phone = foneE164(l.telefone);
    if (!email && !phone) continue;
    let first = '', last = '';
    if (String(l.tipo) === 'PF') {
      const partes = limpar(l.nome).split(' ');
      first = partes[0] || '';
      last = partes.slice(1).join(' ');
    }
    const zip = cepDe(l.endereco);
    const chave = email + '|' + phone;
    const ja = vistos.get(chave);
    if (ja) {
      // Duplicado (matriz/filial, contato repetido): completa o que faltar.
      if (!ja.zip && zip) ja.zip = zip;
      if (!ja.first && first) { ja.first = first; ja.last = last; }
      continue;
    }
    const item = { email, phone, first, last, zip };
    vistos.set(chave, item);
    out.itens.push(item);
    if (email) out.comEmail++;
    if (phone) out.comFone++;
  }
  out.total = out.itens.length;
  return out;
}

// CSV no formato do modelo oficial do Google Ads. Campo com vírgula/aspas sai
// entre aspas; quebra de linha CRLF (o formato mais aceito nos uploads).
const campoCsv = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function gerarCsvGoogleAds(itens) {
  const cab = 'Email,Phone,First Name,Last Name,Country,Zip';
  const linhas = (itens || []).map((i) => [i.email, i.phone, i.first, i.last, 'BR', i.zip].map(campoCsv).join(','));
  return [cab, ...linhas].join('\r\n') + '\r\n';
}

export function paginaGoogleAds(contagens) {
  const cards = Object.entries(ESCOPOS_ADS).map(([id, rotulo]) => {
    const c = (contagens && contagens[id]) || { total: 0, comEmail: 0, comFone: 0, truncado: false };
    return `<div style="background:#fff;border:1px solid ${id === 'clientes' ? '#B5D06E' : '#E4EBE9'};border-radius:14px;padding:16px 18px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="min-width:0">
          <b style="font-size:14px">${esc(rotulo)}</b>
          <span style="display:block;font-size:12px;color:#7c8a87;margin-top:3px"><b>${c.total}</b> contato(s) · ${c.comEmail} com e-mail · ${c.comFone} com telefone${c.truncado ? ' · lista cortada no limite' : ''}</span>
        </div>
        <a href="/diretoria/google-ads.csv?escopo=${esc(id)}" style="flex:none;background:${id === 'clientes' ? '#92C430' : '#EEF3F1'};color:#10262B;text-decoration:none;border-radius:10px;padding:11px 16px;font-weight:800;font-size:13px">⬇️ Baixar CSV</a>
      </div>
    </div>`;
  }).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Lista para Google Ads — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}</style></head><body>
<div style="background:#00333B;padding:15px 20px"><div style="max-width:760px;margin:0 auto;display:flex;justify-content:space-between;align-items:center">
  <span style="color:#fff;font-size:16px;font-weight:800">ecobraz</span><a href="/diretoria" style="color:#cfe3e0;font-size:12px;font-weight:700;text-decoration:none">← Diretoria</a>
</div></div>
<div style="max-width:760px;margin:0 auto;padding:22px 18px 56px">
  <h1 style="font-size:20px;margin:0 0 6px">🎯 Lista de clientes para o Google Ads</h1>
  <p style="font-size:13px;color:#4F6469;line-height:1.6;margin:0 0 16px">O arquivo sai no <b>formato oficial do Google</b> (Customer Match: Email, Phone, First Name, Last Name, Country, Zip) — telefones já no padrão internacional (+55) e e-mails normalizados. É baixar e subir.</p>
  ${cards}
  <div style="background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:16px 18px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8a87;margin-bottom:8px">Como subir no Google Ads (5 passos)</div>
    <ol style="font-size:13px;color:#10262B;line-height:1.9;margin:0;padding-left:20px">
      <li>No Google Ads: <b>Ferramentas (🔧) → Gerenciador de públicos-alvo → Seus dados</b> (Segmentos de dados);</li>
      <li><b>+ Lista de clientes</b> → dê um nome (ex.: <i>Clientes Ecobraz</i>);</li>
      <li>Escolha <b>"Fazer upload de dados de clientes em texto simples"</b> (o Google faz o hash sozinho) e envie o CSV baixado aqui;</li>
      <li>Marque que os dados foram coletados da sua relação direta com os clientes e conclua — o processamento leva de algumas horas até 1-2 dias;</li>
      <li>Na campanha: use a lista como <b>público-alvo</b>, crie um <b>Semelhante</b> (pessoas parecidas com seus clientes) ou use como <b>exclusão</b> em campanha de aquisição (não pagar clique de quem já é cliente).</li>
    </ol>
  </div>
  <div style="background:#FBF6E6;border:1px solid #efe1b5;border-radius:12px;padding:13px 15px;font-size:12px;color:#7a6a3a;line-height:1.6">
    <b>Transparência:</b> o Google exige (e a LGPD também) que a lista seja de quem tem <b>relação real</b> com a Ecobraz — por isso o escopo "Clientes de verdade" é o recomendado. O Google transforma os dados em hash na subida e usa <b>só para correspondência</b> (não vira mailing de terceiros). O arquivo baixa direto do sistema para a sua máquina.
  </div>
</div></body></html>`;
}
