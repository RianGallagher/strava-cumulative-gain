"""Compose Chrome Web Store images from the raw page captures.

Needs Pillow (pip install pillow) and macOS's Avenir Next font.
Run from the repo root: python scripts/make_store_images.py
Inputs: store/captures/*.png   Outputs: store/images/*.png
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT = "/System/Library/Fonts/Avenir Next.ttc"
DEMI, REGULAR = 2, 7  # face indexes in the .ttc
INK = (31, 42, 68)
MUTED = (91, 101, 118)
PAGE = (244, 245, 247)
GREEN = (52, 211, 153)
W, H = 1280, 800


def font(size, face=DEMI):
    return ImageFont.truetype(FONT, size, index=face)


# Crop boxes (in capture pixels) that trim stray UI from the edges.
CROPS = {
    "route-tooltip": (0, 0, 1568, 382),  # drop the half-cut "Show climbs" line
    "activity-splits": (0, 0, 520, 872),  # drop the partial 13th row
    "activity-tooltip": (0, 0, 1000, 456),  # zoom to 0-9 km so the tooltip is legible
}


def capture(name):
    img = Image.open(f"store/captures/{name}.png").convert("RGB")
    return img.crop(CROPS[name]) if name in CROPS else img


def fit(img, max_w, max_h):
    k = min(max_w / img.width, max_h / img.height)
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)


def card(canvas, img, x, y):
    """Paste `img` on a white card with a soft shadow, top-left at (x, y)."""
    pad = 16
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (x - pad, y - pad + 6, x + img.width + pad, y + img.height + pad + 6), 14, fill=(20, 30, 50, 60)
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    ImageDraw.Draw(canvas).rounded_rectangle(
        (x - pad, y - pad, x + img.width + pad, y + img.height + pad), 14, fill=(255, 255, 255, 255)
    )
    canvas.paste(img, (x, y))


def slide(title, subtitle, place):
    canvas = Image.new("RGBA", (W, H), PAGE + (255,))
    d = ImageDraw.Draw(canvas)
    d.rectangle((0, 0, W, 6), fill=GREEN)
    d.text((64, 52), title, font=font(44), fill=INK)
    d.text((64, 114), subtitle, font=font(22, REGULAR), fill=MUTED)
    place(canvas, top=176)
    return canvas.convert("RGB")


def centred(name, max_w=1120, max_h=560):
    def place(canvas, top):
        img = fit(capture(name), max_w, max_h)
        card(canvas, img, (W - img.width) // 2, top + (H - top - 40 - img.height) // 2)

    return place


def splits_and_chart(canvas, top):
    splits = fit(capture("activity-splits"), 330, H - top - 70)
    chart = fit(capture("activity-tooltip"), 720, 460)
    gap = 60
    x = (W - splits.width - gap - chart.width) // 2
    card(canvas, splits, x, top + 8)
    card(canvas, chart, x + splits.width + gap, top + 8 + (splits.height - chart.height) // 2)


slides = [
    ("screenshot-1-tooltip", "Elevation gained and lost, as you hover",
     "Gain and Loss rows in Strava's own tooltip, matching Strava's totals.", centred("route-tooltip")),
    ("screenshot-2-climbs", "See every climb (optional)",
     "Tick “Show climbs” for highlighted climbs and a climb table.", centred("route-climbs", 1000, 570)),
    ("screenshot-3-splits", "Gain and loss for every split",
     "Click Elev in the Splits table to see what a “0 m” kilometre really hid.", splits_and_chart),
    ("screenshot-4-builder", "Live while you build a route",
     "Updates as you edit in the route builder.", centred("builder")),
]
for name, title, subtitle, place in slides:
    slide(title, subtitle, place).save(f"store/images/{name}.png")
    print(f"store/images/{name}.png")

# Small promo tile, 440x280.
tile = Image.new("RGBA", (440, 280), INK + (255,))
d = ImageDraw.Draw(tile)
icon = Image.open("icons/icon128.png").convert("RGBA")
tile.alpha_composite(icon, (24, 76))
d.text((156, 92), "Cumulative", font=font(30), fill=(255, 255, 255))
d.text((156, 128), "Elevation", font=font(30), fill=(255, 255, 255))
d.text((156, 168), "for Strava", font=font(20, REGULAR), fill=GREEN)
d.rectangle((0, 274, 440, 280), fill=GREEN)
tile.convert("RGB").save("store/images/promo-small.png")
print("store/images/promo-small.png")
