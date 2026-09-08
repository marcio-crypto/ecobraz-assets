/* Villanova v2 — menu de celular.

   Existe porque abaixo de 900px o menu do topo era escondido pelo CSS sem nada
   no lugar: Serviços, Base de conhecimento, Publicações, SEMM e A firma só
   podiam ser alcançados rolando a página inteira até o rodapé.

   Ele NÃO decide idioma. Quem decide é o lang.css, e este arquivo nunca mexe em
   display de nada com classe only-en/only-pt/only-it — mostrar ou esconder o
   painel é feito numa classe própria (.is-open) no recipiente. Se um dia o
   menu aparecer no idioma errado, o problema é o lang.css, não este arquivo. */
(function () {
  var botao = document.querySelector('.menu-btn');
  var painel = document.getElementById('menu-villanova');
  if (!botao || !painel) return;

  function fecha() {
    painel.classList.remove('is-open');
    botao.setAttribute('aria-expanded', 'false');
  }
  function alterna() {
    var aberto = painel.classList.toggle('is-open');
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
  }

  botao.addEventListener('click', function (e) {
    e.stopPropagation();
    alterna();
  });

  // Clicar num link fecha o painel: em navegação para âncora na mesma página
  // não há recarregamento, e o painel ficaria aberto por cima do conteúdo.
  painel.addEventListener('click', function (e) {
    if (e.target && e.target.closest('a')) fecha();
  });

  document.addEventListener('click', function (e) {
    if (!painel.contains(e.target) && e.target !== botao) fecha();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fecha();
  });

  // Ao voltar para largura de desktop o painel some pelo CSS, mas o
  // aria-expanded ficaria mentindo para leitor de tela.
  var largo = window.matchMedia('(min-width: 1025px)');
  var aoMudar = function (m) { if (m.matches) fecha(); };
  if (largo.addEventListener) largo.addEventListener('change', aoMudar);
  else if (largo.addListener) largo.addListener(aoMudar);
})();
