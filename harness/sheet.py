import sys, glob
from PIL import Image, ImageDraw
shape, cols, w, per = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
files = sorted(glob.glob(f"shots/{shape}/*.png"))
for s in range(0, len(files), per):
    group = files[s:s+per]
    ims = []
    for f in group:
        im = Image.open(f).convert("RGB"); im.thumbnail((w, 10000)); ims.append((f, im))
    h = max(im.height for _, im in ims)
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + 6), rows * (h + 26)), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    for i, (f, im) in enumerate(ims):
        x, y = (i % cols) * (w + 6), (i // cols) * (h + 26)
        sheet.paste(im, (x, y + 22)); d.text((x + 4, y + 4), f.split("/")[-1], fill=(255, 255, 0))
    out = f"/tmp/claude-0/sheet-{shape}-{s // per}.jpg"
    sheet.save(out, quality=82); print(out, sheet.size)
