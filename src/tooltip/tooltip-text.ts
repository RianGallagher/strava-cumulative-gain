// Text parsing for Strava's tooltips. Matching on text rather than CSS class
// names means the extension survives most Strava front-end redeploys, and the
// same code covers the activity chart ("Dist: 5.4 km") and the route charts
// ("Distance 3.29 km").
import { METRES_PER_UNIT, type ElevationUnit } from "../units.ts";

// textContent runs rows together ("5.4 kmElev: 95 m"), so \b can't be used:
// match case-sensitively and treat a following lowercase letter as "same word".
const DISTANCE_PATTERN = /Dist(?:ance)?\s*:?\s*([\d.,]+)\s*(km|mi|m|ft)(?![a-z])/;
const ELEVATION_PATTERN = /Elev(?:ation)?\s*:?\s*(-?[\d.,]+)\s*(m|ft)(?![a-z])/;
// Every profile tooltip shows Grade; the activity stats header (which also
// has Distance + Elevation) doesn't, so this keeps us out of it.
const GRADE_PATTERN = /Grade\s*:?\s*-?[\d.,]+\s*%/;

export interface ShownDistance {
  metres: number;
  unit: "km" | "mi" | "m" | "ft";
  /** How far off the shown value can be: "6.0 km" -> 100. */
  resolutionMetres: number;
}

function parseNumber(text: string): number {
  return parseFloat(text.replace(/,/g, ""));
}

export function parseShownDistance(text: string): ShownDistance | null {
  const match = DISTANCE_PATTERN.exec(text);
  if (!match) return null;
  const numberText = match[1];
  const unit = match[2] as ShownDistance["unit"];
  const [, fraction = ""] = numberText.split(".");
  const decimalPlaces = fraction.length;
  return {
    metres: parseNumber(numberText) * METRES_PER_UNIT[unit],
    unit,
    resolutionMetres: 10 ** -decimalPlaces * METRES_PER_UNIT[unit],
  };
}

export function parseElevationUnit(text: string): ElevationUnit | null {
  const match = ELEVATION_PATTERN.exec(text);
  return match ? (match[2] as ElevationUnit) : null;
}

export function isProfileTooltip(text: string): boolean {
  return DISTANCE_PATTERN.test(text) && ELEVATION_PATTERN.test(text) && GRADE_PATTERN.test(text);
}
