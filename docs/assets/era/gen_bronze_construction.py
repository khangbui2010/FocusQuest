import re, sys
from PIL import Image
import os
SRC=sys.argv[1] if len(sys.argv)>1 else 'src/ui/components/civilization/spriteData.ts'
OUT=sys.argv[2] if len(sys.argv)>2 else 'construction'
os.makedirs(OUT,exist_ok=True)
txt=open(SRC).read()
PAL={'k':'#3f2631','K':'#3d212d','N':'#262b44','G':'#84c669','D':'#479f4a','M':'#65a556','L':'#8bd87d','t':'#eaa56c','b':'#bd6c4a','d':'#763b36','c':'#cf8254','o':'#e38628','y':'#fdbe53','p':'#fcbc8f','s':'#fec99c','a':'#f28462','w':'#c0cbdc','g':'#8b9bb4','S':'#5a6988','T':'#52607c','u':'#8c9cb5','r':'#c34b35','R':'#e84537','W':'#ffffff','B':'#009adc','C':'#76e4ff'}
def rows_of(name):
    m=re.search(r'const %s[^=]*=\s*\[(.*?)\n\];'%name,txt,re.S); body=m.group(1)
    out=[]
    for line in body.split('\n'):
        mm=re.match(r"\s*'([^']*)'(\.replace\('s', 'S'\))?,",line)
        if mm:
            r=mm.group(1)
            if mm.group(2): r=r.replace('s','S')
            out.append(r)
    return out
