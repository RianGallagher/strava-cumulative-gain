import type { ProfileSource } from "../elevation-model.ts";
import { isProfileArray, isRecord } from "./guards.ts";

const STREAM_TYPES = ["distance", "altitude", "time"];

// Strava's own streams endpoint for an activity. Never throws: any failure
// (network, non-OK status, bad JSON, wrong shape) gives null.
export async function fetchActivityStreams(
  activityId: string,
  fetchFunction: typeof fetch,
): Promise<ProfileSource | null> {
  try {
    const query = STREAM_TYPES.map((type) => `stream_types[]=${type}`).join("&");
    const response = await fetchFunction(`/activities/${activityId}/streams?${query}`, {
      credentials: "include",
    });
    if (!response.ok) return null;
    const streams: unknown = await response.json();
    if (!isRecord(streams)) return null;
    const { distance, altitude, time } = streams;
    if (!isProfileArray(distance) || !isProfileArray(altitude) || distance.length !== altitude.length) {
      return null;
    }
    const times = isProfileArray(time) && time.length === distance.length ? time : null;
    return { distances: distance, elevations: altitude, times };
  } catch {
    return null;
  }
}
