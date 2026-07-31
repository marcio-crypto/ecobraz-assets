(() => {
    const track = (name, params) => { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); };

    // Persistência de UTMs: a origem da campanha sobrevive à navegação até o formulário.
    const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    const landingParams = new URLSearchParams(window.location.search);
    try {
        if (UTM_KEYS.some((key) => landingParams.get(key))) {
            UTM_KEYS.forEach((key) => sessionStorage.setItem(`ecb_${key}`, landingParams.get(key) || ''));
        }
    } catch (_) { /* armazenamento indisponível não deve quebrar a página */ }
    const storedUtm = (key) => { try { return sessionStorage.getItem(`ecb_${key}`) || ''; } catch (_) { return ''; } };

    // Micro-conversões: WhatsApp, telefone, e-mail e todos os CTAs identificados.
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a, button');
        if (!link) return;
        const ctaId = link.dataset.track || '';
        const href = link.getAttribute('href') || '';
        if (href.includes('wa.me') || href.includes('api.whatsapp.com')) track('contact_whatsapp', {cta_id: ctaId || 'whatsapp', page_path: window.location.pathname});
        else if (href.startsWith('tel:')) track('contact_phone', {cta_id: ctaId || 'telefone', page_path: window.location.pathname});
        else if (href.startsWith('mailto:')) track('contact_email', {cta_id: ctaId || 'email', page_path: window.location.pathname});
        else if (ctaId) track('cta_click', {cta_id: ctaId, page_path: window.location.pathname});
    }, {capture: true});

    const toggle = document.querySelector('[data-nav-toggle]');
    const nav = document.querySelector('[data-nav]');
    if (toggle && nav) toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open)); nav.classList.toggle('is-open', !open);
    });

    // Banner de consentimento (Consent Mode v2): mostra quando não há escolha
    // guardada; atualiza o gtag e persiste a decisão. Reabre pelo link do rodapé.
    const consentBar = document.querySelector('[data-consent-bar]');
    if (consentBar) {
        // Visitante de fora do Brasil/Portugal vê o banner em inglês (GDPR).
        if ((navigator.language || '').toLowerCase().indexOf('pt') !== 0) {
            consentBar.querySelector('p').innerHTML = '<strong>Cookies and measurement.</strong> We use cookies to measure site usage and improve your experience. You can accept or decline — your choice is saved for future visits. <a href="/politica-de-privacidade/">Privacy policy</a>';
            consentBar.querySelector('[data-consent-accept]').textContent = 'Accept';
            consentBar.querySelector('[data-consent-decline]').textContent = 'Decline';
        }
        const readConsent = () => { try { return localStorage.getItem('ecb_consent'); } catch (_) { return 'unavailable'; } };
        const applyConsent = (state) => {
            try { localStorage.setItem('ecb_consent', state); } catch (_) {}
            if (typeof window.gtag === 'function') window.gtag('consent', 'update', {ad_storage: state, ad_user_data: state, ad_personalization: state, analytics_storage: state});
            if (typeof window.clarity === 'function') window.clarity('consent', state === 'granted');
            consentBar.hidden = true;
            track('consent_choice', {choice: state});
        };
        if (!readConsent() || readConsent() === null) consentBar.hidden = false;
        consentBar.querySelector('[data-consent-accept]').addEventListener('click', () => applyConsent('granted'));
        consentBar.querySelector('[data-consent-decline]').addEventListener('click', () => applyConsent('denied'));
        document.querySelectorAll('[data-consent-open]').forEach((el) => el.addEventListener('click', (event) => { event.preventDefault(); consentBar.hidden = false; }));
    }

    const form = document.querySelector('[data-collection-form]');
    if (!form) return;
    const status = form.querySelector('[data-form-status]');
    // Tela única (feedback do Marcio 31/07): sem etapas, sem "Continuar" — todos
    // os campos visíveis de uma vez, agrupados; o perfil é um alternador no topo.
    form.classList.add('is-enhanced');
    const params = new URLSearchParams(window.location.search);
    form.querySelector('[data-page-url]').value = window.location.href;
    form.querySelectorAll('[data-utm]').forEach((input) => { input.value = params.get(input.dataset.utm) || storedUtm(input.dataset.utm); });

    // form_start_coleta: dispara uma única vez, na primeira interação real com o formulário.
    let formStarted = false;
    form.addEventListener('input', () => {
        if (formStarted) return;
        formStarted = true;
        track('form_start_coleta', {page_path: window.location.pathname});
    }, {once: false});
    const profile = params.get('perfil');
    const profileInput = profile && form.querySelector(`[name="profile"][value="${profile === 'pessoa-fisica' ? 'pessoa_fisica' : profile}"]`);
    if (profileInput) profileInput.checked = true;
    // Landings EN mandam o material em inglês — traduz para a opção PT equivalente do select.
    const materialMapEn = {'Electronics': 'Eletrônicos', 'IT and computing': 'Informática e TI', 'Servers and data centre': 'Servidores e data center'};
    const materialRaw = params.get('material');
    const material = materialMapEn[materialRaw] || materialRaw;
    const materialInput = form.querySelector('[name="material_category"]');
    if (material && materialInput && Array.from(materialInput.options).some((option) => option.value === material)) materialInput.value = material;

    // Continuidade dos mini-formulários do hero (landings): aproveita local/descricao
    // da URL para a pessoa não redigitar CEP/cidade e a descrição do lote.
    const local = (params.get('local') || '').trim();
    if (local) {
        const cepInput = form.querySelector('[name="postal_code"]');
        const cityInput = form.querySelector('[name="city"]');
        if (/^\d{5}-?\d{3}$/.test(local.replace(/\s/g, ''))) { if (cepInput && !cepInput.value) cepInput.value = local; }
        else if (cityInput && !cityInput.value) cityInput.value = local;
    }
    const descricaoLote = (params.get('descricao') || '').trim();
    if (descricaoLote) {
        const descInput = form.querySelector('[name="material_description"]');
        if (descInput && !descInput.value) descInput.value = descricaoLote;
    }

    // Equipamentos hospitalares exigem declaração explícita de ausência de contaminação.
    const hospitalBlock = form.querySelector('[data-hospital-declaration]');
    const hospitalCheckbox = hospitalBlock && hospitalBlock.querySelector('input[type="checkbox"]');
    const syncHospitalDeclaration = () => {
        if (!hospitalBlock || !materialInput) return;
        const isHospital = materialInput.value === 'Equipamentos hospitalares';
        hospitalBlock.hidden = !isHospital;
        hospitalCheckbox.required = isHospital;
        if (!isHospital) hospitalCheckbox.checked = false;
    };
    if (materialInput) { materialInput.addEventListener('change', syncHospitalDeclaration); syncHospitalDeclaration(); }

    // Formulário adaptativo (Lote 4): pessoa física responde só o essencial.
    // Esconde os campos .only-empresa e relaxa os required correspondentes;
    // o Worker (v10) valida com a mesma régua por perfil no servidor.
    // A classe is-empresa no <body> também alterna os textos .copy-pf/.copy-empresa
    // do hero — a página inteira fala a língua do perfil selecionado.
    const syncPerfil = () => {
        const marcado = form.querySelector('[name="profile"]:checked');
        const pf = Boolean(marcado && marcado.value === 'pessoa_fisica');
        form.classList.toggle('is-pf', pf);
        document.body.classList.toggle('is-empresa', !pf);
        ['volume', 'material_description', 'postal_code', 'state'].forEach((nome) => {
            const campo = form.querySelector(`[name="${nome}"]`);
            if (campo) campo.required = !pf;
        });
    };
    form.querySelectorAll('[name="profile"]').forEach((radio) => radio.addEventListener('change', syncPerfil));
    syncPerfil();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const endpoint = form.dataset.endpoint;
        if (!endpoint) {
            status.textContent = 'A integração está sendo configurada. Use o WhatsApp para enviar sua solicitação agora.';
            status.className = 'form-status is-error'; return;
        }
        const button = form.querySelector('[type="submit"]');
        // O rótulo do botão é restaurado no finally — capturado aqui para valer
        // também na versão em inglês do formulário (mesmo script para os dois).
        const buttonLabel = button.textContent;
        const payload = Object.fromEntries(new FormData(form).entries());
        // Registra a declaração hospitalar na descrição, para constar no CRM.
        if (payload.hospital_declaration === 'yes') {
            payload.material_description = `${payload.material_description || ''}\n[Gerador declara ausência de contaminação química, biológica ou radioativa e retirada prévia de fontes/controlados por responsável habilitado.]`;
        }
        button.disabled = true; button.textContent = 'Enviando…'; status.textContent = '';
        // Nomes amigáveis dos campos para mensagens de erro específicas — o
        // Worker devolve {error, fields[]} e o visitante precisa saber o que corrigir.
        const fieldLabels = {profile:'perfil (empresa ou pessoa física)', name:'nome', email:'e-mail', phone:'telefone', material_category:'categoria do material', volume:'volume estimado', material_description:'descrição dos materiais', postal_code:'CEP', city:'cidade', state:'estado (UF)', service_consent:'autorização de uso dos dados'};
        try {
            const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            if (!response.ok) {
                let detail = null;
                try { detail = await response.json(); } catch (_) {}
                if (detail && detail.error === 'validation_failed' && Array.isArray(detail.fields) && detail.fields.length) {
                    const nomes = detail.fields.map((f) => fieldLabels[f] || f).join(', ');
                    status.textContent = `Confira os seguintes campos e envie novamente: ${nomes}.`;
                    status.className = 'form-status is-error';
                    const first = form.querySelector(`[name="${detail.fields[0]}"]`);
                    if (first) { first.scrollIntoView({behavior: 'smooth', block: 'center'}); first.focus({preventScroll: true}); }
                    track('form_error_coleta', {page_path: window.location.pathname, error_type: 'validation', fields: detail.fields.join(',')});
                    return;
                }
                throw new Error((detail && detail.error) || 'submission_failed');
            }
            // Conversões otimizadas (Google Ads), autorizado pelo Marcio em 15/07/2026
            // (opção A): entrega e-mail/telefone à tag do Google, que aplica hash antes
            // de qualquer envio; o Modo de Consentimento v2 governa o uso conforme a
            // escolha registrada no banner de cookies (UE: só com aceite explícito).
            if (typeof window.gtag === 'function' && payload.email) {
                var phoneDigits = String(payload.phone || '').replace(/\D/g, '');
                if (phoneDigits.length === 10 || phoneDigits.length === 11) phoneDigits = '55' + phoneDigits;
                var userData = {email: String(payload.email).trim().toLowerCase()};
                if (phoneDigits.length === 12 || phoneDigits.length === 13) userData.phone_number = '+' + phoneDigits;
                window.gtag('set', 'user_data', userData);
            }
            // Conversão principal: só dispara quando o CRM confirmou o recebimento do lead.
            track('generate_lead', {
                method: 'formulario_site',
                profile: payload.profile,
                material_category: payload.material_category,
                state: payload.state,
                volume: payload.volume
            });
            window.dataLayer = window.dataLayer || []; window.dataLayer.push({event:'collection_request_submitted',profile:payload.profile,material_category:payload.material_category,state:payload.state});
            // A tela de confirmação substitui o formulário: evita reenvios em duplicidade.
            const isEn = (document.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
            const done = document.createElement('div');
            done.className = 'form-done';
            done.setAttribute('role', 'status');
            done.innerHTML = '<span class="form-done-icon" aria-hidden="true">✓</span>' +
                (isEn ? '<h2>Request received!</h2>' +
                    '<p>Thank you. Our team will review the details and contact you by the e-mail or phone you provided.</p>' +
                    '<p class="form-done-note">No need to send it again. If you prefer to speed things up, message the team on WhatsApp.</p>'
                : '<h2>Solicitação recebida!</h2>' +
                    '<p>Obrigado. Nossa equipe vai analisar as informações e entrar em contato pelo e-mail ou telefone que você informou.</p>' +
                    '<p class="form-done-note">Não é necessário enviar novamente. Se preferir adiantar a conversa, chame a equipe no WhatsApp.</p>');
            // Expressa (R$ 55): pagamento pelo Stripe direto na confirmação.
            // O link vem de data-checkout-url no <form> (Payment Link do Stripe);
            // o Stripe confirma o pagamento e o sistema finaliza a expressa.
            if (/EXPRESSA/.test(String(payload.urgency || ''))) {
                const checkoutUrl = form.dataset.checkoutUrl || '';
                const pagar = document.createElement('div');
                pagar.className = 'form-pix';
                if (checkoutUrl) {
                    // prefilled_email + client_reference_id: o Stripe devolve a
                    // referência na confirmação, e o sistema casa pagamento x lead.
                    const ref = encodeURIComponent(String(payload.email || '').slice(0, 180));
                    const url = checkoutUrl + (checkoutUrl.indexOf('?') === -1 ? '?' : '&') +
                        'prefilled_email=' + ref + '&client_reference_id=' + ref;
                    pagar.innerHTML = (isEn
                        ? '<h3>Express collection — R$ 55</h3>' +
                          '<p>Pay now with card or Pix, in a secure checkout. Payment is confirmed automatically and your express collection is finalised.</p>' +
                          '<p class="form-pix-chave"><a class="button" rel="noopener" data-checkout-link>Pay R$ 55 now</a></p>' +
                          '<p class="form-done-note">Ecobraz client? You can also pay in the <a href="https://sistema.ecobraz.org/" rel="noopener">client portal</a>.</p>'
                        : '<h3>Coleta expressa — R$ 55</h3>' +
                          '<p>Pague agora com cartão ou Pix, em ambiente seguro. O pagamento é confirmado automaticamente e a sua coleta expressa é finalizada.</p>' +
                          '<p class="form-pix-chave"><a class="button" rel="noopener" data-checkout-link>Pagar R$ 55 agora</a></p>' +
                          '<p class="form-done-note">Cliente Ecobraz? Também dá para pagar pelo <a href="https://sistema.ecobraz.org/" rel="noopener">sistema</a>.</p>');
                    pagar.querySelector('[data-checkout-link]').href = url;
                } else {
                    pagar.innerHTML = isEn
                        ? '<h3>Express collection — R$ 55</h3><p>The secure payment link arrives in the written confirmation. Want to speed it up? Message us on WhatsApp.</p>'
                        : '<h3>Coleta expressa — R$ 55</h3><p>O link de pagamento seguro chega na confirmação por escrito. Quer adiantar? Chame no WhatsApp.</p>';
                }
                done.appendChild(pagar);
                track('express_checkout_shown', {page_path: window.location.pathname});
            }
            form.replaceWith(done);
            done.scrollIntoView({behavior:'smooth', block:'center'});
            return;
        } catch (_) {
            status.textContent = 'Não foi possível enviar agora. Tente novamente ou fale com a equipe pelo WhatsApp.'; status.className = 'form-status is-error';
            track('form_error_coleta', {page_path: window.location.pathname});
        } finally { button.disabled = false; button.textContent = buttonLabel; }
    });
})();

