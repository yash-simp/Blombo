"""Structures and clutter: docks, buildings, lanterns, stalls, stage, aquarium, small props.
Conventions: props stand on y = 0 (their placement height); DOCK props have y = 0 at the water and
their deck top at DECK = 1.0, the island ground height."""
from lib import *

PROPS = {}
def prop(name, collider=None, ao=0.8):
    def deco(fn):
        PROPS[name] = {"fn": fn, "collider": collider, "ao": ao}
        return fn
    return deco

DECK = 1.0
WOOD_L, WOOD, WOOD_D, WOOD_DD = 0xc08a52, 0x9a6a3c, 0x6e4a2a, 0x4a3020
STONE, STONE_D = 0xa3a7b0, 0x7d828c
PLASTER, CREAM = 0xf0e0c0, 0xfff1d6
ROPE, GOLD, IRON = 0xd1b07a, 0xe8b84a, 0x3c3b40
GLOW_WARM = 0xffd27a

def planks(a, x0, x1, z0, z1, y, along="x", width=0.28, thick=0.08, color=WOOD, seed=0, gap=0.025):
    """A deck of planks covering [x0,x1]x[z0,z1] with tops at y."""
    rng = random.Random(seed)
    if along == "x":
        n = max(1, int((z1 - z0) / (width + gap)))
        w = (z1 - z0) / n
        for i in range(n):
            zc = z0 + w * (i + 0.5)
            c = jitter(hexrgb(color), rng, 0.1)
            a.add(box((x1 - x0 - rng.uniform(0, 0.06), thick, w - gap), pos=((x0 + x1) / 2 + rng.uniform(-0.02, 0.02), y - thick + rng.uniform(-0.008, 0.008), zc), rot=(0, rng.uniform(-0.006, 0.006), 0), color=c, bevel=0.0, seed=seed + i, var=0.05))
    else:
        n = max(1, int((x1 - x0) / (width + gap)))
        w = (x1 - x0) / n
        for i in range(n):
            xc = x0 + w * (i + 0.5)
            c = jitter(hexrgb(color), rng, 0.1)
            a.add(box((w - gap, thick, z1 - z0 - rng.uniform(0, 0.06)), pos=(xc, y - thick + rng.uniform(-0.008, 0.008), (z0 + z1) / 2 + rng.uniform(-0.02, 0.02)), rot=(0, rng.uniform(-0.006, 0.006), 0), color=c, bevel=0.0, seed=seed + i, var=0.05))

def post(a, x, z, y0, y1, r=0.13, color=WOOD_D, seed=0, rope=None):
    a.add(cyl(r, y1 - y0, pos=(x, y0, z), color=color, n=7, bevel=0.0, seed=seed))
    a.add(cyl(r * 1.08, 0.04, pos=(x, y1 - 0.02, z), r2=r * 0.7, color=mix(hexrgb(color), (0, 0, 0), 0.2), n=8, bevel=0, seed=seed + 1))
    if rope is not None:
        for k in range(2):
            a.add(cyl(r + 0.025, 0.05, pos=(x, rope + k * 0.07, z), color=ROPE, n=8, bevel=0.01, seed=seed + 2 + k, smooth=True))

