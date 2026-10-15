"""Blocky NPCs. Each NPC is a root empty with child meshes 'body', 'head', 'armL', 'armR' whose
origins are their pivots (hips, neck, shoulders), so the game can wave, nod and bob them.
Feet at y = 0, facing +Z (toward the player who walks up to them)."""
from lib import *

SKIN = [0xffd2b0, 0xe8b08a, 0xc68a5e, 0x8d5a3b]

LEG_H, TORSO_H, HEAD = 0.8, 0.78, 0.66
SH_Y = LEG_H + TORSO_H - 0.1          # shoulder pivot height
NECK_Y = LEG_H + TORSO_H              # neck pivot height

def face(a, skin, style):
    """Face on the head's front (+z), head centred at y = HEAD/2 above the neck pivot (local)."""
    hz = HEAD / 2 + 0.005
    cy = HEAD * 0.48
    eye_col = style.get("eyes", 0x1d1d26)
    for s in (-1, 1):
        a.add(sphere(0.07, pos=(s * 0.13, cy + 0.03, hz), scale=(0.75, 1.0, 0.35), color=eye_col, sub=2, var=0))
        a.add(sphere(0.022, pos=(s * 0.13 + 0.02, cy + 0.07, hz + 0.02), color=0xffffff, sub=1, var=0, kind=KIND_GLOW))
        a.add(box((0.14, 0.035, 0.03), pos=(s * 0.13, cy + 0.15, hz - 0.005), rot=(0, 0, s * style.get("brow", -0.12)), color=style.get("browcol", 0x5a3a24), bevel=0.01, base=False))
        a.add(sphere(0.05, pos=(s * 0.21, cy - 0.06, hz - 0.01), scale=(1, 0.6, 0.25), color=mix(hexrgb(skin), (1.0, 0.45, 0.5), 0.45), sub=1, var=0))
    if style.get("mouth", "smile") == "smile":
        pts = [(-0.09 + 0.18 * t / 6, cy - 0.11 - 0.045 * math.sin(math.pi * t / 6), hz) for t in range(7)]
        a.add(tube(pts, 0.016, color=0x5a2a2a, n=5))
    elif style.get("mouth") == "open":
        a.add(sphere(0.06, pos=(0, cy - 0.12, hz - 0.01), scale=(1.2, 0.8, 0.3), color=0x6a2a2a, sub=1))
        a.add(box((0.08, 0.02, 0.02), pos=(0, cy - 0.095, hz + 0.008), color=0xffffff, bevel=0, base=False))
    a.add(sphere(0.045, pos=(0, cy - 0.03, hz + 0.01), scale=(1, 0.8, 0.6), color=mix(hexrgb(skin), (0.6, 0.3, 0.2), 0.15), sub=1))

def build_npc(name, st):
    """st: dict of colours and accessories."""
    skin = st.get("skin", SKIN[0])
    parts = {}
    # body: legs + torso, pivot at the hips (y = LEG_H)
    b = Asset(name + "_body")
    for s in (-1, 1):
        b.add(box((0.36, LEG_H - 0.12, 0.4), pos=(s * 0.2, -LEG_H + 0.12, 0), color=st["pants"], bevel=0.06))
        b.add(box((0.38, 0.16, 0.48), pos=(s * 0.2, -LEG_H, 0.04), color=st.get("shoes", 0x4a3020), bevel=0.06))
    b.add(box((0.82, TORSO_H, 0.46), pos=(0, 0, 0), color=st["shirt"], bevel=0.08, seg=2) if False else box((0.82, TORSO_H, 0.46), pos=(0, 0, 0), color=st["shirt"], bevel=0.08, segs=2))
    b.add(box((0.86, 0.1, 0.5), pos=(0, 0.02, 0), color=st.get("belt", 0x4a3020), bevel=0.03))
    b.add(box((0.12, 0.08, 0.04), pos=(0, 0.03, 0.25), color=0xe8b84a, bevel=0.01))
    for fn in st.get("torso_extra", []):
        fn(b)
    parts["body"] = (b, (0, LEG_H, 0))
    # head, pivot at the neck
    h = Asset(name + "_head")
    h.add(box((0.24, 0.08, 0.24), pos=(0, -0.02, 0), color=skin, bevel=0.03))
    h.add(box((HEAD, HEAD, HEAD * 0.92), pos=(0, 0.05, 0), color=skin, bevel=0.16, segs=3, var=0.02))
    face(h, skin, st.get("face", {}))
    for fn in st.get("head_extra", []):
        fn(h)
    parts["head"] = (h, (0, NECK_Y, 0))
    # arms, pivot at the shoulders
    for side, key in ((-1, "armL"), (1, "armR")):
        ar = Asset(name + "_" + key)
        ar.add(box((0.3, 0.72, 0.34), pos=(side * 0.0, -0.72 + 0.1, 0), color=st.get("sleeve", st["shirt"]), bevel=0.07, segs=2))
        ar.add(box((0.27, 0.2, 0.3), pos=(0, -0.8, 0), color=skin, bevel=0.07, segs=2))
        for fn in st.get(key + "_extra", []):
            fn(ar)
        parts[key] = (ar, (side * 0.57, SH_Y, 0))
    return parts

