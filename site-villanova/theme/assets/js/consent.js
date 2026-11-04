/* Villanova ESG — consentimento de cookies (GDPR/LGPD) com Google Consent Mode v2.
   Analytics só é liberado após consentimento explícito. Bilíngue EN/PT. */
(function () {
  var KEY = 'vn-consent';
  var pt = (navigator.language || '').toLowerCase().indexOf('pt') === 0;
  var t = pt ? {
    text: 'Usamos cookies de medição (Google Analytics, Microsoft Clarity e Metricool) apenas com o seu consentimento, conforme o GDPR e a LGPD. Cookies essenciais não coletam dados pessoais.',
    accept: 'Aceitar medição',
    reject: 'Somente essenciais',
    policy: 'Política de privacidade'
  } : {
    text: 'We use measurement cookies (Google Analytics, Microsoft Clarity and Metricool) only with your consent, in line with GDPR and LGPD. Essential cookies do not collect personal data.',
    accept: 'Accept measurement',
    reject: 'Essential only',
    policy: 'Privacy policy'
  };

  // Microsoft Clarity (mapa de calor) — carrega só APÓS o aceite (mais estrito).
  var clarityLoaded = false;
  function loadClarity() {
    if (clarityLoaded) return;
    clarityLoaded = true;
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', 'xo2sy61q4d');
  }

  // Metricool — medicao de site do painel da Villanova ESG (marca 7795884).
  // Mesma regra da Clarity: carrega so' APOS o aceite, porque o tracker
  // identifica a visita. O `hash` abaixo nao e' credencial: e' o
  // identificador publico da marca, servido no HTML de quem visita, como o
  // ID do GA4 e a data-key do Ahrefs que ja' estao no default.hbs.
  var metricoolLoaded = false;
  function loadMetricool() {
    if (metricoolLoaded) return;
    metricoolLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    // O caminho e' /resources/be.js. Em 01/11/2026 eu escrevi tracker.js de
    // cabeca e o CloudFront devolveu 403: a tag disparava e nao carregava
    // nada. Este endereco veio do snippet do proprio painel, nao de memoria.
    s.src = 'https://tracker.metricool.com/resources/be.js';
    s.onload = function () {
      if (window.beTracker && typeof window.beTracker.t === 'function') {
        window.beTracker.t({hash: '5aa5d9d13ab65af696706fbdf091131'});
      }
    };
    document.getElementsByTagName('head')[0].appendChild(s);
  }

  function update(state) {
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        analytics_storage: state === 'granted' ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
    if (state === 'granted') { loadClarity(); loadMetricool(); }
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'granted' || saved === 'denied') { update(saved); return; }

  var bar = document.createElement('div');
  bar.className = 'vn-consent';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Cookie consent');
  bar.innerHTML =
    '<p>' + t.text + ' <a href="/privacy/">' + t.policy + '</a></p>' +
    '<div class="vn-consent-actions">' +
    '<button type="button" class="vn-ok">' + t.accept + '</button>' +
    '<button type="button" class="vn-no">' + t.reject + '</button>' +
    '</div>';

  function decide(state) {
    try { localStorage.setItem(KEY, state); } catch (e) {}
    update(state);
    bar.remove();
  }
  bar.querySelector('.vn-ok').addEventListener('click', function () { decide('granted'); });
  bar.querySelector('.vn-no').addEventListener('click', function () { decide('denied'); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(bar); });
  } else {
    document.body.appendChild(bar);
  }
})();