def lantern(a, x, y, z, color=GLOW_WARM, frame=WOOD_DD, size=1.0, seed=0, roof=GOLD):
    """A hanging/standing box lantern whose BASE is at y."""
    s = size
    a.add(box((0.3 * s, 0.05 * s, 0.3 * s), pos=(x, y, z), color=frame, bevel=0.015, seed=seed))
    a.add(box((0.23 * s, 0.3 * s, 0.23 * s), pos=(x, y + 0.04 * s, z), color=color, kind=KIND_GLOW, bevel=0, var=0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            a.add(box((0.04 * s, 0.32 * s, 0.04 * s), pos=(x + sx * 0.125 * s, y + 0.03 * s, z + sz * 0.125 * s), color=frame, bevel=0.01, seed=seed + 2))
    a.add(cyl(0.2 * s, 0.13 * s, pos=(x, y + 0.34 * s, z), r2=0.02, color=roof, n=8, bevel=0, seed=seed + 3))
    a.add(cyl(0.025 * s, 0.08 * s, pos=(x, y + 0.45 * s, z), color=frame, n=6, bevel=0))
    a.anchor("light" + str(len(a.anchors)), (x, y + 0.2 * s, z))

def paper_lantern(a, x, y, z, color, seed=0):
    """A round paper lantern hanging with its TOP at y."""
    a.add(cyl(0.012, 0.12, pos=(x, y - 0.12, z), color=IRON, n=4, bevel=0))
    a.add(cyl(0.07, 0.04, pos=(x, y - 0.16, z), color=WOOD_DD, n=8, bevel=0))
    a.add(sphere(0.17, pos=(x, y - 0.33, z), scale=(1, 0.95, 1), color=color, kind=KIND_GLOW, uv=(10, 7), smooth=True, var=0))
    for k in range(3):
        a.add(cyl(0.172, 0.012, pos=(x, y - 0.42 + k * 0.09, z), color=mix(hexrgb(color), (0.4, 0.15, 0.05), 0.5), n=10, bevel=0, cap=False))
    a.add(cyl(0.07, 0.04, pos=(x, y - 0.52, z), color=WOOD_DD, n=8, bevel=0))
    a.anchor("light" + str(len(a.anchors)), (x, y - 0.33, z))

def gable_roof(a, w, d, y, pitch=0.6, over=0.35, color=0xc0503a, rows=6, seed=0, ridge=WOOD_D):
    """Shingle rows on a gable roof whose eaves sit at y, ridge along X, footprint w x d."""
    rng = random.Random(seed)
    half = d / 2 + over
    rise = (d / 2) * pitch
    slope_len = math.hypot(half, rise + over * pitch)
    ang = math.atan2(rise, d / 2)
    for side in (-1, 1):
        for i in range(rows):
            t0 = i / rows
            # strip centre along the slope from eave (t=0) to ridge (t=1)
            tc = (i + 0.5) / rows
            zc = side * (half - tc * half)
            yc = y - over * pitch + tc * (rise + over * pitch)
            c = jitter(hexrgb(color), rng, 0.08) if i % 2 == 0 else jitter(mix(hexrgb(color), (0, 0, 0), 0.12), rng, 0.08)
            a.add(box((w + over * 2 + rng.uniform(-0.03, 0.03), 0.09, slope_len / rows + 0.08), pos=(0, yc, zc), rot=(side * ang, 0, 0), color=c, bevel=0.03, seed=seed + i * 2 + (side > 0), base=False))
    a.add(box((w + over * 2 + 0.1, 0.16, 0.22), pos=(0, y + rise + 0.03, 0), color=ridge, bevel=0.04, base=False, seed=seed + 50))
    return rise

def gable_walls(a, w, d, y, rise, color, seed=0, beam=WOOD_D):
    for side in (-1, 1):
        poly = [(-d / 2, 0), (d / 2, 0), (0, rise)]
        bm = bmesh.new()
        for face_off in (0.0,):
            vs = [bm.verts.new(G(side * w / 2, y + py, px)) for (px, py) in poly]
            vs2 = [bm.verts.new(G(side * (w / 2 - 0.12), y + py, px)) for (px, py) in poly]
            f1 = bm.faces.new(vs if side > 0 else list(reversed(vs)))
            f2 = bm.faces.new(list(reversed(vs2)) if side > 0 else vs2)
            for k in range(3):
                q = [vs[k], vs[(k + 1) % 3], vs2[(k + 1) % 3], vs2[k]]
                try:
                    bm.faces.new(q if side < 0 else list(reversed(q)))
                except ValueError:
                    pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        a.add(finish_part(bm, color, KIND_TOON, False, random.Random(seed + side), 0.04, Matrix.Identity(4)))
        # timber on the gable
        a.add(box((0.14, 0.14, d * 0.62), pos=(side * (w / 2 + 0.02), y + rise * 0.45, 0), color=beam, bevel=0.02, base=False, seed=seed + 5))

def window(a, x, y, z, w=0.8, h=0.9, face=1, shutter=0x4a7bbf, frame=WOOD_D, glow=GLOW_WARM, flowers=True, seed=0, axis="z"):
    """A window on a wall facing +z (face=1) or -z; axis 'x' puts it on a wall facing +-x."""
    def P(px, py, pz):
        return (x + px, y + py, z + pz) if axis == "z" else (x + pz, y + py, z + px)
    def S(sx, sy, sz):
        return (sx, sy, sz) if axis == "z" else (sz, sy, sx)
    f = face * 0.06
    a.add(box(S(w + 0.16, h + 0.16, 0.1), pos=P(0, -0.08, f * 0.4), color=frame, bevel=0.025, seed=seed))
    a.add(box(S(w, h, 0.04), pos=P(0, 0, f * 0.9), color=glow, kind=KIND_GLOW, bevel=0, var=0.0))
    a.add(box(S(0.05, h, 0.06), pos=P(0, 0, f * 1.2), color=frame, bevel=0.01, seed=seed + 1))
    a.add(box(S(w, 0.05, 0.06), pos=P(0, h / 2 - 0.025, f * 1.2), color=frame, bevel=0.01, seed=seed + 2))
    for side in (-1, 1):
        a.add(box(S(w * 0.42, h + 0.05, 0.05), pos=P(side * (w / 2 + w * 0.26), -0.02, f * 0.9), color=shutter, bevel=0.02, seed=seed + 3 + side))
        for k in range(3):
            a.add(box(S(w * 0.36, 0.03, 0.02), pos=P(side * (w / 2 + w * 0.26), h * (0.2 + k * 0.3), f * 1.35), color=mix(hexrgb(shutter), (0, 0, 0), 0.2), bevel=0, seed=seed + 8 + k))
    a.add(box(S(w + 0.3, 0.07, 0.22), pos=P(0, -0.15, f * 2.2), color=frame, bevel=0.02, seed=seed + 4))
    if flowers:
        a.add(box(S(w + 0.1, 0.18, 0.2), pos=P(0, -0.33, f * 2.2), color=0xa4643a, bevel=0.02, seed=seed + 5))
        rng = random.Random(seed)
        for k in range(6):
            px = -w / 2 + 0.05 + (w - 0.1) * k / 5
            c = [0xff7eb6, 0xffd34d, 0xffffff, 0xff8a5c][k % 4]
            a.add(sphere(0.07, pos=P(px, -0.1 + rng.uniform(0, 0.05), f * 2.2 + rng.uniform(-0.03, 0.03)), color=c, sub=1, smooth=False, seed=seed + 20 + k))
            a.add(sphere(0.08, pos=P(px + 0.06, -0.14, f * 2.2), color=0x4f9b3c, sub=1, smooth=False, seed=seed + 40 + k))

def door(a, x, y, z, w=1.0, h=2.0, color=0x8a4f2a, frame=WOOD_D, face=1, seed=0):
    f = face * 0.06
    a.add(box((w + 0.2, h + 0.12, 0.12), pos=(x, y, z + f * 0.3), color=frame, bevel=0.03, seed=seed))
    n = 4
    for i in range(n):
        a.add(box((w / n - 0.02, h, 0.06), pos=(x - w / 2 + w / n * (i + 0.5), y, z + f * 1.1), color=jitter(hexrgb(color), random.Random(seed + i), 0.1), bevel=0.015, seed=seed + i))
    for yy in (0.3, h - 0.35):
        a.add(box((w - 0.05, 0.1, 0.04), pos=(x, y + yy, z + f * 1.7), color=mix(hexrgb(color), (0, 0, 0), 0.25), bevel=0.01))
    a.add(sphere(0.05, pos=(x + w * 0.32, y + h * 0.48, z + f * 2.1), color=GOLD, sub=1))

def stone_base(a, w, d, h=0.35, color=STONE, seed=0):
    rng = random.Random(seed)
    a.add(box((w + 0.16, h, d + 0.16), color=color, bevel=0.05, seed=seed))
    for i in range(int((w + d) * 2.2)):
        t = rng.random()
        side = rng.randrange(4)
        if side < 2:
            px, pz = -w / 2 + w * t, (d / 2 + 0.09) * (1 if side else -1)
            sz = (rng.uniform(0.3, 0.5), rng.uniform(0.14, 0.24), 0.06)
        else:
            px, pz = (w / 2 + 0.09) * (1 if side == 3 else -1), -d / 2 + d * t
            sz = (0.06, rng.uniform(0.14, 0.24), rng.uniform(0.3, 0.5))
        a.add(box(sz, pos=(px, rng.uniform(0.02, h - sz[1]), pz), color=jitter(hexrgb(color), rng, 0.12), bevel=0.0, seed=seed + 10 + i))

# ───────────────────────── lanterns ─────────────────────────
@prop("lantern_post", collider=[("cyl", 0, 0, 0.2, 2.6)], ao=0.6)
def _():
    a = Asset("lantern_post")
    a.add(box((0.5, 0.18, 0.5), color=STONE_D, bevel=0.05))
    a.add(box((0.17, 2.5, 0.17), pos=(0, 0.18, 0), color=WOOD, bevel=0.03, taper=(0.85, 0.85)))
    a.add(box((0.75, 0.12, 0.12), pos=(0.24, 2.45, 0), color=WOOD, bevel=0.03))
    a.add(box((0.1, 0.4, 0.1), pos=(0.08, 2.1, 0), rot=(0, 0, -0.75), color=WOOD_D, bevel=0.02))
    a.add(cyl(0.018, 0.28, pos=(0.52, 2.17, 0), color=IRON, n=5, bevel=0))
    lantern(a, 0.52, 1.72, 0)
    return a

@prop("lantern_ground", ao=0.4)
def _():
    a = Asset("lantern_ground")
    a.add(cyl(0.18, 0.08, color=STONE_D, n=8, bevel=0.02))
    lantern(a, 0, 0.08, 0, size=1.2)
    return a

@prop("lantern_string", ao=0.5)
def _():
    """Two posts 6 m apart (x = -3 and +3) with a sagging rope of paper lanterns."""
    a = Asset("lantern_string")
    for x in (-3, 3):
        a.add(cyl(0.09, 3.0, pos=(x, 0, 0), color=WOOD_D, n=7, bevel=0.02, seed=int(x)))
        a.add(sphere(0.1, pos=(x, 3.0, 0), color=GOLD, sub=1))
    pts = catenary((-3, 2.85, 0), (3, 2.85, 0), 0.55, 12)
    a.add(tube(pts, 0.018, color=ROPE, n=4, smooth=True))
    cols = [0xff9a5a, 0xffd27a, 0xff7eb6, 0x9ff0ff, 0xffd27a]
    for i, t in enumerate([0.17, 0.34, 0.5, 0.66, 0.83]):
        x = -3 + 6 * t
        y = 2.85 - 0.55 * 4 * t * (1 - t)
        paper_lantern(a, x, y, 0, cols[i], seed=i)
    return a

@prop("torch_tiki", collider=[("cyl", 0, 0, 0.15, 2)], ao=0.4)
def _():
    a = Asset("torch_tiki")
    a.add(cyl(0.07, 1.7, color=0x8a6a3c, n=6, r2=0.06, bevel=0))
    for k in range(4):
        a.add(cyl(0.085, 0.05, pos=(0, 0.4 + k * 0.35, 0), color=0x5e4022, n=6, bevel=0))
    a.add(cyl(0.12, 0.25, pos=(0, 1.7, 0), r2=0.16, color=0x6b4a2a, n=8, bevel=0.02))
    a.add(cyl(0.13, 0.32, pos=(0, 1.9, 0), r2=0.0, color=0xffa23a, kind=KIND_GLOW, n=7, bevel=0, var=0.1))
    a.add(cyl(0.07, 0.2, pos=(0, 2.0, 0), r2=0.0, color=0xfff0a0, kind=KIND_GLOW, n=6, bevel=0))
    a.anchor("light0", (0, 2.05, 0))
    return a

@prop("stone_lantern", collider=[("cyl", 0, 0, 0.35, 1.6)], ao=0.6)
def _():
    a = Asset("stone_lantern")
    a.add(cyl(0.38, 0.18, color=STONE_D, n=6, bevel=0.03))
    a.add(cyl(0.12, 0.7, pos=(0, 0.18, 0), color=STONE, n=6, bevel=0.02))
    a.add(cyl(0.3, 0.1, pos=(0, 0.88, 0), color=STONE_D, n=6, bevel=0.02))
    a.add(box((0.36, 0.34, 0.36), pos=(0, 0.98, 0), color=STONE, bevel=0.03))
    a.add(box((0.24, 0.24, 0.4), pos=(0, 1.03, 0), color=0xa9d8ff, kind=KIND_GLOW, bevel=0, var=0))
    a.add(box((0.4, 0.24, 0.24), pos=(0, 1.03, 0), color=0xa9d8ff, kind=KIND_GLOW, bevel=0, var=0))
    a.add(cyl(0.42, 0.22, pos=(0, 1.32, 0), r2=0.05, color=STONE_D, n=6, bevel=0.02))
    a.add(sphere(0.07, pos=(0, 1.58, 0), color=STONE, sub=1))
    a.anchor("light0", (0, 1.15, 0))
    return a

# ───────────────────────── docks ─────────────────────────
@prop("dock_4", ao=0.6)
def _():
    """A 4 m long (x) x 3 m wide (z) dock section centred at the origin, deck top at DECK."""
    a = Asset("dock_4")
    planks(a, -2.0, 2.0, -1.5, 1.5, DECK, along="z", width=0.3, seed=1)
    for z in (-1.35, 1.35):
        a.add(box((4.0, 0.22, 0.16), pos=(0, DECK - 0.34, z), color=WOOD_D, bevel=0.03, seed=int(z * 10)))
    for x in (-1.8, 1.8):
        for z in (-1.45, 1.45):
            post(a, x, z, -1.4, DECK + 0.35, r=0.14, seed=int(x * 10 + z), rope=DECK + 0.05)
        a.add(box((0.12, 0.12, 3.0), pos=(x, -0.2, 0), rot=(0.55, 0, 0), color=WOOD_DD, bevel=0.02, base=False))
    return a

@prop("dock_end", ao=0.6)
def _():
    a = Asset("dock_end")
    planks(a, -2.0, 2.0, -1.5, 1.5, DECK, along="z", width=0.3, seed=5)
    for z in (-1.35, 1.35):
        a.add(box((4.0, 0.22, 0.16), pos=(0, DECK - 0.34, z), color=WOOD_D, bevel=0.03))
    for x in (-1.8, 1.8):
        for z in (-1.45, 1.45):
            post(a, x, z, -1.4, DECK + 0.35, r=0.14, seed=int(x * 10 + z) + 3, rope=DECK + 0.05)
    # end railing + bench + lantern
    a.add(box((0.12, 0.08, 2.9), pos=(1.85, DECK + 0.85, 0), color=WOOD, bevel=0.02))
    for z in (-0.7, 0, 0.7):
        a.add(box((0.1, 0.85, 0.1), pos=(1.85, DECK, z), color=WOOD, bevel=0.02))
    lantern(a, 1.85, DECK + 0.93, -1.45)
    a.add(box((0.5, 0.06, 0.5), pos=(1.85, DECK + 0.89, -1.45), color=WOOD_D, bevel=0.01))
    return a

@prop("pier_post", ao=0.3)
def _():
    a = Asset("pier_post")
    post(a, 0, 0, -1.4, DECK + 0.5, r=0.16, seed=9, rope=DECK + 0.1)
    return a

@prop("buoy", ao=0.2)
def _():
    a = Asset("buoy")
    a.add(lathe([(0.0, -0.2), (0.3, -0.1), (0.32, 0.15), (0.12, 0.35), (0.06, 0.6), (0, 0.65)], color=0xe8463a, n=10, smooth=False))
    a.add(cyl(0.325, 0.12, pos=(0, 0.02, 0), color=0xffffff, n=10, bevel=0, cap=False))
    a.add(sphere(0.07, pos=(0, 0.67, 0), color=0xffe066, kind=KIND_GLOW, sub=1))
    a.anchor("light0", (0, 0.67, 0))
    return a

# ───────────────────────── fences, benches, clutter ─────────────────────────
@prop("fence_3", ao=0.5)
def _():
    a = Asset("fence_3")
    for x in (-1.5, 0, 1.5):
        a.add(box((0.14, 1.0, 0.14), pos=(x, 0, 0), color=WOOD, bevel=0.025, seed=int(x * 3)))
        a.add(cyl(0.1, 0.08, pos=(x, 1.0, 0), r2=0.02, color=WOOD_D, n=4, bevel=0))
    for y in (0.35, 0.75):
        a.add(box((3.1, 0.1, 0.06), pos=(0, y, 0.08), color=WOOD_L, bevel=0.02, seed=int(y * 10)))
    return a

@prop("bench", collider=[("box", 0, 0, 0, 1.6, 0.8, 0.6)], ao=0.6)
def _():
    a = Asset("bench")
    for x in (-0.65, 0.65):
        a.add(box((0.12, 0.45, 0.5), pos=(x, 0, 0), color=WOOD_D, bevel=0.02))
        a.add(box((0.1, 0.5, 0.08), pos=(x, 0.45, -0.24), rot=(-0.15, 0, 0), color=WOOD_D, bevel=0.02))
    for z in (-0.12, 0.08):
        a.add(box((1.6, 0.06, 0.18), pos=(0, 0.45, z), color=WOOD_L, bevel=0.02, seed=int(z * 100)))
    for y in (0.65, 0.85):
        a.add(box((1.6, 0.12, 0.05), pos=(0, y, -0.28), rot=(-0.15, 0, 0), color=WOOD_L, bevel=0.02, seed=int(y * 100)))
    return a

@prop("crate", collider=[("box", 0, 0, 0, 0.8, 0.8, 0.8)], ao=0.4)
def _():
    a = Asset("crate")
    a.add(box((0.76, 0.76, 0.76), color=WOOD_L, bevel=0.03))
    for s in (-1, 1):
        for axis in ("x", "z"):
            if axis == "x":
                a.add(box((0.8, 0.1, 0.06), pos=(0, 0.06, s * 0.38), color=WOOD_D, bevel=0.015))
                a.add(box((0.8, 0.1, 0.06), pos=(0, 0.6, s * 0.38), color=WOOD_D, bevel=0.015))
                a.add(box((0.1, 0.9, 0.05), pos=(0, 0.42, s * 0.39), rot=(0, 0, 0.78), color=WOOD_D, bevel=0.015, base=False))
            else:
                a.add(box((0.06, 0.1, 0.8), pos=(s * 0.38, 0.06, 0), color=WOOD_D, bevel=0.015))
                a.add(box((0.06, 0.1, 0.8), pos=(s * 0.38, 0.6, 0), color=WOOD_D, bevel=0.015))
    return a

@prop("crate_fish", collider=[("box", 0, 0, 0, 0.8, 0.6, 0.8)], ao=0.4)
def _():
    rng = random.Random(77)
    a = Asset("crate_fish")
    a.add(box((0.8, 0.4, 0.6), color=WOOD_L, bevel=0.03))
    a.add(box((0.7, 0.05, 0.5), pos=(0, 0.32, 0), color=0xdff3ff, bevel=0.01))
    for i in range(6):
        x, z = rng.uniform(-0.28, 0.28), rng.uniform(-0.18, 0.18)
        c = [0x8fb3c9, 0xd9a05b, 0x9fc77a, 0xc97b8a][i % 4]
        a.add(sphere(0.07, pos=(x, 0.4, z), rot=(0, rng.uniform(0, 3), 0), scale=(2.4, 0.9, 1), color=c, sub=1, smooth=False, seed=i))
        a.add(box((0.02, 0.12, 0.1), pos=(x + 0.17 * math.cos(0), 0.36, z), color=c, bevel=0))
    return a

@prop("barrel", collider=[("cyl", 0, 0, 0.4, 1)], ao=0.4)
def _():
    a = Asset("barrel")
    a.add(lathe([(0.3, 0), (0.36, 0.25), (0.38, 0.45), (0.36, 0.65), (0.3, 0.9), (0.0, 0.9)], color=WOOD, n=12, smooth=False, seed=3))
    for y in (0.12, 0.78):
        a.add(cyl(0.355, 0.06, pos=(0, y, 0), color=IRON, n=12, bevel=0, cap=False))
    a.add(cyl(0.3, 0.02, pos=(0, 0.88, 0), color=WOOD_L, n=12, bevel=0))
    return a

@prop("bucket_worms", ao=0.3)
def _():
    a = Asset("bucket_worms")
    a.add(lathe([(0.14, 0), (0.18, 0.3), (0.0, 0.3)], color=0x8fa1b0, n=10, smooth=False))
    a.add(cyl(0.165, 0.02, pos=(0, 0.26, 0), color=0x5a3d28, n=10, bevel=0))
    a.add(tube(catenary((-0.18, 0.3, 0), (0.18, 0.3, 0), -0.2, 8), 0.01, color=IRON, n=4))
    for k in range(3):
        a.add(tube([(-0.06 + k * 0.05, 0.28, -0.03), (-0.02 + k * 0.05, 0.33, 0.02), (0.02 + k * 0.05, 0.29, 0.04)], 0.012, color=0xe08a8a, n=4))
    return a

@prop("net_rack", collider=[("box", 0, 0, 0, 2.2, 2, 0.4)], ao=0.6)
def _():
    a = Asset("net_rack")
    for x in (-1, 1):
        a.add(box((0.12, 1.9, 0.12), pos=(x, 0, 0), color=WOOD_D, bevel=0.02))
    a.add(box((2.3, 0.1, 0.12), pos=(0, 1.8, 0), color=WOOD, bevel=0.02))
    # net: grid of thin tubes in a sagging sheet
    for i in range(9):
        x = -0.9 + i * 0.225
        a.add(tube([(x, 1.8, 0.05), (x + 0.03, 1.1, 0.12), (x, 0.55, 0.06)], 0.008, color=0xd8c08e, n=3))
    for j in range(6):
        y = 1.7 - j * 0.22
        sag = 0.05 * math.sin(j)
        a.add(tube([(-0.95, y, 0.07), (0, y - 0.12 - sag, 0.12), (0.95, y, 0.07)], 0.008, color=0xd8c08e, n=3))
    for k in range(3):
        a.add(sphere(0.07, pos=(-0.6 + k * 0.6, 1.45 - k * 0.2, 0.1), color=[0xe8463a, 0xffffff, 0xe8b84a][k], sub=1))
    return a

@prop("rod_rack", collider=[("box", 0, 0, 0, 1.6, 2, 0.5)], ao=0.6)
def _():
    a = Asset("rod_rack")
    a.add(box((1.6, 0.12, 0.45), color=WOOD_D, bevel=0.02))
    a.add(box((1.6, 0.1, 0.1), pos=(0, 1.2, -0.18), color=WOOD, bevel=0.02))
    for x in (-0.75, 0.75):
        a.add(box((0.1, 1.3, 0.1), pos=(x, 0, -0.18), color=WOOD, bevel=0.02))
    cols = [0xd9a05b, 0x5aa6e8, 0xe85a5a, 0x7ac77a, 0xb07ae8]
    for i in range(5):
        x = -0.6 + i * 0.3
        a.add(tube([(x, 0.12, 0.05), (x, 1.25, -0.13), (x + 0.05, 2.2, -0.35)], 0.022, color=cols[i], n=5, r_end=0.008))
        a.add(cyl(0.05, 0.08, pos=(x, 0.55, 0.0), rot=(0, 0, math.pi / 2), color=0x9a9ea8, n=8, bevel=0))
    return a

@prop("signpost", collider=[("cyl", 0, 0, 0.15, 2)], ao=0.5)
def _():
    a = Asset("signpost")
    a.add(box((0.14, 2.2, 0.14), color=WOOD, bevel=0.025))
    for i, (y, yaw, c) in enumerate([(1.85, 0.25, 0xe8b84a), (1.5, -0.3, 0x7ac7e8), (1.15, 0.1, 0xe87a7a)]):
        a.add(prism([(-0.05, -0.1), (0.75, -0.1), (0.9, 0.0), (0.75, 0.1), (-0.05, 0.1)], 0.24, pos=(0, y, 0), rot=(0, yaw + (math.pi if i == 1 else 0), 0), color=c, seed=i))
    return a

@prop("well", collider=[("cyl", 0, 0, 0.9, 2)], ao=0.8)
def _():
    a = Asset("well")
    rng = random.Random(5)
    for i in range(14):
        ang = i / 14 * math.tau
        a.add(box((0.42, 0.75, 0.25), pos=(math.cos(ang) * 0.75, 0, math.sin(ang) * 0.75), rot=(0, -ang + math.pi / 2, 0), color=jitter(hexrgb(STONE), rng, 0.12), bevel=0.04, seed=i))
    a.add(cyl(0.68, 0.05, pos=(0, 0.45, 0), color=0x3a6f9a, n=14, bevel=0, kind=KIND_TOON))
    for x in (-0.8, 0.8):
        a.add(box((0.12, 1.9, 0.12), pos=(x, 0.6, 0), color=WOOD, bevel=0.02))
    gable_roof(a, 1.5, 1.4, 2.4, pitch=0.9, over=0.12, color=0xc0503a, rows=3, seed=7)
    a.add(cyl(0.08, 1.5, pos=(-0.75, 2.0, 0), rot=(0, 0, -math.pi / 2), color=WOOD_D, n=6, bevel=0))
    a.add(tube([(0.0, 2.0, 0), (0.0, 1.3, 0)], 0.012, color=ROPE, n=4))
    a.add(lathe([(0.1, 1.05), (0.13, 1.3), (0, 1.3)], color=WOOD_L, n=8, smooth=False))
    return a

@prop("campfire", ao=0.3)
def _():
    a = Asset("campfire")
    rng = random.Random(9)
    for i in range(8):
        ang = i / 8 * math.tau
        a.add(rock(0.14, pos=(math.cos(ang) * 0.45, 0, math.sin(ang) * 0.45), color=STONE_D, seed=i, sub=1))
    for i in range(4):
        ang = i / 4 * math.tau + 0.4
        a.add(tube([(math.cos(ang) * 0.35, 0.05, math.sin(ang) * 0.35), (0, 0.45, 0)], 0.05, color=WOOD_D, n=5))
    a.add(cyl(0.2, 0.55, pos=(0, 0.05, 0), r2=0.0, color=0xff8a2a, kind=KIND_GLOW, n=6, bevel=0, var=0.1))
    a.add(cyl(0.1, 0.4, pos=(0.05, 0.05, 0.03), r2=0.0, color=0xffe27a, kind=KIND_GLOW, n=5, bevel=0))
    a.anchor("light0", (0, 0.4, 0))
    return a

@prop("haybale", collider=[("cyl", 0, 0, 0.6, 1)], ao=0.4)
def _():
    a = Asset("haybale")
    a.add(cyl(0.55, 0.9, pos=(-0.45, 0.55, 0), rot=(0, 0, -math.pi / 2), color=0xe2c35c, n=12, bevel=0.06))
    a.add(cyl(0.45, 0.02, pos=(0.455, 0.55, 0), rot=(0, 0, -math.pi / 2), color=0xc9a845, n=12, bevel=0))
    return a

@prop("umbrella", collider=[("cyl", 0, 0, 0.12, 2.4)], ao=0.4)
def _():
    a = Asset("umbrella")
    a.add(cyl(0.04, 2.3, color=0xffffff, n=6, bevel=0))
    n = 8
    for i in range(n):
        ang0, ang1 = i / n * math.tau, (i + 1) / n * math.tau
        c = 0xe8463a if i % 2 else 0xffffff
        a.add(quad([(0, 2.45, 0), (math.cos(ang0) * 1.3, 1.95, math.sin(ang0) * 1.3), (math.cos(ang1) * 1.3, 1.95, math.sin(ang1) * 1.3)], color=c))
    return a

@prop("surfboard", ao=0.3)
def _():
    a = Asset("surfboard")
    a.add(sphere(0.5, pos=(0, 0.9, 0), rot=(0.2, 0, 0.1), scale=(0.55, 1.9, 0.08), color=0x5fd1c0, sub=2, smooth=True))
    a.add(box((0.06, 1.5, 0.12), pos=(0, 0.2, 0.02), rot=(0.2, 0, 0.1), color=0xffffff, bevel=0))
    return a

@prop("sandcastle", ao=0.5)
def _():
    a = Asset("sandcastle")
    a.add(box((1.0, 0.35, 1.0), color=0xe6cf98, bevel=0.06))
    for x, z in ((-0.4, -0.4), (0.4, -0.4), (-0.4, 0.4), (0.4, 0.4)):
        a.add(cyl(0.16, 0.6, pos=(x, 0, z), color=0xe6cf98, n=8, bevel=0.03))
        a.add(cyl(0.18, 0.15, pos=(x, 0.6, z), r2=0.0, color=0xdcc286, n=8, bevel=0))
    a.add(cyl(0.22, 0.8, pos=(0, 0.35, 0), color=0xead6a2, n=8, bevel=0.03))
    a.add(cyl(0.012, 0.35, pos=(0, 1.15, 0), color=WOOD_D, n=4, bevel=0))
    a.add(quad([(0, 1.5, 0), (0.25, 1.42, 0), (0, 1.33, 0)], color=0xe8463a))
    return a

@prop("snowman", collider=[("cyl", 0, 0, 0.5, 1.6)], ao=0.5)
def _():
    a = Asset("snowman")
    a.add(sphere(0.5, pos=(0, 0.42, 0), color=0xf4f8ff, sub=2, smooth=True))
    a.add(sphere(0.36, pos=(0, 1.05, 0), color=0xf4f8ff, sub=2, smooth=True))
    a.add(sphere(0.26, pos=(0, 1.52, 0), color=0xf4f8ff, sub=2, smooth=True))
    a.add(cyl(0.05, 0.25, pos=(0, 1.55, 0.22), rot=(math.pi / 2, 0, 0), r2=0.0, color=0xff8a2a, n=6, bevel=0))
    for x in (-0.09, 0.09):
        a.add(sphere(0.035, pos=(x, 1.6, 0.23), color=0x222222, sub=1))
    a.add(cyl(0.27, 0.07, pos=(0, 1.25, 0), color=0xe8463a, n=10, bevel=0.02))
    a.add(box((0.12, 0.4, 0.05), pos=(0.16, 0.95, 0.27), rot=(0.2, 0, 0.2), color=0xe8463a, bevel=0.01))
    a.add(cyl(0.22, 0.05, pos=(0, 1.73, 0), color=0x2a2a33, n=10, bevel=0.01))
    a.add(cyl(0.16, 0.3, pos=(0, 1.75, 0), color=0x2a2a33, n=10, bevel=0.02))
    for s in (-1, 1):
        a.add(tube([(s * 0.3, 1.1, 0), (s * 0.65, 1.35, 0.05), (s * 0.8, 1.5, 0.05)], 0.025, color=WOOD_D, n=4))
    return a

# ───────────────────────── buildings ─────────────────────────
def cottage(name, w, d, wall_h, roof_color, shutter, wall=PLASTER, seed=0, chimney=True, porch=True):
    a = Asset(name)
    stone_base(a, w, d, 0.4, seed=seed)
    y0 = 0.4
    a.add(box((w, wall_h, d), pos=(0, y0, 0), color=wall, bevel=0.03, seed=seed + 1, var=0.03))
    # timber frame
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2):
            a.add(box((0.2, wall_h + 0.05, 0.2), pos=(x, y0, z), color=WOOD_D, bevel=0.03, seed=seed + 2))
    for z in (-d / 2 - 0.02, d / 2 + 0.02):
        a.add(box((w + 0.1, 0.16, 0.14), pos=(0, y0 + wall_h - 0.08, z), color=WOOD_D, bevel=0.02))
        a.add(box((w + 0.1, 0.12, 0.12), pos=(0, y0 + 1.15, z), color=WOOD_D, bevel=0.02))
    for x in (-w / 2 - 0.02, w / 2 + 0.02):
        a.add(box((0.14, 0.16, d + 0.1), pos=(x, y0 + wall_h - 0.08, 0), color=WOOD_D, bevel=0.02))
        a.add(box((0.12, 0.12, d + 0.1), pos=(x, y0 + 1.15, 0), color=WOOD_D, bevel=0.02))
        a.add(box((0.1, 1.6, 0.1), pos=(x, y0 + 1.2, -d * 0.25), rot=(0.55, 0, 0), color=WOOD_D, bevel=0.02))
    # front: door + windows ; back: windows ; sides: one window each
    door(a, -w * 0.18 if w > 4 else 0, y0, d / 2, seed=seed + 3)
    if w > 4:
        window(a, w * 0.25, y0 + 1.25, d / 2, shutter=shutter, seed=seed + 10)
    window(a, 0, y0 + 1.25, -d / 2, face=-1, shutter=shutter, seed=seed + 20)
    window(a, w / 2, y0 + 1.25, 0, face=1, shutter=shutter, seed=seed + 30, axis="x")
    window(a, -w / 2, y0 + 1.25, 0, face=-1, shutter=shutter, seed=seed + 40, axis="x")
    rise = gable_roof(a, w, d, y0 + wall_h, pitch=0.75, over=0.4, color=roof_color, rows=6, seed=seed + 50)
    gable_walls(a, w, d, y0 + wall_h, rise, wall, seed=seed + 60)
    if chimney:
        cx = w * 0.3
        a.add(box((0.6, rise + 1.4, 0.6), pos=(cx, y0 + wall_h - 0.3, -d * 0.22), color=STONE, bevel=0.04, seed=seed + 70))
        a.add(box((0.72, 0.14, 0.72), pos=(cx, y0 + wall_h + rise + 1.1, -d * 0.22), color=STONE_D, bevel=0.03))
    if porch:
        dx = -w * 0.18 if w > 4 else 0
        a.add(box((1.8, 0.12, 1.2), pos=(dx, 0.28, d / 2 + 0.6), color=WOOD_L, bevel=0.03))
        for s in (-1, 1):
            a.add(box((0.12, 2.3, 0.12), pos=(dx + s * 0.8, 0.4, d / 2 + 1.1), color=WOOD_D, bevel=0.02))
        a.add(box((2.0, 0.08, 1.4), pos=(dx, 2.75, d / 2 + 0.55), rot=(-0.25, 0, 0), color=roof_color, bevel=0.03, base=False))
        lantern(a, dx + 0.75, 2.05, d / 2 + 1.1, size=0.8)
    return a

prop("cottage_a", collider=[("box", 0, 0, 0, 5.4, 6, 4.4)], ao=1.6)(lambda: cottage("cottage_a", 5.0, 4.0, 2.7, 0xc0503a, 0x4a7bbf, seed=100))
prop("cottage_b", collider=[("box", 0, 0, 0, 4.2, 6, 4.2)], ao=1.6)(lambda: cottage("cottage_b", 3.8, 3.8, 2.6, 0x4a7bbf, 0xe8b84a, wall=CREAM, seed=200))
prop("cottage_c", collider=[("box", 0, 0, 0, 5.4, 6, 4.4)], ao=1.6)(lambda: cottage("cottage_c", 5.0, 4.0, 2.7, 0x3f9a8a, 0xc0503a, wall=0xf2d6b8, seed=300))

@prop("market_stall", collider=[("box", 0, 0, -0.3, 3.2, 3, 1.4)], ao=1.0)
def _():
    a = Asset("market_stall")
    w, d = 3.0, 1.8
    a.add(box((w, 0.95, 0.9), pos=(0, 0, -0.3), color=WOOD_L, bevel=0.04, seed=1))
    for i in range(6):
        a.add(box((w / 6 - 0.03, 0.85, 0.04), pos=(-w / 2 + w / 6 * (i + 0.5), 0.05, 0.16), color=jitter(hexrgb(WOOD), random.Random(i), 0.1), bevel=0.01))
    a.add(box((w + 0.2, 0.1, 1.0), pos=(0, 0.95, -0.3), color=WOOD_D, bevel=0.03))
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2 - 0.3):
            a.add(box((0.14, 2.6, 0.14), pos=(x, 0, z), color=WOOD_D, bevel=0.02))
    # striped awning, sloping forward
    n = 8
    for i in range(n):
        x = -w / 2 - 0.2 + (w + 0.4) / n * (i + 0.5)
        c = 0xe8463a if i % 2 == 0 else 0xfff1d6
        a.add(box(((w + 0.4) / n, 0.06, 2.2), pos=(x, 2.75, -0.1), rot=(-0.28, 0, 0), color=c, bevel=0.02, base=False, var=0.03))
        a.add(prism([(-(w + 0.4) / n / 2, 0), ((w + 0.4) / n / 2, 0), (0, 0.22)], 0.04, pos=(x, 2.48, 1.0), rot=(math.pi / 2, 0, 0), color=c, seed=i))
    # fish crates on the counter, ice
    rng = random.Random(4)
    for k, cx in enumerate((-0.9, 0.0, 0.9)):
        a.add(box((0.8, 0.15, 0.6), pos=(cx, 1.0, -0.3), color=WOOD, bevel=0.02))
        a.add(box((0.7, 0.04, 0.5), pos=(cx, 1.12, -0.3), color=0xe6f6ff, bevel=0.01))
        for i in range(4):
            c = [0x8fb3c9, 0xd9a05b, 0x9fc77a, 0xc97b8a, 0x7aa6e8][(i + k) % 5]
            a.add(sphere(0.08, pos=(cx + rng.uniform(-0.22, 0.22), 1.2, -0.3 + rng.uniform(-0.15, 0.15)), rot=(0, rng.uniform(0, 3), 0), scale=(2.4, 0.8, 1), color=c, sub=1, smooth=False, seed=k * 10 + i))
    # sign board
    a.add(box((1.8, 0.55, 0.08), pos=(0, 3.05, 0.95), rot=(-0.28, 0, 0), color=WOOD_L, bevel=0.03, base=False))
    a.add(sphere(0.16, pos=(-0.25, 3.05, 1.0), scale=(2.2, 0.9, 0.4), color=0x5aa6e8, sub=1, smooth=False))
    a.add(prism([(0.0, -0.15), (0.0, 0.15), (0.25, 0.0)], 0.06, pos=(0.12, 3.05, 1.0), rot=(math.pi / 2, 0, 0), color=0x5aa6e8))
    # hanging fish + lantern
    for i, x in enumerate((-1.2, 1.2)):
        a.add(tube([(x, 2.45, 0.75), (x, 2.1, 0.75)], 0.008, color=ROPE, n=3))
        a.add(sphere(0.12, pos=(x, 1.9, 0.75), rot=(0, 0, math.pi / 2), scale=(2.2, 0.9, 0.5), color=[0xd9a05b, 0x8fb3c9][i], sub=1, smooth=False))
    paper_lantern(a, 0.6, 2.45, 0.75, 0xffd27a)
    a.add(box((0.7, 0.5, 0.5), pos=(1.95, 0, 0.3), color=0x7aa6e8, bevel=0.04))
    a.anchor("npc", (0, 0, -1.4))
    return a

