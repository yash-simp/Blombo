"""Build prop packs: python3 build_props.py <pack> [--render] [--only a,b]"""
import sys, os, json, importlib, time
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out")
REN = os.path.join(HERE, "..", "renders")

def build(modules, pack, render=False, only=None, sheet=12):
    reset()
    registry = {}
    for m in modules:
        registry.update(importlib.import_module(m).PROPS)
    names = [n for n in registry if not only or n in only]
    objs, meta = [], {}
    t = time.time()
    for n in names:
        spec = registry[n]
        a = spec["fn"]()
        a.name = n
        obj = a.build(ao=spec.get("ao", 0.7) > 0, ao_dist=max(0.15, spec.get("ao", 0.7)), ao_rays=18)
        obj.name = n
        objs.append(obj)
        meta[n] = {"collider": spec.get("collider"), "anchors": a.anchors, "tris": tri_count([obj])}
    print(f"built {len(objs)} props in {time.time() - t:.1f}s, tris={sum(m['tris'] for m in meta.values())}")
    if not only:
        export_glb(os.path.join(OUT, pack + ".glb"), objs)
        with open(os.path.join(OUT, pack + ".json"), "w") as f:
            json.dump(meta, f, indent=1)
    if render:
        for i in range(0, len(objs), sheet):
            R.sheet(os.path.join(REN, f"{pack}_{i // sheet}.png"), objs[i:i + sheet], tile=280, cols=4)
    for n, m in meta.items():
        print(f"  {n}: {m['tris']}")

if __name__ == "__main__":
    pack = sys.argv[1]
    mods = {"nature": ["props_nature"], "build": ["props_build"], "props": ["props_nature", "props_build"]}[pack]
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    build(mods, pack, render="--render" in sys.argv, only=only)
