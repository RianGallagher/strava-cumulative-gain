// Runs in the page's MAIN world so it can read the props React passes to
// Strava's route chart (the route builder keeps its profile only in memory).
(function () {
  const { buildProfile, cumulativeDistance, legAnchors } = window.CumGain;
  const { TO_METRES, parseDistance, parseElevationUnit, isProfileTooltip, formatGain } =
    window.CumGainParse;

  const DEBUG = localStorage.getItem("cumgain:debug") === "1";
  const log = (...a) => DEBUG && console.log("[cumgain]", ...a);
  const MARK = "data-cumgain";
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
    const url = `/activities/${id}/streams?stream_types[]=distance&stream_types[]=altitude`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const json = await res.json();
    return isNums(json.distance) ? { distances: json.distance, elevations: json.altitude } : null;
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
    const p = a ? fromStreams(a) : r ? Promise.resolve(nextData()).then((d) => d || fromGpx(r)) : null;
    p?.then((d) => {
      if (fetchedFor !== path || !d) return;
      fetched = d;
      log("loaded", d.distances.length, "points");
      schedule();
    }).catch((e) => log(e));
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

  // Profiles are cached per source array, so the builder rebuilds only when
  // React hands the chart a new route.
  const cache = new WeakMap();
  function profileFor(data) {
    const key = data.key || data.elevations;
    let p = cache.get(key);
    if (!p) {
      const span = data.distances[data.distances.length - 1];
      const anchors = data.legs && legAnchors(data.legs, span);
      const total = anchors ? undefined : data.total ?? findPageTotal();
      p = buildProfile(data.distances, data.elevations, { threshold: THRESHOLD_M, anchors, total });
      log("profile", data.distances.length, "points", anchors ? `${anchors.length} anchors` : `total ${total}`);
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

  function relabel(node, value) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let labelled = false;
    let valued = false;
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      let s = t.nodeValue;
      if (!labelled && /Elev(ation)?/.test(s)) {
        s = s.replace(/Elev(ation)?/, "Gain");
        labelled = true;
      }
      if (!valued && /\d/.test(s)) {
        // Keep the unit only if this text node had one, so "95" + "m" in
        // separate nodes doesn't become "134 m m".
        s = s.replace(/-?\d[\d,.]*(\s*(?:m|ft)\b)?/, (_, u) => (u ? value : value.split(" ")[0]));
        valued = true;
      }
      t.nodeValue = s;
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

  // Insert a real "Gain" row under Elevation: push the rows below it down a
  // line and grow the background box to fit.
  function renderSvg(tip, elevRow, value) {
    const rows = [...tip.querySelectorAll("text")].filter(
      (t) => !t.hasAttribute(MARK) && t.getAttribute("display") !== "none" && t.textContent.trim()
    );
    const ys = rows.map(baseY);
    const elevY = baseY(elevRow);
    const step = ys.length > 1 ? Math.abs(ys[1] - ys[0]) : 16;

    let row = tip.querySelector(`text[${MARK}]`);
    if (!row) {
      row = elevRow.cloneNode(true);
      row.removeAttribute("id");
      for (const a of [...row.attributes]) if (a.name.startsWith("data-cg-")) row.removeAttribute(a.name);
      // Appended last: inserting between React/D3-managed rows can upset them.
      tip.appendChild(row);
    }
    // Clone of the live elevation row each time keeps the font/attrs in sync.
    const attr = rowAttr(elevRow);
    const src = elevRow.getAttribute(`data-cg-${attr}`) === elevRow.getAttribute(attr)
      ? elevRow.getAttribute(`data-cg-base-${attr}`)
      : elevRow.getAttribute(attr);
    const pos =
      attr === "y"
        ? String(elevY + step)
        : src.replace(TRANSLATE, (_, x) => `translate(${x}, ${elevY + step})`);
    if (row.getAttribute(attr) !== pos) row.setAttribute(attr, pos);
    // The activity chart hides every <text> on mouseleave but only re-shows its
    // own rows, so mirror the Elevation row's visibility.
    const display = elevRow.getAttribute("display");
    if (display !== null && row.getAttribute("display") !== display) row.setAttribute("display", display);
    if (row.getAttribute(MARK) !== value) {
      row.textContent = "";
      for (const c of elevRow.childNodes) row.appendChild(c.cloneNode(true));
      relabel(row, value);
      row.setAttribute(MARK, value);
    }

    rows.forEach((r, i) => {
      if (ys[i] > elevY) shiftRow(r, step);
    });

    const rect = tip.querySelector("rect");
    if (rect) {
      setFromBase(rect, "height", (h) => parseFloat(h) + step);
      const rowX = (r) =>
        r.hasAttribute("x") ? parseFloat(r.getAttribute("x")) : parseFloat(TRANSLATE.exec(r.getAttribute("transform") || "")?.[1] ?? 0);
      const pad = rowX(elevRow) - parseFloat(rect.getAttribute("x") || 0);
      const need = Math.max(...[...rows, row].map((t) => t.getBBox().width)) + pad * 2;
      setFromBase(rect, "width", (w) => Math.max(parseFloat(w), Math.ceil(need)));
    }
  }

  function renderHtml(tip, elevRow, value) {
    let row = tip.querySelector(`[${MARK}]`);
    if (!row) {
      row = elevRow.cloneNode(true);
      elevRow.after(row);
    } else if (row.getAttribute(MARK) === value) return;
    row.replaceChildren(...[...elevRow.childNodes].map((c) => c.cloneNode(true)));
    relabel(row, value);
    row.setAttribute(MARK, value);
  }

  function render(tip) {
    const svg = tip.ownerSVGElement || tip.closest("svg") || tip.parentElement?.querySelector("svg");
    let data = svg && fromReact(svg);
    // On the route page the chart's ancestors don't hold the legs; the
    // embedded page data does, along with Strava's total.
    if (data && !data.legs && routeId()) {
      const nd = nextData();
      if (nd) data = { ...data, legs: nd.legs, total: nd.total };
    }
    data = data || fetched;
    if (!data) return;
    const text = tip.textContent;
    const shown = parseDistance(text);
    const unit = parseElevationUnit(text);
    if (!shown || !unit) return;
    const elevRow = findElevRow(tip);
    if (!elevRow) return;

    const d = (svg && crosshairDistance(svg, tip, shown)) ?? shown.metres;
    const value = formatGain(profileFor(data).at(d), unit);
    if (elevRow instanceof SVGElement) renderSvg(tip, elevRow.closest("text") || elevRow, value);
    else renderHtml(tip, elevRow, value);
  }

  // ---------- wiring ----------

  // Coalesce bursts of mutations into one pass per frame. Our own writes cause
  // one extra pass, which is a no-op because every write is idempotent.
  let scheduled = false;
  function scan() {
    scheduled = false;
    ensureFetched();
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

  window.__cumgain = { fromReact, fromNextData, findPageTotal, get fetched() { return fetched; } };
})();
