// Worker ecobraz-portal — Portal do Cliente (Pacote 0: fundação).
//
// O que este Worker faz (v1):
//  - Login SEM SENHA (link mágico por e-mail).
//  - Portão de acesso: só entra EMPRESA (PJ) com "Contrato Ativo?" = Sim e dentro
//    da validade (campo "Data de encerramento do contrato") no Ploomes.
//  - Painel: mostra dados do contrato, lista as OS/atendimentos do cliente (lidas
//    do Ploomes) e permite abrir um novo chamado (nova OS no Ploomes).
//
// SEGURANÇA:
//  - Segredos vivem na Cloudflare (nunca no repositório): PLOOMES_USER_KEY,
//    PORTAL_SESSION_SECRET, chaves do E-goi transacional, etc.
//  - Tokens de login e sessão são assinados (HMAC-SHA256 via Web Crypto).
//  - Cookie de sessão: HttpOnly, Secure, SameSite=Lax.
//  - Anti-enumeração: /api/auth/solicitar responde sempre a mesma coisa.
//  - Link de login é de uso único (nonce guardado no KV e apagado ao usar).
//
// AINDA A VALIDAR CONTRA O PLOOMES REAL (marcado com TODO): o mapeamento exato de
// "OS/atendimento" (hoje lê os Negócios do contato) e os rótulos de status.

const SESSAO_COOKIE = 'portal_sessao';
const VALIDADOR_COOKIE = 'portal_validador';
const AGENTE_COOKIE = 'portal_agente';
const OPERACAO_COOKIE = 'portal_operacao';
const ENG_COOKIE = 'portal_eng';
const DIRETORIA_COOKIE = 'portal_diretoria';
const ESCRITORIO_COOKIE = 'portal_escritorio';
const FISCAL_COOKIE = 'portal_fiscal';
const SESSAO_TTL_S = 8 * 60 * 60;       // 8 horas
const APP_SESSAO_TTL_S = 30 * 24 * 60 * 60; // 30 dias — apps de campo (operação/coletas) ficam logados
const LINK_TTL_S = 60 * 60;             // 60 minutos (folga contra atraso de entrega/greylisting de remetente novo)
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

import { paginaLogin, paginaPainel, paginaMensagem } from './paginas.js';
import { LOGO_ESCURO_B64, LOGO_CLARO_B64 } from './logos.js';
import { paginaCalculadora, estimativaCarbono, paginaCalculoDetalhado, calculoDetalhadoGHG, paginaLojaCarbono, paginaCarbonoContato, paginaCarbonoObrigado, nivelCarbono, faixaValida, precoNivel } from './carbono.js';
import { criarPreferencia, consultarPagamento, criarPixDireto, consultarMeiosPagamento } from './mercadopago.js';
import { criarCheckoutStripe, consultarCheckoutStripe, verificarEventoStripe, stripeConfigurado } from './stripe.js';
import { gerarPixCopiaECola, pixConfig, paginaPix } from './pix.js';
import { paginaColetaExpressa } from './coleta-expressa.js';
import { enviarSMS, smsConfigurado } from './sms.js';
import { whatsappConfigurado, templateColeta, templateInfo, enviarWhatsAppTemplate, enviarWhatsAppDiag, listarTemplatesGupshup, saldoGupshup } from './whatsapp.js';
import { paginaCampanhasWA, listarCampanhasWA, listarOptoutWA, previaPublicoWA, prepararCampanhaWA, enviarLoteWA, falhasDaCampanhaWA, mudarOptoutWA, listaDetalhadaPublicoWA, paginaListaPublicoWA, PUBLICOS_WA, mudarExclusaoEmpresaWA, listarExcluidasWA, chaveWebhookWA, processarWebhookWA, metricasCampanhaWA } from './whatsapp-campanha.js';
import { paginaAcompanhar, paginaAcompanharErro } from './acompanhar.js';
import { registrarFalha, receberErroCliente, listarFalhas } from './monitor.js';
import { segmentoDoCliente, definirSegmento, SEGMENTOS, fluxoDeVendas, ultimosPedidos, paginaPagamentos } from './premium.js';
import { MANUAL_CLIENTE_PDF_B64 } from './manual-pdf.js';
import { MANUAL_COMERCIAL_B64, MANUAL_MOTORISTA_B64, MANUAL_DOCA_B64, MANUAL_ENGENHARIA_B64 } from './manuais-pdf.js';
import { sondaMTR, consultarMtrSigor, baixarPdfManifesto } from './mtr.js';
import { listarMtrs, lerMtr, salvarMtr, mudarStatusMtr, definirPdfMtr, removerMtr, dadosDMR, paginaMtrLista, paginaMtrForm, paginaMtrDetalhe, paginaDMR, sincronizarMtrDaOS, removerMtrDaOS, importarMtrsDasOSs } from './gestao-mtr.js';
import { dadosCronograma, paginaCronograma, salvarSla } from './cronograma.js';
import { paginaAcompanhamento, colunaClienteDe, lerGestores, gestorPorEmail, salvarGestor, removerGestor, NIVEIS, paginaGestores } from './cliente-portal.js';
import { DEMO_CLIENTE_HTML, DEMO_OG_PNG_B64 } from './demo-cliente.js';
import { listarPropostas, lerProposta, salvarProposta, paginaPropostas, paginaPropostaForm, paginaPropostaVer, paginaContratoVer, garantirTokenAceite, registrarAceite, paginaAceite, paginaAceiteVerificar } from './proposta.js';
import { lerEmpresaDocs, salvarEmpresaDoc, anexarEmpresaDoc, paginaEmpresaDocs, alertasEmpresaDocs } from './empresa-docs.js';
import { listarCargas, lerCarga, lotesDaCarga, lerLote, listarLotesPorDestino, novaCarga, pesarCarga, fotoCarga, criarLote, excluirLote, editarLote, cancelarCarga, mudarStatusLote, expedirLote, listarFornecedores, paginaExpedirLote, seloLote, qrLoteGif, paginaCargas, paginaNovaCarga, paginaCarga, paginaEtiqueta, paginaFilas, paginaValidarLote } from './cargas.js';
import { acharPacote, precoPacote, acharModuloAdote, precoModuloAdote, paginaLojaAdote, paginaObrigadoAdote, paginaDiagnostico, lerCredito, salvarCredito, novoCredito, aplicarCompra, aplicarRecarga, precisaRecarga, listarPatrocinadores, resumoPatrocinio, lerCreditoPorDoc } from './adote.js';
import { paginaLojaESG, paginaESGContato, paginaESGObrigado, relatorioESG, precoRelatorioESG } from './esg.js';
import { statusDaEtapa, valorProp, CAMPOS_OS } from './os-utils.js';
import { qrCDF, validarCDF } from './validacao.js';
import { paginaMetodologia, fatorCompensacaoAdote } from './carbono-metodologia.js';
import { registrarUso, resumoUso, contarPorPeriodo, reunirPendencias, acessosClientesDetalhe, paginaAcessosClientes } from './uso.js';
import { criarTarefa, listarTarefasCliente, tarefasEmAtencao, listarTarefasPainel, mudarStatusTarefa, excluirTarefa, cardTarefasCliente, bannerTarefasAtencao, paginaTarefas } from './tarefas.js';
import { backfillEgoi } from './egoi.js';
import { sondaRotaExata, paginaSondaRotaExata, paginaRastreio, posicaoDoVeiculo, posicoesFrota, capturarTelemetria, paginaFrotaAoVivo, rastreioDisponivel } from './rotaexata.js';
import { lerValidacao, registrarValidacao, paginaAreaValidacao, qrMetodologia, validarMetodologiaPublico, homologarFatorAcao } from './validacao-metodologia.js';
import { paginaPainelCarbono } from './carbono-painel.js';
import { clientesComOperacoes, carbonoDoCliente, paginaCarbonoAnalista, paginaCarbonoAuditor } from './carbono-motor.js';
import { agentePermitido, nomeAgente, listarColetasComStatus, enriquecerProximidade, coordDoEndereco, paginaLoginAgente, paginaAppAgente, detalheColeta, lerEstadoColeta, registrarCheckin, registrarACaminho, registrarFoto, servirFotoColeta, registrarAssinatura, servirAssinaturaColeta, paginaColetaDetalhe, registrarEncerramento, registrarReagendamento, qrColeta, validarColetaPublico, paginaComprovante } from './agente.js';
import { operadorPermitido, nomeOperador, listarOperacoes, listarColetasRecebiveis, iniciarOperacao, lerOperacao, definirTipoOperacao, registrarPesoEntrada, registrarFotoOperacao, servirFotoOperacao, paginaLoginOperacao, paginaAppOperacao, paginaReceberLote, paginaLoteDetalhe, adicionarMaterial, removerMaterial, concluirTriagem, paginaTriagem, paginaProcessamento, concluirProcessamento, paginaSaida, registrarSaida, concluirSaida } from './operacional.js';
import { engenheiroPermitido, nomeEngenheiro, filaValidacao, operacoesValidadas, lerValidacaoOp, registrarValidacaoOp, paginaLoginEng, paginaFilaEng, paginaDossie, qrOperacao, validarOperacaoPublico, listarDestinos, lerDestino, salvarDestino, paginaDestinos, paginaDestinoForm, paginaRelatorio, paginaCDF } from './engenharia.js';
import { diretorPermitido, nomeDiretor, reunirDados, paginaLoginDiretoria, paginaPainelDiretoria } from './diretoria.js';
import { dadosPrevencao, paginaPrevencao, analisarColetaIA, salvarTabelaPrecos, pingIA } from './prevencao.js';
import { sondarAnexosPloomes, paginaSondaAnexos } from './ploomes-docs.js';
import { amostraContatosPloomes, paginaAmostraContatos, importarLoteContatos, estatisticasMigracao, buscarContatos, paginaMigrarPloomes, detalheContato, paginaContatoDetalhe, importarLoteNegocios, estatisticasNegocios, paginaMigrarNegocios } from './ploomes-migracao.js';
import { importarLoteAnexos, importarLoteAnexosContatos, completarAnexos, importarAnexosJanela, reprocessarFalhas, importarLoteDocumentos, recuperarDocumentos, estatisticasArquivos, paginaMigrarArquivos, diagnosticoAnexos, paginaDiagAnexos } from './ploomes-arquivos.js';
import { fiscalPermitido, nomeFiscal, listarNotas, lerNota, importarLote, vincularNota, sugerirVinculoSync, paginaFiscalLogin, paginaFiscalHome, paginaFiscalResultado, paginaFiscalNota } from './fiscal.js';
import { escritorioPermitido, nomeEscritorio, consultarCNPJ, listarClientes, lerCliente, salvarCliente, emailsDoCliente, reindexarEmailsClientes, backfillEnderecos, paginaManutencao, paginaLoginEscritorio, paginaCadastroHome, paginaFormCliente, paginaClienteDetalhe, listarLeads, lerLead, salvarLead, ingestLead, clienteDeLead, arquivosDoCliente, paginaLeads, paginaLeadDetalhe, paginaInicio, listarClientesD1, contagensClientesD1, lerClienteD1, negociosDoCliente, espelharClienteD1, sincronizarKVparaD1, lerNegocioDetalheD1, paginaOSDetalhe, curarContatosKV, classificarPedido, atualizarIndexLead, excluirLead } from './cadastro.js';
import { listarColetasOS, lerColetaOS, seloOS, criarColetaOS, atualizarStatusOS, atualizarColetaOS, anexarTelemetriaOS, registrarAnexoColeta, removerAnexoColeta, paginaColetasLista, paginaGerarColeta, paginaEditarColeta, paginaColetaOSDetalhe, qrOS, validarOSPublico, paginaComprovanteOS, paginaCartaDescarte, paginaManifestoCarga, definirCobrancaOS, marcarCobrancaPagaOS, definirMtrOS } from './coletas.js';
import { listarVeiculos, lerVeiculo, salvarVeiculo, paginaFrota, paginaVeiculoForm, lerJornadaAtiva, abrirJornada, fecharJornada, registrarAbastecimento, tagColetaComVeiculo, servirFotoJornada, bannerJornada, paginaAbrirDia, paginaFecharDia, paginaAbastecer, placaDaColeta } from './frota.js';
import { carregarEquipeNoEnv, listarUsuarios, lerUsuario, salvarUsuario, importarUsuarios, paginaEquipe, paginaUsuarioForm, paginaEquipeImportar } from './equipe.js';
import { agentesDe } from './agente.js';
import { servirIcone, servirManifest, servirServiceWorker } from './pwa.js';
import { googleConfigurado, iniciarGoogle, callbackGoogle, botaoGoogle } from './google-auth.js';

// Acessos garantidos no código: o dono (todos os papéis) e a auditora da Villanova
// (validador). E-mails não são segredo — isto garante que nunca fiquem de fora, seja
// qual for o cadastro/env. Injetado nas listas de papel a cada requisição.
const ACESSOS_FIXOS = [
  { email: 'marcio@ecobraz.org.br', listas: ['ESCRITORIO_EMAILS', 'AGENTE_EMAILS', 'OPERACAO_EMAILS', 'ENG_EMAILS', 'DIRETORIA_EMAILS', 'FISCAL_EMAILS', 'VALIDADOR_EMAILS'] },
  { email: 'contact@villanovaesg.com', listas: ['VALIDADOR_EMAILS'] },
];
function garantirAcessosFixos(env) {
  const e = { ...env };
  for (const { email, listas } of ACESSOS_FIXOS) {
    for (const k of listas) {
      const atual = String(e[k] || '');
      const jaTem = atual.split(/[,;]+/).some((par) => (par.split('|')[0] || '').trim().toLowerCase() === email);
      if (!jaTem) e[k] = atual ? `${atual},${email}` : email;
    }
  }
  return e;
}

export default {
  // Cron diário (wrangler.toml [triggers]) — alertas de vencimento dos Documentos da Empresa.
  async scheduled(event, env, ctx) {
    try { const r = await alertasEmpresaDocs(env); console.log('cron_empdocs', r); }
    catch (error) { console.error('cron_empdocs_erro', safeError(error)); }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/health') return json({
        ok: true, service: 'ecobraz-portal', version: 29,
        // Nº de usuários no cadastro de equipe (KV) — só a contagem, nunca dados.
        equipeCadastrada: await (async () => { try { return (await listarUsuarios(env)).length; } catch { return -1; } })(),
        // Integridade do índice de OS (só contagem/tamanho — nunca dados).
        osIndex: await (async () => {
          try {
            const raw = env.PORTAL_KV ? await env.PORTAL_KV.get('os:index') : null;
            if (!raw) return { ok: true, qtd: 0, bytes: 0 };
            return { ok: true, qtd: JSON.parse(raw).length, bytes: raw.length };
          } catch (e) { return { ok: false, erro: String(e && e.message || e).slice(0, 80) }; }
        })(),
        // Só presença (true/false) — NUNCA os valores. Ajuda a confirmar a
        // configuração pelo navegador sem expor segredo nenhum.
        config: {
          ploomes: !!env.PLOOMES_USER_KEY,
          sessao: !!env.PORTAL_SESSION_SECRET,
          email: !!(env.RESEND_API_KEY || env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY),
          resend: !!env.RESEND_API_KEY,
          resendFrom: env.RESEND_FROM || '(padrão acesso@ecobraz.org.br)',
          egoi: !!(env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY),
          baseUrl: !!env.PORTAL_BASE_URL,
          kv: !!env.PORTAL_KV,
          mercadopago: !!env.MERCADOPAGO_ACCESS_TOKEN,
          // MTR: só a PRESENÇA das credenciais no cofre (nunca os valores).
          mtrSigor: !!(env.SIGOR_EMAIL && env.SIGOR_CNPJ && env.SIGOR_SENHA && env.SIGOR_UNIDADE),
          mtrSinir: !!(env.SINIR_CNPJ && env.SINIR_CPF && env.SINIR_SENHA && env.SINIR_UNIDADE),
          mtrSigorEmail: !!env.SIGOR_EMAIL,
          mtrSigorUnidade: !!env.SIGOR_UNIDADE,
          mtrSinirUnidade: !!env.SINIR_UNIDADE,
          mercadopagoModo: env.MERCADOPAGO_ACCESS_TOKEN ? (env.MERCADOPAGO_ACCESS_TOKEN.startsWith('TEST-') ? 'teste' : 'producao') : null,
          avisoEmail: !!env.PLOOMES_WEBHOOK_SECRET,
          avisoModoTeste: env.NOTIF_MODO_TESTE === '1', // true = só contato de teste; false = vale p/ todos
          validacaoCDF: true, // /qr e /validar (QR anti-fraude no CDF)
          agenteColetas: !!env.AGENTE_EMAILS, // app do agente ligado (há agentes cadastrados)
          operacao: !!env.OPERACAO_EMAILS, // módulo operacional (doca) ligado
          engenharia: !!env.ENG_EMAILS, // módulo de validação da Engenharia Ambiental ligado
          diretoria: !!env.DIRETORIA_EMAILS, // painel da diretoria ligado
          escritorio: !!env.ESCRITORIO_EMAILS, // cadastro/comercial (Débora) ligado
          google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), // login Google configurado
        },
      });

      if (pathname === '/assets/logo.png') return servirLogo(LOGO_ESCURO_B64);
      if (pathname === '/assets/logo-claro.png') return servirLogo(LOGO_CLARO_B64);
      // Manual do Cliente em PDF (baixável na área do cliente).
      if (pathname === '/manual-cliente.pdf') {
        const bytes = Uint8Array.from(atob(MANUAL_CLIENTE_PDF_B64), (c) => c.charCodeAt(0));
        return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline; filename="Manual-Portal-Ecobraz.pdf"', 'cache-control': 'public, max-age=86400' } });
      }
      // Manuais de uso por função (PDF). Servidos direto do worker (base64 embutido).
      {
        const MANUAIS_PDF = {
          '/manual-comercial.pdf': [MANUAL_COMERCIAL_B64, 'Manual-Comercial-Ecobraz.pdf'],
          '/manual-motorista.pdf': [MANUAL_MOTORISTA_B64, 'Manual-Motorista-Ecobraz.pdf'],
          '/manual-doca.pdf': [MANUAL_DOCA_B64, 'Manual-Doca-Operacional-Ecobraz.pdf'],
          '/manual-engenharia.pdf': [MANUAL_ENGENHARIA_B64, 'Manual-Engenharia-Ecobraz.pdf'],
        };
        if (MANUAIS_PDF[pathname]) {
          const [b64, fn] = MANUAIS_PDF[pathname];
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          return new Response(bytes, { headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${fn}"`, 'cache-control': 'public, max-age=86400' } });
        }
      }
      // PWA (app instalável): ícones, manifesto e service worker.
      if (pathname === '/assets/icon-192.png') return servirIcone('192');
      if (pathname === '/assets/icon-512.png') return servirIcone('512');
      if (pathname === '/manifest.webmanifest') return servirManifest(url);
      if (pathname === '/sw.js') return servirServiceWorker();

      // Calculadora de pegada de carbono — Nível 1 (estimativa grátis por CNPJ). Público.
      if (pathname === '/calculadora' && request.method === 'GET') return html(paginaCalculadora());
      // Demonstração pública e ISOLADA do Portal do Cliente (ferramenta de marketing).
      // Sem login, sem back-end, sem pagamento — nada aqui toca o sistema real.
      if ((pathname === '/demo' || pathname === '/demonstracao') && (request.method === 'GET' || request.method === 'HEAD')) {
        if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
        return html(DEMO_CLIENTE_HTML);
      }
      // Imagem de preview social (Open Graph) da demonstração.
      if (pathname === '/demo/og.png' && (request.method === 'GET' || request.method === 'HEAD')) {
        if (request.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-type': 'image/png' } });
        return servirLogo(DEMO_OG_PNG_B64);
      }
      // Métrica da demonstração — SEM dados pessoais (só contadores por dia/evento). Beacon.
      if (pathname === '/demo/ev' && request.method === 'POST') return registrarEventoDemo(request, env);
      // Retorno do Gupshup (entrega/leitura/respostas das campanhas de WhatsApp).
      // Público, mas exige a chave derivada do cofre na URL; responde sempre 200
      // rápido (senão o provedor fica reenviando).
      if (pathname === '/api/wa/webhook' && request.method === 'POST') {
        if (url.searchParams.get('k') !== await chaveWebhookWA(env)) return json({ ok: false }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        try { await processarWebhookWA(env, b); } catch { /* nunca propaga */ }
        return json({ ok: true });
      }
      // Loja de carbono — 4 níveis × faixa de faturamento (anual). Preços aprovados (a refinar c/ Villanova).
      if (pathname === '/carbono/planos' && request.method === 'GET') return html(paginaLojaCarbono(url.searchParams.get('faixa') || ''));
      if (pathname === '/carbono/contato' && request.method === 'GET') return html(paginaCarbonoContato(nivelCarbono(url.searchParams.get('nivel') || ''), url.searchParams.get('faixa') || ''));
      if (pathname === '/api/carbono/contato' && request.method === 'POST') {
        let b; try { b = await request.json(); } catch { b = {}; }
        const nv = nivelCarbono((b && b.nivel) || '');
        try {
          await ingestLead(env, {
            name: String((b && b.nome) || ''), company: String((b && b.empresa) || ''), email: String((b && b.email) || ''), phone: String((b && b.fone) || ''),
            material_category: `Carbono — ${nv ? nv.nome : 'plano'}`,
            material_description: `Pedido de proposta de inventário de carbono (site).\nNível: ${nv ? nv.nome : '?'}\nFaturamento: ${(b && b.faixa) || '?'}\nMensagem: ${String((b && b.msg) || '').slice(0, 1000)}`,
            source: 'carbono-proposta',
          });
        } catch (error) { console.error('carbono_contato_falhou', safeError(error)); }
        return json({ ok: true });
      }
      if (pathname === '/carbono/assinar' && request.method === 'GET') {
        const nv = nivelCarbono(url.searchParams.get('nivel') || '');
        const fx = faixaValida(url.searchParams.get('faixa') || '');
        if (!nv || !fx) return new Response(null, { status: 302, headers: { Location: '/carbono/planos', 'cache-control': 'no-store' } });
        const preco = precoNivel(nv.id, fx);
        if (!preco || preco.sobConsulta) return new Response(null, { status: 302, headers: { Location: `/carbono/contato?nivel=${encodeURIComponent(nv.id)}&faixa=${encodeURIComponent(fx)}`, 'cache-control': 'no-store' } });
        const pedidoId = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${pedidoId}`, JSON.stringify({ produto: 'carbono', status: 'pendente', nivel: nv.id, faixa: fx, valor: preco.valor, criadoEm: nowS() }), { expirationTtl: 7 * 86400 });
        try {
          const s = await criarCheckoutStripe({ valor: preco.valor, descricao: `Inventário de carbono — nível ${nv.nome} (anual)`, externalReference: pedidoId, baseUrl, backPath: '/pagamento/ok', metodos: ['card', 'boleto'] }, env);
          return new Response(null, { status: 302, headers: { Location: s.url, 'cache-control': 'no-store' } });
        } catch (error) { console.error('carbono_assinar_falhou', safeError(error)); return html(paginaMensagem('Pagamento indisponível', 'Não consegui gerar a cobrança agora. Tente de novo em instantes.', '/carbono/planos'), 502); }
      }
      if (pathname === '/carbono/obrigado' && request.method === 'GET') return html(paginaCarbonoObrigado(url.searchParams.get('pedido') || ''));
      if (pathname === '/api/carbono/estimativa' && request.method === 'GET') {
        const resultado = await estimativaCarbono(url.searchParams.get('cnpj') || '', env);
        return json(resultado, resultado.ok ? 200 : 400);
      }
      // Cálculo detalhado — Nível 2 (formulário GHG). Página de teste (será liberada após pagamento).
      if (pathname === '/calculo-detalhado' && request.method === 'GET') {
        const nvId = url.searchParams.get('nivel') || '';
        if (nvId) { // Nível real: o formulário abre só com um pedido PAGO desse nível.
          const pid = (url.searchParams.get('pedido') || '').replace(/[^a-zA-Z0-9_-]/g, '');
          let ped = null;
          if (env.PORTAL_KV && pid) { const raw = await env.PORTAL_KV.get(`pedido:${pid}`); ped = raw ? JSON.parse(raw) : null; }
          if (!ped || ped.produto !== 'carbono' || ped.status !== 'pago' || ped.nivel !== nvId) {
            return html(paginaMensagem('Formulário bloqueado', 'O formulário do inventário abre depois do pagamento confirmado. Escolha o seu plano para começar.', '/carbono/planos'), 402);
          }
        }
        const sInv = await lerSessao(request, env).catch(() => null);
        return html(paginaCalculoDetalhado(nvId, sInv ? sInv.documento : ''));
      }
      if (pathname === '/api/carbono/detalhado' && request.method === 'POST') {
        const corpo = await request.json().catch(() => ({}));
        const resultado = calculoDetalhadoGHG(corpo);
        // Guarda o inventário no pedido pago (pra não perder e depois gerar o relatório assinado).
        try {
          const pid = String((corpo && corpo.pedido) || '').replace(/[^a-zA-Z0-9_-]/g, '');
          if (pid && env.PORTAL_KV) {
            const raw = await env.PORTAL_KV.get(`pedido:${pid}`);
            const ped = raw ? JSON.parse(raw) : null;
            if (ped && ped.produto === 'carbono' && ped.status === 'pago') {
              const docInv = String((corpo && corpo.cnpj) || ped.doc || '').replace(/\D/g, '');
              ped.inventario = { inputs: corpo, resultado, em: nowS() };
              if (docInv) ped.doc = docInv;
              await env.PORTAL_KV.put(`pedido:${pid}`, JSON.stringify(ped), { expirationTtl: 400 * 86400 });
              const ponteiro = JSON.stringify({ totalTCO2e: resultado.totalTCO2e, em: nowS(), pedidoId: pid, faixa: ped.faixa || '' });
              // Vincula ao CNPJ da empresa (vale para TODOS os usuários dela) — e por e-mail como reserva.
              if (docInv) { try { await env.PORTAL_KV.put(`carbono-inv-doc:${docInv}`, ponteiro, { expirationTtl: 400 * 86400 }); } catch { /* ok */ } }
              const em = String(ped.email || '').trim().toLowerCase();
              if (em) { try { await env.PORTAL_KV.put(`carbono-inv:${em}`, ponteiro, { expirationTtl: 400 * 86400 }); } catch { /* ok */ } }
            }
          }
        } catch (error) { console.error('carbono_salvar_inv_falhou', safeError(error)); }
        return json({ ok: true, resultado });
      }
      // Pagamento (Mercado Pago) — cria a cobrança e devolve o link de pagamento.
      // Por ora valor de TESTE (R$1). Depois: precoNivel2 por porte.
      if (pathname === '/api/carbono/pagar' && request.method === 'POST') {
        const valor = Number(env.MP_VALOR_TESTE || 1);
        const pedidoId = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${pedidoId}`, JSON.stringify({ status: 'pendente', valor, criadoEm: nowS() }), { expirationTtl: 86400 });
        try {
          const s = await criarCheckoutStripe({ valor, descricao: 'Cálculo detalhado de pegada de carbono — GHG Protocol', externalReference: pedidoId, baseUrl, backPath: '/pagamento/ok', metodos: ['card', 'boleto'] }, env);
          return json({ ok: true, pedido: pedidoId, init_point: s.url });
        } catch (error) {
          console.error('mp_criar_falhou', safeError(error));
          return json({ ok: false, error: 'nao_foi_possivel_cobrar', detalhe: String(error?.message || '').slice(0, 220) }, 502);
        }
      }
      // Loja "Adote um Bairro" (pública): patrocínio de coletas por módulo × faturamento.
      // Se o cliente estiver logado, pré-preenche os dados dele (compra pelo perfil).
      if (pathname === '/adote' && request.method === 'GET') {
        const s = await lerSessao(request, env).catch(() => null);
        const pre = s ? { razao: s.nome || '', cnpj: s.documento || '', email: s.email || '' } : null;
        return html(paginaLojaAdote(url.searchParams.get('faixa') || '', pre));
      }
      if (pathname === '/diagnostico' && request.method === 'GET') return html(paginaDiagnostico());
      if (pathname === '/adote/obrigado' && request.method === 'GET') {
        const ref = url.searchParams.get('pedido');
        let ped = null, cred = null;
        if (ref && env.PORTAL_KV) { const raw = await env.PORTAL_KV.get(`pedido:${String(ref).replace(/[^a-zA-Z0-9_-]/g, '')}`); ped = raw ? JSON.parse(raw) : null; if (ped) cred = await lerCredito(env, ped.clienteId); }
        return html(paginaObrigadoAdote(ped, cred));
      }
      if (pathname === '/api/adote/contratar' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const pac = acharModuloAdote(b && b.moduloId);
        const faixa = faixaValida(String((b && b.faixa) || ''));
        if (!pac) return json({ ok: false, erro: 'Escolha um módulo válido.' }, 400);
        if (!faixa) return json({ ok: false, erro: 'Informe o faturamento da empresa.' }, 400);
        const razaoSocial = String(b.razaoSocial || '').trim();
        const cnpj = String(b.cnpj || '').replace(/\D/g, '');
        const email = String(b.email || '').trim().toLowerCase();
        if (!razaoSocial || cnpj.length !== 14 || !/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, erro: 'Preencha razão social, CNPJ (14 dígitos) e e-mail válido.' }, 400);
        const preco = precoModuloAdote(pac.id, faixa);
        // Faixa "sob proposta" (> R$ 300 mi): não cobra — abre um lead para a proposta sob medida.
        if (!preco || preco.sobConsulta) {
          try { await ingestLead(env, { name: '', company: razaoSocial, email, phone: String(b.telefone || '').trim(), material_category: `Adote um Bairro — proposta (${pac.ton}t)`, material_description: `Pedido de proposta sob medida — Adote um Bairro.\nMódulo: ${pac.ton}t (${pac.coletas} coletas)\nFaturamento: acima de R$ 300 mi/ano\nCNPJ: ${cnpj}\nCidade: ${String(b.cidade || '').trim()}`, source: 'adote-proposta' }); } catch (e) { console.error('adote_proposta_falhou', safeError(e)); }
          return json({ ok: false, proposta: true });
        }
        let cliente = null;
        try {
          const clientes = await listarClientes(env);
          const resumo = clientes.find((c) => String(c.doc || '').replace(/\D/g, '') === cnpj);
          if (resumo) cliente = await lerCliente(env, resumo.id);
          if (!cliente) cliente = await salvarCliente(env, { tipo: 'PJ', razaoSocial, cnpj, email, telefone: String(b.telefone || '').trim(), endereco: { cidade: String(b.cidade || '').trim() }, origem: 'adote' });
        } catch (e) { console.error('adote_cliente_falhou', safeError(e)); return json({ ok: false, erro: 'Falha ao registrar o cliente.' }, 500); }
        const valor = preco.valor;
        const ref = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'adote', status: 'pendente', clienteId: cliente.id, clienteNome: razaoSocial, doc: cnpj, pacoteId: pac.id, faixa, tipo: 'avulso', valor, kg: pac.kg, coletas: pac.coletas, email, criadoEm: nowS() }), { expirationTtl: 7 * 86400 });
        try {
          const s = await criarCheckoutStripe({ valor, descricao: `Adote um Bairro — módulo ${pac.ton}t (${pac.coletas} coletas patrocinadas)`, externalReference: ref, baseUrl, backPath: '/pagamento/ok', clienteEmail: email, metodos: ['card', 'boleto'] }, env);
          return json({ ok: true, pedido: ref, init_point: s.url });
        } catch (e) { console.error('adote_mp_falhou', safeError(e)); return json({ ok: false, erro: 'Não foi possível gerar o pagamento agora.' }, 502); }
      }
      // Pedido de proposta do Adote (faixa > R$ 300 mi ou botão "Pedir proposta").
      if (pathname === '/api/adote/proposta' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const pac = acharModuloAdote(b && b.moduloId);
        try {
          await ingestLead(env, { name: '', company: String(b.razaoSocial || '').trim(), email: String(b.email || '').trim().toLowerCase(), phone: String(b.telefone || '').trim(),
            material_category: `Adote um Bairro — proposta${pac ? ` (${pac.ton}t)` : ''}`,
            material_description: `Pedido de proposta — Adote um Bairro.\nMódulo: ${pac ? pac.ton + 't (' + pac.coletas + ' coletas)' : '?'}\nFaturamento: ${String(b.faixa || '?')}\nCNPJ: ${String(b.cnpj || '').replace(/\D/g, '')}\nCidade: ${String(b.cidade || '').trim()}`, source: 'adote-proposta' });
        } catch (e) { console.error('adote_proposta_falhou', safeError(e)); }
        return json({ ok: true });
      }
      // Webhook do Mercado Pago: confirma o pagamento consultando a API (fonte da verdade).
      // COLETA EXPRESSA PÚBLICA (do site, sem login): paga R$ 55 e entra como ⚡ 24h.
      if (pathname === '/coleta-expressa' && request.method === 'GET') {
        return html(paginaColetaExpressa(env));
      }
      if (pathname === '/api/coleta-expressa' && request.method === 'POST') {
        let b; try { b = await request.json(); } catch { b = {}; }
        const nome = String(b.nome || '').trim().slice(0, 120);
        const email = String(b.email || '').trim().slice(0, 120);
        const telefone = String(b.telefone || '').trim().slice(0, 30);
        const empresa = String(b.empresa || '').trim().slice(0, 120);
        const cep = String(b.cep || '').trim().slice(0, 12);
        const cidade = String(b.cidade || '').trim().slice(0, 80);
        const endereco = String(b.endereco || '').trim().slice(0, 200);
        const itens = Math.max(0, Math.min(100000, Number(String(b.itens || '').replace(/\D/g, '')) || 0));
        const equipamentos = String(b.equipamentos || '').trim().slice(0, 2000);
        if (!nome || !email || !telefone || !endereco || !equipamentos) return json({ ok: false, message: 'Preencha nome, e-mail, telefone, endereço e o que precisa ser coletado.' }, 400);
        const triagem = classificarPedido(`${equipamentos} ${itens ? itens + ' itens' : ''}`);
        if (triagem.tipo === 'barrado') return json({ ok: false, tipo: 'barrado', message: `Infelizmente não coletamos: ${triagem.itens.join(', ')}. Se houver equipamentos eletrônicos junto, descreva só eles ou fale com a equipe.` }, 422);
        if (triagem.tipo === 'so_perigosos') return json({ ok: false, tipo: 'so_perigosos', message: `Itens como ${triagem.itens.join(' · ')} só são coletados junto com outros equipamentos eletrônicos. Inclua os equipamentos ou fale com a equipe.` }, 422);
        if (triagem.tipo === 'orcamento') {
          try { await ingestLead(env, { name: nome, company: empresa, email, phone: telefone, material_category: 'Coleta expressa (site) — precisa de orçamento', material_description: `Pedido de coleta expressa pelo site, mas o material precisa de orçamento.\nEndereço: ${endereco} · ${cidade} · CEP ${cep}\nItens: ${itens || '?'}\nEquipamentos: ${equipamentos}`, postal_code: cep, city: cidade, source: 'site-expressa' }); } catch { /* segue */ }
          return json({ ok: false, tipo: 'orcamento', message: 'Esse material precisa de orçamento antes da coleta — não dá para cobrar a taxa fixa. Recebemos seus dados e nossa equipe entra em contato.' }, 200);
        }
        const valorTaxa = Math.max(1, Number(env.TAXA_COLETA_REAIS) || 55);
        const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
        const descricao = [
          'Coleta EXPRESSA solicitada pelo site (pagamento na hora).',
          empresa ? `Empresa: ${empresa}` : '',
          `Contato: ${nome} · ${telefone} · ${email}`,
          `Endereço: ${endereco} · ${cidade} · CEP ${cep}`,
          `Itens: ${itens || '(não informado)'}`,
          `Equipamentos:\n${equipamentos}`,
        ].filter(Boolean).join('\n');
        try {
          const r = await ingestLead(env, { name: nome, company: empresa || nome, email, phone: telefone, material_category: '⚡ Coleta Expressa (site)', material_description: descricao, postal_code: cep, city: cidade, source: 'site-expressa', volume: itens ? `${itens} itens` : '' });
          if (!r || !r.ok) return json({ ok: false, message: 'Não foi possível registrar agora. Tente novamente.' }, 502);
          const ref = `coleta-${r.id}`;
          const s = await criarCheckoutStripe({ valor: valorTaxa, descricao: 'Coleta Expressa Ecobraz — até 24h', externalReference: ref, baseUrl: base, backPath: '/pagamento/ok', clienteEmail: email, metodos: ['card', 'boleto'] }, env);
          if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'coleta', leadId: r.id, expressa: true, itens, valor: valorTaxa, status: 'pendente', gateway: 'stripe', clienteEmail: email, clienteNome: nome, criadoEm: nowS() }), { expirationTtl: 30 * 86400 });
          try { const lead = await lerLead(env, r.id); if (lead) { lead.cobranca = { valor: valorTaxa, motivo: 'coleta expressa (site)', ref, link: s.url, status: 'aguardando', criadoEm: nowS() }; lead.expressa = true; lead.status = 'aguardando-pagamento'; lead.descricao = `💳 EXPRESSA (site) — TAXA R$ ${valorTaxa} AGUARDANDO PAGAMENTO. Coletar em até 24h após pago.\n\n${lead.descricao}`; await salvarLead(env, lead); await atualizarIndexLead(env, r.id, { pagamento: 'aguardando', status: lead.status, prioridade: 'alta' }); } } catch (error) { console.error('expressa_site_lead', safeError(error)); }
          console.log('coleta_expressa_site_gerada', { ref, valor: valorTaxa });
          return json({ ok: true, link: s.url, valor: valorTaxa });
        } catch (error) {
          console.error('coleta_expressa_site_erro', safeError(error));
          await registrarFalha(env, 'coleta-expressa-site', safeError(error).message, {});
          return json({ ok: false, message: 'Não foi possível gerar o pagamento agora. Tente novamente em instantes.' }, 502);
        }
      }
      if (pathname === '/api/mp/webhook') {
        let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id') || null;
        if (!paymentId && request.method === 'POST') {
          const corpo = await request.json().catch(() => ({}));
          paymentId = corpo?.data?.id || corpo?.id || null;
        }
        if (paymentId && env.PORTAL_KV) {
          const pg = await consultarPagamento(paymentId, env);
          if (pg && pg.status === 'approved' && pg.externalReference) {
            const chave = `pedido:${pg.externalReference}`;
            const raw = await env.PORTAL_KV.get(chave);
            const ped = raw ? JSON.parse(raw) : { status: 'pendente' };
            if (ped.status !== 'pago') {
              ped.status = 'pago'; ped.paymentId = pg.id; ped.pagoEm = nowS();
              await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 30 * 86400 });
              console.log('mp_pago', { pedido: pg.externalReference, valor: pg.valor, produto: ped.produto || 'carbono' });
              if (ped.produto === 'adote') {
                // Libera o crédito da loja Adote um Bairro (peso comprado → saldo em kg).
                // evento 'recarga' = renovação recorrente (soma kg e limpa o pendente); senão é compra.
                try {
                  const pac = acharPacote(ped.pacoteId);
                  if (pac) {
                    let cred = (await lerCredito(env, ped.clienteId)) || novoCredito(ped.clienteId, ped.clienteNome, ped.doc);
                    if (!cred.doc && ped.doc) cred.doc = String(ped.doc).replace(/\D/g, ''); // garante o índice por CNPJ (termômetro)
                    if (ped.evento === 'recarga') {
                      cred = aplicarRecarga(cred, pac, ped.valor, pg.externalReference, nowS());
                      if (cred.recargaPendente && cred.recargaPendente.ref === pg.externalReference) cred.recargaPendente = null;
                    } else {
                      cred = aplicarCompra(cred, pac, ped.tipo, ped.valor, pg.externalReference, nowS(), ped.faixa);
                    }
                    await salvarCredito(env, cred);
                    console.log('adote_credito', { cliente: ped.clienteId, saldo: cred.saldoKg, evento: ped.evento || 'compra' });
                  }
                } catch (error) { console.error('adote_credito_falhou', safeError(error)); await registrarFalha(env, 'compra-adote-credito', safeError(error), { pedido: pg.externalReference }); }
              } else if (ped.produto === 'carbono') {
                // Inventário de carbono pago: marca validade anual e, se Contratado, abre
                // tarefa pra Villanova coletar os dados e executar (com o e-mail do pagador).
                try {
                  ped.validade = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
                  if (pg.payerEmail) ped.email = pg.payerEmail;
                  await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 400 * 86400 });
                  if (ped.nivel === 'contratado') {
                    await ingestLead(env, { email: pg.payerEmail || '', company: '', material_category: 'Carbono — Contratado (PAGO)', material_description: `Cliente CONTRATOU e PAGOU o inventário nível Contratado. A Villanova coleta os dados e faz o inventário.\nFaturamento: ${ped.faixa}\nValor: R$ ${ped.valor}\nPedido: ${pg.externalReference}\nE-mail do pagador: ${pg.payerEmail || '(não informado)'}`, source: 'carbono-contratado-pago' });
                  }
                } catch (error) { console.error('carbono_pago_falhou', safeError(error)); await registrarFalha(env, 'compra-carbono', safeError(error), { pedido: pg.externalReference }); }
              } else if (ped.produto === 'esg') {
                // Relatório de ESG pago: valida por 1 ano e abre tarefa para a Villanova produzir.
                try {
                  ped.validade = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
                  if (pg.payerEmail) ped.email = pg.payerEmail;
                  await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 400 * 86400 });
                  const rel = relatorioESG(ped.relatorio || '');
                  await ingestLead(env, { email: pg.payerEmail || ped.email || '', company: ped.clienteNome || '', material_category: `ESG — ${rel ? rel.nome : 'relatório'} (PAGO)`, material_description: `Cliente CONTRATOU e PAGOU um relatório de ESG. A Villanova ESG produz a partir dos dados do sistema.\nRelatório: ${rel ? rel.nome : ped.relatorio}\nFaturamento: ${ped.faixa}\nValor: R$ ${ped.valor}\nPedido: ${pg.externalReference}\nE-mail do pagador: ${pg.payerEmail || '(não informado)'}`, source: 'esg-pago' });
                } catch (error) { console.error('esg_pago_falhou', safeError(error)); await registrarFalha(env, 'compra-esg', safeError(error), { pedido: pg.externalReference }); }
              } else if (ped.produto === 'coleta') {
                // Taxa de coleta (expressa / pequeno volume) paga → LIBERAÇÃO AUTOMÁTICA:
                // lead sai de "aguardando pagamento", ganha o selo pago e o cliente
                // recebe a confirmação por e-mail. Tudo sem ninguém precisar mexer.
                try {
                  const lead = await lerLead(env, ped.leadId);
                  if (lead) {
                    lead.cobranca = { ...(lead.cobranca || {}), status: 'pago', paymentId: pg.id, pagoEm: nowS() };
                    if (lead.status === 'aguardando-pagamento') lead.status = 'novo';
                    lead.descricao = `💳 TAXA PAGA (R$ ${ped.valor})${ped.expressa ? ' — ⚡ EXPRESSA: COLETAR EM ATÉ 24H' : ''} ✔ LIBERADA\n\n${lead.descricao}`;
                    await salvarLead(env, lead);
                    await atualizarIndexLead(env, ped.leadId, { pagamento: 'pago', status: lead.status, prioridade: ped.expressa ? 'alta' : (lead.prioridade || '') });
                  }
                  if (ped.clienteEmail) { try { await enviarEmailColetaPaga(ped, env); } catch (error) { console.error('email_coleta_paga', safeError(error)); } }
                  console.log('coleta_taxa_paga', { lead: ped.leadId, valor: pg.valor, expressa: !!ped.expressa });
                } catch (error) { console.error('coleta_paga_falhou', safeError(error)); await registrarFalha(env, 'compra-coleta-liberacao', safeError(error), { lead: ped.leadId }); }
              } else if (ped.produto === 'oscobranca') {
                // Cobrança de uma OS paga → marca PAGO na OS (e no índice) sozinho
                // e confirma por e-mail ao cliente. Nunca trava a operação.
                try {
                  const osPaga = await marcarCobrancaPagaOS(env, ped.osId, pg);
                  if (ped.clienteEmail) { try { await enviarEmailCobrancaOSPaga(ped, env); } catch (error) { console.error('email_oscobranca', safeError(error)); } }
                  try { await avisarEquipeCobrancaPaga(env, osPaga, pg); } catch (error) { console.error('email_equipe_oscobranca', safeError(error)); }
                  console.log('oscobranca_paga', { os: ped.osId, valor: pg.valor });
                } catch (error) { console.error('oscobranca_falhou', safeError(error)); await registrarFalha(env, 'compra-oscobranca', safeError(error), { os: ped.osId }); }
              } else if (ped.produto === 'teste') {
                // Teste de pagamento do Marcio: nada a fazer além de marcar pago
                // (já feito acima). Prova que o ciclo completo funcionou.
                console.log('teste_pagamento_ok', { pedido: pg.externalReference, valor: pg.valor });
              } else {
                try { await enviarEmailNF(ped, pg, env); } catch (error) { console.error('nf_email_falhou', safeError(error)); }
              }
            }
          }
        }
        return json({ ok: true }); // sempre 200 para o MP não reenviar sem parar
      }
      // O navegador do cliente reporta erros de tela aqui (monitor de falhas).
      if (pathname === '/api/monitor/erro' && request.method === 'POST') {
        return await receberErroCliente(request, env, null);
      }
      // Status do pedido (a página consulta para saber se já foi pago).
      if (pathname === '/api/carbono/pedido' && request.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!env.PORTAL_KV || !id) return json({ ok: false, status: 'desconhecido' }, 400);
        const raw = await env.PORTAL_KV.get(`pedido:${id}`);
        const ped = raw ? JSON.parse(raw) : null;
        return json({ ok: true, status: ped?.status || 'desconhecido', nivel: ped?.nivel || '', validade: ped?.validade || '' });
      }

      // Relatórios de ESG — loja (3 modelos + combo × faturamento, anual). Produzidos pela Villanova.
      if (pathname === '/esg/planos' && request.method === 'GET') return html(paginaLojaESG(url.searchParams.get('faixa') || ''));
      if (pathname === '/esg/contato' && request.method === 'GET') return html(paginaESGContato(relatorioESG(url.searchParams.get('rel') || ''), url.searchParams.get('faixa') || ''));
      if (pathname === '/api/esg/contato' && request.method === 'POST') {
        let b; try { b = await request.json(); } catch { b = {}; }
        const rel = relatorioESG((b && b.rel) || '');
        try {
          await ingestLead(env, {
            name: String((b && b.nome) || ''), company: String((b && b.empresa) || ''), email: String((b && b.email) || ''), phone: String((b && b.fone) || ''),
            material_category: `ESG — ${rel ? rel.nome : 'relatório'} (proposta)`,
            material_description: `Pedido de proposta de relatório de ESG (site).\nRelatório: ${rel ? rel.nome : '?'}\nFaturamento: ${(b && b.faixa) || '?'}\nMensagem: ${String((b && b.msg) || '').slice(0, 1000)}`,
            source: 'esg-proposta',
          });
        } catch (error) { console.error('esg_contato_falhou', safeError(error)); }
        return json({ ok: true });
      }
      if (pathname === '/esg/assinar' && request.method === 'GET') {
        const rel = relatorioESG(url.searchParams.get('rel') || '');
        const fx = faixaValida(url.searchParams.get('faixa') || '');
        if (!rel || !fx) return new Response(null, { status: 302, headers: { Location: '/esg/planos', 'cache-control': 'no-store' } });
        const preco = precoRelatorioESG(rel.id, fx);
        if (!preco || preco.sobConsulta) return new Response(null, { status: 302, headers: { Location: `/esg/contato?rel=${encodeURIComponent(rel.id)}&faixa=${encodeURIComponent(fx)}`, 'cache-control': 'no-store' } });
        const pedidoId = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${pedidoId}`, JSON.stringify({ produto: 'esg', status: 'pendente', relatorio: rel.id, faixa: fx, valor: preco.valor, criadoEm: nowS() }), { expirationTtl: 7 * 86400 });
        try {
          const s = await criarCheckoutStripe({ valor: preco.valor, descricao: `Relatório de ESG — ${rel.nome} (anual)`, externalReference: pedidoId, baseUrl, backPath: '/pagamento/ok', metodos: ['card', 'boleto'] }, env);
          return new Response(null, { status: 302, headers: { Location: s.url, 'cache-control': 'no-store' } });
        } catch (error) { console.error('esg_assinar_falhou', safeError(error)); return html(paginaMensagem('Pagamento indisponível', 'Não consegui gerar a cobrança agora. Tente de novo em instantes.', '/esg/planos'), 502); }
      }
      if (pathname === '/esg/obrigado' && request.method === 'GET') return html(paginaESGObrigado(url.searchParams.get('pedido') || ''));
      if (pathname === '/api/esg/pedido' && request.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!env.PORTAL_KV || !id) return json({ ok: false, status: 'desconhecido' }, 400);
        const raw = await env.PORTAL_KV.get(`pedido:${id}`);
        const ped = raw ? JSON.parse(raw) : null;
        return json({ ok: true, status: ped?.status || 'desconhecido', relatorio: ped?.relatorio || '', validade: ped?.validade || '' });
      }

      // Equipe & Acessos: SOMA os usuários cadastrados às listas de acesso por papel
      // (aditivo e defensivo — se falhar, mantém o env original). A partir daqui, as
      // funções *Permitido honram tanto o env quanto o cadastro no sistema.
      try { env = await carregarEquipeNoEnv(env); } catch { /* mantém env original */ }
      env = garantirAcessosFixos(env);

      if (pathname === '/' && request.method === 'GET') return await telaInicial(request, env);
      // /painel = mesmo painel do cliente (vários links e retornos apontam para cá).
      if (pathname === '/painel' && request.method === 'GET') return await telaInicial(request, env);
      if (pathname === '/entrar' && request.method === 'GET') return await entrarComToken(request, env, url);
      if (pathname === '/api/auth/solicitar' && request.method === 'POST') return await solicitarLink(request, env);
      // LOGIN UNIFICADO (tela única na raiz): descobre o papel do e-mail — equipe
      // (por prioridade) ou cliente — e delega ao fluxo de link daquele papel.
      if (pathname === '/api/entrar-unificado' && request.method === 'POST') return await solicitarLinkUnificado(request, env);
      if (pathname === '/api/auth/sair' && request.method === 'POST') return sair();
      // Aviso ao cliente quando a OS muda de etapa (o Ploomes chama esta rota na automação).
      if (pathname === '/api/ploomes/webhook' && request.method === 'POST') return await webhookPloomes(request, env);
      if (pathname === '/api/ploomes/webhook' && request.method === 'GET') return await webhookUltimo(request, env);
      // Validação pública de CDF (anti-fraude): QR no certificado -> confere contra o Ploomes.
      if (pathname === '/qr' && request.method === 'GET') return await qrCDF(request, env, url);
      // Diagnóstico (temporário): mostra o último acesso ao /qr (o que o Ploomes mandou).
      if (pathname === '/qr-ultimo' && request.method === 'GET') {
        const v = env.PORTAL_KV ? await env.PORTAL_KV.get('qr:ultimo') : null;
        return new Response(v || '{"vazio":true,"nota":"nenhum acesso ao /qr registrado ainda"}', { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (pathname === '/validar' && request.method === 'GET') return await validarCDF(request, env, url);
      // Verificação pública de operação validada pela Engenharia Ambiental (QR anti-fraude).
      if (pathname === '/qr-operacao' && request.method === 'GET') return await qrOperacao(request, env, url);
      if (pathname === '/validar-operacao' && request.method === 'GET') return await validarOperacaoPublico(request, env, url);
      // Verificação pública do comprovante de coleta do agente (QR anti-fraude).
      if (pathname === '/qr-coleta' && request.method === 'GET') return await qrColeta(request, env, url);
      if (pathname === '/validar-coleta' && request.method === 'GET') return await validarColetaPublico(request, env, url);
      // Verificação pública da Ordem de Coleta (QR anti-fraude).
      if (pathname === '/qr-os' && request.method === 'GET') return await qrOS(request, env, url);
      if (pathname === '/validar-os' && request.method === 'GET') return await validarOSPublico(request, env, url);

      // Quem bipa a etiqueta de um LOTE cai aqui — página pública com a cadeia do lote.
      if (pathname === '/validar-lote' && request.method === 'GET') {
        const idL = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
        const cSelo = (url.searchParams.get('c') || '').replace(/[^a-f0-9]/g, '').slice(0, 12);
        const lote = idL ? await lerLote(env, idL) : null;
        const okSelo = !!(lote && cSelo && cSelo === await seloLote(lote.id, env));
        const cargaL = okSelo ? await lerCarga(env, lote.cargaId) : null;
        return html(paginaValidarLote(lote, cargaL, okSelo));
      }

      // ACEITE eletrônico de proposta/contrato — público, autenticado pelo token do link.
      if (pathname === '/aceite' && request.method === 'GET') {
        const p = await lerProposta(env, url.searchParams.get('id'));
        const t = url.searchParams.get('t') || '';
        if (!p || !p.aceiteToken || t !== p.aceiteToken) return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de aceite à Ecobraz.'), 404);
        return html(paginaAceite(p, String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, '')));
      }
      if (pathname === '/api/aceite' && request.method === 'POST') {
        let b; try { b = await request.json(); } catch { b = {}; }
        const meta = { ip: request.headers.get('CF-Connecting-IP') || '', ua: request.headers.get('User-Agent') || '' };
        const r = await registrarAceite(env, b && b.id, b && b.t, b || {}, meta);
        if (r.ok) {
          console.log('aceite_registrado', { id: b.id, codigo: r.codigo });
          try { await avisarEquipeAceite(env, r.p); } catch (error) { console.error('aceite_aviso', safeError(error)); }
        }
        return json({ ok: r.ok, message: r.message || '', codigo: r.codigo || '' }, r.ok ? 200 : 400);
      }
      if (pathname === '/aceite/verificar' && request.method === 'GET') {
        const p = await lerProposta(env, url.searchParams.get('id'));
        return html(paginaAceiteVerificar(p, url.searchParams.get('c') || ''));
      }
      // Selo PÚBLICO da metodologia (só confirma a validação da Villanova; não expõe a receita).
      if (pathname === '/validar-metodologia' && request.method === 'GET') return await validarMetodologiaPublico(request, env, url);
      if (pathname === '/qr-metodologia' && request.method === 'GET') return await qrMetodologia(request, env, url);
      // Acesso da Villanova (validador) — login próprio por link mágico, independente do cliente.
      if (pathname === '/api/validacao/entrar' && request.method === 'POST') return await solicitarLinkValidador(request, env);
      if (pathname === '/entrar-validador' && request.method === 'GET') return await entrarComTokenValidador(request, env, url);
      if (pathname === '/api/validacao/sair' && request.method === 'POST') return sairValidador();
      // Acesso do AGENTE DE COLETAS (app mobile). Login próprio; agentes não são usuários do Ploomes.
      if (pathname === '/api/agente/entrar' && request.method === 'POST') return await solicitarLinkAgente(request, env);
      if (pathname === '/entrar-agente' && request.method === 'GET') return await entrarComTokenAgente(request, env, url);
      if (pathname === '/api/agente/sair' && request.method === 'POST') return sairAgente();
      // Acesso do OPERADOR (módulo operacional / doca). Login próprio; equipe interna da Ecobraz.
      if (pathname === '/api/operacao/entrar' && request.method === 'POST') return await solicitarLinkOperacao(request, env);
      if (pathname === '/entrar-operacao' && request.method === 'GET') return await entrarComTokenOperacao(request, env, url);
      if (pathname === '/api/operacao/sair' && request.method === 'POST') return sairOperacao();
      // Acesso do ENGENHEIRO AMBIENTAL (validação técnica).
      if (pathname === '/api/eng/entrar' && request.method === 'POST') return await solicitarLinkEng(request, env);
      if (pathname === '/entrar-eng' && request.method === 'GET') return await entrarComTokenEng(request, env, url);
      if (pathname === '/api/eng/sair' && request.method === 'POST') return sairEng();
      // Acesso da DIRETORIA (painel executivo).
      if (pathname === '/api/diretoria/entrar' && request.method === 'POST') return await solicitarLinkDiretoria(request, env);
      if (pathname === '/entrar-diretoria' && request.method === 'GET') return await entrarComTokenDiretoria(request, env, url);
      if (pathname === '/api/diretoria/sair' && request.method === 'POST') return sairDiretoria();
      // Acesso do ESCRITÓRIO/COMERCIAL (cadastro de clientes — a Débora).
      if (pathname === '/api/cadastro/entrar' && request.method === 'POST') return await solicitarLinkEscritorio(request, env);
      if (pathname === '/entrar-escritorio' && request.method === 'GET') return await entrarComTokenEscritorio(request, env, url);
      if (pathname === '/api/cadastro/sair' && request.method === 'POST') return sairEscritorio();
      // Acesso do FISCAL (contadora — importação/conciliação de notas fiscais).
      if (pathname === '/api/fiscal/entrar' && request.method === 'POST') return await solicitarLinkFiscal(request, env);
      if (pathname === '/entrar-fiscal' && request.method === 'GET') return await entrarComTokenFiscal(request, env, url);
      if (pathname === '/api/fiscal/sair' && request.method === 'POST') return sairFiscal();
      // Recebe leads do formulário do site (worker ecobraz-coletas), no lugar do Ploomes.
      // Protegido por segredo compartilhado (LEAD_INGEST_SECRET), servidor-a-servidor.
      if (pathname === '/api/lead' && request.method === 'POST') {
        if (!env.LEAD_INGEST_SECRET) return json({ ok: false, error: 'ingest_desligado' }, 503);
        if (request.headers.get('x-lead-secret') !== env.LEAD_INGEST_SECRET) return json({ ok: false, error: 'nao_autorizado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b) return json({ ok: false, error: 'json' }, 400);
        const r = await ingestLead(env, b);
        // CLIENTE JÁ EXISTENTE? (Marcio, 2026-07-29): não vira pendência para o
        // comercial — o lead entra já TRATADO ("direcionado ao portal") e a pessoa
        // recebe NA HORA um e-mail com link mágico para abrir a coleta pelo sistema.
        // A resposta HTTP segue idêntica à normal (privacidade: nunca revelamos a
        // quem digita no site se um e-mail é ou não cliente da Ecobraz).
        try {
          const emailLead = String((b && b.email) || '').trim().toLowerCase();
          if (r && r.ok && r.id && emailLead) {
            const cli = await buscarClienteBase(emailLead, env);
            if (cli && cli.liberado) {
              const lead = await lerLead(env, r.id);
              if (lead) {
                lead.status = 'tratado';
                lead.clienteId = String(cli.contactId || '');
                lead.nota = 'Cliente já existente — direcionado ao portal automaticamente (e-mail com link de acesso enviado).';
                await salvarLead(env, lead);
              }
              const token = await criarToken({ cid: cli.contactId, emp: cli.empresaId, em: cli.email, nome: cli.nome, fim: cli.dataFim || '', doc: cli.documento || '', tipo: 'login' }, LINK_TTL_S, env);
              if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
              const linkBase = env.PORTAL_BASE_URL || url.origin;
              await enviarEmailJaCliente({ nome: cli.nome, email: cli.email }, `${linkBase.replace(/\/+$/, '')}/entrar?token=${encodeURIComponent(token.valor)}`, env);
              console.log('lead_ja_cliente', { empresaId: cli.empresaId });
            }
          }
        } catch (error) { console.error('lead_ja_cliente_falhou', safeError(error)); }
        return json(r, r.ok ? 201 : 400);
      }
      // Login com Google (interno) — ativa quando as credenciais estiverem configuradas.
      if (pathname === '/auth/google' && request.method === 'GET') {
        if (!googleConfigurado(env)) return html(paginaMensagem('Login Google indisponível', 'Ainda não configurado. Use o link por e-mail.'), 503);
        return await iniciarGoogle(env, url);
      }
      if (pathname === '/auth/google/callback' && request.method === 'GET') {
        if (!googleConfigurado(env)) return html(paginaMensagem('Login Google indisponível', ''), 503);
        const g = await callbackGoogle(env, url);
        if (!g.ok) return html(paginaMensagem('Não foi possível entrar com o Google', 'Tente de novo.'), 400);
        if (g.ctx === 'operacao' && operadorPermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_operacao' }, APP_SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/operacao', 'Set-Cookie': cookieOperacao(s.valor, APP_SESSAO_TTL_S) } });
        }
        if (g.ctx === 'eng' && engenheiroPermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_eng' }, SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/eng', 'Set-Cookie': cookieEng(s.valor, SESSAO_TTL_S) } });
        }
        if (g.ctx === 'diretoria' && diretorPermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_diretoria' }, SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/diretoria', 'Set-Cookie': cookieDiretoria(s.valor, SESSAO_TTL_S) } });
        }
        if (g.ctx === 'escritorio' && escritorioPermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_escritorio' }, SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/inicio', 'Set-Cookie': cookieEscritorio(s.valor, SESSAO_TTL_S) } });
        }
        if (g.ctx === 'fiscal' && fiscalPermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_fiscal' }, SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/fiscal', 'Set-Cookie': cookieFiscal(s.valor, SESSAO_TTL_S) } });
        }
        if (g.ctx === 'agente' && agentePermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_agente' }, APP_SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/agente', 'Set-Cookie': cookieAgente(s.valor, APP_SESSAO_TTL_S) } });
        }
        if (g.ctx === 'validador' && emailValidadorPermitido(g.email, env)) {
          const s = await criarToken({ em: g.email, tipo: 'sessao_validador' }, SESSAO_TTL_S, env);
          return new Response(null, { status: 302, headers: { Location: '/validacao', 'Set-Cookie': cookieValidador(s.valor, SESSAO_TTL_S) } });
        }
        // LOGIN UNIFICADO (ctx=auto, tela inicial) ou cliente via Google (ctx=cliente):
        // identifica TODOS os acessos do e-mail (equipe + cliente), grava o cookie de
        // cada um e leva ao destino — 1 destino vai direto; vários, tela "Entrar como…".
        if (g.ctx === 'auto' || g.ctx === 'cliente') {
          const headers = new Headers();
          const destinos = [];
          if (g.ctx === 'auto') {
            if (escritorioPermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_escritorio' }, SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieEscritorio(s.valor, SESSAO_TTL_S)); destinos.push(['Escritório / Comercial', '/inicio']); }
            if (diretorPermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_diretoria' }, SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieDiretoria(s.valor, SESSAO_TTL_S)); destinos.push(['Diretoria', '/diretoria']); }
            if (engenheiroPermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_eng' }, SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieEng(s.valor, SESSAO_TTL_S)); destinos.push(['Engenharia Ambiental', '/eng']); }
            if (operadorPermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_operacao' }, APP_SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieOperacao(s.valor, APP_SESSAO_TTL_S)); destinos.push(['Operação (doca)', '/operacao']); }
            if (agentePermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_agente' }, APP_SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieAgente(s.valor, APP_SESSAO_TTL_S)); destinos.push(['Coletas (motorista)', '/agente']); }
            if (fiscalPermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_fiscal' }, SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieFiscal(s.valor, SESSAO_TTL_S)); destinos.push(['Fiscal (notas)', '/fiscal']); }
            if (emailValidadorPermitido(g.email, env)) { const s = await criarToken({ em: g.email, tipo: 'sessao_validador' }, SESSAO_TTL_S, env); headers.append('Set-Cookie', cookieValidador(s.valor, SESSAO_TTL_S)); destinos.push(['Validação (Villanova ESG)', '/validacao']); }
          }
          let cli = null;
          try { cli = await buscarClienteBase(g.email, env); } catch (error) { console.error('google_cliente_lookup', safeError(error)); }
          if (cli && cli.liberado) {
            const s = await criarToken({ cid: cli.contactId, emp: cli.empresaId, em: cli.email, nome: cli.nome, fim: cli.dataFim || '', doc: cli.documento || '', nvl: cli.nivel || 'admin', tipo: 'sessao' }, SESSAO_TTL_S, env);
            headers.append('Set-Cookie', cookieSessao(s.valor, SESSAO_TTL_S));
            destinos.push(['Portal do cliente', '/']);
          }
          if (!destinos.length) return html(paginaMensagem('Acesso não liberado', `O e-mail ${esc(g.email)} entrou no Google, mas não está na nossa base (cliente ou equipe). Fale com a Ecobraz.`), 403);
          if (destinos.length === 1) { headers.set('Location', destinos[0][1]); return new Response(null, { status: 302, headers }); }
          headers.set('content-type', 'text/html; charset=utf-8');
          headers.set('cache-control', 'no-store');
          return new Response(paginaEscolherAcesso(destinos), { status: 200, headers });
        }
        return html(paginaMensagem('Acesso não liberado', `O e-mail ${esc(g.email)} entrou no Google, mas não está cadastrado para este acesso.`), 403);
      }

      // Sessões independentes: cliente, validador, agente, operador, engenheiro e diretoria.
      const sessao = await lerSessao(request, env);
      const validador = await lerSessaoValidador(request, env);
      const agente = await lerSessaoAgente(request, env);
      const operacao = await lerSessaoOperacao(request, env);
      const eng = await lerSessaoEng(request, env);
      const diretoria = await lerSessaoDiretoria(request, env);
      const escritorio = await lerSessaoEscritorio(request, env);
      // MTR & DMR e Cronograma são ferramentas de conformidade: o escritório E o
      // engenheiro ambiental (RT) usam. Guard combinado para essas telas/APIs.
      const escOuEng = escritorio || eng;
      const fiscal = await lerSessaoFiscal(request, env);

      // Medição de uso (presença por dia) — alimenta o Painel da Diretoria. Só em GET de
      // página (não /api), best-effort: a medição nunca atrasa nem derruba a resposta.
      if (request.method === 'GET' && !pathname.startsWith('/api/') && env.PORTAL_KV) {
        try {
          if (sessao && sessao.documento) await registrarUso(env, { tipo: 'cliente', doc: sessao.documento, nome: sessao.nome });
          const membro = escritorio || agente || operacao || eng || diretoria || fiscal || validador;
          if (membro && membro.email) await registrarUso(env, { tipo: 'equipe', email: membro.email, nome: membro.nome, papel: membro.role });
        } catch { /* nunca bloqueia */ }
      }

      // Painel da Diretoria (visão macro). Exige sessão de diretoria.
      if (pathname === '/diretoria' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const [dados, leadsIdx, coletasIdx, uso] = await Promise.all([reunirDados(env), listarLeads(env), listarColetasOS(env), resumoUso(env)]);
        const coletasValidas = coletasIdx.filter((c) => c.status !== 'cancelada');
        const extras = {
          leads: contarPorPeriodo(leadsIdx, 'criadoEm'),
          os: contarPorPeriodo(coletasValidas, 'criadoEm'),
          uso,
          pend: reunirPendencias({ leads: leadsIdx, coletas: coletasValidas, aguardandoValidacao: dados.aguardando }),
        };
        try { extras.frota = await montarFrotaAoVivo(env); } catch { extras.frota = null; }
        // Fluxo de vendas e saldo do WhatsApp: SÓ no acesso do dono (marcio@ecobraz.org.br).
        if (String(diretoria.email || '').trim().toLowerCase() === 'marcio@ecobraz.org.br') {
          try { extras.vendas = await fluxoDeVendas(env); } catch { extras.vendas = null; }
          try { extras.waSaldo = whatsappConfigurado(env) ? await saldoGupshup(env) : null; } catch { extras.waSaldo = null; }
        }
        return html(paginaPainelDiretoria(diretoria, dados, extras));
      }
      // Acessos dos clientes (nominal): quem entrou no portal, último acesso e
      // frequência. Diretoria e escritório podem ver.
      if (pathname === '/diretoria/acessos-clientes' && request.method === 'GET') {
        if (!diretoria && !escritorio) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaAcessosClientes(await acessosClientesDetalhe(env)));
      }
      // RotaExata — sonda de configuração (só Diretoria): lê a documentação da API e
      // testa o login com as credenciais do cofre. Mostra só status/estrutura.
      if (pathname === '/diretoria/rotaexata' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaSondaRotaExata(diretoria, env));
      }
      if (pathname === '/api/diretoria/rotaexata-sonda' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return json(await sondaRotaExata(env));
      }
      // Frota ao vivo (comercial e diretoria): onde está cada caminhão, qual coleta
      // atende agora, a próxima da fila e as concluídas de hoje.
      if (pathname === '/frota/aovivo' && request.method === 'GET') {
        if (!escritorio && !diretoria) return html(paginaLoginEscritorio(googleConfigurado(env)));
        return html(paginaFrotaAoVivo(escritorio || diretoria));
      }
      if (pathname === '/api/frota/aovivo' && request.method === 'GET') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return json(await montarFrotaAoVivo(env));
      }
      // Rastreador "fora do cadastro" que não é mais usado: oculta da tela (reversível).
      // {placa} adiciona à lista de ocultos; {reexibir:true} limpa a lista inteira.
      if (pathname === '/api/frota/ocultar' && request.method === 'POST') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (!env.PORTAL_KV) return json({ ok: false, error: 'sem_kv' }, 500);
        const b = await request.json().catch(() => ({}));
        let lista = [];
        try { lista = JSON.parse((await env.PORTAL_KV.get('frota:ocultarRastreador')) || '[]'); } catch { lista = []; }
        if (b.reexibir) lista = [];
        else {
          const p = String(b.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (!p) return json({ ok: false, error: 'placa_vazia' }, 400);
          if (!lista.includes(p)) lista.push(p);
        }
        await env.PORTAL_KV.put('frota:ocultarRastreador', JSON.stringify(lista.slice(0, 50)));
        return json({ ok: true, ocultos: lista.length });
      }
      // Prevenção de perdas (só Diretoria): reconciliação por peso + IA nas fotos + valor.
      if (pathname === '/diretoria/prevencao' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaPrevencao(diretoria, await dadosPrevencao(env)));
      }
      if (pathname === '/api/diretoria/ping-ia' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return json(await pingIA(env));
      }
      // Diagnóstico (read-only): como o Ploomes expõe os anexos, para montar o importador.
      if (pathname === '/diretoria/ploomes-anexos' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaSondaAnexos(diretoria, await sondarAnexosPloomes(env)));
      }
      // Migração Ploomes — Fase 1: inspetor de contatos (Diretoria, read-only, mascarado).
      if (pathname === '/diretoria/ploomes-contatos' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaAmostraContatos(diretoria, await amostraContatosPloomes(env, url.searchParams.get('n'))));
      }
      // Migração Ploomes — painel de controle (progresso + importar em lote + buscar).
      if (pathname === '/diretoria/migrar-ploomes' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaMigrarPloomes(diretoria, await estatisticasMigracao(env)));
      }
      if (pathname === '/api/diretoria/ploomes-importar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await importarLoteContatos(env, url.searchParams.get('desdeId'), url.searchParams.get('top')));
      }
      if (pathname === '/api/diretoria/ploomes-buscar' && request.method === 'GET') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json({ ok: true, contatos: await buscarContatos(env, url.searchParams.get('q'), 25) });
      }
      // Tela de contato navegável (empresa ↔ pessoas via company_id). Diretoria.
      if (pathname === '/diretoria/contato' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaContatoDetalhe(diretoria, await detalheContato(env, url.searchParams.get('id'))));
      }
      // Migração Ploomes — Fase 3: negócios/OS → banco próprio (com registro completo).
      if (pathname === '/diretoria/migrar-negocios' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaMigrarNegocios(diretoria, await estatisticasNegocios(env)));
      }
      if (pathname === '/api/diretoria/negocios-importar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await importarLoteNegocios(env, url.searchParams.get('desdeId'), url.searchParams.get('top')));
      }
      // TESTE DE PAGAMENTO (Marcio): gera um link REAL do Mercado Pago de valor
      // baixo (padrão R$ 1) e redireciona para o checkout. Prova a ponta a ponta
      // em produção: criar preferência → pagar → webhook → baixa. Só diretoria.
      if (pathname === '/diretoria/teste-pagamento' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        if (!env.MERCADOPAGO_ACCESS_TOKEN) return html(paginaMensagem('Mercado Pago não configurado', 'A chave MERCADOPAGO_ACCESS_TOKEN não está no cofre. Configure antes de testar.', '/diretoria'), 503);
        const valor = Math.min(Math.max(Number(url.searchParams.get('valor')) || 1, 1), 55);
        const ref = 'teste-' + novoId();
        try {
          const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
          const pref = await criarPreferencia({ valor, descricao: `Teste de pagamento Ecobraz (R$ ${valor})`, externalReference: ref, baseUrl: base, backPath: '/diretoria/teste-pagamento-ok' }, env);
          if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'teste', valor, status: 'pendente', criadoEm: nowS(), por: diretoria.email || '' }), { expirationTtl: 3 * 86400 });
          console.log('teste_pagamento_gerado', { ref, valor });
          if (!pref.initPoint) return html(paginaMensagem('Não consegui gerar o link', 'O Mercado Pago não devolveu o link de checkout. Tente de novo.', '/diretoria'), 502);
          return new Response(null, { status: 302, headers: { Location: pref.initPoint, 'cache-control': 'no-store' } });
        } catch (error) {
          console.error('teste_pagamento_erro', safeError(error));
          await registrarFalha(env, 'teste-pagamento', safeError(error), { ref });
          return html(paginaMensagem('Erro ao gerar o pagamento', 'Não consegui criar a cobrança de teste agora: ' + safeError(error).message, '/diretoria'), 502);
        }
      }
      // TESTE PIX NATIVO (Marcio): gera uma cobrança Pix direta e mostra o QR +
      // copia-e-cola na NOSSA página (sem a tela do Checkout Pro). Se o Pix não
      // estiver habilitado na conta, mostra o erro exato do Mercado Pago.
      if (pathname === '/diretoria/teste-pix' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        if (!env.MERCADOPAGO_ACCESS_TOKEN) return html(paginaMensagem('Mercado Pago não configurado', 'A chave MERCADOPAGO_ACCESS_TOKEN não está no cofre.', '/diretoria'), 503);
        const valor = Math.min(Math.max(Number(url.searchParams.get('valor')) || 1, 1), 55);
        const ref = 'teste-' + novoId();
        const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
        try {
          const pix = await criarPixDireto({ valor, descricao: `Teste Pix Ecobraz (R$ ${valor})`, externalReference: ref, payerEmail: diretoria.email, baseUrl: base }, env);
          if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'teste', valor, status: 'pendente', pixId: pix.id, criadoEm: nowS() }), { expirationTtl: 3 * 86400 });
          console.log('teste_pix_gerado', { ref, valor, pixId: pix.id });
          return html(paginaPixTeste(valor, pix, ref));
        } catch (error) {
          const det = (error && error.mpDetalhe) || safeError(error).message;
          console.error('teste_pix_erro', safeError(error));
          await registrarFalha(env, 'teste-pix', det, { ref });
          const dica = /pix/i.test(det) || (error && error.mpStatus === 400)
            ? 'Isso normalmente significa que o <b>Pix ainda não está habilitado</b> na conta Mercado Pago da Ecobraz (falta cadastrar a chave Pix). Assim que ativar, este teste mostra o QR Code.'
            : 'Tente de novo em instantes.';
          return html(paginaMensagem('Pix não pôde ser gerado', `O Mercado Pago respondeu: <b>${esc(det)}</b><br><br>${dica}`, '/diretoria'), 502);
        }
      }
      // TESTE STRIPE: cria um Checkout (Pix + cartão) de R$ 1 e redireciona.
      if (pathname === '/diretoria/teste-whatsapp' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const cfg = whatsappConfigurado(env);
        const tA = !!templateColeta(env, 'a_caminho'), tC = !!templateColeta(env, 'chegou');
        const chk = (b) => b ? '✅' : '❌';
        const okTudo = cfg && tA && tC;
        const keyLen = String(env.GUPSHUP_API_KEY || '').trim().length;
        const srcNum = String(env.GUPSHUP_SOURCE || '').replace(/\D/g, '');
        const appNm = String(env.GUPSHUP_APP || '').trim();
        const cfgTpl = String(env.GUPSHUP_TEMPLATE_ACAMINHO || '').trim();
        const cfgTplC = String(env.GUPSHUP_TEMPLATE_CHEGOU || '').trim();
        let listaTpl = '<div style="font-size:11.5px;color:#8fa39f">—</div>';
        try {
          const tpls = await listarTemplatesGupshup(env);
          if (tpls.ok) {
            listaTpl = tpls.templates.length ? tpls.templates.map((t) => {
              const usado = t.id === cfgTpl ? ' ← config. A CAMINHO' : (t.id === cfgTplC ? ' ← config. CHEGOU' : '');
              return `<div style="font-size:11px;color:#4F6469;margin-top:3px"><b>${esc(t.nome || '(sem nome)')}</b> · ${esc(String(t.id).slice(0, 13))}… · ${esc(t.status)}${usado ? `<span style="color:#0B5B66;font-weight:800">${esc(usado)}</span>` : ''}</div>`;
            }).join('') : '<div style="font-size:11.5px;color:#8fa39f">Nenhum template retornado pelo Gupshup.</div>';
          } else { listaTpl = `<div style="font-size:11.5px;color:#B23A2E">Não listou os templates (${esc(tpls.motivo || 'erro')}${tpls.detalhe ? ': ' + esc(tpls.detalhe) : ''})</div>`; }
        } catch { listaTpl = '<div style="font-size:11.5px;color:#B23A2E">Falha ao listar templates.</div>'; }
        const page = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Testar WhatsApp — Ecobraz</title>
<style>body{margin:0;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;background:#F2F6F4;color:#10262B}.wrap{max-width:520px;margin:0 auto;padding:22px 18px 48px}.card{background:#fff;border:1px solid #E4EBE9;border-radius:14px;padding:20px;margin-bottom:14px}input,select{width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:12px;font-size:15px;margin-top:6px;font-family:inherit}label{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#7c8a87}.btn{background:#25D366;color:#083b23;border:none;border-radius:11px;padding:14px 18px;font-size:15px;font-weight:800;cursor:pointer;width:100%;margin-top:16px}.st{font-size:14px;line-height:2}</style></head>
<body><div class="wrap">
  <a href="/diretoria" style="color:#0B5B66;font-weight:800;text-decoration:none;font-size:13px">← Diretoria</a>
  <h1 style="font-size:21px;margin:10px 0 4px">Testar WhatsApp</h1>
  <p style="font-size:12.5px;color:#8fa39f;margin:0 0 14px">Manda um aviso de teste no seu próprio WhatsApp para confirmar a integração (Gupshup).</p>
  <div class="card">
    <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#7c8a87;margin-bottom:8px">Configuração</div>
    <div class="st">${chk(cfg)} Conta (chave + número + app)<br>${chk(tA)} Template “a caminho”<br>${chk(tC)} Template “chegou”</div>
    <div style="color:${okTudo ? '#1E7A1E' : '#8A4B00'};font-weight:800;margin-top:10px;font-size:13.5px">${okTudo ? 'Tudo configurado — pode testar 👇' : 'Falta algum segredo no cofre da Cloudflare. Envie mesmo assim para ver o erro exato.'}</div>
    <div style="font-size:11.5px;color:#8fa39f;margin-top:10px">Chave: <b>${keyLen}</b> caracteres · Nº: <b>${esc(srcNum)}</b> · App: <b>${esc(appNm)}</b></div>
    <div style="margin-top:10px;border-top:1px solid #EEF1F0;padding-top:10px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#7c8a87;margin-bottom:4px">Templates reais no Gupshup</div>
      ${listaTpl}
      <div style="font-size:10px;color:#9aa7a4;margin-top:8px">IDs configurados no cofre — a caminho: ${esc(cfgTpl.slice(0, 13))}… · chegou: ${esc(cfgTplC.slice(0, 13))}…</div>
    </div>
  </div>
  <div class="card">
    <label>Seu número de WhatsApp (com DDD)</label>
    <input id="tel" inputmode="tel" placeholder="11 91272-8412">
    <label style="margin-top:14px;display:block">Qual aviso testar</label>
    <select id="tipo"><option value="a_caminho">🚛 A caminho (com link do mapa)</option><option value="chegou">📍 Chegou</option></select>
    <button class="btn" onclick="enviar(this)">Enviar teste no meu WhatsApp</button>
    <div id="msg" style="font-size:14px;margin-top:12px;font-weight:700"></div>
  </div>
</div>
<script>
function enviar(b){b.disabled=true;var m=document.getElementById('msg');m.textContent='Enviando…';m.style.color='#4F6469';
fetch('/api/diretoria/teste-whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tel:document.getElementById('tel').value,tipo:document.getElementById('tipo').value})}).then(function(r){return r.json();}).then(function(j){
var linhas='';
if(j.tentativas&&j.tentativas.length){linhas='<div style="margin-top:10px;text-align:left">'+j.tentativas.map(function(t){var cor=t.ok?'#1E7A1E':'#B23A2E';var corpo=String(t.corpo||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');return '<div style="font-size:11px;color:'+cor+';margin-top:6px;border-top:1px solid #eef1f0;padding-top:6px"><b>'+String(t.estrategia||'').replace(/</g,'&lt;')+'</b> · HTTP '+t.status+(t.ok?' ✅':' ❌')+(corpo?('<br><span style=\\'color:#7a5f1c;font-weight:400\\'>'+corpo+'</span>'):'')+'</div>';}).join('')+'</div>';}
if(j.ok){m.innerHTML='✅ Enviado pelo caminho <b>'+String(j.vencedor||'').replace(/</g,'&lt;')+'</b>! Confira o seu WhatsApp (pode levar alguns segundos).'+linhas;m.style.color='#1E7A1E';}
else{m.innerHTML='❌ Nenhum caminho funcionou'+(j.motivo?(' ('+String(j.motivo).replace(/</g,'&lt;')+')'):'')+'. Veja o erro de cada um abaixo:'+linhas;m.style.color='#B23A2E';}
b.disabled=false;}).catch(function(){m.textContent='Sem conexão. Tente de novo.';m.style.color='#B23A2E';b.disabled=false;});}
</script></body></html>`;
        return html(page);
      }
      if (pathname === '/api/diretoria/teste-whatsapp' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        const tel = b && b.tel; const tipo = (b && b.tipo) === 'chegou' ? 'chegou' : 'a_caminho';
        if (!tel) return json({ ok: false, motivo: 'informe o seu número' }, 400);
        if (!whatsappConfigurado(env)) return json({ ok: false, motivo: 'WhatsApp não configurado', detalhe: 'Faltam os segredos GUPSHUP_API_KEY / GUPSHUP_SOURCE / GUPSHUP_APP no cofre da Cloudflare.' });
        const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
        const params = tipo === 'a_caminho' ? ['Teste', `${base}/acompanhar?c=teste&t=demo`] : ['Teste'];
        try {
          // Cascata com diagnóstico: tenta todos os caminhos e devolve o resultado de cada um.
          const r = await enviarWhatsAppDiag(env, tel, tipo, params);
          return json({ ok: !!(r && r.ok), vencedor: (r && r.vencedor) || '', motivo: (r && r.motivo) || '', tentativas: (r && r.tentativas) || [] });
        } catch (e) { return json({ ok: false, motivo: 'excecao', detalhe: String((e && e.name) || 'erro'), tentativas: [] }); }
      }
      // Campanhas de WhatsApp (SÓ Diretoria): divulgação/oferta de coleta em massa,
      // sempre pelo canal oficial (template aprovado), com opt-out e envio em lotes.
      if (pathname === '/diretoria/whatsapp' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const baseWa = String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, '');
        const urlWebhook = `${baseWa}/api/wa/webhook?k=${await chaveWebhookWA(env)}`;
        return html(paginaCampanhasWA(diretoria, await listarCampanhasWA(env), await listarOptoutWA(env), urlWebhook));
      }
      if (pathname === '/api/diretoria/wa/metricas' && request.method === 'GET') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const r = await metricasCampanhaWA(env, url.searchParams.get('id'));
        return json(r, r.ok ? 200 : 404);
      }
      if (pathname === '/api/diretoria/wa/templates' && request.method === 'GET') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (!whatsappConfigurado(env)) return json({ ok: false, motivo: 'WhatsApp não configurado no cofre' });
        const lst = await listarTemplatesGupshup(env);
        // Evidência no D1 (sem segredos) — para diagnosticar a listagem remotamente.
        try {
          if (env.DB_PLOOMES) {
            await env.DB_PLOOMES.prepare('CREATE TABLE IF NOT EXISTS diagnosticos (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, criado_em TEXT, dados TEXT)').run();
            await env.DB_PLOOMES.prepare('INSERT INTO diagnosticos (tipo, criado_em, dados) VALUES (?1, ?2, ?3)')
              .bind('wa-templates', new Date().toISOString(), JSON.stringify({ ok: lst.ok, via: lst.via || '', qtd: (lst.templates || []).length, tentativas: lst.tentativas || [] }).slice(0, 20000)).run();
          }
        } catch { /* evidência é best-effort */ }
        // Mesmo sem listagem, os templates JÁ CONFIGURADOS no cofre (avisos de
        // coleta) entram como opção — a tela nunca fica vazia e o teste destrava.
        const lang = String(env.GUPSHUP_TEMPLATE_LANG || 'pt_BR').trim();
        // Os templates do cofre têm variáveis CONHECIDAS — declarar evita o envio
        // "aceito mas nunca entregue" (Meta descarta template com variáveis faltando).
        const baseUrlWa = String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, '');
        const COFRE_META = {
          a_caminho: { nvars: 2, corpo: 'Aviso "estamos a caminho" — 2 variáveis: {{1}} = nome, {{2}} = link de acompanhamento.', sugestoes: ['{nome}', baseUrlWa + '/painel'] },
          chegou: { nvars: 1, corpo: 'Aviso "chegamos" — 1 variável: {{1}} = nome.', sugestoes: ['{nome}'] },
        };
        const doCofre = ['a_caminho', 'chegou']
          .map((t) => ({ info: templateInfo(env, t), meta: COFRE_META[t] }))
          .filter((x) => x.info.nome || x.info.id)
          .map((x) => ({ id: x.info.id, nome: x.info.nome + ' (aviso de coleta — do cofre)', status: 'APPROVED', idioma: lang, corpo: x.meta.corpo, nvars: x.meta.nvars, sugestoes: x.meta.sugestoes }));
        const daLista = lst.ok ? (lst.templates || []) : [];
        const nomes = new Set(daLista.map((t) => t.nome));
        const templates = daLista.concat(doCofre.filter((t) => !nomes.has(t.nome)));
        return json({ ok: templates.length > 0, motivo: lst.ok ? '' : 'sem_listagem', aviso: lst.ok ? '' : 'Não consegui listar do Gupshup — mostrando os templates do cofre. Dá para digitar nome + id manualmente (opção ✍️).', templates, tentativas: lst.ok ? [] : (lst.tentativas || []) });
      }
      if (pathname === '/diretoria/whatsapp/lista' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const pub = String(url.searchParams.get('publico') || '');
        if (!PUBLICOS_WA[pub]) return html(paginaMensagem('Público não encontrado', 'Escolha o público na tela de Campanhas.', '/diretoria/whatsapp'), 404);
        return html(paginaListaPublicoWA(pub, await listaDetalhadaPublicoWA(env, pub, url.searchParams.get('tel') || ''), await listarExcluidasWA(env)));
      }
      if (pathname === '/api/diretoria/wa/excluir-empresa' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const r = await mudarExclusaoEmpresaWA(env, b && b.doc, b && b.nome, String((b && b.acao) || 'add'), diretoria.email || '');
        return json(r, r.ok ? 200 : 400);
      }
      if (pathname === '/api/diretoria/wa/previa' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const p = await previaPublicoWA(env, String(b.publico || ''), b.telTeste);
        return json({ ok: true, total: p.total, cortados: p.cortados, exemplos: p.exemplos });
      }
      if (pathname === '/api/diretoria/wa/preparar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const r = await prepararCampanhaWA(env, diretoria, b || {});
        return json(r, r.ok ? 200 : 400);
      }
      if (pathname === '/api/diretoria/wa/enviar-lote' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (!whatsappConfigurado(env)) return json({ ok: false, message: 'WhatsApp não configurado no cofre.' });
        let b; try { b = await request.json(); } catch { b = {}; }
        const r = await enviarLoteWA(env, b && b.id);
        return json(r, r.ok ? 200 : 400);
      }
      if (pathname === '/api/diretoria/wa/falhas' && request.method === 'GET') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return json({ ok: true, falhas: await falhasDaCampanhaWA(env, url.searchParams.get('id')) });
      }
      if (pathname === '/api/diretoria/wa/optout' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const r = await mudarOptoutWA(env, b && b.tel, String((b && b.acao) || 'add'), b && b.motivo);
        return json(r, r.ok ? 200 : 400);
      }
      if (pathname === '/diretoria/teste-stripe' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        if (!stripeConfigurado(env)) return html(paginaMensagem('Stripe não configurada', 'Falta a chave STRIPE_SECRET_KEY no cofre do Cloudflare. Cadastre e tente de novo.', '/diretoria'), 503);
        const metodo = (url.searchParams.get('metodo') || 'card').toLowerCase();
        const metValido = ['card', 'boleto', 'pix'].includes(metodo) ? metodo : 'card';
        const padrao = metValido === 'boleto' ? 10 : 1; // boleto tem valor mínimo maior que R$1
        const valor = Math.min(Math.max(Number(url.searchParams.get('valor')) || padrao, 1), 55);
        const ref = 'teste-' + novoId();
        const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
        try {
          const s = await criarCheckoutStripe({ valor, descricao: `Teste Stripe Ecobraz — ${metValido} (R$ ${valor})`, externalReference: ref, baseUrl: base, backPath: '/diretoria/teste-stripe-ok', clienteEmail: diretoria.email, metodos: [metValido] }, env);
          if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'teste', gateway: 'stripe', valor, status: 'pendente', sessionId: s.id, criadoEm: nowS() }), { expirationTtl: 3 * 86400 });
          if (!s.url) return html(paginaMensagem('Não gerou o checkout', 'A Stripe não devolveu a URL de pagamento.', '/diretoria'), 502);
          console.log('teste_stripe_gerado', { ref, valor, metodo: metValido });
          return new Response(null, { status: 302, headers: { Location: s.url, 'cache-control': 'no-store' } });
        } catch (error) {
          const det = (error && error.detalhe) || safeError(error).message;
          console.error('teste_stripe_erro', safeError(error));
          await registrarFalha(env, 'teste-stripe', det, { ref, metodo: metValido });
          const dica = new RegExp(metValido, 'i').test(det)
            ? ` Pode ser que o método "${metValido}" precise ser ativado na conta Stripe (Configurações → Métodos de pagamento) — ou não esteja disponível para este tipo de conta (ONG).`
            : ' Tente de novo em instantes.';
          return html(paginaMensagem('Stripe: não deu para gerar', `A Stripe respondeu: ${det}.${dica}`, '/diretoria'), 502);
        }
      }
      if (pathname === '/diretoria/teste-stripe-ok' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const sid = url.searchParams.get('stripe') || '';
        const s = sid ? await consultarCheckoutStripe(sid, env) : null;
        if (s && s.pago && s.ref && env.PORTAL_KV) {
          try { const raw = await env.PORTAL_KV.get(`pedido:${s.ref}`); const ped = raw ? JSON.parse(raw) : { status: 'pendente' }; if (ped.status !== 'pago') { ped.status = 'pago'; ped.pagoEm = nowS(); await env.PORTAL_KV.put(`pedido:${s.ref}`, JSON.stringify(ped), { expirationTtl: 3 * 86400 }); } } catch { /* segue */ }
        }
        const pago = !!(s && s.pago);
        return html(paginaMensagem(pago ? '✅ Pagamento aprovado na Stripe!' : '⏳ Aguardando confirmação', pago ? 'A Stripe confirmou o pagamento — o pagamento por cartão (e Apple Pay / Google Pay) está funcionando.' : 'Se você concluiu o pagamento, a confirmação leva alguns segundos. Atualize esta página em instantes.', '/diretoria'));
      }
      // TESTE do NOSSO Pix (copia e cola apontando para a chave da Ecobraz).
      // Não depende de gateway: gera o BR Code na hora. Serve para conferir, num
      // app de banco de verdade, que resolve para a conta certa e o valor certo.
      if (pathname === '/diretoria/teste-pix-nosso' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const valor = Math.min(Math.max(Number(url.searchParams.get('valor')) || 1, 0.01), 5000);
        const ref = 'teste-' + novoId();
        const cfg = pixConfig(env);
        try {
          const copiaECola = gerarPixCopiaECola({ chave: cfg.chave, nome: cfg.nome, cidade: cfg.cidade, valor, txid: ref });
          if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'teste', gateway: 'pix-manual', valor, status: 'pendente', criadoEm: nowS() }), { expirationTtl: 3 * 86400 });
          console.log('teste_pix_nosso_gerado', { ref, valor });
          return html(paginaPix({
            titulo: 'Teste — Pix Ecobraz',
            valor, copiaECola, chave: cfg.chave, nome: cfg.nome, ref,
            voltarUrl: '/diretoria',
            aviso: 'TESTE: abra o app do seu banco e cole este código. Confira se aparece o nome da conta da Ecobraz e o valor. Você pode confirmar (cai na conta) ou só verificar e cancelar.',
          }));
        } catch (error) {
          console.error('teste_pix_nosso_erro', safeError(error));
          await registrarFalha(env, 'teste-pix-nosso', safeError(error).message, { ref });
          return html(paginaMensagem('Não deu para gerar o Pix', 'Erro ao montar o código Pix. Já registrei a falha para eu investigar.', '/diretoria'), 500);
        }
      }
      // Retorno da Stripe após o checkout (cartão = confirma na hora; boleto = gerado,
      // aguarda pagamento). Confere pela API (fonte da verdade), libera o serviço e
      // leva o cliente à página certa conforme o produto.
      if (pathname === '/pagamento/ok' && request.method === 'GET') {
        if (url.searchParams.get('stripe_cancel')) return html(paginaMensagem('Pagamento não concluído', 'Você saiu sem concluir o pagamento. Sem problema — quando quiser, é só gerar a cobrança de novo.', '/painel'));
        const sid = url.searchParams.get('stripe') || '';
        const s = sid ? await consultarCheckoutStripe(sid, env) : null;
        if (!s) return html(paginaMensagem('Pagamento', 'Não consegui confirmar este pagamento agora. Se você concluiu, a confirmação chega em instantes — atualize a página.', '/painel'));
        let ped = null;
        if (s.ref && env.PORTAL_KV) {
          try {
            const chave = `pedido:${s.ref}`; const rawp = await env.PORTAL_KV.get(chave); ped = rawp ? JSON.parse(rawp) : null;
            if (ped && s.pago && ped.status !== 'pago') {
              ped.status = 'pago'; ped.pagoEm = nowS(); ped.gateway = 'stripe';
              await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 30 * 86400 });
              await fulfillPedidoPago(env, ped, { id: s.paymentIntent || s.id, valor: s.valor, externalReference: s.ref, payerEmail: s.email });
              console.log('stripe_retorno_pago', { ref: s.ref, valor: s.valor });
            }
          } catch (error) { console.error('stripe_retorno_falhou', safeError(error)); await registrarFalha(env, 'stripe-retorno', safeError(error), { ref: s.ref }); }
        }
        if (s.pago) {
          const prod = ped && ped.produto;
          // 'coleta'/'oscobranca' iriam para /painel (que exige login) — quem paga anônimo
          // (Coleta Expressa do site) caía na tela de login. Mostramos confirmação pública.
          if (prod === 'coleta') return html(paginaMensagem('✅ Pagamento aprovado — Coleta Expressa confirmada!', 'Recebemos seu pagamento. Sua coleta entra na fila EXPRESSA (até 24h) e nossa equipe entra em contato para confirmar o horário. Obrigado!', 'https://ecobraz.org'));
          if (prod === 'oscobranca') return html(paginaMensagem('✅ Pagamento aprovado!', 'Recebemos o pagamento da sua ordem de serviço. Obrigado — nossa equipe já foi avisada.', 'https://ecobraz.org'));
          return new Response(null, { status: 302, headers: { Location: destinoObrigado(ped, s.ref), 'cache-control': 'no-store' } });
        }
        // Boleto: gerado, mas ainda não pago — a baixa é automática pelo webhook quando pagar.
        return html(paginaMensagem('Boleto gerado', 'Seu boleto foi gerado. Pague pelo app ou site do seu banco até o vencimento — a confirmação é automática (costuma levar de 1 a 2 dias úteis após o pagamento). Assim que cair, seu pedido é liberado sozinho.', 'https://ecobraz.org'));
      }
      // Abrir este endereço no navegador (GET) NÃO é erro: o webhook funciona por
      // POST (a Stripe chama sozinha). Respondemos algo claro para não assustar.
      if (pathname === '/api/stripe/webhook' && request.method === 'GET') {
        return json({ ok: true, webhook: 'stripe', ativo: !!env.STRIPE_WEBHOOK_SECRET, dica: 'Este é o webhook da Stripe. Ele funciona via POST (a Stripe chama automaticamente) — não pelo navegador. Se você está vendo isto, o endereço existe e está no ar.' });
      }
      // Webhook da Stripe: confirma o pagamento (assinatura + consulta à API) e libera.
      if (pathname === '/api/stripe/webhook' && request.method === 'POST') {
        const raw = await request.text();
        const { evento, verificado } = await verificarEventoStripe(raw, request.headers.get('stripe-signature'), env);
        const tipo = evento && evento.type;
        if (tipo === 'checkout.session.completed' || tipo === 'checkout.session.async_payment_succeeded') {
          const sid = evento.data && evento.data.object && evento.data.object.id;
          // Fonte da verdade: reconsulta a sessão pela API (autenticada com nossa chave).
          const s = sid ? await consultarCheckoutStripe(sid, env) : null;
          if (s && s.pago && s.ref && env.PORTAL_KV) {
            try {
              const chave = `pedido:${s.ref}`; const rawp = await env.PORTAL_KV.get(chave); const ped = rawp ? JSON.parse(rawp) : { status: 'pendente' };
              if (ped.status !== 'pago') {
                ped.status = 'pago'; ped.pagoEm = nowS(); ped.gateway = 'stripe';
                await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 30 * 86400 });
                console.log('stripe_pago', { ref: s.ref, valor: s.valor, verificado });
                // Libera o serviço (mesma lógica do MP): Adote credita, Carbono/ESG abrem
                // tarefa, Coleta libera o lead, OS marca paga. Vale p/ cartão e boleto.
                await fulfillPedidoPago(env, ped, { id: s.paymentIntent || s.id, valor: s.valor, externalReference: s.ref, payerEmail: s.email });
              }
            } catch (error) { console.error('stripe_webhook_falhou', safeError(error)); await registrarFalha(env, 'stripe-webhook', safeError(error), { ref: s.ref }); }
          }
        }
        return json({ received: true });
      }
      // Diagnóstico definitivo: quais meios de pagamento a conta MP aceita (tem Pix?).
      // Log de pagamentos: prova visível do status registrado de cada pedido.
      if (pathname === '/diretoria/pagamentos' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const dados = await ultimosPedidos(env, 60);
        return html(paginaPagamentos(dados));
      }
      if (pathname === '/diretoria/mp-diagnostico' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const d = await consultarMeiosPagamento(env);
        const corpo = d.ok
          ? `${d.temPix ? '✅ O Pix ESTÁ habilitado na conta.' : '⛔ O Pix NÃO está na lista de meios aceitos.'} Tipos aceitos: ${d.tipos.join(', ') || '—'}. ${d.temPix ? 'Se não aparece no checkout, é exibição — eu forço o Pix.' : 'Solução: habilitar o Pix no checkout desta conta (a chave Pix sozinha não basta).'}`
          : `Não consegui consultar o Mercado Pago: ${d.erro || 'erro'}`;
        return html(paginaMensagem('Diagnóstico Mercado Pago', corpo, '/diretoria'), d.ok ? 200 : 502);
      }
      if (pathname === '/api/diretoria/pix-status' && request.method === 'GET') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const ref = String(url.searchParams.get('ref') || '');
        let status = 'pendente';
        try { const raw = ref && env.PORTAL_KV ? await env.PORTAL_KV.get(`pedido:${ref}`) : null; if (raw) status = JSON.parse(raw).status || 'pendente'; } catch { /* segue */ }
        return json({ ok: true, status });
      }
      if (pathname === '/diretoria/teste-pagamento-ok' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const ref = String(url.searchParams.get('pedido') || '');
        let pago = false;
        try { const raw = ref && env.PORTAL_KV ? await env.PORTAL_KV.get(`pedido:${ref}`) : null; pago = raw ? JSON.parse(raw).status === 'pago' : false; } catch { /* segue */ }
        return html(paginaMensagem(pago ? '✅ Pagamento aprovado!' : '⏳ Aguardando confirmação', pago ? 'O Mercado Pago aprovou o pagamento e o webhook registrou tudo certo. O sistema de pagamentos está funcionando em produção.' : 'Se você concluiu o pagamento, a confirmação pode levar alguns segundos (o webhook do Mercado Pago). Atualize esta página em instantes.', '/diretoria'));
      }
      // Migração Ploomes — Fase 2: arquivos (anexos + documentos) → R2. Painel + lotes.
      if (pathname === '/diretoria/migrar-arquivos' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaMigrarArquivos(diretoria, await estatisticasArquivos(env)));
      }
      if (pathname === '/api/diretoria/arquivos-anexos' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await importarLoteAnexos(env, url.searchParams.get('desdeDealId'), url.searchParams.get('top')));
      }
      if (pathname === '/api/diretoria/arquivos-anexos-contatos' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await importarLoteAnexosContatos(env, url.searchParams.get('desdeContactId'), url.searchParams.get('top')));
      }
      if (pathname === '/api/diretoria/arquivos-completar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await completarAnexos(env, url.searchParams.get('offset'), url.searchParams.get('limit')));
      }
      if (pathname === '/api/diretoria/arquivos-janela' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await importarAnexosJanela(env, url.searchParams.get('desdeId'), url.searchParams.get('janela')));
      }
      if (pathname === '/api/diretoria/arquivos-reprocessar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await reprocessarFalhas(env, url.searchParams.get('limit')));
      }
      if (pathname === '/diretoria/arquivos-diag' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaDiagAnexos(diretoria, await diagnosticoAnexos(env)));
      }
      if (pathname === '/api/diretoria/arquivos-docs' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await importarLoteDocumentos(env, url.searchParams.get('desdeId'), url.searchParams.get('top')));
      }
      if (pathname === '/api/diretoria/documentos-recuperar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        return json(await recuperarDocumentos(env, url.searchParams.get('desdeId')));
      }
      // Diagnóstico do Mercado Pago (só Diretoria) — descobre POR QUE o checkout falha,
      // sem NUNCA expor a chave (mostra só presença, tipo TEST/PROD e o erro real do MP).
      if (pathname === '/diretoria/mp-diag' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        const tok = String(env.MERCADOPAGO_ACCESS_TOKEN || '');
        const tipo = !tok ? 'AUSENTE' : tok.startsWith('TEST-') ? 'TESTE (sandbox)' : tok.startsWith('APP_USR-') ? 'PRODUÇÃO' : 'formato inesperado (não começa com TEST- nem APP_USR-)';
        const base = env.PORTAL_BASE_URL || url.origin;
        let mp;
        if (!tok) { mp = { ok: false, erro: 'A variável MERCADOPAGO_ACCESS_TOKEN não existe no ambiente (confira o nome exato no Cloudflare).' }; }
        else {
          try { const pref = await criarPreferencia({ valor: 1, descricao: 'Diagnóstico MP (não é cobrança real)', externalReference: 'diag-' + novoId(), baseUrl: base, backPath: '/adote/obrigado' }, env); mp = { ok: true, temLink: !!pref.initPoint }; }
          catch (e) { mp = { ok: false, erro: String((e && e.message) || e).slice(0, 400) }; }
        }
        const email = env.RESEND_API_KEY ? 'Resend configurado ✓' : (env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY) ? 'e-Goi configurado ✓' : 'NENHUM — o e-mail de recarga não sai';
        const L = (k, v, cor) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #eef1f0;color:#556">${esc(k)}</td><td style="padding:9px 12px;border-bottom:1px solid #eef1f0;font-weight:700;color:${cor || '#10262B'}">${esc(v)}</td></tr>`;
        return html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Diagnóstico MP — Ecobraz</title></head>
<body style="font-family:Montserrat,Arial,sans-serif;max-width:660px;margin:28px auto;padding:0 16px;color:#10262B">
  <h1 style="font-size:21px;margin:0 0 4px">Diagnóstico — Mercado Pago</h1>
  <p style="color:#667;font-size:13px;margin:0 0 16px">Não mostra a chave. Só verifica se ela funciona — e, se não, o motivo exato.</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #eef1f0;border-radius:10px;overflow:hidden;font-size:14px">
    ${L('Chave no ambiente', tok ? 'presente' : 'AUSENTE', tok ? '#1E7A3D' : '#B23A2E')}
    ${L('Tipo da chave', tipo, tipo === 'PRODUÇÃO' ? '#B26A16' : (tok ? '#10262B' : '#B23A2E'))}
    ${L('Endereço base', base)}
    ${L('Gerar cobrança (teste)', mp.ok ? 'OK — cobrança gerada ✓' : 'FALHOU ✕', mp.ok ? '#1E7A3D' : '#B23A2E')}
    ${mp.ok ? '' : L('Motivo real da falha', mp.erro, '#B23A2E')}
    ${L('E-mail (para a recarga)', email, email.startsWith('NENHUM') ? '#B26A16' : '#1E7A3D')}
  </table>
  <div style="margin-top:16px;font-size:12.5px;color:#556;line-height:1.6">
    <b>Como ler:</b> se "Gerar cobrança" está OK, o checkout funciona. Se FALHOU, o "Motivo real" mostra o erro do Mercado Pago
    (ex.: <code>mp_pref_401</code> = chave inválida/errada; <code>sem_token_mp</code> = variável não encontrada; <code>mp_pref_400</code> = algo no pedido).
  </div>
  <p style="color:#9aa7a4;font-size:11px;margin-top:18px">Interno · Diretoria · página não indexada.</p>
</body></html>`);
      }
      if (pathname === '/api/diretoria/analisar' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.osId) return json({ ok: false, error: 'dados' }, 400);
        const r = await analisarColetaIA(env, b.osId);
        return json(r);
      }
      if (pathname === '/api/diretoria/precos' && request.method === 'POST') {
        if (!diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.precos) return json({ ok: false, error: 'dados' }, 400);
        await salvarTabelaPrecos(env, b.precos);
        return json({ ok: true });
      }

      // Tela inicial (hub) — a "casa" que integra os módulos. Landing do login interno.
      if (pathname === '/inicio' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        let stats = {};
        try {
          const [clientes, coletas, leads, veiculos, usuarios] = await Promise.all([listarClientes(env), listarColetasOS(env), listarLeads(env), listarVeiculos(env), listarUsuarios(env)]);
          stats = {
            clientes: clientes.length,
            coletasAbertas: coletas.filter((c) => c.status !== 'concluida' && c.status !== 'cancelada').length,
            aReceber: coletas.filter((c) => c.status === 'concluida').length,
            leadsNovos: leads.filter((l) => l.status !== 'tratado' && l.status !== 'sem_retorno' && l.status !== 'excluido').length,
            veiculos: veiculos.filter((v) => v.ativo !== false).length,
            equipe: usuarios.filter((u) => u.ativo !== false).length,
          };
        } catch { stats = {}; }
        return html(paginaInicio(escritorio, stats));
      }
      // Cadastro & Clientes (escritório/comercial — Débora). Base própria, sem Ploomes.
      if (pathname === '/cadastro' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const q = (url.searchParams.get('q') || '').trim();
        const tipo = (url.searchParams.get('tipo') || '').toUpperCase();
        const tp = (tipo === 'PJ' || tipo === 'PF') ? tipo : '';
        const pagReq = Number(url.searchParams.get('p') || 1) || 1;
        // Lê a BASE COMPLETA (D1) — 26.967 contatos migrados, não mais o índice KV limitado.
        const lista = await listarClientesD1(env, { tipo: tp, q, pag: pagReq, porPag: 50 });
        const cont = await contagensClientesD1(env);
        const totalGeral = tp === 'PJ' ? cont.pj : tp === 'PF' ? cont.pf : cont.todos;
        let bannerTarefas = ''; try { bannerTarefas = bannerTarefasAtencao(await tarefasEmAtencao(env)); } catch { bannerTarefas = ''; }
        return html(paginaCadastroHome(escritorio, lista.rows, q, lista.total, totalGeral, { tipo: tp, pag: lista.pag, totalPags: lista.totalPags, bannerTarefas }));
      }
      if (pathname === '/cadastro/manutencao' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        return html(paginaManutencao(escritorio));
      }
      if (pathname === '/api/cadastro/reindexar-emails' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await reindexarEmailsClientes(env, b && b.desde, 200));
      }
      if (pathname === '/api/cadastro/backfill-enderecos' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await backfillEnderecos(env, b && b.desde, 20));
      }
      if (pathname === '/api/cadastro/sync-d1' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await sincronizarKVparaD1(env, b && b.desde, 100));
      }
      // Marketing: carga inicial dos e-mails da base para a lista do e-Goi (lotes).
      if (pathname === '/api/cadastro/egoi-backfill' && request.method === 'POST') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await backfillEgoi(env, b && b.desde, 40));
      }
      // Monitor de falhas: as últimas falhas do sistema/da tela do cliente.
      if (pathname === '/api/monitor/falhas' && request.method === 'GET') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return json({ ok: true, falhas: await listarFalhas(env, url.searchParams.get('n')) });
      }
      // Sonda MTR (SIGOR/SINIR): SÓ LEITURA — autentica e consulta tabela de
      // domínio para provar a conexão com o órgão. Evidência vai para o D1.
      if (pathname === '/api/mtr/sonda' && request.method === 'POST') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return json(await sondaMTR(env));
      }
      // Etapa 1: CONSULTA de uma MTR por número no SIGOR (só leitura).
      if (pathname === '/api/mtr/consultar' && request.method === 'POST') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await consultarMtrSigor(env, b && b.numero));
      }
      // Vincula uma MTR (por número) a uma OS: puxa os dados oficiais do órgão,
      // baixa o PDF (best-effort) para o R2 e anexa. Confere o CNPJ do gerador.
      if (pathname === '/api/mtr/vincular' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const osId = String((b && b.osId) || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const os = await lerColetaOS(env, osId);
        if (!os) return json({ ok: false, error: 'nao_encontrada' }, 404);
        const consulta = await consultarMtrSigor(env, b && b.numero);
        if (!consulta.ok) return json({ ok: false, error: 'mtr_nao_lida', message: consulta.message }, 422);
        const resumo = consulta.resumo;
        // Confere se o gerador da MTR bate com o cliente da OS (aviso, não trava).
        const docOS = String(os.clienteDoc || '').replace(/\D/g, '');
        const docMtr = String(resumo.geradorCnpj || '').replace(/\D/g, '');
        const diverge = docOS && docMtr && docOS !== docMtr;
        // PDF oficial → R2 (best-effort). Não impede o vínculo se falhar.
        let pdf = null;
        try {
          const baixado = await baixarPdfManifesto(env, resumo.numero, consulta.sistema);
          if (baixado && baixado.bytes && env.R2_ARQUIVOS) {
            const key = `coleta-anexo/mtr/${os.id}-${String(resumo.numero).replace(/[^0-9A-Za-z]/g, '')}.pdf`;
            await env.R2_ARQUIVOS.put(key, baixado.bytes, { httpMetadata: { contentType: 'application/pdf' } });
            await registrarAnexoColeta(env, os.id, { key, nome: `MTR-${resumo.numero}.pdf`, tipo: 'MTR (PDF)', content_type: 'application/pdf', tamanho: baixado.bytes.length });
            pdf = { anexado: true };
          } else { pdf = { anexado: false, motivo: (baixado && baixado.erro) || 'sem_pdf' }; }
        } catch (error) { console.error('mtr_pdf', safeError(error)); pdf = { anexado: false, motivo: 'erro' }; }
        const recAtualizado = await definirMtrOS(env, os.id, { ...resumo, divergenciaGerador: !!diverge, pdfAnexado: !!(pdf && pdf.anexado), vinculadoEm: nowS(), vinculadoPor: escritorio.email || '' });
        // Ponte: a MTR vinculada à OS entra no registro/DMR automaticamente (best-effort).
        try { if (recAtualizado) await sincronizarMtrDaOS(env, recAtualizado); } catch (error) { console.error('mtr_ponte', safeError(error)); }
        return json({ ok: true, resumo, diverge: !!diverge, pdf });
      }
      if (pathname === '/api/mtr/desvincular' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const os = await lerColetaOS(env, String((b && b.osId) || '').replace(/[^a-zA-Z0-9_-]/g, ''));
        if (!os) return json({ ok: false, error: 'nao_encontrada' }, 404);
        await definirMtrOS(env, os.id, null);
        try { await removerMtrDaOS(env, os.id); } catch (error) { console.error('mtr_ponte_rm', safeError(error)); }
        return json({ ok: true });
      }
      // --- GESTÃO de MTR + DMR (registro próprio da Ecobraz; pedido do Marcelo) ---
      // Acesso: escritório OU engenharia ambiental (RT) — é ferramenta de conformidade.
      if (pathname === '/mtr' && request.method === 'GET') {
        if (!escOuEng) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const mtrs = await listarMtrs(env);
        return html(paginaMtrLista(escOuEng, mtrs, url.searchParams.get('aba'), url.searchParams.get('q')));
      }
      if (pathname === '/mtr/novo' && request.method === 'GET') {
        if (!escOuEng) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const editId = url.searchParams.get('id');
        const m = editId ? await lerMtr(env, editId) : { tipo: url.searchParams.get('tipo') || 'entrada' };
        if (editId && !m) return html(paginaMensagem('MTR não encontrada', 'Volte e tente de novo.'), 404);
        const [destinos, todas] = await Promise.all([listarDestinos(env), listarMtrs(env)]);
        const entradas = todas.filter((x) => x.tipo === 'entrada');
        return html(paginaMtrForm(escOuEng, m, destinos, entradas));
      }
      if (pathname === '/mtr/item' && request.method === 'GET') {
        if (!escOuEng) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const m = await lerMtr(env, url.searchParams.get('id'));
        if (!m) return html(paginaMensagem('MTR não encontrada', 'Volte e tente de novo.'), 404);
        let entradaVinc = null;
        if (m.tipo === 'saida' && m.mtrEntradaId) { const e = await lerMtr(env, m.mtrEntradaId); if (e) entradaVinc = { id: e.id, numero: e.numero, contraparte: e.gerador || '', quantidade: e.quantidade }; }
        return html(paginaMtrDetalhe(escOuEng, m, entradaVinc));
      }
      if (pathname === '/mtr/dmr' && request.method === 'GET') {
        if (!escOuEng) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const dmr = await dadosDMR(env, { periodo: url.searchParams.get('periodo'), de: url.searchParams.get('de'), ate: url.searchParams.get('ate'), gerador: url.searchParams.get('gerador'), destinador: url.searchParams.get('destinador') });
        return html(paginaDMR(escOuEng, dmr));
      }
      if (pathname === '/api/mtr-gestao/salvar' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const m = await salvarMtr(env, escOuEng, b || {});
        return json({ ok: !!m, id: m && m.id });
      }
      // Backfill: importa para o registro/DMR todas as MTRs já vinculadas às OSs.
      if (pathname === '/api/mtr-gestao/importar-os' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const r = await importarMtrsDasOSs(env);
        return json({ ok: true, importadas: r.importadas, erros: r.erros });
      }
      if (pathname === '/api/mtr-gestao/status' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const m = await mudarStatusMtr(env, b && b.id, b && b.status);
        return json({ ok: !!m });
      }
      if (pathname === '/api/mtr-gestao/remover' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const m = await lerMtr(env, b && b.id);
        if (m && m.pdfKey) { try { if (env.R2_ARQUIVOS && String(m.pdfKey).startsWith('mtr-anexo/')) await env.R2_ARQUIVOS.delete(m.pdfKey); } catch { /* segue */ } }
        await removerMtr(env, b && b.id);
        return json({ ok: true });
      }
      if (pathname === '/api/mtr-gestao/pdf' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (!env.R2_ARQUIVOS) return json({ ok: false, error: 'Depósito R2 indisponível.' }, 503);
        const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const m = await lerMtr(env, id);
        if (!m) return json({ ok: false, error: 'nao_encontrada' }, 404);
        let form; try { form = await request.formData(); } catch { form = null; }
        const file = form && form.get('arquivo');
        if (!file || typeof file === 'string') return json({ ok: false, error: 'sem_arquivo' }, 400);
        if (file.size > 15 * 1024 * 1024) return json({ ok: false, error: 'Arquivo muito grande (máx. 15 MB).' }, 400);
        const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const key = `mtr-anexo/${id}/${rand}`;
        const ct = file.type || 'application/octet-stream';
        try { await env.R2_ARQUIVOS.put(key, file.stream(), { httpMetadata: { contentType: ct } }); }
        catch (e) { return json({ ok: false, error: 'Falha ao guardar: ' + String((e && e.message) || e).slice(0, 80) }, 502); }
        await definirPdfMtr(env, id, { key, nome: String(file.name || 'MTR.pdf').slice(0, 140) });
        return json({ ok: true });
      }
      if (pathname === '/api/mtr-gestao/pdf-remover' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const m = await lerMtr(env, b && b.id);
        if (m && m.pdfKey) { try { if (env.R2_ARQUIVOS && String(m.pdfKey).startsWith('mtr-anexo/')) await env.R2_ARQUIVOS.delete(m.pdfKey); } catch { /* segue */ } }
        await definirPdfMtr(env, b && b.id, null);
        return json({ ok: true });
      }
      if (pathname === '/mtr-gestao/pdf' && request.method === 'GET') {
        if (!escOuEng) return new Response('nao_autenticado', { status: 401 });
        if (!env.R2_ARQUIVOS) return new Response('indisponível', { status: 503 });
        const key = (url.searchParams.get('key') || '').replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 120);
        if (!key.startsWith('mtr-anexo/')) return new Response('chave inválida', { status: 400 });
        const obj = await env.R2_ARQUIVOS.get(key);
        if (!obj) return new Response('não encontrado', { status: 404 });
        const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
        return new Response(obj.body, { headers: { 'content-type': ct, 'cache-control': 'private, max-age=300', 'content-disposition': 'inline' } });
      }
      // --- CRONOGRAMA / KANBAN (visão do fluxo operacional; pedido do Marcelo) ---
      if (pathname === '/cronograma' && request.method === 'GET') {
        if (!escOuEng) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const dados = await dadosCronograma(env);
        return html(paginaCronograma(escOuEng, dados));
      }
      if (pathname === '/api/cronograma/sla' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const sla = await salvarSla(env, b && b.atencao, b && b.atraso);
        return json({ ok: true, sla });
      }
      // Prova de gravação: 1 escrita de teste no KV para saber NA HORA se o
      // limite diário está bloqueando (usado após o upgrade do plano).
      if (pathname === '/api/monitor/testar-gravacao' && request.method === 'POST') {
        if (!escritorio && !diretoria) return json({ ok: false, error: 'nao_autenticado' }, 401);
        try {
          if (!env.PORTAL_KV) return json({ ok: false, error: 'sem_kv' }, 503);
          await env.PORTAL_KV.put('probe:gravacao', new Date().toISOString(), { expirationTtl: 300 });
          return json({ ok: true, message: 'Gravação funcionando — pode salvar normalmente.' });
        } catch (error) {
          const limite = /KV put\(\) limit exceeded/i.test(String(error && error.message || ''));
          return json({ ok: false, error: limite ? 'limite_diario_gravacoes' : 'falha_gravacao', message: limite ? 'Ainda bloqueado pelo limite diário do plano gratuito.' : 'Falha ao gravar: ' + String(error && error.message || '').slice(0, 80) }, 503);
        }
      }
      if (pathname === '/cadastro/novo' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const leadId = (url.searchParams.get('lead') || '').trim();
        let preLead = null, prefill = null;
        if (leadId) { preLead = await lerLead(env, leadId); if (preLead) prefill = clienteDeLead(preLead); }
        return html(paginaFormCliente(escritorio, (prefill && prefill.tipo) || url.searchParams.get('tipo') || 'PJ', prefill, preLead ? leadId : ''));
      }
      if (pathname === '/cadastro/editar' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        // Contato migrado (id 'p...'): materializa em KV para poder editar.
        const cli = await materializarClienteKV(env, url.searchParams.get('id') || '');
        if (!cli) return html(paginaMensagem('Cliente não encontrado', 'Volte e tente de novo.'), 404);
        return html(paginaFormCliente(escritorio, cli.tipo, cli));
      }
      if (pathname === '/cadastro/cliente' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const cli = await carregarClientePorId(env, url.searchParams.get('id') || '');
        if (!cli) return html(paginaMensagem('Cliente não encontrado', 'Volte e tente de novo.'), 404);
        let arquivos = []; try { arquivos = await arquivosDoCliente(env, cli); } catch { /* sem arquivos, tudo bem */ }
        let negocios = []; try { negocios = await negociosDoCliente(env, cli); } catch { /* sem histórico, tudo bem */ }
        let segmento = null; try { segmento = await segmentoDoCliente(env, cli.tipo === 'PJ' ? cli.cnpj : cli.cpf); } catch { /* segmento é opcional */ }
        let cardTarefas = '';
        try {
          const idFicha = String(url.searchParams.get('id') || '');
          cardTarefas = cardTarefasCliente(idFicha, await listarTarefasCliente(env, { clienteId: idFicha, clienteDoc: cli.tipo === 'PJ' ? cli.cnpj : cli.cpf }));
        } catch { cardTarefas = ''; }
        return html(paginaClienteDetalhe(escritorio, cli, arquivos, negocios, segmento, cardTarefas));
      }
      // Tarefas por cliente (pedido da Débora): criar na ficha; quando o dia chega,
      // a tarefa fica "em atenção" na ficha, no topo do Cadastro e nesta página.
      if (pathname === '/cadastro/tarefas' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        return html(paginaTarefas(escritorio, await listarTarefasPainel(env)));
      }
      if (pathname === '/api/cadastro/tarefa' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const b = await request.json().catch(() => ({}));
        const idCli = String(b.cliente || '').trim();
        const cli = idCli ? await carregarClientePorId(env, idCli) : null;
        if (!cli) return json({ ok: false, error: 'Cliente não encontrado — recarregue a página.' }, 404);
        const r = await criarTarefa(env, {
          clienteId: idCli,
          clienteDoc: cli.tipo === 'PJ' ? cli.cnpj : cli.cpf,
          clienteNome: cli.tipo === 'PJ' ? (cli.razaoSocial || cli.nomeFantasia || '') : (cli.nome || ''),
          titulo: b.titulo, data: b.data,
          por: escritorio.nome || escritorio.email, porEmail: escritorio.email,
        });
        return json(r, r.ok ? 200 : 400);
      }
      if (pathname === '/api/cadastro/tarefa-status' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const b = await request.json().catch(() => ({}));
        const r = await mudarStatusTarefa(env, b.id, String(b.acao || ''), escritorio.nome || escritorio.email);
        return json(r, r.ok ? 200 : 400);
      }
      if (pathname === '/api/cadastro/tarefa-excluir' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const b = await request.json().catch(() => ({}));
        const r = await excluirTarefa(env, b.id);
        return json(r, r.ok ? 200 : 400);
      }
      // Propostas & Contratos (escritório — Débora). Emissão própria, fora do Ploomes.
      if (pathname === '/propostas' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        return html(paginaPropostas(escritorio, await listarPropostas(env)));
      }
      if (pathname === '/proposta/nova' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const cliId = url.searchParams.get('cliente') || '';
        const cli = cliId ? await carregarClientePorId(env, cliId) : null;
        return html(paginaPropostaForm(escritorio, null, cli, url.searchParams.get('tipo') || ''));
      }
      if (pathname === '/proposta/editar' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const p = await lerProposta(env, url.searchParams.get('id'));
        if (!p) return html(paginaMensagem('Proposta não encontrada', 'Volte e tente de novo.'), 404);
        // Aceita não se edita — o que o cliente assinou não pode mudar depois.
        if (p.aceite) return new Response(null, { status: 302, headers: { Location: '/proposta/ver?id=' + encodeURIComponent(p.id), 'cache-control': 'no-store' } });
        return html(paginaPropostaForm(escritorio, p, null));
      }
      if (pathname === '/api/proposta/salvar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        if (b && b.id) {
          const atual = await lerProposta(env, b.id);
          if (atual && atual.aceite) return json({ ok: false, error: 'ja_aceita', message: 'Esta proposta já foi aceita pelo cliente e não pode mais ser alterada. Crie uma nova.' }, 409);
        }
        const p = await salvarProposta(env, escritorio, b || {});
        return json({ ok: !!p, id: p && p.id });
      }
      if (pathname === '/api/proposta/gerar-link' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const p = await garantirTokenAceite(env, b && b.id);
        if (!p) return json({ ok: false, message: 'Proposta não encontrada.' }, 404);
        return json({ ok: true, path: `/aceite?id=${encodeURIComponent(p.id)}&t=${encodeURIComponent(p.aceiteToken)}` });
      }
      if (pathname === '/api/proposta/enviar-aceite' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const p = await garantirTokenAceite(env, b && b.id);
        if (!p) return json({ ok: false, message: 'Proposta não encontrada.' }, 404);
        const para = (p.cliente && p.cliente.email) || '';
        if (!para) return json({ ok: false, message: 'Este cliente não tem e-mail na proposta — use o link e mande por WhatsApp.' }, 422);
        const base = String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, '');
        const link = `${base}/aceite?id=${encodeURIComponent(p.id)}&t=${encodeURIComponent(p.aceiteToken)}`;
        try { await enviarEmailAceite(p, link, env); } catch (error) { console.error('aceite_email', safeError(error)); return json({ ok: false, message: 'Não consegui enviar o e-mail agora. Copie o link e mande por WhatsApp.' }, 502); }
        return json({ ok: true, para: mascararEmail(para), path: `/aceite?id=${encodeURIComponent(p.id)}&t=${encodeURIComponent(p.aceiteToken)}` });
      }
      // Documentos da Empresa (licenças/NRs — caso SIGRA). Escritório + Engenharia (RT) + Diretoria.
      if (pathname === '/empresa/docs' && request.method === 'GET') {
        if (!escritorio && !eng && !diretoria) return html(paginaLoginEscritorio(googleConfigurado(env)));
        return html(paginaEmpresaDocs(escritorio || eng || diretoria, await lerEmpresaDocs(env)));
      }
      if (pathname === '/api/empresa-docs/salvar' && request.method === 'POST') {
        if (!escritorio && !eng && !diretoria) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await salvarEmpresaDoc(env, escritorio || eng || diretoria, b || {}));
      }
      if (pathname === '/api/empresa-docs/arquivo' && request.method === 'POST') {
        if (!escritorio && !eng && !diretoria) return json({ ok: false, message: 'nao_autenticado' }, 401);
        if (!env.R2_ARQUIVOS) return json({ ok: false, message: 'Armazenamento indisponível.' }, 503);
        let form; try { form = await request.formData(); } catch { return json({ ok: false, message: 'Envio inválido.' }, 400); }
        const file = form.get('file');
        const idDoc = String(form.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!file || typeof file === 'string' || !idDoc) return json({ ok: false, message: 'Selecione um arquivo.' }, 400);
        const nomeArq = (String(file.name || 'arquivo').replace(/[^\w .()\-]+/g, '_').slice(0, 120)) || 'arquivo';
        const tamArq = Number(file.size) || 0;
        if (tamArq > 15 * 1024 * 1024) return json({ ok: false, message: 'Arquivo muito grande (máx. 15 MB).' }, 400);
        const keyArq = (`empresa-docs/${idDoc}/${novoId()}_${nomeArq}`).replace(/[^a-zA-Z0-9/_.\-]/g, '_').slice(0, 200);
        const ctArq = file.type || 'application/octet-stream';
        try {
          await env.R2_ARQUIVOS.put(keyArq, await file.arrayBuffer(), { httpMetadata: { contentType: ctArq } });
          return json(await anexarEmpresaDoc(env, escritorio || eng || diretoria, idDoc, { key: keyArq, nome: nomeArq, ct: ctArq, tamanho: tamArq, em: agoraISO() }));
        } catch (error) { console.error('empdoc_upload', safeError(error)); return json({ ok: false, message: 'Falha ao anexar. Tente de novo.' }, 500); }
      }
      if (pathname === '/empresa/docs/arquivo' && request.method === 'GET') {
        if (!escritorio && !eng && !diretoria) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const docsEmp = await lerEmpresaDocs(env);
        const dEmp = docsEmp.find((x) => x.id === (url.searchParams.get('id') || ''));
        if (!dEmp || !dEmp.arquivo || !env.R2_ARQUIVOS) return html(paginaMensagem('Arquivo não encontrado', 'Volte e tente de novo.'), 404);
        const objEmp = await env.R2_ARQUIVOS.get(dEmp.arquivo.key);
        if (!objEmp) return html(paginaMensagem('Arquivo não encontrado', 'Volte e tente de novo.'), 404);
        return new Response(objEmp.body, { headers: { 'content-type': dEmp.arquivo.ct || 'application/octet-stream', 'content-disposition': `inline; filename="${String(dEmp.arquivo.nome || 'arquivo').replace(/"/g, '')}"`, 'cache-control': 'no-store' } });
      }
      if (pathname === '/proposta/ver' && request.method === 'GET') {
        if (!escritorio && !diretoria) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const p = await lerProposta(env, url.searchParams.get('id'));
        if (!p) return html(paginaMensagem('Proposta não encontrada', 'Volte e tente de novo.'), 404);
        // Contrato avulso não tem "visão de proposta" — vai direto ao documento.
        if (p.docTipo === 'contrato') return new Response(null, { status: 302, headers: { Location: '/contrato/ver?id=' + encodeURIComponent(p.id), 'cache-control': 'no-store' } });
        return html(paginaPropostaVer(p));
      }
      if (pathname === '/contrato/ver' && request.method === 'GET') {
        const p = await lerProposta(env, url.searchParams.get('id'));
        // O cliente que assinou também pode ver/baixar o contrato — pelo token do link de aceite.
        const tok = url.searchParams.get('t') || '';
        const clienteOk = !!(p && p.aceiteToken && tok && tok === p.aceiteToken);
        if (!escritorio && !diretoria && !clienteOk) return html(paginaLoginEscritorio(googleConfigurado(env)));
        if (!p) return html(paginaMensagem('Proposta não encontrada', 'Volte e tente de novo.'), 404);
        const base = String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, '');
        return html(paginaContratoVer(p, (escritorio || diretoria) ? 'equipe' : 'cliente', base));
      }
      // Segmento do cliente (Premium/Plus/Tradicional) — override manual da equipe.
      if (pathname === '/api/cliente/segmento' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const seg = String((b && b.segmento) || '').trim();
        if (seg && !SEGMENTOS[seg]) return json({ ok: false, error: 'segmento_invalido' }, 400);
        const ok = await definirSegmento(env, b && b.doc, seg);
        return json({ ok });
      }
      // Ficha de uma OS migrada (negócio/venda do Ploomes): dados da venda + documentos dela.
      if (pathname === '/cadastro/os-ploomes' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerNegocioDetalheD1(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('OS não encontrada', 'Volte e tente de novo.'), 404);
        return html(paginaOSDetalhe(escritorio, os));
      }
      // Serve um arquivo migrado do Ploomes (R2) para a equipe do escritório.
      // Valida a chave contra o banco (só serve o que está catalogado).
      if (pathname === '/cadastro/arquivo' && request.method === 'GET') {
        if (!escritorio) return new Response('nao_autenticado', { status: 401 });
        if (!env.R2_ARQUIVOS || !env.DB_PLOOMES) return new Response('indisponível', { status: 503 });
        const key = (url.searchParams.get('key') || '').replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 200);
        if (!key) return new Response('faltou a chave', { status: 400 });
        let existe = null; try { existe = await env.DB_PLOOMES.prepare('SELECT content_type, nome_arquivo FROM arquivos_ploomes WHERE r2_key=?1 LIMIT 1').bind(key).first(); } catch { /* ok */ }
        if (!existe) return new Response('arquivo não catalogado', { status: 404 });
        const obj = await env.R2_ARQUIVOS.get(key);
        if (!obj) return new Response('arquivo não encontrado no depósito', { status: 404 });
        const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || existe.content_type || 'application/octet-stream';
        const nome = String(url.searchParams.get('nome') || existe.nome_arquivo || 'arquivo').replace(/[^a-zA-Z0-9._ ()\-]/g, '').slice(0, 120) || 'arquivo';
        const dispor = url.searchParams.get('dl') === '1' ? 'attachment' : 'inline';
        return new Response(obj.body, { headers: { 'content-type': ct, 'cache-control': 'private, max-age=300', 'content-disposition': `${dispor}; filename="${nome}"` } });
      }
      if (pathname === '/api/cadastro/salvar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || (b.tipo !== 'PJ' && b.tipo !== 'PF')) return json({ ok: false, error: 'dados' }, 400);
        if (b.tipo === 'PJ' && !String(b.razaoSocial || '').trim()) return json({ ok: false, error: 'Informe a razão social.' }, 400);
        if (b.tipo === 'PF' && !String(b.nome || '').trim()) return json({ ok: false, error: 'Informe o nome.' }, 400);
        // Lista de contatos salva VAZIA de propósito? Marca a intenção — a cura
        // automática (curarContatosKV) respeita e não repõe os contatos migrados.
        if (Array.isArray(b.contatos)) b.semContatosIntencional = b.contatos.length === 0;
        let existente = null; if (b.id) existente = await lerCliente(env, b.id);
        const leadOrigem = String(b.leadOrigem || '').trim(); if ('leadOrigem' in b) delete b.leadOrigem;
        const salvo = await salvarCliente(env, existente ? { ...existente, ...b } : b);
        // Veio de um lead do site? Marca o lead como tratado e guarda o vínculo (best-effort).
        if (leadOrigem) { try { const l = await lerLead(env, leadOrigem); if (l && l.status !== 'tratado') { l.status = 'tratado'; l.clienteId = salvo.id; await salvarLead(env, l); } } catch { /* não bloqueia o cadastro */ } }
        return json({ ok: true, id: salvo.id });
      }
      // Anexar um novo documento a um cliente (upload → R2 + catálogo D1, casado pelo CNPJ/CPF).
      if (pathname === '/api/cadastro/anexo' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, erro: 'nao_autenticado' }, 401);
        if (!env.R2_ARQUIVOS || !env.DB_PLOOMES) return json({ ok: false, erro: 'Armazenamento indisponível.' }, 503);
        let form; try { form = await request.formData(); } catch { return json({ ok: false, erro: 'Envio inválido.' }, 400); }
        const file = form.get('file');
        if (!file || typeof file === 'string') return json({ ok: false, erro: 'Selecione um arquivo.' }, 400);
        const cli = await carregarClientePorId(env, String(form.get('cliente') || '').trim());
        if (!cli) return json({ ok: false, erro: 'Cliente não encontrado.' }, 404);
        const doc = String(cli.tipo === 'PJ' ? cli.cnpj : cli.cpf || '').replace(/\D/g, '');
        if (doc.length < 11) return json({ ok: false, erro: 'Cadastre o CNPJ/CPF do cliente antes de anexar.' }, 400);
        const nome = (String(file.name || 'arquivo').replace(/[^\w .()\-]+/g, '_').slice(0, 120)) || 'arquivo';
        const tam = Number(file.size) || 0;
        if (tam > 15 * 1024 * 1024) return json({ ok: false, erro: 'Arquivo muito grande (máx. 15 MB).' }, 400);
        let pid = Number(cli.ploomesId) || 0;
        try { if (!pid) pid = await espelharClienteD1(env, cli); } catch { /* segue mesmo sem pid */ }
        const key = (`upload/${doc}/${novoId()}_${nome}`).replace(/[^a-zA-Z0-9/_.\-]/g, '_').slice(0, 200);
        const ct = file.type || 'application/octet-stream';
        try {
          const buf = await file.arrayBuffer();
          await env.R2_ARQUIVOS.put(key, buf, { httpMetadata: { contentType: ct } });
          await env.DB_PLOOMES.prepare('INSERT INTO arquivos_ploomes (r2_key,fonte,ploomes_id,deal_id,contact_id,nome_arquivo,content_type,tamanho,criado_em,importado_em) VALUES (?1,?2,?3,NULL,?4,?5,?6,?7,?8,?8)')
            .bind(key, 'upload', pid || null, pid || null, nome, ct, tam, nowS()).run();
          return json({ ok: true, nome });
        } catch (error) { console.error('anexo_upload_falhou', safeError(error)); return json({ ok: false, erro: 'Falha ao anexar. Tente de novo.' }, 500); }
      }
      if (pathname === '/api/cadastro/cnpj' && request.method === 'GET') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const d = await consultarCNPJ(url.searchParams.get('n') || '');
        return d ? json({ ok: true, ...d }) : json({ ok: false });
      }
      // Caixa de entrada de leads do site (escritório/comercial — Débora).
      if (pathname === '/leads' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        return html(paginaLeads(escritorio, await listarLeads(env)));
      }
      if (pathname === '/leads/lead' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const l = await lerLead(env, url.searchParams.get('id') || '');
        if (!l) return html(paginaMensagem('Lead não encontrado', 'Volte e tente de novo.'), 404);
        return html(paginaLeadDetalhe(escritorio, l));
      }
      if (pathname === '/api/leads/tratar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        const l = await lerLead(env, b.id);
        if (!l) return json({ ok: false, error: 'nao_encontrado' }, 404);
        l.status = 'tratado'; await salvarLead(env, l);
        return json({ ok: true });
      }
      // "Sem retorno": cliente mandou o formulário e não respondeu ao contato. Fica
      // registrado (não some), para separar quem engajou de quem sumiu.
      if (pathname === '/api/leads/sem-retorno' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        const l = await lerLead(env, b.id);
        if (!l) return json({ ok: false, error: 'nao_encontrado' }, 404);
        l.status = 'sem_retorno'; await salvarLead(env, l);
        return json({ ok: true });
      }
      // Excluir de vez (testes/duplicados) — some do registro e do índice. Irreversível.
      if (pathname === '/api/leads/excluir' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        const ok = await excluirLead(env, b.id);
        return json({ ok: !!ok });
      }

      // Ordens de Coleta (escritório/comercial) — geração própria a partir do cliente.
      if (pathname === '/coletas' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const q = (url.searchParams.get('q') || '').trim();
        const ql = q.toLowerCase();
        const cliId = (url.searchParams.get('cliente') || '').trim();
        let coletas = await listarColetasOS(env);
        let cliCtx = null, negociosCli = [];
        if (cliId) {
          const cli = await carregarClientePorId(env, cliId);
          const nome = cli ? (cli.tipo === 'PJ' ? (cli.razaoSocial || cli.nomeFantasia || '') : (cli.nome || '')) : '';
          coletas = coletas.filter((c) => c.clienteId === cliId || (nome && c.clienteNome === nome));
          cliCtx = { id: cliId, nome: nome || 'cliente' };
          try { negociosCli = await negociosDoCliente(env, cli); } catch { /* sem histórico, tudo bem */ }
        } else if (ql) coletas = coletas.filter((c) => `${c.numero || ''} ${c.clienteNome || ''}`.toLowerCase().includes(ql)); // busca cobre canceladas
        // sem busca: passa todas; a página separa por abas (Agendadas / Concluídas / Canceladas)
        const aba = (url.searchParams.get('aba') || '').trim();
        return html(paginaColetasLista(escritorio, coletas, q, cliCtx, negociosCli, aba));
      }
      if (pathname === '/coletas/nova' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        // Contato migrado (id 'p...'): materializa em KV para poder gerar a coleta.
        const cli = await materializarClienteKV(env, url.searchParams.get('cliente') || '');
        if (!cli) return html(paginaMensagem('Cliente não encontrado', 'Volte e tente de novo.'), 404);
        const agentes = [...agentesDe(env).entries()].map(([email, nome]) => ({ email, nome }));
        let patrocinadores = []; try { patrocinadores = await listarPatrocinadores(env); } catch { /* ok */ }
        let veiculos = []; try { veiculos = await listarVeiculos(env); } catch { /* ok */ }
        return html(paginaGerarColeta(escritorio, cli, agentes, patrocinadores, veiculos));
      }
      // Foto da carga registrada pelo motorista — visível para a EQUIPE (comercial/doca/
      // diretoria/motorista) ou via TOKEN (para o documento do cliente). Reaproveita o
      // servidor de foto do agente, mas com autorização mais ampla.
      if (pathname === '/coletas/foto-motorista' && request.method === 'GET') {
        const fid = String(url.searchParams.get('id') || '');
        const ftok = String(url.searchParams.get('t') || '');
        let ok = !!(escritorio || diretoria || agente || operacao);
        if (!ok && fid && ftok) { try { ok = ftok === await seloOS(fid.replace(/[^a-zA-Z0-9_-]/g, ''), env); } catch { ok = false; } }
        if (!ok) return json({ ok: false, error: 'nao_autorizado' }, 403);
        return await servirFotoColeta(env, fid);
      }
      if (pathname === '/coletas/assinatura-motorista' && request.method === 'GET') {
        const fid = String(url.searchParams.get('id') || '');
        const ftok = String(url.searchParams.get('t') || '');
        let ok = !!(escritorio || diretoria || agente || operacao);
        if (!ok && fid && ftok) { try { ok = ftok === await seloOS(fid.replace(/[^a-zA-Z0-9_-]/g, ''), env); } catch { ok = false; } }
        if (!ok) return json({ ok: false, error: 'nao_autorizado' }, 403);
        return await servirAssinaturaColeta(env, fid);
      }
      // Página PÚBLICA de acompanhamento (link do WhatsApp): token = selo HMAC da OS.
      if (pathname === '/acompanhar' && request.method === 'GET') {
        const cid = String(url.searchParams.get('c') || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const tok = String(url.searchParams.get('t') || '');
        const osA = cid ? await lerColetaOS(env, cid) : null;
        if (!osA) return html(paginaAcompanharErro('Coleta não encontrada'), 404);
        if (!tok || tok !== await seloOS(cid, env)) return html(paginaAcompanharErro('Link inválido'), 403);
        const concluida = osA.status === 'concluida' || osA.status === 'cancelada';
        let estadoA = {}; try { estadoA = await lerEstadoColeta(env, cid); } catch { estadoA = {}; }
        const chegou = !!(estadoA && estadoA.checkin);
        let pos = null;
        if (!concluida && osA.veiculoPlaca) {
          try {
            const ck = `rastreio:poswa:${String(osA.veiculoPlaca).replace(/[^A-Za-z0-9]/g, '')}`;
            const cache = env.PORTAL_KV ? await env.PORTAL_KV.get(ck) : null;
            if (cache) pos = JSON.parse(cache);
            else { const p = await posicaoDoVeiculo(env, osA.veiculoPlaca); if (p && p.ok && p.lat != null && p.lng != null) { pos = { lat: p.lat, lng: p.lng, em: p.atualizadoEm || null }; if (env.PORTAL_KV) await env.PORTAL_KV.put(ck, JSON.stringify(pos), { expirationTtl: 30 }); } }
          } catch { pos = null; }
        }
        let km = null;
        if (pos && !chegou) {
          try {
            const dest = await coordDoEndereco(env, osA.endereco);
            if (dest) { const rad = Math.PI / 180, la1 = Number(pos.lat) * rad, la2 = dest.lat * rad, dLa = (dest.lat - Number(pos.lat)) * rad, dLo = (dest.lon - Number(pos.lng)) * rad; const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2; const kmv = 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); if (isFinite(kmv)) km = kmv; }
          } catch { km = null; }
        }
        const statusA = concluida ? 'concluida' : (chegou ? 'chegou' : (pos ? 'a_caminho' : 'sem_posicao'));
        return html(paginaAcompanhar({ numero: osA.numero, cliente: osA.clienteNome, status: statusA, pos, km, atualizadoEm: pos && pos.em }));
      }
      if (pathname === '/coletas/os' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        // Acompanhamento (best-effort): cliente avisado? distância do rastreador ao destino?
        let acomp = {};
        try {
          const est = await lerEstadoColeta(env, os.id);
          const parseAviso = (v) => { if (!v) return null; try { const o = JSON.parse(v); return (o && typeof o === 'object') ? o : { via: '' }; } catch { return { via: '' }; } };
          acomp = {
            saiu: !!(est && est.acaminho), saiuEm: est && est.acaminho && est.acaminho.em,
            chegou: !!(est && est.checkin), chegouEm: est && est.checkin && est.checkin.em,
            avisoACaminho: parseAviso(env.PORTAL_KV ? await env.PORTAL_KV.get(`notif:coleta:${os.id}:a_caminho`) : null),
            avisoChegou: parseAviso(env.PORTAL_KV ? await env.PORTAL_KV.get(`notif:coleta:${os.id}:chegou`) : null),
          };
          acomp.registro = { checkin: est && est.checkin, foto: est && est.foto, encerramento: est && est.encerramento, assinatura: est && est.assinatura };
          const tel = Array.isArray(os.telemetria) ? os.telemetria : [];
          const ult = tel.length ? tel[tel.length - 1] : null;
          if (ult && ult.lat != null && ult.lng != null && !acomp.chegou) {
            const dest = await coordDoEndereco(env, os.endereco);
            if (dest) {
              const rad = Math.PI / 180, la1 = Number(ult.lat) * rad, la2 = dest.lat * rad, dLa = (dest.lat - Number(ult.lat)) * rad, dLo = (dest.lon - Number(ult.lng)) * rad;
              const x = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
              const km = 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
              if (isFinite(km)) { acomp.km = km; acomp.kmEm = ult.em; }
            }
          }
        } catch { /* acompanhamento é best-effort */ }
        return html(paginaColetaOSDetalhe(escritorio, os, acomp));
      }
      if (pathname === '/coletas/editar' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        let contatos = [];
        try { const cli = os.clienteId ? await curarContatosKV(env, await lerCliente(env, os.clienteId)) : null; if (cli) contatos = cli.tipo === 'PJ' ? (cli.contatos || []) : [{ nome: cli.nome, fone: cli.fone, email: cli.email }]; } catch { /* sem contatos do cliente, tudo bem */ }
        const agentes = [...agentesDe(env).entries()].map(([email, nome]) => ({ email, nome }));
        let veiculos = []; try { veiculos = await listarVeiculos(env); } catch { /* ok */ }
        return html(paginaEditarColeta(escritorio, os, contatos, agentes, veiculos));
      }
      if (pathname === '/api/coletas/editar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        const r = await atualizarColetaOS(env, b.id, b);
        if (!r) return json({ ok: false, error: 'nao_encontrada' }, 404);
        return json({ ok: true, id: r.id });
      }
      // OS PAGA: gera a cobrança da coleta (Mercado Pago — Pix, cartão e boleto).
      // O link fica anexado à OS e o cliente vê o botão "Pagar" no portal dele.
      if (pathname === '/api/coletas/cobranca' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        const id = String((b && b.id) || '').replace(/[^a-zA-Z0-9_-]/g, '');
        // Valor em reais, aceitando formato BR ("1.234,56") e ponto decimal.
        const valor = Math.round((Number(String((b && b.valor) || '').replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0) * 100) / 100;
        if (!id || !Number.isFinite(valor) || valor < 1 || valor > 100000) return json({ ok: false, error: 'valor_invalido' }, 400);
        const os = await lerColetaOS(env, id);
        if (!os) return json({ ok: false, error: 'nao_encontrada' }, 404);
        if (os.cobranca && os.cobranca.status === 'pago') return json({ ok: false, error: 'ja_paga' }, 409);
        const descricao = String((b && b.descricao) || '').slice(0, 200) || `Coleta ${os.numero || ''} — Ecobraz`.trim();
        const ref = `oscobranca-${id}`;
        try {
          const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
          let clienteEmail = '';
          try { const cli = os.clienteId ? await lerCliente(env, os.clienteId) : null; clienteEmail = (cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email))) || ''; } catch { /* segue sem e-mail */ }
          // O cadastro pode ter mais de um e-mail no campo — usa só o 1º válido (a Stripe e o Resend recusam lista).
          clienteEmail = String(clienteEmail).split(/[,;\s]+/).map((s) => s.trim()).find((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) || '';
          const s = await criarCheckoutStripe({ valor, descricao, externalReference: ref, baseUrl: base, backPath: '/pagamento/ok', clienteEmail, metodos: ['card', 'boleto'] }, env);
          if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'oscobranca', osId: id, numero: os.numero || '', valor, clienteEmail, clienteNome: os.clienteNome || '', status: 'pendente', gateway: 'stripe', criadoEm: nowS() }), { expirationTtl: 90 * 86400 });
          await definirCobrancaOS(env, id, { valor, descricao, ref, link: s.url, criadoPor: escritorio.email || '' });
          return json({ ok: true, link: s.url, valor });
        } catch (error) {
          console.error('oscobranca_mp', safeError(error));
          await registrarFalha(env, 'cobranca-os', safeError(error), { os: id });
          return json({ ok: false, error: 'mp_indisponivel' }, 502);
        }
      }
      if (pathname === '/api/coletas/cobranca-remover' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        const id = String((b && b.id) || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const os = await lerColetaOS(env, id);
        if (!os) return json({ ok: false, error: 'nao_encontrada' }, 404);
        if (os.cobranca && os.cobranca.status === 'pago') return json({ ok: false, error: 'ja_paga' }, 409);
        if (env.PORTAL_KV && os.cobranca && os.cobranca.ref) { try { await env.PORTAL_KV.delete(`pedido:${os.cobranca.ref}`); } catch { /* segue */ } }
        await definirCobrancaOS(env, id, null);
        return json({ ok: true });
      }
      // Anexar foto/arquivo a uma coleta (upload para o R2 + registro em os.anexos).
      if (pathname === '/api/coletas/anexo' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (!env.R2_ARQUIVOS) return json({ ok: false, error: 'Depósito R2 indisponível.' }, 503);
        const id = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
        const os = await lerColetaOS(env, id);
        if (!os) return json({ ok: false, error: 'nao_encontrada' }, 404);
        let form; try { form = await request.formData(); } catch { form = null; }
        const file = form && form.get('arquivo');
        if (!file || typeof file === 'string') return json({ ok: false, error: 'sem_arquivo' }, 400);
        if (file.size > 15 * 1024 * 1024) return json({ ok: false, error: 'Arquivo muito grande (máx. 15 MB).' }, 400);
        const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const key = `coleta-anexo/${id}/${rand}`;
        const ct = file.type || 'application/octet-stream';
        const tipoAnexo = (url.searchParams.get('tipo') || '').slice(0, 60);
        try { await env.R2_ARQUIVOS.put(key, file.stream(), { httpMetadata: { contentType: ct } }); }
        catch (e) { return json({ ok: false, error: 'Falha ao guardar: ' + String((e && e.message) || e).slice(0, 80) }, 502); }
        const meta = { key, nome: String(file.name || 'arquivo').slice(0, 140), tipo: tipoAnexo, content_type: ct, tamanho: file.size || 0 };
        await registrarAnexoColeta(env, id, meta);
        return json({ ok: true, anexo: meta });
      }
      if (pathname === '/api/coletas/anexo-remover' && request.method === 'POST') {
        if (!escOuEng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || !b.key) return json({ ok: false, error: 'dados' }, 400);
        try { if (env.R2_ARQUIVOS && String(b.key).startsWith('coleta-anexo/')) await env.R2_ARQUIVOS.delete(String(b.key)); } catch { /* segue */ }
        await removerAnexoColeta(env, b.id, b.key);
        return json({ ok: true });
      }
      // Serve um anexo de coleta do R2 (gated por escritório; só chaves coleta-anexo/).
      if (pathname === '/coletas/anexo' && request.method === 'GET') {
        if (!escOuEng) return new Response('nao_autenticado', { status: 401 });
        if (!env.R2_ARQUIVOS) return new Response('indisponível', { status: 503 });
        const key = (url.searchParams.get('key') || '').replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 120);
        if (!key.startsWith('coleta-anexo/')) return new Response('chave inválida', { status: 400 });
        const obj = await env.R2_ARQUIVOS.get(key);
        if (!obj) return new Response('não encontrado', { status: 404 });
        const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
        return new Response(obj.body, { headers: { 'content-type': ct, 'cache-control': 'private, max-age=300', 'content-disposition': 'inline' } });
      }
      if (pathname === '/coletas/os/comprovante' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        return html(paginaComprovanteOS(os, `/qr-os?id=${encodeURIComponent(os.id)}`));
      }
      if (pathname === '/coletas/os/carta' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        if (!os.veiculoPlaca) { try { os.veiculoPlaca = await placaDaColeta(env, os); } catch { /* ok */ } }
        let regC = null, fotoC = '', assC = ''; try { const e = await lerEstadoColeta(env, os.id); regC = { checkin: e && e.checkin, foto: e && e.foto, encerramento: e && e.encerramento, assinatura: e && e.assinatura }; const selo = await seloOS(os.id, env); fotoC = `/coletas/foto-motorista?id=${encodeURIComponent(os.id)}&t=${selo}`; assC = `/coletas/assinatura-motorista?id=${encodeURIComponent(os.id)}&t=${selo}`; } catch { regC = null; }
        return html(paginaCartaDescarte(os, `/qr-os?id=${encodeURIComponent(os.id)}`, regC, fotoC, assC));
      }
      if (pathname === '/coletas/os/manifesto' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        if (!os.veiculoPlaca) { try { os.veiculoPlaca = await placaDaColeta(env, os); } catch { /* ok */ } }
        return html(paginaManifestoCarga(os, `/qr-os?id=${encodeURIComponent(os.id)}`));
      }
      if (pathname === '/coletas/os/cdf' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const osId = url.searchParams.get('id') || '';
        const op = await lerOperacao(env, osId);
        if (!op) return html(paginaMensagem('CDF ainda indisponível', 'O Certificado de Destinação Final é gerado depois que a coleta é recebida e processada na doca. Assim que a operação existir, ele fica disponível aqui.'), 404);
        const val = await lerValidacaoOp(env, op.osId);
        return html(paginaCDF(op, val, await listarDestinos(env), `/qr-operacao?id=${encodeURIComponent(op.osId)}`));
      }
      if (pathname === '/api/coletas/criar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !String(b.endereco || '').trim()) return json({ ok: false, error: 'Informe o endereço da coleta.' }, 400);
        const os = await criarColetaOS(env, b, escritorio.email);
        // Avisa o cliente que a coleta foi agendada (best-effort: nunca bloqueia a criação).
        try {
          const cli = os.clienteId ? await lerCliente(env, os.clienteId) : null;
          const emailCli = cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email) || '');
          if (emailCli && env.RESEND_API_KEY) await enviarEmailStatus(emailCli, os.clienteNome, 'coleta_agendada', env);
        } catch (error) { console.error('coleta_agendada_email_falhou', safeError(error)); }
        return json({ ok: true, id: os.id, numero: os.numero });
      }
      if (pathname === '/api/coletas/status' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || !b.status) return json({ ok: false, error: 'dados' }, 400);
        const os = await atualizarStatusOS(env, b.id, b.status);
        // Aviso "coleta realizada" ao cliente na conclusão — do SISTEMA NOVO (sem Ploomes).
        // Best-effort, de-dup por KV, nunca bloqueia a mudança de status.
        try {
          if (os && b.status === 'concluida') {
            const chave = `notif:coleta:${os.id}:coleta_realizada`;
            const jaAvisou = env.PORTAL_KV ? await env.PORTAL_KV.get(chave) : null;
            if (!jaAvisou) {
              const cli = os.clienteId ? await lerCliente(env, os.clienteId) : null;
              const emailCli = cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email) || '');
              if (emailCli && env.RESEND_API_KEY) { await enviarEmailStatus(emailCli, os.clienteNome, 'coleta_realizada', env); if (env.PORTAL_KV) await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 }); }
            }
          }
        } catch (error) { console.error('coleta_status_email_falhou', safeError(error)); }
        return json({ ok: true });
      }

      // Fiscal & Notas (contadora): importação de NF-e e amarração à coleta.
      if (pathname === '/fiscal' && request.method === 'GET') {
        if (!fiscal) return html(paginaFiscalLogin(googleConfigurado(env)));
        return html(paginaFiscalHome(fiscal, await listarNotas(env)));
      }
      if (pathname === '/fiscal/nota' && request.method === 'GET') {
        if (!fiscal) return html(paginaFiscalLogin(googleConfigurado(env)));
        const nota = await lerNota(env, url.searchParams.get('chave') || '');
        if (!nota) return html(paginaMensagem('Nota não encontrada', 'Volte e tente de novo.'), 404);
        const [clientes, coletas] = await Promise.all([listarClientes(env), listarColetasOS(env)]);
        const sug = sugerirVinculoSync({ destDoc: nota.dest && nota.dest.doc }, clientes, coletas);
        return html(paginaFiscalNota(fiscal, nota, sug, clientes));
      }
      if (pathname === '/api/fiscal/importar' && request.method === 'POST') {
        if (!fiscal) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        if (!form) return html(paginaMensagem('Envio inválido', 'Volte e tente de novo.'), 400);
        const arquivos = [];
        for (const f of form.getAll('xmls')) { if (f && typeof f.arrayBuffer === 'function') arquivos.push({ name: f.name || '', bytes: new Uint8Array(await f.arrayBuffer()) }); }
        let csvTexto = '';
        const csv = form.get('csv');
        if (csv && typeof csv.arrayBuffer === 'function' && csv.size) { try { csvTexto = new TextDecoder('latin1').decode(await csv.arrayBuffer()); } catch { csvTexto = ''; } }
        if (!arquivos.length) return html(paginaMensagem('Nenhum XML enviado', 'Selecione o .zip do IOB ou os arquivos .xml.'), 400);
        const r = await importarLote(env, arquivos, csvTexto, fiscal.email);
        return html(paginaFiscalResultado(fiscal, r));
      }
      if (pathname === '/api/fiscal/vincular' && request.method === 'POST') {
        if (!fiscal) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.chave) return json({ ok: false, error: 'dados' }, 400);
        const r = await vincularNota(env, b.chave, b, fiscal.email);
        if (r.erro) return json({ ok: false, error: r.erro }, 400);
        return json({ ok: true });
      }
      if (pathname === '/api/fiscal/coletas' && request.method === 'GET') {
        if (!fiscal) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const cid = url.searchParams.get('clienteId') || '';
        const [clientes, coletas] = await Promise.all([listarClientes(env), listarColetasOS(env)]);
        const cliente = clientes.find((c) => c.id === cid);
        if (!cliente) return json({ coletas: [] });
        const sug = sugerirVinculoSync({ destDoc: cliente.doc }, clientes, coletas);
        const br = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
        return json({ coletas: (sug.coletas || []).map((o) => ({ id: o.id, numero: o.numero, dataAgendada: br(o.dataAgendada) })) });
      }

      // Frota (escritório): cadastro de veículos.
      if (pathname === '/frota' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        return html(paginaFrota(escritorio, await listarVeiculos(env)));
      }
      if (pathname === '/frota/novo' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        return html(paginaVeiculoForm(escritorio, null));
      }
      if (pathname === '/frota/veiculo' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        const v = await lerVeiculo(env, url.searchParams.get('id') || '');
        if (!v) return html(paginaMensagem('Veículo não encontrado', 'Volte e tente de novo.'), 404);
        return html(paginaVeiculoForm(escritorio, v));
      }
      if (pathname === '/api/frota/salvar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b) return json({ ok: false, error: 'dados' }, 400);
        const r = await salvarVeiculo(env, b, escritorio.email);
        if (r.erro) return json({ ok: false, error: r.erro }, 400);
        return json({ ok: true, id: r.id });
      }

      // Equipe & Acessos (escritório): cadastro de usuários e papéis.
      if (pathname === '/equipe' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        return html(paginaEquipe(escritorio, await listarUsuarios(env)));
      }
      if (pathname === '/equipe/novo' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        return html(paginaUsuarioForm(escritorio, null));
      }
      if (pathname === '/equipe/usuario' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        const u = await lerUsuario(env, url.searchParams.get('email') || '');
        if (!u) return html(paginaMensagem('Pessoa não encontrada', 'Volte e tente de novo.'), 404);
        return html(paginaUsuarioForm(escritorio, u));
      }
      if (pathname === '/equipe/importar' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/inicio', 'cache-control': 'no-store' } });
        return html(paginaEquipeImportar(escritorio));
      }
      if (pathname === '/api/equipe/importar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.texto) return json({ ok: false, error: 'cole a lista' }, 400);
        const r = await importarUsuarios(env, b.texto, escritorio.email);
        return json({ ok: true, criados: r.criados, erros: r.erros });
      }
      if (pathname === '/api/equipe/salvar' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b) return json({ ok: false, error: 'dados' }, 400);
        const r = await salvarUsuario(env, b, escritorio.email);
        if (r.erro) return json({ ok: false, error: r.erro }, 400);
        return json({ ok: true, email: r.email });
      }

      // App do agente de coletas.
      if (pathname === '/agente' && request.method === 'GET') {
        if (!agente) return html(paginaLoginAgente(googleConfigurado(env)));
        // Abrir o dia é OBRIGATÓRIO: sem jornada aberta, mostra o checklist do veículo.
        const jornada = await lerJornadaAtiva(env, agente.email);
        if (!jornada) return html(paginaAbrirDia(agente, await listarVeiculos(env), ''));
        const coletasAgente = await enriquecerProximidade(env, await listarColetasComStatus(env, agente.email));
        return html(paginaAppAgente(agente, coletasAgente, bannerJornada(jornada)));
      }
      if (pathname === '/agente/dia/fechar' && request.method === 'GET') {
        if (!agente) return new Response(null, { status: 302, headers: { Location: '/agente', 'cache-control': 'no-store' } });
        const jornada = await lerJornadaAtiva(env, agente.email);
        if (!jornada) return new Response(null, { status: 302, headers: { Location: '/agente', 'cache-control': 'no-store' } });
        return html(paginaFecharDia(agente, jornada));
      }
      if (pathname === '/agente/dia/abastecer' && request.method === 'GET') {
        if (!agente) return new Response(null, { status: 302, headers: { Location: '/agente', 'cache-control': 'no-store' } });
        const jornada = await lerJornadaAtiva(env, agente.email);
        if (!jornada) return new Response(null, { status: 302, headers: { Location: '/agente', 'cache-control': 'no-store' } });
        return html(paginaAbastecer(agente, jornada));
      }
      if (pathname === '/agente/jornada/foto' && request.method === 'GET') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await servirFotoJornada(env, url.searchParams.get('id') || '', url.searchParams.get('m') || '', url.searchParams.get('lado') || '');
      }
      if (pathname === '/api/agente/jornada/abrir' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b) return json({ ok: false, error: 'dados' }, 400);
        const r = await abrirJornada(env, agente, b);
        if (r.erro) return json({ ok: false, error: r.erro }, 400);
        return json({ ok: true, id: r.jornada.id, alertas: r.alertas || [] });
      }
      if (pathname === '/api/agente/jornada/fechar' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b) return json({ ok: false, error: 'dados' }, 400);
        const r = await fecharJornada(env, agente, b);
        if (r.erro) return json({ ok: false, error: r.erro }, 400);
        return json({ ok: true, km: r.jornada.kmRodado, alertas: r.alertas || [] });
      }
      if (pathname === '/api/agente/jornada/abastecer' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b) return json({ ok: false, error: 'dados' }, 400);
        const r = await registrarAbastecimento(env, agente, b);
        if (r.erro) return json({ ok: false, error: r.erro }, 400);
        return json({ ok: true });
      }
      if (pathname === '/agente/coleta' && request.method === 'GET') {
        if (!agente) return new Response(null, { status: 302, headers: { Location: '/agente', 'cache-control': 'no-store' } });
        const cid = url.searchParams.get('id') || '';
        const coleta = await detalheColeta(env, cid);
        if (!coleta) return html(paginaMensagem('Coleta não encontrada', 'Volte para a lista e tente de novo.'), 404);
        return html(paginaColetaDetalhe(agente, coleta, await lerEstadoColeta(env, cid)));
      }
      if (pathname === '/agente/coleta/comprovante' && request.method === 'GET') {
        if (!agente) return new Response(null, { status: 302, headers: { Location: '/agente', 'cache-control': 'no-store' } });
        const cid = url.searchParams.get('id') || '';
        const estado = await lerEstadoColeta(env, cid);
        let coleta = null; try { coleta = await detalheColeta(env, cid); } catch { coleta = null; }
        if (!coleta) coleta = { id: cid, numero: (estado.os && estado.os.numero) || '', cliente: (estado.os && estado.os.cliente) || '', endereco: (estado.os && estado.os.endereco) || '' };
        return html(paginaComprovante(agente, coleta, estado, `/qr-coleta?id=${encodeURIComponent(cid)}`));
      }
      if (pathname === '/agente/coleta/foto' && request.method === 'GET') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await servirFotoColeta(env, url.searchParams.get('id') || '');
      }
      if (pathname === '/agente/coleta/assinatura' && request.method === 'GET') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await servirAssinaturaColeta(env, url.searchParams.get('id') || '');
      }
      // "Estou indo": marca em transporte, registra telemetria e avisa o cliente por
      // e-mail (1x por coleta) que ele pode acompanhar o caminhão ao vivo pelo portal.
      if (pathname === '/api/agente/acaminho' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        await registrarACaminho(env, b.id, agente);
        try { await tagColetaComVeiculo(env, agente.email, b.id); } catch { /* jornada opcional */ }
        try { const c0 = await lerColetaOS(env, b.id); if (c0 && c0.veiculoPlaca) { const t = await capturarTelemetria(env, c0.veiculoPlaca, 'a_caminho'); if (t) await anexarTelemetriaOS(env, b.id, t); } } catch { /* telemetria é best-effort */ }
        try {
          const col = await lerColetaOS(env, b.id);
          if (col) {
            const chave = `notif:coleta:${col.id}:a_caminho`;
            const ja = env.PORTAL_KV ? await env.PORTAL_KV.get(chave) : null;
            if (!ja) {
              const cli = col.clienteId ? await lerCliente(env, col.clienteId) : null;
              const emailCli = (cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email))) || '';
              const foneCli = (cli && (cli.fone || cli.telefone || cli.celular || (Array.isArray(cli.contatos) && cli.contatos[0] && (cli.contatos[0].fone || cli.contatos[0].telefone)))) || col.clienteFone || col.telefone || '';
              if (emailCli || foneCli) {
                const baseWA = String(env.PORTAL_BASE_URL || env.PORTAL_URL || url.origin).replace(/\/+$/, '');
                const linkRota = `${baseWA}/acompanhar?c=${encodeURIComponent(col.id)}&t=${await seloOS(col.id, env)}`;
                const av = await avisarColeta(env, { email: emailCli, telefone: foneCli, nome: col.clienteNome, linkRota }, 'a_caminho');
                if (av.via !== 'nenhum' && env.PORTAL_KV) await env.PORTAL_KV.put(chave, JSON.stringify({ via: av.via, em: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
              }
            }
          }
        } catch (error) { console.error('acaminho_email_falhou', safeError(error)); }
        return json({ ok: true });
      }
      if (pathname === '/api/agente/checkin' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || b.lat == null || b.lon == null) return json({ ok: false, error: 'dados' }, 400);
        await registrarCheckin(env, b.id, agente, { lat: b.lat, lon: b.lon, acc: b.acc });
        try { await tagColetaComVeiculo(env, agente.email, b.id); } catch { /* jornada opcional no vínculo */ }
        try { const c0 = await lerColetaOS(env, b.id); if (c0 && c0.veiculoPlaca) { const t = await capturarTelemetria(env, c0.veiculoPlaca, 'checkin'); if (t) await anexarTelemetriaOS(env, b.id, t); } } catch { /* telemetria é best-effort */ }
        // Cliente é avisado que o coletor CHEGOU (SMS preferido, e-mail de reserva) — uma vez só.
        try {
          const col = await lerColetaOS(env, b.id);
          if (col) {
            const chave = `notif:coleta:${col.id}:chegou`;
            const ja = env.PORTAL_KV ? await env.PORTAL_KV.get(chave) : null;
            if (!ja) {
              const cli = col.clienteId ? await lerCliente(env, col.clienteId) : null;
              const emailCli = (cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email))) || '';
              const foneCli = (cli && (cli.fone || cli.telefone || cli.celular || (Array.isArray(cli.contatos) && cli.contatos[0] && (cli.contatos[0].fone || cli.contatos[0].telefone)))) || col.clienteFone || col.telefone || '';
              if (emailCli || foneCli) { const av = await avisarColeta(env, { email: emailCli, telefone: foneCli, nome: col.clienteNome }, 'chegou'); if (av.via !== 'nenhum' && env.PORTAL_KV) await env.PORTAL_KV.put(chave, JSON.stringify({ via: av.via, em: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 }); }
            }
          }
        } catch (error) { console.error('chegou_aviso_falhou', safeError(error)); }
        return json({ ok: true });
      }
      if (pathname === '/api/agente/foto' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || !b.foto) return json({ ok: false, error: 'dados' }, 400);
        await registrarFoto(env, b.id, agente, b.foto);
        return json({ ok: true });
      }
      // Assinatura do cliente (desenhada na tela) + RG/CPF — prova da coleta.
      if (pathname === '/api/agente/assinatura' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || !b.assinatura) return json({ ok: false, error: 'dados' }, 400);
        await registrarAssinatura(env, b.id, agente, { nome: b.nome, doc: b.doc, assinatura: b.assinatura });
        return json({ ok: true });
      }
      if (pathname === '/api/agente/encerrar' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        let det = null; try { det = await detalheColeta(env, b.id); } catch { det = null; }
        await registrarEncerramento(env, b.id, agente, { volumes: b.volumes, obs: b.obs, numero: det && det.numero, cliente: det && det.cliente, endereco: det && det.endereco });
        try { const c0 = await lerColetaOS(env, b.id); if (c0 && c0.veiculoPlaca) { const t = await capturarTelemetria(env, c0.veiculoPlaca, 'encerramento'); if (t) await anexarTelemetriaOS(env, b.id, t); } } catch { /* telemetria é best-effort */ }
        return json({ ok: true });
      }
      if (pathname === '/api/agente/reagendar' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        let det = null; try { det = await detalheColeta(env, b.id); } catch { det = null; }
        await registrarReagendamento(env, b.id, agente, { motivo: b.motivo, numero: det && det.numero, cliente: det && det.cliente, endereco: det && det.endereco });
        return json({ ok: true });
      }

      // Módulo OPERACIONAL (doca → destino). Exige sessão de operador.
      // ===== ENTRADA POR CARGAS (spec do Eng. Marcelo) — doca/galpão =====
      // Acesso: operação, escritório, engenharia (RT) e diretoria.
      const docaOk = operacao || escritorio || eng || diretoria;
      if (pathname === '/cargas' && request.method === 'GET') {
        if (!docaOk) return html(paginaLoginOperacao(googleConfigurado(env)));
        return html(paginaCargas(docaOk, await listarCargas(env)));
      }
      if (pathname === '/cargas/nova' && request.method === 'GET') {
        if (!docaOk) return html(paginaLoginOperacao(googleConfigurado(env)));
        // Lista PRÓPRIA do Cargas (OSs completas, com certificados/cliente):
        // coletas concluídas, fora de outras cargas; o fluxo antigo da doca só
        // bloqueia se tiver dado real (peso/fotos/etapa avançada) — um clique
        // acidental em "receber" não esconde a OS daqui.
        const todasOS = await listarColetasOS(env);
        const emCargas = new Set();
        // Carga CANCELADA devolve as OSs para cá (não trava mais ninguém).
        (await listarCargas(env)).forEach((cg) => { if (cg.status === 'cancelada') return; (cg.oss || []).forEach((o) => emCargas.add(o.id)); });
        const livres = [];
        for (const c of todasOS.filter((x) => x.status === 'concluida')) {
          if (emCargas.has(c.id)) continue;
          let opAntiga = null; try { opAntiga = await lerOperacao(env, c.id); } catch { opAntiga = null; }
          if (opAntiga && (opAntiga.entrada || (opAntiga.fotos && Object.keys(opAntiga.fotos).length) || (opAntiga.etapa && opAntiga.etapa !== 'recepcao'))) continue;
          livres.push(c);
        }
        return html(paginaNovaCarga(docaOk, livres));
      }
      if (pathname === '/cargas/carga' && request.method === 'GET') {
        if (!docaOk) return html(paginaLoginOperacao(googleConfigurado(env)));
        const c = await lerCarga(env, url.searchParams.get('id'));
        if (!c) return html(paginaMensagem('Carga não encontrada', 'Volte e tente de novo.'), 404);
        return html(paginaCarga(docaOk, c, await lotesDaCarga(env, c.id)));
      }
      if (pathname === '/cargas/etiqueta' && request.method === 'GET') {
        if (!docaOk) return html(paginaLoginOperacao(googleConfigurado(env)));
        const l = await lerLote(env, url.searchParams.get('id'));
        if (!l) return html(paginaMensagem('Lote não encontrado', 'Volte e tente de novo.'), 404);
        const c = await lerCarga(env, l.cargaId);
        return html(paginaEtiqueta(l, c || {}, String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, '')));
      }
      if (pathname === '/cargas/qr' && request.method === 'GET') {
        if (!docaOk) return json({ ok: false }, 401);
        const idL = (url.searchParams.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
        if (!idL) return json({ ok: false }, 400);
        const bytes = await qrLoteGif(env, idL, String(env.PORTAL_BASE_URL || url.origin).replace(/\/+$/, ''));
        return new Response(bytes, { headers: { 'content-type': 'image/gif', 'cache-control': 'public, max-age=86400' } });
      }
      if (pathname === '/cargas/filas' && request.method === 'GET') {
        if (!docaOk) return html(paginaLoginOperacao(googleConfigurado(env)));
        const dest = ['laudo', 'remanufatura', 'reciclagem', 'destinacao'].includes(url.searchParams.get('destino')) ? url.searchParams.get('destino') : 'laudo';
        return html(paginaFilas(docaOk, dest, await listarLotesPorDestino(env, dest)));
      }
      if (pathname === '/cargas/foto' && request.method === 'GET') {
        if (!docaOk) return json({ ok: false }, 401);
        const c = await lerCarga(env, url.searchParams.get('id'));
        const i = Number(url.searchParams.get('i')) || 0;
        const f = c && c.fotos && c.fotos[i];
        if (!f || !env.R2_ARQUIVOS) return json({ ok: false }, 404);
        const obj = await env.R2_ARQUIVOS.get(f.key);
        if (!obj) return json({ ok: false }, 404);
        return new Response(obj.body, { headers: { 'content-type': f.ct || 'image/jpeg', 'cache-control': 'no-store' } });
      }
      if (pathname === '/api/cargas/nova' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const ids = Array.isArray(b && b.osIds) ? b.osIds.slice(0, 20) : [];
        const oss = [];
        for (const osId of ids) { const o = await lerColetaOS(env, String(osId).replace(/[^a-zA-Z0-9_-]/g, '')); if (o) oss.push(o); }
        return json(await novaCarga(env, docaOk, oss));
      }
      if (pathname === '/api/cargas/pesar' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await pesarCarga(env, b && b.id, b && b.bruto, b && b.tara, { justificativa: b && b.justificativa, por: docaOk.email || '' }));
      }
      if (pathname === '/api/cargas/editar-lote' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await editarLote(env, docaOk, b && b.id, b || {}));
      }
      if (pathname === '/api/cargas/foto' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        if (!env.R2_ARQUIVOS) return json({ ok: false, message: 'Armazenamento indisponível.' }, 503);
        let form; try { form = await request.formData(); } catch { return json({ ok: false, message: 'Envio inválido.' }, 400); }
        const file = form.get('file');
        const idC = String(form.get('id') || '').replace(/[^a-zA-Z0-9_-]/g, '');
        if (!file || typeof file === 'string' || !idC) return json({ ok: false, message: 'Selecione uma foto.' }, 400);
        const tamF = Number(file.size) || 0;
        if (tamF > 10 * 1024 * 1024) return json({ ok: false, message: 'Foto muito grande (máx. 10 MB).' }, 400);
        const keyF = `cargas/${idC}/${novoId()}_${String(file.name || 'foto.jpg').replace(/[^\w.\-]+/g, '_').slice(0, 80)}`;
        const ctF = file.type || 'image/jpeg';
        try {
          await env.R2_ARQUIVOS.put(keyF, await file.arrayBuffer(), { httpMetadata: { contentType: ctF } });
          return json(await fotoCarga(env, idC, { key: keyF, ct: ctF, em: agoraISO() }));
        } catch (error) { console.error('carga_foto', safeError(error)); return json({ ok: false, message: 'Falha ao enviar a foto.' }, 500); }
      }
      if (pathname === '/api/cargas/lote' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await criarLote(env, docaOk, b && b.cargaId, b || {}));
      }
      if (pathname === '/api/cargas/lote-excluir' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await excluirLote(env, b && b.id));
      }
      if (pathname === '/api/cargas/lote-status' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await mudarStatusLote(env, b && b.id, b && b.novo));
      }
      if (pathname === '/api/cargas/cancelar' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await cancelarCarga(env, docaOk, b && b.id));
      }
      // Expedição do lote: registrar saída (fornecedor + MTR + data).
      if (pathname === '/cargas/expedir' && request.method === 'GET') {
        if (!docaOk) return html(paginaLoginOperacao(googleConfigurado(env)));
        const l = await lerLote(env, url.searchParams.get('id'));
        if (!l) return html(paginaMensagem('Lote não encontrado', 'Volte e tente de novo.'), 404);
        const c = await lerCarga(env, l.cargaId);
        const hojeBR = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
        return html(paginaExpedirLote(l, c || {}, await listarFornecedores(env), hojeBR));
      }
      if (pathname === '/api/cargas/expedir' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        return json(await expedirLote(env, docaOk, b && b.id, b || {}));
      }
      // Consulta um MTR (número) nos órgãos — usada na tela de expedição.
      if (pathname === '/api/cargas/mtr-info' && request.method === 'POST') {
        if (!docaOk) return json({ ok: false, message: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = {}; }
        const cons = await consultarMtrSigor(env, b && b.numero);
        return json({ ok: !!cons.ok, message: cons.message });
      }
      if (pathname === '/operacao' && request.method === 'GET') {
        if (!operacao) return html(paginaLoginOperacao(googleConfigurado(env)));
        return html(paginaAppOperacao(operacao, await listarOperacoes(env)));
      }
      if (pathname === '/operacao/receber' && request.method === 'GET') {
        if (!operacao) return new Response(null, { status: 302, headers: { Location: '/operacao', 'cache-control': 'no-store' } });
        return html(paginaReceberLote(await listarColetasRecebiveis(env)));
      }
      if (pathname === '/operacao/lote' && request.method === 'GET') {
        if (!operacao) return new Response(null, { status: 302, headers: { Location: '/operacao', 'cache-control': 'no-store' } });
        const op = await lerOperacao(env, url.searchParams.get('id') || '');
        if (!op) return html(paginaMensagem('Operação não encontrada', 'Volte e receba o lote de novo.'), 404);
        let regDoca = null; try { const e = await lerEstadoColeta(env, op.osId); regDoca = { checkin: e && e.checkin, foto: e && e.foto, encerramento: e && e.encerramento, assinatura: e && e.assinatura }; } catch { regDoca = null; }
        return html(paginaLoteDetalhe(operacao, op, regDoca));
      }
      if (pathname === '/operacao/foto' && request.method === 'GET') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await servirFotoOperacao(env, url.searchParams.get('id') || '', url.searchParams.get('fase') || '', url.searchParams.get('cat') || '');
      }
      if (pathname === '/api/operacao/iniciar' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        const osId = form ? String(form.get('osId') || '') : '';
        if (!osId) return html(paginaMensagem('Lote inválido', 'Volte e escolha de novo.'), 400);
        const op = await iniciarOperacao(env, osId, operacao);
        if (!op) return html(paginaMensagem('Não consegui abrir a operação', 'Tente de novo em instantes.'), 502);
        // Aviso "coleta realizada" ao cliente quando a coleta é recebida na doca (caminho
        // automático). Mesma chave de-dup do caminho manual — nunca manda 2x.
        try {
          const chave = `notif:coleta:${osId}:coleta_realizada`;
          const jaAvisou = env.PORTAL_KV ? await env.PORTAL_KV.get(chave) : null;
          if (!jaAvisou) {
            const os = await lerColetaOS(env, osId);
            const cli = os && os.clienteId ? await lerCliente(env, os.clienteId) : null;
            const emailCli = cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email) || '');
            if (emailCli && env.RESEND_API_KEY) { await enviarEmailStatus(emailCli, (os && os.clienteNome) || '', 'coleta_realizada', env); if (env.PORTAL_KV) await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 }); }
          }
        } catch (error) { console.error('coleta_realizada_doca_email_falhou', safeError(error)); }
        return new Response(null, { status: 302, headers: { Location: `/operacao/lote?id=${encodeURIComponent(osId)}`, 'cache-control': 'no-store' } });
      }
      if (pathname === '/api/operacao/tipo' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.osId) return json({ ok: false, error: 'dados' }, 400);
        await definirTipoOperacao(env, b.osId, b.tipo);
        return json({ ok: true });
      }
      if (pathname === '/api/operacao/peso' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.osId || b.kg == null) return json({ ok: false, error: 'dados' }, 400);
        await registrarPesoEntrada(env, b.osId, operacao, b.kg);
        return json({ ok: true });
      }
      if (pathname === '/api/operacao/foto' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.osId || !b.fase || !b.cat || !b.foto) return json({ ok: false, error: 'dados' }, 400);
        const op = await registrarFotoOperacao(env, b.osId, operacao, b.fase, b.cat, b.foto, { geo: b.geo });
        return json({ ok: !!op });
      }
      if (pathname === '/operacao/lote/triagem' && request.method === 'GET') {
        if (!operacao) return new Response(null, { status: 302, headers: { Location: '/operacao', 'cache-control': 'no-store' } });
        const op = await lerOperacao(env, url.searchParams.get('id') || '');
        if (!op) return html(paginaMensagem('Operação não encontrada', 'Volte e receba o lote de novo.'), 404);
        return html(paginaTriagem(operacao, op));
      }
      if (pathname === '/api/operacao/material' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.osId) return json({ ok: false, error: 'dados' }, 400);
        const op = await adicionarMaterial(env, b.osId, operacao, b);
        return json({ ok: !!op });
      }
      if (pathname === '/api/operacao/material/remover' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        const osId = form ? String(form.get('osId') || '') : '';
        await removerMaterial(env, osId, form ? form.get('idx') : -1);
        return new Response(null, { status: 302, headers: { Location: `/operacao/lote/triagem?id=${encodeURIComponent(osId)}`, 'cache-control': 'no-store' } });
      }
      if (pathname === '/api/operacao/triagem/concluir' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        const osId = form ? String(form.get('osId') || '') : '';
        await concluirTriagem(env, osId);
        return new Response(null, { status: 302, headers: { Location: `/operacao/lote?id=${encodeURIComponent(osId)}`, 'cache-control': 'no-store' } });
      }
      if (pathname === '/operacao/lote/processamento' && request.method === 'GET') {
        if (!operacao) return new Response(null, { status: 302, headers: { Location: '/operacao', 'cache-control': 'no-store' } });
        const op = await lerOperacao(env, url.searchParams.get('id') || '');
        if (!op) return html(paginaMensagem('Operação não encontrada', 'Volte e receba o lote de novo.'), 404);
        return html(paginaProcessamento(operacao, op));
      }
      if (pathname === '/api/operacao/processamento/concluir' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        const osId = form ? String(form.get('osId') || '') : '';
        await concluirProcessamento(env, osId);
        return new Response(null, { status: 302, headers: { Location: `/operacao/lote?id=${encodeURIComponent(osId)}`, 'cache-control': 'no-store' } });
      }
      if (pathname === '/operacao/lote/saida' && request.method === 'GET') {
        if (!operacao) return new Response(null, { status: 302, headers: { Location: '/operacao', 'cache-control': 'no-store' } });
        const op = await lerOperacao(env, url.searchParams.get('id') || '');
        if (!op) return html(paginaMensagem('Operação não encontrada', 'Volte e receba o lote de novo.'), 404);
        return html(paginaSaida(operacao, op));
      }
      if (pathname === '/api/operacao/saida' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.osId || b.pesoKg == null) return json({ ok: false, error: 'dados' }, 400);
        await registrarSaida(env, b.osId, operacao, b);
        return json({ ok: true });
      }
      if (pathname === '/api/operacao/saida/concluir' && request.method === 'POST') {
        if (!operacao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        const osId = form ? String(form.get('osId') || '') : '';
        const opFim = await concluirSaida(env, osId);
        // Adote um Bairro: se a coleta era patrocinada e o crédito recorrente ficou baixo
        // (≤20kg), gera e envia o link de renovação por e-mail (best-effort; não bloqueia).
        if (opFim && opFim.patrocinadorId) {
          try { await verificarRecargaAdote(env, opFim.patrocinadorId, env.PORTAL_BASE_URL || url.origin); } catch (e) { console.error('recarga_trigger_falhou', safeError(e)); }
        }
        return new Response(null, { status: 302, headers: { Location: `/operacao/lote?id=${encodeURIComponent(osId)}`, 'cache-control': 'no-store' } });
      }

      // Módulo ENGENHARIA AMBIENTAL (validação técnica). Exige sessão de engenheiro.
      if (pathname === '/eng' && request.method === 'GET') {
        if (!eng) return html(paginaLoginEng(googleConfigurado(env)));
        return html(paginaFilaEng(eng, await filaValidacao(env), await operacoesValidadas(env)));
      }
      if (pathname === '/eng/lote' && request.method === 'GET') {
        if (!eng) return new Response(null, { status: 302, headers: { Location: '/eng', 'cache-control': 'no-store' } });
        const op = await lerOperacao(env, url.searchParams.get('id') || '');
        if (!op) return html(paginaMensagem('Operação não encontrada', 'Volte para a fila.'), 404);
        const val = await lerValidacaoOp(env, op.osId);
        const seloUrl = (op.etapa === 'concluida') ? `/qr-operacao?id=${encodeURIComponent(op.osId)}` : null;
        const osRec = await lerColetaOS(env, op.osId);
        return html(paginaDossie(eng, op, val, seloUrl, (osRec && osRec.anexos) || []));
      }
      if (pathname === '/eng/foto' && request.method === 'GET') {
        if (!eng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await servirFotoOperacao(env, url.searchParams.get('id') || '', url.searchParams.get('fase') || '', url.searchParams.get('cat') || '');
      }
      if (pathname === '/api/eng/validar' && request.method === 'POST') {
        if (!eng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        const osId = form ? String(form.get('osId') || '') : '';
        if (!osId) return html(paginaMensagem('Operação inválida', 'Volte para a fila.'), 400);
        await registrarValidacaoOp(env, osId, eng, { rt: form.get('rt'), registro: form.get('registro'), comentario: form.get('comentario'), decisao: form.get('decisao') });
        // Aviso "certificado liberado" ao cliente quando a validação é APROVADA (sistema novo, sem Ploomes).
        // Best-effort, de-dup por KV; nunca bloqueia a validação. osId é o id da coleta (os:{id}).
        try {
          const val = await lerValidacaoOp(env, osId);
          if (val && val.decisao === 'validada') {
            const chave = `notif:coleta:${osId}:certificado_liberado`;
            const jaAvisou = env.PORTAL_KV ? await env.PORTAL_KV.get(chave) : null;
            if (!jaAvisou) {
              const os = await lerColetaOS(env, osId);
              const cli = os && os.clienteId ? await lerCliente(env, os.clienteId) : null;
              const emailCli = cli && (cli.email || (Array.isArray(cli.contatos) && cli.contatos[0] && cli.contatos[0].email) || '');
              if (emailCli && env.RESEND_API_KEY) { await enviarEmailStatus(emailCli, (os && os.clienteNome) || '', 'certificado_liberado', env); if (env.PORTAL_KV) await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 }); }
            }
          }
        } catch (error) { console.error('cert_liberado_email_falhou', safeError(error)); }
        return new Response(null, { status: 302, headers: { Location: `/eng/lote?id=${encodeURIComponent(osId)}`, 'cache-control': 'no-store' } });
      }
      if (pathname === '/eng/destinos' && request.method === 'GET') {
        if (!eng) return new Response(null, { status: 302, headers: { Location: '/eng', 'cache-control': 'no-store' } });
        return html(paginaDestinos(eng, await listarDestinos(env)));
      }
      if (pathname === '/eng/destino' && request.method === 'GET') {
        if (!eng) return new Response(null, { status: 302, headers: { Location: '/eng', 'cache-control': 'no-store' } });
        const id = url.searchParams.get('id');
        const d = id ? await lerDestino(env, id) : null;
        return html(paginaDestinoForm(eng, d));
      }
      if (pathname === '/api/eng/destino' && request.method === 'POST') {
        if (!eng) return json({ ok: false, error: 'nao_autenticado' }, 401);
        const form = await request.formData().catch(() => null);
        if (!form || !String(form.get('cnpj') || '').replace(/\D/g, '')) return html(paginaMensagem('CNPJ obrigatório', 'Volte e informe o CNPJ do destino.'), 400);
        await salvarDestino(env, eng, { razaoSocial: form.get('razaoSocial'), cnpj: form.get('cnpj'), tipo: form.get('tipo'), endereco: form.get('endereco'), lo: form.get('lo'), loValidade: form.get('loValidade'), validado: form.get('validado') });
        return new Response(null, { status: 302, headers: { Location: '/eng/destinos', 'cache-control': 'no-store' } });
      }
      if (pathname === '/eng/relatorio' && request.method === 'GET') {
        if (!eng) return new Response(null, { status: 302, headers: { Location: '/eng', 'cache-control': 'no-store' } });
        const op = await lerOperacao(env, url.searchParams.get('id') || '');
        if (!op) return html(paginaMensagem('Operação não encontrada', 'Volte para a fila.'), 404);
        const val = await lerValidacaoOp(env, op.osId);
        const seloUrl = (op.etapa === 'concluida') ? `/qr-operacao?id=${encodeURIComponent(op.osId)}` : null;
        return html(paginaRelatorio(op, val, await listarDestinos(env), seloUrl));
      }

      // Área de validação da Villanova (exige sessão de validador).
      if (pathname === '/validacao' && request.method === 'GET') {
        if (!validador) return html(paginaLoginValidador(googleConfigurado(env)));
        return html(await paginaAreaValidacao(env, validador, url));
      }
      if (pathname === '/api/validacao/validar' && request.method === 'POST') {
        if (!validador) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await validarMetodologiaAcao(request, env, validador);
      }
      // Homologação de UM fator (valor da fonte, assinado pela RT) — só validador.
      if (pathname === '/api/validacao/fator' && request.method === 'POST') {
        if (!validador) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await homologarFatorAcao(request, env, validador);
      }
      // Metodologia — FECHADA (proteção contra concorrente): cliente logado OU validador.
      if (pathname === '/metodologia' && request.method === 'GET') {
        if (!sessao && !validador) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        return html(await paginaMetodologia(env, await lerValidacao(env)));
      }
      // Painel de carbono do cliente — ligado ao motor (peso/composição REAIS; tCO₂e
      // pendente até a Villanova validar). Só cliente logado.
      if (pathname === '/painel-carbono' && request.method === 'GET') {
        if (!sessao) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        const dadosCli = await carbonoDoCliente(env, sessao.nome || '');
        // Termômetro de neutralidade: patrocínio (Adote, número C) + inventário (número B) + fator.
        let extra = { adote: null, inventario: null, compensacao: await fatorCompensacaoAdote(env) };
        try {
          const doc = String(sessao.documento || '').replace(/\D/g, '');
          const cred = await lerCreditoPorDoc(env, doc); // Adote (compensação C) já amarra pelo CNPJ
          if (cred) extra.adote = resumoPatrocinio(cred);
          if (env.PORTAL_KV) {
            // Inventário (B): amarra pelo CNPJ (vale p/ todos os usuários da empresa); e-mail é só reserva.
            let raw = doc ? await env.PORTAL_KV.get(`carbono-inv-doc:${doc}`) : null;
            if (!raw) { const em = String(sessao.email || '').trim().toLowerCase(); if (em) raw = await env.PORTAL_KV.get(`carbono-inv:${em}`); }
            if (raw) extra.inventario = JSON.parse(raw);
          }
        } catch (e) { console.error('termometro_extra_falhou', safeError(e)); }
        return html(paginaPainelCarbono(sessao, dadosCli, await lerValidacao(env), extra));
      }
      // Carbono — tela do ANALISTA (a cozinha): peso REAL por material × fator da metodologia.
      // Interno (engenharia/diretoria). Todo tCO₂e fica "pendente" até a Villanova validar os fatores.
      if (pathname === '/carbono/analista' && request.method === 'GET') {
        if (!eng && !diretoria) return html(paginaLoginEng(googleConfigurado(env)));
        const user = eng || diretoria;
        const clientes = await clientesComOperacoes(env);
        const clienteNome = url.searchParams.get('cliente') || '';
        const dados = clienteNome ? await carbonoDoCliente(env, clienteNome) : null;
        return html(paginaCarbonoAnalista(user, clientes, dados));
      }
      // Carbono — tela do AUDITOR (dossiê): metodologia (selo) + a conta + a cadeia de
      // custódia. Villanova (validador) e, para conferência interna, engenharia/diretoria.
      if (pathname === '/carbono/auditor' && request.method === 'GET') {
        if (!validador && !eng && !diretoria) return new Response(null, { status: 302, headers: { Location: '/validacao', 'cache-control': 'no-store' } });
        const user = validador || eng || diretoria;
        const clientes = await clientesComOperacoes(env);
        const clienteNome = url.searchParams.get('cliente') || '';
        const dados = clienteNome ? await carbonoDoCliente(env, clienteNome) : null;
        return html(paginaCarbonoAuditor(user, clientes, dados, await lerValidacao(env)));
      }
      // Rastreio do caminhão (cliente): página + posição ao vivo. Só a OS do próprio
      // cliente, só em transporte. Sem RotaExata mapeado, responde com honestidade.
      if (pathname === '/rastreio' && request.method === 'GET') {
        if (!sessao) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        const oid = (url.searchParams.get('os') || '').replace(/^k/, '').replace(/[^a-zA-Z0-9_]/g, '');
        const col = await lerColetaOS(env, oid);
        const docSess = String(sessao.documento || '').replace(/\D/g, '');
        if (!col || !docSess || String(col.clienteDoc || '').replace(/\D/g, '') !== docSess) {
          return html(paginaMensagem('Coleta não encontrada', 'Volte ao painel e tente de novo.', '/painel'), 404);
        }
        return html(paginaRastreio('k' + col.id, col.numero || ''));
      }
      if (pathname === '/api/os/rastreio' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, motivo: 'nao_autenticado' }, 401);
        const oid = (url.searchParams.get('id') || '').replace(/^k/, '').replace(/[^a-zA-Z0-9_]/g, '');
        const col = await lerColetaOS(env, oid);
        const docSess = String(sessao.documento || '').replace(/\D/g, '');
        if (!col || !docSess || String(col.clienteDoc || '').replace(/\D/g, '') !== docSess) return json({ ok: false, motivo: 'nao_encontrada' }, 404);
        if (col.status !== 'em_transporte') return json({ ok: false, motivo: 'fora_de_transporte' });
        let placa = col.veiculoPlaca || '';
        if (!placa) { try { placa = await placaDaColeta(env, col); } catch { /* segue */ } }
        if (!placa) return json({ ok: false, motivo: 'sem_veiculo' });
        return json(await posicaoDoVeiculo(env, placa));
      }
      if (pathname === '/api/os' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await listarOS(sessao, env);
      }
      if (pathname === '/api/chamado' && request.method === 'POST') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await abrirChamado(request, sessao, env);
      }
      if (pathname === '/api/perfil' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await perfilCliente(sessao, env);
      }
      if (pathname === '/api/os/solicitar' && request.method === 'POST') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await solicitarOS(request, sessao, env);
      }
      if (pathname === '/api/cep' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await consultaCep(request, env);
      }
      if (pathname === '/api/os/docs' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await listarDocsOS(url, sessao, env);
      }
      if (pathname === '/api/os/doc' && request.method === 'GET') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        return await baixarDocOS(url, sessao, env);
      }
      // Portal de Grandes Contas — Acompanhamento (Kanban + cronograma + downloads).
      if (pathname === '/acompanhamento' && request.method === 'GET') {
        if (!sessao) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        return html(paginaAcompanhamento(await dadosAcompanhamentoCliente(sessao, env)));
      }
      // Multiusuário por cliente (gestores) — só o ADMIN da conta (login principal) gerencia.
      if (pathname === '/gestores' && request.method === 'GET') {
        if (!sessao) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        if (sessao.nivel !== 'admin') return html(paginaMensagem('Acesso restrito', 'Só o administrador da conta da sua empresa pode gerenciar usuários e níveis de acesso.', '/painel'), 403);
        const g = await lerGestores(env, sessao.documento);
        return html(paginaGestores({ empresaNome: g.empresaNome || sessao.nome || '', doc: g.doc, gestores: g.gestores, email: sessao.email, nome: sessao.nome }));
      }
      if (pathname === '/api/gestores/salvar' && request.method === 'POST') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (sessao.nivel !== 'admin') return json({ ok: false, error: 'sem_permissao', message: 'Só o administrador da conta pode gerenciar usuários.' }, 403);
        let input; try { input = await request.json(); } catch { return json({ ok: false, message: 'Dados inválidos.' }, 400); }
        const email = String(input?.email || '').trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, message: 'Informe um e-mail válido.' }, 400);
        const r = await salvarGestor(env, sessao.documento, sessao.nome || '', { nome: input?.nome, papel: input?.papel, nivel: input?.nivel, email });
        return json(r && r.erro ? { ok: false, message: r.erro } : { ok: true });
      }
      if (pathname === '/api/gestores/remover' && request.method === 'POST') {
        if (!sessao) return json({ ok: false, error: 'nao_autenticado' }, 401);
        if (sessao.nivel !== 'admin') return json({ ok: false, error: 'sem_permissao' }, 403);
        let input; try { input = await request.json(); } catch { return json({ ok: false, message: 'Dados inválidos.' }, 400); }
        await removerGestor(env, sessao.documento, String(input?.email || ''));
        return json({ ok: true });
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (error) {
      console.error('erro_inesperado', safeError(error));
      // Monitor de falhas: guarda a rota + o erro REAL (com um pedaço do stack)
      // no D1, para diagnosticar sem depender do cliente reclamar.
      try { await registrarFalha(env, `rota:${url.pathname}`, `${safeError(error).name}: ${safeError(error).message} | ${String(error?.stack || '').slice(0, 500)}`); } catch { /* nunca piora o erro */ }
      // Limite diário de gravações do plano gratuito do Cloudflare: explica em
      // português em vez de "erro_interno" (zera à meia-noite UTC = 21h Brasília).
      if (/KV put\(\) limit exceeded/i.test(String(error && error.message || ''))) {
        return json({ ok: false, error: 'limite_diario_gravacoes', message: 'O sistema atingiu o limite diário de gravações do plano gratuito do Cloudflare. Nada foi perdido — volta ao normal às 21h (horário de Brasília). O upgrade do plano (US$ 5/mês) elimina esse teto.' }, 503);
      }
      return json({ ok: false, error: 'erro_interno' }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------
async function telaInicial(request, env) {
  const sessao = await lerSessao(request, env);
  if (!sessao) return html(paginaLogin(googleConfigurado(env)));
  let segmento = null;
  try { segmento = await segmentoDoCliente(env, sessao.documento); } catch { /* painel nunca depende do segmento */ }
  return html(paginaPainel({ nome: sessao.nome, email: sessao.email, dataFim: sessao.dataFim || '', whatsapp: env.WHATSAPP_COMERCIAL || '', segmento, nivel: sessao.nivel }));
}

// Tela "Entrar como…" — quando o e-mail tem mais de um acesso (os cookies de
// todos já foram gravados; aqui é só escolher a porta de entrada).
function paginaEscolherAcesso(destinos) {
  const botoes = destinos.map(([rotulo, href]) => `<a href="${esc(href)}" style="display:block;background:#00333B;color:#fff;text-decoration:none;border-radius:12px;padding:15px 18px;font-size:15px;font-weight:800;margin-bottom:10px;text-align:center">${esc(rotulo)} →</a>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Entrar como… — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,sans-serif;color:#10262B">
<div style="max-width:420px;margin:0 auto;padding:40px 18px">
  <div style="background:#00333B;border-radius:16px 16px 0 0;padding:20px 24px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">emigre</span></div>
  <div style="background:#fff;border:1px solid #E4EBE9;border-top:none;border-radius:0 0 16px 16px;padding:26px 24px">
    <h1 style="font-size:19px;margin:0 0 6px;color:#00333B">Você tem mais de um acesso</h1>
    <p style="font-size:13px;color:#4F6469;margin:0 0 18px;line-height:1.55">Todos já estão liberados neste navegador — escolha por onde quer entrar (dá para trocar depois voltando aqui).</p>
    ${botoes}
  </div>
</div></body></html>`;
}

// LOGIN UNIFICADO por e-mail: identifica o papel (equipe, por prioridade) ou o
// cliente e delega ao fluxo de link mágico correspondente — reaproveitando os
// throttles e templates de cada papel. Resposta SEMPRE genérica (anti-enumeração).
async function solicitarLinkUnificado(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver na nossa base (cliente ou equipe), enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return generica;
  const reenc = { json: async () => ({ email, turnstile_token: input?.turnstile_token }), headers: request.headers };
  try {
    if (escritorioPermitido(email, env)) { await solicitarLinkEscritorio(reenc, env); return generica; }
    if (diretorPermitido(email, env)) { await solicitarLinkDiretoria(reenc, env); return generica; }
    if (engenheiroPermitido(email, env)) { await solicitarLinkEng(reenc, env); return generica; }
    if (operadorPermitido(email, env)) { await solicitarLinkOperacao(reenc, env); return generica; }
    if (agentePermitido(email, env)) { await solicitarLinkAgente(reenc, env); return generica; }
    if (fiscalPermitido(email, env)) { await solicitarLinkFiscal(reenc, env); return generica; }
    if (emailValidadorPermitido(email, env)) { await solicitarLinkValidador(reenc, env); return generica; }
    await solicitarLink(reenc, env); // cliente — fluxo atual (throttle + Turnstile)
  } catch (error) { console.error('entrar_unificado_falhou', safeError(error)); }
  return generica;
}

// ---------------------------------------------------------------------------
// Autenticação: solicitar link, entrar com token, ler/gravar sessão, sair
// ---------------------------------------------------------------------------
async function solicitarLink(request, env) {
  // Resposta genérica SEMPRE (anti-enumeração): não revela se o e-mail é cliente.
  const generica = json({ ok: true, message: 'Se o e-mail for de um cliente ativo, enviamos um link de acesso.' });
  let input;
  try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return generica;

  // Turnstile (anti-abuso), se configurado.
  if (env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstile(input.turnstile_token, request.headers.get('CF-Connecting-IP'), env.TURNSTILE_SECRET_KEY);
    if (!ok) return generica;
  }
  // Throttle simples por e-mail (evita spam de e-mails de login).
  if (env.PORTAL_KV) {
    const chave = `throttle:${email}`;
    const jaEnviou = await env.PORTAL_KV.get(chave);
    if (jaEnviou) { console.log('login_throttle'); return generica; } // já mandou há pouco; ignora
    await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 });
  }

  let cliente;
  try { cliente = await buscarClienteBase(email, env); }
  catch (error) { console.error('base_lookup_falhou', safeError(error)); return generica; }

  // Sistema aberto: manda link se o e-mail existir na nossa base. Se não achar,
  // silêncio (anti-enumeração). Logs sem dados pessoais (só motivo e Id empresa).
  if (!cliente || !cliente.liberado) {
    console.log('login_barrado', { achouContato: !!cliente, empresaId: cliente?.empresaId || null });
    return generica;
  }
  console.log('login_liberado', { empresaId: cliente.empresaId });

  const token = await criarToken({ cid: cliente.contactId, emp: cliente.empresaId, em: cliente.email, nome: cliente.nome, fim: cliente.dataFim || '', doc: cliente.documento || '', tipo: 'login' }, LINK_TTL_S, env);
  // Uso único: guarda o nonce no KV; ao usar, apaga.
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });

  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin(cliente, link, env); console.log('login_email_ok', { empresaId: cliente.empresaId }); }
  catch (error) { console.error('login_email_falhou', safeError(error)); /* não revela ao cliente */ }
  return generica;
}

async function entrarComToken(request, env, url) {
  const valor = url.searchParams.get('token') || '';
  const payload = await verificarToken(valor, env);
  if (!payload || payload.tipo !== 'login') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso na tela inicial.', '/'), 400);

  // Uso único: consome o nonce.
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo na tela inicial.', '/'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }

  // Reconfirma na NOSSA base que o cliente existe (não confia só no token).
  let cliente = null;
  try { cliente = await buscarClienteBase(payload.em, env); }
  catch (error) { console.error('reconfirma_falhou', safeError(error)); }
  if (!cliente || !cliente.liberado) {
    return html(paginaMensagem('Acesso indisponível', 'Não encontramos seu cadastro na nossa base. Fale com a equipe da Ecobraz.', '/'), 403);
  }

  const sessao = await criarToken({ cid: cliente.contactId, emp: cliente.empresaId, em: cliente.email, nome: cliente.nome, fim: cliente.dataFim || '', doc: cliente.documento || '', nvl: cliente.nivel || 'admin', tipo: 'sessao' }, SESSAO_TTL_S, env);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': cookieSessao(sessao.valor, SESSAO_TTL_S) },
  });
}

function sair() {
  return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': cookieSessao('', 0) } });
}

async function lerSessao(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${SESSAO_COOKIE}=`));
  if (!cookie) return null;
  const valor = decodeURIComponent(cookie.slice(SESSAO_COOKIE.length + 1));
  const payload = await verificarToken(valor, env);
  if (!payload || payload.tipo !== 'sessao') return null;
  return { contactId: payload.cid, empresaId: payload.emp || payload.cid, email: payload.em, nome: payload.nome, dataFim: payload.fim, documento: payload.doc || '', nivel: payload.nvl || 'admin' };
}

function cookieSessao(valor, maxAge) {
  return `${SESSAO_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

// ---------------------------------------------------------------------------
// Acesso do VALIDADOR (Villanova ESG) — login próprio por link mágico
// ---------------------------------------------------------------------------
function emailValidadorPermitido(email, env) {
  const lista = String(env.VALIDADOR_EMAILS || 'contact@villanovaesg.com').toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return lista.includes(String(email || '').toLowerCase());
}
async function solicitarLinkValidador(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail for de um validador autorizado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !emailValidadorPermitido(email, env)) { console.log('validador_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:val:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_validador' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-validador?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: 'Villanova ESG', email }, link, env); console.log('validador_email_ok'); }
  catch (error) { console.error('validador_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenValidador(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_validador') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!emailValidadorPermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não autorizado para validação.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_validador' }, SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/validacao', 'Set-Cookie': cookieValidador(sessao.valor, SESSAO_TTL_S) } });
}
function sairValidador() { return new Response(null, { status: 302, headers: { Location: '/validacao', 'Set-Cookie': cookieValidador('', 0) } }); }
async function lerSessaoValidador(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${VALIDADOR_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(VALIDADOR_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_validador') return null;
  return { email: payload.em, nome: 'Villanova ESG', role: 'validador' };
}
function cookieValidador(valor, maxAge) { return `${VALIDADOR_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }
async function validarMetodologiaAcao(request, env, validador) {
  let comentario = '', declaro = false;
  try { const form = await request.formData(); comentario = String(form.get('comentario') || ''); declaro = !!form.get('declaro'); } catch { /* ignore */ }
  if (!declaro) return html(paginaMensagem('Confirmação necessária', 'Marque a declaração de revisão para validar a metodologia.'), 400);
  await registrarValidacao(env, { validadorEmail: validador.email, comentario });
  return new Response(null, { status: 302, headers: { Location: '/validacao', 'cache-control': 'no-store' } });
}
function paginaLoginValidador(googleOn) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Validação — Ecobraz</title></head>
<body style="margin:0;background:#F2F6F4;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<div style="max-width:440px;margin:0 auto;padding:60px 20px;">
  <div style="background:#00333B;border-radius:16px 16px 0 0;padding:24px 28px;"><span style="color:#fff;font-size:20px;font-weight:800;">ecobraz</span><span style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px;">emigre</span>
    <div style="color:#9FC6C1;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-top:10px;">Área de validação — Villanova ESG</div></div>
  <div style="background:#fff;border-radius:0 0 16px 16px;border:1px solid #E4EBE9;border-top:none;padding:28px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#00333B;">Entrar para validar</h1>
    <p style="margin:0 0 18px;font-size:13.5px;color:#4F6469;line-height:1.6;">Informe seu e-mail autorizado. Enviamos um link de acesso (vale uma vez, expira em 60 minutos).</p>
    <input id="e" type="email" placeholder="seu e-mail" style="width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:9px;padding:12px 14px;font-size:14px;font-family:inherit;">
    <button id="b" style="width:100%;margin-top:12px;background:#92C430;color:#10262B;border:none;border-radius:10px;padding:13px;font-size:14px;font-weight:800;cursor:pointer;">Enviar link de acesso</button>
    ${googleOn ? `<div style="text-align:center;color:#9aa7a4;font-size:12px;margin:14px 0 10px;">ou</div>${botaoGoogle('validador')}` : ''}
    <div id="m" style="font-size:13px;color:#4F6469;margin-top:14px;line-height:1.5;"></div>
  </div>
</div>
<script>
  const b=document.getElementById('b'),e=document.getElementById('e'),m=document.getElementById('m');
  b.onclick=async()=>{b.disabled=true;m.textContent='Enviando…';try{const r=await fetch('/api/validacao/entrar',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:e.value})});const j=await r.json();m.textContent=j.message||'Se o e-mail for autorizado, enviamos um link.';}catch{m.textContent='Tente novamente em instantes.';}b.disabled=false;};
  e.addEventListener('keydown',ev=>{if(ev.key==='Enter')b.click();});
</script>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Acesso do AGENTE DE COLETAS (app mobile) — login próprio por link mágico
// ---------------------------------------------------------------------------
async function solicitarLinkAgente(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !agentePermitido(email, env)) { console.log('agente_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:ag:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_agente' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-agente?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: nomeAgente(email, env), email }, link, env); console.log('agente_email_ok'); }
  catch (error) { console.error('agente_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenAgente(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_agente') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!agentePermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não cadastrado como agente.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_agente' }, APP_SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/agente', 'Set-Cookie': cookieAgente(sessao.valor, APP_SESSAO_TTL_S) } });
}
function sairAgente() { return new Response(null, { status: 302, headers: { Location: '/agente', 'Set-Cookie': cookieAgente('', 0) } }); }
async function lerSessaoAgente(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${AGENTE_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(AGENTE_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_agente' || !agentePermitido(payload.em, env)) return null;
  return { email: payload.em, nome: nomeAgente(payload.em, env), role: 'agente' };
}
function cookieAgente(valor, maxAge) { return `${AGENTE_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }

// ---------------------------------------------------------------------------
// Acesso do OPERADOR (módulo operacional / doca) — login próprio por link mágico
// ---------------------------------------------------------------------------
async function solicitarLinkOperacao(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !operadorPermitido(email, env)) { console.log('operador_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:op:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_operacao' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-operacao?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: nomeOperador(email, env), email }, link, env); console.log('operador_email_ok'); }
  catch (error) { console.error('operador_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenOperacao(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_operacao') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!operadorPermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não cadastrado na operação.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_operacao' }, APP_SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/operacao', 'Set-Cookie': cookieOperacao(sessao.valor, APP_SESSAO_TTL_S) } });
}
function sairOperacao() { return new Response(null, { status: 302, headers: { Location: '/operacao', 'Set-Cookie': cookieOperacao('', 0) } }); }
async function lerSessaoOperacao(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${OPERACAO_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(OPERACAO_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_operacao' || !operadorPermitido(payload.em, env)) return null;
  return { email: payload.em, nome: nomeOperador(payload.em, env), role: 'operacao' };
}
function cookieOperacao(valor, maxAge) { return `${OPERACAO_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }

// ---------------------------------------------------------------------------
// Acesso do ENGENHEIRO AMBIENTAL (validação técnica) — login próprio por link mágico
// ---------------------------------------------------------------------------
async function solicitarLinkEng(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !engenheiroPermitido(email, env)) { console.log('eng_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:eng:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_eng' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-eng?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: nomeEngenheiro(email, env), email }, link, env); console.log('eng_email_ok'); }
  catch (error) { console.error('eng_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenEng(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_eng') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!engenheiroPermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não cadastrado na Engenharia.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_eng' }, SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/eng', 'Set-Cookie': cookieEng(sessao.valor, SESSAO_TTL_S) } });
}
function sairEng() { return new Response(null, { status: 302, headers: { Location: '/eng', 'Set-Cookie': cookieEng('', 0) } }); }
async function lerSessaoEng(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${ENG_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(ENG_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_eng' || !engenheiroPermitido(payload.em, env)) return null;
  return { email: payload.em, nome: nomeEngenheiro(payload.em, env), role: 'engenharia' };
}
function cookieEng(valor, maxAge) { return `${ENG_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }

// ---------------------------------------------------------------------------
// Acesso da DIRETORIA (painel executivo) — login próprio por link mágico
// ---------------------------------------------------------------------------
async function solicitarLinkDiretoria(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !diretorPermitido(email, env)) { console.log('diretoria_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:dir:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_diretoria' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-diretoria?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: nomeDiretor(email, env), email }, link, env); console.log('diretoria_email_ok'); }
  catch (error) { console.error('diretoria_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenDiretoria(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_diretoria') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!diretorPermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não autorizado.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_diretoria' }, SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/diretoria', 'Set-Cookie': cookieDiretoria(sessao.valor, SESSAO_TTL_S) } });
}
function sairDiretoria() { return new Response(null, { status: 302, headers: { Location: '/diretoria', 'Set-Cookie': cookieDiretoria('', 0) } }); }
async function lerSessaoDiretoria(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${DIRETORIA_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(DIRETORIA_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_diretoria' || !diretorPermitido(payload.em, env)) return null;
  return { email: payload.em, nome: nomeDiretor(payload.em, env), role: 'diretoria' };
}
function cookieDiretoria(valor, maxAge) { return `${DIRETORIA_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }

// ---------------------------------------------------------------------------
// Acesso do ESCRITÓRIO/COMERCIAL (cadastro de clientes — a Débora) — login próprio
// ---------------------------------------------------------------------------
async function solicitarLinkEscritorio(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !escritorioPermitido(email, env)) { console.log('escritorio_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:esc:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_escritorio' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-escritorio?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: nomeEscritorio(email, env), email }, link, env); console.log('escritorio_email_ok'); }
  catch (error) { console.error('escritorio_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenEscritorio(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_escritorio') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!escritorioPermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não autorizado.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_escritorio' }, SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/inicio', 'Set-Cookie': cookieEscritorio(sessao.valor, SESSAO_TTL_S) } });
}
function sairEscritorio() { return new Response(null, { status: 302, headers: { Location: '/cadastro', 'Set-Cookie': cookieEscritorio('', 0) } }); }
async function lerSessaoEscritorio(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${ESCRITORIO_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(ESCRITORIO_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_escritorio' || !escritorioPermitido(payload.em, env)) return null;
  return { email: payload.em, nome: nomeEscritorio(payload.em, env), role: 'escritorio' };
}
function cookieEscritorio(valor, maxAge) { return `${ESCRITORIO_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }

// ---------------------------------------------------------------------------
// Acesso do FISCAL (contadora — importação de notas) — login próprio (espelha o escritório)
// ---------------------------------------------------------------------------
async function solicitarLinkFiscal(request, env) {
  const generica = json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviamos um link de acesso.' });
  let input; try { input = await request.json(); } catch { return generica; }
  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !fiscalPermitido(email, env)) { console.log('fiscal_barrado'); return generica; }
  if (env.PORTAL_KV) { const chave = `throttle:fis:${email}`; if (await env.PORTAL_KV.get(chave)) return generica; await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 }); }
  const token = await criarToken({ em: email, tipo: 'login_fiscal' }, LINK_TTL_S, env);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(`nonce:${token.nonce}`, '1', { expirationTtl: LINK_TTL_S });
  const linkBase = env.PORTAL_BASE_URL || new URL(request.url).origin;
  const link = `${linkBase.replace(/\/+$/, '')}/entrar-fiscal?token=${encodeURIComponent(token.valor)}`;
  try { await enviarEmailLogin({ nome: nomeFiscal(email, env), email }, link, env); console.log('fiscal_email_ok'); }
  catch (error) { console.error('fiscal_email_falhou', safeError(error)); }
  return generica;
}
async function entrarComTokenFiscal(request, env, url) {
  const payload = await verificarToken(url.searchParams.get('token') || '', env);
  if (!payload || payload.tipo !== 'login_fiscal') return html(paginaMensagem('Link inválido ou expirado', 'Peça um novo link de acesso.'), 400);
  if (env.PORTAL_KV) {
    const existe = await env.PORTAL_KV.get(`nonce:${payload.n}`);
    if (!existe) return html(paginaMensagem('Este link já foi usado', 'Por segurança, cada link vale uma vez. Peça um novo.'), 400);
    await env.PORTAL_KV.delete(`nonce:${payload.n}`);
  }
  if (!fiscalPermitido(payload.em, env)) return html(paginaMensagem('Acesso indisponível', 'E-mail não autorizado.'), 403);
  const sessao = await criarToken({ em: payload.em, tipo: 'sessao_fiscal' }, SESSAO_TTL_S, env);
  return new Response(null, { status: 302, headers: { Location: '/fiscal', 'Set-Cookie': cookieFiscal(sessao.valor, SESSAO_TTL_S) } });
}
function sairFiscal() { return new Response(null, { status: 302, headers: { Location: '/fiscal', 'Set-Cookie': cookieFiscal('', 0) } }); }
async function lerSessaoFiscal(request, env) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${FISCAL_COOKIE}=`));
  if (!cookie) return null;
  const payload = await verificarToken(decodeURIComponent(cookie.slice(FISCAL_COOKIE.length + 1)), env);
  if (!payload || payload.tipo !== 'sessao_fiscal' || !fiscalPermitido(payload.em, env)) return null;
  return { email: payload.em, nome: nomeFiscal(payload.em, env), role: 'fiscal' };
}
function cookieFiscal(valor, maxAge) { return `${FISCAL_COOKIE}=${encodeURIComponent(valor)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }

// ---------------------------------------------------------------------------
// Ploomes: portão de acesso (contrato) e leitura/escrita de OS
// ---------------------------------------------------------------------------
// Login do cliente pela NOSSA base migrada (D1 `contatos`) — sem depender do
// Ploomes. Decisão do Marcio (jul/2026): o sistema fica ABERTO a todos os
// clientes; quem existe na base entra, sem exigir contrato ativo. A pessoa loga
// pelo e-mail (indexado); a empresa vem pelo company_id, quando houver — mesma
// lógica de antes (pessoa loga, empresa guarda o vínculo), agora 100% local.
async function buscarClienteBase(email, env) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return null;
  // 1) Base migrada do Ploomes (D1) — tem ploomes_id (histórico completo).
  if (env.DB_PLOOMES) {
    try {
      const r = await env.DB_PLOOMES.prepare(
        `SELECT c.ploomes_id AS cid, c.nome AS nome_pessoa, c.documento AS doc_pessoa, c.company_id AS company_id,
                e.ploomes_id AS emp_id, e.nome AS emp_nome, e.documento AS emp_doc
           FROM contatos c
           LEFT JOIN contatos e ON e.ploomes_id = c.company_id
          WHERE c.email = ?1
          ORDER BY (CASE WHEN c.company_id IS NOT NULL AND c.company_id <> 0 THEN 0 ELSE 1 END), c.ploomes_id DESC
          LIMIT 1`
      ).bind(em).all();
      const row = (r.results || [])[0] || null;
      if (row) {
        const temEmpresa = !!(row.company_id && Number(row.company_id) !== 0 && row.emp_id);
        return {
          contactId: row.cid,
          empresaId: temEmpresa ? row.emp_id : row.cid,
          nome: (temEmpresa ? (row.emp_nome || row.nome_pessoa) : row.nome_pessoa) || '',
          email: em,
          documento: (temEmpresa ? (row.emp_doc || row.doc_pessoa) : row.doc_pessoa) || '',
          dataFim: null,
          liberado: true, // sistema aberto a todos os clientes da base
          nivel: 'admin', // login principal do cliente = administrador da conta (CNPJ)
        };
      }
    } catch (error) { console.error('base_lookup_falhou', safeError(error)); }
  }
  // 2) Clientes NOVOS cadastrados pela equipe (KV) — via índice climail:<email>.
  //    Confere que o e-mail é mesmo daquele cliente (evita índice defasado).
  if (env.PORTAL_KV) {
    try {
      const cliId = await env.PORTAL_KV.get(`climail:${em}`);
      if (cliId) {
        const cli = await lerCliente(env, cliId);
        if (cli && emailsDoCliente(cli).includes(em)) {
          const nome = cli.tipo === 'PJ' ? (cli.razaoSocial || cli.nomeFantasia || '') : (cli.nome || '');
          const documento = String((cli.tipo === 'PJ' ? cli.cnpj : cli.cpf) || '').replace(/\D/g, '');
          return { contactId: 0, empresaId: 0, nome, email: em, documento, dataFim: null, liberado: true, nivel: 'admin' };
        }
      }
    } catch (error) { console.error('base_kv_lookup', safeError(error)); }
  }
  // 3) Multiusuário: e-mail cadastrado como GESTOR por um cliente admin (por CNPJ).
  //    Additivo — só entra em cena quando o e-mail NÃO está na base acima.
  try {
    const g = await gestorPorEmail(env, em);
    if (g && g.gestor && g.doc) {
      return { contactId: 0, empresaId: 0, nome: g.empresaNome || g.gestor.nome || '', email: em, documento: g.doc, dataFim: null, liberado: true, nivel: (g.gestor.nivel === 'admin' || g.gestor.nivel === 'baixar') ? g.gestor.nivel : 'ver' };
    }
  } catch (error) { console.error('gestor_lookup', safeError(error)); }
  return null;
}

// [LEGADO — não é mais chamado] Portão antigo que lia o Ploomes: achava o
// contato pelo e-mail e conferia o campo "Contrato Ativo?" (277451) na pessoa e
// na empresa vinculada. Mantido para referência/reversão; o login agora usa
// buscarClienteBase (D1), pois estamos encerrando o Ploomes.
async function buscarClienteAtivo(email, env) {
  requireEnv(env, ['PLOOMES_USER_KEY']);
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  const fieldAtivo = Number(env.PLOOMES_FIELD_CONTRATO_ATIVO || 277451);
  // 366005 = "Termino de Contrato" (data que APARECE no formulário do Ploomes).
  // O 365984 ("Data de encerramento...") foi criado via API e não aparece — órfão.
  const fieldFim = Number(env.PLOOMES_FIELD_CONTRATO_FIM || 366005);

  // 1) Acha o(s) contato(s) pelo e-mail.
  const esc = email.replaceAll("'", "''");
  const url = `${base}/Contacts?$filter=Email%20eq%20'${encodeURIComponent(esc)}'&$top=5&$expand=OtherProperties`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`contacts_${r.status}`);
  const encontrados = (await r.json()).value || [];
  if (!encontrados.length) return null;

  // 2) Candidatos que podem GUARDAR o contrato: cada contato achado e a empresa
  //    vinculada a ele. Guarda os já expandidos para evitar buscas repetidas.
  const registros = new Map();
  const idsCandidatos = [];
  for (const c of encontrados) {
    registros.set(Number(c.Id), c);
    for (const id of [c.Id, c.CompanyId, c.LastCompanyId]) {
      const n = id == null ? null : Number(id);
      if (n != null && !idsCandidatos.includes(n)) idsCandidatos.push(n);
    }
  }

  // 3) Avalia cada candidato: tem o campo de contrato? está ATIVO e na validade?
  const pessoa = encontrados[0];
  let ativoValido = null;   // { reg, dataFim } — libera o acesso
  let ativoExpirado = null; // ativo porém fora da validade
  let empresaBase = null;   // 1º candidato que tem o campo (para exibir nome mesmo sem liberar)
  for (const id of idsCandidatos) {
    let reg = registros.get(id);
    if (!reg) { reg = await fetchContatoPorId(base, headers, id); if (reg) registros.set(id, reg); }
    if (!reg) continue;
    const propAtivo = acharOtherProp(reg, fieldAtivo);
    if (!propAtivo) continue;                    // não tem o campo de contrato
    empresaBase = empresaBase || reg;
    if (propAtivo.BoolValue !== true) continue;  // tem o campo, mas está "Não"
    const propFim = acharOtherProp(reg, fieldFim);
    const dataFim = propFim?.DateTimeValue || propFim?.DateValue || null;
    const naValidade = !dataFim || new Date(dataFim) >= inicioDeHoje();
    if (naValidade) { ativoValido = { reg, dataFim }; break; }
    ativoExpirado = ativoExpirado || { reg, dataFim };
  }

  const empresa = ativoValido?.reg || ativoExpirado?.reg || empresaBase || pessoa;
  const dataFim = ativoValido?.dataFim || ativoExpirado?.dataFim || null;
  return {
    contactId: pessoa.Id,      // quem fez login (pessoa vinculada, em geral)
    empresaId: empresa.Id,     // cadastro que guarda o contrato — usado nas OS/chamados
    nome: empresa.Name || pessoa.Name || '',
    email: (pessoa.Email || email).toLowerCase(),
    dataFim,
    liberado: !!ativoValido,
  };
}

async function fetchContatoPorId(base, headers, id) {
  const u = `${base}/Contacts?$filter=Id%20eq%20${Number(id)}&$top=1&$expand=OtherProperties`;
  const r = await fetch(u, { headers });
  if (!r.ok) return null;
  try { return (await r.json()).value?.[0] || null; } catch { return null; }
}

function acharOtherProp(contact, fieldId) {
  const props = Array.isArray(contact?.OtherProperties) ? contact.OtherProperties : [];
  return props.find((p) => Number(p.FieldId) === fieldId) || null;
}

// Histórico de OS do cliente pela NOSSA base (sem Ploomes): coletas novas (KV) +
// negócios migrados (D1). Tudo casado pelo DOCUMENTO (CNPJ/CPF) do cliente logado.
// Id com prefixo: 'k'+id = coleta nova (KV); 'd'+id = negócio migrado (D1).
async function listarOS(sessao, env) {
  const doc = String(sessao.documento || '').replace(/\D/g, '');
  const ROT = { agendada: 'Agendada', em_transporte: 'Em transporte', na_unidade: 'Na unidade', concluida: 'Coleta realizada', cancelada: 'Cancelada' };
  const out = [];
  // 1) Coletas da nossa base (KV) — as que a equipe cria no sistema novo.
  try {
    if (env.PORTAL_KV && doc) {
      const idx = await listarColetasOS(env);
      for (const c of idx) {
        if (String(c.clienteDoc || '').replace(/\D/g, '') !== doc) continue;
        if (c.status === 'cancelada') continue;
        out.push({
          id: 'k' + c.id, numeroOS: c.numero || '', titulo: 'Ordem de Coleta', status: ROT[c.status] || 'Em atendimento', dataColeta: c.dataAgendada || '', aberturaISO: c.criadoEm || null, peso: '', rastreavel: rastreioDisponivel(env) && c.status === 'em_transporte',
          // Cobrança da OS (OS paga): o cliente vê "Pagar" enquanto aguarda; "Pago ✓" depois.
          cobranca: c.cobranca ? { valor: c.cobranca.valor, status: c.cobranca.status, link: c.cobranca.status === 'pago' ? '' : (c.cobranca.link || '') } : undefined,
        });
      }
    }
  } catch (error) { console.error('listar_os_kv', safeError(error)); }
  // 2) Histórico migrado do Ploomes (D1 negocios) — pelo documento OU pelo id do
  //    contato/empresa da sessão (cobre quem não tem documento na base). status_id
  //    1=aberto, 2=ganho/concluído; esconde 3=perdido.
  const cid = Number(sessao.contactId) || 0, emp = Number(sessao.empresaId) || 0;
  try {
    if (env.DB_PLOOMES && (doc || cid || emp)) {
      const r = await env.DB_PLOOMES.prepare(
        `SELECT ploomes_id AS id, titulo, status_id, criado_em
           FROM negocios
          WHERE (contact_id = ?2 OR contact_id = ?3 OR (?1 <> '' AND contact_id IN (SELECT ploomes_id FROM contatos WHERE documento = ?1)))
            AND status_id IN (1, 2)
          ORDER BY criado_em DESC LIMIT 200`
      ).bind(doc, cid, emp).all();
      for (const d of (r.results || [])) {
        out.push({ id: 'd' + d.id, numeroOS: '', titulo: d.titulo || ('Atendimento ' + d.id), status: d.status_id === 2 ? 'Concluído' : 'Em atendimento', dataColeta: '', aberturaISO: d.criado_em || null, peso: '' });
      }
    }
  } catch (error) { console.error('listar_os_d1', safeError(error)); }
  out.sort((a, b) => String(b.aberturaISO || '').localeCompare(String(a.aberturaISO || '')));
  return json({ ok: true, os: out });
}

// Monta os dados do Acompanhamento (Portal de Grandes Contas): Kanban + linha do
// tempo + central de downloads, SÓ das coletas do CNPJ do cliente logado.
async function dadosAcompanhamentoCliente(sessao, env) {
  const doc = String(sessao.documento || '').replace(/\D/g, '');
  const empresa = sessao.nome || sessao.email || '';
  const cards = [];
  const resumo = { total: 0, aguardando: 0, transporte: 0, processamento: 0, finalizado: 0, concluido: 0 };
  const LAUDO_TIPOS = ['Laudo de Descaracterização', 'Laudo de Destruição de Dados', 'Laudo de Análise Química', 'Laudo fotográfico', 'Laudo de Sanitização', 'Certificado de Destinação', 'Foto do material / local'];
  const iconeLaudo = (t) => /Destruição de Dados/i.test(t) ? '🔒' : /Descaracterização/i.test(t) ? '🧰' : /Análise Química/i.test(t) ? '🧪' : /fotográfico|Foto/i.test(t) ? '🖼️' : /Sanitiza/i.test(t) ? '🧼' : /Certificado/i.test(t) ? '🏅' : '📋';
  if (!env.PORTAL_KV || !doc) return { empresa, doc, cards, resumo };
  let idx = []; try { idx = await listarColetasOS(env); } catch { idx = []; }
  for (const c of idx) {
    if (String(c.clienteDoc || '').replace(/\D/g, '') !== doc) continue;
    if (c.status === 'cancelada') continue;
    let os = null, op = null, val = null;
    try { os = await lerColetaOS(env, c.id); } catch { /* pula */ }
    if (!os) continue;
    try { op = await lerOperacao(env, os.id); } catch { /* sem operação ainda */ }
    try { if (op) val = await lerValidacaoOp(env, os.id); } catch { /* ok */ }
    const validado = !!(op && op.etapa === 'concluida' && val && val.decisao === 'validada');
    const coluna = colunaClienteDe(os.status, op && op.etapa, validado);
    resumo.total++; resumo[coluna] = (resumo[coluna] || 0) + 1;
    const docs = [];
    if (['em_transporte', 'na_unidade', 'concluida'].includes(os.status)) {
      docs.push({ nome: 'Ordem de Coleta', icone: '📄', href: `/api/os/doc?docId=${encodeURIComponent(os.id)}&fonte=os-comprovante` });
      docs.push({ nome: 'Carta de Descarte', icone: '📄', href: `/api/os/doc?docId=${encodeURIComponent(os.id)}&fonte=os-carta` });
      docs.push({ nome: 'Manifesto de Transporte (MTR)', icone: '🏛️', href: `/api/os/doc?docId=${encodeURIComponent(os.id)}&fonte=os-manifesto` });
      if (validado) docs.push({ nome: 'Certificado de Destinação Final (CDF)', icone: '🏅', href: `/api/os/doc?docId=${encodeURIComponent(os.id)}&fonte=os-cdf` });
      for (const a of (Array.isArray(os.anexos) ? os.anexos : [])) {
        if (a.tipo && LAUDO_TIPOS.includes(a.tipo) && a.key) docs.push({ nome: a.tipo, icone: iconeLaudo(a.tipo), href: `/api/os/doc?os=${encodeURIComponent(os.id)}&docId=${encodeURIComponent(a.key)}&fonte=os-anexo` });
      }
    }
    let dias = null; try { if (os.criadoEm) dias = Math.max(0, Math.floor((Date.now() - new Date(os.criadoEm).getTime()) / 86400000)); } catch { dias = null; }
    const prazo = coluna === 'concluido'
      ? { dot: '✓', rotulo: 'concluído', cor: '#1E5B31' }
      : (dias == null ? null : (dias > 15 ? { dot: '🔴', rotulo: 'atrasado', cor: '#B23A2E' } : (dias > 7 ? { dot: '🟡', rotulo: 'atenção', cor: '#8A6A16' } : { dot: '🟢', rotulo: 'no prazo', cor: '#1E5B31' })));
    cards.push({
      id: os.id, numero: os.numero || '', local: String(os.endereco || '').slice(0, 52),
      coluna, dataColeta: os.dataAgendada || '', criadoEm: os.criadoEm || '',
      recebidoEm: (op && op.criadoEm) || '',
      processadoEm: (op && ['processamento', 'saida', 'validacao', 'concluida'].includes(op.etapa)) ? (op.atualizadoEm || '') : '',
      cdfEm: validado ? ((val && val.em) || '') : '',
      docs, prazo,
      rastrear: (rastreioDisponivel(env) && os.status === 'em_transporte') ? ('/rastreio?os=' + encodeURIComponent(os.id)) : '',
    });
  }
  cards.sort((a, b) => String(b.criadoEm || '').localeCompare(String(a.criadoEm || '')));
  // Solicitações do cliente AINDA EM TRIAGEM (leads): o pedido chega, a equipe
  // valida e só então vira OS. Mostrar aqui evita a impressão de pedido perdido
  // (sugestão de cliente real, 12/08). Casa por CNPJ/CPF e, para pedidos antigos
  // sem documento gravado, pelo e-mail de quem está logado.
  const solicitacoes = [];
  try {
    const emailSessao = String(sessao.email || '').trim().toLowerCase();
    const leadsIdx = await listarLeads(env);
    const meus = leadsIdx.filter((l) => {
      if (!l || ['tratado', 'sem_retorno', 'excluido'].includes(l.status)) return false;
      const dl = String(l.documento || '').replace(/\D/g, '');
      if (dl && dl === doc) return true;
      return !!(emailSessao && l.email && String(l.email).trim().toLowerCase() === emailSessao);
    }).slice(0, 8);
    for (const m of meus) {
      let material = '';
      try { const ld = await lerLead(env, m.id); material = (ld && ld.material) || ''; } catch { material = ''; }
      solicitacoes.push({ criadoEm: m.criadoEm || '', material: material || 'Solicitação de coleta' });
    }
    solicitacoes.sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
  } catch { /* seção é opcional — nunca derruba o acompanhamento */ }
  return { empresa, doc, cards, resumo, solicitacoes };
}

// Resolve um cliente pelo id da lista de Cadastro: 'p'+ploomes = base D1 (migrado);
// emp_/pf_ = registro KV (novo/editado). Devolve o objeto "cli".
async function carregarClientePorId(env, id) {
  const s = String(id || '');
  if (/^p\d+$/.test(s)) return await lerClienteD1(env, s.slice(1));
  return await curarContatosKV(env, await lerCliente(env, s));
}
// Materializa um contato D1 como registro KV (necessário para editar / gerar coleta).
// Reaproveita um KV existente com o mesmo documento; senão cria um novo (que já espelha
// de volta no D1). Se o id já for KV, apenas lê. Devolve o cli KV (ou null).
async function materializarClienteKV(env, id) {
  const s = String(id || '');
  if (!/^p\d+$/.test(s)) return await lerCliente(env, s);
  const d1 = await lerClienteD1(env, s.slice(1));
  if (!d1) return null;
  const doc = String(d1.tipo === 'PJ' ? d1.cnpj : d1.cpf || '').replace(/\D/g, '');
  if (doc) {
    try { const idx = await listarClientes(env); const hit = idx.find((c) => String(c.doc || '').replace(/\D/g, '') === doc); if (hit) { const kv = await lerCliente(env, hit.id); if (kv) return await curarContatosKV(env, kv); } } catch { /* segue e cria */ }
  }
  const endBase = { ...(d1.endereco || {}) };
  if (d1.enderecoTexto && !(endBase.logradouro || endBase.cep)) endBase.logradouro = d1.enderecoTexto;
  const novo = { tipo: d1.tipo, endereco: endBase, ploomesId: d1.ploomesId };
  if (d1.tipo === 'PJ') { novo.razaoSocial = d1.razaoSocial || ''; novo.nomeFantasia = d1.nomeFantasia || ''; novo.cnpj = d1.cnpj || ''; novo.email = d1.email || ''; novo.contatos = (d1.contatos && d1.contatos.length) ? d1.contatos : (d1.telefone ? [{ nome: '', cargo: '', fone: d1.telefone, email: d1.email || '', status: '' }] : []); }
  else { novo.nome = d1.nome || ''; novo.cpf = d1.cpf || ''; novo.fone = d1.fone || d1.telefone || ''; novo.email = d1.email || ''; }
  return await salvarCliente(env, novo);
}

// Classifica um documento pelo NOME e diz se o CLIENTE pode ver — e se depende de liberação.
// Regras da Débora (2026-07-22): cliente vê OS, NF, MTR, Carta de Descarte, CDF, laudo; o CDF e
// o laudo SÓ quando liberados; NUNCA contrato/imagens de controle interno. Nomes no Ploomes
// seguem "NNNNN - Tipo". Desconhecido = NÃO mostra (padrão seguro — melhor esconder que vazar).
function semAcentoLc(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function classificaDoc(nome) {
  const s = semAcentoLc(nome);
  // Esconde SEMPRE (mesmo que o nome também tenha "serviço"): interno + comercial (proposta/orçamento).
  if (/contrat|imagem|imagens|controle interno|\binterno\b|propost|orcament/.test(s)) return { cliente: false };
  if (/cdf|certificad/.test(s)) return { cliente: true, liberar: true, rotulo: 'Certificado de Destinação Final (CDF)' };
  if (/laudo/.test(s)) return { cliente: true, liberar: true, rotulo: 'Laudo' };
  if (/mtr/.test(s)) return { cliente: true, rotulo: 'MTR' };
  if (/carta/.test(s)) return { cliente: true, rotulo: 'Carta de Descarte' };
  if (/nota|\bnf\b|fiscal/.test(s)) return { cliente: true, rotulo: 'Nota Fiscal' };
  if (/ordem|servi|\bo\.?s\.?\b/.test(s)) return { cliente: true, rotulo: 'Ordem de Serviço' };
  return { cliente: false }; // tipo desconhecido: não mostra
}
// "Liberado" NÃO está no flag Shared do Ploomes (sonda: 0 de 400 docs marcados) — usamos a
// ETAPA "Certificado Liberado" como sinal de liberação do CDF/laudo. (A confirmar com a Débora.)
function certificadoLiberadoDaEtapa(nomeEtapa) { return /certificado liberado/.test(semAcentoLc(nomeEtapa)); }
// Classifica um ANEXO pelo NOME DO ARQUIVO. Allowlist ESTRITO: só a NF passa; fotos de
// controle (WhatsApp), termos e qualquer outro anexo interno ficam SEMPRE escondidos.
function classificaAnexo(fileName) {
  const s = semAcentoLc(fileName);
  if (/(^|[\s_.\-])nf([\s_.\-]|\d)/.test(s) || /nota.?fiscal/.test(s)) return { cliente: true, rotulo: 'Nota Fiscal' };
  return { cliente: false };
}
// Nome do MODELO (DocumentTemplate) de um Order — pra separar a OS ("OS - ...") de proposta.
async function nomeModelo(templateId, base, headers) {
  if (!templateId) return '';
  try { const t = await fetch(`${base}/DocumentTemplates?$filter=Id%20eq%20${Number(templateId)}&$top=1&$select=Name`, { headers }); if (t.ok) return ((await t.json()).value || [])[0]?.Name || ''; } catch { /* ignore */ }
  return '';
}

// Lista os DOCUMENTOS de uma OS que o cliente PODE ver. Segurança: só a OS do próprio cliente
// (confere ContactId) e aplica as regras de tipo/liberação acima.
// Lista os documentos que o cliente pode ver PARA UM ATENDIMENTO da nossa base.
// Só o histórico migrado ('d'+ploomes_id) tem documentos guardados no R2. As
// coletas novas ('k') terão os documentos gerados numa etapa seguinte.
// Segurança: o negócio precisa ser de um contato com o MESMO documento do cliente,
// e o tipo do arquivo passa pela allowlist (nunca proposta/contrato/interno).
async function listarDocsOS(url, sessao, env) {
  const doc = String(sessao.documento || '').replace(/\D/g, '');
  const cid = Number(sessao.contactId) || 0, emp = Number(sessao.empresaId) || 0;
  const raw = String(url.searchParams.get('dealId') || '');
  if (!raw) return json({ ok: false, error: 'sem_id' }, 400);
  const tipo = raw[0], id = raw.slice(1);
  try {
    if (tipo === 'd' && env.DB_PLOOMES) {
      const dealId = Number(id) || 0;
      if (!dealId) return json({ ok: true, docs: [] });
      const own = await env.DB_PLOOMES.prepare("SELECT 1 AS ok FROM negocios WHERE ploomes_id=?1 AND (contact_id=?3 OR contact_id=?4 OR (?2<>'' AND contact_id IN (SELECT ploomes_id FROM contatos WHERE documento=?2))) LIMIT 1").bind(dealId, doc, cid, emp).first();
      if (!own) return json({ ok: false, error: 'sem_permissao' }, 403);
      const r = await env.DB_PLOOMES.prepare("SELECT r2_key, nome_arquivo FROM arquivos_ploomes WHERE deal_id=?1 ORDER BY (fonte='documento') DESC LIMIT 100").bind(dealId).all();
      const docs = [];
      for (const a of (r.results || [])) {
        const c = classificaDoc(a.nome_arquivo);
        if (!c.cliente) continue; // interno/proposta/desconhecido: nunca mostra (histórico = já liberado)
        docs.push({ id: a.r2_key, fonte: 'r2', nome: c.rotulo || a.nome_arquivo || 'Documento' });
      }
      return json({ ok: true, docs });
    }
    if (tipo === 'k' && env.PORTAL_KV) {
      const os = await lerColetaOS(env, id);
      if (!os) return json({ ok: true, docs: [] });
      const osDoc = String(os.clienteDoc || '').replace(/\D/g, '');
      if (!doc || osDoc !== doc) return json({ ok: true, docs: [] }); // não é do cliente: silêncio
      // Regra da Débora: cliente só vê os documentos a partir de "em transporte".
      if (!['em_transporte', 'na_unidade', 'concluida'].includes(os.status)) return json({ ok: true, docs: [] });
      const docs = [
        { id: os.id, fonte: 'os-comprovante', nome: 'Ordem de Coleta' },
        { id: os.id, fonte: 'os-carta', nome: 'Carta de Descarte' },
        { id: os.id, fonte: 'os-manifesto', nome: 'Manifesto de Transporte (MTR)' },
      ];
      // CDF: só quando a Engenharia VALIDOU a operação (op concluída + decisão "validada").
      try {
        const op = await lerOperacao(env, os.id);
        const val = op ? await lerValidacaoOp(env, os.id) : null;
        if (op && op.etapa === 'concluida' && val && val.decisao === 'validada') docs.push({ id: os.id, fonte: 'os-cdf', nome: 'Certificado de Destinação Final (CDF)' });
      } catch { /* CDF fica de fora se não der pra checar */ }
      return json({ ok: true, docs });
    }
    return json({ ok: true, docs: [] });
  } catch (error) { console.error('docs_erro', safeError(error)); return json({ ok: false, error: 'indisponivel' }, 502); }
}

// Baixa UM documento do NOSSO depósito (R2). A chave (docId) é o r2_key; o Worker
// entrega o arquivo direto. Segurança: o arquivo tem que pertencer a um contato/negócio
// com o MESMO documento do cliente logado, e o tipo passa pela allowlist.
async function baixarDocOS(url, sessao, env) {
  // Multiusuário — nível "ver" acompanha as coletas, mas não abre/baixa documentos.
  if (sessao && sessao.nivel === 'ver') return json({ ok: false, error: 'sem_nivel', message: 'Seu acesso permite acompanhar as coletas. Para baixar documentos, peça ao administrador da sua empresa o nível “Baixar”.' }, 403);
  const doc = String(sessao.documento || '').replace(/\D/g, '');
  const cid = Number(sessao.contactId) || 0, emp = Number(sessao.empresaId) || 0;
  const fonte = url.searchParams.get('fonte') || '';
  // Documentos GERADOS de uma coleta nova (HTML pro cliente ver/imprimir).
  // Só o dono (mesmo documento) e só a partir de "em transporte" (regra da Débora).
  if (['os-comprovante', 'os-carta', 'os-manifesto', 'os-cdf'].includes(fonte)) {
    const coletaId = String(url.searchParams.get('docId') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const os = coletaId ? await lerColetaOS(env, coletaId) : null;
    if (!os) return json({ ok: false, error: 'nao_encontrado' }, 404);
    if (!doc || String(os.clienteDoc || '').replace(/\D/g, '') !== doc) return json({ ok: false, error: 'sem_permissao' }, 403);
    if (!['em_transporte', 'na_unidade', 'concluida'].includes(os.status)) return json({ ok: false, error: 'nao_liberado' }, 403);
    if (fonte === 'os-cdf') {
      const op = await lerOperacao(env, os.id);
      const val = op ? await lerValidacaoOp(env, os.id) : null;
      if (!op || op.etapa !== 'concluida' || !val || val.decisao !== 'validada') return json({ ok: false, error: 'nao_liberado' }, 403);
      return html(paginaCDF(op, val, await listarDestinos(env), `/qr-operacao?id=${encodeURIComponent(os.id)}`));
    }
    const selo = `/qr-os?id=${encodeURIComponent(os.id)}`;
    if (fonte !== 'os-comprovante' && !os.veiculoPlaca) { try { os.veiculoPlaca = await placaDaColeta(env, os); } catch { /* ok */ } }
    let regCli = null, fotoCli = '', assCli = ''; if (fonte === 'os-carta') { try { const e = await lerEstadoColeta(env, os.id); regCli = { checkin: e && e.checkin, foto: e && e.foto, encerramento: e && e.encerramento, assinatura: e && e.assinatura }; const seloC = await seloOS(os.id, env); fotoCli = `/coletas/foto-motorista?id=${encodeURIComponent(os.id)}&t=${seloC}`; assCli = `/coletas/assinatura-motorista?id=${encodeURIComponent(os.id)}&t=${seloC}`; } catch { regCli = null; } }
    return html(fonte === 'os-comprovante' ? paginaComprovanteOS(os, selo) : (fonte === 'os-carta' ? paginaCartaDescarte(os, selo, regCli, fotoCli, assCli) : paginaManifestoCarga(os, selo)));
  }
  // Laudo/anexo tipado de uma coleta (descaracterização, destruição de dados, foto…).
  // Segurança: a OS tem que ser do CNPJ do cliente, estar liberada, e a chave PRECISA
  // constar em os.anexos (impede acesso a chave arbitrária). Serve o arquivo do R2.
  if (fonte === 'os-anexo') {
    const coletaId = String(url.searchParams.get('os') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    const anexoKey = String(url.searchParams.get('docId') || '').replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 200);
    const os = coletaId ? await lerColetaOS(env, coletaId) : null;
    if (!os) return json({ ok: false, error: 'nao_encontrado' }, 404);
    if (!doc || String(os.clienteDoc || '').replace(/\D/g, '') !== doc) return json({ ok: false, error: 'sem_permissao' }, 403);
    if (!['em_transporte', 'na_unidade', 'concluida'].includes(os.status)) return json({ ok: false, error: 'nao_liberado' }, 403);
    const anexo = (Array.isArray(os.anexos) ? os.anexos : []).find((a) => a.key === anexoKey);
    if (!anexo) return json({ ok: false, error: 'nao_encontrado' }, 404);
    if (!env.R2_ARQUIVOS) return json({ ok: false, error: 'indisponivel' }, 503);
    const obj = await env.R2_ARQUIVOS.get(anexoKey);
    if (!obj) return json({ ok: false, error: 'indisponivel' }, 404);
    const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || anexo.content_type || 'application/octet-stream';
    return new Response(obj.body, { headers: { 'content-type': ct, 'cache-control': 'private, no-store', 'content-disposition': 'inline' } });
  }
  const key = String(url.searchParams.get('docId') || '').replace(/[^a-zA-Z0-9/_.-]/g, '').slice(0, 200);
  if (fonte !== 'r2' || !key) return json({ ok: false, error: 'sem_id' }, 400);
  if (!env.R2_ARQUIVOS || !env.DB_PLOOMES) return json({ ok: false, error: 'indisponivel' }, 503);
  try {
    const row = await env.DB_PLOOMES.prepare('SELECT nome_arquivo, content_type, contact_id, deal_id FROM arquivos_ploomes WHERE r2_key=?1 LIMIT 1').bind(key).first();
    if (!row) return json({ ok: false, error: 'nao_encontrado' }, 404);
    // Dono: o contact_id do arquivo (ou o contato do negócio do arquivo) tem que ser o
    // contato/empresa da sessão OU ter o mesmo documento do cliente.
    const dono = await env.DB_PLOOMES.prepare(
      "SELECT 1 AS ok FROM (SELECT ?1 AS pid UNION SELECT contact_id FROM negocios WHERE ploomes_id=?2) t WHERE t.pid=?3 OR t.pid=?4 OR (?5<>'' AND t.pid IN (SELECT ploomes_id FROM contatos WHERE documento=?5)) LIMIT 1"
    ).bind(Number(row.contact_id) || 0, Number(row.deal_id) || 0, cid, emp, doc).first();
    if (!dono) return json({ ok: false, error: 'sem_permissao' }, 403);
    if (!classificaDoc(row.nome_arquivo).cliente) return json({ ok: false, error: 'sem_permissao' }, 403);
    const obj = await env.R2_ARQUIVOS.get(key);
    if (!obj) return json({ ok: false, error: 'indisponivel' }, 404);
    const limpo = String(row.nome_arquivo || 'documento').replace(/[^\w.\- ]+/g, '').slice(0, 80) || 'documento';
    const nome = /\.[a-z0-9]{2,4}$/i.test(limpo) ? limpo : `${limpo}.pdf`;
    return new Response(obj.body, { status: 200, headers: {
      'content-type': (obj.httpMetadata && obj.httpMetadata.contentType) || row.content_type || 'application/pdf',
      'content-disposition': `attachment; filename="${nome}"`,
      'cache-control': 'private, no-store',
    } });
  } catch (error) { console.error('baixar_doc_erro', safeError(error)); return json({ ok: false, error: 'indisponivel' }, 502); }
}

// Chamado do cliente → vira um LEAD na nossa base (a Débora vê em /leads). Sem Ploomes.
async function abrirChamado(request, sessao, env) {
  let input;
  try { input = await request.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }
  const assunto = String(input?.assunto || '').trim().slice(0, 200);
  const descricao = String(input?.descricao || '').trim().slice(0, 4000);
  if (!assunto) return json({ ok: false, error: 'assunto_obrigatorio' }, 422);
  const r = await ingestLead(env, {
    name: sessao.nome || '', company: sessao.nome || '', email: sessao.email || '',
    material_category: 'Chamado / Suporte (portal)',
    material_description: `Chamado aberto pelo cliente no Portal.\nAssunto: ${assunto}\n\n${descricao}`,
    source: 'portal-chamado',
    documento: sessao.documento || '',
  });
  if (!r || !r.ok) { console.error('criar_chamado_erro', r && r.error); return json({ ok: false, error: 'nao_foi_possivel_abrir' }, 502); }
  return json({ ok: true, chamado_id: r.id, message: 'Chamado aberto! Nossa equipe já recebeu.' }, 201);
}

// Perfil do cliente para PRÉ-PREENCHER o formulário de solicitação de coleta.
// Lê o cadastro da NOSSA base (D1 contatos) — sem Ploomes. O cliente confirma no form.
async function perfilCliente(sessao, env) {
  const doc = String(sessao.documento || '').replace(/\D/g, '');
  const p = { razaoSocial: sessao.nome || '', cnpj: sessao.documento || '', email: sessao.email || '', telefone: '', responsavel: sessao.nome || '' };
  try {
    if (env.DB_PLOOMES) {
      const cid = Number(sessao.empresaId || sessao.contactId) || 0;
      let row = cid ? await env.DB_PLOOMES.prepare('SELECT nome, nome_fantasia, documento, email, telefone FROM contatos WHERE ploomes_id=?1 LIMIT 1').bind(cid).first() : null;
      // Se o cadastro da empresa não tem e-mail/telefone, pega de outro contato com o mesmo documento.
      if (doc && (!row || (!row.email && !row.telefone))) {
        const alt = await env.DB_PLOOMES.prepare("SELECT nome, nome_fantasia, documento, email, telefone FROM contatos WHERE documento=?1 AND (email<>'' OR telefone<>'') ORDER BY (email<>'') DESC LIMIT 1").bind(doc).first();
        if (alt) { if (!row) { row = alt; } else { row.email = row.email || alt.email; row.telefone = row.telefone || alt.telefone; } }
      }
      if (row) {
        p.razaoSocial = row.nome || row.nome_fantasia || p.razaoSocial;
        p.cnpj = row.documento || p.cnpj;
        p.email = row.email || p.email;
        p.telefone = row.telefone || p.telefone;
      }
    }
  } catch (error) { console.error('perfil_erro', safeError(error)); }
  return json({ ok: true, perfil: p });
}

// Consulta de CEP para AUTOPREENCHER o endereço de coleta (evita erro de digitação).
// Usa a BrasilAPI (mesma origem do CNPJ), com User-Agent — sem User-Agent ela recusa.
// Tenta v2 e cai para v1 se preciso. Só devolve o que precisamos (rua, bairro, cidade, UF).
async function consultaCep(request, env) {
  const cep = String(new URL(request.url).searchParams.get('cep') || '').replace(/\D/g, '');
  if (cep.length !== 8) return json({ ok: false, error: 'cep_invalido' }, 422);
  const ua = { 'user-agent': 'EcobrazPortal/1.0', accept: 'application/json' };
  for (const u of [`https://brasilapi.com.br/api/cep/v2/${cep}`, `https://brasilapi.com.br/api/cep/v1/${cep}`]) {
    try {
      const r = await fetch(u, { headers: ua });
      if (r.status === 404) return json({ ok: false, error: 'cep_nao_encontrado' }, 404);
      if (!r.ok) continue;
      const d = await r.json();
      return json({ ok: true, endereco: {
        cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
        logradouro: d.street || '',
        bairro: d.neighborhood || '',
        cidade: d.city || '',
        uf: d.state || '',
      } });
    } catch (error) { console.error('cep_erro', safeError(error)); }
  }
  return json({ ok: false, error: 'indisponivel' }, 502);
}

// Solicitação de coleta: vira um LEAD na nossa base (a Débora vê em /leads e
// converte em cliente/coleta). Sem Ploomes. As fotos enviadas vão para o R2 e
// ficam referenciadas no lead. O endereço de coleta é obrigatório.
// TRIAGEM (matriz Marcio/Debora 2026-07-29): barrado e "só perigosos" são
// recusados aqui mesmo, com explicação honesta; hospitalar vira orçamento;
// grande volume/alto valor vira PRIORITÁRIA (sem cobrança); no resto vale a
// regra da taxa: grátis com 20+ itens (1–7 dias úteis); menos de 20 itens OU
// expressa (até 24h) = R$ 55, cobrança na hora e liberação automática no pago.
async function solicitarOS(request, sessao, env) {
  let input;
  try { input = await request.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }
  const g = (k, n) => String(input?.[k] || '').trim().slice(0, n);
  const endereco = g('endereco', 300);
  if (!endereco) return json({ ok: false, error: 'endereco_obrigatorio' }, 422);
  const razaoSocial = g('razaoSocial', 200), cnpj = g('cnpj', 20), telefone = g('telefone', 30);
  const email = g('email', 120), responsavel = g('responsavel', 120), equipamentos = g('equipamentos', 4000);
  const cep = g('cep', 12), logradouro = g('logradouro', 200), numero = g('numero', 20);
  const bairro = g('bairro', 120), cidade = g('cidade', 120), complemento = g('complemento', 160), uf = g('uf', 2);
  const itens = Math.max(0, Math.min(100000, Number(g('itens', 8).replace(/\D/g, '')) || 0));
  const expressa = input?.expressa === true || input?.expressa === 'sim' || input?.modalidade === 'expressa';
  const triagem = classificarPedido(`${equipamentos} ${itens ? itens + ' itens' : ''}`);
  if (triagem.tipo === 'barrado') {
    return json({ ok: false, error: 'material_nao_coletado', tipo: 'barrado', itens: triagem.itens, message: `Infelizmente não coletamos: ${triagem.itens.join(', ')}. Se o seu descarte também inclui equipamentos eletrônicos, descreva só os equipamentos e envie de novo — ou fale com a nossa equipe.` }, 422);
  }
  if (triagem.tipo === 'so_perigosos') {
    return json({ ok: false, error: 'so_itens_perigosos', tipo: 'so_perigosos', itens: triagem.itens, message: `Itens como ${triagem.itens.join(' · ')} têm custo por unidade e só são coletados JUNTO com outros equipamentos eletrônicos — não fazemos coleta só deles. Inclua os equipamentos na lista ou fale com a nossa equipe.` }, 422);
  }
  const minGratis = Math.max(1, Number(env.COLETA_ITENS_GRATIS) || 20);
  const valorTaxa = Math.max(1, Number(env.TAXA_COLETA_REAIS) || 55);
  const poucoVolume = itens > 0 && itens < minGratis;
  const cobrar = triagem.tipo === 'normal' && (expressa || poucoVolume);
  const descricao = [
    'Solicitação de coleta pelo Portal do Cliente.',
    cnpj ? `CNPJ/CPF: ${cnpj}` : '',
    `Endereço de coleta: ${endereco}`,
    (cep || logradouro) ? `  (CEP ${cep} · ${logradouro}${numero ? ', ' + numero : ''}${complemento ? ' · ' + complemento : ''} · ${bairro} · ${cidade}${uf ? '/' + uf : ''})` : '',
    responsavel ? `Responsável: ${responsavel}` : '',
    `Quantidade de itens: ${itens || '(não informada)'}`,
    `Modalidade: ${expressa ? '⚡ EXPRESSA (até 24h)' : 'tradicional (1 a 7 dias úteis)'}`,
    `Equipamentos:\n${equipamentos || '(não informado)'}`,
  ].filter(Boolean).join('\n');
  const r = await ingestLead(env, {
    name: responsavel || sessao.nome || '', company: razaoSocial || sessao.nome || '',
    email: email || sessao.email || '', phone: telefone,
    material_category: 'Solicitação de coleta (portal)', material_description: descricao,
    postal_code: cep, city: cidade, state: uf, profile: cnpj ? 'empresa' : 'pessoa_fisica',
    source: 'portal-coleta', volume: itens ? `${itens} itens` : '',
    documento: sessao.documento || cnpj,
  });
  if (!r || !r.ok) { console.error('solicitar_os_erro', r && r.error); return json({ ok: false, error: 'nao_foi_possivel' }, 502); }
  // Cliente Premium/Plus: a coleta dele entra com PRIORIDADE (benefício do porte),
  // mesmo que a triagem por material/volume não a marque como prioritária.
  try {
    const seg = await segmentoDoCliente(env, sessao.documento);
    if (seg.prioritario && triagem.tipo === 'normal') {
      const lead = await lerLead(env, r.id);
      if (lead) {
        lead.prioridade = 'alta';
        lead.descricao = `⭐ CLIENTE ${seg.rotulo.toUpperCase()} — atender com prioridade.\n${lead.descricao}`;
        await salvarLead(env, lead);
        await atualizarIndexLead(env, r.id, { prioridade: 'alta', triagem: 'prioritaria' });
      }
    }
  } catch (error) { console.error('premium_prioridade', safeError(error)); }
  // Fotos → R2 (referenciadas no lead). Cada foto já vem reduzida (JPEG) do navegador.
  const fotos = Array.isArray(input.fotos) ? input.fotos.slice(0, 4) : [];
  let fotosOk = 0;
  if (fotos.length && env.R2_ARQUIVOS) {
    const refs = [];
    for (let i = 0; i < fotos.length; i++) {
      try {
        const m = /^data:(image\/[\w.+-]+);base64,(.+)$/i.exec(String(fotos[i]?.dataUrl || ''));
        if (!m) continue;
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const key = `coleta-anexo/lead/${r.id}-${rand}.jpg`;
        await env.R2_ARQUIVOS.put(key, bytes, { httpMetadata: { contentType: m[1] } });
        refs.push({ key, nome: String(fotos[i]?.nome || `foto-${i + 1}`).slice(0, 80) });
        fotosOk++;
      } catch (error) { console.error('foto_lead', safeError(error)); }
    }
    if (refs.length) { try { const lead = await lerLead(env, r.id); if (lead) { lead.fotos = refs; await salvarLead(env, lead); } } catch (error) { console.error('foto_ref', safeError(error)); } }
  }
  // Respostas por destino da triagem (sem cobrança para orçamento e prioritária).
  if (triagem.tipo === 'orcamento') {
    return json({ ok: true, pedido_id: r.id, tipo: 'orcamento', fotos: fotosOk, message: 'Recebemos! Esse tipo de material tem categoria à parte e precisa de orçamento: nossa equipe vai avaliar e entrar em contato com a proposta antes de qualquer coleta.' }, 201);
  }
  if (triagem.tipo === 'prioritaria') {
    return json({ ok: true, pedido_id: r.id, tipo: 'prioritaria', fotos: fotosOk, message: '🌟 Recebemos! Pelo volume/valor informado, sua coleta entra como PRIORITÁRIA: nossa equipe entra em contato com prioridade para agendar a coleta de um dia para o outro — sem custo.' }, 201);
  }
  // Taxa de R$ 55: expressa (até 24h) OU menos de 20 itens. Nunca soma as duas.
  let pagamento = null;
  if (cobrar) {
    const motivo = expressa && poucoVolume ? `coleta expressa + menos de ${minGratis} itens` : (expressa ? 'coleta expressa (até 24h)' : `menos de ${minGratis} itens`);
    const ref = `coleta-${r.id}`;
    try {
      const base = String(env.PORTAL_BASE_URL || env.PORTAL_URL || new URL(request.url).origin).replace(/\/+$/, '');
      const s = await criarCheckoutStripe({ valor: valorTaxa, descricao: expressa ? 'Coleta Expressa Ecobraz — até 24h' : 'Taxa de coleta Ecobraz — pequeno volume', externalReference: ref, baseUrl: base, backPath: '/pagamento/ok', clienteEmail: (email || sessao.email || ''), metodos: ['card', 'boleto'] }, env);
      if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'coleta', leadId: r.id, expressa, itens, valor: valorTaxa, status: 'pendente', clienteEmail: email || sessao.email || '', clienteNome: responsavel || sessao.nome || '', criadoEm: nowS() }), { expirationTtl: 30 * 86400 });
      const lead = await lerLead(env, r.id);
      if (lead) {
        lead.cobranca = { valor: valorTaxa, motivo, ref, link: s.url, status: 'aguardando', criadoEm: nowS() };
        lead.expressa = expressa;
        // Menos de 20 itens: só agenda depois de pago. Expressa com 20+: se não
        // pagar, a coleta segue valendo como tradicional gratuita.
        if (poucoVolume) lead.status = 'aguardando-pagamento';
        lead.descricao = `💳 TAXA DE R$ ${valorTaxa} (${motivo}) — AGUARDANDO PAGAMENTO. ${poucoVolume ? 'SÓ AGENDAR DEPOIS DE PAGO.' : 'Se não pagar, tratar como tradicional gratuita (1–7 dias úteis).'}\n\n${lead.descricao}`;
        await salvarLead(env, lead);
        await atualizarIndexLead(env, r.id, { pagamento: 'aguardando', status: lead.status });
      }
      pagamento = { valor: valorTaxa, link: s.url, motivo };
    } catch (error) {
      // Mercado Pago fora do ar / sem chave: NUNCA cobra às cegas nem trava o
      // pedido — registra para a equipe combinar a cobrança manualmente.
      console.error('coleta_taxa_mp', safeError(error));
      await registrarFalha(env, 'compra-taxa-coleta', safeError(error), { lead: r.id, expressa, itens });
      try { const lead = await lerLead(env, r.id); if (lead) { lead.cobranca = { valor: valorTaxa, motivo, ref, status: 'cobrar-manual' }; lead.descricao = `💳 TAXA DE R$ ${valorTaxa} (${motivo}) — o link de pagamento NÃO pôde ser gerado; combinar a cobrança com o cliente.\n\n${lead.descricao}`; await salvarLead(env, lead); await atualizarIndexLead(env, r.id, { pagamento: 'aguardando' }); } } catch { /* segue */ }
      pagamento = { valor: valorTaxa, motivo, indisponivel: true };
    }
  }
  if (pagamento && pagamento.link) {
    return json({ ok: true, pedido_id: r.id, tipo: expressa ? 'expressa' : 'normal', fotos: fotosOk, pagamento, message: `Quase lá! Para confirmar sua coleta ${expressa ? 'EXPRESSA (até 24h)' : ''} falta o pagamento da taxa de R$ ${valorTaxa} (${pagamento.motivo}). A liberação é automática assim que o pagamento é aprovado.` }, 201);
  }
  if (pagamento) {
    return json({ ok: true, pedido_id: r.id, tipo: expressa ? 'expressa' : 'normal', fotos: fotosOk, pagamento, message: `Recebemos sua solicitação! Há uma taxa de R$ ${valorTaxa} (${pagamento.motivo}) e nossa equipe vai combinar o pagamento com você — o link automático não pôde ser gerado agora.` }, 201);
  }
  return json({ ok: true, pedido_id: r.id, tipo: 'normal', fotos: fotosOk, message: 'Pronto! Sua solicitação de coleta foi enviada — coleta gratuita com prazo de 1 a 7 dias úteis. Nossa equipe vai entrar em contato para agendar.' }, 201);
}

function rotuloStatus(statusId) {
  // Aproximação amigável para o cliente. TODO(validar) conforme o funil de OS.
  switch (Number(statusId)) {
    case 1: return 'Em andamento';
    case 2: return 'Concluído';
    case 3: return 'Encerrado';
    default: return 'Em andamento';
  }
}

// ---------------------------------------------------------------------------
// E-mail de login (E-goi transacional — mesmo padrão do Worker de coletas)
// ---------------------------------------------------------------------------
let _senderId = null;
async function resolverSender(apiKey, env) {
  if (env.EGOI_SENDER_ID) return env.EGOI_SENDER_ID;
  if (_senderId) return _senderId;
  const base = env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const r = await fetch(`${base}/v2/email/senders`, { headers: { ApiKey: apiKey, accept: 'application/json' } });
  if (!r.ok) { console.error('egoi_senders_erro', { status: r.status }); return null; }
  let data; try { data = await r.json(); } catch { console.error('egoi_senders_json'); return null; }
  const list = Array.isArray(data) ? data : (data.items || data.senders || data.data || data.list || []);
  const pick = (list || []).find((x) => x && (x.sender_id || x.id || x.senderId)) || (list || [])[0];
  _senderId = pick ? (pick.sender_id || pick.id || pick.senderId) : null;
  if (!_senderId) console.error('egoi_sem_sender_na_lista', { qtd: (list || []).length });
  return _senderId;
}

// "Você já é cliente!" — resposta automática quando um pedido do SITE vem de um
// e-mail que já está na base: convida a usar o portal, com link mágico pronto.
// Incentiva o sistema e evita lead pendente de quem já é cliente.
async function enviarEmailJaCliente(cliente, link, env) {
  const primeiro = String(cliente.nome || '').split(/\s+/)[0] || '';
  const assunto = 'Você já é cliente Ecobraz — abra sua coleta pelo portal 🚀';
  const texto = `Olá${primeiro ? ' ' + primeiro : ''}!\n\nRecebemos seu pedido pelo site — e temos uma boa notícia: você já é cliente Ecobraz.\n\nO caminho mais rápido é o portal: entre pelo link abaixo (vale uma vez) e abra sua coleta em 1 minuto, com acompanhamento em tempo real e todos os documentos:\n${link}\n\nSeu pedido do site também ficou registrado — nada se perde.\n\nEcobraz · sistema.ecobraz.org`;
  const htmlCorpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">EMIGRE</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">Você já é nosso cliente! 🎉</h1><p style="font-size:14px;line-height:1.6;color:#4F6469">Recebemos seu pedido pelo site. O caminho mais rápido é o <b>portal do cliente</b>: abra sua coleta em 1 minuto, acompanhe em tempo real e baixe todos os documentos.</p><a href="${link}" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0">Entrar no portal e abrir minha coleta →</a><p style="font-size:11.5px;color:#8fa39f;line-height:1.5">O link vale uma vez; se expirar, peça outro em sistema.ecobraz.org. Seu pedido do site também ficou registrado — nada se perde.</p></div></div>`;
  if (env.RESEND_API_KEY) {
    const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: [cliente.email], subject: assunto, html: htmlCorpo, text: texto };
    if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('resend_ja_cliente_' + r.status);
    return;
  }
  await enviarEmailLogin(cliente, link, env); // reserva (e-Goi): pelo menos o link chega
}

// Confirmação automática da taxa de coleta paga (expressa / pequeno volume).
async function enviarEmailColetaPaga(ped, env) {
  if (!env.RESEND_API_KEY || !ped.clienteEmail) return;
  const primeiro = String(ped.clienteNome || '').split(/\s+/)[0] || '';
  const expressa = !!ped.expressa;
  const assunto = expressa ? '⚡ Pagamento aprovado — sua coleta expressa está confirmada' : 'Pagamento aprovado — sua coleta está confirmada';
  const prazo = expressa ? 'em até 24 horas' : 'no prazo de 1 a 7 dias úteis';
  const texto = `Olá${primeiro ? ' ' + primeiro : ''}!\n\nRecebemos o pagamento da taxa de R$ ${ped.valor} e sua coleta está CONFIRMADA — nossa equipe fará a coleta ${prazo}.\n\nQualquer dúvida, é só responder este e-mail ou falar com a gente pelo portal.\n\nEcobraz · sistema.ecobraz.org`;
  const htmlCorpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">EMIGRE</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">${expressa ? '⚡ Coleta expressa confirmada!' : 'Coleta confirmada!'}</h1><p style="font-size:14px;line-height:1.6;color:#4F6469">Recebemos o pagamento da taxa de <b>R$ ${ped.valor}</b>. Sua coleta será feita <b>${prazo}</b>. Acompanhe tudo pelo portal.</p><a href="https://sistema.ecobraz.org/painel" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0">Abrir o portal →</a></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: [ped.clienteEmail], subject: assunto, html: htmlCorpo, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_coleta_paga_' + r.status);
}

// Confirmação automática do pagamento de uma OS cobrada (OS paga).
async function enviarEmailCobrancaOSPaga(ped, env) {
  if (!env.RESEND_API_KEY || !ped.clienteEmail) return;
  const num = ped.numero ? ` ${ped.numero}` : '';
  const assunto = `Pagamento aprovado — coleta${num} confirmada ✔`;
  const texto = `Olá!\n\nRecebemos o pagamento de R$ ${ped.valor} referente à sua coleta${num}. Está tudo certo — obrigado!\n\nO comprovante e os documentos ficam disponíveis no portal.\n\nEcobraz · sistema.ecobraz.org`;
  const htmlCorpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">EMIGRE</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">Pagamento aprovado ✔</h1><p style="font-size:14px;line-height:1.6;color:#4F6469">Recebemos o pagamento de <b>R$ ${ped.valor}</b> da sua coleta${num}. Está tudo certo — obrigado! Os documentos ficam no portal.</p><a href="https://sistema.ecobraz.org/painel" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0">Abrir o portal →</a></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: [ped.clienteEmail], subject: assunto, html: htmlCorpo, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_oscobranca_' + r.status);
}

// Avisa a EQUIPE (Débora/comercial) quando uma OS é paga, e informa se a coleta foi
// liberada pro motorista ou se ainda falta escolher um. Destinatários: env
// COBRANCA_NOTIFY_EMAILS (se definido) ou a lista do escritório (ESCRITORIO_EMAILS).
// De-dup por KV para não repetir em reenvio de webhook. Best-effort — nunca bloqueia.
async function avisarEquipeCobrancaPaga(env, os, pg) {
  if (!env.RESEND_API_KEY || !os) return;
  // Destinatário do aviso: a Débora (comercial). Sobrescreve por env se um dia mudar.
  const listaEnv = env.COBRANCA_NOTIFY_EMAILS
    ? String(env.COBRANCA_NOTIFY_EMAILS).split(/[,;]+/).map((s) => s.split('|')[0].trim().toLowerCase()).filter(Boolean)
    : ['debora.villanova@ecobraz.org.br'];
  const dest = [...new Set(listaEnv)].filter((e) => /^\S+@\S+\.\S+$/.test(e)).slice(0, 25);
  if (!dest.length) return;
  const chave = `notif:oscobranca:equipe:${os.id}`;
  if (env.PORTAL_KV && await env.PORTAL_KV.get(chave)) return;
  const num = os.numero || '';
  const valor = os.cobranca ? String(os.cobranca.valor).replace('.', ',') : String((pg && pg.valor) || '');
  const liberou = !!(os.cobranca && os.cobranca.liberouEmTransporte);
  const semMotorista = os.status === 'agendada' && !os.agenteEmail;
  const situacao = liberou
    ? '✅ A coleta foi liberada automaticamente para o motorista (Em transporte).'
    : (semMotorista
      ? '⚠️ Falta escolher o motorista — a coleta está Agendada. Escolha o motorista para liberar no app do motorista.'
      : `A coleta está marcada como paga e liberada. Status atual: ${os.status}.`);
  const link = `https://sistema.ecobraz.org/coletas/os?id=${encodeURIComponent(os.id)}`;
  const assunto = `💰 OS ${num} PAGA — ${os.clienteNome || 'cliente'}`.slice(0, 120);
  const texto = `A OS ${num} (${os.clienteNome || 'cliente'}) foi PAGA — R$ ${valor}.\n\n${situacao}\n\nAbrir a OS: ${link}\n\nEcobraz · sistema`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">COBRANÇA PAGA</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">💰 OS ${esc(num)} paga</h1><p style="font-size:14px;line-height:1.6;color:#4F6469"><b>${esc(os.clienteNome || 'Cliente')}</b> pagou <b>R$ ${esc(valor)}</b>.</p><p style="font-size:14px;line-height:1.6;color:#10262B;background:#F2F6F4;border-radius:10px;padding:12px 14px">${esc(situacao)}</p><a href="${esc(link)}" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0">Abrir a OS →</a></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: dest, subject: assunto, html, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_equipe_oscobranca_' + r.status);
  if (env.PORTAL_KV) await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 });
}

// Envia ao CLIENTE o link de aceite do contrato (proposta da Débora).
async function enviarEmailAceite(p, link, env) {
  if (!env.RESEND_API_KEY) throw new Error('sem_chave_email');
  const para = p.cliente && p.cliente.email;
  if (!para) throw new Error('sem_email');
  const quem = (p.cliente.contato || p.cliente.nome || '').split(/\s+/)[0];
  const assunto = `Contrato para aceite — Ecobraz (ref. ${p.numero})`;
  const texto = `Olá${quem ? ' ' + quem : ''}!\n\nSegue o contrato da Ecobraz (ref. ${p.numero}) para sua conferência e aceite.\n\nAbra o link, confira o documento e assine direto na tela (leva 1 minuto):\n${link}\n\nQualquer dúvida, estamos à disposição.\nEcobraz · ${p.numero}`;
  const htmlCorpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">CONTRATO</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">Contrato para aceite ✍️</h1><p style="font-size:14px;line-height:1.6;color:#4F6469">Olá${quem ? ' <b>' + esc(quem) + '</b>' : ''}! Segue o contrato da Ecobraz (ref. <b>${esc(p.numero)}</b>) para sua conferência. Abra, confira o documento e <b>assine direto na tela</b> — leva 1 minuto.</p><a href="${esc(link)}" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0">Conferir e assinar →</a><p style="font-size:12px;color:#8fa39f;line-height:1.5">Se o botão não funcionar, copie e cole este endereço no navegador:<br>${esc(link)}</p></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: [para], subject: assunto, html: htmlCorpo, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_aceite_' + r.status);
}
// Avisa a EQUIPE (Débora) quando o cliente aceita e assina. Best-effort.
async function avisarEquipeAceite(env, p) {
  if (!env.RESEND_API_KEY || !p || !p.aceite) return;
  const listaEnv = env.PROPOSTA_NOTIFY_EMAILS || env.COBRANCA_NOTIFY_EMAILS
    ? String(env.PROPOSTA_NOTIFY_EMAILS || env.COBRANCA_NOTIFY_EMAILS).split(/[,;]+/).map((s) => s.split('|')[0].trim().toLowerCase()).filter(Boolean)
    : ['debora.villanova@ecobraz.org.br'];
  const dest = [...new Set(listaEnv)].filter((e) => /^\S+@\S+\.\S+$/.test(e)).slice(0, 25);
  if (!dest.length) return;
  const a = p.aceite;
  const link = `https://sistema.ecobraz.org/contrato/ver?id=${encodeURIComponent(p.id)}`;
  const assunto = `✍️ Contrato ${p.numero} ACEITO — ${(p.cliente && p.cliente.nome) || 'cliente'}`.slice(0, 120);
  const texto = `O contrato ${p.numero} (${(p.cliente && p.cliente.nome) || 'cliente'}) foi aceito e assinado eletronicamente.\n\nPor: ${a.nome} (CPF ${a.cpf})\nQuando: ${a.dt}\nCódigo: ${a.codigo}\n\nVer o contrato assinado: ${link}\n\nEcobraz · sistema`;
  const htmlCorpo = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#10262B"><div style="background:#00333B;border-radius:14px 14px 0 0;padding:18px 22px"><span style="color:#fff;font-size:18px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;margin-left:8px">ACEITE</span></div><div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 14px 14px;padding:24px 22px"><h1 style="font-size:19px;margin:0 0 10px">✍️ Contrato ${esc(p.numero)} aceito</h1><p style="font-size:14px;line-height:1.6;color:#4F6469"><b>${esc((p.cliente && p.cliente.nome) || 'Cliente')}</b> aceitou e assinou eletronicamente.<br>Por <b>${esc(a.nome)}</b> · código <b>${esc(a.codigo)}</b>.</p><a href="${esc(link)}" style="display:block;background:#92C430;color:#10262B;text-decoration:none;border-radius:10px;padding:14px;text-align:center;font-weight:800;font-size:15px;margin:16px 0">Ver o contrato assinado →</a></div></div>`;
  const payload = { from: env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>', to: dest, subject: assunto, html: htmlCorpo, text: texto };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error('resend_equipe_aceite_' + r.status);
}

async function enviarEmailLogin(cliente, link, env) {
  // Preferimos o Resend (API simples e compatível com Cloudflare Workers). O E-goi
  // fica como reserva enquanto o envio transacional dele não estiver resolvido.
  if (env.RESEND_API_KEY) return await enviarViaResend(cliente, link, env);

  const apiKey = env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY;
  if (!apiKey) throw new Error('sem_chave_email');
  const senderId = await resolverSender(apiKey, env);
  if (!senderId) throw new Error('sem_remetente');
  const base = env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const payload = {
    sender_id: senderId,
    subject: 'Seu acesso ao Portal Ecobraz',
    to: [cliente.email],
    html_body: emailHtml(cliente, link),
    text_body: `Olá,\n\nUse o link abaixo para acessar o Portal Ecobraz (vale uma vez, expira em 60 minutos):\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.\n\nEcobraz`,
    open_tracking: false,
    click_tracking: false,
  };
  if (env.EGOI_SENDER_NAME) payload.sender_name = env.EGOI_SENDER_NAME;
  if (env.EGOI_REPLY_TO_ID) payload.reply_to_id = env.EGOI_REPLY_TO_ID;
  const r = await fetch(`${base}/v2/email/messages/action/send`, { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: apiKey }, body: JSON.stringify(payload) });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`egoi_tx_${r.status}:${b.slice(0, 140)}`); }
}

// Envio via Resend (https://resend.com) — POST simples, ideal para Cloudflare Workers.
// RESEND_FROM é o remetente; no teste inicial use o padrão do Resend (onboarding@resend.dev),
// depois troque para acesso@ecobraz.org.br após verificar o domínio no Resend.
async function enviarViaResend(cliente, link, env) {
  // Domínio ecobraz.org.br verificado no Resend → envia de acesso@ecobraz.org.br
  // para qualquer cliente. RESEND_FROM pode sobrescrever se quiser outro remetente.
  const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
  const payload = {
    from,
    to: [cliente.email],
    subject: 'Seu acesso ao Portal Ecobraz',
    html: emailHtml(cliente, link),
    text: `Olá,\n\nUse o link abaixo para acessar o Portal Ecobraz (vale uma vez, expira em 60 minutos):\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.\n\nEcobraz`,
  };
  if (env.RESEND_REPLY_TO) payload.reply_to = env.RESEND_REPLY_TO;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`resend_${r.status}:${b.slice(0, 160)}`); }
}

// Frota ao vivo: junta os veículos cadastrados, as coletas relevantes (em transporte,
// agendadas até hoje e concluídas na semana) e as posições do RotaExata (quando o
// mapeamento estiver ativo). Carrega o registro COMPLETO só das coletas de interesse
// (o índice não guarda a placa) — no máximo 40 leituras, barato.
async function montarFrotaAoVivo(env) {
  const [veics, idx, posRes] = await Promise.all([
    listarVeiculos(env).catch(() => []),
    listarColetasOS(env).catch(() => []),
    posicoesFrota(env),
  ]);
  const normP = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hojeBR = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const d7 = new Date(Date.now() - 3 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10);
  const interesse = idx.filter((c) => c && (c.status === 'em_transporte'
    || (c.status === 'agendada' && (!c.dataAgendada || c.dataAgendada <= hojeBR))
    || (c.status === 'concluida' && String(c.criadoEm || '').slice(0, 10) >= d7))).slice(0, 40);
  const cheias = [];
  for (const c of interesse) { try { const full = await lerColetaOS(env, c.id); if (full) cheias.push(full); } catch { /* segue */ } }
  cheias.sort((a, b) => String(a.dataAgendada || '9999').localeCompare(String(b.dataAgendada || '9999')));
  const porPlaca = new Map();
  for (const v of (veics || []).filter((x) => x && x.placa && x.ativo !== false)) {
    porPlaca.set(normP(v.placa), { placa: v.placa, apelido: v.apelido || v.modelo || '', motorista: '', coletaAtual: null, proxima: null, concluidasHoje: 0, pos: null });
  }
  for (const full of cheias) {
    const k = normP(full.veiculoPlaca);
    if (!k) continue;
    if (!porPlaca.has(k)) porPlaca.set(k, { placa: full.veiculoPlaca, apelido: '', motorista: '', coletaAtual: null, proxima: null, concluidasHoje: 0, pos: null });
    const reg = porPlaca.get(k);
    if (full.agenteNome && !reg.motorista) reg.motorista = full.agenteNome;
    if (full.status === 'em_transporte' && !reg.coletaAtual) reg.coletaAtual = { numero: full.numero || '', cliente: full.clienteNome || '' };
    else if (full.status === 'agendada' && !reg.proxima) reg.proxima = { numero: full.numero || '', cliente: full.clienteNome || '' };
    if (full.status === 'concluida' && String(full.atualizadoEm || '').slice(0, 10) === hojeBR) reg.concluidasHoje++;
  }
  const posPor = new Map();
  for (const v of (posRes.veiculos || [])) posPor.set(normP(v.placa), v);
  for (const [k, reg] of porPlaca) { const p = posPor.get(k); if (p) reg.pos = { lat: p.lat, lng: p.lng, velocidade: p.velocidade ?? null, em: p.em || null }; }
  // Rastreadores com posição cuja placa NÃO casou com nenhuma do cadastro da Frota:
  // entram no fim da lista com etiqueta, para a divergência APARECER (em vez de a
  // posição sumir em silêncio) — aí é só acertar a placa no Cadastro da Frota.
  // Exceção: placas marcadas como "não usamos mais" (KV frota:ocultarRastreador)
  // ficam de fora da tela; o rodapé mostra o total e permite reexibir.
  let ocultas = [];
  try { if (env.PORTAL_KV) ocultas = JSON.parse((await env.PORTAL_KV.get('frota:ocultarRastreador')) || '[]'); } catch { ocultas = []; }
  let ocultos = 0;
  for (const [k, p] of posPor) {
    if (porPlaca.has(k)) continue;
    if (ocultas.includes(k)) { ocultos++; continue; }
    porPlaca.set(k, { placa: p.placa, apelido: p.apelido || '', motorista: '', coletaAtual: null, proxima: null, concluidasHoje: 0, foraCadastro: true, pos: { lat: p.lat, lng: p.lng, velocidade: p.velocidade ?? null, em: p.em || null } });
  }
  return { ok: true, posOk: !!posRes.ok, motivo: posRes.motivo || '', ocultos, frota: [...porPlaca.values()] };
}

// Adote um Bairro — renovação por LINK: quando o crédito recorrente fica ≤20kg, gera a
// cobrança e envia o link por e-mail. Idempotente: não reenvia enquanto houver pedido de
// recarga pendente. Best-effort: se o Mercado Pago não estiver configurado, apenas registra.
async function verificarRecargaAdote(env, clienteId, baseUrl) {
  if (!env.PORTAL_KV || !clienteId) return;
  const cred = await lerCredito(env, clienteId);
  if (!cred || !precisaRecarga(cred)) return;
  if (cred.recargaPendente && cred.recargaPendente.ref) {
    const raw = await env.PORTAL_KV.get(`pedido:${cred.recargaPendente.ref}`);
    const pp = raw ? JSON.parse(raw) : null;
    if (pp && pp.status === 'pendente') return; // link já enviado, aguardando pagamento
  }
  const pac = acharPacote(cred.pacoteId);
  if (!pac) return;
  const cliente = await lerCliente(env, clienteId);
  const email = (cliente && cliente.email) || '';
  const valor = precoPacote(pac, cred.faixa);
  const ref = novoId();
  const base = String(baseUrl || '').replace(/\/+$/, '');
  await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'adote', evento: 'recarga', status: 'pendente', clienteId, clienteNome: cred.clienteNome, doc: cred.doc || '', pacoteId: pac.id, faixa: cred.faixa || '', tipo: 'recorrente', valor, kg: pac.kg, email, criadoEm: nowS() }), { expirationTtl: 14 * 86400 });
  const s = await criarCheckoutStripe({ valor, descricao: `Adote um Bairro — renovação ${pac.ton}t (recorrente)`, externalReference: ref, baseUrl: base, backPath: '/pagamento/ok', clienteEmail: email, metodos: ['card', 'boleto'] }, env);
  cred.recargaPendente = { ref, em: nowS() };
  await salvarCredito(env, cred);
  if (email) { try { await enviarEmailRecarga({ nome: cred.clienteNome, email }, s.url, pac.ton, env); console.log('adote_recarga_email_ok', { cliente: clienteId }); } catch (e) { console.error('adote_recarga_email_falhou', safeError(e)); } }
  console.log('adote_recarga_gerada', { cliente: clienteId, saldo: cred.saldoKg, ref });
}

// E-mail de renovação (Adote um Bairro) — mesmo esquema do login (Resend, com e-Goi de reserva).
async function enviarEmailRecarga(cliente, link, ton, env) {
  const assunto = 'Seu crédito Ecobraz está acabando — renove em 1 toque';
  const primeiro = cliente.nome ? esc(String(cliente.nome).split(' ')[0]) : '';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#10262B">
    <div style="background:#00333B;padding:20px 24px;border-radius:12px 12px 0 0"><span style="color:#fff;font-size:20px;font-weight:800">ecobraz</span><span style="color:#92C430;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">adote um bairro</span></div>
    <div style="border:1px solid #E4EBE9;border-top:none;border-radius:0 0 12px 12px;padding:24px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 14px">Olá${primeiro ? ', ' + primeiro : ''}! Seu crédito de coleta está chegando ao fim.</p>
      <p style="font-size:14px;line-height:1.6;color:#4F6469;margin:0 0 20px">Para não ficar sem coleta, renove o seu pacote de <b>${esc(String(ton))} tonelada(s)</b> com os <b>10% de desconto</b> da recorrência. É só confirmar:</p>
      <a href="${esc(link)}" style="display:inline-block;background:#92C430;color:#10262B;font-weight:800;font-size:15px;text-decoration:none;padding:13px 22px;border-radius:10px">Renovar meu crédito →</a>
      <p style="font-size:12px;color:#9aa7a4;margin:20px 0 0;line-height:1.6">Sem contrato e sem fidelidade — você renova quando quiser.</p>
    </div></div>`;
  const texto = `Olá! Seu crédito de coleta Ecobraz está acabando. Renove o pacote de ${ton}t (recorrente, 10% de desconto) neste link:\n${link}\n\nEcobraz — Adote um Bairro`;
  if (env.RESEND_API_KEY) {
    const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` }, body: JSON.stringify({ from, to: [cliente.email], subject: assunto, html, text: texto }) });
    if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`resend_${r.status}:${b.slice(0, 140)}`); }
    return;
  }
  const apiKey = env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY;
  if (!apiKey) throw new Error('sem_chave_email');
  const senderId = await resolverSender(apiKey, env);
  if (!senderId) throw new Error('sem_remetente');
  const base = env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const payload = { sender_id: senderId, subject: assunto, to: [cliente.email], html_body: html, text_body: texto, open_tracking: false, click_tracking: false };
  if (env.EGOI_SENDER_NAME) payload.sender_name = env.EGOI_SENDER_NAME;
  if (env.EGOI_REPLY_TO_ID) payload.reply_to_id = env.EGOI_REPLY_TO_ID;
  const r = await fetch(`${base}/v2/email/messages/action/send`, { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: apiKey }, body: JSON.stringify(payload) });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`egoi_tx_${r.status}:${b.slice(0, 140)}`); }
}

// E-mail para o financeiro emitir a NF (via Resend). TESTE → vai para o Marcio (não
// incomoda o financeiro). PRODUÇÃO → defina NF_EMAIL=pagamento@ecobraz.org.br.
async function enviarEmailNF(pedido, pagamento, env) {
  if (!env.RESEND_API_KEY) return;
  const to = env.NF_EMAIL || 'marcio@ecobraz.org.br';
  const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
  const empresa = (pedido && pedido.empresa) || {};
  const linhas = [
    'Produto: Cálculo detalhado de pegada de carbono — GHG Protocol',
    `Valor pago: R$ ${Number(pagamento.valor || 0).toFixed(2)}`,
    `Pagamento ID: ${pagamento.id}`,
    empresa.razaoSocial ? `Empresa: ${empresa.razaoSocial}` : null,
    empresa.cnpj ? `CNPJ: ${empresa.cnpj}` : null,
    `Pedido: ${pagamento.externalReference}`,
  ].filter(Boolean);
  const texto = `Nova venda no Portal Ecobraz.\n\n${linhas.join('\n')}\n\nEmita a NF e envie ao cliente.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#10262B"><h2 style="color:#00333B;margin:0 0 12px">Nova venda — emitir NF</h2><p style="line-height:1.7">${linhas.join('<br>')}</p><p>Emita a NF e envie ao cliente.</p></div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from, to: [to], subject: 'Nova venda — Cálculo de pegada de carbono (emitir NF)', html, text: texto }),
  });
}

// ---------------------------------------------------------------------------
// LIBERAÇÃO de um pedido PAGO (fulfillment). Mesma lógica do webhook do Mercado
// Pago, mas reaproveitável pela Stripe (webhook + página de retorno). O chamador
// só chama quando marca como pago pela 1ª vez (idempotência é dele). pg = objeto
// normalizado { id, valor, externalReference, payerEmail } — igual ao do MP.
// (Duplicado de propósito por ora: não mexo no fluxo do MP que já vende, para
// não arriscar. Quando a Stripe estiver 100%, unifico os dois.)
async function fulfillPedidoPago(env, ped, pg) {
  const chave = `pedido:${pg.externalReference}`;
  if (ped.produto === 'adote') {
    try {
      const pac = acharPacote(ped.pacoteId);
      if (pac) {
        let cred = (await lerCredito(env, ped.clienteId)) || novoCredito(ped.clienteId, ped.clienteNome, ped.doc);
        if (!cred.doc && ped.doc) cred.doc = String(ped.doc).replace(/\D/g, '');
        if (ped.evento === 'recarga') {
          cred = aplicarRecarga(cred, pac, ped.valor, pg.externalReference, nowS());
          if (cred.recargaPendente && cred.recargaPendente.ref === pg.externalReference) cred.recargaPendente = null;
        } else {
          cred = aplicarCompra(cred, pac, ped.tipo, ped.valor, pg.externalReference, nowS(), ped.faixa);
        }
        await salvarCredito(env, cred);
        console.log('adote_credito', { cliente: ped.clienteId, saldo: cred.saldoKg, evento: ped.evento || 'compra' });
      }
    } catch (error) { console.error('adote_credito_falhou', safeError(error)); await registrarFalha(env, 'compra-adote-credito', safeError(error), { pedido: pg.externalReference }); }
  } else if (ped.produto === 'carbono') {
    try {
      ped.validade = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
      if (pg.payerEmail) ped.email = pg.payerEmail;
      await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 400 * 86400 });
      if (ped.nivel === 'contratado') {
        await ingestLead(env, { email: pg.payerEmail || '', company: '', material_category: 'Carbono — Contratado (PAGO)', material_description: `Cliente CONTRATOU e PAGOU o inventário nível Contratado. A Villanova coleta os dados e faz o inventário.\nFaturamento: ${ped.faixa}\nValor: R$ ${ped.valor}\nPedido: ${pg.externalReference}\nE-mail do pagador: ${pg.payerEmail || '(não informado)'}`, source: 'carbono-contratado-pago' });
      }
    } catch (error) { console.error('carbono_pago_falhou', safeError(error)); await registrarFalha(env, 'compra-carbono', safeError(error), { pedido: pg.externalReference }); }
  } else if (ped.produto === 'esg') {
    try {
      ped.validade = new Date(Date.now() + 365 * 86400 * 1000).toISOString();
      if (pg.payerEmail) ped.email = pg.payerEmail;
      await env.PORTAL_KV.put(chave, JSON.stringify(ped), { expirationTtl: 400 * 86400 });
      const rel = relatorioESG(ped.relatorio || '');
      await ingestLead(env, { email: pg.payerEmail || ped.email || '', company: ped.clienteNome || '', material_category: `ESG — ${rel ? rel.nome : 'relatório'} (PAGO)`, material_description: `Cliente CONTRATOU e PAGOU um relatório de ESG. A Villanova ESG produz a partir dos dados do sistema.\nRelatório: ${rel ? rel.nome : ped.relatorio}\nFaturamento: ${ped.faixa}\nValor: R$ ${ped.valor}\nPedido: ${pg.externalReference}\nE-mail do pagador: ${pg.payerEmail || '(não informado)'}`, source: 'esg-pago' });
    } catch (error) { console.error('esg_pago_falhou', safeError(error)); await registrarFalha(env, 'compra-esg', safeError(error), { pedido: pg.externalReference }); }
  } else if (ped.produto === 'coleta') {
    try {
      const lead = await lerLead(env, ped.leadId);
      if (lead) {
        lead.cobranca = { ...(lead.cobranca || {}), status: 'pago', paymentId: pg.id, pagoEm: nowS() };
        if (lead.status === 'aguardando-pagamento') lead.status = 'novo';
        lead.descricao = `💳 TAXA PAGA (R$ ${ped.valor})${ped.expressa ? ' — ⚡ EXPRESSA: COLETAR EM ATÉ 24H' : ''} ✔ LIBERADA\n\n${lead.descricao}`;
        await salvarLead(env, lead);
        await atualizarIndexLead(env, ped.leadId, { pagamento: 'pago', status: lead.status, prioridade: ped.expressa ? 'alta' : (lead.prioridade || '') });
      }
      if (ped.clienteEmail) { try { await enviarEmailColetaPaga(ped, env); } catch (error) { console.error('email_coleta_paga', safeError(error)); } }
      console.log('coleta_taxa_paga', { lead: ped.leadId, valor: pg.valor, expressa: !!ped.expressa });
    } catch (error) { console.error('coleta_paga_falhou', safeError(error)); await registrarFalha(env, 'compra-coleta-liberacao', safeError(error), { lead: ped.leadId }); }
  } else if (ped.produto === 'oscobranca') {
    try {
      const osPaga = await marcarCobrancaPagaOS(env, ped.osId, pg);
      if (ped.clienteEmail) { try { await enviarEmailCobrancaOSPaga(ped, env); } catch (error) { console.error('email_oscobranca', safeError(error)); } }
      try { await avisarEquipeCobrancaPaga(env, osPaga, pg); } catch (error) { console.error('email_equipe_oscobranca', safeError(error)); }
      console.log('oscobranca_paga', { os: ped.osId, valor: pg.valor });
    } catch (error) { console.error('oscobranca_falhou', safeError(error)); await registrarFalha(env, 'compra-oscobranca', safeError(error), { os: ped.osId }); }
  } else if (ped.produto === 'teste') {
    console.log('teste_pagamento_ok', { pedido: pg.externalReference, valor: pg.valor });
  } else {
    try { await enviarEmailNF(ped, pg, env); } catch (error) { console.error('nf_email_falhou', safeError(error)); }
  }
}

// Para onde mandar o cliente depois de pagar na Stripe, conforme o produto.
function destinoObrigado(ped, ref) {
  const p = ped && ped.produto;
  const r = encodeURIComponent(ref || '');
  if (p === 'carbono') return `/carbono/obrigado?pedido=${r}`;
  if (p === 'esg') return `/esg/obrigado?pedido=${r}`;
  if (p === 'adote') return '/adote/obrigado';
  if (p === 'coleta' || p === 'oscobranca') return '/painel';
  return '/painel';
}

// ---------------------------------------------------------------------------
// Aviso ao cliente na mudança de etapa da OS (item pedido pelo Marcio).
// O Ploomes chama POST /api/ploomes/webhook?t=SEGREDO quando a OS muda de etapa;
// o Worker confere a etapa, acha o e-mail do cliente e manda um e-mail com a cara da
// Ecobraz — nos 3 momentos definidos pela Débora. De-dup por KV (não manda 2x o mesmo).
// ---------------------------------------------------------------------------
const MSGS_STATUS = {
  coleta_agendada: { assunto: 'Sua coleta foi agendada — Ecobraz', titulo: 'Coleta agendada', corpo: 'Recebemos sua solicitação e sua coleta já está <strong>agendada</strong>. Você acompanha cada passo por aqui, no seu portal.' },
  a_caminho: { assunto: 'Seu coletor está a caminho! Acompanhe ao vivo — Ecobraz', titulo: 'Coletor a caminho 🚚', corpo: 'O agente de coleta da Ecobraz está <strong>a caminho</strong> da sua coleta. Entre no seu portal e toque em <strong>“Acompanhar o caminhão”</strong> para ver a chegada em tempo real.' },
  chegou: { assunto: 'Seu coletor chegou! — Ecobraz', titulo: 'Coletor chegou 📍', corpo: 'O agente de coleta da Ecobraz <strong>chegou ao local</strong> para a sua coleta.' },
  coleta_realizada: { assunto: 'Coleta realizada — Ecobraz', titulo: 'Coleta realizada', corpo: 'Sua coleta foi <strong>realizada com sucesso</strong>. Em breve os documentos ficam disponíveis para você no portal.' },
  certificado_liberado: { assunto: 'Seu certificado está disponível — Ecobraz', titulo: 'Certificado liberado', corpo: 'Seu <strong>Certificado de Destinação Final</strong> já está disponível para baixar no seu portal.' },
};
function tipoNotificacao(nomeEtapa) {
  const s = semAcentoLc(nomeEtapa);
  if (/certificado liberado/.test(s)) return 'certificado_liberado';
  if (/coleta finalizada/.test(s)) return 'coleta_realizada';
  if (/ordem de servico/.test(s)) return 'coleta_agendada';
  return null;
}
function extrairDealId(p) {
  if (!p || typeof p !== 'object') return null;
  // Formato REAL do webhook do Ploomes (verificado nos logs em 2026-07-22):
  //   {Action:"Update", Entity:"Deals", SecondaryEntityId, AccountId, ..., Old:{ Id:<id do negócio>, ... }}
  // O Id do negócio vem DENTRO de "Old" (estado anterior) e/ou "New". NÃO existe EntityId no topo.
  const ent = typeof p.Entity === 'string' ? p.Entity.toLowerCase() : '';
  const cands = [
    p.Old?.Id, p.New?.Id, // <- formato real do Ploomes: o Id do negócio está aqui
    p.Id, p.DealId, p.dealId, p.Deal?.Id, p.deal?.Id, p.data?.Id, p.Data?.Id,
    Array.isArray(p.value) ? p.value[0]?.Id : null,
  ];
  if (/deal|negoci/.test(ent) || !p.Entity) cands.push(p.EntityId, p.entityId);
  for (const c of cands) { const n = Number(c); if (Number.isInteger(n) && n > 0) return n; }
  return null;
}
// Ploomes ENCERRADO: os avisos ao cliente agora saem do SISTEMA NOVO (e-mail de
// "coleta agendada" ao criar e "coleta realizada" ao concluir a coleta). Este
// endpoint é mantido só para não dar erro caso um webhook antigo do Ploomes ainda
// chegue durante a transição — ele NÃO lê mais o Ploomes.
async function webhookPloomes(request, env) {
  console.log('webhook_ploomes_ignorado', 'ploomes_encerrado');
  return json({ ok: true, ignorado: 'ploomes_encerrado' });
}
async function webhookUltimo(request, env) { // depuração: ver o último payload e o resultado do processamento
  const token = new URL(request.url).searchParams.get('t') || '';
  if (!env.PLOOMES_WEBHOOK_SECRET || token !== env.PLOOMES_WEBHOOK_SECRET) return json({ ok: false, error: 'nao_autorizado' }, 401);
  const ultimo = env.PORTAL_KV ? await env.PORTAL_KV.get('webhook:ultimo') : null;
  const notif = env.PORTAL_KV ? await env.PORTAL_KV.get('notif:ultimo') : null;
  return json({ ok: true, ultimo: ultimo ? JSON.parse(ultimo) : null, notif: notif ? JSON.parse(notif) : null });
}
async function processarMudancaOS(dealId, env) {
  const base = env.PLOOMES_API_URL || 'https://public-api2.ploomes.com';
  const headers = { 'User-Key': env.PLOOMES_USER_KEY, Accept: 'application/json' };
  // Registra o RESULTADO do processamento (pra provar, com evidência, que o e-mail saiu — ou
  // por que não saiu). Fica em notif:ultimo e aparece no GET /api/ploomes/webhook?t=SEGREDO.
  const rec = async (o) => { try { if (env.PORTAL_KV) await env.PORTAL_KV.put('notif:ultimo', JSON.stringify({ dealId, em: agoraISO(), ...o }).slice(0, 2000), { expirationTtl: 60 * 60 * 24 * 30 }); } catch { /* ignore */ } };
  const r = await fetch(`${base}/Deals?$filter=Id%20eq%20${dealId}&$top=1&$expand=Stage,Contact`, { headers });
  const deal = r.ok ? ((await r.json()).value || [])[0] : null;
  if (!deal) { await rec({ resultado: 'deal_nao_encontrado', httpDeal: r.status }); return; }
  const etapa = deal.Stage?.Name || '';
  const tipo = tipoNotificacao(etapa);
  if (!tipo) { await rec({ resultado: 'etapa_nao_gatilho', etapa }); return; } // etapa não é gatilho de aviso
  // MODO TESTE (canário) — só fica ATIVO com NOTIF_MODO_TESTE=1. Serviu para validar o aviso
  // mandando apenas para o contato de teste antes de liberar. Validado de ponta a ponta em
  // 2026-07-22 (e-mail chegou na caixa de entrada). DESLIGADO por padrão → o aviso vale para
  // TODOS os clientes. Para testar de novo com segurança, basta setar NOTIF_MODO_TESTE=1.
  if (env.NOTIF_MODO_TESTE === '1' && env.NOTIF_TESTE_CONTACT_ID && String(deal.ContactId) !== String(env.NOTIF_TESTE_CONTACT_ID)) { await rec({ resultado: 'fora_do_modo_teste', etapa, tipo, contactId: deal.ContactId }); return; }
  const email = deal.Contact?.Email;
  if (!email) { console.error('webhook_sem_email', dealId); await rec({ resultado: 'sem_email', etapa, tipo }); return; }
  const chave = `notif:${dealId}:${tipo}`;
  if (env.PORTAL_KV && (await env.PORTAL_KV.get(chave))) { await rec({ resultado: 'ja_avisado', etapa, tipo, para: mascararEmail(email) }); return; } // já avisou este passo
  let envio;
  try {
    envio = await enviarEmailStatus(email, deal.Contact?.Name || '', tipo, env);
  } catch (error) {
    await rec({ resultado: 'falha_envio', etapa, tipo, para: mascararEmail(email), erro: String(error?.message || error).slice(0, 180) });
    throw error;
  }
  if (env.PORTAL_KV) await env.PORTAL_KV.put(chave, '1', { expirationTtl: 60 * 60 * 24 * 90 });
  await rec({ resultado: 'enviado', etapa, tipo, para: mascararEmail(email), resendId: envio?.id || null });
}
async function enviarEmailStatus(to, nome, tipo, env) {
  const m = MSGS_STATUS[tipo]; if (!m) return null;
  const portalUrl = env.PORTAL_URL || 'https://ecobraz-portal.ti-0ab.workers.dev/';
  const html = emailStatusHtml(nome, m, portalUrl);
  const text = `${m.titulo}\n\n${m.corpo.replace(/<[^>]+>/g, '')}\n\nAcesse seu portal: ${portalUrl}\n\nEcobraz`;
  // Mesmo caminho do login: Resend se houver; senão, e-Goi transacional (provado).
  if (env.RESEND_API_KEY) {
    const from = env.RESEND_FROM || 'Portal Ecobraz <acesso@ecobraz.org.br>';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from, to: [to], subject: m.assunto, html, text }),
    });
    const b = await r.text().catch(() => '');
    if (!r.ok) throw new Error(`resend_${r.status}:${b.slice(0, 140)}`);
    try { return JSON.parse(b); } catch { return null; }
  }
  const apiKey = env.EGOI_TRANSACTIONAL_API_KEY || env.EGOI_API_KEY;
  if (!apiKey) throw new Error('sem_chave_email');
  const senderId = await resolverSender(apiKey, env);
  if (!senderId) throw new Error('sem_remetente');
  const base = env.EGOI_TRANSACTIONAL_API_URL || 'https://slingshot.egoiapp.com/api';
  const payload = { sender_id: senderId, subject: m.assunto, to: [to], html_body: html, text_body: text, open_tracking: false, click_tracking: false };
  if (env.EGOI_SENDER_NAME) payload.sender_name = env.EGOI_SENDER_NAME;
  if (env.EGOI_REPLY_TO_ID) payload.reply_to_id = env.EGOI_REPLY_TO_ID;
  const r = await fetch(`${base}/v2/email/messages/action/send`, { method: 'POST', headers: { 'content-type': 'application/json', ApiKey: apiKey }, body: JSON.stringify(payload) });
  if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`egoi_tx_${r.status}:${b.slice(0, 140)}`); }
  return null;
}
// Avisa o cliente de um momento da coleta preferindo SMS (e-Goi) e caindo no e-mail
// quando o SMS não está ativado ou falha. Pedido do Marcio (2026-07-30). Nunca lança.
const SMS_COLETA = {
  a_caminho: 'Ecobraz: seu coletor esta a caminho da coleta. Acompanhe em sistema.ecobraz.org',
  chegou: 'Ecobraz: seu coletor chegou ao local para a sua coleta.',
};
async function avisarColeta(env, alvo, tipo) {
  const email = (alvo && alvo.email) || '';
  const telefone = (alvo && alvo.telefone) || '';
  const nome = (alvo && alvo.nome) || '';
  // 1) WhatsApp (preferido) — mensagem iniciada pela empresa exige template aprovado (Gupshup).
  if (whatsappConfigurado(env) && telefone) {
    const tpl = templateColeta(env, tipo);
    const primeiro = String(nome || '').split(/\s+/)[0] || 'cliente';
    const link = (alvo && alvo.linkRota) || '';
    const podeWA = tipo !== 'a_caminho' || !!link; // o template "a caminho" tem 2 variáveis (nome + link)
    if (tpl && podeWA) {
      const params = tipo === 'a_caminho' ? [primeiro, link] : [primeiro];
      try { const r = await enviarWhatsAppTemplate(env, telefone, tipo, params); if (r && r.ok) return { via: 'whatsapp' }; } catch { /* cai em SMS/e-mail */ }
    }
  }
  if (smsConfigurado(env) && telefone && SMS_COLETA[tipo]) {
    try { const r = await enviarSMS(env, telefone, SMS_COLETA[tipo]); if (r && r.ok) return { via: 'sms' }; } catch { /* cai no e-mail */ }
  }
  if (email) { try { await enviarEmailStatus(email, nome, tipo, env); return { via: 'email' }; } catch (e) { console.error('avisar_coleta_email', safeError(e)); } }
  return { via: 'nenhum' };
}
function emailStatusHtml(nome, m, portalUrl) {
  const primeiro = esc((nome || '').split(/\s+/)[0] || '');
  let logo = '';
  try { logo = new URL(portalUrl).origin + '/assets/logo-claro.png'; } catch { /* ignore */ }
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F9F8;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9F8;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #DFE7E6;box-shadow:0 18px 50px rgba(0,51,59,.10);">
<tr><td style="background:#00333B;padding:28px 32px;">
${logo ? `<img src="${logo}" alt="Ecobraz Emigre" width="168" style="display:block;width:168px;height:auto;border:0;">` : `<span style="color:#fff;font-size:22px;font-weight:800;">ecobraz</span>`}
<div style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-top:14px;">Portal do Cliente</div>
</td></tr>
<tr><td style="padding:38px 32px 6px;">
<h1 style="margin:0 0 14px;font-size:23px;line-height:1.2;letter-spacing:-.02em;color:#00333B;">${esc(m.titulo)}${primeiro ? `, ${primeiro}` : ''}</h1>
<p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4F6469;">${m.corpo}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#92C430;">
<a href="${esc(portalUrl)}" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:800;color:#10262B;text-decoration:none;">Acessar meu portal &rarr;</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:26px 32px 30px;">
<div style="border-top:1px solid #DFE7E6;padding-top:18px;font-size:12px;color:#9fb0ac;line-height:1.6;"><strong style="color:#4F6469;">Ecobraz Emigre</strong> — Portal do Cliente<br>Destinação correta, conformidade e evidências para a sua empresa.</div>
</td></tr>
</table></td></tr></table></body></html>`;
}

function emailHtml(cliente, link) {
  const nome = esc((cliente.nome || '').split(/\s+/)[0] || '');
  let logo = '';
  try { logo = new URL(link).origin + '/assets/logo-claro.png'; } catch {}
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F9F8;font-family:Montserrat,'Segoe UI',Arial,Helvetica,sans-serif;color:#10262B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9F8;padding:32px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #DFE7E6;box-shadow:0 18px 50px rgba(0,51,59,.10);">
<tr><td style="background:#00333B;padding:28px 32px;">
${logo ? `<img src="${logo}" alt="Ecobraz Emigre" width="168" style="display:block;width:168px;height:auto;border:0;">` : `<span style="color:#fff;font-size:22px;font-weight:800;">ecobraz</span>`}
<div style="color:#92C430;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;margin-top:14px;">Portal do Cliente</div>
</td></tr>
<tr><td style="padding:38px 32px 6px;">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;letter-spacing:-.02em;color:#00333B;">Seu acesso${nome ? `, ${nome}` : ''}</h1>
<p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4F6469;">Clique no botão abaixo para entrar no Portal Ecobraz. O link vale <strong style="color:#10262B;">uma vez</strong> e expira em <strong style="color:#10262B;">60 minutos</strong>.</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#92C430;">
<a href="${esc(link)}" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:800;color:#10262B;text-decoration:none;">Entrar no Portal &rarr;</a>
</td></tr></table>
<p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#9fb0ac;">Se o botão não abrir, copie e cole este endereço no navegador:<br><span style="color:#4F6469;word-break:break-all;">${esc(link)}</span></p>
<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#9fb0ac;">Se você não pediu este acesso, ignore este e-mail com segurança.</p>
</td></tr>
<tr><td style="padding:26px 32px 30px;">
<div style="border-top:1px solid #DFE7E6;padding-top:18px;font-size:12px;color:#9fb0ac;line-height:1.6;"><strong style="color:#4F6469;">Ecobraz Emigre</strong> — Portal do Cliente<br>Destinação correta, conformidade e evidências para a sua empresa.</div>
</td></tr>
</table>
<div style="max-width:560px;margin:14px auto 0;font-size:11px;color:#aebfbb;text-align:center;">Portal do Cliente da Ecobraz — acesso seguro por link.</div>
</td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Tokens assinados (HMAC-SHA256) e utilidades
// ---------------------------------------------------------------------------
async function criarToken(dados, ttlS, env) {
  requireEnv(env, ['PORTAL_SESSION_SECRET']);
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = { ...dados, n: nonce, exp: nowS() + ttlS };
  const corpo = b64urlStr(JSON.stringify(payload));
  const assinatura = await hmac(env.PORTAL_SESSION_SECRET, corpo);
  return { valor: `${corpo}.${assinatura}`, nonce };
}

async function verificarToken(valor, env) {
  if (!valor || !env.PORTAL_SESSION_SECRET) return null;
  const ponto = valor.lastIndexOf('.');
  if (ponto < 0) return null;
  const corpo = valor.slice(0, ponto);
  const assinatura = valor.slice(ponto + 1);
  const esperada = await hmac(env.PORTAL_SESSION_SECRET, corpo);
  if (!tempoConstanteIgual(assinatura, esperada)) return null;
  let payload;
  try { payload = JSON.parse(b64urlStrDecode(corpo)); } catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < nowS()) return null;
  return payload;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

function tempoConstanteIgual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64urlStr(str) { return b64url(new TextEncoder().encode(str)); }
function b64urlStrDecode(s) { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/')); const bytes = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i); return new TextDecoder().decode(bytes); }

// ---------------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------------
function nowS() { return Math.floor(Date.now() / 1000); }
function agoraISO() { try { return new Date().toISOString(); } catch { return ''; } }
function mascararEmail(e) { const s = String(e || ''); const i = s.indexOf('@'); if (i < 1) return s ? '***' : ''; const u = s.slice(0, i); return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}${s.slice(i)}`; }
function novoId() { return b64url(crypto.getRandomValues(new Uint8Array(12))); }
function inicioDeHoje() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function json(body, status = 200, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } }); }
function html(markup, status = 200) { return new Response(markup, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }); }
function servirLogo(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
}
// Métrica da demonstração pública — armazena APENAS contadores agregados por dia/evento.
// Nunca grava IP, user-agent, cookies, e-mail ou qualquer dado pessoal.
const DEMO_EVENTS = new Set(['demo_view', 'demo_enter', 'demo_section_view', 'demo_cta_click']);
async function registrarEventoDemo(request, env) {
  try {
    if (!env.PORTAL_KV) return new Response(null, { status: 204 });
    let b; try { b = await request.json(); } catch { b = {}; }
    const ev = String((b && b.e) || '');
    if (!DEMO_EVENTS.has(ev)) return new Response(null, { status: 204 });
    const dia = new Date().toISOString().slice(0, 10);
    const sec = String((b && b.s) || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    const src = String((b && b.utm_source) || '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40);
    const bump = async (k) => {
      try { const cur = parseInt((await env.PORTAL_KV.get(k)) || '0', 10) || 0; await env.PORTAL_KV.put(k, String(cur + 1), { expirationTtl: 150 * 86400 }); } catch { /* ok */ }
    };
    await bump(`demoev:${dia}:${ev}`);
    if (ev === 'demo_section_view' && sec) await bump(`demoev:${dia}:sec:${sec}`);
    if (src) await bump(`demoev:${dia}:src:${src}`);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 204 }); }
}
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Página do Pix nativo: QR Code + copia-e-cola, com verificação automática do pagamento.
function paginaPixTeste(valor, pix, ref) {
  const img = pix.qrCodeBase64 ? `<img src="data:image/png;base64,${esc(pix.qrCodeBase64)}" alt="QR Code Pix" style="width:230px;height:230px;border:1px solid #E4EBE9;border-radius:12px;background:#fff;padding:8px">` : '<div style="color:#8fa39f;font-size:13px">QR não veio na resposta — use o código copia-e-cola abaixo.</div>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Teste Pix — Ecobraz</title>
<style>body{margin:0;font-family:Montserrat,'Segoe UI',Arial,sans-serif;background:#F2F6F4;color:#10262B}.wrap{max-width:440px;margin:0 auto;padding:26px 18px}
.card{background:#fff;border:1px solid #E4EBE9;border-radius:16px;padding:22px;text-align:center}
.btn{display:inline-block;border:none;border-radius:11px;padding:12px 16px;font-size:14px;font-weight:800;cursor:pointer;text-decoration:none}
input{width:100%;box-sizing:border-box;border:1px solid #DDE1E6;border-radius:10px;padding:11px;font-size:12px;margin-top:8px}</style></head>
<body><div class="wrap">
  <a href="/diretoria" style="font-size:13px;font-weight:800;text-decoration:none;color:#4F6469">← Painel</a>
  <div class="card" style="margin-top:14px">
    <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#0B7A66">Pix nativo · teste</div>
    <h1 style="font-size:22px;margin:6px 0 2px">R$ ${esc(String(valor).replace('.', ','))}</h1>
    <p style="font-size:13px;color:#4F6469;margin:0 0 16px">Abra o app do seu banco, escolha <b>Pix › Pagar com QR Code</b> e aponte para a imagem — ou use o <b>copia e cola</b>.</p>
    ${img}
    <div style="margin-top:14px;text-align:left"><label style="font-size:11px;font-weight:800;color:#7c8a87">Pix copia e cola</label>
      <input id="cec" readonly value="${esc(pix.copiaECola)}" onclick="this.select()">
      <button class="btn" style="background:#EEF1F0;color:#10262B;margin-top:8px;width:100%" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('cec').value);this.textContent='✓ Copiado!'">Copiar código</button>
    </div>
    <div id="st" style="margin-top:16px;font-size:14px;font-weight:800;color:#8A6A16">⏳ Aguardando pagamento…</div>
    <div style="font-size:11.5px;color:#9aa7a4;margin-top:6px">A confirmação é automática. Esta página verifica sozinha a cada 4 segundos.</div>
  </div>
</div>
<script>
var ref=${JSON.stringify(ref)};
var timer=setInterval(check,4000);
async function check(){
  try{ var r=await fetch('/api/diretoria/pix-status?ref='+encodeURIComponent(ref)); var d=await r.json();
    if(d.ok&&d.status==='pago'){ clearInterval(timer); var s=document.getElementById('st'); s.textContent='✅ Pagamento confirmado! O Pix nativo funciona.'; s.style.color='#1E7A3D'; }
  }catch(_){}
}
</script></body></html>`;
}
function requireEnv(env, names) { const m = names.filter((n) => !env[n]); if (m.length) throw new Error(`missing_env_${m.join('_')}`); }
function safeError(e) { return { name: e?.name || 'Error', message: String(e?.message || 'unknown').slice(0, 200) }; }
async function verifyTurnstile(token, ip, secret) { if (!token) return false; const f = new FormData(); f.set('secret', secret); f.set('response', token); if (ip) f.set('remoteip', ip); const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f }); if (!r.ok) return false; return Boolean((await r.json()).success); }
