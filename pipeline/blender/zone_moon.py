from zonelib import *

PAL = {"grass": [0x2f5a5e, 0x2a5262, 0x35626a, 0x2c4e5e, 0x386a66], "sand": 0x8a96b4, "sand_wet": 0x6a7898, "seabed": 0x2a3a5e,
       "rock": 0x5a5e7a, "path": 0x9aa4c8, "plaza": 0xaab4d8, "hill": 0x2c4c5a}

def build():
    z = Zone("moon", 611, PAL)
    base = blob(0, 2, 70, 611, wobble=0.12, sx=1.12, sz=0.95)
    pond = blob(0, -14, 26, 612, wobble=0.1, sx=1.15)
    islet = Point(0, -16).buffer(6.5, quad_segs=10)
    hills = [(-54, -40, 18, 8, 12), (52, -42, 18, 8, 12), (0, -62, 16, 9, 12)]
    hill_parts = [blob(x, zz, r, 620 + i, wobble=0.2) for i, (x, zz, r, hh, ramp) in enumerate(hills)]
    walk = base.difference(pond).union(islet).difference(unary_union(hill_parts))
    walk = pin_harbour(walk.buffer(0.5).buffer(-0.5))
    z.walk_land = walk
    z.hills = [(p, hh, ramp) for p, (x, zz, r, hh, ramp) in zip(hill_parts, hills)]
    harbour(z)
    paths = town(z, 46.0)
    paths += [(LineString([(0, 40), (0, 20)]), 3.2)]
    z.paths = paths
    # a boardwalk across the pond to the moon shrine on its islet
    z.dock(0, 18.0, 0, -9.0, end=False)
    z.structure("moon_shrine", 0, -17, 0, clear=4)
    ring = pond.buffer(4.5).exterior
    z.along("stone_lantern", list(ring.coords), 9.0, offset=-1.5, y=GROUND, seed=13)
    for k in range(6):
        ang = k / 6 * math.tau + 0.5
        z.place("crystal_moon", math.cos(ang) * 4.6, -16 + math.sin(ang) * 4.6, ang, y=GROUND)
    avoid = unary_union([ls.buffer(w / 2 + 1.2) for (ls, w) in z.paths] + z.plazas + [pond.buffer(2.5)])
    land = walk.buffer(-1.5).difference(islet.buffer(1))
    hill_union = unary_union(hill_parts)
    z.scatter(["tree_mushroom", "tree_mushroom", "tree_round_c"], land, 46, 7.5, 631, avoid=avoid.union(Point(0, 46).buffer(12)), scale=(0.9, 1.5))
    z.scatter(["tree_pine_b", "tree_mushroom"], hill_union.buffer(-2), 50, 5.0, 632, hmin=GROUND + 1.0)
    z.scatter(["mushrooms_glow", "flowers_glow", "mushrooms_glow"], land, 170, 2.0, 633, avoid=avoid)
    z.scatter(["bush_moon", "bush_moon", "rock_moon", "crystal_moon"], land, 80, 3.0, 634, avoid=avoid)
    z.scatter(["grass", "grass"], land, 200, 1.5, 635, avoid=avoid)
    z.scatter(["rock_moon", "crystal_moon"], hill_union.buffer(-1), 20, 5.0, 636, hmin=GROUND + 0.5)
    z.scatter("lilypad", pond.buffer(-3).difference(islet.buffer(3)).difference(rect(-3, -9, 3, 20)), 40, 2.6, 637, yrule="water")
    z.scatter(["rock_s", "rock_moon"], walk.buffer(4).difference(walk.buffer(0.3)), 30, 4.0, 638, hmin=-0.6, hmax=0.9)
    return z, pond

VIEWS = [((0, 12, 60), (0, 1, -10)), ((20, 8, 6), (0, 1, -16))]
