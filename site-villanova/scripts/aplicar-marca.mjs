// Aplica a marca modernizada nas configurações do Ghost da Villanova ESG:
//  - envia o escudo 512 e define como ícone da publicação (favicon/PWA)
//  - envia o cartão social 1200x630 e define como imagem padrão de
//    compartilhamento (og_image e twitter_image)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const adminUrl = String(process.env.VILLANOVA_GHOST_ADMIN_URL || '').replace(/\/$/, '');
const adminKey = String(process.env.VILLANOVA_GHOST_ADMIN_API_KEY || '');
const [id, secret] = adminKey.split(':');
const now = Math.floor(Date.now() / 1000);
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const unsigned = `${enc({alg:'HS256',typ:'JWT',kid:id})}.${enc({iat:now,exp:now+300,aud:'/admin/'})}`;
const token = `${unsigned}.${crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(unsigned).digest('base64url')}`;
const auth = {Authorization: `Ghost ${token}`, 'Accept-Version': 'v5.0'};

async function subirImagem(caminho, nome) {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(caminho)], {type: 'image/png'}), nome);
  form.append('purpose', 'image');
  const r = await fetch(`${adminUrl}/ghost/api/admin/images/upload/`, {method: 'POST', headers: auth, body: form});
  const t = await r.text();
  if (!r.ok) throw new Error(`Upload de ${nome} falhou (${r.status}): ${t.slice(0, 300)}`);
  const url = JSON.parse(t).images?.[0]?.url;
  console.log(`Imagem enviada: ${nome} -> ${url}`);
  return url;
}

const icone = await subirImagem('site-villanova/marca/escudo-512.png', 'villanova-escudo-512.png');
const cartao = await subirImagem('site-villanova/marca/cartao-social-1200x630.png', 'villanova-cartao-social.png');

const settings = [
  {key: 'icon', value: icone},
  {key: 'og_image', value: cartao},
  {key: 'twitter_image', value: cartao},
];
const r = await fetch(`${adminUrl}/ghost/api/admin/settings/`, {
  method: 'PUT',
  headers: {...auth, 'Content-Type': 'application/json'},
  body: JSON.stringify({settings}),
});
if (!r.ok) throw new Error(`Atualização de settings falhou (${r.status}): ${(await r.text()).slice(0, 400)}`);
console.log('Ícone da publicação e imagens sociais definidos ✔');
