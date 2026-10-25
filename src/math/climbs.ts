import { interpolateAt } from "./elevation-curve.ts";

export interface Climb {
  startMetres: number;
  endMetres: number;
  lengthMetres: number;
  riseMetres: number;
  averageGrade: number;
  maximumGrade: number;
}

export interface ClimbDetectionOptions {
  /** Resample spacing. */
  sampleSpacingMetres: number;
  /** Moving-average window. */
  smoothingWindowMetres: number;
  /** Smallest climb worth listing. */
  minimumRiseMetres: number;
  minimumGrade: number;
  minimumLengthMetres: number;
  /** A climb survives dips of up to max(allowedDipMetres, allowedDipFraction * rise). */
  allowedDipMetres: number;
  allowedDipFraction: number;
  /** Flat run-ins and run-outs flatter than this are trimmed... */
  flatEdgeGrade: number;
  /** ...measured over this distance. */
  flatEdgeWindowMetres: number;
  /** Window for the maximum grade. */
  maximumGradeWindowMetres: number;
  /** A stretch this long that stays within... */
  plateauLengthMetres: number;
  /** ...this much height splits a climb in two. */
  plateauToleranceMetres: number;
}

const DEFAULT_OPTIONS: ClimbDetectionOptions = {
  sampleSpacingMetres: 10,
  smoothingWindowMetres: 60,
  minimumRiseMetres: 30,
  minimumGrade: 0.03,
  minimumLengthMetres: 200,
  allowedDipMetres: 10,
  allowedDipFraction: 0.1,
  flatEdgeGrade: 0.02,
  flatEdgeWindowMetres: 30,
  maximumGradeWindowMetres: 100,
  plateauLengthMetres: 800,
  plateauToleranceMetres: 6,
};

interface Profile {
  distances: number[];
  elevations: number[];
}

/** Even spacing makes grades and windows simple index arithmetic. */
function resample(
  distances: readonly number[],
  elevations: readonly number[],
  spacingMetres: number,
  smoothingMetres: number,
): Profile {
  const totalMetres = distances[distances.length - 1] ?? 0;
  const sampleCount = Math.max(2, Math.floor(totalMetres / spacingMetres) + 1);
  const sampledDistances = Array.from(new Array<number>(sampleCount).keys(), (sampleIndex) =>
    Math.min(sampleIndex * spacingMetres, totalMetres),
  );
  const rawElevations = sampledDistances.map((sampleMetres) =>
    interpolateAt(distances, elevations, sampleMetres),
  );
  const halfWindowSamples = Math.max(0, Math.round(smoothingMetres / spacingMetres / 2));
  const sampledElevations = Array.from(rawElevations.keys(), (centreIndex) => {
    let total = 0;
    let count = 0;
    const firstIndex = Math.max(0, centreIndex - halfWindowSamples);
    const lastIndex = Math.min(sampleCount - 1, centreIndex + halfWindowSamples);
    for (let windowIndex = firstIndex; windowIndex <= lastIndex; windowIndex++) {
      total += rawElevations[windowIndex] ?? 0;
      count++;
    }
    return total / count;
  });
  return { distances: sampledDistances, elevations: sampledElevations };
}

/**
 * Finds climbs on the smoothed profile. `riseMetres` is net (top - bottom);
 * callers wanting Strava-consistent gain should read it off their gain curve.
 */
