// Wires the modules together: one observer on the page schedules at most one
// pass per animation frame, and each pass decorates every elevation chart and
// fills every profile tooltip from the current page's data.
import { cachedElevationModel, type ProfileSource } from "./elevation-model.ts";
import { detectPage, type StravaPage } from "./pages/page.ts";
import { createSettings, MARKER_ATTRIBUTE, type Settings } from "./settings.ts";
import { crosshairDistance } from "./tooltip/crosshair.ts";
import {
  createTooltipRows,
  findProfileTooltips,
  type ExtraRow,
  type TooltipRows,
} from "./tooltip/tooltip-rows.ts";
import { parseElevationUnit, parseShownDistance } from "./tooltip/tooltip-text.ts";
import { drawClimbBands, highlightClimbBand, removeClimbBands } from "./ui/climb-bands.ts";
import { renderClimbsPanel } from "./ui/climbs-panel.ts";
import { renderSplitsToggle } from "./ui/splits-toggle.ts";
import { formatDistance, formatElevation, formatGrade } from "./units.ts";

/** The parts of the browser window the extension uses. */
export interface EnvironmentWindow {
  MutationObserver: typeof MutationObserver;
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(callback: () => void, delayMilliseconds: number): number;
  clearTimeout(handle: number): void;
  console: Pick<Console, "log">;
}

export interface Environment {
  document: Document;
  window: EnvironmentWindow;
  location: Pick<Location, "pathname">;
  storage: Storage;
  fetch: typeof fetch;
}

export interface Running {
  /** Disconnects every observer and cancels pending work; the page is left as it is. */
  stop(): void;
}

// Narrower SVGs are sparklines and icons, never the elevation chart.
const MINIMUM_CHART_WIDTH_PIXELS = 300;
// Strava moves the crosshair and tooltip with these attributes.
const OBSERVED_ATTRIBUTES = ["transform", "display", "x1"];

interface Pass {
  page: StravaPage;
  settings: Settings;
  tooltipRows: TooltipRows;
  schedule: () => void;
}

function chartRange(source: ProfileSource): { chartStartMetres: number; chartEndMetres: number } {
  return {
    chartStartMetres: source.distancesMetres[0] ?? 0,
    chartEndMetres: source.distancesMetres.at(-1) ?? 0,
  };
}

// Bands, the climbs panel and (on an activity) the splits toggle for one chart.
function decorateChart(pass: Pass, chart: SVGSVGElement): void {
  const { page, settings, schedule } = pass;
  if (chart.getBoundingClientRect().width < MINIMUM_CHART_WIDTH_PIXELS) return;
  if (chart.closest(`[${MARKER_ATTRIBUTE}]`)) return;
  const source = page.profileSource(chart);
  if (!source) return;
  const model = cachedElevationModel(source);
  const { chartStartMetres, chartEndMetres } = chartRange(source);
  const climbsEnabled = settings.climbsEnabled();
  if (climbsEnabled) drawClimbBands(chart, model.climbs, chartStartMetres, chartEndMetres);
  else removeClimbBands(chart);

  const placement = page.climbsPlacement(chart);
  if (placement) {
    renderClimbsPanel(chart, model.climbs, placement, {
      enabled: climbsEnabled,
      onToggle: (enabled) => {
        settings.setClimbsEnabled(enabled);
        schedule();
      },
    });
  }

  const table = page.kind === "activity" ? page.splitsTable() : null;
  if (table) {
    renderSplitsToggle(table, model, chartEndMetres, {
      view: settings.splitsView(),
      onToggle: (view) => {
        settings.setSplitsView(view);
        schedule();
      },
    });
  }
}

// SVG tooltips sit inside their chart; HTML tooltips sit beside it.
function chartOfTooltip(tooltip: Element): SVGSVGElement | null {
  return tooltip.closest("svg") ?? tooltip.parentElement?.querySelector("svg") ?? null;
}

// Gain, Loss and (with climbs on, inside a climb) Climb rows for one tooltip.
function fillTooltip(pass: Pass, tooltip: Element): void {
  const { page, settings, tooltipRows } = pass;
  const chart = chartOfTooltip(tooltip);
  const source = chart && page.profileSource(chart);
  if (!chart || !source) return;
  const text = tooltip.textContent;
  const shown = parseShownDistance(text);
  const elevationUnit = parseElevationUnit(text);
  if (!shown || !elevationUnit) return;

  const { gain, loss, climbs } = cachedElevationModel(source);
  const distanceMetres = crosshairDistance(chart, tooltip, shown) ?? shown.metres;
  const rows: ExtraRow[] = [
    { key: "gain", label: "Gain", value: formatElevation(gain.valueAt(distanceMetres), elevationUnit) },
    { key: "loss", label: "Loss", value: formatElevation(loss.valueAt(distanceMetres), elevationUnit) },
  ];
  if (settings.climbsEnabled()) {
    const climb = climbs.find(
      ({ startMetres, endMetres }) => distanceMetres >= startMetres && distanceMetres <= endMetres,
    );
    if (climb) {
      const lengthText = formatDistance(climb.lengthMetres, shown.unit === "mi" ? "mi" : "km", 1);
      const value = `${lengthText} · ${formatGrade(climb.averageGrade)}`;
      rows.push({ key: "climb", label: `Climb ${String(climb.number)}`, value });
    }
    highlightClimbBand(chart, climb?.number ?? null);
  }
  tooltipRows.show(tooltip, rows);
}

export function start(environment: Environment): Running {
  const { document, window, location, storage, fetch: fetchFunction } = environment;
  const settings = createSettings(storage, window.console);
  const pendingRetries = new Set<number>();
  let stopped = false;
  let frameHandle: number | null = null;
  let activePage: StravaPage | null = null;
  let activePathname: string | null = null;

  function schedule(): void {
    if (stopped || frameHandle !== null) return;
    frameHandle = window.requestAnimationFrame(scan);
  }

  const tooltipRows = createTooltipRows(schedule);

  function scheduleRetry(callback: () => void, delayMilliseconds: number): void {
    const handle = window.setTimeout(() => {
      pendingRetries.delete(handle);
      callback();
    }, delayMilliseconds);
    pendingRetries.add(handle);
  }

  // A client-side navigation gets a fresh adapter, so no data outlives its page.
  function currentPage(): StravaPage | null {
    if (location.pathname !== activePathname) {
      activePathname = location.pathname;
      activePage = detectPage(activePathname, { document, fetch: fetchFunction, schedule: scheduleRetry });
    }
    return activePage;
  }

  function scan(): void {
    frameHandle = null;
    const page = currentPage();
    if (!page) return;
    page.prepare(schedule);
    const pass: Pass = { page, settings, tooltipRows, schedule };
    for (const chart of document.querySelectorAll("svg")) {
      try {
        decorateChart(pass, chart);
      } catch (error) {
        settings.debugLog(error);
      }
    }
    for (const tooltip of findProfileTooltips(document.body)) {
      try {
        fillTooltip(pass, tooltip);
      } catch (error) {
        settings.debugLog(error);
      }
    }
  }

  // The content script runs at document_idle, so the body is there.
  const observer = new window.MutationObserver(schedule);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: OBSERVED_ATTRIBUTES,
  });
  schedule();

  return {
    stop() {
      stopped = true;
      observer.disconnect();
      tooltipRows.disconnect();
      if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
      frameHandle = null;
      for (const handle of pendingRetries) window.clearTimeout(handle);
      pendingRetries.clear();
    },
  };
}
