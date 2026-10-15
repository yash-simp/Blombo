"""54 fish and creatures. Canonical frame (GAME space): nose toward +X, length 1 m (tail tip x = -0.5,
nose x = +0.5), up +Y, centred on the origin. The game scales by size and bends the tail in a shader."""
from lib import *

def sstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def hash2(a, b, seed):
    h = (a * 73856093) ^ (b * 19349663) ^ (seed * 83492791)
    h = (h ^ (h >> 13)) * 1274126177 & 0xffffffff
    return (h & 0xffff) / 65535.0

class Spec(dict):
    __getattr__ = dict.get

def body_profile(spec, s):
    """Height and width factor at station s (0 tail base .. 1 nose)."""
    shape = spec.shape or "fusi"
    m = spec.peak or (0.6 if shape != "long" else 0.55)
    ped = spec.ped if spec.ped is not None else 0.28
    blunt = spec.blunt if spec.blunt is not None else 0.18
    if shape in ("eel",):
        f = 0.55 + 0.45 * math.sin(math.pi * min(1, s * 1.0)) ** 0.3
        if s > 0.85:
            f *= max(blunt, max(0.0, math.cos(min(1.0, (s - 0.85) / 0.15) * math.pi / 2)) ** 0.6)
        if s < 0.15:
            f *= 0.35 + 0.65 * s / 0.15
        return f
    if s < m:
        f = ped + (1 - ped) * math.sin(math.pi / 2 * s / m) ** 1.1
    else:
        u = (s - m) / (1 - m)
        f = blunt + (1 - blunt) * max(0.0, math.cos(math.pi / 2 * min(1.0, u))) ** (spec.nose_pow or 0.75)
    return f

def ring_color(spec, s, th, si, ri, nrings):
    """Colour of the body quad at station s (0..1), ring angle th (pi/2 = top). Returns (rgb, kind)."""
    top, belly = hexrgb(spec.top), hexrgb(spec.belly)
    up = math.sin(th)
    c = mix(belly, top, sstep((up + 0.35) / 1.0))
    kind = KIND_TOON
    p = spec.pattern or ""
    acc = hexrgb(spec.accent) if spec.accent is not None else top
    seed = spec.seed or 1
    glowpat = spec.glowpat
    hit = False
    if "bars" in p:
        k = spec.bars or 5
        if (s * k + 0.25) % 1.0 < 0.38 and up > -0.45 and 0.12 < s < 0.86:
            hit = True
    if "lateral" in p:
        if abs(up) < (spec.lat or 0.22) and s < 0.9:
            hit = True
    if "spots" in p:
        if hash2(si, ri, seed) < (spec.dens or 0.22) and up > -0.5 and s < 0.88:
            hit = True
    if "koi" in p:
        aa = abs(((th - math.pi / 2) + math.pi) % math.tau - math.pi)
        for (cs, ct, cr) in spec.blobs or []:
            if (s - cs) ** 2 + ((aa - ct) / 3.0) ** 2 < cr * cr:
                hit = True
    if "bands" in p:
        cols = [hexrgb(x) for x in spec.bandcols]
        k = int((s * (spec.bands or 6)) % len(cols))
        c = mix(cols[k], c, 0.15 if up > -0.6 else 0.6)
    if "gradient" in p:
        g0, g1 = hexrgb(spec.g0), hexrgb(spec.g1)
        c = mix(mix(g0, g1, sstep(s)), belly, sstep((-up - 0.2) / 0.8) * 0.7)
    if "scales" in p:
        if (si + ri) % 2 == 0:
            c = mix(c, (0, 0, 0), 0.04)
        else:
            c = mix(c, (1, 1, 1), 0.035)
    if "stripe_top" in p:
        if up > 0.85:
            hit = True
    if "zigzag" in p:
        z = (0.0 + 0.18 * math.sin(s * 22)) 
        if abs(up - z) < 0.16 and 0.1 < s < 0.85:
            hit = True
    if "rings" in p:
        if abs(s - 0.62) < 0.07 or abs(s - 0.35) < 0.05:
            hit = True
    if "cracks" in p:
        if hash2(si * 3, ri * 7, seed) < 0.18 and abs(up) < 0.8:
            hit = True
    if "sunspot" in p:
        if (s - 0.72) ** 2 + (up - 0.15) ** 2 < 0.012:
            hit = True
    if "crescent" in p:
        d = (s - 0.55) ** 2 + (up - 0.1) ** 2
        d2 = (s - 0.58) ** 2 + (up - 0.18) ** 2
        if d < 0.02 and d2 > 0.013:
            hit = True
    if hit:
        c = acc
        if glowpat:
            kind = KIND_GLOW
    if "edge_belly" in p and up < -0.75:
        c = mix(c, (1, 1, 1), 0.4)
    return c, kind

