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

function isRoutePath(value: unknown): boolean {
  return isRecord(value) && typeof value["length"] === "number";
}

export function isLegArray(value: unknown): value is RouteLeg[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((leg) => isRecord(leg) && Array.isArray(leg["paths"]) && leg["paths"].every(isRoutePath))
  );
}
