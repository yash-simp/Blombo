import sys, os, json, time
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R, fish as FM
HERE = os.path.dirname(os.path.abspath(__file__))
reset()
only = sys.argv[1].split(",") if len(sys.argv) > 1 and sys.argv[1] != "all" else FM.ORDER
objs = []
meta = {}
t = time.time()
for n in only:
    a = FM.build(n)
    o = a.build(ao=True, ao_dist=0.12, ao_rays=12, ao_strength=0.5, ground=False, sharp_angle=50)
    o.name = n
    objs.append(o)
    meta[n] = {"tris": tri_count([o]), "anchors": a.anchors}
print("built", len(objs), "fish in", round(time.time() - t, 1), "s; tris", sum(m["tris"] for m in meta.values()))
if len(sys.argv) <= 1 or sys.argv[1] == "all":
    export_glb(os.path.join(HERE, "..", "out", "fish.glb"), objs)
    json.dump(meta, open(os.path.join(HERE, "..", "out", "fish.json"), "w"), indent=1)
if "--render" in sys.argv:
    for i in range(0, len(objs), 12):
        R.sheet(os.path.join(HERE, "..", "renders", f"fish_{i // 12}.png"), objs[i:i + 12], tile=280, cols=4, yaw=-20, pitch=12)
