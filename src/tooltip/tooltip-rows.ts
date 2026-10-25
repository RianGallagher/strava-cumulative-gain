// Adds Gain, Loss and Climb rows to Strava's own elevation-chart tooltip.
// Three tooltip shapes are handled: the activity chart (D3 SVG, rows placed
// with y="41"), the route charts (React SVG, rows placed with
// transform="translate(6, 22)") and HTML tooltips (<div> rows).
import { MARKER_ATTRIBUTE } from "../settings.ts";
import { createAttributeTracker, type AttributeTracker } from "./attribute-tracking.ts";
import { fillRow } from "./row-text.ts";
import { isProfileTooltip } from "./tooltip-text.ts";

export interface ExtraRow {
  key: "gain" | "loss" | "climb";
  label: string;
  value: string;
}

export interface TooltipRows {
  /** Show exactly these extra rows under the tooltip's Elevation row. */
  show(tooltip: Element, rows: readonly ExtraRow[]): void;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DEFAULT_ROW_SPACING_PIXELS = 16;
const TRANSLATE_PATTERN = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/;

type PositionAttribute = "y" | "transform";

/** The smallest elements whose text holds a distance, an elevation and a grade. */
export function findProfileTooltips(root: Element): Element[] {
  const found: Element[] = [];
  const visit = (element: Element): boolean => {
    if (!isProfileTooltip(element.textContent)) return false;
    let deeperMatch = false;
    for (const child of element.children) if (visit(child)) deeperMatch = true;
    if (!deeperMatch) found.push(element);
    return true;
  };
  visit(root);
  return found;
}

/** The tooltip's own Elevation row: the largest descendant mentioning Elevation but not Distance. */
export function findElevationRow(tooltip: Element): Element | null {
  for (const child of tooltip.children) {
    if (child.hasAttribute(MARKER_ATTRIBUTE)) continue;
    const text = child.textContent;
    if (/Elev/.test(text) && !/Dist/.test(text)) return child;
    const deeper = findElevationRow(child);
    if (deeper) return deeper;
  }
  return null;
}

function positionAttribute(row: Element): PositionAttribute {
  return row.hasAttribute("y") ? "y" : "transform";
}

function verticalPosition(attributeName: PositionAttribute, value: string | null): number {
  if (value === null) return NaN;
  if (attributeName === "y") return parseFloat(value);
  const match = TRANSLATE_PATTERN.exec(value);
  return match ? parseFloat(match[2]) : NaN;
}

function withVerticalPosition(
  attributeName: PositionAttribute,
  value: string,
  positionPixels: number,
): string | null {
  if (!Number.isFinite(positionPixels)) return null;
  if (attributeName === "y") return String(positionPixels);
  if (!TRANSLATE_PATTERN.test(value)) return null;
  return value.replace(TRANSLATE_PATTERN, (_whole, horizontal: string) => {
    return `translate(${horizontal}, ${String(positionPixels)})`;
  });
}

function horizontalPosition(row: Element): number {
  const horizontal =
    row.getAttribute("x") ?? TRANSLATE_PATTERN.exec(row.getAttribute("transform") ?? "")?.[1];
  return parseFloat(horizontal ?? "0");
}

function offsetNumber(value: string, amount: number): string | null {
  const number = parseFloat(value);
  return Number.isFinite(number) ? String(number + amount) : null;
}

function renderedWidth(row: Element): number {
  return "getBBox" in row ? (row as SVGGraphicsElement).getBBox().width : 0;
}

// The climb row comes and goes as the hover enters and leaves a climb.
function removeStaleRows(tooltip: Element, rows: readonly ExtraRow[]): void {
  const keys = new Set<string>(rows.map((row) => row.key));
  for (const added of tooltip.querySelectorAll(`[${MARKER_ATTRIBUTE}]`)) {
    if (!keys.has(added.getAttribute(MARKER_ATTRIBUTE) ?? "")) added.remove();
  }
}

function addedRow(tooltip: Element, key: ExtraRow["key"]): Element | null {
  return tooltip.querySelector(`[${MARKER_ATTRIBUTE}="${key}"]`);
}

/** A copy of the Elevation row, without its id or our bookkeeping attributes. */
function copyElevationRow(elevationRow: Element, key: ExtraRow["key"]): Element {
  const row = elevationRow.cloneNode(true) as Element;
  row.removeAttribute("id");
  for (const { name } of [...row.attributes]) {
    if (name.startsWith(`${MARKER_ATTRIBUTE}-`)) row.removeAttribute(name);
  }
  row.setAttribute(MARKER_ATTRIBUTE, key);
  return row;
}

function setIfChanged(element: Element, attributeName: string, value: string | null): void {
  if (value === null) element.removeAttribute(attributeName);
  else if (element.getAttribute(attributeName) !== value) element.setAttribute(attributeName, value);
}

// Places the rows under Elevation, pushes Strava's rows below them down and
// grows the background box, always from Strava's own values.
function showSvgRows(
  tooltip: Element,
  elevationRow: Element,
  rows: readonly ExtraRow[],
  tracker: AttributeTracker,
): void {
  removeStaleRows(tooltip, rows);
  const stravaPosition = (row: Element): number =>
    verticalPosition(positionAttribute(row), tracker.stravaValue(row, positionAttribute(row)));
  // Strava's visible rows, each with the position Strava gave it. A row with
  // no readable position can't be moved, so it is left alone.
  const stravaRows = [...tooltip.querySelectorAll("text")]
    .filter(
      (row) =>
        !row.hasAttribute(MARKER_ATTRIBUTE) &&
        row.getAttribute("display") !== "none" &&
        row.textContent.trim() !== "",
    )
    .map((row) => ({ row, positionPixels: stravaPosition(row) }))
    .filter(({ positionPixels }) => Number.isFinite(positionPixels));
  const attributeName = positionAttribute(elevationRow);
  const elevationValue = tracker.stravaValue(elevationRow, attributeName);
  const elevationPositionPixels = verticalPosition(attributeName, elevationValue);
  if (elevationValue === null || !Number.isFinite(elevationPositionPixels)) return;
  const rowSpacingPixels =
    stravaRows.length > 1
      ? Math.abs(stravaRows[1].positionPixels - stravaRows[0].positionPixels)
      : DEFAULT_ROW_SPACING_PIXELS;
  // The activity chart hides every <text> on mouse-leave but re-shows only its
  // own rows, so the added rows follow the Elevation row's visibility.
  const display = elevationRow.getAttribute("display");

  const shownRows = rows.map((extra, index) => {
    let row = addedRow(tooltip, extra.key);
    if (!row) {
      row = copyElevationRow(elevationRow, extra.key);
      // Appended last: inserting between React/D3-managed rows upsets them.
      tooltip.append(row);
    }
    const positionPixels = elevationPositionPixels + rowSpacingPixels * (index + 1);
    setIfChanged(row, attributeName, withVerticalPosition(attributeName, elevationValue, positionPixels));
    setIfChanged(row, "display", display);
    fillRow(row, elevationRow, extra);
    return row;
  });

  const shiftPixels = rowSpacingPixels * rows.length;
  for (const { row, positionPixels } of stravaRows) {
    if (positionPixels <= elevationPositionPixels) continue;
    const rowAttribute = positionAttribute(row);
    tracker.setFromStravaValue(row, rowAttribute, (base) =>
      withVerticalPosition(rowAttribute, base, verticalPosition(rowAttribute, base) + shiftPixels),
    );
  }

  const background = tooltip.querySelector("rect");
  if (!background) return;
  tracker.setFromStravaValue(background, "height", (base) => offsetNumber(base, shiftPixels));
  // The Elevation row's inset from the box's left edge, kept on both sides.
  const paddingPixels = horizontalPosition(elevationRow) - parseFloat(background.getAttribute("x") ?? "0");
  const neededWidthPixels = Math.ceil(
    Math.max(...[...stravaRows.map(({ row }) => row), ...shownRows].map(renderedWidth)) + paddingPixels * 2,
  );
  tracker.setFromStravaValue(background, "width", (base) => {
    const stravaWidthPixels = parseFloat(base);
    return Number.isFinite(stravaWidthPixels) ? String(Math.max(stravaWidthPixels, neededWidthPixels)) : null;
  });
}

// HTML rows flow, so they go straight after Elevation in order.
function showHtmlRows(tooltip: Element, elevationRow: Element, rows: readonly ExtraRow[]): void {
  removeStaleRows(tooltip, rows);
  let previous = elevationRow;
  for (const extra of rows) {
    let row = addedRow(tooltip, extra.key);
    if (!row) {
      row = copyElevationRow(elevationRow, extra.key);
      previous.after(row);
    }
    fillRow(row, elevationRow, extra);
    previous = row;
  }
}

export function createTooltipRows(onStravaChange: () => void): TooltipRows {
  const tracker = createAttributeTracker(onStravaChange);
  return {
    show: (tooltip, rows) => {
      tracker.noteStravaWrites();
      try {
        const elevationRow = findElevationRow(tooltip);
        if (!elevationRow) return;
        if (elevationRow.namespaceURI === SVG_NAMESPACE) {
          showSvgRows(tooltip, elevationRow.closest("text") ?? elevationRow, rows, tracker);
        } else {
          showHtmlRows(tooltip, elevationRow, rows);
        }
      } finally {
        tracker.discardOwnWrites();
      }
    },
  };
}
