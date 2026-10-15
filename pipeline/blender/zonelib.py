"""Zone builder: heightfield terrain from 2D shapes, depth-coded water, scattered prop instances,
colliders (ground, shore walls, prop colliders) and anchors. Local zone coordinates (GAME x/z, metres,
-Z = north); the game adds the zone centre."""
import math, random, json, os
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, LineString, MultiPolygon, box as sbox
from shapely.ops import unary_union
from lib import *

GROUND = 1.0
EXT = 120.0          # half extent of the zone square
WATER_R = 150.0      # zone water is a disc; the game rings it with open sea

def blob(cx, cz, r, seed, wobble=0.18, n=48, sx=1.0, sz=1.0):
    rng = random.Random(seed)
    ph = [rng.uniform(0, math.tau) for _ in range(4)]
    pts = []
    for i in range(n):
        a = i / n * math.tau
        k = 1 + wobble * (0.5 * math.sin(2 * a + ph[0]) + 0.3 * math.sin(3 * a + ph[1]) + 0.2 * math.sin(5 * a + ph[2]))
        pts.append((cx + math.cos(a) * r * k * sx, cz + math.sin(a) * r * k * sz))
    return Polygon(pts).buffer(0)

def rect(x0, z0, x1, z1):
    return sbox(min(x0, x1), min(z0, z1), max(x0, x1), max(z0, z1))

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def noise2(x, z, seed=0, scale=0.08):
    """Cheap smooth value noise (sum of sines) usable on numpy arrays."""
    r = random.Random(seed)
    v = 0
    for k in range(4):
        fx, fz = r.uniform(0.6, 1.4) * scale * (1.7 ** k), r.uniform(0.6, 1.4) * scale * (1.7 ** k)
        ph = r.uniform(0, 6.28)
        v = v + np.sin(x * fx + ph) * np.cos(z * fz - ph * 0.7) / (1.6 ** k)
    return v / 1.6

