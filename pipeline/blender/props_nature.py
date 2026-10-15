"""Nature props: trees, bushes, rocks, water plants, flowers, grass, clutter."""
from lib import *

PROPS = {}
def prop(name, collider=None, ao=0.7):
    def deco(fn):
        PROPS[name] = {"fn": fn, "collider": collider, "ao": ao}
        return fn
    return deco

GREEN = [0x4f9b3c, 0x5fae45, 0x3f8a37, 0x6dbb4f]
BARK = 0x7a5233

def canopy(a, rng, center, radius, colors, blobs=6, sub=1, flat=0.75, seed=0):
    cx, cy, cz = center
    for i in range(blobs):
        ang = rng.uniform(0, math.tau)
        d = rng.uniform(0.25, 0.7) * radius if i else 0
        r = radius * rng.uniform(0.55, 0.8) if i else radius * 0.8
        pos = (cx + math.cos(ang) * d, cy + rng.uniform(-0.25, 0.35) * radius, cz + math.sin(ang) * d)
        c = colors[i % len(colors)]
        s = sphere(r, pos=pos, scale=(1, flat, 1), color=c, sub=sub, smooth=False, seed=seed + i, var=0.07)
        # darker underside, lighter top
        paint_where(s, mix(hexrgb(c), (0.12, 0.25, 0.1), 0.35), lambda n, c_: n.z < -0.35, seed=seed + i)
        paint_where(s, mix(hexrgb(c), (0.85, 0.95, 0.5), 0.22), lambda n, c_: n.z > 0.7, seed=seed + i + 50)
        a.add(s)

def trunk(a, rng, h, r, lean=0.0, color=BARK, branches=2, seed=0):
    pts = [(0, 0, 0), (lean * 0.3, h * 0.4, 0), (lean * 0.7, h * 0.75, lean * 0.2), (lean, h, lean * 0.3)]
    a.add(tube(pts, r, color=color, n=7, r_end=r * 0.6, smooth=False, seed=seed))
    a.add(cyl(r * 1.35, 0.25, pos=(0, -0.05, 0), r2=r, color=mix(hexrgb(color), (0, 0, 0), 0.15), n=7, bevel=0, seed=seed + 1))
    for i in range(branches):
        ang = rng.uniform(0, math.tau)
        y = h * rng.uniform(0.5, 0.8)
        bx, bz = lean * y / h, 0
        a.add(tube([(bx, y, bz), (bx + math.cos(ang) * r * 4, y + r * 3, bz + math.sin(ang) * r * 4)], r * 0.45, color=color, n=5, r_end=r * 0.2, smooth=False, seed=seed + 5 + i))
    return pts[-1]

for idx, (h, rad, lean) in enumerate([(2.6, 1.7, 0.2), (3.2, 2.0, -0.3), (2.2, 1.4, 0.1)]):
    def make(idx=idx, h=h, rad=rad, lean=lean):
        rng = random.Random(100 + idx)
        a = Asset(f"tree_round_{'abc'[idx]}")
        top = trunk(a, rng, h, 0.2 + idx * 0.03, lean, seed=idx * 10)
        canopy(a, rng, (top[0], h + rad * 0.45, top[2]), rad, [GREEN[idx % 4], GREEN[(idx + 1) % 4], GREEN[(idx + 2) % 4]], blobs=7, sub=2, seed=idx * 20)
        return a
    prop(f"tree_round_{'abc'[idx]}", collider=[("cyl", 0, 0, 0.35, 3)])(make)

