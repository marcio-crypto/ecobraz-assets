(() => {
    const toggle = document.querySelector('[data-nav-toggle]');
    const nav = document.querySelector('[data-nav]');
    if (toggle && nav) toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open)); nav.classList.toggle('is-open', !open);
    });

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
    form.querySelectorAll('[data-utm]').forEach((input) => { input.value = params.get(input.dataset.utm) || ''; });
    const profile = params.get('perfil');
    const profileInput = profile && form.querySelector(`[name="profile"][value="${profile === 'pessoa-fisica' ? 'pessoa_fisica' : profile}"]`);
    if (profileInput) profileInput.checked = true;

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
        button.disabled = true; button.textContent = 'Enviando…'; status.textContent = '';
        try {
            const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            if (!response.ok) throw new Error('submission_failed');
            form.reset(); status.textContent = 'Solicitação recebida. Nossa equipe analisará os dados e entrará em contato.'; status.className = 'form-status is-success';
            window.dataLayer = window.dataLayer || []; window.dataLayer.push({event:'collection_request_submitted',profile:payload.profile,material_category:payload.material_category,state:payload.state});
        } catch (_) {
            status.textContent = 'Não foi possível enviar agora. Tente novamente ou fale com a equipe pelo WhatsApp.'; status.className = 'form-status is-error';
        } finally { button.disabled = false; button.textContent = 'Enviar solicitação de coleta'; }
    });
})();