@prop("tackle_shack", collider=[("box", 0, 0, 0, 3.8, 4, 3.2)], ao=1.4)
def _():
    a = Asset("tackle_shack")
    w, d, h = 3.6, 3.0, 2.6
    stone_base(a, w, d, 0.3, seed=5)
    rng = random.Random(6)
    rows = 10
    for i in range(rows):
        y = 0.3 + i * h / rows
        c = jitter(hexrgb(0x6f9fc0 if i % 2 == 0 else 0x5f8fb0), rng, 0.06)
        a.add(box((w, h / rows + 0.02, d), pos=(0, y, 0), color=c, bevel=0.015, var=0.02, seed=i))
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2):
            a.add(box((0.16, h + 0.1, 0.16), pos=(x, 0.3, z), color=0xf0f0f0, bevel=0.02))
    door(a, -0.7, 0.3, d / 2, w=0.9, color=0xe8b84a, seed=8)
    window(a, 0.8, 1.35, d / 2, w=0.8, h=0.7, shutter=0xe8463a, flowers=False, seed=9)
    # shed roof sloping back
    a.add(box((w + 0.8, 0.12, d + 0.9), pos=(0, 0.3 + h + 0.35, 0.1), rot=(-0.22, 0, 0), color=0xe8463a, bevel=0.04, base=False))
    for i in range(5):
        a.add(box((w + 0.82, 0.05, 0.08), pos=(0, 0.3 + h + 0.43 - i * 0.2 * math.tan(0.22) * 1.0 + (i - 2) * -0.0, 0.1 + (i - 2) * 0.42), rot=(-0.22, 0, 0), color=0xc23a2e, bevel=0, base=False))
    # sign with a big fish
    a.add(box((2.2, 0.6, 0.08), pos=(0, 3.0, d / 2 + 0.25), color=WOOD_L, bevel=0.03))
    a.add(sphere(0.2, pos=(-0.1, 3.3, d / 2 + 0.32), scale=(2.4, 0.9, 0.35), color=0xe8b84a, sub=1, smooth=False))
    a.add(prism([(0.0, -0.18), (0.0, 0.18), (0.3, 0.0)], 0.06, pos=(0.38, 3.3, d / 2 + 0.3), rot=(math.pi / 2, 0, math.pi), color=0xe8b84a))
    # leaning rods + barrel of bait
    cols = [0xd9a05b, 0x5aa6e8, 0x7ac77a]
    for i in range(3):
        x = 1.25 + i * 0.18
        a.add(tube([(x, 0.3, d / 2 + 0.45), (x - 0.1, 2.6, d / 2 + 0.08)], 0.025, color=cols[i], n=5, r_end=0.01))
    lantern(a, -1.45, 2.2, d / 2 + 0.25, size=0.8)
    a.add(box((0.14, 0.14, 0.4), pos=(-1.45, 2.65, d / 2 + 0.08), color=WOOD_D, bevel=0.02, base=False))
    a.anchor("npc", (0.6, 0, d / 2 + 1.3))
    return a

