/**
 * Ecobraz — Google Ad Grants (conta 886-124-7052)
 * Exporta os números da conta para a planilha da equipe de agentes.
 *
 * Só LÊ a conta. Não altera campanha, lance, orçamento nem anúncio.
 * Cada execução sobrescreve as abas com os dados mais recentes.
 *
 * Onde colar: Google Ads > Ferramentas > Ações em massa > Scripts > (+) Novo script.
 * Programação recomendada: diariamente, 06:00.
 */

var PLANILHA_ID = '1mcAzV4utDX9G5C6vV6uI5404LhQ-m3H8Ze0IK1hwqGc';

function main() {
  var planilha = SpreadsheetApp.openById(PLANILHA_ID);
  var fuso = AdsApp.currentAccount().getTimeZone();
  var hoje = new Date();
  var inicio180 = Utilities.formatDate(new Date(hoje.getTime() - 180 * 864e5), fuso, 'yyyy-MM-dd');
  var ontem = Utilities.formatDate(new Date(hoje.getTime() - 864e5), fuso, 'yyyy-MM-dd');

  var relatorios = [
    ['campanhas_diario',
      'SELECT segments.date, campaign.id, campaign.name, campaign.status, ' +
      'campaign_budget.amount_micros, metrics.impressions, metrics.clicks, metrics.ctr, ' +
      'metrics.cost_micros, metrics.average_cpc, metrics.conversions, metrics.all_conversions, ' +
      'metrics.search_impression_share, metrics.search_budget_lost_impression_share, ' +
      'metrics.search_rank_lost_impression_share ' +
      'FROM campaign WHERE segments.date DURING LAST_30_DAYS'],
    ['conta_mensal',
      'SELECT segments.month, metrics.impressions, metrics.clicks, metrics.ctr, ' +
      'metrics.cost_micros, metrics.conversions, metrics.all_conversions ' +
      "FROM customer WHERE segments.date BETWEEN '" + inicio180 + "' AND '" + ontem + "'"],
    ['palavras_30d',
      'SELECT campaign.name, ad_group.name, ad_group_criterion.keyword.text, ' +
      'ad_group_criterion.keyword.match_type, ad_group_criterion.status, ' +
      'ad_group_criterion.quality_info.quality_score, metrics.impressions, metrics.clicks, ' +
      'metrics.ctr, metrics.cost_micros, metrics.conversions ' +
      'FROM keyword_view WHERE segments.date DURING LAST_30_DAYS'],
    ['termos_busca_30d',
      'SELECT campaign.name, ad_group.name, search_term_view.search_term, ' +
      'search_term_view.status, metrics.impressions, metrics.clicks, metrics.ctr, ' +
      'metrics.cost_micros, metrics.conversions ' +
      'FROM search_term_view WHERE segments.date DURING LAST_30_DAYS'],
    ['anuncios_30d',
      'SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ' +
      'ad_group_ad.status, ad_group_ad.policy_summary.approval_status, metrics.impressions, ' +
      'metrics.clicks, metrics.ctr, metrics.conversions ' +
      'FROM ad_group_ad WHERE segments.date DURING LAST_30_DAYS'],
    ['conversoes_config',
      'SELECT conversion_action.id, conversion_action.name, conversion_action.category, ' +
      'conversion_action.type, conversion_action.status, conversion_action.primary_for_goal, ' +
      'conversion_action.include_in_conversions_metric ' +
      'FROM conversion_action'],
    ['conversoes_por_acao_30d',
      'SELECT campaign.name, segments.conversion_action_name, metrics.conversions, ' +
      'metrics.all_conversions ' +
      'FROM campaign WHERE segments.date DURING LAST_30_DAYS']
  ];

  var log = [['aba', 'resultado', 'executado_em']];
  var agora = Utilities.formatDate(hoje, fuso, 'yyyy-MM-dd HH:mm');

  relatorios.forEach(function (r) {
    var aba = planilha.getSheetByName(r[0]) || planilha.insertSheet(r[0]);
    try {
      AdsApp.report(r[1]).exportToSheet(aba);
      log.push([r[0], 'ok', agora]);
    } catch (e) {
      log.push([r[0], 'ERRO: ' + e.message, agora]);
    }
  });

  var abaLog = planilha.getSheetByName('_execucao') || planilha.insertSheet('_execucao');
  abaLog.clear();
  abaLog.getRange(1, 1, log.length, 3).setValues(log);
}