def loft_body(spec, x0, x1, H, W, rings=12, nseg=12):
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new("Col")
    kl = bm.faces.layers.int.new("kind")
    grid = []
    cy_off = spec.cy or 0.0
    for si in range(rings + 1):
        s = si / rings
        x = x0 + (x1 - x0) * s
        f = body_profile(spec, s)
        h = H * f
        w = W * f ** (spec.wpow or 0.95)
        belly_drop = (spec.belly_drop or 0.0) * f
        yc = cy_off * math.sin(math.pi * s) + (spec.hump or 0.0) * h * 0.2
        row = []
        for ri in range(nseg):
            th = math.pi / 2 + ri / nseg * math.tau
            st, ct = math.sin(th), math.cos(th)
            e = spec.sq or 2.0
            sy = math.copysign(abs(st) ** (2 / e), st)
            sz = math.copysign(abs(ct) ** (2 / e), ct)
            y = yc + sy * h / 2 - (belly_drop * h * 0.3 if st < 0 else 0)
            z = sz * w / 2
            row.append(bm.verts.new(G(x, y, z)))
        grid.append(row)
    rng = random.Random(spec.seed or 1)
    for si in range(rings):
        for ri in range(nseg):
            a, b = grid[si][ri], grid[si][(ri + 1) % nseg]
            c, d = grid[si + 1][(ri + 1) % nseg], grid[si + 1][ri]
            f = bm.faces.new([a, d, c, b])
            th = math.pi / 2 + (ri + 0.5) / nseg * math.tau
            color, kind = ring_color(spec, (si + 0.5) / rings, th, si, ri, rings)
            color = jitter(color, rng, 0.022, 0.004)
            f[kl] = kind
            f.smooth = True
            for l in f.loops:
                l[col] = (*color, 1.0)
    # caps
    for idx, row in ((0, grid[0]), (rings, grid[-1])):
        center = sum((v.co for v in row), Vector()) / len(row)
        cv = bm.verts.new(center + (G(0.012 if idx else -0.012, 0, 0) - G(0, 0, 0)))
        color, kind = ring_color(spec, 1.0 if idx else 0.0, math.pi / 2, idx, 0, rings)
        for ri in range(nseg):
            a, b = row[ri], row[(ri + 1) % nseg]
            f = bm.faces.new([a, b, cv] if idx else [b, a, cv])
            f[kl] = kind
            f.smooth = True
            for l in f.loops:
                l[col] = (*color, 1.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return Part(bm), grid

def fin(points, color, edge=None, kind=KIND_TOON, thick=0.006, seed=0, smooth=False):
    """Flat fin from GAME points (a closed, possibly concave polygon), double sided."""
    pts = list(points)
    bm = bmesh.new()
    vs = [bm.verts.new(G(*p)) for p in pts]
    edges = []
    for k in range(len(vs)):
        try:
            edges.append(bm.edges.new((vs[k], vs[(k + 1) % len(vs)])))
        except ValueError:
            pass
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
    if not bm.faces:
        bm.free()
        bm = bmesh.new()
        c = bm.verts.new(G(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts), sum(p[2] for p in pts) / len(pts)))
        vs = [bm.verts.new(G(*p)) for p in pts]
        for k in range(len(vs)):
            try:
                bm.faces.new([c, vs[k], vs[(k + 1) % len(vs)]])
            except ValueError:
                pass
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    n = bm.faces[0].normal.copy() if len(bm.faces) else Vector((0, -1, 0))
    if n.length < 1e-6:
        n = Vector((0, -1, 0))
    bmesh.ops.translate(bm, vec=n * thick, verts=bm.verts)
    dup = bmesh.ops.duplicate(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces))
    dverts = [g for g in dup["geom"] if isinstance(g, bmesh.types.BMVert)]
    dfaces = [g for g in dup["geom"] if isinstance(g, bmesh.types.BMFace)]
    bmesh.ops.translate(bm, vec=-n * thick * 2, verts=dverts)
    bmesh.ops.reverse_faces(bm, faces=dfaces)
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    cz = sum(p[2] for p in pts) / len(pts)
    part = finish_part(bm, color, kind, smooth, random.Random(seed), 0.03, Matrix.Identity(4))
    if edge is not None:
        colL = part.bm.loops.layers.float_color["Col"]
        ec = hexrgb(edge)
        ctr = G(cx, cy, cz)
        maxd = max((G(*p) - ctr).length for p in pts) or 1
        for f in part.bm.faces:
            for l in f.loops:
                d = (l.vert.co - ctr).length / maxd
                cc = l[colL]
                l[colL] = (*mix((cc[0], cc[1], cc[2]), ec, sstep(d * 1.1 - 0.15)), 1.0)
    return part

def fin_side(points, color, edge=None, kind=KIND_TOON, seed=0):
    """A fin given in (x, y) mirrored... used for pectorals: points are full 3D GAME coords."""
    return fin(points, color, edge, kind, seed=seed)

def tail_points(kind, xb, yb, hb, size):
    """Tail fin polygon in the xy plane, from the tail base at (xb, yb) with base height hb."""
    L = size
    if kind == "fork":
        return [(xb + 0.02, yb + hb * 0.3), (xb - L * 0.6, yb + L * 0.75), (xb - L * 1.0, yb + L * 0.95), (xb - L * 0.55, yb), (xb - L * 1.0, yb - L * 0.95), (xb - L * 0.6, yb - L * 0.75), (xb + 0.02, yb - hb * 0.3)]
    if kind == "lunate":
        return [(xb + 0.02, yb + hb * 0.25), (xb - L * 0.7, yb + L * 1.05), (xb - L * 0.55, yb + L * 0.3), (xb - L * 0.5, yb), (xb - L * 0.55, yb - L * 0.3), (xb - L * 0.7, yb - L * 1.05), (xb + 0.02, yb - hb * 0.25)]
    if kind == "round":
        pts = [(xb + 0.02, yb + hb * 0.3)]
        for k in range(9):
            a = math.pi / 2 + 0.25 + (math.pi - 0.5) * k / 8
            pts.append((xb - L * 0.25 + math.cos(a) * L * 0.75, yb + math.sin(a) * L * 0.6))
        pts.append((xb + 0.02, yb - hb * 0.3))
        return pts
    if kind == "square":
        return [(xb + 0.02, yb + hb * 0.3), (xb - L * 0.85, yb + L * 0.6), (xb - L * 0.9, yb + L * 0.2), (xb - L * 0.85, yb), (xb - L * 0.9, yb - L * 0.2), (xb - L * 0.85, yb - L * 0.6), (xb + 0.02, yb - hb * 0.3)]
    if kind == "veil":
        pts = [(xb + 0.02, yb + hb * 0.3)]
        for k in range(11):
            a = math.pi / 2 + 0.1 + (math.pi - 0.2) * k / 10
            r = L * (1.0 + 0.18 * math.sin(k * 1.7))
            pts.append((xb - L * 0.35 + math.cos(a) * r, yb + math.sin(a) * r * 0.75 - L * 0.15))
        pts.append((xb + 0.02, yb - hb * 0.3))
        return pts
    if kind == "shark":
        return [(xb + 0.02, yb + hb * 0.3), (xb - L * 0.9, yb + L * 1.0), (xb - L * 0.75, yb + L * 0.55), (xb - L * 0.45, yb - L * 0.15), (xb - L * 0.5, yb - L * 0.5), (xb + 0.02, yb - hb * 0.3)]
    if kind == "tri":
        return [(xb + 0.02, yb + hb * 0.3), (xb - L * 0.55, yb + L * 0.7), (xb - L * 0.5, yb + L * 0.25), (xb - L * 0.95, yb + L * 0.12), (xb - L * 0.95, yb - L * 0.12), (xb - L * 0.5, yb - L * 0.25), (xb - L * 0.55, yb - L * 0.7), (xb + 0.02, yb - hb * 0.3)]
    if kind == "point":
        return [(xb + 0.02, yb + hb * 0.4), (xb - L, yb), (xb + 0.02, yb - hb * 0.4)]
    return None