# ── accessory helpers (all in the part's local frame) ──
def bucket_hat(color, band):
    def f(h):
        h.add(cyl(0.48, 0.06, pos=(0, HEAD - 0.06, 0), r2=0.44, color=color, n=14, bevel=0.02))
        h.add(cyl(0.36, 0.28, pos=(0, HEAD - 0.04, 0), r2=0.3, color=color, n=12, bevel=0.04))
        h.add(cyl(0.365, 0.07, pos=(0, HEAD + 0.0, 0), color=band, n=12, bevel=0.0))
        h.add(sphere(0.05, pos=(0.3, HEAD + 0.08, 0.1), color=0xff5a5a, sub=1))
        h.add(cyl(0.008, 0.08, pos=(0.3, HEAD + 0.02, 0.1), color=0xd0d0d0, n=4, bevel=0))
    return f

def beard(color, mustache=True, long=True):
    def f(h):
        if long:
            h.add(box((0.6, 0.34, 0.2), pos=(0, -0.12, HEAD * 0.4), color=color, bevel=0.08, segs=2))
            h.add(cyl(0.14, 0.18, pos=(0, -0.28, HEAD * 0.42), r2=0.02, color=color, n=6, bevel=0))
        if mustache:
            for s in (-1, 1):
                h.add(sphere(0.08, pos=(s * 0.09, HEAD * 0.48 - 0.07, HEAD * 0.5), scale=(1.4, 0.6, 0.6), rot=(0, 0, s * 0.3), color=color, sub=1))
    return f

def glasses(color=0x3a2a20):
    def f(h):
        cy = HEAD * 0.48 + 0.03
        for s in (-1, 1):
            pts = [(s * 0.13 + math.cos(k / 10 * math.tau) * 0.085, cy + math.sin(k / 10 * math.tau) * 0.085, HEAD / 2 + 0.04) for k in range(11)]
            h.add(tube(pts, 0.012, color=color, n=4, cap=False))
        h.add(box((0.08, 0.02, 0.02), pos=(0, cy + 0.02, HEAD / 2 + 0.04), color=color, bevel=0, base=False))
    return f

def hair_top(color, tuft=True):
    def f(h):
        h.add(box((HEAD + 0.04, 0.18, HEAD * 0.95), pos=(0, HEAD - 0.06, -0.02), color=color, bevel=0.08, segs=2))
        h.add(box((HEAD + 0.04, 0.42, 0.2), pos=(0, 0.2, -HEAD * 0.4), color=color, bevel=0.07, segs=2))
        if tuft:
            h.add(cyl(0.1, 0.16, pos=(0.08, HEAD + 0.08, 0.1), rot=(0.4, 0, -0.3), r2=0.0, color=color, n=6, bevel=0))
    return f

def headscarf(color, dots):
    def f(h):
        h.add(box((HEAD + 0.08, 0.26, HEAD * 0.98), pos=(0, HEAD - 0.12, -0.02), color=color, bevel=0.1, segs=2))
        h.add(box((HEAD + 0.06, 0.5, 0.18), pos=(0, 0.14, -HEAD * 0.42), color=color, bevel=0.07))
        rng = random.Random(3)
        for k in range(9):
            ang = rng.uniform(-1.2, 1.2)
            h.add(sphere(0.03, pos=(math.sin(ang) * 0.36, HEAD + 0.06 + rng.uniform(-0.04, 0.02), math.cos(ang) * 0.32 - 0.05), color=dots, sub=1))
        h.add(sphere(0.09, pos=(0.0, HEAD * 0.2, -HEAD * 0.56), color=color, sub=1))
        h.add(box((0.12, 0.3, 0.06), pos=(0.05, -0.15, -HEAD * 0.58), rot=(0.2, 0, 0.2), color=color, bevel=0.02))
    return f

