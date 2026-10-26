import type { ProfileSource } from "../elevation-model.ts";
import { fetchActivityStreams } from "../strava/activity-streams.ts";
import { createLoader } from "../strava/loader.ts";
import { METRES_PER_UNIT } from "../units.ts";
import type { PageDependencies, StravaPage } from "./page.ts";

const HEADLINE_LABEL = /^\s*Elevation\s*$/i;
const HEADLINE_VALUE = /(-?[\d,.]+)\s*(m|ft)\b/i;
const HEADLINE_LABEL_SELECTOR = "div, span, dt, th, label, li";

// Strava's headline "Elevation" stat: a leaf whose text is the label, with
// the value elsewhere in its parent ("<div><div>Elevation</div><strong>270 m</strong></div>").
function readHeadlineGainMetres(document: Document): number | undefined {
  for (const label of document.querySelectorAll(HEADLINE_LABEL_SELECTOR)) {
    if (label.childElementCount > 0 || label.closest("svg") || !HEADLINE_LABEL.test(label.textContent)) {
      continue;
    }
    const match = HEADLINE_VALUE.exec(label.parentElement?.textContent ?? "");
    const valueText = match?.[1];
    const unit = match?.[2]?.toLowerCase();
    if (valueText === undefined || (unit !== "m" && unit !== "ft")) continue;
    const valueInShownUnit = Number.parseFloat(valueText.replaceAll(",", ""));
    if (Number.isFinite(valueInShownUnit)) return valueInShownUnit * METRES_PER_UNIT[unit];
  }
  return undefined;
}

export function createActivityPage(activityId: string, dependencies: PageDependencies): StravaPage {
  const { document, fetch: fetchFunction, schedule } = dependencies;
  const streamsLoader = createLoader(() => fetchActivityStreams(activityId, fetchFunction), { schedule });

  return {
    kind: "activity",
    prepare(onReady) {
      streamsLoader.start(onReady);
    },
    // Only the activity's own elevation chart; other charts on the page are left alone.
    profileSource(chart): ProfileSource | null {
      const streams = streamsLoader.result();
      if (streams === null || !chart.closest("#elevation-chart")) return null;
      const headlineGainMetres = readHeadlineGainMetres(document);
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
