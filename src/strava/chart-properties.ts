import type { RouteLeg } from "../math/elevation-curve.ts";
import { isLegArray, isProfileArray, isRecord } from "./guards.ts";

export interface ChartProperties {
  distancesMetres: number[];
  elevationsMetres: number[];
  legs: RouteLeg[] | null;
}

const MAXIMUM_FIBER_LEVELS = 40;
const FIBER_KEY_PREFIX = "__reactFiber";

// The chart component gets `distance` and `elevation` arrays as properties, and an
// ancestor holds the route `legs`. Found by property shape, not component name,
// since names are minified. Returns React's own arrays (not copies) so the
// elevation model can cache by array identity.
export function readChartProperties(chart: Element): ChartProperties | null {
  const fiberKey = Object.keys(chart).find((key) => key.startsWith(FIBER_KEY_PREFIX));
  if (fiberKey === undefined) return null;
  let fiber: unknown = Reflect.get(chart, fiberKey);
  let distancesMetres: number[] | null = null;
  let elevationsMetres: number[] | null = null;
  let legs: RouteLeg[] | null = null;
  for (let level = 0; level < MAXIMUM_FIBER_LEVELS && isRecord(fiber); level += 1) {
    const properties = fiber["memoizedProps"];
    if (isRecord(properties)) {
      const candidateDistancesMetres = properties["distance"];
      const candidateElevationsMetres = properties["elevation"];
      if (
        elevationsMetres === null &&
        isProfileArray(candidateDistancesMetres) &&
        isProfileArray(candidateElevationsMetres) &&
        candidateDistancesMetres.length === candidateElevationsMetres.length
      ) {
        distancesMetres = candidateDistancesMetres;
        elevationsMetres = candidateElevationsMetres;
      }
      if (elevationsMetres !== null && legs === null && isLegArray(properties["legs"]))
        legs = properties["legs"];
    }
    if (elevationsMetres !== null && legs !== null) break;
    fiber = fiber["return"];
  }
  return distancesMetres !== null && elevationsMetres !== null
    ? { distancesMetres, elevationsMetres, legs }
    : null;
}
