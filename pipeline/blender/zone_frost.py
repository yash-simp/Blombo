from zonelib import *

PAL = {"grass": [0xf3f7fb, 0xe7eff8, 0xdde8f3, 0xf8fbfd, 0xe2ecf6], "sand": 0xdfe6ee, "sand_wet": 0xc6d2dd, "seabed": 0x6f8a9a,
       "rock": 0x8a96a6, "path": 0xbccde0, "plaza": 0xd0dcea, "hill": 0xeef4fa, "land": SURF_SAND}

def build():
    z = Zone("frost", 411, PAL)
    base = blob(0, 2, 72, 411, wobble=0.1, sx=1.15, sz=0.95)
    lake = blob(0, -10, 30, 412, wobble=0.12, sx=1.25, sz=0.9)
    hills = [(-58, -44, 20, 10, 14), (-18, -60, 18, 12, 13), (26, -58, 20, 13, 14), (60, -38, 18, 9, 13)]
    hill_parts = [blob(x, zz, r, 420 + i, wobble=0.2) for i, (x, zz, r, hh, ramp) in enumerate(hills)]
    walk = base.difference(lake).difference(unary_union(hill_parts))
    walk = pin_harbour(walk.buffer(0.5).buffer(-0.5))
    z.walk_land = walk
    z.hills = [(p, hh, ramp) for p, (x, zz, r, hh, ramp) in zip(hill_parts, hills)]
    # the frozen lake: walkable ice with fishing holes
    z.ice = lake.buffer(1.2)
    z.walk_extra.append(z.ice)
    rng = random.Random(413)
    holes = []
    while len(holes) < 14:
        x, zz = rng.uniform(-30, 30), rng.uniform(-30, 12)
        if not lake.buffer(-4).contains(Point(x, zz)) or any(math.hypot(x - a, zz - b) < 8 for a, b in holes):
            continue
        holes.append((x, zz))
    z.water_override = [(Point(x, zz).buffer(1.4, quad_segs=8), 1.8) for (x, zz) in holes]
    z.anchors["holes"] = [[round(x, 2), 0, round(zz, 2)] for (x, zz) in holes]
    z.no_scatter += [Point(x, zz).buffer(2.5) for (x, zz) in holes]
    z.special.append(ice_mesh(z))
    harbour(z)
    paths = town(z, 46.0)
    paths += [(LineString([(0, 40), (0, 24)]), 3.0), (LineString([(-10, 40), (-34, 30), (-44, 12)]), 2.8), (LineString([(10, 40), (36, 28), (46, 10)]), 2.8)]
    z.paths = paths
    for (x, zz, yaw) in [(-30, 40, 0.6), (30, 38, -0.6), (-50, 22, 1.2), (52, 18, -1.2)]:
        z.structure("igloo", x, zz, yaw, clear=4)
    for (x, zz, yaw) in [(-14, -4, 0.4), (16, -16, -0.8), (-8, -26, 2.6)]:
        z.structure("ice_hut", x, zz, yaw, clear=3)
    for (x, zz, yaw) in [(-6, 30, 0.3), (8, 32, -0.4), (-40, 0, 1.0), (42, -2, -1.0)]:
        z.place("snowman", x, zz, yaw, y=GROUND)
    z.place("campfire", -22, 28, 0, y=GROUND)
    z.place("log", -24, 30, 0.6, y=GROUND)
    for (ls, w) in z.paths[3:]:
        z.along("lantern_post", list(ls.coords), 10.0, offset=2.4, y=GROUND, seed=9)
    ring = lake.buffer(5.0).exterior
    z.along("lantern_post", list(ring.coords), 14.0, offset=-2.0, y=GROUND, seed=10)
    avoid = unary_union([ls.buffer(w / 2 + 1.2) for (ls, w) in z.paths] + z.plazas + [lake.buffer(3)])
    land = walk.buffer(-1.5)
    hill_union = unary_union(hill_parts)
    z.scatter(["tree_snowpine_a", "tree_snowpine_b", "tree_snowpine_a"], land, 70, 6.0, 431, avoid=avoid.union(Point(0, 46).buffer(12)))
    z.scatter(["tree_snowpine_a", "tree_snowpine_b"], hill_union.buffer(-2), 110, 4.2, 432, hmin=GROUND + 1.0)
    z.scatter(["rock_ice", "crystal_ice", "rock_ice"], hill_union.buffer(-1), 26, 5.0, 433, hmin=GROUND + 0.5)
    z.scatter(["bush_snow", "bush_snow", "rock_ice"], land, 70, 3.0, 434, avoid=avoid)
    z.scatter(["crystal_ice"], land, 12, 9.0, 435, avoid=avoid)
    z.scatter(["rock_s", "rock_ice"], walk.buffer(4).difference(walk.buffer(0.3)), 40, 4.0, 436, hmin=-0.6, hmax=0.9)
    z.scatter("buoy", Point(0, 92).buffer(40).difference(base.buffer(8)), 6, 14, 437, yrule="water")
    return z, lake

VIEWS = [((0, 10, 70), (0, 1, 30)), ((24, 14, 24), (0, 0, -10))]
