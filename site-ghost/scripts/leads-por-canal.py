#!/usr/bin/env python3
"""Conta os leads do cofre da Ecobraz por mês, canal de origem e perfil.

Imprime SÓ contagens. Nunca imprime nome, e-mail, telefone, empresa, endereço
nem texto livre de lead: o repositório e o log do Actions são públicos.

Uso no runner (ver .github/workflows/ferramenta-leads-por-canal.yml):
    python3 site-ghost/scripts/leads-por-canal.py            # lê o cofre
    python3 site-ghost/scripts/leads-por-canal.py --selftest  # sem rede
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from collections import Counter

CANAIS = ['busca_organica', 'chat_ia', 'busca_paga', 'perfil_google', 'social',
          'email', 'indicacao', 'direto', 'campanha']
PERFIS = {'empresa': 'empresa', 'pessoa_fisica': 'casa'}


def conta(leads):
    """leads: iterável de dicts já lidos. Devolve Counter[(mes, canal, perfil)]."""
    total = Counter()
    for lead in leads:
        if not isinstance(lead, dict):
            continue
        mes = str(lead.get('submitted_at') or '')[:7]
        if len(mes) != 7 or mes[4] != '-':
            mes = 'sem data'
        canal = lead.get('origin_channel') if lead.get('origin_channel') in CANAIS else 'sem registro'
        perfil = PERFIS.get(lead.get('profile'), 'outro')
        total[(mes, canal, perfil)] += 1
    return total


def relatorio(total):
    linhas = ['mês | canal | perfil | leads']
    for (mes, canal, perfil), n in sorted(total.items()):
        linhas.append(f'{mes} | {canal} | {perfil} | {n}')
    linhas.append(f'TOTAL | {sum(total.values())}')
    return '\n'.join(linhas)


def api(caminho, bruto=False):
    conta_cf = os.environ['CLOUDFLARE_ACCOUNT_ID']
    ns = os.environ['NS']
    url = f'https://api.cloudflare.com/client/v4/accounts/{conta_cf}/storage/kv/namespaces/{ns}/{caminho}'
    req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + os.environ['CLOUDFLARE_API_TOKEN']})
    with urllib.request.urlopen(req, timeout=30) as resposta:
        corpo = resposta.read().decode('utf-8')
    return corpo if bruto else json.loads(corpo)


def le_cofre(meses):
    leads = []
    for mes in meses:
        cursor = ''
        while True:
            consulta = urllib.parse.urlencode({'prefix': mes, 'limit': 1000, **({'cursor': cursor} if cursor else {})})
            pagina = api('keys?' + consulta)
            for chave in pagina.get('result') or []:
                try:
                    leads.append(json.loads(api('values/' + urllib.parse.quote(chave['name'], safe=''), bruto=True)))
                except (ValueError, OSError):
                    leads.append({'submitted_at': chave['name'][:10]})
            cursor = (pagina.get('result_info') or {}).get('cursor') or ''
            if not cursor:
                break
    return leads


def selftest():
    exemplo = [
        {'submitted_at': '2026-11-12T10:00:00.000Z', 'origin_channel': 'busca_organica', 'profile': 'empresa', 'name': 'NÃO IMPRIMIR'},
        {'submitted_at': '2026-11-12T11:00:00.000Z', 'origin_channel': 'busca_organica', 'profile': 'empresa'},
        {'submitted_at': '2026-11-13T09:00:00.000Z', 'origin_channel': 'chat_ia', 'profile': 'pessoa_fisica'},
        {'submitted_at': '2026-10-02T09:00:00.000Z', 'profile': 'pessoa_fisica'},
        {'submitted_at': '2026-11-14T09:00:00.000Z', 'origin_channel': '<x>', 'profile': 'qualquer'},
        'lixo',
    ]
    total = conta(exemplo)
    assert total[('2026-11', 'busca_organica', 'empresa')] == 2
    assert total[('2026-11', 'chat_ia', 'casa')] == 1
    assert total[('2026-10', 'sem registro', 'casa')] == 1
    assert total[('2026-11', 'sem registro', 'outro')] == 1
    assert sum(total.values()) == 5
    texto = relatorio(total)
    assert 'NÃO IMPRIMIR' not in texto and '@' not in texto
    print('selftest ok')
    print(texto)


if __name__ == '__main__':
    if '--selftest' in sys.argv:
        selftest()
        sys.exit(0)
    meses = [m.strip() for m in (os.environ.get('MESES') or '').split(',') if m.strip()]
    if not meses or any(len(m) != 7 or m[4] != '-' for m in meses):
        sys.exit('Informe MESES no formato AAAA-MM, separados por vírgula (ex.: 2026-11,2026-12).')
    print(relatorio(conta(le_cofre(meses))))