def dorsal_points(kind, xa, xb, ytop, size):
    """Dorsal fin polygon along the back between xa (rear) and xb (front) at ytop."""
    L = xb - xa
    if kind == "spiky":
        pts = [(xa, ytop - 0.01)]
        n = 6
        for k in range(n):
            t = (k + 0.5) / n
            pts.append((xa + L * (t - 0.04), ytop + size * (0.55 + 0.45 * math.sin(math.pi * t)) * 0.75))
            pts.append((xa + L * (t + 0.05), ytop + size * (0.3 + 0.4 * math.sin(math.pi * t)) * 0.6))
        pts.append((xb, ytop - 0.01))
        return pts
    if kind == "round":
        return [(xa, ytop - 0.01), (xa + L * 0.15, ytop + size * 0.55), (xa + L * 0.5, ytop + size * 0.85), (xa + L * 0.85, ytop + size * 0.7), (xb, ytop - 0.01)]
    if kind == "sail":
        return [(xa, ytop - 0.01), (xa + L * 0.05, ytop + size * 0.9), (xa + L * 0.35, ytop + size * 1.25), (xa + L * 0.75, ytop + size * 1.4), (xb, ytop + size * 0.6), (xb + 0.02, ytop - 0.01)]
    if kind == "long":
        return [(xa, ytop - 0.01), (xa + L * 0.05, ytop + size * 0.45), (xa + L * 0.6, ytop + size * 0.4), (xb, ytop + size * 0.25), (xb, ytop - 0.01)]
    if kind == "tall":
        return [(xa, ytop - 0.01), (xa - L * 0.3, ytop + size * 1.6), (xa + L * 0.4, ytop + size * 0.9), (xb, ytop - 0.01)]
    if kind == "frill":
        pts = [(xa, ytop - 0.005)]
        n = 10
        for k in range(n + 1):
            t = k / n
            pts.append((xa + L * t, ytop + size * (0.35 + 0.15 * math.sin(t * 14))))
        pts.append((xb, ytop - 0.005))
        return pts
    if kind == "flame":
        pts = [(xa, ytop - 0.01)]
        n = 5
        for k in range(n):
            t = (k + 0.5) / n
            pts.append((xa + L * (t - 0.12), ytop + size * (0.9 + 0.6 * math.sin(math.pi * t))))
            pts.append((xa + L * (t + 0.08), ytop + size * 0.35))
        pts.append((xb, ytop - 0.01))
        return pts
    return None

def eye(a, x, y, z, r, side, iris=0x1a1a22, glow=None):
    a.add(sphere(r, pos=(x, y, z), scale=(1, 1, 0.7), color=0xffffff, sub=2, smooth=True, var=0))
    pc = glow if glow else iris
    a.add(sphere(r * 0.62, pos=(x + r * 0.08, y, z + side * r * 0.45), scale=(1, 1, 0.55), color=pc, sub=2, smooth=True, kind=KIND_GLOW if glow else KIND_TOON, var=0))
    a.add(sphere(r * 0.2, pos=(x + r * 0.3, y + r * 0.3, z + side * r * 0.72), color=0xffffff, sub=1, smooth=True, kind=KIND_GLOW, var=0))

