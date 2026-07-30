/* Villanova v2 — direcionamento automático de idioma na entrada.
   Regra: só age na HOME em inglês ("/"), uma vez, pelo idioma do NAVEGADOR
   (o que a pessoa lê — mais confiável que IP/região e imune a VPN):
   pt* -> /pt/ · it* -> /it/ · resto fica em inglês.
   A escolha manual no seletor de idioma vale mais e fica guardada. */
(function () {
  var CHAVE = 'vn-idioma';

  // Toda troca manual de idioma grava a preferência.
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('.lang-switch');
    if (!a) return;
    try {
      var alvo = a.getAttribute('data-lang-target') || '';
      localStorage.setItem(CHAVE, alvo.indexOf('pt') === 0 ? 'pt' : (alvo.indexOf('it') === 0 ? 'it' : 'en'));
    } catch (err) {}
  });

  // Redireciona apenas na home EN, sem preferência guardada, fora de robôs.
  if (location.pathname !== '/') return;
  if (navigator.webdriver) return;
  var guardado = null;
  try { guardado = localStorage.getItem(CHAVE); } catch (err) {}
  if (guardado) {
    if (guardado === 'pt') location.replace('/pt/');
    else if (guardado === 'it') location.replace('/it/');
    return;
  }
  var linguas = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map(function (l) { return String(l).toLowerCase(); });
  for (var i = 0; i < linguas.length; i++) {
    if (linguas[i].indexOf('pt') === 0) {
      try { localStorage.setItem(CHAVE, 'pt'); } catch (err) {}
      location.replace('/pt/');
      return;
    }
    if (linguas[i].indexOf('it') === 0) {
      try { localStorage.setItem(CHAVE, 'it'); } catch (err) {}
      location.replace('/it/');
      return;
    }
    if (linguas[i].indexOf('en') === 0) break; // inglês explícito: fica
  }
})();
