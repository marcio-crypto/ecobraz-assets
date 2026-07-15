# -*- coding: utf-8 -*-
"""Gera os CSVs da campanha Google Ads da Ecobraz e valida limites de caracteres."""
import csv, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "editor-import")
os.makedirs(OUT, exist_ok=True)

CAMPAIGN = "[Pesquisa] Ecobraz — Coletas B2B"
BASE = "https://ecobraz.org"
SUFFIX = "utm_source=google&utm_medium=cpc&utm_campaign=coletas-b2b&utm_term={keyword}&utm_content={adgroupid}"

errors = []

def check(text, limit, what):
    if len(text) > limit:
        errors.append(f"{what}: {len(text)}/{limit} -> {text!r}")
    return text

# ---------------------------------------------------------------- ad groups
# (nome, slug da landing, path1, path2)
GROUPS = {
    "g1": ("Lixo eletrônico — Empresas", "/coleta-de-lixo-eletronico-para-empresas/", "empresas", "coleta"),
    "g2": ("Ativos de TI desmobilizados", "/descarte-de-ativos-de-ti-desmobilizados/", "empresas", "ativos-de-ti"),
    "g3": ("Sanitização de dados", "/sanitizacao-segura-de-dados/", "dados", "sanitizacao"),
    "g4": ("Destruição de dados e mídias", "/destruicao-fisica-de-dados-e-midias/", "dados", "destruicao"),
    "g5": ("Data center e servidores", "/desmobilizacao-de-data-center/", "empresas", "data-center"),
    "g6": ("Equipamentos hospitalares eletrônicos", "/descarte-de-equipamentos-hospitalares/", "saude", "eletronicos"),
    "g7": ("Linha branca e eletrodomésticos — Lotes", "/descarte-de-eletrodomesticos/", "empresas", "linha-branca"),
    "g8": ("Logística reversa — Fabricantes", "/logistica-reversa-para-fabricantes-e-importadores/", "empresas", "log-reversa"),
}

