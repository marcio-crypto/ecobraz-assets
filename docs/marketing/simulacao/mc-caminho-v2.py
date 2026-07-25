# Monte Carlo v2 do CAMINHO COMPLETO — agora com a ESCADA DO SISTEMA (preços
# aprovados em 25/07/2026: módulos 190/890/2400, relatórios 1900/3900/4900 e
# pacote 6900, consultoria 2500-6500/mês) além de Reconquista + Adote + consignação.
# 20.000 simulações, 24 meses, premissas conservadoras.
import numpy as np, json

rng = np.random.default_rng(7)
N, H = 20_000, 24
BASE = 350_000.0

traj = np.zeros((N, H + 1))
contrib_m12 = np.zeros((N, 6))   # base, reconquista, adote, escada, servicos, consignacao
contrib_m24 = np.zeros((N, 6))

for i in range(N):
    ero = rng.uniform(-0.008, 0.0)
    resp = rng.uniform(0.10, 0.30); prop = rng.uniform(0.30, 0.60); fech = rng.uniform(0.15, 0.40)
    conv = resp * prop * fech
    rev_por_contrato = rng.uniform(4_000, 15_000)
    serv_por_contrato = rng.uniform(0, 2_000) if rng.random() < 0.5 else 0.0
    cotas_12m = rng.uniform(0, 6); rev_cota = rng.uniform(3_000, 6_000); teto_adote = 32_000
    consig_ok = rng.random() < 0.40
    consig_regime = rng.uniform(3_000, 15_000) if consig_ok else 0.0
    exec_fator = rng.uniform(0.3, 0.6) if rng.random() < 0.25 else 1.0

    # --- escada do sistema (NOVO) — taxas de adesão conservadoras, por simulação ---
    attach_mod = rng.uniform(0.15, 0.40)          # % de contratos que assinam algum módulo
    mrr_mod = rng.uniform(600, 1_500)             # mix 190/890/2400 → MRR médio
    attach_rel = rng.uniform(0.20, 0.50)          # % que compra relatórios no ano
    rel_mensalizado = rng.uniform(3_000, 6_900) / 12
    attach_cons = rng.uniform(0.05, 0.20)         # % que contrata consultoria Villanova
    cons_mrr = rng.uniform(2_500, 6_500)
    TETO_CONSULTORIA = 3 * 6_500                  # capacidade da Villanova (~3 contas)

    contratos = 0.0; base = BASE
    traj[i, 0] = BASE
    for t in range(1, H + 1):
        base *= (1 + ero)
        contas = 80 if t <= 3 else 40
        contratos += contas * conv
        ativos = max(0.0, contratos - contas * conv * min(t, 2))
        r_rec = ativos * rev_por_contrato
        r_serv = ativos * serv_por_contrato
        r_adote = min(cotas_12m * min(t / 12, 1.0) * rev_cota, teto_adote)
        r_consig = consig_regime * min(max(t - 5, 0) / 7, 1.0)
        # escada: sistema no ar a partir do mês 4, adesão com rampa de 3 meses
        if t >= 4:
            rampa = min((t - 3) / 3, 1.0)
            r_escada = ativos * (attach_mod * mrr_mod + attach_rel * rel_mensalizado) * rampa
            r_escada += min(ativos * attach_cons * cons_mrr, TETO_CONSULTORIA) * rampa
        else:
            r_escada = 0.0
        novo = (r_rec + r_serv + r_adote + r_consig + r_escada) * exec_fator
        traj[i, t] = base + novo
        if t == 12:
            contrib_m12[i] = [base, r_rec*exec_fator, r_adote*exec_fator, r_escada*exec_fator, r_serv*exec_fator, r_consig*exec_fator]
        if t == 24:
            contrib_m24[i] = [base, r_rec*exec_fator, r_adote*exec_fator, r_escada*exec_fator, r_serv*exec_fator, r_consig*exec_fator]

m12 = traj[:, 12]; m24 = traj[:, 24]
res = {
  "P_m12_ge_550": round(float((m12 >= 550_000).mean()), 4),
  "P_m12_ge_450": round(float((m12 >= 450_000).mean()), 4),
  "P_m12_gt_350": round(float((m12 > 350_000).mean()), 4),
  "P_m24_ge_550": round(float((m24 >= 550_000).mean()), 4),
  "P_m24_ge_450": round(float((m24 >= 450_000).mean()), 4),
  "m12_p10_p50_p90": [round(float(np.percentile(m12, q))) for q in (10, 50, 90)],
  "m24_p10_p50_p90": [round(float(np.percentile(m24, q))) for q in (10, 50, 90)],
  "contrib_m12_mediana": [round(float(x)) for x in np.median(contrib_m12, axis=0)],
  "escada_m24_mediana": round(float(np.median(contrib_m24[:, 3]))),
  "fan_p10": [round(float(np.percentile(traj[:, t], 10))/1000) for t in range(H + 1)],
  "fan_p50": [round(float(np.percentile(traj[:, t], 50))/1000) for t in range(H + 1)],
  "fan_p90": [round(float(np.percentile(traj[:, t], 90))/1000) for t in range(H + 1)],
}
print(json.dumps(res, indent=1))
