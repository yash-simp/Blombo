"""Lantern Lake asset library for Blender (bpy 5.x, background mode).

Coordinates: author in GAME space (x right, y up, z toward the viewer / south) with helpers that
convert to Blender space (x, -z, y). The glTF exporter turns Blender's Z-up back into Y-up, so a
point authored at game (x, y, z) arrives in three.js at exactly (x, y, z).

An Asset is one bmesh with a per-loop colour layer and a per-face "kind" layer
(0 toon, 1 glow, 2 glass, 3 water). Parts are built with bmesh ops, coloured, then merged.
Finish = flat/smooth normals, ray-cast ambient occlusion baked into the colours, then an object
with up to four materials whose names the game maps to its own materials.
"""
import bpy, bmesh, math, random, colorsys, json, os
from mathutils import Vector, Matrix, Euler, Quaternion
from mathutils.bvhtree import BVHTree

KIND_TOON, KIND_GLOW, KIND_GLASS, KIND_WATER = 0, 1, 2, 3
KIND_NAMES = ["toon", "glow", "glass", "water"]

def G(x, y, z):
    """Game coordinates -> Blender vector."""
    return Vector((x, -z, y))

def hexrgb(h):
    if isinstance(h, (tuple, list)):
        return tuple(h)
    return (((h >> 16) & 255) / 255.0, ((h >> 8) & 255) / 255.0, (h & 255) / 255.0)

