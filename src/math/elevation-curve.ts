export interface Checkpoint {
  distanceMetres: number;
  cumulativeMetres: number;
}

export interface RoutePath {
  length: number;
  elevationGain?: number;
  elevationLoss?: number;
}

export interface RouteLeg {
  paths: readonly RoutePath[];
}

export interface ElevationCurve {
  valueAt(distanceMetres: number): number;
}

/** Linear interpolation over ascending positions, clamped at both ends. */
export function interpolateAt(
  positions: readonly number[],
  values: readonly number[],
  position: number,
): number {
  const lastIndex = positions.length - 1;
  if (lastIndex < 0) return 0;
  if (position <= (positions[0] ?? 0)) return values[0] ?? 0;
  if (position >= (positions[lastIndex] ?? 0)) return values[lastIndex] ?? 0;
  let lowerIndex = 0;
  let upperIndex = lastIndex;
  while (upperIndex - lowerIndex > 1) {
    const middleIndex = (lowerIndex + upperIndex) >> 1;
    if ((positions[middleIndex] ?? 0) < position) lowerIndex = middleIndex;
    else upperIndex = middleIndex;
  }
  const lowerPosition = positions[lowerIndex] ?? 0;
  const lowerValue = values[lowerIndex] ?? 0;
  const width = (positions[upperIndex] ?? 0) - lowerPosition;
  if (width <= 0) return lowerValue;
  const fraction = (position - lowerPosition) / width;
  return lowerValue + fraction * ((values[upperIndex] ?? 0) - lowerValue);
}

/**
 * Cumulative climb with two-state hysteresis. While descending, a rise counts
 * once it reaches the threshold above the lowest point (the whole rise is
 * added). While climbing, every further rise counts immediately, until the
 * elevation falls the threshold below the climb's highest point.
 */
export function cumulativeClimb(elevations: readonly number[], thresholdMetres: number): number[] {
  const climbs: number[] = [];
  let totalMetres = 0;
  let isClimbing = false;
  let referenceMetres = elevations[0] ?? 0; // lowest point, or highest while climbing
  elevations.forEach((elevationMetres, index) => {
    if (index > 0) {
      if (isClimbing) {
        if (elevationMetres > referenceMetres) {
          totalMetres += elevationMetres - referenceMetres;
          referenceMetres = elevationMetres;
        } else if (referenceMetres - elevationMetres >= thresholdMetres) {
          isClimbing = false;
          referenceMetres = elevationMetres;
        }
      } else if (elevationMetres < referenceMetres) {
        referenceMetres = elevationMetres;
      } else if (elevationMetres > referenceMetres && elevationMetres - referenceMetres >= thresholdMetres) {
        totalMetres += elevationMetres - referenceMetres;
        referenceMetres = elevationMetres;
        isClimbing = true;
      }
    }
    climbs.push(totalMetres);
  });
  return climbs;
}

/** Scale so the last value equals the page total; unchanged if that is impossible. */
export function scaleToTotal(values: readonly number[], totalMetres: number | undefined): number[] {
  const last = values.at(-1);
  if (totalMetres === undefined || !(totalMetres > 0) || last === undefined || !(last > 0)) {
    return [...values];
  }
  const factor = totalMetres / last;
  return values.map((value) => value * factor);
}

/**
 * Pin the curve to known cumulative values (for example Strava's per-leg
 * gains). Between checkpoints the raw curve's shape decides where the change
 * happens; at each checkpoint the value is exactly the checkpoint's.
 */
export function pinToCheckpoints(
  distances: readonly number[],
  values: readonly number[],
  checkpoints: readonly Checkpoint[],
): number[] {
  if (checkpoints.length < 2) return [...values];
  let segmentIndex = 0;
  return distances.map((distanceMetres, index) => {
    while (
      segmentIndex < checkpoints.length - 2 &&
      distanceMetres > (checkpoints[segmentIndex + 1]?.distanceMetres ?? 0)
    ) {
      segmentIndex++;
    }
    const start = checkpoints[segmentIndex];
    const end = checkpoints[segmentIndex + 1];
    const rawStart = interpolateAt(distances, values, start.distanceMetres);
    const rawEnd = interpolateAt(distances, values, end.distanceMetres);
    let fraction: number;
    if (rawEnd > rawStart) {
      fraction = ((values[index] ?? 0) - rawStart) / (rawEnd - rawStart);
    } else if (end.distanceMetres > start.distanceMetres) {
      fraction = (distanceMetres - start.distanceMetres) / (end.distanceMetres - start.distanceMetres);
    } else {
      fraction = 1;
    }
    fraction = Math.min(1, Math.max(0, fraction));
    return start.cumulativeMetres + fraction * (end.cumulativeMetres - start.cumulativeMetres);
  });
}

/**
 * Strava route legs to checkpoints of the running total of `field`, rescaled
 * so the last checkpoint lands on the chart's own last distance. Null when no
 * path carries the field.
 */
export function legCheckpoints(
  legs: readonly RouteLeg[],
  chartLengthMetres: number,
  field: "elevationGain" | "elevationLoss",
): Checkpoint[] | null {
  const checkpoints: Checkpoint[] = [{ distanceMetres: 0, cumulativeMetres: 0 }];
  let distanceMetres = 0;
  let cumulativeMetres = 0;
  let hasField = false;
  for (const leg of legs) {
    for (const path of leg.paths) {
      distanceMetres += path.length || 0;
      const amountMetres = path[field];
      if (typeof amountMetres === "number") {
        cumulativeMetres += amountMetres;
        hasField = true;
      }
    }
    checkpoints.push({ distanceMetres, cumulativeMetres });
  }
  if (distanceMetres <= 0 || !hasField) return null;
  const factor = chartLengthMetres > 0 ? chartLengthMetres / distanceMetres : 1;
  return checkpoints.map((checkpoint) => ({
    distanceMetres: checkpoint.distanceMetres * factor,
    cumulativeMetres: checkpoint.cumulativeMetres,
  }));
}

export function buildElevationCurve(
  distances: readonly number[],
  elevations: readonly number[],
  options: {
    thresholdMetres: number;
    checkpoints?: readonly Checkpoint[] | null;
    totalMetres?: number;
  },
): ElevationCurve {
  let values = cumulativeClimb(elevations, options.thresholdMetres);
  if (options.checkpoints && options.checkpoints.length > 1) {
    values = pinToCheckpoints(distances, values, options.checkpoints);
  }
  // Scaled after pinning too: Strava's headline total can differ from the sum of its leg gains.
  values = scaleToTotal(values, options.totalMetres);
  return { valueAt: (distanceMetres) => interpolateAt(distances, values, distanceMetres) };
}
