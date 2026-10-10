// Climb detection. Pure maths: no DOM access, so it can be unit tested in Node.
(function (root) {
  const DEFAULTS = {
    step: 10, // resample spacing (m)
    smooth: 60, // moving-average window (m)
    minGain: 30, // smallest climb worth listing (m)
    minGrade: 0.03, // average grade
    minLength: 200, // m
    dipAbs: 10, // a climb survives dips of up to max(dipAbs, dipFrac * rise)
    dipFrac: 0.1,
    edgeGrade: 0.02, // trim flat run-ins/run-outs flatter than this...
    edgeWindow: 30, // ...measured over this many metres
    gradeWindow: 100, // m, window for max grade
    plateauLength: 800, // a stretch this long that stays within...
    plateauTol: 6, // ...this many metres of height splits a climb in two
  };

  function interp(xs, ys, x) {
    let lo = 0;
    let hi = xs.length - 1;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[hi]) return ys[hi];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const span = xs[hi] - xs[lo];
    return span > 0 ? ys[lo] + ((x - xs[lo]) / span) * (ys[hi] - ys[lo]) : ys[lo];
  }

  // Even spacing makes grades and windows simple index arithmetic.
  function resample(distances, elevations, step, smooth) {
    const span = distances[distances.length - 1];
    const n = Math.max(2, Math.floor(span / step) + 1);
    const d = Array.from({ length: n }, (_, i) => Math.min(i * step, span));
    const raw = d.map((x) => interp(distances, elevations, x));
    const half = Math.max(0, Math.round(smooth / step / 2));
    const e = raw.map((_, i) => {
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
        sum += raw[j];
        count++;
      }
      return sum / count;
    });
    return { d, e };
  }

  // Returns [{start, end, length, rise, avgGrade, maxGrade}] in metres / ratios.
  // `rise` is net (top - bottom) on the smoothed profile; callers that want
  // Strava-consistent gain should read it off their gain curve instead.
  function findClimbs(distances, elevations, options = {}) {
    const o = { ...DEFAULTS, ...options };
    if (distances.length < 2) return [];
    const { d, e } = resample(distances, elevations, o.step, o.smooth);
    const n = d.length;
    const w = Math.max(1, Math.round(o.edgeWindow / o.step));
    const gw = Math.max(1, Math.round(o.gradeWindow / o.step));
    const grade = (i, j) => (e[j] - e[i]) / (d[j] - d[i] || 1);

    const pw = Math.max(2, Math.round(o.plateauLength / o.step));

    // First stretch in (lo, hi) at least plateauLength long whose height range
    // stays within plateauTol, extended as far as it goes; null if none.
    const findPlateau = (lo, hi) => {
      for (let a = lo; a + pw <= hi; a++) {
        let min = Infinity;
        let max = -Infinity;
        for (let j = a; j <= a + pw; j++) {
          min = Math.min(min, e[j]);
          max = Math.max(max, e[j]);
        }
        if (max - min > o.plateauTol) continue;
        let b = a + pw;
        while (b + 1 <= hi && Math.max(max, e[b + 1]) - Math.min(min, e[b + 1]) <= o.plateauTol) {
          b++;
          min = Math.min(min, e[b]);
          max = Math.max(max, e[b]);
        }
        return [a, b];
      }
      return null;
    };

    const climbs = [];
    const emit = (lo, hi) => {
      // A long flat inside a "climb" means two climbs (or a bump and a climb).
      const flat = findPlateau(lo, hi);
      if (flat) {
        emit(lo, flat[0]);
        emit(flat[1], hi);
        return;
      }
      // Trim flat (or slightly downhill) run-ins and run-outs.
      while (lo + w < hi && grade(lo, lo + w) < o.edgeGrade) lo++;
      while (hi - w > lo && grade(hi - w, hi) < o.edgeGrade) hi--;
      const length = d[hi] - d[lo];
      const rise = e[hi] - e[lo];
      if (length < o.minLength || rise < o.minGain || rise / length < o.minGrade) return;
      let maxGrade = rise / length;
      for (let i = lo; i + gw <= hi; i++) maxGrade = Math.max(maxGrade, grade(i, i + gw));
      climbs.push({ start: d[lo], end: d[hi], length, rise, avgGrade: rise / length, maxGrade });
    };

    // lo: lowest point since the last climb ended; hi: highest point after lo.
    let lo = 0;
    let hi = 0;
    for (let i = 1; i < n; i++) {
      if (e[i] > e[hi]) hi = i;
      const rise = e[hi] - e[lo];
      if (e[hi] - e[i] > Math.max(o.dipAbs, o.dipFrac * rise)) {
        if (hi > lo) emit(lo, hi);
        // Restart from the lowest point of the descent so far.
        lo = hi;
        for (let j = hi; j <= i; j++) if (e[j] < e[lo]) lo = j;
        hi = lo;
        for (let j = lo; j <= i; j++) if (e[j] > e[hi]) hi = j;
      } else if (e[i] < e[lo]) {
        lo = i;
        hi = i;
      }
    }
    if (hi > lo) emit(lo, hi);
    return climbs;
  }

  const api = { findClimbs, DEFAULTS };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CumulativeGainClimbs = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
