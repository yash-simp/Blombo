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
TERRAIN_CHUNKS = 3   # terrain chunks per side (each with a half-resolution "__lod")
# Surface type in the ground's vertex colour alpha: which detail layer the ground shader shows
# (game/src/assets/materials.ts groundToon). Neighbours in this order blend through each other.
SURF_GRASS, SURF_DIRT, SURF_SAND, SURF_PAVING = 1.0, 0.67, 0.33, 0.0
DSTEP = 1.6          # terrain slope/normal sample spacing (metres), the same for every mesh resolution
STEEP = 0.9          # terrain faces steeper than this (|dh/dx| + |dh/dz|) stay faceted, like the props

def steep_face(n):
    """Whether a terrain face with (Blender) normal n is flat-shaded: steep slopes and skirts."""
    return abs(n.x) + abs(n.y) > STEEP * n.z

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
        self.beach = None        # polygon of walkable ground painted as beach sand (Coral)

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
    def terrain_chunks(self, step=1.6, ext=EXT, n=TERRAIN_CHUNKS):
        """The terrain in n x n chunks, each at full and half resolution ("__lod"), with skirts that
        hide the seams where neighbouring chunks show different levels."""
        out = []
        size = 2 * ext / n
        for cj in range(n):
            for ci in range(n):
                x0, z0 = -ext + ci * size, -ext + cj * size
                for suffix, st in (("", step), ("__lod", step * 2)):
                    part = self.terrain(st, bounds=(x0, z0, x0 + size, z0 + size), skirt=0.9)
                    if part is not None:
                        out.append((f"terrain_{ci}_{cj}{suffix}", part))
        return out

    def terrain(self, step=1.6, ext=EXT, bounds=None, skirt=0.0):
        """A heightfield mesh with shared vertices, smooth normals and colours evaluated per vertex, so
        neighbouring triangles blend instead of each catching its own shade. The colour alpha holds the
        surface type for the ground shader (SURF_*). Returns a Part whose .normals (one per vertex, in
        creation order) the builder gives the corners of smooth faces: they come from the height function
        itself, so chunk edges and the "__lod" copies match their neighbours. Steep faces (steep_face) are
        flat-shaded with one colour each, so cliffs stay faceted like the props."""
        x0, z0, x1, z1 = bounds if bounds else (-ext, -ext, ext, ext)
        # heights on a DSTEP grid with one extra ring (the mesh takes every k-th sample): slopes and
        # normals are central differences on it, the same at any mesh step and across chunk edges, so a
        # vertex that a neighbouring chunk or the "__lod" copy shares gets the same normal and colour
        k = int(round(step / DSTEP))
        assert k >= 1 and abs(k * DSTEP - step) < 1e-6, "terrain step must be a multiple of DSTEP"
        xf = np.arange(x0 - DSTEP, x1 + DSTEP + 0.01, DSTEP)
        zf = np.arange(z0 - DSTEP, z1 + DSTEP + 0.01, DSTEP)
        Hf = self.height_grid(xf, zf)
        xs, zs = xf[1:-1][::k], zf[1:-1][::k]
        H = Hf[1:-1, 1:-1][::k, ::k]
        gx = ((Hf[1:-1, 2:] - Hf[1:-1, :-2]) / (2 * DSTEP))[::k, ::k]
        gz = ((Hf[2:, 1:-1] - Hf[:-2, 1:-1]) / (2 * DSTEP))[::k, ::k]
        X, Z = np.meshgrid(xs, zs)
        rgb, surf = self.ground_colors(X, Z, H, np.abs(gx) + np.abs(gz))
        bm = bmesh.new()
        col = bm.loops.layers.float_color.new("Col")
        kl = bm.faces.layers.int.new("kind")
        nx, nz = len(xs), len(zs)
        verts = {}
        normals = []
        def V(i, j):
            v = verts.get((i, j))
            if v is None:
                v = bm.verts.new(G(xs[i], H[j, i], zs[j]))
                verts[(i, j)] = v
                # game-space normal (-dh/dx, 1, -dh/dz) in Blender axes
                normals.append(Vector((-gx[j, i], gz[j, i], 1.0)).normalized())
            return v
        for j in range(nz - 1):
            for i in range(nx - 1):
                hs = (H[j, i], H[j, i + 1], H[j + 1, i + 1], H[j + 1, i])
                if max(hs) < -3.2:
                    continue
                for tri in (((i, j), (i + 1, j), (i + 1, j + 1)), ((i, j), (i + 1, j + 1), (i, j + 1))):
                    corners = (tri[2], tri[1], tri[0])
                    try:
                        f = bm.faces.new([V(*c) for c in corners])
                    except ValueError:
                        continue
                    f[kl] = KIND_TOON
                    f.smooth = True
                    for l, (ci, cj) in zip(f.loops, corners):
                        l[col] = (*rgb[cj, ci], surf[cj, ci])
        if not bm.faces:
            bm.free()
            return None
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
        # steep faces (flat-shaded by the builder) take one colour, worked out at their centre from their
        # own slope: crisp rock facets with a clean edge, like the low-poly props
        steep = [f for f in bm.faces if steep_face(f.normal)]
        if steep:
            cs = [f.calc_center_median() for f in steep]
            fs = np.array([(abs(f.normal.x) + abs(f.normal.y)) / f.normal.z for f in steep])
            frgb, fsurf = self.ground_colors(np.array([c.x for c in cs]), np.array([-c.y for c in cs]), np.array([c.z for c in cs]), fs)
            for f, c, s in zip(steep, frgb, fsurf):
                f.smooth = False
                for l in f.loops:
                    l[col] = (*c, s)
        if skirt > 0:
            # a short wall hanging under every chunk edge, drawn from both sides (flat, a shade darker)
            edges = [[(i, 0) for i in range(nx)], [(i, nz - 1) for i in range(nx)], [(0, j) for j in range(nz)], [(nx - 1, j) for j in range(nz)]]
            for line in edges:
                for (a_, b_) in zip(line[:-1], line[1:]):
                    va, vb = verts.get(a_), verts.get(b_)
                    if va is None or vb is None:
                        continue
                    ca = (*(rgb[a_[1], a_[0]] * 0.85), surf[a_[1], a_[0]])
                    cb = (*(rgb[b_[1], b_[0]] * 0.85), surf[b_[1], b_[0]])
                    for back in (False, True):
                        ta = bm.verts.new(va.co) if back else va
                        tb = bm.verts.new(vb.co) if back else vb
                        da = bm.verts.new(va.co - Vector((0, 0, skirt)))
                        db = bm.verts.new(vb.co - Vector((0, 0, skirt)))
                        quad = [tb, ta, da, db] if back else [ta, tb, db, da]
                        side = (va.co - vb.co).cross(Vector((0, 0, 1))).normalized() * (-1 if back else 1)
                        normals.extend([side] * (4 if back else 2))
                        f = bm.faces.new(quad)
                        f[kl] = KIND_TOON
                        f.smooth = False
                        for l, c in zip(f.loops, ((cb, ca, ca, cb) if back else (ca, cb, cb, ca))):
                            l[col] = c
            bm.normal_update()
        part = Part(bm)
        part.normals = normals
        return part

    def ground_colors(self, X, Z, H, S):
        """Colour (sRGB, n x m x 3) and surface type (n x m) of the ground at grid points, blended
        smoothly from height H, slope S (|dh/dx| + |dh/dz|) and smooth noise; no per-face jitter."""
        pal = self.pal
        P = lambda k: np.array(hexrgb(pal[k]), dtype=float)
        blend = lambda a, b, t: a + (b - a) * np.asarray(t, dtype=float)[..., None]
        land = pal.get("land", SURF_GRASS)
        # two octaves of smooth noise pick a blend between the grass tones, plus a soft brightness drift
        nv = 0.5 + 0.35 * np.sin(X * 0.07 + self.seed) * np.cos(Z * 0.06 - self.seed * 0.5) + 0.15 * np.sin(X * 0.19 - Z * 0.17 + 1.3)
        tones = np.array([hexrgb(c) for c in pal["grass"]])
        f = np.clip(nv, 0, 0.999) * (len(tones) - 1)
        grass = np.stack([np.interp(f, np.arange(len(tones)), tones[:, c]) for c in range(3)], -1)
        grass = grass * (1 + 0.045 * noise2(X, Z, self.seed + 71, 0.23))[..., None]
        # shore: seabed -> wet sand -> dry sand -> grass up the bank (steep banks stay grassy)
        under = blend(P("sand_wet"), P("seabed"), np.clip((-H - 0.25) / 2.5, 0, 1))
        sand = blend(under, P("sand"), sstep(0.03, 0.15, H))
        bank = np.clip((H - 0.35) / (GROUND - 0.47), 0, 1)
        bank = np.maximum(bank, sstep(0.7, 0.9, S) * sstep(0.25, 0.45, H))
        c = blend(sand, grass, bank)
        surf = SURF_SAND + (land - SURF_SAND) * bank
        # hills: toward the hill tone with height, rock on steep slopes, snow above a snowline
        up = sstep(GROUND + 0.2, GROUND + 0.6, H)
        if "hill" in pal:
            c = blend(c, P("hill"), up * np.clip((H - GROUND) / 6.0, 0, 1))
        rock = up * sstep(0.9, 1.1, S)
        c = blend(c, P("rock"), rock)
        surf = surf + (SURF_DIRT - surf) * rock
        if "snowline" in pal:
            snow = sstep(pal["snowline"] - 0.3, pal["snowline"] + 0.3, H - GROUND)
            c = blend(c, P("snow"), snow)
            surf = surf + (SURF_SAND - surf) * snow
        if self.beach is not None:
            pts = shapely.points(X.ravel(), Z.ravel())
            inside = shapely.contains(self.beach, pts).reshape(X.shape)
            d_beach = shapely.distance(self.beach.boundary, pts).reshape(X.shape)
            d_shore = shapely.distance(self.walk_land.boundary, pts).reshape(X.shape)
            # full sand toward the shore, fading out over 2.5 m at the beach's inland edge
            w = np.where(inside, np.where(d_beach >= d_shore - 0.01, 1.0, sstep(0, 2.5, d_beach)), 0.0)
            w = w * (1 - sstep(0.25, 0.45, np.abs(H - GROUND)))
            dune = blend(P("sand"), grass, 0.12 * (0.5 + 0.5 * np.sin(X * 0.3 + Z * 0.2)))
            c = blend(c, dune, w)
            surf = surf + (SURF_SAND - surf) * w
        if land == SURF_GRASS:
            # a few worn, earthy patches in the meadows
            worn = sstep(0.55, 0.95, noise2(X, Z, self.seed + 91, 0.11)) * sstep(GROUND - 0.2, GROUND - 0.05, H) * (1 - rock)
            c = blend(c, blend(c, P("path"), 0.35), worn * 0.6)
            surf = surf + (SURF_DIRT - surf) * worn * 0.55
        return np.clip(c, 0, 1), np.clip(surf, 0, 1)

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


