import json
from datetime import date, timedelta
from collections import Counter
from scipy import stats as st
HO={'11AM':0,'12PM':1,'3PM':2,'6PM':3,'9PM':4}
rows=json.load(open('docs/draws-respaldo.json'))
rows.sort(key=lambda r:(r['fecha'],HO.get(r['horario'],99)))
nums=[int(r['numero'])%100 for r in rows]
fechas=[date.fromisoformat(r['fecha']) for r in rows]
n=len(nums)
SP_REAL=[date.fromisoformat(f) for f in ["2024-01-17","2024-03-23","2024-05-22","2024-07-06",
    "2026-04-15","2026-05-06","2026-05-20","2026-05-30","2026-06-03","2026-07-01","2026-07-18"]]
rel_map=json.load(open('data/relativos_diaria.json'))['pares']
rel_of={int(k):list({r['numero'] for r in v['relativos']}) for k,v in rel_map.items()}
K=5
ev_rel=[any(nums[j] in rel_of.get(nums[i],[]) for j in range(i+1,min(i+K+1,n))) for i in range(n)]

def medir(sp_dates,dias):
    en_v=[any(s<f<=s+timedelta(days=dias) for s in sp_dates) for f in fechas]
    a=sum(1 for i,e in enumerate(ev_rel) if e and en_v[i] and i>=K)
    ta=sum(en_v[i] for i in range(K,n))
    b=sum(1 for i,e in enumerate(ev_rel) if e and not en_v[i] and i>=K)
    tb=(n-K)-ta
    if ta<20 or tb<20: return None
    return a/ta, b/tb, st.fisher_exact([[a,ta-a],[b,tb-b]],alternative='greater').pvalue, a, ta

print("── 1. ROBUSTEZ AL TAMAÑO DE VENTANA ──")
for d in [7,10,14,21,30]:
    r=medir(SP_REAL,d)
    if r: print(f"   ventana {d:2d} días: dentro={r[0]*100:.2f}% fuera={r[1]*100:.2f}% ratio={r[0]/r[1]:.2f}× p={r[2]:.4f} ({r[3]}/{r[4]})")

print("\n── 2. PLACEBO: fechas SP desplazadas ±45 días (no debe haber señal) ──")
ps=[]
for shift in [-45,-30,30,45]:
    r=medir([s+timedelta(days=shift) for s in SP_REAL],14)
    ps.append(r[2])
    print(f"   desplazadas {shift:+d}d: ratio={r[0]/r[1]:.2f}× p={r[2]:.3f}")

print("\n── 3. POR EPISODIO (¿lo empuja uno solo?) ──")
for s in sorted(set(SP_REAL)):
    r=medir([s],14)
    if r:
        ratio=f"{r[0]/r[1]:.2f}" if r[1]>0 else "∞"
        print(f"   {s}: dentro={r[0]*100:5.2f}% ({int(r[3])}/{r[4]}) fuera={r[1]*100:.2f}% ratio={ratio}")

print("\n── 4. ¿LO EMPUJAN LOS ATRACTORES? (91,92,80,76,47 aparecen como relativos de muchos) ──")
ATRACTORES={91,92,80,76,47}
ev_rel_sin_atr=[any(nums[j] in set(rel_of.get(nums[i],[]))-ATRACTORES for j in range(i+1,min(i+K+1,n))) for i in range(n)]
en_v=[any(s<f<=s+timedelta(days=14) for s in SP_REAL) for f in fechas]
for nombre,ev in [("con atractores",ev_rel),("sin atractores",ev_rel_sin_atr)]:
    a=sum(1 for i,e in enumerate(ev) if e and en_v[i] and i>=K)
    b=sum(1 for i,e in enumerate(ev) if e and not en_v[i] and i>=K)
    ta=sum(en_v[i] for i in range(K,n)); tb=(n-K)-ta
    p=st.fisher_exact([[a,ta-a],[b,tb-b]],alternative='greater').pvalue
    print(f"   {nombre:18s}: dentro={(a/ta)*100:.2f}% fuera={(b/tb)*100:.2f}% ratio={(a/ta)/(b/tb):.2f}× p={p:.4f}")