@prop("captain_booth", collider=[("box", 0, 0, 0, 2.4, 3, 2.0)], ao=1.0)
def _():
    a = Asset("captain_booth")
    w, d = 2.2, 1.8
    a.add(box((w, 1.0, d), color=0xfff1d6, bevel=0.04))
    for i in range(5):
        a.add(box((w + 0.02, 0.1, d + 0.02), pos=(0, 0.1 + i * 0.2, 0), color=0x3a6fb0 if i % 2 == 0 else 0xfff1d6, bevel=0.01, var=0.02))
    a.add(box((w + 0.1, 0.08, d + 0.1), pos=(0, 1.0, 0), color=WOOD_D, bevel=0.02))
    for x in (-w / 2 + 0.08, w / 2 - 0.08):
        for z in (-d / 2 + 0.08, d / 2 - 0.08):
            a.add(box((0.1, 1.4, 0.1), pos=(x, 1.0, z), color=0xfff1d6, bevel=0.02))
    a.add(cyl(1.55, 0.7, pos=(0, 2.4, 0), r2=0.1, n=4, rot=(0, math.pi / 4, 0), color=0x3a6fb0, bevel=0.03))
    a.add(sphere(0.12, pos=(0, 3.15, 0), color=GOLD, sub=1))
    # life ring + bell
    a.add(lathe([(0.2, -0.05), (0.28, 0), (0.2, 0.05), (0.12, 0)], pos=(0, 0.55, d / 2 + 0.06), rot=(math.pi / 2, 0, 0), color=0xffffff, n=12, smooth=True))
    for k in range(4):
        ang = k / 4 * math.tau + 0.4
        a.add(box((0.1, 0.1, 0.06), pos=(math.cos(ang) * 0.2, 0.55 + math.sin(ang) * 0.2, d / 2 + 0.1), color=0xe8463a, bevel=0.01, base=False))
    a.add(lathe([(0.14, 1.75), (0.12, 1.85), (0.07, 2.0), (0, 2.02)], pos=(w / 2 - 0.1, 0, d / 2 - 0.1), color=GOLD, n=8, smooth=True))
    lantern(a, -w / 2 + 0.1, 1.95, d / 2 - 0.1, size=0.6)
    a.anchor("npc", (0, 0, d / 2 + 1.0))
    return a

