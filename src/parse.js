// Text parsing for Strava's tooltips. Matching on text rather than CSS class
// names means the extension survives most Strava front-end redeploys, and the
// same code covers the activity chart ("Dist: 5.4 km") and the route charts
// ("Distance 3.29 km").
(function (root) {
  // textContent runs rows together ("5.4 kmElev: 95 m"), so \b can't be used:
  // match case-sensitively and treat a following lowercase letter as "same word".
  const DIST_RE = /Dist(?:ance)?\s*:?\s*([\d.,]+)\s*(km|mi|m|ft)(?![a-z])/;
  const ELEV_RE = /Elev(?:ation)?\s*:?\s*(-?[\d.,]+)\s*(m|ft)(?![a-z])/;
  // Every profile tooltip shows Grade; the activity stats header (which also
  // has Distance + Elevation) doesn't, so this keeps us out of it.
  const GRADE_RE = /Grade\s*:?\s*-?[\d.,]+\s*%/;

  const TO_METRES = { km: 1000, mi: 1609.344, m: 1, ft: 0.3048 };

  function num(s) {
    return parseFloat(s.replace(/,/g, ""));
  }

  // Returns {metres, unit, step} or null. `step` is the display resolution in
  // metres ("6.0 km" -> 100), i.e. how far off the shown value can be.
  function parseDistance(text) {
    const m = DIST_RE.exec(text);
    if (!m) return null;
    const unit = m[2];
    const decimals = (m[1].split(".")[1] || "").length;
    return { metres: num(m[1]) * TO_METRES[unit], unit, step: 10 ** -decimals * TO_METRES[unit] };
  }

  // Returns the elevation unit ("m" | "ft") or null.
  function parseElevationUnit(text) {
    const m = ELEV_RE.exec(text);
    return m ? m[2] : null;
  }

  function isProfileTooltip(text) {
    return DIST_RE.test(text) && ELEV_RE.test(text) && GRADE_RE.test(text);
  }

  function formatGain(metres, unit) {
    const v = unit === "ft" ? metres / 0.3048 : metres;
    return `${Math.round(v).toLocaleString()} ${unit}`;
  }

  const api = { TO_METRES, parseDistance, parseElevationUnit, isProfileTooltip, formatGain, DIST_RE, ELEV_RE };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CumGainParse = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
