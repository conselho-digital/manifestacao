# uso: python3 build3.py <pasta com car.json> <saida.glb>   (carro GTA SA -> GLB: nó body + wheel_FL/FR/BL/BR)
import json,struct,io,sys,numpy as np
from PIL import Image
src,outp=sys.argv[1:3]
EXTRA=set(sys.argv[3].split(',')) if len(sys.argv)>3 else set()
D=json.load(open(src+'/car.json'))
import os
if os.environ.get('LIST')=='1':
    for _a in D['atoms']: _a['strip']=False
conv=lambda p:np.array([-p[0],p[2],p[1]],np.float32)   # GTA (x dir, y frente, z cima) -> glTF (x esquerda, y cima, z frente)
blob=bytearray(); views=[]; acc=[]
def add(data,target=None):
    while len(blob)%4: blob.append(0)
    views.append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data),**({'target':target} if target else {})}); blob.extend(data); return len(views)-1
def accessor(bv,ct,count,typ,mn=None,mx=None):
    a={'bufferView':bv,'componentType':ct,'count':count,'type':typ}
    if mn is not None: a['min']=mn; a['max']=mx
    acc.append(a); return len(acc)-1
images=[];textures=[];tex_of={}
have={t['name']:t for t in D['texs']}
def tex_index(name):
    if name in tex_of: return tex_of[name]
    t=have[name]; raw=np.fromfile(f"{src}/tex_{name}.rgba",np.uint8).reshape(t['h'],t['w'],4)
    im=Image.fromarray(raw[:,:,:3],'RGB')
    if max(im.size)>512: im.thumbnail((512,512),Image.LANCZOS)
    b=io.BytesIO(); im.save(b,'JPEG',quality=88)
    images.append({'bufferView':add(b.getvalue()),'mimeType':'image/jpeg'}); textures.append({'source':len(images)-1,'sampler':0}); tex_of[name]=len(textures)-1; return tex_of[name]
LIGHTS={(255,175,0):(255,238,190,1),(0,255,200):(255,238,190,1),(185,255,0):(205,25,25,1),(255,60,0):(205,25,25,1)}
BYTEX={'vehicletyres128':(22,22,24),'vehicledash32':(45,45,50),'vehiclesteering128':(40,40,44),'vehiclelights128':(215,215,220),'vehiclegeneric256':(205,205,210),'vehiclegrunge256':(205,205,210),'vehiclescratch64':(205,205,210),'carplate':(235,235,235),'carpback':(60,60,60),'vehicleshatter128':(205,205,210)}
materials=[];mat_key={}
def material(m):
    c=tuple(m['color']); tex=m['tex']; key=(c,tex)
    if key in mat_key: return mat_key[key]
    name=f"m{len(materials)}"; pm={'metallicFactor':0.15,'roughnessFactor':0.6}; mt={'doubleSided':True}
    rgb=c[:3]; alpha=c[3]/255
    if rgb==(60,255,0): name='paint'; pm['baseColorFactor']=[1,1,1,1]
    elif rgb==(255,0,175): name='trim'; pm['baseColorFactor']=[.12,.12,.13,1]
    elif rgb in LIGHTS: l=LIGHTS[rgb]; name='light'; pm['baseColorFactor']=[l[0]/255,l[1]/255,l[2]/255,1]
    elif tex in have: pm['baseColorFactor']=[1,1,1,alpha]; pm['baseColorTexture']={'index':tex_index(tex)}
    else:
        b=BYTEX.get(tex,(205,205,210)); f=[b[0]/255*c[0]/255,b[1]/255*c[1]/255,b[2]/255*c[2]/255]; pm['baseColorFactor']=f+[alpha]
    if alpha<0.97 and name not in('paint',): mt['alphaMode']='BLEND'; name='glass' if name.startswith('m') else name
    mt['name']=name; mt['pbrMetallicRoughness']=pm; materials.append(mt); mat_key[key]=len(materials)-1; return mat_key[key]
def keep(a):
    n=a['name']; ch=a['chain']
    if 'interior' in ch or n.endswith('_dam') or n.startswith('ug_') or n=='retrovisor': return False
    if any(c in ch for c in ('door_lf_dummy','door_rf_dummy')): return False   # portas da frente vão em nós separados
    return n.endswith('_ok') or n in EXTRA