def flat_poly(geom, y, color, surf, min_area=0.05):
    """Flat triangulated polygons (holes kept) at height y, one colour, colour alpha = surface type."""
    parts = []
    for g in (list(geom.geoms) if hasattr(geom, "geoms") else [geom]):
        if g.is_empty or g.area < min_area or g.geom_type != "Polygon":
            continue
        ext = list(g.exterior.coords)[:-1]
        if len(ext) < 3:
            continue
        bm = bmesh.new()
        col = bm.loops.layers.float_color.new("Col")
        kl = bm.faces.layers.int.new("kind")
        vs = [bm.verts.new(G(px, y, pz)) for (px, pz) in ext]
        edges = [bm.edges.new((vs[k], vs[(k + 1) % len(vs)])) for k in range(len(vs))]
        for hole in g.interiors:
            hv = [bm.verts.new(G(px, y, pz)) for (px, pz) in list(hole.coords)[:-1]]
            edges += [bm.edges.new((hv[k], hv[(k + 1) % len(hv)])) for k in range(len(hv))]
        bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
            f[kl] = KIND_TOON
            for l in f.loops:
                l[col] = (*color, surf)
        bm.normal_update()
        parts.append(Part(bm))
    return parts

def ribbon_mesh(zone, name, y=GROUND + 0.045):
    """The made ground laid on the flat walkable land, drawn with the ground shader: plazas (paving
    with a darker kerb) and the path network (dirt with a darker border; paths stop at a plaza's edge).
    The four layers are cut from each other, so they lie side by side at one height and never overlap
    (nothing to z-fight); y clears the terrain's small bumps."""
    a = Asset(name)
    pal = zone.pal
    land = zone.walk_land.buffer(-0.2)
    empty = Polygon()
    plaza = unary_union(zone.plazas).simplify(0.05).intersection(land) if zone.plazas else empty
    outer = fill = empty
    if zone.paths:
        outer = unary_union([ls.buffer((w + 0.5) / 2, quad_segs=4) for (ls, w) in zone.paths]).simplify(0.1).intersection(land).difference(plaza)
        fill = unary_union([ls.buffer(w / 2, quad_segs=4) for (ls, w) in zone.paths]).simplify(0.1).intersection(land).difference(plaza)
    kerb = plaza.buffer(0.35, quad_segs=8).intersection(land).difference(plaza).difference(outer) if not plaza.is_empty else empty
    pc, pth = hexrgb(pal["plaza"]), hexrgb(pal["path"])
    layers = [(kerb, mix(pc, (0.22, 0.2, 0.18), 0.32), SURF_PAVING), (plaza, pc, SURF_PAVING),
              (outer.difference(fill), mix(pth, (0.25, 0.18, 0.1), 0.25), SURF_DIRT), (fill, pth, SURF_DIRT)]
    for (geom, color, surf) in layers:
        if not geom.is_empty:
            a.add(flat_poly(geom, y, color, surf))
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


