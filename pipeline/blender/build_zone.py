"""python3 build_zone.py lantern [--render]"""
import sys, os, json, importlib, time, math
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R
import props_nature, props_build, items as ITEMS
from zonelib import *

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out")
REN = os.path.join(HERE, "..", "renders")
key = sys.argv[1]
mod = importlib.import_module("zone_" + key)
reset()
t = time.time()
zone, extra = mod.build()
props_meta = {}
for m in (props_nature.PROPS, props_build.PROPS):
    for n, spec in m.items():
        props_meta[n] = {"collider": spec.get("collider")}
coll = bpy.data.collections.new("zone"); bpy.context.scene.collection.children.link(coll)
terrain = Asset("terrain"); terrain.add(zone.terrain()); t_obj = terrain.build(ao=False, sharp_angle=30, collection=coll); t_obj.name = "terrain"
water = Asset("water"); water.add(zone.water()); w_obj = water.build(ao=False, collection=coll); w_obj.name = "water"
objs = [t_obj, w_obj]
if zone.paths:
    zone.special.insert(0, ribbon_mesh(zone, 'paths'))
for sp in zone.special:
    o = sp.build(ao=False, collection=coll); o.name = sp.name; objs.append(o)
zone.export("zone_" + key, objs, props_meta, OUT)
print(f"zone {key}: {len(zone.instances)} instances, {len(zone.colliders)} colliders, terrain tris {tri_count([t_obj])}, water tris {tri_count([w_obj])}, {time.time() - t:.1f}s")
counts = {}
for inst in zone.instances:
    counts[inst[0]] = counts.get(inst[0], 0) + 1
print(sorted(counts.items(), key=lambda kv: -kv[1]))
if "--render" in sys.argv:
    # preview: real prop meshes as linked duplicates
    lib_objs = {}
    registry = {}
    registry.update(props_nature.PROPS); registry.update(props_build.PROPS)
    for name in counts:
        if name in registry:
            a = registry[name]["fn"](); a.name = name
            o = a.build(ao=registry[name].get("ao", 0.7) > 0, ao_dist=max(0.15, registry[name].get("ao", 0.7)), ao_rays=10)
        elif name in ITEMS.ITEMS:
            a = ITEMS.ITEMS[name](); a.name = name
            o = a.build(ao=False)
        else:
            print("missing prop", name); continue
        o.hide_render = True
        lib_objs[name] = o
    for (name, x, y, zz, yaw, s) in zone.instances:
        src = lib_objs.get(name)
        if not src: continue
        o = bpy.data.objects.new(name + "_i", src.data)
        o.location = G(x, y, zz)
        o.rotation_euler = (0, 0, yaw)
        o.scale = (s, s, s)
        bpy.context.scene.collection.objects.link(o)
    wm = bpy.data.materials.new("wprev"); wm.use_nodes = True
    b = wm.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.1, 0.45, 0.6, 1); b.inputs["Alpha"].default_value = 0.75; b.inputs["Roughness"].default_value = 0.2
    w_obj.data.materials.clear(); w_obj.data.materials.append(wm)
    R.setup_render((1400, 1000), 10)
    sc = bpy.context.scene
    cam_data = bpy.data.cameras.new("top"); cam_data.type = "ORTHO"; cam_data.ortho_scale = 250
    cam = bpy.data.objects.new("top", cam_data); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, 0, 120); cam.rotation_euler = (0, 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 1000, 1000
    sc.render.filepath = os.path.join(REN, f"zone_{key}_top.png"); bpy.ops.render.render(write_still=True)
    for i, (pos, look) in enumerate(getattr(mod, "VIEWS", [((0, 14, 60), (0, 1, 20))])):
        cam2d = bpy.data.cameras.new("p"); cam2d.lens = 24
        cam2 = bpy.data.objects.new("p", cam2d); sc.collection.objects.link(cam2); sc.camera = cam2
        p, l = G(*pos), G(*look)
        cam2.location = p
        cam2.rotation_euler = (l - p).to_track_quat("-Z", "Y").to_euler()
        sc.render.resolution_x, sc.render.resolution_y = 1400, 800
        sc.render.filepath = os.path.join(REN, f"zone_{key}_view{i}.png"); bpy.ops.render.render(write_still=True)