# ---------------------------------------------------------------- keywords
# (grupo, keyword, match)  match: Exact | Phrase
KEYWORDS = [
    ("g1", "coleta de lixo eletrônico para empresas", "Exact"),
    ("g1", "coleta de lixo eletrônico empresas", "Exact"),
    ("g1", "coleta de lixo eletrônico", "Phrase"),
    ("g1", "descarte de lixo eletrônico empresa", "Phrase"),
    ("g1", "descarte de lixo eletrônico", "Phrase"),
    ("g1", "empresa de coleta de lixo eletrônico", "Phrase"),
    ("g1", "empresa que recolhe lixo eletrônico", "Phrase"),
    ("g1", "coleta de resíduos eletrônicos", "Phrase"),
    ("g1", "descarte de resíduos eletrônicos", "Phrase"),
    ("g1", "recolhimento de lixo eletrônico", "Phrase"),
    ("g1", "descarte de eletrônicos para empresas", "Phrase"),
    ("g1", "coleta de sucata eletrônica", "Phrase"),
    ("g1", "descarte de equipamentos eletrônicos", "Phrase"),

    ("g2", "descarte de ativos de ti", "Phrase"),
    ("g2", "descarte de computadores", "Phrase"),
    ("g2", "descarte de computadores empresas", "Phrase"),
    ("g2", "coleta de computadores usados", "Phrase"),
    ("g2", "descarte de notebooks", "Phrase"),
    ("g2", "desmobilização de ativos de ti", "Phrase"),
    ("g2", "descarte de equipamentos de informática", "Phrase"),
    ("g2", "coleta de equipamentos de informática", "Phrase"),
    ("g2", "descarte de impressoras", "Phrase"),
    ("g2", "descarte corporativo de ti", "Phrase"),

    ("g3", "sanitização de dados", "Exact"),
    ("g3", "sanitização de dados", "Phrase"),
    ("g3", "sanitização de mídias", "Phrase"),
    ("g3", "apagamento seguro de dados", "Phrase"),
    ("g3", "eliminação segura de dados", "Phrase"),
    ("g3", "sanitização de hd", "Phrase"),
    ("g3", "wipe de dados", "Phrase"),

    ("g4", "destruição de dados", "Phrase"),
    ("g4", "destruição de hd", "Phrase"),
    ("g4", "destruição de hds", "Phrase"),
    ("g4", "destruição de mídias", "Phrase"),
    ("g4", "destruição de discos rígidos", "Phrase"),
    ("g4", "trituração de hd", "Phrase"),
    ("g4", "destruição segura de hd", "Phrase"),
    ("g4", "descarte de hd com dados", "Phrase"),
    ("g4", "destruição de fitas lto", "Phrase"),

    ("g5", "desmobilização de data center", "Phrase"),
    ("g5", "descomissionamento de data center", "Phrase"),
    ("g5", "desativação de data center", "Phrase"),
    ("g5", "descarte de servidores", "Phrase"),
    ("g5", "coleta de servidores usados", "Phrase"),
    ("g5", "descarte de storage", "Phrase"),
    ("g5", "descarte de nobreak", "Phrase"),
    ("g5", "descarte de baterias de nobreak", "Phrase"),
    ("g5", "descarte de equipamentos de telecom", "Phrase"),

    ("g6", "descarte de equipamentos hospitalares", "Phrase"),
    ("g6", "descarte de equipamentos médicos", "Phrase"),
    ("g6", "descarte de equipamentos eletromédicos", "Phrase"),
    ("g6", "coleta de equipamentos hospitalares", "Phrase"),
    ("g6", "descarte de aparelhos hospitalares", "Phrase"),
    ("g6", "desmobilização de equipamentos hospitalares", "Phrase"),
    ("g6", "descarte de equipamentos de laboratório", "Phrase"),

    ("g7", "descarte de eletrodomésticos", "Phrase"),
    ("g7", "coleta de eletrodomésticos", "Phrase"),
    ("g7", "coleta de eletrodomésticos usados", "Phrase"),
    ("g7", "descarte de linha branca", "Phrase"),
    ("g7", "descarte de geladeira", "Phrase"),
    ("g7", "descarte de geladeiras", "Phrase"),
    ("g7", "descarte de máquina de lavar", "Phrase"),
    ("g7", "descarte de ar condicionado", "Phrase"),
    ("g7", "coleta de geladeira usada", "Phrase"),

    ("g8", "logística reversa de eletrônicos", "Phrase"),
    ("g8", "logística reversa de eletroeletrônicos", "Phrase"),
    ("g8", "empresa de logística reversa", "Phrase"),
    ("g8", "logística reversa para fabricantes", "Phrase"),
    ("g8", "logística reversa de eletrodomésticos", "Phrase"),
    ("g8", "gerenciadora de logística reversa", "Phrase"),
]

