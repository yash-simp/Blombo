import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R
HERE = os.path.dirname(os.path.abspath(__file__))
reset()
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, "..", "out", "chars.glb"))
roots = [o for o in bpy.context.scene.objects if o.parent is None and o.type == "EMPTY"]
roots.sort(key=lambda o: o.name)
from PIL import Image
ims = []
for i, r in enumerate(roots):
    for o in bpy.context.scene.objects:
        o.hide_render = True
    meshes = [c for c in r.children_recursive if c.type == "MESH"]
    for m in meshes:
        m.hide_render = False
    bpy.context.view_layer.update()
    R.render(f"/tmp/ch_{i}.png", meshes, yaw=20, pitch=10, res=(260, 360), samples=10, margin=0.9)
    im = Image.open(f"/tmp/ch_{i}.png").convert("RGB")
    ims.append(im)
out = Image.new("RGB", (260 * 5, 360 * 2))
for i, im in enumerate(ims):
    out.paste(im, ((i % 5) * 260, (i // 5) * 360))
out.save(os.path.join(HERE, "..", "renders", "chars.png"))
print([r.name for r in roots])