@prop("tourney_stage", collider=[("box", 0, 0, 0, 7, 0.6, 4.2)], ao=1.2)
def _():
    a = Asset("tourney_stage")
    w, d = 7.0, 4.0
    a.add(box((w, 0.55, d), color=WOOD_D, bevel=0.05))
    planks(a, -w / 2, w / 2, -d / 2, d / 2, 0.62, along="z", width=0.35, seed=7, color=WOOD_L)
    for i in range(3):
        a.add(box((1.4, 0.18, 0.4), pos=(0, 0.0 + i * 0.0, d / 2 + 0.2 + i * 0.0), color=WOOD, bevel=0.03))
    # podium
    for x, h, c in ((0, 1.0, GOLD), (-1.4, 0.7, 0xc9d1dc), (1.4, 0.5, 0xd08a4a)):
        a.add(box((1.3, h, 1.2), pos=(x, 0.62, -0.6), color=c, bevel=0.05))
    # banners
    for x in (-w / 2 + 0.3, w / 2 - 0.3):
        a.add(cyl(0.08, 4.5, pos=(x, 0.6, -d / 2 + 0.3), color=WOOD, n=7, bevel=0.02))
        a.add(sphere(0.15, pos=(x, 5.1, -d / 2 + 0.3), color=GOLD, sub=1))
        a.add(box((0.05, 1.8, 1.0), pos=(x + (0.08 if x > 0 else -0.08), 2.9, -d / 2 + 0.85), color=0xe8463a if x < 0 else 0x3a6fb0, bevel=0.01))
        a.add(prism([(-0.5, 0), (0.5, 0), (0, -0.4)], 0.05, pos=(x + (0.055 if x > 0 else -0.105), 2.9, -d / 2 + 0.85), rot=(0, math.pi / 2, math.pi / 2), color=0xe8463a if x < 0 else 0x3a6fb0))
    # arch with trophy
    a.add(box((w - 0.6, 0.3, 0.3), pos=(0, 4.2, -d / 2 + 0.3), color=WOOD, bevel=0.04))
    a.add(lathe([(0.0, 4.5), (0.25, 4.55), (0.1, 4.7), (0.08, 4.95), (0.35, 5.15), (0.4, 5.55), (0.0, 5.5)], color=GOLD, n=12, smooth=True))
    for i in range(7):
        paper_lantern(a, -2.7 + i * 0.9, 4.2, -d / 2 + 0.3, [0xffd27a, 0xff9a5a, 0xff7eb6][i % 3], seed=i)
    a.anchor("first", (0, 1.62, -0.6))
    a.anchor("second", (-1.4, 1.32, -0.6))
    a.anchor("third", (1.4, 1.12, -0.6))
    return a