# ── shared layout pieces ──
HARBOUR_Z = 60.5   # the coast at the harbour; the pier runs from here out to sea (+Z)

def pin_harbour(walk):
    """Fix the coastline at the harbour so every zone's pier and boat ride line up (RideView)."""
    walk = walk.union(rect(-12, 44, 12, HARBOUR_Z))
    return walk.difference(rect(-12, HARBOUR_Z, 12, 140)).buffer(0.4).buffer(-0.4)

def harbour(z, boat="boat_rowboat"):
    """The south harbour every zone shares: captain, booth, pier and a moored boat."""
    z.anchors["arrive"] = [0, GROUND, HARBOUR_Z - 0.5, 0.0]
    z.anchors["captain"] = [5.5, GROUND, HARBOUR_Z - 2.0, math.pi * 0.9]
    z.structure("captain_booth", 7.5, HARBOUR_Z - 3.5, -math.pi / 2, clear=3)
    z.dock(0, HARBOUR_Z - 1.0, 0, HARBOUR_Z + 21.0)
    z.place(boat, 3.6, HARBOUR_Z + 15.5, 0.1, y=0.0)
    z.place("barrel", 4.5, HARBOUR_Z - 5.5, 0, y=GROUND)
    z.place("crate", -4, HARBOUR_Z - 4.5, 0.3, y=GROUND)

