#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auditoría empírica completa sobre 12,921 sorteos reales de La Diaria (HN).
Pregunta: ¿hay ALGÚN patrón explotable o todo es azar uniforme?
Todo contraste incluye corrección por comparaciones múltiples (FDR Benjamini-Hochberg).
"""
import json, math
from collections import Counter, defaultdict
from scipy import stats as st

# ── Carga y orden cronológico ────────────────────────────────────────────────
HORARIO_ORDER = {"11AM": 0, "12PM": 1, "3PM": 2, "6PM": 3, "9PM": 4}
rows = json.load(open("docs/draws-respaldo.json"))
rows.sort(key=lambda r: (r["fecha"], HORARIO_ORDER.get(r["horario"], 99)))
nums = [int(r["numero"]) % 100 for r in rows]
n = len(nums)
fechas = [r["fecha"] for r in rows]
horarios = [r["horario"] for r in rows]
print(f"═══ {n} sorteos · {fechas[0]} → {fechas[-1]} ═══\n")

def fdr(pvals, q=0.05):
    """Benjamini-Hochberg. Devuelve lista de bools (significativo)."""
    m = len(pvals)
    if m == 0: return []
    idx = sorted(range(m), key=lambda i: pvals[i])
    sig = [False]*m
    prev = False
    for rank, i in enumerate(reversed(idx), 1):
        k = m - rank + 1
        ok = pvals[i] <= q * k / m
        prev = ok or prev
        sig[i] = prev
    return sig

print("── 1. UNIFORMIDAD GLOBAL χ² (0-99) ──")
obs = Counter(nums)
chi2, p = st.chisquare([obs.get(i,0) for i in range(100)])
esperado = n/100
desv = [(i, obs.get(i,0), (obs.get(i,0)-esperado)/math.sqrt(esperado)) for i in range(100)]
desv.sort(key=lambda x:-abs(x[2]))
print(f"   χ²={chi2:.1f} (df=99) p={p:.4f}")
for i,o,z in desv[:5]: print(f"   #{i:02d}: {o} apariciones ({z:+.1f}σ)")

print("\n── 2. χ² POR AÑO + FDR ──")
anios = defaultdict(list)
for num,f in zip(nums, fechas): anios[f[:4]].append(num)
ps, names = [], []
for a in sorted(anios):
    c = Counter(anios[a]); e = len(anios[a])/100
    chi2a, pa = st.chisquare([c.get(i,0) for i in range(100)])
    ps.append(pa); names.append(a)
sig = fdr(ps)
for a,s,pv in zip(names, sig, ps):
    print(f"   {a}: p={pv:.4f} {'★ SIGNIFICATIVO' if s else 'ok'}")

print("\n── 3. REPETICIÓN EN VENTANA CORTA (k=1..10) vs azar ──")
for k in range(1,11):
    hits = sum(1 for i in range(k,n) if nums[i] in nums[i-k:i])
    ph = hits/(n-k); azar = 1-(0.99)**k
    z = (ph-azar)/math.sqrt(azar*(1-azar)/(n-k))
    print(f"   ventana {k:2d}: real={ph*100:5.2f}%  azar={azar*100:5.2f}%  z={z:+.2f}")

print("\n── 4. AUTOCORRELACIÓN DE VALORES (lags 1..30) ──")
media = sum(nums)/n
var = sum((x-media)**2 for x in nums)/n
maxz, maxlag = 0, 0
for lag in range(1,31):
    cov = sum((nums[i]-media)*(nums[i-lag]-media) for i in range(lag,n))/(n-lag)
    r = cov/var
    z = r*math.sqrt(n)
    if abs(z)>abs(maxz): maxz, maxlag = z, lag
print(f"   mayor |z| en lags 1-30: z={maxz:+.2f} (lag {maxlag}); esperado máx |z|≈2.7 por azar")

print("\n── 5. TRANSICIONES ENTRE NÚMEROS ESPECÍFICOS ──")
pares = Counter()
for i in range(1,n): pares[(nums[i-1], nums[i])] += 1
top = pares.most_common(5)
pv_binom = []
for (a,b),c in top:
    pv = st.binomtest(c, n-1, 0.01, alternative="greater").pvalue
    pv_binom.append(pv)
    print(f"   {a:02d}→{b:02d}: {c} veces (esperado {n/100:.0f}) p={pv:.3f}")

print("\n── 6. TRANSICIONES FAMILIA→FAMILIA (la hipótesis aves→aves) ──")
guia = json.load(open("data/guia_suenos.json"))
fam_of = {int(k): v["familia"] for k,v in guia.items()}
elem_of = {int(k): v.get("elemento","") for k,v in guia.items()}
AVES = [21,28,76,89,92]  # Pájaro, Gallo, Palomas, Búho, Águila
familias = sorted(set(fam_of.values()))
print(f"   familias oficiales: {len(familias)}; grupo AVES curado: {AVES}")
resultados_fam = []
for k in range(1,11):
    # transición: familia del sorteo i → familia del sorteo i+k
    cnt = defaultdict(int)
    tot = defaultdict(int)
    for i in range(n-k):
        fo = fam_of[nums[i]]
        fi = fam_of[nums[i+k]]
        tot[fo] += 1
        if fo == fi: cnt[(fo,fi)] += 1
    for f in familias:
        F = sum(1 for x in range(100) if fam_of[x]==f)
        if F==0: continue
        azar_k = 1-(1-F/100)**k
        obs_f = cnt.get((f,f),0)
        trials = tot[f]
        if trials>=30:
            pv = st.binomtest(obs_f, trials, azar_k, alternative="greater").pvalue
            resultados_fam.append(("fam", f, k, obs_f, trials, azar_k, pv))
# aves como grupo propio
for k in range(1,16):
    is_ave = [num in AVES for num in nums]
    hits = sum(1 for i in range(n-k) if is_ave[i] and is_ave[i+k])
    trials = sum(is_ave[:n-k])
    F = len(AVES)
    azar_k = 1-(1-F/100)**k
    if trials>=20:
        pv = st.binomtest(hits, trials, azar_k, alternative="greater").pvalue
        resultados_fam.append(("aves", "AVES", k, hits, trials, azar_k, pv))
sigf = fdr([r[6] for r in resultados_fam])
print(f"   pruebas realizadas: {len(resultados_fam)}; significativas tras FDR: {sum(sigf)}")
mejores = sorted(zip(resultados_fam,sigf), key=lambda x:x[0][6])[:3]
for (tipo,f,k,o,t,az,pv),s in mejores:
    print(f"   mejor caso ({tipo}): {f} k={k}: {o}/{t} (azar {az*100:.1f}%) p={pv:.3f} {'★' if s else ''}")
# gap entre aves
gaps = [i-j for j,i in enumerate([idx for idx,a in enumerate(is_ave) if a]) if False]
pos_aves = [i for i,a in enumerate(is_ave) if a]
gap_aves = [b-a for a,b in zip(pos_aves,pos_aves[1:])]
if gap_aves:
    mg = sum(gap_aves)/len(gap_aves)
    print(f"   gap medio entre aves: {mg:.1f} sorteos (azar teórico: {100/len(AVES):.0f}) — {len(gap_aves)} episodios")

print("\n── 7. ESTACIONALIDAD POR NÚMERO (mes / día-semana / horario) ──")
from datetime import date
pruebas_est = []
for num in set(nums):
    idxs = [i for i,x in enumerate(nums) if x==num]
    if len(idxs)<15: continue
    # mes
    cm = Counter(fechas[i][5:7] for i in idxs)
    pm = st.chisquare([cm.get(f"{m:02d}",0) for m in range(1,13)]).pvalue
    # día de semana
    dw = [date.fromisoformat(fechas[i]).weekday() for i in idxs]
    cd = Counter(dw)
    pd_ = st.chisquare([cd.get(d,0) for d in range(7)]).pvalue
    pruebas_est.extend([(f"{num:02d}-mes",pm),(f"{num:02d}-dow",pd_)])
sigE = fdr([p for _,p in pruebas_est])
print(f"   números probados: {len(pruebas_est)//2}; significativos tras FDR: {sum(sigE)}")

print("\n── 8. DECENA Y TERMINACIÓN ──")
dec = Counter(x//10 for x in nums)
ter = Counter(x%10 for x in nums)
cd_, pd_ = st.chisquare([dec.get(i,0) for i in range(10)])
ct_, pt_ = st.chisquare([ter.get(i,0) for i in range(10)])
print(f"   decena:  χ²={cd_:.1f}(df=9) p={pd_:.3f}")
print(f"   termina: χ²={ct_:.1f}(df=9) p={pt_:.3f}")

print("\n═══ CONCLUSIÓN ═══")
print(f"""   Uniformidad global: {'SE DESVÍA' if p<0.01 else 'uniforme (p=%.3f)'%p}
   Años con desvío significativo (FDR): {sum(sig)}/{len(sig)}
   Autocorrelación máxima: z={maxz:+.2f}
   Transiciones familia significativas (FDR): {sum(sigf)}/{len(sigf)}
   Estacionalidad por número (FDR): {sum(sigE)}/{len(sigE)}""")