// ============ Carrossel do hero por público (home) — 31/07 ============
// Vitrine inicial por sinais reais: ?perfil= na URL > UTM de campanha >
// memória de navegação (localStorage) > padrão "casa". Sem JS, só a
// vitrine "casa" aparece (as demais têm [hidden]).
(function () {
    // Memória leve de público: registrada em QUALQUER página, lida na home.
    const grava = (valor) => { try { localStorage.setItem('ecb_publico', valor); } catch (_) {} };
    const caminho = window.location.pathname;
    if (/para-governo|public-evidence\/gov/.test(caminho)) grava('governo');
    else if (/grandes-empresas|escopo-3|documentacao-esg|logistica-reversa-para|solucoes-corporativas|desmobilizacao|descarte-corporativo/.test(caminho)) grava('grandes');
    else if (/para-empresas|coletas-recorrentes|sistema-de-rastreabilidade|sanitizacao|destruicao-de-dados/.test(caminho)) grava('empresa');
    else if (/coleta-gratuita|descarte-de-geladeira|descarte-de-maquina-de-lavar|descarte-de-televisao/.test(caminho)) grava('casa');

    const carrossel = document.querySelector('[data-hero-carrossel]');
    if (!carrossel) return;
    const slides = Array.from(carrossel.querySelectorAll('[data-slide]'));
    const pontos = Array.from(carrossel.querySelectorAll('[data-ponto]'));
    if (slides.length < 2) return;

    // Sinal 1: ?perfil= na URL. Sinal 2: UTM (atual ou guardada). Sinal 3: memória.
    const params = new URLSearchParams(window.location.search);
    const utm = ((params.get('utm_campaign') || '') + ' ' + (function () { try { return sessionStorage.getItem('ecb_utm_campaign') || ''; } catch (_) { return ''; } })()).toLowerCase();
    let inicial = 'casa';
    const perfilUrl = (params.get('perfil') || '').replace('pessoa-fisica', 'pessoa_fisica');
    if (perfilUrl === 'empresa') inicial = 'empresa';
    else if (perfilUrl === 'pessoa_fisica') inicial = 'casa';
    else if (/governo|licitac/.test(utm)) inicial = 'governo';
    else if (/multinacional|grande|escopo|esg/.test(utm)) inicial = 'grandes';
    else if (/empresa|b2b|corporativ/.test(utm)) inicial = 'empresa';
    else { try { inicial = localStorage.getItem('ecb_publico') || 'casa'; } catch (_) {} }
    if (!slides.some((s) => s.dataset.slide === inicial)) inicial = 'casa';

    carrossel.classList.add('is-enhanced');
    let atual = inicial;
    const mostra = (nome) => {
        atual = nome;
        slides.forEach((s) => { const ativo = s.dataset.slide === nome; s.classList.toggle('is-active', ativo); if (ativo) s.removeAttribute('hidden'); else s.setAttribute('hidden', ''); });
        pontos.forEach((p) => p.classList.toggle('is-active', p.dataset.ponto === nome));
    };
    // No modo aprimorado os slides ficam empilhados: tira o hidden de todos
    // (a visibilidade passa a ser por opacidade) e ativa o inicial.
    slides.forEach((s) => s.removeAttribute('hidden'));
    mostra(inicial);
    if (inicial !== 'casa') { try { window.gtag && window.gtag('event', 'hero_personalizado', {vitrine: inicial}); } catch (_) {} }

    // Rotação automática: 6,5s; pausa com mouse/foco/aba oculta; respeita
    // prefers-reduced-motion (sem rotação — só navegação manual).
    const ordem = slides.map((s) => s.dataset.slide);
    const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pausado = false, timer = null;
    const proxima = () => { if (pausado || document.hidden) return; mostra(ordem[(ordem.indexOf(atual) + 1) % ordem.length]); };
    if (!reduz) timer = setInterval(proxima, 6500);
    carrossel.addEventListener('mouseenter', () => { pausado = true; });
    carrossel.addEventListener('mouseleave', () => { pausado = false; });
    carrossel.addEventListener('focusin', () => { pausado = true; });
    carrossel.addEventListener('focusout', () => { pausado = false; });
    pontos.forEach((p) => p.addEventListener('click', () => { mostra(p.dataset.ponto); pausado = true; if (timer) { clearInterval(timer); timer = null; } }));
})();
