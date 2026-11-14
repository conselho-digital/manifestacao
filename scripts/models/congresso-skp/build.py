import json, math, struct, io, sys
import numpy as np
from PIL import Image

P = json.load(open('dump/prims.json'))
SH, SY = 0.58, 0.30            # escala horizontal e vertical
PHI = math.radians(280.75)
c, s = math.cos(PHI), math.sin(PHI)
ROOF_MODEL = 17.8
PIT = ROOF_MODEL * SY          # profundidade: o teto fica em y = 0
FRONT_Z = 92.0                 # frente da laje

def rot(v):
    x = v[:, 0] * c + v[:, 2] * s
    z = -v[:, 0] * s + v[:, 2] * c
    return -x * SH, v[:, 1] * SY, z * SH   # espelhado em x (o resto do mapa Esplanada é espelhado)

slab = np.array([p for p in P if p['i'] == 31][0]['pos']).reshape(-1, 3)
sx, sy_, sz = rot(slab)
X0 = -(sx.min() + sx.max()) / 2
Z0 = FRONT_Z - sz.min()
print('slab X', sx.min() + X0, sx.max() + X0, 'Z', sz.min() + Z0, sz.max() + Z0)

def tf(v):
    x, y, z = rot(v)
    return np.stack([x + X0, y - PIT, z + Z0], 1)

DROP = {32}
PINK = np.array([255, 84, 84]) / 255
tex_cache = {}
def tex(k):
    if k not in tex_cache: tex_cache[k] = Image.open(f'dump/tex{k}.jpg').convert('RGB')
    return tex_cache[k]

plain = {'pos': [], 'col': [], 'idx': [], 'n': 0}
atl = {'pos': [], 'uv': [], 'idx': [], 'n': 0}
tiles = []  # (prim record, tile image)
areas = {}

def tri_area(pos, idx):
    t = pos[idx.reshape(-1, 3)]
    return np.linalg.norm(np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]), axis=1).sum() / 2

recs = []
for p in P:
    if p['i'] in DROP: continue
    pos = np.array(p['pos'], float).reshape(-1, 3)
    idx = np.array(p['idx'], np.uint32)
    uv = np.array(p['uv'], float).reshape(-1, 2) if p['uv'] else None
    g = tf(pos)
    idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)  # espelhado: inverte o sentido das faces
    tri = idx.reshape(-1, 3)
    keep = np.abs(g[tri][:, :, 0].mean(1)) <= 45.5   # tira as abas e anexos laterais (ficariam enterrados ou saindo do talude)
    if not keep.any(): continue
    idx = tri[keep].reshape(-1)
    rec = {'g': g, 'idx': idx, 'uv': uv, 'tex': p['tex'], 'color': p['color'], 'area': tri_area(g, idx)}
    recs.append(rec)

# Texturas que cabem no atlas: UV dentro de 0..1; as demais viram cor média
for r in recs:
    r['atlas'] = False
    if r['tex'] is not None and r['uv'] is not None:
        u0, v0 = r['uv'].min(0); u1, v1 = r['uv'].max(0)
        if u0 >= -0.01 and v0 >= -0.01 and u1 <= 1.01 and v1 <= 1.01:
            r['atlas'] = True; r['uvbox'] = (max(0, u0), max(0, v0), min(1, u1), min(1, v1))
        else:
            im = tex(r['tex']).resize((8, 8)); a = np.asarray(im).reshape(-1, 3).mean(0) / 255
            r['color'] = [*a, 1]
areas_sorted = sorted([r['area'] for r in recs if r['atlas']], reverse=True)
big_thr = areas_sorted[min(11, len(areas_sorted) - 1)] if areas_sorted else 0

# monta atlas
ATL = 2048
tiles = []
for r in recs:
    if not r['atlas']: continue
    im = tex(r['tex']); W, H = im.size
    u0, v0, u1, v1 = r['uvbox']
    # glTF: v=0 no topo da imagem (openskp já entrega uv no formato do glTF)
    box = (int(u0 * W), int(v0 * H), max(int(u0 * W) + 2, int(math.ceil(u1 * W))), max(int(v0 * H) + 2, int(math.ceil(v1 * H))))
    crop = im.crop(box)
    side = 256 if r['area'] >= big_thr else 96
    ar = crop.size[0] / crop.size[1]
    tw, th = (side, max(8, int(side / ar))) if ar >= 1 else (max(8, int(side * ar)), side)
    r['tile'] = crop.resize((min(tw, 256), min(th, 256)), Image.LANCZOS)
    r['crop_box'] = box; r['WH'] = (W, H)
# shelf packing
tiles = [r for r in recs if r['atlas']]
tiles.sort(key=lambda r: -r['tile'].size[1])
atlas = Image.new('RGB', (ATL, ATL), (128, 128, 128))
x = y = rowh = 0; PAD = 2
for r in tiles:
    w, h = r['tile'].size
    if x + w + PAD > ATL: x = 0; y += rowh + PAD; rowh = 0
    if y + h + PAD > ATL: raise SystemExit('atlas cheio')
    atlas.paste(r['tile'], (x, y))
    # extrai bordas para evitar sangramento
    r['pos_in_atlas'] = (x, y, w, h)
    x += w + PAD; rowh = max(rowh, h)
