const EARTH_RADIUS_METRES = 6371008.8;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineMetres(start: Coordinates, end: Coordinates): number {
  const latitudeDeltaRadians = toRadians(end.latitude - start.latitude);
  const longitudeDeltaRadians = toRadians(end.longitude - start.longitude);
  const halfChordSquared =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(toRadians(start.latitude)) *
      Math.cos(toRadians(end.latitude)) *
      Math.sin(longitudeDeltaRadians / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(halfChordSquared));
}

/** Running distance in metres along the points; the first entry is 0. */
export function cumulativeDistancesMetres(points: readonly Coordinates[]): number[] {
  const distancesMetres: number[] = [];
  let totalMetres = 0;
  points.forEach((point, index) => {
    if (index > 0) totalMetres += haversineMetres(points[index - 1], point);
    distancesMetres.push(totalMetres);
  });
  return distancesMetres;
}