def pine(name, h, r, snow=False, seed=0, color=0x2f6f43):
    rng = random.Random(seed)
    a = Asset(name)
    a.add(cyl(0.18, h * 0.35, color=0x6b4a2e, n=7, r2=0.13, seed=seed))
    layers = 4
    for i in range(layers):
        t = i / layers
        lr = r * (1 - t * 0.68)
        y = h * 0.22 + t * h * 0.6
        lh = h * 0.38
        prof = [(lr * 0.55, 0), (lr, lh * 0.12), (lr * 0.86, lh * 0.2), (lr * 0.5, lh * 0.55), (lr * 0.06, lh)]
        layer = lathe(prof, pos=(rng.uniform(-0.05, 0.05), y, rng.uniform(-0.05, 0.05)), rot=(0, rng.uniform(0, 1), 0), n=9, color=color, smooth=False, seed=seed + i, var=0.08)
        paint_where(layer, mix(hexrgb(color), (0.1, 0.2, 0.12), 0.4), lambda n, c: n.z < -0.2, seed=seed + i)
        if snow:
            zc = y + lh * 0.3
            paint_where(layer, 0xf2f7ff, lambda n, c, zc=zc: c.z > zc and n.z > 0.2, var=0.02, seed=seed + i)
        else:
            zc = y + lh * 0.45
            paint_where(layer, mix(hexrgb(color), (0.75, 0.95, 0.5), 0.18), lambda n, c, zc=zc: c.z > zc and n.z > 0.2, seed=seed + i + 9)
        a.add(layer)
    return a

prop("tree_pine_a", collider=[("cyl", 0, 0, 0.3, 3)])(lambda: pine("tree_pine_a", 5.2, 1.6, seed=200))
prop("tree_pine_b", collider=[("cyl", 0, 0, 0.3, 3)])(lambda: pine("tree_pine_b", 3.8, 1.25, seed=210, color=0x3b7d47))
prop("tree_snowpine_a", collider=[("cyl", 0, 0, 0.3, 3)])(lambda: pine("tree_snowpine_a", 5.0, 1.6, snow=True, seed=220, color=0x2c6050))
prop("tree_snowpine_b", collider=[("cyl", 0, 0, 0.3, 3)])(lambda: pine("tree_snowpine_b", 3.4, 1.2, snow=True, seed=230, color=0x356b58))

@prop("tree_willow", collider=[("cyl", 0, 0, 0.45, 3)])
def _():
    rng = random.Random(300)
    a = Asset("tree_willow")
    top = trunk(a, rng, 2.6, 0.32, 0.25, color=0x6e5537, branches=3, seed=300)
    cy = 3.6
    canopy(a, rng, (top[0], cy, top[2]), 2.1, [0x8fc45a, 0x7db84c, 0x9fd06a], blobs=6, sub=2, flat=0.6, seed=310)
    for i in range(34):
        ang = i / 34 * math.tau + rng.uniform(-0.08, 0.08)
        rr = rng.uniform(1.4, 2.3)
        x, z = top[0] + math.cos(ang) * rr, top[2] + math.sin(ang) * rr
        y0 = cy + rng.uniform(-0.2, 0.5) - (rr - 1.4) * 0.5
        length = rng.uniform(1.8, 2.8)
        a.add(blade((x, y0 - length, z), length, rng.uniform(0.18, 0.3), lean=(math.cos(ang) * 0.12, math.sin(ang) * 0.12), color=0x86c157, tip=0x5f9a3c, seed=320 + i))
    return a

@prop("tree_palm", collider=[("cyl", 0, 0, 0.3, 3)])
def _():
    rng = random.Random(400)
    a = Asset("tree_palm")
    h = 5.2
    pts = []
    for i in range(9):
        t = i / 8
        pts.append((math.sin(t * 1.2) * 1.3, t * h, 0.0))
    for i in range(8):
        p0, p1 = pts[i], pts[i + 1]
        c = 0x9b7650 if i % 2 == 0 else 0x86643f
        a.add(tube([p0, p1], 0.24 - i * 0.012, color=c, n=7, r_end=0.23 - i * 0.012, smooth=False, seed=400 + i))
        a.add(tube([p0, (p0[0] + (p1[0] - p0[0]) * 0.12, p0[1] + (p1[1] - p0[1]) * 0.12, 0)], 0.27 - i * 0.012, color=0x6f5235, n=7, smooth=False, seed=420 + i))
    top = pts[-1]
    for i in range(9):
        ang = i / 9 * math.tau + 0.2
        a.add(leaf((top[0], top[1], top[2]), (math.cos(ang), math.sin(ang)), rng.uniform(2.6, 3.2), 0.42, droop=0.55, color=[0x4fa043, 0x5cb24c, 0x46913b][i % 3], tip=0x7cc35a, seed=440 + i, segs=5))
    for i in range(3):
        ang = i / 3 * math.tau
        a.add(sphere(0.16, pos=(top[0] + math.cos(ang) * 0.25, top[1] - 0.25, top[2] + math.sin(ang) * 0.25), color=0x6b4b2a, sub=1, smooth=False, seed=460 + i))
    return a

