// Runs in the page's MAIN world so it can read the props React passes to
// Strava's route chart (the route builder keeps its profile only in memory).
(function () {
  const { buildProfile, cumulativeDistance, legAnchors, gainAt } = window.CumulativeGain;
  const {
    TO_METRES,
    parseDistance,
    parseElevationUnit,
    isProfileTooltip,
    formatElevation,
    formatDistance,
    formatGrade,
    formatDuration,
  } = window.CumulativeGainParse;
  const { findClimbs } = window.CumulativeGainClimbs;

  const DEBUG = localStorage.getItem("cumulative-gain:debug") === "1";
  const log = (...a) => DEBUG && console.log("[cumulative-gain]", ...a);
  const MARK = "data-cumulative-gain";
  const THRESHOLD_M = 1;

  const isNums = (a) => Array.isArray(a) && a.length > 1 && typeof a[0] === "number";

  // ---------- data sources ----------

  // Route page and route builder: the chart component gets `distance` and
  // `elevation` arrays as props, and an ancestor holds the route `legs`, each
  // with Strava's own elevationGain. Found by prop shape, not component name,
  // since names are minified.
  function fromReact(el) {
    const key = el && Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    let f = key && el[key];
    let chart = null;
    let legs = null;
    for (let i = 0; f && i < 40 && !(chart && legs); i++, f = f.return) {
      const p = f.memoizedProps;
      if (!p || typeof p !== "object") continue;
      if (!chart && isNums(p.distance) && isNums(p.elevation) && p.distance.length === p.elevation.length)
        chart = p;
      if (chart && !legs && Array.isArray(p.legs) && p.legs[0]?.paths) legs = p.legs;
    }
    return chart && { key: chart.elevation, distances: chart.distance, elevations: chart.elevation, legs };
  }

  // Route page fallback: the same data is embedded in __NEXT_DATA__.
  let nextDataCache = null;
  function nextData() {
    if (nextDataCache?.path !== location.pathname)
      nextDataCache = { path: location.pathname, data: fromNextData() };
    return nextDataCache.data;
  }
  function fromNextData() {
    try {
      const route = JSON.parse(document.getElementById("__NEXT_DATA__").textContent).props.pageProps
        .route;
      if (String(route.id) !== routeId() || !Array.isArray(route.elevation)) return null;
      return {
        distances: route.elevation.map((p) => p[0]),
        elevations: route.elevation.map((p) => p[1]),
        legs: route.legs,
        total: route.elevationGain,
      };
    } catch {
      return null;
    }
  }

  async function fromGpx(id) {
    const res = await fetch(`/routes/${id}/export_gpx`, { credentials: "include" });
    if (!res.ok) return null;
    const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
    const pts = [...doc.querySelectorAll("trkpt, rtept")]
      .map((p) => ({
        lat: +p.getAttribute("lat"),
        lon: +p.getAttribute("lon"),
        ele: +(p.querySelector("ele")?.textContent ?? NaN),
      }))
      .filter((p) => Number.isFinite(p.ele));
    return { distances: cumulativeDistance(pts), elevations: pts.map((p) => p.ele) };
  }

  async function fromStreams(id) {
    const types = ["distance", "altitude", "time"].map((t) => `stream_types[]=${t}`).join("&");
    const res = await fetch(`/activities/${id}/streams?${types}`, { credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json();
    if (!isNums(json.distance)) return null;
    return { distances: json.distance, elevations: json.altitude, times: isNums(json.time) ? json.time : null };
  }

  const activityId = () => location.pathname.match(/^\/activities\/(\d+)/)?.[1];
  const routeId = () => location.pathname.match(/^\/routes\/(\d+)\/?$/)?.[1];

  // Fetched data for the current page (activities, GPX fallback for routes).
  let fetched = null;
  let fetchedFor = null;
  function ensureFetched() {
    const path = location.pathname;
    if (fetchedFor === path) return;
    fetchedFor = path;
    fetched = null;
    const a = activityId();
    const r = routeId();
    if (!a && !r) return;
    (async () => {
      try {
        const d = a ? await fromStreams(a) : nextData() || (await fromGpx(r));
        if (fetchedFor !== path || !d) return;
        fetched = d;
        log("loaded", d.distances.length, "points");
        schedule();
      } catch (e) {
        log(e);
      }
    })();
  }

  // Strava's headline "Elevation" / "Elevation Gain" stat, in metres.
  function findPageTotal() {
    for (const el of document.querySelectorAll("div, span, dt, th, label, li")) {
      if (el.childElementCount > 0 || el.closest("svg")) continue;
      if (!/^\s*Elevation( Gain)?\s*$/i.test(el.textContent)) continue;
      const m = el.parentElement?.textContent.match(/(-?[\d,.]+)\s*(m|ft)\b/i);
      if (m) return parseFloat(m[1].replace(/,/g, "")) * TO_METRES[m[2].toLowerCase()];
    }
    return undefined;
  }

  // Gain and loss curves, cached per source array, so the builder rebuilds
  // only when React hands the chart a new route.
  const cache = new WeakMap();
  function profilesFor(data) {
    const key = data.key || data.elevations;
    let p = cache.get(key);
    if (!p) {
      const { distances, elevations } = data;
      const span = distances[distances.length - 1];
      const gainAnchors = data.legs && legAnchors(data.legs, span, "elevationGain");
      const lossAnchors = data.legs && legAnchors(data.legs, span, "elevationLoss");
      // The route page's headline total wins; elsewhere the legs already
      // match what Strava shows (the builder's totals are the leg sums).
      const total = data.total ?? (gainAnchors ? undefined : findPageTotal());
      // Strava shows no loss total on activities or the route page, so derive
      // it from the gain total: gain - loss must equal the net elevation change.
      const lossTotal =
        total === undefined ? undefined : total - (elevations[elevations.length - 1] - elevations[0]);
      const opts = { threshold: THRESHOLD_M };
      const gain = buildProfile(distances, elevations, { ...opts, anchors: gainAnchors, total });
      const loss = buildProfile(distances, elevations.map((e) => -e), { ...opts, anchors: lossAnchors, total: lossTotal });
      // Climb gain is read off the gain curve so it agrees with the tooltip
      // (and Strava's totals); time and VAM only exist for activities.
      const climbs = findClimbs(distances, elevations).map((c, i) => {
        const g = gain.at(c.end) - gain.at(c.start);
        const t = data.times ? gainAt(distances, data.times, c.end) - gainAt(distances, data.times, c.start) : null;
        return { ...c, n: i + 1, gain: g, time: t, vam: t > 0 ? (g / t) * 3600 : null };
      });
      p = { gain, loss, climbs };
      log("profile", distances.length, "points", gainAnchors ? `${gainAnchors.length} anchors` : "", total, lossTotal);
      cache.set(key, p);
    }
    return p;
  }

  // ---------- hover position ----------

  // Distance under the crosshair, from its x position against the axis ticks.
  // The activity tooltip only shows 0.1 km, so this is up to 50 m more precise.
  function crosshairDistance(svg, tip, shown) {
    const ticks = [];
    for (const t of svg.querySelectorAll("text")) {
      const m = /^\s*([\d.,]+)\s*(km|mi)\s*$/.exec(t.textContent);
      if (!m) continue;
      const r = t.getBoundingClientRect();
      if (r.width) ticks.push({ x: r.x + r.width / 2, d: parseFloat(m[1].replace(/,/g, "")) * TO_METRES[m[2]] });
    }
    if (ticks.length < 2) return null;
    const a = ticks[0];
    const b = ticks[ticks.length - 1];
    if (b.x === a.x || b.d === a.d) return null;

    // The crosshair is a tall vertical line hugging the tooltip box (either
    // side). Prefer one that is clearly the crosshair over a nearby gridline.
    const box = tip.getBoundingClientRect();
    const svgH = svg.getBoundingClientRect().height;
    let best = null;
    for (const l of svg.querySelectorAll("line")) {
      if (l.getAttribute("x1") !== l.getAttribute("x2")) continue;
      const r = l.getBoundingClientRect();
      if (r.height < svgH / 2 || r.width > 3) continue;
      const gap = Math.min(Math.abs(r.x - box.left), Math.abs(r.x - box.right));
      if (gap > 24) continue;
      const rank = /cross/i.test(l.getAttribute("class") || "") || l.parentElement === tip.parentElement ? 0 : 1;
      if (!best || rank < best.rank || (rank === best.rank && gap < best.gap))
        best = { x: r.x + r.width / 2, gap, rank };
    }
    if (!best) return null;
    const d = a.d + ((best.x - a.x) / (b.x - a.x)) * (b.d - a.d);
    // Guard against having picked a gridline: must agree with the label.
    return Math.abs(d - shown.metres) <= shown.step / 2 + Math.abs((b.d - a.d) / (b.x - a.x)) * 2 ? d : null;
  }

  // ---------- tooltip ----------

  // The smallest elements whose text contains Distance, Elevation and Grade.
  function findTooltips(root) {
    const found = [];
    const visit = (el) => {
      if (!isProfileTooltip(el.textContent)) return false;
      let deeper = false;
      for (const c of el.children) if (visit(c)) deeper = true;
      if (!deeper) found.push(el);
      return true;
    };
    visit(root);
    return found;
  }

  // The tooltip's own Elevation row: the largest descendant that mentions
  // Elevation but not Distance.
  function findElevRow(tip) {
    const walk = (el) => {
      for (const c of el.children) {
        if (c.hasAttribute(MARK)) continue;
        const t = c.textContent;
        if (/Elev/.test(t) && !/Dist/.test(t)) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(tip);
  }

  function relabel(node, label, value) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let labelled = false;
    let valued = false;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      let s = t.nodeValue;
      // Text up to and including the new label; never searched for the value
      // (the label itself can contain digits, e.g. "Climb 4").
      let head = "";
      if (!labelled && /Elev(ation)?/.test(s)) {
        const m = /Elev(ation)?/.exec(s);
        head = s.slice(0, m.index) + label;
        s = s.slice(m.index + m[0].length);
        labelled = true;
      }
      if (!valued && /\d/.test(s)) {
        s = s.replace(/-?\d[\d,.]*(\s*(?:m|ft)(?![a-z]))?/, () => value);
        valued = true;
      } else if (valued && !head && /^\s*(m|ft)\s*$/.test(s)) {
        // The unit was in its own node ("95" + "m"); `value` carries its own.
        s = "";
      }
      t.nodeValue = head + s;
    }
  }

  // Set an attribute relative to the value the page last wrote. If the page
  // rewrites it, that becomes the new base, so re-running is idempotent.
  function setFromBase(el, attr, fn) {
    const cur = el.getAttribute(attr);
    if (el.getAttribute(`data-cg-${attr}`) !== cur) el.setAttribute(`data-cg-base-${attr}`, cur);
    const next = String(fn(el.getAttribute(`data-cg-base-${attr}`)));
    if (next !== cur) el.setAttribute(attr, next);
    el.setAttribute(`data-cg-${attr}`, next);
  }

  // SVG rows are positioned either with y="41" (activity chart) or
  // transform="translate(6, 22)" (route charts).
  const TRANSLATE = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)/;
  const rowAttr = (row) => (row.hasAttribute("y") ? "y" : "transform");
  const baseY = (row) => {
    const attr = rowAttr(row);
    const v = row.getAttribute(`data-cg-${attr}`) === row.getAttribute(attr)
      ? row.getAttribute(`data-cg-base-${attr}`)
      : row.getAttribute(attr);
    return attr === "y" ? parseFloat(v) : parseFloat(TRANSLATE.exec(v || "")?.[2]);
  };
  const shiftRow = (row, dy) =>
    setFromBase(row, rowAttr(row), (v) =>
      rowAttr(row) === "y"
        ? parseFloat(v) + dy
        : v.replace(TRANSLATE, (_, x, y) => `translate(${x}, ${parseFloat(y) + dy})`)
    );

  // The climb row comes and goes as the hover enters and leaves a climb.
  function removeStale(tip, extras) {
    const keys = new Set(extras.map((x) => x.key));
    for (const r of tip.querySelectorAll(`[${MARK}]`)) if (!keys.has(r.getAttribute(MARK))) r.remove();
  }

  // Rebuild an extra row from the live Elevation row (keeps font/attrs in
  // sync) when its value changes. MARK holds the row's key ("gain"/"loss").
  function fill(row, elevRow, { label, value }) {
    const key = `${label}|${value}`;
    if (row.getAttribute("data-cg-value") === key) return;
    row.replaceChildren(...[...elevRow.childNodes].map((c) => c.cloneNode(true)));
    relabel(row, label, value);
    row.setAttribute("data-cg-value", key);
  }

  // Insert real rows under Elevation: push the rows below them down and grow
  // the background box to fit.
  function renderSvg(tip, elevRow, extras) {
    removeStale(tip, extras);
    const rows = [...tip.querySelectorAll("text")].filter(
      (t) => !t.hasAttribute(MARK) && t.getAttribute("display") !== "none" && t.textContent.trim()
    );
    const ys = rows.map(baseY);
    const elevY = baseY(elevRow);
    const step = ys.length > 1 ? Math.abs(ys[1] - ys[0]) : 16;
    const attr = rowAttr(elevRow);
    const src = elevRow.getAttribute(`data-cg-${attr}`) === elevRow.getAttribute(attr)
      ? elevRow.getAttribute(`data-cg-base-${attr}`)
      : elevRow.getAttribute(attr);
    // The activity chart hides every <text> on mouseleave but only re-shows its
    // own rows, so mirror the Elevation row's visibility.
    const display = elevRow.getAttribute("display");

    const mine = extras.map((x, k) => {
      let row = tip.querySelector(`text[${MARK}="${x.key}"]`);
      if (!row) {
        row = elevRow.cloneNode(true);
        row.removeAttribute("id");
        for (const a of [...row.attributes]) if (a.name.startsWith("data-cg-")) row.removeAttribute(a.name);
        row.setAttribute(MARK, x.key);
        // Appended last: inserting between React/D3-managed rows can upset them.
        tip.appendChild(row);
      }
      const y = elevY + step * (k + 1);
      const pos = attr === "y" ? String(y) : src.replace(TRANSLATE, (_, px) => `translate(${px}, ${y})`);
      if (row.getAttribute(attr) !== pos) row.setAttribute(attr, pos);
      if (display !== null && row.getAttribute("display") !== display) row.setAttribute("display", display);
      fill(row, elevRow, x);
      return row;
    });

    const dy = step * extras.length;
    rows.forEach((r, i) => {
      if (ys[i] > elevY) shiftRow(r, dy);
    });

    const rect = tip.querySelector("rect");
    if (rect) {
      setFromBase(rect, "height", (h) => parseFloat(h) + dy);
      const rowX = (r) =>
        r.hasAttribute("x") ? parseFloat(r.getAttribute("x")) : parseFloat(TRANSLATE.exec(r.getAttribute("transform") || "")?.[1] ?? 0);
      const pad = rowX(elevRow) - parseFloat(rect.getAttribute("x") || 0);
      const need = Math.max(...[...rows, ...mine].map((t) => t.getBBox().width)) + pad * 2;
      setFromBase(rect, "width", (w) => Math.max(parseFloat(w), Math.ceil(need)));
    }
  }

  function renderHtml(tip, elevRow, extras) {
    removeStale(tip, extras);
    let prev = elevRow;
    for (const x of extras) {
      let row = tip.querySelector(`[${MARK}="${x.key}"]`);
      if (!row) {
        row = elevRow.cloneNode(true);
        row.setAttribute(MARK, x.key);
        prev.after(row);
      }
      fill(row, elevRow, x);
      prev = row;
    }
  }

  // Profile data behind a chart: React props (route page, builder) or the
  // fetched activity streams. Only the activity's own elevation chart gets the
  // fetched data, so other charts on the page are left alone.
  function dataFor(svg) {
    let data = svg && fromReact(svg);
    // On the route page the chart's ancestors don't hold the legs; the
    // embedded page data does, along with Strava's total.
    if (data && !data.legs && routeId()) {
      const nd = nextData();
      if (nd) data = { ...data, legs: nd.legs, total: nd.total };
    }
    if (!data && fetched && svg?.closest("#elevation-chart")) data = fetched;
    return data;
  }

  function render(tip) {
    const svg = tip.ownerSVGElement || tip.closest("svg") || tip.parentElement?.querySelector("svg");
    const data = dataFor(svg);
    if (!data) return;
    const text = tip.textContent;
    const shown = parseDistance(text);
    const unit = parseElevationUnit(text);
    if (!shown || !unit) return;
    const elevRow = findElevRow(tip);
    if (!elevRow) return;

    const d = (svg && crosshairDistance(svg, tip, shown)) ?? shown.metres;
    const { gain, loss, climbs } = profilesFor(data);
    const extras = [
      { key: "gain", label: "Gain", value: formatElevation(gain.at(d), unit) },
      { key: "loss", label: "Loss", value: formatElevation(loss.at(d), unit) },
    ];
    const climb = climbsOn() && climbs.find((c) => d >= c.start && d <= c.end);
    if (climb) {
      const value = `${formatDistance(climb.length, shown.unit === "mi" ? "mi" : "km", 1)} · ${formatGrade(climb.avgGrade)}`;
      extras.push({ key: "climb", label: `Climb ${climb.n}`, value });
    }
    if (climb !== false) highlightBand(svg, climb?.n);
    if (elevRow instanceof SVGElement) renderSvg(tip, elevRow.closest("text") || elevRow, extras);
    else renderHtml(tip, elevRow, extras);
  }


  // ---------- climbs on the chart ----------

  const SVG_NS = "http://www.w3.org/2000/svg";
  const BAND_FILL = "rgb(252, 82, 0)"; // Strava orange
  const BAND_OPACITY = "0.12";
  const BAND_OPACITY_HOT = "0.3";

  // Display units from the chart's own axis labels ("10.0 km", "200 m").
  function chartUnits(svg) {
    let dist = "km";
    let elev = "m";
    for (const t of svg.querySelectorAll("text")) {
      const m = /^\s*[\d,.]+\s*(km|mi|m|ft)\s*$/.exec(t.textContent);
      if (!m) continue;
      if (m[1] === "km" || m[1] === "mi") dist = m[1];
      else elev = m[1];
    }
    return { dist, elev };
  }

  // The filled elevation area: the widest path with a fill.
  function areaPath(svg) {
    let best = null;
    for (const p of svg.querySelectorAll("path")) {
      if (p.closest(`[${MARK}]`) || getComputedStyle(p).fill === "none") continue;
      const w = p.getBBox().width;
      if (!best || w > best.w) best = { p, w };
    }
    return best?.p;
  }

  // Shaded, numbered band per climb, drawn just before the elevation area so
  // the area, crosshair and tooltip all stay on top. Positioned in the area
  // path's own coordinates: its bbox spans the route's full distance.
  function drawBands(svg, data, climbs) {
    const area = areaPath(svg);
    if (!area) return;
    const box = area.getBBox();
    const span = data.distances[data.distances.length - 1] - data.distances[0];
    const sig = `${climbs.map((c) => `${c.start},${c.end}`).join(";")}|${box.x},${box.y},${box.width},${box.height}`;
    let g = svg.querySelector(`g[${MARK}="bands"]`);
    if (g && g.getAttribute("data-cg-sig") === sig && g.nextElementSibling === anchorFor(area, g.parentElement)) return;

    // Insert beside the area's top-level group inside the plot group.
    const plot = area.closest("svg > g") || svg;
    let anchor = area;
    while (anchor.parentElement && anchor.parentElement !== plot) anchor = anchor.parentElement;
    if (!g) {
      g = document.createElementNS(SVG_NS, "g");
      g.setAttribute(MARK, "bands");
      g.setAttribute("pointer-events", "none");
    }
    plot.insertBefore(g, anchor);
    const m = plot.getScreenCTM().inverse().multiply(area.getScreenCTM());
    g.setAttribute("transform", `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`);
    g.replaceChildren();
    const x = (d) => box.x + ((d - data.distances[0]) / span) * box.width;
    const top = Math.min(0, box.y);
    const bottom = box.y + box.height;
    for (const c of climbs) {
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("data-climb", c.n);
      r.setAttribute("x", x(c.start));
      r.setAttribute("width", Math.max(1, x(c.end) - x(c.start)));
      r.setAttribute("y", top);
      r.setAttribute("height", bottom - top);
      r.setAttribute("fill", BAND_FILL);
      r.setAttribute("fill-opacity", BAND_OPACITY);
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", (x(c.start) + x(c.end)) / 2);
      label.setAttribute("y", top + 11);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("font-size", "10");
      label.setAttribute("font-weight", "600");
      label.setAttribute("fill", BAND_FILL);
      label.textContent = c.n;
      g.append(r, label);
    }
    g.setAttribute("data-cg-sig", sig);
  }

  function anchorFor(area, plot) {
    let a = area;
    while (a.parentElement && a.parentElement !== plot) a = a.parentElement;
    return a;
  }

  // Emphasise one climb's band (hovered on the chart or in the table).
  function highlightBand(svg, n) {
    const g = svg?.querySelector(`g[${MARK}="bands"]`);
    if (!g) return;
    for (const r of g.querySelectorAll("rect")) {
      const want = String(n) === r.getAttribute("data-climb") ? BAND_OPACITY_HOT : BAND_OPACITY;
      if (r.getAttribute("fill-opacity") !== want) r.setAttribute("fill-opacity", want);
    }
  }

  // ---------- climbs toggle and table ----------

  // Climbs are opt-in: a small "Show climbs" checkbox, remembered in
  // localStorage so one choice covers activities, routes and the builder.
  const CLIMBS_KEY = "cumulative-gain:climbs";
  const climbsOn = () => localStorage.getItem(CLIMBS_KEY) === "on";

  function toggleControl() {
    let label = document.querySelector(`label[${MARK}="climbs-toggle"]`);
    if (!label) {
      label = document.createElement("label");
      label.setAttribute(MARK, "climbs-toggle");
      label.title = "Highlight climbs on the elevation chart";
      label.style.cssText =
        "display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #6d6d78; cursor: pointer; user-select: none;";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.id = "cumulative-gain-show-climbs";
      label.htmlFor = box.id;
      box.style.cssText = "margin: 0; cursor: pointer;";
      box.addEventListener("change", () => {
        localStorage.setItem(CLIMBS_KEY, box.checked ? "on" : "off");
        schedule();
      });
      label.append(box, "Show climbs");
    }
    const box = label.querySelector("input");
    if (box.checked !== climbsOn()) box.checked = climbsOn();
    return label;
  }

  // Where the checkbox (and, when on, the table) goes. Route page: above the
  // Segments section, with the table styled by cloning its classes. Activity
  // page: under the elevation chart, with Strava's own table classes.
  // Builder: the checkbox only, beside "Hide Elevation".
  function placeClimbs(svg) {
    if (routeId()) {
      const seg = [...document.querySelectorAll("h3")].find((h) => h.textContent.trim() === "Segments");
      if (seg) return { before: seg.parentElement, sectionClass: seg.parentElement.className, headClass: seg.className };
      const chart = svg.closest("div[class*='chart']") || svg.parentElement;
      return { after: chart, sectionClass: "", headClass: "" };
    }
    if (activityId()) {
      const profile = document.getElementById("elevation-profile");
      if (profile)
        return { after: profile, sectionClass: "", headClass: "", tableClass: "dense hoverable", pad: "0 20px" };
    }
    const expand = [...document.querySelectorAll("button")].find((b) =>
      /^(Hide|Show) Elevation$/.test(b.textContent.trim())
    );
    if (expand) return { beside: expand.parentElement };
    return null;
  }

  function renderClimbs(svg, climbs) {
    const place = placeClimbs(svg);
    if (!place) return;
    const toggle = toggleControl();

    if (place.beside) {
      if (toggle.nextElementSibling !== place.beside) {
        toggle.style.marginRight = "12px";
        place.beside.before(toggle);
      }
      return;
    }

    let wrap = document.querySelector(`div[${MARK}="climbs"]`);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.setAttribute(MARK, "climbs");
    }
    if (place.before ? wrap.nextElementSibling !== place.before : wrap.previousElementSibling !== place.after) {
      if (place.before) place.before.before(wrap);
      else place.after.after(wrap);
    }
    const line = wrap.querySelector(`div[${MARK}="climbs-line"]`) || document.createElement("div");
    if (!line.isConnected) {
      line.setAttribute(MARK, "climbs-line");
      line.style.cssText = `padding: ${place.pad || "0"}; margin: 8px 0;`;
      line.appendChild(toggle);
      wrap.prepend(line);
    } else if (toggle.parentElement !== line) line.appendChild(toggle);

    const units = chartUnits(svg);
    const on = climbsOn();
    const hasTime = climbs.some((c) => c.time > 0);
    const sig = JSON.stringify([on, units, hasTime, climbs.map((c) => [c.start, c.end, Math.round(c.gain)])]);
    if (wrap.getAttribute("data-cg-sig") === sig) return;
    wrap.setAttribute("data-cg-sig", sig);
    wrap.querySelector(`div[${MARK}="climbs-table"]`)?.remove();
    if (!on) return;

    const section = document.createElement("div");
    section.setAttribute(MARK, "climbs-table");
    section.className = place.sectionClass;
    if (place.pad) section.style.padding = `0 20px 20px`;
    const h = document.createElement("h3");
    h.className = place.headClass;
    h.id = "cumulative-gain-climbs-heading";
    h.textContent = "Climbs";
    const table = document.createElement("table");
    table.setAttribute("aria-labelledby", h.id);
    if (place.tableClass) table.className = place.tableClass;
    if (!place.sectionClass) table.style.width = "100%";
    const cols = ["#", "Start", "Length", "Gain", "Avg. Grade", "Max. Grade"];
    if (hasTime) cols.push("Time", "VAM");
    const head = table.createTHead().insertRow();
    for (const c of cols) head.appendChild(Object.assign(document.createElement("th"), { textContent: c, scope: "col" }));
    const body = table.createTBody();
    for (const c of climbs) {
      const row = body.insertRow();
      const cells = [
        c.n,
        formatDistance(c.start, units.dist, 1),
        formatDistance(c.length, units.dist, 2),
        formatElevation(c.gain, units.elev),
        formatGrade(c.avgGrade),
        formatGrade(c.maxGrade),
      ];
      if (hasTime) {
        cells.push(c.time > 0 ? formatDuration(c.time) : "–");
        cells.push(c.vam ? `${Math.round(units.elev === "ft" ? c.vam / 0.3048 : c.vam).toLocaleString()} ${units.elev}/h` : "–");
      }
      for (const v of cells) row.insertCell().textContent = v;
      row.addEventListener("mouseenter", () => highlightBand(svg, c.n));
      row.addEventListener("mouseleave", () => highlightBand(svg, null));
    }
    if (!climbs.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = cols.length;
      cell.textContent = "No climbs detected";
    }
    section.append(h, table);
    wrap.appendChild(section);
  }

  // ---------- activity splits ----------

  // The Splits table is too narrow for extra columns, so clicking the Elev
  // header switches that column between Strava's net value and "+gain/−loss"
  // for the split. The choice is remembered.
  const SPLITS_KEY = "cumulative-gain:splits";
  const splitsMode = () => (localStorage.getItem(SPLITS_KEY) === "gainloss" ? "gainloss" : "net");

  function renderSplits(data, gain, loss) {
    const table = document.querySelector("#splits-container table");
    const unitHead = table?.querySelector("thead th")?.textContent.trim().toLowerCase();
    if (!table || !(unitHead === "km" || unitHead === "mi")) return;
    const ths = [...table.querySelectorAll("thead th")];
    let col = ths.findIndex((th) => th.getAttribute(MARK) === "split-head");
    if (col < 0) col = ths.findIndex((th) => th.textContent.trim() === "Elev");
    if (col < 0) return;
    const mode = splitsMode();

    // A real button inside the header, so the toggle works from the keyboard
    // and screen readers announce it (a clickable <th> is neither).
    const th = ths[col];
    let btn = th.querySelector(`button[${MARK}="split-toggle"]`);
    if (!btn) {
      th.setAttribute(MARK, "split-head");
      th.style.whiteSpace = "nowrap";
      btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute(MARK, "split-toggle");
      btn.title = "Switch between net elevation and gain / loss for each split";
      // Look like the header text, but keep the browser's focus ring.
      btn.style.cssText = "background: none; border: 0; padding: 0; font: inherit; color: inherit; cursor: pointer;";
      btn.addEventListener("click", () => {
        localStorage.setItem(SPLITS_KEY, splitsMode() === "net" ? "gainloss" : "net");
        schedule();
      });
      th.replaceChildren(btn);
    }
    if (btn.getAttribute("data-cg-mode") !== mode) {
      // Short visible label (the column is ~60 px wide); fuller text for
      // screen readers. The accessible name stays the same and aria-pressed
      // carries the state.
      const shown = document.createElement("span");
      shown.setAttribute("aria-hidden", "true");
      shown.textContent = mode === "net" ? "Elev ⇅" : "+/− ⇅";
      const sr = document.createElement("span");
      sr.style.cssText =
        "position: absolute; clip-path: inset(50%); width: 1px; height: 1px; overflow: hidden; white-space: nowrap; margin: -1px; padding: 0; border: 0;";
      sr.textContent = "Show gain and loss per split";
      btn.replaceChildren(shown, sr);
      btn.setAttribute("aria-pressed", String(mode === "gainloss"));
      btn.setAttribute("data-cg-mode", mode);
    }

    const step = TO_METRES[unitHead];
    const end = data.distances[data.distances.length - 1];
    [...table.tBodies[0].rows].forEach((row, i) => {
      const cell = row.cells[col];
      if (!cell) return;
      // Keep Strava's own markup so "net" mode restores it exactly.
      if (!cell.hasAttribute("data-cg-net")) cell.setAttribute("data-cg-net", cell.innerHTML);
      const net = cell.getAttribute("data-cg-net");
      let html = net;
      if (mode === "gainloss") {
        const ft = /feet|\bft\b/.test(net);
        const fmt = (m) => Math.round(ft ? m / 0.3048 : m);
        const a = i * step;
        const b = Math.min((i + 1) * step, end);
        html = `+${fmt(gain.at(b) - gain.at(a))}/−${fmt(loss.at(b) - loss.at(a))}`;
      }
      if (cell.getAttribute("data-cg-html") !== html) {
        cell.innerHTML = html;
        cell.style.whiteSpace = "nowrap";
        cell.setAttribute("data-cg-html", html);
      }
    });
  }

  // Bands, table and splits for every profile chart on the page.
  function decorate() {
    for (const svg of document.querySelectorAll("svg")) {
      const r = svg.getBoundingClientRect();
      if (r.width < 300 || svg.closest(`[${MARK}]`)) continue;
      const data = dataFor(svg);
      if (!data) continue;
      const { gain, loss, climbs } = profilesFor(data);
      if (climbsOn()) drawBands(svg, data, climbs);
      else svg.querySelector(`g[${MARK}="bands"]`)?.remove();
      renderClimbs(svg, climbs);
      if (data === fetched && activityId()) renderSplits(data, gain, loss);
    }
  }

  // ---------- wiring ----------

  // Coalesce bursts of mutations into one pass per frame. Our own writes cause
  // one extra pass, which is a no-op because every write is idempotent.
  let scheduled = false;
  function scan() {
    scheduled = false;
    ensureFetched();
    try {
      decorate();
    } catch (e) {
      log(e);
    }
    for (const tip of findTooltips(document.body)) {
      try {
        render(tip);
      } catch (e) {
        log(e);
      }
    }
  }
  function schedule() {
    if (scheduled || !document.body) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  function start() {
    ensureFetched();
    new MutationObserver(schedule).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["transform", "display", "x1"],
    });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);

  window.__cumulativeGain = { fromReact, fromNextData, findPageTotal, get fetched() { return fetched; } };
})();