# ------------------------------------------------- negativas (nível campanha)
NEG_CAMPAIGN = {
    "Informacional / estudante": [
        ("como fazer", "Phrase"), ("o que é", "Phrase"), ("o que fazer", "Phrase"),
        ("por que", "Phrase"), ("porque", "Phrase"), ("resumo", "Broad"),
        ("redação", "Broad"), ("tcc", "Broad"), ("monografia", "Broad"),
        ("artigo", "Broad"), ("abnt", "Broad"), ("escola", "Broad"),
        ("atividade", "Broad"), ("exercício", "Broad"), ("significado", "Broad"),
        ("conceito", "Broad"), ("definição", "Broad"), ("importância", "Broad"),
        ("impactos ambientais", "Phrase"), ("impacto ambiental", "Phrase"),
        ("história", "Broad"), ("dados sobre", "Phrase"), ("estatísticas", "Broad"),
        ("mapa mental", "Phrase"), ("slide", "Broad"), ("cartaz", "Broad"),
        ("desenho", "Broad"), ("frases", "Broad"), ("projeto escolar", "Phrase"),
        ("educação ambiental", "Phrase"), ("palestra", "Broad"),
    ],
    "Emprego / curso / negócio próprio": [
        ("vaga", "Broad"), ("vagas", "Broad"), ("emprego", "Broad"),
        ("salário", "Broad"), ("currículo", "Broad"), ("curso", "Broad"),
        ("franquia", "Broad"), ("como montar", "Phrase"), ("como abrir", "Phrase"),
        ("plano de negócio", "Phrase"),
    ],
    "Curioso / residencial / gratuito": [
        ("grátis", "Broad"), ("gratuito", "Broad"), ("gratuita", "Broad"),
        ("perto de mim", "Phrase"), ("ecoponto", "Broad"), ("prefeitura", "Broad"),
        ("cata treco", "Phrase"), ("cata-bagulho", "Phrase"), ("cata bagulho", "Phrase"),
        ("doação", "Broad"), ("doar", "Broad"), ("onde jogar", "Phrase"),
        ("posso jogar", "Phrase"), ("lixo comum", "Phrase"),
    ],
    "Compra / venda / sucata paga": [
        ("comprar", "Broad"), ("compra", "Broad"), ("venda", "Broad"),
        ("vender", "Broad"), ("quanto vale", "Phrase"), ("preço da sucata", "Phrase"),
        ("sucata paga", "Phrase"), ("compro sucata", "Phrase"),
        ("valor da sucata", "Phrase"),
    ],
    "Fora de escopo hospitalar (contaminados / RSS)": [
        ("resíduo hospitalar", "Phrase"), ("resíduos hospitalares", "Phrase"),
        ("lixo hospitalar", "Phrase"), ("infectante", "Broad"),
        ("infectantes", "Broad"), ("perfurocortante", "Broad"),
        ("perfurocortantes", "Broad"), ("agulhas", "Broad"), ("seringas", "Broad"),
        ("medicamento", "Broad"), ("medicamentos", "Broad"),
        ("radioativo", "Broad"), ("quimioterápico", "Broad"), ("rss", "Broad"),
    ],
    "Fora da área de cobertura": [
        ("rio de janeiro", "Phrase"), ("rj", "Phrase"), ("belo horizonte", "Phrase"),
        ("bh", "Phrase"), ("curitiba", "Phrase"), ("porto alegre", "Phrase"),
        ("salvador", "Phrase"), ("recife", "Phrase"), ("fortaleza", "Phrase"),
        ("brasília", "Phrase"), ("goiânia", "Phrase"), ("manaus", "Phrase"),
        ("belém", "Phrase"), ("natal", "Phrase"), ("londrina", "Phrase"),
        ("florianópolis", "Phrase"), ("vitória", "Phrase"), ("cuiabá", "Phrase"),
    ],
}

# negativas de roteamento entre grupos (evita disputa interna / anúncio errado)
NEG_ADGROUP = [
    ("g1", "geladeira", "Broad"), ("g1", "eletrodoméstico", "Broad"),
    ("g1", "eletrodomésticos", "Broad"), ("g1", "hospitalar", "Broad"),
    ("g1", "hospitalares", "Broad"), ("g1", "hd", "Broad"), ("g1", "dados", "Broad"),
    ("g2", "hospitalar", "Broad"), ("g2", "data center", "Phrase"),
    ("g7", "hospitalar", "Broad"), ("g7", "informática", "Broad"),
    ("g6", "linha branca", "Phrase"), ("g6", "geladeira", "Broad"),
]

