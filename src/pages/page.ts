import type { ProfileSource } from "../elevation-model.ts";
import { createActivityPage } from "./activity-page.ts";
import { createRouteBuilderPage } from "./route-builder-page.ts";
import { createRoutePage } from "./route-page.ts";

// Everything that depends on how a Strava page is built lives behind this
// seam: when Strava redesigns one page, only its adapter changes.

/** Where the climbs toggle (and, when on, the climbs table) goes. */
export interface ClimbsPlacement {
  position: "before" | "after" | "beside";
  anchor: Element;
  sectionClassName: string;
  headingClassName: string;
  tableClassName: string;
  horizontalPaddingPixels: number;
}

export interface StravaPage {
  readonly kind: "activity" | "route" | "route-builder";
  /** Called on every scan pass; starts any loading once. `onReady` fires when loaded data arrives. */
  prepare(onReady: () => void): void;
  profileSource(chart: SVGSVGElement): ProfileSource | null;
  climbsPlacement(chart: SVGSVGElement): ClimbsPlacement | null;
  splitsTable(): HTMLTableElement | null;
}

export interface PageDependencies {
  document: Document;
  fetch: typeof fetch;
  schedule: (callback: () => void, delayMilliseconds: number) => void;
}

const ACTIVITY_PATH = /^\/activities\/(\d+)/;
const ROUTE_PATH = /^\/routes\/(\d+)\/?$/;
const ROUTE_BUILDER_PATH = /^\/(routes\/new|routes\/\d+\/edit|maps\/create)/;

export function detectPage(pathname: string, dependencies: PageDependencies): StravaPage | null {
  const activityId = ACTIVITY_PATH.exec(pathname)?.[1];
  if (activityId !== undefined) return createActivityPage(activityId, dependencies);
  const routeId = ROUTE_PATH.exec(pathname)?.[1];
  if (routeId !== undefined) return createRoutePage(routeId, dependencies);
  if (ROUTE_BUILDER_PATH.test(pathname)) return createRouteBuilderPage(dependencies);
  return null;
}
