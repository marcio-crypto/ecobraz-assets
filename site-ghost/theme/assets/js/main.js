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
    const steps = Array.from(form.querySelectorAll('[data-form-step]'));
    let activeStep = 0;
    form.classList.add('is-enhanced');
    const showStep = (index) => {
        activeStep = Math.max(0, Math.min(index, steps.length - 1));
        steps.forEach((step, i) => step.classList.toggle('is-active', i === activeStep));
        form.scrollIntoView({behavior:'smooth', block:'start'});
    };
    const validateStep = () => {
        const fields = Array.from(steps[activeStep].querySelectorAll('input,select,textarea'));
        for (const field of fields) if (!field.checkValidity()) { field.reportValidity(); return false; }
        return true;
    };
    form.querySelectorAll('[data-next-step]').forEach((button) => button.addEventListener('click', () => { if (validateStep()) showStep(activeStep + 1); }));
    form.querySelectorAll('[data-prev-step]').forEach((button) => button.addEventListener('click', () => showStep(activeStep - 1)));
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
    const material = params.get('material');
    const materialInput = form.querySelector('[name="material_category"]');
    if (material && materialInput && Array.from(materialInput.options).some((option) => option.value === material)) materialInput.value = material;

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

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const endpoint = form.dataset.endpoint;
        if (!endpoint) {
            status.textContent = 'A integração está sendo configurada. Use o WhatsApp para enviar sua solicitação agora.';
            status.className = 'form-status is-error'; return;
        }
        const button = form.querySelector('[type="submit"]');
        const payload = Object.fromEntries(new FormData(form).entries());
        // Registra a declaração hospitalar na descrição, para constar no CRM.
        if (payload.hospital_declaration === 'yes') {
            payload.material_description = `${payload.material_description || ''}\n[Gerador declara ausência de contaminação química, biológica ou radioativa e retirada prévia de fontes/controlados por responsável habilitado.]`;
        }
        button.disabled = true; button.textContent = 'Enviando…'; status.textContent = '';
        try {
            const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            if (!response.ok) throw new Error('submission_failed');
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
            const done = document.createElement('div');
            done.className = 'form-done';
            done.setAttribute('role', 'status');
            done.innerHTML = '<span class="form-done-icon" aria-hidden="true">✓</span>' +
                '<h2>Solicitação recebida!</h2>' +
                '<p>Obrigado. Nossa equipe vai analisar as informações e entrar em contato pelo e-mail ou telefone que você informou.</p>' +
                '<p class="form-done-note">Não é necessário enviar novamente. Se preferir adiantar a conversa, chame a equipe no WhatsApp.</p>';
            form.replaceWith(done);
            done.scrollIntoView({behavior:'smooth', block:'center'});
            return;
        } catch (_) {
            status.textContent = 'Não foi possível enviar agora. Tente novamente ou fale com a equipe pelo WhatsApp.'; status.className = 'form-status is-error';
            track('form_error_coleta', {page_path: window.location.pathname});
        } finally { button.disabled = false; button.textContent = 'Enviar solicitação de coleta'; }
    });
})();
