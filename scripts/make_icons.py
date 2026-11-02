"""Draw the extension icons (16/48/128 px). Needs Pillow: pip install pillow.

Run from the repo root: python scripts/make_icons.py

The artwork is the "gain so far" chart from the architecture page: a jagged
elevation profile with the running total of climbing drawn over it.
"""
from PIL import Image, ImageDraw

BACKGROUND = (21, 26, 33)
BORDER = (46, 55, 67)  # keeps the dark tile visible on a dark toolbar
HILL_FILL = (35, 42, 53)
HILL_FILL_SMALL = (78, 89, 105)  # lighter at 16 px, where there's no outline
HILL_OUTLINE = (143, 153, 168)
LINE = (52, 211, 153)  # green: "gain so far"
SUPERSAMPLING = 8

# Elevation at evenly spaced points along the route, in metres above the
# chart's baseline. Same shape as the architecture page's chart.
ELEVATIONS_METRES = [44, 53, 72, 68, 86, 76, 58, 81, 95, 73, 53, 62, 49]
# Fewer points at 16 px so the peaks don't blur together.
ELEVATIONS_METRES_SMALL = [44, 72, 68, 86, 58, 95, 53, 62, 49]
# Where the gain line starts and how high the tallest point reaches, as
# fractions of the chart's height.
GAIN_START_FRACTION = 0.07
CHART_TOP_METRES = 120


def gain_so_far(elevations_metres):
    """Running total of climbing: every rise counts, descents add nothing."""
    totals_metres = [0]
    for previous_metres, current_metres in zip(elevations_metres, elevations_metres[1:]):
        totals_metres.append(totals_metres[-1] + max(0, current_metres - previous_metres))
    return totals_metres


def draw(size_pixels):
    small = size_pixels < 48
    canvas_pixels = size_pixels * SUPERSAMPLING
    unit_pixels = canvas_pixels / 128  # one pixel of the 128 px design
    image = Image.new("RGBA", (canvas_pixels, canvas_pixels), (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)

    # Store guidance: 96x96 artwork with 16 px transparent padding at 128.
    padding_pixels = round(16 * unit_pixels) if not small else round(canvas_pixels / 16)
    box = (padding_pixels, padding_pixels, canvas_pixels - padding_pixels, canvas_pixels - padding_pixels)
    box_width_pixels = box[2] - box[0]
    border_width_pixels = 0 if small else max(round(1.5 * unit_pixels), 1)
    drawing.rounded_rectangle(
        box,
        radius=round(box_width_pixels * 0.22),
        fill=BACKGROUND,
        outline=BORDER if border_width_pixels else None,
        width=border_width_pixels,
    )

    inset_pixels = box_width_pixels * (0.13 if small else 0.15)
    left_pixels = box[0] + inset_pixels
    right_pixels = box[2] - inset_pixels
    top_pixels = box[1] + inset_pixels * (1.0 if small else 1.1)
    bottom_pixels = box[3] - inset_pixels * (1.0 if small else 1.25)
    height_pixels = bottom_pixels - top_pixels

    elevations_metres = ELEVATIONS_METRES_SMALL if small else ELEVATIONS_METRES
    point_count = len(elevations_metres)

    def horizontal_pixels(index):
        return left_pixels + (right_pixels - left_pixels) * index / (point_count - 1)

    profile = [
        (horizontal_pixels(index), bottom_pixels - height_pixels * elevation_metres / CHART_TOP_METRES)
        for index, elevation_metres in enumerate(elevations_metres)
    ]
    drawing.polygon(
        [(left_pixels, bottom_pixels), *profile, (right_pixels, bottom_pixels)],
        fill=HILL_FILL_SMALL if small else HILL_FILL,
    )
    if not small:
        outline_width_pixels = round(2 * unit_pixels)
        drawing.line(profile, fill=HILL_OUTLINE, width=outline_width_pixels, joint="curve")
        drawing.line(
            [(left_pixels, bottom_pixels), (right_pixels, bottom_pixels)],
            fill=HILL_OUTLINE,
            width=outline_width_pixels,
        )

    totals_metres = gain_so_far(elevations_metres)
    total_metres = totals_metres[-1]
    gain_line = [
        (
            horizontal_pixels(index),
            bottom_pixels
            - height_pixels
            * (GAIN_START_FRACTION + (1 - GAIN_START_FRACTION) * so_far_metres / total_metres),
        )
        for index, so_far_metres in enumerate(totals_metres)
    ]
    line_width_pixels = round(canvas_pixels * 0.12) if small else round(4.5 * unit_pixels)
    drawing.line(gain_line, fill=LINE, width=line_width_pixels, joint="curve")
    return image.resize((size_pixels, size_pixels), Image.LANCZOS)


for icon_size_pixels in (16, 48, 128):
    draw(icon_size_pixels).save(f"icons/icon{icon_size_pixels}.png")
    print(f"icons/icon{icon_size_pixels}.png")
