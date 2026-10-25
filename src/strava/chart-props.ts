import type { RouteLeg } from "../math/elevation-curve.ts";
import { isLegArray, isProfileArray, isRecord } from "./guards.ts";

export interface ChartProps {
  distances: number[];
  elevations: number[];
  legs: RouteLeg[] | null;
}

const MAX_FIBER_LEVELS = 40;
const FIBER_KEY_PREFIX = "__reactFiber";

// The chart component gets `distance` and `elevation` arrays as props, and an
// ancestor holds the route `legs`. Found by prop shape, not component name,
// since names are minified. Returns React's own arrays (not copies) so the
// elevation model can cache by array identity.
export function readChartProps(chart: Element): ChartProps | null {
  const fiberKey = Object.keys(chart).find((key) => key.startsWith(FIBER_KEY_PREFIX));
  if (fiberKey === undefined) return null;
  let fiber: unknown = Reflect.get(chart, fiberKey);
  let distances: number[] | null = null;
  let elevations: number[] | null = null;
  let legs: RouteLeg[] | null = null;
  for (let level = 0; level < MAX_FIBER_LEVELS && isRecord(fiber); level += 1) {
    const props = fiber["memoizedProps"];
    if (isRecord(props)) {
      const candidateDistances = props["distance"];
      const candidateElevations = props["elevation"];
      if (
        elevations === null &&
        isProfileArray(candidateDistances) &&
        isProfileArray(candidateElevations) &&
        candidateDistances.length === candidateElevations.length
      ) {
        distances = candidateDistances;
        elevations = candidateElevations;
      }
      if (elevations !== null && legs === null && isLegArray(props["legs"])) legs = props["legs"];
    }
    if (elevations !== null && legs !== null) break;
    fiber = fiber["return"];
  }
  return distances !== null && elevations !== null ? { distances, elevations, legs } : null;
}