UVQ=float(__import__('os').environ.get('UVQ','8'))
CELL=float(__import__('os').environ.get('CELL','0'))   # >0: simplifica por agrupamento de vértices (célula em metros)
def decimate(P,N,UV,tri,cell):
    P=np.array(P,np.float32); UV=np.array(UV,np.float32); N=np.array(N,np.float32)
    used=np.unique(tri)
    key=np.concatenate([np.floor(P[used]/cell),np.round(UV[used]*UVQ)],1).astype(np.int64)
    _,inv,cnt=np.unique(key,axis=0,return_inverse=True,return_counts=True); inv=inv.reshape(-1)
    k=len(cnt); newP=np.zeros((k,3)); newUV=np.zeros((k,2))
    np.add.at(newP,inv,P[used]); np.add.at(newUV,inv,UV[used]); newP/=cnt[:,None]; newUV/=cnt[:,None]
    remap=np.full(len(P),-1); remap[used]=inv
    t=remap[np.array(tri).reshape(-1,3)]
    keep=(t[:,0]!=t[:,1])&(t[:,1]!=t[:,2])&(t[:,0]!=t[:,2]); t=t[keep]
    # normais: média das normais originais do agrupamento (mantém o sombreado do modelo)
    nn=np.zeros((k,3)); np.add.at(nn,inv,N[used])
    nn/=np.maximum(np.linalg.norm(nn,axis=1,keepdims=True),1e-9)
    return newP.astype(np.float32),nn.astype(np.float32),newUV.astype(np.float32),t.reshape(-1)
def mesh_from(atoms,center=None,flip=False):
    pos=[];nor=[];uv=[];groups={}
    for a in atoms:
        P=[conv(a['pos'][i:i+3]) for i in range(0,len(a['pos']),3)]; N=[conv(a['nor'][i:i+3]) for i in range(0,len(a['nor']),3)]
        if center is not None: P=[p-center for p in P]
        if flip: P=[np.array([-p[0],p[1],-p[2]],np.float32) for p in P]; N=[np.array([-p[0],p[1],-p[2]],np.float32) for p in N]
        UVs=[a['uv'][i:i+2] for i in range(0,len(a['uv']),2)]
        bins=a['bins']
        if CELL>0 and (not os.environ.get('CELL_ATOMS') or a['name'] in os.environ['CELL_ATOMS'].split('|')):
            # converte tiras em listas, junta todas as faixas do átomo e simplifica por agrupamento
            alltri=[];mats=[]
            for bm in bins:
                idx=bm['idx']; tri=[]
                if a.get('strip'):
                    for k in range(len(idx)-2):
                        x,y,z=idx[k],idx[k+1],idx[k+2]
                        if x==y or y==z or x==z: continue
                        tri+=[x,y,z] if k%2==0 else [y,x,z]
                else: tri=idx
                alltri.append(tri); mats.append(bm['mat'])
            tot=np.concatenate([np.array(t,np.int64) for t in alltri]) if alltri else np.zeros(0,np.int64)
            if len(tot)==0: continue
            cell=CELL*(1.5 if a['name']=='wheel' else 1.0)
            newP,newN,newUV,_=decimate(P,N,UVs,tot,cell)
            used=np.unique(tot); key=np.concatenate([np.floor(np.array(P,np.float32)[used]/cell),np.round(np.array(UVs,np.float32)[used]*UVQ)],1).astype(np.int64)
            _,inv=np.unique(key,axis=0,return_inverse=True); inv=inv.reshape(-1); remap=np.full(len(P),-1); remap[used]=inv
            base=len(pos); pos+=list(newP); nor+=list(newN); uv+=[list(u) for u in newUV]
            for tri,mid in zip(alltri,mats):
                t=remap[np.array(tri,np.int64).reshape(-1,3)]; keep=(t[:,0]!=t[:,1])&(t[:,1]!=t[:,2])&(t[:,0]!=t[:,2]); t=t[keep]
                if len(t): _,ui=np.unique(np.sort(t,axis=1),axis=0,return_index=True); t=t[np.sort(ui)]
                groups.setdefault(material(a['mats'][mid]),[]).extend((base+t.reshape(-1)).tolist())
            continue
        base=len(pos)
        pos+=P; nor+=N; uv+=UVs
        for bm in bins:
            idx=bm['idx']
            if a.get('strip'):  # tira de triângulos -> lista (alternando o sentido, sem triângulos degenerados)
                tri=[]
                for k in range(len(idx)-2):
                    x,y,z=idx[k],idx[k+1],idx[k+2]
                    if x==y or y==z or x==z: continue
                    tri+= [x,y,z] if k%2==0 else [y,x,z]
                idx=tri
            groups.setdefault(material(a['mats'][bm['mat']]),[]).extend(base+i for i in idx)
    pos=np.array(pos,np.float32); nor=np.array(nor,np.float32); uv=np.array(uv,np.float32)
    aP=accessor(add(pos.tobytes(),34962),5126,len(pos),'VEC3',pos.min(0).tolist(),pos.max(0).tolist())
    aN=accessor(add(nor.tobytes(),34962),5126,len(pos),'VEC3'); aU=accessor(add(uv.tobytes(),34962),5126,len(pos),'VEC2')
    prims=[]
    for m,idx in groups.items():
        ia=np.array(idx,np.uint32); prims.append({'attributes':{'POSITION':aP,'NORMAL':aN,'TEXCOORD_0':aU},'indices':accessor(add(ia.tobytes(),34963),5125,len(ia),'SCALAR'),'material':m})
    return {'primitives':prims},len(pos)
