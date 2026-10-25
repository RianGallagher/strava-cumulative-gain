import type { NumberedClimb } from "../elevation-model.ts";
import type { ClimbsPlacement } from "../pages/page.ts";
import { MARKER_ATTRIBUTE } from "../settings.ts";
import { formatDistance, formatDuration, formatElevation, formatGrade, METRES_PER_UNIT } from "../units.ts";
import { chartUnits, highlightClimbBand, type ChartUnits } from "./climb-bands.ts";

export interface ClimbsPanelOptions {
  enabled: boolean;
  onToggle(enabled: boolean): void;
}

const CHECKBOX_ID = "cumulative-gain-show-climbs";
const HEADING_ID = "cumulative-gain-climbs-heading";
const SIGNATURE_ATTRIBUTE = "data-cumulative-gain-signature";
const LABEL_STYLE =
  "display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #6d6d78; cursor: pointer; user-select: none;";
const NO_VALUE = "–";

// The checkbox outlives renders; it always calls the newest handler.
const latestToggleHandlers = new WeakMap<HTMLInputElement, ClimbsPanelOptions>();
const checkboxOfLabel = new WeakMap<HTMLLabelElement, HTMLInputElement>();

function toggleControl(document: Document, options: ClimbsPanelOptions): HTMLLabelElement {
  let label = document.querySelector<HTMLLabelElement>(`label[${MARKER_ATTRIBUTE}="climbs-toggle"]`);
  if (!label) {
    label = document.createElement("label");
    label.setAttribute(MARKER_ATTRIBUTE, "climbs-toggle");
    label.title = "Highlight climbs on the elevation chart";
    label.style.cssText = LABEL_STYLE;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = CHECKBOX_ID;
    label.htmlFor = checkbox.id;
    checkbox.style.cssText = "margin: 0; cursor: pointer;";
    checkbox.addEventListener("change", () => {
      latestToggleHandlers.get(checkbox)?.onToggle(checkbox.checked);
    });
    label.append(checkbox, "Show climbs");
    checkboxOfLabel.set(label, checkbox);
  }
  const checkbox = checkboxOfLabel.get(label);
  if (checkbox) {
    latestToggleHandlers.set(checkbox, options);
    if (checkbox.checked !== options.enabled) checkbox.checked = options.enabled;
  }
  return label;
}

function columnTitles(hasDuration: boolean): string[] {
  const titles = ["#", "Start", "Length", "Gain", "Avg. Grade", "Max. Grade"];
  return hasDuration ? [...titles, "Time", "VAM"] : titles;
}

function climbCells(climb: NumberedClimb, units: ChartUnits, hasDuration: boolean): string[] {
  const { distanceUnit, elevationUnit } = units;
  const cells = [
    String(climb.number),
    formatDistance(climb.startMetres, distanceUnit, 1),
    formatDistance(climb.lengthMetres, distanceUnit, 2),
    formatElevation(climb.gainMetres, elevationUnit),
    formatGrade(climb.averageGrade),
    formatGrade(climb.maximumGrade),
  ];
  if (hasDuration) {
    const hasTime = climb.durationSeconds !== null && climb.durationSeconds > 0;
    cells.push(hasTime ? formatDuration(climb.durationSeconds ?? 0) : NO_VALUE);
    const metresPerHour = climb.verticalMetresPerHour;
    cells.push(
      metresPerHour
        ? `${Math.round(metresPerHour / METRES_PER_UNIT[elevationUnit]).toLocaleString()} ${elevationUnit}/h`
        : NO_VALUE,
    );
  }
  return cells;
}

function buildSection(
  chart: SVGSVGElement,
  climbs: readonly NumberedClimb[],
  placement: ClimbsPlacement,
  units: ChartUnits,
  hasDuration: boolean,
): HTMLElement {
  const document = chart.ownerDocument;
  const section = document.createElement("div");
  section.setAttribute(MARKER_ATTRIBUTE, "climbs-table");
  section.className = placement.sectionClassName;
  const { horizontalPaddingPixels } = placement;
  if (horizontalPaddingPixels > 0) {
    section.style.padding = `0 ${String(horizontalPaddingPixels)}px ${String(horizontalPaddingPixels)}px`;
  }
  const heading = document.createElement("h3");
  heading.className = placement.headingClassName;
  heading.id = HEADING_ID;
  heading.textContent = "Climbs";
  const table = document.createElement("table");
  table.setAttribute("aria-labelledby", heading.id);
  if (placement.tableClassName) table.className = placement.tableClassName;
  if (!placement.sectionClassName) table.style.width = "100%";

  const titles = columnTitles(hasDuration);
  const headerRow = table.createTHead().insertRow();
  for (const title of titles) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = title;
    headerRow.append(header);
  }
  const body = table.createTBody();
  for (const climb of climbs) {
    const row = body.insertRow();
    for (const text of climbCells(climb, units, hasDuration)) row.insertCell().textContent = text;
    row.addEventListener("mouseenter", () => {
      highlightClimbBand(chart, climb.number);
    });
    row.addEventListener("mouseleave", () => {
      highlightClimbBand(chart, null);
    });
  }
  if (climbs.length === 0) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = titles.length;
    cell.textContent = "No climbs detected";
  }
  section.append(heading, table);
  return section;
}

/** The "Show climbs" checkbox, plus (when enabled) the climbs table, at the page's placement. */
export function renderClimbsPanel(
  chart: SVGSVGElement,
  climbs: readonly NumberedClimb[],
  placement: ClimbsPlacement,
  options: ClimbsPanelOptions,
): void {
  const document = chart.ownerDocument;
  const toggle = toggleControl(document, options);

  if (placement.position === "beside") {
    if (toggle.nextElementSibling !== placement.anchor) {
      toggle.style.marginRight = "12px";
      placement.anchor.before(toggle);
    }
    return;
  }

  let wrapper = document.querySelector<HTMLElement>(`div[${MARKER_ATTRIBUTE}="climbs"]`);
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.setAttribute(MARKER_ATTRIBUTE, "climbs");
  }
  const isBefore = placement.position === "before";
  const isPlaced = isBefore
    ? wrapper.nextElementSibling === placement.anchor
    : wrapper.previousElementSibling === placement.anchor;
  if (!isPlaced) {
    if (isBefore) placement.anchor.before(wrapper);
    else placement.anchor.after(wrapper);
  }

  let line = wrapper.querySelector<HTMLElement>(`div[${MARKER_ATTRIBUTE}="climbs-line"]`);
  if (!line) {
    line = document.createElement("div");
    line.setAttribute(MARKER_ATTRIBUTE, "climbs-line");
    line.style.cssText = `padding: 0 ${String(placement.horizontalPaddingPixels)}px; margin: 8px 0;`;
    wrapper.prepend(line);
  }
  if (toggle.parentElement !== line) line.append(toggle);

  const units = chartUnits(chart);
  const hasDuration = climbs.some((climb) => climb.durationSeconds !== null && climb.durationSeconds > 0);
  const signature = JSON.stringify([
    options.enabled,
    units,
    hasDuration,
    climbs.map((climb) => [climb.startMetres, climb.endMetres, Math.round(climb.gainMetres)]),
  ]);
  if (wrapper.getAttribute(SIGNATURE_ATTRIBUTE) === signature) return;
  wrapper.setAttribute(SIGNATURE_ATTRIBUTE, signature);
  wrapper.querySelector(`div[${MARKER_ATTRIBUTE}="climbs-table"]`)?.remove();
  if (options.enabled) wrapper.append(buildSection(chart, climbs, placement, units, hasDuration));
}