# ---------------------------------------------------------------- RSAs
# grupo -> (headlines[<=30], descriptions[<=90], pins {index: 'H1'})
ADS = {
    "g1": {
        "headlines": [
            ("Coleta de Lixo Eletrônico", None),
            ("Para Empresas com CNPJ", "H2"),
            ("Atendemos a Grande São Paulo", None),
            ("Inventário e Custódia do Lote", None),
            ("Documentação de Destinação", None),
            ("Retirada Agendada na Empresa", None),
            ("Solicite Avaliação de Coleta", None),
            ("Descarte com Rastreabilidade", None),
            ("Coletas Recorrentes", None),
            ("Logística Reversa Documentada", None),
            ("Do Depósito à Destinação", None),
            ("Descreva o Lote em 1 Minuto", None),
        ],
        "descriptions": [
            "Coleta de lixo eletrônico para empresas, com inventário, custódia e documentação.",
            "Retirada agendada na Grande São Paulo. Solicite uma avaliação e receba retorno da equipe.",
            "Notebooks, servidores, impressoras e eletrônicos em geral, com rastreabilidade.",
            "Pare de acumular passivo no depósito. Descreva o lote no formulário em 1 minuto.",
        ],
    },
    "g2": {
        "headlines": [
            ("Descarte de Ativos de TI", None),
            ("Para Empresas com CNPJ", "H2"),
            ("Inventário e Custódia", None),
            ("Documentação para Auditoria", None),
            ("MTR e CDF Quando Aplicáveis", None),
            ("Notebooks, Servidores e Mais", None),
            ("Atendemos a Grande São Paulo", None),
            ("Descreva o Lote em 1 Minuto", None),
            ("Retirada Agendada no Local", None),
            ("Tratamento de Dados Registrado", None),
            ("Solicite Avaliação de Coleta", None),
            ("Descarte Corporativo de TI", None),
        ],
        "descriptions": [
            "Retiramos, inventariamos e destinamos cada ativo de TI, com documentação para auditoria.",
            "Notebooks parados e servidores sem destino? Descreva o lote e receba avaliação da equipe.",
            "Inventário, tratamento de dados registrado, MTR e CDF quando aplicáveis.",
            "Atendemos a Grande São Paulo com retirada agendada. Solicite pelo formulário do site.",
        ],
    },
    "g3": {
        "headlines": [
            ("Sanitização de Dados", None),
            ("Relatório Por Mídia", "H2"),
            ("Método Documentado", None),
            ("Equipamento Segue Utilizável", None),
            ("Devolva Máquinas Sem Dados", None),
            ("Apagamento Seguro de Dados", None),
            ("Para Empresas | Grande SP", None),
            ("O Risco Sai Por Escrito", None),
            ("Descreva o Parque em 1 Minuto", None),
            ("Solicite uma Avaliação", None),
            ("Atende TI, Segurança e DPO", None),
            ("Sanitização Lógica Segura", None),
        ],
        "descriptions": [
            "Sanitização lógica com método documentado e relatório por mídia. O risco sai por escrito.",
            "Contrato de locação vencendo? Devolva as máquinas sem nenhum dado dentro.",
            "Quando sanitizar não resolve, indicamos a destruição física na própria avaliação.",
            "Formatar não é sanitizar. Atenda às exigências de TI, segurança e DPO com relatório.",
        ],
    },
    "g4": {
        "headlines": [
            ("Destruição Física de Dados", None),
            ("Destruição de HDs e Mídias", None),
            ("Com Custódia e Registro", "H2"),
            ("Para Empresas | Grande SP", None),
            ("HDs, SSDs, Fitas e Mídias", None),
            ("Solicite Avaliação de Coleta", None),
            ("Registro da Destruição", None),
            ("Descarte de HD com Dados", None),
            ("Tratamento Registrado", None),
            ("Descreva o Lote em 1 Minuto", None),
            ("Fim de Vida com Segurança", None),
            ("Documentação do Processo", None),
        ],
        "descriptions": [
            "Destruição física de HDs, SSDs, fitas e mídias, com custódia e registro do processo.",
            "Mídias com dados não podem virar sucata comum. Destrua com registro e documentação.",
            "Atendemos empresas na Grande São Paulo. Descreva o lote e receba a avaliação da equipe.",
            "Cadeia de custódia do recebimento à destruição. Solicite avaliação pelo site.",
        ],
    },
    "g5": {
        "headlines": [
            ("Desmobilização de Data Center", None),
            ("Do Rack ao Imóvel Entregue", "H2"),
            ("Inventário Por Rack", None),
            ("Retirada em Janelas Planejadas", None),
            ("Descarte de Servidores", None),
            ("Mídias Tratadas com Registro", None),
            ("Para Empresas | Grande SP", None),
            ("Racks, Storages e Nobreaks", None),
            ("Descreva o Site em 1 Minuto", None),
            ("Solicite uma Avaliação", None),
            ("Migração Pronta? Desmobilize", None),
            ("Encerramento Documentado", None),
        ],
        "descriptions": [
            "Desmobilizamos data centers com inventário por rack e tratamento de mídias registrado.",
            "A migração acabou, mas a sala continua custando? Retirada em janelas planejadas.",
            "Racks, servidores, storages e nobreaks, do desligamento à destinação documentada.",
            "Entregue o imóvel vazio e com a papelada certa. Descreva o site e receba avaliação.",
        ],
    },
    "g6": {
        "headlines": [
            ("Descarte Hospitalar Eletrônico", None),
            ("Equipamentos Não Contaminados", "H2"),
            ("Eletromédicos Desmobilizados", None),
            ("Com Declaração do Gerador", None),
            ("Documentação de Destinação", None),
            ("Para Hospitais e Clínicas", None),
            ("Atendemos a Grande São Paulo", None),
            ("Solicite Avaliação de Coleta", None),
            ("Inventário e Custódia", None),
            ("Desmobilização de Equipamentos", None),
            ("Retirada Agendada no Local", None),
            ("Informe Tipo, Estado e Volume", None),
        ],
        "descriptions": [
            "Coleta de equipamentos hospitalares eletrônicos não contaminados, com declaração.",
            "Não coletamos resíduos infectantes ou químicos. Somente eletrônicos descontaminados.",
            "Desmobilizou o parque de eletromédicos? Informe tipo, estado e volume no formulário.",
            "Documentação de destinação para hospitais, clínicas e laboratórios.",
        ],
    },
    "g7": {
        "headlines": [
            ("Descarte de Eletrodomésticos", None),
            ("Linha Branca em Lote", "H2"),
            ("Para Empresas e Instituições", None),
            ("Geladeiras e Lavadoras", None),
            ("Coleta Agendada de Lotes", None),
            ("Atendemos a Grande São Paulo", None),
            ("Solicite Avaliação de Coleta", None),
            ("Retirada na Sua Operação", None),
            ("Documentação de Destinação", None),
            ("Renovou o Parque? Retiramos", None),
            ("Descarte com Rastreabilidade", None),
            ("Descreva o Lote em 1 Minuto", None),
        ],
        "descriptions": [
            "Descarte de geladeiras, lavadoras e linha branca em lote, com coleta agendada.",
            "Trocou os eletrodomésticos da operação? Retiramos o lote antigo com documentação.",
            "Atendemos empresas na Grande São Paulo. Descreva o lote e receba avaliação da equipe.",
            "Coleta em volume para empresas, condomínios e instituições. Solicite avaliação.",
        ],
    },
    "g8": {
        "headlines": [
            ("Logística Reversa Eletrônicos", None),
            ("Para Fabricantes", "H2"),
            ("Para Importadores", None),
            ("Destinação Documentada", None),
            ("Registros Verificáveis", None),
            ("Atendemos a Grande São Paulo", None),
            ("Solicite uma Avaliação", None),
            ("Fluxo de Retorno Estruturado", None),
            ("Logística Reversa Documentada", None),
            ("Eletroeletrônicos e Baterias", None),
            ("Descreva a Operação", None),
            ("Fale com a Equipe", None),
        ],
        "descriptions": [
            "Logística reversa de eletroeletrônicos para fabricantes e importadores, com registros.",
            "Estruture o fluxo de retorno dos seus produtos com destinação documentada.",
            "Atendemos empresas na Grande São Paulo. Descreva a operação e receba avaliação.",
            "Do recebimento à destinação, com documentação das etapas do processo.",
        ],
    },
}

