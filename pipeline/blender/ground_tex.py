"""Ground detail texture: python3 ground_tex.py [out.webp] [--preview]

One tileable 1024x1024 RGBA image, each channel a greyscale detail layer (about 0.5 on average) that the
ground shader (game/src/assets/materials.ts groundToon) turns into a brightness multiplier on the vertex
colour, picked per vertex by the surface type the zone builder writes into the colour alpha:
  R grass   soft clumps and fine blade strokes
  G sand    soft wind ripples and specks (also snow)
  B paving  rounded cobbles of slightly different brightness with darker gaps
  A dirt    mottled earth, small pebbles and thin cracks (paths, rock, ash)
Stylised, not photographic. Everything wraps (FFT noise, toroidal Voronoi, strokes drawn on all sides),
so the tile repeats without seams; the shader samples it every ~3.5 m plus a rotated larger copy.
The image is data, not colour: lossless WebP so channels never bleed into each other. No pixel-scale
grain: it is below what the shader shows, and noise is what makes a lossless file big. Keep every
channel at 0.16 or more (finish): the alpha channel is a layer, and low alpha costs RGB precision."""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

N = 1024
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "out", "up", "ground_detail.webp")

def norm(a):
    a = a - a.mean()
    return a / (a.std() + 1e-9)

def band(seed, lo, hi, n=N):
    """Tileable noise with features between lo and hi cycles per tile (zero mean, unit std)."""
    rng = np.random.default_rng(seed)
    f = np.fft.fft2(rng.standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None] * n
    fx = np.fft.fftfreq(n)[None, :] * n
    r = np.sqrt(fx * fx + fy * fy)
    w = np.exp(-((np.log(np.maximum(r, 1e-3)) - math.log(math.sqrt(lo * hi))) ** 2) / (2 * (math.log(hi / lo) / 2.5) ** 2))
    w[0, 0] = 0
    return norm(np.real(np.fft.ifft2(f * w)))

def blur(a, sigma):
    """Wrapped gaussian blur (FFT)."""
    n = a.shape[0]
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    g = np.exp(-2 * (math.pi * sigma) ** 2 * (fx * fx + fy * fy))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g))

def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

def voronoi(points, n=N):
    """Toroidal Voronoi: F1, F2 distances (pixels) and the nearest point's index for every pixel."""
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    f1 = np.full((n, n), 1e9, np.float32)
    f2 = np.full((n, n), 1e9, np.float32)
    idx = np.zeros((n, n), np.int32)
    for k, (px, py) in enumerate(points):
        dx = np.abs(xs - px)
        dx = np.minimum(dx, n - dx)
        dy = np.abs(ys - py)
        dy = np.minimum(dy, n - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        idx = np.where(closer, k, idx)
        f1 = np.where(closer, d, f1)
    return f1, f2, idx

def relaxed_points(count, seed, iters=3, n=N):
    """Jittered points spread evenly (a few Lloyd steps on a coarse grid, wrapped)."""
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0, n, (count, 2))
    m = 256
    ys, xs = np.mgrid[0:m, 0:m].astype(np.float64) * (n / m)
    for _ in range(iters):
        best = np.full((m, m), 1e18)
        own = np.zeros((m, m), np.int32)
        offs = []
        for k, (px, py) in enumerate(pts):
            dx = xs - px
            dx = dx - n * np.round(dx / n)
            dy = ys - py
            dy = dy - n * np.round(dy / n)
            d = dx * dx + dy * dy
            closer = d < best
            best = np.where(closer, d, best)
            own = np.where(closer, k, own)
            offs.append((dx, dy))
        new = []
        for k, (px, py) in enumerate(pts):
            mask = own == k
            if not mask.any():
                new.append((px, py))
                continue
            dx, dy = offs[k]
            new.append(((px + dx[mask].mean()) % n, (py + dy[mask].mean()) % n))
        pts = np.array(new)
    return pts

