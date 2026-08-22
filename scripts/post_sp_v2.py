import json
from datetime import date, timedelta
from scipy import stats as st
HO={'11AM':0,'12PM':1,'3PM':2,'6PM':3,'9PM':4}
rows=json.load(open('docs/draws-respaldo.json'))
rows.sort(key=lambda r:(r['fecha'],HO.get(r['horario'],99)))
nums=[int(r['numero'])%100 for r in rows]
fechas=[date.fromisoformat(r['fecha']) for r in rows]
n=len(nums)
SP=[date.fromisoformat(f) for f in ["2024-01-17","2024-03-23","2024-05-22","2024-07-06",
    "2026-04-15","2026-05-06","2026-05-20","2026-05-30","2026-06-03","2026-07-01","2026-07-18"]]
VENTANA=14
en_v=[any(s<f<=s+timedelta(days=VENTANA) for s in SP) for f in fechas]

rel_map=json.load(open('data/relativos_diaria.json'))['pares']
rel_of={int(k):list({r['numero'] for r in v['relativos']}) for k,v in rel_map.items()}
def espejo(x): return (x%10)*10+x//10
def variantes(x):
    v={espejo(x),(100-x)%100,(x+50)%100}; v.discard(x); return v

K=5
def evento_en_ventana_correcto(targets_fn):
    ev=[]
    for i in range(n):
        T=targets_fn(nums[i])
        ev.append(any(nums[j] in T for j in range(i+1,min(i+K+1,n))))
    return ev

ev_rel=evento_en_ventana_correcto(lambda x:set(rel_of.get(x,[])))
ev_math=evento_en_ventana_correcto(lambda x:(lambda v:(v.discard(x),v)[1])(set([espejo(x),(100-x)%100,(x+50)%100])))
ev_any=[a or b for a,b in zip(ev_rel,ev_math)]

print(f"Ventana REAL de K={K} sorteos · global relativos: {sum(ev_rel[K:])*100/(n-K):.2f}% (azar≈9.6%) · cualquier variante: {sum(ev_any[K:])*100/(n-K):.2f}% (azar≈22.6%)\n")
def comparar(nombre,eventos):
    a=sum(1 for i,e in enumerate(eventos) if e and en_v[i] and i>=K)
    b=sum(1 for i,e in enumerate(eventos) if e and not en_v[i] and i>=K)
    ta=sum(en_v[i] for i in range(K,n)); tb=(n-K)-ta
    rin=a/max(ta,1); rout=b/max(tb,1)
    p=st.fisher_exact([[a,ta-a],[b,tb-b]],alternative='greater').pvalue
    print(f"  {nombre:44s} dentro={rin*100:5.2f}% fuera={rout*100:5.2f}% ratio={rin/rout:.2f}× p={p:.4f} {'★' if p<0.05 else ''}")
comparar("RELATIVOS oficiales tras el número", ev_rel)
comparar("VARIANTES matemáticas tras el número", ev_math)
comparar("CUALQUIER variante", ev_any)

# repetidos k=5 también con ventana corregida
ev_rep=[i>=5 and nums[i] in nums[i-5:i] for i in range(n)]
a=sum(1 for i,e in enumerate(ev_rep) if e and en_v[i]); ta=sum(en_v[i] for i in range(n))
b=sum(1 for i,e in enumerate(ev_rep) if e and not en_v[i]); tb=n-ta
p=st.fisher_exact([[a,ta-a],[b,tb-b]],alternative='greater').pvalue
print(f"  {'REPETIDOS k=5':44s} dentro={a/ta*100:5.2f}% fuera={b/tb*100:5.2f}% ratio={(a/ta)/(b/tb):.2f}× p={p:.4f} {'★' if p<0.05 else ''}")
