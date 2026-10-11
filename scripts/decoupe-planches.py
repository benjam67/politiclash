# Détoure et découpe les deux planches (fond vert, 4 colonnes x 3 lignes) d'un personnage en 23 poses de 1300 x 820 px.
# Usage : python3 scripts/decoupe-planches.py <dossier des 2 planches> raw/fighters/<identifiant> <aperçu.jpg>
# Dépendances : pillow, numpy, scipy. La planche 2 est reconnue à sa pose allongée ; sa dernière case (idle) sert de repère d'échelle.
import sys, glob, os, numpy as np
from PIL import Image
from scipy import ndimage as ndi
SRC,OUT,CHECK=sys.argv[1],sys.argv[2],sys.argv[3]
os.makedirs(OUT,exist_ok=True)
S1=["idle","walk1","walk2","jump","crouch","guard","guard_low","quick","air_slap","kick","crouch_kick","windup"]
S2=["swing","slap","special","special2","selfslap","hit","hit_heavy","down","getup","dazed","victory","_idle2"]
W,H,FOOT=1300,820,10
def key(path):
    a=np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    d=g-np.maximum(r,b)
    alpha=np.clip((70-d)/50,0,1)
    g2=np.where(d>0,np.maximum(r,b),g)
    return np.dstack([r,g2,b,alpha*255]).astype(np.uint8)
def blobs(rgba):
    m=rgba[...,3]>128
    lab,n=ndi.label(ndi.binary_dilation(m,iterations=12))
    hh,ww=m.shape; out={}
    for i,s in enumerate(ndi.find_objects(lab)):
        mm=m[s]&(lab[s]==i+1); area=mm.sum()
        if area<20000: continue
        cy,cx=ndi.center_of_mass(mm); cy+=s[0].start; cx+=s[1].start
        cell=int(cy//(hh/3))*4+int(cx//(ww/4))
        crop=rgba[s].copy(); crop[...,3]=np.where(lab[s]==i+1,crop[...,3],0)
        ys,xs=np.nonzero(crop[...,3]>128)
        crop=crop[ys.min():ys.max()+1,xs.min():xs.max()+1]
        out.setdefault(cell,[]).append((area,crop,cx-s[1].start-xs.min()))
    return {c:max(v,key=lambda t:t[0])[1:] for c,v in out.items()}, {c:len(v) for c,v in out.items()}
f=sorted(glob.glob(os.path.join(SRC,"*.png")))
assert len(f)==2,f
B=[blobs(key(x)) for x in f]
flat=[max(c.shape[1]/c.shape[0] for c,_ in b[0].values()) for b in B]
i2=int(np.argmax(flat)); i1=1-i2      # la planche 2 contient la pose allongée
for i in (i1,i2): print("planche",1 if i==i1 else 2,os.path.basename(f[i])[:8],"cases",sorted(B[i][1].items()),"aplat max",round(flat[i],1))
sp1={S1[c]:v for c,v in B[i1][0].items()}; sp2={S2[c]:v for c,v in B[i2][0].items()}
miss=[n for n in S1 if n not in sp1]+[n for n in S2 if n not in sp2]
if miss: print("MANQUE",miss)
h1=sp1["idle"][0].shape[0]; h2=sp2["_idle2"][0].shape[0]; k=h1/h2
print("idle",h1,"/",h2,"correction",round(k,3))
allsp=dict(sp1)
for n,(c,cx) in sp2.items():
    if n.startswith("_"): continue
    im=Image.fromarray(c).resize((round(c.shape[1]*k),round(c.shape[0]*k)),Image.LANCZOS)
    allsp[n]=(np.asarray(im),cx*k)
for n,(c,cx) in allsp.items():
    h,w=c.shape[:2]; x=round(W/2-cx); x=max(0,min(W-w,x)); y=H-FOOT-h
    if y<0 or w>W: print("TROP GRAND",n,w,h)
    cv=Image.new("RGBA",(W,H),(0,0,0,0)); cv.alpha_composite(Image.fromarray(c),(x,max(0,y))); cv.save(os.path.join(OUT,n+".png"))
order=[n for n in S1+S2 if n in allsp]
sheet=Image.new("RGB",(6*300,4*190),(70,70,80))
for i,n in enumerate(order):
    im=Image.open(os.path.join(OUT,n+".png")).resize((300,190)); bg=Image.new("RGBA",(300,190),(200,120,160,255) if (i+i//6)%2 else (120,160,200,255)); bg.alpha_composite(im); sheet.paste(bg.convert("RGB"),((i%6)*300,(i//6)*190))
sheet.save(CHECK,quality=85)
