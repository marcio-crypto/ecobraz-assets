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
import { paginaCalculadora, estimativaCarbono, paginaCalculoDetalhado, calculoDetalhadoGHG } from './carbono.js';
import { criarPreferencia, consultarPagamento } from './mercadopago.js';
import { acharPacote, precoPacote, paginaLojaAdote, paginaObrigadoAdote, paginaDiagnostico, lerCredito, salvarCredito, novoCredito, aplicarCompra, aplicarRecarga, precisaRecarga, listarPatrocinadores } from './adote.js';
import { statusDaEtapa, valorProp, CAMPOS_OS } from './os-utils.js';
import { qrCDF, validarCDF } from './validacao.js';
import { paginaMetodologia } from './carbono-metodologia.js';
import { lerValidacao, registrarValidacao, paginaAreaValidacao, qrMetodologia, validarMetodologiaPublico } from './validacao-metodologia.js';
import { paginaPainelCarbono } from './carbono-painel.js';
import { clientesComOperacoes, carbonoDoCliente, paginaCarbonoAnalista, paginaCarbonoAuditor } from './carbono-motor.js';
import { agentePermitido, nomeAgente, listarColetasComStatus, paginaLoginAgente, paginaAppAgente, detalheColeta, lerEstadoColeta, registrarCheckin, registrarFoto, servirFotoColeta, paginaColetaDetalhe, registrarEncerramento, registrarReagendamento, qrColeta, validarColetaPublico, paginaComprovante } from './agente.js';
import { operadorPermitido, nomeOperador, listarOperacoes, listarColetasRecebiveis, iniciarOperacao, lerOperacao, definirTipoOperacao, registrarPesoEntrada, registrarFotoOperacao, servirFotoOperacao, paginaLoginOperacao, paginaAppOperacao, paginaReceberLote, paginaLoteDetalhe, adicionarMaterial, removerMaterial, concluirTriagem, paginaTriagem, paginaProcessamento, concluirProcessamento, paginaSaida, registrarSaida, concluirSaida } from './operacional.js';
import { engenheiroPermitido, nomeEngenheiro, filaValidacao, operacoesValidadas, lerValidacaoOp, registrarValidacaoOp, paginaLoginEng, paginaFilaEng, paginaDossie, qrOperacao, validarOperacaoPublico, listarDestinos, lerDestino, salvarDestino, paginaDestinos, paginaDestinoForm, paginaRelatorio, paginaCDF } from './engenharia.js';
import { diretorPermitido, nomeDiretor, reunirDados, paginaLoginDiretoria, paginaPainelDiretoria } from './diretoria.js';
import { dadosPrevencao, paginaPrevencao, analisarColetaIA, salvarTabelaPrecos, pingIA } from './prevencao.js';
import { sondarAnexosPloomes, paginaSondaAnexos } from './ploomes-docs.js';
import { amostraContatosPloomes, paginaAmostraContatos, importarLoteContatos, estatisticasMigracao, buscarContatos, paginaMigrarPloomes, detalheContato, paginaContatoDetalhe, importarLoteNegocios, estatisticasNegocios, paginaMigrarNegocios } from './ploomes-migracao.js';
import { importarLoteAnexos, importarLoteAnexosContatos, completarAnexos, importarAnexosJanela, reprocessarFalhas, importarLoteDocumentos, recuperarDocumentos, estatisticasArquivos, paginaMigrarArquivos, diagnosticoAnexos, paginaDiagAnexos } from './ploomes-arquivos.js';
import { fiscalPermitido, nomeFiscal, listarNotas, lerNota, importarLote, vincularNota, sugerirVinculoSync, paginaFiscalLogin, paginaFiscalHome, paginaFiscalResultado, paginaFiscalNota } from './fiscal.js';
import { escritorioPermitido, nomeEscritorio, consultarCNPJ, listarClientes, lerCliente, salvarCliente, emailsDoCliente, reindexarEmailsClientes, backfillEnderecos, paginaManutencao, paginaLoginEscritorio, paginaCadastroHome, paginaFormCliente, paginaClienteDetalhe, listarLeads, lerLead, salvarLead, ingestLead, clienteDeLead, arquivosDoCliente, paginaLeads, paginaLeadDetalhe, paginaInicio } from './cadastro.js';
import { listarColetasOS, lerColetaOS, criarColetaOS, atualizarStatusOS, atualizarColetaOS, registrarAnexoColeta, removerAnexoColeta, paginaColetasLista, paginaGerarColeta, paginaEditarColeta, paginaColetaOSDetalhe, qrOS, validarOSPublico, paginaComprovanteOS, paginaCartaDescarte, paginaManifestoCarga } from './coletas.js';
import { listarVeiculos, lerVeiculo, salvarVeiculo, paginaFrota, paginaVeiculoForm, lerJornadaAtiva, abrirJornada, fecharJornada, registrarAbastecimento, tagColetaComVeiculo, servirFotoJornada, bannerJornada, paginaAbrirDia, paginaFecharDia, paginaAbastecer, placaDaColeta } from './frota.js';
import { carregarEquipeNoEnv, listarUsuarios, lerUsuario, salvarUsuario, importarUsuarios, paginaEquipe, paginaUsuarioForm, paginaEquipeImportar } from './equipe.js';
import { agentesDe } from './agente.js';
import { servirIcone, servirManifest, servirServiceWorker } from './pwa.js';
import { googleConfigurado, iniciarGoogle, callbackGoogle, botaoGoogle } from './google-auth.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/health') return json({
        ok: true, service: 'ecobraz-portal', version: 27,
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
      // PWA (app instalável): ícones, manifesto e service worker.
      if (pathname === '/assets/icon-192.png') return servirIcone('192');
      if (pathname === '/assets/icon-512.png') return servirIcone('512');
      if (pathname === '/manifest.webmanifest') return servirManifest(url);
      if (pathname === '/sw.js') return servirServiceWorker();

      // Calculadora de pegada de carbono — Nível 1 (estimativa grátis por CNPJ). Público.
      if (pathname === '/calculadora' && request.method === 'GET') return html(paginaCalculadora());
      if (pathname === '/api/carbono/estimativa' && request.method === 'GET') {
        const resultado = await estimativaCarbono(url.searchParams.get('cnpj') || '', env);
        return json(resultado, resultado.ok ? 200 : 400);
      }
      // Cálculo detalhado — Nível 2 (formulário GHG). Página de teste (será liberada após pagamento).
      if (pathname === '/calculo-detalhado' && request.method === 'GET') return html(paginaCalculoDetalhado());
      if (pathname === '/api/carbono/detalhado' && request.method === 'POST') {
        const corpo = await request.json().catch(() => ({}));
        return json({ ok: true, resultado: calculoDetalhadoGHG(corpo) });
      }
      // Pagamento (Mercado Pago) — cria a cobrança e devolve o link de pagamento.
      // Por ora valor de TESTE (R$1). Depois: precoNivel2 por porte.
      if (pathname === '/api/carbono/pagar' && request.method === 'POST') {
        const valor = Number(env.MP_VALOR_TESTE || 1);
        const pedidoId = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${pedidoId}`, JSON.stringify({ status: 'pendente', valor, criadoEm: nowS() }), { expirationTtl: 86400 });
        try {
          const pref = await criarPreferencia({ valor, descricao: 'Cálculo detalhado de pegada de carbono (teste)', externalReference: pedidoId, baseUrl }, env);
          return json({ ok: true, pedido: pedidoId, init_point: pref.initPoint });
        } catch (error) {
          console.error('mp_criar_falhou', safeError(error));
          return json({ ok: false, error: 'nao_foi_possivel_cobrar', detalhe: String(error?.message || '').slice(0, 220) }, 502);
        }
      }
      // Loja "Adote um Bairro" (pública): coleta pré-paga por tonelada.
      if (pathname === '/adote' && request.method === 'GET') return html(paginaLojaAdote());
      if (pathname === '/diagnostico' && request.method === 'GET') return html(paginaDiagnostico());
      if (pathname === '/adote/obrigado' && request.method === 'GET') {
        const ref = url.searchParams.get('pedido');
        let ped = null, cred = null;
        if (ref && env.PORTAL_KV) { const raw = await env.PORTAL_KV.get(`pedido:${String(ref).replace(/[^a-zA-Z0-9_-]/g, '')}`); ped = raw ? JSON.parse(raw) : null; if (ped) cred = await lerCredito(env, ped.clienteId); }
        return html(paginaObrigadoAdote(ped, cred));
      }
      if (pathname === '/api/adote/contratar' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const pac = acharPacote(b && b.pacoteId);
        const tipo = b && b.tipo === 'recorrente' ? 'recorrente' : 'avulso';
        if (!pac) return json({ ok: false, erro: 'Escolha um pacote válido.' }, 400);
        const razaoSocial = String(b.razaoSocial || '').trim();
        const cnpj = String(b.cnpj || '').replace(/\D/g, '');
        const email = String(b.email || '').trim().toLowerCase();
        if (!razaoSocial || cnpj.length !== 14 || !/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, erro: 'Preencha razão social, CNPJ (14 dígitos) e e-mail válido.' }, 400);
        let cliente = null;
        try {
          const clientes = await listarClientes(env);
          const resumo = clientes.find((c) => String(c.doc || '').replace(/\D/g, '') === cnpj);
          if (resumo) cliente = await lerCliente(env, resumo.id);
          if (!cliente) cliente = await salvarCliente(env, { tipo: 'PJ', razaoSocial, cnpj, email, telefone: String(b.telefone || '').trim(), endereco: { cidade: String(b.cidade || '').trim() }, origem: 'adote' });
        } catch (e) { console.error('adote_cliente_falhou', safeError(e)); return json({ ok: false, erro: 'Falha ao registrar o cliente.' }, 500); }
        const valor = precoPacote(pac, tipo);
        const ref = novoId();
        const baseUrl = env.PORTAL_BASE_URL || url.origin;
        if (env.PORTAL_KV) await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'adote', status: 'pendente', clienteId: cliente.id, clienteNome: razaoSocial, pacoteId: pac.id, tipo, valor, kg: pac.kg, email, criadoEm: nowS() }), { expirationTtl: 7 * 86400 });
        try {
          const pref = await criarPreferencia({ valor, descricao: `Adote um Bairro — ${pac.ton}t (${tipo === 'recorrente' ? 'recorrente' : 'avulso'})`, externalReference: ref, baseUrl, backPath: '/adote/obrigado' }, env);
          return json({ ok: true, pedido: ref, init_point: pref.initPoint });
        } catch (e) { console.error('adote_mp_falhou', safeError(e)); return json({ ok: false, erro: 'Não foi possível gerar o pagamento agora.' }, 502); }
      }
      // Webhook do Mercado Pago: confirma o pagamento consultando a API (fonte da verdade).
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
                    let cred = (await lerCredito(env, ped.clienteId)) || novoCredito(ped.clienteId, ped.clienteNome);
                    if (ped.evento === 'recarga') {
                      cred = aplicarRecarga(cred, pac, ped.valor, pg.externalReference, nowS());
                      if (cred.recargaPendente && cred.recargaPendente.ref === pg.externalReference) cred.recargaPendente = null;
                    } else {
                      cred = aplicarCompra(cred, pac, ped.tipo, ped.valor, pg.externalReference, nowS());
                    }
                    await salvarCredito(env, cred);
                    console.log('adote_credito', { cliente: ped.clienteId, saldo: cred.saldoKg, evento: ped.evento || 'compra' });
                  }
                } catch (error) { console.error('adote_credito_falhou', safeError(error)); }
              } else {
                try { await enviarEmailNF(ped, pg, env); } catch (error) { console.error('nf_email_falhou', safeError(error)); }
              }
            }
          }
        }
        return json({ ok: true }); // sempre 200 para o MP não reenviar sem parar
      }
      // Status do pedido (a página consulta para saber se já foi pago).
      if (pathname === '/api/carbono/pedido' && request.method === 'GET') {
        const id = url.searchParams.get('id') || '';
        if (!env.PORTAL_KV || !id) return json({ ok: false, status: 'desconhecido' }, 400);
        const raw = await env.PORTAL_KV.get(`pedido:${id}`);
        const ped = raw ? JSON.parse(raw) : null;
        return json({ ok: true, status: ped?.status || 'desconhecido' });
      }

      // Equipe & Acessos: SOMA os usuários cadastrados às listas de acesso por papel
      // (aditivo e defensivo — se falhar, mantém o env original). A partir daqui, as
      // funções *Permitido honram tanto o env quanto o cadastro no sistema.
      try { env = await carregarEquipeNoEnv(env); } catch { /* mantém env original */ }

      if (pathname === '/' && request.method === 'GET') return await telaInicial(request, env);
      if (pathname === '/entrar' && request.method === 'GET') return await entrarComToken(request, env, url);
      if (pathname === '/api/auth/solicitar' && request.method === 'POST') return await solicitarLink(request, env);
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
      const fiscal = await lerSessaoFiscal(request, env);

      // Painel da Diretoria (visão macro). Exige sessão de diretoria.
      if (pathname === '/diretoria' && request.method === 'GET') {
        if (!diretoria) return html(paginaLoginDiretoria(googleConfigurado(env)));
        return html(paginaPainelDiretoria(diretoria, await reunirDados(env)));
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
            aReceber: coletas.filter((c) => c.status === 'na_unidade').length,
            leadsNovos: leads.filter((l) => l.status !== 'tratado').length,
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
        const ql = q.toLowerCase();
        const tipo = (url.searchParams.get('tipo') || '').toUpperCase();
        const PORPAG = 50;
        const todos = await listarClientes(env);
        let filtrados = todos;
        if (tipo === 'PJ' || tipo === 'PF') filtrados = filtrados.filter((c) => c.tipo === tipo);
        if (ql) filtrados = filtrados.filter((c) => `${c.nome || ''} ${c.doc || ''}`.toLowerCase().includes(ql));
        const ordenados = [...filtrados].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt'));
        const totalPags = Math.max(1, Math.ceil(ordenados.length / PORPAG));
        const pag = Math.min(Math.max(1, Number(url.searchParams.get('p') || 1) || 1), totalPags);
        const fatia = ordenados.slice((pag - 1) * PORPAG, pag * PORPAG);
        return html(paginaCadastroHome(escritorio, fatia, q, ordenados.length, todos.length, { tipo: (tipo === 'PJ' || tipo === 'PF') ? tipo : '', pag, totalPags }));
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
      if (pathname === '/cadastro/novo' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const leadId = (url.searchParams.get('lead') || '').trim();
        let preLead = null, prefill = null;
        if (leadId) { preLead = await lerLead(env, leadId); if (preLead) prefill = clienteDeLead(preLead); }
        return html(paginaFormCliente(escritorio, (prefill && prefill.tipo) || url.searchParams.get('tipo') || 'PJ', prefill, preLead ? leadId : ''));
      }
      if (pathname === '/cadastro/editar' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const cli = await lerCliente(env, url.searchParams.get('id') || '');
        if (!cli) return html(paginaMensagem('Cliente não encontrado', 'Volte e tente de novo.'), 404);
        return html(paginaFormCliente(escritorio, cli.tipo, cli));
      }
      if (pathname === '/cadastro/cliente' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const cli = await lerCliente(env, url.searchParams.get('id') || '');
        if (!cli) return html(paginaMensagem('Cliente não encontrado', 'Volte e tente de novo.'), 404);
        let arquivos = []; try { arquivos = await arquivosDoCliente(env, cli); } catch { /* sem arquivos, tudo bem */ }
        return html(paginaClienteDetalhe(escritorio, cli, arquivos));
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
        let existente = null; if (b.id) existente = await lerCliente(env, b.id);
        const leadOrigem = String(b.leadOrigem || '').trim(); if ('leadOrigem' in b) delete b.leadOrigem;
        const salvo = await salvarCliente(env, existente ? { ...existente, ...b } : b);
        // Veio de um lead do site? Marca o lead como tratado e guarda o vínculo (best-effort).
        if (leadOrigem) { try { const l = await lerLead(env, leadOrigem); if (l && l.status !== 'tratado') { l.status = 'tratado'; l.clienteId = salvo.id; await salvarLead(env, l); } } catch { /* não bloqueia o cadastro */ } }
        return json({ ok: true, id: salvo.id });
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

      // Ordens de Coleta (escritório/comercial) — geração própria a partir do cliente.
      if (pathname === '/coletas' && request.method === 'GET') {
        if (!escritorio) return html(paginaLoginEscritorio(googleConfigurado(env)));
        const q = (url.searchParams.get('q') || '').trim();
        const ql = q.toLowerCase();
        const cliId = (url.searchParams.get('cliente') || '').trim();
        let coletas = await listarColetasOS(env);
        let cliCtx = null;
        if (cliId) {
          const cli = await lerCliente(env, cliId);
          const nome = cli ? (cli.tipo === 'PJ' ? (cli.razaoSocial || cli.nomeFantasia || '') : (cli.nome || '')) : '';
          coletas = coletas.filter((c) => c.clienteId === cliId || (nome && c.clienteNome === nome));
          cliCtx = { id: cliId, nome: nome || 'cliente' };
        } else if (ql) coletas = coletas.filter((c) => `${c.numero || ''} ${c.clienteNome || ''}`.toLowerCase().includes(ql)); // busca cobre canceladas
        else coletas = coletas.filter((c) => c.status !== 'cancelada'); // sem busca, canceladas somem
        return html(paginaColetasLista(escritorio, coletas, q, cliCtx));
      }
      if (pathname === '/coletas/nova' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const cli = await lerCliente(env, url.searchParams.get('cliente') || '');
        if (!cli) return html(paginaMensagem('Cliente não encontrado', 'Volte e tente de novo.'), 404);
        const agentes = [...agentesDe(env).entries()].map(([email, nome]) => ({ email, nome }));
        let patrocinadores = []; try { patrocinadores = await listarPatrocinadores(env); } catch { /* ok */ }
        let veiculos = []; try { veiculos = await listarVeiculos(env); } catch { /* ok */ }
        return html(paginaGerarColeta(escritorio, cli, agentes, patrocinadores, veiculos));
      }
      if (pathname === '/coletas/os' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        return html(paginaColetaOSDetalhe(escritorio, os));
      }
      if (pathname === '/coletas/editar' && request.method === 'GET') {
        if (!escritorio) return new Response(null, { status: 302, headers: { Location: '/cadastro', 'cache-control': 'no-store' } });
        const os = await lerColetaOS(env, url.searchParams.get('id') || '');
        if (!os) return html(paginaMensagem('Coleta não encontrada', 'Volte e tente de novo.'), 404);
        let contatos = [];
        try { const cli = os.clienteId ? await lerCliente(env, os.clienteId) : null; if (cli) contatos = cli.tipo === 'PJ' ? (cli.contatos || []) : [{ nome: cli.nome, fone: cli.fone, email: cli.email }]; } catch { /* sem contatos do cliente, tudo bem */ }
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
      // Anexar foto/arquivo a uma coleta (upload para o R2 + registro em os.anexos).
      if (pathname === '/api/coletas/anexo' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
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
        try { await env.R2_ARQUIVOS.put(key, file.stream(), { httpMetadata: { contentType: ct } }); }
        catch (e) { return json({ ok: false, error: 'Falha ao guardar: ' + String((e && e.message) || e).slice(0, 80) }, 502); }
        const meta = { key, nome: String(file.name || 'arquivo').slice(0, 140), content_type: ct, tamanho: file.size || 0 };
        await registrarAnexoColeta(env, id, meta);
        return json({ ok: true, anexo: meta });
      }
      if (pathname === '/api/coletas/anexo-remover' && request.method === 'POST') {
        if (!escritorio) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || !b.key) return json({ ok: false, error: 'dados' }, 400);
        try { if (env.R2_ARQUIVOS && String(b.key).startsWith('coleta-anexo/')) await env.R2_ARQUIVOS.delete(String(b.key)); } catch { /* segue */ }
        await removerAnexoColeta(env, b.id, b.key);
        return json({ ok: true });
      }
      // Serve um anexo de coleta do R2 (gated por escritório; só chaves coleta-anexo/).
      if (pathname === '/coletas/anexo' && request.method === 'GET') {
        if (!escritorio) return new Response('nao_autenticado', { status: 401 });
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
        return html(paginaCartaDescarte(os, `/qr-os?id=${encodeURIComponent(os.id)}`));
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
        await atualizarStatusOS(env, b.id, b.status);
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
        return html(paginaAppAgente(agente, await listarColetasComStatus(env, agente.email), bannerJornada(jornada)));
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
      if (pathname === '/api/agente/checkin' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || b.lat == null || b.lon == null) return json({ ok: false, error: 'dados' }, 400);
        await registrarCheckin(env, b.id, agente, { lat: b.lat, lon: b.lon, acc: b.acc });
        try { await tagColetaComVeiculo(env, agente.email, b.id); } catch { /* jornada opcional no vínculo */ }
        return json({ ok: true });
      }
      if (pathname === '/api/agente/foto' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id || !b.foto) return json({ ok: false, error: 'dados' }, 400);
        await registrarFoto(env, b.id, agente, b.foto);
        return json({ ok: true });
      }
      if (pathname === '/api/agente/encerrar' && request.method === 'POST') {
        if (!agente) return json({ ok: false, error: 'nao_autenticado' }, 401);
        let b; try { b = await request.json(); } catch { b = null; }
        if (!b || !b.id) return json({ ok: false, error: 'dados' }, 400);
        let det = null; try { det = await detalheColeta(env, b.id); } catch { det = null; }
        await registrarEncerramento(env, b.id, agente, { volumes: b.volumes, obs: b.obs, numero: det && det.numero, cliente: det && det.cliente, endereco: det && det.endereco });
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
        return html(paginaLoteDetalhe(operacao, op));
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
        return html(paginaDossie(eng, op, val, seloUrl));
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
      // Metodologia — FECHADA (proteção contra concorrente): cliente logado OU validador.
      if (pathname === '/metodologia' && request.method === 'GET') {
        if (!sessao && !validador) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        return html(paginaMetodologia(env, await lerValidacao(env)));
      }
      // Painel de carbono do cliente — ligado ao motor (peso/composição REAIS; tCO₂e
      // pendente até a Villanova validar). Só cliente logado.
      if (pathname === '/painel-carbono' && request.method === 'GET') {
        if (!sessao) return new Response(null, { status: 302, headers: { Location: '/', 'cache-control': 'no-store' } });
        const dadosCli = await carbonoDoCliente(env, sessao.nome || '');
        return html(paginaPainelCarbono(sessao, dadosCli, await lerValidacao(env)));
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

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (error) {
      console.error('erro_inesperado', safeError(error));
      return json({ ok: false, error: 'erro_interno' }, 500);
    }
  },
};

// ---------------------------------------------------------------------------
// Telas
// ---------------------------------------------------------------------------
async function telaInicial(request, env) {
  const sessao = await lerSessao(request, env);
  if (!sessao) return html(paginaLogin());
  return html(paginaPainel({ nome: sessao.nome, email: sessao.email, dataFim: sessao.dataFim || '' }));
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

  const sessao = await criarToken({ cid: cliente.contactId, emp: cliente.empresaId, em: cliente.email, nome: cliente.nome, fim: cliente.dataFim || '', doc: cliente.documento || '', tipo: 'sessao' }, SESSAO_TTL_S, env);
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
  return { contactId: payload.cid, empresaId: payload.emp || payload.cid, email: payload.em, nome: payload.nome, dataFim: payload.fim, documento: payload.doc || '' };
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
          return { contactId: 0, empresaId: 0, nome, email: em, documento, dataFim: null, liberado: true };
        }
      }
    } catch (error) { console.error('base_kv_lookup', safeError(error)); }
  }
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
  const ROT = { agendada: 'Agendada', em_transporte: 'Em transporte', na_unidade: 'Na unidade', concluida: 'Concluída', cancelada: 'Cancelada' };
  const out = [];
  // 1) Coletas da nossa base (KV) — as que a equipe cria no sistema novo.
  try {
    if (env.PORTAL_KV && doc) {
      const idx = await listarColetasOS(env);
      for (const c of idx) {
        if (String(c.clienteDoc || '').replace(/\D/g, '') !== doc) continue;
        if (c.status === 'cancelada') continue;
        out.push({ id: 'k' + c.id, numeroOS: c.numero || '', titulo: 'Ordem de Coleta', status: ROT[c.status] || 'Em atendimento', dataColeta: c.dataAgendada || '', aberturaISO: c.criadoEm || null, peso: '' });
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
    return json({ ok: true, docs: [] }); // coleta nova ('k'): documentos gerados vêm numa etapa seguinte
  } catch (error) { console.error('docs_erro', safeError(error)); return json({ ok: false, error: 'indisponivel' }, 502); }
}

// Baixa UM documento do NOSSO depósito (R2). A chave (docId) é o r2_key; o Worker
// entrega o arquivo direto. Segurança: o arquivo tem que pertencer a um contato/negócio
// com o MESMO documento do cliente logado, e o tipo passa pela allowlist.
async function baixarDocOS(url, sessao, env) {
  const doc = String(sessao.documento || '').replace(/\D/g, '');
  const cid = Number(sessao.contactId) || 0, emp = Number(sessao.empresaId) || 0;
  const fonte = url.searchParams.get('fonte') || '';
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
  const descricao = [
    'Solicitação de coleta pelo Portal do Cliente.',
    cnpj ? `CNPJ/CPF: ${cnpj}` : '',
    `Endereço de coleta: ${endereco}`,
    (cep || logradouro) ? `  (CEP ${cep} · ${logradouro}${numero ? ', ' + numero : ''}${complemento ? ' · ' + complemento : ''} · ${bairro} · ${cidade}${uf ? '/' + uf : ''})` : '',
    responsavel ? `Responsável: ${responsavel}` : '',
    `Equipamentos:\n${equipamentos || '(não informado)'}`,
  ].filter(Boolean).join('\n');
  const r = await ingestLead(env, {
    name: responsavel || sessao.nome || '', company: razaoSocial || sessao.nome || '',
    email: email || sessao.email || '', phone: telefone,
    material_category: 'Solicitação de coleta (portal)', material_description: descricao,
    postal_code: cep, city: cidade, state: uf, profile: cnpj ? 'empresa' : 'pessoa_fisica',
    source: 'portal-coleta',
  });
  if (!r || !r.ok) { console.error('solicitar_os_erro', r && r.error); return json({ ok: false, error: 'nao_foi_possivel' }, 502); }
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
  return json({ ok: true, pedido_id: r.id, fotos: fotosOk, message: 'Pronto! Sua solicitação de coleta foi enviada. Nossa equipe vai entrar em contato para agendar.' }, 201);
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
  const valor = precoPacote(pac, 'recorrente');
  const ref = novoId();
  const base = String(baseUrl || '').replace(/\/+$/, '');
  await env.PORTAL_KV.put(`pedido:${ref}`, JSON.stringify({ produto: 'adote', evento: 'recarga', status: 'pendente', clienteId, clienteNome: cred.clienteNome, pacoteId: pac.id, tipo: 'recorrente', valor, kg: pac.kg, email, criadoEm: nowS() }), { expirationTtl: 14 * 86400 });
  const pref = await criarPreferencia({ valor, descricao: `Adote um Bairro — renovação ${pac.ton}t (recorrente)`, externalReference: ref, baseUrl: base, backPath: '/adote/obrigado' }, env);
  cred.recargaPendente = { ref, em: nowS() };
  await salvarCredito(env, cred);
  if (email) { try { await enviarEmailRecarga({ nome: cred.clienteNome, email }, pref.initPoint, pac.ton, env); console.log('adote_recarga_email_ok', { cliente: clienteId }); } catch (e) { console.error('adote_recarga_email_falhou', safeError(e)); } }
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
    `Pagamento (Mercado Pago) ID: ${pagamento.id}`,
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
// Aviso ao cliente na mudança de etapa da OS (item pedido pelo Marcio).
// O Ploomes chama POST /api/ploomes/webhook?t=SEGREDO quando a OS muda de etapa;
// o Worker confere a etapa, acha o e-mail do cliente e manda um e-mail com a cara da
// Ecobraz — nos 3 momentos definidos pela Débora. De-dup por KV (não manda 2x o mesmo).
// ---------------------------------------------------------------------------
const MSGS_STATUS = {
  coleta_agendada: { assunto: 'Sua coleta foi agendada — Ecobraz', titulo: 'Coleta agendada', corpo: 'Recebemos sua solicitação e sua coleta já está <strong>agendada</strong>. Você acompanha cada passo por aqui, no seu portal.' },
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
async function webhookPloomes(request, env) {
  if (!env.PLOOMES_WEBHOOK_SECRET) return json({ ok: false, error: 'nao_configurado' }, 503);
  const token = new URL(request.url).searchParams.get('t') || request.headers.get('x-webhook-token') || '';
  if (token !== env.PLOOMES_WEBHOOK_SECRET) return json({ ok: false, error: 'nao_autorizado' }, 401);
  let payload = null;
  try { payload = await request.json(); } catch { payload = null; }
  // Guarda o último payload cru (pra ajustar o formato após o 1º disparo real).
  try { if (env.PORTAL_KV) await env.PORTAL_KV.put('webhook:ultimo', JSON.stringify(payload).slice(0, 4000), { expirationTtl: 60 * 60 * 24 * 7 }); } catch { /* ignore */ }
  const dealId = extrairDealId(payload);
  if (!dealId) { console.error('webhook_sem_deal'); return json({ ok: true, ignorado: 'sem_deal' }); }
  try { await processarMudancaOS(dealId, env); } catch (error) { console.error('webhook_erro', safeError(error)); }
  return json({ ok: true });
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
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function requireEnv(env, names) { const m = names.filter((n) => !env[n]); if (m.length) throw new Error(`missing_env_${m.join('_')}`); }
function safeError(e) { return { name: e?.name || 'Error', message: String(e?.message || 'unknown').slice(0, 200) }; }
async function verifyTurnstile(token, ip, secret) { if (!token) return false; const f = new FormData(); f.set('secret', secret); f.set('response', token); if (ip) f.set('remoteip', ip); const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f }); if (!r.ok) return false; return Boolean((await r.json()).success); }
