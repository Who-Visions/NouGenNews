# Brief: elevate the NouGenNews Weather page

You are the builder in the NouGen build chain: NouGenDesign (rules) -> Stitch (screens) -> you (build, in your own worktree) -> the coach reviews and ships. Work ONLY in this worktree (`C:\Users\super\Outpost\NouGenNews-wt-weather`, branch `feat/weather-elevate`). Never touch `C:\Users\super\Outpost\NouGenNews` (the live checkout) or any other repository.

## What exists
An Electron + Vite/React desktop news reader. The **Weather tab** was built tonight and works: `renderer/components/WeatherPage.jsx` (+ `WeatherPage.css`), `WeatherGlobe.jsx` (a CesiumJS globe in an isolated iframe, `renderer/public/globe.html` + `globe.js`, driven by postMessage), `renderer/lib/moon.js`. Data comes from `invoke("weather_report", { city, region })` and has exactly this shape (the contract; do not change the main process):

```
{ place, region, timezone, updated ("2026-10-30T04:15" the place's own clock), lat, lon,
  now:   { temp_f, feels_f, humidity, wind_mph, gust_mph, wind_dir (deg), pressure_in, cloud, dew_f, visibility_mi, uv, precip_in, code, label, is_day },
  today: (same object as days[0]),
  hours: [48 x { time, temp_f, precip_chance|null, code, label, is_day }],
  days:  [16 x { date, code, label, high_f, low_f, precip_chance|null, precip_in, wind_mph, uv_max, sunrise, sunset }],
  air:   { aqi, category, pm25 } | null,
  alerts:[ { event, headline, severity, urgency, areas, effective, expires, description, instruction } ],   // may be empty
  marine:{ wave_ft, swell_ft, swell_dir, swell_period_s, water_f } | null }
```
Times are the place's local clock as text; never convert them with this computer's zone. The corner clock/city comes from `loadCity()/loadRegion()` in `CornerClock.jsx`.

## Design authority (binding)
`C:\Users\super\Outpost\NouGen\designs\nougen-core\DESIGN.md` (+ `tokens.css`, `design.json`): matte instrument surfaces, opaque graphite, fine dividers, one amber accent, 14px body, tabular numbers. It REJECTS decorative gradients, glass, glow, giant pills, sparkles, waveform noise and generic SaaS card grids. Reference world: precision instrument, editorial technical publishing, broadcast control room.
The current page breaks these rules in places (a gradient on the day-range bars, `backdrop-filter` on the globe control bar, rounded-card grid everywhere). Fix them. Use the existing CSS variables from the app (`--nn-*`, and the `--status-*` colours for alert severity).

## Step 1: screens with Stitch (MCP server `stitch`, enabled for you)
Stitch project `4470908506581891071` ("NouGen Desktop Capability Cockpit") already holds the nougen-core design system (asset `6d002aabfa2747218cd08955cc4f8974`). REUSE that design system for every screen; do not create a new one. Generate, with one shared brand prompt plus one prompt per screen: (a) the Weather page, wide desktop 1440; (b) the same with an active severe-weather alert; (c) a 900px-wide layout. Record the Stitch screen ids/urls and your prompts in `docs/weather-elevate/stitch.md`. Use Stitch for composition and hierarchy ideas, then RE-IMPLEMENT in React with the repo's tokens: do not paste foreign markup, fonts or images in.
If Stitch auth fails: the operator's notes say `stitch_mcp_bridge.py` falls back to gcloud OAuth (`STITCH_GCLOUD_ACCOUNT`, `STITCH_QUOTA_PROJECT=gen-lang-client-0939852539`) if present on this machine. Try at most twice. If Stitch stays unavailable, continue with the nougen-core rules alone and SAY SO in your report. Never ask for or print a key.