@prop("tree_ember", collider=[("cyl", 0, 0, 0.35, 3)])
def _():
    rng = random.Random(500)
    a = Asset("tree_ember")
    top = trunk(a, rng, 3.0, 0.26, 0.15, color=0x2e2724, branches=4, seed=500)
    # glowing cracks up the trunk
    for i in range(5):
        y = 0.4 + i * 0.5
        ang = rng.uniform(0, math.tau)
        a.add(box((0.05, 0.35, 0.03), pos=(math.cos(ang) * 0.22 + 0.15 * y / 3, y, math.sin(ang) * 0.22), rot=(0, -ang, rng.uniform(-0.3, 0.3)), color=0xff6a1f, kind=KIND_GLOW, bevel=0, var=0.1, seed=510 + i))
    canopy(a, rng, (top[0], 3.6, top[2]), 1.5, [0xc2401f, 0xd8562a, 0xa83220], blobs=5, sub=2, seed=520)
    for i in range(6):
        ang = rng.uniform(0, math.tau)
        a.add(sphere(0.09, pos=(top[0] + math.cos(ang) * 1.3, 3.3 + rng.uniform(-0.4, 0.6), top[2] + math.sin(ang) * 1.3), color=0xffb347, kind=KIND_GLOW, sub=1, smooth=False, seed=530 + i))
    return a

@prop("tree_mushroom", collider=[("cyl", 0, 0, 0.6, 3)], ao=1.0)
def _():
    rng = random.Random(600)
    a = Asset("tree_mushroom")
    a.add(lathe([(0.75, 0), (0.55, 0.3), (0.45, 1.5), (0.42, 2.8), (0.55, 3.4), (0.0, 3.45)], color=0xe9e2f7, n=12, smooth=True, seed=600))
    cap = lathe([(0.3, 3.2), (2.4, 3.3), (2.6, 3.55), (2.3, 4.2), (1.5, 4.8), (0.6, 5.05), (0, 5.1)], color=0x6b4fd1, n=16, smooth=True, seed=601)
    paint_where(cap, 0x9b8cf2, lambda n, c: n.z < -0.2, seed=602)
    a.add(cap)
    # gills ring (glow)
    a.add(cyl(2.2, 0.06, pos=(0, 3.22, 0), r2=0.5, color=0x8fe8ff, kind=KIND_GLOW, n=16, bevel=0, cap=True))
    for i in range(14):
        ang = rng.uniform(0, math.tau)
        rr = rng.uniform(0.6, 2.0)
        y = 5.0 - (rr / 2.4) ** 2 * 1.4
        a.add(sphere(rng.uniform(0.12, 0.22), pos=(math.cos(ang) * rr, y, math.sin(ang) * rr), scale=(1, 0.45, 1), color=0xb8f4ff, kind=KIND_GLOW, sub=1, seed=610 + i))
    return a

