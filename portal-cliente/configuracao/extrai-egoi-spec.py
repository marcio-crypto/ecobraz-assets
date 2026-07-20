#!/usr/bin/env python3
# Extrai, do HTML do Redoc dos docs transacionais v2 do E-goi, os CAMINHOS de e-mail
# e o contexto da operacao de envio (sendEmailMessages), direto do texto bruto
# (a spec vem embutida e escapada). Nao parseia o JSON gigante inteiro — usa regex.
import re
import sys
import urllib.request

URL = "https://developers.e-goi.com/transactional/v2/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def unescape(s):
    # desescapa \" \\ \n \/ etc. de forma simples (texto vindo de string JS)
    return (s.replace('\\"', '"').replace("\\/", "/").replace("\\n", " ")
             .replace("\\\\", "\\"))


def main():
    html = fetch(URL)
    print("html bytes:", len(html))

    # 1) Todos os caminhos de e-mail (na forma escapada \"/v2/email...\").
    paths = sorted(set(re.findall(r'/v\d/email[A-Za-z0-9/_{}.-]*', html)))
    print("--- caminhos /vN/email encontrados ---")
    for p in paths[:60]:
        print("  ", p)

    # 2) Onde aparece a operacao de envio? Mostra contexto (desescapado) ao redor.
    for op in ("sendEmailMessages", "sendEmailMessage"):
        for m in re.finditer(re.escape(op), html):
            i = m.start()
            trecho = unescape(html[max(0, i - 400): i + 500])
            print("\n==== contexto de", op, "@", i, "====")
            print(trecho)
            break  # so a primeira ocorrencia de cada

    # 3) Procura o bloco de schema do corpo: chaves camelCase tipicas de envio.
    print("\n--- amostras de chaves camelCase perto de 'email' (candidatas do payload) ---")
    campos = sorted(set(re.findall(r'\\"(sender[A-Za-z]*|subject|recipients?|to|cc|bcc|html[A-Za-z]*|text[A-Za-z]*|body[A-Za-z]*|templateId|tags?|attachments?)\\"', html)))
    for c in campos[:60]:
        print("  ", c)

    # 4) Se houver um objeto "requestBody"/"EmailMessage" no texto escapado, mostra um trecho.
    for chave in ('EmailMessage', 'sendEmailMessages'):
        idx = html.find('\\"' + chave + '\\"')
        if idx > 0:
            print("\n--- trecho perto de schema", chave, "---")
            print(unescape(html[idx: idx + 900]))
            break


if __name__ == "__main__":
    main()
