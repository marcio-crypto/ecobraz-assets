#!/usr/bin/env python3
# Extrai a spec embutida no Redoc dos docs transacionais v2 do E-goi e imprime o
# caminho, o método e o corpo (requestBody) exatos da operação de envio de e-mail
# (sendEmailMessages). Uso de diagnóstico; não expõe segredos.
import json
import re
import sys
import urllib.request

URL = "https://developers.e-goi.com/transactional/v2/"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "ignore")


def find_spec(d):
    if isinstance(d, dict):
        if isinstance(d.get("paths"), dict):
            return d
        for v in d.values():
            r = find_spec(v)
            if r:
                return r
    elif isinstance(d, list):
        for v in d:
            r = find_spec(v)
            if r:
                return r
    return None


def main():
    html = fetch(URL)
    print("html bytes:", len(html))
    blob = None
    for pat in [r"__redoc_state\s*=\s*(\{.*?\})\s*;?\s*</script>",
                r'id="redoc-state"[^>]*>\s*(\{.*?\})\s*</script>',
                r"JSON\.parse\(\"(.*?)\"\)\s*;?\s*</script>"]:
        m = re.search(pat, html, re.S)
        if m:
            blob = m.group(1)
            break
    if not blob:
        # tenta o maior objeto JSON dentro de <script>
        for m in re.finditer(r"<script[^>]*>(.*?)</script>", html, re.S):
            s = m.group(1)
            i = s.find("{")
            if i >= 0 and '"paths"' in s:
                blob = s[i:s.rfind("}") + 1]
                break
    if not blob:
        print("NAO achei o estado do Redoc")
        return
    if blob.startswith('"'):  # caso JSON.parse("...")
        blob = json.loads('"' + blob + '"') if not blob.endswith('"') else json.loads(blob)
    try:
        data = json.loads(blob)
    except Exception as e:
        print("parse fail:", e)
        print("trecho:", blob[:200])
        return
    spec = find_spec(data)
    if not spec:
        print("spec sem paths")
        return
    paths = spec.get("paths", {})
    comps = spec.get("components", {}).get("schemas", {})
    print("num paths:", len(paths))

    def deref(schema, depth=0):
        if depth > 5 or not isinstance(schema, dict):
            return schema
        if "$ref" in schema:
            name = schema["$ref"].split("/")[-1]
            return {"_ref": name, **deref(comps.get(name, {}), depth + 1)}
        out = {}
        for k, v in schema.items():
            if k == "properties" and isinstance(v, dict):
                out["properties"] = {pk: deref(pv, depth + 1) for pk, pv in v.items()}
            elif k in ("items", "schema"):
                out[k] = deref(v, depth + 1)
            else:
                out[k] = v
        return out

    achou = False
    for p, ops in paths.items():
        for method, op in ops.items():
            if not isinstance(op, dict):
                continue
            oid = str(op.get("operationId", ""))
            if oid.startswith("sendEmailMessages") or ("email" in p.lower() and method.lower() == "post"):
                achou = True
                print("\n====", method.upper(), p, " opId=", oid)
                for pr in op.get("parameters", []):
                    print("  param:", pr.get("name"), pr.get("in"), pr.get("required"))
                rb = op.get("requestBody", {})
                for ct, cv in rb.get("content", {}).items():
                    print("  content-type:", ct)
                    print(json.dumps(deref(cv.get("schema", {})), indent=1)[:2600])
    if not achou:
        print("nao achei sendEmailMessages; amostra de paths:")
        for p in list(paths)[:40]:
            print(" ", p, list(paths[p].keys()))


if __name__ == "__main__":
    main()