print('atlas usado até y =', y + rowh)
atlas = atlas.crop((0, 0, ATL, min(ATL, ((y + rowh + 3) // 4) * 4 + 4)))
AH = atlas.size[1]
buf = io.BytesIO(); atlas.save(buf, 'JPEG', quality=80); atlas_jpg = buf.getvalue()
print('atlas', atlas.size, len(atlas_jpg) // 1024, 'KB')

def srgb2lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

P_pos, P_col, P_idx = [], [], []
A_pos, A_uv, A_idx = [], [], []
pb = ab = 0
for r in recs:
    g, idx = r['g'], r['idx']
    if r['atlas']:
        x0, y0, w, h = r['pos_in_atlas']; u0, v0, u1, v1 = r['uvbox']; W, H = r['WH']; bx0, by0, bx1, by1 = r['crop_box']
        # uv original -> pixel na imagem -> relativo ao recorte -> atlas
        px = r['uv'][:, 0] * W; py = r['uv'][:, 1] * H
        fx = (px - bx0) / max(1, bx1 - bx0); fy = (py - by0) / max(1, by1 - by0)
        fx = np.clip(fx, 0, 1); fy = np.clip(fy, 0, 1)
        au = (x0 + 0.5 + fx * (w - 1)) / ATL; av = (y0 + 0.5 + fy * (h - 1)) / AH
        A_pos.append(g); A_uv.append(np.stack([au, av], 1)); A_idx.append(idx + ab); ab += len(g)
    else:
        col = np.array(r['color'] if r['color'] else [0.7, 0.7, 0.7, 1], float)[:3]
        if np.abs(col - PINK).max() < 0.02: col = np.array([0.84, 0.84, 0.82])
        lin = srgb2lin(col)
        P_pos.append(g); P_col.append(np.tile(lin, (len(g), 1))); P_idx.append(idx + pb); pb += len(g)

def cat(l, dt): return np.concatenate(l).astype(dt)
Pp, Pc, Pi = cat(P_pos, np.float32), cat(P_col, np.float32), cat(P_idx, np.uint32)
Ap, Au, Ai = cat(A_pos, np.float32), cat(A_uv, np.float32), cat(A_idx, np.uint32)

def normals(pos, idx):
    t = idx.reshape(-1, 3); n = np.zeros_like(pos)
    fn = np.cross(pos[t[:, 1]] - pos[t[:, 0]], pos[t[:, 2]] - pos[t[:, 0]])
    for k in range(3): np.add.at(n, t[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return (n / l).astype(np.float32)
Pn, An = normals(Pp, Pi), normals(Ap, Ai)
print('plain tris', len(Pi) // 3, 'atlas tris', len(Ai) // 3)

# --- GLB ---
chunks = []; views = []; accs = []
def add(arr, target=None):
    b = arr.tobytes(); off = sum(len(x) for x in chunks)
    chunks.append(b + b'\x00' * ((4 - len(b) % 4) % 4))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), **({'target': target} if target else {})})
    return len(views) - 1
def acc(view, ctype, count, typ, mn=None, mx=None):
    a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
    if mn is not None: a['min'] = mn; a['max'] = mx
    accs.append(a); return len(accs) - 1
def pbox(p): return [float(v) for v in p.min(0)], [float(v) for v in p.max(0)]
mesh_defs = []
for name, pos, nor, extra, idx, mat in (('Congresso_cor', Pp, Pn, ('COLOR_0', Pc), Pi, 0), ('Congresso_foto', Ap, An, ('TEXCOORD_0', Au), Ai, 1)):
    mn, mx = pbox(pos)
    a_pos = acc(add(pos, 34962), 5126, len(pos), 'VEC3', mn, mx)
    a_nor = acc(add(nor, 34962), 5126, len(pos), 'VEC3')
    a_ex = acc(add(extra[1], 34962), 5126, len(pos), 'VEC3' if extra[0] == 'COLOR_0' else 'VEC2')
    a_idx = acc(add(idx, 34963), 5125, len(idx), 'SCALAR')
    mesh_defs.append({'name': name, 'primitives': [{'attributes': {'POSITION': a_pos, 'NORMAL': a_nor, extra[0]: a_ex}, 'indices': a_idx, 'material': mat}]})
img_view = add(np.frombuffer(atlas_jpg, np.uint8))
gltf = {
    'asset': {'version': '2.0', 'generator': 'congresso-skp-build'},
    'scene': 0, 'scenes': [{'nodes': [0, 1]}],
    'nodes': [{'mesh': 0, 'name': 'Congresso_cor'}, {'mesh': 1, 'name': 'Congresso_foto'}],
    'meshes': mesh_defs,
    'materials': [
        {'name': 'concreto_cores', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.9}, 'doubleSided': True},
        {'name': 'fotos_atlas', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.85}, 'doubleSided': True},
    ],
    'textures': [{'source': 0, 'sampler': 0}], 'images': [{'bufferView': img_view, 'mimeType': 'image/jpeg'}],
    'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}],
    'accessors': accs, 'bufferViews': views,
}
binb = b''.join(chunks); gltf['buffers'] = [{'byteLength': len(binb)}]
js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
glb = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\x00') + binb
open('out/congresso.glb', 'wb').write(glb)
print('GLB', len(glb) // 1024, 'KB')
np.save('out/all_pos.npy', np.concatenate([Pp, Ap])); np.save('out/all_idx.npy', np.concatenate([Pi.reshape(-1, 3), Ai.reshape(-1, 3) + len(Pp)]))
print('bounds', np.concatenate([Pp, Ap]).min(0).round(1), np.concatenate([Pp, Ap]).max(0).round(1), 'PIT', round(PIT, 3))
