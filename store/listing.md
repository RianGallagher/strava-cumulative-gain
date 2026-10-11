# Chrome Web Store listing — Cumulative Elevation for Strava

Copy these into the Developer Dashboard. Images are in `store/images/`.

## Store listing tab

**Name** (from the manifest): Cumulative Elevation for Strava

**Summary** (from the manifest description, 132 chars max):
See elevation gained and lost so far as you hover Strava's elevation charts on activities, routes and the route builder.

**Category:** Lifestyle → Well-being _(alternative: Make Chrome Yours → Functionality & UI)_

**Language:** English

**Description:**

How much climbing is left? Strava's elevation chart tells you how high you
are, not how much you've climbed to get there. This extension adds it.

Hover the elevation chart on any activity, saved route or the route builder
and the tooltip shows:

• Gain — elevation gained from the start to that point
• Loss — elevation lost from the start to that point

The numbers line up with Strava's own: on routes they're pinned to the
elevation gain Strava calculates for each section, and on activities they're
scaled to the activity's total, so the value at the finish always matches the
figure Strava shows. In the route builder it updates live as you edit.

Splits: click the "Elev" header in an activity's Splits table to switch between
Strava's net elevation and gain/loss for each kilometre or mile. A flat-looking
"0 m" split can hide 26 m up and 26 m down.

Climbs (optional): tick "Show climbs" to highlight each climb on the chart, see
which climb you're on in the tooltip, and get a table of climbs with length,
gain, average and maximum grade — plus your time and VAM on activities.

Private by design: everything is calculated in your browser. No accounts, no
servers, no analytics. The extension only runs on strava.com and requests no
browser permissions.

Not affiliated with or endorsed by Strava, Inc. Strava is a trademark of
Strava, Inc.

**Graphic assets:**
- Store icon: `icons/icon128.png`
- Screenshots (1280×800): `store/images/screenshot-*.png`
- Small promo tile (440×280): `store/images/promo-small.png`

## Privacy practices tab

**Single purpose description:**
Adds cumulative elevation gain and loss (and optional climb details) to the
elevation charts and splits on Strava's website.

**Permission justification — host access to https://www.strava.com/\*:**
The extension only enhances Strava's elevation-profile charts and activity
splits table, so it needs to run on www.strava.com and nowhere else. It reads
the elevation data behind the chart and adds rows to the chart's tooltip. It
requests no other permissions.

**Remote code:** No, I am not using remote code. (All JavaScript ships in the
package; nothing is fetched and executed.)

**Data usage:** The extension does not collect or transmit user data — all
processing happens locally and nothing leaves the browser. Recommended:
leave every data-type box unticked and tick all three certifications.

> Judgement call: Google's form is about data the extension *collects*. The
> extension does read activity data (distance, altitude, time; route GPS points
> as a fallback) from Strava, but only to compute numbers on-screen; it is
> never sent anywhere. If you'd rather be conservative, tick "Location" and
> "Website content" and describe them as processed locally only — that is also
> accurate. Either way the privacy policy below covers it.

**Privacy policy URL:** a public link to `PRIVACY.md`. Before publishing,
replace `CONTACT_EMAIL` in it with the address you want shown publicly.
Hosting options:
- Make the GitHub repo public and use
  `https://github.com/RianGallagher/strava-cumulative-gain/blob/main/PRIVACY.md`
- Or keep the repo private and publish the text as a GitHub Gist, a GitHub
  Pages site, or any page you control.

## Distribution tab

- Visibility: Public
- Regions: All regions
- Pricing: Free