def town(z, cz=46.0, plaza=True):
    """A small square inland from the harbour: the zone's fish market and tackle shop."""
    z.anchors["market"] = [-11, GROUND, cz - 2.5, math.pi * 0.8]
    z.anchors["tackle"] = [11, GROUND, cz - 2.5, -math.pi * 0.8]
    z.structure("market_stall", -11.5, cz - 5.0, math.pi * 0.8 + math.pi, clear=4)
    z.structure("tackle_shack", 12.5, cz - 6.0, -math.pi * 0.8 + math.pi, clear=5)
    z.place("crate_fish", -14.5, cz - 3.0, 0.3, y=GROUND)
    z.place("bucket_worms", 9.0, cz - 3.5, 0, y=GROUND)
    z.place("rod_rack", 15.5, cz - 1.5, -0.6, y=GROUND)
    if plaza:
        z.plazas.append(Point(0, cz).buffer(7.5))
    return [(LineString([(0, cz), (0, HARBOUR_Z - 1)]), 3.2), (LineString([(-5, cz - 1), (-10, cz - 3)]), 2.6), (LineString([(5, cz - 1), (10, cz - 3)]), 2.6)]

def ice_mesh(z, name="ice", y=GROUND - 0.05, color=0xcfe8f6):
    """The frozen lake: a flat slab over the water with round fishing holes and snowy rims."""
    a = Asset(name)
    rng = random.Random(z.seed + 31)
    holes = [poly for (poly, _d) in z.water_override]
    sheet = z.ice.difference(unary_union(holes)) if holes else z.ice
    geoms = list(sheet.geoms) if hasattr(sheet, "geoms") else [sheet]
    for g in geoms:
        g = g.simplify(0.1)
        bm = bmesh.new()
        ext = list(g.exterior.coords)[:-1]
        vs = [bm.verts.new(G(px, y, pz)) for (px, pz) in ext]
        edges = [bm.edges.new((vs[k], vs[(k + 1) % len(vs)])) for k in range(len(vs))]
        for hole in g.interiors:
            hv = [bm.verts.new(G(px, y, pz)) for (px, pz) in list(hole.coords)[:-1]]
            edges += [bm.edges.new((hv[k], hv[(k + 1) % len(hv)])) for k in range(len(hv))]
        bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
        bm.normal_update()
        for f in bm.faces:
            if f.normal.z < 0:
                f.normal_flip()
        # one even colour: per-face variation on these long fill triangles reads as streaks
        p = finish_part(bm, color, KIND_TOON, False, rng, 0.0, Matrix.Identity(4))
        a.add(p)
    # snowy rims around each hole, and pale cracks on the ice
    for poly in holes:
        c = poly.centroid
        r = math.sqrt(poly.area / math.pi)
        for k in range(10):
            ang = k / 10 * math.tau + rng.uniform(-0.1, 0.1)
            a.add(box((0.7, 0.18 + rng.uniform(0, 0.08), 0.45), pos=(c.x + math.cos(ang) * (r + 0.25), y + 0.05, c.y + math.sin(ang) * (r + 0.25)),
                      rot=(0, -ang, 0), color=0xf4f9ff, bevel=0.06))
    for k in range(40):
        cx, cz = rng.uniform(*z.ice.bounds[0::2]), rng.uniform(*z.ice.bounds[1::2])
        if not z.ice.buffer(-1.0).contains(Point(cx, cz)) or any(h.buffer(1.2).contains(Point(cx, cz)) for h in holes):
            continue
        a.add(box((rng.uniform(1.5, 3.5), 0.012, 0.06), pos=(cx, y + 0.01, cz), rot=(0, rng.uniform(0, math.pi), 0), color=0xffffff, bevel=0))
    return a

