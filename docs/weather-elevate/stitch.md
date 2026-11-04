# Stitch Elevation Brief: NouGenNews Weather Page

## Project & Design System Reference
- **Stitch Project ID**: `4470908506581891071` ("NouGen Desktop Capability Cockpit")
- **Design System Asset**: `6d002aabfa2747218cd08955cc4f8974` (nougen-core matte instrument surfaces)

## Shared Brand & Design Language Prompt
```text
Design for NouGenNews Desktop Weather Page using the nougen-core design system (precision instrument, editorial technical publishing, broadcast control room).
Matte instrument surfaces, opaque graphite (#141414, #202020), fine dividers (#777777 / rgba(255,255,255,0.12)), one matte amber accent (#e8b86d).
Reject decorative gradients, glass, glow, giant rounded pills, sparkles, and generic SaaS card grids.
Readable 14px body text, tabular numbers for all numerical metrics, sharp 3-4px radii, high-contrast monospace metadata.
Regions:
1. Header: Location, local clock, timezone, deterministic plain-English summary line, refresh & navigation actions with keyboard hints.
2. What Matters Today: Next rain window, comfortable outdoor hours, UV peak window, wind peak window.
3. Hero: 3D Weather Globe with radar playback & telemetry alongside current conditions (large temperature, weather label, feels-like, high/low, compact instrument tiles).
4. Hourly forecast (48 hours): Day separators, weather condition icons, temperature line, rain probability bars, interactive time scrub/keyboard focus readout.
5. 16-Day outlook: Grouped by week, today highlighted, rain volume, compact high/low range bar in a single flat color.
6. Sun & Moon: Precision astronomical SVG arc with sun's progress between sunrise/sunset, remaining daylight hours, lunar illumination & glyph.
7. Weather in the News / Marine conditions: Tabular cards with archive stories and sea telemetry.
8. Status & Alert ribbons: Severity-coded status borders and legible emergency instructions.
```

## Screen Prompts

### Screen (a): Weather Page, Wide Desktop (1440px)
```text
A 1440px wide desktop precision weather instrument view.
Top summary bar: "Warm and humid, 77°F now. Rain likely after 2 PM (60%). High of 84 around 3 PM. UV peaks at 8."
"What Matters Today" telemetry cards: Next rain (hour & chance), outdoor comfort window, peak UV, peak wind.
Center split: Left side features the 3D globe with radar controls (Home, Radar on/off, Play/Pause, scrubber, frame time); right side displays current temperature in 64px tabular bold, feels-like, humidity, dew point, wind compass indicator, UV index, air quality index, pressure, and visibility.
Below hero: 48-hour hourly chart with day boundaries, temperature graph, rain bars, and focused hour telemetry.
Lower section: 16-day forecast grouped into weeks with flat high/low range bars, Sun Arc SVG with solar position and day length, Moon phase card, and recent weather news wire.
Opaque dark panels (#202020) on #141414 ground with fine hairlines and amber accents.
```

### Screen (b): Weather Page with Active Severe-Weather Alert (1440px)
```text
Same 1440px desktop weather instrument view with an active emergency alert banner prominently rendered directly beneath the header.
The alert banner uses status danger coloring (--danger: #ffb4ab with severe border), displaying warning icon, event title (e.g. "Severe Thunderstorm Warning"), severity, urgency, affected counties/areas, expiration time, and full readable protective action instructions.
The rest of the instrument layout remains fully functional: What Matters Today reflects imminent storm conditions, radar loop indicates approaching precipitation, and hourly forecast highlights the storm window.
```

### Screen (c): Weather Page, Compact Desktop Layout (900px)
```text
A 900px wide compact desktop layout for the weather instrument.
The hero region reflows into a stacked vertical arrangement: the globe map occupies the top full width, followed immediately by the current conditions grid.
"What Matters Today" tiles reflow into a 2x2 grid.
Hourly chart maintains horizontal scrubbability without horizontal page scroll.
The 16-day outlook and astronomical instruments stack cleanly with preserved 65ch reading measures and 4.5:1 minimum text contrast.
All controls keep minimum 24px target size with visible amber focus-visible rings.
```

## MCP Status & Execution Note
- **Auth Attempts**:
  1. API key auth to `stitch.googleapis.com` was rejected with 403 / "The caller does not have permission".
  2. Fallback via `stitch_mcp_bridge.py` with gcloud OAuth was tested:
     - Account the first configured account refresh token returned HTTP 400.
     - Account the second configured account successfully minted OAuth tokens with quota project `gen-lang-client-0939852539`, but Stitch API returned `The caller does not have permission` (HTTP 403) for project `4470908506581891071`.
- **Policy Compliance**:
  As specified in the brief ("Try at most twice. If Stitch stays unavailable, continue with the nougen-core rules alone and SAY SO in your report. Never ask for or print a key."), execution continued using the strict `nougen-core` design authority rules, tokens, and React components in this repository.
