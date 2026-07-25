# Monte Carlo do CAMINHO COMPLETO (Reconquista + Adote + serviços + consignação)
# vs. NÃO FAZER NADA. 20.000 simulações, 24 meses. Premissas conservadoras.
import numpy as np, json

rng = np.random.default_rng(7)
N, H = 20_000, 24
BASE = 350_000.0

traj = np.zeros((N, H + 1))      # receita mensal total
traj_sq = np.zeros((N, H + 1))   # status quo (não fazer nada)
contrib_m12 = np.zeros((N, 5))   # base, reconquista, adote, servicos, consignacao

for i in range(N):
    # erosão da base (mercado segue difícil): -0,8% a 0%/mês
    ero = rng.uniform(-0.008, 0.0)
    # funil reconquista
    resp = rng.uniform(0.10, 0.30)
    prop = rng.uniform(0.30, 0.60)
    fech = rng.uniform(0.15, 0.40)
    conv = resp * prop * fech
    rev_por_contrato = rng.uniform(4_000, 15_000)   # material de leilão/mês por contrato
    serv_por_contrato = rng.uniform(0, 2_000) if rng.random() < 0.5 else 0.0
    # adote
    cotas_12m = rng.uniform(0, 6)                    # cotas vendidas até o mês 12
    rev_cota = rng.uniform(3_000, 6_000)
    teto_adote = 32_000
    # consignação (depende de jurídico + piloto)
    consig_ok = rng.random() < 0.40
    consig_regime = rng.uniform(3_000, 15_000) if consig_ok else 0.0
    # risco de execução (equipe pequena, Marcio viajando etc.)
    exec_fator = rng.uniform(0.3, 0.6) if rng.random() < 0.25 else 1.0

    contratos = 0.0
    base = BASE
    base_sq = BASE
    traj[i, 0] = traj_sq[i, 0] = BASE
    for t in range(1, H + 1):
        base *= (1 + ero)
        base_sq *= (1 + ero)
        # novos contratos: 80 contas/mês nos meses 1-3, 40/mês depois
        contas = 80 if t <= 3 else 40
        contratos += contas * conv
        # receita dos contratos com rampa de 2 meses (só contratos com 2+ meses)
        contratos_ativos = max(0.0, contratos - contas * conv * min(t, 2))
        r_rec = contratos_ativos * rev_por_contrato
        r_serv = contratos_ativos * serv_por_contrato
        # adote: rampa linear até o mês 12
        cotas_t = cotas_12m * min(t / 12, 1.0)
        r_adote = min(cotas_t * rev_cota, teto_adote)
        # consignação: começa no mês 6, rampa até o 12
        r_consig = consig_regime * min(max(t - 5, 0) / 7, 1.0)
        novo = (r_rec + r_serv + r_adote + r_consig) * exec_fator
        traj[i, t] = base + novo
        traj_sq[i, t] = base_sq
        if t == 12:
            contrib_m12[i] = [base, r_rec * exec_fator, r_adote * exec_fator,
                              r_serv * exec_fator, r_consig * exec_fator]

m12 = traj[:, 12]; m24 = traj[:, 24]; sq12 = traj_sq[:, 12]
res = {
  "P_m12_ge_550": float((m12 >= 550_000).mean()),
  "P_m12_ge_450": float((m12 >= 450_000).mean()),
  "P_m12_gt_350": float((m12 > 350_000).mean()),
  "P_m24_ge_550": float((m24 >= 550_000).mean()),
  "P_m24_ge_450": float((m24 >= 450_000).mean()),
  "P_sq12_lt_350": float((sq12 < 350_000).mean()),
  "sq12_mediana": float(np.median(sq12)),
  "m12_p10": float(np.percentile(m12, 10)),
  "m12_p50": float(np.percentile(m12, 50)),
  "m12_p90": float(np.percentile(m12, 90)),
  "m24_p10": float(np.percentile(m24, 10)),
  "m24_p50": float(np.percentile(m24, 50)),
  "m24_p90": float(np.percentile(m24, 90)),
  "contrib_m12_mediana": [float(x) for x in np.median(contrib_m12, axis=0)],
  "fan_p10": [float(np.percentile(traj[:, t], 10)) for t in range(H + 1)],
  "fan_p50": [float(np.percentile(traj[:, t], 50)) for t in range(H + 1)],
  "fan_p90": [float(np.percentile(traj[:, t], 90)) for t in range(H + 1)],
  "sq_p50":  [float(np.percentile(traj_sq[:, t], 50)) for t in range(H + 1)],
}
print(json.dumps(res, indent=1))
