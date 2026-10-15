from zonelib import *

PAL = {"grass": [0x7cbf58, 0x6cb04c, 0x86c965, 0x63a74a, 0x8fcf6c], "sand": 0xe6d29a, "sand_wet": 0xc9b07a, "seabed": 0x6f8a7a,
       "rock": 0x8d9199, "path": 0xc9a46a, "plaza": 0xc9c2b2}

def build():
    z = Zone("lantern", 101, PAL)
    base = blob(0, 2, 70, 11, wobble=0.1, sx=1.12, sz=0.95)
    lake = blob(0, -14, 24, 12, wobble=0.14, sx=1.2, sz=0.92)
    hills_n = [(-58, -58, 24, 10, 16), (-28, -68, 22, 14, 14), (0, -62, 15, 9, 3.0), (30, -68, 24, 13, 15), (60, -56, 22, 10, 14)]
    north_parts = [blob(x, zz, r, 40 + i, wobble=0.2) for i, (x, zz, r, hh, ramp) in enumerate(hills_n)]
    north = unary_union(north_parts)
    west = blob(-68, 8, 16, 14, wobble=0.25)
    east = blob(68, -8, 17, 15, wobble=0.25)
    channel = rect(-3.6, -50, 3.6, -34)
    walk = base.difference(lake).difference(north).difference(west).difference(east).difference(channel)
    walk = walk.buffer(0.5).buffer(-0.5)
    z.walk_land = walk
    z.hills = [(p, hh, ramp) for p, (x, zz, r, hh, ramp) in zip(north_parts, hills_n)] + [(west, 7.0, 12.0), (east, 8.0, 12.0)]
    z.anchors['hill_glow'] = []
    # village layout
    SPAWN = (0, 42)
    z.anchors["spawn"] = [SPAWN[0], GROUND, SPAWN[1], 0.0]
    z.anchors["guide"] = [0, GROUND, 37.6, math.pi]
    z.anchors["market"] = [-13, GROUND, 21.5, math.pi * 0.75]
    z.anchors["tackle"] = [13, GROUND, 21.5, -math.pi * 0.75]
    z.anchors["captain"] = [5.5, GROUND, 58.5, math.pi * 0.9]
    z.anchors["host"] = [-21, GROUND, 37.5, -math.pi / 2]
    z.anchors["board"] = [7.5, GROUND, 31.0, -math.pi / 2]
    z.anchors["arrive"] = [0, GROUND, 60.0, 0.0]
    z.anchors["firstcast"] = [0, 0, -12.0]
    z.anchors["stage"] = [-27, GROUND, 36, math.pi / 2]
    z.plazas = [Point(0, 33).buffer(9.5)]
    paths = [
        [(0, 24), (0, 12)], [(-6, 27), (-12, 22)], [(6, 27), (12, 22)], [(0, 42), (0, 60)],
        [(0, 48), (-20, 52), (-34, 58)], [(0, 48), (20, 52), (34, 58)], [(-9, 34), (-22, 36)],
        [(-12, 24), (-26, 12), (-34, -2)], [(12, 24), (26, 12), (34, -2)],
    ]
    # ring path around the lake
    ring = lake.buffer(5.5).exterior
    z.paths = [(LineString(p), 3.2) for p in paths] + [(LineString(list(ring.coords)), 2.6)]
    # structures
    z.structure("plaza_disc", 0, 33, 0, clear=10)
    z.structure("fountain", 0, 31.5, 0, clear=4)
    z.anchors["fountain"] = [0, GROUND, 31.5]
    z.structure("market_stall", -13, 19.2, math.pi * 0.75 + math.pi, clear=4)
    z.structure("tackle_shack", 14.5, 18.5, -math.pi * 0.75 + math.pi, clear=5)
    z.structure("notice_board", 9.5, 31, -math.pi / 2, clear=2.5)
    z.structure("tourney_stage", -29, 36, math.pi / 2, clear=6)
    z.structure("captain_booth", 7.5, 57, -math.pi / 2, clear=3)
    z.structure("well", -8, 42, 0, clear=2.5)
    z.structure("signpost", 3.5, 38, 0.4, clear=1.5)
    for (x, zz, yaw, kind) in [(-31, 13, 0.6, "cottage_a"), (31, 12, -0.6, "cottage_c"), (-44, 30, 1.4, "cottage_b"), (44, 28, -1.4, "cottage_a"),
                                (-18, 50, 0.3, "cottage_c"), (19, 49, -0.3, "cottage_b"), (-46, 46, 1.1, "cottage_c"), (47, 44, -1.1, "cottage_b")]:
        z.structure(kind, x, zz, yaw, clear=4.5)
    for (x, zz, yaw) in [(-6.5, 17.5, 0.0), (6.5, 17.5, 0.0), (0, 47, 0.0), (-25, 5, -0.8), (25, 5, 0.8)]:
        z.place("lantern_string", x, zz, yaw, y=GROUND)
    # benches, clutter around the plaza
    for k in range(6):
        ang = k / 6 * math.tau + 0.3
        if abs(math.sin(ang) + 1) < 0.4 or abs(math.cos(ang)) > 0.95:
            continue
        z.place("bench", math.cos(ang) * 10.5, 33 + math.sin(ang) * 10.5, -ang + math.pi / 2 + math.pi, y=GROUND)
    for (p, x, zz, yaw) in [("crate_fish", -16.5, 20, 0.3), ("barrel", -9.5, 18, 0), ("crate", -17, 23, 0.6), ("barrel", 18.5, 21.5, 0.2), ("rod_rack", 10.5, 15.5, math.pi * 1.2),
                             ("bucket_worms", 11, 19.5, 0), ("crate", 17.8, 23.5, 0.1), ("net_rack", -4.5, 14, 0), ("crate", 4, 13.5, 0.4), ("barrel", 4.5, 55, 0), ("crate", -4, 56, 0.3),
                             ("haybale", -38, 22, 0.4), ("campfire", -24, -14, 0), ("log", -27, -16, 0.6), ("log", -21, -17, -0.8), ("stump", -26, -11, 0)]:
        z.place(p, x, zz, yaw, y=GROUND)
    # docks
    z.dock(0, 11.0, 0, -7.0)
    z.dock(-20, 6.0, -13, -1.0)
    z.dock(22, 4.5, 15, -2.5)
    tip = z.dock(0, 59.5, 0, 81.5)
    z.place("boat_rowboat", 3.6, 76, 0.1, y=0.0)
    # bridge over the waterfall stream
    z.place("bridge_wood", 0, -41.5, 0, y=0.0)
    z.walk_extra.append(rect(-4.6, -43.2, 4.6, -39.8))
    z.no_scatter.append(rect(-6, -46, 6, -36))
    # home harbour: two piers with six plots on each side
    plots = []
    for px in (-34, 34):
        z.dock(px, 57.5, px, 106.0, end=False, width=4.0)
        for k in range(6):
            pz = 66 + 7 * k
            for side in (-1, 1):
                cx = px + side * 4.6
                z.place("home_plot", cx, pz, -side * math.pi / 2, y=0.0)
                z.walk_extra.append(rect(cx - 2.6, pz - 2.6, cx + 2.6, pz + 2.6))
                plots.append([round(cx, 2), GROUND, pz, side * math.pi / 2])
    z.anchors["plots"] = plots
    # waterfall
    z.anchors["waterfall"] = [0, GROUND + 7.0, -47.5]
    z.special.append(waterfall_mesh("waterfall", 0, -48.6, GROUND + 7.2, width=5.5, face=1))
    # lanterns along paths
    plaza_clear = Point(0, 33).buffer(11.5)
    before = len(z.instances)
    for (ls, w) in z.paths[:9]:
        z.along("lantern_post", list(ls.coords), 9.0, offset=2.6, y=GROUND, seed=3)
    z.instances = z.instances[:before] + [i for i in z.instances[before:] if not plaza_clear.contains(Point(i[1], i[3]))]
    for k in range(8):
        ang = k / 8 * math.tau + 0.39
        z.place("lantern_ground", math.cos(ang) * 9.8, 33 + math.sin(ang) * 9.8, 0, y=GROUND)
    z.along("lantern_post", list(ring.coords), 12.0, offset=-2.2, y=GROUND, seed=4)
    # scatter nature
    avoid_paths = unary_union([ls.buffer(w / 2 + 1.2) for (ls, w) in z.paths] + z.plazas)
    land = walk.buffer(-1.5)
    z.scatter(["tree_round_a", "tree_round_b", "tree_round_c", "tree_pine_b", "tree_willow"], land, 70, 6.0, 21, avoid=avoid_paths.union(Point(0, 33).buffer(14)))
    z.scatter(["tree_pine_a", "tree_pine_b", "tree_round_b", "tree_pine_a"], north.buffer(-2), 110, 4.2, 22, hmin=GROUND + 1.0)
    z.scatter(["tree_pine_a", "tree_round_a", "tree_round_c", "tree_pine_b"], west.union(east).buffer(-1), 40, 4.0, 23, hmin=GROUND + 0.8)
    z.scatter(["rock_l", "rock_m"], north.buffer(-1), 18, 6.0, 24, hmin=GROUND + 0.5)
    z.scatter(["bush_a", "bush_b", "bush_c"], land, 90, 2.6, 25, avoid=avoid_paths, scale=(0.8, 1.4))
    z.scatter(["bush_a", "bush_b", "rock_m", "mushrooms_red"], north.union(west).union(east), 60, 3.0, 125, hmin=GROUND + 0.5)
    z.scatter(["flowers_pink", "flowers_yellow", "flowers_blue"], land, 150, 1.8, 26, avoid=avoid_paths, scale=(0.9, 1.4))
    z.scatter(["grass", "grass", "grass_dry"], land, 420, 1.3, 27, avoid=avoid_paths, scale=(0.9, 1.6))
    z.scatter(["grass", "flowers_yellow", "grass"], north.union(west).union(east), 160, 2.0, 127, hmin=GROUND + 0.3)
    z.scatter(["mushrooms_red", "stump", "log"], land, 10, 6, 28, avoid=avoid_paths)
    shore = walk.buffer(4).difference(walk.buffer(0.3))
    z.scatter(["reeds", "cattails"], shore, 130, 1.8, 29, hmin=-0.35, hmax=0.75, scale=(0.9, 1.4))
    z.scatter(["rock_s", "rock_m"], shore, 30, 4.0, 30, hmin=-0.6, hmax=0.9, scale=(0.7, 1.2))
    z.scatter("lilypad", lake.buffer(-4), 46, 2.2, 31, yrule="water", scale=(0.8, 1.4))
    z.scatter("buoy", Point(0, 90).buffer(40).difference(base.buffer(8)), 8, 14, 32, yrule="water")
    for k in range(5):
        z.place("lantern_ground", -3 + k * 1.5, 0, 0, y=GROUND)  if False else None
    return z, lake

VIEWS = [((0, 8, 52), (0, 1.5, 20)), ((30, 26, 40), (0, 0, -15)), ((-34, 6, 92), (-34, 1, 62))]
