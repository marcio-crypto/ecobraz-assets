(function () {
  var form = document.querySelector('[data-intake-form]');
  if (!form) return;
  var status = form.querySelector('[data-intake-status]');
  var btn = form.querySelector('[data-intake-submit]');
  var isEN = /(^|\s)page-supplier-evidence-risk-intake(\s|$)/.test(document.body.className);
  var t = isEN
    ? { sending: 'Sending…', ok: 'Thank you. Your request was sent — we will reply by email.', err: 'Something went wrong. Please email contact@villanovaesg.com.' }
    : { sending: 'Enviando…', ok: 'Obrigado. Sua solicitação foi enviada — responderemos por e-mail.', err: 'Algo deu errado. Escreva para contato@villanovaesg.com.' };

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var ep = form.getAttribute('data-endpoint');
    if (!ep) { window.location.href = 'mailto:contact@villanovaesg.com'; return; }
    var data = {
      nome: form.nome.value, email: form.email.value,
      empresa: form.empresa.value, mensagem: form.mensagem.value,
      _gotcha: form._gotcha.value
    };
    btn.disabled = true;
    status.hidden = false;
    status.className = 'vn-form-status';
    status.textContent = t.sending;
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (j) {
        if (j && j.ok) {
          form.reset();
          status.className = 'vn-form-status is-ok';
          status.textContent = t.ok;
        } else { throw 0; }
        btn.disabled = false;
      })
      .catch(function () {
        status.className = 'vn-form-status is-err';
        status.textContent = t.err;
        btn.disabled = false;
      });
  });
})();
