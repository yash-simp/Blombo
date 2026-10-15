"""Build prop packs: python3 build_props.py <pack> [--render] [--only a,b]"""
import sys, os, json, importlib, time
sys.path.insert(0, os.path.dirname(__file__))
from lib import *
import render as R

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out")
REN = os.path.join(HERE, "..", "renders")

LOD_MIN = 220
LOD_TARGET = 160

def make_lod(obj, ratio):
    """A decimated copy for far chunks; materials (kinds) and baked vertex colours carry over."""
    lod = obj.copy()
    lod.data = obj.data.copy()
    lod.name = obj.name + "__lod"
    bpy.context.scene.collection.objects.link(lod)
    mod = lod.modifiers.new("lod", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(lod.evaluated_get(dg))
    mesh.validate(clean_customdata=False)
    lod.modifiers.clear()
    lod.data = mesh
    lod.name = obj.name + "__lod"
    return lod

def build(modules, pack, render=False, only=None, sheet=12):
    reset()
    registry = {}
    for m in modules:
        registry.update(importlib.import_module(m).PROPS)
    names = [n for n in registry if not only or n in only]
    objs, meta = [], {}
    shown = []
    t = time.time()
    for n in names:
        spec = registry[n]
        a = spec["fn"]()
        a.name = n
        obj = a.build(ao=spec.get("ao", 0.7) > 0, ao_dist=max(0.15, spec.get("ao", 0.7)), ao_rays=18)
        obj.name = n
        objs.append(obj)
        shown.append(obj)
        meta[n] = {"collider": spec.get("collider"), "anchors": a.anchors, "tris": tri_count([obj])}
        if meta[n]["tris"] > LOD_MIN:
            lod = make_lod(obj, max(0.18, min(0.5, LOD_TARGET / meta[n]["tris"])))
            objs.append(lod)
            meta[n]["lod"] = tri_count([lod])
    print(f"built {len(objs)} props in {time.time() - t:.1f}s, tris={sum(m['tris'] for m in meta.values())}")
    if not only:
        export_glb(os.path.join(OUT, pack + ".glb"), objs)
        with open(os.path.join(OUT, pack + ".json"), "w") as f:
            json.dump(meta, f, indent=1)
    if render:
        for i in range(0, len(shown), sheet):
            R.sheet(os.path.join(REN, f"{pack}_{i // sheet}.png"), shown[i:i + sheet], tile=280, cols=4)
    for n, m in meta.items():
        print(f"  {n}: {m['tris']}")

if __name__ == "__main__":
    pack = sys.argv[1]
    mods = {"nature": ["props_nature"], "build": ["props_build"], "props": ["props_nature", "props_build"]}[pack]
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    build(mods, pack, render="--render" in sys.argv, only=only)