## Step 2: what "elevate" means (build these)
1. **A plain-English summary line** at the top, computed deterministically from the data (pure function in `renderer/lib/`, with `node:test` tests): e.g. "Warm and humid, 77°F now. Rain likely after 2 PM (60%). High of 84 around 3 PM. UV peaks at 8." Never invented, never from a model.
2. **"What matters today"**: next rain (hour and chance), best hours outside (dry, comfortable), peak UV window, wind peak. All derived from `hours`/`days`.
3. **Sun arc**: an SVG arc with the sun's current position between sunrise and sunset, daylight remaining, and the moon glyph/phase beside it.
4. **Wind**: a small compass with direction and gusts. Pressure and visibility stay as plain readouts.
5. **Hourly**: day separators, icon row, a readout that follows pointer AND keyboard focus (arrow keys), flat colours only.
6. **16 days**: group by week, today highlighted, rain amount, a compact high/low range bar in a single flat colour.
7. **Radar legend** and clearer frame time/“forecast” labelling on the globe bar. Keep the postMessage protocol between `WeatherGlobe.jsx` and `globe.js` exactly as is; you may restyle the bar.
8. **States**: flat loading skeletons, an error state with a Retry button, an alert-active layout (severity via `--status-*` tokens, full text readable), an "offline: the globe is unavailable" note that leaves the rest of the page working.
9. **Quality bar**: layouts verified at 1440, 1100 and 900 px wide; `:focus-visible` on everything interactive; `prefers-reduced-motion` honoured; text contrast AA (compute it, do not eyeball); `tabular-nums` on numbers; no horizontal page scroll at any width.
Keep the existing keys: **R** refresh, **Esc/W/N** back to news. Keep the credits line (Open-Meteo CC BY 4.0, RainViewer, Cesium, WeatherAPI.com).

## Hard boundaries
- Do NOT edit: `electron/*`, `scripts/*`, `renderer/index.html`, `renderer/public/globe.html` or `globe.js` (security policy and the isolated globe page), `vite.config.mjs`, `package.json`/lockfile (no new dependencies; if you believe one is needed, say so in the report instead). You may edit `renderer/components/Weather*.jsx|css`, add files under `renderer/components/weather/` and `renderer/lib/`, and add tests.
- Never print, copy or log a secret. You do not need any key. No network calls from the page except through the existing `invoke(...)` handlers.
- Repo and app text never carries a personal name; say "the reader" or "the operator".
- Do NOT kill, restart or interfere with other `electron.exe` processes: the operator's live app is running. Only ever stop a process whose command line contains `nn-wx-elevate`.
- Git: work on `feat/weather-elevate`; stage specific paths only (never `git add -A`, never `commit -a`, never stash); commit in logical steps. Do NOT push, merge, open a PR or switch branches.

## Verification (required, with screenshots)
1. `npm test` and `npm run build` must pass (currently 212 tests; add yours).
2. Start a test copy of the app: `Start-Process conhost.exe -ArgumentList '--headless','node','scripts/start.cjs','--remote-debugging-port=9444','--user-data-dir=C:\Users\super\AppData\Local\Temp\nn-wx-elevate' -WorkingDirectory <this worktree> -WindowStyle Hidden`. (Always launch through `scripts/start.cjs`: it loads the API keys; launching electron.exe directly gives a keyless app.) Drive it over the Chrome DevTools Protocol (Node's global `WebSocket`; fetch `http://127.0.0.1:9444/json`): set the viewport with `Emulation.setDeviceMetricsOverride`, click the "Weather" tab (`.menubar__tab`), wait for `.wp-title` and the globe bar, then `Page.captureScreenshot`. To submit forms click the button; do not send Enter through `Input.dispatchKeyEvent` with a `text` field.
3. Save screenshots at 1440x900, 1100x800 and 900x800 (top, middle and bottom of the page, plus an alert-active state if you can force one by stubbing `weather_report` in the page) to `docs/weather-elevate/shots/`. Collect console errors and CSP violations (`Runtime.enable`, `Log.enable`): the count must be zero.
4. Stop only your own test copy when done.

## Report (your final message)
What changed (files), the Stitch screen ids (or why not), test count, screenshot paths, contrast numbers, and anything unfinished or uncertain. Be exact; say what you did not verify.
