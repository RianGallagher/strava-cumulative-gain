# Chrome Web Store Listing — Cumulative Elevation for Strava

> Last Updated: 2026-11-02

Single source of truth for the Developer Dashboard. Copy each field across.
Not included in the upload zip.

## Store Listing

**Extension Name** — Cumulative Elevation for Strava
<!-- matches manifest.json "name" (31 chars) -->

**Short Description** (manifest `description`, 120/132 chars)
See elevation gained and lost so far as you hover Strava's elevation charts on activities, routes and the route builder.

**Detailed Description** (plain text — the store strips markdown)

```
Adds elevation gained and lost so far to the tooltip on Strava's elevation charts.

Strava's elevation chart shows how high you are at each point, not how much you've climbed to get there. Hover the chart on an activity, a saved route or the route builder and this extension adds two rows to Strava's own tooltip:

FEATURES
• Gain — elevation gained from the start to the point you're hovering
• Loss — elevation lost from the start to that point
• Matches Strava's numbers — the value at the finish equals the elevation gain Strava shows for the route or activity
• Route builder — updates live as you edit a route
• Split gain and loss — in an activity's Splits table, switch the Elev column between Strava's net figure and the gain and loss for each kilometre or mile, so a "0 m" split that went 26 m up and 26 m down shows it
• Climbs (optional) — highlights each climb on the chart, shows which climb you're on in the tooltip, and lists climbs with length, gain, average and maximum grade, plus your time and climbing rate on activities

HOW TO USE
1. Open any activity, saved route or the route builder on strava.com.
2. Hover the elevation chart. Gain and Loss appear in the tooltip.
3. On an activity, click "Elev" at the top of the Splits table to switch between net elevation and gain/loss.
4. To see climbs, tick "Show climbs" under the elevation chart (beside "Hide Elevation" in the route builder). Your choice is remembered.

LANGUAGE
Works with Strava set to English. Other languages aren't supported yet.

PRIVACY
Everything is calculated in your browser. The extension has no servers, accounts, analytics or tracking, and never sends your data anywhere. It remembers only two display settings (Show climbs, and the Splits view) on your computer.

PERMISSIONS
"Read and change your data on www.strava.com" — needed to read the elevation data behind Strava's charts and add the gain, loss and climb details to them. The extension runs on strava.com only and asks for no other permissions.

SUPPORT
Questions or bugs: CONTACT_EMAIL, or open an issue at https://github.com/RianGallagher/strava-cumulative-gain/issues

Not affiliated with or endorsed by Strava, Inc. Strava is a trademark of Strava, Inc.

Version 1.0.0 — first release.
```

**Category** — Sports, if the dashboard offers it; otherwise Lifestyle → Well-being.
<!-- The skill's template lists "Sports"; Google's newer taxonomy files sports
     under Lifestyle. Pick whichever the dashboard shows. -->

**Single Purpose**
Adds cumulative elevation gain and loss to the elevation charts and splits on Strava's website.

**Primary Language** — English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1 | 1280×800 | ✅ Ready | `store/images/screenshot-1-tooltip.png` |
| Screenshot 2 | 1280×800 | ✅ Ready | `store/images/screenshot-2-climbs.png` |
| Screenshot 3 | 1280×800 | 🟡 Needs update | `store/images/screenshot-3-splits.png` |
| Screenshot 4 | 1280×800 | ✅ Ready | `store/images/screenshot-4-builder.png` |
| Screenshot 5 | 1280×800 | ⬜ Not created | — |
| Small Promo Tile | 440×280 | ✅ Ready | `store/images/promo-small.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created (optional) | — |

### Screenshot Notes
1. Route chart tooltip with Gain and Loss (climbs off) — the base feature.
2. Same chart with "Show climbs" ticked: numbered bands, climb row, Climbs table.
3. Activity Splits in gain/loss view next to the activity tooltip. Needs a
   re-capture: the Elev header is now a button (looks the same, but recapture
   after reloading 1.0.0 to be sure it matches).
4. Route builder stats bar and chart with "Show climbs" ticked.

Captures are cropped to Strava's charts and tables only: no names, avatars,
comments or maps. Regenerate with `python scripts/make_store_images.py`.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `https://www.strava.com/*` | content_scripts match (shown as host access) | Reads the elevation profile behind Strava's elevation charts (activities, saved routes, route builder) and adds gain, loss and optional climb details to the chart's tooltip, the chart itself and the activity Splits table. Limited to www.strava.com; no other sites. |

No entries in `permissions` or `host_permissions`. The content script runs in
the page's context so it can read the route builder's in-memory profile,
which is never saved anywhere it could be requested from.

**Remote code:** No. All JavaScript ships in the package; nothing is fetched
and executed.

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No — nothing leaves the browser.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | Processed locally only | No | Route GPS points (fallback only) → distance along the route | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | Processed locally only | No | Elevation, distance and time behind Strava's charts → gain/loss | No |

Recommended dashboard answer: tick no data types, since none is collected or
transmitted. The cautious alternative — tick Location and Website content and
describe them as processed locally — is also accurate. Keep the privacy policy
consistent with whichever you choose (it already describes the local
processing).

Network requests: only to `www.strava.com`, with the user's existing session:
the activity's distance/altitude/time streams, and a route's GPX as a fallback.
No `chrome.storage.sync` (nothing goes to Google's servers).

Stored: two keys in strava.com's local storage — `cumulative-gain:climbs` and
`cumulative-gain:splits`.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** — https://github.com/RianGallagher/strava-cumulative-gain/blob/main/PRIVACY.md
(live once the repo is public and `CONTACT_EMAIL` is replaced; open it in a
private window before submitting).

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name** — Rian Gallagher
**Contact Email** — ⬜ `CONTACT_EMAIL`: a dedicated address for this extension, not a personal inbox (shown publicly; must be monitored)
**Support URL** — https://github.com/RianGallagher/strava-cumulative-gain/issues
**Homepage URL** — https://github.com/RianGallagher/strava-cumulative-gain

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-10-11 | First release: gain/loss tooltip rows, split gain/loss toggle, optional climbs | Draft |

1.0.0 is still unpublished, so it stays 1.0.0 after the 2026-10-25 engineering
pass: the content script is now `build/content.js`, bundled from the
TypeScript sources (run `npm run package`; the zip holds the manifest, the
bundle and the icons). Behaviour is unchanged apart from fixes: route data
falls back to the embedded page data, then GPX, when the chart's data can't
be read; failed loads retry; malformed activity streams are ignored; a
headline total that appears late is picked up; the top of every climb is now
counted (gain no longer falls short by up to the 1 m threshold at each summit
before it is scaled to Strava's total); and after a client-side navigation
only the new page's data is shown.

## Review Notes

### Known Issues / Limitations
- English only. The tooltip is found by its English labels (Dist, Elev,
  Grade) and the activity total by "Elevation", so with Strava set to another
  language the extension adds nothing. Stated in the description.
- Depends on how Strava builds its pages; a Strava redesign can break it until
  updated. Tooltips are found by their text rather than class names, which
  survives most changes; each page's layout relies on a few element IDs and
  labels, all kept in that page's adapter.
- Climb detection is tuned on a few running routes and activities; unusual
  profiles may split or merge climbs differently from what a rider expects.
- The two settings live in strava.com's local storage, so clearing strava.com
  site data resets them, and they remain (harmlessly) after uninstalling until
  site data is cleared.
- Name and screenshots reference Strava (the "X for Strava" pattern, with a
  non-affiliation notice). The icon avoids Strava's logo and orange. If review
  raises trademark concerns, this is the area to revisit.

### Rejection History
None yet.
