/* Villanova v2 — transforma cada artigo em "revista executiva" sem tocar no
   conteúdo: selo de verificação, sumário lateral, card de serviço por tema,
   faixa de CTA no meio e caixa do autor. Progressivo: sem JS, o artigo
   continua íntegro. */
(function () {
  var body = document.querySelector('.article-body');
  var head = document.querySelector('.article-head .wrap');
  if (!body || !head) return;
  var isPT = document.documentElement.lang === 'pt-BR';
  var url = function (p) { return p; };

  /* 1) Selo "status verificado" — detecta a frase datada no conteúdo */
  var texto = body.textContent || '';
  var m = texto.match(/(?:Legal status checked|verificado em)\s+([0-9]{1,2}[^.,;\n]{2,20}[0-9]{4})/i);
  if (m) {
    var selo = document.createElement('span');
    selo.className = 'vn-verified';
    selo.textContent = (isPT ? '✓ Status legal verificado · ' : '✓ Legal status checked · ') + m[1].trim();
    head.insertBefore(selo, head.querySelector('h1'));
  }

  /* 2) Card de serviço por tema (classe da tag no body) */
  var mapa = [
    [/tag-cbam/i, isPT ? ['Revisão CBAM', 'Seus dados de emissões contra o pedido real do importador.', '/revisao-evidencias-cbam/'] : ['CBAM Evidence Review', 'Your emissions data against the importer’s actual request.', '/cbam-evidence-review-brazilian-suppliers/']],
    [/tag-eudr/i, isPT ? ['Revisão EUDR', 'Origem, geolocalização e legalidade mapeadas antes de o comprador pedir.', '/revisao-prontidao-evidencias-eudr/'] : ['EUDR Evidence Review', 'Origin, geolocation and legality mapped before the buyer asks.', '/eudr-evidence-readiness-review/']],
    [/tag-(procurement|contract)/i, isPT ? ['Revisão de Cláusulas', 'O que cada cláusula exige — e o que você consegue provar antes de assinar.', '/revisao-risco-clausulas-contratuais/'] : ['Contract Clause Review', 'What each clause really requests — and what you can prove before signing.', '/contract-clause-risk-review-eu-facing-suppliers/']],
    [/tag-(finance|supply-chain)/i, isPT ? ['Revisão do Dossiê', 'Seus documentos contra o pedido do comprador, com plano priorizado.', '/revisao-evidencias-eudr-cbam-csddd-exportadores/'] : ['Supplier Evidence Review', 'Your records against the buyer’s request, with a prioritised plan.', '/supplier-evidence-file-assessment/']]
  ];
  var svc = isPT ? ['Revisão do Dossiê', 'Seus documentos contra o pedido do comprador, com plano priorizado.', '/revisao-evidencias-eudr-cbam-csddd-exportadores/'] : ['Supplier Evidence Review', 'Your records against the buyer’s request, with a prioritised plan.', '/supplier-evidence-file-assessment/'];
  for (var i = 0; i < mapa.length; i++) if (mapa[i][0].test(document.body.className)) { svc = mapa[i][1]; break; }

  /* 3) Sumário lateral + confiança (desktop) */
  var h2s = body.querySelectorAll('h2');
  var layout = document.createElement('div');
  layout.className = 'article-layout wrap';
  var pai = body.parentNode;
  pai.insertBefore(layout, body);
  layout.appendChild(body);
  var side = document.createElement('aside');
  side.className = 'article-side';
  var toc = '';
  if (h2s.length >= 2) {
    for (var j = 0; j < Math.min(h2s.length, 7); j++) {
      h2s[j].id = h2s[j].id || 'sec-' + j;
      toc += '<a href="#' + h2s[j].id + '">' + h2s[j].textContent.slice(0, 60) + '</a>';
    }
    toc = '<div class="side-card"><h4>' + (isPT ? 'Neste artigo' : 'In this article') + '</h4><div class="side-toc">' + toc + '</div></div>';
  }
  side.innerHTML = toc +
    '<div class="side-cta"><b>' + svc[0] + '</b><p>' + svc[1] + '</p><a class="btn" href="' + url(svc[2]) + '">' + (isPT ? 'Ver o serviço →' : 'View the service →') + '</a></div>' +
    '<div class="side-card"><h4>' + (isPT ? 'Por que confiar' : 'Why trust this') + '</h4><div class="side-trust">✓ ' + (isPT ? '18 relatórios técnicos com DOI' : '18 technical reports with DOIs') + '<br>✓ ECESP · ' + (isPT ? 'Comissão Europeia' : 'European Commission') + '<br>✓ ' + (isPT ? 'Operação real no Brasil desde 2011' : 'Real operations in Brazil since 2011') + '</div></div>';
  layout.appendChild(side);

  /* 4) Faixa de CTA no meio do artigo */
  if (h2s.length >= 3) {
    var alvo = h2s[Math.floor(h2s.length / 2)];
    var faixa = document.createElement('div');
    faixa.className = 'article-ctaband';
    faixa.innerHTML = '<div><b>' + (isPT ? 'Recebeu um pedido como este?' : 'Received a request like this?') + '</b><small>' + (isPT ? 'Envie o pedido — dizemos o que o seu dossiê já defende. Resposta em 1 dia útil.' : 'Send the request — we’ll tell you what your file can already defend. Reply within 1 business day.') + '</small></div><a href="' + (isPT ? '/solicitar-analise/' : '/supplier-evidence-risk-intake/') + '">' + (isPT ? 'Começar a triagem →' : 'Start the scope assessment →') + '</a>';
    alvo.parentNode.insertBefore(faixa, alvo);
  }

  /* 5) Caixa do autor com foto */
  var autor = document.createElement('div');
  autor.className = 'article-author';
  var av = document.querySelector('link[rel="stylesheet"][href*="v2.css"]');
  var base = av ? av.href.replace(/css\/v2\.css.*$/, '') : '/assets/';
  autor.innerHTML = '<img src="' + base + 'images/marcio-avatar.jpg" alt="Marcio Villanova"><div><b>Marcio Villanova</b><p>' + (isPT ? 'Fundador da Villanova ESG · CEO da Ecobraz desde 2011 · autor do modelo SEMM (DOI/Zenodo) · ORCID' : 'Founder, Villanova ESG · CEO of Ecobraz since 2011 · author of the SEMM framework (DOI/Zenodo) · ORCID') + '</p></div>';
  body.appendChild(autor);
})();
