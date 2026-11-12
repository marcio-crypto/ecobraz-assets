import re, sys, html, os

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<!\*)\*([^*\n]+)\*(?!\*)', r'<em>\1</em>', t)
    return t

def render(md):
    lines = md.split('\n')
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if not s:
            i += 1; continue
        if s == '---':
            out.append('<hr>'); i += 1; continue
        m = re.match(r'^(#{1,4})\s+(.*)$', s)
        if m:
            lv = len(m.group(1))
            out.append(f'<h{lv}>{inline(m.group(2))}</h{lv}>'); i += 1; continue
        if s.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].strip().startswith('>'):
                buf.append(re.sub(r'^\s*>\s?', '', lines[i]))
                i += 1
            sub = render('\n'.join(buf))
            out.append(f'<blockquote>{sub}</blockquote>'); continue
        if s.startswith('|'):
            tbl = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                tbl.append(lines[i].strip()); i += 1
            def cells(r):
                return [c.strip() for c in r.strip('|').split('|')]
            head = cells(tbl[0])
            body = [cells(r) for r in tbl[2:]] if len(tbl) > 2 else []
            h = ''.join(f'<th>{inline(c)}</th>' for c in head)
            b = ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body)
            out.append(f'<table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table>'); continue
        if re.match(r'^[-*]\s+', s):
            items = []
            while i < len(lines) and re.match(r'^\s*[-*]\s+', lines[i]):
                items.append(re.sub(r'^\s*[-*]\s+', '', lines[i])); i += 1
                while i < len(lines) and lines[i].startswith('  ') and lines[i].strip() and not re.match(r'^\s*[-*]\s+', lines[i]):
                    items[-1] += ' ' + lines[i].strip(); i += 1
            out.append('<ul>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ul>'); continue
        if re.match(r'^\d+\.\s+', s):
            items = []
            while i < len(lines) and re.match(r'^\s*\d+\.\s+', lines[i]):
                items.append(re.sub(r'^\s*\d+\.\s+', '', lines[i])); i += 1
                while i < len(lines) and lines[i].startswith('  ') and lines[i].strip() and not re.match(r'^\s*\d+\.\s+', lines[i]):
                    items[-1] += ' ' + lines[i].strip(); i += 1
            out.append('<ol>' + ''.join(f'<li>{inline(x)}</li>' for x in items) + '</ol>'); continue
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(r'^\s*(#{1,4}\s|>|\||[-*]\s|\d+\.\s|---$)', lines[i].strip()):
            buf.append(lines[i].strip()); i += 1
        if buf and all(b.startswith('**') for b in buf):
            out.append('<p class="meta">' + '<br>'.join(inline(b) for b in buf) + '</p>')
        else:
            out.append('<p>' + inline(' '.join(buf)) + '</p>')
    return '\n'.join(out)

CSS = """
@page { size: A4; margin: 20mm 18mm 18mm 18mm; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.5;
       color: #14181d; margin: 0; }
h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 6pt; color: #0a2547; font-family: Helvetica, Arial, sans-serif; }
h2 { font-size: 13pt; margin: 20pt 0 6pt; color: #0a2547; font-family: Helvetica, Arial, sans-serif;
     page-break-after: avoid; }
h3 { font-size: 12pt; margin: 0 0 12pt; color: #4a5566; font-weight: normal;
     font-family: Helvetica, Arial, sans-serif; page-break-after: avoid; }
h4 { font-size: 10.5pt; margin: 12pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 8pt; text-align: justify; }
a { color: #0a2547; }
hr { border: 0; border-top: 1px solid #d5dae1; margin: 16pt 0; }
blockquote { margin: 10pt 0; padding: 8pt 12pt; background: #f5f7f9;
             border-left: 3px solid #b88a3d; font-size: 9.5pt; }
blockquote p { margin: 0 0 6pt; }
blockquote p:last-child { margin-bottom: 0; }
table { border-collapse: collapse; width: 100%; margin: 10pt 0; font-size: 8.5pt;
        font-family: Helvetica, Arial, sans-serif; page-break-inside: avoid; }
th, td { border: 1px solid #c8cfd8; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #0a2547; color: #fff; font-weight: bold; }
tbody tr:nth-child(even) { background: #f5f7f9; }
ul, ol { margin: 0 0 8pt; padding-left: 18pt; }
li { margin-bottom: 4pt; }
code { font-family: 'Courier New', monospace; font-size: 9pt; }
strong { color: #08192e; }
th strong, th em { color: inherit; }
p.meta { text-align: left; font-size: 9.5pt; line-height: 1.45; }
"""

src, dst, title = sys.argv[1], sys.argv[2], sys.argv[3]
md = open(src, encoding='utf-8').read()
body = render(md)
open(dst, 'w', encoding='utf-8').write(
    f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
    f'<title>{html.escape(title)}</title><style>{CSS}</style></head><body>{body}</body></html>')
print('ok', dst)
