# NewsBreak teardown (App Store id 1132762804)

Source: Apple's public App Store listing and its published screenshots (2026-10-29). The iOS binary was not downloaded or decompiled; this is a product teardown, not a code analysis.

## What it is
- **NewsBreak** (`com.particlenews.newsbreak`), free, 17+, iOS 15+, about 205 MB, English and Spanish. 1.39M ratings, 4.78 average. Billed as "the #1 local news app", 45M+ users claimed.
- **Seller:** Particle Media. Site: newsbreak.com.

## How it is organised (from the listing and screenshots)
| Layer | What the user gets |
|---|---|
| Local first | Everything keys off the reader's location: daily local briefing, weather, traffic, events, live local channels. |
| Map surfaces | A neighbourhood **crime map** (filters: category, risk, 14 days), a **gas price heat map** with a station card, free food, missing persons. Search box takes an address or zip. |
| Feed | A personalised feed from 10,000+ sources, with likes, dislikes and blocked topics, plus customised alerts. |
| Community | Posts from local writers and neighbours, follow buttons, comments, upvotes, "write a comment" bar. |
| Navigation | Bottom tab bar: Nearby (refresh), Video, a centre "+" to post, Notifications, Me. |
| Mission copy | "Small news makes a big difference"; supports small publishers. |

## What maps onto NouGenNews today
- We already have a **city** setting and weather in the corner. NewsBreak's spine (everything keyed to where you are) is the piece we are closest to.
- We have **library-aware ranking**; NewsBreak has **like/dislike/block-topic** personalisation. Same slot, different signal.
- **Breaking ticker**, sections and the hero already cover its "daily highlights".

## What it has that we do not
1. A **Local** section: stories about the reader's city.
2. **Follow / block topics** (cheap to add, and it improves ranking).
3. **Alerts** for followed topics or library titles.
4. A **Video** tab (we only play video inside stories).
5. Map layers and community posting. Out of scope for a newspaper app; do not copy.

## Cheapest high-value steps
1. **Local section** from the city setting using Google News RSS, e.g. `https://news.google.com/rss/headlines/section/geo/<City>` (public, no key), fetched through the existing `rss_raw_fetch`. A new print section "Near you" with the same card layout.
2. **Block / follow topic** buttons on a story (tag chips already exist) stored locally, applied in `core/edition.js` scoring.
3. **Desktop notification** when a followed topic or a library title breaks (Electron `Notification`).

## Notes
- The link given was a Google Ads click tracker that redirected to the App Store listing. It was not opened (it would record an ad click); the listing was read through Apple's public lookup API.
- Nothing here copies NewsBreak's code, copy or screenshots into the app.
