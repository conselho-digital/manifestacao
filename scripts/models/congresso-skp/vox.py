import numpy as np, json, math, sys
pos = np.load('out/all_pos.npy').astype(float); idx = np.load('out/all_idx.npy')
DX = DZ = float(sys.argv[1]) if len(sys.argv) > 1 else 1.2
DY = float(sys.argv[2]) if len(sys.argv) > 2 else 0.3
STEP = 0.35
vox = set()
tri = pos[idx]
for t in tri:
    a, b, c = t
    e = max(np.linalg.norm(b - a), np.linalg.norm(c - b), np.linalg.norm(a - c))
    n = max(1, int(math.ceil(e / STEP)))
    # grade baricêntrica
    i = np.arange(n + 1)
    uu, vv = np.meshgrid(i / n, i / n)
    m = (uu + vv) <= 1.0001
    u = uu[m]; v = vv[m]
    p = a[None] + u[:, None] * (b - a)[None] + v[:, None] * (c - a)[None]
    k = np.stack([np.floor(p[:, 0] / DX), np.floor(p[:, 1] / DY), np.floor(p[:, 2] / DZ)], 1).astype(int)
    for q in map(tuple, np.unique(k, axis=0)): vox.add(q)
print('voxels', len(vox))
V = np.array(sorted(vox))
x0, y0, z0 = V.min(0); x1, y1, z1 = V.max(0)
W, H, D = x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1
grid = np.zeros((H, W, D), bool)
grid[V[:, 1] - y0, V[:, 0] - x0, V[:, 2] - z0] = True

# torres (z > 148): preenche cada coluna em x entre o menor e o maior z ocupados, camada por camada (corpo sólido)
zt = int(math.floor(148 / DZ)) - z0
for iy in range(H):
    for xi in range(W):
        col = np.nonzero(grid[iy, xi, max(0, zt):])[0]
        if len(col) > 1: grid[iy, xi, max(0, zt) + col.min():max(0, zt) + col.max() + 1] = True
# cúpulas e tigela: sobre a laje (z 85..131), sólido do teto até o topo de cada coluna
roof_iy = int(math.floor(0.0 / DY)) - y0
for xi in range(W):
    for zi in range(max(0, int(85 / DZ) - z0), min(D, int(131 / DZ) - z0)):
        col = np.nonzero(grid[roof_iy + 1:, xi, zi])[0]
        if len(col): grid[roof_iy + 1:roof_iy + 2 + col.max(), xi, zi] = True

def rects_of(layer):
    g = layer.copy(); out = []
    for xi in range(W):
        zi = 0
        while zi < D:
            if g[xi, zi]:
                z2 = zi
                while z2 + 1 < D and g[xi, z2 + 1]: z2 += 1
                x2 = xi
                while x2 + 1 < W and g[x2 + 1, zi:z2 + 1].all(): x2 += 1
                g[xi:x2 + 1, zi:z2 + 1] = False
                out.append((xi, x2, zi, z2)); zi = z2 + 1
            else: zi += 1
    return out

boxes = []; openr = {}
for iy in range(H):
    rs = set(rects_of(grid[iy]))
    for r in list(openr):
        if r not in rs:
            boxes.append((r, openr.pop(r), iy - 1))
    for r in rs:
        if r not in openr: openr[r] = iy
for r, s in openr.items(): boxes.append((r, s, H - 1))
out = []
for (xa, xb, za, zb), ya, yb in boxes:
    pass
out = []
for (xa, xb, za, zb), ya, yb in boxes:
    out.append([round((xa + x0) * DX, 2), round((xb + x0 + 1) * DX, 2), round((za + z0) * DZ, 2), round((zb + z0 + 1) * DZ, 2), round((yb + y0 + 1) * DY, 2), round((ya + y0) * DY, 2)])
out = [b for b in out if not (b[0] > 50 or b[1] < -50) and b[4] > -5.25]
print('caixas', len(out))
json.dump(out, open('out/colliders.json', 'w'), separators=(',', ':'))
import collections
print('altura típica', collections.Counter(round(b[4] - b[5], 1) for b in out).most_common(6))
