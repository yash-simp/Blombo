from zonelib import *

PAL = {"grass": [0x8fd05a, 0x80c44e, 0x9bd866, 0x76b84a, 0xa8de70], "sand": 0xf4e3a8, "sand_wet": 0xdcc48c, "seabed": 0xa6dccc,
       "rock": 0x9a8f86, "path": 0xe6d29a, "plaza": 0xeadcb8, "hill": 0x7cbc4c}

def build():
    z = Zone("coral", 311, PAL)
    base = blob(0, 2, 72, 311, wobble=0.12, sx=1.18, sz=0.95)
    lagoon = blob(-14, -18, 26, 312, wobble=0.16, sx=1.35, sz=0.8)
    mouth = rect(-22, -90, -6, -32)
    hill = blob(46, -26, 18, 313, wobble=0.2)
    walk = base.difference(lagoon).difference(mouth).difference(hill)
    walk = pin_harbour(walk.buffer(0.5).buffer(-0.5))
    geoms = [g for g in (walk.geoms if hasattr(walk, "geoms") else [walk]) if g.area > 40]
    walk = unary_union(geoms)
    z.walk_land = walk
    z.hills = [(hill, 9.0, 13.0)]
    z.beach = walk.difference(walk.buffer(-15))
    harbour(z, boat="boat_sailboat")
    paths = town(z, 46.0)
    paths += [(LineString([(0, 40), (-10, 20), (-30, 10)]), 3.0), (LineString([(0, 40), (22, 26), (32, 6), (28, -6)]), 3.0)]
    z.paths = paths
    # boardwalks into the lagoon, beach huts and holiday dressing
    z.dock(-28, 8.5, -28, -4)
    z.dock(4, 0.5, 2, -10)
    for (x, zz, yaw) in [(-48, 20, 1.0), (-36, 36, 0.5), (34, 34, -0.5), (52, 12, -1.2)]:
        z.structure("beach_hut", x, zz, yaw, clear=4.5)
    z.structure("lifeguard_tower", -56, -2, 1.3, clear=3)
    for k, (x, zz) in enumerate([(-44, 6), (-50, 30), (-20, 36), (22, 40), (44, 24), (58, 2), (-8, 26), (14, 18)]):
        z.place("umbrella", x, zz, k * 0.7, y=GROUND)
        z.place("surfboard" if k % 2 else "sandcastle", x + 2.2, zz + 1.2, k * 1.1, y=GROUND)
    for (ls, w) in z.paths[3:]:
        z.along("torch_tiki", list(ls.coords), 9.0, offset=2.4, y=GROUND, seed=7)
    avoid = unary_union([ls.buffer(w / 2 + 1.2) for (ls, w) in z.paths] + z.plazas)
    land = walk.buffer(-1.5)
    inland = walk.buffer(-15)
    z.scatter(["tree_palm", "tree_palm", "tree_palm"], land, 70, 6.5, 321, avoid=avoid.union(Point(0, 46).buffer(12)), scale=(0.9, 1.3))
    z.scatter(["tree_round_a", "tree_palm", "bush_a", "bush_c"], inland, 40, 5.0, 322, avoid=avoid)
    z.scatter(["tree_palm", "bush_c", "rock_l"], hill.buffer(-1), 24, 4.0, 323, hmin=GROUND + 0.5)
    z.scatter(["bush_a", "bush_c", "flowers_yellow", "flowers_pink"], inland, 120, 2.4, 324, avoid=avoid)
    z.scatter(["grass", "grass", "grass_dry"], inland, 240, 1.4, 325, avoid=avoid)
    z.scatter(["shells", "rock_sand", "shells"], z.beach, 90, 2.5, 326, avoid=avoid)
    under = lagoon.buffer(-2).union(base.buffer(14).difference(base.buffer(3)))
    z.scatter(["coral_fan", "coral_branch", "coral_brain", "seaweed"], under, 160, 2.0, 327, hmin=-2.6, hmax=-0.35, scale=(0.9, 1.6))
    z.scatter(["rock_m", "rock_s"], walk.buffer(4).difference(walk.buffer(0.3)), 30, 4.0, 328, hmin=-0.6, hmax=0.9)
    z.scatter("buoy", Point(0, 92).buffer(40).difference(base.buffer(8)), 6, 14, 329, yrule="water")
    return z, lagoon

VIEWS = [((0, 10, 70), (0, 1, 30)), ((-30, 18, 30), (-14, 0, -18))]
