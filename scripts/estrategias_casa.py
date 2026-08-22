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
SP=[date.fromisoformat(f) for f in ["2024-01-17","2024-03-23","2024-05-22","2024-07-06",
    "2026-04-15","2026-05-06","2026-05-20","2026-05-30","2026-06-03","2026-07-01","2026-07-18"]]
VENTANA=14
en_ventana=[]
for f in fechas:
    en_ventana.append(any(s<f<=s+timedelta(days=VENTANA) for s in SP))

# vocabulario de variantes por número
rel_map=json.load(open('data/relativos_diaria.json'))['pares']
rel_of={}
for k,v in rel_map.items():
    rel_of[int(k)]=list({r['numero'] for r in v['relativos']})
def espejo(x): return (x%10)*10+x//10
def variantes(x):
    v={espejo(x),(100-x)%100,(x+50)%100}
    v.discard(x)
    return v

K=5
ev_rel=[]; ev_math=[]; ev_any=[]; ev_saladito_win=[]
DOBLES={0,11,22,33,44,55,66,77,88,99}
REDONDOS={x for x in range(0,100,10)}
MULT5={x for x in range(0,100,5)}
SALADITOS=DOBLES|REDONDOS|MULT5   # lo que el público adora (proxy popularidad alta)

for i in range(n):
    R=set(rel_of.get(nums[i],[]))
    M=variantes(nums[i])
    ev_rel.append(any(nums[j] in R for j in range(i+1,min(i+K,n))))
    ev_math.append(any(nums[j] in M for j in range(i+1,min(i+K,n))))
    ev_any.append(ev_rel[-1] or ev_math[-1])

def comparar(nombre,eventos):
    a=sum(1 for i,e in enumerate(eventos) if e and i>0 and en_ventana[i] and i>=K)
    b=sum(1 for i,e in enumerate(eventos) if e and not en_ventana[i] and i>=K)
    ta=sum(en_ventana[i] for i in range(K,n)); tb=(n-K)-ta
    rin=a/max(ta,1); rout=b/max(tb,1)
    p=st.fisher_exact([[a,ta-a],[b,tb-b]],alternative='greater').pvalue
    print(f"  {nombre:44s} dentro={rin*100:5.2f}% fuera={rout*100:5.2f}% ratio={rin/max(rout,1e-9):.2f}× p={p:.4f} {'★' if p<0.05 else ''}")
    return p

print(f"── SEGUIMIENTO DE VARIANTES EN {K} SORTEOS POST (dentro vs fuera de ventanas post-SP) ──")
comparar("RELATIVOS oficiales caen después del número", ev_rel)
comparar("VARIANTES matemáticas (espejo/compl/+50)", ev_math)
comparar("CUALQUIER variante cultural o matemática", ev_any)

# Baseline de azar por simulación para ev_any
import random
random.seed(11)
tot_sim=0; hit_sim=0
for _ in range(30):
    sim=[random.randrange(100) for _ in range(n)]
    for i in range(K,n-K-1,K*7):
        R=set(rel_of.get(sim[i],[])); M=variantes(sim[i])
        tot_sim+=1
        if any(sim[j] in R or sim[j] in M for j in range(i+1,i+K+1)): hit_sim+=1
print(f"\n  Azar simulado 'cualquier variante': {hit_sim/tot_sim*100:.2f}%  | real global: {sum(ev_any[K:])/(n-K)*100:.2f}%")

print("\n── SESGO DE PAGO: ¿post-SP salen MÁS saladitos (populares = pagan más)? o MENOS? ──")
a=sum(1 for i in range(n) if nums[i] in SALADITOS and en_ventana[i])
ta=sum(en_ventana)
b=sum(1 for i in range(n) if nums[i] in SALADITOS and not en_ventana[i])
tb=n-ta
pin=a/ta; pout=b/tb
p=st.fisher_exact([[a,ta-a],[b,tb-b]],alternative='two-sided').pvalue
print(f"  % ganadores tipo saladito  dentro={pin*100:.1f}%  fuera={pout*100:.1f}%  p={p:.3f} {'★' if p<0.05 else '(sin sesgo detectable)'}")

print("\n── PERIODO COMPLETO: ¿los relativos siguen mejor que el azar alguna vez? ──")
# por año
from collections import defaultdict
anios=defaultdict(lambda:[0,0])
for i in range(K,n):
    y=fechas[i].year
    anios[y][1]+=1
    if ev_rel[i]: anios[y][0]+=1
for y in sorted(anios):
    h,t=anios[y]; print(f"   {y}: relativos caen {h/t*100:5.2f}% (azar≈9.6%)", "★" if h/t>0.115 else "")

print("\n── CONTROL: 5 objetivos ALEATORIOS fijos por número (mismo método) ──")
random.seed(99)
ev_ctrl=[]
for i in range(n):
    T=set(random.sample(range(100),5)); T.discard(nums[i])
    ev_ctrl.append(any(nums[j] in T for j in range(i+1,min(i+K,n))))
print(f"   control aleatorio: {sum(ev_ctrl[K:])/(n-K)*100:.2f}%  (analítico: {((1-(1-5/100)**K))*100:.1f}%)")
print(f"   variantes reales : {sum(ev_any[K:])/(n-K)*100:.2f}%")

print("\n── DIAGNÓSTICO: mismo método sobre datos BARAJADOS ──")
shuf=nums[:]; random.shuffle(shuf)
def tasa_fija(seq):
    h=t=0
    for i in range(K,len(seq)-K-1):
        T=set(random.sample(range(100),5)); T.discard(seq[i])
        t+=1
        if any(seq[j] in T for j in range(i+1,i+K+1)): h+=1
    return h/t
print(f"   orden real    : {tasa_fija(nums)*100:.2f}%")
print(f"   barajado      : {tasa_fija(shuf)*100:.2f}%")
print(f"   analítico iid : 22.6%")

# ¿habrá duplicados consecutivos de fecha/horario (mismo sorteo dos veces)?
dup=sum(1 for i in range(1,len(rows)) if rows[i]['fecha']==rows[i-1]['fecha'] and rows[i]['horario']==rows[i-1]['horario'])
print(f"   sorteos duplicados (misma fecha+horario consecutivos): {dup}")