def srgb_to_lin(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def jitter(rgb, rng, amount=0.06, hue=0.015):
    h, s, v = colorsys.rgb_to_hsv(*rgb)
    h = (h + rng.uniform(-hue, hue)) % 1.0
    s = min(1, max(0, s * (1 + rng.uniform(-amount, amount))))
    v = min(1, max(0, v * (1 + rng.uniform(-amount, amount * 0.8))))
    return colorsys.hsv_to_rgb(h, s, v)

def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

# ───────────────────────── scene ─────────────────────────
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for m in list(bpy.data.materials):
        bpy.data.materials.remove(m)

_materials = {}
def material(kind):
    name = KIND_NAMES[kind]
    m = _materials.get(name)
    if m and m.name in bpy.data.materials:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    # Distinct export values per kind: the glTF exporter merges materials that export identically.
    bsdf.inputs["Roughness"].default_value = [0.9, 0.8, 0.7, 0.2][kind]
    if kind == KIND_GLASS:
        bsdf.inputs["Alpha"].default_value = 0.5
    if kind == KIND_WATER:
        bsdf.inputs["Metallic"].default_value = 0.1
    if kind == KIND_GLOW:
        nt.links.new(attr.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
    _materials[name] = m
    return m

# ───────────────────────── parts ─────────────────────────
class Part:
    """A bmesh with colours; built by the helpers below."""
    def __init__(self, bm):
        self.bm = bm

def _new_bm():
    bm = bmesh.new()
    return bm

def _finish_part(bm, color, kind=KIND_TOON, smooth=False, rng=None, var=0.06, mat=None, grad=None):
    """Colour every face (with variation) and transform."""
    rng = rng or random.Random(7)
    col = bm.loops.layers.float_color.get("Col") or bm.loops.layers.float_color.new("Col")
    kl = bm.faces.layers.int.get("kind") or bm.faces.layers.int.new("kind")
    if mat is not None:
        bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    base = hexrgb(color)
    if grad:
        zs = [v.co.z for v in bm.verts] or [0]
        z0, z1 = min(zs), max(zs)
    for f in bm.faces:
        c = jitter(base, rng, var) if var else base
        f[kl] = kind
        f.smooth = smooth
        for l in f.loops:
            cc = c
            if grad:
                t = 0 if z1 == z0 else (l.vert.co.z - z0) / (z1 - z0)
                cc = mix(hexrgb(grad[0]), hexrgb(grad[1]), t)
                if var:
                    cc = mix(cc, c, 0.25) if False else tuple(cc[i] * (c[i] / max(1e-4, base[i])) if base[i] > 0.02 else cc[i] for i in range(3))
            l[col] = (*cc, 1.0)
    return Part(bm)

def xform(pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Matrix from GAME pos, GAME euler (x pitch, y yaw, z roll; radians) and GAME scale."""
    sx, sy, sz = scale if isinstance(scale, (tuple, list)) else (scale, scale, scale)
    # game axes -> blender axes: gx=bx, gy=bz, gz=-by
    S = Matrix.Diagonal((sx, sz, sy, 1.0))
    R = (Matrix.Rotation(rot[1], 4, "Z") @ Matrix.Rotation(-rot[2], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X"))
    T = Matrix.Translation(G(*pos))
    return T @ R @ S

def box(size, pos=(0, 0, 0), rot=(0, 0, 0), color=0xffffff, bevel=0.04, segs=1, kind=KIND_TOON, var=0.06, seed=1, base=True, smooth=False, grad=None, taper=None):
    """A box of GAME size (w, h, d), base-centred at pos (base=True) with bevelled edges."""
    w, h, d = size
    bm = _new_bm()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((w, d, h)), verts=bm.verts)
    if base:
        bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    if taper:  # scale the top face (x, z) for tapered shapes
        top = max(v.co.z for v in bm.verts)
        for v in bm.verts:
            if abs(v.co.z - top) < 1e-6:
                v.co.x *= taper[0]; v.co.y *= taper[1]
    if bevel > 0 and min(w, h, d) >= 0.09:
        bv = min(bevel, w * 0.45, h * 0.45, d * 0.45)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bv, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)
    return _finish_part(bm, color, kind, smooth, random.Random(seed), var, xform(pos, rot), grad)

def cyl(r, h, pos=(0, 0, 0), rot=(0, 0, 0), color=0xffffff, n=10, r2=None, bevel=0.03, kind=KIND_TOON, var=0.06, seed=2, smooth=False, cap=True, grad=None, scale=None):
    """Cylinder/cone frustum standing on pos along +y; r2 = top radius."""
    bm = _new_bm()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=n, radius1=r, radius2=(r if r2 is None else r2), depth=h)
    bmesh.ops.translate(bm, vec=Vector((0, 0, h / 2)), verts=bm.verts)
    if bevel > 0 and cap:
        edges = [e for e in bm.edges if all(abs(v.co.z) < 1e-5 or abs(v.co.z - h) < 1e-5 for v in e.verts) and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-5]
        rr = min(r, r if r2 is None else max(r2, 1e-3))
        bmesh.ops.bevel(bm, geom=edges, offset=min(bevel, h * 0.4, rr * 0.5), segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
    m = xform(pos, rot, scale or (1, 1, 1))
    return _finish_part(bm, color, kind, smooth, random.Random(seed), var, m, grad)

def sphere(r, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), color=0xffffff, sub=2, kind=KIND_TOON, var=0.05, seed=3, smooth=True, uv=None, grad=None):
    bm = _new_bm()
    if uv:
        bmesh.ops.create_uvsphere(bm, u_segments=uv[0], v_segments=uv[1], radius=r)
    else:
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    return _finish_part(bm, color, kind, smooth, random.Random(seed), var, xform(pos, rot, scale), grad)

def rock(r, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), color=0x8a8f98, seed=4, sub=1, rough=0.22, var=0.08, flat_bottom=True, kind=KIND_TOON, smooth=False):
    rng = random.Random(seed)
    bm = _new_bm()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    for v in bm.verts:
        v.co *= 1 + rng.uniform(-rough, rough)
    if flat_bottom:
        for v in bm.verts:
            if v.co.z < -r * 0.25:
                v.co.z = -r * 0.25 + (v.co.z + r * 0.25) * 0.15
        bmesh.ops.translate(bm, vec=Vector((0, 0, r * 0.25)), verts=bm.verts)
    return _finish_part(bm, color, kind, smooth, rng, var, xform(pos, rot, scale))

def lathe(profile, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), color=0xffffff, n=12, kind=KIND_TOON, var=0.05, seed=5, smooth=True, colors=None):
    """Revolve [(radius, y), ...] (bottom to top) around +y. colors: per-ring colours (optional)."""
    bm = _new_bm()
    rings = []
    for (r, y) in profile:
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), y)))
        rings.append(ring)
    faces_by_ring = []
    for k in range(len(rings) - 1):
        row = []
        for i in range(n):
            a, b = rings[k][i], rings[k][(i + 1) % n]
            c, d = rings[k + 1][(i + 1) % n], rings[k + 1][i]
            if a.co.xy.length < 1e-6 and d.co.xy.length < 1e-6:
                continue
            try:
                row.append(bm.faces.new([a, b, c, d]))
            except ValueError:
                pass
        faces_by_ring.append(row)
    if profile[0][0] > 1e-6:
        bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 1e-6:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    p = _finish_part(bm, color, kind, smooth, random.Random(seed), var, xform(pos, rot, scale))
    if colors:
        recolor_by_height(p, colors)
    return p

def recolor_by_height(part, stops):
    """stops: [(t, color)], t in 0..1 of the part's height (blender z)."""
    bm = part.bm
    col = bm.loops.layers.float_color["Col"]
    zs = [v.co.z for v in bm.verts]
    z0, z1 = min(zs), max(zs)
    for f in bm.faces:
        fz = sum(v.co.z for v in f.verts) / len(f.verts)
        t = 0 if z1 == z0 else (fz - z0) / (z1 - z0)
        c = hexrgb(stops[-1][1])
        for i in range(len(stops) - 1):
            if t <= stops[i + 1][0]:
                c = hexrgb(stops[i][1]) if t < (stops[i][0] + stops[i + 1][0]) / 2 else hexrgb(stops[i + 1][1])
                break
        for l in f.loops:
            l[col] = (*c, 1.0)

def tube(points, r, color=0xffffff, n=6, kind=KIND_TOON, var=0.04, seed=6, smooth=True, r_end=None, cap=True):
    """A tube through GAME points with radius r (tapering to r_end)."""
    bm = _new_bm()
    pts = [G(*p) for p in points]
    rings = []
    for k, p in enumerate(pts):
        t = k / max(1, len(pts) - 1)
        rr = r if r_end is None else r + (r_end - r) * t
        if k < len(pts) - 1:
            d = (pts[k + 1] - p).normalized()
        else:
            d = (p - pts[k - 1]).normalized()
        if k > 0 and k < len(pts) - 1:
            d = ((pts[k + 1] - p).normalized() + (p - pts[k - 1]).normalized()).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))
        x = d.cross(up).normalized()
        y = d.cross(x).normalized()
        ring = [bm.verts.new(p + (x * math.cos(2 * math.pi * i / n) + y * math.sin(2 * math.pi * i / n)) * rr) for i in range(n)]
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(n):
            bm.faces.new([rings[k][i], rings[k][(i + 1) % n], rings[k + 1][(i + 1) % n], rings[k + 1][i]])
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _finish_part(bm, color, kind, smooth, random.Random(seed), var, Matrix.Identity(4))

def prism(poly, h, pos=(0, 0, 0), rot=(0, 0, 0), color=0xffffff, kind=KIND_TOON, var=0.05, seed=8, bevel=0.0, smooth=False):
    """Extrude a GAME xz polygon [(x, z)] upward by h."""
    bm = _new_bm()
    vs = [bm.verts.new(G(x, 0, z)) for (x, z) in poly]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z < 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0, h)), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, profile=0.5, affect="EDGES", clamp_overlap=True)
    return _finish_part(bm, color, kind, smooth, random.Random(seed), var, xform(pos, rot))

