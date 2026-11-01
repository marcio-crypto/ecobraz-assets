#!/usr/bin/env python3
"""Prova, pelo PIXEL, que a arte de cada post é a arte daquele post.

    python3 site-villanova/scripts/confere-arte-por-ocr.py \
        --campanha site-villanova/campanhas/VESG-LI-2026-11

POR QUE ISTO EXISTE. A verificação da Fase 2 provou que os 60 posts tinham
imagem, que as 95 URLs eram distintas e que o texto batia. Nada disso prova que
a arte do A05 é do A05 — uma troca de índice no gerador passaria em todos
aqueles testes. Este conferidor lê o pixel e não olha o código que gerou a peça.

O TESTE NÃO É "o texto esperado aparece na peça". Esse passaria mesmo com a
arte trocada, porque toda peça compartilha marca, moldura e aviso legal. O
teste é de DISCRIMINAÇÃO: para cada peça, calcula-se o quanto ela casa com
CADA post da campanha, e exige-se que o vencedor seja o post do nome do
arquivo. Arte trocada reprova por construção.

São três critérios, e eles existem porque um só não basta:

1. VOCABULÁRIO INTEIRO — que post explica melhor tudo que eu li na peça?
   Empata quando o gancho é curto e dois posts dividem o vocabulário.
2. PRIMEIRA LINHA, olhando da peça — que primeira linha de post explica
   melhor as palavras da peça? É a regra de design do cartão (o gancho é a
   primeira linha útil do post) e desempata o critério 1.
3. PRIMEIRA LINHA, olhando do post — quanto da primeira linha do post está na
   peça? É a MESMA informação medida ao contrário, e não é redundante: este é
   o único critério sensível a gancho CORTADO. Em compensação, ele penaliza
   justamente a peça cortada em 110 caracteres quando outro post do mesmo dia
   abre com palavras parecidas — foi o que aconteceu com o par S19/A19 de
   19/11/2026. Mantido apesar do falso positivo conhecido: um critério que
   nunca reclama não está medindo nada.
4. CLASSE — peça de vendas tem chamada de ação e endereço do site; peça de
   autoridade tem a pílula do pilar. Não depende de vocabulário nenhum, e é o
   que decide os pares autoridade/vendas do mesmo dia e do mesmo tema.

Uma peça só é dada como provada quando NENHUM critério a casa com outro post.
Divergência entre critérios não é falha: é o conferidor pedindo leitura humana,
e a saída diz qual peça e por quê.

PRECISA DE: ffmpeg e tesseract-ocr no PATH.
  apt-get update && apt-get install -y tesseract-ocr

ARMADILHA JÁ PAGA, não repita: não amplie a imagem antes do OCR e não deixe o
tesseract abrir as próprias threads. Com upscale 1.6x e `xargs -P 8` numa
máquina de 4 núcleos, isto levou mais de 10 minutos para ler 13 peças (load 31).
Sem upscale e com OMP_THREAD_LIMIT=1, lê 60 peças em 5 segundos. O ganancho
nasce em 54px — ampliar não acrescenta nada.
"""
import argparse, glob, json, os, re, shutil, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor


def exige(programa):
    if not shutil.which(programa):
        sys.exit(f'ERRO: {programa} não está no PATH. Veja o cabeçalho deste arquivo.')


def ocr(caminho, destino):
    """Lê o pixel de uma peça. Inverte porque a arte é texto claro sobre navy e
    o tesseract espera o contrário."""
    base = os.path.splitext(os.path.basename(caminho))[0]
    png = os.path.join(destino, base + '.png')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', caminho,
                    '-vf', 'format=gray,negate,eq=contrast=1.35', png], check=True)
    try:
        r = subprocess.run(['tesseract', png, 'stdout', '-l', 'eng', '--psm', '6'],
                           capture_output=True, text=True, timeout=300,
                           env={**os.environ, 'OMP_THREAD_LIMIT': '1'})
        return base, r.stdout
    finally:
        os.unlink(png)


def le_pecas(padrao, destino):
    arqs = sorted(glob.glob(padrao))
    if not arqs:
        sys.exit(f'ERRO: nenhuma peça em {padrao}')
    with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
        return dict(ex.map(lambda a: ocr(a, destino), arqs))


def toks(t):
    return {w for w in re.findall(r'[a-z0-9]+', t.lower()) if len(w) >= 4}


def moldura(ocrs, limiar=0.4):
    """Palavras presentes em quase toda peça (marca, aviso legal, endereço).
    Não distinguem nada; mantê-las infla todas as notas por igual."""
    cont = {}
    for t in ocrs.values():
        for w in toks(t):
            cont[w] = cont.get(w, 0) + 1
    return {w for w, c in cont.items() if c / len(ocrs) > limiar}


