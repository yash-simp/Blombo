"""Illustrated fish icons for the HUD: every species rendered alone (Cycles, transparent film) in a
3/4 side view, outlined like the HUD's SVG icons, then packed into one atlas in SPECIES order.

  python3 fish_icons.py              render all 54 species, then pack the atlas
  python3 fish_icons.py a,b,c        re-render only these species, then pack the atlas
  python3 fish_icons.py --pack       pack the atlas from the cached renders only (post-process tweaks)

Raw renders are cached in pipeline/renders/icons/<id>.png. Output: pipeline/out/up/fish_icons.webp
(cell 128 px, 8 columns) + fish_icons.json ({cell, cols, count, ids}) and a review sheet in
pipeline/renders/fish_icons_review.png.
"""
import sys, os, json, math, re, time
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import fish as FM
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.path.join(ROOT, "pipeline", "renders", "icons")
OUT = os.path.join(ROOT, "pipeline", "out", "up")
RES = 420          # raw render size (square); downsampled ~3x into the cell
CELL = 128
COLS = 8
PAD = 5            # empty border inside each cell (px, final size)
OUTLINE = (11, 26, 42)  # the HUD's ink colour (#0b1a2a)
SATURATION = 1.14  # a little extra colour so the icons pop like the HUD's SVG icons

# Per-species pose: yaw (camera toward the nose, deg), pitch (camera height, deg), tilt (nose up, deg),
# turn (about the vertical, deg), wave (S-curve swim amplitude, m; for eels), curl (wingtip lift, m; the ray).
DEFAULT_POSE = dict(yaw=26, pitch=14, tilt=9, turn=0, wave=0.0, curl=0.0)
POSE = {
    "tiger_ray": dict(yaw=70, pitch=26, tilt=0, turn=0, curl=0.14),
    "mossback_turtle": dict(yaw=30, pitch=24, tilt=6),
    "prism_seadragon": dict(yaw=22, pitch=12, tilt=6),
    "polka_puffer": dict(yaw=30, pitch=12, tilt=4),
    "starlit_axolotl": dict(yaw=30, pitch=26, tilt=6),
}
LONG_TILT = 22     # eels and long fish swim diagonally so they use the square cell
EEL_WAVE = 0.075   # eels also wiggle (a vertical S-curve reads at any size)
# Dark species get extra light so they read on the HUD's dark navy panels.
BOOST = {"eclipse_angelfish": 1.6, "magma_eel": 1.5, "obsidian_piranha": 1.35, "shadow_gar": 1.45, "cinder_minnow": 1.3,
         "lantern_eel": 1.35, "lantern_catfish": 1.2, "ancient_embercanth": 1.25}


def species_ids():
    """Species ids in SPECIES order, read from the server rules (the icon index is the species index)."""
    src = open(os.path.join(ROOT, "game", "server", "rules.ts")).read()
    blk = src[src.index("export const SPECIES: Species[] = ["):]
    blk = blk[:blk.index("\n]")]
    ids = re.findall(r'S\("([a-z_]+)"', blk)
    missing = [i for i in ids if i not in FM.FISH]
    assert not missing, "no fish builder for " + ", ".join(missing)
    return ids


# ───────────────────────── render ─────────────────────────
def setup_scene():
    reset()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 40
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 4
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.82, 0.9, 1.0, 1)
    bg.inputs["Strength"].default_value = 0.62
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 70
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    lights = {}
    # key: upper front-left (image left = tail side), fill: low front-right, rim: behind and above
    for name, energy, d in (("key", 3.4, (-0.45, -1.0, 1.25)), ("fill", 0.9, (0.8, -0.8, -0.35)), ("rim", 2.6, (0.25, 1.0, 0.9))):
        ld = bpy.data.lights.new(name, "SUN")
        ld.energy = energy
        ld.angle = math.radians(12)
        lo = bpy.data.objects.new(name, ld)
        lo.rotation_euler = (-Vector(d).normalized()).to_track_quat("-Z", "Y").to_euler()
        sc.collection.objects.link(lo)
        lights[name] = ld
    return cam, lights


def world_points(o):
    m = o.matrix_world
    return [m @ v.co for v in o.data.vertices]


def render_one(sid, cam, lights, path=None, pose_override=None):
    spec = FM.FISH[sid]
    a = FM.build(sid)
    o = a.build(ao=True, ao_dist=0.12, ao_rays=12, ao_strength=0.5, ground=False, sharp_angle=50)
    pose = dict(DEFAULT_POSE)
    if spec.get("shape") in ("eel", "long"):
        pose["tilt"] = LONG_TILT
    if spec.get("shape") == "eel":
        pose["wave"] = EEL_WAVE
    pose.update(POSE.get(sid, {}))
    pose.update(pose_override or {})
    if pose["wave"]:
        for v in o.data.vertices:  # Blender x = game x (nose +), z = game y (up)
            x = v.co.x
            v.co.z += pose["wave"] * math.sin(math.tau * (x + 0.5) * 1.05 + 0.6) * (0.55 + 0.9 * (0.5 - x))
    if pose["curl"]:
        for v in o.data.vertices:  # Blender y = -game z (the ray's wings)
            v.co.z += pose["curl"] * min(1.0, (v.co.y / 0.48) ** 2)
    o.rotation_euler = (0, math.radians(-pose["tilt"]), math.radians(pose["turn"]))
    bpy.context.view_layer.update()
    pts = world_points(o)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centre = (lo + hi) / 2
    radius = max((p - centre).length for p in pts)
    fov = 2 * math.atan(18 / cam.data.lens)
    dist = radius / math.sin(fov / 2) * 1.04
    yr, pr = math.radians(pose["yaw"]), math.radians(pose["pitch"])
    d = Vector((math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr)))
    cam.location = centre + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    boost = BOOST.get(sid, 1.0)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.62 * boost
    lights["key"].energy = 3.4 * (1 + (boost - 1) * 0.6)
    lights["rim"].energy = 2.6 * boost
    path = path or os.path.join(CACHE, sid + ".png")
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    me = o.data
    bpy.data.objects.remove(o)
    bpy.data.meshes.remove(me)
    return path


