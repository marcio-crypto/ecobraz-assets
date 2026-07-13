import csv
import json
import re
import sys
import urllib.parse

inventory_path = sys.argv[1]
output_path = sys.argv[2]

redirects = {}
with open(inventory_path, encoding='utf-8') as handle:
    for row in csv.DictReader(handle):
        source = urllib.parse.unquote(row['caminho_original'] or '/').rstrip('/') or '/'
        target = row['destino_novo']
        normalized_source = source.rstrip('/') or '/'
        normalized_target = urllib.parse.urlsplit(target).path.rstrip('/') or '/'
        if source == '/' or normalized_source == normalized_target:
            continue
        # Primeiro registro é o mais valioso, pois o inventário está ordenado por desempenho.
        redirects.setdefault(source, target)

def exact_regex(path):
    escaped = re.sub(r'([.*+?^${}()|\[\]\\])', r'\\\1', path.rstrip('/') or '/')
    return '^' + escaped + '/?$'

ordered = sorted(redirects.items(), key=lambda item: (-len(item[0]), item[0]))
with open(output_path, 'w', encoding='utf-8') as handle:
    handle.write('301:\n')
    for source, target in ordered:
        handle.write(f'  {json.dumps(exact_regex(source), ensure_ascii=False)}: {json.dumps(target, ensure_ascii=False)}\n')

print(f'Wrote {len(ordered)} exact legacy redirects to {output_path}.')
