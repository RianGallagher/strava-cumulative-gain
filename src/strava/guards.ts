import type { RouteLeg } from "../math/elevation-curve.ts";

// Strava's data arrives untyped; these guards narrow it without casts.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number");
}

// Two or more points, so a profile has a length.
export function isProfileArray(value: unknown): value is number[] {
  return isNumberArray(value) && value.length >= 2;
}

// As strict as the legacy script: one odd path (say, without a length) must
// not drop every leg; legCheckpoints counts a missing length as 0 m.
export function isLegArray(value: unknown): value is RouteLeg[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((leg) => isRecord(leg) && Array.isArray(leg["paths"]) && leg["paths"].every(isRecord))
  );
}
