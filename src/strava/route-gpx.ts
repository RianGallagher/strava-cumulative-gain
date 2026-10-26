import type { ProfileSource } from "../elevation-model.ts";
import { cumulativeDistancesMetres, type Coordinates } from "../math/distance.ts";

interface ElevationPoint extends Coordinates {
  elevationMetres: number;
}

function readPoint(pointElement: Element): ElevationPoint | null {
  const elevationText = pointElement.querySelector("ele")?.textContent.trim();
  if (!elevationText) return null;
  const elevationMetres = Number(elevationText);
  const latitude = Number(pointElement.getAttribute("lat"));
  const longitude = Number(pointElement.getAttribute("lon"));
  return Number.isFinite(elevationMetres) && Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude, elevationMetres }
    : null;
}

// Fallback for a route whose page data is unavailable: the GPX export, with
// distances computed along the track. Points without elevation are skipped.
// A non-OK response gives null; a network failure rejects. The loader
// retries both.
export async function fetchRouteGpx(
  routeId: string,
  fetchFunction: typeof fetch,
  parser: DOMParser,
): Promise<ProfileSource | null> {
  const response = await fetchFunction(`/routes/${routeId}/export_gpx`, { credentials: "include" });
  if (!response.ok) return null;
  const gpx = parser.parseFromString(await response.text(), "application/xml");
  const points = [...gpx.querySelectorAll("trkpt, rtept")]
    .map(readPoint)
    .filter((point): point is ElevationPoint => point !== null);
  if (points.length < 2) return null;
  return {
    distancesMetres: cumulativeDistancesMetres(points),
    elevationsMetres: points.map((point) => point.elevationMetres),
  };
}