@prop("notice_board", collider=[("box", 0, 0, 0, 2.6, 2.6, 0.4)], ao=0.8)
def _():
    a = Asset("notice_board")
    for x in (-1.2, 1.2):
        a.add(box((0.16, 2.6, 0.16), pos=(x, 0, 0), color=WOOD_D, bevel=0.03))
    a.add(box((2.5, 1.5, 0.12), pos=(0, 0.9, 0), color=WOOD_L, bevel=0.04))
    a.add(box((2.7, 0.14, 0.24), pos=(0, 2.45, 0), color=0xc0503a, bevel=0.03))
    rng = random.Random(3)
    for i in range(5):
        a.add(box((rng.uniform(0.4, 0.6), rng.uniform(0.4, 0.55), 0.02), pos=(-0.9 + i * 0.45, 1.05 + rng.uniform(0, 0.6), 0.075), rot=(0, 0, rng.uniform(-0.12, 0.12)), color=[0xfff6dd, 0xffe9a8, 0xdff3ff][i % 3], bevel=0))
    return a

@prop("aquarium", collider=[("box", 0, 0, 0, 1.8, 1.9, 0.9)], ao=0.6)
def _():
    a = Asset("aquarium")
    w, d = 1.7, 0.8
    a.add(box((w, 0.8, d), color=WOOD_D, bevel=0.04))
    for x in (-0.42, 0.42):
        a.add(box((0.7, 0.6, 0.03), pos=(x, 0.1, d / 2), color=WOOD, bevel=0.015))
        a.add(sphere(0.03, pos=(x + (0.25 if x < 0 else -0.25), 0.4, d / 2 + 0.03), color=GOLD, sub=1))
    a.add(box((w - 0.1, 0.12, d - 0.1), pos=(0, 0.8, 0), color=0xd8c69a, bevel=0.02))
    rng = random.Random(4)
    for i in range(10):
        a.add(sphere(0.06, pos=(rng.uniform(-0.7, 0.7), 0.92, rng.uniform(-0.3, 0.3)), color=[0xb9a27a, 0x8f9aa5, 0xe0d0b0][i % 3], sub=1, smooth=False, seed=i))
    for i in range(3):
        a.add(blade((-0.55 + i * 0.5, 0.9, -0.15), 0.55, 0.08, lean=(rng.uniform(-0.1, 0.1), 0), color=0x3f9a5a, tip=0x8fd07a, seed=20 + i))
    a.add(box((w, 0.92, d), pos=(0, 0.92, 0), color=0x9fdcff, kind=KIND_GLASS, bevel=0.0, var=0))
    a.add(box((w + 0.08, 0.08, d + 0.08), pos=(0, 1.84, 0), color=WOOD_D, bevel=0.02))
    a.add(box((w + 0.08, 0.06, d + 0.08), pos=(0, 0.86, 0), color=WOOD_D, bevel=0.02))
    for x in (-w / 2, w / 2):
        for z in (-d / 2, d / 2):
            a.add(box((0.06, 0.95, 0.06), pos=(x, 0.88, z), color=WOOD_D, bevel=0.01))
    a.anchor("tank", (0, 1.38, 0))
    return a

@prop("home_plot", ao=0.8)
def _():
    """A 5 x 5 m home dock on the water (deck top DECK) with railings, lantern, bench and an aquarium spot.
    The open side (z = -2.5) joins the boardwalk; the name board stands there."""
    a = Asset("home_plot")
    planks(a, -2.5, 2.5, -2.5, 2.5, DECK, along="x", width=0.32, seed=11)
    for x in (-2.3, 2.3):
        for z in (-2.3, 0, 2.3):
            post(a, x, z, -1.4, DECK + 0.95, r=0.12, seed=int(x * 10 + z), rope=None)
    for x in (-2.3, 2.3):
        a.add(box((0.1, 0.1, 4.7), pos=(x, DECK + 0.85, 0), color=WOOD_L, bevel=0.02))
        a.add(box((0.06, 0.06, 4.7), pos=(x, DECK + 0.45, 0), color=WOOD_L, bevel=0.01))
    a.add(box((4.7, 0.1, 0.1), pos=(0, DECK + 0.85, 2.3), color=WOOD_L, bevel=0.02))
    a.add(box((4.7, 0.06, 0.06), pos=(0, DECK + 0.45, 2.3), color=WOOD_L, bevel=0.01))
    # name board on two posts at the entrance
    for x in (-1.0, 1.0):
        a.add(box((0.12, 2.3, 0.12), pos=(x, DECK, -2.45), color=WOOD_D, bevel=0.02))
    a.add(box((2.3, 0.6, 0.1), pos=(0, DECK + 1.65, -2.45), color=WOOD_L, bevel=0.03))
    a.add(box((2.5, 0.1, 0.2), pos=(0, DECK + 2.28, -2.45), color=0xc0503a, bevel=0.02))
    lantern(a, 1.0, DECK + 2.3, -2.45, size=0.7)
    a.anchor("board", (0, DECK + 1.95, -2.38))
    a.anchor("tank", (0, DECK, 0.9))
    a.anchor("stand", (0, DECK, -1.0))
    return a

@prop("boardwalk_4", ao=0.6)
def _():
    """A 4 m (x) by 4 m (z) boardwalk section on the water, deck top DECK."""
    a = Asset("boardwalk_4")
    planks(a, -2.0, 2.0, -2.0, 2.0, DECK, along="z", width=0.3, seed=21)
    for x in (-1.85, 1.85):
        for z in (-1.85, 1.85):
            post(a, x, z, -1.4, DECK + 0.2, r=0.14, seed=int(x * 10 + z) + 5, rope=None)
    return a

# ───────────────────────── zone buildings ─────────────────────────
@prop("mill_house", collider=[("box", 0, 0, 0, 5.4, 7, 4.6)], ao=1.6)
def _():
    a = cottage("mill_house", 5.0, 4.2, 3.4, 0x8a5a33, 0x7ac77a, wall=0xe9dcc0, seed=400, porch=False)
    a.add(cyl(0.18, 1.2, pos=(2.5, 2.2, 0), rot=(0, 0, -math.pi / 2), color=IRON, n=8, bevel=0))
    a.anchor("wheel", (3.25, 2.2, 0))
    return a

@prop("mill_wheel", ao=0.5)
def _():
    """A water wheel turning about X, centred on the origin, radius 2."""
    a = Asset("mill_wheel")
    for s in (-0.38, 0.38):
        ring = [(s, math.sin(k / 24 * math.tau) * 1.9, math.cos(k / 24 * math.tau) * 1.9) for k in range(25)]
        a.add(tube(ring, 0.07, color=WOOD, n=5, smooth=False, cap=False))
        ring2 = [(s, math.sin(k / 24 * math.tau) * 0.9, math.cos(k / 24 * math.tau) * 0.9) for k in range(25)]
        a.add(tube(ring2, 0.05, color=WOOD_D, n=5, smooth=False, cap=False))
        for k in range(8):
            a0 = k / 8 * math.tau
            a.add(tube([(s, 0, 0), (s, math.sin(a0) * 1.9, math.cos(a0) * 1.9)], 0.05, color=WOOD_D, n=5, smooth=False))
    for k in range(16):
        a0 = k / 16 * math.tau
        a.add(box((0.9, 0.55, 0.06), pos=(0, math.sin(a0) * 1.95, math.cos(a0) * 1.95), rot=(math.pi / 2 - a0, 0, 0), color=WOOD_L, bevel=0.015, base=False, seed=30 + k))
    a.add(cyl(0.25, 1.0, pos=(-0.5, 0, 0), rot=(0, 0, -math.pi / 2), color=IRON, n=8, bevel=0.02))
    return a

@prop("stone_bridge", ao=1.0)
def _():
    """An arched stone footbridge spanning 8 m along X; ends at y = DECK."""
    a = Asset("stone_bridge")
    rng = random.Random(8)
    n = 12
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        x0, x1 = -4 + 8 * t0, -4 + 8 * t1
        y0 = DECK + math.sin(math.pi * t0) * 1.0
        y1 = DECK + math.sin(math.pi * t1) * 1.0
        ang = math.atan2(y1 - y0, x1 - x0)
        a.add(box((8 / n + 0.05, 0.45, 2.4), pos=((x0 + x1) / 2, (y0 + y1) / 2 - 0.3, 0), rot=(0, 0, ang), color=jitter(hexrgb(STONE), rng, 0.1), bevel=0.04, base=False, seed=i))
        for z in (-1.15, 1.15):
            a.add(box((8 / n + 0.02, 0.6, 0.25), pos=((x0 + x1) / 2, (y0 + y1) / 2 + 0.25, z), rot=(0, 0, ang), color=jitter(hexrgb(STONE_D), rng, 0.1), bevel=0.04, base=False, seed=50 + i))
    for x in (-3.0, 3.0):
        for z in (-1.1, 1.1):
            a.add(box((0.6, 3.0, 0.6), pos=(x, -2.0, z), color=STONE_D, bevel=0.05))
    for x in (-3.8, 3.8):
        for z in (-1.15, 1.15):
            a.add(stone := box((0.35, 1.0, 0.35), pos=(x, DECK, z), color=STONE, bevel=0.04))
            lantern(a, x, DECK + 1.0, z, size=0.7)
    return a