def cap(color, brim_back=False, logo=0xffffff):
    def f(h):
        h.add(lathe([(0.37, 0), (0.36, 0.12), (0.28, 0.24), (0, 0.27)], pos=(0, HEAD - 0.1, 0), color=color, n=12, smooth=False))
        d = -1 if brim_back else 1
        h.add(box((0.5, 0.04, 0.3), pos=(0, HEAD - 0.08, d * 0.42), rot=(d * 0.12, 0, 0), color=color, bevel=0.015))
        h.add(sphere(0.06, pos=(0, HEAD + 0.06, d * 0.33), scale=(1, 1, 0.3), color=logo, sub=1))
    return f

def captain_hat():
    def f(h):
        h.add(cyl(0.36, 0.2, pos=(0, HEAD - 0.05, 0), r2=0.4, color=0xffffff, n=14, bevel=0.03))
        h.add(cyl(0.41, 0.06, pos=(0, HEAD + 0.15, 0), color=0xffffff, n=14, bevel=0.02))
        h.add(cyl(0.37, 0.07, pos=(0, HEAD - 0.05, 0), color=0x1f2a44, n=14, bevel=0))
        h.add(box((0.5, 0.04, 0.24), pos=(0, HEAD - 0.06, 0.4), rot=(0.25, 0, 0), color=0x1f2a44, bevel=0.015))
        h.add(sphere(0.07, pos=(0, HEAD + 0.03, 0.37), scale=(1, 1, 0.3), color=0xe8b84a, sub=1))
    return f

def straw_hat(flower=0xff7eb6):
    def f(h):
        h.add(cyl(0.62, 0.05, pos=(0, HEAD - 0.06, 0), r2=0.56, color=0xe6c46a, n=16, bevel=0.02))
        h.add(cyl(0.34, 0.24, pos=(0, HEAD - 0.04, 0), r2=0.3, color=0xe6c46a, n=14, bevel=0.03))
        h.add(cyl(0.345, 0.06, pos=(0, HEAD + 0.0, 0), color=0x7ac77a, n=14, bevel=0))
        for k in range(5):
            ang = k / 5 * math.tau
            h.add(sphere(0.045, pos=(0.32 + math.cos(ang) * 0.05, HEAD + 0.05 + math.sin(ang) * 0.05, 0.12), color=flower, sub=1))
        h.add(sphere(0.03, pos=(0.33, HEAD + 0.05, 0.14), color=0xffe066, sub=1))
    return f

def hood(color, trim, stars=None):
    def f(h):
        h.add(box((HEAD + 0.14, HEAD + 0.1, HEAD * 0.98), pos=(0, 0.02, -0.06), color=color, bevel=0.17, segs=2))
        pts = [(math.cos(k / 16 * math.tau) * 0.35, HEAD * 0.48 + math.sin(k / 16 * math.tau) * 0.36, HEAD / 2 + 0.02) for k in range(17)]
        h.add(tube(pts, 0.06, color=trim, n=6, cap=False))
        if stars:
            rng = random.Random(4)
            for k in range(8):
                h.add(sphere(0.025, pos=(rng.uniform(-0.35, 0.35), rng.uniform(0.1, HEAD), rng.choice([-1, 1]) * 0.0 - HEAD * 0.52), color=stars, kind=KIND_GLOW, sub=1))
    return f

def goggles():
    def f(h):
        for s in (-1, 1):
            h.add(cyl(0.09, 0.07, pos=(s * 0.13, HEAD * 0.78, HEAD / 2 - 0.01), rot=(math.pi / 2, 0, 0), color=0x8a5a33, n=10, bevel=0.01))
            h.add(cyl(0.065, 0.02, pos=(s * 0.13, HEAD * 0.78, HEAD / 2 + 0.06), rot=(math.pi / 2, 0, 0), color=0xffb347, kind=KIND_GLOW, n=10, bevel=0))
        h.add(cyl(HEAD * 0.56, 0.06, pos=(0, HEAD * 0.75, 0), color=0x4a3020, n=14, bevel=0))
    return f