def quad(corners, color=0xffffff, kind=KIND_TOON, var=0.0, seed=9, double=True):
    """A flat quad/poly from GAME points (both faces when double)."""
    bm = _new_bm()
    vs = [bm.verts.new(G(*p)) for p in corners]
    bm.faces.new(vs)
    if double:
        vs2 = [bm.verts.new(G(*p)) for p in reversed(corners)]
        bm.faces.new(vs2)
    return _finish_part(bm, color, kind, False, random.Random(seed), var, Matrix.Identity(4))

def transform_part(part, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    bmesh.ops.transform(part.bm, matrix=xform(pos, rot, scale), verts=part.bm.verts)
    return part

def copy_part(part):
    return Part(part.bm.copy())

# ───────────────────────── assets ─────────────────────────
class Asset:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new("Col")
        self.kind = self.bm.faces.layers.int.new("kind")
        self.anchors = {}
        self.meta = {}

    def add(self, *parts):
        for part in parts:
            if isinstance(part, (list, tuple)):
                self.add(*part)
                continue
            src = part.bm
            scol = src.loops.layers.float_color["Col"]
            skind = src.faces.layers.int["kind"]
            vmap = {}
            for v in src.verts:
                vmap[v] = self.bm.verts.new(v.co)
            for f in src.faces:
                try:
                    nf = self.bm.faces.new([vmap[v] for v in f.verts])
                except ValueError:
                    continue
                nf.smooth = f.smooth
                nf[self.kind] = f[skind]
                for ls, ld in zip(f.loops, nf.loops):
                    ld[self.col] = ls[scol]
            src.free()
        return self

    def anchor(self, name, pos):
        self.anchors[name] = [round(c, 4) for c in pos]

    def build(self, ao=True, ao_dist=0.6, ao_rays=20, ao_strength=0.65, ground=True, sharp_angle=40, collection=None, ao_extra=None):
        """Create the object: AO into colours, normals, materials by kind."""
        bm = self.bm
        bm.normal_update()
        if ao:
            bake_ao(bm, self.col, self.kind, ao_dist, ao_rays, ao_strength, ground, ao_extra)
        # Linear colours for the exporter (it writes the attribute as linear floats).
        for f in bm.faces:
            for l in f.loops:
                c = l[self.col]
                lc = srgb_to_lin((c[0], c[1], c[2]))
                l[self.col] = (lc[0], lc[1], lc[2], 1.0)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        kinds = sorted({p.material_index for p in me.polygons})
        # material slots by kind
        kind_attr = me.attributes.get("kind")
        used = sorted({kind_attr.data[i].value for i in range(len(me.polygons))}) if kind_attr else [0]
        slot_of = {}
        for k in used:
            me.materials.append(material(k))
            slot_of[k] = len(me.materials) - 1
        if kind_attr:
            for i, p in enumerate(me.polygons):
                p.material_index = slot_of[kind_attr.data[i].value]
            me.attributes.remove(kind_attr)
        try:
            me.set_sharp_from_angle(angle=math.radians(sharp_angle))
        except Exception:
            pass
        obj = bpy.data.objects.new(self.name, me)
        (collection or bpy.context.scene.collection).objects.link(obj)
        me.color_attributes.active_color = me.color_attributes["Col"]
        obj["anchors"] = json.dumps(self.anchors)
        self.obj = obj
        return obj

def _hemi_dirs(n, seed=11):
    rng = random.Random(seed)
    dirs = []
    for i in range(n):
        u = (i + rng.random()) / n
        v = rng.random()
        r = math.sqrt(u)
        th = 2 * math.pi * v
        dirs.append((r * math.cos(th), r * math.sin(th), math.sqrt(max(0, 1 - u))))
    return dirs

def bake_ao(bm, col, kind_layer, dist, rays, strength, ground, extra=None):
    """Ray-cast AO per loop (vertex x face normal), written into the colour layer."""
    tmp = bm.copy()
    if ground:
        zmin = min((v.co.z for v in bm.verts), default=0)
        if zmin > -0.05:
            s = 50
            gv = [tmp.verts.new((x, y, -0.001)) for (x, y) in ((-s, -s), (s, -s), (s, s), (-s, s))]
            tmp.faces.new(gv)
    if extra:
        for (verts, faces) in extra:
            base = len(tmp.verts)
            vv = [tmp.verts.new(v) for v in verts]
            for f in faces:
                try:
                    tmp.faces.new([vv[i] for i in f])
                except ValueError:
                    pass
    tree = BVHTree.FromBMesh(tmp)
    tmp.free()
    dirs = _hemi_dirs(rays)
    cache = {}
    for f in bm.faces:
        if f[kind_layer] in (KIND_GLOW, KIND_WATER):
            continue
        n = f.normal
        if n.length < 1e-6:
            continue
        up = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
        t1 = n.cross(up).normalized()
        t2 = n.cross(t1).normalized()
        for l in f.loops:
            key = (l.vert.index, round(n.x, 2), round(n.y, 2), round(n.z, 2))
            occ = cache.get(key)
            if occ is None:
                # sample from slightly inside the face toward its centre to avoid self-hits at edges
                o = l.vert.co.lerp(f.calc_center_median(), 0.08) + n * 0.004
                hits = 0.0
                for (a, b, c) in dirs:
                    d = t1 * a + t2 * b + n * c
                    hit = tree.ray_cast(o, d, dist)
                    if hit[0] is not None and hit[3] > 0.012:
                        hits += 1.0 - (hit[3] / dist) * 0.6
                occ = hits / len(dirs)
                cache[key] = occ
            ao = 1.0 - strength * occ
            c = l[col]
            l[col] = (c[0] * ao, c[1] * ao, c[2] * ao, 1.0)

# ───────────────────────── export ─────────────────────────
def export_glb(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_vertex_color="NAME",
        export_vertex_color_name="Col",
        export_all_vertex_colors=False,
        export_extras=True,
        export_materials="EXPORT",
        export_animations=False,
    )

def tri_count(objs):
    n = 0
    for o in objs:
        me = o.data
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
    return n

# ───────────────────────── extra helpers ─────────────────────────
def paint_where(part, color, pred, var=0.05, seed=21):
    """Recolour faces whose (blender) normal/center satisfies pred(normal, center)."""
    rng = random.Random(seed)
    bm = part.bm
    bm.normal_update()
    col = bm.loops.layers.float_color["Col"]
    base = hexrgb(color)
    for f in bm.faces:
        if pred(f.normal, f.calc_center_median()):
            c = jitter(base, rng, var)
            for l in f.loops:
                l[col] = (*c, 1.0)
    return part

def paint_up(part, color, thresh=0.6, var=0.05, seed=21):
    return paint_where(part, color, lambda n, c: n.z > thresh, var, seed)

def shade_faces(part, rng, amount=0.12):
    """Extra random per-face brightness (for foliage clumps)."""
    col = part.bm.loops.layers.float_color["Col"]
    for f in part.bm.faces:
        k = 1 + rng.uniform(-amount, amount)
        for l in f.loops:
            c = l[col]
            l[col] = (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1.0)
    return part

def catenary(a, b, sag, n=10):
    """GAME points of a hanging rope from a to b."""
    pts = []
    for i in range(n + 1):
        t = i / n
        p = [a[k] + (b[k] - a[k]) * t for k in range(3)]
        p[1] -= sag * 4 * t * (1 - t)
        pts.append(tuple(p))
    return pts

def blade(base, height, width, lean=(0, 0), color=0x5c9e3a, tip=None, seed=31, kind=KIND_TOON):
    """A single grass/reed blade: a thin double-sided triangle strip (GAME coords)."""
    x, y, z = base
    lx, lz = lean
    pts = [(x - width / 2, y, z), (x + width / 2, y, z), (x + lx * 0.5 + width * 0.15, y + height * 0.55, z + lz * 0.5), (x + lx, y + height, z + lz), (x + lx * 0.5 - width * 0.15, y + height * 0.55, z + lz * 0.5)]
    bm = bmesh.new()
    vs = [bm.verts.new(G(*p)) for p in pts]
    bm.faces.new([vs[0], vs[1], vs[2], vs[4]])
    bm.faces.new([vs[4], vs[2], vs[3]])
    vs2 = [bm.verts.new(G(*p)) for p in pts]
    bm.faces.new([vs2[4], vs2[2], vs2[1], vs2[0]])
    bm.faces.new([vs2[3], vs2[2], vs2[4]])
    p = _finish_part(bm, color, kind, False, random.Random(seed), 0.08, Matrix.Identity(4))
    if tip:
        col = p.bm.loops.layers.float_color["Col"]
        tc = hexrgb(tip)
        for f in p.bm.faces:
            for l in f.loops:
                t = min(1, max(0, (l.vert.co.z - y) / height))
                c = l[col]
                l[col] = (*mix((c[0], c[1], c[2]), tc, t * t), 1.0)
    return p

def leaf(base, direction, length, width, droop=0.3, color=0x4f9a3a, seed=41, segs=4, tip=None):
    """A drooping leaf strip (palm frond, banana leaf) from base along direction (GAME)."""
    dx, dz = direction
    dl = math.hypot(dx, dz) or 1
    dx, dz = dx / dl, dz / dl
    px, pz = -dz, dx
    bm = bmesh.new()
    left, right, mid = [], [], []
    for i in range(segs + 1):
        t = i / segs
        w = width * math.sin(math.pi * min(1, t * 1.1)) * (1 - 0.3 * t)
        cx = base[0] + dx * length * t
        cz = base[2] + dz * length * t
        cy = base[1] + length * 0.35 * math.sin(t * math.pi * 0.5) - droop * length * t * t
        mid.append(bm.verts.new(G(cx, cy + 0.02, cz)))
        left.append(bm.verts.new(G(cx + px * w, cy - 0.03, cz + pz * w)))
        right.append(bm.verts.new(G(cx - px * w, cy - 0.03, cz - pz * w)))
    for i in range(segs):
        for a, b in ((left, mid), (mid, right)):
            for face in ([a[i], a[i + 1], b[i + 1], b[i]], [b[i], b[i + 1], a[i + 1], a[i]]):
                try:
                    bm.faces.new(face)
                except ValueError:
                    pass
    p = _finish_part(bm, color, KIND_TOON, False, random.Random(seed), 0.07, Matrix.Identity(4))
    if tip:
        col = p.bm.loops.layers.float_color["Col"]
        tc = hexrgb(tip)
        for f in p.bm.faces:
            for l in f.loops:
                d = (l.vert.co.xy - G(*base).xy).length / length
                c = l[col]
                l[col] = (*mix((c[0], c[1], c[2]), tc, min(1, d) ** 2), 1.0)
    return p
finish_part = _finish_part
