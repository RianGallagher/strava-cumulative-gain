const EARTH_RADIUS_METRES = 6371008.8;

export interface LatLon {
  latitude: number;
  longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMetres(start: LatLon, end: LatLon): number {
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const halfChordSquared =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(start.latitude)) *
      Math.cos(toRadians(end.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(halfChordSquared));
}

/** Running distance in metres along the points; the first entry is 0. */
export function cumulativeDistances(points: readonly LatLon[]): number[] {
  const distances: number[] = [];
  let total = 0;
  points.forEach((point, index) => {
    if (index > 0) total += haversineMetres(points[index - 1], point);
    distances.push(total);
  });
  return distances;
}