def build_fish(name, spec):
    spec = Spec(spec)
    a = Asset(name)
    shape = spec.shape or "fusi"
    tail = spec.tail or "fork"
    tsize = spec.tsize or (0.22 if tail != "veil" else 0.32)
    H, W = spec.H or 0.3, spec.W or (spec.H or 0.3) * 0.62
    tail_len = 0 if tail in ("none",) else tsize * 0.55
    if shape == "eel":
        tail_len = 0.03
    x_tail_base = -0.5 + tail_len
    body, grid = loft_body(spec, x_tail_base, 0.5, H, W, rings=spec.rings or 18, nseg=14)
    a.add(body)
    def hy(s):
        return H * body_profile(spec, s)
    ped = hy(0)
    tcol = spec.fin or spec.top
    tedge = spec.finedge
    fk = KIND_GLOW if spec.glowfins else KIND_TOON
    if tail not in ("none",):
        tp = tail_points(tail, x_tail_base + 0.03, (spec.cy or 0) * 0, ped, tsize if shape != "eel" else 0.1)
        if tp:
            a.add(fin([(p[0], p[1], 0) for p in tp], tcol, tedge, fk, seed=1))
    # dorsal fin
    dk = spec.dorsal or "round"
    if dk != "none":
        ds = spec.dpos or (0.35, 0.7)
        xa = x_tail_base + (0.5 - x_tail_base) * ds[0]
        xb = x_tail_base + (0.5 - x_tail_base) * ds[1]
        ytop = min(hy(ds[0]), hy(ds[1])) / 2 * 0.92
        dp = dorsal_points(dk, xa, xb, ytop, spec.dsize or H * 0.55)
        if dp:
            a.add(fin([(p[0], p[1], 0) for p in dp], spec.dfin or tcol, tedge, fk, seed=2))
        if spec.dorsal2:
            dp2 = dorsal_points(spec.dorsal2, x_tail_base + 0.04, xa - 0.02, hy(0.2) / 2 * 0.9, (spec.dsize or H * 0.5) * 0.6)
            if dp2:
                a.add(fin([(p[0], p[1], 0) for p in dp2], spec.dfin or tcol, tedge, fk, seed=3))
    # anal fin
    ak = spec.anal or "small"
    if ak != "none":
        ya = -hy(0.25) / 2 * 0.9
        if ak == "small":
            pts = [(x_tail_base + 0.08, ya + 0.01), (x_tail_base + 0.04, ya - H * 0.28), (x_tail_base + 0.2, ya - H * 0.12), (x_tail_base + 0.24, ya + 0.01)]
        elif ak == "long":
            pts = [(x_tail_base + 0.03, ya + 0.01), (x_tail_base + 0.03, ya - H * 0.35), (x_tail_base + 0.45, ya - H * 0.2), (x_tail_base + 0.5, -hy(0.6) / 2 * 0.9 + 0.01)]
        elif ak == "tall":
            pts = [(x_tail_base + 0.12, ya + 0.01), (x_tail_base - 0.08, ya - H * 0.95), (x_tail_base + 0.3, ya - H * 0.4), (x_tail_base + 0.36, ya + 0.01)]
        elif ak == "veil":
            pts = [(x_tail_base + 0.05, ya + 0.01), (x_tail_base - 0.1, ya - H * 0.9), (x_tail_base + 0.2, ya - H * 0.75), (x_tail_base + 0.4, ya + 0.01)]
        else:
            pts = None
        if pts:
            a.add(fin([(p[0], p[1], 0) for p in pts], spec.afin or tcol, tedge, fk, seed=4))
    # pelvic fins (pair, below the belly)
    if spec.pelvic != False and shape not in ("eel",):
        for side in (-1, 1):
            xp = x_tail_base + (0.5 - x_tail_base) * 0.55
            yb = -hy(0.55) / 2 * 0.85
            zp = side * W * 0.18
            a.add(fin([(xp + 0.04, yb, zp), (xp - 0.06, yb - H * 0.25, zp + side * 0.03), (xp - 0.1, yb - H * 0.05, zp)], spec.pfin or tcol, tedge, fk, seed=5 + side))
    # pectoral fins
    pk = spec.pect or "small"
    if pk != "none":
        for side in (-1, 1):
            s0 = 0.72
            xp = x_tail_base + (0.5 - x_tail_base) * s0
            yp = -hy(s0) * 0.12
            zp = side * W * 0.5 * body_profile(spec, s0) ** 0.95 * 0.92
            if pk == "small":
                pts = [(xp, yp + 0.02, zp), (xp - H * 0.45, yp - H * 0.05, zp + side * H * 0.22), (xp - H * 0.3, yp - H * 0.22, zp + side * H * 0.12), (xp, yp - 0.02, zp)]
            elif pk == "wing":
                pts = [(xp + 0.03, yp + 0.02, zp), (xp - 0.25, yp + 0.08, zp + side * 0.42), (xp - 0.42, yp + 0.02, zp + side * 0.36), (xp - 0.2, yp - 0.02, zp + side * 0.08), (xp, yp - 0.02, zp)]
            elif pk == "fan":
                pts = [(xp, yp + 0.02, zp)]
                for k in range(7):
                    ang = -0.4 - k * 0.32
                    pts.append((xp + math.cos(ang) * 0.32, yp + math.sin(ang) * 0.12 + 0.04, zp + side * (0.06 + 0.22 * math.sin(k / 6 * math.pi))))
                pts.append((xp, yp - 0.02, zp))
            elif pk == "lobe":
                pts = [(xp, yp + 0.02, zp), (xp - 0.06, yp - 0.04, zp + side * 0.12), (xp - 0.18, yp - 0.12, zp + side * 0.16), (xp - 0.14, yp - 0.16, zp + side * 0.1), (xp, yp - 0.03, zp)]
            else:
                pts = None
            if pts:
                a.add(fin(pts, spec.pfin or tcol, tedge, fk, seed=8 + side))
    # eyes
    es = spec.eye_s or 0.88
    ex = x_tail_base + (0.5 - x_tail_base) * es
    fe = body_profile(spec, es)
    er = spec.eye or max(0.028, min(0.06, H * 0.13))
    for side in (-1, 1):
        ez = side * (W * fe ** 0.95 / 2) * 0.82
        eye(a, ex, hy(es) * 0.16 + (spec.cy or 0) * math.sin(math.pi * es), ez, er, side, glow=spec.eyeglow)
    # mouth
    mh = hy(0.99) * 0.5
    a.add(box((0.03, max(0.012, H * 0.04), max(0.03, W * 0.35 * body_profile(spec, 0.98))), pos=(0.5, -mh * 0.25 - 0.006, 0), color=spec.mouth or 0x5a2a2a, bevel=0.0, var=0))
    # features
    feats = spec.feats or []
    if "barbels" in feats or "whiskers" in feats:
        n = spec.nbarbel or 2
        for k in range(n):
            side = -1 if k % 2 == 0 else 1
            rank = k // 2
            L = spec.barbel or 0.2
            p0 = (0.49, -mh * 0.2 - rank * 0.02, side * W * 0.1)
            pts = [p0, (0.5 + L * 0.35, p0[1] - L * 0.15, side * (W * 0.15 + L * 0.3)), (0.5 + L * 0.55, p0[1] - L * 0.5 - rank * 0.04, side * (W * 0.2 + L * 0.55))]
            a.add(tube(pts, 0.008, color=spec.barbelcol or spec.top, n=4, r_end=0.004))
            if spec.barbelglow:
                a.add(sphere(0.022, pos=pts[-1], color=spec.barbelglow, kind=KIND_GLOW, sub=1))
    if "lure" in feats:
        p0 = (0.42, hy(0.9) / 2 * 0.9, 0)
        pts = [p0, (0.5, p0[1] + 0.12, 0), (0.62, p0[1] + 0.14, 0), (0.68, p0[1] + 0.06, 0)]
        a.add(tube(pts, 0.009, color=spec.top, n=4))
        a.add(sphere(0.04, pos=pts[-1], color=spec.glow or 0xffd27a, kind=KIND_GLOW, sub=2))
        a.anchor("lure", pts[-1])
    if "glowdots" in feats:
        rng = random.Random(spec.seed or 3)
        for k in range(spec.ndots or 8):
            s = 0.15 + 0.7 * k / max(1, (spec.ndots or 8) - 1)
            x = x_tail_base + (0.5 - x_tail_base) * s
            for side in (-1, 1):
                z = side * W * body_profile(spec, s) ** 0.95 / 2 * 0.98
                a.add(sphere(0.014 + 0.006 * rng.random(), pos=(x, -hy(s) * 0.12 + rng.uniform(-0.01, 0.01), z), color=spec.glow or 0xffd27a, kind=KIND_GLOW, sub=1, var=0))
    if "crystals" in feats:
        rng = random.Random(7)
        for k in range(6):
            s = 0.2 + 0.6 * k / 5
            x = x_tail_base + (0.5 - x_tail_base) * s
            hh = hy(s) / 2
            a.add(cyl(0.025, 0.12 + 0.06 * math.sin(k), pos=(x, hh * 0.85, 0), rot=(0, 0, rng.uniform(-0.3, 0.3)), r2=0.002, n=5, color=spec.glow or 0x9fe9ff, kind=KIND_GLOW, bevel=0, var=0.05))
    if "sword" in feats:
        a.add(cyl(0.022, 0.38, pos=(0.47, -mh * 0.05, 0), rot=(0, 0, -math.pi / 2), r2=0.003, n=6, color=spec.top, bevel=0))
    if "teeth" in feats:
        for k in range(4):
            a.add(cyl(0.01, 0.025, pos=(0.47 - k * 0.018, -mh * 0.25 + 0.004, (k % 2 * 2 - 1) * 0.015), rot=(math.pi, 0, 0), r2=0.0, n=4, color=0xffffff, bevel=0))
    if "scutes" in feats:
        for k in range(9):
            s = 0.1 + 0.8 * k / 8
            x = x_tail_base + (0.5 - x_tail_base) * s
            a.add(sphere(0.022, pos=(x, hy(s) / 2 * 0.95, 0), scale=(1.4, 0.9, 1), color=spec.scute or 0xf2f7ff, sub=1, smooth=False))
            for side in (-1, 1):
                a.add(sphere(0.016, pos=(x, 0.0, side * W * body_profile(spec, s) ** 0.95 / 2 * 0.95), color=spec.scute or 0xf2f7ff, sub=1, smooth=False))
    if "crown" in feats:
        for k in range(5):
            ang = -0.6 + k * 0.3
            a.add(cyl(0.012, 0.07 + (0.03 if k == 2 else 0), pos=(0.3 + math.sin(ang) * 0.03, hy(0.8) / 2 * 0.9, math.sin(ang) * 0.05), r2=0.0, n=4, color=0xffd34d, kind=KIND_GLOW, bevel=0))
    if "spikes" in feats:
        rng = random.Random(5)
        for k in range(26):
            s = rng.uniform(0.1, 0.9)
            th = rng.uniform(0, math.tau)
            x = x_tail_base + (0.5 - x_tail_base) * s
            f = body_profile(spec, s)
            y = math.sin(th) * H * f / 2
            z = math.cos(th) * W * f / 2
            n = Vector((0, y / (H * f / 2 + 1e-6), z / (W * f / 2 + 1e-6))).normalized()
            a.add(cyl(0.012, 0.05, pos=(x, y, z), rot=(math.atan2(n.z, n.y), 0, 0), r2=0.0, n=4, color=spec.accent or 0x8a6a3a, bevel=0))
    if "lionrays" in feats:
        for k in range(8):
            t = k / 7
            x = x_tail_base + (0.5 - x_tail_base) * (0.3 + 0.45 * t)
            yb = hy(0.3 + 0.45 * t) / 2 * 0.9
            top = (x - 0.04, yb + 0.22 + 0.08 * math.sin(t * 3), 0)
            a.add(tube([(x, yb, 0), top], 0.007, color=0xfff0d0, n=4, r_end=0.003))
            a.add(sphere(0.012, pos=top, color=spec.glow or 0xff7a2a, kind=KIND_GLOW, sub=1))
    if "gills_frill" in feats:
        for side in (-1, 1):
            for k in range(3):
                base = (0.3, 0.02 + (k - 1) * 0.05, side * W * 0.4)
                tip = (0.18, 0.1 + (k - 1) * 0.1, side * (W * 0.4 + 0.12))
                a.add(tube([base, tip], 0.012, color=spec.glow or 0xff9fd6, n=4, r_end=0.006, kind=KIND_GLOW) if False else tube([base, tip], 0.012, color=spec.glow or 0xff9fd6, n=4, r_end=0.006))
                for j in range(3):
                    t = (j + 1) / 4
                    p = (base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t)
                    a.add(sphere(0.016, pos=p, scale=(1, 0.5, 1), color=spec.glow or 0xff9fd6, kind=KIND_GLOW, sub=1))
    if "legs" in feats:
        for sx in (0.22, -0.12):
            for side in (-1, 1):
                a.add(tube([(sx, -hy(0.5) * 0.25, side * W * 0.4), (sx + 0.02, -hy(0.5) * 0.5, side * (W * 0.4 + 0.08)), (sx + 0.05, -hy(0.5) * 0.6, side * (W * 0.4 + 0.12))], 0.018, color=spec.top, n=5, r_end=0.012))
    if "stars" in feats:
        rng = random.Random(9)
        for k in range(10):
            s = rng.uniform(0.1, 0.85)
            th = rng.uniform(0.2, math.pi - 0.2)
            x = x_tail_base + (0.5 - x_tail_base) * s
            f = body_profile(spec, s)
            a.add(sphere(0.011, pos=(x, math.sin(th) * H * f / 2 * 0.98, math.cos(th) * W * f / 2 * 0.98), color=0xffffff, kind=KIND_GLOW, sub=1, var=0))
    if "fluke" in feats:
        pass
    a.meta = {"H": H, "W": W}
    return a

