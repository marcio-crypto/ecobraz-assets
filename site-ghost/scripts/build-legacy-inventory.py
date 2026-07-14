import csv
import io
import json
import re
import sys
import urllib.parse
import zipfile
from collections import defaultdict

import openpyxl

workbook_path = sys.argv[1]
crawl_path = sys.argv[2]
posts_path = sys.argv[3]
pages_dir = sys.argv[4]
output_path = sys.argv[5]

with open(posts_path, encoding='utf-8') as handle:
    preserved_posts = {f"/blog/{post['slug']}" for post in json.load(handle)}

managed_paths = {'/', '/agendamento', '/blog'}
for page_file in __import__('pathlib').Path(pages_dir).glob('*.json'):
    if page_file.name == __import__('pathlib').Path(posts_path).name:
        continue
    with open(page_file, encoding='utf-8') as handle:
        managed_paths.update(f"/{page['slug']}" for page in json.load(handle))

language_segment = re.compile(r'^/(?:pt_BR|en_BR|es_BR|de_BR|fr_BR|pt|en|es|de|fr|public)(?=/|$)', re.I)


def canonical_path(url):
    path = urllib.parse.urlsplit(url).path or '/'
    while True:
        normalized = language_segment.sub('', path)
        if normalized == path:
            break
        path = normalized or '/'
    return path.rstrip('/') or '/'


def destination(path):
    value = path.lower()
    if path in managed_paths:
        return path + ('/' if path != '/' else '')
    if canonical_path(path) in preserved_posts:
        return canonical_path(path) + '/'
    rules = [
        (r'hospital|medic|anvisa|autoclave|raio-x|tomograf|laborator', '/descarte-de-equipamentos-hospitalares/'),
        (r'bateria|power-bank|nobreak|litio|chumbo-acido', '/descarte-de-baterias-e-nobreaks/'),
        (r'geladeira', '/descarte-de-geladeira-velha/'),
        (r'maquina-de-lavar', '/descarte-de-maquina-de-lavar/'),
        (r'eletrodomest|fogao|micro-ondas|microondas|ventilador|aspirador|linha-branca', '/descarte-de-eletrodomesticos/'),
        (r'televis|tv-antiga|tvs-antigas', '/descarte-de-televisao/'),
        (r'cabos|fios|cobre', '/descarte-de-cabos-e-fios/'),
        (r'servidor|data-center|datacenter|storage|rack', '/descarte-de-servidores-e-data-center/'),
        (r'impress|toner|cartucho', '/descarte-de-impressoras/'),
        (r'ar-condicionado|climatiza', '/descarte-de-ar-condicionado/'),
        (r'maquinas-e-equipamentos-industriais|automacao-industrial|transformador', '/descarte-de-maquinas-e-equipamentos-industriais/'),
        (r'\bhd\b|hds|ssd|dados|lgpd|sanitiza|midia', '/destruicao-de-dados/'),
        (r'celular|tablet|smartphone', '/descarte-de-celulares-e-tablets/'),
        (r'computador|notebook|roteador|modem|informatica', '/coleta-de-computadores-e-notebooks/'),
        (r'mtr|cdf|document|compliance|fiscal|pgrs|certific|rastreabilidade|evidencia', '/documentacao-e-rastreabilidade/'),
        (r'pnrs|logistica-reversa|responsabilidade-compartilhada|iso-14001', '/logistica-reversa/'),
        (r'ponto|onde-descartar|ecoponto|cidade|sao-paulo|osasco|barueri|guarulhos|grande-sao-paulo', '/pontos-de-coleta/'),
        (r'empresa|corporat|ativo|hardware|governo|orgao-publico|equipamentos-de-ti|itad', '/descarte-corporativo-de-ti/'),
        (r'agendamento|contato|visita-tecnica', '/agendamento/'),
        (r'como-funciona', '/como-funciona/'),
        (r'sobre-nos|institucional', '/sobre/'),
        (r'privacidade|cookie|termo-de-uso', '/politica-de-privacidade/'),
    ]
    for pattern, target in rules:
        if re.search(pattern, value):
            return target
    return '/coleta-de-lixo-eletronico/'


records = defaultdict(lambda: {'clicks': 0, 'impressions': 0, 'sources': set()})

workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
for url, clicks, impressions, _, _ in workbook['Páginas'].iter_rows(min_row=2, values_only=True):
    if not url or 'ecobraz.org' not in str(url):
        continue
    url = str(url)
    records[url]['clicks'] += int(clicks or 0)
    records[url]['impressions'] += int(impressions or 0)
    records[url]['sources'].add('gsc')

primary_reports = {
    'Notice-Pages_to_submit_to_IndexNow.csv',
    'Notice-Indexable_page_not_in_sitemap.csv',
    'Warning-indexable-H1_tag_missing_or_empty.csv',
    'Notice-indexable-H1_tag_changed.csv',
    'Notice-indexable-Meta_description_changed.csv',
    'Notice-indexable-Title_tag_changed.csv',
    'Warning-indexable-Title_too_short.csv',
    'Warning-indexable-Title_too_long.csv',
    'Notice-indexable-Multiple_H1_tags.csv',
}

with zipfile.ZipFile(crawl_path) as archive:
    for name in sorted(primary_reports.intersection(archive.namelist())):
        raw = archive.read(name).decode('utf-16le').lstrip('\ufeff')
        for row in csv.DictReader(io.StringIO(raw), delimiter='\t'):
            url = row.get('URL', '')
            if not url or 'ecobraz.org' not in url:
                continue
            records[url]['sources'].add('crawl')

rows = []
for url, metrics in records.items():
    source_path = urllib.parse.urlsplit(url).path or '/'
    canonical = canonical_path(url)
    target = destination(canonical)
    parsed_url = urllib.parse.urlsplit(url)
    hostname = (parsed_url.hostname or '').lower()
    normalized_source = source_path.rstrip('/') or '/'
    if hostname != 'ecobraz.org' or parsed_url.scheme != 'https':
        action = 'canonicalizar_host'
    elif normalized_source == canonical and canonical in (preserved_posts | managed_paths):
        action = 'manter'
    else:
        action = '301'
    rows.append({
        'url_antiga': url,
        'origem': '+'.join(sorted(metrics['sources'])),
        'cliques_90d': metrics['clicks'],
        'impressoes_90d': metrics['impressions'],
        'caminho_original': source_path,
        'caminho_canonico': canonical,
        'acao': action,
        'destino_novo': ('/' if canonical == '/' else canonical + '/') if action == 'manter' else target,
    })

rows.sort(key=lambda row: (-row['cliques_90d'], -row['impressoes_90d'], row['url_antiga']))
with open(output_path, 'w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f'Wrote {len(rows)} legacy URLs; {sum(row["acao"] == "manter" for row in rows)} preserved posts.')
