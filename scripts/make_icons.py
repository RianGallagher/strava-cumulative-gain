"""Draw the extension icons (16/48/128 px). Needs Pillow: pip install pillow.

Run from the repo root: python scripts/make_icons.py
"""
import math

from PIL import Image, ImageDraw

BACKGROUND = (31, 42, 68)  # slate
HILL = (122, 136, 158)
LINE = (52, 211, 153)  # green: "gain so far"
SUPERSAMPLING = 8
PROFILE_STEPS = 200


def profile(position):
    """Elevation profile, 0..1 in, 0..1 out (two climbs, like a real route)."""
    return (
        0.18
        + 0.42 * math.exp(-((position - 0.32) / 0.13) ** 2)
        + 0.62 * math.exp(-((position - 0.72) / 0.12) ** 2)
    )


def draw(size_pixels):
    canvas_pixels = size_pixels * SUPERSAMPLING
    image = Image.new("RGBA", (canvas_pixels, canvas_pixels), (0, 0, 0, 0))
    drawing = ImageDraw.Draw(image)
    # Store guidance: 96x96 artwork with 16 px transparent padding at 128.
    padding_pixels = (
        round(canvas_pixels * 16 / 128) if size_pixels >= 48 else round(canvas_pixels * 1 / 16)
    )
    box = (padding_pixels, padding_pixels, canvas_pixels - padding_pixels, canvas_pixels - padding_pixels)
    box_width_pixels = box[2] - box[0]
    drawing.rounded_rectangle(box, radius=round(box_width_pixels * 0.22), fill=BACKGROUND)

    inset_pixels = round(box_width_pixels * 0.14)
    left_pixels = box[0] + inset_pixels
    top_pixels = box[1] + inset_pixels
    right_pixels = box[2] - inset_pixels
    bottom_pixels = box[3] - inset_pixels
    hill_outline = [
        (
            left_pixels + (right_pixels - left_pixels) * step / PROFILE_STEPS,
            bottom_pixels - (bottom_pixels - top_pixels) * 0.8 * profile(step / PROFILE_STEPS),
        )
        for step in range(PROFILE_STEPS + 1)
    ]
    drawing.polygon(
        [(left_pixels, bottom_pixels)] + hill_outline + [(right_pixels, bottom_pixels)], fill=HILL
    )

    # Cumulative gain: only ever rises; steep where the profile climbs.
    gain = [0.0]
    for step in range(1, PROFILE_STEPS + 1):
        rise = profile(step / PROFILE_STEPS) - profile((step - 1) / PROFILE_STEPS)
        gain.append(gain[-1] + max(0.0, rise))
    total_gain = gain[-1]
    gain_line = [
        (
            left_pixels + (right_pixels - left_pixels) * step / PROFILE_STEPS,
            bottom_pixels - (bottom_pixels - top_pixels) * (0.06 + 0.9 * gain_so_far / total_gain),
        )
        for step, gain_so_far in enumerate(gain)
    ]
    line_width_pixels = max(
        round(box_width_pixels * (0.075 if size_pixels >= 48 else 0.11)), SUPERSAMPLING
    )
    drawing.line(gain_line, fill=LINE, width=line_width_pixels, joint="curve")
    dot_radius_pixels = line_width_pixels * 0.9
    end_x_pixels, end_y_pixels = gain_line[-1]
    drawing.ellipse(
        (
            end_x_pixels - dot_radius_pixels,
            end_y_pixels - dot_radius_pixels,
            end_x_pixels + dot_radius_pixels,
            end_y_pixels + dot_radius_pixels,
        ),
        fill=LINE,
    )
    return image.resize((size_pixels, size_pixels), Image.LANCZOS)


for icon_size_pixels in (16, 48, 128):
    draw(icon_size_pixels).save(f"icons/icon{icon_size_pixels}.png")
    print(f"icons/icon{icon_size_pixels}.png")
