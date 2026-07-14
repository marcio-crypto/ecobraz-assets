const endpoint = String(process.argv[2] || 'https://ecobraz-coletas.ti-0ab.workers.dev');
const origin = String(process.argv[3] || 'https://ecobraz-emigre.ghost.io');

const health = await fetch(`${endpoint}/health`);
const healthBody = await health.json().catch(() => ({}));
if (!health.ok || healthBody.ok !== true) {
  console.error(`ERROR: health check failed (${health.status}): ${JSON.stringify(healthBody)}`);
  process.exit(1);
}
console.log(`Health check ok (service ${healthBody.service}, version ${healthBody.version}).`);

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
const lead = {
  profile: 'empresa',
  name: `TESTE AUTOMATIZADO ${stamp} — pode excluir`,
  company: 'Ecobraz QA (teste do site — excluir)',
  email: `contato+teste-site-${stamp}@ecobraz.org.br`,
  phone: '11999999999',
  material_category: 'Informática e TI',
  volume: 'Até 10 itens',
  material_description: 'Registro de teste automatizado do formulário do novo site. Pode ser excluído.',
  postal_code: '02175-010',
  city: 'São Paulo',
  state: 'SP',
  documentation: 'Nenhuma (teste)',
  urgency: 'Sem urgência (teste)',
  service_consent: 'yes',
  marketing_consent: 'yes',
  page_url: `${origin}/agendamento/`
};

const response = await fetch(`${endpoint}/api/coletas`, {
  method: 'POST',
  headers: {'content-type': 'application/json', Origin: origin},
  body: JSON.stringify(lead)
});
const body = await response.json().catch(() => ({}));
if (response.status !== 201 || body.ok !== true) {
  console.error(`ERROR: submission failed (${response.status}): ${JSON.stringify(body).slice(0, 500)}`);
  process.exit(1);
}
if (!body.crm?.ok || !body.crm.contact_id || !body.crm.deal_id) {
  console.error(`ERROR: Ploomes did not confirm contact/deal: ${JSON.stringify(body.crm)}`);
  process.exit(1);
}
console.log(`Ploomes ok: contact ${body.crm.contact_id}, deal ${body.crm.deal_id}.`);
if (body.marketing?.ok) console.log('E-goi ok: contact accepted with marketing consent.');
else {
  console.error(`ERROR: E-goi did not accept the consented test contact: ${JSON.stringify(body.marketing)}`);
  process.exit(1);
}
console.log(`Integration test passed. Test lead labelled "TESTE AUTOMATIZADO ${stamp}" — delete it from Ploomes (funil [PJ] VENDAS) and from the E-goi list.`);