def bush(name, r, colors, seed, flowers=None):
    rng = random.Random(seed)
    a = Asset(name)
    canopy(a, rng, (0, r * 0.55, 0), r, colors, blobs=5, sub=2, flat=0.8, seed=seed)
    if flowers:
        for i in range(10):
            ang = rng.uniform(0, math.tau)
            el = rng.uniform(0.2, 1.1)
            p = (math.cos(ang) * math.cos(el) * r * 0.95, r * 0.55 + math.sin(el) * r * 0.75, math.sin(ang) * math.cos(el) * r * 0.95)
            a.add(sphere(0.07 * r / 0.8, pos=p, color=flowers[i % len(flowers)], sub=1, smooth=False, seed=seed + 40 + i))
    return a

prop("bush_a")(lambda: bush("bush_a", 0.8, [0x4f9b3c, 0x5fae45], 700))
prop("bush_b")(lambda: bush("bush_b", 0.6, [0x3f8a37, 0x5fae45], 710, flowers=[0xff7eb6, 0xffffff]))
prop("bush_c")(lambda: bush("bush_c", 0.7, [0x6dbb4f, 0x4f9b3c], 720, flowers=[0xffd34d, 0xff9a3c]))
prop("bush_snow")(lambda: bush("bush_snow", 0.7, [0x9fc3c0, 0xe8f2f6], 730))
prop("bush_ember")(lambda: bush("bush_ember", 0.6, [0x7a2c1e, 0x9a3a22], 740, flowers=[0xff8a2a]))
prop("bush_moon")(lambda: bush("bush_moon", 0.7, [0x3d3a8f, 0x4c47a8], 750, flowers=[0x9ff0ff, 0xd6a8ff]))

def rock_asset(name, r, color, seed, moss=None, snow=None, scale=(1, 0.75, 1), extra=0, glow=None, sub=2):
    rng = random.Random(seed)
    a = Asset(name)
    def one(rr, pos, sd, sc):
        p = rock(rr, pos=pos, rot=(rng.uniform(-0.15, 0.15), rng.uniform(0, math.tau), rng.uniform(-0.15, 0.15)), scale=sc, color=color, seed=sd, sub=sub, rough=0.16, var=0.1)
        bm = p.bm
        # chunky facets: flatten a few random planes
        for k in range(3):
            nrm = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.2, 1))).normalized()
            cut = rr * rng.uniform(0.55, 0.8)
            cen = sum((v.co for v in bm.verts), Vector()) / max(1, len(bm.verts))
            for v in bm.verts:
                d = (v.co - cen).dot(nrm)
                if d > cut:
                    v.co -= nrm * (d - cut)
        bm.normal_update()
        paint_where(p, mix(hexrgb(color), (1, 1, 1), 0.16), lambda n, c: n.z > 0.35, seed=sd)
        paint_where(p, mix(hexrgb(color), (0, 0, 0), 0.18), lambda n, c: n.z < -0.3, seed=sd + 3)
        if moss:
            paint_where(p, moss, lambda n, c: n.z > 0.72 and rng.random() < 0.8, seed=sd + 1)
        if snow:
            paint_where(p, snow, lambda n, c: n.z > 0.5, var=0.02, seed=sd + 2)
        return p
    a.add(one(r, (0, 0, 0), seed, scale))
    for i in range(extra):
        ang = rng.uniform(0, math.tau)
        rr = r * rng.uniform(0.25, 0.45)
        a.add(one(rr, (math.cos(ang) * r * 0.95, 0, math.sin(ang) * r * 0.95), seed + 10 + i, (1, 0.8, 1)))
    if glow:
        for i in range(4):
            ang = rng.uniform(0, math.tau)
            a.add(box((0.05, r * 0.5, 0.03), pos=(math.cos(ang) * r * 0.85, r * 0.15, math.sin(ang) * r * 0.85), rot=(rng.uniform(-0.4, 0.4), -ang, rng.uniform(-0.5, 0.5)), color=glow, kind=KIND_GLOW, bevel=0, seed=seed + 40 + i))
    return a