def sunglasses():
    def f(h):
        cy = HEAD * 0.48 + 0.03
        h.add(box((0.5, 0.12, 0.04), pos=(0, cy - 0.06, HEAD / 2 + 0.03), color=0x1a1a22, bevel=0.02))
        h.add(box((0.18, 0.04, 0.02), pos=(0.12, cy + 0.0, HEAD / 2 + 0.055), color=0x7ad0ff, kind=KIND_GLOW, bevel=0))
    return f

def vest(color, pocket=0x5a7a3a):
    def f(b):
        for s in (-1, 1):
            b.add(box((0.32, TORSO_H - 0.04, 0.05), pos=(s * 0.25, 0.02, 0.23), color=color, bevel=0.03))
            b.add(box((0.16, 0.14, 0.04), pos=(s * 0.25, 0.25, 0.27), color=pocket, bevel=0.02))
        b.add(box((0.86, TORSO_H - 0.04, 0.4), pos=(0, 0.02, -0.04), color=color, bevel=0.06))
    return f

def apron(color=0xffffff, strap=0xffffff):
    def f(b):
        b.add(box((0.56, TORSO_H * 0.95, 0.04), pos=(0, -0.15, 0.24), color=color, bevel=0.03))
        b.add(box((0.3, 0.16, 0.03), pos=(0, 0.05, 0.27), color=mix(hexrgb(color), (0, 0, 0), 0.08), bevel=0.01))
    return f

def overalls(color):
    def f(b):
        b.add(box((0.6, TORSO_H * 0.62, 0.05), pos=(0, 0.02, 0.23), color=color, bevel=0.03))
        for s in (-1, 1):
            b.add(box((0.1, TORSO_H * 0.4, 0.05), pos=(s * 0.22, TORSO_H * 0.6, 0.23), color=color, bevel=0.02))
            b.add(sphere(0.035, pos=(s * 0.22, TORSO_H * 0.62, 0.27), color=0xe8b84a, sub=1))
    return f

def coat_buttons(color=0xe8b84a):
    def f(b):
        for k in range(3):
            for s in (-1, 1):
                b.add(sphere(0.03, pos=(s * 0.1, 0.18 + k * 0.17, 0.24), color=color, sub=1))
        b.add(box((0.5, 0.14, 0.5), pos=(0, TORSO_H - 0.06, 0.0), color=0xd83a2a, bevel=0.05))
    return f

def floral(colors):
    def f(b):
        rng = random.Random(2)
        for k in range(12):
            x, y = rng.uniform(-0.34, 0.34), rng.uniform(0.1, TORSO_H - 0.1)
            b.add(sphere(0.045, pos=(x, y, 0.235), scale=(1, 1, 0.3), color=colors[k % len(colors)], sub=1))
    return f

def lei():
    def f(b):
        for k in range(14):
            ang = k / 14 * math.pi
            b.add(sphere(0.05, pos=(math.cos(ang) * 0.28, TORSO_H - 0.05 - math.sin(ang) * 0.12, 0.2 + math.sin(ang) * 0.05), color=[0xff7eb6, 0xffd34d, 0xffffff][k % 3], sub=1))
    return f

def fur_trim(color=0xf4f0e8):
    def f(b):
        b.add(box((0.88, 0.12, 0.52), pos=(0, -0.02, 0), color=color, bevel=0.05))
        b.add(box((0.1, TORSO_H - 0.1, 0.05), pos=(0, 0.06, 0.24), color=color, bevel=0.02))
    return f

def holding_rod(color=0x8a5a33):
    def f(ar):
        ar.add(tube([(0, -0.85, 0.08), (0, -0.4, 0.55), (0, 0.4, 1.3)], 0.025, color=color, n=5, r_end=0.008))
        ar.add(cyl(0.05, 0.06, pos=(0.04, -0.75, 0.2), rot=(0, 0, math.pi / 2), color=0x9a9ea8, n=8, bevel=0))
    return f

def holding_fish():
    def f(ar):
        ar.add(sphere(0.12, pos=(0, -0.95, 0.12), rot=(0, 0, math.pi / 2), scale=(2.0, 0.8, 0.5), color=0x7ab0d0, sub=1))
        ar.add(prism([(0.0, -0.1), (0.0, 0.1), (0.14, 0.0)], 0.03, pos=(0, -1.18, 0.12), rot=(math.pi / 2, 0, -math.pi / 2), color=0x7ab0d0))
    return f