class Zone:
    def __init__(self, key, seed, palette):
        self.key = key
        self.seed = seed
        self.pal = palette
        self.walk_land = None    # walkable ground (terrain at GROUND)
        self.walk_extra = []     # docks/bridges: walkable at GROUND over water
        self.hills = []          # (polygon, height, ramp)
        self.paths = []          # (LineString, width)
        self.plazas = []         # polygons painted as plaza
        self.instances = []      # [prop, x, y, z, yaw, scale]
        self.colliders = []      # boxes: [cx, cy, cz, w, h, d, yaw]
        self.anchors = {}
        self.no_scatter = []     # polygons where nothing is scattered
        self.water_override = [] # (polygon, depth) forced water (e.g. ice holes)
        self.special = []        # extra Assets merged into the zone mesh
        self.lights = []
        self.ice = None          # polygon frozen at GROUND (Frost)
        self.lava = []           # polylines of glowing lava
        self.sand_band = 3.5

    # ── height ──
    def height_grid(self, xs, zs):
        X, Z = np.meshgrid(xs, zs)
        pts = shapely.points(X.ravel(), Z.ravel())
        inside = shapely.contains(self.walk_land, pts).reshape(X.shape)
        dist = shapely.distance(self.walk_land.boundary, pts).reshape(X.shape)
        n = noise2(X, Z, self.seed, 0.06)
        # shore profile outside walkable land
        t = dist
        bank = np.where(t < 0.8, 0.12 * t / 0.8, 0.12 + (t - 0.8) / 1.8 * 0.9)
        h = np.where(t < 2.6, GROUND - bank, 0.0)
        deep = np.clip((t - 2.6) / 6.0, 0, 1) * 1.3 + np.clip((t - 8.6) / 14.0, 0, 1) * 1.8 + np.clip((t - 22.6) / 25.0, 0, 1) * 2.4
        h = np.where(t >= 2.6, -0.02 - deep + n * 0.25 * np.clip(t / 10, 0, 1), h)
        h = np.where(inside, GROUND + n * 0.02, h)
        for (poly, hh, ramp) in self.hills:
            ins = shapely.contains(poly, pts).reshape(X.shape)
            d = shapely.distance(poly.boundary, pts).reshape(X.shape)
            k = sstep(0, ramp, d)
            k = k * (0.75 + 0.25 * sstep(ramp, ramp * 2.2, d))
            hill = GROUND + hh * k * (0.82 + 0.3 * noise2(X, Z, self.seed + 5, 0.07)) + n * 0.5 * k
            h = np.where(ins, np.maximum(h, hill), h)
        for (poly, depth) in self.water_override:
            ins = shapely.contains(poly, pts).reshape(X.shape)
            h = np.where(ins, -depth, h)
        return h

    def height_at(self, x, z):
        return float(self.height_grid(np.array([x]), np.array([z]))[0, 0])

    # ── terrain mesh ──
    def terrain(self, step=1.6, ext=EXT):
        xs = np.arange(-ext, ext + 0.01, step)
        zs = np.arange(-ext, ext + 0.01, step)
        H = self.height_grid(xs, zs)
        self.H, self.xs, self.zs = H, xs, zs
        bm = bmesh.new()
        col = bm.loops.layers.float_color.new("Col")
        kl = bm.faces.layers.int.new("kind")
        nx, nz = len(xs), len(zs)
        verts = {}
        def V(i, j):
            v = verts.get((i, j))
            if v is None:
                v = bm.verts.new(G(xs[i], H[j, i], zs[j]))
                verts[(i, j)] = v
            return v
        rng = random.Random(self.seed)
        pal = self.pal
        path_geom = unary_union([ls.buffer(w / 2) for (ls, w) in self.paths]) if self.paths else None
        plaza_geom = unary_union(self.plazas) if self.plazas else None
        for j in range(nz - 1):
            for i in range(nx - 1):
                hs = (H[j, i], H[j, i + 1], H[j + 1, i + 1], H[j + 1, i])
                if max(hs) < -3.2:
                    continue
                cx, cz = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
                hc = sum(hs) / 4
                slope = (max(hs) - min(hs)) / step
                # split along the shorter diagonal for smoother shapes
                quads = ([(i, j), (i + 1, j), (i + 1, j + 1)], [(i, j), (i + 1, j + 1), (i, j + 1)])
                for tri in quads:
                    try:
                        f = bm.faces.new([V(*tri[2]), V(*tri[1]), V(*tri[0])])
                    except ValueError:
                        continue
                    c = self.ground_color(cx, cz, hc, slope, rng, path_geom, plaza_geom)
                    f[kl] = KIND_TOON
                    for l in f.loops:
                        l[col] = (*c, 1.0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
        return Part(bm)

    def ground_color(self, x, z, h, slope, rng, path_geom, plaza_geom):
        pal = self.pal
        # two octaves of smooth noise pick a blend between the grass tones (no stripes)
        nv = 0.5 + 0.35 * math.sin(x * 0.07 + self.seed) * math.cos(z * 0.06 - self.seed * 0.5) + 0.15 * math.sin(x * 0.19 - z * 0.17 + 1.3)
        gs = pal["grass"]
        f = max(0.0, min(0.999, nv)) * (len(gs) - 1)
        k = int(f)
        grass = mix(hexrgb(gs[k]), hexrgb(gs[min(k + 1, len(gs) - 1)]), f - k)
        if h < -0.25:
            c = mix(hexrgb(pal["sand_wet"]), hexrgb(pal["seabed"]), min(1, (-h - 0.25) / 2.5))
        elif h < 0.35:
            c = hexrgb(pal["sand_wet"]) if h < 0.08 else hexrgb(pal["sand"])
        elif h < GROUND - 0.12 and slope < 0.8:
            c = mix(hexrgb(pal["sand"]), grass, (h - 0.35) / (GROUND - 0.47))
        elif h > GROUND + 0.4:
            hill = hexrgb(pal["hill"]) if "hill" in pal else grass
            c = mix(grass, hill, min(1.0, (h - GROUND) / 6.0))
            if slope > 0.85:
                c = mix(c, hexrgb(pal["rock"]), min(1.0, (slope - 0.85) * 2.5))
            if "snowline" in pal and h > GROUND + pal["snowline"]:
                c = hexrgb(pal["snow"])
        else:
            c = grass
        if plaza_geom is not None and abs(h - GROUND) < 0.2 and plaza_geom.contains(Point(x, z)):
            c = hexrgb(pal["plaza"])
        return jitter(c, rng, 0.025, 0.006)

    # ── water ──
    def water(self, step=3.0, ext=WATER_R + 3):
        xs = np.arange(-ext, ext + 0.01, step)
        zs = np.arange(-ext, ext + 0.01, step)
        H = self.height_grid(xs, zs)
        bm = bmesh.new()
        col = bm.loops.layers.float_color.new("Col")
        kl = bm.faces.layers.int.new("kind")
        verts = {}
        def V(i, j):
            v = verts.get((i, j))
            if v is None:
                v = bm.verts.new(G(xs[i], 0.0, zs[j]))
                verts[(i, j)] = v
            return v
        for j in range(len(zs) - 1):
            for i in range(len(xs) - 1):
                hs = (H[j, i], H[j, i + 1], H[j + 1, i + 1], H[j + 1, i])
                if min(hs) > 0.25:
                    continue
                if math.hypot((xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2) > WATER_R:
                    continue
                f = bm.faces.new([V(i, j + 1), V(i + 1, j + 1), V(i + 1, j), V(i, j)])
                f[kl] = KIND_WATER
        # per-vertex depth colour: r = depth / 6, g = shore foam (1 at the shore), b = 0
        idx = {v: k for k, v in verts.items()}
        for f in bm.faces:
            for l in f.loops:
                i, j = idx[l.vert]
                d = max(0.0, -H[j, i])
                foam = max(0.0, 1.0 - d / 0.6) if H[j, i] < 0.6 else 1.0
                l[col] = (min(1.0, d / 6.0), foam, 0.0, 1.0)
        return Part(bm)

    # ── masks ──
    def water_mask(self, cell=2.0, ext=EXT):
        n = int(ext * 2 / cell)
        xs = -ext + cell * (np.arange(n) + 0.5)
        H = self.height_grid(xs, xs)
        walk_all = unary_union([self.walk_land] + self.walk_extra)
        X, Z = np.meshgrid(xs, xs)
        on_walk = shapely.contains(walk_all, shapely.points(X.ravel(), Z.ravel())).reshape(X.shape)
        water = (H < -0.12) & ~on_walk
        if self.ice is not None:
            ice = shapely.contains(self.ice, shapely.points(X.ravel(), Z.ravel())).reshape(X.shape)
            water = water & ~ice
            for (poly, depth) in self.water_override:
                ov = shapely.contains(poly.buffer(cell * 0.6), shapely.points(X.ravel(), Z.ravel())).reshape(X.shape)
                water = water | ov
        bits = np.packbits(water.astype(np.uint8).ravel())
        import base64
        return {"n": n, "cell": cell, "ext": ext, "bits": base64.b64encode(bits.tobytes()).decode()}

    # ── placement helpers ──
    def place(self, prop, x, z, yaw=0.0, scale=1.0, y=None):
        if y is None:
            y = self.height_at(x, z)
        self.instances.append([prop, round(x, 3), round(y, 3), round(z, 3), round(yaw, 4), round(scale, 3)])

    def scatter(self, props, region, count, min_d, seed, scale=(0.85, 1.2), yrule="ground", avoid=None, hmin=None, hmax=None):
        rng = random.Random(seed)
        minx, minz, maxx, maxz = region.bounds
        placed = []
        tries = 0
        blocked = unary_union(self.no_scatter + ([avoid] if avoid is not None else [])) if (self.no_scatter or avoid is not None) else None
        while len(placed) < count and tries < count * 40:
            tries += 1
            x, z = rng.uniform(minx, maxx), rng.uniform(minz, maxz)
            p = Point(x, z)
            if not region.contains(p):
                continue
            if blocked is not None and blocked.contains(p):
                continue
            if any((x - a) ** 2 + (z - b) ** 2 < min_d * min_d for (a, b) in placed):
                continue
            h = self.height_at(x, z)
            if hmin is not None and h < hmin:
                continue
            if hmax is not None and h > hmax:
                continue
            placed.append((x, z))
            prop = props[rng.randrange(len(props))] if isinstance(props, (list, tuple)) else props
            self.place(prop, x, z, rng.uniform(0, math.tau), rng.uniform(*scale), y=h if yrule == "ground" else 0.0)
        return placed

    def along(self, prop, pts, spacing, offset=0.0, yaw_follow=True, y=None, jitter_=0.0, seed=1):
        """Place props every `spacing` metres along a polyline (offset to its left)."""
        rng = random.Random(seed)
        ls = LineString(pts)
        L = ls.length
        k = 0.0
        while k <= L:
            p = ls.interpolate(k)
            q = ls.interpolate(min(L, k + 0.1))
            dx, dz = q.x - p.x, q.y - p.y
            dl = math.hypot(dx, dz) or 1
            nx, nz = -dz / dl, dx / dl
            x, z = p.x + nx * offset, p.y + nz * offset
            yaw = math.atan2(-dx, -dz) if yaw_follow else 0
            self.place(prop, x + rng.uniform(-jitter_, jitter_), z + rng.uniform(-jitter_, jitter_), yaw, 1.0, y=y)
            k += spacing

    def dock(self, x0, z0, x1, z1, end=True, lanterns=True, width=3.0):
        """A straight dock from (x0, z0) on land to (x1, z1) over water, built from 4 m sections."""
        L = math.hypot(x1 - x0, z1 - z0)
        dx, dz = (x1 - x0) / L, (z1 - z0) / L
        yaw = math.atan2(-dx, -dz) + math.pi / 2   # dock_4 runs along local X
        n = max(1, int(round(L / 4)))
        for k in range(n):
            cx, cz = x0 + dx * (k + 0.5) * 4, z0 + dz * (k + 0.5) * 4
            last = (k == n - 1) and end
            self.place("dock_end" if last else "dock_4", cx, cz, yaw + (math.pi if last else 0), 1.0, y=0.0)
        ex, ez = x0 + dx * n * 4, z0 + dz * n * 4
        poly = LineString([(x0 - dx * 1.0, z0 - dz * 1.0), (ex, ez)]).buffer(width / 2, cap_style=2)
        self.walk_extra.append(poly)
        self.no_scatter.append(poly.buffer(1.0))
        return (ex, ez)

    def structure(self, prop, x, z, yaw=0.0, clear=3.0, props_meta=None):
        self.place(prop, x, z, yaw, 1.0, y=GROUND)
        self.no_scatter.append(Point(x, z).buffer(clear))

    # ── colliders ──
    def build_colliders(self, props_meta):
        walk_all = unary_union([self.walk_land] + self.walk_extra).buffer(0)
        self.walk_all = walk_all
        minx, minz, maxx, maxz = walk_all.bounds
        cols = []
        cols.append([(minx + maxx) / 2, GROUND - 1.0, (minz + maxz) / 2, maxx - minx + 4, 1.0, maxz - minz + 4, 0.0])
        geoms = list(walk_all.geoms) if isinstance(walk_all, MultiPolygon) else [walk_all]
        T = 0.6
        for g in geoms:
            rings = [g.exterior] + list(g.interiors)
            for ring in rings:
                ring = ring.simplify(0.7)
                coords = list(ring.coords)
                for a, b in zip(coords[:-1], coords[1:]):
                    L = math.hypot(b[0] - a[0], b[1] - a[1])
                    if L < 0.05:
                        continue
                    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
                    # push the wall outward (away from the walkable area) by half its thickness
                    nx, nz = -(b[1] - a[1]) / L, (b[0] - a[0]) / L
                    if g.contains(Point(mx + nx * 0.4, mz + nz * 0.4)):
                        nx, nz = -nx, -nz
                    yaw = math.atan2(-(b[1] - a[1]), (b[0] - a[0]))
                    cols.append([mx + nx * T / 2, GROUND - 0.5, mz + nz * T / 2, L + 0.5, 4.5, T, yaw])
        # prop colliders
        for (prop, x, y, z, yaw, s) in self.instances:
            meta = props_meta.get(prop)
            if not meta or not meta.get("collider"):
                continue
            if not walk_all.buffer(2.0).contains(Point(x, z)):
                continue
            for c in meta["collider"]:
                if c[0] == "cyl":
                    _, lx, lz, r, h = c
                    w = d = r * 2 * s * 0.85
                    cx, cz = lx, lz
                    hh = h * s
                else:
                    _, lx, ly, lz, w, hh, d = c
                    w, d, hh = w * s, d * s, hh * s
                    cx, cz = lx, lz
                cy_, sy_ = math.cos(yaw), math.sin(yaw)
                wx = x + cx * cy_ + cz * sy_
                wz = z - cx * sy_ + cz * cy_
                cols.append([wx, y, wz, w, hh, d, yaw])
        self.colliders = [[round(v, 3) for v in c] for c in cols]

    def export(self, name, objs, props_meta, outdir):
        self.build_colliders(props_meta)
        data = {
            "key": self.key,
            "instances": self.instances,
            "anchors": self.anchors,
            "lights": self.lights,
        }
        with open(os.path.join(outdir, name + ".json"), "w") as f:
            json.dump(data, f, separators=(",", ":"))
        with open(os.path.join(outdir, name + "_server.json"), "w") as f:
            json.dump({"anchors": self.anchors, "mask": self.water_mask(), "colliders": self.colliders}, f, separators=(",", ":"))
        export_glb(os.path.join(outdir, name + ".glb"), objs)


def ribbon_mesh(zone, name, y=GROUND + 0.025):
    """Smooth path ribbons (with a darker border) laid on the flat walkable ground."""
    a = Asset(name)
    rng = random.Random(zone.seed + 9)
    pal = zone.pal
    for (ls, w) in zone.paths:
        for (width, color, dy) in ((w + 0.5, mix(hexrgb(pal["path"]), (0.25, 0.18, 0.1), 0.25), 0.0), (w, hexrgb(pal["path"]), 0.012)):
            poly = ls.buffer(width / 2, quad_segs=4)
            poly = poly.intersection(zone.walk_land.buffer(-0.2))
            geoms = list(poly.geoms) if hasattr(poly, "geoms") else [poly]
            for g in geoms:
                if g.is_empty or g.area < 0.5 or g.geom_type != "Polygon":
                    continue
                g = g.simplify(0.15)
                ext = list(g.exterior.coords)[:-1]
                if len(ext) < 3:
                    continue
                bm = bmesh.new()
                vs = [bm.verts.new(G(px, y + dy, pz)) for (px, pz) in ext]
                edges = [bm.edges.new((vs[k], vs[(k + 1) % len(vs)])) for k in range(len(vs))]
                for hole in g.interiors:
                    hv = [bm.verts.new(G(px, y + dy, pz)) for (px, pz) in list(hole.coords)[:-1]]
                    edges += [bm.edges.new((hv[k], hv[(k + 1) % len(hv)])) for k in range(len(hv))]
                bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
                bm.normal_update()
                for f in bm.faces:
                    if f.normal.z < 0:
                        f.normal_flip()
                bm.normal_update()
                a.add(finish_part(bm, color, KIND_TOON, False, rng, 0.04, Matrix.Identity(4)))
    return a

def waterfall_mesh(name, x, z, top, width=6.0, bottom=-0.1, face=1):
    """A curtain of falling water from y=top down to the water, facing +z (face=1)."""
    a = Asset(name)
    n, rows = 8, 10
    bm = bmesh.new()
    grid = []
    for r in range(rows + 1):
        t = r / rows
        y = top + (bottom - top) * t
        zz = z + face * (0.4 + 1.6 * t * t)
        row = [bm.verts.new(G(x - width / 2 + width * k / n + math.sin(k * 1.7 + r) * 0.12, y, zz + math.sin(k * 2.3) * 0.15)) for k in range(n + 1)]
        grid.append(row)
    col = bm.loops.layers.float_color.new("Col"); kl = bm.faces.layers.int.new("kind")
    for r in range(rows):
        for k in range(n):
            f = bm.faces.new([grid[r][k], grid[r][k + 1], grid[r + 1][k + 1], grid[r + 1][k]] if face > 0 else [grid[r][k + 1], grid[r][k], grid[r + 1][k], grid[r + 1][k + 1]])
            f[kl] = KIND_WATER
            for l in f.loops:
                l[col] = (0.0, 1.0, 1.0, 1.0)   # b = 1 marks falling water for the shader
    a.add(Part(bm))
    # foam pool at the bottom
    a.add(cyl(width * 0.55, 0.05, pos=(x, 0.02, z + face * 2.2), color=0xffffff, kind=KIND_GLOW, n=12, bevel=0, scale=(1, 1, 0.6)))
    return a