body=[a for a in D['atoms'] if keep(a)]
doorL=[a for a in D['atoms'] if 'door_lf_dummy' in a['chain'] and a['name'].endswith('_ok') and 'interior' not in a['chain']]
doorR=[a for a in D['atoms'] if 'door_rf_dummy' in a['chain'] and a['name'].endswith('_ok') and 'interior' not in a['chain']]
wheel=[a for a in D['atoms'] if a['name']=='wheel'][0]
fr={f['name']:f['pos'] for f in D['frames']}
meshes=[];nodes=[{'name':'car','children':[1,2,3,4,5,6,7]}]
bm,nb=mesh_from(body); meshes.append(bm); nodes.append({'name':'body','mesh':0})
wp=np.array(wheel['pos']).reshape(-1,3); wc=(wp.min(0)+wp.max(0))/2
print('corpo',nb,'vértices; roda',len(wp),'centro GTA',wc.round(2),'átomos',len(body),'portas',len(doorL),len(doorR))
for nm,d in (('wheel_FL','wheel_lf_dummy'),('wheel_FR','wheel_rf_dummy'),('wheel_BL','wheel_lb_dummy'),('wheel_BR','wheel_rb_dummy')):
    p=conv(fr[d]); left=p[0]>0
    wm,_=mesh_from([wheel],center=conv(wc),flip=left)
    meshes.append(wm); nodes.append({'name':nm,'translation':p.tolist(),'children':[],'mesh':len(meshes)-1})
for nm,lst in (('door_L',doorL),('door_R',doorR)):
    dm,_=mesh_from(lst); meshes.append(dm); nodes.append({'name':nm,'mesh':len(meshes)-1})
js={'asset':{'version':'2.0','generator':'conversor DFF de carro'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,'materials':materials,'textures':textures,'images':images,'samplers':[{'wrapS':10497,'wrapT':10497,'magFilter':9729,'minFilter':9987}],'accessors':acc,'bufferViews':views,'buffers':[{'byteLength':len(blob)}]}
if not textures: js.pop('textures'); js.pop('images'); js.pop('samplers')
j=json.dumps(js,separators=(',',':')).encode(); j+=b' '*((4-len(j)%4)%4)
while len(blob)%4: blob.append(0)
open(outp,'wb').write(struct.pack('<III',0x46546C67,2,12+8+len(j)+8+len(blob))+struct.pack('<II',len(j),0x4E4F534A)+j+struct.pack('<II',len(blob),0x004E4942)+bytes(blob))
ntri=sum(len(p) for p in []) ;print('GLB',outp,(12+8+len(j)+8+len(blob))//1024,'KB; materiais',[m['name'] for m in materials])
