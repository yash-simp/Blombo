import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R, items as I
HERE = os.path.dirname(os.path.abspath(__file__))
reset()
objs, meta = [], {}
for name, fn in I.ITEMS.items():
    a = fn()
    a.name = name
    big = name.startswith("boat")
    o = a.build(ao=True, ao_dist=0.6 if big else 0.05, ao_rays=12, ao_strength=0.5, ground=False, sharp_angle=45)
    o.name = name
    objs.append(o)
    meta[name] = {"tris": tri_count([o]), "anchors": a.anchors}
print("tris", sum(m["tris"] for m in meta.values()))
export_glb(os.path.join(HERE, "..", "out", "items.glb"), objs)
json.dump(meta, open(os.path.join(HERE, "..", "out", "items.json"), "w"), indent=1)
if "--render" in sys.argv:
    rods = [o for o in objs if o.name.startswith(("rod_", "skin_"))]
    for o in rods:
        o.rotation_euler = (0, 0, 0)
    R.sheet(os.path.join(HERE, "..", "renders", "rods.png"), rods, tile=230, cols=5, yaw=80, pitch=15)
    R.sheet(os.path.join(HERE, "..", "renders", "items.png"), [o for o in objs if not o.name.startswith(("rod_", "skin_"))], tile=300, cols=3, yaw=35, pitch=20)