def strokes(seed, count, length, width, angle, spread, n=N):
    """Short wrapped strokes (grass blades, cracks): +1 bright strokes, -1 dark strokes."""
    rng = np.random.default_rng(seed)
    big = Image.new("F", (n * 3, n * 3), 0.0)
    d = ImageDraw.Draw(big)
    for _ in range(count):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        a = angle + rng.normal(0, spread)
        L = rng.uniform(*length)
        v = 1.0 if rng.random() < 0.55 else -1.0
        v *= rng.uniform(0.5, 1.0)
        dx, dy = math.cos(a) * L, math.sin(a) * L
        w = max(1, int(round(rng.uniform(*width))))
        for ox in (0, n, 2 * n):
            for oy in (0, n, 2 * n):
                d.line([(x + ox, y + oy), (x + ox + dx, y + oy + dy)], fill=v, width=w)
    a = np.asarray(big, np.float32)
    # fold the 3x3 canvas back onto one tile (strokes crossing an edge continue on the other side)
    out = np.zeros((n, n), np.float32)
    for i in range(3):
        for j in range(3):
            out += a[i * n:(i + 1) * n, j * n:(j + 1) * n]
    return np.clip(out, -1.2, 1.2)

def discs(seed, count, radius, n=N):
    """Small wrapped pebbles: a lit cap with a soft darker rim below (stylised top-down light)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    for _ in range(count):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        r = rng.uniform(*radius)
        sx, sy = rng.uniform(0.7, 1.3), rng.uniform(0.7, 1.3)
        v = rng.uniform(0.5, 1.0) * (1 if rng.random() < 0.7 else -0.6)
        R = int(r * 1.6) + 3
        x0, y0 = int(x) - R, int(y) - R
        yy, xx = np.mgrid[y0:y0 + 2 * R, x0:x0 + 2 * R].astype(np.float32)
        dd = np.sqrt(((xx - x) / (r * sx)) ** 2 + ((yy - y) / (r * sy)) ** 2)
        cap = sstep(1.0, 0.6, dd) * (0.8 + 0.2 * sstep(1.0, 0.0, np.sqrt(((xx - x + r * 0.3) / (r * sx)) ** 2 + ((yy - y + r * 0.3) / (r * sy)) ** 2)))
        rim = sstep(1.45, 1.0, np.sqrt(((xx - x - r * 0.25) / (r * sx)) ** 2 + ((yy - y - r * 0.3) / (r * sy)) ** 2)) * (1 - cap)
        patch = v * cap - 0.55 * abs(v) * rim
        ys = np.arange(y0, y0 + 2 * R) % n
        xs = np.arange(x0, x0 + 2 * R) % n
        out[np.ix_(ys, xs)] += patch
    return out

def finish(a, mean=0.5, lo=0.16, hi=0.9):
    a = np.clip(a, lo, hi)
    return np.clip(a + (mean - a.mean()), lo, hi)

def tufts(seed, count, length=(9, 20), n=N):
    """Grass tufts: a fan of 3-6 blades from one root, dark at the root and lit toward the tip."""
    rng = np.random.default_rng(seed)
    big = Image.new("F", (n * 3, n * 3), 0.0)
    d = ImageDraw.Draw(big)
    for _ in range(count):
        x, y = rng.uniform(0, n), rng.uniform(0, n)
        lean = -math.pi / 2 + rng.normal(0, 0.35)
        v = rng.uniform(0.6, 1.0)
        for b in range(int(rng.integers(3, 7))):
            a = lean + rng.uniform(-0.7, 0.7)
            L = rng.uniform(*length)
            ex, ey = x + math.cos(a) * L, y + math.sin(a) * L
            mx, my = x + math.cos(a) * L * 0.45, y + math.sin(a) * L * 0.45
            for ox in (0, n, 2 * n):
                for oy in (0, n, 2 * n):
                    d.line([(x + ox, y + oy), (mx + ox, my + oy)], fill=-0.6 * v, width=4)
                    d.line([(mx + ox, my + oy), (ex + ox, ey + oy)], fill=v, width=3)
    a = np.asarray(big, np.float32)
    out = np.zeros((n, n), np.float32)
    for i in range(3):
        for j in range(3):
            out += a[i * n:(i + 1) * n, j * n:(j + 1) * n]
    return np.clip(out, -1.2, 1.2)

def grass():
    clumps = band(11, 4, 11)
    patches = band(12, 1.5, 4)
    big_tufts = blur(tufts(13, 1500, (16, 34)), 1.2)
    small_tufts = blur(tufts(16, 2600, (8, 16)), 0.8)
    tips = blur(strokes(14, 5000, (5, 11), (1.4, 2.2), -1.5, 0.6), 0.7)
    v = 0.5 + 0.085 * clumps + 0.04 * patches + 0.11 * big_tufts + 0.07 * small_tufts + 0.04 * tips
    # darker hollows between clumps read as depth
    v -= 0.08 * sstep(0.3, 1.6, -clumps)
    return finish(v)

def sand():
    n = N
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32) / n
    warp = band(21, 1.5, 4) * 0.55 + band(22, 4, 9) * 0.2
    # about 9 ripples per 3.5 m, running slightly diagonal, gently bent by the warp
    phase = 2 * math.pi * (9 * xs + 2 * ys) + warp
    s = 0.5 + 0.5 * np.sin(phase)
    ripple = blur(s ** 2.5 - 0.3, 1.5)          # sharper crests, wide troughs
    fade = 0.45 + 0.55 * sstep(-0.9, 0.7, band(23, 2, 6))   # ripples come and go
    specks = blur(strokes(25, 2200, (1, 3), (1.5, 2.5), 0, 3.0), 0.7)
    soft = band(26, 4, 12)
    v = 0.5 + 0.2 * ripple * fade + 0.07 * specks + 0.03 * soft
    return finish(v)

def paving():
    pts = relaxed_points(100, 31)
    f1, f2, idx = voronoi(pts)
    rng = np.random.default_rng(32)
    tone = rng.uniform(-0.09, 0.09, len(pts)).astype(np.float32)
    edge = (f2 - f1) * 0.5                       # distance to the cell border (pixels)
    wob = band(33, 8, 24) * 1.2
    e = edge + wob
    gap = sstep(2.0, 5.5, e)                     # dark mortar line between stones
    dome = sstep(3.0, 26.0, e)                   # rounded stones: darker toward the rim
    stone = 0.56 + tone[idx] + 0.07 * (dome - 0.6) + 0.02 * band(34, 30, 90)
    # a few chipped / cracked stones
    chips = blur(strokes(36, 260, (6, 14), (1.2, 2.0), 0, 3.0), 0.6)
    stone += 0.05 * np.minimum(chips, 0)
    v = stone * gap + (0.2 + 0.03 * band(37, 30, 80)) * (1 - gap)
    return finish(v)

def dirt():
    mott = band(41, 3, 9)
    peb = discs(44, 300, (7.0, 16.0)) + 0.8 * discs(45, 900, (2.5, 6.0))
    pts = relaxed_points(14, 46, iters=1)
    f1, f2, _ = voronoi(pts)
    wob = band(47, 6, 20) * 1.6
    crack = sstep(3.0, 0.8, (f2 - f1) * 0.5 + wob) * sstep(-0.4, 0.5, band(48, 2, 6))
    v = 0.52 + 0.1 * mott + 0.17 * peb - 0.26 * blur(crack, 0.8)
    return finish(v)

def main():
    out = next((a for a in sys.argv[1:] if not a.startswith("--")), OUT)
    layers = [grass(), sand(), paving(), dirt()]
    for name, a in zip("RGBA", layers):
        print(name, "mean %.3f std %.3f min %.3f max %.3f" % (a.mean(), a.std(), a.min(), a.max()))
    # 6-bit steps compress far better and are below what the shader's ±25% can show
    rgba = np.stack([np.round(a * 63) * 4 + 2 for a in layers], -1).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(rgba, "RGBA")
    im.save(out, "WEBP", lossless=True, quality=100, method=6, exact=True)
    print(out, os.path.getsize(out), "bytes")
    if "--preview" in sys.argv:
        base = os.path.splitext(out)[0]
        for name, a in zip("rgba", layers):
            tile = Image.fromarray((a * 255).astype(np.uint8), "L")
            two = Image.new("L", (N * 2, N * 2))
            for i in range(2):
                for j in range(2):
                    two.paste(tile, (i * N, j * N))
            two.resize((1024, 1024)).save(f"{base}_{name}.png")

if __name__ == "__main__":
    main()
