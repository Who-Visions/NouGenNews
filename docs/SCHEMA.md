# News item schema, version 2

Every NouGen News surface (this app, the nougenai.com site, the AI news engine, the `nougen-news` MCP worker) reads and
writes one story shape. Version 2 adds credit and picture detail. It is **additive**: every v1 field is still written,
with the same meaning, so an older reader keeps working on a v2 item. Code: `core/schema.js` (`toNewsItem`) and
`core/credits.js`. Machine-readable contract: `schema/news-item.v2.json`.

## Credit rules

1. **Authors** are only the people the source names: every `dc:creator`, RSS `<author>`, Atom `<author>`,
   `itunes:author`, `media:credit role="author"`, JSON-LD `author`, `article:author`/`author` meta tags. Desks, "Staff",
   bare emails and the outlet's own name are dropped. When the source names nobody, `authors` is `[]`. Nothing is invented.
2. **Publisher** is the outlet that published the story: the feed's own outlet name, else the page's `og:site_name`,
   else a known name for the story address's domain, else the domain made readable. A rewrite or summary by NouGen
   still credits the original publisher; NouGen is never the publisher of someone else's story.
3. **Via** is an aggregator that only led us to the story (Hacker News, GDELT, a news API). It is shown as "via", never
   as the publisher.
4. **Pictures** keep where the source published them (`origin_url`) even when we load a mirror (`url`), and carry the
   feed's or page's own credit (`media:credit`, `media:copyright`, JSON-LD `creditText`). With no stated credit, a
   source picture is credited to the publisher. A picture we generated is `kind: "generated"` and is never credited
   to the outlet.
5. **Dates**: `published_at` is the source's time. `fetched_at` is when we read it. Fetch time is never shown as the
   publish time.

## Fields

| Field | Since | Meaning |
|---|---|---|
| `article_id` | v1 | Stable id |
| `title`, `description`, `content`, `link` | v1 | As before |
| `pubDate` | v1 | Same value as `published_at` |
| `source_id` | v1 | Publisher id or domain (legacy `"nougen"` rows are re-read from `link`) |
| `source_name` | v1 | Same value as `publisher.name` |
| `source_url`, `source_icon` | v1 | Publisher home and logo |
| `creator` | v1 | Same names as `authors[].name` |
| `image_url` | v1 | Same as `images[0].url` |
| `category` | v1 | Readable words (`"/us/crime/police"` becomes `"Police"`) |
| `schema_version` | v2 | `2` |
| `canonical_url` | v2 | The story's own address |
| `publisher` | v2 | `{name, domain, url, id?, logo?}` |
| `authors` | v2 | `[{name, url?, role?}]` |
| `via` | v2 | `{name, url?}` or `null` |
| `credit_line` | v2 | Ready to print: `"By Jane Doe and Sam Roe, The Verge"`, or just `"The Verge"` |
| `images` | v2 | `[{url, origin_url, kind, width?, height?, credit?, caption?, alt?, generator?}]`, `kind` is `source`, `mirror` or `generated` |
| `image_credit`, `image_origin_url` | v2 | Flat copies of the lead picture's credit and origin, for stores that index flat fields |
| `published_at`, `fetched_at`, `updated_at` | v2 | ISO 8601 UTC |
| `rights` | v2 | `{attribution_required: true, license?}` |

Unknown extra fields are allowed and passed through by readers.

## Reading a v1 item

`toNewsItem(v1)` returns the v2 shape. Legacy rows credited to "NouGen News" get their publisher from `link`, and
their authors become `[]` until the story is re-read from its source.
