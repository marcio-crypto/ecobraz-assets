// Gera content/paginas-internas.json a partir da assinatura de e-mail que vive
// em assinaturas/assinatura-debora-villanova.html — assim a página do site e o
// arquivo da assinatura nunca divergem. Estilo e botão de copiar ficam no tema
// (theme/page-assinatura-debora.hbs).
import fs from 'node:fs';
import path from 'node:path';

const siteRoot = path.resolve(import.meta.dirname, '..');
const origem = path.join(siteRoot, 'assinaturas', 'assinatura-debora-villanova.html');
const destino = path.join(siteRoot, 'content', 'paginas-internas.json');

const arquivo = fs.readFileSync(origem, 'utf8');
const inicio = arquivo.indexOf('<table');
const fim = arquivo.lastIndexOf('</table>');
if (inicio === -1 || fim === -1) throw new Error(`Assinatura não encontrada em ${origem}`);
const assinatura = arquivo.slice(inicio, fim + '</table>'.length).trim();

if (!assinatura.includes('debora@ecobraz.org.br')) throw new Error('Assinatura sem o e-mail esperado');
if (/http:\/\//i.test(assinatura)) throw new Error('Assinatura com link inseguro (http://)');

const html = `<!--kg-card-begin: html-->
<div class="asn">
<p class="asn-intro">Débora Villanova, Comercial. Copie a assinatura daqui e cole no Gmail — leva menos de um minuto e não precisa baixar nada.</p>

<div class="asn-palco">
<p class="asn-rotulo">Como vai aparecer no fim dos e-mails</p>
<div class="asn-moldura" id="asn-fonte">${assinatura}</div>
<div class="asn-acoes"><button class="asn-botao" id="asn-copiar" type="button">Copiar assinatura</button><span class="asn-aviso" id="asn-aviso" role="status" aria-live="polite"></span></div>
</div>

<div>
<h2>Colar no Gmail</h2>
<ol class="asn-passos">
<li><span class="asn-num">1</span><p>Clique em <strong>Copiar assinatura</strong>, aqui em cima.</p></li>
<li><span class="asn-num">2</span><p>No Gmail, abra a engrenagem <strong>⚙</strong> no canto superior direito → <strong>Ver todas as configurações</strong> → aba <strong>Geral</strong> → role até <strong>Assinatura</strong> → <strong>Criar</strong> (dê um nome, por exemplo “Ecobraz”).</p></li>
<li><span class="asn-num">3</span><p>Clique dentro da caixa branca da assinatura e cole com <span class="asn-tecla">Ctrl</span> + <span class="asn-tecla">V</span> (no Mac, <span class="asn-tecla">⌘</span> + <span class="asn-tecla">V</span>).</p></li>
<li><span class="asn-num">4</span><p>Logo abaixo, em <strong>Padrões da assinatura</strong>, escolha essa assinatura nas duas listas — “para novos e-mails” e “ao responder/encaminhar”. Role até o fim da página e clique em <strong>Salvar alterações</strong>.</p></li>
</ol>
</div>

<div>
<h2>Se algo não sair como deveria</h2>
<p>Mande um e-mail de teste para você mesma e confira se a logo aparece. Se ela vier quebrada, apague a imagem na caixa da assinatura e use o botão <strong>Inserir imagem</strong> do Gmail para subir o arquivo da logo. Se o botão de copiar não funcionar no seu navegador, selecione a assinatura com o mouse e use Ctrl+C.</p>
<details>
<summary>Código HTML da assinatura (para Outlook ou suporte técnico)</summary>
<p>A mesma assinatura em código. No Outlook: Arquivo → Opções → E-mail → Assinaturas.</p>
<pre id="asn-codigo"></pre>
<button class="asn-botao asn-suave" id="asn-copiar-codigo" type="button">Copiar o código</button> <span class="asn-aviso" id="asn-aviso-codigo" role="status" aria-live="polite"></span>
</details>
</div>
</div>
<!--kg-card-end: html-->`;

const pagina = {
  title: 'Assinatura de e-mail — Débora Villanova',
  slug: 'assinatura-debora',
  custom_excerpt: 'Página de uso interno da equipe: copiar a assinatura de e-mail padrão da Ecobraz e colar no Gmail.',
  meta_title: 'Assinatura de e-mail — Débora Villanova | Ecobraz',
  meta_description: 'Página de uso interno da Ecobraz: copie a assinatura de e-mail padrão da equipe comercial e cole no Gmail em quatro passos.',
  html
};

fs.writeFileSync(destino, `${JSON.stringify([pagina], null, 2)}\n`);
console.log(`Página interna gerada: ${path.relative(siteRoot, destino)} (slug ${pagina.slug})`);
