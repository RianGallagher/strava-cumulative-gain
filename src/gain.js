// Pure profile maths: no DOM access, so it can be unit tested in Node.
(function (root) {
  const EARTH_RADIUS_M = 6371008.8;

  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
  }

  // Cumulative distance (m) along a list of {lat, lon} points.
  function cumulativeDistance(points) {
    const out = [0];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      out.push(out[i - 1] + haversine(a.lat, a.lon, b.lat, b.lon));
    }
    return out;
  }

  // Cumulative gain with hysteresis: a climb only counts once it rises
  // `threshold` metres above the lowest point since the last counted climb.
  // Summing every positive delta (what the old Python/Svelte versions did)
  // counts sensor noise and overshoots Strava's totals badly.
  function cumulativeGain(elevations, threshold = 0) {
    const out = new Array(elevations.length).fill(0);
    if (elevations.length === 0) return out;
    let gain = 0;
    let anchor = elevations[0];
    for (let i = 1; i < elevations.length; i++) {
      const e = elevations[i];
      if (e - anchor >= threshold && e > anchor) {
        gain += e - anchor;
        anchor = e;
      } else if (e < anchor) {
        anchor = e;
      }
      out[i] = gain;
    }
    return out;
  }

  // Scale the curve so its endpoint equals the total Strava shows on the page.
  // That makes the hover value agree with Strava's own headline number.
  function normalise(gains, total) {
    const last = gains[gains.length - 1];
    if (!(total > 0) || !(last > 0)) return gains;
    const k = total / last;
    return gains.map((g) => g * k);
  }

  // Pin the curve to known (distance, cumulative gain) checkpoints, e.g. the
  // per-leg gains Strava computes for a route. Between checkpoints the raw
  // curve's shape decides where the gain happens; at each checkpoint the value
  // is exactly Strava's.
  function anchorTo(distances, gains, anchors) {
    if (!anchors || anchors.length < 2) return gains;
    const out = new Array(gains.length);
    let k = 0;
    for (let i = 0; i < distances.length; i++) {
      const d = distances[i];
      while (k < anchors.length - 2 && d > anchors[k + 1].d) k++;
      const a = anchors[k];
      const b = anchors[k + 1];
      const r0 = gainAt(distances, gains, a.d);
      const r1 = gainAt(distances, gains, b.d);
      let t;
      if (r1 > r0) t = (gains[i] - r0) / (r1 - r0);
      else t = b.d > a.d ? (d - a.d) / (b.d - a.d) : 1;
      t = Math.min(1, Math.max(0, t));
      out[i] = a.g + t * (b.g - a.g);
    }
    return out;
  }

  // Gain at distance `d` (m), linearly interpolated. `distances` is ascending.
  function gainAt(distances, gains, d) {
    const n = distances.length;
    if (n === 0) return 0;
    if (d <= distances[0]) return gains[0];
    if (d >= distances[n - 1]) return gains[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] <= d) lo = mid;
      else hi = mid;
    }
    const span = distances[hi] - distances[lo];
    const t = span > 0 ? (d - distances[lo]) / span : 0;
    return gains[lo] + t * (gains[hi] - gains[lo]);
  }

  function buildProfile(distances, elevations, { threshold = 0, total, anchors } = {}) {
    let gains = cumulativeGain(elevations, threshold);
    if (anchors && anchors.length > 1) gains = anchorTo(distances, gains, anchors);
    // Applied after anchoring too: on the route page Strava's headline total
    // can differ from the sum of its own leg gains (1,329 m vs 1,309 m).
    gains = normalise(gains, total);
    return { distances, gains, at: (d) => gainAt(distances, gains, d) };
  }

  // Strava route legs -> checkpoints [{d, g}], rescaled so the last checkpoint
  // lands on `span` (the chart's own last distance; leg lengths and the chart
  // stream disagree by a few metres).
  function legAnchors(legs, span) {
    const anchors = [{ d: 0, g: 0 }];
    let d = 0;
    let g = 0;
    for (const leg of legs || []) {
      for (const p of leg.paths || []) {
        d += p.length || 0;
        g += p.elevationGain || 0;
      }
      anchors.push({ d, g });
    }
    if (d <= 0) return null;
    const k = span > 0 ? span / d : 1;
    return anchors.map((a) => ({ d: a.d * k, g: a.g }));
  }

  const api = {
    haversine,
    cumulativeDistance,
    cumulativeGain,
    normalise,
    anchorTo,
    gainAt,
    buildProfile,
    legAnchors,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CumulativeGain = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
