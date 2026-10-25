// The distance under the chart's crosshair, read from its x position against
// the distance-axis ticks. The activity tooltip only shows 0.1 km, so this is
// up to 50 m more precise than the tooltip's own label.
import { METRES_PER_UNIT, type DistanceUnit } from "../units.ts";
import type { ShownDistance } from "./tooltip-text.ts";

const TICK_PATTERN = /^\s*([\d.,]+)\s*(km|mi)\s*$/;
/** How far the crosshair may sit from the tooltip box's nearer edge. */
const MAXIMUM_GAP_PIXELS = 24;
/** Wider than this, a vertical line is not a crosshair. */
const MAXIMUM_LINE_WIDTH_PIXELS = 3;
/** Pixels of slack, on top of the label's resolution, when checking the result. */
const AGREEMENT_SLACK_PIXELS = 2;

interface Tick {
  centrePixels: number;
  distanceMetres: number;
}

interface CrosshairCandidate {
  centrePixels: number;
  gapPixels: number;
  /** 0 for a line that is clearly the crosshair, 1 for any other vertical line. */
  rank: number;
}

function distanceTicks(chart: SVGSVGElement): Tick[] {
  const ticks: Tick[] = [];
  for (const label of chart.querySelectorAll("text")) {
    const match = TICK_PATTERN.exec(label.textContent);
    if (!match) continue;
    const [, numberText, unit] = match;
    const bounds = label.getBoundingClientRect();
    if (bounds.width === 0) continue;
    ticks.push({
      centrePixels: bounds.x + bounds.width / 2,
      distanceMetres: parseFloat(numberText.replace(/,/g, "")) * METRES_PER_UNIT[unit as DistanceUnit],
    });
  }
  return ticks;
}

// The crosshair is a tall vertical line hugging the tooltip box on either
// side. A line marked as the crosshair, or sharing the tooltip's parent, wins
// over a nearer gridline.
function findCrosshair(chart: SVGSVGElement, tooltip: Element): CrosshairCandidate | null {
  const box = tooltip.getBoundingClientRect();
  const chartHeightPixels = chart.getBoundingClientRect().height;
  let best: CrosshairCandidate | null = null;
  for (const line of chart.querySelectorAll("line")) {
    if (line.getAttribute("x1") !== line.getAttribute("x2")) continue;
    const bounds = line.getBoundingClientRect();
    if (bounds.height < chartHeightPixels / 2 || bounds.width > MAXIMUM_LINE_WIDTH_PIXELS) continue;
    const gapPixels = Math.min(Math.abs(bounds.x - box.left), Math.abs(bounds.x - box.right));
    if (gapPixels > MAXIMUM_GAP_PIXELS) continue;
    const markedAsCrosshair = /cross/i.test(line.getAttribute("class") ?? "");
    const rank = markedAsCrosshair || line.parentElement === tooltip.parentElement ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank && gapPixels < best.gapPixels)) {
      best = { centrePixels: bounds.x + bounds.width / 2, gapPixels, rank };
    }
  }
  return best;
}

export function crosshairDistance(
  chart: SVGSVGElement,
  tooltip: Element,
  shown: ShownDistance,
): number | null {
  const ticks = distanceTicks(chart);
  const first = ticks.at(0);
  const last = ticks.at(-1);
  if (!first || !last || ticks.length < 2) return null;
  const spanPixels = last.centrePixels - first.centrePixels;
  const spanMetres = last.distanceMetres - first.distanceMetres;
  if (spanPixels === 0 || spanMetres === 0) return null;

  const crosshair = findCrosshair(chart, tooltip);
  if (!crosshair) return null;
  const metresPerPixel = spanMetres / spanPixels;
  const distanceMetres =
    first.distanceMetres + (crosshair.centrePixels - first.centrePixels) * metresPerPixel;
  // Guard against having picked a gridline: the result must agree with the label.
  const toleranceMetres = shown.resolutionMetres / 2 + Math.abs(metresPerPixel) * AGREEMENT_SLACK_PIXELS;
  return Math.abs(distanceMetres - shown.metres) <= toleranceMetres ? distanceMetres : null;
}
