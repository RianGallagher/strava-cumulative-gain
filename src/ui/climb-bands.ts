import type { NumberedClimb } from "../elevation-model.ts";
import { MARKER_ATTRIBUTE } from "../settings.ts";
import type { DistanceUnit, ElevationUnit } from "../units.ts";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const BAND_FILL = "rgb(252, 82, 0)"; // Strava orange
const BAND_OPACITY = "0.12";
const BAND_OPACITY_HIGHLIGHTED = "0.3";
const BANDS_SELECTOR = `g[${MARKER_ATTRIBUTE}="bands"]`;
const SIGNATURE_ATTRIBUTE = "data-cumulative-gain-signature";
const AXIS_LABEL = /^\s*[\d,.]+\s*(km|mi|m|ft)\s*$/;
const LABEL_BASELINE_PIXELS = 11;

export interface ChartUnits {
  distanceUnit: DistanceUnit;
  elevationUnit: ElevationUnit;
}

/** Display units from the chart's own axis labels ("10.0 km", "200 m"). */
export function chartUnits(chart: SVGSVGElement): ChartUnits {
  let distanceUnit: DistanceUnit = "km";
  let elevationUnit: ElevationUnit = "m";
  for (const label of chart.querySelectorAll("text")) {
    const unit = AXIS_LABEL.exec(label.textContent)?.[1];
    if (unit === "km" || unit === "mi") distanceUnit = unit;
    else if (unit === "m" || unit === "ft") elevationUnit = unit;
  }
  return { distanceUnit, elevationUnit };
}

/** The filled elevation area: the widest path with a fill. */
function areaPath(chart: SVGSVGElement): SVGPathElement | null {
  const view = chart.ownerDocument.defaultView;
  let widest: SVGPathElement | null = null;
  let widestPixels = 0;
  for (const path of chart.querySelectorAll("path")) {
    if (path.closest(`[${MARKER_ATTRIBUTE}]`) || view?.getComputedStyle(path).fill === "none") continue;
    const widthPixels = path.getBBox().width;
    if (!widest || widthPixels > widestPixels) {
      widest = path;
      widestPixels = widthPixels;
    }
  }
  return widest;
}

/** The plot group (`svg > g`) holding the area, and the area's top-level child of it. */
function childOfPlotGroup(
  chart: SVGSVGElement,
  area: Element,
): { plot: SVGGElement | SVGSVGElement; child: Element } {
  const plot = area.closest<SVGGElement>("svg > g") ?? chart;
  let child = area;
  while (child.parentElement && child.parentNode !== plot) child = child.parentElement;
  return { plot, child };
}

/**
 * Shaded, numbered band per climb, drawn just before the elevation area so the
 * area, crosshair and tooltip all stay on top. Positioned in the area path's
 * own coordinates: its bbox spans the route's full distance.
 */
export function drawClimbBands(
  chart: SVGSVGElement,
  climbs: readonly NumberedClimb[],
  chartStartMetres: number,
  chartEndMetres: number,
): void {
  const area = areaPath(chart);
  if (!area) return;
  const box = area.getBBox();
  const spanMetres = chartEndMetres - chartStartMetres;
  const signature = `${climbs.map((climb) => `${String(climb.startMetres)},${String(climb.endMetres)}`).join(";")}|${[box.x, box.y, box.width, box.height].join(",")}`;
  const { plot, child } = childOfPlotGroup(chart, area);
  const document = chart.ownerDocument;

  let group = chart.querySelector(BANDS_SELECTOR);
  if (group?.getAttribute(SIGNATURE_ATTRIBUTE) === signature && group.nextElementSibling === child) return;
  if (!group) {
    group = document.createElementNS(SVG_NAMESPACE, "g");
    group.setAttribute(MARKER_ATTRIBUTE, "bands");
    group.setAttribute("pointer-events", "none");
  }
  plot.insertBefore(group, child);

  const plotMatrix = plot.getScreenCTM();
  const areaMatrix = area.getScreenCTM();
  if (plotMatrix && areaMatrix) {
    const matrix = plotMatrix.inverse().multiply(areaMatrix);
    const values = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
    group.setAttribute("transform", `matrix(${values.join(",")})`);
  }
  group.replaceChildren();

  const xOf = (distanceMetres: number): number =>
    box.x + ((distanceMetres - chartStartMetres) / spanMetres) * box.width;
  const topPixels = Math.min(0, box.y);
  const bottomPixels = box.y + box.height;
  for (const climb of climbs) {
    const leftPixels = xOf(climb.startMetres);
    const rightPixels = xOf(climb.endMetres);
    const band = document.createElementNS(SVG_NAMESPACE, "rect");
    band.setAttribute("data-climb", String(climb.number));
    band.setAttribute("x", String(leftPixels));
    band.setAttribute("width", String(Math.max(1, rightPixels - leftPixels)));
    band.setAttribute("y", String(topPixels));
    band.setAttribute("height", String(bottomPixels - topPixels));
    band.setAttribute("fill", BAND_FILL);
    band.setAttribute("fill-opacity", BAND_OPACITY);
    const label = document.createElementNS(SVG_NAMESPACE, "text");
    label.setAttribute("x", String((leftPixels + rightPixels) / 2));
    label.setAttribute("y", String(topPixels + LABEL_BASELINE_PIXELS));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "10");
    label.setAttribute("font-weight", "600");
    label.setAttribute("fill", BAND_FILL);
    label.textContent = String(climb.number);
    group.append(band, label);
  }
  group.setAttribute(SIGNATURE_ATTRIBUTE, signature);
}

export function removeClimbBands(chart: SVGSVGElement): void {
  chart.querySelector(BANDS_SELECTOR)?.remove();
}

/** Emphasise one climb's band (hovered on the chart or in the table); null clears it. */
export function highlightClimbBand(chart: SVGSVGElement, climbNumber: number | null): void {
  const group = chart.querySelector(BANDS_SELECTOR);
  if (!group) return;
  for (const band of group.querySelectorAll("rect")) {
    const wanted =
      String(climbNumber) === band.getAttribute("data-climb") ? BAND_OPACITY_HIGHLIGHTED : BAND_OPACITY;
    if (band.getAttribute("fill-opacity") !== wanted) band.setAttribute("fill-opacity", wanted);
  }
}
