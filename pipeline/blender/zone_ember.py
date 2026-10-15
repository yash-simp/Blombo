from zonelib import *

PAL = {"grass": [0x5e4c42, 0x6a5446, 0x52423a, 0x72604c, 0x5a463c], "sand": 0x7c6858, "sand_wet": 0x5e4c40, "seabed": 0x3e4a48,
       "rock": 0x3c3b42, "path": 0x9a7650, "plaza": 0x84725f, "hill": 0x4a3c36}

def build():
    z = Zone("ember", 511, PAL)
    base = blob(0, 2, 72, 511, wobble=0.12, sx=1.15, sz=0.95)
    volcano = blob(0, -40, 34, 512, wobble=0.12, sx=1.15)
    lagoon = blob(-38, 4, 15, 513, wobble=0.15)
    pool = blob(36, 0, 11, 514, wobble=0.15)
    walk = base.difference(volcano).difference(lagoon).difference(pool)
    walk = pin_harbour(walk.buffer(0.5).buffer(-0.5))
    z.walk_land = walk
    z.hills = [(volcano, 24.0, 30.0)]
    top = z.height_at(0, -40)
    z.anchors["crater"] = [0, round(top, 2), -40]
    lava = [[(0, -40), (-8, -30), (-20, -22), (-30, -12), (-36, -2)], [(0, -40), (10, -30), (22, -22), (32, -10), (36, -4)], [(0, -40), (-4, -54), (-10, -66), (-14, -80)]]
    z.special.append(lava_mesh(z, lava))
    crater = Asset("crater")
    crater.add(cyl(5.5, 0.4, pos=(0, top - 0.6, -40), color=0xff7a2a, kind=KIND_GLOW, n=16, bevel=0))
    crater.add(cyl(3.0, 0.5, pos=(0, top - 0.45, -40), color=0xffd24a, kind=KIND_GLOW, n=12, bevel=0))
    z.special.append(crater)
    z.no_scatter += [LineString(l).buffer(3.0) for l in lava]
    harbour(z)
    paths = town(z, 46.0)
    paths += [(LineString([(0, 40), (-12, 24), (-30, 16)]), 3.0), (LineString([(0, 40), (14, 24), (30, 14)]), 3.0)]
    z.paths = paths
    z.structure("forge_hut", 22, 32, -0.6, clear=4)
    z.dock(-38, 22.0, -38, 14.0)
    z.dock(36, 15.0, 36, 9.0)
    for (x, zz) in [(-30, -2), (-44, 14), (30, 8), (42, -6), (-24, 2)]:
        z.place("steam_vent", x, zz, 0, y=0.0)
    for (ls, w) in z.paths[3:]:
        z.along("torch_tiki", list(ls.coords), 9.0, offset=2.4, y=GROUND, seed=11)
    avoid = unary_union([ls.buffer(w / 2 + 1.2) for (ls, w) in z.paths] + z.plazas)
    land = walk.buffer(-1.5)
    z.scatter(["tree_ember", "tree_ember", "tree_palm"], land, 50, 7.0, 531, avoid=avoid.union(Point(0, 46).buffer(12)))
    z.scatter(["basalt_columns", "rock_basalt", "rock_basalt"], land, 30, 7.0, 532, avoid=avoid)
    z.scatter(["rock_basalt", "basalt_columns", "crystal_ember"], volcano.buffer(-3), 50, 5.0, 533, hmin=GROUND + 1.0)
    z.scatter(["bush_ember", "bush_ember", "crystal_ember"], land, 70, 3.0, 534, avoid=avoid)
    z.scatter(["grass_dry", "grass_dry", "rock_s"], land, 160, 1.6, 535, avoid=avoid)
    z.scatter(["rock_s", "rock_basalt"], walk.buffer(4).difference(walk.buffer(0.3)), 40, 4.0, 536, hmin=-0.6, hmax=0.9)
    z.scatter("buoy", Point(0, 92).buffer(40).difference(base.buffer(8)), 6, 14, 537, yrule="water")
    return z, lagoon

VIEWS = [((0, 12, 70), (0, 6, 0)), ((-50, 14, 30), (-38, 0, 4))]
