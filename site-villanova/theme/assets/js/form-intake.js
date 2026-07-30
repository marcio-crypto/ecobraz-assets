/* Villanova v2 — formulário de intake + materiais gateados.
   Envia FormData ao worker (data-endpoint), marca generate_lead no GA4 e
   libera o download dos materiais após um mini-formulário. Progressivo:
   sem JS o formulário reporta o e-mail de contato. */
(function () {
  var lang = document.documentElement.lang === 'pt-BR' ? 'pt' : (document.documentElement.lang === 'it' ? 'it' : 'en');
  var isPT = lang === 'pt';
  var TT = {
    pt: { sending: 'Enviando…', ok: 'Obrigado. Sua solicitação foi enviada — respondemos em 1 dia útil.', err: 'Algo deu errado. Escreva para contato@villanovaesg.com.', big: 'O anexo passa de 8 MB — reduza o arquivo ou envie sem anexo.', mok: 'Pronto! Seu material está abrindo — também deixamos o link abaixo.', open: 'Abrir o material →' },
    it: { sending: 'Invio in corso…', ok: 'Grazie. La sua richiesta è stata inviata — rispondiamo entro 1 giorno lavorativo.', err: 'Qualcosa è andato storto. Scriva a contact@villanovaesg.com.', big: "L'allegato supera gli 8 MB — riduca il file o invii senza allegato.", mok: 'Fatto! Il materiale si sta aprendo — il link è anche qui sotto.', open: 'Apri il materiale →' },
    en: { sending: 'Sending…', ok: 'Thank you. Your request was sent — we reply within 1 business day.', err: 'Something went wrong. Please email contact@villanovaesg.com.', big: 'The attachment exceeds 8 MB — reduce the file or send without it.', mok: 'Done! Your material is opening — the link is also below.', open: 'Open the material →' }
  };
  var T = TT[lang];

  function ga(nome, origem) {
    try { if (window.gtag) window.gtag('event', nome, { method: origem }); } catch (e) {}
  }

  function prepara(form) {
    var idioma = form.querySelector('input[name="idioma"]');
    if (idioma) idioma.value = lang;
    // Só o seletor do idioma da página entra no envio.
    form.querySelectorAll('select[data-tipo-lang]').forEach(function (s) {
      s.disabled = s.getAttribute('data-tipo-lang') !== (isPT ? 'pt' : 'en');
    });
  }

  function envia(form, ep, extra, aoOk, aoErro) {
    var fd = new FormData(form);
    Object.keys(extra || {}).forEach(function (k) { fd.set(k, extra[k]); });
    fetch(ep, { method: 'POST', headers: { 'Accept': 'application/json' }, body: fd })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) { if (j && (j.ok || j.success)) aoOk(); else aoErro(); })
      .catch(aoErro);
  }

  /* Formulário principal */
  var form = document.querySelector('[data-intake-form]');
  if (form) {
    prepara(form);
    var status = form.querySelector('[data-intake-status]');
    var btn = form.querySelector('[data-intake-submit]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var anexo = form.querySelector('input[name="anexo"]');
      if (anexo && anexo.files[0] && anexo.files[0].size > 8 * 1024 * 1024) {
        status.hidden = false; status.className = 'vn-form-status is-err'; status.textContent = T.big; return;
      }
      var ep = form.getAttribute('data-endpoint');
      if (!ep || ep.indexOf('http') !== 0) { window.location.href = 'mailto:contact@villanovaesg.com'; return; }
      btn.disabled = true;
      status.hidden = false; status.className = 'vn-form-status'; status.textContent = T.sending;
      envia(form, ep, null, function () {
        form.reset(); prepara(form);
        status.className = 'vn-form-status is-ok'; status.textContent = T.ok;
        btn.disabled = false;
        ga('generate_lead', 'intake_form');
      }, function () {
        status.className = 'vn-form-status is-err'; status.textContent = T.err;
        btn.disabled = false;
      });
    });
  }

  /* Materiais gateados: [data-magnet-form data-file data-source] */
  document.querySelectorAll('[data-magnet-form]').forEach(function (mf) {
    var st = mf.querySelector('[data-magnet-status]');
    var bt = mf.querySelector('[data-magnet-submit]');
    mf.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!mf.checkValidity()) { mf.reportValidity(); return; }
      var ep = mf.getAttribute('data-endpoint') || (form && form.getAttribute('data-endpoint'));
      var arquivo = mf.getAttribute('data-file');
      var origem = mf.getAttribute('data-source') || 'magnet';
      var libera = function () {
        if (st) {
          st.hidden = false; st.className = 'vn-form-status is-ok';
          st.innerHTML = T.mok + ' <a href="' + arquivo + '" target="_blank" rel="noopener">' + T.open + '</a>';
        }
        if (bt) bt.disabled = false;
        ga('generate_lead', origem);
        window.open(arquivo, '_blank');
      };
      if (!ep || ep.indexOf('http') !== 0) { libera(); return; }
      if (bt) bt.disabled = true;
      if (st) { st.hidden = false; st.className = 'vn-form-status'; st.textContent = T.sending; }
      var extra = { lead_source: origem, idioma: lang };
      // Falha no registro do lead não bloqueia o download — o material abre igual.
      envia(mf, ep, extra, libera, libera);
    });
  });
})();
