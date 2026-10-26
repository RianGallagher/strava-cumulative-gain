import type { ElevationModel } from "../elevation-model.ts";
import { MARKER_ATTRIBUTE } from "../dom-markers.ts";
import type { SplitsView } from "../settings.ts";
import { METRES_PER_UNIT, type DistanceUnit } from "../units.ts";

export interface SplitsToggleOptions {
  view: SplitsView;
  onToggle(view: SplitsView): void;
}

const VIEW_ATTRIBUTE = `${MARKER_ATTRIBUTE}-view`;
const NET_HTML_ATTRIBUTE = `${MARKER_ATTRIBUTE}-net`;
const SHOWN_HTML_ATTRIBUTE = `${MARKER_ATTRIBUTE}-html`;
const BUTTON_SELECTOR = `button[${MARKER_ATTRIBUTE}="split-toggle"]`;
const VISUALLY_HIDDEN_STYLE =
  "position: absolute; clip-path: inset(50%); width: 1px; height: 1px; overflow: hidden; white-space: nowrap; margin: -1px; padding: 0; border: 0;";

// The button outlives renders; it always reports to the newest handler.
const latestHandlers = new WeakMap<HTMLButtonElement, SplitsToggleOptions>();

/** `all: unset` removes the browser's focus ring too; keyboard users need it. */
function addFocusRingStyle(document: Document): void {
  if (document.querySelector(`style[${MARKER_ATTRIBUTE}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(MARKER_ATTRIBUTE, "style");
  style.textContent = `button[${MARKER_ATTRIBUTE}="split-toggle"]:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 2px; }`;
  document.head.append(style);
}

function createButton(header: HTMLTableCellElement): HTMLButtonElement {
  const document = header.ownerDocument;
  header.setAttribute(MARKER_ATTRIBUTE, "split-head");
  header.style.whiteSpace = "nowrap";
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(MARKER_ATTRIBUTE, "split-toggle");
  button.title = "Switch between net elevation and gain / loss for each split";
  // Strava styles every <button> (inline-flex, 34 px min-height), which pushed
  // the label below the other headers. Reset everything so it reads as plain
  // header text; the injected style restores a focus ring.
  button.style.cssText = "all: unset; cursor: pointer;";
  addFocusRingStyle(document);
  button.addEventListener("click", () => {
    const options = latestHandlers.get(button);
    if (options) options.onToggle(options.view === "net" ? "gain-loss" : "net");
  });
  header.replaceChildren(button);
  return button;
}

function showView(button: HTMLButtonElement, view: SplitsView): void {
  if (button.getAttribute(VIEW_ATTRIBUTE) === view) return;
  const document = button.ownerDocument;
  // Short visible label (the column is ~60 px wide); fuller text for screen
  // readers. The accessible name stays the same and aria-pressed carries the state.
  const shown = document.createElement("span");
  shown.setAttribute("aria-hidden", "true");
  shown.textContent = view === "net" ? "Elev ⇅" : "+/− ⇅";
  const hidden = document.createElement("span");
  hidden.style.cssText = VISUALLY_HIDDEN_STYLE;
  hidden.textContent = "Show gain and loss per split";
  button.replaceChildren(shown, hidden);
  button.setAttribute("aria-pressed", String(view === "gain-loss"));
  button.setAttribute(VIEW_ATTRIBUTE, view);
}

/** Turns the Elev header into a net / gain-loss toggle and rewrites each split's cell to match. */
export function renderSplitsToggle(
  table: HTMLTableElement,
  model: ElevationModel,
  chartEndMetres: number,
  options: SplitsToggleOptions,
): void {
  const headers = [...table.querySelectorAll<HTMLTableCellElement>("thead th")];
  const unit = headers[0]?.textContent.trim().toLowerCase();
  if (unit !== "km" && unit !== "mi") return;
  const distanceUnit: DistanceUnit = unit;
  let column = headers.findIndex((header) => header.getAttribute(MARKER_ATTRIBUTE) === "split-head");
  if (column < 0) column = headers.findIndex((header) => header.textContent.trim() === "Elev");
  if (column < 0) return;

  const header = headers[column];
  const button = header.querySelector<HTMLButtonElement>(BUTTON_SELECTOR) ?? createButton(header);
  latestHandlers.set(button, options);
  showView(button, options.view);

  const splitMetres = METRES_PER_UNIT[distanceUnit];
  table.querySelectorAll("tbody tr").forEach((row, splitIndex) => {
    const cell = (row as HTMLTableRowElement).cells.item(column);
    if (!cell) return;
    // Keep Strava's own markup so the net view restores it exactly.
    if (!cell.hasAttribute(NET_HTML_ATTRIBUTE)) cell.setAttribute(NET_HTML_ATTRIBUTE, cell.innerHTML);
    const netHtml = cell.getAttribute(NET_HTML_ATTRIBUTE) ?? "";
    let html = netHtml;
    if (options.view === "gain-loss") {
      const inFeet = /feet|\bft\b/.test(netHtml);
      const roundToDisplayUnit = (metres: number): number =>
        Math.round(inFeet ? metres / METRES_PER_UNIT.ft : metres);
      const startMetres = splitIndex * splitMetres;
      const endMetres = Math.min((splitIndex + 1) * splitMetres, chartEndMetres);
      const gainInDisplayUnits = roundToDisplayUnit(
        model.gain.valueAt(endMetres) - model.gain.valueAt(startMetres),
      );
      const lossInDisplayUnits = roundToDisplayUnit(
        model.loss.valueAt(endMetres) - model.loss.valueAt(startMetres),
      );
      html = `+${String(gainInDisplayUnits)}/−${String(lossInDisplayUnits)}`;
    }
    if (cell.getAttribute(SHOWN_HTML_ATTRIBUTE) !== html) {
      cell.innerHTML = html;
      cell.style.whiteSpace = "nowrap";
      cell.setAttribute(SHOWN_HTML_ATTRIBUTE, html);
    }
  });
}
