import type { ProfileSource } from "../elevation-model.ts";
import { isLegArray, isNumberArray, isRecord } from "./guards.ts";

function readRoute(document: Document): Record<string, unknown> | null {
  const text = document.getElementById("__NEXT_DATA__")?.textContent;
  if (!text) return null;
  try {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data) || !isRecord(data["props"]) || !isRecord(data["props"]["pageProps"])) return null;
    const route = data["props"]["pageProps"]["route"];
    return isRecord(route) ? route : null;
  } catch {
    return null;
  }
}

// Route page: the same data Strava's chart uses is embedded as JSON. After a
// client-side navigation the script still describes the previous route, so a
// different id means stale data.
export function readEmbeddedRoute(document: Document, routeId: string): ProfileSource | null {
  const route = readRoute(document);
  if (route === null) return null;
  const { id, elevation, legs, elevationGain } = route;
  if (String(id) !== routeId || !Array.isArray(elevation) || elevation.length < 2) return null;
  const distances: number[] = [];
  const elevations: number[] = [];
  for (const point of elevation) {
    if (!isNumberArray(point) || point.length < 2) return null;
    distances.push(point[0] ?? Number.NaN);
    elevations.push(point[1] ?? Number.NaN);
  }
  return {
    distances,
    elevations,
    legs: isLegArray(legs) ? legs : null,
    ...(typeof elevationGain === "number" ? { headlineGainMetres: elevationGain } : {}),
  };
}
