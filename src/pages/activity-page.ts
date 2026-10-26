import type { ProfileSource } from "../elevation-model.ts";
import { fetchActivityStreams } from "../strava/activity-streams.ts";
import { createLoader } from "../strava/loader.ts";
import { METRES_PER_UNIT } from "../units.ts";
import type { PageDependencies, StravaPage } from "./page.ts";

// "Elevation", or "Elevation Gain", which the legacy script also accepted.
const HEADLINE_LABEL = /^\s*Elevation( Gain)?\s*$/i;
const HEADLINE_VALUE = /(-?[\d,.]+)\s*(m|ft)\b/i;
const HEADLINE_LABEL_SELECTOR = "div, span, dt, th, label, li";
// Searching the whole page on every pass is costly; while no headline is
// found, search at most this often.
const HEADLINE_SEARCH_INTERVAL_MILLISECONDS = 1000;

// Strava's headline "Elevation" stat: a leaf whose text is the label, with
// the value elsewhere in its parent ("<div><div>Elevation</div><strong>270 m</strong></div>").
function readHeadlineValueMetres(label: Element): number | undefined {
  const match = HEADLINE_VALUE.exec(label.parentElement?.textContent ?? "");
  const valueText = match?.[1];
  const unit = match?.[2]?.toLowerCase();
  if (valueText === undefined || (unit !== "m" && unit !== "ft")) return undefined;
  const valueInShownUnit = Number.parseFloat(valueText.replaceAll(",", ""));
  return Number.isFinite(valueInShownUnit) ? valueInShownUnit * METRES_PER_UNIT[unit] : undefined;
}

function findHeadlineLabel(document: Document): Element | null {
  for (const label of document.querySelectorAll(HEADLINE_LABEL_SELECTOR)) {
    if (label.childElementCount > 0 || label.closest("svg") || !HEADLINE_LABEL.test(label.textContent)) {
      continue;
    }
    if (readHeadlineValueMetres(label) !== undefined) return label;
  }
  return null;
}

// Keeps the label once found and reads its value on every call; searches
// again straight away when the label leaves the page.
function createHeadlineReader(document: Document, nowMilliseconds: () => number): () => number | undefined {
  let label: Element | null = null;
  let lastEmptySearchMilliseconds = -Infinity;
  return () => {
    if (label?.isConnected) return readHeadlineValueMetres(label);
    const searchMilliseconds = nowMilliseconds();
    if (
      label === null &&
      searchMilliseconds - lastEmptySearchMilliseconds < HEADLINE_SEARCH_INTERVAL_MILLISECONDS
    ) {
      return undefined;
    }
    label = findHeadlineLabel(document);
    if (label === null) lastEmptySearchMilliseconds = searchMilliseconds;
    return label === null ? undefined : readHeadlineValueMetres(label);
  };
}

export function createActivityPage(activityId: string, dependencies: PageDependencies): StravaPage {
  const { document, fetch: fetchFunction, schedule, nowMilliseconds } = dependencies;
  const streamsLoader = createLoader(() => fetchActivityStreams(activityId, fetchFunction), { schedule });
  const readHeadlineGainMetres = createHeadlineReader(document, nowMilliseconds);

  return {
    kind: "activity",
    prepare(onReady) {
      streamsLoader.start(onReady);
    },
    // Only the activity's own elevation chart; other charts on the page are left alone.
    profileSource(chart): ProfileSource | null {
      const streams = streamsLoader.result();
      if (streams === null || !chart.closest("#elevation-chart")) return null;
      const headlineGainMetres = readHeadlineGainMetres();
      return headlineGainMetres === undefined ? streams : { ...streams, headlineGainMetres };
    },
    climbsPlacement() {
      const anchor = document.getElementById("elevation-profile");
      if (anchor === null) return null;
      return {
        position: "after",
        anchor,
        sectionClassName: "",
        headingClassName: "",
        tableClassName: "dense hoverable",
        horizontalPaddingPixels: 20,
      };
    },
    splitsTable() {
      return document.getElementById("splits-container")?.querySelector("table") ?? null;
    },
  };
}