prop("rock_s", ao=0.4)(lambda: rock_asset("rock_s", 0.35, 0x8d9199, 800, moss=0x6f9f4a, sub=1))
prop("rock_m", collider=[("cyl", 0, 0, 0.8, 1.2)], ao=0.8)(lambda: rock_asset("rock_m", 0.9, 0x868b94, 810, moss=0x6f9f4a, extra=2))
prop("rock_l", collider=[("cyl", 0, 0, 1.7, 2.4)], ao=1.4)(lambda: rock_asset("rock_l", 1.9, 0x7f848d, 820, moss=0x6f9f4a, extra=3, scale=(1.1, 0.8, 0.95)))
prop("rock_sand", ao=0.6)(lambda: rock_asset("rock_sand", 0.7, 0xc9b38a, 830, extra=1))
prop("rock_ice", collider=[("cyl", 0, 0, 0.9, 1.2)], ao=0.8)(lambda: rock_asset("rock_ice", 1.0, 0x8fa5b8, 840, snow=0xf2f7ff, extra=2))
prop("rock_basalt", collider=[("cyl", 0, 0, 1.0, 1.2)], ao=0.8)(lambda: rock_asset("rock_basalt", 1.1, 0x3a3436, 850, extra=2, glow=0xff6a1f))
prop("rock_moon", collider=[("cyl", 0, 0, 0.9, 1.2)], ao=0.8)(lambda: rock_asset("rock_moon", 1.0, 0x56577a, 860, moss=0x5b6fd1, extra=2))

@prop("reeds", ao=0.4)
def _():
    rng = random.Random(900)
    a = Asset("reeds")
    for i in range(14):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.45)
        x, z = math.cos(ang) * rr, math.sin(ang) * rr
        h = rng.uniform(0.9, 1.7)
        a.add(blade((x, -0.3, z), h, 0.07, lean=(rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25)), color=0x6f9e45, tip=0xb6c66a, seed=900 + i))
        if i % 3 == 0:
            a.add(cyl(0.045, 0.24, pos=(x + rng.uniform(-0.05, 0.05), h - 0.45, z), color=0x6a4126, n=6, bevel=0, seed=950 + i, smooth=True))
    return a

@prop("lilypad", ao=0.0)
def _():
    rng = random.Random(1000)
    a = Asset("lilypad")
    for i, (x, z, r) in enumerate([(0, 0, 0.45), (0.6, 0.3, 0.32), (-0.4, 0.5, 0.28)]):
        bm = bmesh.new()
        n = 12
        c = bm.verts.new(G(x, 0.02, z))
        ring = []
        notch = rng.uniform(0, math.tau)
        for k in range(n + 1):
            ang = notch + 0.35 + (math.tau - 0.7) * k / n
            ring.append(bm.verts.new(G(x + math.cos(ang) * r, 0.02, z + math.sin(ang) * r)))
        for k in range(n):
            bm.faces.new([c, ring[k + 1], ring[k]])
        p = finish_part(bm, [0x4c9a3e, 0x5aac48, 0x3f8a37][i], KIND_TOON, False, random.Random(1000 + i), 0.08, Matrix.Identity(4))
        a.add(p)
    # flower
    for k in range(6):
        ang = k / 6 * math.tau
        a.add(sphere(0.09, pos=(math.cos(ang) * 0.08, 0.08, math.sin(ang) * 0.08), scale=(1.3, 0.5, 0.7), rot=(0, -ang, 0.5), color=0xffc2dc, sub=1, smooth=False, seed=1010 + k))
    a.add(sphere(0.05, pos=(0, 0.12, 0), color=0xffe066, sub=1, kind=KIND_GLOW))
    return a