@prop("beach_hut", collider=[("box", 0, 0, 0, 4.4, 5, 4.4)], ao=1.4)
def _():
    a = Asset("beach_hut")
    w = 3.6
    for x in (-w / 2, w / 2):
        for z in (-w / 2, w / 2):
            a.add(cyl(0.12, 1.2, pos=(x, 0, z), color=0x8a6a3c, n=6, bevel=0))
    a.add(box((w + 0.6, 0.15, w + 0.6), pos=(0, 1.1, 0), color=0xc9a06a, bevel=0.03))
    rng = random.Random(2)
    for i in range(14):
        x = -w / 2 + w / 13 * i
        a.add(cyl(0.11, 2.2, pos=(x, 1.25, -w / 2), color=jitter(hexrgb(0xb08850), rng, 0.08), n=6, bevel=0))
    for z in (-w / 2, w / 2):
        pass
    for side in (-1, 1):
        for i in range(12):
            z = -w / 2 + w / 11 * i
            a.add(cyl(0.11, 2.2, pos=(side * w / 2, 1.25, z), color=jitter(hexrgb(0xb08850), rng, 0.08), n=6, bevel=0))
    for i in range(14):
        x = -w / 2 + w / 13 * i
        if abs(x) < 0.6:
            continue
        a.add(cyl(0.11, 2.2, pos=(x, 1.25, w / 2), color=jitter(hexrgb(0xb08850), rng, 0.08), n=6, bevel=0))
    # thatch roof: stacked cones
    for k, (r, y) in enumerate(((3.6, 3.4), (2.6, 4.2), (1.4, 4.9))):
        a.add(cyl(r, 1.1, pos=(0, y, 0), r2=r * 0.35, n=10, color=[0xd9b46a, 0xcfa85c, 0xe0bd74][k], bevel=0.02, seed=k))
    a.add(cyl(0.1, 0.6, pos=(0, 5.9, 0), color=0x8a6a3c, n=5, bevel=0))
    a.add(box((1.0, 0.12, 1.4), pos=(0, 0.0, w / 2 + 1.2), rot=(0.55, 0, 0), color=0xc9a06a, bevel=0.03, base=False))
    torch = PROPS["torch_tiki"]["fn"]
    return a

@prop("lifeguard_tower", collider=[("box", 0, 0, 0, 2.4, 4, 2.4)], ao=1.0)
def _():
    a = Asset("lifeguard_tower")
    for x in (-0.9, 0.9):
        for z in (-0.9, 0.9):
            a.add(box((0.14, 2.4, 0.14), pos=(x, 0, z), rot=(x * -0.05, 0, z * 0.05), color=0xffffff, bevel=0.02))
    a.add(box((2.2, 0.15, 2.2), pos=(0, 2.3, 0), color=0xc9a06a, bevel=0.03))
    a.add(box((2.0, 1.2, 1.8), pos=(0, 2.45, -0.1), color=0xe8463a, bevel=0.03))
    a.add(box((1.4, 0.7, 0.05), pos=(0, 2.85, 0.81), color=0x9fdcff, kind=KIND_GLASS, bevel=0))
    a.add(box((2.4, 0.12, 2.4), pos=(0, 3.65, 0), rot=(0.1, 0, 0), color=0xffffff, bevel=0.03))
    for i in range(6):
        a.add(box((0.6, 0.06, 0.2), pos=(0, 0.35 * i, 1.3 + 0.18 * i * 0), rot=(0, 0, 0), color=0xffffff, bevel=0.01))
    a.add(box((0.08, 2.3, 0.08), pos=(-0.3, 0, 1.3), color=0xffffff, bevel=0.01))
    a.add(box((0.08, 2.3, 0.08), pos=(0.3, 0, 1.3), color=0xffffff, bevel=0.01))
    return a

@prop("igloo", collider=[("cyl", 0, 0, 2.0, 2.2)], ao=1.2)
def _():
    a = Asset("igloo")
    rng = random.Random(3)
    rows = 6
    for r in range(rows):
        e0 = r / rows * math.pi / 2
        e1 = (r + 1) / rows * math.pi / 2
        n = max(4, int(16 * math.cos(e0)))
        for k in range(n):
            ang = (k + (r % 2) * 0.5) / n * math.tau
            if r < 2 and abs(math.sin(ang) - 1) < 0.15:
                continue
            em = (e0 + e1) / 2
            R = 2.0
            pos = (math.cos(ang) * R * math.cos(em), R * math.sin(em) - 0.15, math.sin(ang) * R * math.cos(em))
            a.add(box((R * math.tau * math.cos(em) / n - 0.05, R * (e1 - e0) - 0.05, 0.35), pos=pos, rot=(em, -ang - math.pi / 2, 0), color=jitter(hexrgb(0xeaf3ff), rng, 0.04), bevel=0.05, base=False, seed=r * 50 + k))
    a.add(sphere(0.3, pos=(0, 2.0, 0), scale=(1, 0.4, 1), color=0xeaf3ff, sub=2))
    # entrance tunnel
    for k in range(5):
        ang = k / 4 * math.pi
        a.add(box((0.5, 0.42, 1.2), pos=(math.cos(ang) * 0.8, math.sin(ang) * 0.8, 2.2), rot=(0, 0, ang - math.pi / 2), color=0xdfeaf8, bevel=0.05, base=False, seed=200 + k))
    a.add(box((1.1, 0.9, 0.05), pos=(0, 0, 2.0), color=0x2a3b52, bevel=0))
    a.add(box((0.5, 0.5, 0.05), pos=(0, 1.4, 1.98), color=0xffd27a, kind=KIND_GLOW, bevel=0))
    return a

@prop("ice_hut", collider=[("box", 0, 0, 0, 3.0, 3.6, 2.8)], ao=1.2)
def _():
    a = Asset("ice_hut")
    w, d, h = 2.8, 2.4, 2.2
    a.add(box((w + 0.4, 0.2, d + 0.4), color=0x8a6a3c, bevel=0.03))
    for side in (-1, 1):
        a.add(box((0.12, 0.12, d + 0.8), pos=(side * (w / 2 + 0.1), 0.0, 0), color=0x5a3d28, bevel=0.03))
    a.add(box((w, h, d), pos=(0, 0.2, 0), color=0xc0392e, bevel=0.04))
    for i in range(7):
        a.add(box((w + 0.02, 0.04, d + 0.02), pos=(0, 0.45 + i * 0.3, 0), color=0xa52f26, bevel=0, var=0.02))
    door(a, -0.5, 0.2, d / 2, w=0.8, h=1.8, color=0xfff1d6, seed=3)
    window(a, 0.7, 1.2, d / 2, w=0.6, h=0.6, shutter=0xfff1d6, flowers=False, seed=4)
    rise = gable_roof(a, w, d, 0.2 + h, pitch=0.8, over=0.3, color=0x5a5f6a, rows=4, seed=5)
    paint_up(Part(a.bm), 0xffffff, 0.8)
    a.add(box((0.3, 0.9, 0.3), pos=(0.8, 2.4, -0.4), color=IRON, bevel=0.02))
    a.add(cyl(0.2, 0.15, pos=(0.8, 3.3, -0.4), r2=0.25, color=IRON, n=8, bevel=0))
    a.add(box((0.5, 0.06, 0.6), pos=(-1.0, 0.0, d / 2 + 0.7), color=0x6f9fc0, bevel=0.01))
    return a

@prop("forge_hut", collider=[("box", 0, 0, 0, 4.2, 4, 3.6)], ao=1.4)
def _():
    a = Asset("forge_hut")
    w, d, h = 4.0, 3.4, 2.6
    stone_base(a, w, d, 0.5, color=0x4a4446, seed=7)
    rng = random.Random(8)
    for i in range(int(w / 0.5)):
        for j in range(5):
            x = -w / 2 + 0.25 + i * 0.5 + (0.25 if j % 2 else 0)
            if x > w / 2 - 0.2:
                continue
            a.add(box((0.48, h / 5 - 0.03, 0.12), pos=(x, 0.5 + j * h / 5, d / 2), color=jitter(hexrgb(0x5a5254), rng, 0.12), bevel=0.03, seed=i * 5 + j))
    a.add(box((w, h, d), pos=(0, 0.5, 0), color=0x4f4749, bevel=0.03))
    door(a, -0.9, 0.5, d / 2 + 0.06, w=1.0, color=0x3a2a20, seed=9)
    # glowing furnace mouth
    a.add(box((1.0, 0.8, 0.1), pos=(0.8, 0.8, d / 2 + 0.08), color=0xff7a2a, kind=KIND_GLOW, bevel=0))
    a.add(box((1.3, 0.15, 0.2), pos=(0.8, 1.6, d / 2 + 0.1), color=0x2e2724, bevel=0.03))
    rise = gable_roof(a, w, d, 0.5 + h, pitch=0.6, over=0.35, color=0x2e2724, rows=5, seed=10)
    a.add(cyl(0.35, 2.8, pos=(1.2, 2.0, -0.6), r2=0.3, color=0x5a5254, n=8, bevel=0.03))
    a.add(cyl(0.3, 0.1, pos=(1.2, 4.8, -0.6), color=0xff7a2a, kind=KIND_GLOW, n=8, bevel=0))
    a.add(box((0.7, 0.6, 0.45), pos=(-1.7, 0.5, d / 2 + 0.8), color=0x3a3a40, bevel=0.03))
    a.add(box((0.9, 0.2, 0.45), pos=(-1.7, 1.1, d / 2 + 0.8), color=0x55555c, bevel=0.03))
    a.anchor("light0", (0.8, 1.2, d / 2 + 0.4))
    return a