export function findClimbs(
  distances: readonly number[],
  elevations: readonly number[],
  options: Partial<ClimbDetectionOptions> = {},
): Climb[] {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  if (distances.length < 2) return [];
  const profile = resample(
    distances,
    elevations,
    settings.sampleSpacingMetres,
    settings.smoothingWindowMetres,
  );
  const sampledDistances = profile.distances;
  const heightAt = (sampleIndex: number): number => profile.elevations[sampleIndex] ?? 0;
  const distanceAt = (sampleIndex: number): number => sampledDistances[sampleIndex] ?? 0;
  const edgeWindowSamples = Math.max(
    1,
    Math.round(settings.flatEdgeWindowMetres / settings.sampleSpacingMetres),
  );
  const gradeWindowSamples = Math.max(
    1,
    Math.round(settings.maximumGradeWindowMetres / settings.sampleSpacingMetres),
  );
  const plateauSamples = Math.max(2, Math.round(settings.plateauLengthMetres / settings.sampleSpacingMetres));
  const gradeBetween = (fromIndex: number, toIndex: number): number =>
    (heightAt(toIndex) - heightAt(fromIndex)) / (distanceAt(toIndex) - distanceAt(fromIndex) || 1);

  /**
   * First stretch inside the range at least plateauLengthMetres long whose
   * height range stays within the tolerance, extended as far as it goes.
   */
  const findPlateau = (
    rangeStart: number,
    rangeEnd: number,
  ): { plateauStart: number; plateauEnd: number } | null => {
    for (let plateauStart = rangeStart; plateauStart + plateauSamples <= rangeEnd; plateauStart++) {
      let lowest = Infinity;
      let highest = -Infinity;
      for (let index = plateauStart; index <= plateauStart + plateauSamples; index++) {
        lowest = Math.min(lowest, heightAt(index));
        highest = Math.max(highest, heightAt(index));
      }
      if (highest - lowest > settings.plateauToleranceMetres) continue;
      let plateauEnd = plateauStart + plateauSamples;
      while (
        plateauEnd + 1 <= rangeEnd &&
        Math.max(highest, heightAt(plateauEnd + 1)) - Math.min(lowest, heightAt(plateauEnd + 1)) <=
          settings.plateauToleranceMetres
      ) {
        plateauEnd++;
        lowest = Math.min(lowest, heightAt(plateauEnd));
        highest = Math.max(highest, heightAt(plateauEnd));
      }
      return { plateauStart, plateauEnd };
    }
    return null;
  };

  const climbs: Climb[] = [];
  const emitClimb = (bottomIndex: number, topIndex: number): void => {
    // A long flat inside a "climb" means two climbs (or a bump and a climb).
    const plateau = findPlateau(bottomIndex, topIndex);
    if (plateau) {
      emitClimb(bottomIndex, plateau.plateauStart);
      emitClimb(plateau.plateauEnd, topIndex);
      return;
    }
    // Trim flat (or slightly downhill) run-ins and run-outs.
    let startIndex = bottomIndex;
    let endIndex = topIndex;
    while (
      startIndex + edgeWindowSamples < endIndex &&
      gradeBetween(startIndex, startIndex + edgeWindowSamples) < settings.flatEdgeGrade
    ) {
      startIndex++;
    }
    while (
      endIndex - edgeWindowSamples > startIndex &&
      gradeBetween(endIndex - edgeWindowSamples, endIndex) < settings.flatEdgeGrade
    ) {
      endIndex--;
    }
    const lengthMetres = distanceAt(endIndex) - distanceAt(startIndex);
    const riseMetres = heightAt(endIndex) - heightAt(startIndex);
    if (
      lengthMetres < settings.minimumLengthMetres ||
      riseMetres < settings.minimumRiseMetres ||
      riseMetres / lengthMetres < settings.minimumGrade
    ) {
      return;
    }
    let maximumGrade = riseMetres / lengthMetres;
    for (let index = startIndex; index + gradeWindowSamples <= endIndex; index++) {
      maximumGrade = Math.max(maximumGrade, gradeBetween(index, index + gradeWindowSamples));
    }
    climbs.push({
      startMetres: distanceAt(startIndex),
      endMetres: distanceAt(endIndex),
      lengthMetres,
      riseMetres,
      averageGrade: riseMetres / lengthMetres,
      maximumGrade,
    });
  };

  // lowIndex: lowest point since the last climb ended; highIndex: highest point after it.
  let lowIndex = 0;
  let highIndex = 0;
  for (let sampleIndex = 1; sampleIndex < sampledDistances.length; sampleIndex++) {
    if (heightAt(sampleIndex) > heightAt(highIndex)) highIndex = sampleIndex;
    const riseMetres = heightAt(highIndex) - heightAt(lowIndex);
    const tolerableDipMetres = Math.max(settings.allowedDipMetres, settings.allowedDipFraction * riseMetres);
    if (heightAt(highIndex) - heightAt(sampleIndex) > tolerableDipMetres) {
      if (highIndex > lowIndex) emitClimb(lowIndex, highIndex);
      // Restart from the lowest point of the descent so far.
      lowIndex = highIndex;
      for (let scanIndex = highIndex; scanIndex <= sampleIndex; scanIndex++) {
        if (heightAt(scanIndex) < heightAt(lowIndex)) lowIndex = scanIndex;
      }
      highIndex = lowIndex;
      for (let scanIndex = lowIndex; scanIndex <= sampleIndex; scanIndex++) {
        if (heightAt(scanIndex) > heightAt(highIndex)) highIndex = scanIndex;
      }
    } else if (heightAt(sampleIndex) < heightAt(lowIndex)) {
      lowIndex = sampleIndex;
      highIndex = sampleIndex;
    }
  }
  if (highIndex > lowIndex) emitClimb(lowIndex, highIndex);
  return climbs;
}