def flowers(name, colors, seed, n=6, glow=False):
    rng = random.Random(seed)
    a = Asset(name)
    for i in range(n):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.35)
        x, z = math.cos(ang) * rr, math.sin(ang) * rr
        h = rng.uniform(0.25, 0.5)
        a.add(tube([(x, 0, z), (x + rng.uniform(-0.05, 0.05), h, z)], 0.015, color=0x4f8f35, n=3, cap=False, seed=seed + i))
        c = colors[i % len(colors)]
        a.add(sphere(0.09, pos=(x, h, z), scale=(1, 0.38, 1), rot=(0, rng.uniform(0, 1), 0), color=c, sub=0, smooth=False, seed=seed + 10 * i, kind=KIND_GLOW if glow else KIND_TOON))
        a.add(sphere(0.04, pos=(x, h + 0.025, z), color=0xffe066, sub=0, smooth=False, kind=KIND_GLOW if glow else KIND_TOON))
    for i in range(5):
        ang = rng.uniform(0, math.tau)
        a.add(blade((math.cos(ang) * 0.2, 0, math.sin(ang) * 0.2), 0.3, 0.06, lean=(math.cos(ang) * 0.1, math.sin(ang) * 0.1), color=0x5aa143, seed=seed + 80 + i))
    return a

prop("flowers_pink", ao=0.2)(lambda: flowers("flowers_pink", [0xff7eb6, 0xff9fcb, 0xffffff], 1100))
prop("flowers_yellow", ao=0.2)(lambda: flowers("flowers_yellow", [0xffd34d, 0xffb52e, 0xfff3a0], 1120))
prop("flowers_blue", ao=0.2)(lambda: flowers("flowers_blue", [0x6fa8ff, 0x9fc4ff, 0xb38bff], 1140))
prop("flowers_glow", ao=0.0)(lambda: flowers("flowers_glow", [0x9ff0ff, 0xd6a8ff, 0xffffff], 1160, glow=True))

@prop("grass", ao=0.0)
def _():
    rng = random.Random(1200)
    a = Asset("grass")
    for i in range(9):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.25)
        a.add(blade((math.cos(ang) * rr, 0, math.sin(ang) * rr), rng.uniform(0.25, 0.5), 0.08, lean=(math.cos(ang) * 0.12, math.sin(ang) * 0.12), color=0x5aa143, tip=0x9fd06a, seed=1200 + i))
    return a

@prop("grass_dry", ao=0.0)
def _():
    rng = random.Random(1210)
    a = Asset("grass_dry")
    for i in range(9):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.25)
        a.add(blade((math.cos(ang) * rr, 0, math.sin(ang) * rr), rng.uniform(0.3, 0.55), 0.08, lean=(math.cos(ang) * 0.14, math.sin(ang) * 0.14), color=0xb7a35c, tip=0xe2d48a, seed=1210 + i))
    return a

@prop("log", collider=[("box", 0, 0, 0, 2.2, 0.6, 0.6)], ao=0.5)
def _():
    a = Asset("log")
    a.add(cyl(0.28, 2.2, pos=(-1.1, 0.28, 0), rot=(0, 0, -math.pi / 2), color=0x7a5233, n=8, bevel=0.04, seed=1300))
    for s in (-1, 1):
        a.add(cyl(0.24, 0.02, pos=(s * 1.1 + (0.0 if s > 0 else 0), 0.28, 0), rot=(0, 0, -math.pi / 2), color=0xc9a06a, n=8, bevel=0, seed=1301))
    a.add(box((0.5, 0.06, 0.4), pos=(0.3, 0.52, 0), color=0x6f9f4a, bevel=0.03, seed=1302))
    return a

@prop("stump", collider=[("cyl", 0, 0, 0.4, 0.6)], ao=0.4)
def _():
    a = Asset("stump")
    a.add(cyl(0.42, 0.55, r2=0.36, color=0x7a5233, n=9, bevel=0.03, seed=1310))
    a.add(cyl(0.33, 0.02, pos=(0, 0.55, 0), color=0xc9a06a, n=9, bevel=0, seed=1311))
    for i in range(4):
        ang = i / 4 * math.tau + 0.3
        a.add(tube([(math.cos(ang) * 0.3, 0.1, math.sin(ang) * 0.3), (math.cos(ang) * 0.62, -0.02, math.sin(ang) * 0.62)], 0.1, color=0x6e4a2e, n=5, r_end=0.04, smooth=False, seed=1312 + i))
    return a