# ───────────────────────── post ─────────────────────────
def disc_dilate(a, r):
    """Max of the alpha over a disc of radius r (soft rim), on a padded float array."""
    out = np.zeros_like(a)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = math.hypot(dx, dy)
            if d > r + 0.5:
                continue
            w = min(1.0, r + 0.5 - d)
            np.maximum(out, np.roll(np.roll(a, dy, 0), dx, 1) * w, out=out)
    return out


def icon(path):
    """Raw render -> outlined icon fitted into one CELL x CELL tile."""
    if not os.path.exists(path):
        print("missing render", path)
        return Image.new("RGBA", (CELL, CELL))
    im = Image.open(path).convert("RGBA")
    bbox = im.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox()
    if not bbox:
        return Image.new("RGBA", (CELL, CELL))
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    scale = (CELL - 2 * PAD) / max(w, h)
    r = max(2, round(3.0 / scale))           # ~3 px outline in the final cell
    pad = r + 3
    im = im.crop((bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad))
    im = Image.merge("RGBA", (*ImageEnhance.Color(im.convert("RGB")).enhance(SATURATION).split(), im.getchannel("A")))
    rgba = np.asarray(im).astype(np.float32) / 255.0
    alpha = rgba[..., 3]
    ring = disc_dilate(alpha, r)
    out = np.zeros_like(rgba)
    out[..., 0:3] = np.array(OUTLINE, np.float32) / 255.0
    out[..., 3] = ring
    # fish over the outline (straight alpha "over")
    fa = alpha[..., None]
    oa = out[..., 3:4]
    na = fa + oa * (1 - fa)
    out[..., 0:3] = (rgba[..., 0:3] * fa + out[..., 0:3] * oa * (1 - fa)) / np.maximum(na, 1e-6)
    out[..., 3:4] = na
    big = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    big = big.crop(big.getchannel("A").point(lambda v: 255 if v > 6 else 0).getbbox())
    W, H = big.size
    s = (CELL - 2 * PAD) / max(W, H)
    nw, nh = max(1, round(W * s)), max(1, round(H * s))
    small = big.convert("RGBa").resize((nw, nh), Image.LANCZOS).convert("RGBA")
    tile = Image.new("RGBA", (CELL, CELL))
    tile.alpha_composite(small, ((CELL - nw) // 2, (CELL - nh) // 2))
    return tile


def pack(ids):
    rows = (len(ids) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (COLS * CELL, rows * CELL))
    for i, sid in enumerate(ids):
        atlas.alpha_composite(icon(os.path.join(CACHE, sid + ".png")), ((i % COLS) * CELL, (i // COLS) * CELL))
    os.makedirs(OUT, exist_ok=True)
    webp = os.path.join(OUT, "fish_icons.webp")
    atlas.save(webp, "WEBP", quality=88, method=6, alpha_quality=100)
    json.dump({"cell": CELL, "cols": COLS, "count": len(ids), "ids": ids}, open(os.path.join(OUT, "fish_icons.json"), "w"), indent=1)
    # review sheet: the atlas over the HUD's panel colour, plus the silhouettes the Index shows
    rev = Image.new("RGBA", (atlas.width * 2 + 16, atlas.height), (27, 63, 94, 255))
    rev.alpha_composite(atlas, (0, 0))
    sil = Image.new("RGBA", atlas.size, (0, 0, 0, 0))
    sil.putalpha(atlas.getchannel("A").point(lambda v: v // 2))
    rev.alpha_composite(sil, (atlas.width + 16, 0))
    d = ImageDraw.Draw(rev)
    for i, sid in enumerate(ids):
        d.text(((i % COLS) * CELL + 3, (i // COLS) * CELL + 2), str(i), fill=(255, 255, 255, 160))
    rev.convert("RGB").save(os.path.join(ROOT, "pipeline", "renders", "fish_icons_review.png"))
    print("atlas", webp, atlas.size, os.path.getsize(webp) // 1024, "KB")


def main():
    ids = species_ids()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    os.makedirs(CACHE, exist_ok=True)
    if "--pack" not in sys.argv:
        todo = ids if not args or args[0] == "all" else args[0].split(",")
        cam, lights = setup_scene()
        t = time.time()
        for sid in todo:
            t0 = time.time()
            render_one(sid, cam, lights)
            print("rendered", sid, round(time.time() - t0, 1), "s", flush=True)
        print("rendered", len(todo), "in", round(time.time() - t, 1), "s")
    pack(ids)


if __name__ == "__main__":
    main()
