"""Headless Cycles renders for reviewing assets (contact sheets)."""
import bpy, math
from mathutils import Vector

def setup_render(res=(900, 600), samples=24):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.55, 0.68, 0.85, 1)
    bg.inputs["Strength"].default_value = 0.9
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(8)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(50), 0, math.radians(35))
    sc.collection.objects.link(so)

def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    return lo, hi

def render(path, objs, yaw=35, pitch=24, margin=1.15, res=(900, 600), samples=24, ground=True):
    sc = bpy.context.scene
    if not sc.world:
        setup_render(res, samples)
    sc.render.resolution_x, sc.render.resolution_y = res
    lo, hi = bounds(objs)
    center = (lo + hi) / 2
    size = (hi - lo).length
    if ground and "ground" not in bpy.data.objects:
        me = bpy.data.meshes.new("ground")
        s = 400
        me.from_pydata([(-s, -s, lo.z - 0.002), (s, -s, lo.z - 0.002), (s, s, lo.z - 0.002), (-s, s, lo.z - 0.002)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new("ground", me)
        m = bpy.data.materials.new("groundm"); m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.42, 0.3, 1)
        me.materials.append(m)
        sc.collection.objects.link(g)
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("cam", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    fov = 2 * math.atan(36 / 2 / cam_data.lens) * (res[1] / res[0]) if res[0] > res[1] else 2 * math.atan(36 / 2 / cam_data.lens)
    dist = (size / 2) / math.tan(fov / 2) * margin
    yr, pr = math.radians(yaw), math.radians(pitch)
    d = Vector((math.sin(yr) * math.cos(pr), -math.cos(yr) * math.cos(pr), math.sin(pr)))
    cam.location = center + d * dist
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)

def grid(objs, spacing=None, cols=None):
    """Lay objects out in a grid (blender xy) for a contact sheet; returns them."""
    n = len(objs)
    cols = cols or math.ceil(math.sqrt(n))
    sizes = []
    for o in objs:
        lo, hi = bounds([o])
        sizes.append(max(hi.x - lo.x, hi.y - lo.y))
    sp = spacing or (max(sizes) * 1.25 if sizes else 1)
    for i, o in enumerate(objs):
        r, c = divmod(i, cols)
        o.location.x += (c - (cols - 1) / 2) * sp
        o.location.y += -(r - (math.ceil(n / cols) - 1) / 2) * sp
    return objs


def sheet(path, objs, tile=300, cols=4, samples=10, yaw=35, pitch=24):
    """Render each object alone and assemble a labelled contact sheet with PIL."""
    import os, tempfile
    from PIL import Image, ImageDraw
    tiles = []
    scene_objs = [x for x in bpy.context.scene.objects if x.type == "MESH" and x.name != "ground"]
    hidden = {o: o.hide_render for o in scene_objs}
    for o in objs:
        for other in scene_objs:
            other.hide_render = other is not o
        tmp = os.path.join(tempfile.gettempdir(), "tile_" + o.name + ".png")
        render(tmp, [o], yaw=yaw, pitch=pitch, res=(tile, tile), samples=samples, margin=1.05)
        im = Image.open(tmp).convert("RGB")
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, tile, 16], fill=(20, 30, 40))
        d.text((4, 2), o.name, fill=(255, 255, 255))
        tiles.append(im)
    for o, h in hidden.items():
        o.hide_render = h
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new("RGB", (cols * tile, rows * tile), (30, 30, 30))
    for i, im in enumerate(tiles):
        out.paste(im, ((i % cols) * tile, (i // cols) * tile))
    out.save(path)