def staff(glow=0x9ff0ff):
    def f(ar):
        ar.add(cyl(0.035, 1.9, pos=(0, -1.6, 0.18), color=0x5a3a24, n=6, bevel=0))
        ar.add(sphere(0.12, pos=(0, 0.38, 0.18), color=glow, kind=KIND_GLOW, sub=2))
        for k in range(3):
            ang = k / 3 * math.tau
            ar.add(tube([(0, 0.2, 0.18), (math.cos(ang) * 0.12, 0.38, 0.18 + math.sin(ang) * 0.12)], 0.015, color=0x5a3a24, n=4))
    return f

def whistle():
    def f(b):
        b.add(tube([(-0.2, TORSO_H, 0.18), (0, TORSO_H - 0.3, 0.25), (0.2, TORSO_H, 0.18)], 0.01, color=0xe8463a, n=4))
        b.add(box((0.08, 0.05, 0.05), pos=(0, TORSO_H - 0.35, 0.26), color=0xe0e0e0, bevel=0.01))
    return f

def stripes(color):
    def f(b):
        for k in range(4):
            b.add(box((0.84, 0.07, 0.48), pos=(0, 0.12 + k * 0.17, 0), color=color, bevel=0.01))
    return f

NPCS = {
    "guide": dict(skin=SKIN[1], shirt=0xc0503a, sleeve=0xc0503a, pants=0x6a4a2e, shoes=0x3a2a1a, head_extra=[bucket_hat(0x7a8a4a, 0x5a6a34), beard(0xf4f0e8), glasses()], torso_extra=[vest(0x6f8f4a)], armR_extra=[holding_rod()], face={"brow": 0.15, "browcol": 0xf4f0e8}),
    "market": dict(skin=SKIN[2], shirt=0xffc84a, pants=0x8a5ac0, shoes=0x6a3a2a, head_extra=[headscarf(0x2fa89a, 0xffffff)], torso_extra=[apron()], armL_extra=[holding_fish()], face={"brow": -0.1, "browcol": 0x3a2418}),
    "tackle": dict(skin=SKIN[0], shirt=0xffd34d, sleeve=0xffd34d, pants=0x3a6fb0, shoes=0x5a3a24, head_extra=[cap(0xe8463a, brim_back=True), hair_top(0x8a5a33, tuft=False), beard(0x8a5a33, mustache=True, long=False)], torso_extra=[overalls(0x3a6fb0)], face={"mouth": "open"}),
    "captain": dict(skin=SKIN[1], shirt=0x1f2a44, pants=0x1f2a44, shoes=0x1a1a1a, head_extra=[captain_hat(), beard(0x5a3a24, mustache=True, long=False)], torso_extra=[coat_buttons()], face={"brow": 0.05}),
    "willow": dict(skin=SKIN[0], shirt=0x7ac77a, pants=0x8a6a3c, head_extra=[straw_hat(), hair_top(0xd9a05b, tuft=False)], torso_extra=[apron(0xfff1d6)], face={}),
    "coral": dict(skin=SKIN[2], shirt=0xff8a3c, pants=0x3fb3ff, shoes=0xffd34d, head_extra=[sunglasses(), hair_top(0x2a1a14)], torso_extra=[floral([0xffffff, 0xffd34d, 0xe8463a]), lei()], face={"mouth": "open"}),
    "frost": dict(skin=SKIN[0], shirt=0xd83a2a, sleeve=0xd83a2a, pants=0x3a3f58, shoes=0x2a2a33, head_extra=[hood(0xd83a2a, 0xf4f0e8)], torso_extra=[fur_trim()], face={}),
    "ember": dict(skin=SKIN[3], shirt=0x7a3a22, pants=0x3a2a26, shoes=0x1a1a1a, head_extra=[goggles(), hair_top(0x1a1414)], torso_extra=[apron(0x5a3a28)], face={"brow": -0.2, "browcol": 0x1a1414}),
    "moon": dict(skin=SKIN[1], shirt=0x4c3aa8, sleeve=0x4c3aa8, pants=0x3a2a88, shoes=0x2a1a5a, head_extra=[hood(0x4c3aa8, 0xc8b8ff, stars=0xfff7c0)], torso_extra=[floral([0xfff7c0, 0x9ff0ff])], armR_extra=[staff()], face={"eyes": 0x3a2a88}),
    "host": dict(skin=SKIN[2], shirt=0xffffff, pants=0x2a2a33, shoes=0xffffff, head_extra=[cap(0x3a6fb0), hair_top(0x2a1a14, tuft=False)], torso_extra=[stripes(0x3a6fb0), whistle()], face={"mouth": "open"}),
}