def mushrooms(name, cap, seed, glow=False):
    rng = random.Random(seed)
    a = Asset(name)
    for i in range(4):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0.05, 0.25) if i else 0
        x, z = math.cos(ang) * rr, math.sin(ang) * rr
        h = rng.uniform(0.12, 0.22) * (1.4 if i == 0 else 1)
        cr = rng.uniform(0.09, 0.13) * (1.5 if i == 0 else 1)
        sr = cr * 0.32
        a.add(lathe([(sr * 1.2, 0), (sr, h * 0.5), (sr * 0.85, h)], pos=(x, 0, z), color=0xf3ead6, n=7, smooth=True, seed=seed + i))
        cp = lathe([(sr * 0.8, h - 0.01), (cr, h + cr * 0.05), (cr * 0.92, h + cr * 0.35), (cr * 0.55, h + cr * 0.68), (0, h + cr * 0.78)], pos=(x, 0, z), rot=(rng.uniform(-0.15, 0.15), 0, rng.uniform(-0.15, 0.15)), color=cap, n=10, smooth=False, seed=seed + 10 + i, kind=KIND_GLOW if glow else KIND_TOON)
        if not glow:
            paint_where(cp, 0xf6e7d0, lambda n, c: n.z < -0.3, seed=seed + 20 + i)
        a.add(cp)
        if not glow:
            for k in range(4):
                a2 = rng.uniform(0, math.tau)
                a.add(sphere(cr * 0.13, pos=(x + math.cos(a2) * cr * 0.55, h + cr * 0.5, z + math.sin(a2) * cr * 0.55), scale=(1, 0.5, 1), color=0xffffff, sub=1, seed=seed + 30 + k))
    return a

prop("mushrooms_red", ao=0.2)(lambda: mushrooms("mushrooms_red", 0xd8402f, 1400))
prop("mushrooms_glow", ao=0.0)(lambda: mushrooms("mushrooms_glow", 0x7fe7ff, 1420, glow=True))

def crystal_cluster(name, color, seed, glow=True, size=1.0):
    rng = random.Random(seed)
    a = Asset(name)
    for i in range(6):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.3) * size
        h = rng.uniform(0.5, 1.4) * size * (1.4 if i == 0 else 1)
        r = rng.uniform(0.09, 0.18) * size
        tilt = rng.uniform(0.0, 0.45) if i else 0
        part = cyl(r, h, pos=(math.cos(ang) * rr, -0.05, math.sin(ang) * rr), rot=(math.sin(ang) * tilt, rng.uniform(0, 1), -math.cos(ang) * tilt), r2=r * 0.1, n=6, color=color, bevel=0, kind=KIND_GLOW if glow else KIND_TOON, seed=seed + i, var=0.12)
        a.add(part)
    a.add(rock(0.35 * size, color=0x5b5e70, seed=seed + 50, sub=1))
    return a

prop("crystal_ice", collider=[("cyl", 0, 0, 0.4, 1.5)], ao=0.3)(lambda: crystal_cluster("crystal_ice", 0x9fe9ff, 1500))
prop("crystal_moon", collider=[("cyl", 0, 0, 0.4, 1.5)], ao=0.3)(lambda: crystal_cluster("crystal_moon", 0xc59bff, 1510))
prop("crystal_ember", collider=[("cyl", 0, 0, 0.4, 1.5)], ao=0.3)(lambda: crystal_cluster("crystal_ember", 0xff7a2a, 1520))

