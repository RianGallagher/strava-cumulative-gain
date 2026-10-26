import { findClimbs, type Climb } from "./math/climbs.ts";
import {
  buildElevationCurve,
  interpolateAt,
  legCheckpoints,
  type ElevationCurve,
  type RouteLeg,
} from "./math/elevation-curve.ts";

const THRESHOLD_METRES = 1;

export interface ProfileSource {
  distancesMetres: readonly number[];
  elevationsMetres: readonly number[];
  timesSeconds?: readonly number[] | null;
  legs?: readonly RouteLeg[] | null;
  /** The total Strava shows on the page; wins over every computed total. */
  headlineGainMetres?: number;
}

export interface NumberedClimb extends Climb {
  number: number;
  gainMetres: number;
  durationSeconds: number | null;
  verticalMetresPerHour: number | null;
}

export interface ElevationModel {
  gain: ElevationCurve;
  loss: ElevationCurve;
  climbs: readonly NumberedClimb[];
}

export function buildElevationModel(source: ProfileSource): ElevationModel {
  const { distancesMetres, elevationsMetres, timesSeconds, legs, headlineGainMetres } = source;
  const chartLengthMetres = distancesMetres[distancesMetres.length - 1] ?? 0;
  const gainCheckpoints = legs && legCheckpoints(legs, chartLengthMetres, "elevationGain");
  const lossCheckpoints = legs && legCheckpoints(legs, chartLengthMetres, "elevationLoss");
  // Strava shows no loss total, so derive it: gain - loss must equal the net change.
  const netChangeMetres = (elevationsMetres[elevationsMetres.length - 1] ?? 0) - (elevationsMetres[0] ?? 0);
  const lossTotalMetres = headlineGainMetres === undefined ? undefined : headlineGainMetres - netChangeMetres;

  const gain = buildElevationCurve(distancesMetres, elevationsMetres, {
    thresholdMetres: THRESHOLD_METRES,
    checkpoints: gainCheckpoints,
    totalMetres: headlineGainMetres,
  });
  const loss = buildElevationCurve(
    distancesMetres,
    elevationsMetres.map((elevationMetres) => -elevationMetres),
    {
      thresholdMetres: THRESHOLD_METRES,
      checkpoints: lossCheckpoints,
      totalMetres: lossTotalMetres,
    },
  );

  // Climb gain is read off the gain curve so it agrees with the tooltip and Strava's totals.
  const climbs = findClimbs(distancesMetres, elevationsMetres).map((climb, index): NumberedClimb => {
    const gainMetres = gain.valueAt(climb.endMetres) - gain.valueAt(climb.startMetres);
    const durationSeconds = timesSeconds
      ? interpolateAt(distancesMetres, timesSeconds, climb.endMetres) -
        interpolateAt(distancesMetres, timesSeconds, climb.startMetres)
      : null;
    const verticalMetresPerHour =
      durationSeconds !== null && durationSeconds > 0 ? (gainMetres / durationSeconds) * 3600 : null;
    return { ...climb, number: index + 1, gainMetres, durationSeconds, verticalMetresPerHour };
  });
  return { gain, loss, climbs };
}

interface CachedModel {
  headlineGainMetres: number | undefined;
  model: ElevationModel;
}

const modelCache = new WeakMap<readonly number[], CachedModel>();

/** Builds once per elevations array; rebuilds when a headline appears or changes. */
export function cachedElevationModel(source: ProfileSource): ElevationModel {
  const cached = modelCache.get(source.elevationsMetres);
  if (cached && cached.headlineGainMetres === source.headlineGainMetres) return cached.model;
  const model = buildElevationModel(source);
  modelCache.set(source.elevationsMetres, { headlineGainMetres: source.headlineGainMetres, model });
  return model;
}
