"""Rods, skins, bobber, boats, crown. Rod item frame (GAME): origin at the grip, the rod points -Z,
+Y up; the tip is at (0, 0, -ROD_LEN). Boats: water line y = 0, bow toward -Z."""
from lib import *

ROD_LEN = 1.9
ITEMS = {}
def item(name):
    def deco(fn):
        ITEMS[name] = fn
        return fn
    return deco

def rod(name, blank, grip=0x8a5a33, reel=0x9a9ea8, accent=0xe8b84a, bands=None, tip=None, tipglow=None, segments=False, extra=None, thick=1.0):
    thick *= 1.4
    a = Asset(name)
    # butt + grip (cork) behind the hand
    a.add(cyl(0.032 * thick, 0.34, pos=(0, 0, 0.3), rot=(-math.pi / 2, 0, 0), r2=0.028 * thick, color=grip, n=8, bevel=0.01))
    a.add(cyl(0.036 * thick, 0.05, pos=(0, 0, 0.33), rot=(-math.pi / 2, 0, 0), color=accent, n=8, bevel=0.01))
    a.add(cyl(0.03 * thick, 0.03, pos=(0, 0, -0.04), rot=(-math.pi / 2, 0, 0), color=accent, n=8, bevel=0.005))
    # blank tapering forward
    n = 6 if segments else 1
    for k in range(n):
        z0 = -0.06 - (ROD_LEN - 0.06) * k / n
        z1 = -0.06 - (ROD_LEN - 0.06) * (k + 1) / n
        r0 = (0.022 - 0.016 * k / n) * thick
        r1 = (0.022 - 0.016 * (k + 1) / n) * thick
        c = blank if not bands else bands[k % len(bands)]
        a.add(cyl(r0, z0 - z1, pos=(0, 0, z0), rot=(-math.pi / 2, 0, 0), r2=r1, color=c, n=7, bevel=0))
        if segments:
            a.add(cyl(r1 * 1.35, 0.02, pos=(0, 0, z1 + 0.01), rot=(-math.pi / 2, 0, 0), color=mix(hexrgb(c), (0, 0, 0), 0.25), n=7, bevel=0))
    if bands and not segments:
        for k in range(12):
            z = -0.15 - k * 0.14
            r = (0.022 - 0.016 * (0.15 + k * 0.14) / ROD_LEN) * thick
            a.add(cyl(r * 1.12, 0.07, pos=(0, 0, z), rot=(-math.pi / 2, 0, 0), color=bands[k % len(bands)], n=7, bevel=0))
    # reel under the grip
    a.add(box((0.02, 0.06, 0.03), pos=(0, -0.06, 0.06), color=reel, bevel=0.005))
    a.add(cyl(0.055, 0.045, pos=(-0.022, -0.1, 0.06), rot=(0, 0, math.pi / 2), color=reel, n=10, bevel=0.01))
    a.add(cyl(0.03, 0.05, pos=(-0.024, -0.1, 0.06), rot=(0, 0, math.pi / 2), color=accent, n=8, bevel=0))
    a.add(box((0.06, 0.012, 0.012), pos=(0.03, -0.1, 0.06), color=reel, bevel=0, base=False))
    a.add(sphere(0.014, pos=(0.06, -0.1, 0.06), color=0x2a2a2a, sub=1))
    # guides
    for k in range(5):
        z = -0.35 - k * 0.32
        r = (0.022 - 0.016 * (-z) / ROD_LEN) * thick
        pts = [(math.cos(t / 8 * math.tau) * 0.018, -r - 0.025 + math.sin(t / 8 * math.tau) * 0.018, z) for t in range(9)]
        a.add(tube(pts, 0.004, color=0xd0d4dc, n=3, cap=False))
    if tip:
        a.add(sphere(0.022, pos=(0, 0, -ROD_LEN), color=tip, sub=1, kind=KIND_GLOW if tipglow else KIND_TOON))
    if extra:
        extra(a)
    a.anchor("tip", (0, 0, -ROD_LEN))
    return a

def leaves(color=0x7ac77a):
    def f(a):
        for k, z in enumerate((-0.5, -0.9, -1.3)):
            a.add(leaf((0, 0.0, z), (1 if k % 2 else -1, 0.4), 0.12, 0.04, droop=0.2, color=color, seed=k))
    return f

