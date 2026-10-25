import { readChartProps } from "../strava/chart-props.ts";
import type { PageDependencies, StravaPage } from "./page.ts";

const ELEVATION_BUTTON_LABEL = /^(Hide|Show) Elevation$/;

// The route builder keeps its profile only in React's memory, so the chart's
// props are the one source; their legs already match the totals Strava shows.
export function createRouteBuilderPage(dependencies: PageDependencies): StravaPage {
  const { document } = dependencies;
  return {
    kind: "route-builder",
    prepare: () => undefined,
    profileSource: (chart) => readChartProps(chart),
    // Only the toggle, beside the "Hide/Show Elevation" button; the builder has no room for a table.
    climbsPlacement() {
      const button = [...document.querySelectorAll("button")].find((candidate) =>
        ELEVATION_BUTTON_LABEL.test(candidate.textContent.trim()),
      );
      const anchor = button?.parentElement;
      if (!anchor) return null;
      return {
        position: "beside",
        anchor,
        sectionClassName: "",
        headingClassName: "",
        tableClassName: "",
        horizontalPaddingPixels: 0,
      };
    },
    splitsTable: () => null,
  };
}