BUILD={'bronze_forge':('BRONZE_FORGE_ROWS','scaffold'),'bronze_market_stall':('BRONZE_MARKET_STALL_ROWS','scaffold'),'bronze_grain_silo':('BRONZE_GRAIN_SILO_ROWS','scaffold'),'bronze_irrigated_field':('BRONZE_IRRIGATED_FIELD_ROWS','dig'),'bronze_apiary':('BRONZE_APIARY_ROWS','scaffold'),'bronze_scribe_hall':('BRONZE_SCRIBE_HALL_ROWS','scaffold'),'bronze_craft_workshop':('BRONZE_CRAFT_WORKSHOP_ROWS','scaffold'),'bronze_watchtower':('BRONZE_WATCHTOWER_ROWS','scaffold'),'bronze_longhouse':('BRONZE_LONGHOUSE_ROWS','scaffold'),'bronze_town_hall':('BRONZE_TOWN_HALL_ROWS','scaffold')}
FRACS=[0.0,0.35,0.65,0.9]
def stages(rows,style):
    H=len(rows);W=len(rows[0])
    for r in rows: assert len(r)==W,(len(r),W)
    ys=[y for y,r in enumerate(rows) if r.strip('.')]; top,bot=ys[0],ys[-1]
    xs=[x for r in rows for x,c in enumerate(r) if c!='.']; l,rr=min(xs),max(xs)
    h=bot-top+1
    res=[]
    for si,f in enumerate(FRACS):
        g=[['.']*W for _ in range(H)]
        line=bot+1-round(f*h)   # rows >= line are revealed
        if f==0: line=bot+1
        # ghost silhouette (dotted) for unrevealed rows
        for y in range(top,min(line,bot+1)):
            for x in range(W):
                if rows[y][x]=='.': continue
                edge=False
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                    nx,ny=x+dx,y+dy
                    if not(0<=nx<W and 0<=ny<H) or rows[ny][nx]=='.': edge=True
                if edge and (x+y)%2==0: g[y][x]='C'
        if style=='scaffold':
            lx=max(0,l-1); rx=min(W-2,rr)
            ptop=max(top,line-5 if f>0 else bot-6)
            for x0 in (lx,rx):
                for y in range(ptop,bot+1):
                    g[y][x0]='d'; g[y][x0+1]='b'
            if si in(1,2):
                py=min(bot-1,max(top,line-2))
                for x in range(lx,rx+2):
                    if g[py][x]=='.' or x in(lx,lx+1,rx,rx+1): g[py][x]='c'
                    if g[py+1][x]=='.': g[py+1][x]='k'
        else:
            py0=min(H-2,bot+1); piles=[(l+2,py0),(rr-6,py0),(l+(rr-l)//2-2,py0)][:si+1]
            for px,py in piles:
                for (dx,dy,c) in((1,0,'k'),(2,0,'k'),(0,1,'k'),(1,1,'g'),(2,1,'w'),(3,1,'k')):
                    x,y=px+dx,py+dy
                    if 0<=x<W and 0<=y<H: g[y][x]=c
        for y in range(min(line,bot+1),bot+1):
            for x in range(W):
                if rows[y][x]!='.': g[y][x]=rows[y][x]
        res.append([''.join(r) for r in g])
    return res
data={}
for k,(nm,style) in BUILD.items():
    data[k]=stages(rows_of(nm),style)
# ---- TS output
ts=['/**',' * Under-construction sprite stages (Milestone 5E).',' * Generated from the finished Stone Age matrices in spriteData.ts; only Tiny Town palette characters are used.',' * Stage 0 = blueprint ghost + posts/rubble, 1..3 = lower 35%/65%/90% of the finished sprite revealed (bottom-up).',' * Campfire builds instantly (0 min) and has no construction sprite.',' */',"import type { PixelSpriteMatrix } from './spriteData.ts';",'']
ts.append('export const BRONZE_CONSTRUCTION_STAGE_COUNT = 4;')
ts.append('')
ts.append('export const BRONZE_CONSTRUCTION_SPRITE_STAGES: Readonly<Record<string, readonly PixelSpriteMatrix[]>> = Object.freeze({')
for k,st in data.items():
    ts.append(f'  {k}: [')
    for i,rows in enumerate(st):
        ts.append('    {')
        ts.append(f"      id: '{k}_construction_{i}',")
        ts.append(f'      width: {len(rows[0])},')
        ts.append(f'      height: {len(rows)},')
        ts.append('      reusedTiles: [],')
        ts.append('      rows: [')
        for r in rows: ts.append(f"        '{r}',")
        ts.append('      ],')
        ts.append('    },')
    ts.append('  ],')
ts.append('});')
open(OUT+'/bronzeConstructionSpriteData.ts','w').write('\n'.join(ts))
# ---- PNG contact sheet
def render(rows,scale=1):
    H=len(rows);W=len(rows[0]); im=Image.new('RGBA',(W,H),(0,0,0,0))
    for y,r in enumerate(rows):
        for x,c in enumerate(r):
            if c!='.':
                h=PAL[c].lstrip('#'); im.putpixel((x,y),tuple(int(h[i:i+2],16) for i in(0,2,4))+(255,))
    return im
GR=(132,198,105,255)
sc=4; pad=8
rowsimgs=[]
for k,st in data.items():
    ims=[render(r) for r in st]; rowsimgs.append((k,ims))
Wt=sum(i.width*sc+pad for i in rowsimgs[0][1])
def rw(ims): return sum(i.width*sc+pad for i in ims)+pad
Wmax=max(rw(ims) for _,ims in rowsimgs)
Hs=sum(max(i.height for i in ims)*sc+pad for _,ims in rowsimgs)+pad
sheet=Image.new('RGBA',(Wmax,Hs),GR)
y=pad
for k,ims in rowsimgs:
    x=pad
    for im in ims:
        b=im.resize((im.width*sc,im.height*sc),Image.NEAREST); sheet.alpha_composite(b,(x,y)); x+=b.width+pad
    y+=max(i.height for i in ims)*sc+pad
sheet.save(OUT+'/construction_stages_preview.png')
# strips per building (1x)
for k,ims in rowsimgs:
    w=sum(i.width for i in ims);hh=ims[0].height
    s=Image.new('RGBA',(w,hh),(0,0,0,0));x=0
    for im in ims: s.alpha_composite(im,(x,0));x+=im.width
    s.save(f'{OUT}/{k}_construction_strip.png')
print('ok',sheet.size)