def coral_bits():
    def f(a):
        for k, z in enumerate((-0.3, -0.7, -1.1)):
            a.add(sphere(0.03, pos=(0.02 * (1 if k % 2 else -1), 0.02, z), color=[0xff6f91, 0xffb347, 0x5fd1c0][k], sub=1))
    return f

def icicles():
    def f(a):
        for k in range(6):
            z = -0.3 - k * 0.25
            a.add(cyl(0.012, 0.06, pos=(0, -0.02, z), rot=(math.pi, 0, 0), r2=0.0, n=5, color=0xbfeeff, kind=KIND_GLOW, bevel=0))
    return f

def lava_cracks():
    def f(a):
        for k in range(8):
            z = -0.2 - k * 0.2
            a.add(box((0.006, 0.03, 0.08), pos=(0.018, 0.0, z), rot=(0, 0, 0.3 * (k % 2 * 2 - 1)), color=0xff7a2a, kind=KIND_GLOW, bevel=0, base=False))
    return f

def crescent_tip():
    def f(a):
        pts = [(math.cos(-1.4 + 2.8 * k / 8) * 0.07, math.sin(-1.4 + 2.8 * k / 8) * 0.07 + 0.0, -ROD_LEN - 0.02) for k in range(9)]
        a.add(tube(pts, 0.012, color=0xe9f0ff, n=4, kind=KIND_GLOW) if False else tube(pts, 0.012, color=0xe9f0ff, n=4))
    return f

def star_tip(color=0xffe27a):
    def f(a):
        pts = []
        for k in range(10):
            ang = math.pi / 2 + k / 10 * math.tau
            r = 0.09 if k % 2 == 0 else 0.04
            pts.append((math.cos(ang) * r, math.sin(ang) * r))
        a.add(prism(pts, 0.02, pos=(0, 0, -ROD_LEN - 0.08), rot=(math.pi / 2, 0, 0), color=color, kind=KIND_GLOW, var=0))
    return f

def dragon():
    def f(a):
        for k in range(10):
            z = -0.2 - k * 0.17
            a.add(cyl(0.012, 0.04, pos=(0, 0.02, z), rot=(-0.6, 0, 0), r2=0.0, n=4, color=0xffd34d, bevel=0))
        a.add(sphere(0.05, pos=(0, 0.01, -ROD_LEN + 0.02), scale=(0.8, 0.7, 1.3), color=0x2fa84a, sub=1))
        for s in (-1, 1):
            a.add(cyl(0.008, 0.06, pos=(s * 0.02, 0.04, -ROD_LEN + 0.06), rot=(-0.8, 0, s * 0.3), r2=0.0, n=4, color=0xfff0d0, bevel=0))
            a.add(sphere(0.01, pos=(s * 0.03, 0.03, -ROD_LEN - 0.01), color=0xff3a1a, kind=KIND_GLOW, sub=1))
    return f

def lantern_tip():
    def f(a):
        a.add(tube([(0, 0, -ROD_LEN), (0, -0.08, -ROD_LEN - 0.02)], 0.004, color=0x3a3a3a, n=3))
        a.add(box((0.05, 0.06, 0.05), pos=(0, -0.15, -ROD_LEN - 0.02), color=0xffd27a, kind=KIND_GLOW, bevel=0))
        a.add(cyl(0.04, 0.03, pos=(0, -0.09, -ROD_LEN - 0.02), r2=0.0, color=0xe8b84a, n=6, bevel=0))
    return f