def discrimina(titulo, ocrs, refs, exigir_margem):
    """Critério de discriminação. refs: id -> texto de referência."""
    stop = moldura(ocrs)
    reft = {k: toks(v) - stop for k, v in refs.items()}
    suspeitas, margens = [], []
    for pid in sorted(ocrs):
        lidos = toks(ocrs[pid]) - stop
        if not lidos:
            suspeitas.append((pid, 'OCR não devolveu palavra útil', 0.0, '', 0.0))
            continue
        notas = sorted(((len(lidos & reft[k]) / len(lidos), k) for k in reft if reft[k]), reverse=True)
        (n1, k1), (n2, k2) = notas[0], notas[1]
        margens.append(n1 - n2)
        if k1 != pid:
            suspeitas.append((pid, f'casou melhor com {k1}', n1, k2, n2))
        elif exigir_margem and (n1 - n2) < 1e-9:
            suspeitas.append((pid, f'empatou com {k2}', n1, k2, n2))
    margens.sort()
    print(f'{titulo}: {len(ocrs) - len(suspeitas)}/{len(ocrs)}'
          + (f'  ·  margem pior {margens[0]:.2f}, mediana {margens[len(margens)//2]:.2f}' if margens else ''))
    for s in suspeitas:
        print(f'   ? {s[0]}: {s[1]} ({s[2]:.2f} contra {s[4]:.2f})')
    return {s[0] for s in suspeitas}


def primeira_linha(p):
    if p.get('card_hook'):
        return p['card_hook']
    ls = [l.strip() for l in p['text'].split('\n') if l.strip()]
    if p.get('front') == 'authority' and ls and ls[0].startswith('Evidence Note'):
        ls = ls[1:]
    return ls[0] if ls else ''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--campanha', default='site-villanova/campanhas/VESG-LI-2026-11')
    a = ap.parse_args()
    exige('ffmpeg'); exige('tesseract')
    raiz = a.campanha.rstrip('/')
    posts = {p['id']: p for p in json.load(open(f'{raiz}/content/posts.json', encoding='utf-8'))['posts']}

    with tempfile.TemporaryDirectory() as tmp:
        cartoes = le_pecas(f'{raiz}/arte/cartoes/*.jpg', tmp)
        slides = le_pecas(f'{raiz}/arte/carrosseis/*.jpg', tmp) if glob.glob(f'{raiz}/arte/carrosseis/*.jpg') else {}

    print(f'\n=== {len(cartoes)} cartões e {len(slides)} slides lidos pelo pixel ===\n')

    # 1. vocabulário inteiro
    s1 = discrimina('1. vocabulário inteiro ',
                    cartoes, {k: (p.get('card_hook') or '') + ' ' + p['text'] for k, p in posts.items()}, True)
    # 2. primeira linha, olhando da peça
    linhas = {k: primeira_linha(p) for k, p in posts.items()}
    s2 = discrimina('2. 1a linha (da peça) ', cartoes, linhas, True)
    # 3. primeira linha, olhando do post — mede o contrário, e é o único
    #    critério que enxerga gancho cortado.
    s3 = set()
    lt = {k: toks(v) for k, v in linhas.items() if v}
    for pid in sorted(cartoes):
        lidos = toks(cartoes[pid])
        notas = sorted(((len(lt[k] & lidos) / len(lt[k]), k) for k in lt), reverse=True)
        (n1, k1), (n2, k2) = notas[0], notas[1]
        if k1 != pid or (n1 - n2) < 1e-9:
            s3.add(pid)
            print(f'   ? {pid}: casou melhor com {k1} ({n1:.2f} contra {n2:.2f})')
    print(f'3. 1a linha (do post) : {len(cartoes) - len(s3)}/{len(cartoes)}')
    # 4. classe (não depende de vocabulário)
    MARCAS = [r'send\s+the\s+request', r'envie\s+.{0,3}\s*pedido', r'villanovaesg\s*\.?\s*com']
    s4c = set()
    for pid, t in cartoes.items():
        tem = any(re.search(m, t.lower()) for m in MARCAS)
        if tem != (posts[pid].get('front') == 'sales'):
            s4c.add(pid)
            print(f'   ? {pid}: classe da peça não bate com front={posts[pid].get("front")}')
    print(f'4. classe da peça     : {len(cartoes) - len(s4c)}/{len(cartoes)}')

    s4 = set()
    if slides:
        spec = json.load(open(f'{raiz}/content/carrosseis.json', encoding='utf-8'))['carrosseis']
        refs = {}
        for c in spec:  # mesma ordem que o renderiza-carrossel.mjs monta
            pags = [c['capa']] + [f"{s.get('n','')} {s['titulo']} {s['linha']}" for s in c['slides']] \
                   + [c['fecho'] + ' ' + c.get('fecho_linha', '')]
            for i, texto in enumerate(pags, 1):
                refs[f"{c['post']}-{i:02d}"] = texto
        s4 = discrimina('5. slides (vocabulário)', slides, refs, True)

    # Uma peça só reprova se TODOS os critérios aplicáveis a ela a rejeitarem.
    # Divergência entre critérios é pedido de leitura humana, não falha.
    reprovadas = (s1 & s2 & s3 & s4c) | s4
    duvidas = ((s1 | s2 | s3 | s4c) - reprovadas)
    print('\n' + '=' * 58)
    print(f'{len(cartoes) + len(slides) - len(reprovadas)}/{len(cartoes) + len(slides)} peças provadas pelo pixel.')
    if duvidas:
        print(f'{len(duvidas)} peça(s) em que os critérios divergiram — olhe com o olho: {sorted(duvidas)}')
    if reprovadas:
        print(f'REPROVADAS (nenhum critério as defendeu): {sorted(reprovadas)}')
    return 1 if reprovadas else 0


if __name__ == '__main__':
    sys.exit(main())
