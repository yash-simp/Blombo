import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R, chars as C
HERE = os.path.dirname(os.path.abspath(__file__))
reset()
roots = []
allobjs = []
for name, st in C.NPCS.items():
    parts = C.build_npc(name, st)
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for key, (asset, pivot) in parts.items():
        asset.name = name + "_" + key
        o = asset.build(ao=True, ao_dist=0.25, ao_rays=12, ao_strength=0.45, ground=False, sharp_angle=45)
        o.name = name + "_" + key
        # geometry was authored around the pivot (local); place the object at the pivot
        o.location = G(*pivot)
        o.parent = root
        allobjs.append(o)
    roots.append(root)
print("tris", tri_count(allobjs))
bpy.ops.object.select_all(action="DESELECT")
for o in allobjs + roots:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(HERE, "..", "out", "chars.glb"), export_format="GLB", use_selection=True, export_yup=True, export_normals=True, export_texcoords=False, export_vertex_color="NAME", export_vertex_color_name="Col", export_materials="EXPORT", export_animations=False)
if "--render" in sys.argv:
    # lay out roots in a row and render a sheet via per-root grouping
    for i, r in enumerate(roots):
        r.location = (i * 1.6 - (len(roots) - 1) * 0.8, 0, 0)
    bpy.context.view_layer.update()
    R.render(os.path.join(HERE, "..", "renders", "chars.png"), allobjs, yaw=10, pitch=8, res=(1400, 420), samples=16, margin=1.0)
