# Monte Carlo — entrada da Ecobraz no mercado de consignação certificada de TI
# Cenário PESSIMISTA (premissas deliberadamente conservadoras/adversas)
# Horizonte: 24 meses · 20.000 simulações
#
# TODAS as premissas são estimativas a validar com o Marcio; as marcadas [M]
# dependem de números internos da Ecobraz que ainda não temos.

import numpy as np

rng = np.random.default_rng(42)
N = 20_000          # simulações
H = 24              # meses

# ---------------- Premissas (pessimistas) ----------------
# Piloto e adoção
P_PILOTO_FUNCIONA = 0.50        # 50% de chance de o piloto converter algum cliente
RAMP_INICIO, RAMP_FIM = 0.4, 1.3  # lotes/mês (Poisson): começa ~0,4, chega a ~1,3 no mês 24
                                   # (pessimista: nem 2 lotes/mês no regime)

# Resultado por lote para a Ecobraz (serviços + split 30% do líquido)
# Mediana ~R$ 10k, cauda até ~R$ 35k (cenários A-C do doc 05), via lognormal
LOTE_MU, LOTE_SIGMA = np.log(10_000), 0.65
# Erro sistemático das minhas estimativas (haircut aplicado por simulação inteira):
HAIRCUT_LO, HAIRCUT_HI = 0.45, 0.90   # média ~0,675 → corta ~1/3 do valor estimado

# Receita de recaptura (cliente de consignação volta a gerar contrato/serviços)
P_RECAPTURA = 0.40                    # só 40% dos clientes geram algo além do lote
RECAPTURA_LO, RECAPTURA_HI = 500, 4_000  # R$/mês por cliente ativo (pessimista)
CLIENTES_POR_LOTE = 0.5               # ~2 lotes por cliente/ano

# Custos
SETUP_LO, SETUP_HI = 15_000, 40_000   # jurídico/fiscal/processos (uma vez)
CUSTO_MENSAL = 4_000                  # comercial/admin/compliance enquanto ativo

# Canibalização da base doadora [M]
# M = receita mensal atual da Ecobraz com venda de material doado — NÃO INFORMADO.
# Premissa: entre R$ 120k e R$ 250k/mês (parte dos R$ 350k de faturamento).
P_CANIBALIZACAO = 0.40                # 40% de chance de doadores descobrirem e exigirem split
M_LO, M_HI = 120_000, 250_000
FRACAO_AFETADA_LO, FRACAO_AFETADA_HI = 0.05, 0.25  # 5% a 25% da base afetada
PERDA_LIQUIDA = 0.50                  # perde-se ~50% do valor do material afetado
                                       # (o resto volta como taxas de serviço)
MES_CANIB_LO, MES_CANIB_HI = 6, 18    # quando começa

# Piloto fracassado: 3 meses de custo, risco menor de canibalização (oferta foi discreta)
P_CANIB_SE_FRACASSO = 0.10

# ---------------- Simulação ----------------
resultados = np.zeros(N)
receita_mes24 = np.zeros(N)           # fluxo líquido no mês 24 (regime)
canib_total = np.zeros(N)

for i in range(N):
    setup = rng.uniform(SETUP_LO, SETUP_HI)
    haircut = rng.uniform(HAIRCUT_LO, HAIRCUT_HI)
    sucesso = rng.random() < P_PILOTO_FUNCIONA

    fluxo = -setup
    fluxo_m24 = 0.0
    canib = 0.0

    if not sucesso:
        fluxo -= 3 * CUSTO_MENSAL
        if rng.random() < P_CANIB_SE_FRACASSO:
            m0 = int(rng.uniform(MES_CANIB_LO, MES_CANIB_HI))
            M = rng.uniform(M_LO, M_HI)
            fr = rng.uniform(FRACAO_AFETADA_LO, FRACAO_AFETADA_HI)
            perda_mensal = M * fr * PERDA_LIQUIDA
            meses_perda = max(0, H - m0)
            canib = perda_mensal * meses_perda
            fluxo -= canib
            fluxo_m24 = -perda_mensal
    else:
        clientes_ativos = 0.0
        canib_on = rng.random() < P_CANIBALIZACAO
        m0 = int(rng.uniform(MES_CANIB_LO, MES_CANIB_HI)) if canib_on else 10**9
        M = rng.uniform(M_LO, M_HI)
        fr = rng.uniform(FRACAO_AFETADA_LO, FRACAO_AFETADA_HI)
        perda_mensal = M * fr * PERDA_LIQUIDA if canib_on else 0.0
        recap_por_cliente = (rng.uniform(RECAPTURA_LO, RECAPTURA_HI)
                             if rng.random() < P_RECAPTURA else 0.0)

        for t in range(1, H + 1):
            lam = RAMP_INICIO + (RAMP_FIM - RAMP_INICIO) * (t - 1) / (H - 1)
            n_lotes = rng.poisson(lam)
            receita_lotes = sum(rng.lognormal(LOTE_MU, LOTE_SIGMA)
                                for _ in range(n_lotes)) * haircut
            clientes_ativos += n_lotes * CLIENTES_POR_LOTE
            receita_recap = clientes_ativos * recap_por_cliente
            perda = perda_mensal if t >= m0 else 0.0
            liquido = receita_lotes + receita_recap - CUSTO_MENSAL - perda
            fluxo += liquido
            if t == H:
                fluxo_m24 = liquido
            canib += perda

    resultados[i] = fluxo
    receita_mes24[i] = fluxo_m24
    canib_total[i] = canib