RODS = {
    "rod_twig": lambda: rod("rod_twig", 0x8a6a3c, grip=0x6e4a2a, reel=0x8a8f98, accent=0x6e4a2a, thick=1.1, extra=leaves(0x6fae45)),
    "rod_bamboo": lambda: rod("rod_bamboo", 0xc9c46a, grip=0xd9b46a, accent=0x5a7a3a, segments=True, bands=[0xc9c46a, 0xb8b45a]),
    "rod_willow": lambda: rod("rod_willow", 0x9a7a4a, grip=0x6e4a2a, accent=0x7ac77a, extra=leaves()),
    "rod_oak": lambda: rod("rod_oak", 0x7a5233, grip=0x4a3020, accent=0xe8b84a, thick=1.2),
    "rod_carbon": lambda: rod("rod_carbon", 0x2a2a33, grip=0x1a1a22, reel=0xd83a2a, accent=0xd83a2a, bands=[0x2a2a33, 0x2a2a33, 0xd83a2a]),
    "rod_coral": lambda: rod("rod_coral", 0xff8aa8, grip=0xfff0e0, reel=0x5fd1c0, accent=0x5fd1c0, extra=coral_bits(), tip=0xffb347),
    "rod_frost": lambda: rod("rod_frost", 0x9fdcff, grip=0xeaf6ff, reel=0xbfeeff, accent=0x5ac8ff, extra=icicles(), tip=0xbfeeff, tipglow=True),
    "rod_magma": lambda: rod("rod_magma", 0x2a2426, grip=0x3a2a26, reel=0xff7a2a, accent=0xff7a2a, extra=lava_cracks(), tip=0xff7a2a, tipglow=True),
    "rod_moon": lambda: rod("rod_moon", 0xc8c8e8, grip=0x4c3aa8, reel=0x9a8aff, accent=0xc8b8ff, extra=crescent_tip(), tip=0xe9f0ff, tipglow=True),
    "rod_star": lambda: rod("rod_star", 0xe8b84a, grip=0x2a2a55, reel=0xffe27a, accent=0xffffff, extra=star_tip(), thick=1.1),
    "skin_lantern": lambda: rod("skin_lantern", 0x8a5a33, grip=0x5a3a24, accent=0xffd27a, extra=lantern_tip()),
    "skin_willow": lambda: rod("skin_willow", 0x6f9f4a, grip=0x8a6a3c, accent=0xffd34d, extra=leaves(0x9fd06a), tip=0xff9fcb),
    "skin_coral": lambda: rod("skin_coral", 0x5fd1c0, grip=0xff8aa8, accent=0xffb347, bands=[0x5fd1c0, 0xff8aa8], extra=coral_bits()),
    "skin_frost": lambda: rod("skin_frost", 0xeaf6ff, grip=0x5ac8ff, accent=0x9fe9ff, extra=icicles(), tip=0x9fe9ff, tipglow=True),
    "skin_ember": lambda: rod("skin_ember", 0x3a2420, grip=0xd83a2a, accent=0xffb347, extra=lava_cracks(), tip=0xffb347, tipglow=True),
    "skin_moon": lambda: rod("skin_moon", 0x4c3aa8, grip=0xc8b8ff, accent=0xfff7c0, extra=star_tip(0xfff7c0)),
    "skin_rainbow": lambda: rod("skin_rainbow", 0xffffff, grip=0xffffff, accent=0xff7eb6, bands=[0xe8463a, 0xff9a3c, 0xffd34d, 0x5fdc6a, 0x3fa7ff, 0xb46bff], tip=0xffffff, tipglow=True),
    "skin_dragon": lambda: rod("skin_dragon", 0x2fa84a, grip=0x1f6a2f, reel=0xffd34d, accent=0xffd34d, extra=dragon(), thick=1.15),
    "skin_candy": lambda: rod("skin_candy", 0xffffff, grip=0xff7eb6, accent=0xe8463a, bands=[0xe8463a, 0xffffff], tip=0xff7eb6),
}
ITEMS.update(RODS)

@item("bobber")
def _():
    a = Asset("bobber")
    a.add(sphere(0.06, pos=(0, 0.02, 0), color=0xffffff, uv=(10, 8), smooth=True, var=0))
    top = sphere(0.0605, pos=(0, 0.02, 0), color=0xe8463a, uv=(10, 8), smooth=True, var=0)
    paint_where(top, 0xffffff, lambda n, c: c.z < 0.02 + 0.0)
    a.add(top)
    a.add(cyl(0.008, 0.08, pos=(0, 0.075, 0), color=0xe8463a, n=5, bevel=0))
    a.add(sphere(0.012, pos=(0, 0.16, 0), color=0xffe066, sub=1, kind=KIND_GLOW))
    return a

@item("crown")
def _():
    a = Asset("crown")
    a.add(cyl(0.2, 0.12, color=0xffc23a, n=12, bevel=0.02, smooth=False))
    for k in range(6):
        ang = k / 6 * math.tau
        a.add(cyl(0.05, 0.14, pos=(math.cos(ang) * 0.17, 0.11, math.sin(ang) * 0.17), r2=0.0, color=0xffc23a, n=4, bevel=0))
        a.add(sphere(0.022, pos=(math.cos(ang) * 0.17, 0.26, math.sin(ang) * 0.17), color=0xfff3a0, sub=1, kind=KIND_GLOW))
        a.add(sphere(0.03, pos=(math.cos(ang + 0.5) * 0.2, 0.06, math.sin(ang + 0.5) * 0.2), scale=(1, 1, 0.5), color=[0xe8463a, 0x3fa7ff, 0x5fdc6a][k % 3], sub=1, kind=KIND_GLOW))
    return a

