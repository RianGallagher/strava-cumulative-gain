"""Draw the extension icons (16/48/128 px). Needs Pillow: pip install pillow.

Run from the repo root: python scripts/make_icons.py
"""
from PIL import Image, ImageDraw

BG = (31, 42, 68)  # slate
HILL = (122, 136, 158)
LINE = (52, 211, 153)  # green: "gain so far"
SS = 8  # supersampling factor


def profile(x):
    """Elevation profile, 0..1 in, 0..1 out (two climbs, like a real route)."""
    import math

    return (
        0.18
        + 0.42 * math.exp(-((x - 0.32) / 0.13) ** 2)
        + 0.62 * math.exp(-((x - 0.72) / 0.12) ** 2)
    )


def draw(size):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Store guidance: 96x96 artwork with 16 px transparent padding at 128.
    pad = round(s * 16 / 128) if size >= 48 else round(s * 1 / 16)
    box = (pad, pad, s - pad, s - pad)
    w = box[2] - box[0]
    d.rounded_rectangle(box, radius=round(w * 0.22), fill=BG)

    inner = round(w * 0.14)
    x0, y0, x1, y1 = box[0] + inner, box[1] + inner, box[2] - inner, box[3] - inner
    n = 200
    pts = [(x0 + (x1 - x0) * i / n, y1 - (y1 - y0) * 0.8 * profile(i / n)) for i in range(n + 1)]
    d.polygon([(x0, y1)] + pts + [(x1, y1)], fill=HILL)

    # Cumulative gain: only ever rises; steep where the profile climbs.
    gain = [0.0]
    for i in range(1, n + 1):
        gain.append(gain[-1] + max(0.0, profile(i / n) - profile((i - 1) / n)))
    top = gain[-1]
    line = [(x0 + (x1 - x0) * i / n, y1 - (y1 - y0) * (0.06 + 0.9 * g / top)) for i, g in enumerate(gain)]
    width = max(round(w * (0.075 if size >= 48 else 0.11)), SS)
    d.line(line, fill=LINE, width=width, joint="curve")
    r = width * 0.9
    ex, ey = line[-1]
    d.ellipse((ex - r, ey - r, ex + r, ey + r), fill=LINE)
    return img.resize((size, size), Image.LANCZOS)


for size in (16, 48, 128):
    draw(size).save(f"icons/icon{size}.png")
    print(f"icons/icon{size}.png")