@prop("coral_branch", ao=0.3)
def _():
    rng = random.Random(1600)
    a = Asset("coral_branch")
    def branch(p, d, l, r, depth):
        e = (p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l)
        a.add(tube([p, e], r, color=0xff6f91, n=5, r_end=r * 0.75, smooth=True, seed=int(1600 + depth * 10 + l * 100)))
        if depth < 3:
            for k in range(2):
                ang = rng.uniform(0, math.tau)
                nd = (d[0] + math.cos(ang) * 0.6, d[1], d[2] + math.sin(ang) * 0.6)
                nl = math.sqrt(sum(c * c for c in nd))
                branch(e, tuple(c / nl for c in nd), l * 0.7, r * 0.7, depth + 1)
        else:
            a.add(sphere(r * 1.3, pos=e, color=0xffa6bd, sub=1, seed=int(1650 + l * 100)))
    branch((0, 0, 0), (0, 1, 0), 0.5, 0.08, 0)
    return a

@prop("coral_fan", ao=0.2)
def _():
    a = Asset("coral_fan")
    bm = bmesh.new()
    for side in (0, 1):
        pts = []
        for k in range(9):
            ang = math.pi * (0.1 + 0.8 * k / 8)
            pts.append(bm.verts.new(G(math.cos(ang) * 0.8, 0.1 + math.sin(ang) * 0.9, 0.005 * (side * 2 - 1))))
        c = bm.verts.new(G(0, 0.05, 0.005 * (side * 2 - 1)))
        for k in range(8):
            bm.faces.new([c, pts[k], pts[k + 1]] if side else [c, pts[k + 1], pts[k]])
    a.add(finish_part(bm, 0xb46bff, KIND_TOON, False, random.Random(1700), 0.1, Matrix.Identity(4)))
    a.add(cyl(0.05, 0.15, color=0x8a4fd0, n=6, bevel=0))
    return a

@prop("coral_brain", ao=0.3)
def _():
    a = Asset("coral_brain")
    s = sphere(0.45, scale=(1, 0.7, 1), color=0xffb347, sub=2, smooth=False, seed=1710)
    a.add(s)
    a.add(sphere(0.25, pos=(0.5, 0, 0.2), scale=(1, 0.7, 1), color=0x5fd1c0, sub=1, smooth=False, seed=1711))
    return a

@prop("shells", ao=0.1)
def _():
    rng = random.Random(1800)
    a = Asset("shells")
    for i in range(4):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0.1, 0.4)
        x, z = math.cos(ang) * rr, math.sin(ang) * rr
        if i % 2 == 0:
            a.add(lathe([(0, 0), (0.12, 0.02), (0.1, 0.07), (0.05, 0.12), (0, 0.16)], pos=(x, 0, z), rot=(1.2, ang, 0), color=[0xffe0c2, 0xffb3a7][i // 2], n=7, smooth=False, seed=1800 + i))
        else:
            for k in range(5):
                a2 = k / 5 * math.tau
                a.add(box((0.05, 0.03, 0.14), pos=(x + math.cos(a2) * 0.07, 0, z + math.sin(a2) * 0.07), rot=(0, -a2 + math.pi / 2, 0), color=0xff8a5c, bevel=0.01, seed=1810 + k))
    return a

@prop("seaweed", ao=0.0)
def _():
    rng = random.Random(1900)
    a = Asset("seaweed")
    for i in range(6):
        x, z = rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)
        a.add(blade((x, -0.6, z), rng.uniform(1.0, 1.6), 0.14, lean=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)), color=0x3f8f5a, tip=0x7bc47a, seed=1900 + i))
    return a

@prop("cattails", ao=0.2)
def _():
    rng = random.Random(1950)
    a = Asset("cattails")
    for i in range(7):
        x, z = rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25)
        h = rng.uniform(1.1, 1.6)
        a.add(tube([(x, -0.3, z), (x + rng.uniform(-0.1, 0.1), h, z)], 0.018, color=0x6f9e45, n=4, cap=False, seed=1950 + i))
        a.add(cyl(0.05, 0.28, pos=(x, h - 0.36, z), color=0x7a4a28, n=6, bevel=0.0, seed=1960 + i))
        a.add(blade((x, -0.3, z), h * 0.8, 0.06, lean=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)), color=0x7aa84c, seed=1970 + i))
    return a
