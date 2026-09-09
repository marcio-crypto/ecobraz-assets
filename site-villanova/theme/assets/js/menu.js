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

  // O PAINEL VEM ANTES DO BOTAO NO HTML. O nav-wrap fica logo depois da marca e
  // o botao fica no .top-right, no fim da barra. Sem mexer no foco, abrir o menu
  // e apertar Tab pula os itens do painel inteiros e joga o foco no conteudo da
  // pagina — quem navega por teclado abre o menu e nao alcanca nenhum link.
  // Por isso abrir manda o foco para o primeiro link visivel, e fechar devolve
  // o foco ao botao em vez de largar no <body>.
  function primeiroLinkVisivel() {
    var links = painel.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (links[i].offsetParent !== null) return links[i];
    }
    return null;
  }

  function fecha(devolveFoco) {
    if (!painel.classList.contains('is-open')) return;
    painel.classList.remove('is-open');
    painel.style.maxHeight = '';
    botao.setAttribute('aria-expanded', 'false');
    if (devolveFoco) { try { botao.focus(); } catch (e) {} }
  }
  // O teto de altura do painel e medido, nao chutado. O CSS tem uma conta de
  // reserva (100dvh menos a altura da barra), mas a altura da barra muda com o
  // tamanho da fonte, com a quebra da marca e com a barra do navegador movel.
  // Medir o topo real do painel e o unico jeito de o ultimo item nunca ficar
  // abaixo da tela — foi o que aconteceu em 740x360 com o valor fixo errado.
  function ajustaAltura() {
    if (!painel.classList.contains('is-open')) return;
    var topo = painel.getBoundingClientRect().top;
    var disponivel = window.innerHeight - topo - 8;
    if (disponivel > 80) painel.style.maxHeight = disponivel + 'px';
  }

  function abre() {
    painel.classList.add('is-open');
    botao.setAttribute('aria-expanded', 'true');
    ajustaAltura();
    var primeiro = primeiroLinkVisivel();
    if (primeiro) { try { primeiro.focus(); } catch (e) {} }
  }
  function alterna() {
    if (painel.classList.contains('is-open')) fecha(true);
    else abre();
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
    if (!painel.contains(e.target) && !botao.contains(e.target)) fecha(false);
  });

  // Escape devolve o foco ao botao: quem fechou com o teclado precisa continuar
  // de algum lugar, e o <body> nao e lugar.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') fecha(true);
  });

  // Tab saindo do ultimo link do painel fecha o menu e segue a pagina, em vez
  // de deixar um painel aberto por cima do conteudo com o foco ja fora dele.
  painel.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || e.shiftKey) return;
    var links = painel.querySelectorAll('a');
    var ultimo = null;
    for (var i = 0; i < links.length; i++) if (links[i].offsetParent !== null) ultimo = links[i];
    if (ultimo && e.target === ultimo) fecha(false);
  });

  // Ao voltar para largura de desktop o painel some pelo CSS, mas o
  // aria-expanded ficaria mentindo para leitor de tela.
  // Girar o aparelho com o menu aberto muda a altura disponivel.
  window.addEventListener('resize', ajustaAltura);
  window.addEventListener('orientationchange', ajustaAltura);

  var largo = window.matchMedia('(min-width: 1025px)');
  var aoMudar = function (m) { if (m.matches) fecha(false); };
  if (largo.addEventListener) largo.addEventListener('change', aoMudar);
  else if (largo.addListener) largo.addListener(aoMudar);
})();