def build_ray(name, spec):
    spec = Spec(spec)
    a = Asset(name)
    bm = bmesh.new()
    # diamond disc: nose +x, wings +-z
    n = 16
    pts = []
    for k in range(n):
        ang = k / n * math.tau
        r = 0.42 * (1 - 0.25 * math.cos(2 * ang) ** 2) if True else 0.4
        x = math.cos(ang) * 0.3
        z = math.sin(ang) * 0.48
        if abs(math.sin(ang)) > 0.9:
            x -= 0.08
        pts.append((x + 0.12, z))
    top = [bm.verts.new(G(px, 0.04 * (1 - (px - 0.12) ** 2 * 4 - pz * pz * 3), pz)) for (px, pz) in pts]
    bot = [bm.verts.new(G(px, -0.02, pz)) for (px, pz) in pts]
    ct = bm.verts.new(G(0.12, 0.09, 0)); cb = bm.verts.new(G(0.12, -0.04, 0))
    col = bm.loops.layers.float_color.new("Col"); kl = bm.faces.layers.int.new("kind")
    topc, bellyc, acc = hexrgb(spec.top), hexrgb(spec.belly), hexrgb(spec.accent)
    for k in range(n):
        f = bm.faces.new([ct, top[k], top[(k + 1) % n]])
        stripe = (k % 3 == 0)
        c = acc if stripe else topc
        for l in f.loops: l[col] = (*c, 1.0)
        f.smooth = True
        f2 = bm.faces.new([cb, bot[(k + 1) % n], bot[k]])
        for l in f2.loops: l[col] = (*bellyc, 1.0)
        f3 = bm.faces.new([top[k], bot[k], bot[(k + 1) % n], top[(k + 1) % n]])
        for l in f3.loops: l[col] = (*topc, 1.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    a.add(Part(bm))
    a.add(tube([(-0.16, 0.0, 0), (-0.35, 0.01, 0), (-0.5, 0.03, 0)], 0.018, color=spec.top, n=5, r_end=0.004))
    a.add(cyl(0.012, 0.06, pos=(-0.34, 0.01, 0), rot=(0, 0, math.pi / 2 + 0.4), r2=0.0, n=4, color=0xfff0d0, bevel=0))
    for side in (-1, 1):
        eye(a, 0.32, 0.06, side * 0.07, 0.025, side)
    return a

def build_turtle(name, spec):
    spec = Spec(spec)
    a = Asset(name)
    shell = lathe([(0.38, -0.02), (0.4, 0.04), (0.34, 0.14), (0.22, 0.22), (0.0, 0.25)], scale=(1, 1, 0.85), color=spec.top, n=14, smooth=False)
    rng = random.Random(4)
    paint_where(shell, spec.accent, lambda n, c: n.z > 0.75 and rng.random() < 0.6)
    a.add(shell)
    a.add(cyl(0.37, 0.05, pos=(0, -0.06, 0), color=spec.belly, n=14, scale=(1, 1, 0.85), bevel=0.01))
    # scute rings
    for k in range(5):
        ang = k / 5 * math.tau
        a.add(sphere(0.07, pos=(math.cos(ang) * 0.18, 0.2, math.sin(ang) * 0.15), scale=(1, 0.35, 1), color=mix(hexrgb(spec.top), (0, 0, 0), 0.2), sub=1))
    for k in range(5):
        ang = rng.uniform(0, math.tau); rr = rng.uniform(0, 0.15)
        a.add(sphere(0.035, pos=(math.cos(ang) * rr, 0.25, math.sin(ang) * rr), color=[0xffffff, 0xff9fcb, 0xffd34d][k % 3], sub=1))
        a.add(blade((math.cos(ang) * rr + 0.05, 0.22, math.sin(ang) * rr), 0.1, 0.04, color=0x6fbf4a, seed=k))
    head = sphere(0.1, pos=(0.44, 0.02, 0), scale=(1.3, 0.9, 0.9), color=spec.skin, sub=2)
    a.add(head)
    for side in (-1, 1):
        eye(a, 0.5, 0.06, side * 0.06, 0.03, side)
        for fx in (0.22, -0.2):
            a.add(sphere(0.09, pos=(fx, -0.04, side * 0.36), rot=(0, side * (0.5 if fx > 0 else -0.4), 0), scale=(1.4, 0.35, 0.8), color=spec.skin, sub=1))
    a.add(cyl(0.04, 0.12, pos=(-0.38, -0.02, 0), rot=(0, 0, math.pi / 2), r2=0.0, n=6, color=spec.skin, bevel=0))
    return a

def build_seadragon(name, spec):
    spec = Spec(spec)
    a = Asset(name)
    pts = [(0.45, 0.12, 0), (0.33, 0.12, 0), (0.22, 0.05, 0), (0.12, -0.02, 0), (0.0, 0.0, 0), (-0.12, 0.05, 0), (-0.25, 0.03, 0), (-0.36, -0.05, 0), (-0.42, -0.14, 0), (-0.36, -0.2, 0)]
    a.add(tube(pts, 0.07, color=spec.top, n=8, r_end=0.012, smooth=True))
    a.add(sphere(0.08, pos=(0.33, 0.13, 0), scale=(1.2, 1, 0.85), color=spec.top, sub=2))
    a.add(cyl(0.025, 0.14, pos=(0.4, 0.12, 0), rot=(0, 0, -math.pi / 2), r2=0.012, n=6, color=spec.top, bevel=0))
    cols = [hexrgb(x) for x in spec.leafcols]
    for k, p in enumerate(pts[1:-1]):
        for side in (-1, 1):
            c = cols[k % len(cols)]
            a.add(leaf((p[0], p[1] + 0.04, p[2]), (0.3 * side, 1.0), 0.12, 0.05, droop=0.2, color=c, seed=k * 2 + (side > 0)))
            a.add(sphere(0.018, pos=(p[0], p[1] + 0.07, side * 0.06), color=c, kind=KIND_GLOW, sub=1))
    for side in (-1, 1):
        eye(a, 0.35, 0.16, side * 0.06, 0.028, side)
    return a

FISH = {}
def F(name, **kw):
    FISH[name] = kw

# Lantern Lake
F("pebble_perch", H=0.32, top=0x6f8a35, belly=0xf2e6b0, fin=0xff8a3c, pattern="bars", accent=0x3e5a22, bars=5, tail="fork", dorsal="spiky", dorsal2="round", seed=11)
F("lily_minnow", H=0.22, top=0x8fb8a8, belly=0xffffff, fin=0xffb3c7, finedge=0xff7eb6, pattern="lateral", accent=0xff9fbf, lat=0.16, tail="fork", dorsal="round", dsize=0.08, seed=12)
F("bubblecarp", H=0.38, W=0.27, top=0xc9a24a, belly=0xf6e3a8, fin=0xd98b3a, pattern="scales", tail="round", dorsal="long", dpos=(0.25, 0.72), feats=["barbels"], nbarbel=2, barbel=0.08, blunt=0.3, seed=13)
F("reed_pike", H=0.2, W=0.15, shape="long", top=0x4f7a3a, belly=0xe8e6b0, fin=0x9a7a3a, pattern="spots", accent=0xf2e8a0, dens=0.3, tail="square", dorsal="round", dpos=(0.08, 0.28), anal="small", nose_pow=0.45, blunt=0.1, peak=0.45, seed=14)
F("sunspot_bream", H=0.5, W=0.13, top=0x4f8fc0, belly=0xf6d65a, fin=0x3a6f9a, pattern="sunspot", accent=0xff7a1a, glowpat=True, tail="fork", dorsal="spiky", dsize=0.16, anal="long", peak=0.55, seed=15)
F("lantern_catfish", H=0.24, W=0.3, top=0x4a4f5a, belly=0xbfc6cf, fin=0x3a3f48, pattern="", tail="round", dorsal="round", dsize=0.08, dpos=(0.55, 0.72), anal="long", blunt=0.45, feats=["barbels", "glowdots"], nbarbel=4, barbel=0.28, barbelglow=0xffd27a, glow=0xffd27a, ndots=7, sq=2.6, seed=16)
F("ribbon_trout", H=0.24, top=0x6f8f7a, belly=0xfff0f5, fin=0x8fae9a, pattern="lateral spots", accent=0xff7eb6, lat=0.2, dens=0.08, tail="fork", dorsal="round", seed=17)
F("elder_koi", H=0.3, W=0.25, top=0xfff8f0, belly=0xfff8f0, fin=0xfff4e8, finedge=0xffb52e, pattern="koi", accent=0xe8463a, blobs=[(0.3, 0.5, 0.17), (0.6, 1.1, 0.13), (0.82, 0.2, 0.1)], tail="veil", tsize=0.3, dorsal="long", dpos=(0.3, 0.7), feats=["barbels"], nbarbel=2, barbel=0.12, barbelcol=0xffd34d, blunt=0.3, seed=18)
F("lantern_eel", shape="eel", H=0.1, W=0.09, top=0x23345a, belly=0x6f8fbf, fin=0x3a5a9a, finedge=0x9fc4ff, pattern="", tail="point", dorsal="frill", dpos=(0.05, 0.75), dsize=0.06, anal="none", pect="small", pelvic=False, feats=["lure", "glowdots"], glow=0xffd27a, ndots=9, eye=0.022, seed=19)
# Willow River
F("river_dace", H=0.2, top=0x7f9aa8, belly=0xeaf1f6, fin=0xffc27a, pattern="lateral", accent=0xc9d6e0, lat=0.12, tail="fork", dorsal="round", dsize=0.08, seed=21)
F("stream_chub", H=0.28, W=0.22, top=0x6a6a4a, belly=0xe6d9a8, fin=0xd08a5a, pattern="scales", tail="square", dorsal="round", blunt=0.35, seed=22)
F("mud_loach", shape="eel", H=0.14, W=0.12, top=0x8a6a4a, belly=0xd9c49a, fin=0x7a5a3a, pattern="spots", accent=0x4a3220, dens=0.35, tail="round", tsize=0.12, dorsal="round", dsize=0.05, dpos=(0.3, 0.45), anal="none", feats=["barbels"], nbarbel=6, barbel=0.08, eye=0.02, seed=23)
F("willow_trout", H=0.26, top=0x5f8a5a, belly=0xfff2d0, fin=0x9a8a5a, finedge=0xffffff, pattern="spots", accent=0xe8463a, dens=0.16, tail="fork", dorsal="round", seed=24)
F("copper_bass", H=0.32, W=0.24, top=0x8a4a22, belly=0xf2c08a, fin=0xc8743a, pattern="bars", accent=0x6a3418, bars=4, tail="square", dorsal="spiky", dorsal2="round", blunt=0.3, seed=25)
F("shadow_gar", shape="long", H=0.14, W=0.12, top=0x2a3036, belly=0x5a6a70, fin=0x3a4048, finedge=0x8a7aff, pattern="spots", accent=0x15181c, dens=0.3, tail="round", tsize=0.18, dorsal="round", dsize=0.07, dpos=(0.03, 0.18), anal="small", nose_pow=0.35, blunt=0.06, peak=0.35, feats=["teeth"], eyeglow=0xb46bff, seed=26)
F("thunder_barbel", H=0.26, top=0x3a4f8a, belly=0xdfe8ff, fin=0x2a3f7a, finedge=0xfff07a, pattern="zigzag", accent=0xfff07a, glowpat=True, tail="fork", dorsal="spiky", feats=["barbels"], nbarbel=4, barbel=0.12, seed=27)
F("golden_salmon", H=0.3, top=0xe08a1a, belly=0xfff2b0, fin=0xffc23a, finedge=0xfff0a0, pattern="spots", accent=0xfff5c0, glowpat=True, dens=0.1, tail="fork", dorsal="round", dorsal2="round", hump=0.4, seed=28)
F("mossback_turtle", builder="turtle", top=0x5a7a3a, accent=0x7fbf4a, belly=0xe8d9a0, skin=0x8fae6a)
# Coral Bay
F("sand_snapper", H=0.34, top=0xe8846a, belly=0xfff0e0, fin=0xffb3a0, pattern="lateral", accent=0xffd34d, lat=0.08, tail="fork", dorsal="spiky", dorsal2="round", seed=31)
F("polka_puffer", H=0.62, W=0.58, top=0xf6c84a, belly=0xffffff, fin=0xf6c84a, pattern="spots", accent=0x3a2a1a, dens=0.28, tail="round", tsize=0.14, dorsal="round", dsize=0.08, dpos=(0.15, 0.3), anal="small", peak=0.5, blunt=0.4, ped=0.22, feats=["spikes"], eye=0.07, pelvic=False, seed=32)
F("candy_wrasse", H=0.25, top=0xff7eb6, belly=0xffffff, fin=0x7fe0c0, pattern="bands", bandcols=[0xff7eb6, 0xffffff, 0x7fe0c0], bands=9, tail="round", dorsal="long", dpos=(0.2, 0.75), seed=33)
F("coral_grouper", H=0.34, W=0.3, top=0xc0503a, belly=0xf2b8a0, fin=0xa8402e, finedge=0x5ac8ff, pattern="spots", accent=0x5ac8ff, dens=0.2, tail="round", dorsal="spiky", dorsal2="round", blunt=0.35, eye=0.04, seed=34)
F("glass_flyingfish", H=0.2, top=0x5a9ad8, belly=0xdff3ff, fin=0xbfe8ff, finedge=0x5ac8ff, pattern="lateral", accent=0xbfe8ff, lat=0.1, tail="fork", tsize=0.26, dorsal="round", dsize=0.06, pect="wing", seed=35)
F("sapphire_tang", H=0.56, W=0.14, top=0x1f5fff, belly=0x2f6fff, fin=0x1a4fd0, pattern="koi", accent=0x0a2a6a, blobs=[(0.5, 1.2, 0.2), (0.25, 0.5, 0.1)], tail="lunate", dfin=0x1a4fd0, dorsal="long", dpos=(0.1, 0.8), anal="long", peak=0.5, seed=36)
F("tiger_ray", builder="ray", top=0xe0a050, belly=0xfff6e8, accent=0x3a2a1a)
F("sunfin_marlin", shape="long", H=0.2, W=0.14, top=0x2a4f8a, belly=0xdfe8ff, fin=0x2a4f8a, dfin=0xffb52e, finedge=0xffe27a, pattern="bars", accent=0x5ac8ff, bars=6, tail="lunate", tsize=0.26, dorsal="sail", dpos=(0.3, 0.85), dsize=0.17, feats=["sword"], nose_pow=0.5, blunt=0.12, seed=37)
F("prism_seadragon", builder="seadragon", top=0x9a7aff, leafcols=[0xff7eb6, 0xffd34d, 0x7affc0, 0x7ac7ff, 0xb46bff])
# Frost Lake
F("icefin_smelt", H=0.18, top=0x9fc8e0, belly=0xf2fbff, fin=0xbfe8ff, finedge=0xffffff, pattern="lateral", accent=0xdff3ff, lat=0.1, tail="fork", dorsal="round", dsize=0.06, seed=41)
F("snow_char", H=0.26, top=0x5a6f7a, belly=0xffa070, fin=0xff8a5c, finedge=0xffffff, pattern="spots", accent=0xffffff, dens=0.2, tail="square", dorsal="round", seed=42)
F("frost_perch", H=0.32, top=0x6fa0c0, belly=0xeaf6ff, fin=0x9fd0f0, pattern="bars", accent=0x2a5a8a, bars=5, tail="fork", dorsal="spiky", dorsal2="round", seed=43)
F("glacier_pike", shape="long", H=0.2, W=0.15, top=0x7fb0d0, belly=0xffffff, fin=0xbfe0f0, pattern="spots", accent=0xffffff, dens=0.3, tail="square", dorsal="round", dpos=(0.08, 0.28), nose_pow=0.45, blunt=0.1, peak=0.45, seed=44)
F("polar_grayling", H=0.26, top=0x8a96a4, belly=0xe8eef4, fin=0x8a7aff, dfin=0x8a7aff, finedge=0xff7eb6, pattern="spots", accent=0x2a2f3a, dens=0.1, tail="fork", dorsal="sail", dsize=0.14, dpos=(0.35, 0.8), seed=45)
F("blizzard_burbot", shape="eel", H=0.18, W=0.15, top=0x6a7a8a, belly=0xdfe8ff, fin=0x5a6a7a, pattern="spots", accent=0xffffff, dens=0.3, tail="round", tsize=0.14, dorsal="long", dpos=(0.05, 0.55), dsize=0.07, anal="long", feats=["barbels"], nbarbel=1, barbel=0.08, seed=46)
F("aurora_trout", H=0.26, top=0x2a6a5a, belly=0xf0f6ff, fin=0x7affc0, finedge=0xb46bff, pattern="gradient lateral", g0=0x7affc0, g1=0xb46bff, accent=0x9ffff0, glowpat=True, lat=0.12, tail="fork", dorsal="round", seed=47)
F("mammoth_sturgeon", shape="long", H=0.2, W=0.2, top=0x6a7480, belly=0xdfe3e8, fin=0x5a6470, pattern="", tail="shark", tsize=0.26, dorsal="round", dsize=0.06, dpos=(0.1, 0.25), feats=["barbels", "scutes"], nbarbel=4, barbel=0.08, nose_pow=0.4, blunt=0.08, peak=0.5, seed=48)
F("crystal_koi", H=0.3, W=0.25, top=0xd8f4ff, belly=0xf4fcff, fin=0xbfeeff, finedge=0x7fe7ff, glowfins=True, pattern="koi", accent=0x7fe7ff, glowpat=True, blobs=[(0.35, 0.6, 0.15), (0.66, 0.3, 0.12)], tail="veil", tsize=0.3, dorsal="long", feats=["crystals", "barbels"], nbarbel=2, barbel=0.1, glow=0x9fe9ff, blunt=0.3, seed=49)
# Ember Lagoon
F("cinder_minnow", H=0.2, top=0x4a4446, belly=0x8a7a70, fin=0x5a5254, finedge=0xff7a2a, pattern="spots", accent=0xff7a2a, glowpat=True, dens=0.15, tail="fork", dorsal="round", dsize=0.06, seed=51)
F("ash_carp", H=0.36, W=0.26, top=0x8f8a86, belly=0xd8d0c8, fin=0x5a5254, pattern="scales", tail="round", dorsal="long", dpos=(0.25, 0.72), eyeglow=0xff3a1a, blunt=0.3, seed=52)
F("ember_goby", H=0.24, W=0.22, top=0xd8562a, belly=0xffb070, fin=0xff8a3c, pattern="spots", accent=0xffe27a, glowpat=True, dens=0.15, tail="round", dorsal="round", dorsal2="spiky", blunt=0.4, eye=0.04, seed=53)
F("magma_eel", shape="eel", H=0.1, W=0.09, top=0x2a2426, belly=0x4a3a36, fin=0xff6a1f, glowfins=True, pattern="cracks", accent=0xff6a1f, glowpat=True, tail="point", dorsal="frill", dpos=(0.05, 0.8), dsize=0.05, anal="none", pelvic=False, eye=0.022, eyeglow=0xffb347, seed=54)
F("obsidian_piranha", H=0.48, W=0.2, top=0x2a2630, belly=0xd83a2a, fin=0x3a3040, finedge=0x9a6aff, pattern="", tail="fork", dorsal="round", dsize=0.08, dpos=(0.35, 0.55), anal="long", peak=0.55, blunt=0.42, feats=["teeth"], seed=55)
F("lava_lionfish", H=0.34, W=0.2, top=0xff7a2a, belly=0xfff0d0, fin=0xfff0d0, finedge=0xff7a2a, pattern="bars", accent=0xfff0d0, bars=7, tail="round", dorsal="none", pect="fan", feats=["lionrays"], glow=0xff5a1a, seed=56)
F("blaze_arowana", shape="long", H=0.24, W=0.14, top=0xb83a1a, belly=0xffd27a, fin=0xff5a1a, finedge=0xffe27a, pattern="scales", tail="round", tsize=0.2, dorsal="long", dpos=(0.05, 0.3), anal="long", feats=["barbels"], nbarbel=2, barbel=0.12, barbelcol=0xffb52e, nose_pow=0.6, blunt=0.25, seed=57)
F("ancient_embercanth", H=0.32, W=0.24, top=0x2a3a5a, belly=0x6a7a9a, fin=0x2a3a5a, finedge=0xff7a2a, pattern="spots cracks", accent=0xffffff, dens=0.12, tail="tri", tsize=0.24, dorsal="round", dorsal2="round", pect="lobe", blunt=0.35, seed=58)
F("phoenix_fin", H=0.28, top=0xff5a1a, belly=0xffd27a, fin=0xff7a1a, finedge=0xffe27a, glowfins=True, pattern="gradient", g0=0xff3a1a, g1=0xffb52e, tail="veil", tsize=0.34, dorsal="flame", dsize=0.12, anal="veil", seed=59)
# Moon Pond
F("moon_minnow", H=0.2, top=0x8a9ae0, belly=0xeef2ff, fin=0xc8d4ff, pattern="crescent", accent=0xfff7c0, glowpat=True, tail="fork", dorsal="round", dsize=0.06, seed=61)
F("star_guppy", H=0.24, top=0x9a8aff, belly=0xe8e0ff, fin=0xff7eb6, finedge=0x7a5aff, glowfins=False, pattern="", tail="veil", tsize=0.3, dorsal="round", dsize=0.08, feats=["stars"], seed=62)
F("dusk_bream", H=0.45, W=0.15, top=0x6a4ab0, belly=0xffc08a, fin=0x8a5ac0, pattern="gradient", g0=0x6a4ab0, g1=0xff9a5a, tail="fork", dorsal="spiky", dsize=0.12, anal="long", peak=0.55, seed=63)
F("nebula_betta", H=0.26, top=0x5a3aa8, belly=0x9a6ae0, fin=0xd06aff, finedge=0x5ac8ff, pattern="gradient", g0=0x3a2a98, g1=0xd06aff, tail="veil", tsize=0.42, dorsal="frill", dsize=0.2, dpos=(0.1, 0.6), anal="veil", pect="small", feats=["stars"], seed=64)
F("comet_koi", H=0.28, W=0.24, top=0xffffff, belly=0xffffff, fin=0xdff6ff, finedge=0x5ac8ff, glowfins=True, pattern="koi", accent=0x3a8aff, blobs=[(0.4, 0.5, 0.16), (0.75, 1.0, 0.11)], tail="veil", tsize=0.4, dorsal="long", feats=["barbels"], nbarbel=2, barbel=0.1, blunt=0.3, seed=65)
F("ghost_catfish", H=0.22, W=0.26, top=0xdfe8ff, belly=0xf4f8ff, fin=0xeaf0ff, finedge=0x9fc4ff, pattern="bars", accent=0xb8c8e8, bars=9, tail="round", dorsal="round", dsize=0.06, dpos=(0.55, 0.72), anal="long", blunt=0.45, eyeglow=0x9ff0ff, feats=["barbels"], nbarbel=4, barbel=0.26, barbelcol=0xdfe8ff, sq=2.6, seed=66)
F("eclipse_angelfish", H=0.5, W=0.1, top=0x1a1a2a, belly=0x2a2a3a, fin=0x1a1a2a, finedge=0xffd27a, pattern="rings", accent=0xffd27a, glowpat=True, tail="lunate", dorsal="tall", dsize=0.2, dpos=(0.4, 0.7), anal="tall", peak=0.55, seed=67)
F("moonlit_sovereign", shape="long", H=0.24, W=0.2, top=0x7a86b0, belly=0xeef2ff, fin=0x8a6aff, finedge=0xd6c8ff, pattern="scales", tail="round", tsize=0.22, dorsal="long", dpos=(0.05, 0.3), anal="long", feats=["crown", "glowdots"], glow=0xc8d4ff, ndots=8, nose_pow=0.6, blunt=0.25, seed=68)
F("starlit_axolotl", H=0.22, W=0.22, top=0xc8a8ff, belly=0xe8d8ff, fin=0xd8c0ff, finedge=0xff9fd6, pattern="", tail="round", tsize=0.26, dorsal="frill", dsize=0.08, dpos=(0.0, 0.7), anal="none", pect="none", pelvic=False, feats=["gills_frill", "legs", "stars"], glow=0xff9fd6, blunt=0.5, eye=0.03, seed=69)

ORDER = list(FISH.keys())

def build(name):
    spec = FISH[name]
    b = spec.get("builder")
    if b == "turtle":
        return build_turtle(name, spec)
    if b == "ray":
        return build_ray(name, spec)
    if b == "seadragon":
        return build_seadragon(name, spec)
    return build_fish(name, spec)
