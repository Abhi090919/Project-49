import json, struct, math, os, sys
import numpy as np, mapbox_earcut as earcut
LAT0, LNG0 = 17.40, 78.40
KX = 111320*math.cos(math.radians(LAT0)); KY = 110574
Q = 4.0
def load(n):
    p = n + '.json'
    if not os.path.exists(p) or os.path.getsize(p) < 1000: print('missing', n); return []
    return json.load(open(p))['elements']
def proj(geom): return np.array([[(g['lon']-LNG0)*KX, (g['lat']-LAT0)*KY] for g in geom], dtype=np.float64)
def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = np.zeros(len(pts), bool); keep[0] = keep[-1] = True; stack = [(0, len(pts)-1)]
    while stack:
        a, b = stack.pop()
        if b <= a+1: continue
        A, B = pts[a], pts[b]; d = B - A; L = math.hypot(*d)
        seg = pts[a+1:b] - A
        dist = np.abs(seg[:,0]*d[1]-seg[:,1]*d[0])/L if L > 0 else np.hypot(seg[:,0], seg[:,1])
        i = int(np.argmax(dist))
        if dist[i] > tol: m = a+1+i; keep[m] = True; stack += [(a, m), (m, b)]
    return pts[keep]
def quant(pts):
    q = np.round(pts / Q).astype(np.int32)
    q = np.clip(q, -32767, 32767)
    if len(q) > 1:
        m = np.ones(len(q), bool); m[1:] = np.any(q[1:] != q[:-1], axis=1); q = q[m]
    return q.astype(np.int16)
def lines(elems, tol, ids=None, exclude=None, minlen=0):
    out = []
    for e in elems:
        if e.get('type') != 'way' or 'geometry' not in e: continue
        if exclude is not None and e['id'] in exclude: continue
        p = proj(e['geometry'])
        if minlen and np.sum(np.hypot(*np.diff(p, axis=0).T)) < minlen: continue
        q = quant(dp(p, tol))
        if len(q) >= 2: out.append(q)
    return out
layers = []
def add_lines(name, polys):
    if not polys: return
    layers.append((name, np.array([len(p) for p in polys], np.uint32), np.concatenate(polys)))
    print(name, len(polys), sum(len(p) for p in polys))
def add_pts(name, pts):
    if len(pts): layers.append((name, None, pts.astype(np.int16))); print(name, len(pts))

major = load('major'); mt = load('mt'); prim = load('prim')
mt_ids = {e['id'] for e in mt}; prim_ids = {e['id'] for e in prim}
add_lines('trunk', lines(mt, 3))
add_lines('primary', lines(prim, 3))
add_lines('secondary', lines(major, 3, exclude=mt_ids | prim_ids) if (mt or prim) else lines(major, 3))
add_lines('tertiary', lines(load('tertiary'), 4))
import glob
resi, seen = [], set()
for f in sorted(glob.glob('resi_*.json')):
    for e in load(f[:-5]):
        if e.get('id') in seen: continue
        seen.add(e.get('id')); resi.append(e)
print('resi ways', len(resi))
rl = lines(resi, 6)
add_lines('resi', rl)
# city lights: points every ~90 m along residential roads, one per 45 m cell
pts = []
for q in rl:
    p = q.astype(np.float64) * Q
    for a, b in zip(p[:-1], p[1:]):
        L = math.hypot(*(b-a)); n = max(1, int(L / 90))
        for k in range(n): pts.append(a + (b-a) * (k + 0.5) / n)
if pts:
    P = np.array(pts); cell = np.round(P / 45).astype(np.int64); _, idx = np.unique(cell[:,0]*100000+cell[:,1], return_index=True)
    P = P[np.sort(idx)]; rng = np.random.default_rng(7)
    if len(P) > 140000: P = P[rng.choice(len(P), 140000, replace=False)]
    add_pts('lights', np.round(P / Q))
add_lines('rail', lines(load('rail'), 4))
add_lines('river', lines(load('river'), 5))
add_lines('runway', lines(load('runway'), 2))
# water polygons
def rings_of(e):
    if e['type'] == 'way' and 'geometry' in e: return [proj(e['geometry'])]
    if e['type'] == 'relation':
        segs = [proj(m['geometry']) for m in e.get('members', []) if m.get('role') == 'outer' and 'geometry' in m]
        rings = []
        while segs:
            cur = segs.pop(0)
            changed = True
            while changed and np.hypot(*(cur[0]-cur[-1])) > 1:
                changed = False
                for i, s in enumerate(segs):
                    if np.hypot(*(cur[-1]-s[0])) < 1: cur = np.vstack([cur, s[1:]]); segs.pop(i); changed = True; break
                    if np.hypot(*(cur[-1]-s[-1])) < 1: cur = np.vstack([cur, s[::-1][1:]]); segs.pop(i); changed = True; break
            rings.append(cur)
        return rings
    return []
tris, edges = [], []
for e in load('water'):
    for r in rings_of(e):
        if len(r) < 4: continue
        x, y = r[:,0], r[:,1]; area = 0.5*abs(np.dot(x, np.roll(y,1)) - np.dot(y, np.roll(x,1)))
        if area < 25000: continue
        r = dp(r, 6)
        if len(r) < 4: continue
        if np.hypot(*(r[0]-r[-1])) < 1: r = r[:-1]
        t = earcut.triangulate_float64(r, np.array([len(r)], dtype=np.uint32))
        tris.append(quant(r[t]) if False else np.clip(np.round(r[t]/Q), -32767, 32767).astype(np.int16))
        edges.append(quant(np.vstack([r, r[:1]])))
if tris: add_pts('water', np.concatenate(tris))
add_lines('waterEdge', edges)

# pack: [u32 header length][header json padded to 8188][layer data]
RES = 8188
off = 4 + RES; H = []; B = []
for name, lens, pts in layers:
    L = {'name': name, 'nPolys': 0 if lens is None else int(len(lens)), 'nPts': int(len(pts))}
    if lens is not None:
        off += (-off) % 4; L['oLens'] = off; B.append((off, lens.astype('<u4').tobytes())); off += lens.nbytes
    off += (-off) % 4; L['oPts'] = off; B.append((off, pts.astype('<i2').tobytes())); off += pts.size * 2
    H.append(L)
hj = json.dumps({'q': Q, 'lat0': LAT0, 'lng0': LNG0, 'layers': H}, separators=(',', ':')).encode()
assert len(hj) <= RES
out = bytearray(off); out[0:4] = struct.pack('<I', len(hj)); out[4:4+len(hj)] = hj
for o, b in B: out[o:o+len(b)] = b
open('hyderabad.bin', 'wb').write(out); print('bytes', len(out))
