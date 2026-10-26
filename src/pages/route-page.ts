import type { ProfileSource } from "../elevation-model.ts";
import { readChartProperties } from "../strava/chart-properties.ts";
import { readEmbeddedRoute } from "../strava/embedded-route.ts";
import { createLoader } from "../strava/loader.ts";
import { fetchRouteGpx } from "../strava/route-gpx.ts";
import type { ClimbsPlacement, PageDependencies, StravaPage } from "./page.ts";

// Parsing the embedded JSON is costly and a fresh parse means fresh arrays
// (so a fresh elevation model), so it is re-read only when the script changes.
function createEmbeddedRouteReader(document: Document, routeId: string): () => ProfileSource | null {
  let lastReadText: string | null | undefined;
  let embeddedRoute: ProfileSource | null = null;
  return () => {
    const text = document.getElementById("__NEXT_DATA__")?.textContent ?? null;
    if (text !== lastReadText) {
      lastReadText = text;
      embeddedRoute = readEmbeddedRoute(document, routeId);
    }
    return embeddedRoute;
  };
}

const DISTANCE_TICK = /^\s*[\d.,]+\s*(km|mi)\s*$/;
const ELEVATION_TICK = /^\s*[\d.,]+\s*(m|ft)\s*$/;

// The fallbacks carry the route's profile but not which SVG it belongs to,
// so they only go to an SVG with both distance and elevation axis ticks.
function looksLikeElevationChart(chart: SVGSVGElement): boolean {
  const labels = [...chart.querySelectorAll("text")].map((textElement) => textElement.textContent);
  return (
    labels.some((label) => DISTANCE_TICK.test(label)) && labels.some((label) => ELEVATION_TICK.test(label))
  );
}

function findSegmentsHeading(document: Document): HTMLHeadingElement | undefined {
  return [...document.querySelectorAll("h3")].find((heading) => heading.textContent.trim() === "Segments");
}

export function createRoutePage(routeId: string, dependencies: PageDependencies): StravaPage {
  const { document, fetch: fetchFunction, schedule } = dependencies;
  const readEmbedded = createEmbeddedRouteReader(document, routeId);
  const gpxLoader = createLoader(
    () => {
      const view = document.defaultView;
      return view ? fetchRouteGpx(routeId, fetchFunction, new view.DOMParser()) : Promise.resolve(null);
    },
    { schedule },
  );
  let notifyReady: (() => void) | null = null;

  return {
    kind: "route",
    // The GPX export is only requested when a chart turns out to need it;
    // like a loader's start, only the first callback is kept.
    prepare(onReady) {
      notifyReady ??= onReady;
    },
    // The chart's own properties, else (for the elevation chart only) the embedded
    // page data, else the GPX export.
    // The chart's ancestors don't hold the legs; the embedded data does, along
    // with Strava's headline total.
    profileSource(chart) {
      const embedded = readEmbedded();
      const properties = readChartProperties(chart);
      if (properties !== null) {
        const { distancesMetres, elevationsMetres } = properties;
        const legs = properties.legs ?? embedded?.legs ?? null;
        const headlineGainMetres = embedded?.headlineGainMetres;
        return {
          distancesMetres,
          elevationsMetres,
          legs,
          ...(headlineGainMetres === undefined ? {} : { headlineGainMetres }),
        };
      }
      if (!looksLikeElevationChart(chart)) return null;
      if (embedded !== null) return embedded;
      gpxLoader.start(() => {
        notifyReady?.();
      });
      return gpxLoader.result();
    },
    // Above the Segments section, styled like it; else straight after the chart.
    climbsPlacement(chart): ClimbsPlacement | null {
      const heading = findSegmentsHeading(document);
      const section = heading?.parentElement;
      if (heading && section) {
        return {
          position: "before",
          anchor: section,
          sectionClassName: section.className,
          headingClassName: heading.className,
          tableClassName: "",
          horizontalPaddingPixels: 0,
        };
      }
      const anchor = chart.closest("div[class*='chart']") ?? chart.parentElement;
      if (anchor === null) return null;
      return {
        position: "after",
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