@prop("moon_shrine", collider=[("box", -2.0, 0, 0, 0.6, 4, 0.6), ("box", 2.0, 0, 0, 0.6, 4, 0.6)], ao=1.2)
def _():
    a = Asset("moon_shrine")
    a.add(cyl(2.8, 0.3, color=0x6e6f8f, n=12, bevel=0.05))
    a.add(cyl(2.3, 0.3, pos=(0, 0.3, 0), color=0x7d7ea0, n=12, bevel=0.05))
    for x in (-2.0, 2.0):
        a.add(cyl(0.3, 3.6, pos=(x, 0.6, 0), color=0x8b8db0, n=8, bevel=0.03))
        a.add(box((0.8, 0.25, 0.8), pos=(x, 0.6, 0), color=0x6e6f8f, bevel=0.04))
        a.add(box((0.8, 0.25, 0.8), pos=(x, 4.1, 0), color=0x6e6f8f, bevel=0.04))
    a.add(box((5.4, 0.35, 0.9), pos=(0, 4.35, 0), color=0x5b5c7d, bevel=0.06))
    a.add(box((4.6, 0.2, 0.6), pos=(0, 4.0, 0), color=0x6e6f8f, bevel=0.04))
    # crescent moon (glow) hanging in the arch
    bm = bmesh.new()
    n = 14
    outer = [(math.cos(-1.2 + 2.4 * i / n) * 0.9, math.sin(-1.2 + 2.4 * i / n) * 0.9) for i in range(n + 1)]
    inner = [(0.35 + math.cos(-1.0 + 2.0 * i / n) * 0.62, math.sin(-1.0 + 2.0 * i / n) * 0.72) for i in range(n + 1)]
    pts = outer + list(reversed(inner))
    a.add(prism([(p[0], p[1]) for p in pts], 0.12, pos=(-0.2, 2.6, 0.06), rot=(math.pi / 2, 0, 0), color=0xe9f0ff, kind=KIND_GLOW, var=0))
    a.add(tube([(0.1, 3.95, 0), (0.1, 3.45, 0)], 0.015, color=0xc0c4e0, n=4))
    for i in range(6):
        ang = i / 6 * math.tau
        a.add(sphere(0.12, pos=(math.cos(ang) * 2.5, 0.35, math.sin(ang) * 2.5), color=0x9ff0ff, kind=KIND_GLOW, sub=1))
    a.anchor("light0", (0, 2.6, 0))
    return a

@prop("basalt_columns", collider=[("cyl", 0, 0, 1.2, 3)], ao=1.0)
def _():
    a = Asset("basalt_columns")
    rng = random.Random(4)
    for i in range(9):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.9) if i else 0
        h = rng.uniform(0.8, 3.2)
        c = cyl(0.42, h, pos=(math.cos(ang) * rr, 0, math.sin(ang) * rr), color=0x3a3436, n=6, bevel=0.04, seed=i, var=0.1)
        paint_up(c, 0x5a5254, 0.8)
        a.add(c)
    return a

@prop("steam_vent", ao=0.4)
def _():
    a = Asset("steam_vent")
    for i in range(7):
        ang = i / 7 * math.tau
        a.add(rock(0.3, pos=(math.cos(ang) * 0.55, 0, math.sin(ang) * 0.55), color=0x3a3436, seed=i, sub=1))
    a.add(cyl(0.45, 0.05, pos=(0, 0.02, 0), color=0xff7a2a, kind=KIND_GLOW, n=10, bevel=0))
    a.anchor("steam", (0, 0.1, 0))
    return a

@prop("gift_box", ao=0.3)
def _():
    a = Asset("gift_box")
    a.add(box((0.6, 0.45, 0.6), color=0x3fb3ff, bevel=0.03))
    a.add(box((0.68, 0.15, 0.68), pos=(0, 0.45, 0), color=0x2f93df, bevel=0.03))
    a.add(box((0.14, 0.62, 0.62), pos=(0, 0.0, 0), color=0xffd34d, bevel=0.01))
    a.add(box((0.62, 0.62, 0.14), pos=(0, 0.0, 0), color=0xffd34d, bevel=0.01))
    for s in (-1, 1):
        a.add(sphere(0.14, pos=(s * 0.13, 0.66, 0), rot=(0, 0, s * 0.6), scale=(1.2, 0.6, 0.5), color=0xffd34d, sub=1))
    return a

@prop("bridge_wood", ao=0.6)
def _():
    """A flat plank footbridge 8 m along X, 3 m wide, deck top at DECK."""
    a = Asset("bridge_wood")
    planks(a, -4.0, 4.0, -1.5, 1.5, DECK, along="z", width=0.3, seed=31, color=WOOD_L)
    for z in (-1.4, 1.4):
        a.add(box((8.0, 0.25, 0.18), pos=(0, DECK - 0.36, z), color=WOOD_D, bevel=0.03))
        for x in (-3.8, -1.9, 0, 1.9, 3.8):
            a.add(box((0.14, 1.0, 0.14), pos=(x, DECK, z), color=WOOD, bevel=0.02))
        a.add(box((8.0, 0.1, 0.12), pos=(0, DECK + 0.95, z), color=WOOD_L, bevel=0.02))
    for x in (-3.0, 3.0):
        for z in (-1.4, 1.4):
            post(a, x, z, -1.4, DECK - 0.3, r=0.14, seed=int(x * 3 + z))
    lantern(a, 3.8, DECK + 1.0, 1.4, size=0.6)
    lantern(a, -3.8, DECK + 1.0, -1.4, size=0.6)
    return a

@prop("plaza_disc", ao=0.0)
def _():
    """Stone plaza tiles, a 9 m radius disc, top 0.03 above the ground."""
    a = Asset("plaza_disc")
    rng = random.Random(12)
    rings = 6
    for r in range(rings):
        r0, r1 = 1.5 * r, 1.5 * (r + 1)
        n = max(6, int(6 * (r + 1)))
        for k in range(n):
            a0, a1 = k / n * math.tau + 0.02, (k + 1) / n * math.tau - 0.02
            pts = [(math.cos(a0) * (r0 + 0.05), math.sin(a0) * (r0 + 0.05)), (math.cos(a0) * (r1 - 0.05), math.sin(a0) * (r1 - 0.05)), (math.cos(a1) * (r1 - 0.05), math.sin(a1) * (r1 - 0.05)), (math.cos(a1) * (r0 + 0.05), math.sin(a1) * (r0 + 0.05))]
            if r == 0:
                pts = [(0, 0)] + pts[1:3]
            a.add(prism(pts, 0.05, pos=(0, -0.02, 0), color=jitter(hexrgb(0xc9c2b2), rng, 0.08), seed=r * 100 + k))
    for k in range(8):
        ang = k / 8 * math.tau
        a.add(prism([(math.cos(ang + d) * 1.3, math.sin(ang + d) * 1.3) for d in (-0.12, 0.12)] + [(0, 0)], 0.06, pos=(0, -0.01, 0), color=0xe8b84a))
    return a

@prop("fountain", collider=[("cyl", 0, 0, 2.9, 1.2)], ao=0.9)
def _():
    """A round stone basin with a leaping golden fish spouting water. Radius 3 m."""
    a = Asset("fountain")
    rng = random.Random(41)
    n = 18
    for k in range(n):
        ang = k / n * math.tau
        a.add(box((1.12, 0.62, 0.42), pos=(math.cos(ang) * 2.75, 0, math.sin(ang) * 2.75), rot=(0, -ang + math.pi / 2, 0), color=jitter(hexrgb(STONE), rng, 0.08), bevel=0.06, seed=k))
        a.add(box((1.2, 0.12, 0.55), pos=(math.cos(ang) * 2.75, 0.62, math.sin(ang) * 2.75), rot=(0, -ang + math.pi / 2, 0), color=jitter(hexrgb(0xc9c2b2), rng, 0.06), bevel=0.04, seed=50 + k))
    a.add(cyl(2.6, 0.08, pos=(0, 0.42, 0), color=0x5ab8d8, kind=KIND_WATER, n=18, bevel=0))
    a.add(cyl(0.9, 0.9, pos=(0, 0.3, 0), r2=0.7, color=STONE, n=10, bevel=0.06))
    a.add(cyl(1.2, 0.18, pos=(0, 1.15, 0), r2=1.25, color=0xc9c2b2, n=12, bevel=0.04))
    a.add(cyl(1.1, 0.06, pos=(0, 1.3, 0), color=0x5ab8d8, kind=KIND_WATER, n=12, bevel=0))
    a.add(cyl(0.25, 0.9, pos=(0, 1.3, 0), color=STONE_D, n=8, bevel=0.03))
    # leaping golden fish
    body = [(0.0, 2.05, 0.0), (0.25, 2.35, 0.0), (0.45, 2.75, 0.0), (0.42, 3.15, 0.0), (0.2, 3.45, 0.0)]
    a.add(tube(body, 0.26, color=GOLD, n=10, r_end=0.12, smooth=True))
    a.add(fin_like := quad([(0.0, 2.05, 0.0), (-0.45, 1.75, 0.0), (-0.1, 2.3, 0.0)], color=0xffc23a))
    a.add(quad([(0.0, 2.05, 0.0), (0.0, 1.65, 0.0), (0.35, 1.95, 0.0)], color=0xffc23a))
    a.add(quad([(0.45, 2.75, 0.0), (0.85, 2.8, 0.0), (0.45, 3.0, 0.0)], color=0xffc23a))
    for s in (-1, 1):
        a.add(sphere(0.06, pos=(0.32, 3.3, s * 0.11), color=0x1a1a22, sub=1))
    # water arcs (glow-ish blue droplets)
    for k in range(6):
        ang = k / 6 * math.tau
        pts = [(0.2 + math.cos(ang) * 0.05, 3.5, math.sin(ang) * 0.05), (math.cos(ang) * 0.7, 3.7, math.sin(ang) * 0.7), (math.cos(ang) * 1.05, 2.4, math.sin(ang) * 1.05)]
        a.add(tube(pts, 0.045, color=0xbfeeff, kind=KIND_GLOW, n=5, r_end=0.03))
    a.anchor("splash", (0, 1.35, 0))
    return a
