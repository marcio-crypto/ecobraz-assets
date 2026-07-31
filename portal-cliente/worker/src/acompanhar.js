// Página PÚBLICA de acompanhamento da coleta (o link que vai no WhatsApp "a caminho").
// O cliente abre sem login e vê: o status, o caminhão no mapa (RotaExata) e a distância.
// Segurança: o acesso é por token (selo HMAC da OS) — link não adivinhável; e a posição
// só aparece enquanto a coleta está ativa (some quando conclui). Sem provedor de mapa pago:
// usa o embed do OpenStreetMap (sem chave de API).

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Hora de Brasília (UTC-3, sem horário de verão) a partir do instante ISO (UTC).
const hhmm = (x) => { const d = new Date(x); if (!x || isNaN(d.getTime())) return ''; d.setUTCHours(d.getUTCHours() - 3); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };

function moldura(titulo, conteudo, autorefresh) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">${autorefresh ? '<meta http-equiv="refresh" content="30">' : ''}<title>${esc(titulo)} — Ecobraz</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}
.wrap{max-width:560px;margin:0 auto;padding:0 0 40px}
.topo{background:#00333B;padding:16px 20px}.topo b{color:#fff;font-size:17px;font-weight:800}.topo span{color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:18px;margin:16px}
.mapa{width:100%;height:340px;border:0;border-radius:14px;background:#e9eeec}
.pill{display:inline-block;font-size:12px;font-weight:800;padding:5px 12px;border-radius:20px}</style></head>
<body><div class="wrap"><div class="topo"><b>ecobraz</b><span>Acompanhe sua coleta</span></div>${conteudo}
<div style="text-align:center;font-size:11px;color:#9aa7a4;margin-top:6px">Ecobraz Emigre · destinação correta e rastreável</div>
</div></body></html>`;
}

export function paginaAcompanharErro(msg) {
  return moldura('Acompanhamento', `<div class="card" style="text-align:center">
    <div style="font-size:34px">🔒</div>
    <div style="font-size:16px;font-weight:800;margin-top:8px">${esc(msg)}</div>
    <div style="font-size:13px;color:#6B7B78;margin-top:8px">Confira o link recebido no WhatsApp. Em caso de dúvida, fale com a Ecobraz.</div>
  </div>`, false);
}

// dados: { numero, cliente, status: 'a_caminho'|'chegou'|'concluida'|'sem_posicao', pos:{lat,lng,em}, km, atualizadoEm }
export function paginaAcompanhar(dados) {
  const d = dados || {};
  const info = {
    a_caminho: { cor: '#8A6A16;background:#FFF4DE', txt: '🚛 O coletor está a caminho', sub: 'Acompanhe o caminhão no mapa abaixo.' },
    chegou: { cor: '#0B5B66;background:#E3F0F3', txt: '📍 O coletor chegou ao local', sub: 'Nossa equipe está no endereço da sua coleta.' },
    concluida: { cor: '#1E5B31;background:#E4F3E6', txt: '✅ Coleta concluída', sub: 'Obrigado! A coleta foi finalizada.' },
    sem_posicao: { cor: '#6B7B78;background:#EEF1F0', txt: '🚛 Coleta a caminho', sub: 'A localização do caminhão aparece aqui assim que o rastreador reportar.' },
  }[d.status] || { cor: '#6B7B78;background:#EEF1F0', txt: 'Acompanhamento da coleta', sub: '' };
  const pos = d.pos;
  const temMapa = d.status !== 'concluida' && pos && pos.lat != null && pos.lng != null;
  const lat = temMapa ? Number(pos.lat) : 0, lng = temMapa ? Number(pos.lng) : 0;
  const bbox = temMapa ? `${lng - 0.012},${lat - 0.008},${lng + 0.012},${lat + 0.008}` : '';
  const mapa = temMapa ? `<iframe class="mapa" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(lat + ',' + lng)}"></iframe>
    <div style="text-align:center;margin-top:8px"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat + ',' + lng)}" target="_blank" rel="noopener" style="color:#0B5B66;font-size:12.5px;font-weight:700;text-decoration:none">🗺️ Abrir o ponto no Google Maps ↗</a></div>` : '';
  const kmTxt = (d.status === 'a_caminho' && d.km != null) ? `<div style="font-size:14px;font-weight:800;color:#0B5B66;margin-top:12px">🚚 ~${Number(d.km).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km do seu endereço <span style="font-weight:600;color:#8fa39f">(em linha reta)</span></div>` : '';
  const atualizado = (temMapa && d.atualizadoEm) ? `<div style="font-size:11.5px;color:#8fa39f;margin-top:6px">Posição atualizada às ${esc(hhmm(d.atualizadoEm))} · esta página se atualiza sozinha a cada 30s</div>` : '';
  return moldura('Acompanhe sua coleta', `<div class="card">
    <span class="pill" style="color:${info.cor}">${esc((d.numero || 'COLETA'))}</span>
    <div style="font-size:19px;font-weight:800;margin-top:12px">${info.txt}</div>
    <div style="font-size:13.5px;color:#4F6469;margin-top:5px">${info.sub}</div>
    ${kmTxt}${atualizado}
    <div style="margin-top:14px">${mapa || `<div style="background:#F7FAF9;border:1px dashed #cfe0dd;border-radius:12px;padding:22px;text-align:center;color:#8fa39f;font-size:13px">${d.status === 'concluida' ? 'Coleta finalizada — obrigado! 🌱' : 'Aguardando a localização do caminhão…'}</div>`}</div>
  </div>`, d.status === 'a_caminho' || d.status === 'sem_posicao');
}
