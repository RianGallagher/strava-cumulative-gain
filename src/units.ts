export type DistanceUnit = "km" | "mi";
export type ElevationUnit = "m" | "ft";

export const METRES_PER_UNIT: Readonly<Record<DistanceUnit | ElevationUnit, number>> = {
  km: 1000,
  mi: 1609.344,
  m: 1,
  ft: 0.3048,
};

export function formatElevation(metres: number, unit: ElevationUnit): string {
  const value = metres / METRES_PER_UNIT[unit];
  return `${Math.round(value).toLocaleString()} ${unit}`;
}

export function formatDistance(metres: number, unit: DistanceUnit, decimalPlaces: number): string {
  return `${(metres / METRES_PER_UNIT[unit]).toFixed(decimalPlaces)} ${unit}`;
}

export function formatGrade(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 754 -> "12:34", 3723 -> "1:02:03" */
export function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainderSeconds = String(totalSeconds % 60).padStart(2, "0");
  if (hours === 0) return `${String(minutes)}:${remainderSeconds}`;
  return `${String(hours)}:${String(minutes).padStart(2, "0")}:${remainderSeconds}`;
}