# ---------------------------------------------------------------- assets
SITELINKS = [
    ("Como Funciona", "Do contato à destinação,", "passo a passo.", "/como-funciona/"),
    ("Evidências Públicas", "Registros verificáveis", "das destinações.", "/evidencias/"),
    ("Soluções por Setor", "A prova que o seu", "mercado exige.", "/solucoes-por-setor/"),
    ("Solicitar Avaliação", "Descreva o lote e", "receba retorno.", "/agendamento/?perfil=empresa"),
]
CALLOUTS = [
    "Foco em empresas", "Inventário e custódia", "Grande São Paulo",
    "Retirada agendada", "Coletas recorrentes", "Destinação documentada",
]
SNIPPETS = ("Serviços", [
    "Coleta de eletrônicos", "Sanitização de dados", "Destruição de mídias",
    "Desmobilização de TI", "Logística reversa", "Linha branca em lote",
])

# ---------------------------------------------------------------- validação
for gid, ad in ADS.items():
    gname = GROUPS[gid][0]
    assert len(ad["headlines"]) >= 8, gid
    for h, _pin in ad["headlines"]:
        check(h, 30, f"[{gname}] título")
    for d in ad["descriptions"]:
        check(d, 90, f"[{gname}] descrição")
for gid, (gname, slug, p1, p2) in GROUPS.items():
    check(p1, 15, f"[{gname}] path1"); check(p2, 15, f"[{gname}] path2")