# ---------------- Relatório ----------------
def pct(x, q):
    return np.percentile(x, q)

print("=== RESULTADO ACUMULADO EM 24 MESES (R$) — cenário pessimista ===")
for q in (5, 10, 25, 50, 75, 90, 95):
    print(f"P{q:>2}: {pct(resultados, q):>12,.0f}")
print(f"Média: {resultados.mean():>10,.0f}")
print()
print(f"Probabilidade de resultado acumulado POSITIVO em 24m: {(resultados > 0).mean():.1%}")
print(f"Probabilidade de PREJUÍZO acumulado em 24m:           {(resultados < 0).mean():.1%}")
print(f"Probabilidade de prejuízo acumulado > R$ 100 mil:     {(resultados < -100_000).mean():.1%}")
print(f"Probabilidade de prejuízo acumulado > R$ 500 mil:     {(resultados < -500_000).mean():.1%}")
print()
print("=== FLUXO LÍQUIDO NO MÊS 24 (regime, R$/mês) ===")
for q in (5, 25, 50, 75, 95):
    print(f"P{q:>2}: {pct(receita_mes24, q):>12,.0f}")
print(f"Probabilidade de fluxo mensal POSITIVO no mês 24:     {(receita_mes24 > 0).mean():.1%}")
print()
print("=== DECOMPOSIÇÃO DO RISCO ===")
com_canib = canib_total > 0
print(f"Simulações com canibalização: {com_canib.mean():.1%}")
print(f"  → resultado mediano NESSAS simulações: {np.median(resultados[com_canib]):>12,.0f}")
print(f"  → resultado mediano SEM canibalização: {np.median(resultados[~com_canib]):>12,.0f}")
piloto_falhou = np.isclose(receita_mes24, 0) | (resultados < -3*CUSTO_MENSAL - SETUP_LO) & (canib_total == 0) & (receita_mes24 <= 0)
print()
print("=== SENSIBILIDADE (o que mais importa) ===")
print("(comparação de medianas re-simulando um parâmetro por vez está no doc;")
print(" aqui, decomposição direta: veja canibalização acima — é o driver dominante do downside)")

# ---------------- Estatísticas condicionais (mesmas simulações) ----------------
# Re-simula guardando flags para condicionar
res2 = np.zeros(N); suc2 = np.zeros(N, bool); can2 = np.zeros(N, bool); m24 = np.zeros(N)
rng2 = np.random.default_rng(42)
for i in range(N):
    setup = rng2.uniform(SETUP_LO, SETUP_HI)
    haircut = rng2.uniform(HAIRCUT_LO, HAIRCUT_HI)
    sucesso = rng2.random() < P_PILOTO_FUNCIONA
    fluxo = -setup; canib_flag = False; fm24 = 0.0
    if not sucesso:
        fluxo -= 3 * CUSTO_MENSAL
        if rng2.random() < P_CANIB_SE_FRACASSO:
            canib_flag = True
            m0 = int(rng2.uniform(MES_CANIB_LO, MES_CANIB_HI))
            perda_mensal = rng2.uniform(M_LO, M_HI) * rng2.uniform(FRACAO_AFETADA_LO, FRACAO_AFETADA_HI) * PERDA_LIQUIDA
            fluxo -= perda_mensal * max(0, H - m0); fm24 = -perda_mensal
    else:
        clientes = 0.0
        canib_flag = rng2.random() < P_CANIBALIZACAO
        m0 = int(rng2.uniform(MES_CANIB_LO, MES_CANIB_HI)) if canib_flag else 10**9
        perda_mensal = (rng2.uniform(M_LO, M_HI) * rng2.uniform(FRACAO_AFETADA_LO, FRACAO_AFETADA_HI) * PERDA_LIQUIDA) if canib_flag else 0.0
        recap = rng2.uniform(RECAPTURA_LO, RECAPTURA_HI) if rng2.random() < P_RECAPTURA else 0.0
        for t in range(1, H + 1):
            lam = RAMP_INICIO + (RAMP_FIM - RAMP_INICIO) * (t - 1) / (H - 1)
            n = rng2.poisson(lam)
            rec = sum(rng2.lognormal(LOTE_MU, LOTE_SIGMA) for _ in range(n)) * haircut
            clientes += n * CLIENTES_POR_LOTE
            liq = rec + clientes * recap - CUSTO_MENSAL - (perda_mensal if t >= m0 else 0.0)
            fluxo += liq
            if t == H: fm24 = liq
    res2[i] = fluxo; suc2[i] = sucesso; can2[i] = canib_flag; m24[i] = fm24

print()
print("=== CONDICIONAIS ===")
s = res2[suc2]
print(f"SE o piloto funcionar (P=50%): mediana acum. 24m: {np.median(s):,.0f} | P(positivo): {(s>0).mean():.1%} | fluxo mediano mês 24: {np.median(m24[suc2]):,.0f}")
sc = res2[suc2 & ~can2]
print(f"SE piloto funcionar E sem canibalização: mediana: {np.median(sc):,.0f} | P(positivo): {(sc>0).mean():.1%}")
f = res2[~suc2]
print(f"SE o piloto fracassar: mediana: {np.median(f):,.0f} (perda contida: setup + 3 meses)")