def hull(a, L, W, H, color, rim, seed=0, keel=0x5a3a24, stern_flat=True):
    """A boat hull along Z (bow toward -Z), water line at y = 0."""
    n = 10
    prof = []
    for i in range(n + 1):
        t = i / n           # 0 stern .. 1 bow
        z = L / 2 - L * t
        w = W / 2 * (math.sin(math.pi * min(1, t * 0.9 + 0.1)) ** 0.6 if t > 0.4 else 0.82 + 0.18 * t / 0.4)
        if t > 0.92:
            w *= (1 - t) / 0.08 * 0.6 + 0.0
        prof.append((z, max(0.02, w)))
    bm = bmesh.new()
    rows = []
    for (z, w) in prof:
        row = [bm.verts.new(G(-w, H * 0.75, z)), bm.verts.new(G(-w * 0.85, -H * 0.05, z)), bm.verts.new(G(-w * 0.35, -H * 0.3, z)), bm.verts.new(G(0, -H * 0.36, z)),
               bm.verts.new(G(w * 0.35, -H * 0.3, z)), bm.verts.new(G(w * 0.85, -H * 0.05, z)), bm.verts.new(G(w, H * 0.75, z))]
        rows.append(row)
    for i in range(n):
        for k in range(6):
            bm.faces.new([rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]])
    bm.faces.new(list(reversed(rows[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    p = finish_part(bm, color, KIND_TOON, False, random.Random(seed), 0.05, Matrix.Identity(4))
    paint_where(p, mix(hexrgb(color), (0, 0, 0), 0.35), lambda nn, c: c.z < -H * 0.05)
    a.add(p)
    # inner floor + rim
    a.add(box((W * 0.7, 0.05, L * 0.75), pos=(0, -H * 0.12, 0.05), color=mix(hexrgb(color), (1, 1, 1), 0.2), bevel=0.02))
    pts_l = [(-w + 0.03, H * 0.78, z) for (z, w) in prof]
    pts_r = [(w - 0.03, H * 0.78, z) for (z, w) in prof]
    a.add(tube(pts_l + list(reversed(pts_r)), 0.045, color=rim, n=5, smooth=False, cap=False))
    return prof

@item("boat_rowboat")
def _():
    a = Asset("boat_rowboat")
    hull(a, 3.2, 1.3, 0.55, 0x9a6a3c, 0xc08a52, seed=1)
    for z in (-0.5, 0.5):
        a.add(box((1.1, 0.06, 0.3), pos=(0, 0.2, z), color=0xc08a52, bevel=0.02))
    for s in (-1, 1):
        a.add(tube([(s * 0.55, 0.45, 0.05), (s * 1.3, 0.05, 0.4)], 0.025, color=0xc08a52, n=5))
        a.add(box((0.05, 0.03, 0.4), pos=(s * 1.35, 0.03, 0.45), rot=(0, 0, s * 0.5), color=0xc08a52, bevel=0.01))
    a.add(cyl(0.18, 0.02, pos=(0, 0.5, 1.4), rot=(math.pi / 2, 0, 0), color=0xffffff, n=10, bevel=0))
    a.anchor("seat", (0, 0.25, 0.5))
    a.anchor("captain", (0, 0.25, -0.6))
    return a

@item("boat_sailboat")
def _():
    a = Asset("boat_sailboat")
    hull(a, 4.6, 1.8, 0.7, 0xf4f0e8, 0x3a6fb0, seed=2)
    a.add(box((1.5, 0.08, 2.6), pos=(0, 0.45, 0.4), color=0xc08a52, bevel=0.02))
    a.add(cyl(0.07, 5.0, pos=(0, 0.5, -0.4), color=0xc08a52, n=8, bevel=0.01))
    a.add(cyl(0.05, 2.2, pos=(0, 1.3, -0.4), rot=(math.pi / 2, 0, 0), color=0xc08a52, n=6, bevel=0, scale=(1, 1, 1)))
    a.add(quad([(0, 1.35, -0.45), (0, 5.3, -0.45), (0, 1.35, 1.7)], color=0xfff6e8))
    a.add(quad([(0, 1.6, -0.6), (0, 4.6, -0.6), (0, 1.3, -2.1)], color=0xe8463a))
    a.add(quad([(0, 5.6, -0.4), (0, 5.3, -0.4), (0, 5.45, -0.9)], color=0xffd34d))
    a.anchor("seat", (0, 0.5, 1.0))
    a.anchor("captain", (0, 0.5, 1.7))
    return a

@item("boat_steamer")
def _():
    a = Asset("boat_steamer")
    hull(a, 6.2, 2.4, 0.9, 0xd83a2a, 0xffffff, seed=3)
    a.add(box((2.2, 0.1, 4.6), pos=(0, 0.65, 0.3), color=0xc08a52, bevel=0.02))
    a.add(box((1.8, 1.4, 2.2), pos=(0, 0.72, 0.5), color=0xfff1d6, bevel=0.05))
    for z in (-0.2, 0.5, 1.2):
        for s in (-1, 1):
            a.add(box((0.05, 0.5, 0.45), pos=(s * 0.91, 1.25, z), color=0xffd27a, kind=KIND_GLOW, bevel=0))
    a.add(box((2.2, 0.12, 2.6), pos=(0, 2.12, 0.5), color=0x3a6fb0, bevel=0.03))
    a.add(cyl(0.3, 1.8, pos=(0, 2.2, 0.0), color=0x2a2a33, n=10, bevel=0.03))
    a.add(cyl(0.34, 0.2, pos=(0, 3.9, 0.0), color=0xe8b84a, n=10, bevel=0.02))
    for s in (-1, 1):
        a.add(cyl(0.9, 0.35, pos=(s * 1.15 + (-0.35 if s > 0 else 0), 0.55, 1.6), rot=(0, 0, -math.pi / 2), color=0xd83a2a, n=12, bevel=0.03))
        for k in range(8):
            ang = k / 8 * math.tau
            a.add(box((0.36, 0.06, 0.5), pos=(s * 1.32, 0.55 + math.sin(ang) * 0.75, 1.6 + math.cos(ang) * 0.75), rot=(math.pi / 2 - ang, 0, 0), color=0xffffff, bevel=0.01, base=False))
    a.anchor("seat", (0, 0.7, -1.4))
    a.anchor("captain", (0, 0.7, 1.9))
    return a

@item("boat_yacht")
def _():
    a = Asset("boat_yacht")
    hull(a, 6.8, 2.4, 0.9, 0xffffff, 0xe8b84a, seed=4)
    a.add(box((2.0, 0.08, 5.2), pos=(0, 0.66, 0.4), color=0xd8b48a, bevel=0.02))
    a.add(box((1.7, 0.9, 2.6), pos=(0, 0.72, 0.6), taper=(0.9, 0.7), color=0xffffff, bevel=0.1, segs=2))
    a.add(box((1.75, 0.3, 2.2), pos=(0, 1.15, 0.45), color=0x2a3a5a, bevel=0.05))
    for s in (-1, 1):
        pts = [(s * 1.1, 0.72, 3.0), (s * 1.0, 0.72, 0), (s * 0.4, 0.72, -3.2)]
        a.add(tube(pts, 0.03, color=0x9ff0ff, n=4, smooth=True))
    a.add(cyl(0.04, 2.4, pos=(0, 1.6, 1.3), color=0xe8b84a, n=6, bevel=0))
    pts = []
    for k in range(10):
        ang = math.pi / 2 + k / 10 * math.tau
        r = 0.32 if k % 2 == 0 else 0.14
        pts.append((math.cos(ang) * r, math.sin(ang) * r))
    a.add(prism(pts, 0.05, pos=(0, 3.7, 1.3), rot=(math.pi / 2, 0, 0), color=0xffe27a, kind=KIND_GLOW, var=0))
    for z in (-2.5, -1.5, 2.6):
        a.add(sphere(0.06, pos=(0, 0.75, z), color=0xfff3a0, kind=KIND_GLOW, sub=1))
    a.anchor("seat", (0, 0.72, 2.2))
    a.anchor("captain", (0, 0.72, -0.5))
    return a