def lava_mesh(z, lines, name="lava", width=2.2):
    """Glowing lava streams that follow the terrain down the volcano (bright core, darker crust)."""
    a = Asset(name)
    for pts in lines:
        ls = LineString(pts)
        L = ls.length
        n = max(2, int(L / 0.9))
        for (w, color, dy) in ((width + 1.2, 0x3a1a14, 0.04), (width, 0xff6a1a, 0.07), (width * 0.45, 0xffd24a, 0.09)):
            bm = bmesh.new()
            left, right = [], []
            for k in range(n + 1):
                p = ls.interpolate(L * k / n)
                q = ls.interpolate(min(L, L * k / n + 0.2))
                dx, dz = q.x - p.x, q.y - p.y
                dl = math.hypot(dx, dz) or 1
                nx, nzz = -dz / dl, dx / dl
                ww = w * (0.55 + 0.45 * math.sin(k * 0.7) ** 2) * (0.6 if k == 0 else 1.0)
                for side, arr in ((1, left), (-1, right)):
                    x, zz = p.x + nx * ww / 2 * side, p.y + nzz * ww / 2 * side
                    arr.append(bm.verts.new(G(x, max(z.height_at(x, zz), 0.0) + dy, zz)))
            for k in range(n):
                bm.faces.new([left[k], right[k], right[k + 1], left[k + 1]])
            bm.normal_update()
            for f in bm.faces:
                if f.normal.z < 0:
                    f.normal_flip()
            kind = KIND_TOON if color == 0x3a1a14 else KIND_GLOW
            a.add(finish_part(bm, color, kind, False, random.Random(z.seed), 0.03, Matrix.Identity(4)))
    return a
