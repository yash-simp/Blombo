from zonelib import *

PAL = {"grass": [0x78c45a, 0x6ab64f, 0x84ce68, 0x5fa848, 0x92d674], "sand": 0xd9c78f, "sand_wet": 0xb8a374, "seabed": 0x5f7f6a,
       "rock": 0x8a8f95, "path": 0xc79f68, "plaza": 0xc4bba8, "hill": 0x66a148}

def chaikin(pts, rounds=3):
    for _ in range(rounds):
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            out += [(a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25), (a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75)]
        out.append(pts[-1])
        pts = out
    return pts

def river_poly(line, width_at, step=1.5):
    """A river of varying width: discs every `step` metres along the line, joined pairwise."""
    ls = LineString(line)
    n = int(ls.length / step)
    pts = [ls.interpolate(ls.length * k / n) for k in range(n + 1)]
    parts = []
    for a, b in zip(pts[:-1], pts[1:]):
        parts.append(a.buffer(width_at(a.x) / 2, quad_segs=6).union(b.buffer(width_at(b.x) / 2, quad_segs=6)).convex_hull)
    return unary_union(parts)

BRIDGES = (-8.0, 58.0)

def build():
    z = Zone("willow", 211, PAL)
    base = blob(0, 0, 76, 211, wobble=0.1, sx=1.22, sz=0.9)
    line = chaikin([(-130, 4), (-84, 0), (-56, -12), (-30, -3), (-8, -11), (16, -2), (36, -13), (58, -6), (86, -12), (130, -8)])
    def width_at(x):
        w = 15.0 - sum(8.5 * math.exp(-((x - bx) / 7.0) ** 2) for bx in BRIDGES)
        return w + max(0.0, abs(x) - 80) * 0.4
    river = river_poly(line, width_at)
    pond = blob(-42, 34, 9, 214, wobble=0.15)
    hills = [(-62, -46, 20, 9, 14), (-24, -56, 18, 11, 13), (20, -54, 20, 12, 14), (58, -44, 19, 9, 13)]
    hill_parts = [blob(x, zz, r, 220 + i, wobble=0.2) for i, (x, zz, r, hh, ramp) in enumerate(hills)]
    walk = base.difference(river).difference(pond).difference(unary_union(hill_parts))
    walk = pin_harbour(walk.buffer(0.5).buffer(-0.5))
    # keep only pieces big enough to stand on (river cuts can leave slivers)
    geoms = [g for g in (walk.geoms if hasattr(walk, "geoms") else [walk]) if g.area > 40]
    walk = unary_union(geoms)
    z.walk_land = walk
    z.hills = [(p, hh, ramp) for p, (x, zz, r, hh, ramp) in zip(hill_parts, hills)]

    harbour(z)
    paths = town(z, 46.0)
    # bridges across the narrow places of the river
    river_ls = LineString(line)
    for bx in BRIDGES:
        p = river_ls.interpolate(river_ls.project(Point(bx, 0)))
        q = river_ls.interpolate(river_ls.project(Point(bx, 0)) + 1.0)
        flow = math.atan2(-(q.x - p.x), -(q.y - p.y))
        z.place("bridge_wood", p.x, p.y, flow, y=0.0)
        dx, dz = q.x - p.x, q.y - p.y
        dl = math.hypot(dx, dz)
        nx, nz = -dz / dl, dx / dl
        a, b = (p.x + nx * 5.2, p.y + nz * 5.2), (p.x - nx * 5.2, p.y - nz * 5.2)
        z.walk_extra.append(LineString([a, b]).buffer(1.6, cap_style=2))
        z.no_scatter.append(Point(p.x, p.y).buffer(7))
        paths.append((LineString([(p.x + nx * 12, p.y + nz * 12), a]), 2.8))
        paths.append((LineString([b, (p.x - nx * 12, p.y - nz * 12)]), 2.8))
    paths.append((LineString([(0, 40), (-6, 24), (-8, 3)]), 3.0))
    paths.append((LineString([(10, 40), (36, 30), (58, 10)]), 3.0))
    paths.append((LineString([(-9, -24), (-10, -40)]), 2.8))
    paths.append((LineString([(58, -18), (40, -28), (36, -30)]), 2.8))
    z.paths = paths
    # the mill on the north bank, its wheel dipping into the river
    p = river_ls.interpolate(river_ls.project(Point(34, 0)))
    z.structure("mill_house", p.x - 1.5, p.y - 12.5, -math.pi / 2, clear=5)
    z.place("mill_wheel", p.x - 1.5, p.y - 7.2, math.pi / 2, y=GROUND + 1.0)
    z.anchors["mill"] = [round(p.x - 1.5, 2), GROUND + 1.0, round(p.y - 7.2, 2)]
    # river docks to fish from
    for (x0, z0, x1, z1) in [(-30, 10, -31, 3.0), (20, 8, 20, 1.5), (-64, -1, -60, -5)]:
        z.dock(x0, z0, x1, z1)
    z.dock(-42, 45.0, -42, 37.0)
    # cottages and village dressing
    for (x, zz, yaw, kind) in [(-26, 40, 0.5, "cottage_b"), (28, 40, -0.5, "cottage_a"), (-48, 18, 1.2, "cottage_c"), (44, 22, -1.0, "cottage_c"),
                               (-36, -26, 2.8, "cottage_a"), (8, -30, 3.0, "cottage_b"), (66, -26, -2.6, "cottage_a")]:
        z.structure(kind, x, zz, yaw, clear=4.5)
    z.structure("notice_board", 7.5, 40, -math.pi / 2, clear=2)
    z.structure("well", -7, 52, 0, clear=2.5)
    for (pr, x, zz, yaw) in [("haybale", -56, 26, 0.3), ("haybale", -54, 23, 1.2), ("fence_3", -60, 30, 0.2), ("fence_3", -55, 33, 0.9),
                             ("log", 30, -36, 0.5), ("stump", 26, -34, 0), ("campfire", -50, -10, 0), ("log", -53, -12, 0.8), ("barrel", 6, 36, 0)]:
        z.place(pr, x, zz, yaw, y=GROUND)
    for (x, zz, yaw) in [(0, 51, 0.0), (-6, 30, 1.2)]:
        z.place("lantern_string", x, zz, yaw, y=GROUND)
    for (ls, w) in z.paths[3:]:
        z.along("lantern_post", list(ls.coords), 10.0, offset=2.4, y=GROUND, seed=5)
    # willows hug the river; meadows and woods beyond
    banks = river.buffer(8).difference(river.buffer(1.5)).intersection(walk)
    avoid = unary_union([ls.buffer(w / 2 + 1.2) for (ls, w) in z.paths] + z.plazas)
    z.scatter(["tree_willow", "tree_willow", "tree_round_b"], banks, 46, 7.0, 230, avoid=avoid, scale=(0.95, 1.35))
    land = walk.buffer(-1.5)
    z.scatter(["tree_round_a", "tree_round_b", "tree_round_c", "tree_pine_b"], land, 60, 7.0, 231, avoid=avoid.union(Point(0, 46).buffer(14)))
    hill_union = unary_union(hill_parts)
    z.scatter(["tree_pine_a", "tree_pine_b", "tree_round_c"], hill_union.buffer(-2), 70, 4.4, 232, hmin=GROUND + 1.0)
    z.scatter(["rock_l", "rock_m"], hill_union.buffer(-1), 14, 6.0, 233, hmin=GROUND + 0.5)
    z.scatter(["bush_a", "bush_b", "bush_c"], land, 90, 2.6, 234, avoid=avoid, scale=(0.8, 1.4))
    z.scatter(["flowers_pink", "flowers_yellow", "flowers_blue", "flowers_yellow"], land, 190, 1.7, 235, avoid=avoid, scale=(0.9, 1.4))
    z.scatter(["grass", "grass", "grass_dry"], land, 420, 1.3, 236, avoid=avoid, scale=(0.9, 1.6))
    z.scatter(["grass", "flowers_pink", "bush_a"], hill_union, 140, 2.2, 237, hmin=GROUND + 0.3)
    shore = walk.buffer(4).difference(walk.buffer(0.3))
    z.scatter(["reeds", "cattails", "cattails"], shore, 170, 1.7, 238, hmin=-0.4, hmax=0.75, scale=(0.9, 1.4))
    z.scatter(["rock_s", "rock_m"], shore, 34, 4.0, 239, hmin=-0.6, hmax=0.9, scale=(0.7, 1.2))
    z.scatter("lilypad", river.buffer(-2.5).union(pond.buffer(-2)), 70, 2.4, 240, yrule="water", scale=(0.8, 1.4))
    z.scatter("buoy", Point(0, 92).buffer(40).difference(base.buffer(8)), 6, 14, 241, yrule="water")
    return z, river

VIEWS = [((0, 10, 70), (0, 1, 30)), ((-20, 22, 34), (20, 0, -10)), ((50, 10, 4), (34, 2, -20))]