for t, d1, d2, _u in SITELINKS:
    check(t, 25, "sitelink texto"); check(d1, 35, "sitelink desc1"); check(d2, 35, "sitelink desc2")
for c in CALLOUTS:
    check(c, 25, "frase de destaque")
for s in SNIPPETS[1]:
    check(s, 25, "snippet")

if errors:
    print("ERROS DE LIMITE:")
    print("\n".join(errors))
    sys.exit(1)

# ---------------------------------------------------------------- escrita
def w(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        cw = csv.writer(f)
        cw.writerow(header)
        cw.writerows(rows)
    print(f"ok {name} ({len(rows)} linhas)")

w("01-campanha.csv",
  ["Campaign", "Campaign Type", "Networks", "Languages", "Location", "Location option",
   "Campaign Daily Budget", "Bid Strategy Type", "Ad Schedule", "Final URL suffix"],
  [[CAMPAIGN, "Search", "Google search", "pt", "Região Metropolitana de São Paulo, Brazil",
    "Presence (people in or regularly in)", "70.00", "Maximize clicks (max CPC R$4,00)",
    "Seg-Sex 07:00-19:00", SUFFIX]])

# Sem coluna de URL: no nível do grupo ela torna o tipo de linha ambíguo na
# importação do Editor. As URLs finais ficam nos anúncios (CSV 05).
w("02-grupos-de-anuncio.csv",
  ["Campaign", "Ad Group", "Ad Group Type", "Status", "Max CPC"],
  [[CAMPAIGN, g[0], "Standard", "Enabled", "3.00"] for g in GROUPS.values()])

w("03-palavras-chave.csv",
  ["Campaign", "Ad Group", "Keyword", "Match Type"],
  [[CAMPAIGN, GROUPS[gid][0], kw, mt] for gid, kw, mt in KEYWORDS])

neg_rows = []
for categoria, kws in NEG_CAMPAIGN.items():
    for kw, mt in kws:
        neg_rows.append([CAMPAIGN, "", kw, f"Negative {mt}", categoria])
for gid, kw, mt in NEG_ADGROUP:
    neg_rows.append([CAMPAIGN, GROUPS[gid][0], kw, f"Negative {mt}", "Roteamento entre grupos"])
w("04-palavras-negativas.csv",
  ["Campaign", "Ad Group", "Keyword", "Match Type", "Categoria"], neg_rows)

rsa_rows = []
max_h = max(len(a["headlines"]) for a in ADS.values())
header = ["Campaign", "Ad Group", "Ad Type", "Final URL", "Path 1", "Path 2"]
for i in range(1, max_h + 1):
    header += [f"Headline {i}", f"Headline {i} position"]
for i in range(1, 5):
    header.append(f"Description {i}")
for gid, ad in ADS.items():
    gname, slug, p1, p2 = GROUPS[gid]
    row = [CAMPAIGN, gname, "Responsive search ad", BASE + slug, p1, p2]
    for h, pin in ad["headlines"]:
        row += [h, pin or ""]
    row += [""] * ((max_h - len(ad["headlines"])) * 2)
    row += ad["descriptions"]
    rsa_rows.append(row)
w("05-anuncios-rsa.csv", header, rsa_rows)

asset_rows = []
for t, d1, d2, u in SITELINKS:
    asset_rows.append([CAMPAIGN, "Sitelink", t, d1, d2, BASE + u])
for c in CALLOUTS:
    asset_rows.append([CAMPAIGN, "Callout", c, "", "", ""])
for s in SNIPPETS[1]:
    asset_rows.append([CAMPAIGN, f"Structured snippet ({SNIPPETS[0]})", s, "", "", ""])
w("06-recursos-sitelinks-destaques.csv",
  ["Campaign", "Asset Type", "Text", "Description 1", "Description 2", "Final URL"], asset_rows)

print("\nTudo validado dentro dos limites do Google Ads.")
